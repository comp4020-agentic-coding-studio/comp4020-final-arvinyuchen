import { db, type Group, type Member } from "./db";

// Talk: a thread on each place on a group's list, for "is it open Mondays",
// "the upstairs bit is better", "who's been". Only the group's members see
// it (me()), and only while the place is on the list: taken off, its thread
// is hidden, and put back, it's there again as it was. There's no group
// chat, no push and no share button: people find out on the page (a count
// on the list's row, a dot on Our list's tab, "N new" on My groups).
//
// A message is plain text, its author's to delete and nobody else's (not
// the owner's). Deleted, it shows as "Message removed" and its author can
// undo it for a day; then its words are cleared from the database, the
// row staying as the stub. Its words never leave the group: not in a link
// preview, the invite's preview, Explore, another group, the admin's page,
// the live stream (which says only which thread changed) or search.

/** The most a message can say, in characters as a text field counts them. */
export const MESSAGE_MAX = 500;
/** How many messages a thread shows at once; "Earlier messages" brings more. */
export const PAGE = 50;
/** How many messages one member may send: a minute's, a day's. */
export const PER_MINUTE = 10;
export const PER_DAY = 300;
/** How long a deleted message keeps its words, so its author can undo it. */
export const CLEAR_AFTER_MS = 24 * 60 * 60 * 1000;

export interface Message {
  id: number;
  memberId: number;
  /** who said it (a removed member keeps their name, as what they added does) */
  name: string;
  /** its words; null once deleted (never sent to a page then, not even its author's) */
  body: string | null;
  createdAt: string;
  mine: boolean;
  deleted: boolean;
  /** deleted, and its words still there: its author can undo it */
  undoable: boolean;
}

export interface Thread {
  placeId: number;
  /** oldest first */
  messages: Message[];
  /** whether there are messages before the first of these */
  earlier: boolean;
}

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Clears the words of every message deleted more than a day ago. The app
 * has no cron, so this runs when the server starts, every hour after, and
 * before each thread is read or written: a deleted message's words never
 * outlive their day by more than an hour, and are never shown after it.
 */
export function clearDeleted(now = Date.now()): number {
  return db
    .prepare(
      `UPDATE comments SET body = '', cleared_at = ?
        WHERE deleted_at IS NOT NULL AND cleared_at IS NULL AND deleted_at <= ?`,
    )
    .run(iso(now), iso(now - CLEAR_AFTER_MS)).changes;
}
clearDeleted();
setInterval(() => clearDeleted(), 60 * 60 * 1000).unref();

/** Whether a place is on the group's list now: only then has it a thread to read or write. */
export const onList = (groupId: string, placeId: number): boolean =>
  Number.isInteger(placeId) &&
  db.prepare("SELECT 1 FROM picks WHERE group_id = ? AND place_id = ?").get(groupId, placeId) !== undefined;

/**
 * A message as it's kept: plain text, its lines kept (no more than one
 * empty line in a row), without control characters or the invisible ones
 * that turn text around. (It's shown as text, never as HTML.)
 */
export function cleanMessage(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    // (control characters and the invisible ones that turn text around)
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f‪-‮⁦-⁩]/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type SendResult = "sent" | "again" | "empty" | "long" | "slow" | "gone";

/**
 * Says something in a place's thread, as this member. "again" when this
 * nonce was sent already (a double tap, a form posted twice): nothing new.
 * "slow" past PER_MINUTE a minute or PER_DAY a day; "gone" when the place
 * isn't on the list.
 */
export function sendMessage(group: Group, member: Member, placeId: number, raw: string, nonce: string, now = Date.now()): SendResult {
  clearDeleted(now);
  if (!onList(group.id, placeId)) return "gone";
  const body = cleanMessage(raw);
  if (!body) return "empty";
  if (body.length > MESSAGE_MAX) return "long";
  const key = nonce.slice(0, 64) || null;
  return db.transaction((): SendResult => {
    if (key && db.prepare("SELECT 1 FROM comments WHERE member_id = ? AND nonce = ?").get(member.id, key)) return "again";
    const since = db.prepare("SELECT COUNT(*) FROM comments WHERE member_id = ? AND created_at > ?").pluck();
    if ((since.get(member.id, iso(now - 60_000)) as number) >= PER_MINUTE) return "slow";
    if ((since.get(member.id, iso(now - 24 * 60 * 60 * 1000)) as number) >= PER_DAY) return "slow";
    const { lastInsertRowid } = db
      .prepare("INSERT INTO comments (group_id, place_id, member_id, body, nonce, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(group.id, placeId, member.id, body, key, iso(now));
    // (what you've said, you've read)
    markRead(member, group.id, placeId, Number(lastInsertRowid));
    return "sent";
  })();
}

/** One of the group's messages, if it's this member's own and its place is on the list. */
const ownMessage = (group: Group, member: Member, id: number) =>
  db
    .prepare(
      `SELECT c.id, c.place_id AS placeId, c.deleted_at AS deletedAt, c.cleared_at AS clearedAt
         FROM comments c JOIN picks k ON k.group_id = c.group_id AND k.place_id = c.place_id
        WHERE c.id = ? AND c.group_id = ? AND c.member_id = ?`,
    )
    .get(id, group.id, member.id) as { id: number; placeId: number; deletedAt: string | null; clearedAt: string | null } | undefined;

/**
 * Deletes a message, if it's this member's own: nobody else's, not even
 * the owner's. Its words stay a day for Undo, then go. Returns its place's
 * id, or undefined if nothing was deleted.
 */
export function deleteMessage(group: Group, member: Member, id: number, now = Date.now()): number | undefined {
  clearDeleted(now);
  const own = ownMessage(group, member, id);
  if (!own || own.deletedAt) return undefined;
  db.prepare("UPDATE comments SET deleted_at = ? WHERE id = ?").run(iso(now), id);
  return own.placeId;
}

/** Brings back a message its author deleted, while its words are still there. */
export function undoDelete(group: Group, member: Member, id: number, now = Date.now()): number | undefined {
  clearDeleted(now);
  const own = ownMessage(group, member, id);
  if (!own || !own.deletedAt || own.clearedAt) return undefined;
  db.prepare("UPDATE comments SET deleted_at = NULL WHERE id = ?").run(id);
  return own.placeId;
}

/** This member has seen the thread up to message `upTo` (never back). */
export function markRead(member: Member, groupId: string, placeId: number, upTo: number): void {
  db.prepare(
    `INSERT INTO comment_reads (member_id, group_id, place_id, last_read_id) VALUES (?, ?, ?, ?)
     ON CONFLICT (member_id, place_id) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)`,
  ).run(member.id, groupId, placeId, upTo);
}

type Row = { id: number; memberId: number; name: string; body: string; createdAt: string; deletedAt: string | null; clearedAt: string | null };

/**
 * A place's thread as this member sees it, if the place is on the list:
 * the newest PAGE messages; or the PAGE before message `before` ("Earlier
 * messages"); or every message from `from` on (a page that has loaded
 * earlier ones catching up). Reading the newest marks the thread read.
 * A deleted message comes without its words.
 */
export function thread(
  group: Group,
  member: Member,
  placeId: number,
  { before, from }: { before?: number; from?: number } = {},
): Thread | undefined {
  clearDeleted();
  if (!onList(group.id, placeId)) return undefined;
  const columns = `c.id, c.member_id AS memberId, m.name, c.body, c.created_at AS createdAt, c.deleted_at AS deletedAt, c.cleared_at AS clearedAt
    FROM comments c JOIN members m ON m.id = c.member_id WHERE c.group_id = ? AND c.place_id = ?`;
  let rows: Row[];
  if (from && from > 0) {
    rows = db.prepare(`SELECT ${columns} AND c.id >= ? ORDER BY c.id LIMIT 2000`).all(group.id, placeId, from) as Row[];
  } else {
    const newest = db
      .prepare(`SELECT ${columns} ${before ? "AND c.id < ?" : ""} ORDER BY c.id DESC LIMIT ?`)
      .all(...(before ? [group.id, placeId, before, PAGE + 1] : [group.id, placeId, PAGE + 1])) as Row[];
    rows = newest.slice(0, PAGE).reverse();
  }
  const first = rows[0]?.id;
  const earlier =
    first !== undefined && db.prepare("SELECT 1 FROM comments WHERE group_id = ? AND place_id = ? AND id < ?").get(group.id, placeId, first) !== undefined;
  if (!before) {
    const last = db.prepare("SELECT MAX(id) FROM comments WHERE group_id = ? AND place_id = ?").pluck().get(group.id, placeId) as number | null;
    if (last) markRead(member, group.id, placeId, last);
  }
  return {
    placeId,
    earlier,
    messages: rows.map((r) => ({
      id: r.id,
      memberId: r.memberId,
      name: r.name,
      body: r.deletedAt ? null : r.body,
      createdAt: r.createdAt,
      mine: r.memberId === member.id,
      deleted: r.deletedAt !== null,
      undoable: r.deletedAt !== null && r.clearedAt === null && r.memberId === member.id,
    })),
  };
}

export interface TalkCount {
  /** messages in the thread, deleted ones aside */
  total: number;
  /** of them, from others since this member last looked */
  unread: number;
}

/** Each place on the group's list that has a thread: how many messages, how many new to this member. */
export function talkCounts(groupId: string, member: Member): Map<number, TalkCount> {
  const rows = db
    .prepare(
      `SELECT c.place_id AS placeId, COUNT(*) AS total,
              SUM(c.member_id != ? AND c.id > COALESCE(r.last_read_id, 0)) AS unread
         FROM comments c
         JOIN picks k ON k.group_id = c.group_id AND k.place_id = c.place_id
         LEFT JOIN comment_reads r ON r.member_id = ? AND r.place_id = c.place_id
        WHERE c.group_id = ? AND c.deleted_at IS NULL
        GROUP BY c.place_id`,
    )
    .all(member.id, member.id, groupId) as { placeId: number; total: number; unread: number }[];
  return new Map(rows.map((r) => [r.placeId, { total: r.total, unread: r.unread }]));
}

/** How many messages are new to this account in each of its groups (by group id), on places on their lists. */
export function unreadByGroup(accountId: number): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT m.group_id AS groupId, COUNT(*) AS unread
         FROM members m
         JOIN comments c ON c.group_id = m.group_id AND c.member_id != m.id AND c.deleted_at IS NULL
         JOIN picks k ON k.group_id = c.group_id AND k.place_id = c.place_id
         LEFT JOIN comment_reads r ON r.member_id = m.id AND r.place_id = c.place_id
        WHERE m.account_id = ? AND m.removed_at IS NULL AND c.id > COALESCE(r.last_read_id, 0)
        GROUP BY m.group_id`,
    )
    .all(accountId) as { groupId: string; unread: number }[];
  return new Map(rows.map((r) => [r.groupId, r.unread]));
}
