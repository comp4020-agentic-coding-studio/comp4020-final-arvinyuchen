import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Kind } from "../src/lib/kinds";
import { anchorsFrom, cosine, distanceKm, keywords, NEAR_KM, parseQuery } from "../src/lib/query";
import { rankByMeaning } from "../src/lib/rank";

// How good search is, measured: 49 prompts people might type, each labelled
// with the starter places that answer it (`great`, or `fits`) or with none,
// by two labellers working apart and adjudicated (spec/search-eval/README.md).
// Each is in one half: search may be tuned on `dev`, and `test` says whether
// that tuning holds on prompts it never looked at.
// Search ranks them with src/lib/rank.ts on vectors frozen by
// scripts/build-search-eval.ts, so this needs no key and no network.
//
// It reports, and holds the line at what was measured:
// - found: an answerable prompt gets at least one right card in its top 5;
// - first: its first card is right;
// - precision: of its top 5 cards, how many are right;
// - nothing: a prompt no place answers gets no cards at all.

type Label = { text: string; great: string[]; fits: string[]; half: "dev" | "test" };
type Frozen = {
  model: string;
  places: { key: string; name: string; kind: Kind; area: string; why: string; lat: number; lon: number; vec: string }[];
  prompts: Record<string, string>;
};
const read = <T>(name: string) => JSON.parse(readFileSync(new URL(`search-eval/${name}`, import.meta.url), "utf8")) as T;
const labels = read<{ prompts: Label[] }>("labels.json").prompts;
const frozen = read<Frozen>("vectors.json");
const vec = (b64: string) => {
  const bytes = Buffer.from(b64, "base64");
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
};

const places = frozen.places.map((p, i) => ({ ...p, id: i + 1, v: vec(p.vec) }));
const anchors = anchorsFrom(places);

function answer(text: string, asked = vec(frozen.prompts[text])) {
  const parsed = parseQuery(text, anchors);
  const near = parsed.near;
  const pool = near ? places.filter((p) => distanceKm(near, { lat: p.lat, lon: p.lon }) <= NEAR_KM) : places;
  // (only a where, as search.ts answers it: everything there, nearest first)
  if (near && keywords(parsed.rest).length === 0)
    return [...pool].sort((a, b) => distanceKm(near, a) - distanceKm(near, b)).map((p) => p.key);
  const meant = new Map(places.map((p) => [p.id, cosine(asked, p.v)]));
  return rankByMeaning(parsed, places, pool, meant).map((p) => p.key);
}

const results = labels.map((l) => {
  const got = answer(l.text);
  const right = new Set([...l.great, ...l.fits]);
  const top = got.slice(0, 5);
  return {
    text: l.text,
    half: l.half,
    answerable: right.size > 0,
    got,
    found: top.some((k) => right.has(k)),
    first: got.length > 0 && right.has(got[0]),
    precision: top.length ? top.filter((k) => right.has(k)).length / top.length : 0,
  };
});
const share = (n: number, of: number) => (of ? n / of : 1);
function scored(of: typeof results) {
  const answerable = of.filter((r) => r.answerable);
  const none = of.filter((r) => !r.answerable);
  return {
    answerable: answerable.length,
    none: none.length,
    found: share(answerable.filter((r) => r.found).length, answerable.length),
    first: share(answerable.filter((r) => r.first).length, answerable.length),
    precision: share(answerable.reduce((sum, r) => sum + r.precision, 0), answerable.length),
    nothing: share(none.filter((r) => r.got.length === 0).length, none.length),
  };
}
const score = scored(results);

describe("search, measured on labelled prompts", () => {
  it("has a label and a frozen vector for every prompt", () => {
    expect(labels.length).toBeGreaterThanOrEqual(40);
    for (const l of labels) expect(["dev", "test"], l.text).toContain(l.half);
    for (const l of labels) expect(frozen.prompts[l.text], l.text).toBeTruthy();
    const keys = new Set(places.map((p) => p.key));
    for (const l of labels) for (const k of [...l.great, ...l.fits]) expect(keys.has(k), `${l.text}: ${k}`).toBe(true);
  });

  it("finds a right place for answerable prompts, and nothing for the rest", () => {
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    const line = (name: string, s: ReturnType<typeof scored>) =>
      `${name}: found in top 5 ${pct(s.found)}, first right ${pct(s.first)}, precision@5 ${pct(s.precision)}, nothing when nothing fits ${pct(s.nothing)}`;
    console.log(
      [
        `search eval (${frozen.model}): ${score.answerable} answerable, ${score.none} with no answer`,
        line("all", score),
        line("  dev", scored(results.filter((r) => r.half === "dev"))),
        line("  test", scored(results.filter((r) => r.half === "test"))),
        ...results.filter((r) => (r.answerable ? !r.found : r.got.length > 0)).map((r) => `  miss: "${r.text}" → ${r.got.slice(0, 5).join(", ") || "(nothing)"}`),
      ].join("\n"),
    );
    // The line held: what was measured on 2026-11-06 after tuning on dev
    // (38 of 41 found, 36 first right, precision 77%, 8 of 8 with nothing).
    // A change to search may raise these, and then raises the line; it may
    // not lower them.
    expect(score.found).toBeGreaterThanOrEqual(38 / 41);
    expect(score.first).toBeGreaterThanOrEqual(36 / 41);
    expect(score.precision).toBeGreaterThanOrEqual(0.76);
    expect(score.nothing).toBe(1);
  });
});

// Searching by a place's name (known-item search): each starter place's
// name, typed as it is, its query vector frozen by
// scripts/build-name-eval.ts. Right is that place (or one with the same
// name: a few have two).
const named = read<{ model: string; names: Record<string, string> }>("names.json");
const keysOf = new Map<string, Set<string>>();
for (const p of places) keysOf.set(p.name, (keysOf.get(p.name) ?? new Set()).add(p.key));
const lookedUp = Object.entries(named.names).map(([name, v]) => {
  const got = answer(name, vec(v));
  return { name, got, at: got.findIndex((k) => keysOf.get(name)!.has(k)) };
});

describe("search, measured on every place's name", () => {
  it("has a name vector for every place, from the same model", () => {
    expect(named.model).toBe(frozen.model);
    expect(Object.keys(named.names).sort()).toEqual([...keysOf.keys()].sort());
  });

  it("puts the place named first", () => {
    const n = lookedUp.length;
    const at1 = lookedUp.filter((r) => r.at === 0).length;
    const at5 = lookedUp.filter((r) => r.at >= 0 && r.at < 5).length;
    const mrr = lookedUp.reduce((sum, r) => sum + (r.at >= 0 ? 1 / (r.at + 1) : 0), 0) / n;
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
    console.log(
      [
        `name search (${named.model}): ${n} names, Success@1 ${at1}/${n} (${pct(at1 / n)}), Success@5 ${at5}/${n} (${pct(at5 / n)}), MRR ${mrr.toFixed(3)}`,
        ...lookedUp
          .filter((r) => r.at !== 0)
          .map((r) => `  miss: "${r.name}" → ${r.at < 0 ? "not found" : `#${r.at + 1}`}, first ${r.got[0] ?? "(nothing)"}`),
      ].join("\n"),
    );
    // The line held: what was measured on 2026-11-07 (#207), counting only
    // the place itself right, so a sibling with another name ("Eighty/Twenty"
    // for "Eighty Twenty") is a miss: 651 of 697 first, 687 in the top 5.
    expect(at1).toBeGreaterThanOrEqual(651);
    expect(at5).toBeGreaterThanOrEqual(687);
    expect(mrr).toBeGreaterThanOrEqual(0.95);
  });
});
