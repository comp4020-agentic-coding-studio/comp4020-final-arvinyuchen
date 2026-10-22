import type { APIRoute } from "astro";
import { photoOfRef } from "../../lib/db";
import { best, type Candidate, merge, score, words } from "../../lib/finder";
import type { Kind } from "../../lib/kinds";
import { nominatim, USER_AGENT } from "../../lib/nominatim";
import { knownPhoto, photoFromTags } from "../../lib/photos";
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
// both do, since its tags can bring a photo. Neither says whether a place is
// good: nothing found here enters Explore until a person shares it with a
// reason and a photo. Each find comes with the photo it would get, if it has
// one: the photo it was shared with before, or the Commons photo its
// OpenStreetMap tags lead to (src/lib/photos.ts), for which Nominatim is
// asked once for every OpenStreetMap find's tags (src/lib/nominatim.ts).
//
// The browser asks only when someone presses Find, never as they type, and
// answers are cached for a day.
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

/** The Commons photo each OpenStreetMap find's tags lead to, all asked at once. */
async function osmPhotos(finds: Candidate[]) {
  const osm = finds.filter((f) => !f.ref.startsWith("overture/") && !photoOfRef(f.ref));
  if (!osm.length) return;
  const ids = osm.map((f) => `${f.ref[0].toUpperCase()}${f.ref.split("/")[1]}`).join(",");
  const tagged = await nominatim<{ osm_type: string; osm_id: number; extratags?: Record<string, string> }[]>("lookup", {
    osm_ids: ids,
    extratags: "1",
  });
  await Promise.all(tagged.map((t) => photoFromTags(`${t.osm_type}/${t.osm_id}`, t.extratags)));
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
  try {
    await osmPhotos(finds);
  } catch {
    // (no tags: those finds show no photo, and their sharer adds one)
  }
  const results = finds.map((f) => ({
      ref: f.ref,
      name: f.name,
      area: f.area,
      lat: f.lat,
      lon: f.lon,
      kind: f.kind,
      detail: [f.address, f.area].filter(Boolean).join(", "),
      // (to show; sharing works the photo out again on the server)
      photo: photoOfRef(f.ref) ?? knownPhoto(f.ref),
  }));
  if (reached) cache.set(key, { at: Date.now(), results });
  return Response.json(results);
};
