import { KIND_LABEL } from "./catalogue";
import type { Place } from "./db";
import { forMeaning, keywords, type ParsedQuery } from "./query";

// Ranking by meaning, given each place's similarity to the prompt: which
// cards come back, best first, and when the answer is nothing. Pure (no
// database, no Voyage), so the search evaluation (spec/search-eval.test.ts)
// runs it on fixed vectors; src/lib/search.ts gets the vectors and calls it.

// Tuned on voyage-4-lite with real prompts (see PROCESS.md): its scores are
// low and bunched, and each prompt has its own baseline, so a card is judged
// against the prompt's own spread, from its median card up to its best.
/** If even the best card scores below this, nothing fits the prompt. */
const FLOOR = 0.18;
/** How far up from the median towards the best a card must reach. */
const REACH = 0.6;
/**
 * Below this lift (best over median), a prompt with a word no card uses
 * ("Ethiopian food", "snorkelling") is asking for something no place
 * has: its weak best matches are only near it in meaning, so it's answered
 * with nothing. Prompts the places do answer lift well over it (PROCESS.md);
 * 0.26 became 0.32 on the search evaluation's dev half, for "skydiving"
 * (0.30, trampolines), with "ice hockey" (0.35, the ice rink) still over it.
 */
const UNHEARD_LIFT = 0.32;
const KIND_NUDGE = 0.02;
export const MAX_RESULTS = 8;

/** What a card says, as one line of text to embed. */
export const cardText = (p: Pick<Place, "name" | "kind" | "area" | "why">) =>
  `${p.name}. ${KIND_LABEL[p.kind]}${p.area ? ` in ${p.area}` : ""}, Canberra. ${p.why}`;

/**
 * The cards for a prompt: `meant` is each place's cosine similarity to it
 * (every place, so the baseline doesn't shift with "near"), `pool` the
 * places it may answer with (all, or those near where it names).
 */
export function rankByMeaning<P extends Pick<Place, "id" | "name" | "kind" | "area" | "why">>(
  parsed: ParsedQuery,
  places: P[],
  pool: P[],
  meant: Map<number, number>,
): P[] {
  const scores = new Map(places.map((p) => [p.id, meant.get(p.id)! + (parsed.kind === p.kind ? KIND_NUDGE : 0)]));
  const all = [...scores.values()].sort((a, b) => b - a);
  const median = all[Math.floor(all.length / 2)] ?? 0;
  const best = Math.max(0, ...pool.map((p) => scores.get(p.id)!));
  const bar = Math.max(FLOOR, median + REACH * (all[0] - median));
  // (how far the best stands out on meaning alone, before the kind's nudge)
  const plain = [...meant.values()].sort((a, b) => b - a);
  const lift = plain[0] - plain[Math.floor(plain.length / 2)];
  if (best < FLOOR || (lift < UNHEARD_LIFT && unheard(forMeaning(parsed), places))) return [];
  return pool
    .filter((p) => scores.get(p.id)! >= Math.min(bar, best))
    .sort((a, b) => scores.get(b.id)! - scores.get(a.id)!)
    .slice(0, MAX_RESULTS);
}

/** Whether the prompt has a word (four letters or more) that no place's card uses. */
function unheard(text: string, places: Pick<Place, "name" | "kind" | "area" | "why">[]): boolean {
  const words = keywords(text).filter((w) => w.length >= 4).map(stem);
  if (words.length === 0) return false;
  const known = new Set(places.flatMap((p) => keywords(cardText(p)).map(stem)));
  // (a word heard as the start of a longer one counts: "climb" in "climbing")
  return words.some((w) => !known.has(w) && ![...known].some((k) => k.length >= 4 && (k.startsWith(w) || w.startsWith(k))));
}

export const stem = (w: string) => (w.length > 4 ? w.replace(/(ies|es|s)$/, "") : w);
