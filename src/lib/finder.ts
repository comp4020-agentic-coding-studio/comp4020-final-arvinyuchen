import type { Kind } from "./kinds";

// Find, for sharing a place: what someone types matched against a list of
// places with a name and a suburb. Forgiving the way a person types a name
// they half remember: "Lonsdale Street Roasters" finds "Lonsdale St
// Roasters", "Highroad" finds "High Road", and "Kingpin bowling" finds
// "Kingpin", since a word like bowling, cafe or bar says what a place is,
// not what it's called.

export interface Candidate {
  /** "overture/<id>", or OpenStreetMap's "node/<id>", "way/<id>", "relation/<id>" */
  ref: string;
  name: string;
  kind: Kind;
  area: string;
  address: string;
  lat: number;
  lon: number;
}

// (a word's short forms, to match either way)
const SAME: Record<string, string> = {
  st: "street",
  rd: "road",
  ave: "avenue",
  av: "avenue",
  mt: "mount",
  cres: "crescent",
  pl: "place",
  ln: "lane",
  dr: "drive",
  cct: "circuit",
  nat: "national",
  intl: "international",
  "n": "and",
};

// Words that say what a place is, or where, more than which one.
const GENERIC = new Set(
  "the a an and of at in on by near canberra act cafe café coffee restaurant bar pub bowling bistro kitchen eatery shop house club place".split(
    " ",
  ),
);

export const words = (text: string): string[] =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => SAME[w] ?? w);

const trigrams = (s: string) => {
  const padded = `  ${s} `;
  const set = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
  return set;
};
const similar = (a: string, b: string) => {
  const ta = trigrams(a);
  const tb = trigrams(b);
  let both = 0;
  for (const t of ta) if (tb.has(t)) both++;
  return both / (ta.size + tb.size - both);
};

/** How well a place's name (and suburb) answers what was typed: 0 for not at all. */
export function score(typed: string, name: string, area = ""): number {
  const asked = words(typed);
  if (!asked.length) return 0;
  const called = words(name);
  const where = words(area);
  const joinedAsked = asked.join("");
  const joinedCalled = called.join("");
  if (joinedAsked === joinedCalled) return 100;
  // the name, run together, as all or the start of what was typed, or the
  // other way round ("highroad" and "high road"; "kingpin bowling")
  if (joinedCalled.length >= 4 && joinedAsked.length >= 4 && (joinedAsked.startsWith(joinedCalled) || joinedCalled.startsWith(joinedAsked)))
    return 85 - Math.min(20, Math.abs(joinedAsked.length - joinedCalled.length));
  // word by word: each word typed is (the start of) a word of the name or
  // its suburb; the ones that only say what kind of place it is may miss
  const own = asked.filter((w) => !GENERIC.has(w));
  const matches = (w: string, pool: string[]) => pool.some((c) => c === w || (w.length >= 3 && c.startsWith(w)));
  const inName = own.filter((w) => matches(w, called));
  const inArea = own.filter((w) => !matches(w, called) && matches(w, where));
  if (own.length && inName.length && inName.length + inArea.length === own.length)
    return 60 + 20 * (inName.length / Math.max(own.length, called.length)) - (inArea.length ? 5 : 0);
  // or close in spelling, for a typo
  const calledOwn = called.filter((w) => !GENERIC.has(w));
  const close = similar(own.join(" ") || joinedAsked, (calledOwn.length ? calledOwn : called).join(" "));
  return close >= 0.45 ? 40 * close : 0;
}

/** The best few of these places for what was typed, best first. */
export function best<T extends { name: string; area: string }>(typed: string, places: T[], limit = 6): (T & { score: number })[] {
  return places
    .map((p) => ({ ...p, score: score(typed, p.name, p.area) }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length)
    .slice(0, limit);
}

const metres = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot((a.lat - b.lat) * 111_000, (a.lon - b.lon) * 111_000 * Math.cos((a.lat * Math.PI) / 180));

/** Finds as one list, in order: one place found twice (the same name within
 *  150 m) is listed once, as it was first found, but with Overture's kind
 *  where Overture found it too, its taxonomy being the finer. */
export function merge(...lists: Candidate[][]): Candidate[] {
  const out: Candidate[] = [];
  for (const c of lists.flat()) {
    const key = words(c.name).join("");
    const same = out.find((o) => words(o.name).join("") === key && metres(o, c) < 150);
    if (!same) out.push({ ...c });
    else if (c.ref.startsWith("overture/") && !same.ref.startsWith("overture/")) same.kind = c.kind;
  }
  return out;
}
