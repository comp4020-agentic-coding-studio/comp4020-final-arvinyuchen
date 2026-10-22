import type { APIRoute } from "astro";
import { photoOfOsm } from "../../lib/db";
import { nominatim } from "../../lib/nominatim";
import { photoFromTags } from "../../lib/photos";

// Finding a place to add: a search of OpenStreetMap through Nominatim, kept
// to Canberra. The source only fills in the name, suburb and location; it
// says nothing about whether a place is good, and its results never enter
// Explore on their own (that takes a person and a reason).
//
// Nominatim's usage policy: an identifying User-Agent, at most one request a
// second, and no search-as-you-type. So the browser asks only when someone
// presses Find, the server spaces requests out (src/lib/nominatim.ts), and
// answers are cached. Each answer brings its tags, and where they lead to a
// reusable photo on Wikimedia Commons, it comes too (src/lib/photos.ts).
const cache = new Map<string, { at: number; results: unknown[] }>();

// A first guess at the kind from what OpenStreetMap calls the place; the
// person sharing it can change it before they do.
const FOOD = new Set(["restaurant", "fast_food", "food_court"]);
const COFFEE = new Set(["cafe", "ice_cream", "bakery", "pastry", "confectionery", "tea"]);
const DRINKS = new Set(["bar", "pub", "biergarten", "nightclub", "brewery", "wine_bar"]);
const OUTDOORS = new Set(["park", "nature_reserve", "garden", "viewpoint", "peak", "beach", "playground", "picnic_site"]);
const CULTURE = new Set(["museum", "gallery", "arts_centre", "theatre", "artwork", "library", "memorial", "monument", "planetarium"]);
const kindOf = (h: { type: string; category: string }) =>
  FOOD.has(h.type)
    ? "food"
    : COFFEE.has(h.type)
      ? "coffee"
      : DRINKS.has(h.type)
        ? "drinks"
        : OUTDOORS.has(h.type) || (h.category === "leisure" && h.type !== "sports_centre" && h.type !== "bowling_alley")
          ? "outdoors"
          : CULTURE.has(h.type)
            ? "culture"
            : "fun";

interface Hit {
  osm_type: string;
  osm_id: number;
  name: string;
  lat: string;
  lon: string;
  type: string;
  category: string;
  display_name: string;
  address?: Record<string, string>;
  extratags?: Record<string, string>;
}

export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return Response.json([]);
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return Response.json(hit.results);

  try {
    const hits = await nominatim<Hit[]>("search", {
      q,
      addressdetails: "1",
      extratags: "1",
      limit: "6",
      countrycodes: "au",
      viewbox: "148.76,-35.12,149.40,-35.92",
      bounded: "1",
    });
    const results = await Promise.all(
      hits
        .filter((h) => h.name)
        .map(async (h) => {
          const osm = `${h.osm_type}/${h.osm_id}`;
          return {
            osm,
            name: h.name,
            area: h.address?.suburb ?? h.address?.neighbourhood ?? h.address?.city_district ?? "",
            lat: Number(h.lat),
            lon: Number(h.lon),
            kind: kindOf(h),
            detail: h.display_name.split(",").slice(1, 3).join(",").trim(),
            // (to show; sharing works the photo out again on the server)
            photo: photoOfOsm(osm) ?? (await photoFromTags(osm, h.extratags)),
          };
        }),
    );
    cache.set(key, { at: Date.now(), results });
    return Response.json(results);
  } catch {
    return Response.json({ error: "lookup unavailable" }, { status: 502 });
  }
};
