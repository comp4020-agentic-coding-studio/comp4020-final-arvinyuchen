import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Photo } from "../lib/catalogue";
import { KIND_ART } from "../lib/kind-art";
import { kindIcon } from "../lib/kind-icons";
import { KIND_LABEL, type Kind } from "../lib/kinds";
import { buildings, fine, letters, look, quiet, STYLE } from "./map-look";
import { around, type Box, chipFont, chips, dress, fold, mark, measure, names, type Name } from "./map-marks";

// The Explore map. Every shared place with a location gets a pin; clicking a
// card (or a place on our list) flies the map to that place: a zoom and a
// tilt into the street, then its card opens. The pins come from the #pins
// JSON inside #explore, so when the page refreshes itself live (a new shared
// place), the pins follow.
//
// It wears the invite map's look (map-look.ts) and its marks (map-marks.ts):
// a place on the group's list is a white chip with its number on the list
// and, where there's room, its name; the rest of Explore are dots, named on
// a hover. A few place names are printed in the page's font in place of the
// tiles' lettering, and the lines stay as fine as the invite's at the city's
// zooms, widening as the camera comes down into a street.

interface Pin {
  id: number;
  name: string;
  kind: Kind;
  area: string;
  lat: number;
  lon: number;
  /** its own photo, or null for its kind's picture */
  photo: string | null;
}

// See scripts/copy-maplibre-worker.mjs.
maplibregl.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");

const CANBERRA: [number, number] = [149.128, -35.285];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// The map's flights can be switched off, on the map itself (its own button
// under the zoom), for anyone they make dizzy; it's remembered on this
// device. Off, or with reduced motion asked for, the map jumps.
const MOTION_KEY = "spots:map-motion";
let motionOff = false;
try {
  motionOff = localStorage.getItem(MOTION_KEY) === "off";
} catch {}
const still = () => motionOff || reducedMotion.matches;
const move = () => (still() ? { duration: 0 } : {});

interface Found {
  ref: string;
  name: string;
  detail: string;
  area: string;
  kind: Kind;
  lat: number;
  lon: number;
  photo?: Photo | null;
}

/** The map's button that switches its flights off and on. */
class MotionControl implements maplibregl.IControl {
  private box?: HTMLElement;
  onAdd() {
    this.box = document.createElement("div");
    this.box.className = "maplibregl-ctrl maplibregl-ctrl-group map-motion";
    const button = document.createElement("button");
    button.type = "button";
    const draw = () => {
      button.setAttribute("aria-pressed", String(!motionOff));
      button.title = motionOff ? "Map animation off: tap to turn it on" : "Map animation on: tap to turn it off";
      button.setAttribute("aria-label", "Map animation");
    };
    button.innerHTML = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path class="map-motion__on" d="M3 7.5c2.5-2 4.5 2 7 0s4.5-2 7 0M3 12.5c2.5-2 4.5 2 7 0s4.5-2 7 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path class="map-motion__off" d="M3 7.5h14M3 12.5h14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
    button.addEventListener("click", () => {
      motionOff = !motionOff;
      try {
        localStorage.setItem(MOTION_KEY, motionOff ? "off" : "on");
      } catch {}
      draw();
    });
    draw();
    this.box.append(button);
    return this.box;
  }
  onRemove() {
    this.box?.remove();
  }
}
const container = document.getElementById("map");

// The one lettering of the tiles' own the map keeps: street names, which
// show only once the camera is down among the streets, where they're what
// says where you are. Lettering along a street can't be set in the page's
// font; every other name is (see label() below).
const STREET_NAMES = ["highway-name-minor", "highway-name-major"];

// Which places the map names, most important first: the water, then the
// city, then its towns and suburbs by OpenMapTiles' own rank, then their
// neighbourhoods.
const PLACE_RANK: Record<string, number> = { city: 0, town: 1, village: 1, suburb: 1, quarter: 2, neighbourhood: 2 };

fold();

if (container) {
  // The pins wait for the map, then drop onto it (see .is-waiting).
  container.classList.add("is-waiting");
  const ready = () => container.classList.remove("is-waiting");
  setTimeout(ready, 5000);
  const map = new maplibregl.Map({
    container,
    style: STYLE,
    center: CANBERRA,
    zoom: 11.3,
    attributionControl: false,
    cooperativeGestures: true,
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new MotionControl(), "top-right");
  // Spots' map look (src/scripts/map-look.ts), with buildings that stand up
  // as the map flies down into a street.
  map.once("load", () => {
    quiet(map, STREET_NAMES);
    look(map);
    fine(map);
    letters(map);
    buildings(map);
    // Across the city it's the suburbs that say where you are; a main
    // road's name waits until the camera is close enough to read it.
    map.setLayerZoomRange("highway-name-major", 14, 24);
    dotsLayer();
    ready();
  });

  // Every place the map shows is in `pins`. Hundreds of them are only
  // dots, so those are drawn by the map itself (a circle layer, "spots-dots"),
  // and only the places that need more are marks over it: those on our
  // list, the place flown to, and a dot under the pointer, which becomes a
  // mark for its hover name and its click.
  const pins = new Map<number, Pin>();
  const markers = new Map<number, { marker: maplibregl.Marker; pin: Pin; el: HTMLElement }>();
  let hovered: number | null = null;
  const readPins = (): Pin[] => {
    try {
      return JSON.parse(document.getElementById("pins")?.textContent ?? "[]");
    } catch {
      return [];
    }
  };

  // Where each place stands on our list, from #list, which a live refresh
  // keeps current and in rank order: a chip shows that number.
  const readList = () => {
    const items = [...document.querySelectorAll<HTMLElement>("#list .picks > li")];
    const order = new Map<number, number>();
    items.forEach((li, i) => {
      if (li.dataset.place) order.set(Number(li.dataset.place), i);
    });
    return { order };
  };
  let list = readList();
  const number = (id: number) => (list.order.has(id) ? list.order.get(id)! + 1 : null);

  // Two ways to look, switched on the map (its top left): Our list, the
  // group's places as numbered chips with their names and nothing else;
  // Explore, every place as a dot, gathered across the city. Apart, they
  // don't cover each other. A list row, an Explore card, a search or a
  // kind chip turns the map to its own; it opens on Explore when the
  // address asks for one (a search, a kind, "Near your plan") or the list
  // is empty, on Our list otherwise.
  type Mode = "list" | "explore";
  const asking = /[?&](q|kind|near)\b/.test(location.search);
  let mode: Mode = asking || list.order.size === 0 ? "explore" : "list";

  // The place the map has flown to gets a card: its chip grown into one.
  // Where the map is big, a callout on its dot, in the chip's place; on a
  // phone's short map the chip stays on the dot, filled with its kind's
  // colour, and the card sits inside the map's foot with the one thing to
  // do there (keen, or Add), so it never covers the place or runs off the
  // map. Apple's place cards do the same: a callout on a big map, a card at
  // the foot of a small one.
  const narrow = window.matchMedia("(max-width: 860px)");
  const frame = container.parentElement!;
  // (the keyboard's focus stays where it was: the card is the next stop after the pins)
  const popup = new maplibregl.Popup({ anchor: "bottom", offset: 10, closeButton: false, focusAfterOpen: false, maxWidth: "18rem" });
  popup.on("close", () => {
    for (const { el } of markers.values()) el.classList.remove("is-open");
  });
  let opened: number | null = null;
  let dock: HTMLElement | null = null;
  // (each place's row on Our list and its card in Explore, as the page has them now)
  const row = (id: number) => document.querySelector<HTMLElement>(`#list .picks > li[data-place="${id}"]`);
  const spot = (id: number) => document.querySelector<HTMLElement>(`.spots--explore .spot[data-place="${id}"]`);

  const card = (pin: Pin, docked: boolean) => {
    // Names and suburbs are typed by people, so they go in as text, never HTML.
    const box = document.createElement("div");
    box.className = `map-pop spot--${pin.kind}${docked ? " map-pop--docked" : ""}`;
    const n = number(pin.id);
    const keen = row(pin.id)?.querySelector(".keen__count")?.textContent?.trim();
    // A click on the card shows the place's card in Explore.
    const main = document.createElement("button");
    main.type = "button";
    main.className = "map-pop__main";
    const photo = document.createElement("span");
    photo.className = "map-pop__photo";
    // Its own photo, or its kind's picture, the kind's icon in the corner as
    // on Our list (the line beside it names the kind).
    const src = pin.photo ?? KIND_ART[pin.kind]?.src;
    if (src) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      img.decoding = "async";
      photo.append(img);
    }
    const badge = document.createElement("span");
    badge.className = "map-pop__badge";
    badge.append(kindIcon(pin.kind));
    photo.append(badge);
    const text = document.createElement("span");
    text.className = "map-pop__text";
    const name = document.createElement("strong");
    name.className = "map-pop__name";
    name.textContent = pin.name;
    const meta = document.createElement("span");
    meta.className = "map-pop__meta";
    const kind = document.createElement("span");
    kind.className = "map-pop__kind";
    kind.textContent = KIND_LABEL[pin.kind];
    meta.append(kind, pin.area ? ` · ${pin.area}` : "");
    text.append(name, meta);
    if (n !== null) {
      const status = document.createElement("span");
      status.className = "map-pop__status";
      const disc = document.createElement("i");
      disc.textContent = String(n);
      // (on a phone the keen button beside it says how many)
      status.append(disc, docked || !Number(keen) ? "On our list" : `On our list · ${keen} keen`);
      text.append(status);
    }
    main.append(photo, text);
    if (!docked) {
      const go = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      go.setAttribute("class", "map-pop__go");
      go.setAttribute("viewBox", "0 0 12 12");
      go.setAttribute("aria-hidden", "true");
      go.innerHTML = '<path d="M4 1.5 8.5 6 4 10.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
      main.append(go);
    }
    main.addEventListener("click", (event) => {
      // (not a click on the map behind it, which would put the card away)
      event.stopPropagation();
      reveal(pin.id);
    });
    box.append(main);
    // The one thing to do from the map, on a phone: the list row's own keen
    // button, or Explore's Add, copied, so they post as they always do (the
    // page's own script sends a keen in the background).
    if (docked) {
      const form = (n !== null ? row(pin.id)?.querySelector("form[data-keen]") : spot(pin.id)?.querySelector(".spot__actions form"))?.cloneNode(true) as HTMLFormElement | undefined;
      if (form) {
        form.classList.add("map-pop__act");
        const add = n === null && form.querySelector("button");
        if (add) {
          add.textContent = "Add";
          add.setAttribute("aria-label", `Add ${pin.name} to our list`);
        }
        box.append(form);
      }
    }
    return box;
  };

  // Its card in Explore, brought into view: in its column on a wide screen,
  // at the top of the box under the map on a phone (the page doesn't scroll
  // there), and without the script's tabs under the stuck map.
  function reveal(id: number, asked = false) {
    const target = spot(id);
    if (!target) {
      // (Explore shows a page of cards: the page asks for this one's first)
      if (!asked) document.dispatchEvent(new CustomEvent("spots:at", { detail: id }));
      return;
    }
    const behavior = reducedMotion.matches ? "auto" : "smooth";
    const box = target.closest<HTMLElement>(".explore-scroll");
    const boxed = box !== null && getComputedStyle(box).overflowY !== "visible";
    if (!narrow.matches || boxed) {
      target.scrollIntoView({ behavior, block: boxed ? "start" : "nearest" });
      return;
    }
    const under = frame.closest(".map-wrap")?.getBoundingClientRect().bottom ?? 0;
    window.scrollBy({ top: target.getBoundingClientRect().top - under - 12, behavior });
  }

  // On a phone the card keeps above the tab bar, and the credit's "i" above the card.
  const tabs = document.querySelector<HTMLElement>(".section-nav.tabs");
  function clear() {
    if (!dock) return;
    const bar = tabs && getComputedStyle(tabs).position === "fixed" ? tabs.getBoundingClientRect().top : Infinity;
    const under = Math.max(0, Math.min(container!.getBoundingClientRect().bottom - bar, container!.clientHeight / 3));
    frame.style.setProperty("--map-clear", `${under}px`);
    frame.style.setProperty("--map-card", `${dock.offsetHeight}px`);
  }
  let clearing = 0;
  window.addEventListener("scroll", () => {
    if (!dock || clearing) return;
    clearing = requestAnimationFrame(() => {
      clearing = 0;
      clear();
    });
  }, { passive: true });

  function open(id: number) {
    const entry = markers.get(id);
    if (!entry) return;
    opened = id;
    if (narrow.matches) {
      popup.remove();
      entry.el.classList.add("is-picked");
      const next = card(entry.pin, true);
      next.classList.add("map-card");
      next.setAttribute("role", "group");
      next.setAttribute("aria-label", entry.pin.name);
      // (a refresh redraws it in place; only a newly picked place rises in)
      if (dock?.dataset.card !== String(id)) next.classList.add("is-rising");
      next.dataset.card = String(id);
      // (and whatever in it had the keyboard's focus keeps it)
      const focused = dock?.contains(document.activeElement)
        ? document.activeElement?.closest(".map-pop__act") ? ".map-pop__act button" : ".map-pop__main"
        : null;
      if (dock) dock.replaceWith(next);
      else frame.append(next);
      dock = next;
      if (focused) dock.querySelector<HTMLElement>(focused)?.focus({ preventScroll: true });
      frame.classList.add("has-card");
      clear();
    } else {
      dock?.remove();
      dock = null;
      frame.classList.remove("has-card");
      popup.setLngLat([entry.pin.lon, entry.pin.lat]).setDOMContent(card(entry.pin, false)).addTo(map);
      // (after: adding a popup that's open closes it first, and that clears the class)
      entry.el.classList.add("is-open");
    }
    place();
  }
  function close() {
    opened = null;
    popup.remove();
    dock?.remove();
    dock = null;
    frame.classList.remove("has-card");
    for (const { el } of markers.values()) el.classList.remove("is-open", "is-picked");
    place();
  }
  // A tap on the map, or Escape, puts the card away.
  map.on("click", () => {
    if (opened !== null) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && opened !== null) close();
  });
  // (turning a tablet round can cross from one to the other)
  narrow.addEventListener("change", () => {
    if (opened !== null) {
      for (const { el } of markers.values()) el.classList.remove("is-open", "is-picked");
      open(opened);
    }
  });

  // Marks are plain elements over the map, so they can go on before the
  // first frame renders (a tab opened in the background renders nothing yet).
  let first = true;
  const needsMark = (id: number) => (mode === "list" && list.order.has(id)) || id === active || id === opened || id === hovered;
  function addMark(pin: Pin, drop: number | null) {
    const el = mark(pin.kind, "button");
    (el as HTMLButtonElement).type = "button";
    el.setAttribute("aria-label", `${pin.name}, on the map`);
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      fly(pin.id);
    });
    el.addEventListener("mouseleave", () => {
      if (hovered !== pin.id) return;
      hovered = null;
      prune();
    });
    const listed = list.order.has(pin.id);
    dress(el, {
      n: number(pin.id),
      name: pin.name,
      placing: { named: !listed, shift: 0, below: false },
      dot: !listed,
    });
    if (drop !== null) {
      const falling = el.querySelector<HTMLElement>(".map-drop")!;
      falling.classList.add("is-dropping");
      falling.style.setProperty("--drop-delay", `${0.15 + Math.min(drop, 24) * 0.035}s`);
      falling.addEventListener("animationend", () => falling.classList.remove("is-dropping"), { once: true });
    }
    const marker = new maplibregl.Marker({ element: el }).setLngLat([pin.lon, pin.lat]).addTo(map);
    const entry = { marker, pin, el };
    markers.set(pin.id, entry);
    return entry;
  }
  // (a place that no longer needs its mark is a dot again)
  function prune() {
    for (const [id, { marker }] of markers) {
      if (pins.has(id) && needsMark(id)) continue;
      marker.remove();
      markers.delete(id);
    }
  }
  const ensure = (id: number) => markers.get(id) ?? (pins.has(id) ? addMark(pins.get(id)!, null) : undefined);
  const sync = () => {
    list = readList();
    pins.clear();
    for (const pin of readPins()) pins.set(pin.id, pin);
    prune();
    // The first marks drop in once the map is there, in our list's order;
    // a place put on the list while someone's looking simply appears.
    const listed = [...pins.values()].filter((pin) => needsMark(pin.id)).sort((a, b) => (list.order.get(a.id) ?? 99) - (list.order.get(b.id) ?? 99));
    listed.forEach((pin, i) => {
      if (!markers.has(pin.id)) addMark(pin, first ? i : null);
    });
    first = false;
    drawDots();
    applyFilter();
  };

  // The dots, in Explore: every place the map shows (of the kind chosen),
  // our list's too, in its kind's colour with a white ring, as .map-dot draws
  // a mark's dot. Across the city they gather into counts (the map's own
  // clustering, "spots-dots"), until the camera is down among the suburbs.
  const colour = (kind: Kind) => getComputedStyle(document.documentElement).getPropertyValue(`--${kind}`).trim() || "#c93400";
  const GATHER_UNTIL = 13;
  const dotData = (): maplibregl.GeoJSONSourceSpecification["data"] => ({
    type: "FeatureCollection",
    features: [...pins.values()]
      .filter((pin) => mode === "explore" && (filter === "all" || pin.kind === filter))
      .map((pin) => ({
        type: "Feature",
        id: pin.id,
        properties: { id: pin.id, kind: pin.kind, colour: colour(pin.kind) },
        geometry: { type: "Point", coordinates: [pin.lon, pin.lat] },
      })),
  });
  function dotsLayer() {
    if (map.getSource("spots-dots")) return;
    map.addSource("spots-dots", {
      type: "geojson",
      data: dotData(),
      cluster: true,
      clusterRadius: 56,
      clusterMinPoints: 3,
      clusterMaxZoom: GATHER_UNTIL,
      // (how many of each kind, for the icons on a gathering's chip)
      clusterProperties: Object.fromEntries(
        (Object.keys(KIND_LABEL) as Kind[]).map((k) => [k, ["+", ["case", ["==", ["get", "kind"], k], 1, 0]]]),
      ),
    });
    map.addLayer({
      id: "spots-dots",
      type: "circle",
      source: "spots-dots",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ["get", "colour"],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 14, 5.5],
        "circle-stroke-color": "#fff",
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 14, 2],
      },
    });
    // (the gatherings drawn at this zoom, unseen, for gather() to read)
    map.addLayer({
      id: "spots-gathered",
      type: "circle",
      source: "spots-dots",
      filter: ["has", "point_count"],
      paint: { "circle-radius": 14, "circle-opacity": 0 },
    });
    map.on("idle", gather);
    // A dot under the pointer becomes a mark, which shows its name and
    // takes the click; on a touch screen a tap flies straight to it.
    map.on("mousemove", "spots-dots", (event) => {
      const id = Number(event.features?.[0]?.properties?.id);
      if (!Number.isFinite(id) || id === hovered || markers.has(id)) return;
      hovered = id;
      prune();
      ensure(id);
    });
    map.on("click", "spots-dots", (event) => {
      const id = Number(event.features?.[0]?.properties?.id);
      if (Number.isFinite(id)) fly(id);
    });
  }
  function drawDots() {
    (map.getSource("spots-dots") as maplibregl.GeoJSONSource | undefined)?.setData(dotData());
  }

  // A gathering (three or more) is a mark like a chip, in the page's font:
  // the kinds it holds most of (three, and "+2" for the rest), each a disc
  // in its colour with its icon, then how many places, quieter than our list's numbered chips. A tap zooms
  // in to where it comes apart.
  const gatherings = new Map<number, { marker: maplibregl.Marker; el: HTMLButtonElement }>();
  function gather() {
    const source = map.getSource("spots-dots") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const seen = new Set<number>();
    for (const f of map.queryRenderedFeatures({ layers: ["spots-gathered"] })) {
      const id = Number(f.properties?.cluster_id);
      if (seen.has(id)) continue;
      seen.add(id);
      const count = Number(f.properties?.point_count);
      const at = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
      const held = (Object.keys(KIND_LABEL) as Kind[])
        .map((kind) => ({ kind, n: Number(f.properties?.[kind]) || 0 }))
        .filter(({ n }) => n > 0)
        .sort((a, b) => b.n - a.n);
      const had = gatherings.get(id);
      if (had) {
        had.marker.setLngLat(at);
        dressGathering(had.el, count, held);
        continue;
      }
      const el = document.createElement("button");
      el.type = "button";
      el.className = "map-gather";
      dressGathering(el, count, held);
      el.addEventListener("click", async (event) => {
        event.stopPropagation();
        const zoom = await source.getClusterExpansionZoom(id);
        map.easeTo({ center: at, zoom: Math.max(zoom, map.getZoom() + 1), ...move() });
      });
      gatherings.set(id, { marker: new maplibregl.Marker({ element: el }).setLngLat(at).addTo(map), el });
    }
    for (const [id, { marker }] of gatherings) {
      if (seen.has(id)) continue;
      marker.remove();
      gatherings.delete(id);
    }
  }
  function dressGathering(el: HTMLButtonElement, count: number, held: { kind: Kind; n: number }[]) {
    // (the three it holds most of; any more, a "+2" disc after them)
    const icons: Element[] = held.slice(0, 3).map(({ kind }) => {
      const icon = kindIcon(kind);
      icon.style.setProperty("--kind", `var(--${kind})`);
      return icon;
    });
    if (held.length > 3) {
      const more = document.createElement("i");
      more.className = "map-gather__more";
      more.textContent = `+${held.length - 3}`;
      icons.push(more);
    }
    const n = document.createElement("span");
    n.textContent = String(count);
    el.replaceChildren(...icons, n);
    el.setAttribute("aria-label", `${count} places here (${held.map(({ kind, n: k }) => `${k} ${KIND_LABEL[kind]}`).join(", ")}): zoom in`);
  }
  let dotsFor = "all";
  function filterDots() {
    // (a kind gathers only its own places, so it's the data that changes)
    if (filter === dotsFor) return;
    dotsFor = filter;
    for (const { marker } of gatherings.values()) marker.remove();
    gatherings.clear();
    drawDots();
  }

  // What the chips and names keep clear of, besides each other: the map's
  // zoom buttons, its two modes' switch and its credit's "i".
  const controls = (): Box[] => {
    const frame = container.getBoundingClientRect();
    return [
      ...container.querySelectorAll(".maplibregl-ctrl-group, .map-mode"),
      ...(container.parentElement?.querySelectorAll(".fold-credit__info") ?? []),
    ].map((el) => {
      const r = el.getBoundingClientRect();
      return { x0: r.left - frame.left - 4, x1: r.right - frame.left + 4, y0: r.top - frame.top - 4, y1: r.bottom - frame.top + 4 };
    });
  };

  // Which chips have room to say their names depends on what's on screen,
  // so it's worked out again each time the map comes to rest.
  let taken: Box[] = [];
  function place() {
    const width = container!.clientWidth;
    const height = container!.clientHeight;
    const font = chipFont(container!);
    const shown = [...markers.values()]
      .filter(({ el }) => el.style.display !== "none")
      .map((entry) => ({ ...entry, at: map.project([entry.pin.lon, entry.pin.lat]) }))
      .filter(({ at }) => at.x > -40 && at.x < width + 40 && at.y > -40 && at.y < height + 40);
    const listed = shown
      .filter(({ pin }) => list.order.has(pin.id))
      .sort((a, b) => list.order.get(a.pin.id)! - list.order.get(b.pin.id)!);
    const dots = (map.getLayer("spots-dots") ? map.queryRenderedFeatures({ layers: ["spots-dots"] }) : []).map((f) =>
      map.project((f.geometry as unknown as { coordinates: [number, number] }).coordinates),
    );
    const gathered = [...gatherings.values()].map(({ marker }) => map.project(marker.getLngLat()));
    const placed = chips(
      listed.map(({ pin, at }) => ({ x: at.x, y: at.y, wide: measure(pin.name, font) })),
      width,
      height,
      [...shown.map(({ at }) => around(at.x, at.y, 6)), ...dots.map((at) => around(at.x, at.y, 6)), ...gathered.map((at) => around(at.x, at.y, narrow.matches ? 16 : 22)), ...controls()],
    );
    // (a picked place's chip, filled with its colour above its card, always says its name)
    listed.forEach(({ pin, el }, i) => {
      const picked = pin.id === opened && el.classList.contains("is-picked");
      dress(el, { n: number(pin.id), name: pin.name, placing: picked ? { ...placed.placing[i], named: true, bare: false } : placed.placing[i] });
    });
    for (const { pin, el } of shown) {
      if (list.order.has(pin.id)) continue;
      dress(el, { n: null, name: pin.name, placing: { named: true, shift: 0, below: false }, dot: true });
    }
    taken = placed.taken;
  }

  // A few names, from the tiles but in the page's font: the water's, then
  // the city's and its suburbs', as many as the map has room for, each clear
  // of the pins and of each other. Each is a marker, so it moves with the
  // map; while the zoom changes they fade, and come back sorted afresh.
  const labels = new Map<string, maplibregl.Marker>();
  function label() {
    const width = container!.clientWidth;
    const height = container!.clientHeight;
    // A place's name goes on its point; a lake's on the middle of the line
    // the tiles give it to be lettered along.
    const point = ({ geometry: g }: maplibregl.GeoJSONFeature): [number, number] | null => {
      if (g.type === "Point") return g.coordinates as [number, number];
      const line: number[][] | null =
        g.type === "LineString" ? g.coordinates : g.type === "MultiLineString" ? g.coordinates[0] : null;
      if (!line || line.length < 2) return null;
      const steps = line.slice(1).map((p, i) => Math.hypot(p[0] - line[i][0], p[1] - line[i][1]));
      let left = steps.reduce((a, b) => a + b, 0) / 2;
      for (const [i, step] of steps.entries()) {
        if (left <= step) {
          const t = step === 0 ? 0 : left / step;
          return [line[i][0] + (line[i + 1][0] - line[i][0]) * t, line[i][1] + (line[i + 1][1] - line[i][1]) * t];
        }
        left -= step;
      }
      return null;
    };
    const candidates: (Name & { rank: number })[] = [];
    for (const f of map.querySourceFeatures("openmaptiles", { sourceLayer: "water_name" })) {
      const at = point(f);
      const name = String(f.properties.name_en ?? f.properties.name ?? "");
      if (at && name) candidates.push({ name, water: true, at, rank: -1 });
    }
    for (const f of map.querySourceFeatures("openmaptiles", { sourceLayer: "place" })) {
      const at = point(f);
      const name = String(f.properties.name_en ?? f.properties.name ?? "");
      const rank = PLACE_RANK[String(f.properties.class)];
      if (at && name && rank !== undefined) candidates.push({ name, at, rank: rank * 100 + Number(f.properties.rank ?? 50) });
    }
    candidates.sort((a, b) => a.rank - b.rank);
    const keep = new Set<string>();
    names(candidates, {
      width,
      height,
      taken: [...taken.map((t) => ({ x0: t.x0 - 8, x1: t.x1 + 8, y0: t.y0 - 4, y1: t.y1 + 4 })), ...controls()],
      max: Math.round(Math.min(8, Math.max(3, (width * height) / 40000))),
      font: getComputedStyle(container!).fontFamily,
      project: (at) => map.project(at),
      put: (el, at) => {
        const name = el.textContent ?? "";
        keep.add(name);
        const had = labels.get(name);
        if (had) had.setLngLat(at);
        else labels.set(name, new maplibregl.Marker({ element: el, anchor: "top-left" }).setLngLat(at).addTo(map));
      },
    });
    for (const [name, marker] of labels) {
      if (keep.has(name)) continue;
      marker.remove();
      labels.delete(name);
    }
    container!.classList.remove("is-zooming");
  }
  map.on("zoomstart", () => container.classList.add("is-zooming"));
  map.on("moveend", place);
  map.on("resize", place);
  map.on("idle", () => {
    place();
    label();
  });

  let active: number | null = null;
  // The place the map is on: its card in Explore and its row on Our list
  // wear it (in their kind's colour, "The place the map has flown to" in
  // styles.css), and say so to a screen reader.
  function markActive(id: number) {
    document.querySelectorAll(`[data-place="${id}"]`).forEach((card) => {
      card.classList.add("spot--active");
      card.setAttribute("aria-current", "true");
    });
  }
  function fly(id: number) {
    // (a place off the list is only on Explore's map)
    if (mode === "list" && !list.order.has(id)) turn("explore");
    const entry = ensure(id);
    if (!entry) return;
    const { pin, el } = entry;
    close();
    for (const { el: other } of markers.values()) other.classList.remove("is-active");
    document.querySelectorAll(".spot--active").forEach((card) => {
      card.classList.remove("spot--active");
      card.removeAttribute("aria-current");
    });
    markActive(id);
    el.classList.add("is-active");
    active = id;
    prune();

    // On a phone the map sits above the list: bring it into view first.
    const rect = container!.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      container!.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "center" });
    }

    // (on a phone the place lands above the middle, clear of its card at the map's foot)
    const offset: [number, number] = [0, narrow.matches ? -46 : 0];
    const target = { center: [pin.lon, pin.lat] as [number, number], zoom: 16.4, pitch: 58, bearing: -20, offset };
    if (still()) {
      map.easeTo({ ...target, duration: 0 });
      open(id);
      return;
    }
    // Out a little, across, and down into the street: flyTo's curve does the
    // zoom-out-and-in; the pitch and bearing swing the camera as it lands.
    // (Brisk, and never more than two seconds: a long flight makes some dizzy.)
    map.flyTo({ ...target, speed: 1.4, curve: 1.5, maxDuration: 2000, essential: true });
    map.once("moveend", () => {
      if (active === id) open(id);
    });
  }

  // Cards and list items, by delegation so cards a live refresh swapped in
  // still work. A click on a card's own button, link or form does what that
  // control does, not a fly.
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, form, input, select, label")) return;
    const card = target.closest<HTMLElement>("[data-place]");
    if (card?.dataset.place) fly(Number(card.dataset.place));
  });
  // (a place's Talk opened on a wide screen: the map goes to it, src/scripts/talk.ts)
  document.addEventListener("spots:fly", (event) => {
    const id = (event as CustomEvent<number>).detail;
    if (Number.isFinite(id)) fly(id);
  });

  // Kind filters: the chips show and hide cards and their pins together.
  let filter = "all";
  const empty = document.querySelector<HTMLElement>(".filter-empty");
  function applyFilter() {
    let shown = 0;
    document.querySelectorAll<HTMLElement>(".spots--explore [data-kind]").forEach((card) => {
      card.hidden = filter !== "all" && card.dataset.kind !== filter;
      if (!card.hidden) shown++;
    });
    // (a kind nobody has shared yet says so, and where to share one)
    if (empty) {
      empty.hidden = filter === "all" || shown > 0;
      const said = empty.querySelector("[data-empty-kind]");
      if (said) said.textContent = KIND_LABEL[filter as Kind] ?? "";
    }
    for (const { el, pin } of markers.values()) {
      el.style.display = filter === "all" || pin.kind === filter ? "" : "none";
    }
    filterDots();
    // (a card whose place the filter hides goes with it)
    if (opened !== null && markers.get(opened)?.el.style.display === "none") close();
    place();
  }
  // (tapping the chosen kind again, or Show all, shows every place again)
  const filters = document.querySelector<HTMLElement>(".filters");
  const showAll = document.querySelector<HTMLButtonElement>("[data-show-all]");
  function choose(kind: string, ask = false) {
    filter = kind;
    if (filters) {
      filters.dataset.sel = kind;
      filters.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((c) => {
        const on = c.dataset.filter === kind;
        c.classList.toggle("chip--on", on);
        c.setAttribute("aria-pressed", String(on));
      });
    }
    if (showAll) showAll.hidden = kind === "all";
    applyFilter();
    // (Explore's cards come from the server a page at a time, of one kind)
    if (ask) document.dispatchEvent(new CustomEvent("spots:kind", { detail: kind }));
  }
  if (filters) {
    filters.hidden = false;
    filters.addEventListener("click", (event) => {
      const chip = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-filter]");
      if (chip) choose(chip.dataset.filter === filter ? "all" : (chip.dataset.filter ?? "all"), true);
    });
  }
  showAll?.addEventListener("click", () => choose("all", true));
  // (the page can open on a kind, ?kind, as the plan's "Find food nearby"
  // does, and that link chooses it in place)
  if (filters?.dataset.sel && filters.dataset.sel !== "all") choose(filters.dataset.sel);
  document.addEventListener("spots:filter", (event) => choose(String((event as CustomEvent).detail ?? "all")));

  // ---- the two modes ---------------------------------------------------------
  const switcher = document.createElement("div");
  switcher.className = "maplibregl-ctrl map-mode";
  switcher.setAttribute("role", "group");
  switcher.setAttribute("aria-label", "Show on the map");
  const modeButtons = (["list", "explore"] as Mode[]).map((m) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = m === "list" ? "Our list" : "Explore";
    button.addEventListener("click", () => turn(m, true));
    switcher.append(button);
    return [m, button] as const;
  });
  const showMode = () => modeButtons.forEach(([m, b]) => b.setAttribute("aria-pressed", String(m === mode)));
  showMode();
  map.addControl({ onAdd: () => switcher, onRemove: () => switcher.remove() }, "top-left");

  function turn(next: Mode, frame = false) {
    if (next === mode) return;
    mode = next;
    showMode();
    if (opened !== null && !needsMark(opened)) close();
    prune();
    for (const pin of pins.values()) if (needsMark(pin.id) && !markers.has(pin.id)) addMark(pin, null);
    drawDots();
    applyFilter();
    if (frame) frameMode();
  }
  // (the switch pressed: Our list framed to fit its places, Explore the city)
  function frameMode() {
    const motion = still() ? { duration: 0 } : { duration: 800 };
    const ours = [...pins.values()].filter((pin) => list.order.has(pin.id));
    if (mode === "list" && ours.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      for (const pin of ours) bounds.extend([pin.lon, pin.lat]);
      map.fitBounds(bounds, { padding: 64, maxZoom: 15, pitch: 0, bearing: 0, ...motion });
    } else if (mode === "list" && ours.length === 1) {
      map.easeTo({ center: [ours[0].lon, ours[0].lat], zoom: 14, pitch: 0, bearing: 0, ...motion });
    } else {
      map.easeTo({ center: CANBERRA, zoom: 11.3, pitch: 0, bearing: 0, ...motion });
    }
  }
  // A row of our list (or a place's Talk) is Our list's; an Explore card,
  // a search or a kind chip is Explore's.
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("button, a, form, input, select, label")) return;
      const card = target.closest<HTMLElement>("[data-place]");
      if (card) turn(card.closest("#list") ? "list" : "explore");
    },
    true,
  );
  document.addEventListener("spots:fly", () => turn("list"), true);
  document.addEventListener("spots:searched", () => turn("explore"), true);
  document.addEventListener("spots:kind", () => turn("explore"));
  document.addEventListener("spots:filter", () => turn("explore"), true);

  sync();
  document.addEventListener("spots:reveal", (event) => reveal(Number((event as CustomEvent).detail), true));
  document.addEventListener("spots:refreshed", () => {
    sync();
    // (fresh cards keep to the kind that's chosen)
    applyFilter();
    if (active !== null) markActive(active);
    // The open card is drawn again from the fresh page: a keen's new count,
    // a place now on the list (or gone from Explore, and its card with it).
    if (opened !== null) {
      if (markers.has(opened)) open(opened);
      else close();
    }
  });

  // A search's answer is its cards; the map frames just their pins. One
  // match flies in like a click on it; clearing the search pulls back out.
  function frameSearch() {
    const searching = Boolean(document.getElementById("explore")?.dataset.q);
    const found = [...pins.values()];
    const motion = still() ? { duration: 0 } : { duration: 1000 };
    if (!searching || found.length === 0) {
      active = null;
      close();
      map.easeTo({ center: CANBERRA, zoom: 11.3, pitch: 0, bearing: 0, ...motion });
      return;
    }
    if (found.length === 1) {
      fly(found[0].id);
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    for (const pin of found) bounds.extend([pin.lon, pin.lat]);
    map.fitBounds(bounds, { padding: 64, maxZoom: 15, pitch: 30, bearing: 0, ...motion });
  }
  document.addEventListener("spots:searched", frameSearch);
  if (document.getElementById("explore")?.dataset.q) frameSearch();

  // ---- sharing a place: find it on OpenStreetMap, then pick the match ------
  // Two steps: the search alone, then, with a match picked (or "Fill it in
  // by hand"), the form, the place picked at its top with Change to go back.
  const finder = document.querySelector<HTMLElement>(".finder");
  const form = document.querySelector<HTMLFormElement>("#add-form");
  const sharing = document.querySelector<HTMLElement>("#add");
  if (finder && form && sharing) {
    finder.hidden = false;
    const q = finder.querySelector<HTMLInputElement>("#find-q")!;
    const go = finder.querySelector<HTMLButtonElement>("#find-go")!;
    const list = finder.querySelector<HTMLUListElement>(".finder__results")!;
    const picked = form.querySelector<HTMLElement>(".add__picked")!;
    const submit = form.querySelector<HTMLButtonElement>(".add__foot .btn")!;
    const field = (name: string) => form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
    const setKind = (kind: Kind) => {
      const radio = form.querySelector<HTMLInputElement>(`[name="kind"][value="${kind}"]`);
      if (radio) radio.checked = true;
    };
    let preview: maplibregl.Marker | null = null;
    // (a page that came back with an error opens on the form)
    const step = (next: "find" | "fill") => (sharing.dataset.step = next);
    step(new URLSearchParams(location.search).get("error") === "place" ? "fill" : "find");

    // The button waits for a name and a reason, all the form needs from you.
    const why = field("why");
    const ready = () => (submit.disabled = !why.value.trim() || !field("name").value.trim());
    why.addEventListener("input", ready);
    // (a reason is one line: Return shares it, as a field's would)
    why.addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key === "Enter" && !(event as KeyboardEvent).isComposing) {
        event.preventDefault();
        if (!submit.disabled) form.requestSubmit();
      }
    });
    field("name").addEventListener("input", ready);
    ready();

    // Its photo: the one you choose, shown before you share it, if you do.
    // A place picked that's already shared goes on the list as it is, so it
    // shows the photo it has instead, and there's none to choose.
    const own = form.querySelector<HTMLInputElement>('input[name="photo"]')!;
    const shown = form.querySelector<HTMLElement>(".photo-pick__found")!;
    const label = form.querySelector<HTMLElement>(".photo-pick__label")!;
    let found: Photo | null = null;
    let yours = "";
    const showPhoto = () => {
      const file = own.files?.[0];
      if (yours) URL.revokeObjectURL(yours);
      yours = file ? URL.createObjectURL(file) : "";
      const photo = yours || found?.src;
      shown.hidden = !photo;
      label.firstChild!.textContent = yours ? "Change photo " : "Add a photo ";
      label.querySelector<HTMLElement>(".photo-pick__opt")!.hidden = Boolean(yours);
      if (!photo) return;
      shown.querySelector("img")!.src = photo;
      shown.querySelector("figcaption")!.textContent = yours
        ? "Your photo"
        : found!.license === "Illustration"
          ? "Illustration"
          : `Photo: ${found!.credit}${found!.license ? `, ${found!.license}` : ""}`;
    };
    const showFound = (photo: Photo | null) => {
      found = photo;
      label.parentElement!.hidden = photo !== null;
      if (photo) own.value = "";
      showPhoto();
    };
    own.addEventListener("change", showPhoto);

    const clearLocation = () => {
      for (const name of ["ref", "lat", "lon"]) field(name).value = "";
      showFound(null);
      picked.hidden = true;
      sharing.classList.remove("add--picked");
      preview?.remove();
      preview = null;
    };
    // Typing a different name by hand means it's no longer the place found.
    field("name").addEventListener("input", clearLocation);

    // What the finder found, on the map while you choose.
    const hits: maplibregl.Marker[] = [];
    const clearHits = () => hits.splice(0).forEach((hit) => hit.remove());
    const choose = (r: Found) => {
      field("ref").value = r.ref;
      field("lat").value = String(r.lat);
      field("lon").value = String(r.lon);
      field("name").value = r.name;
      field("area").value = r.area;
      setKind(r.kind);
      showFound(r.photo ?? null);
      // (the place picked, at the form's top, in its kind's colour)
      picked.className = `add__picked spot--${r.kind}`;
      picked.querySelector(".add__picked-icon")!.replaceChildren(kindIcon(r.kind));
      picked.querySelector("strong")!.textContent = r.name;
      picked.querySelector(".add__picked-words > span")!.textContent = r.detail || r.area;
      picked.hidden = false;
      sharing.classList.add("add--picked");
      step("fill");
      ready();
      list.replaceChildren();
      clearHits();
      preview?.remove();
      // The place found, not yet shared: its chip, named, over the rest.
      const el = mark(r.kind);
      el.classList.add("map-mark--preview");
      dress(el, { n: null, name: r.name, placing: { named: true, shift: 0, below: false } });
      preview = new maplibregl.Marker({ element: el }).setLngLat([r.lon, r.lat]).addTo(map);
      map.flyTo({ center: [r.lon, r.lat], zoom: 16, pitch: 50, essential: true, ...move() });
      field("why").focus();
    };

    // (nothing found, or no search: a line saying so, and the way to fill it in by hand)
    const note = (text: string) => {
      const li = document.createElement("li");
      li.className = "fine finder__none";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "add__by-hand";
      button.textContent = "fill it in by hand";
      button.addEventListener("click", () => byHand());
      li.append(`${text} `, button);
      return li;
    };
    const search = async () => {
      const text = q.value.trim();
      if (text.length < 2) return;
      go.disabled = true;
      clearHits();
      list.replaceChildren(Object.assign(document.createElement("li"), { textContent: "Searching…", className: "fine" }));
      try {
        const res = await fetch(`/api/lookup?q=${encodeURIComponent(text)}`);
        const results: Found[] = res.ok ? await res.json() : [];
        list.replaceChildren();
        if (!Array.isArray(results) || results.length === 0) {
          list.append(note("Nothing found in Canberra. Check the spelling, or"));
          return;
        }
        // Each match, numbered, in the list and on the map, framed together:
        // a tap on either picks it.
        const bounds = new maplibregl.LngLatBounds();
        results.forEach((r, i) => {
          const li = document.createElement("li");
          const button = document.createElement("button");
          button.type = "button";
          button.className = `finder__hit spot--${r.kind}`;
          const n = document.createElement("i");
          n.className = "finder__n";
          n.textContent = String(i + 1);
          const words = document.createElement("span");
          const name = document.createElement("strong");
          name.textContent = r.name;
          const where = document.createElement("span");
          where.textContent = r.detail;
          words.append(name, where);
          button.append(n, words);
          button.addEventListener("click", () => choose(r));
          li.append(button);
          list.append(li);
          const el = mark(r.kind, "button");
          el.classList.add("map-mark--hit");
          el.setAttribute("aria-label", `${i + 1}: ${r.name}`);
          dress(el, { n: i + 1, name: r.name, placing: { named: true, shift: 0, below: false } });
          el.addEventListener("click", () => choose(r));
          hits.push(new maplibregl.Marker({ element: el }).setLngLat([r.lon, r.lat]).addTo(map));
          bounds.extend([r.lon, r.lat]);
        });
        if (results.length === 1) map.flyTo({ center: [results[0].lon, results[0].lat], zoom: 15, pitch: 30, ...move() });
        else map.fitBounds(bounds, { padding: 72, maxZoom: 15, pitch: 0, bearing: 0, ...move() });
      } catch {
        list.replaceChildren(note("Search isn't available right now, but you can"));
      } finally {
        go.disabled = false;
      }
    };
    go.addEventListener("click", search);
    // Not found: the form, empty, for the name and the rest by hand.
    const byHand = () => {
      clearHits();
      clearLocation();
      field("name").value = q.value.trim();
      step("fill");
      ready();
      field("name").focus();
    };
    // Change (or, filling it in by hand, "Search the map instead"): back to the search.
    form.querySelector<HTMLElement>(".add__back")!.hidden = false;
    for (const back of form.querySelectorAll("[data-change]")) back.addEventListener("click", () => {
      clearLocation();
      field("name").value = "";
      field("area").value = "";
      step("find");
      ready();
      q.focus();
    });
    // (leaving Share takes its matches off the map)
    document.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest('.tabs a[data-tab]:not([data-tab="add"])')) clearHits();
    });
    q.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        search();
      }
    });
  }
}
