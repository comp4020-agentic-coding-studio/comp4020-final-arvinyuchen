import { KIND_LABEL } from "./catalogue";
import { listPlaces, listVectors, saveVector, type Place, type PlaceVector } from "./db";
import { canEmbed, embed, EMBEDDING_MODEL } from "./embed";
import { anchorsFrom, cosine, distanceKm, forMeaning, keywords, NEAR_KM, parseQuery } from "./query";
import { cardText, MAX_RESULTS, rankByMeaning, stem } from "./rank";

export { cardText };

// Search the shared places by describing what you're after. Every card is a
// vector (its name, kind, suburb and the reason someone gave for it); the
// prompt becomes one too, and the cards closest in meaning come back, best
// first. The answer is only ever cards: no text is generated.
//
// Where is filtered strictly ("near Dickson" = within NEAR_KM), because a
// vector only knows that a card *mentions* Dickson. A kind the prompt asks
// for nudges the ranking but never hides a card.

export interface SearchResult {
  places: Place[];
  /** "meaning" with vectors, "words" when Voyage isn't available, "where" for a prompt that only names a place. */
  by: "meaning" | "words" | "where";
  near: string | null;
}

// ---- the index -------------------------------------------------------------

let vectors: Map<number, PlaceVector> | null = null;
let indexing: Promise<boolean> | null = null;

/**
 * Makes sure every place has a vector for its current card text. Only new or
 * changed cards go to Voyage, in batches. True when every card has one.
 */
export function indexPlaces(places: Place[] = listPlaces()): Promise<boolean> {
  if (!canEmbed()) return Promise.resolve(false);
  // One run at a time; a call during a run waits for it, then checks again.
  const run = (indexing ?? Promise.resolve(true)).then(async () => {
    vectors ??= listVectors(EMBEDDING_MODEL);
    const stale = places.filter((p) => vectors!.get(p.id)?.text !== cardText(p));
    if (stale.length === 0) return true;
    // (a hundred or so at a time, each request well inside Voyage's limits
    // and its timeout; what's done is kept if a later one fails)
    for (let at = 0; at < stale.length; at += 128) {
      const batch = stale.slice(at, at + 128);
      const texts = batch.map(cardText);
      const made = await embed(texts, "document");
      if (!made) return false;
      batch.forEach((p, i) => {
        saveVector(p.id, EMBEDDING_MODEL, texts[i], made[i]);
        vectors!.set(p.id, { text: texts[i], vec: made[i] });
      });
    }
    return true;
  });
  indexing = run.catch(() => false);
  return run;
}

// Prompts repeat (and a live refresh re-runs the same one), so their vectors
// are kept for a while rather than asked for again.
const queryVectors = new Map<string, Float32Array>();
async function queryVector(text: string): Promise<Float32Array | null> {
  const key = text.toLowerCase().trim();
  const hit = queryVectors.get(key);
  if (hit) return hit;
  const made = (await embed([text], "query"))?.[0] ?? null;
  if (made) {
    queryVectors.set(key, made);
    if (queryVectors.size > 500) queryVectors.delete(queryVectors.keys().next().value!);
  }
  return made;
}

// ---- searching ---------------------------------------------------------------

export async function search(prompt: string, places: Place[]): Promise<SearchResult> {
  const parsed = parseQuery(prompt, anchorsFrom(places));
  const near = parsed.near;
  const pool = near
    ? places.filter((p) => p.lat !== null && p.lon !== null && distanceKm(near, { lat: p.lat, lon: p.lon }) <= NEAR_KM)
    : places;
  const nearLabel = near?.name ?? null;

  // Only a where ("somewhere near ANU"): everything there, nearest first.
  if (near && keywords(parsed.rest).length === 0) {
    const d = (p: Place) => distanceKm(near, { lat: p.lat!, lon: p.lon! });
    return { places: [...pool].sort((a, b) => d(a) - d(b)), by: "where", near: nearLabel };
  }

  const ready = await indexPlaces(places);
  const asked = ready ? await queryVector(forMeaning(parsed) || prompt) : null;
  if (asked && vectors) {
    // Scored across every place, so the baseline doesn't shift with "near".
    const meant = new Map(places.map((p) => [p.id, vectors!.has(p.id) ? cosine(asked, vectors!.get(p.id)!.vec) : 0]));
    return { places: rankByMeaning(parsed, places, pool, meant), by: "meaning", near: nearLabel };
  }
  return { places: byWords(parsed.rest || prompt, pool, parsed.kind), by: "words", near: nearLabel };
}

/** Matching words, for when there are no vectors: name counts most, then suburb and kind, then the reason. */
function byWords(text: string, pool: Place[], kind: Place["kind"] | null): Place[] {
  const wanted = keywords(text).map(stem);
  if (wanted.length === 0) return [];
  const hits = (field: string, w: string) => keywords(field).some((f) => stem(f) === w || (w.length >= 4 && stem(f).startsWith(w)));
  return pool
    .map((p) => {
      let score = 0;
      for (const w of wanted) {
        if (hits(p.name, w)) score += 3;
        if (hits(p.area, w) || hits(KIND_LABEL[p.kind], w)) score += 2;
        if (hits(p.why, w)) score += 1;
      }
      return { p, score: score > 0 && kind === p.kind ? score + 1 : score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map((s) => s.p);
}


// Vectors for any place that doesn't have one yet, as soon as the server is up.
void indexPlaces();
