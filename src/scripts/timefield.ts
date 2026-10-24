// A time you can type or turn: the plan sheet's How long and hours, and a busy
// stretch's exact times (src/scripts/plan-start.ts, src/scripts/busy.ts).
// Each part of it (the hour, the minute, am or pm; or, for a length, its
// hours and minutes) takes typing, and a vertical drag on it turns it
// like an iOS wheel: up for later, the hour and the minute apart, the
// minute going round its hour. The arrow keys, and the mouse wheel while
// the field has the focus, nudge it. To the minute, and kept within its
// bounds.
//
// It mustn't fight the sheet's scroll: only the field's own parts take a
// vertical drag (touch-action: none there, and iOS's touchmove stopped
// while one turns); a swipe anywhere else scrolls as ever. A tap on a part
// puts the caret in it to type.
import { formatDuration, formatMinute } from "../lib/when";

export interface TimeField {
  el: HTMLElement;
  readonly value: number;
  /** a new value, kept within the bounds; `tell` calls onChange */
  set(value: number, tell?: boolean): void;
  /** new bounds (the value moves inside them) */
  bounds(min: number, max: number): void;
  focus(): void;
}

interface Options {
  value: number;
  min: number;
  max: number;
  /** what it's for, said with each part: "From", "Starts", "How long" */
  label: string;
  /** a time of day (6:45pm), or a length (2h 30m) */
  kind?: "clock" | "length";
  /** a hidden field of this name carries the value, in minutes */
  name?: string;
  onChange?: (value: number) => void;
}

type Part = "h" | "m" | "p";
/** a finger's travel for one step of the wheel */
const NOTCH = 18;
/** the wheel's travel (trackpads send many small ones) for one step */
const WHEEL = 40;
const pad = (n: number) => String(n).padStart(2, "0");

export function timeField(o: Options): TimeField {
  const clock = (o.kind ?? "clock") === "clock";
  let { min, max } = o;
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));
  let value = clamp(o.value);

  const el = document.createElement("span");
  el.className = `tf${clock ? "" : " tf--length"}`;
  el.setAttribute("role", "group");
  el.setAttribute("aria-label", o.label);
  const input = (part: "h" | "m", what: string) =>
    `<span class="tf__part" data-part="${part}"><input class="tf__in" inputmode="numeric" autocomplete="off" enterkeyhint="done" maxlength="3" role="spinbutton" aria-label="${o.label}, ${what}"><span class="tf__wheel" aria-hidden="true"></span></span>`;
  el.innerHTML = clock
    ? `${input("h", "hour")}<span class="tf__colon" aria-hidden="true">:</span>${input("m", "minutes")}<span class="tf__part" data-part="p"><button type="button" class="tf__in tf__ap" aria-label="${o.label}, am or pm"></button><span class="tf__wheel" aria-hidden="true"></span></span>`
    : `${input("h", "hours")}<span class="tf__unit" aria-hidden="true">h</span>${input("m", "minutes")}<span class="tf__unit" aria-hidden="true">m</span>`;
  let hidden: HTMLInputElement | null = null;
  if (o.name) {
    hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.name = o.name;
    el.append(hidden);
  }
  const hourIn = el.querySelector<HTMLInputElement>('[data-part="h"] input')!;
  const minIn = el.querySelector<HTMLInputElement>('[data-part="m"] input')!;
  const ap = el.querySelector<HTMLButtonElement>(".tf__ap");

  // ---- what each part shows, and what a step of it does ----
  const isPm = (v: number) => Math.floor(v / 60) % 24 >= 12;
  const show = (part: Part, v: number) => {
    if (part === "p") return isPm(v) ? "pm" : "am";
    if (part === "m") return pad(v % 60);
    return clock ? String(Math.floor(v / 60) % 12 || 12) : String(Math.floor(v / 60));
  };
  function step(part: Part, v: number, d: number) {
    if (part === "h") return clamp(v + 60 * d);
    if (part === "p") {
      if (!(d % 2)) return v;
      // (12am at the day's end is midnight, 1440, and 12pm's other half)
      let n = v >= 1440 ? v - 720 : v + (isPm(v) ? -720 : 720);
      if (n < 60 && n + 1440 <= max) n += 1440;
      return clamp(n);
    }
    // (the minute goes round its hour; where that leaves the bounds, it carries)
    const round = Math.floor(v / 60) * 60 + ((((v % 60) + d) % 60) + 60) % 60;
    return round >= min && round <= max ? round : clamp(v + d);
  }
  const said = (v: number) => (clock ? formatMinute(v) : formatDuration(v));

  function render(skip?: Element) {
    if (skip !== hourIn) hourIn.value = show("h", value);
    if (skip !== minIn) minIn.value = show("m", value);
    if (ap) ap.textContent = show("p", value);
    for (const i of [hourIn, minIn]) {
      i.setAttribute("aria-valuetext", said(value));
      i.setAttribute("aria-valuenow", String(value));
    }
    if (hidden) hidden.value = String(value);
  }
  function set(v: number, tell = false, skip?: Element) {
    const next = clamp(v);
    const changed = next !== value;
    value = next;
    render(skip);
    if (changed && tell) o.onChange?.(value);
  }

  // ---- the wheel: the values around this one, shown while it turns ----
  function wheel(part: Part, offset = 0) {
    const box = el.querySelector<HTMLElement>(`[data-part="${part}"] .tf__wheel`)!;
    const rows: string[] = [];
    for (let k = -2; k <= 2; k++) {
      const v = step(part, value, k);
      const same = k !== 0 && v === value;
      rows.push(`<i class="${k === 0 ? "is-on" : ""}">${same ? "" : show(part, v)}</i>`);
    }
    box.innerHTML = `<b style="transform:translateY(${-offset}px)">${rows.join("")}</b>`;
  }

  // ---- a drag on a part turns it ----
  let turn: { part: Part; id: number; y0: number; v0: number; steps: number; moved: boolean } | null = null;
  let turned = false;
  el.addEventListener("pointerdown", (event) => {
    const at = (event.target as Element).closest<HTMLElement>("[data-part]");
    if (!at || event.button > 0) return;
    const part = at.dataset.part as Part;
    turn = { part, id: event.pointerId, y0: event.clientY, v0: value, steps: 0, moved: false };
    turned = false;
    try {
      at.setPointerCapture(event.pointerId);
    } catch {
      // (a pointer the browser no longer knows)
    }
    // (a mouse would select the digits as it drags: a still click is a tap, below)
    if (event.pointerType === "mouse") event.preventDefault();
  });
  el.addEventListener("pointermove", (event) => {
    if (!turn || event.pointerId !== turn.id) return;
    const dy = turn.y0 - event.clientY;
    if (!turn.moved && Math.abs(dy) < 5) return;
    if (!turn.moved) {
      turn.moved = true;
      el.querySelector(`[data-part="${turn.part}"]`)!.classList.add("is-turning");
      el.classList.add("is-turning");
    }
    const steps = Math.round(dy / NOTCH);
    if (steps !== turn.steps) {
      let v = turn.v0;
      for (let k = 0; k < Math.abs(steps); k++) v = step(turn.part, v, Math.sign(steps));
      turn.steps = steps;
      set(v, true);
    }
    wheel(turn.part, dy - steps * NOTCH);
  });
  function end(event: PointerEvent) {
    if (!turn || event.pointerId !== turn.id) return;
    const { part, moved } = turn;
    turn = null;
    el.classList.remove("is-turning");
    el.querySelector(`[data-part="${part}"]`)?.classList.remove("is-turning");
    if (moved) {
      turned = true;
      return;
    }
    // a tap: the caret in it, to type (am/pm is its own button's click)
    if (part !== "p" && event.type === "pointerup") {
      const i = part === "h" ? hourIn : minIn;
      i.focus({ preventScroll: true });
      i.select();
    }
  }
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  // (iOS scrolls the sheet unless the touchmove is stopped, whatever touch-action says)
  el.addEventListener(
    "touchmove",
    (event) => {
      if (turn) event.preventDefault();
    },
    { passive: false },
  );
  el.addEventListener("contextmenu", (event) => {
    if (turn) event.preventDefault();
  });

  // ---- the mouse wheel, while the field has the focus ----
  let wheelled = 0;
  el.addEventListener(
    "wheel",
    (event) => {
      const at = (event.target as Element).closest<HTMLElement>("[data-part]");
      if (!at || !el.contains(document.activeElement)) return;
      event.preventDefault();
      wheelled += event.deltaMode === 1 ? event.deltaY * WHEEL : event.deltaY;
      const steps = Math.trunc(wheelled / WHEEL);
      if (!steps) return;
      wheelled -= steps * WHEEL;
      let v = value;
      for (let k = 0; k < Math.abs(steps); k++) v = step(at.dataset.part as Part, v, Math.sign(steps));
      set(v, true);
    },
    { passive: false },
  );

  // ---- typing ----
  function typed(i: HTMLInputElement) {
    const digits = i.value.replace(/\D/g, "").slice(-2);
    if (i.value !== digits) i.value = digits;
    if (!digits) return;
    const n = Number(digits);
    const m = value % 60;
    if (i === minIn) {
      if (n < 60) set(Math.floor(value / 60) * 60 + n, true, i);
      return;
    }
    let tries: number[];
    if (!clock) tries = [n * 60 + m];
    else if (n > 12) tries = [n * 60 + m];
    else {
      // (in 12-hour time, as it was, am or pm; else the other one)
      const h = (n % 12) + (isPm(value) ? 12 : 0);
      tries = [h ? h * 60 + m : 1440 + m, ((h + 12) % 24) * 60 + m];
    }
    const fits = tries.find((v) => v >= min && v <= max);
    if (fits !== undefined) set(fits, true, i);
    // two digits, or one no hour goes on from, and on to the minutes
    if (digits.length === 2 || (clock ? n > 1 : n * 60 * 10 > max)) {
      minIn.focus({ preventScroll: true });
      minIn.select();
    }
  }
  for (const i of [hourIn, minIn]) {
    i.addEventListener("focus", () => i.select());
    i.addEventListener("input", () => typed(i));
    i.addEventListener("blur", () => render());
    i.addEventListener("keydown", (event) => {
      const part: Part = i === hourIn ? "h" : "m";
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        set(step(part, value, event.key === "ArrowUp" ? 1 : -1), true);
        i.select();
      } else if (event.key === "Enter") {
        // (Enter keeps what's typed, rather than sending the sheet)
        event.preventDefault();
        i.blur();
      }
    });
  }
  ap?.addEventListener("click", () => {
    // (a drag that turned it isn't a tap too)
    if (turned) {
      turned = false;
      return;
    }
    set(step("p", value, 1), true);
  });
  ap?.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (event.key === "ArrowUp" || event.key === "ArrowDown") set(step("p", value, 1), true);
    else if ((key === "a" && isPm(value)) || (key === "p" && !isPm(value))) set(step("p", value, 1), true);
    else return;
    event.preventDefault();
  });

  function limits() {
    for (const i of [hourIn, minIn]) {
      i.setAttribute("aria-valuemin", String(min));
      i.setAttribute("aria-valuemax", String(max));
    }
  }
  limits();
  render();
  return {
    el,
    get value() {
      return value;
    },
    set,
    bounds(lo: number, hi: number) {
      min = lo;
      max = hi;
      limits();
      set(value, true);
    },
    focus: () => hourIn.focus(),
  };
}

/**
 * The same field in place of a plain one (a time input, or a select of
 * minutes): that one leaves the form and the field's own hidden one, of
 * the same name, carries the value as minutes, which the server reads.
 */
export function fieldInstead(plain: HTMLInputElement | HTMLSelectElement, o: Omit<Options, "name">): TimeField {
  const field = timeField({ ...o, name: plain.name });
  plain.disabled = true;
  plain.hidden = true;
  plain.after(field.el);
  return field;
}
