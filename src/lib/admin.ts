import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "./db";

// Site admin: looking after Spots as a whole, not one group. An admin is an
// account (so a passkey is the way in) that once proved it knew ADMIN_CODE,
// a Fly secret. Groups are archived first, closed to everyone but
// restorable; only an archived group can then be deleted for good. Places
// shared into Explore can be hidden; the checked starter places can't.

// ---- becoming admin ---------------------------------------------------------------

const tries = new Map<number, { count: number; since: number }>();
const HOUR = 60 * 60 * 1000;

/**
 * Makes the account an admin if `code` is ADMIN_CODE. Without ADMIN_CODE set,
 * nobody can claim. A few wrong guesses an hour per account, then no more.
 */
export function claimAdmin(accountId: number, code: string): "ok" | "wrong" | "closed" | "slow-down" {
  const secret = process.env.ADMIN_CODE;
  if (!secret) return "closed";
  const now = Date.now();
  const t = tries.get(accountId);
  const recent = t && now - t.since < HOUR ? t : { count: 0, since: now };
  if (recent.count >= 5) return "slow-down";
  const digest = (s: string) => createHash("sha256").update(s).digest();
  if (!timingSafeEqual(digest(code), digest(secret))) {
    tries.set(accountId, { count: recent.count + 1, since: recent.since });
    return "wrong";
  }
  tries.delete(accountId);
  db.prepare("UPDATE accounts SET is_admin = 1 WHERE id = ?").run(accountId);
  return "ok";
}

export const canClaimAdmin = () => Boolean(process.env.ADMIN_CODE);

// ---- groups -------------------------------------------------------------------------

export interface AdminGroup {
  id: string;
  name: string;
  link: string | null;
  owner: string | null;
  people: number;
  picks: number;
  createdAt: string;
  lastActive: string;
  archivedAt: string | null;
}

export function adminGroups(): AdminGroup[] {
  return db
    .prepare(
      `SELECT g.id, g.name, g.created_at AS createdAt, g.archived_at AS archivedAt,
              (SELECT slug FROM group_links l WHERE l.group_id = g.id AND l.retired_at IS NULL) AS link,
              (SELECT name FROM members o WHERE o.id = g.owner_member_id) AS owner,
              (SELECT COUNT(*) FROM members m WHERE m.group_id = g.id AND m.removed_at IS NULL) AS people,
              (SELECT COUNT(*) FROM picks k WHERE k.group_id = g.id) AS picks,
              MAX(g.created_at,
                  COALESCE((SELECT MAX(joined_at) FROM members m WHERE m.group_id = g.id), ''),
                  COALESCE((SELECT MAX(created_at) FROM picks k WHERE k.group_id = g.id), '')) AS lastActive
         FROM groups g
        ORDER BY g.archived_at IS NOT NULL, lastActive DESC`,
    )
    .all() as AdminGroup[];
}

const placeholders = (ids: unknown[]) => ids.map(() => "?").join(", ");

/** Closes groups: their links stop working and they leave everyone's My groups. */
export function archiveGroups(ids: string[]): number {
  if (ids.length === 0) return 0;
  return db
    .prepare(`UPDATE groups SET archived_at = datetime('now') WHERE archived_at IS NULL AND id IN (${placeholders(ids)})`)
    .run(...ids).changes;
}

export function restoreGroups(ids: string[]): number {
  if (ids.length === 0) return 0;
  return db
    .prepare(`UPDATE groups SET archived_at = NULL WHERE archived_at IS NOT NULL AND id IN (${placeholders(ids)})`)
    .run(...ids).changes;
}

/**
 * Deletes archived groups for good: their members, list, votes and links.
 * Places they shared stay in the pool (hide those separately). A group that
 * isn't archived is left alone, so this can never be the first step.
 */
export function purgeGroups(ids: string[]): number {
  if (ids.length === 0) return 0;
  const archived = (
    db.prepare(`SELECT id FROM groups WHERE archived_at IS NOT NULL AND id IN (${placeholders(ids)})`).all(...ids) as {
      id: string;
    }[]
  ).map((g) => g.id);
  if (archived.length === 0) return 0;
  const inGroups = placeholders(archived);
  db.transaction(() => {
    db.prepare(`UPDATE groups SET owner_member_id = NULL WHERE id IN (${inGroups})`).run(...archived);
    db.prepare(`UPDATE members SET merged_into = NULL WHERE group_id IN (${inGroups})`).run(...archived);
    db.prepare(
      `DELETE FROM votes WHERE pick_id IN (SELECT id FROM picks WHERE group_id IN (${inGroups}))
          OR member_id IN (SELECT id FROM members WHERE group_id IN (${inGroups}))`,
    ).run(...archived, ...archived);
    db.prepare(`DELETE FROM picks WHERE group_id IN (${inGroups})`).run(...archived);
    db.prepare(`DELETE FROM members WHERE group_id IN (${inGroups})`).run(...archived);
    db.prepare(`DELETE FROM group_links WHERE group_id IN (${inGroups})`).run(...archived);
    db.prepare(`DELETE FROM groups WHERE id IN (${inGroups})`).run(...archived);
  })();
  return archived.length;
}

// ---- places -------------------------------------------------------------------------

export interface AdminPlace {
  id: number;
  name: string;
  area: string;
  why: string;
  addedBy: string;
  createdAt: string;
  lists: number;
  hiddenAt: string | null;
}

/** Places people shared (not the starter list), newest first. */
export function adminPlaces(): AdminPlace[] {
  return db
    .prepare(
      `SELECT p.id, p.name, p.area, p.why, p.added_by AS addedBy, p.created_at AS createdAt, p.hidden_at AS hiddenAt,
              (SELECT COUNT(DISTINCT k.group_id) FROM picks k JOIN groups g ON g.id = k.group_id
                WHERE k.place_id = p.id AND g.archived_at IS NULL) AS lists
         FROM places p
        WHERE p.seed_key IS NULL
        ORDER BY p.hidden_at IS NOT NULL, p.created_at DESC, p.id DESC`,
    )
    .all() as AdminPlace[];
}

export function hidePlaces(ids: number[], hidden: boolean): number {
  if (ids.length === 0) return 0;
  return db
    .prepare(
      `UPDATE places SET hidden_at = ${hidden ? "datetime('now')" : "NULL"}
        WHERE seed_key IS NULL AND hidden_at IS ${hidden ? "" : "NOT "}NULL AND id IN (${placeholders(ids)})`,
    )
    .run(...ids).changes;
}
