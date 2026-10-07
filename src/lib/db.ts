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
export const db = new Database(path);
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

// Each place's card as a vector, for search by meaning (src/lib/search.ts).
// It keeps the exact text and model it was made from, so a changed card or
// a new model gets a fresh vector instead of a stale one.
db.exec(`
  CREATE TABLE IF NOT EXISTS place_vectors (
    place_id INTEGER PRIMARY KEY REFERENCES places(id),
    model TEXT NOT NULL,
    text TEXT NOT NULL,
    vec BLOB NOT NULL
  );
`);

// Accounts are optional: joining is still a link and a name. Someone who
// wants to be themselves on every device saves a passkey, which makes an
// account and ties their members (one per group) to it. No passwords, no
// email: a passkey is the only way in. Sessions keep a hash of their token,
// so the database alone can't be used to sign in.
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    handle TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS passkeys (
    id TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    public_key BLOB NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    transports TEXT NOT NULL DEFAULT '[]',
    synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS group_links (
    slug TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    retired_at TEXT
  );
`);
const addColumn = (table: string, column: string, type: string) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
};
addColumn("groups", "owner_member_id", "INTEGER REFERENCES members(id)");
addColumn("members", "account_id", "INTEGER REFERENCES accounts(id)");
// A removed or merged member stays, so what they added keeps its name; they
// just can't act any more, and a merged one's browser becomes the member
// they were merged into.
addColumn("members", "removed_at", "TEXT");
addColumn("members", "merged_into", "INTEGER REFERENCES members(id)");
// Site admin (src/pages/admin.astro): an archived group is closed to
// everyone but can be restored; a hidden place leaves Explore and the map.
addColumn("accounts", "is_admin", "INTEGER NOT NULL DEFAULT 0");
addColumn("groups", "archived_at", "TEXT");
addColumn("places", "hidden_at", "TEXT");
// Groups from before owners and invite links: whoever started the group
// (its first member) owns it, and its link is the one already shared.
db.exec(`
  UPDATE groups SET owner_member_id = (SELECT MIN(id) FROM members WHERE group_id = groups.id)
   WHERE owner_member_id IS NULL;
  INSERT INTO group_links (slug, group_id)
    SELECT id, id FROM groups g
     WHERE NOT EXISTS (SELECT 1 FROM group_links l WHERE l.group_id = g.id AND l.retired_at IS NULL);
`);

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
  /** The current invite link, the part after /g/. */
  link: string;
  ownerId: number | null;
}
export interface Member {
  id: number;
  name: string;
  accountId: number | null;
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

const GROUP_COLUMNS = `g.id, g.name, g.owner_member_id AS ownerId,
  (SELECT slug FROM group_links l WHERE l.group_id = g.id AND l.retired_at IS NULL) AS link`;

export function createGroup(
  groupName: string,
  memberName: string,
  accountId: number | null = null,
): { group: Group; member: Member; secret: string } {
  const id = token(6);
  return db.transaction(() => {
    db.prepare("INSERT INTO groups (id, name) VALUES (?, ?)").run(id, groupName);
    db.prepare("INSERT INTO group_links (slug, group_id) VALUES (?, ?)").run(id, id);
    const { member, secret } = joinGroup(id, memberName, accountId);
    db.prepare("UPDATE groups SET owner_member_id = ? WHERE id = ?").run(member.id, id);
    return { group: getGroup(id)!, member, secret };
  })();
}

/** A group by its own id (what forms and cookies use). */
export function getGroup(id: string): Group | undefined {
  return db.prepare(`SELECT ${GROUP_COLUMNS} FROM groups g WHERE g.id = ? AND g.archived_at IS NULL`).get(id) as
    | Group
    | undefined;
}

/** A group by an invite link, current or reset; "closed" if an admin archived it. */
export function groupByLink(slug: string): { group: Group; current: boolean } | "closed" | undefined {
  const row = db
    .prepare(
      `SELECT l.group_id, l.retired_at, g.archived_at FROM group_links l JOIN groups g ON g.id = l.group_id WHERE l.slug = ?`,
    )
    .get(slug) as { group_id: string; retired_at: string | null; archived_at: string | null } | undefined;
  if (row?.archived_at) return "closed";
  const group = row && getGroup(row.group_id);
  return group ? { group, current: row.retired_at === null } : undefined;
}

export function joinGroup(
  groupId: string,
  name: string,
  accountId: number | null = null,
): { member: Member; secret: string } {
  const secret = token(18);
  const { lastInsertRowid } = db
    .prepare("INSERT INTO members (group_id, name, secret, account_id) VALUES (?, ?, ?, ?)")
    .run(groupId, name, secret, accountId);
  return { member: { id: Number(lastInsertRowid), name, accountId }, secret };
}

const MEMBER_COLUMNS = "id, name, account_id AS accountId";

/**
 * The member a browser's cookie value ("<id>.<secret>") proves it is. A
 * member merged into another is now that one; a removed member is no one.
 */
export function memberFor(groupId: string, cookie: string | undefined): Member | undefined {
  const [id, secret] = (cookie ?? "").split(".");
  if (!id || !secret) return undefined;
  const row = db
    .prepare("SELECT id, merged_into, removed_at FROM members WHERE id = ? AND group_id = ? AND secret = ?")
    .get(Number(id), groupId, secret) as { id: number; merged_into: number | null; removed_at: string | null } | undefined;
  if (!row) return undefined;
  let memberId: number | null = row.removed_at ? row.merged_into : row.id;
  // Merges can chain (A into B, then B into C); follow them to the end.
  for (let hops = 0; memberId !== null && hops < 10; hops++) {
    const next = db.prepare("SELECT merged_into, removed_at FROM members WHERE id = ?").get(memberId) as
      | { merged_into: number | null; removed_at: string | null }
      | undefined;
    if (!next?.removed_at) break;
    memberId = next.merged_into;
  }
  if (memberId === null) return undefined;
  return db.prepare(`SELECT ${MEMBER_COLUMNS} FROM members WHERE id = ? AND removed_at IS NULL`).get(memberId) as
    | Member
    | undefined;
}

export function listMembers(groupId: string): Member[] {
  return db
    .prepare(`SELECT ${MEMBER_COLUMNS} FROM members WHERE group_id = ? AND removed_at IS NULL ORDER BY id`)
    .all(groupId) as Member[];
}

/** The account's member in a group, if it has one there. */
export function memberOfAccount(groupId: string, accountId: number): Member | undefined {
  return db
    .prepare(`SELECT ${MEMBER_COLUMNS} FROM members WHERE group_id = ? AND account_id = ? AND removed_at IS NULL ORDER BY id LIMIT 1`)
    .get(groupId, accountId) as Member | undefined;
}

/** Ties a member to an account, unless that account is already someone in the group. */
export function linkMember(member: Member, groupId: string, accountId: number): boolean {
  if (member.accountId !== null || memberOfAccount(groupId, accountId)) return false;
  db.prepare("UPDATE members SET account_id = ? WHERE id = ?").run(accountId, member.id);
  return true;
}

export interface AccountGroup {
  id: string;
  name: string;
  link: string;
  as: string;
  owner: boolean;
  people: number;
}

/** Every group an account is someone in, most recently joined first. */
export function groupsOfAccount(accountId: number): AccountGroup[] {
  return db
    .prepare(
      `SELECT g.id, g.name, m.name AS "as", (g.owner_member_id = m.id) AS owner,
              (SELECT slug FROM group_links l WHERE l.group_id = g.id AND l.retired_at IS NULL) AS link,
              (SELECT COUNT(*) FROM members x WHERE x.group_id = g.id AND x.removed_at IS NULL) AS people
         FROM members m JOIN groups g ON g.id = m.group_id
        WHERE m.account_id = ? AND m.removed_at IS NULL AND g.archived_at IS NULL
        ORDER BY m.id DESC`,
    )
    .all(accountId)
    .map((row) => ({ ...(row as AccountGroup), owner: Boolean((row as { owner: number }).owner) }));
}

// ---- owner tools ---------------------------------------------------------------
// Only a group's owner may call these (the route checks); each keeps what
// the group made, and says whether it did anything.

export function renameGroup(groupId: string, name: string): void {
  db.prepare("UPDATE groups SET name = ? WHERE id = ?").run(name, groupId);
}

/** Takes someone out of the group: they can't act any more, and their keens go. */
export function removeMember(group: Group, memberId: number): boolean {
  if (memberId === group.ownerId) return false;
  return db.transaction(() => {
    const { changes } = db
      .prepare("UPDATE members SET removed_at = datetime('now') WHERE id = ? AND group_id = ? AND removed_at IS NULL")
      .run(memberId, group.id);
    if (changes) db.prepare("DELETE FROM votes WHERE member_id = ?").run(memberId);
    return changes > 0;
  })();
}

/**
 * Folds a duplicate into the member they really are: their keens and the
 * places they added move over, and their browser becomes that member.
 */
export function mergeMembers(group: Group, fromId: number, intoId: number): boolean {
  if (fromId === intoId) return false;
  const live = db.prepare("SELECT id, account_id FROM members WHERE id = ? AND group_id = ? AND removed_at IS NULL");
  const from = live.get(fromId, group.id) as { id: number; account_id: number | null } | undefined;
  const into = live.get(intoId, group.id) as { id: number; account_id: number | null } | undefined;
  if (!from || !into) return false;
  db.transaction(() => {
    db.prepare("INSERT OR IGNORE INTO votes (pick_id, member_id) SELECT pick_id, ? FROM votes WHERE member_id = ?").run(
      intoId,
      fromId,
    );
    db.prepare("DELETE FROM votes WHERE member_id = ?").run(fromId);
    db.prepare("UPDATE picks SET added_by = ? WHERE added_by = ?").run(intoId, fromId);
    if (into.account_id === null && from.account_id !== null) {
      db.prepare("UPDATE members SET account_id = ? WHERE id = ?").run(from.account_id, intoId);
    }
    db.prepare("UPDATE members SET removed_at = datetime('now'), merged_into = ?, account_id = NULL WHERE id = ?").run(
      intoId,
      fromId,
    );
    if (group.ownerId === fromId) db.prepare("UPDATE groups SET owner_member_id = ? WHERE id = ?").run(intoId, group.id);
  })();
  return true;
}

/** A new invite link; the old one stops letting anyone new in. */
export function resetLink(groupId: string): string {
  const slug = token(6);
  db.transaction(() => {
    db.prepare("UPDATE group_links SET retired_at = datetime('now') WHERE group_id = ? AND retired_at IS NULL").run(groupId);
    db.prepare("INSERT INTO group_links (slug, group_id) VALUES (?, ?)").run(slug, groupId);
  })();
  return slug;
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
  (SELECT COUNT(DISTINCT k.group_id) FROM picks k JOIN groups kg ON kg.id = k.group_id
    WHERE k.place_id = p.id AND kg.archived_at IS NULL) AS groups`;

/** Every shared place not hidden by an admin: the most-picked first, then the newest. */
export function listPlaces(): Place[] {
  return (
    db.prepare(`SELECT ${PLACE_COLUMNS} FROM places p WHERE p.hidden_at IS NULL ORDER BY groups DESC, p.created_at DESC, p.id DESC`).all() as PlaceRow[]
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
  const place = db.prepare("SELECT id, name, kind, area FROM places WHERE id = ? AND hidden_at IS NULL").get(placeId) as
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

export interface PlaceVector {
  text: string;
  vec: Float32Array;
}

/** Every stored card vector made by `model`, by place id. */
export function listVectors(model: string): Map<number, PlaceVector> {
  const rows = db.prepare("SELECT place_id, text, vec FROM place_vectors WHERE model = ?").all(model) as {
    place_id: number;
    text: string;
    vec: Buffer;
  }[];
  // Copied into a fresh buffer: a Float32Array needs 4-byte alignment.
  return new Map(rows.map((r) => [r.place_id, { text: r.text, vec: new Float32Array(new Uint8Array(r.vec).buffer) }]));
}

export function saveVector(placeId: number, model: string, text: string, vec: Float32Array): void {
  db.prepare(
    `INSERT INTO place_vectors (place_id, model, text, vec) VALUES (?, ?, ?, ?)
     ON CONFLICT(place_id) DO UPDATE SET model = excluded.model, text = excluded.text, vec = excluded.vec`,
  ).run(placeId, model, text, Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength));
}
