import type { Photo } from "./catalogue";
import { db, setStops, type Group, type Member } from "./db";
import { EARLIEST, freeDuring, freeTimes, isInterval, LATEST, mergeIntervals, shownWindows, type Interval, type Stretch } from "./free";
import type { Kind } from "./kinds";
import { addDays, isDay, today } from "./when";

// Deciding when: the owner picks one place on the list or several, in the
// order the outing goes (its stops), a day and how long it all takes; everyone, the owner too, marks when they're busy that day; the card
// works out when people are free together for that long, and the owner sets
// the time whenever they like.
// One plan at a time per group. Nobody sees anyone else's busy times: only
// how many are free when, and who can't make a window. No push, no share:
// people find out on the page (src/pages/g/[link].astro).

/** Days ahead a plan can be for. */
export const PLAN_DAYS_AHEAD = 365;
/** Unless the owner says otherwise, a plan counts 8am to 11pm. */
export const DEFAULT_RANGE = { start: 480, end: 1380 };
/** Unless the owner says otherwise, a plan takes two hours. */
export const DEFAULT_DURATION = 120;
/** One outing takes in this many places on the list, at most. */
export const MAX_STOPS = 5;

export type Stop = { id: number; name: string; kind: Kind; area: string; photo: Photo | null };

export interface Plan {
  id: number;
  groupId: string;
  /** the first stop's */
  placeId: number;
  /** the first stop */
  place: Stop;
  /** where the outing goes, in order (one at least) */
  stops: Stop[];
  createdBy: number;
  day: string;
  range: { start: number; end: number };
  /** how long it takes, in minutes: only windows this long are offered */
  duration: number;
  set: { start: number; end: number; at: string } | null;
  reviewedAt: string | null;
  calledOffAt: string | null;
  createdAt: string;
}

type PlanRow = {
  id: number;
  group_id: string;
  place_id: number;
  created_by: number;
  day: string;
  range_start: number;
  range_end: number;
  duration: number;
  set_start: number | null;
  set_end: number | null;
  set_at: string | null;
  reviewed_at: string | null;
  called_off_at: string | null;
  created_at: string;
  name: string;
  kind: Kind;
  area: string;
  photo_src: string | null;
  photo_page: string | null;
  photo_credit: string | null;
  photo_license: string | null;
};
type PlaceRow = Pick<PlanRow, "name" | "kind" | "area" | "photo_src" | "photo_page" | "photo_credit" | "photo_license">;
const toStop = (id: number, r: PlaceRow): Stop => ({
  id,
  name: r.name,
  kind: r.kind,
  area: r.area,
  photo: r.photo_src ? { src: r.photo_src, page: r.photo_page ?? r.photo_src, credit: r.photo_credit ?? "", license: r.photo_license ?? "" } : null,
});
// (a plan's stops, in order; one made before stops has its place as stop 1)
const stopsOf = (planId: number) =>
  (
    db
      .prepare(
        `SELECT p.id, p.name, p.kind, p.area, p.photo_src, p.photo_page, p.photo_credit, p.photo_license
           FROM plan_places pp JOIN places p ON p.id = pp.place_id WHERE pp.plan_id = ? ORDER BY pp.position`,
      )
      .all(planId) as (PlaceRow & { id: number })[]
  ).map((r) => toStop(r.id, r));
const toPlan = (r: PlanRow): Plan => {
  const place = toStop(r.place_id, r);
  const stops = stopsOf(r.id);
  return {
    id: r.id,
    groupId: r.group_id,
    placeId: r.place_id,
    place,
    stops: stops.length ? stops : [place],
    createdBy: r.created_by,
    day: r.day,
    range: { start: r.range_start, end: r.range_end },
    duration: r.duration,
    set: r.set_start !== null && r.set_end !== null && r.set_at ? { start: r.set_start, end: r.set_end, at: r.set_at } : null,
    reviewedAt: r.reviewed_at,
    calledOffAt: r.called_off_at,
    createdAt: r.created_at,
  };
};
const PLAN_SELECT = `SELECT pl.*, p.name, p.kind, p.area, p.photo_src, p.photo_page, p.photo_credit, p.photo_license
  FROM plans pl JOIN places p ON p.id = pl.place_id`;
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/** The group's plan now: not called off, its day today or later. */
export function currentPlan(groupId: string, now = new Date()): Plan | undefined {
  const row = db
    .prepare(`${PLAN_SELECT} WHERE pl.group_id = ? AND pl.called_off_at IS NULL AND pl.day >= ? ORDER BY pl.id DESC LIMIT 1`)
    .get(groupId, today(now)) as PlanRow | undefined;
  return row && toPlan(row);
}

/** One of the group's plans, by id. */
export function planOf(groupId: string, id: number): Plan | undefined {
  const row = db.prepare(`${PLAN_SELECT} WHERE pl.group_id = ? AND pl.id = ?`).get(groupId, id) as PlanRow | undefined;
  return row && toPlan(row);
}

/** Plans behind the group: their day gone, or called off (but not one only moved to another day). Latest first. */
export function pastPlans(groupId: string, now = new Date(), limit = 12): Plan[] {
  return (
    db
      .prepare(
        `${PLAN_SELECT} WHERE pl.group_id = ? AND pl.replaced_by IS NULL AND (pl.day < ? OR pl.called_off_at IS NOT NULL)
          ORDER BY pl.day DESC, pl.id DESC LIMIT ?`,
      )
      .all(groupId, today(now), limit) as PlanRow[]
  ).map(toPlan);
}

/** Whether `range` is a span a plan may count: whole minutes, 6am to midnight. */
export const isRange = (r: { start: number; end: number }) =>
  isInterval([r.start, r.end]) && r.start >= EARLIEST && r.end <= LATEST;

/** Whether `duration` is how long a plan counting `range` may take: a minute, up to all of it. */
export const isDuration = (duration: number, r: { start: number; end: number }) =>
  Number.isInteger(duration) && duration >= 1 && duration <= r.end - r.start;

/**
 * The stops said in order: "National Gallery → Questacon"; with more than
 * `room`, the first and how many more: "National Gallery + 2 more".
 */
export function stopNames(stops: { name: string }[], room = 3): string {
  if (stops.length <= room) return stops.map((s) => s.name).join(" → ");
  return `${stops[0].name} + ${stops.length - 1} more`;
}

/** Whether `day` can have a plan: today, or up to a year ahead. */
export const isPlanDay = (day: string, now = new Date()) =>
  isDay(day) && day >= today(now) && day <= addDays(today(now), PLAN_DAYS_AHEAD);

const onList = (groupId: string, placeId: number) =>
  db.prepare("SELECT 1 FROM picks WHERE group_id = ? AND place_id = ?").get(groupId, placeId) !== undefined;

/** Whether `ids` can be a plan's stops: one to five places on the group's list, none twice. */
export const areStops = (groupId: string, ids: number[]) =>
  ids.length >= 1 &&
  ids.length <= MAX_STOPS &&
  new Set(ids).size === ids.length &&
  ids.every((id) => Number.isInteger(id) && onList(groupId, id));

/**
 * The owner starts a plan for one or more places on the list (its stops,
 * in order), on a day, taking so long all told. One at a time: "exists"
 * while the group has one. Returns its id, or "invalid".
 */
export function startPlan(
  group: Group,
  by: Member,
  stops: number[],
  day: string,
  range = DEFAULT_RANGE,
  duration = DEFAULT_DURATION,
  now = new Date(),
): number | "exists" | "invalid" {
  if (by.id !== group.ownerId || !isPlanDay(day, now) || !isRange(range) || !isDuration(duration, range) || !areStops(group.id, stops))
    return "invalid";
  return db.transaction(() => {
    if (currentPlan(group.id, now)) return "exists" as const;
    const id = Number(
      db
        .prepare("INSERT INTO plans (group_id, place_id, created_by, day, range_start, range_end, duration) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(group.id, stops[0], by.id, day, range.start, range.end, duration).lastInsertRowid,
    );
    setStops(id, stops);
    return id;
  })();
}

/**
 * A member's busy times for the plan's day, all at once: what their page
 * showed, so sending it twice changes nothing. An empty list is "free all
 * day". Each stretch must be whole minutes within the day; overlapping
 * ones are made one. Returns whether anything changed, or "invalid".
 */
export function answerPlan(plan: Plan, member: Member, busy: Interval[], now = new Date()): boolean | "invalid" {
  if (plan.calledOffAt || plan.day < today(now)) return "invalid";
  if (!busy.every(isInterval)) return "invalid";
  const merged = mergeIntervals(busy);
  return db.transaction(() => {
    const had = busyOf(plan.id).get(member.id);
    if (had && JSON.stringify(had) === JSON.stringify(merged)) return false;
    db.prepare("DELETE FROM plan_busy WHERE plan_id = ? AND member_id = ?").run(plan.id, member.id);
    const add = db.prepare("INSERT INTO plan_busy (plan_id, member_id, start_min, end_min) VALUES (?, ?, ?, ?)");
    for (const [a, b] of merged) add.run(plan.id, member.id, a, b);
    db.prepare(
      `INSERT INTO plan_answers (plan_id, member_id) VALUES (?, ?)
       ON CONFLICT(plan_id, member_id) DO UPDATE SET updated_at = ${NOW}`,
    ).run(plan.id, member.id);
    return true;
  })();
}

/** Everyone's busy times for a plan, by member (who answered only). */
export function busyOf(planId: number): Map<number, Interval[]> {
  const out = new Map<number, Interval[]>();
  for (const { member_id } of db.prepare("SELECT member_id FROM plan_answers WHERE plan_id = ?").all(planId) as { member_id: number }[])
    out.set(member_id, []);
  for (const r of db
    .prepare("SELECT member_id, start_min, end_min FROM plan_busy WHERE plan_id = ? ORDER BY start_min")
    .all(planId) as { member_id: number; start_min: number; end_min: number }[])
    out.get(r.member_id)?.push([r.start_min, r.end_min]);
  return out;
}

/** The owner sets the time: from `start` to `end`, inside the plan's day. */
export function setPlanTime(plan: Plan, start: number, end: number): boolean {
  if (plan.calledOffAt || !isInterval([start, end]) || start < plan.range.start || end > plan.range.end) return false;
  db.prepare(`UPDATE plans SET set_start = ?, set_end = ?, set_at = ${NOW}, reviewed_at = NULL WHERE id = ?`).run(start, end, plan.id);
  return true;
}

/** Back to picking: the time is no longer set. */
export function unsetPlanTime(plan: Plan): boolean {
  if (!plan.set) return false;
  db.prepare("UPDATE plans SET set_start = NULL, set_end = NULL, set_at = NULL, reviewed_at = NULL WHERE id = ?").run(plan.id);
  return true;
}

/** The owner has seen who changed their times since the time was set, and keeps it. */
export function keepPlanTime(plan: Plan): boolean {
  if (!plan.set) return false;
  db.prepare(`UPDATE plans SET reviewed_at = ${NOW} WHERE id = ?`).run(plan.id);
  return true;
}

/** The plan is off. It stays, under Past plans. */
export function callOffPlan(plan: Plan): boolean {
  if (plan.calledOffAt) return false;
  db.prepare(`UPDATE plans SET called_off_at = ${NOW} WHERE id = ?`).run(plan.id);
  return true;
}

/**
 * Another day, other hours to count, another length, or other stops. On
 * the same day these keep everyone's answers (the card just works it out
 * again); another day is a new plan for the same stops (answers were about
 * the old day), and the old one is called off and points at it, so
 * nothing's lost. Returns the plan's id now, or "invalid".
 */
export function changePlan(
  plan: Plan,
  by: Member,
  day: string,
  range: { start: number; end: number },
  duration = plan.duration,
  stops = plan.stops.map((s) => s.id),
  now = new Date(),
): number | "invalid" {
  if (plan.calledOffAt || !isRange(range) || !isDuration(duration, range) || !isPlanDay(day, now) || !areStops(plan.groupId, stops))
    return "invalid";
  if (day === plan.day) {
    return db.transaction(() => {
      if (plan.set && (plan.set.start < range.start || plan.set.end > range.end)) unsetPlanTime(plan);
      db.prepare("UPDATE plans SET range_start = ?, range_end = ?, duration = ? WHERE id = ?").run(range.start, range.end, duration, plan.id);
      if (stops.join() !== plan.stops.map((s) => s.id).join()) setStops(plan.id, stops);
      return plan.id;
    })();
  }
  return db.transaction(() => {
    const id = Number(
      db
        .prepare("INSERT INTO plans (group_id, place_id, created_by, day, range_start, range_end, duration) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(plan.groupId, stops[0], by.id, day, range.start, range.end, duration).lastInsertRowid,
    );
    setStops(id, stops);
    db.prepare(`UPDATE plans SET called_off_at = ${NOW}, replaced_by = ? WHERE id = ?`).run(id, plan.id);
    return id;
  })();
}

// ---- what a member's page shows --------------------------------------------------

export interface PlanWindow {
  from: number;
  to: number;
  /** everyone who answered is free all through it */
  all: boolean;
  free: string[];
  cant: string[];
  /** the viewer can't make it */
  youCant: boolean;
}

export interface PlanView {
  plan: Plan;
  owner: string;
  answered: Member[];
  waiting: Member[];
  /** every member has answered */
  everyoneIn: boolean;
  /** the viewer's own busy times, or null if they haven't answered */
  mine: Interval[] | null;
  /** how many of those who answered are free, piece by piece (counts only) */
  heat: { from: number; to: number; free: number }[];
  /** the same for everyone but the viewer, for their timeline */
  others: { from: number; to: number; free: number }[];
  othersAnswered: number;
  windows: PlanWindow[];
  hiddenWindows: number;
  /** the windows not listed (the best few), for "Other" */
  rest: PlanWindow[];
  /** with no window as long as the plan takes: the longest there is that two or more are free (in minutes), or 0 */
  longestShort: number;
  /**
   * when windows are listed but none has everyone who answered free, and a
   * shorter one does: the longest such (the earliest of equals), or null
   */
  allFree: { from: number; to: number } | null;
  /** once set: who's free all through the set time, who isn't, who hasn't said */
  set: { free: Member[]; busy: Member[]; unknown: Member[] } | null;
  /** for the owner, once set: who has since changed their times so they can't make it */
  changed: { names: string[]; best: PlanWindow | null } | null;
}

/** The plan as the viewer may see it: never another member's busy times. */
export function planView(plan: Plan, members: Member[], viewer: Member, ownerId: number | null): PlanView {
  const busy = busyOf(plan.id);
  const ids = members.map((m) => m.id);
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const answered = members.filter((m) => busy.has(m.id));
  const { segments, windows, shorter } = freeTimes(plan.range, ids, busy, plan.duration);
  const total = answered.length;
  const everyoneIn = total === members.length;
  const toWindow = (w: Stretch<number>): PlanWindow => ({
    from: w.from,
    to: w.to,
    all: w.free.length === total,
    free: w.free.map((id) => nameOf.get(id)!),
    cant: answered.filter((m) => !w.free.includes(m.id)).map((m) => m.name),
    youCant: busy.has(viewer.id) && !w.free.includes(viewer.id),
  });
  const { rows, hidden } = shownWindows(windows, total);
  const others = freeTimes(
    plan.range,
    ids.filter((id) => id !== viewer.id),
    busy,
  );

  let set: PlanView["set"] = null;
  let changed: PlanView["changed"] = null;
  if (plan.set) {
    const { start, end } = plan.set;
    const can = (m: Member) => freeDuring(busy.get(m.id)!, start, end);
    set = {
      free: answered.filter(can),
      busy: answered.filter((m) => !can(m)),
      unknown: members.filter((m) => !busy.has(m.id)),
    };
    if (viewer.id === ownerId && set.busy.length) {
      const since = plan.reviewedAt && plan.reviewedAt > plan.set.at ? plan.reviewedAt : plan.set.at;
      const late = new Set(
        (db.prepare("SELECT member_id FROM plan_answers WHERE plan_id = ? AND updated_at > ?").all(plan.id, since) as { member_id: number }[]).map(
          (r) => r.member_id,
        ),
      );
      const names = set.busy.filter((m) => late.has(m.id)).map((m) => m.name);
      // (the next best: of the windows with the most free, the one starting nearest the set time)
      const most = windows.filter((w) => w.free.length === windows[0]?.free.length);
      const near = most.sort((x, y) => Math.abs(x.from - start) - Math.abs(y.from - start))[0];
      const best = near && near.from !== start ? toWindow(near) : null;
      if (names.length) changed = { names, best };
    }
  }

  return {
    plan,
    owner: members.find((m) => m.id === ownerId)?.name ?? "The owner",
    answered,
    waiting: members.filter((m) => !busy.has(m.id)),
    everyoneIn,
    mine: busy.get(viewer.id) ?? null,
    heat: segments.map((s) => ({ from: s.from, to: s.to, free: s.free.length })),
    others: others.segments.map((s) => ({ from: s.from, to: s.to, free: s.free.length })),
    othersAnswered: others.answered.length,
    windows: rows.map(toWindow),
    hiddenWindows: hidden,
    rest: windows.filter((w) => !rows.includes(w)).slice(0, 8).map(toWindow),
    longestShort: windows.length ? 0 : Math.max(0, ...shorter.map((w) => w.to - w.from)),
    // (shorter is sorted most free, then longest, then earliest)
    allFree:
      windows.length && !windows.some((w) => w.free.length === total)
        ? (shorter.filter((w) => w.free.length === total).map(({ from, to }) => ({ from, to }))[0] ?? null)
        : null,
    set,
    changed,
  };
}
