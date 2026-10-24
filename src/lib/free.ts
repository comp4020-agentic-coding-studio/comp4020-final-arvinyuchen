// When people are free together, from when each of them is busy. Pure: no
// database, so it's tested on its own (spec/free.test.ts).
//
// A day is minutes since local midnight (src/lib/when.ts). Everyone marks
// the stretches they're busy, to the minute; an empty list is "free all
// day", and no answer at all is "hasn't said", which counts neither way.
// The owner says up front how long the plan takes, and a window is only
// one if it's at least that long: a time it doesn't fit in isn't offered.

export type Interval = [from: number, to: number];

/** Times are kept to the minute. */
export const STEP = 1;

/** A plan counts times within this much of the day, at most. */
export const EARLIEST = 360;
export const LATEST = 1440;

/** Whether a stretch is whole minutes inside the day, start before end. */
export const isInterval = ([from, to]: Interval) =>
  Number.isInteger(from) && Number.isInteger(to) && from % STEP === 0 && to % STEP === 0 && 0 <= from && from < to && to <= 1440;

/** "540-620" as [540, 620], or null. */
export function parseInterval(text: string): Interval | null {
  const m = /^(\d{1,4})-(\d{1,4})$/.exec(text.trim());
  if (!m) return null;
  const span: Interval = [Number(m[1]), Number(m[2])];
  return isInterval(span) ? span : null;
}

/** Sorted, with overlapping or touching stretches made one (and clipped to `range`, if given). */
export function mergeIntervals(list: Interval[], range?: { start: number; end: number }): Interval[] {
  const clipped = list
    .map(([a, b]): Interval => (range ? [Math.max(a, range.start), Math.min(b, range.end)] : [a, b]))
    .filter(([a, b]) => a < b)
    .sort((x, y) => x[0] - y[0]);
  const out: Interval[] = [];
  for (const [a, b] of clipped) {
    const last = out.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Whether someone busy at `busy` is free for all of [from, to). */
export const freeDuring = (busy: Interval[], from: number, to: number) => !busy.some(([a, b]) => a < to && b > from);

export interface Stretch<Id> {
  from: number;
  to: number;
  /** who's free all through it, among those who answered */
  free: Id[];
}

/**
 * The day cut where anyone's busy time starts or ends, each piece with who's
 * free in it; then every window: for each set of people free together
 * somewhere, the longest runs where they all are, each with exactly who's
 * free all through it. Windows need two people free (a plan of one isn't a
 * plan) and to be at least `length` minutes long (how long the plan takes);
 * `shorter` counts the ones that would be windows but for that. Best
 * first: most people free, then the longest, then the earliest.
 */
export function freeTimes<Id>(
  range: { start: number; end: number },
  members: Id[],
  answers: Map<Id, Interval[]>,
  length = 1,
): { answered: Id[]; segments: Stretch<Id>[]; windows: Stretch<Id>[]; shorter: Stretch<Id>[] } {
  const answered = members.filter((m) => answers.has(m));
  const cuts = new Set([range.start, range.end]);
  for (const m of answered)
    for (const [a, b] of answers.get(m)!) {
      if (a > range.start && a < range.end) cuts.add(a);
      if (b > range.start && b < range.end) cuts.add(b);
    }
  const at = [...cuts].sort((x, y) => x - y);
  const segments = at.slice(0, -1).map((from, i) => ({
    from,
    to: at[i + 1],
    free: answered.filter((m) => freeDuring(answers.get(m)!, from, at[i + 1])),
  }));

  const groups = new Map<string, Id[]>();
  for (const s of segments) if (s.free.length) groups.set(s.free.map(String).join(), s.free);
  const found = new Map<string, Stretch<Id>>();
  for (const together of groups.values()) {
    let i = 0;
    while (i < segments.length) {
      if (!together.every((m) => segments[i].free.includes(m))) {
        i++;
        continue;
      }
      let j = i;
      while (j < segments.length && together.every((m) => segments[j].free.includes(m))) j++;
      const run = segments.slice(i, j);
      const free = answered.filter((m) => run.every((s) => s.free.includes(m)));
      found.set(`${run[0].from}-${run.at(-1)!.to}`, { from: run[0].from, to: run.at(-1)!.to, free });
      i = j;
    }
  }
  const need = Math.min(2, answered.length);
  const all = [...found.values()]
    .filter((w) => w.free.length >= need && w.free.length > 0)
    .sort((x, y) => y.free.length - x.free.length || y.to - y.from - (x.to - x.from) || x.from - y.from);
  const fits = (w: Stretch<Id>) => w.to - w.from >= length;
  return { answered, segments, windows: all.filter(fits), shorter: all.filter((w) => !fits(w)) };
}

/**
 * What the card lists: the best count's windows (two at most), then, from
 * fewer people (still more than half), only one longer than everything
 * above it, so a short window everyone fits sits beside a long one most
 * do. The rest are "N more".
 */
export function shownWindows<Id>(windows: Stretch<Id>[], answered: number, maxTop = 2, maxRows = 3) {
  if (windows.length === 0) return { rows: [] as Stretch<Id>[], hidden: 0 };
  const top = windows[0].free.length;
  const rows = windows.filter((w) => w.free.length === top).slice(0, maxTop);
  let longest = Math.max(...rows.map((w) => w.to - w.from));
  for (const w of windows) {
    if (rows.length >= maxRows) break;
    if (w.free.length < top && w.free.length > answered / 2 && w.to - w.from > longest) {
      rows.push(w);
      longest = w.to - w.from;
    }
  }
  return { rows, hidden: windows.length - rows.length };
}

/**
 * The times to offer as a window's start: its own start, then each :00 and
 * :30 in it that still leaves `length` minutes before it ends (four in all,
 * at most).
 */
export function startsIn(w: { from: number; to: number }, length = 1, max = 4): number[] {
  const starts = [w.from];
  for (let m = Math.floor(w.from / 30) * 30 + 30; m + length <= w.to && starts.length < max; m += 30) starts.push(m);
  return starts;
}
