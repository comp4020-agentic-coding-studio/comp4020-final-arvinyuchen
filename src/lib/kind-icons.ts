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
  // coffee-bean
  coffee: "M214.58,41.42C196.86,23.71,171,16.63,141.81,21.5c-27.74,4.62-55.46,19.62-78.08,42.23S26.12,114.07,21.5,141.81c-4.87,29.21,2.21,55.05,19.92,72.77C55.48,228.64,74.67,236,96.6,236a107.43,107.43,0,0,0,17.59-1.5c27.74-4.62,55.46-19.62,78.08-42.23s37.61-50.34,42.23-78.08C239.37,85,232.29,59.14,214.58,41.42ZM45.17,145.75c3.8-22.84,16.42-45.94,35.53-65S122.91,49,145.75,45.17A82,82,0,0,1,159.27,44a62.77,62.77,0,0,1,18.24,2.57A110.12,110.12,0,0,0,154.62,60.4c-20,15.77-32.88,37.72-38.38,65.25-8.95,44.73-40.3,61.1-62.07,67.09C45.25,180.83,42.06,164.41,45.17,145.75Zm165.66-35.5c-3.8,22.84-16.42,45.94-35.53,65.05S133.09,207,110.25,210.83c-11.65,1.94-22.4,1.41-31.75-1.42a109.42,109.42,0,0,0,22.87-13.81c20-15.77,32.89-37.72,38.39-65.25,9-44.73,40.3-61.1,62.07-67.09C210.75,75.17,213.94,91.59,210.83,110.25Z",
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
