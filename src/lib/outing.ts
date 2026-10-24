import opening_hours from "opening_hours";
import type { Kind } from "./kinds";
import { addDays, dayParts, formatMinute, formatSpan, today } from "./when";

// Making the outing work on the day: whether each stop is open for its part
// of the plan, the forecast where it's outside. All worked out here from
// what's already known (a place's opening hours, a forecast, the plan's
// times), with nothing fetched and no database, so the spec can check it on
// its own. What's fetched, and how politely, is src/lib/outing-fetch.ts;
// the cache the card reads is src/lib/outing-data.ts.

// ---- the plan's day and stretch ------------------------------------------------

/**
 * The day the outing is on. One place reads it, so a plan that offers
 * several candidate days only has to change this (the day being checked:
 * the one chosen, or the one shown).
 */
export const outingDay = (plan: { day: string }): string => plan.day;

/**
 * The stretch of the day to check the stops against: the time once it's
 * set; before that, the first window offered at its earliest start (the
 * owner's pick is checked on each window's own row); with no window, none.
 */
export function outingStretch(
  plan: { duration: number; set: { start: number; end: number } | null },
  windows: { from: number }[],
): [number, number] | null {
  if (plan.set) return [plan.set.start, plan.set.end];
  const first = windows[0];
  return first ? [first.from, first.from + plan.duration] : null;
}

/**
 * Each stop's share of the stretch, in order. Nobody says how long each
 * stop takes, so they're even: a 4h outing to two places is 2h at each.
 * Only used to decide whether to warn; what a warning says ("closes 5pm")
 * is the place's own hours, true whatever the split.
 */
export function shares(stretch: [number, number], stops: number): [number, number][] {
  const [a, b] = stretch;
  const each = (b - a) / stops;
  return Array.from({ length: stops }, (_, i) => [Math.round(a + i * each), Math.round(a + (i + 1) * each)]);
}

// ---- opening hours ---------------------------------------------------------------

// Read by opening_hours.js (pinned; LGPL-3.0, used unmodified as a library),
// the parser OpenStreetMap's own tools use: it knows the whole syntax
// (week days, months, "PH off", "sunset", comments), and Australia's public
// holidays, the ACT's among them (Canberra Day, Reconciliation Day), when
// told the place is in the ACT. It reads and answers in the process's local
// time, so a day and its minutes go in, and come out, as local wall-clock
// fields: Canberra's, whatever zone the server is in.
const ACT = { lat: -35.28, lon: 149.13, address: { country_code: "au", state: "Australian Capital Territory" } };
const parsed = new Map<string, opening_hours | null>();
function parse(hours: string): opening_hours | null {
  if (!parsed.has(hours)) {
    let oh: opening_hours | null = null;
    try {
      oh = new opening_hours(hours, ACT);
    } catch {
      oh = null;
    }
    if (parsed.size > 500) parsed.clear();
    parsed.set(hours, oh);
  }
  return parsed.get(hours)!;
}

/**
 * When a place is open on a day, as minutes since its midnight, merged
 * (a stretch past midnight is cut at it). Null when it can't be told: no
 * hours, hours that don't parse, or hours that say "unknown" that day.
 */
export function openOn(hours: string | null, day: string): [number, number][] | null {
  if (!hours) return null;
  const oh = parse(hours);
  if (!oh) return null;
  const [y, m, d] = day.split("-").map(Number);
  const from = new Date(y, m - 1, d, 0, 0);
  const to = new Date(y, m - 1, d + 1, 0, 0);
  let found: [Date, Date, boolean, string | undefined][];
  try {
    found = oh.getOpenIntervals(from, to) as [Date, Date, boolean, string | undefined][];
  } catch {
    return null;
  }
  if (found.some(([, , unknown]) => unknown)) return null;
  const minute = (t: Date) => (t.getTime() <= from.getTime() ? 0 : t.getTime() >= to.getTime() ? 1440 : t.getHours() * 60 + t.getMinutes());
  const out: [number, number][] = [];
  for (const [s, e] of found.map(([s, e]) => [minute(s), minute(e)] as [number, number]).sort((x, y) => x[0] - y[0])) {
    const last = out.at(-1);
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else if (e > s) out.push([s, e]);
  }
  return out;
}

export interface HoursNote {
  /** "closed": not open at all for its part of the plan; "warn": for only some of it */
  tone: "closed" | "warn";
  /** after the place's name: "closes 5pm", "opens 10am", "closed Mondays" */
  text: string;
}

const PLURAL = { Sun: "Sundays", Mon: "Mondays", Tue: "Tuesdays", Wed: "Wednesdays", Thu: "Thursdays", Fri: "Fridays", Sat: "Saturdays" } as const;

/**
 * Whether a place is open for `stretch` on `day`, said in a few words, or
 * null when it is, or when its hours aren't known (unknown says nothing:
 * never a guess). Closed all day is said even with no stretch yet.
 */
export function hoursNote(hours: string | null, day: string, stretch: [number, number] | null): HoursNote | null {
  const open = openOn(hours, day);
  if (!open) return null;
  if (open.length === 0) {
    // (shut the same weekday the week before and after too: it's the week's shape, not a holiday)
    const weekly = [-7, 7].every((n) => openOn(hours, addDays(day, n))?.length === 0);
    return { tone: "closed", text: weekly ? `closed ${PLURAL[dayParts(day).weekday as keyof typeof PLURAL]}` : "closed that day" };
  }
  if (!stretch) return null;
  const [a, b] = stretch;
  const during = open.filter(([s, e]) => s < b && e > a);
  if (during.length === 0) {
    const later = open.find(([s]) => s >= b);
    return later ? { tone: "closed", text: `opens ${formatMinute(later[0])}` } : { tone: "closed", text: `closes ${formatMinute(open.at(-1)![1])}` };
  }
  if (during.some(([s, e]) => s <= a && e >= b)) return null;
  const first = during[0];
  const last = during.at(-1)!;
  const late = first[0] > a;
  const early = last[1] < b;
  if (late && early) return { tone: "warn", text: `open ${formatSpan(first[0], last[1])}` };
  if (late) return { tone: "warn", text: `opens ${formatMinute(first[0])}` };
  if (early) return { tone: "warn", text: `closes ${formatMinute(last[1])}` };
  // (open at both ends, shut in between: a break)
  return { tone: "warn", text: `shut ${formatSpan(first[1], during[1][0])}` };
}

// ---- the forecast ----------------------------------------------------------------

/** Open-Meteo forecasts this many days, today the first. */
export const FORECAST_DAYS = 16;

/** Whether `day` is within the forecast: today to 15 days on. */
export const inForecast = (day: string, now = new Date()) => day >= today(now) && day <= addDays(today(now), FORECAST_DAYS - 1);

export interface Forecast {
  /** WMO weather code, as Open-Meteo gives it */
  code: number;
  /** the day's highest, °C */
  max: number;
  /** the day's highest chance of rain, %, if given */
  rain: number | null;
}

export type Sky = "sun" | "cloud-sun" | "cloud" | "fog" | "rain" | "snow" | "storm";

/** The WMO code as one of a few skies, and its name for a screen reader. */
export function skyOf(code: number): { sky: Sky; label: string } {
  if (code === 0) return { sky: "sun", label: "Clear" };
  if (code <= 2) return { sky: "cloud-sun", label: "Partly cloudy" };
  if (code === 3) return { sky: "cloud", label: "Cloudy" };
  if (code === 45 || code === 48) return { sky: "fog", label: "Fog" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { sky: "snow", label: "Snow" };
  if (code >= 95) return { sky: "storm", label: "Storms" };
  return { sky: "rain", label: "Rain" };
}

/** "32° · 10% rain". */
export const forecastText = (f: Forecast) => `${Math.round(f.max)}°${f.rain !== null ? ` · ${f.rain}% rain` : ""}`;

// What OpenStreetMap says makes an Activities place an outdoor one (a park,
// a golf course, a zoo); one tagged indoor isn't.
const OUTSIDE: Record<string, Set<string>> = {
  leisure: new Set(["park", "garden", "nature_reserve", "golf_course", "miniature_golf", "pitch", "track", "playground", "dog_park", "beach_resort", "marina", "disc_golf_course"]),
  tourism: new Set(["zoo", "theme_park", "viewpoint", "picnic_site", "camp_site"]),
  natural: new Set(["peak", "beach", "wood", "water", "cliff"]),
};
/** From a place's OpenStreetMap tags: whether it's outside. */
export const outsideByTags = (tags: Record<string, string>) =>
  tags.indoor !== "yes" && Object.entries(OUTSIDE).some(([key, values]) => values.has(tags[key] ?? ""));

/** Whether a stop gets a forecast: every Outdoors place, and an Activities one OpenStreetMap says is outside. */
export const wantsForecast = (kind: Kind, outside: boolean) => kind === "outdoors" || (kind === "fun" && outside);

// ---- between the stops -----------------------------------------------------------

// How far apart two stops are, and about how long it takes, with no routing
// service and no key: the straight line, times a road factor (Canberra's
// roads wind round the lake and its hills, about a third longer than the
// crow flies), at an average town speed with a couple of minutes to park;
// on foot, when the straight line is short. An estimate, said as one
// ("about 12 min"), never as a route's time.
export const ROAD_FACTOR = 1.3;
export const DRIVE_KMH = 40;
export const PARKING_MIN = 2;
export const WALK_KMH = 4.8;
/** Shorter than this as the crow flies, the leg is a walk. */
export const WALKABLE_M = 1500;

type Point = { lat: number; lon: number };

/** The straight line between two points, in metres (haversine). */
export function metresBetween(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export interface Leg {
  /** by road, estimated */
  metres: number;
  /** minutes, driving */
  drive: number;
  /** minutes on foot, when it's short enough to walk; else null */
  walk: number | null;
}

/** The leg from one stop to the next, estimated. */
export function legBetween(a: Point, b: Point): Leg {
  const straight = metresBetween(a, b);
  const metres = straight * ROAD_FACTOR;
  const km = metres / 1000;
  return {
    metres,
    drive: Math.max(PARKING_MIN + 1, Math.round((km / DRIVE_KMH) * 60) + PARKING_MIN),
    walk: straight < WALKABLE_M ? Math.max(1, Math.round((km / WALK_KMH) * 60)) : null,
  };
}

/** "400 m", "1.2 km", "14 km". */
export function formatDistance(metres: number): string {
  if (metres < 950) return `${Math.max(50, Math.round(metres / 50) * 50)} m`;
  const km = metres / 1000;
  return km < 9.95 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** "about 7 min walk · 600 m", "about 13 min drive · 7.2 km". */
export const legText = (leg: Leg) =>
  leg.walk !== null ? `about ${leg.walk} min walk · ${formatDistance(leg.metres)}` : `about ${leg.drive} min drive · ${formatDistance(leg.metres)}`;

// ---- directions ------------------------------------------------------------------

/** Whether the browser is on an Apple device, whose Maps app takes its own links (an iPad says Macintosh). */
export const onApple = (userAgent: string) => /\b(iPhone|iPad|iPod|Macintosh)\b/.test(userAgent);

const at = (p: Point) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;

/**
 * Directions from wherever the viewer is, through the stops in order, as a
 * plain link to the maps app: Apple Maps' unified URL on an Apple device
 * (https://developer.apple.com/documentation/mapkit/unified-map-urls),
 * Google Maps' everywhere else (https://developers.google.com/maps/documentation/urls/get-started).
 * Neither needs a key. One stop is the way there.
 */
export function directionsUrl(stops: Point[], apple: boolean): string {
  if (!stops.length) throw new Error("no stops");
  const end = stops.at(-1)!;
  const via = stops.slice(0, -1);
  if (apple) {
    const params = new URLSearchParams({ destination: at(end) });
    for (const p of via) params.append("waypoint", at(p));
    if (via.length) params.set("mode", "driving");
    return `https://maps.apple.com/directions?${params}`;
  }
  const params = new URLSearchParams({ api: "1", destination: at(end) });
  if (via.length) {
    params.set("waypoints", via.map(at).join("|"));
    params.set("travelmode", "driving");
  }
  return `https://www.google.com/maps/dir/?${params}`;
}
