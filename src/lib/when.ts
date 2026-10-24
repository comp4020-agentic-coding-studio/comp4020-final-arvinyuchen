// Time as the group lives it: Canberra's wall clock. The server runs on UTC
// (Fly), so "today" and "now" are always asked of Australia/Sydney, never of
// the machine. A plan keeps its day as a local date ("2026-10-24") and its
// times as minutes since that day's local midnight (840 is 2pm), never as
// instants: 2pm on the day is 2pm whatever daylight saving does. Plans only
// count times from 6am to midnight, so the hour the clocks skip or repeat
// (2am to 3am, in October and April) never falls inside one.
export const ZONE = "Australia/Sydney";

const parts = new Intl.DateTimeFormat("en-AU", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The local date and minute of the day in Canberra at `now`. */
export function localNow(now = new Date()): { day: string; minute: number } {
  const p = Object.fromEntries(parts.formatToParts(now).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute) };
}

/** Today's date in Canberra, as "YYYY-MM-DD". */
export const today = (now = new Date()) => localNow(now).day;

const ymd = /^(\d{4})-(\d{2})-(\d{2})$/;
// (a date as a calendar day, at UTC noon so no zone can tip it over)
const asDate = (day: string) => {
  const m = ymd.exec(day);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)) : null;
};

/** Whether `day` is a real calendar date written "YYYY-MM-DD". */
export const isDay = (day: string) => {
  const d = asDate(day);
  return d !== null && d.toISOString().slice(0, 10) === day;
};

/** The date `n` days after `day` (calendar days, whatever the clocks do). */
export function addDays(day: string, n: number): string {
  const d = asDate(day);
  if (!d) throw new Error(`not a day: ${day}`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * A time of day as a form sends it: minutes since midnight ("540"), or a
 * clock as a time field writes it ("09:00", "09:00:00"). As the end of a
 * stretch, "00:00" (or "24:00") is the midnight the day ends on, 1440.
 * Null if it's neither.
 */
export function parseMinute(text: string, end = false): number | null {
  const s = text.trim();
  if (/^\d{1,4}$/.test(s)) return Number(s);
  const m = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(s);
  if (!m) return null;
  const minute = Number(m[1]) * 60 + Number(m[2]);
  if (Number(m[2]) > 59 || minute > 1440) return null;
  return end && minute === 0 ? 1440 : minute;
}

/** A minute of the day as a time field's value: "09:05" ("00:00" for midnight). */
export const clockOf = (minute: number) =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A day's parts for a calendar page: "Sat", 24, "Oct". */
export function dayParts(day: string): { weekday: string; date: number; month: string } {
  const d = asDate(day);
  if (!d) throw new Error(`not a day: ${day}`);
  return { weekday: WEEKDAYS[d.getUTCDay()], date: d.getUTCDate(), month: MONTHS[d.getUTCMonth()] };
}

/** "Sat 24 Oct". */
export function formatDay(day: string): string {
  const { weekday, date, month } = dayParts(day);
  return `${weekday} ${date} ${month}`;
}

/** A minute of the day as people say it: "2pm", "2:15pm", "12pm", "midnight". */
export function formatMinute(minute: number, withPeriod = true): string {
  if (minute === 1440 && withPeriod) return "midnight";
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const clock = `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
  return withPeriod ? clock + (h < 12 ? "am" : "pm") : clock;
}

/** A stretch of the day: "2:15–4:40pm", "11am–1:30pm" (the period once when both share it). */
export function formatSpan(from: number, to: number): string {
  const samePeriod = to < 1440 && Math.floor(from / 720) === Math.floor(to / 720);
  return `${samePeriod ? formatMinute(from, false) : formatMinute(from)}–${formatMinute(to)}`;
}

/** How long: "15 min", "2h", "2h 25m". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
