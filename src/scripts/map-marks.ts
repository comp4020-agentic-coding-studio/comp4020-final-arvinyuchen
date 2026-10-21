import type { Kind } from "../lib/catalogue";

// What every Spots map puts over its streets, in the page's own font rather
// than the tiles' lettering: the pins, a few place names, and the credit
// folded behind an "i". The invite's map (src/scripts/minimap.ts) and the
// group's map (src/scripts/map.ts) place them with the code here; the home
// page's drawn map (src/components/HeroMap.astro) wears the same classes
// (.map-mark, .map-label, .fold-credit in src/styles.css), placed when the
// page is built.
//
// A pin is a mark: a white chip with the place's number in its colour (or a
// plain disc in it) and its name when there's room, a small tail, and a dot
// on the place itself. A place that needs no chip is just its dot.

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
export const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/** The square of side 2r round a point. */
export const around = (x: number, y: number, r: number): Box => ({ x0: x - r, x1: x + r, y0: y - r, y1: y + r });

export interface Placing {
  named: boolean;
  shift: number;
  below: boolean;
  /** No room for even its number: just its dot, its chip kept for a hover. */
  bare?: boolean;
}

/**
 * Where each chip goes. A chip sits over its place, slid sideways to stay
 * inside the map (its tail still points at the place). It says its name
 * when that fits; one that would cover another, or anything in `avoid`
 * (the places' dots, the map's own buttons), shrinks to its number. Earlier
 * points choose first. Also returns all it took, for names() to keep clear of.
 */
export function chips(
  points: { x: number; y: number; wide: number }[],
  width: number,
  height: number,
  avoid: Box[] = points.map(({ x, y }) => around(x, y, 6)),
): { placing: Placing[]; taken: Box[] } {
  const taken = [...avoid];
  const placing = points.map(({ x, y, wide }) => {
    const half = (wide + 44) / 2;
    const inside = (s: number) => s + Math.max(6 - (x - half + s), 0) + Math.min(width - 6 - (x + half + s), 0);
    // Centred on its place, else slid so the tail sits near one end.
    const shifts = [...new Set([0, half - 18, 18 - half].map(inside))];
    // Over the place first; under it (the tail pointing up) if that's taken.
    for (const below of [false, true]) {
      for (const shift of shifts) {
        const xs = { x0: x - half + shift, x1: x + half + shift };
        const box = below ? { ...xs, y0: y + 6, y1: y + 40 } : { ...xs, y0: y - 40, y1: y - 6 };
        if (half * 2 < width - 12 && box.y0 > 0 && box.y1 < height && !taken.some((t) => hits(t, box))) {
          taken.push(box);
          return { named: true, shift, below };
        }
      }
    }
    // Just the number: over the place, or under it where a chip's already
    // over it and none is under (covering a dot beats covering a chip). With
    // chips both over and under, it's just its dot.
    const over = { x0: x - 14, x1: x + 14, y0: y - 40, y1: y - 6 };
    const under = { x0: x - 14, x1: x + 14, y0: y + 6, y1: y + 40 };
    const chipped = taken.slice(avoid.length);
    const fits = (box: Box) => box.y0 > 0 && box.y1 < height && !chipped.some((t) => hits(t, box));
    if (!fits(over) && !fits(under)) return { named: false, shift: 0, below: false, bare: true };
    const below = !fits(over) || (taken.some((t) => hits(t, over)) && !taken.some((t) => hits(t, under)) && fits(under));
    taken.push(below ? under : over);
    return { named: false, shift: 0, below };
  });
  return { placing, taken };
}

/**
 * A pin's mark, empty until dress() says what it shows. The mark itself has
 * no size and sits on the place; its chip and dot hang off it, so the dot's
 * centre is on the place whichever way the chip faces.
 */
export function mark(kind: Kind, tag: "div" | "button" = "div") {
  const el = document.createElement(tag);
  el.className = `map-mark spot--${kind}`;
  const drop = document.createElement("span");
  drop.className = "map-drop";
  const chip = document.createElement("span");
  chip.className = "map-chip";
  const dot = document.createElement("span");
  dot.className = "map-dot";
  drop.append(chip, dot);
  el.append(drop);
  return el;
}

/**
 * What a mark shows: its chip with a number (or a plain disc, for null) and
 * the name when `named`, placed as chips() said. With `dot`, only the dot
 * shows; its chip, named, waits for a hover or focus (see .map-mark--dot).
 */
export function dress(
  el: HTMLElement,
  { n, name, placing, dot = false }: { n: number | null; name: string; placing: Placing; dot?: boolean },
) {
  dot ||= Boolean(placing.bare);
  el.classList.toggle("map-mark--dot", dot);
  el.querySelector(".map-drop")?.classList.toggle("is-below", placing.below);
  const chip = el.querySelector<HTMLElement>(".map-chip");
  if (!chip) return;
  chip.style.setProperty("--shift", `${placing.shift}px`);
  const disc = document.createElement("i");
  if (n !== null) disc.textContent = String(n);
  chip.replaceChildren(disc);
  if (placing.named || dot) {
    const b = document.createElement("b");
    b.textContent = name;
    chip.append(b);
  }
}

// Text is measured in the font it's shown in, on one canvas kept for it.
let pen: CanvasRenderingContext2D | null = null;
export function measure(text: string, font: string) {
  pen ??= document.createElement("canvas").getContext("2d");
  if (!pen) return text.length * 7;
  pen.font = font;
  return pen.measureText(text).width;
}

/** The font a chip's name is set in (.map-chip b), for measuring. */
export function chipFont(el: Element) {
  return `700 ${parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.75}px ${getComputedStyle(el).fontFamily}`;
}

export interface Name {
  name: string;
  water?: boolean;
  at: [number, number];
}

/**
 * A few place names, in the page's font, as Apple Maps sets them: quiet
 * grey, the water's in blue italics. Candidates come in the order they're
 * wanted; each is printed only where it's inside the map (clear of its
 * foot, where the credit sits), covers nothing taken and no other name, up
 * to `max` of them. `put` puts a name's element on the map.
 */
export function names(
  candidates: Name[],
  {
    width,
    height,
    taken,
    max,
    font,
    project,
    put,
  }: {
    width: number;
    height: number;
    taken: Box[];
    max: number;
    font: string;
    project: (at: [number, number]) => { x: number; y: number };
    put: (el: HTMLElement, at: [number, number]) => void;
  },
) {
  const used = [...taken];
  const shown: string[] = [];
  for (const c of candidates) {
    if (shown.length >= max) break;
    if (shown.includes(c.name)) continue;
    const { x, y } = project(c.at);
    const half = measure(c.name, `${c.water ? "italic 500" : "600"} 10.5px ${font}`) / 2 + 3;
    const box = { x0: x - half, x1: x + half, y0: y - 8, y1: y + 8 };
    if (box.x0 < 6 || box.x1 > width - 6 || box.y0 < 6 || box.y1 > height - 22) continue;
    if (used.some((t) => hits(t, box))) continue;
    used.push(box);
    shown.push(c.name);
    put(label(c), c.at);
  }
  return shown;
}

/** One place name's element. */
export function label({ name, water }: Name) {
  const el = document.createElement("span");
  el.className = water ? "map-label map-label--water" : "map-label";
  el.textContent = name;
  return el;
}

/**
 * Credits folded behind an "i" in a map's corner open on hover and focus in
 * CSS; a tap opens them too, for a phone that has no hover.
 */
export function fold() {
  for (const credit of document.querySelectorAll<HTMLElement>(".fold-credit:not([data-folds])")) {
    credit.dataset.folds = "";
    credit.querySelector("button")?.addEventListener("click", (event) => {
      const open = credit.classList.toggle("is-open");
      (event.currentTarget as HTMLElement).setAttribute("aria-expanded", String(open));
    });
  }
}
