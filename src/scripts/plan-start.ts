// The owner's sheet for a plan (src/components/PlanStart.astro). As a plain
// form, a day is one of the next two weeks' chips or a date typed in the
// browser's own date field. With this script, "Or another date" opens a
// calendar in the sheet itself, in the sheet's own look rather than the
// browser's popup: a month at a time, Monday first, today marked, the
// chosen day in the chips' blue, days gone and days past a year ahead
// out of reach. A chip and the calendar are one choice: the chips keep a
// day of theirs (the date field emptied), and a day further off is the
// date field's, with no chip chosen; the form posts as it always did.
import { addDays, formatDay, isDay } from "../lib/when";

const asDate = (day: string) => new Date(`${day}T12:00:00Z`);
const monthOf = (day: string) => day.slice(0, 7);
// (a month's first day, `n` months on)
function addMonths(month: string, n: number) {
  const d = asDate(`${month}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}
// (the same date in another month, or its last day: the 31st a month on)
function sameDate(month: string, day: string) {
  const end = addDays(`${addMonths(month, 1)}-01`, -1);
  const same = `${month}${day.slice(7)}`;
  return same > end ? end : same;
}
const monthName = new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
const fullDay = new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const still = matchMedia("(prefers-reduced-motion: reduce)");
const chevron = (d: string) =>
  `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>`;

function calendar(form: HTMLFormElement) {
  const other = form.querySelector<HTMLElement>(".days__other");
  const dateField = other?.querySelector<HTMLInputElement>('input[name="date"]');
  const chipStrip = form.querySelector<HTMLElement>(".days");
  if (!other || !dateField || !chipStrip) return;
  const field: HTMLInputElement = dateField;
  const strip: HTMLElement = chipStrip;
  const chips = [...strip.querySelectorAll<HTMLInputElement>('input[name="day"]')];
  const first = field.min;
  const last = field.max;
  if (!isDay(first) || !isDay(last)) return;

  // The date field stays in the form, out of sight; the calendar writes it.
  other.hidden = true;
  other.insertAdjacentHTML(
    "afterend",
    `<button type="button" class="days__more" aria-expanded="false" aria-controls="plan-cal" data-cal-toggle>
      <span>Or another date</span><span class="days__chosen" data-cal-chosen></span>${chevron("m7.5 4.5 5.5 5.5-5.5 5.5")}
    </button>
    <div class="card pcal" id="plan-cal" hidden>
      <div class="pcal__head">
        <button type="button" class="pcal__nav" data-cal-step="-1" aria-label="Previous month">${chevron("m12.5 4.5-5.5 5.5 5.5 5.5")}</button>
        <h3 class="pcal__month" aria-live="polite" data-cal-month></h3>
        <button type="button" class="pcal__nav" data-cal-step="1" aria-label="Next month">${chevron("m7.5 4.5 5.5 5.5-5.5 5.5")}</button>
      </div>
      <div class="pcal__week" aria-hidden="true">${WEEK.map((d) => `<span>${d.slice(0, 1)}</span>`).join("")}</div>
      <div class="pcal__days" role="group" data-cal-days></div>
    </div>`,
  );
  const toggle = form.querySelector<HTMLButtonElement>("[data-cal-toggle]")!;
  const chosenText = form.querySelector<HTMLElement>("[data-cal-chosen]")!;
  const box = form.querySelector<HTMLElement>(".pcal")!;
  const title = box.querySelector<HTMLElement>("[data-cal-month]")!;
  const grid = box.querySelector<HTMLElement>("[data-cal-days]")!;
  const [prev, next] = [...box.querySelectorAll<HTMLButtonElement>("[data-cal-step]")];

  const chosen = () => field.value || chips.find((c) => c.checked)?.value || "";
  // the month showing, and the day the arrow keys are on
  let month = monthOf(chosen() || first);
  let cursor = chosen() || first;
  const inReach = (day: string) => day >= first && day <= last;
  const clampDay = (day: string) => (day < first ? first : day > last ? last : day);

  function render() {
    const day = chosen();
    const off = field.value !== "";
    chosenText.textContent = off ? formatDay(day) + (day.slice(0, 4) !== first.slice(0, 4) ? ` ${day.slice(0, 4)}` : "") : "";
    toggle.classList.toggle("is-chosen", off);
    title.textContent = monthName.format(asDate(`${month}-01`));
    prev.disabled = month <= monthOf(first);
    next.disabled = month >= monthOf(last);
    // (the keys start from the chosen day, or the month's first in reach)
    if (monthOf(cursor) !== month) cursor = day && monthOf(day) === month ? day : clampDay(`${month}-01`);
    const start = asDate(`${month}-01`);
    const lead = (start.getUTCDay() + 6) % 7;
    let h = "<span></span>".repeat(lead);
    for (let d = `${month}-01`; monthOf(d) === month; d = addDays(d, 1)) {
      const can = inReach(d);
      h += `<button type="button" class="pcal__day${d === first ? " is-today" : ""}" data-cal-day="${d}" tabindex="${d === cursor ? 0 : -1}"${can ? "" : " disabled"} aria-pressed="${d === day}"${d === first ? ' aria-current="date"' : ""} aria-label="${fullDay.format(asDate(d))}${d === first ? ", today" : ""}">${Number(d.slice(8))}</button>`;
    }
    grid.innerHTML = h;
  }

  function choose(day: string) {
    const chip = chips.find((c) => c.value === day);
    if (chip) {
      chip.checked = true;
      field.value = "";
      // (the chip comes into sight along its strip)
      const to = chip.closest<HTMLElement>(".days__day");
      if (to) strip.scrollTo({ left: to.offsetLeft - (strip.clientWidth - to.offsetWidth) / 2, behavior: still.matches ? "auto" : "smooth" });
    } else {
      for (const c of chips) c.checked = false;
      field.value = day;
    }
    cursor = day;
    render();
  }

  function show(open: boolean) {
    box.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.classList.toggle("is-open", open);
    if (!open) return;
    month = monthOf(chosen() || first);
    cursor = chosen() || first;
    render();
    // (the sheet's body scrolls it into sight; scrollIntoView would move the sheet itself too)
    const body = form.querySelector<HTMLElement>(".sheet__body");
    if (!body) return;
    const r = box.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    const by = Math.min(r.bottom - b.bottom + 12, r.top - b.top - 12);
    if (by > 0) body.scrollBy({ top: by, behavior: still.matches ? "auto" : "smooth" });
  }

  toggle.addEventListener("click", () => show(toggle.getAttribute("aria-expanded") !== "true"));
  for (const b of [prev, next])
    b.addEventListener("click", () => {
      month = addMonths(month, Number(b.dataset.calStep));
      render();
    });
  grid.addEventListener("click", (event) => {
    const b = (event.target as Element).closest<HTMLButtonElement>("[data-cal-day]");
    if (b && !b.disabled) choose(b.dataset.calDay!);
  });
  // Arrows a day or a week, Page Up and Down a month, Home and End the week's ends.
  grid.addEventListener("keydown", (event) => {
    const b = (event.target as Element).closest<HTMLElement>("[data-cal-day]");
    if (!b) return;
    const at = b.dataset.calDay!;
    const weekday = (asDate(at).getUTCDay() + 6) % 7;
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(at, -1),
      ArrowRight: () => addDays(at, 1),
      ArrowUp: () => addDays(at, -7),
      ArrowDown: () => addDays(at, 7),
      Home: () => addDays(at, -weekday),
      End: () => addDays(at, 6 - weekday),
      PageUp: () => sameDate(addMonths(monthOf(at), -1), at),
      PageDown: () => sameDate(addMonths(monthOf(at), 1), at),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const to = clampDay(move());
    cursor = to;
    month = monthOf(to);
    render();
    grid.querySelector<HTMLElement>(`[data-cal-day="${to}"]`)?.focus();
  });
  // A chip chosen is the calendar's day too.
  strip.addEventListener("change", () => {
    field.value = "";
    cursor = chosen();
    if (!box.hidden) month = monthOf(cursor);
    render();
  });
  form.closest("dialog")?.addEventListener("spots:sheet-open", () => {
    if (!box.hidden) show(true);
    else render();
  });
  render();
}

function enhance(dialog: HTMLDialogElement) {
  const form = dialog.querySelector<HTMLFormElement>("form[data-plan-start]");
  if (!form || form.dataset.enhanced !== undefined) return;
  form.dataset.enhanced = "";
  calendar(form);
}

function enhanceAll() {
  const dialog = document.querySelector<HTMLDialogElement>("dialog#plan-start");
  if (dialog) enhance(dialog);
}
enhanceAll();
// (a live refresh can bring the sheet in anew)
document.addEventListener("spots:refreshed", enhanceAll);
