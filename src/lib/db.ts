import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { CATALOGUE, KIND_LABEL, type Kind, type Photo } from "./catalogue";

// One SQLite file on the Fly volume is the app's whole persistent state: it
// survives restarts and redeploys because /data does (fly.toml). Locally it
// defaults to an untracked file in .data/.
const path =
  process.env.DATABASE_PATH ?? (process.env.NODE_ENV === "production" ? "/data/spots.db" : "./.data/spots.db");
mkdirSync(dirname(path), { recursive: true });
const db = new Database(path);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Places are shared by every group: one place, however many groups have it
// on their list. A group's members, its list and its votes stay its own.
// Additive only: new tables and columns go in guarded, never a drop.
db.exec(`
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id TEXT NOT NULL REFERENCES groups(id),
    name TEXT NOT NULL,
    secret TEXT NOT NULL,
    joined_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seed_key TEXT UNIQUE,
    osm_id TEXT UNIQUE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    area TEXT NOT NULL DEFAULT '',
    why TEXT NOT NULL DEFAULT '',
    lat REAL,
    lon REAL,
    source TEXT NOT NULL DEFAULT '',
    photo_src TEXT,
    photo_page TEXT,
    photo_credit TEXT,
    photo_license TEXT,
    added_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS picks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id TEXT NOT NULL REFERENCES groups(id),
    catalogue_key TEXT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    area TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    added_by INTEGER NOT NULL REFERENCES members(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (group_id, catalogue_key)
  );
  CREATE TABLE IF NOT EXISTS votes (
    pick_id INTEGER NOT NULL REFERENCES picks(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES members(id),
    PRIMARY KEY (pick_id, member_id)
  );
`);
const pickColumns = db.prepare("PRAGMA table_info(picks)").all() as { name: string }[];
if (!pickColumns.some((c) => c.name === "place_id")) {
  db.exec("ALTER TABLE picks ADD COLUMN place_id INTEGER REFERENCES places(id)");
}
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS picks_group_place ON picks (group_id, place_id)");

// The checked starter places, upserted by key so a corrected coordinate,
// blurb or photo reaches the live database on the next deploy.
const seed = db.prepare(`
  INSERT INTO places (seed_key, name, kind, area, why, lat, lon, source, photo_src, photo_page, photo_credit, photo_license, added_by)
  VALUES (@key, @name, @kind, @area, @blurb, @lat, @lon, @source, @src, @page, @credit, @license, 'Spots')
  ON CONFLICT(seed_key) DO UPDATE SET name = excluded.name, kind = excluded.kind, area = excluded.area,
    why = excluded.why, lat = excluded.lat, lon = excluded.lon, source = excluded.source,
    photo_src = excluded.photo_src, photo_page = excluded.photo_page,
    photo_credit = excluded.photo_credit, photo_license = excluded.photo_license
`);
for (const spot of CATALOGUE) seed.run({ ...spot, ...spot.photo });

// Picks made before places were shared point at nothing: link each to its
// seed place, or turn a group's own find into a place of its own.
for (const pick of db.prepare("SELECT * FROM picks WHERE place_id IS NULL").all() as {
  id: number;
  catalogue_key: string | null;
  name: string;
  kind: string;
  area: string;
  note: string;
  added_by: number;
}[]) {
  const seeded = pick.catalogue_key
    ? (db.prepare("SELECT id FROM places WHERE seed_key = ?").get(pick.catalogue_key) as { id: number } | undefined)
    : undefined;
  const placeId =
    seeded?.id ??
    Number(
      db
        .prepare("INSERT INTO places (name, kind, area, why, added_by) VALUES (?, ?, ?, ?, (SELECT name FROM members WHERE id = ?))")
        .run(pick.name, pick.kind, pick.area, pick.note, pick.added_by).lastInsertRowid,
    );
  db.prepare("UPDATE picks SET place_id = ? WHERE id = ?").run(placeId, pick.id);
}

export interface Group {
  id: string;
  name: string;
}
export interface Member {
  id: number;
  name: string;
}
export interface Place {
  id: number;
  name: string;
  kind: Kind;
  area: string;
  why: string;
  lat: number | null;
  lon: number | null;
  source: string;
  photo: Photo | null;
  addedBy: string;
  /** How many groups have it on their list. */
  groups: number;
}
export interface Pick {
  id: number;
  place: Place;
  addedBy: string;
  keen: string[];
}

const token = (bytes: number) => randomBytes(bytes).toString("base64url");

export function createGroup(groupName: string, memberName: string): { group: Group; member: Member; secret: string } {
  const id = token(6);
  db.prepare("INSERT INTO groups (id, name) VALUES (?, ?)").run(id, groupName);
  const { member, secret } = joinGroup(id, memberName);
  return { group: { id, name: groupName }, member, secret };
}

export function getGroup(id: string): Group | undefined {
  return db.prepare("SELECT id, name FROM groups WHERE id = ?").get(id) as Group | undefined;
}

export function joinGroup(groupId: string, name: string): { member: Member; secret: string } {
  const secret = token(18);
  const { lastInsertRowid } = db
    .prepare("INSERT INTO members (group_id, name, secret) VALUES (?, ?, ?)")
    .run(groupId, name, secret);
  return { member: { id: Number(lastInsertRowid), name }, secret };
}

/** The member a browser's cookie value ("<id>.<secret>") proves it is. */
export function memberFor(groupId: string, cookie: string | undefined): Member | undefined {
  const [id, secret] = (cookie ?? "").split(".");
  if (!id || !secret) return undefined;
  return db
    .prepare("SELECT id, name FROM members WHERE id = ? AND group_id = ? AND secret = ?")
    .get(Number(id), groupId, secret) as Member | undefined;
}

export function listMembers(groupId: string): Member[] {
  return db.prepare("SELECT id, name FROM members WHERE group_id = ? ORDER BY id").all(groupId) as Member[];
}

type PlaceRow = Omit<Place, "photo" | "addedBy"> & {
  added_by: string;
  photo_src: string | null;
  photo_page: string | null;
  photo_credit: string | null;
  photo_license: string | null;
};
const toPlace = ({ added_by, photo_src, photo_page, photo_credit, photo_license, ...row }: PlaceRow): Place => ({
  ...row,
  addedBy: added_by,
  photo:
    photo_src && photo_page
      ? { src: photo_src, page: photo_page, credit: photo_credit ?? "", license: photo_license ?? "" }
      : null,
});
const PLACE_COLUMNS = `p.id, p.name, p.kind, p.area, p.why, p.lat, p.lon, p.source, p.photo_src, p.photo_page,
  p.photo_credit, p.photo_license, p.added_by,
  (SELECT COUNT(DISTINCT k.group_id) FROM picks k WHERE k.place_id = p.id) AS groups`;

/** Every shared place: the most-picked first, then the newest. */
export function listPlaces(): Place[] {
  return (
    db.prepare(`SELECT ${PLACE_COLUMNS} FROM places p ORDER BY groups DESC, p.created_at DESC, p.id DESC`).all() as PlaceRow[]
  ).map(toPlace);
}

/** The group's list, most keen first, then oldest first. */
export function listPicks(groupId: string): Pick[] {
  const rows = db
    .prepare(
      `SELECT k.id AS pickId, m.name AS pickedBy, ${PLACE_COLUMNS},
              (SELECT json_group_array(vm.name) FROM votes v JOIN members vm ON vm.id = v.member_id WHERE v.pick_id = k.id) AS keenJson
         FROM picks k JOIN places p ON p.id = k.place_id JOIN members m ON m.id = k.added_by
        WHERE k.group_id = ?
        ORDER BY k.created_at, k.id`,
    )
    .all(groupId) as (PlaceRow & { pickId: number; pickedBy: string; keenJson: string })[];
  return rows
    .map(({ pickId, pickedBy, keenJson, ...place }) => ({
      id: pickId,
      place: toPlace(place),
      addedBy: pickedBy,
      keen: (JSON.parse(keenJson) as string[]).filter(Boolean),
    }))
    .sort((a, b) => b.keen.length - a.keen.length);
}

/** Puts a shared place on a group's list (once). False if there's no such place. */
export function addPick(groupId: string, placeId: number, member: Member): boolean {
  const place = db.prepare("SELECT id, name, kind, area FROM places WHERE id = ?").get(placeId) as
    | { id: number; name: string; kind: string; area: string }
    | undefined;
  if (!place) return false;
  db.prepare(
    "INSERT OR IGNORE INTO picks (group_id, place_id, name, kind, area, added_by) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(groupId, place.id, place.name, place.kind, place.area, member.id);
  return true;
}

export const placeIdForSeed = (key: string): number | undefined =>
  (db.prepare("SELECT id FROM places WHERE seed_key = ?").get(key) as { id: number } | undefined)?.id;

export interface NewPlace {
  osmId: string | null;
  name: string;
  kind: Kind;
  area: string;
  why: string;
  lat: number | null;
  lon: number | null;
  source: string;
}

/** Adds a place everyone can see, or, if that OpenStreetMap place is already
 *  shared, returns the one that's there. */
export function addPlace(place: NewPlace, addedBy: Member): number {
  if (!(place.kind in KIND_LABEL)) throw new Error("bad kind");
  if (place.osmId) {
    const existing = db.prepare("SELECT id FROM places WHERE osm_id = ?").get(place.osmId) as { id: number } | undefined;
    if (existing) return existing.id;
  }
  return Number(
    db
      .prepare(
        "INSERT INTO places (osm_id, name, kind, area, why, lat, lon, source, added_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(place.osmId, place.name, place.kind, place.area, place.why, place.lat, place.lon, place.source, addedBy.name)
      .lastInsertRowid,
  );
}

/** Toggles a member's "keen" on one of their group's picks. */
export function toggleKeen(pickId: number, member: Member, groupId: string): boolean {
  const pick = db.prepare("SELECT id FROM picks WHERE id = ? AND group_id = ?").get(pickId, groupId);
  if (!pick) return false;
  const removed = db.prepare("DELETE FROM votes WHERE pick_id = ? AND member_id = ?").run(pickId, member.id);
  if (removed.changes === 0) db.prepare("INSERT INTO votes (pick_id, member_id) VALUES (?, ?)").run(pickId, member.id);
  return true;
}
