import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Kind } from "../src/lib/kinds";
import { anchorsFrom, cosine, distanceKm, NEAR_KM, parseQuery } from "../src/lib/query";
import { rankByMeaning } from "../src/lib/rank";

// How good search is, measured: 49 prompts people might type, each labelled
// with the starter places that answer it (`great`, or `fits`) or with none,
// by two labellers working apart and adjudicated (spec/search-eval/README.md).
// Search ranks them with src/lib/rank.ts on vectors frozen by
// scripts/build-search-eval.ts, so this needs no key and no network.
//
// It reports, and holds the line at what was measured:
// - found: an answerable prompt gets at least one right card in its top 5;
// - first: its first card is right;
// - precision: of its top 5 cards, how many are right;
// - nothing: a prompt no place answers gets no cards at all.

type Label = { text: string; great: string[]; fits: string[] };
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

function answer(text: string) {
  const parsed = parseQuery(text, anchors);
  const near = parsed.near;
  const pool = near ? places.filter((p) => distanceKm(near, { lat: p.lat, lon: p.lon }) <= NEAR_KM) : places;
  const asked = vec(frozen.prompts[text]);
  const meant = new Map(places.map((p) => [p.id, cosine(asked, p.v)]));
  return rankByMeaning(parsed, places, pool, meant).map((p) => p.key);
}

const results = labels.map((l) => {
  const got = answer(l.text);
  const right = new Set([...l.great, ...l.fits]);
  const top = got.slice(0, 5);
  return {
    text: l.text,
    answerable: right.size > 0,
    got,
    found: top.some((k) => right.has(k)),
    first: got.length > 0 && right.has(got[0]),
    precision: top.length ? top.filter((k) => right.has(k)).length / top.length : 0,
  };
});
const answerable = results.filter((r) => r.answerable);
const none = results.filter((r) => !r.answerable);
const share = (n: number, of: number) => (of ? n / of : 1);
const score = {
  found: share(answerable.filter((r) => r.found).length, answerable.length),
  first: share(answerable.filter((r) => r.first).length, answerable.length),
  precision: share(answerable.reduce((sum, r) => sum + r.precision, 0), answerable.length),
  nothing: share(none.filter((r) => r.got.length === 0).length, none.length),
};

describe("search, measured on labelled prompts", () => {
  it("has a label and a frozen vector for every prompt", () => {
    expect(labels.length).toBeGreaterThanOrEqual(40);
    for (const l of labels) expect(frozen.prompts[l.text], l.text).toBeTruthy();
    const keys = new Set(places.map((p) => p.key));
    for (const l of labels) for (const k of [...l.great, ...l.fits]) expect(keys.has(k), `${l.text}: ${k}`).toBe(true);
  });

  it("finds a right place for answerable prompts, and nothing for the rest", () => {
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    console.log(
      [
        `search eval (${frozen.model}): ${answerable.length} answerable, ${none.length} with no answer`,
        `found in top 5 ${pct(score.found)}, first right ${pct(score.first)}, precision@5 ${pct(score.precision)}, nothing when nothing fits ${pct(score.nothing)}`,
        ...results.filter((r) => (r.answerable ? !r.found : r.got.length > 0)).map((r) => `  miss: "${r.text}" → ${r.got.slice(0, 5).join(", ") || "(nothing)"}`),
      ].join("\n"),
    );
    // The line held: what was measured on 2026-11-06 (37 of 41 found, 35
    // first right, precision 75%, 7 of 8 with nothing). A change to search
    // may raise these, and then raises the line; it may not lower them.
    expect(score.found).toBeGreaterThanOrEqual(37 / 41);
    expect(score.first).toBeGreaterThanOrEqual(35 / 41);
    expect(score.precision).toBeGreaterThanOrEqual(0.74);
    expect(score.nothing).toBeGreaterThanOrEqual(7 / 8);
  });
});
