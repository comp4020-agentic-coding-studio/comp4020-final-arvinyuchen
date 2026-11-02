// The outside world, as the spec sees it: with OUTING_STUB set (any value),
// src/lib/outing-fetch.ts sends its requests here instead of to Overpass
// and Open-Meteo. The requests are built exactly as they would be; this
// answers them from a fixed table and keeps the last few, which
// /api/outing-log hands to the spec (only while stubbed) so it can check
// nothing about a member or a group ever went out.
//
//   OUTING_STUB=1 ADMIN_CODE=… PORT=4450 node ./dist/server/entry.mjs

/** OpenStreetMap ids the stub knows the hours of. A place shared with one of these refs gets them. */
export const STUB_HOURS: Record<string, string> = {
  // open every day, 9 to 5
  "node/990000001": "Mo-Su 09:00-17:00",
  // shut on Mondays, 10 to 4 otherwise
  "node/990000002": "Tu-Su 10:00-16:00",
};
/** Places the stub can't reach: their hours (an id starting so) and forecast (at this latitude) time out. */
export const STUB_FAIL = { ref: "node/99003", lat: -35.4321 };
/** Every forecast the stub gives: partly cloudy, 24°, 10% rain. */
export const STUB_FORECAST = { code: 2, max: 24.4, rain: 10 };
/** How long a failing request takes to fail: as a real timeout would, late. */
export const STUB_DELAY = 1500;

export interface Sent {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}
const log: Sent[] = [];
/** What was sent, oldest first (the last 200). */
export const sent = (): Sent[] => [...log];

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
const fail = () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error("stub: timed out")), STUB_DELAY));

export async function stubFetch(url: string, init: RequestInit): Promise<Response> {
  const body = typeof init.body === "string" ? init.body : "";
  log.push({ url, method: init.method ?? "GET", headers: { ...(init.headers as Record<string, string>) }, body });
  if (log.length > 200) log.shift();
  const where = new URL(url);
  if (where.hostname === "overpass-api.de") {
    const query = new URLSearchParams(body).get("data") ?? "";
    const byId = /(node|way|relation)\((\d+)\)/.exec(query);
    const ref = byId ? `${byId[1]}/${byId[2]}` : "";
    if (ref.startsWith(STUB_FAIL.ref)) return fail();
    const hours = STUB_HOURS[ref];
    return json({ elements: hours ? [{ type: byId![1], id: Number(byId![2]), tags: { name: "Stub", opening_hours: hours } }] : [] });
  }
  if (where.hostname === "api.open-meteo.com") {
    if (Number(where.searchParams.get("latitude")) === STUB_FAIL.lat) return fail();
    const day = where.searchParams.get("start_date") ?? "";
    return json({
      daily: {
        time: [day],
        weather_code: [STUB_FORECAST.code],
        temperature_2m_max: [STUB_FORECAST.max],
        precipitation_probability_max: [STUB_FORECAST.rain],
      },
    });
  }
  return new Response(null, { status: 404 });
}
