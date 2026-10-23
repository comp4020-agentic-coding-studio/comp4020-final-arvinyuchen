import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { CATALOGUE, KIND_LABEL, type Kind, type Photo } from "./catalogue";
import { today } from "./when";

// One SQLite file on the Fly volume is the app's whole persistent state: it
// survives restarts and redeploys because /data does (fly.toml). Locally it
// defaults to an untracked file in .data/.
const path =
  process.env.DATABASE_PATH ?? (process.env.NODE_ENV === "production" ? "/data/spots.db" : "./.data/spots.db");
mkdirSync(dirname(path), { recursive: true });
// (uploaded photos live beside it, on the same volume)
export const dataDir = dirname(path);
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
// A place found in Overture Maps' places (src/lib/places-index.ts) keeps
// its id there, as one from OpenStreetMap keeps its osm_id.
const placeColumns = db.prepare("PRAGMA table_info(places)").all() as { name: string }[];
if (!placeColumns.some((c) => c.name === "overture_id")) db.exec("ALTER TABLE places ADD COLUMN overture_id TEXT");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS places_overture ON places (overture_id)");

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

// Everyone is an account: a name and the passkeys that sign in as it, with
// one member per group it's in. No passwords, no email: a passkey is the
// only way in. Sessions keep a hash of their token, so the database alone
// can't be used to sign in.
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
// The owner's one line to the people they invite, shown above the join form.
addColumn("groups", "note", "TEXT");
addColumn("groups", "archived_at", "TEXT");
addColumn("places", "hidden_at", "TEXT");
// Which passkey is which, on the account page: the password manager's
// AAGUID, and the device and browser it was made on.
addColumn("passkeys", "aaguid", "TEXT");
addColumn("passkeys", "made_on", "TEXT");
// Groups from before owners and invite links: whoever started the group
// (its first member) owns it, and its link is the one already shared.
db.exec(`
  UPDATE groups SET owner_member_id = (SELECT MIN(id) FROM members WHERE group_id = groups.id)
   WHERE owner_member_id IS NULL;
  INSERT INTO group_links (slug, group_id)
    SELECT id, id FROM groups g
     WHERE NOT EXISTS (SELECT 1 FROM group_links l WHERE l.group_id = g.id AND l.retired_at IS NULL);
`);

// Plans: the owner picks a place on the list and a day; everyone marks when
// they're busy that day; the owner sets the time (src/lib/plans.ts). A day
// is a local date and times are minutes since its local midnight, in
// 5-minute steps (src/lib/when.ts), never instants. An answer with no busy
// times is "free all day"; no answer is "hasn't said". A plan whose day
// changed is called off and points at the one that replaced it, so nobody's
// answers are lost. Times kept to the millisecond, so a change just after
// the time was set still counts as after it.
db.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id TEXT NOT NULL REFERENCES groups(id),
    place_id INTEGER NOT NULL REFERENCES places(id),
    created_by INTEGER NOT NULL REFERENCES members(id),
    day TEXT NOT NULL,
    range_start INTEGER NOT NULL,
    range_end INTEGER NOT NULL,
    set_start INTEGER,
    set_end INTEGER,
    set_at TEXT,
    reviewed_at TEXT,
    called_off_at TEXT,
    replaced_by INTEGER REFERENCES plans(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (range_start % 5 = 0 AND range_end % 5 = 0 AND range_start >= 360 AND range_start < range_end AND range_end <= 1440),
    CHECK (set_start IS NULL OR (set_start % 5 = 0 AND set_end % 5 = 0 AND set_start >= range_start AND set_start < set_end AND set_end <= range_end))
  );
  CREATE INDEX IF NOT EXISTS plans_group ON plans (group_id, day);
  CREATE TABLE IF NOT EXISTS plan_answers (
    plan_id INTEGER NOT NULL REFERENCES plans(id),
    member_id INTEGER NOT NULL REFERENCES members(id),
    answered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (plan_id, member_id)
  );
  CREATE TABLE IF NOT EXISTS plan_busy (
    plan_id INTEGER NOT NULL REFERENCES plans(id),
    member_id INTEGER NOT NULL REFERENCES members(id),
    start_min INTEGER NOT NULL,
    end_min INTEGER NOT NULL,
    CHECK (start_min % 5 = 0 AND end_min % 5 = 0 AND 0 <= start_min AND start_min < end_min AND end_min <= 1440)
  );
  CREATE INDEX IF NOT EXISTS plan_busy_answer ON plan_busy (plan_id, member_id);
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
for (const spot of CATALOGUE) seed.run({ ...spot, src: null, page: null, credit: null, license: null, ...spot.photo });

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

// Every starter place is one on the list in catalogue.ts. One taken off
// the list (a street, say, which isn't a place to go) is deleted with all
// that points at it: its keens, its place on every group's list, and its
// search vector.
db.transaction(() => {
  const starters = CATALOGUE.map((s) => `'${s.key.replace(/'/g, "''")}'`).join(", ");
  const bare = `SELECT id FROM places WHERE seed_key IS NOT NULL AND seed_key NOT IN (${starters})`;
  db.prepare(`DELETE FROM votes WHERE pick_id IN (SELECT id FROM picks WHERE place_id IN (${bare}))`).run();
  db.prepare(`DELETE FROM picks WHERE place_id IN (${bare})`).run();
  db.prepare(`DELETE FROM place_vectors WHERE place_id IN (${bare})`).run();
  // (and any plan to go there, with its answers)
  const gone = `SELECT id FROM plans WHERE place_id IN (${bare})`;
  db.prepare(`UPDATE plans SET replaced_by = NULL WHERE replaced_by IN (${gone})`).run();
  db.prepare(`DELETE FROM plan_busy WHERE plan_id IN (${gone})`).run();
  db.prepare(`DELETE FROM plan_answers WHERE plan_id IN (${gone})`).run();
  db.prepare(`DELETE FROM plans WHERE place_id IN (${bare})`).run();
  db.prepare(`DELETE FROM places WHERE id IN (${bare})`).run();
})();

export interface Group {
  id: string;
  name: string;
  /** The current invite link, the part after /g/. */
  link: string;
  ownerId: number | null;
  /** The owner's note to the people they invite, or null. */
  note: string | null;
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
  /** its photo, if it has one (a card without shows its kind's picture) */
  photo: Photo | null;
  addedBy: string;
  /** How many groups have it on their list. */
  groups: number;
}
export interface Pick {
  id: number;
  place: Place;
  addedBy: string;
  /** the member who put it on the list */
  addedById: number;
  keen: string[];
  /** how many besides the one who added it are keen */
  othersKeen: number;
}

const token = (bytes: number) => randomBytes(bytes).toString("base64url");

const GROUP_COLUMNS = `g.id, g.name, g.owner_member_id AS ownerId, g.note,
  (SELECT slug FROM group_links l WHERE l.group_id = g.id AND l.retired_at IS NULL) AS link`;

/** A new group, with the account that started it as its first member and owner. */
export function createGroup(groupName: string, account: { id: number; name: string }): { group: Group; member: Member } {
  const id = token(6);
  return db.transaction(() => {
    db.prepare("INSERT INTO groups (id, name) VALUES (?, ?)").run(id, groupName);
    db.prepare("INSERT INTO group_links (slug, group_id) VALUES (?, ?)").run(id, id);
    const member = joinGroup(id, account);
    db.prepare("UPDATE groups SET owner_member_id = ? WHERE id = ?").run(member.id, id);
    return { group: getGroup(id)!, member };
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

/**
 * An account joins a group, under its name. (Members from before accounts
 * were required carry a cookie secret; new ones get a random one nobody
 * holds, as the column wants a value and schema changes stay additive.)
 */
export function joinGroup(groupId: string, account: { id: number; name: string }): Member {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO members (group_id, name, secret, account_id) VALUES (?, ?, ?, ?)")
    .run(groupId, account.name, token(18), account.id);
  return { id: Number(lastInsertRowid), name: account.name, accountId: account.id };
}

const MEMBER_COLUMNS = "id, name, account_id AS accountId";

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

/** One line, so it reads as a message from a friend, not a description. */
export const NOTE_MAX = 140;

/** Sets the owner's note to invitees; an empty one takes it down. */
export function setNote(groupId: string, note: string): void {
  db.prepare("UPDATE groups SET note = ? WHERE id = ?").run(note || null, groupId);
}

/** Takes someone out of the group: they can't act any more, and their keens go.
 *  (Their answers to plans stay, but count for nothing: plans count members.) */
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
 * places they added move over, and the duplicate's account leaves the group.
 * It's also the way back for someone who lost every passkey: they make a new
 * account, join again by the link, and the owner merges their old member
 * into the new one. There's no other recovery.
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
    // Their answers to plans move over where the one they really are hasn't answered.
    const unanswered = "plan_id NOT IN (SELECT plan_id FROM plan_answers WHERE member_id = ?)";
    db.prepare(`UPDATE plan_busy SET member_id = ? WHERE member_id = ? AND ${unanswered}`).run(intoId, fromId, intoId);
    db.prepare(`UPDATE plan_answers SET member_id = ? WHERE member_id = ? AND ${unanswered}`).run(intoId, fromId, intoId);
    db.prepare("UPDATE plans SET created_by = ? WHERE created_by = ?").run(intoId, fromId);
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
  photo: photo_src ? { src: photo_src, page: photo_page ?? photo_src, credit: photo_credit ?? "", license: photo_license ?? "" } : null,
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
      `SELECT k.id AS pickId, m.name AS pickedBy, k.added_by AS addedById, ${PLACE_COLUMNS},
              (SELECT json_group_array(vm.name) FROM votes v JOIN members vm ON vm.id = v.member_id WHERE v.pick_id = k.id) AS keenJson,
              (SELECT count(*) FROM votes v WHERE v.pick_id = k.id AND v.member_id != k.added_by) AS othersKeen
         FROM picks k JOIN places p ON p.id = k.place_id JOIN members m ON m.id = k.added_by
        WHERE k.group_id = ?
        ORDER BY k.created_at, k.id`,
    )
    .all(groupId) as (PlaceRow & { pickId: number; pickedBy: string; addedById: number; keenJson: string; othersKeen: number })[];
  return rows
    .map(({ pickId, pickedBy, addedById, keenJson, othersKeen, ...place }) => ({
      id: pickId,
      place: toPlace(place),
      addedBy: pickedBy,
      addedById,
      keen: (JSON.parse(keenJson) as string[]).filter(Boolean),
      othersKeen,
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

/** Whether this member may take a place off the list: the owner always,
 *  the one who added it until someone else is keen on it. */
export const canRemovePick = (group: Group, pick: { addedById: number; othersKeen: number }, member: Member): boolean =>
  member.id === group.ownerId || (member.id === pick.addedById && pick.othersKeen === 0);

/**
 * Takes a place off a group's list, if this member may. It's deleted with
 * its keens, so putting it back starts from none. The place stays in
 * Explore. Returns the place's id, or undefined if nothing was removed.
 */
export function removePick(group: Group, pickId: number, member: Member): number | undefined {
  return db.transaction(() => {
    const pick = db
      .prepare(
        `SELECT k.place_id AS placeId, k.added_by AS addedById,
                (SELECT count(*) FROM votes v WHERE v.pick_id = k.id AND v.member_id != k.added_by) AS othersKeen
           FROM picks k WHERE k.id = ? AND k.group_id = ?`,
      )
      .get(pickId, group.id) as { placeId: number; addedById: number; othersKeen: number } | undefined;
    if (!pick || !canRemovePick(group, pick, member)) return undefined;
    db.prepare("DELETE FROM votes WHERE pick_id = ?").run(pickId);
    db.prepare("DELETE FROM picks WHERE id = ?").run(pickId);
    // A plan to go there is called off, and kept.
    db.prepare(
      `UPDATE plans SET called_off_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE group_id = ? AND place_id = ? AND called_off_at IS NULL AND day >= ?`,
    ).run(group.id, pick.placeId, today());
    return pick.placeId;
  })();
}

export const placeIdForSeed = (key: string): number | undefined =>
  (db.prepare("SELECT id FROM places WHERE seed_key = ?").get(key) as { id: number } | undefined)?.id;

export interface NewPlace {
  /** where it was found: "node/1", "way/2", "relation/3" or "overture/<id>" */
  ref: string | null;
  name: string;
  kind: Kind;
  area: string;
  why: string;
  lat: number | null;
  lon: number | null;
  source: string;
  photo: Photo | null;
}

// (a find's ref as the column it's kept in, and its id there)
const refColumn = (ref: string) =>
  ref.startsWith("overture/") ? { column: "overture_id", id: ref.slice("overture/".length) } : { column: "osm_id", id: ref };

/** The place already shared from this find, if there is one. */
export function placeIdForRef(ref: string): number | undefined {
  const { column, id } = refColumn(ref);
  return (db.prepare(`SELECT id FROM places WHERE ${column} = ?`).get(id) as { id: number } | undefined)?.id;
}

/** The photo of the place already shared from this find. */
export function photoOfRef(ref: string): Photo | null {
  const { column, id } = refColumn(ref);
  const row = db.prepare(`SELECT photo_src, photo_page, photo_credit, photo_license FROM places WHERE ${column} = ?`).get(id) as
    | { photo_src: string | null; photo_page: string | null; photo_credit: string | null; photo_license: string | null }
    | undefined;
  return row?.photo_src && row.photo_page
    ? { src: row.photo_src, page: row.photo_page, credit: row.photo_credit ?? "", license: row.photo_license ?? "" }
    : null;
}

/** Adds a place everyone can see, or, if the place it was found as is
 *  already shared, returns the one that's there. */
export function addPlace(place: NewPlace, addedBy: Member): number {
  if (!(place.kind in KIND_LABEL)) throw new Error("bad kind");
  const existing = place.ref ? placeIdForRef(place.ref) : undefined;
  if (existing) return existing;
  const { src = null, page = null, credit = null, license = null } = place.photo ?? {};
  const where = place.ref ? refColumn(place.ref) : null;
  return Number(
    db
      .prepare(
        `INSERT INTO places (osm_id, overture_id, name, kind, area, why, lat, lon, source, photo_src, photo_page, photo_credit, photo_license, added_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(where?.column === "osm_id" ? where.id : null, where?.column === "overture_id" ? where.id : null, place.name, place.kind, place.area, place.why, place.lat, place.lon, place.source, src, page, credit, license, addedBy.name)
      .lastInsertRowid,
  );
}

/**
 * Sets a member's "keen" on one of their group's picks to what their button
 * showed, so a double-tap or a second device can't undo it. With no `on`
 * (an old page), it toggles. Returns whether anything changed.
 */
export function setKeen(pickId: number, member: Member, groupId: string, on?: boolean): boolean {
  const pick = db.prepare("SELECT id FROM picks WHERE id = ? AND group_id = ?").get(pickId, groupId);
  if (!pick) return false;
  const has = db.prepare("SELECT 1 FROM votes WHERE pick_id = ? AND member_id = ?").get(pickId, member.id) !== undefined;
  const want = on ?? !has;
  if (want === has) return false;
  if (want) db.prepare("INSERT INTO votes (pick_id, member_id) VALUES (?, ?)").run(pickId, member.id);
  else db.prepare("DELETE FROM votes WHERE pick_id = ? AND member_id = ?").run(pickId, member.id);
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
