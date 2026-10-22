import type { Kind } from "./kinds";

// A line glyph for each kind of place, drawn on a 20-unit square in the
// weight of the page's other icons, so the kind reads at a glance beside
// its name. One copy for both sides: the server draws them in KindIcon.astro,
// and the scripts that build cards use kindIcon() below.
export const KIND_ICON: Record<Kind, string> = {
  // a fork and a knife
  food: "M3.5 2.5V7a2 2 0 0 0 4 0V2.5m-2 0v15m8 0v-15c2 1 3 3.2 3 6v3h-3",
  // a cup on its saucer (steam turns to smudges this small)
  coffee: "M3.5 6.5h10v5a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4v-5Zm10 1.5h1a2.3 2.3 0 0 1 0 4.6h-1.3M2.5 17.5h13",
  // a cocktail glass
  drinks: "M3.5 3.5h13L10 10.5 3.5 3.5Zm6.5 7v6.5m-3.5 0h7",
  // a tree
  outdoors: "M10 2.5 5.5 8.5H8L4 14h12l-4-5.5h2.5L10 2.5Zm0 11.5v3.5",
  // a building with columns, a museum's or a gallery's
  culture: "M2.5 7 10 2.5 17.5 7h-15ZM5 9.5V15m5-5.5V15m5-5.5V15M2.5 17.5h15",
  // a ticket, for a thing to do (its tear line solid: dots run together
  // this small)
  fun: "M4 5h12a1.5 1.5 0 0 1 1.5 1.5V8a2 2 0 0 0 0 4v1.5A1.5 1.5 0 0 1 16 15H4a1.5 1.5 0 0 1-1.5-1.5V12a2 2 0 0 0 0-4V6.5A1.5 1.5 0 0 1 4 5Zm8.5 3v4",
};

// How every kind glyph is drawn: lines, not shapes, with rounded ends.
export const STROKE = {
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "1.7",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
} as const;

// The same glyph as an element, for markup a script builds (the map's
// popup). Decorative: the kind's name always stands beside it.
export function kindIcon(kind: Kind): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "kind-icon");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", KIND_ICON[kind]);
  for (const [k, v] of Object.entries(STROKE)) path.setAttribute(k, v);
  svg.append(path);
  return svg;
}
