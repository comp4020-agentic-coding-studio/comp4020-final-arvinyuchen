import type { Kind } from "./kinds";

// A glyph for each kind of place, so the kind reads at a glance beside its
// name: Phosphor's icons (https://phosphoricons.com), in their bold weight,
// the closest to the page's other line icons. One copy for both sides: the
// server draws them in KindIcon.astro, and the scripts that build cards use
// kindIcon() below.
//
// Phosphor Icons is under the MIT License, Copyright (c) 2023 Phosphor
// Icons: the whole notice is in licenses/phosphor-icons.txt.
export const KIND_ICON: Record<Kind, string> = {
  // fork-knife
  food: "M68,88V40a12,12,0,0,1,24,0V88a12,12,0,0,1-24,0ZM220,40V224a12,12,0,0,1-24,0V180H152a12,12,0,0,1-12-12,273.23,273.23,0,0,1,7.33-57.82C157.42,68.42,176.76,40.33,203.27,29A12,12,0,0,1,220,40ZM196,62.92C182.6,77,175,98,170.77,115.38A254.41,254.41,0,0,0,164.55,156H196ZM128,39A12,12,0,0,0,104,41l4,47.46a28,28,0,0,1-56,0L56,41A12,12,0,1,0,32,39L28,87c0,.34,0,.67,0,1a52.1,52.1,0,0,0,40,50.59V224a12,12,0,0,0,24,0V138.59A52.1,52.1,0,0,0,132,88c0-.33,0-.66,0-1Z",
  // coffee
  coffee: "M212,76H32A12,12,0,0,0,20,88v48a100.24,100.24,0,0,0,26.73,68H32a12,12,0,0,0,0,24H208a12,12,0,0,0,0-24H193.27a100.75,100.75,0,0,0,20-32A44,44,0,0,0,256,128v-8A44.05,44.05,0,0,0,212,76Zm-16,60a76.27,76.27,0,0,1-42,68H86a76.27,76.27,0,0,1-42-68V100H196Zm36-8a20,20,0,0,1-12.57,18.55A97.17,97.17,0,0,0,220,136V101.68A20,20,0,0,1,232,120ZM68,48V24a12,12,0,0,1,24,0V48a12,12,0,0,1-24,0Zm40,0V24a12,12,0,0,1,24,0V48a12,12,0,0,1-24,0Zm40,0V24a12,12,0,0,1,24,0V48a12,12,0,0,1-24,0Z",
  // martini
  drinks: "M243.09,35.41A12,12,0,0,0,232,28H24a12,12,0,0,0-8.48,20.49L116,149v55H88a12,12,0,0,0,0,24h80a12,12,0,0,0,0-24H140V149L240.48,48.49A12,12,0,0,0,243.09,35.41ZM203,52,191,64H65L53,52Zm-75,75L89,88H167Z",
  // tree-evergreen
  outdoors: "M233.47,184.63,192.54,132H208a12,12,0,0,0,9.51-19.32l-80-104a12,12,0,0,0-19,0l-80,104A12,12,0,0,0,48,132H63.46L22.53,184.63A12,12,0,0,0,32,204h84v36a12,12,0,0,0,24,0V204h84a12,12,0,0,0,9.47-19.37ZM56.54,180l40.93-52.63A12,12,0,0,0,88,108H72.37L128,35.68,183.63,108H168a12,12,0,0,0-9.47,19.37L199.46,180Z",
  // bank: a building with columns, a museum's or a gallery's
  culture: "M24,108H44v48H32a12,12,0,0,0,0,24H224a12,12,0,0,0,0-24H212V108h20a12,12,0,0,0,6.29-22.22l-104-64a12,12,0,0,0-12.58,0l-104,64A12,12,0,0,0,24,108Zm44,0H92v48H68Zm72,0v48H116V108Zm48,48H164V108h24ZM128,46.09,189.6,84H66.4ZM252,208a12,12,0,0,1-12,12H16a12,12,0,0,1,0-24H240A12,12,0,0,1,252,208Z",
  // ticket, for a thing to do
  fun: "M232,108a12,12,0,0,0,12-12V64a20,20,0,0,0-20-20H32A20,20,0,0,0,12,64V96a12,12,0,0,0,12,12,20,20,0,0,1,0,40,12,12,0,0,0-12,12v32a20,20,0,0,0,20,20H224a20,20,0,0,0,20-20V160a12,12,0,0,0-12-12,20,20,0,0,1,0-40ZM36,170.34a44,44,0,0,0,0-84.68V68H88V188H36Zm184,0V188H112V68H220V85.66a44,44,0,0,0,0,84.68Z",
};

// (Phosphor draws on a 256-unit square, in shapes filled with the text's colour)
export const VIEW_BOX = "0 0 256 256";

// The same glyph as an element, for markup a script builds (the map's
// popup). Decorative: the kind's name always stands beside it.
export function kindIcon(kind: Kind): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "kind-icon");
  svg.setAttribute("viewBox", VIEW_BOX);
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", KIND_ICON[kind]);
  svg.append(path);
  return svg;
}
