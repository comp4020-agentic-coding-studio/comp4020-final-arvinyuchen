import { db } from "./db";
import { changed } from "./events";
import type { Kind } from "./kinds";
import {
  type Forecast,
  forecastText,
  hoursNote,
  type HoursNote,
  inForecast,
  outingDay,
  outingStretch,
  outsideByTags,
  shares,
  wantsForecast,
} from "./outing";
import { fetchForecast, fetchHours } from "./outing-fetch";
import { currentPlan, type Plan, type PlanView } from "./plans";
import { today } from "./when";

// What the plan's card knows about each stop on the day: its opening hours
// and, outside, the forecast. Kept in SQLite beside the places, so the card
// reads it at once as it's drawn (a live refresh redraws it often); asking
// the services for it happens here, in the background, never while a page
// waits:
//
// - when a plan is started or changed (prefetchOuting, from the plan route),
//   and when a card is drawn with something missing or stale (outingOf);
// - one request at a time to each service, a pause between, each kept to a
//   timeout, and the same thing never asked twice at once;
// - hours kept a week, a forecast three hours; a failure kept too, so it's
//   tried again only after a while, and whatever was known before is still
//   shown meanwhile;
// - when something new comes back, the plan's group hears `changed`, so its
//   open pages redraw the card with it.
//
// These are caches of what the open services say about a place, not
// anything a group made, so a forecast for a day gone is cleared away.

db.exec(`
  CREATE TABLE IF NOT EXISTS place_hours (
    place_id INTEGER PRIMARY KEY,
    hours TEXT,
    osm_ref TEXT,
    outside INTEGER NOT NULL DEFAULT 0,
    checked_at INTEGER,
    failed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS place_forecasts (
    place_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    code INTEGER,
    max_c REAL,
    rain INTEGER,
    checked_at INTEGER,
    failed_at INTEGER,
    PRIMARY KEY (place_id, day)
  );
`);
// (no REFERENCES to places: a starter place taken off the catalogue is
// deleted at boot, and a cache row mustn't stand in its way)

const HOUR = 3_600_000;
const HOURS_FRESH = 7 * 24 * HOUR;
const HOURS_RETRY = HOUR;
const FORECAST_FRESH = 3 * HOUR;
const FORECAST_RETRY = HOUR / 3;

interface StopRow {
  id: number;
  name: string;
  kind: Kind;
  lat: number | null;
  lon: number | null;
  osm_id: string | null;
}
interface HoursRow {
  hours: string | null;
  outside: number;
  checked_at: number | null;
  failed_at: number | null;
}
interface ForecastRow {
  code: number | null;
  max_c: number | null;
  rain: number | null;
  checked_at: number | null;
  failed_at: number | null;
}

const stopRows = (plan: Plan): StopRow[] => {
  const byId = new Map(
    (
      db
        .prepare(`SELECT id, name, kind, lat, lon, osm_id FROM places WHERE id IN (${plan.stops.map(() => "?").join(", ")})`)
        .all(...plan.stops.map((s) => s.id)) as StopRow[]
    ).map((r) => [r.id, r]),
  );
  return plan.stops.map((s) => byId.get(s.id) ?? { id: s.id, name: s.name, kind: s.kind, lat: null, lon: null, osm_id: null });
};
const hoursRow = (placeId: number) =>
  db.prepare("SELECT hours, outside, checked_at, failed_at FROM place_hours WHERE place_id = ?").get(placeId) as HoursRow | undefined;
const forecastRow = (placeId: number, day: string) =>
  db.prepare("SELECT code, max_c, rain, checked_at, failed_at FROM place_forecasts WHERE place_id = ? AND day = ?").get(placeId, day) as
    | ForecastRow
    | undefined;

// (is it time to ask again: never asked, or what's kept is old, and not just after a failure)
const due = (row: { checked_at: number | null; failed_at: number | null } | undefined, fresh: number, retry: number, now: number) =>
  !row || ((row.checked_at === null || now - row.checked_at > fresh) && (row.failed_at === null || now - row.failed_at > retry));

// ---- asking, in the background ---------------------------------------------------

// One lane per service: a job at a time, then a pause, so neither is ever
// sent a burst. A job already waiting isn't queued twice; the groups to
// tell when it's done are gathered on it.
const PAUSE = { overpass: 1000, meteo: 200 };
const lanes = { overpass: Promise.resolve(), meteo: Promise.resolve() };
const waiting = new Map<string, Set<string>>();
function queue(lane: keyof typeof lanes, key: string, groupId: string, job: () => Promise<boolean>) {
  const tell = waiting.get(key);
  if (tell) {
    tell.add(groupId);
    return;
  }
  waiting.set(key, new Set([groupId]));
  lanes[lane] = lanes[lane].then(async () => {
    let news = false;
    try {
      news = await job();
    } catch {
      news = false;
    }
    const groups = waiting.get(key) ?? new Set();
    waiting.delete(key);
    if (news) for (const g of groups) changed(g);
    await new Promise((resolve) => setTimeout(resolve, PAUSE[lane]));
  });
}

function askHours(stop: StopRow & { lat: number; lon: number }, groupId: string) {
  queue("overpass", `hours:${stop.id}`, groupId, async () => {
    const now = Date.now();
    try {
      const found = await fetchHours({ osmRef: stop.osm_id, name: stop.name, lat: stop.lat, lon: stop.lon });
      const was = hoursRow(stop.id);
      db.prepare(
        `INSERT INTO place_hours (place_id, hours, osm_ref, outside, checked_at, failed_at) VALUES (?, ?, ?, ?, ?, NULL)
         ON CONFLICT(place_id) DO UPDATE SET hours = excluded.hours, osm_ref = excluded.osm_ref, outside = excluded.outside,
           checked_at = excluded.checked_at, failed_at = NULL`,
      ).run(stop.id, found.hours, found.ref, outsideByTags(found.tags) ? 1 : 0, now);
      return was?.hours !== found.hours || Boolean(was?.outside) !== outsideByTags(found.tags);
    } catch (error) {
      db.prepare(
        `INSERT INTO place_hours (place_id, failed_at) VALUES (?, ?) ON CONFLICT(place_id) DO UPDATE SET failed_at = excluded.failed_at`,
      ).run(stop.id, now);
      throw error;
    }
  });
}

function askForecast(stop: StopRow & { lat: number; lon: number }, day: string, groupId: string) {
  queue("meteo", `forecast:${stop.id}:${day}`, groupId, async () => {
    const now = Date.now();
    db.prepare("DELETE FROM place_forecasts WHERE day < ?").run(today());
    try {
      const f = await fetchForecast(stop.lat, stop.lon, day);
      const was = forecastRow(stop.id, day);
      db.prepare(
        `INSERT INTO place_forecasts (place_id, day, code, max_c, rain, checked_at, failed_at) VALUES (?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(place_id, day) DO UPDATE SET code = excluded.code, max_c = excluded.max_c, rain = excluded.rain,
           checked_at = excluded.checked_at, failed_at = NULL`,
      ).run(stop.id, day, f?.code ?? null, f?.max ?? null, f?.rain ?? null, now);
      return was?.code !== (f?.code ?? null) || was?.max_c !== (f?.max ?? null) || was?.rain !== (f?.rain ?? null);
    } catch (error) {
      db.prepare(
        `INSERT INTO place_forecasts (place_id, day, failed_at) VALUES (?, ?, ?)
         ON CONFLICT(place_id, day) DO UPDATE SET failed_at = excluded.failed_at`,
      ).run(stop.id, day, now);
      throw error;
    }
  });
}

const located = (s: StopRow): s is StopRow & { lat: number; lon: number } => s.lat !== null && s.lon !== null;

/** Asks for whatever the plan's stops are missing, or have that's stale: in the background. */
function refresh(plan: Plan, stops: StopRow[], groupId: string, now = new Date()) {
  const day = outingDay(plan);
  const t = now.getTime();
  for (const stop of stops.filter(located)) {
    const hours = hoursRow(stop.id);
    if (due(hours, HOURS_FRESH, HOURS_RETRY, t)) askHours(stop, groupId);
    // (a forecast only where it's wanted, and once the day's within reach;
    // for an Activities place, once its tags say whether it's outside)
    if (!inForecast(day, now)) continue;
    if (stop.kind !== "outdoors" && !(stop.kind === "fun" && hours?.outside)) continue;
    if (due(forecastRow(stop.id, day), FORECAST_FRESH, FORECAST_RETRY, t)) askForecast(stop, day, groupId);
  }
}

/** The group's plan was started or changed: ask now for what its card will want. */
export function prefetchOuting(groupId: string) {
  const plan = currentPlan(groupId);
  if (plan) refresh(plan, stopRows(plan), groupId);
}

// ---- what the card shows ---------------------------------------------------------

export interface OutingStop {
  id: number;
  name: string;
  kind: Kind;
  lat: number | null;
  lon: number | null;
  /** whether it's open for its share of the plan, when it isn't (or null) */
  note: HoursNote | null;
  /** the day's forecast, outside and within range */
  forecast: (Forecast & { text: string }) | null;
}

export interface Outing {
  day: string;
  stops: OutingStop[];
  /** for a window starting at `from`, lasting the plan's length: the first stop that won't be open for its share, said ("Questacon closes 5pm") */
  windowNote: (from: number) => { text: string; tone: HoursNote["tone"] } | null;
}

/**
 * The plan's stops as the card shows them on the day, from what's kept,
 * at once. Anything missing or stale is asked for in the background, and
 * the group's pages hear when it comes.
 */
export function outingOf(view: PlanView, groupId: string, now = new Date()): Outing {
  const { plan } = view;
  const day = outingDay(plan);
  const rows = stopRows(plan);
  refresh(plan, rows, groupId, now);
  const hours = rows.map((r) => hoursRow(r.id));
  const stretch = outingStretch(plan, view.windows);
  const parts = stretch && shares(stretch, rows.length);
  const stops = rows.map((r, i): OutingStop => {
    const h = hours[i];
    const f = inForecast(day, now) && wantsForecast(r.kind, Boolean(h?.outside)) ? forecastRow(r.id, day) : undefined;
    const forecast = f && f.code !== null && f.max_c !== null ? { code: f.code, max: f.max_c, rain: f.rain } : null;
    return {
      id: r.id,
      name: r.name,
      kind: r.kind,
      lat: r.lat,
      lon: r.lon,
      note: hoursNote(h?.hours ?? null, day, parts ? parts[i] : null),
      forecast: forecast && { ...forecast, text: forecastText(forecast) },
    };
  });
  return {
    day,
    stops,
    windowNote: (from) => {
      const each = shares([from, from + plan.duration], rows.length);
      for (const [i, r] of rows.entries()) {
        // (a stop shut all day is said once, on the card, not on every row)
        if (hoursNote(hours[i]?.hours ?? null, day, null)) continue;
        const note = hoursNote(hours[i]?.hours ?? null, day, each[i]);
        if (note) return { text: `${r.name} ${note.text}`, tone: note.tone };
      }
      return null;
    },
  };
}
