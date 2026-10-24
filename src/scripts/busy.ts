// When you're busy, drawn on the day (the busy sheet, src/components/
// BusySheet.astro). The sheet is a plain form of From and To rows; with this
// script it's the plan's hours as a timeline you mark busy stretches on,
// and the rows step aside. It writes the same form back (a busy=540-620 for
// each stretch), so saving is the form's own post, in the page or not.
//
// A page you scroll and a day you draw on want the same finger, so the
// gestures keep them apart, as a calendar app does:
// - a swipe scrolls, as anywhere else;
// - a tap on an empty time adds an hour there (or, with a stretch
//   selected, lets go of it); a tap on a stretch selects it;
// - a hold (400ms, the finger still within 8px) then a drag draws a
//   stretch, or moves the one held;
// - a selected stretch has a dot at each end to drag, and a tap on it
//   opens its exact times (and Delete).
// Drawing and dragging go to the minute, and the stretch being moved says
// its from–to on itself as it goes; a tap's hour lands on 5 minutes, since a
// fingertip can't mean one minute. With a mouse, a drag draws straight away.
// On a keyboard the stretches are buttons: arrows move one by a minute (Page
// Up and Down by 15), Shift moves its end instead, Enter opens its exact
// times, Delete takes it off; "+ Exact time" adds one.
// The others are there only as counts: how many of them are free when, a
// strip beside the hours and a band where all of them are, which you can
// hide. Never whose times.
import { mergeIntervals, STEP, type Interval } from "../lib/free";
import { formatDay, formatMinute, formatSpan, localNow } from "../lib/when";

interface Data {
  day: string;
  start: number;
  end: number;
  busy: Interval[];
  others: { from: number; to: number; free: number }[];
  othersAnswered: number;
  set: Interval | null;
}

interface State {
  busy: Interval[];
  /** the selected stretch's index */
  sel: number | null;
  /** a stretch being drawn: where the hold began and where the finger is */
  paint: { from: number; to: number; x: number; ring: boolean } | null;
  /** a stretch's end, or the whole stretch, being dragged */
  drag: { i: number; edge: "s" | "e" | "move"; x: number } | null;
  lift: boolean;
  showOthers: boolean;
  /** pixels to an hour, fitted to the sheet */
  pph: number;
}

const PAD = 10;
const HOLD = 400;
const SLOP = 8;
/** where a tap's hour lands: on 5 minutes */
const TAP = 5;
const still = matchMedia("(prefers-reduced-motion: reduce)");
const t = (m: number) => (m === 1440 ? "12am" : formatMinute(m));

function enhance(dialog: HTMLDialogElement) {
  const form = dialog.querySelector<HTMLFormElement>("[data-busy-sheet]");
  const source = dialog.querySelector("[data-timeline-data]");
  const body = dialog.querySelector<HTMLElement>(".busy");
  if (!form || !source || !body || form.dataset.drawn !== undefined) return;
  form.dataset.drawn = "";
  const data: Data = JSON.parse(source.textContent ?? "{}");
  const { start, end } = data;
  const hours = (end - start) / 60;
  const clamp = (m: number) => Math.min(end, Math.max(start, m));
  const snap = (m: number, step = STEP) => clamp(Math.round(m / step) * step);

  // The rows step aside, out of the form too (a disabled field isn't sent).
  const rows = body.querySelector<HTMLElement>("[data-busy-rows]");
  if (rows) {
    rows.hidden = true;
    for (const field of rows.querySelectorAll<HTMLInputElement>("input, select")) field.disabled = true;
  }
  const freeButton = form.querySelector<HTMLElement>("[data-busy-free]");
  if (freeButton) freeButton.hidden = true;
  const save = form.querySelector<HTMLButtonElement>("[data-busy-save]")!;
  body.classList.add("is-drawn");
  body.insertAdjacentHTML(
    "beforeend",
    `<div class="tl-cap" data-cap></div>
    <div class="tl-box"><div class="tl-scroll"><div class="tl" role="group" aria-label="${formatDay(data.day)}, ${formatSpan(start, end)}"></div></div></div>`,
  );
  save.insertAdjacentHTML(
    "beforebegin",
    `<div class="tl-sum"><span data-sum aria-live="polite"></span><button type="button" class="tl-exact" data-exact>+ Exact time</button></div><div data-busy-out hidden></div>`,
  );
  const tl = body.querySelector<HTMLElement>(".tl")!;
  const scroll = body.querySelector<HTMLElement>(".tl-scroll")!;
  const cap = body.querySelector<HTMLElement>("[data-cap]")!;
  const sum = form.querySelector<HTMLElement>("[data-sum]")!;
  const out = form.querySelector<HTMLElement>("[data-busy-out]")!;

  const S: State = { busy: [], sel: null, paint: null, drag: null, lift: false, showOthers: true, pph: 32 };
  const y = (m: number) => PAD + ((m - start) / 60) * S.pph;
  const minAt = (clientY: number) => start + ((clientY - tl.getBoundingClientRect().top - PAD) / S.pph) * 60;
  const xIn = (e: PointerEvent) => e.clientX - tl.getBoundingClientRect().left;
  // (overlapping or touching stretches become one; `ref` finds the one a time is in after)
  function normalize(ref?: number) {
    S.busy = mergeIntervals(S.busy, { start, end });
    return ref === undefined ? null : S.busy.findIndex(([a, b]) => a <= ref && b > ref);
  }
  const others = data.othersAnswered >= 2 ? data.others : [];
  const now = localNow();
  const nowAt = now.day === data.day && now.minute > start && now.minute < end ? now.minute : null;

  function render() {
    const focused = document.activeElement?.closest<HTMLElement>("[data-blk]") && tl.contains(document.activeElement);
    const W = tl.clientWidth || 320;
    let h = "";
    if (others.length && S.showOthers) {
      const total = data.othersAnswered;
      const tint = (free: number) => Math.round((free / total) ** 1.4 * 100);
      h += `<div class="tl__heat" style="top:${y(start)}px;height:${y(end) - y(start)}px" aria-hidden="true">${others
        .map((g) => `<i style="top:${((g.from - start) / (end - start)) * 100}%;height:${((g.to - g.from) / (end - start)) * 100}%;background:color-mix(in srgb, var(--accent) ${tint(g.free)}%, var(--line))"></i>`)
        .join("")}</div>`;
      for (const [a, b] of mergeIntervals(others.filter((g) => g.free === total).map((g): Interval => [g.from, g.to])))
        h += `<div class="tl__band" style="top:${y(a)}px;height:${y(b) - y(a)}px" aria-hidden="true">${y(b) - y(a) > 18 ? `<span>all ${total} others free</span>` : ""}</div>`;
    }
    // the time under the finger, while drawing or dragging
    let g: number | null = null;
    let gWhat = "";
    if (S.drag) {
      const [a, b] = S.busy[S.drag.i];
      g = S.drag.edge === "e" ? b : a;
      gWhat = S.drag.edge === "move" ? `to ${formatMinute(b)}` : S.drag.edge === "s" ? "starts" : "ends";
    }
    if (S.paint) {
      g = S.paint.to;
      gWhat = `from ${formatMinute(Math.min(S.paint.from, S.paint.to))}`;
    }
    for (let m = Math.ceil(start / 30) * 30; m <= end; m += 30) {
      if (m % 60) {
        h += `<div class="tl__half" style="top:${y(m)}px"></div>`;
        continue;
      }
      const near = (g !== null && Math.abs(y(m) - y(g)) < 12) || (nowAt !== null && Math.abs(y(m) - y(nowAt)) < 12);
      h += `<div class="tl__hr" style="top:${y(m)}px"></div><span class="tl__lbl${near ? " is-dim" : ""}" style="top:${y(m)}px" aria-hidden="true">${t(m)}</span>`;
    }
    if (data.set) h += `<div class="tl__set" style="top:${y(data.set[0])}px"><span>Set · ${formatMinute(data.set[0])}</span></div>`;
    if (nowAt !== null) h += `<div class="tl__now" style="top:${y(nowAt)}px"></div><span class="tl__nowlbl" style="top:${y(nowAt)}px" aria-hidden="true">${t(nowAt)}</span>`;
    S.busy.forEach(([a, b], i) => {
      const tall = y(b) - y(a);
      const sel = i === S.sel;
      const size = tall < 13 ? " is-tiny" : tall < 30 ? " is-one" : "";
      const ends = sel
        ? `<span class="tl__hd tl__hd--t${S.drag?.edge === "s" ? " is-on" : ""}" data-hd="s"></span><span class="tl__hd tl__hd--b${S.drag?.edge === "e" ? " is-on" : ""}" data-hd="e"></span>`
        : "";
      const label = `Busy ${formatSpan(a, b)}${sel ? ", selected. Arrow keys move it a minute, Page Up and Down 15, Shift moves its end, Enter for exact times, Delete takes it off" : ""}`;
      // (the one being moved says its from–to on itself, to the minute)
      const live = S.drag?.i === i ? `<span class="tl__live" aria-hidden="true">${formatSpan(a, b)}</span>` : "";
      h += `<button type="button" class="tl__blk${sel ? " is-sel" : ""}${sel && S.lift ? " is-lift" : ""}${live ? " is-live" : ""}${size}" data-blk="${i}" style="top:${y(a)}px;height:${Math.max(tall, 5)}px" aria-label="${label}"><span class="tl__bt" aria-hidden="true">Busy</span><span class="tl__bs" aria-hidden="true">${formatSpan(a, b)}</span>${live}${ends}</button>`;
    });
    if (S.paint) {
      const a = Math.min(S.paint.from, S.paint.to);
      const b = Math.max(S.paint.from, S.paint.to);
      h += `<div class="tl__blk is-ghost is-live${y(b) - y(a) < 30 ? " is-one" : ""}" style="top:${y(a)}px;height:${Math.max(y(b) - y(a), 5)}px" aria-hidden="true"><span class="tl__bt">Busy</span><span class="tl__bs">${formatSpan(a, b)}</span><span class="tl__live">${formatSpan(a, b)}</span></div>`;
      if (S.paint.ring) h += `<span class="tl__ring" style="left:${S.paint.x}px;top:${y(S.paint.from)}px" aria-hidden="true"></span>`;
    }
    if (g !== null) {
      const fx = S.drag?.x ?? S.paint?.x ?? W / 2;
      const bx = Math.max(64, Math.min(W - 64, fx + 84));
      const below = y(g) - 34 < 50;
      h += `<span class="tl__gline" style="top:${y(g)}px"></span><span class="tl__glbl" style="top:${y(g)}px" aria-hidden="true">${t(g)}</span>`;
      h += `<span class="tl__bubble" style="left:${bx}px;top:${below ? y(g) + 78 : y(g) - 34}px" aria-hidden="true">${formatMinute(g)}<small>${gWhat}</small></span>`;
    }
    if (!S.busy.length && !S.paint)
      h += `<div class="tl__empty"><b>Nothing marked busy</b>Tap a time you're busy.<br>Hold, then drag, to draw a longer stretch.</div>`;
    tl.innerHTML = h;
    if (focused && S.sel !== null) tl.querySelector<HTMLElement>(`[data-blk="${S.sel}"]`)?.focus({ preventScroll: true });

    // The line above it, the sum under it, the button, and the form itself.
    const sel = S.sel !== null ? S.busy[S.sel] : null;
    let line = `<span>${S.busy.length ? "Tap to add an hour · hold and drag to draw" : `${formatSpan(start, end)} · to the minute`}</span>`;
    if (S.paint) line = `<span><b>Drawing ${formatSpan(Math.min(S.paint.from, S.paint.to), Math.max(S.paint.from, S.paint.to))}</b> · let go to keep it</span>`;
    else if (S.drag) line = `<span><b>${formatSpan(...S.busy[S.drag.i])}</b> · let go to keep it</span>`;
    else if (sel) line = `<span><b>${formatSpan(...sel)}</b> · tap it for exact times</span>`;
    if (others.length)
      line += `<button type="button" class="tl-cap__others${S.showOthers ? "" : " is-off"}" data-others aria-pressed="${S.showOthers}"><i aria-hidden="true"></i>Others</button>`;
    cap.innerHTML = line;
    const runs = mergeIntervals(S.busy, { start, end });
    sum.innerHTML = runs.length ? `Busy <b>${runs.map(([a, b]) => formatSpan(a, b)).join(", ")}</b>` : "<b>Nothing marked busy</b>";
    save.textContent = runs.length ? "Save my times" : "I'm free all day";
    out.innerHTML = runs.map(([a, b]) => `<input type="hidden" name="busy" value="${a}-${b}">`).join("");
  }

  // The hours fill the sheet's height, never less than 24px an hour.
  function fit() {
    const room = scroll.clientHeight;
    if (!room) return;
    S.pph = Math.max(24, (room - 2 * PAD) / hours);
    tl.style.height = `${hours * S.pph + 2 * PAD}px`;
  }

  // Each time the sheet opens it starts from what's saved.
  function open() {
    closeEditor();
    S.busy = data.busy.map(([a, b]): Interval => [a, b]);
    S.sel = null;
    S.paint = null;
    S.drag = null;
    gesture = null;
    fit();
    render();
    const first = S.busy[0]?.[0] ?? data.set?.[0] ?? nowAt;
    scroll.scrollTop = first === null || first === undefined ? 0 : Math.max(0, y(first) - 48);
  }

  // ---- Exact times: a small sheet over the sheet ----
  let editor: HTMLElement | null = null;
  function closeEditor() {
    editor?.remove();
    form!.querySelector(".tl-ed__dim")?.remove();
    editor = null;
  }
  function openEditor(i: number, before = S.busy.map(([p, q]): Interval => [p, q]), focus = false) {
    closeEditor();
    const [a, b] = S.busy[i];
    // (every 5 minutes, and the time it's at, which may be any minute)
    const options = (from: number, to: number, value: number) =>
      [...new Set([value, ...Array.from({ length: Math.floor((to - from) / 5) + 1 }, (_, k) => from + k * 5)])]
        .sort((p, q) => p - q)
        .map((m) => `<option value="${m}"${m === value ? " selected" : ""}>${formatMinute(m)}</option>`)
        .join("");
    form!.insertAdjacentHTML(
      "beforeend",
      `<div class="tl-ed__dim"></div><div class="tl-ed" role="group" aria-labelledby="tl-ed-title">
        <div class="tl-ed__bar"><button type="button" data-ed-cancel>Cancel</button><h3 id="tl-ed-title">Busy time</h3><button type="button" class="is-done" data-ed-done>Done</button></div>
        <div class="card tl-ed__rows">
          <label class="tl-ed__row"><span>Starts</span><select data-ed-from>${options(start, end - 1, a)}</select></label>
          <label class="tl-ed__row"><span>Ends</span><select data-ed-to>${options(start + 1, end, b)}</select></label>
        </div>
        <button type="button" class="tl-ed__del" data-ed-del>Delete this busy time</button>
        <p class="tl-ed__note">${formatSpan(start, end)}</p>
      </div>`,
    );
    editor = form!.querySelector<HTMLElement>(".tl-ed");
    const ed = editor!;
    const from = ed.querySelector<HTMLSelectElement>("[data-ed-from]")!;
    const to = ed.querySelector<HTMLSelectElement>("[data-ed-to]")!;
    from.addEventListener("change", () => {
      S.busy[i][0] = Number(from.value);
      if (S.busy[i][1] <= S.busy[i][0]) to.value = String((S.busy[i][1] = Math.min(end, S.busy[i][0] + 60)));
      render();
    });
    to.addEventListener("change", () => {
      S.busy[i][1] = Number(to.value);
      if (S.busy[i][0] >= S.busy[i][1]) from.value = String((S.busy[i][0] = Math.max(start, S.busy[i][1] - 60)));
      render();
    });
    const done = () => {
      S.sel = normalize(S.busy[i][0]);
      closeEditor();
      render();
      tl.querySelector<HTMLElement>(`[data-blk="${S.sel}"]`)?.focus({ preventScroll: true });
    };
    ed.querySelector("[data-ed-done]")!.addEventListener("click", done);
    // (a tap outside it is Done; the click of the tap that opened it, which
    // lands on what's under the finger now, isn't one)
    const dim = form!.querySelector(".tl-ed__dim")!;
    let pressed = false;
    dim.addEventListener("pointerdown", () => (pressed = true));
    dim.addEventListener("click", () => pressed && done());
    ed.querySelector("[data-ed-cancel]")!.addEventListener("click", () => {
      S.busy = before;
      closeEditor();
      render();
      (tl.querySelector<HTMLElement>(`[data-blk="${S.sel}"]`) ?? form!.querySelector<HTMLElement>("[data-exact]"))?.focus({ preventScroll: true });
    });
    ed.querySelector("[data-ed-del]")!.addEventListener("click", () => {
      S.busy.splice(i, 1);
      S.sel = null;
      closeEditor();
      render();
      tl.focus();
    });
    if (focus) from.focus();
  }
  // (Escape closes the little sheet, not the whole one)
  dialog.addEventListener("cancel", (event) => {
    if (!editor) return;
    event.preventDefault();
    editor.querySelector<HTMLElement>("[data-ed-cancel]")?.click();
  });
  form.querySelector("[data-exact]")!.addEventListener("click", () => {
    const len = Math.min(60, end - start);
    const at = clamp(Math.min(Math.max(720, start), end - len));
    // (Cancel takes it off again)
    const before = S.busy.map(([p, q]): Interval => [p, q]);
    S.busy.push([at, at + len]);
    S.sel = normalize(at);
    render();
    openEditor(S.sel!, before, true);
  });
  cap.addEventListener("click", (event) => {
    if (!(event.target as Element).closest("[data-others]")) return;
    S.showOthers = !S.showOthers;
    render();
  });

  // ---- The finger, the mouse and the pen ----
  type Gesture =
    | { kind: "press"; blk: number | null; m: number; x0: number; y0: number; x: number; mouse: boolean; armed: boolean; timer?: number }
    | { kind: "drag"; i: number; edge: "s" | "e" }
    | { kind: "move"; i: number; grab: number; y0: number; moved: boolean };
  let gesture: Gesture | null = null;

  // (no menu or magnifier on a long press, and once a hold has armed, the
  // page doesn't scroll under the drag: iOS needs the touchmove stopped)
  tl.addEventListener("contextmenu", (event) => event.preventDefault());
  tl.addEventListener(
    "touchmove",
    (event) => {
      if (gesture && (gesture.kind !== "press" || gesture.armed)) event.preventDefault();
    },
    { passive: false },
  );
  tl.addEventListener("pointerdown", (event) => {
    if (event.button > 0 || editor) return;
    const target = event.target as Element;
    const hd = target.closest<HTMLElement>("[data-hd]");
    const blk = target.closest<HTMLElement>("[data-blk]");
    const m = minAt(event.clientY);
    try {
      tl.setPointerCapture(event.pointerId);
    } catch {
      // (a pointer the browser no longer knows: nothing to hold on to)
    }
    if (hd && blk) {
      const i = Number(blk.dataset.blk);
      const edge = hd.dataset.hd === "s" ? "s" : "e";
      gesture = { kind: "drag", i, edge };
      S.drag = { i, edge, x: xIn(event) };
      tl.classList.add("is-dragging");
      event.preventDefault();
      render();
      return;
    }
    if (blk && Number(blk.dataset.blk) === S.sel) {
      gesture = { kind: "move", i: S.sel, grab: m - S.busy[S.sel][0], y0: event.clientY, moved: false };
      tl.classList.add("is-dragging");
      return;
    }
    const mouse = event.pointerType === "mouse";
    gesture = { kind: "press", blk: blk ? Number(blk.dataset.blk) : null, m, x0: event.clientX, y0: event.clientY, x: xIn(event), mouse, armed: false };
    if (!mouse) gesture.timer = window.setTimeout(arm, HOLD);
  });
  // A hold that waited: draw from here, or pick up the stretch held.
  function arm() {
    const g = gesture;
    if (!g || g.kind !== "press") return;
    g.armed = true;
    tl.classList.add("is-armed");
    try {
      navigator.vibrate?.(10);
    } catch {
      // (no buzz on this device)
    }
    if (g.blk !== null) {
      S.sel = g.blk;
      S.lift = true;
      gesture = { kind: "move", i: g.blk, grab: g.m - S.busy[g.blk][0], y0: g.y0, moved: true };
      render();
      return;
    }
    const a = Math.min(end - STEP, Math.max(start, Math.floor(g.m / STEP) * STEP));
    S.sel = null;
    S.paint = { from: a, to: a + STEP, x: g.x, ring: !g.mouse && !still.matches };
    render();
  }
  // (near the top or foot of the hours, a drag scrolls them along)
  function edgeScroll(event: PointerEvent) {
    if (scroll.scrollHeight <= scroll.clientHeight) return;
    const box = scroll.getBoundingClientRect();
    if (event.clientY < box.top + 36) scroll.scrollTop -= 8;
    else if (event.clientY > box.bottom - 36) scroll.scrollTop += 8;
  }
  tl.addEventListener("pointermove", (event) => {
    const g = gesture;
    if (!g) return;
    const m = minAt(event.clientY);
    if (g.kind === "press" && !g.armed) {
      const d = Math.hypot(event.clientX - g.x0, event.clientY - g.y0);
      if (g.mouse && d > 4 && g.blk === null) arm();
      else {
        // a finger that moves before the hold is a swipe: let it scroll
        if (!g.mouse && d > SLOP) {
          clearTimeout(g.timer);
          gesture = null;
        }
        return;
      }
    }
    edgeScroll(event);
    if (g.kind === "press" && S.paint) {
      const v = snap(m);
      S.paint.to = v >= S.paint.from ? Math.max(v, S.paint.from + STEP) : v;
      S.paint.x = xIn(event);
      S.paint.ring = false;
      render();
    } else if (g.kind === "drag") {
      const [a, b] = S.busy[g.i];
      const v = snap(m);
      if (g.edge === "s") S.busy[g.i][0] = Math.min(v, b - STEP);
      else S.busy[g.i][1] = Math.max(v, a + STEP);
      S.drag = { i: g.i, edge: g.edge, x: xIn(event) };
      render();
    } else if (g.kind === "move") {
      if (Math.abs(event.clientY - g.y0) > 4) g.moved = true;
      if (!g.moved) return;
      const len = S.busy[g.i][1] - S.busy[g.i][0];
      const a = Math.max(start, Math.min(end - len, snap(m - g.grab)));
      S.busy[g.i] = [a, a + len];
      S.drag = { i: g.i, edge: "move", x: xIn(event) };
      render();
    }
  });
  function finish(cancelled: boolean) {
    const g = gesture;
    if (!g) return;
    gesture = null;
    tl.classList.remove("is-armed", "is-dragging");
    if (g.kind === "press") {
      clearTimeout(g.timer);
      if (g.armed && S.paint) {
        if (!cancelled) {
          const a = Math.min(S.paint.from, S.paint.to);
          const b = Math.max(S.paint.from, S.paint.to);
          S.busy.push([a, b]);
          S.sel = normalize(a);
        }
        S.paint = null;
      } else if (!g.armed && !cancelled) {
        if (g.blk !== null) S.sel = g.blk;
        else if (S.sel !== null) S.sel = null;
        else {
          // a tap: an hour, centred where it landed
          const len = Math.min(60, end - start);
          const a = Math.max(start, Math.min(end - len, snap(g.m - len / 2, TAP)));
          S.busy.push([a, a + len]);
          S.sel = normalize(a);
        }
      }
    } else if (g.kind === "move" && !g.moved) {
      if (!cancelled) {
        render();
        openEditor(g.i);
        return;
      }
    } else {
      S.sel = normalize(S.busy[g.i][0]);
    }
    S.drag = null;
    S.lift = false;
    render();
  }
  tl.addEventListener("pointerup", () => finish(false));
  tl.addEventListener("pointercancel", () => finish(true));

  tl.addEventListener("keydown", (event) => {
    const blk = (event.target as Element).closest<HTMLElement>("[data-blk]");
    if (!blk) return;
    const i = Number(blk.dataset.blk);
    const b = S.busy[i];
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (S.sel === i) openEditor(i, undefined, true);
      else {
        S.sel = i;
        render();
        tl.querySelector<HTMLElement>(`[data-blk="${i}"]`)?.focus();
      }
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      S.busy.splice(i, 1);
      S.sel = null;
      render();
      (tl.querySelector<HTMLElement>(`[data-blk="${Math.max(0, i - 1)}"]`) ?? form!.querySelector<HTMLElement>("[data-exact]"))?.focus();
      return;
    }
    const d = { ArrowUp: -STEP, ArrowDown: STEP, PageUp: -15, PageDown: 15 }[event.key] ?? 0;
    if (!d) return;
    event.preventDefault();
    if (event.shiftKey) b[1] = Math.max(b[0] + STEP, Math.min(end, b[1] + d));
    else {
      // (as far as the hours go)
      const by = Math.max(start - b[0], Math.min(end - b[1], d));
      b[0] += by;
      b[1] += by;
    }
    S.sel = i;
    render();
    tl.querySelector<HTMLElement>(`[data-blk="${i}"]`)?.focus();
  });

  window.addEventListener("resize", () => {
    if (!dialog.open || gesture) return;
    fit();
    render();
  });
  dialog.addEventListener("spots:sheet-open", open);
  if (dialog.open) open();
  else render();
}

function enhanceAll() {
  const dialog = document.querySelector<HTMLDialogElement>("dialog#busy");
  if (dialog) enhance(dialog);
}
enhanceAll();
// (a live refresh can bring the sheet in, or a new one for another plan)
document.addEventListener("spots:refreshed", enhanceAll);
