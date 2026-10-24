import { USER_AGENT } from "./agent";
import { score } from "./finder";
import { type Forecast } from "./outing";
import { stubFetch } from "./outing-stub";

// Asking the open services about a stop: its opening hours from
// OpenStreetMap (through Overpass), and the forecast where it is (from
// Open-Meteo). Only ever a place's coordinates, its OpenStreetMap id and a
// date go out, never a member, a group or a plan; a place's name is used
// here, to pick the right one of what Overpass finds, and never sent. The
// requests are built by the functions below, so the spec can read them.
//
// Overture's places (src/data/places-index.json) carry no opening hours, so
// OpenStreetMap's `opening_hours` tag is the source. Neither service needs
// a key. Both are asked from src/lib/outing-data.ts only, one request at a
// time, off the page's request path, and their answers kept for days
// (hours) or hours (forecasts).
//
// With OUTING_STUB set, nothing leaves the machine: the same requests go to
// src/lib/outing-stub.ts, which answers from a fixed table and keeps a log
// of what it was asked, for the spec.

export const OVERPASS = "https://overpass-api.de/api/interpreter";
export const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";

export type Transport = (url: string, init: RequestInit) => Promise<Response>;
/** The network, or with OUTING_STUB the local stub. */
export const transport = (): Transport => (process.env.OUTING_STUB ? stubFetch : (url, init) => fetch(url, init));

/** What's asked of Overpass about a place: by its OpenStreetMap id if it has one, else what's named within 100 m. */
export function overpassQuery(place: { osmRef: string | null; lat: number; lon: number }): string {
  const ref = /^(node|way|relation)\/(\d+)$/.exec(place.osmRef ?? "");
  if (ref) return `[out:json][timeout:20];${ref[1]}(${ref[2]});out tags center;`;
  const at = `around:100,${place.lat.toFixed(6)},${place.lon.toFixed(6)}`;
  return `[out:json][timeout:20];(nwr(${at})["name"]["opening_hours"];nwr(${at})["name"]["leisure"];nwr(${at})["name"]["tourism"];);out tags center;`;
}

/** The request for one day's forecast at a place: its coordinates and the date, in Canberra's time. */
export function forecastUrl(lat: number, lon: number, day: string): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    daily: "weather_code,temperature_2m_max,precipitation_probability_max",
    timezone: "Australia/Sydney",
    start_date: day,
    end_date: day,
  });
  return `${OPEN_METEO}?${params}`;
}

const headers = { "User-Agent": USER_AGENT };

interface Element {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface FoundHours {
  /** its `opening_hours`, or null if OpenStreetMap has none */
  hours: string | null;
  /** the OpenStreetMap element it was read from, if one was found */
  ref: string | null;
  tags: Record<string, string>;
}

/**
 * A place's hours as OpenStreetMap has them. By id, that element; by
 * location, the one whose name is the place's (as Find matches names), the
 * nearest of equals. Nothing that close by that name: unknown, not a guess.
 */
export async function fetchHours(
  place: { osmRef: string | null; name: string; lat: number; lon: number },
  send: Transport = transport(),
): Promise<FoundHours> {
  const res = await send(OVERPASS, {
    method: "POST",
    headers: { ...headers, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: overpassQuery(place) }).toString(),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`overpass ${res.status}`);
  const { elements = [] } = (await res.json()) as { elements?: Element[] };
  const near = (e: Element) => {
    const at = e.center ?? (e.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : null);
    return at ? Math.hypot(at.lat - place.lat, (at.lon - place.lon) * Math.cos((place.lat * Math.PI) / 180)) : 1;
  };
  const byId = place.osmRef ? elements.find((e) => `${e.type}/${e.id}` === place.osmRef) : undefined;
  const match =
    byId ??
    elements
      .map((e) => ({ e, s: score(place.name, e.tags?.name ?? "") }))
      .filter(({ s }) => s >= 60)
      .sort((x, y) => y.s - x.s || near(x.e) - near(y.e))[0]?.e;
  if (!match) return { hours: null, ref: null, tags: {} };
  return { hours: match.tags?.opening_hours?.trim() || null, ref: `${match.type}/${match.id}`, tags: match.tags ?? {} };
}

/** One day's forecast at a place, or null if the day is beyond what Open-Meteo has. */
export async function fetchForecast(lat: number, lon: number, day: string, send: Transport = transport()): Promise<Forecast | null> {
  const res = await send(forecastUrl(lat, lon, day), { headers, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const { daily } = (await res.json()) as {
    daily?: { time: string[]; weather_code: (number | null)[]; temperature_2m_max: (number | null)[]; precipitation_probability_max: (number | null)[] };
  };
  const i = daily?.time.indexOf(day) ?? -1;
  if (!daily || i < 0) return null;
  const code = daily.weather_code[i];
  const max = daily.temperature_2m_max[i];
  if (code === null || max === null) return null;
  return { code, max, rain: daily.precipitation_probability_max[i] ?? null };
}
