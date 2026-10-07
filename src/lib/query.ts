import type { Kind } from "./catalogue";

// Reading a search prompt like "cheap dumplings near Dickson for a rainy
// night". Meaning is the embeddings' job (src/lib/search.ts); this file only
// pulls out what a vector can't be trusted with: *where*. "near Dickson" has
// to mean within walking-ish distance of Dickson, not "places whose text
// mentions Dickson". Pure functions, so they're tested on their own.

export interface Anchor {
  /** Lowercase, what a prompt is matched against. */
  label: string;
  /** How to show it. */
  name: string;
  lat: number;
  lon: number;
}

export interface ParsedQuery {
  /** What's left to match on meaning, with the "near X" phrase taken out. */
  rest: string;
  near: Anchor | null;
  /** A kind the prompt clearly asks for, or null when it names none or several. */
  kind: Kind | null;
}

/** How far "near X" reaches. Canberra suburbs are about two kilometres across. */
export const NEAR_KM = 3;

// Places people say "near" that aren't a suburb or a shared place.
const LANDMARKS: Anchor[] = [
  { label: "anu", name: "ANU", lat: -35.2777, lon: 149.1185 },
  { label: "campus", name: "ANU", lat: -35.2777, lon: 149.1185 },
  { label: "uni", name: "ANU", lat: -35.2777, lon: 149.1185 },
  { label: "civic", name: "Civic", lat: -35.2809, lon: 149.13 },
  { label: "the city", name: "the city", lat: -35.2809, lon: 149.13 },
];

const NEAR_WORDS = "near|around|in|by|close to|next to|walking distance (?:of|from)|at";

const KIND_WORDS: Record<Kind, string[]> = {
  food: ["food", "eat", "eats", "eating", "hungry", "restaurant", "restaurants", "cafe", "cafes", "café", "cafés", "coffee", "brunch", "breakfast", "lunch", "dinner", "dessert", "snack", "snacks"],
  fun: ["museum", "museums", "gallery", "galleries", "exhibition", "exhibits", "indoor", "indoors", "games", "show"],
  outdoors: ["outdoors", "outdoor", "outside", "hike", "hiking", "bushwalk", "nature", "park", "parks", "picnic", "garden", "gardens", "lookout", "view", "views"],
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Anchors from the shared places: each suburb (at the middle of its places)
 * and each located place by name, so "near Questacon" works as well as
 * "near Parkes".
 */
export function anchorsFrom(places: { name: string; area: string; lat: number | null; lon: number | null }[]): Anchor[] {
  const areas = new Map<string, { name: string; lat: number; lon: number; n: number }>();
  const named: Anchor[] = [];
  for (const p of places) {
    if (p.lat === null || p.lon === null) continue;
    named.push({ label: p.name.toLowerCase(), name: p.name, lat: p.lat, lon: p.lon });
    const key = p.area.trim().toLowerCase();
    if (!key) continue;
    const sum = areas.get(key) ?? { name: p.area.trim(), lat: 0, lon: 0, n: 0 };
    areas.set(key, { name: sum.name, lat: sum.lat + p.lat, lon: sum.lon + p.lon, n: sum.n + 1 });
  }
  const suburbs = [...areas].map(([label, s]) => ({ label, name: s.name, lat: s.lat / s.n, lon: s.lon / s.n }));
  return [...LANDMARKS, ...suburbs, ...named];
}

export function parseQuery(query: string, anchors: Anchor[]): ParsedQuery {
  const text = query.toLowerCase().replace(/\s+/g, " ").trim();
  let near: Anchor | null = null;
  let rest = text;
  // Longest label first, so "near the national museum" beats "near the city".
  for (const anchor of [...anchors].sort((a, b) => b.label.length - a.label.length)) {
    const match = text.match(new RegExp(`\\b(?:${NEAR_WORDS}) (?:the )?${escape(anchor.label)}(?![\\p{L}\\p{N}])`, "u"));
    if (match) {
      near = anchor;
      rest = (text.slice(0, match.index) + " " + text.slice((match.index ?? 0) + match[0].length)).replace(/\s+/g, " ").trim();
      break;
    }
  }
  const words = new Set(tokens(rest));
  const asked = (Object.keys(KIND_WORDS) as Kind[]).filter((k) => KIND_WORDS[k].some((w) => words.has(w)));
  return { rest, near, kind: asked.length === 1 ? asked[0] : null };
}

const STOP = new Set(
  "a an and any are at be best but by can for from get go good great have i in is it like me my near of on or place places put some somewhere something spot spots that the there this to want we where which with would you".split(" "),
);

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

/** The words worth matching on: lowercased, no stop words. */
export const keywords = (text: string): string[] => tokens(text).filter((w) => !STOP.has(w) && w.length > 1);

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}
