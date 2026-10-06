import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { CATALOGUE, type Kind } from "./catalogue";

// One SQLite file on the Fly volume is the app's whole persistent state: it
// survives restarts and redeploys because /data does (fly.toml). Locally it
// defaults to an untracked file in .data/.
const path = process.env.DATABASE_PATH ?? (process.env.NODE_ENV === "production" ? "/data/spots.db" : "./.data/spots.db");
mkdirSync(dirname(path), { recursive: true });
const db = new Database(path);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// The smallest schema that carries the core interaction: a group, the people
// in it, the spots on its list, and who's keen on each. Additive only; a
// column or table added later goes in as its own CREATE/ALTER guarded here.
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

export interface Group {
  id: string;
  name: string;
}
export interface Member {
  id: number;
  name: string;
}
export interface Pick {
  id: number;
  catalogueKey: string | null;
  name: string;
  kind: Kind;
  area: string;
  note: string;
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

/** The group's list, most keen first, then oldest first. */
export function listPicks(groupId: string): Pick[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.catalogue_key AS catalogueKey, p.name, p.kind, p.area, p.note, m.name AS addedBy,
              (SELECT json_group_array(vm.name) FROM votes v JOIN members vm ON vm.id = v.member_id WHERE v.pick_id = p.id) AS keenJson
         FROM picks p JOIN members m ON m.id = p.added_by
        WHERE p.group_id = ?
        ORDER BY p.created_at, p.id`,
    )
    .all(groupId) as (Omit<Pick, "keen"> & { keenJson: string })[];
  return rows
    .map(({ keenJson, ...pick }) => ({ ...pick, keen: (JSON.parse(keenJson) as string[]).filter(Boolean) }))
    .sort((a, b) => b.keen.length - a.keen.length);
}

export function addCataloguePick(groupId: string, key: string, memberId: number): boolean {
  const spot = CATALOGUE.find((s) => s.key === key);
  if (!spot) return false;
  db.prepare(
    "INSERT OR IGNORE INTO picks (group_id, catalogue_key, name, kind, area, added_by) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(groupId, key, spot.name, spot.kind, spot.area, memberId);
  return true;
}

export function addCustomPick(groupId: string, memberId: number, name: string, kind: Kind, area: string, note: string): void {
  db.prepare("INSERT INTO picks (group_id, name, kind, area, note, added_by) VALUES (?, ?, ?, ?, ?, ?)").run(
    groupId,
    name,
    kind,
    area,
    note,
    memberId,
  );
}

/** Toggles a member's "keen" on a pick; returns the pick's group, or null. */
export function toggleKeen(pickId: number, member: Member, groupId: string): boolean {
  const pick = db.prepare("SELECT id FROM picks WHERE id = ? AND group_id = ?").get(pickId, groupId);
  if (!pick) return false;
  const removed = db.prepare("DELETE FROM votes WHERE pick_id = ? AND member_id = ?").run(pickId, member.id);
  if (removed.changes === 0) db.prepare("INSERT INTO votes (pick_id, member_id) VALUES (?, ?)").run(pickId, member.id);
  return true;
}
