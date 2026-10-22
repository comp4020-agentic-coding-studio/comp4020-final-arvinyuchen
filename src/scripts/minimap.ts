import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Kind } from "../lib/kinds";
import { look, quiet, STYLE, WIDTH } from "./map-look";
import { chipFont, chips, dress, fold, mark, measure, names, type Name } from "./map-marks";

// The invite card's map (src/components/MiniMap.astro). The page draws a
// still map of the first places; this lays the real street map over it, in
// Spots' map look (src/scripts/map-look.ts) with its lettering swapped for a
// few names in the page's own font, so the pins are what you see. Its pins,
// names and credit are the ones every Spots map wears (map-marks.ts). It
// drops the pins when the map comes into view, not on a timer that's run
// out before anyone has scrolled down to it. If the street map can't load (no
// WebGL, no tiles), the drawn one stays.

interface Pin {
  n: number;
  name: string;
  kind: Kind;
  lat: number;
  lon: number;
}

// See scripts/copy-maplibre-worker.mjs.
maplibregl.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");

// The card's own touches on the shared look: no map lettering (names()
// prints a few in the page's font instead) and lines as fine as they show.
function apple(map: maplibregl.Map, k: number) {
  quiet(map);
  look(map);
  // The map is drawn k times bigger than it shows (see DETAIL), so its lines are too.
  for (const [id, width] of WIDTH) if (map.getLayer(id)) map.setPaintProperty(id, "line-width", width / k);
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

fold();

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
    const proj = (at: [number, number]) => {
      const p = map.project(at);
      return { x: p.x * k, y: p.y * k };
    };
    // Marks and names have no size of their own (see .map-mark, .map-label):
    // each goes on its place, centred there.
    const put = (el: HTMLElement, at: [number, number]) => {
      const { x, y } = proj(at);
      Object.assign(el.style, { left: `${x}px`, top: `${y}px` });
      over.append(el);
    };
    map.once("load", () => {
      apple(map, k);
      const font = chipFont(figure);
      const { placing, taken } = chips(
        pins.map((pin) => ({ ...proj([pin.lon, pin.lat]), wide: measure(pin.name, font) })),
        holder.clientWidth,
        holder.clientHeight,
      );
      pins.forEach((pin, i) => {
        const el = mark(pin.kind);
        dress(el, { n: pin.n, name: pin.name, placing: placing[i] });
        const drop = el.querySelector<HTMLElement>(".map-drop")!;
        drop.classList.add("is-dropping");
        drop.style.setProperty("--n", String(pin.n));
        put(el, [pin.lon, pin.lat]);
      });
      // The pins drop after the card has reached the map, or right away if
      // the map arrived later than that.
      if (!figure.classList.contains("is-waiting")) {
        const after = parseFloat(getComputedStyle(figure).getPropertyValue("--after")) || 0;
        const now = (document.timeline.currentTime as number) / 1000;
        figure.style.setProperty("--live-wait", `${Math.max(0.15, after + 0.55 - now)}s`);
      }
      map.once("idle", () => {
        // A few names: the lake's, then suburbs, each clear of the pins
        // (with a little room round them) and of each other.
        const places: { name: string; water: boolean; lat: number; lon: number }[] = JSON.parse(
          figure.dataset.places ?? "[]",
        );
        names(
          places.map((p): Name => ({ name: p.name, water: p.water, at: [p.lon, p.lat] })),
          {
            width: holder.clientWidth,
            height: holder.clientHeight,
            taken: taken.map((t) => ({ x0: t.x0 - 8, x1: t.x1 + 8, y0: t.y0 - 4, y1: t.y1 + 4 })),
            max: 5,
            font: getComputedStyle(holder).fontFamily,
            project: proj,
            put,
          },
        );
        figure.classList.add("is-live");
        done();
      });
    });
    return map;
  } catch {
    return undefined;
  }
}
