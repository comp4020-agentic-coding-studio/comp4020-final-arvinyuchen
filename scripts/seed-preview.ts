// Groups to look at the UI with, locally: one per situation a plan can be
// in (just you, a few, a crowd; nobody answered, some, all; a time that
// works, none that does, a time set), each with you as its owner and a
// plan a few days out, and one with the same person twice. Run it again
// and each is put back as it was; the groups and the made-up people in
// them are reused.
//
//   pnpm seed:preview          (as whoever signed in here last)
//   pnpm seed:preview 279      (as that account)
//
// Never against the live database: it refuses in production.
import { createAccount, getAccount } from "../src/lib/accounts";
import {
  addPick,
  claimMember,
  createGroup,
  db,
  getGroup,
  joinGroup,
  listMembers,
  placeIdForSeed,
  setStops,
  type Member,
} from "../src/lib/db";
import type { Interval } from "../src/lib/free";
import { answerPlan, currentPlan, setPlanTime, startPlan } from "../src/lib/plans";
import { addDays, today } from "../src/lib/when";

if (process.env.NODE_ENV === "production" || process.env.FLY_APP_NAME) throw new Error("seed-preview is for a local database only");

const h = (hours: number) => Math.round(hours * 60);
const busy = (...spans: [number, number][]): Interval[] => spans.map(([a, b]) => [h(a), h(b)]);

// (a crowd's answers: a few busy stretches each, the same every run)
let state = 7;
const rand = () => ((state = (state * 48271) % 2147483647) / 2147483647);
const someBusy = (): Interval[] => {
  const out: Interval[] = [];
  for (let n = Math.floor(rand() * 3); n >= 0; n--) {
    const from = 8 + Math.floor(rand() * 26) / 2;
    out.push([h(from), h(Math.min(23, from + 1 + Math.floor(rand() * 6) / 2))]);
  }
  return out;
};

const NAMES = ["Mia", "Leo", "Zoe", "Sam", "Ava", "Noah", "Ivy", "Kai", "Ella", "Finn", "Ruby", "Jack", "Lily", "Max"];

// Each: who's in it besides you, and each one's answer (undefined: not
// answered yet; []: free all day). `me` is yours.
interface Scenario {
  name: string;
  me?: Interval[];
  others: (Interval[] | undefined)[];
  set?: boolean;
  /** how many places the outing takes in, in order (one unless it says) */
  stops?: number;
}
const SCENARIOS: Scenario[] = [
  { name: "Test · just me, not answered", others: [] },
  { name: "Test · just me", me: busy([12, 14], [18, 19.5]), others: [] },
  { name: "Test · four, half answered", others: [busy([9, 11]), busy([13, 16]), undefined] },
  { name: "Test · five, a time works", me: busy([9, 12]), others: [busy([8, 10], [19, 23]), busy([10, 13]), [], busy([20, 23])] },
  { name: "Test · five, no time works", me: busy([8, 12]), others: [busy([11, 15]), busy([14, 18]), busy([17, 21]), busy([20, 23])] },
  { name: "Test · four, time set", me: busy([8, 10]), others: [busy([12, 13]), [], busy([19, 23])], set: true, stops: 2 },
  {
    name: "Test · a crowd of fourteen",
    stops: 3,
    me: busy([10, 12]),
    others: NAMES.slice(0, 13).map((_, i) => (i % 5 === 4 ? undefined : someBusy())),
  },
];

const accountId =
  Number(process.argv[2]) ||
  (db.prepare("SELECT account_id FROM sessions ORDER BY created_at DESC LIMIT 1").pluck().get() as number | undefined);
const me = accountId ? getAccount(accountId) : undefined;
if (!me) throw new Error("no account: sign in on localhost first, or pass an account id");

// the made-up people, one account each, kept by handle across runs
const person = (name: string, as = name) => {
  const handle = `preview-${as.toLowerCase()}`;
  const id = db.prepare("SELECT id FROM accounts WHERE handle = ?").pluck().get(handle) as number | undefined;
  return id ? getAccount(id)! : createAccount(handle, name);
};

const stops = ["questacon", "nga", "mt-ainslie"].map((k) => placeIdForSeed(k)).filter((id): id is number => id !== undefined);
const day = addDays(today(), 3);

for (const s of SCENARIOS) {
  const found = db
    .prepare("SELECT g.id FROM groups g JOIN members m ON m.id = g.owner_member_id WHERE g.name = ? AND m.account_id = ?")
    .pluck()
    .get(s.name, me.id) as string | undefined;
  const group = found ? getGroup(found)! : createGroup(s.name, me).group;
  const members = listMembers(group.id);
  const owner = members.find((m) => m.id === group.ownerId)!;
  const others: Member[] = s.others.map((_, i) => {
    const who = person(NAMES[i]);
    return members.find((m) => m.accountId === who.id) ?? joinGroup(group.id, who);
  });
  for (const id of stops) addPick(group.id, id, owner);

  let plan = currentPlan(group.id);
  if (!plan) {
    const id = startPlan(getGroup(group.id)!, owner, stops.slice(0, 1), day);
    if (typeof id !== "number") throw new Error(`${s.name}: couldn't start a plan (${id})`);
    plan = currentPlan(group.id)!;
  }
  setStops(plan.id, stops.slice(0, s.stops ?? 1));
  // (the answers as written here, and no time set unless it says so)
  db.prepare("DELETE FROM plan_busy WHERE plan_id = ?").run(plan.id);
  db.prepare("DELETE FROM plan_answers WHERE plan_id = ?").run(plan.id);
  db.prepare("UPDATE plans SET set_start = NULL, set_end = NULL, set_at = NULL WHERE id = ?").run(plan.id);
  if (s.me) answerPlan(plan, owner, s.me);
  s.others.forEach((answer, i) => answer && answerPlan(plan, others[i], answer));
  if (s.set) setPlanTime(plan, h(14), h(16));

  console.log(`${s.name.padEnd(30)} http://localhost:4410/g/${group.id}`);
}

// The same person twice, for Settings' "Same person?": two Mias (one name),
// and Kit, who says she's Leo's lost account. (Answered asks come back.)
{
  const name = "Test · same person twice";
  const found = db
    .prepare("SELECT g.id FROM groups g JOIN members m ON m.id = g.owner_member_id WHERE g.name = ? AND m.account_id = ?")
    .pluck()
    .get(name, me.id) as string | undefined;
  const group = getGroup(found ?? createGroup(name, me).group.id)!;
  const members = listMembers(group.id);
  const add = (who: string, handle = who) => {
    const account = person(who, handle);
    return members.find((m) => m.accountId === account.id) ?? joinGroup(group.id, account);
  };
  add("Mia");
  const leo = add("Leo");
  add("Mia", "Mia2");
  const kit = add("Kit");
  db.prepare("DELETE FROM member_claims WHERE group_id = ?").run(group.id);
  claimMember(group, kit, leo.id);
  console.log(`${name.padEnd(30)} http://localhost:4410/g/${group.id}`);
}
