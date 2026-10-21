import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// The invite card's map (src/components/MiniMap.astro). The page draws a
// still map of the first places; this lays the real street map over it,
// restyled to a calm, Apple Maps-like look so the pins are what you see,
// and drops the pins when the map comes into view, not on a timer that's run
// out before anyone has scrolled down to it. If the street map can't load
// (no WebGL, no tiles), the drawn one stays.

interface Pin {
  n: number;
  name: string;
  kind: "food" | "fun" | "outdoors";
  lat: number;
  lon: number;
}

// See scripts/copy-maplibre-worker.mjs.
maplibregl.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");

const STYLE = "https://tiles.openfreemap.org/styles/positron";
type PaintKey = Parameters<maplibregl.Map["setPaintProperty"]>[1];

// The Apple Maps-like look: a warm neutral ground, fresh parks, clear blue
// water, white streets with pale yellow highways, the hills in soft relief,
// and the map's own lettering swapped for a few names in the page's own font
// (drawn as HTML by names() below, so they're SF on Apple devices).
const APPLE: [string, PaintKey, string | number][] = [
  ["background", "background-color", "#f4f3ef"],
  ["landuse_residential", "fill-color", "#efede8"],
  ["park", "fill-color", "#cde6bd"],
  ["park", "fill-opacity", 1],
  ["landcover_wood", "fill-color", "#cde6bd"],
  ["landcover_wood", "fill-opacity", 1],
  ["water", "fill-color", "#a3d0ef"],
  ["waterway", "line-color", "#a3d0ef"],
  ["building", "fill-color", "#e6e3dc"],
  ["aeroway-area", "fill-color", "#e9e7e1"],
  ...["highway_minor", "highway_path", "highway_major_inner", "highway_major_subtle"].map(
    (id): [string, PaintKey, string] => [id, "line-color", "#ffffff"],
  ),
  ["highway_major_casing", "line-color", "#dedad2"],
  ...["highway_motorway_inner", "highway_motorway_subtle", "highway_motorway_bridge_inner"].map(
    (id): [string, PaintKey, string] => [id, "line-color", "#fadb8b"],
  ),
  ...["highway_motorway_casing", "highway_motorway_bridge_casing"].map((id): [string, PaintKey, string] => [
    id,
    "line-color",
    "#e6bf62",
  ]),
];
// Elevation for the relief: Mapzen's terrain tiles, open on AWS.
const TERRAIN = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png";

// Line widths as they show on the card, in pixels: hairline side streets,
// clear main roads, highways a little wider, as Apple Maps draws a city.
const WIDTH: [string, number][] = [
  ["highway_minor", 0.7],
  ["highway_major_casing", 2.8],
  ["highway_major_inner", 1.9],
  ["highway_motorway_casing", 3.8],
  ["highway_motorway_inner", 2.8],
  ["highway_motorway_bridge_casing", 3.8],
  ["highway_motorway_bridge_inner", 2.8],
  ["waterway", 0.8],
  ["railway", 0.8],
];

function apple(map: maplibregl.Map, k: number) {
  for (const layer of map.getStyle().layers)
    if (layer.type === "symbol") map.setLayoutProperty(layer.id, "visibility", "none");
  for (const id of ["highway_path", "railway_dashline", "aeroway-taxiway"])
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
  for (const [id, key, value] of APPLE) if (map.getLayer(id)) map.setPaintProperty(id, key, value);
  // The map is drawn k times bigger than it shows (see DETAIL), so its lines are too.
  for (const [id, width] of WIDTH) if (map.getLayer(id)) map.setPaintProperty(id, "line-width", width / k);
  map.setPaintProperty("railway", "line-color", "#d3d0c8");
  map.addSource("relief", {
    type: "raster-dem",
    tiles: [TERRAIN],
    encoding: "terrarium",
    tileSize: 256,
    maxzoom: 14,
  });
  map.addLayer(
    {
      id: "relief",
      type: "hillshade",
      source: "relief",
      paint: {
        "hillshade-exaggeration": 0.5,
        "hillshade-shadow-color": "rgba(74, 66, 48, 0.32)",
        "hillshade-highlight-color": "rgba(255, 255, 255, 0.45)",
        "hillshade-accent-color": "rgba(0, 0, 0, 0)",
      },
    },
    "waterway",
  );
}

// A few names, in the page's font: the lake's, then suburbs, each only
// where it covers no pin and no other name.
function names(holder: HTMLElement, pen: CanvasRenderingContext2D, proj: Project, put: Put) {
  const width = holder.clientWidth;
  const height = holder.clientHeight;
  const frame = holder.getBoundingClientRect();
  const taken: Box[] = [...holder.querySelectorAll(".minimap__marker")].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      x0: r.left - frame.left - 8,
      x1: r.right - frame.left + 8,
      y0: r.top - frame.top - 4,
      y1: r.bottom - frame.top + 4,
    };
  });
  const places: { name: string; water: boolean; lat: number; lon: number }[] = JSON.parse(
    holder.closest<HTMLElement>(".minimap")?.dataset.places ?? "[]",
  );
  const candidates = places.map((p) => ({
    name: p.name,
    water: p.water,
    at: [p.lon, p.lat] as [number, number],
  }));
  let shown = 0;
  for (const c of candidates) {
    if (shown >= 5) break;
    const { x, y } = proj(c.at);
    pen.font = `${c.water ? "italic 500" : "600"} 10.5px ${getComputedStyle(holder).fontFamily}`;
    const half = pen.measureText(c.name).width / 2 + 3;
    const box = { x0: x - half, x1: x + half, y0: y - 8, y1: y + 8 };
    if (box.x0 < 6 || box.x1 > width - 6 || box.y0 < 6 || box.y1 > height - 22) continue;
    if (taken.some((t) => hits(t, box))) continue;
    taken.push(box);
    shown++;
    const el = document.createElement("span");
    el.className = c.water ? "minimap__place minimap__place--water" : "minimap__place";
    el.textContent = c.name;
    put(el, c.at, "center");
  }
}
interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

// A chip sits over its place, slid sideways to stay inside the map (its
// tail still points at the place). It says its name when that fits; one
// that would cover another shrinks to its number.
function chips(
  points: { x: number; y: number; wide: number }[],
  width: number,
  height: number,
): { named: boolean; shift: number; below: boolean }[] {
  const taken: Box[] = points.map(({ x, y }) => ({
    x0: x - 6,
    x1: x + 6,
    y0: y - 6,
    y1: y + 6,
  }));
  return points.map(({ x, y, wide }) => {
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
    taken.push({ x0: x - 14, x1: x + 14, y0: y - 40, y1: y });
    return { named: false, shift: 0, below: false };
  });
}

function chip(pin: Pin, named: boolean, shift: number, below: boolean) {
  const el = document.createElement("div");
  el.className = `minimap__marker spot--${pin.kind}`;
  const drop = document.createElement("div");
  drop.className = "minimap__drop";
  drop.classList.toggle("is-below", below);
  drop.style.setProperty("--n", String(pin.n));
  const body = document.createElement("span");
  body.className = "minimap__chip";
  body.style.setProperty("--shift", `${shift}px`);
  const n = document.createElement("i");
  n.textContent = String(pin.n);
  body.append(n);
  if (named) {
    const name = document.createElement("b");
    name.textContent = pin.name;
    body.append(name);
  }
  const dot = document.createElement("span");
  dot.className = "minimap__dot";
  drop.append(body, dot);
  el.append(drop);
  return el;
}

// OpenStreetMap's tiles only carry side streets from about zoom 13 (and
// buildings from 14), and a few places across Canberra fit the card at 10
// or 11. So the street map is drawn that close on a canvas as many times
// bigger, then shrunk to the card: the same view, with every street in it.
const DETAIL = 13.4;

// The zoom at which the bounds fill the box (Web Mercator, 512px tiles).
function zoomFor(bounds: maplibregl.LngLatBounds, width: number, height: number, pad: { x: number; y: number }) {
  const x = (lon: number) => (lon + 180) / 360;
  const y = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
  const dx = Math.max(x(bounds.getEast()) - x(bounds.getWest()), 1e-6);
  const dy = Math.max(y(bounds.getSouth()) - y(bounds.getNorth()), 1e-6);
  return Math.min(14, Math.log2(Math.min((width - pad.x) / (dx * 512), (height - pad.y) / (dy * 512))));
}

type Project = (at: [number, number]) => { x: number; y: number };
type Anchor = "center" | "top" | "bottom";
type Put = (el: HTMLElement, at: [number, number], anchor: Anchor, offset?: [number, number]) => void;
const SHIFT: Record<Anchor, string> = {
  center: "-50% -50%",
  top: "-50% 0",
  bottom: "-50% -100%",
};

for (const figure of document.querySelectorAll<HTMLElement>(".minimap")) {
  const below = figure.getBoundingClientRect().top > innerHeight * 0.8;
  if (below) {
    // Its pins wait until it's on screen; then they come quickly.
    figure.classList.add("is-waiting");
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        figure.style.setProperty("--after", "-0.4s");
        figure.style.setProperty("--live-wait", "0.15s");
        figure.classList.remove("is-waiting");
        seen.disconnect();
      },
      { threshold: 0.6 },
    );
    seen.observe(figure);
  }

  const holder = figure.querySelector<HTMLElement>(".minimap__live");
  const pins: Pin[] = JSON.parse(figure.dataset.pins ?? "[]");
  if (!holder || pins.length === 0) continue;

  figure.classList.add("is-pending");
  const giveUp = () => figure.classList.remove("is-pending");
  const late = setTimeout(giveUp, 6000);
  let map = build(figure, holder, pins, () => {
    clearTimeout(late);
    giveUp();
  });
  if (!map) {
    clearTimeout(late);
    giveUp();
    continue;
  }

  // The map is drawn to the card's size, so when that changes (a phone
  // turned, a scrollbar come or gone, the panel beside the invite growing)
  // it's drawn again, its pins already in.
  let size = [holder.clientWidth, holder.clientHeight];
  let again: ReturnType<typeof setTimeout>;
  new ResizeObserver(() => {
    const now = [holder.clientWidth, holder.clientHeight];
    if ((Math.abs(now[0] - size[0]) < 2 && Math.abs(now[1] - size[1]) < 2) || !map) return;
    size = now;
    clearTimeout(again);
    again = setTimeout(() => {
      map?.remove();
      holder.replaceChildren();
      figure.classList.remove("is-live");
      figure.classList.add("is-settled");
      map = build(figure, holder, pins, () => {});
    }, 250);
  }).observe(holder);
}

// Draws the street map into the holder, puts the pins and names over it, and
// calls done once it's all on screen. Without WebGL it returns nothing.
function build(figure: HTMLElement, holder: HTMLElement, pins: Pin[], done: () => void): maplibregl.Map | undefined {
  try {
    const bounds = pins.reduce((b, p) => b.extend([p.lon, p.lat]), new maplibregl.LngLatBounds());
    const padding = { top: 56, bottom: 28, left: 36, right: 36 };
    const w = holder.clientWidth;
    const h = holder.clientHeight;
    const k = Math.min(1, 2 ** (zoomFor(bounds, w, h, { x: 72, y: 84 }) - DETAIL));
    // The canvas, k times the card's size the other way, scaled down to it;
    // pins and names go on a layer over it at the card's own size.
    const canvas = document.createElement("div");
    canvas.className = "minimap__gl";
    Object.assign(canvas.style, {
      width: `${w / k}px`,
      height: `${h / k}px`,
      transform: `scale(${k})`,
    });
    const over = document.createElement("div");
    over.className = "minimap__over";
    holder.append(canvas, over);
    const map = new maplibregl.Map({
      container: canvas,
      style: STYLE,
      interactive: false,
      attributionControl: false,
      pixelRatio: devicePixelRatio * k,
    });
    const scaled = {
      top: padding.top / k,
      bottom: padding.bottom / k,
      left: padding.left / k,
      right: padding.right / k,
    };
    map.fitBounds(bounds, {
      padding: scaled,
      maxZoom: 16,
      duration: 0,
    });
    const proj: Project = (at) => {
      const p = map.project(at);
      return { x: p.x * k, y: p.y * k };
    };
    const put: Put = (el, at, anchor, offset = [0, 0]) => {
      const { x, y } = proj(at);
      Object.assign(el.style, {
        left: `${x + offset[0]}px`,
        top: `${y + offset[1]}px`,
        translate: SHIFT[anchor],
      });
      over.append(el);
    };
    map.once("load", () => {
      apple(map, k);
      // Names are measured in the font they're shown in.
      const pen = document.createElement("canvas").getContext("2d")!;
      pen.font = `700 ${parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.75}px ${getComputedStyle(figure).fontFamily}`;
      const placing = chips(
        pins.map((pin) => ({ ...proj([pin.lon, pin.lat]), wide: pen.measureText(pin.name).width })),
        holder.clientWidth,
        holder.clientHeight,
      );
      // The dot's centre is on the place: 4px up from the marker's bottom.
      pins.forEach((pin, i) => {
        const { named, shift, below } = placing[i];
        put(chip(pin, named, shift, below), [pin.lon, pin.lat], below ? "top" : "bottom", [0, below ? -4 : 4]);
      });
      // The pins drop after the card has reached the map, or right away if
      // the map arrived later than that.
      if (!figure.classList.contains("is-waiting")) {
        const after = parseFloat(getComputedStyle(figure).getPropertyValue("--after")) || 0;
        const now = (document.timeline.currentTime as number) / 1000;
        figure.style.setProperty("--live-wait", `${Math.max(0.15, after + 0.55 - now)}s`);
      }
      map.once("idle", () => {
        names(holder, pen, proj, put);
        figure.classList.add("is-live");
        done();
      });
    });
    return map;
  } catch {
    return undefined;
  }
}
