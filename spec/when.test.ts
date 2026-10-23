import { describe, expect, it } from "vitest";
import { addDays, dayParts, formatDay, formatDuration, formatMinute, formatSpan, isDay, localNow, today } from "../src/lib/when";

// Plans live on Canberra's clock while the server runs on UTC. These check
// the helpers on their own, with the moment passed in.
describe("Canberra's clock on a UTC server", () => {
  it("gives Canberra's date, not the server's, around midnight", () => {
    // 1:30pm UTC on the 23rd is half past midnight on the 24th in Canberra (AEDT, +11)
    expect(localNow(new Date("2026-10-23T13:30:00Z"))).toEqual({ day: "2026-10-24", minute: 30 });
    expect(today(new Date("2026-10-23T12:59:00Z"))).toBe("2026-10-23");
    // in winter (AEST, +10)
    expect(localNow(new Date("2026-07-01T14:00:00Z"))).toEqual({ day: "2026-07-02", minute: 0 });
  });

  it("follows the clocks across daylight saving", () => {
    // Sunday 4 October 2026: 2am AEST becomes 3am AEDT
    expect(localNow(new Date("2026-10-03T15:59:00Z"))).toEqual({ day: "2026-10-04", minute: 119 });
    expect(localNow(new Date("2026-10-03T16:00:00Z"))).toEqual({ day: "2026-10-04", minute: 180 });
    // Sunday 4 April 2027: 3am AEDT goes back to 2am AEST
    expect(localNow(new Date("2027-04-03T15:59:00Z"))).toEqual({ day: "2027-04-04", minute: 179 });
    expect(localNow(new Date("2027-04-03T16:00:00Z"))).toEqual({ day: "2027-04-04", minute: 120 });
  });

  it("counts calendar days, whatever the clocks do", () => {
    expect(addDays("2026-10-03", 1)).toBe("2026-10-04");
    expect(addDays("2026-10-04", 1)).toBe("2026-10-05");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-10-24", -30)).toBe("2026-09-24");
  });

  it("knows a real date from a made-up one", () => {
    expect(isDay("2026-10-24")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("24/10/2026")).toBe(false);
    expect(isDay("")).toBe(false);
  });

  it("says days and times the way people do", () => {
    expect(dayParts("2026-10-24")).toEqual({ weekday: "Sat", date: 24, month: "Oct" });
    expect(formatDay("2026-10-24")).toBe("Sat 24 Oct");
    expect(formatMinute(840)).toBe("2pm");
    expect(formatMinute(855)).toBe("2:15pm");
    expect(formatMinute(720)).toBe("12pm");
    expect(formatMinute(545)).toBe("9:05am");
    expect(formatMinute(1440)).toBe("midnight");
    expect(formatSpan(855, 1000)).toBe("2:15–4:40pm");
    expect(formatSpan(620, 690)).toBe("10:20–11:30am");
    expect(formatSpan(660, 810)).toBe("11am–1:30pm");
    expect(formatSpan(1200, 1440)).toBe("8pm–midnight");
    expect(formatDuration(15)).toBe("15 min");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(145)).toBe("2h 25m");
  });
});
