import { describe, expect, it } from "vitest";
import { freeTimes, mergeIntervals, parseInterval, shownWindows, snapTo, startsIn, type Interval } from "../src/lib/free";

// Who's free when, worked out from when each person is busy (src/lib/free.ts),
// on its own: no app, no database.
const day = { start: 480, end: 1380 }; // 8am to 11pm
const busy = (text: string): Interval[] => (text ? text.split(",").map((s) => parseInterval(s)!) : []);
const answers = (who: Record<string, string>) => new Map(Object.entries(who).map(([m, b]) => [m, busy(b)]));
const people = ["Arvin", "Mia", "Leo", "Zoe", "Sam"];
const spans = (ws: { from: number; to: number }[]) => ws.map((w) => `${w.from}-${w.to}`);

describe("free times", () => {
  it("finds where everyone's free, longest first, to the five minutes", () => {
    const { windows, answered } = freeTimes(day, people, answers({
      Arvin: "545-620",
      Mia: "480-590,1090-1240",
      Leo: "690-855",
      Zoe: "",
      Sam: "720-820,1000-1165",
    }));
    expect(answered).toEqual(people);
    const everyone = windows.filter((w) => w.free.length === 5);
    // 2:15–4:40pm, 8:40–11pm, 10:20–11:30am
    expect(spans(everyone)).toEqual(["855-1000", "1240-1380", "620-690"]);
    // fewer people, but longer: 2:15–6:10pm without Sam
    expect(windows.find((w) => w.from === 855 && w.to === 1090)?.free).toEqual(["Arvin", "Mia", "Leo", "Zoe"]);
  });

  it("keeps short windows when the plan is short, and shows a longer one with fewer beside them", () => {
    const { windows } = freeTimes(day, people, answers({
      Arvin: "745-1080",
      Mia: "540-730,1110-1380",
      Leo: "480-600,900-1020",
      Zoe: "1140-1260",
      Sam: "",
    }));
    // all five only from 6 to 6:30pm and 12:10 to 12:25pm
    expect(spans(windows.slice(0, 2))).toEqual(["1080-1110", "730-745"]);
    const { rows, hidden } = shownWindows(windows, 5);
    // the two, then 12:10–3pm (all but Arvin), the longest of four
    expect(spans(rows)).toEqual(["1080-1110", "730-745", "730-900"]);
    expect(rows[2].free).toEqual(["Mia", "Leo", "Zoe", "Sam"]);
    expect(hidden).toBe(windows.length - 3);
  });

  it("needs two people free for a window", () => {
    const { windows, segments } = freeTimes(day, people, answers({
      Arvin: "660-1380",
      Mia: "480-660,840-1380",
      Leo: "480-840,1020-1380",
      Zoe: "480-1020,1200-1380",
      Sam: "480-1200",
    }));
    expect(windows).toEqual([]);
    expect(Math.max(...segments.map((s) => s.free.length))).toBe(1);
  });

  it("counts only who has answered, and someone free all day is free throughout", () => {
    const { answered, windows } = freeTimes(day, people, answers({ Arvin: "545-620", Zoe: "" }));
    expect(answered).toEqual(["Arvin", "Zoe"]);
    expect(spans(windows)).toEqual(["620-1380", "480-545"]);
    expect(windows[0].free).toEqual(["Arvin", "Zoe"]);
  });

  it("leaves out windows shorter than the plan takes, longer ones with fewer too", () => {
    const busyDay = answers({
      Arvin: "745-1080",
      Mia: "540-730,1110-1380",
      Leo: "480-600,900-1020",
      Zoe: "1140-1260",
      Sam: "",
    });
    // all five are free together only 15 and 30 minutes: an hour leaves them out
    const hour = freeTimes(day, people, busyDay, 60);
    expect(spans(hour.windows.slice(0, 3))).toEqual(["730-900", "600-745", "1260-1380"]);
    expect(spans(hour.shorter.filter((w) => w.free.length === 5))).toEqual(["1080-1110", "730-745"]);
    // three hours: four of you never are, so three, longest first (Leo, Zoe
    // and Sam 10am–3pm among them, missed before #211), then two
    const three = freeTimes(day, people, busyDay, 180);
    expect(spans(three.windows)).toEqual(["730-1110", "600-900", "1080-1380", "480-745", "480-1140", "1020-1380"]);
    expect(three.windows.find((w) => w.from === 600)?.free).toEqual(["Leo", "Zoe", "Sam"]);
    expect(spans(shownWindows(three.windows, 5).rows)).toEqual(["730-1110", "600-900"]);
    // nothing that long at all
    const day15 = freeTimes(day, people, busyDay, 15 * 60);
    expect(day15.windows).toEqual([]);
    expect(day15.shorter.length).toBeGreaterThan(0);
  });

  it("works to the minute", () => {
    const { windows } = freeTimes(day, people.slice(0, 3), answers({
      Arvin: "547-621",
      Mia: "480-603,1087-1243",
      Leo: "691-853",
    }));
    // 2:13–6:07pm, 8:43–11pm and 10:21–11:31am, everyone free
    expect(spans(windows.filter((w) => w.free.length === 3))).toEqual(["853-1087", "1243-1380", "621-691"]);
    // 8–9:07am: Arvin and Leo, but not Mia
    expect(windows.find((w) => w.from === 480 && w.to === 547)?.free).toEqual(["Arvin", "Leo"]);
  });

  it("ignores busy times outside the day it counts", () => {
    const { windows } = freeTimes(day, ["A", "B"], answers({ A: "0-480,1380-1440", B: "" }));
    expect(spans(windows)).toEqual(["480-1380"]);
  });
});

describe("busy times as they come in", () => {
  it("are whole minutes inside the day", () => {
    expect(parseInterval("540-620")).toEqual([540, 620]);
    expect(parseInterval("541-622")).toEqual([541, 622]);
    expect(parseInterval("541.5-622")).toBeNull();
    expect(parseInterval("620-540")).toBeNull();
    expect(parseInterval("0-1445")).toBeNull();
    expect(parseInterval("nine-ten")).toBeNull();
  });

  it("merge where they overlap or touch, and clip to the day", () => {
    expect(mergeIntervals([[600, 660], [540, 610], [660, 700], [900, 960]])).toEqual([[540, 700], [900, 960]]);
    expect(mergeIntervals([[300, 500], [1300, 1440]], day)).toEqual([[480, 500], [1300, 1380]]);
  });

  it("land on 5 minutes from the plan's start when dragged, inside its hours", () => {
    // 8am to 11pm: 10:07 is nearest 10:05, 10:08 nearest 10:10
    expect(snapTo(607, 480, 1380)).toBe(605);
    expect(snapTo(608, 480, 1380)).toBe(610);
    // counted from an odd start: 8:07am, so 8:12, 8:17...
    expect(snapTo(500, 487, 1380)).toBe(502);
    // never outside the hours
    expect(snapTo(470, 480, 1380)).toBe(480);
    expect(snapTo(1400, 480, 1380)).toBe(1380);
    // an end off the 5s can still be reached
    expect(snapTo(1379, 487, 1379)).toBe(1379);
    expect(snapTo(1375, 487, 1379)).toBe(1377);
  });

  it("offer a window's start, then its :00s and :30s", () => {
    expect(startsIn({ from: 855, to: 1000 })).toEqual([855, 870, 900, 930]);
    expect(startsIn({ from: 1080, to: 1110 })).toEqual([1080]);
    expect(startsIn({ from: 730, to: 745 })).toEqual([730]);
    // only starts that leave the plan's length before the window ends
    expect(startsIn({ from: 855, to: 1000 }, 120)).toEqual([855, 870]);
    expect(startsIn({ from: 853, to: 973 }, 120)).toEqual([853]);
  });
});

// The same, checked against a count anyone can follow: on thousands of
// random days, who's free is counted minute by minute, and the windows are
// every stretch that can't grow a minute either way with the same people
// all free through it, for every set of two or more of them. Days are drawn
// from a fixed seed, so a failure is the same every run; busy times land
// mostly on the quarter hour, so they touch, overlap and tie often, and
// some spill past the day or come from someone who hasn't answered.
describe("free times, against a minute-by-minute count", () => {
  let seed = 4020;
  const rand = () => {
    // (mulberry32)
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const minute = (lo: number, hi: number) => (rand() < 0.8 ? Math.round(int(lo, hi) / 15) * 15 : int(lo, hi));

  function randomDay() {
    const start = minute(360, 720);
    const range = { start, end: Math.min(1440, start + minute(120, 900)) };
    const members = ["A", "B", "C", "D", "E", "F"].slice(0, int(1, 6));
    const answers = new Map<string, Interval[]>();
    for (const m of members) {
      if (rand() < 0.15) continue;
      const list: Interval[] = [];
      for (let k = int(0, 4); k > 0; k--) {
        const a = Math.max(0, minute(range.start - 60, range.end + 30));
        const b = Math.min(1440, a + Math.max(1, minute(5, 240)));
        if (a < b) list.push([a, b]);
      }
      answers.set(m, list);
    }
    return { range, members, answers, length: [1, 15, 30, 60, 90, 120, 180][int(0, 6)] };
  }

  function counted({ range, members, answers, length }: ReturnType<typeof randomDay>) {
    const answered = members.filter((m) => answers.has(m));
    // who's free in each minute, one bit a person
    const freeIn: number[] = [];
    for (let t = range.start; t < range.end; t++)
      freeIn[t] = answered.reduce((bits, m, i) => (answers.get(m)!.some(([a, b]) => a <= t && t < b) ? bits : bits | (1 << i)), 0);
    const has = (t: number, set: number) => (freeIn[t] & set) === set;
    const need = Math.min(2, answered.length);
    const found = new Map<string, { from: number; to: number; free: string[] }>();
    for (let set = 1; set < 1 << answered.length; set++) {
      if (answered.filter((_, i) => set & (1 << i)).length < need) continue;
      for (let t = range.start; t < range.end; t++) {
        if (!has(t, set) || (t > range.start && has(t - 1, set))) continue;
        let to = t;
        let all = -1;
        while (to < range.end && has(to, set)) all &= freeIn[to++];
        found.set(`${t}-${to}`, { from: t, to, free: answered.filter((_, i) => all & (1 << i)) });
      }
    }
    const all = [...found.values()].sort(
      (x, y) => y.free.length - x.free.length || y.to - y.from - (x.to - x.from) || x.from - y.from,
    );
    return {
      windows: all.filter((w) => w.to - w.from >= length),
      shorter: all.filter((w) => w.to - w.from < length),
    };
  }

  it("finds the same windows, with the same people, in the same order, on 3000 random days", () => {
    let windows = 0;
    for (let n = 0; n < 3000; n++) {
      const d = randomDay();
      const got = freeTimes(d.range, d.members, d.answers, d.length);
      const want = counted(d);
      const show = (ws: { from: number; to: number; free: string[] }[]) => ws.map((w) => `${w.from}-${w.to} ${w.free.join("")}`);
      const why = `day ${n}: ${JSON.stringify({ ...d, answers: Object.fromEntries(d.answers) })}`;
      expect(show(got.windows), why).toEqual(show(want.windows));
      expect(show(got.shorter), why).toEqual(show(want.shorter));
      windows += want.windows.length;
    }
    expect(windows, "the random days have windows to compare").toBeGreaterThan(3000);
  });
});
