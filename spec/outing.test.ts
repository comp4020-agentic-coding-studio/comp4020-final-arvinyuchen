import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { Jar } from "./authenticator";
import { baseUrl, join, origin, page, request, startGroup } from "./browser";
import { directionsUrl, forecastText, formatDistance, hoursNote, inForecast, legBetween, legText, metresBetween, onApple, outingStretch, outsideByTags, shares, skyOf, wantsForecast } from "../src/lib/outing";
import { forecastUrl, overpassQuery } from "../src/lib/outing-fetch";
import { STUB_FAIL } from "../src/lib/outing-stub";
import { addDays, dayParts, today } from "../src/lib/when";

// Making the outing work on the day (src/lib/outing.ts): whether each stop
// is open for its part of the plan, the forecast where it's outside. The
// logic on its own first; then against the running app, which must be
// started with OUTING_STUB=1 so its fetchers answer from
// src/lib/outing-stub.ts and never reach Overpass or Open-Meteo.

const tuesday = "2026-11-03";
const monday = "2026-11-02";
const NINE_TO_FIVE = "Mo-Su 09:00-17:00";

describe("opening hours", () => {
  it("says a place closes in the middle of its part of the plan", () => {
    expect(hoursNote(NINE_TO_FIVE, tuesday, [900, 1080])).toEqual({ tone: "warn", text: "closes 5pm" });
  });
  it("says a place opens after its part of the plan starts", () => {
    expect(hoursNote(NINE_TO_FIVE, tuesday, [480, 600])).toEqual({ tone: "warn", text: "opens 9am" });
    expect(hoursNote("Mo-Su 10:30-14:00", tuesday, [600, 900])).toEqual({ tone: "warn", text: "open 10:30am–2pm" });
  });
  it("says nothing when it's open all through", () => {
    expect(hoursNote(NINE_TO_FIVE, tuesday, [600, 960])).toBeNull();
    expect(hoursNote("24/7", tuesday, [480, 1380])).toBeNull();
  });
  it("says it isn't open at all then, in red", () => {
    expect(hoursNote(NINE_TO_FIVE, tuesday, [1080, 1200])).toEqual({ tone: "closed", text: "closes 5pm" });
    expect(hoursNote("Mo-Su 17:30-22:00", tuesday, [840, 1020])).toEqual({ tone: "closed", text: "opens 5:30pm" });
  });
  it("says a closed day as the week's shape, or that day, with or without a time", () => {
    expect(hoursNote("Tu-Su 10:00-16:00", monday, [600, 720])).toEqual({ tone: "closed", text: "closed Mondays" });
    expect(hoursNote("Tu-Su 10:00-16:00", monday, null)).toEqual({ tone: "closed", text: "closed Mondays" });
    // Canberra Day 2027 (the second Monday of March) is the ACT's public holiday
    expect(hoursNote("Mo-Su 09:00-17:00; PH off", "2027-03-08", [600, 720])).toEqual({ tone: "closed", text: "closed that day" });
    expect(hoursNote("Mo-Su 09:00-17:00; PH off", "2027-03-09", [600, 720])).toBeNull();
  });
  it("says nothing when the hours are unknown, never a guess", () => {
    expect(hoursNote(null, tuesday, [600, 720])).toBeNull();
    expect(hoursNote("ask at the door", tuesday, [600, 720])).toBeNull();
    expect(hoursNote("Mo-Su unknown", tuesday, [600, 720])).toBeNull();
    // and with no time yet, only a closed day is said
    expect(hoursNote(NINE_TO_FIVE, tuesday, null)).toBeNull();
  });
  it("checks the set time, else the best window, and gives each stop an even share", () => {
    expect(outingStretch({ duration: 120, set: { start: 840, end: 960 } }, [{ from: 600 }])).toEqual([840, 960]);
    expect(outingStretch({ duration: 120, set: null }, [{ from: 600 }, { from: 900 }])).toEqual([600, 720]);
    expect(outingStretch({ duration: 120, set: null }, [])).toBeNull();
    expect(shares([840, 1080], 2)).toEqual([[840, 960], [960, 1080]]);
    expect(shares([600, 700], 3)).toEqual([[600, 633], [633, 667], [667, 700]]);
  });
});

describe("between the stops", () => {
  const questacon = { lat: -35.2985, lon: 149.1313 };
  it("estimates a leg from the straight line, a road factor and a town speed, and says it's an estimate", () => {
    // 0.05° of latitude is 5.56 km as the crow flies: 7.2 km by road, 11 min at 40 km/h and 2 to park
    const far = legBetween(questacon, { lat: -35.2485, lon: 149.1313 });
    expect(Math.round(metresBetween(questacon, { lat: -35.2485, lon: 149.1313 }))).toBe(5560);
    expect(far).toMatchObject({ drive: 13, walk: null });
    expect(legText(far)).toBe("about 13 min drive · 7.2 km");
  });
  it("walks a short leg", () => {
    // 445 m as the crow flies, 580 m on foot at 4.8 km/h
    const near = legBetween(questacon, { lat: -35.2945, lon: 149.1313 });
    expect(near.walk).toBe(7);
    expect(legText(near)).toBe("about 7 min walk · 600 m");
    expect(legBetween(questacon, { lat: -35.2875, lon: 149.1313 }).walk).toBe(20);
    expect(legBetween(questacon, { lat: -35.2845, lon: 149.1313 }).walk).toBeNull();
  });
  it("says a distance as people do", () => {
    expect([10, 380, 949, 1240, 9940, 14_300].map(formatDistance)).toEqual(["50 m", "400 m", "950 m", "1.2 km", "9.9 km", "14 km"]);
  });
});

describe("directions", () => {
  const a = { lat: -35.3, lon: 149.13 };
  const b = { lat: -35.2985, lon: 149.1313 };
  const c = { lat: -35.2706, lon: 149.1585 };
  it("opens Google Maps through every stop in order, from wherever you are", () => {
    expect(directionsUrl([b], false)).toBe("https://www.google.com/maps/dir/?api=1&destination=-35.298500%2C149.131300");
    const route = new URL(directionsUrl([a, b, c], false));
    expect(route.origin + route.pathname).toBe("https://www.google.com/maps/dir/");
    expect(route.searchParams.get("destination")).toBe("-35.270600,149.158500");
    expect(route.searchParams.get("waypoints")).toBe("-35.300000,149.130000|-35.298500,149.131300");
    expect(route.searchParams.get("travelmode")).toBe("driving");
    expect(route.searchParams.has("origin")).toBe(false);
  });
  it("opens Apple Maps on an Apple device", () => {
    expect(directionsUrl([b], true)).toBe("https://maps.apple.com/directions?destination=-35.298500%2C149.131300");
    const route = new URL(directionsUrl([a, b, c], true));
    expect(route.origin + route.pathname).toBe("https://maps.apple.com/directions");
    expect(route.searchParams.get("destination")).toBe("-35.270600,149.158500");
    expect(route.searchParams.getAll("waypoint")).toEqual(["-35.300000,149.130000", "-35.298500,149.131300"]);
    expect(route.searchParams.get("mode")).toBe("driving");
  });
  it("knows an Apple device by its browser, an iPad's that says it's a Mac too", () => {
    expect(onApple("Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15")).toBe(true);
    expect(onApple("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.5 Safari/605.1.15")).toBe(true);
    expect(onApple("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36")).toBe(false);
    expect(onApple("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36")).toBe(false);
  });
});

describe("the forecast", () => {
  it("is said as the day's top and its chance of rain, with a sky", () => {
    expect(forecastText({ code: 1, max: 31.6, rain: 10 })).toBe("32° · 10% rain");
    expect(forecastText({ code: 1, max: 18, rain: null })).toBe("18°");
    expect(skyOf(0).sky).toBe("sun");
    expect(skyOf(63).sky).toBe("rain");
    expect(skyOf(95).label).toBe("Storms");
  });
  it("is only for the days Open-Meteo covers, and for stops outside", () => {
    const now = new Date();
    expect(inForecast(today(now), now)).toBe(true);
    expect(inForecast(addDays(today(now), 15), now)).toBe(true);
    expect(inForecast(addDays(today(now), 16), now)).toBe(false);
    expect(wantsForecast("outdoors", false)).toBe(true);
    expect(wantsForecast("culture", true)).toBe(false);
    expect(wantsForecast("fun", outsideByTags({ leisure: "golf_course" }))).toBe(true);
    expect(wantsForecast("fun", outsideByTags({ leisure: "bowling_alley" }))).toBe(false);
  });
  it("asks only a place's coordinates, its OpenStreetMap id and the date", () => {
    expect(overpassQuery({ osmRef: "way/27630963", lat: -35.2985, lon: 149.1313 })).toBe("[out:json][timeout:20];way(27630963);out tags center;");
    expect(overpassQuery({ osmRef: null, lat: -35.2985, lon: 149.1313 })).toContain("around:100,-35.298500,149.131300");
    const url = new URL(forecastUrl(-35.2985, 149.1313, "2026-11-03"));
    expect(url.origin).toBe("https://api.open-meteo.com");
    expect([...url.searchParams.keys()].sort()).toEqual(["daily", "end_date", "latitude", "longitude", "start_date", "timezone"]);
  });
});

// ---- against the running app, stubbed ------------------------------------------

const inPage = (jar: Jar, path: string, form: Record<string, string> | URLSearchParams) =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { origin, cookie: jar.header, "x-spots": "in-page" },
    body: form instanceof URLSearchParams ? form : new URLSearchParams(form),
    redirect: "manual",
  });
/** The next `weekday` ("Mon") from tomorrow on: within the forecast's reach. */
const next = (weekday: string) => {
  for (let n = 1; n <= 7; n++) if (dayParts(addDays(today(), n)).weekday === weekday) return addDays(today(), n);
  throw new Error(weekday);
};
/** A group whose owner has a distinctive name, with these places shared onto its list. */
async function crew(name: string, places: { name: string; kind: string; ref: string; lat: number; lon: number }[]) {
  const owner = new Jar();
  const id = await startGroup(owner, name, "Quokkadelia");
  const friend = new Jar();
  await join(friend, id, id, "Wombatrix");
  const api = `/api/groups/${id}`;
  const ids: string[] = [];
  for (const p of places) {
    const res = await request(owner, `${api}/places`, { form: { ...p, lat: String(p.lat), lon: String(p.lon), area: "Parkes", why: "Good on a day out" } });
    ids.push(/added=(\d+)/.exec(res.headers.get("location") ?? "")?.[1] ?? "");
  }
  return { owner, friend, id, api, ids, path: `/g/${id}` };
}
async function plan(c: Awaited<ReturnType<typeof crew>>, day: string, at?: string) {
  const form = new URLSearchParams([["action", "start"], ["day", day], ["order", c.ids.join(",")], ...c.ids.map((v) => ["place", v])]);
  expect((await inPage(c.owner, `${c.api}/plans`, form)).status).toBe(204);
  const planId = (await page(c.owner, c.path)).querySelector<HTMLElement>("#plans [data-plan-id]")?.dataset.planId ?? "";
  if (at) expect((await inPage(c.owner, `${c.api}/plans`, { action: "set", plan: planId, at })).status).toBe(204);
  return planId;
}
/** The plan's card once the background fetch has landed (or the last try). */
async function cardWhen(c: { owner: Jar; path: string }, ready: (card: Element) => boolean, tries = 30) {
  let card: Element | null = null;
  for (let i = 0; i < tries; i++) {
    card = (await page(c.owner, c.path)).querySelector("#plans .plan");
    if (card && ready(card)) return card;
    await new Promise((r) => setTimeout(r, 200));
  }
  return card!;
}
const stubbed = async () => (await fetch(new URL("/api/outing-log", baseUrl))).ok;

describe("the plan's card on the day", () => {
  it("says when a stop closes during the set time", async () => {
    expect(await stubbed(), "start the app with OUTING_STUB=1 for this spec").toBe(true);
    const c = await crew("Hours crew", [{ name: "Stub Museum", kind: "culture", ref: "node/990000001", lat: -35.2985, lon: 149.1313 }]);
    await plan(c, next("Tue"), "960-1080");
    const card = await cardWhen(c, (card) => card.querySelector(".outing__note") !== null);
    expect(card.querySelector(".outing__note")?.textContent?.trim()).toBe("Closes 5pm");
    expect(card.querySelector(".outing__note--warn")).not.toBeNull();
    // (a culture stop is indoors: no forecast)
    expect(card.querySelector(".outing__sky")).toBeNull();
  });

  it("says a stop is closed that weekday, and gives an outdoor stop the forecast", async () => {
    const c = await crew("Monday crew", [{ name: "Stub Gardens", kind: "outdoors", ref: "node/990000002", lat: -35.2783, lon: 149.1093 }]);
    await plan(c, next("Mon"));
    const card = await cardWhen(c, (card) => card.querySelector(".outing__note") !== null && card.querySelector(".outing__sky") !== null);
    expect(card.querySelector(".outing__note--closed")?.textContent?.trim()).toBe("Closed Mondays");
    expect(card.querySelector(".outing__sky")?.textContent?.trim()).toBe("24° · 10% rain");
  });

  it("marks a window whose time the stop won't be open for", async () => {
    const c = await crew("Window crew", [{ name: "Stub Museum", kind: "culture", ref: "node/990000001", lat: -35.2985, lon: 149.1313 }]);
    const id = await plan(c, next("Wed"));
    for (const jar of [c.owner, c.friend]) expect((await inPage(jar, `${c.api}/busy`, { plan: id, free: "all" })).status).toBe(204);
    // free 8am–11pm, a 2h plan from 8am: the museum opens at 9
    const card = await cardWhen(c, (card) => card.querySelector(".win__shut") !== null);
    expect(card.querySelector(".win .win__shut")?.textContent).toBe("Stub Museum opens 9am");
  });

  it("shows the leg between stops, a way to each, and once set the whole route, in the device's maps", async () => {
    const c = await crew("Route crew", [
      { name: "Stub Museum", kind: "culture", ref: "node/990000001", lat: -35.2985, lon: 149.1313 },
      { name: "Stub Gardens", kind: "outdoors", ref: "node/990000002", lat: -35.2783, lon: 149.1093 },
    ]);
    const id = await plan(c, next("Sat"));
    const card = async (userAgent = "Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0") =>
      new JSDOM(await (await fetch(new URL(c.path, baseUrl), { headers: { cookie: c.owner.header, "user-agent": userAgent } })).text()).window.document.querySelector("#plans .plan")!;
    let now = await card();
    expect([...now.querySelectorAll(".outing__stop .outing__name")].map((n) => n.textContent)).toEqual(["Stub Museum", "Stub Gardens"]);
    // 3 km as the crow flies: a drive, said as an estimate
    expect([...now.querySelectorAll(".outing__leg")].map((l) => l.textContent?.replace("Then ", "").trim())).toEqual(["about 8 min drive · 3.9 km"]);
    const ways = [...now.querySelectorAll<HTMLAnchorElement>(".outing__go")];
    expect(ways.map((a) => a.getAttribute("aria-label"))).toEqual([
      "Directions to Stub Museum, in Google Maps (opens in a new tab)",
      "Directions to Stub Gardens, in Google Maps (opens in a new tab)",
    ]);
    for (const a of ways) {
      expect(a.href).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
      expect([a.target, a.rel]).toEqual(["_blank", "noopener"]);
    }
    // the whole route waits for the time
    expect(now.querySelector(".outing__route")).toBeNull();
    expect((await inPage(c.owner, `${c.api}/plans`, { action: "set", plan: id, at: "600-720" })).status).toBe(204);
    now = await card();
    const route = now.querySelector<HTMLAnchorElement>(".outing__route")!;
    expect([route.target, route.rel]).toEqual(["_blank", "noopener"]);
    expect(new URL(route.href).searchParams.get("waypoints")).toBe("-35.298500,149.131300");
    // on an iPhone, Apple Maps
    now = await card("Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148");
    expect(now.querySelector<HTMLAnchorElement>(".outing__route")?.href).toBe(
      "https://maps.apple.com/directions?destination=-35.278300%2C149.109300&waypoint=-35.298500%2C149.131300&mode=driving",
    );
    expect(now.querySelector<HTMLAnchorElement>(".outing__go")?.href).toMatch(/^https:\/\/maps\.apple\.com\/directions\?destination=/);
  });

  it("still draws the card at once when a service fails, and says nothing it doesn't know", async () => {
    // (a place new to each run, so no failure from before is still being waited out)
    const ref = `${STUB_FAIL.ref}${Date.now() % 100000}`;
    const c = await crew("Offline crew", [{ name: "Stub Lookout", kind: "outdoors", ref, lat: STUB_FAIL.lat, lon: 149.0123 }]);
    await plan(c, next("Thu"), "600-720");
    for (let i = 0; i < 3; i++) {
      const started = performance.now();
      const doc = await page(c.owner, c.path);
      expect(performance.now() - started).toBeLessThan(1000);
      expect(doc.querySelector("#plans .plan h3")?.textContent).toBe("Stub Lookout");
      expect(doc.querySelector("#plans .outing__note, #plans .outing__sky")).toBeNull();
      await new Promise((r) => setTimeout(r, 800));
    }
    // (it did ask, and the stub failed it)
    const log = (await (await fetch(new URL("/api/outing-log", baseUrl))).json()) as { url: string; body: string }[];
    expect(log.some((s) => new URLSearchParams(s.body).get("data")?.includes(`node(${ref.slice(5)})`))).toBe(true);
    expect(log.some((s) => s.url.includes(`latitude=${STUB_FAIL.lat}`))).toBe(true);
  });

  it("sends nothing about a member or a group, only places, with the app's name", async () => {
    const c = await crew("Privacy crew Xylophone", [{ name: "Stub Gardens", kind: "outdoors", ref: "node/990000002", lat: -35.2783, lon: 149.1093 }]);
    await plan(c, next("Fri"), "600-720");
    await cardWhen(c, (card) => card.querySelector(".outing__sky") !== null);
    const log = (await (await fetch(new URL("/api/outing-log", baseUrl))).json()) as { url: string; method: string; headers: Record<string, string>; body: string }[];
    expect(log.length).toBeGreaterThan(0);
    for (const sent of log) {
      expect(["overpass-api.de", "api.open-meteo.com"]).toContain(new URL(sent.url).hostname);
      expect(sent.headers["User-Agent"]).toMatch(/^Spots\/1\.0 /);
      expect(Object.keys(sent.headers).map((h) => h.toLowerCase()).sort()).toEqual(sent.method === "POST" ? ["content-type", "user-agent"] : ["user-agent"]);
      const said = decodeURIComponent(`${sent.url} ${sent.body}`.replace(/\+/g, " "));
      for (const secret of ["Quokkadelia", "Wombatrix", "Xylophone", "crew", c.id, "Stub Gardens", "Good on a day out"]) expect(said).not.toContain(secret);
    }
  });
});
