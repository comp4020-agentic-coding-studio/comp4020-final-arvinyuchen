import type { APIRoute } from "astro";
import { photoOfRef } from "../../lib/db";
import { best, type Candidate, merge, score, words } from "../../lib/finder";
import type { Kind } from "../../lib/kinds";
import { LOCAL } from "../../lib/places-index";

// Finding a place to share, in Canberra, from two sources:
//
// 1. Overture Maps' places (src/data/places-index.json), searched here on the
//    server: Canberra's cafés, bars, restaurants and things to do, many of
//    them missing from OpenStreetMap.
// 2. OpenStreetMap, through Photon (komoot's search over it), which forgives
//    a half-remembered name; asked again without words like "cafe" or
//    "bowling" when the whole of it finds nothing.
//
// The two are ranked together by how well each name answers what was
// typed, and merged, one place listed once: as OpenStreetMap has it, where
// both do. Neither says whether a place is good: nothing found here enters
// Explore until a person shares it with a reason. A find already shared
// comes with the photo it was shared with, if it has one.
//
// The browser asks only when someone presses Find, never as they type, with
// the app's User-Agent, and answers are cached for a day.
const USER_AGENT = "Spots/1.0 (https://comp4020-final-arvinyuchen.fly.dev; COMP4020 student project)";
const cache = new Map<string, { at: number; results: unknown[] }>();
const BOX = "148.76,-35.92,149.40,-35.12";

// A first guess at the kind from what OpenStreetMap calls the place; the
// person sharing it can change it before they do.
const FOOD = new Set(["restaurant", "fast_food", "food_court"]);
const COFFEE = new Set(["cafe", "ice_cream", "bakery", "pastry", "confectionery", "tea"]);
const DRINKS = new Set(["bar", "pub", "biergarten", "nightclub", "brewery", "wine_bar"]);
const OUTDOORS = new Set(["park", "nature_reserve", "garden", "viewpoint", "peak", "beach", "picnic_site", "wood", "water", "national_park"]);
const CULTURE = new Set(["museum", "gallery", "arts_centre", "theatre", "artwork", "library", "memorial", "monument", "planetarium"]);
const kindOf = (value: string, key: string): Kind =>
  FOOD.has(value)
    ? "food"
    : COFFEE.has(value)
      ? "coffee"
      : DRINKS.has(value)
        ? "drinks"
        : OUTDOORS.has(value) || key === "natural"
          ? "outdoors"
          : CULTURE.has(value)
            ? "culture"
            : "fun";
// (the kinds of OpenStreetMap thing that can be a place to go: not a road,
// a suburb or a bus stop)
const PLACES = new Set(["amenity", "leisure", "tourism", "historic", "natural", "shop", "craft"]);

interface Feature {
  properties: {
    osm_type: "N" | "W" | "R";
    osm_id: number;
    osm_key: string;
    osm_value: string;
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    locality?: string;
  };
  geometry: { coordinates: [number, number] };
}
const TYPE = { N: "node", W: "way", R: "relation" } as const;

async function photon(q: string): Promise<Candidate[]> {
  const params = new URLSearchParams({ q, limit: "8", bbox: BOX, lang: "en" });
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const { features } = (await res.json()) as { features: Feature[] };
  return features
    .filter((f) => f.properties.name && PLACES.has(f.properties.osm_key))
    .map(({ properties: p, geometry }) => ({
      ref: `${TYPE[p.osm_type]}/${p.osm_id}`,
      name: p.name!,
      kind: kindOf(p.osm_value, p.osm_key),
      area: p.district ?? p.locality ?? "",
      address: [p.housenumber, p.street].filter(Boolean).join(" "),
      lat: geometry.coordinates[1],
      lon: geometry.coordinates[0],
    }));
}

/** OpenStreetMap's finds, the whole of what was typed first, then without
 *  the words that only say what kind of place it is. */
async function fromOsm(q: string): Promise<Candidate[]> {
  const found = await photon(q);
  if (found.length) return found;
  const own = words(q).filter((w) => !["cafe", "coffee", "restaurant", "bar", "pub", "bowling", "canberra"].includes(w));
  return own.length && own.length < words(q).length ? photon(own.join(" ")) : [];
}

export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return Response.json([]);
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return Response.json(hit.results);

  const local = best(q, LOCAL, 6);
  let osm: Candidate[] = [];
  let reached = true;
  try {
    osm = (await fromOsm(q)).slice(0, 5);
  } catch {
    reached = false;
  }
  if (!reached && !local.length) return Response.json({ error: "lookup unavailable" }, { status: 502 });
  // (best first; on a tie OpenStreetMap's, then in each source's own order)
  const ranked = [...osm.map((c, i) => ({ c, s: score(q, c.name, c.area), o: 0, i })), ...local.map(({ score: s, ...c }, i) => ({ c, s, o: 1, i }))]
    .sort((a, b) => b.s - a.s || a.o - b.o || a.i - b.i)
    .map((r) => r.c);
  const finds = merge(ranked).slice(0, 8);
  const results = finds.map((f) => ({
      ref: f.ref,
      name: f.name,
      area: f.area,
      lat: f.lat,
      lon: f.lon,
      kind: f.kind,
      detail: [f.address, f.area].filter(Boolean).join(", "),
      // (to show: one already shared goes on the list as it is)
      photo: photoOfRef(f.ref),
  }));
  if (reached) cache.set(key, { at: Date.now(), results });
  return Response.json(results);
};
