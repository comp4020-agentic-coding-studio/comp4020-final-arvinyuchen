import type { APIRoute } from "astro";

// Finding a place to add: a search of OpenStreetMap through Nominatim, kept
// to Canberra. The source only fills in the name, suburb and location; it
// says nothing about whether a place is good, and its results never enter
// Explore on their own (that takes a person and a reason).
//
// Nominatim's usage policy: an identifying User-Agent, at most one request a
// second, and no search-as-you-type. So the browser asks only when someone
// presses Find, the server spaces requests out, and answers are cached.
const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Spots/1.0 (https://comp4020-final-arvinyuchen.fly.dev; COMP4020 student project)";
const cache = new Map<string, { at: number; results: unknown[] }>();
let last = 0;

const FOOD = new Set(["restaurant", "cafe", "fast_food", "bar", "pub", "food_court", "ice_cream", "bakery", "biergarten"]);
const OUTDOORS = new Set(["park", "nature_reserve", "garden", "viewpoint", "peak", "beach", "playground", "picnic_site"]);

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
}

export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return Response.json([]);
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return Response.json(hit.results);

  const wait = last + 1100 - Date.now();
  last = Date.now() + Math.max(0, wait);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    addressdetails: "1",
    limit: "6",
    countrycodes: "au",
    viewbox: "148.76,-35.12,149.40,-35.92",
    bounded: "1",
  });
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return Response.json({ error: "lookup unavailable" }, { status: 502 });
    const results = ((await res.json()) as Hit[])
      .filter((h) => h.name)
      .map((h) => ({
        osm: `${h.osm_type}/${h.osm_id}`,
        name: h.name,
        area: h.address?.suburb ?? h.address?.neighbourhood ?? h.address?.city_district ?? "",
        lat: Number(h.lat),
        lon: Number(h.lon),
        kind: FOOD.has(h.type) ? "food" : OUTDOORS.has(h.type) || h.category === "leisure" ? "outdoors" : "fun",
        detail: h.display_name.split(",").slice(1, 3).join(",").trim(),
      }));
    cache.set(key, { at: Date.now(), results });
    return Response.json(results);
  } catch {
    return Response.json({ error: "lookup unavailable" }, { status: 502 });
  }
};
