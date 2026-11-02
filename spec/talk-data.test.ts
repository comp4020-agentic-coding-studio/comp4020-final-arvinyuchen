import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// Talk's data, on a database of its own: a day can't pass in a test against
// the running app, so the clearing of deleted words (and the rest of what
// the tables promise) is checked here, on the same code, with the clock
// handed in. Nothing here touches the app's database.
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "spots-talk-")), "spots.db");
let db: typeof import("../src/lib/db");
let talk: typeof import("../src/lib/talk");
let admin: typeof import("../src/lib/admin");
beforeAll(async () => {
  db = await import("../src/lib/db");
  talk = await import("../src/lib/talk");
  admin = await import("../src/lib/admin");
});

let n = 0;
const account = (name: string) => {
  const id = Number(db.db.prepare("INSERT INTO accounts (handle, name) VALUES (?, ?)").run(`h${++n}-${name}`, name).lastInsertRowid);
  return { id, name };
};
/** A group with Questacon on its list: Ana owns it, Ben's in it. */
function crew() {
  const { group, member: ana } = db.createGroup(`Crew ${++n}`, account("Ana"));
  const ben = db.joinGroup(group.id, account("Ben"));
  const place = db.placeIdForSeed("questacon")!;
  db.addPick(group.id, place, ana);
  return { group: db.getGroup(group.id)!, ana, ben, place };
}
const HOUR = 60 * 60 * 1000;
const bodyOf = (id: number) => db.db.prepare("SELECT body FROM comments WHERE id = ?").pluck().get(id);
const lastId = () => db.db.prepare("SELECT MAX(id) FROM comments").pluck().get() as number;

describe("Talk's data", () => {
  it("hangs a thread on the group and the place, so it's there again when the place comes back", () => {
    const c = crew();
    expect(talk.sendMessage(c.group, c.ben, c.place, "Open Mondays?", "a")).toBe("sent");
    const pick = db.listPicks(c.group.id)[0];
    db.removePick(c.group, pick.id, c.ana);
    // off the list: hidden, and nobody can write to it
    expect(talk.thread(c.group, c.ben, c.place)).toBeUndefined();
    expect(talk.sendMessage(c.group, c.ben, c.place, "Hello?", "b")).toBe("gone");
    db.addPick(c.group.id, c.place, c.ana);
    expect(talk.thread(c.group, c.ben, c.place)?.messages.map((m) => m.body)).toEqual(["Open Mondays?"]);
  });

  it("keeps a message to plain text of 500 characters, and a nonce sends it once", () => {
    const c = crew();
    expect(talk.sendMessage(c.group, c.ben, c.place, "   \n\n ", "e")).toBe("empty");
    expect(talk.sendMessage(c.group, c.ben, c.place, "x".repeat(501), "l")).toBe("long");
    expect(talk.sendMessage(c.group, c.ben, c.place, "y".repeat(500), "ok")).toBe("sent");
    expect(talk.sendMessage(c.group, c.ben, c.place, "once", "same")).toBe("sent");
    expect(talk.sendMessage(c.group, c.ben, c.place, "once", "same")).toBe("again");
    expect(talk.cleanMessage("a\r\n\r\n\r\n\r\nb‮\u0007 ")).toBe("a\n\nb");
  });

  it("lets a member send 10 a minute and 300 a day", () => {
    const c = crew();
    const t = Date.now();
    for (let i = 0; i < 10; i++) expect(talk.sendMessage(c.group, c.ben, c.place, `m${i}`, `m${i}`, t + i)).toBe("sent");
    expect(talk.sendMessage(c.group, c.ben, c.place, "too fast", "x", t + 20)).toBe("slow");
    // (someone else isn't held up)
    expect(talk.sendMessage(c.group, c.ana, c.place, "me too", "y", t + 20)).toBe("sent");
    expect(talk.sendMessage(c.group, c.ben, c.place, "a minute on", "z", t + 61_000)).toBe("sent");
    for (let i = 0; i < 289; i++) db.db.prepare("INSERT INTO comments (group_id, place_id, member_id, body, created_at) VALUES (?, ?, ?, 'old', ?)").run(c.group.id, c.place, c.ben.id, new Date(t - HOUR).toISOString());
    expect(talk.sendMessage(c.group, c.ben, c.place, "the 301st", "d", t + 5 * 60_000)).toBe("slow");
    expect(talk.sendMessage(c.group, c.ben, c.place, "next day", "d2", t + 25 * HOUR)).toBe("sent");
  });

  it("lets only a message's author delete it, and undo it for a day; then its words are cleared", () => {
    const c = crew();
    const t = Date.now();
    talk.sendMessage(c.group, c.ben, c.place, "Ben's words", "1", t);
    const id = lastId();
    // not the owner, not anyone else
    expect(talk.deleteMessage(c.group, c.ana, id, t)).toBeUndefined();
    expect(talk.deleteMessage(c.group, c.ben, id, t)).toBe(c.place);
    // a stub to everyone, without its words, even to Ben; Ben can undo it
    const forAna = talk.thread(c.group, c.ana, c.place)!.messages.find((m) => m.id === id)!;
    expect(forAna).toMatchObject({ deleted: true, body: null, undoable: false });
    expect(talk.thread(c.group, c.ben, c.place)!.messages.find((m) => m.id === id)).toMatchObject({ body: null, undoable: true });
    expect(talk.undoDelete(c.group, c.ana, id, t)).toBeUndefined();
    expect(talk.undoDelete(c.group, c.ben, id, t + HOUR)).toBe(c.place);
    expect(talk.thread(c.group, c.ana, c.place)!.messages.find((m) => m.id === id)?.body).toBe("Ben's words");
    // deleted again: a day on, it's still there to undo; just past it, it's gone for good
    talk.deleteMessage(c.group, c.ben, id, t + 2 * HOUR);
    expect(talk.clearDeleted(t + 25 * HOUR)).toBe(0);
    expect(bodyOf(id)).toBe("Ben's words");
    expect(talk.clearDeleted(t + 26 * HOUR + 1)).toBeGreaterThan(0);
    expect(bodyOf(id)).toBe("");
    expect(talk.undoDelete(c.group, c.ben, id, t + 27 * HOUR)).toBeUndefined();
    expect(talk.thread(c.group, c.ben, c.place)!.messages.find((m) => m.id === id)).toMatchObject({ deleted: true, undoable: false });
  });

  it("counts each thread's messages and what's new to each member, and pages back 50 at a time", () => {
    const c = crew();
    for (let i = 1; i <= 120; i++) talk.sendMessage(c.group, i > 117 || i % 2 ? c.ana : c.ben, c.place, `#${i}`, `p${i}`, Date.now() - (200 - i) * 60_000);
    // replying, Ben read what came before: the four Ana sent after are new to him, until he opens it
    expect(talk.talkCounts(c.group.id, c.ben).get(c.place)).toEqual({ total: 120, unread: 4 });
    const newest = talk.thread(c.group, c.ben, c.place)!;
    expect(newest.messages.map((m) => m.body)).toEqual(Array.from({ length: 50 }, (_, i) => `#${i + 71}`));
    expect(newest.earlier).toBe(true);
    expect(talk.talkCounts(c.group.id, c.ben).get(c.place)).toEqual({ total: 120, unread: 0 });
    const before = talk.thread(c.group, c.ben, c.place, { before: newest.messages[0].id })!;
    expect(before.messages.map((m) => m.body)[0]).toBe("#21");
    const first = talk.thread(c.group, c.ben, c.place, { before: before.messages[0].id })!;
    expect([first.messages.length, first.earlier]).toEqual([20, false]);
    // all of it from a message on, as a page that loaded earlier ones catches up
    expect(talk.thread(c.group, c.ben, c.place, { from: before.messages[0].id })!.messages.length).toBe(100);
    // My groups' "N new", only for places on the list
    talk.sendMessage(c.group, c.ana, c.place, "new", "n1");
    expect(talk.unreadByGroup(c.ben.accountId!).get(c.group.id)).toBe(1);
    db.removePick(c.group, db.listPicks(c.group.id)[0].id, c.ana);
    expect(talk.unreadByGroup(c.ben.accountId!).get(c.group.id)).toBeUndefined();
  });

  it("moves a merged member's messages and reading over, keeps a removed member's words, and goes with a deleted group", () => {
    const c = crew();
    const old = db.joinGroup(c.group.id, account("Ben again"));
    talk.sendMessage(c.group, c.ana, c.place, "hi", "h1");
    talk.sendMessage(c.group, old, c.place, "from my old account", "o1");
    const said = lastId();
    db.mergeMembers(c.group, old.id, c.ben.id);
    expect(talk.deleteMessage(c.group, c.ben, said)).toBe(c.place);
    expect(talk.talkCounts(c.group.id, c.ben).get(c.place)?.unread).toBe(0);
    // removed: what they said stays, under their name
    const cy = db.joinGroup(c.group.id, account("Cy"));
    talk.sendMessage(c.group, cy, c.place, "Cy was here", "c1");
    db.removeMember(c.group, cy.id);
    expect(talk.thread(c.group, c.ana, c.place)!.messages.at(-1)).toMatchObject({ name: "Cy", body: "Cy was here" });
    // the group deleted for good takes its Talk with it
    admin.archiveGroups([c.group.id]);
    expect(admin.purgeGroups([c.group.id])).toBe(1);
    expect(db.db.prepare("SELECT COUNT(*) FROM comments WHERE group_id = ?").pluck().get(c.group.id)).toBe(0);
    expect(db.db.prepare("SELECT COUNT(*) FROM comment_reads WHERE group_id = ?").pluck().get(c.group.id)).toBe(0);
  });
});
