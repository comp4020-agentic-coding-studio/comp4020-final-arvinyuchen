import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Photo } from "../lib/catalogue";
import { KIND_LABEL, type Kind } from "../lib/kinds";
import { buildings, fine, letters, look, quiet, STYLE } from "./map-look";
import { around, type Box, chipFont, chips, dress, fold, mark, measure, names, type Name } from "./map-marks";

// The Explore map. Every shared place with a location gets a pin; clicking a
// card (or its "Show on map" button, or a place on our list) flies the map to
// that place: a zoom and a tilt into the street, then its popup opens. The
// pins come from the #pins JSON inside #explore, so when the page refreshes
// itself live (a new shared place), the pins follow.
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
}

// See scripts/copy-maplibre-worker.mjs.
maplibregl.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");

const CANBERRA: [number, number] = [149.128, -35.285];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
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
    ready();
  });

  const markers = new Map<number, { marker: maplibregl.Marker; pin: Pin; el: HTMLElement }>();
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

  // One popup, for the place the map has flown to. While it's open it takes
  // the place's chip's place, pointing at the same dot.
  const popup = new maplibregl.Popup({ offset: 10, closeButton: false, maxWidth: "16rem" });
  popup.on("close", () => {
    for (const { el } of markers.values()) el.classList.remove("is-open");
  });
  const card = (pin: Pin) => {
    // Names and suburbs are typed by people, so they go in as text, never HTML.
    const box = document.createElement("div");
    box.className = `map-pop spot--${pin.kind}`;
    const head = document.createElement("span");
    head.className = "map-pop__head";
    const disc = document.createElement("i");
    const n = number(pin.id);
    if (n !== null) disc.textContent = String(n);
    const name = document.createElement("strong");
    name.textContent = pin.name;
    head.append(disc, name);
    const meta = document.createElement("span");
    meta.className = "map-pop__meta";
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = KIND_LABEL[pin.kind];
    const where = document.createElement("span");
    where.textContent = [pin.area, list.order.has(pin.id) && "on our list"].filter(Boolean).join(" · ");
    meta.append(tag, where);
    box.append(head, meta);
    return box;
  };
  const open = (id: number) => {
    const entry = markers.get(id);
    if (!entry) return;
    entry.el.classList.add("is-open");
    popup.setLngLat([entry.pin.lon, entry.pin.lat]).setDOMContent(card(entry.pin)).addTo(map);
  };

  // Markers are plain elements over the map, so they can go on before the
  // first frame renders (a tab opened in the background renders nothing yet).
  let first = true;
  const sync = () => {
    const pins = readPins();
    list = readList();
    const seen = new Set(pins.map((p) => p.id));
    for (const [id, { marker }] of markers) {
      if (!seen.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }
    // The first pins drop in once the map is there, our list's first; a
    // place shared while someone's looking simply appears.
    const queue = [...pins].sort((a, b) => Number(!list.order.has(a.id)) - Number(!list.order.has(b.id)));
    for (const pin of pins) {
      if (markers.has(pin.id)) continue;
      const el = mark(pin.kind, "button");
      (el as HTMLButtonElement).type = "button";
      el.setAttribute("aria-label", `${pin.name}, on the map`);
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        fly(pin.id);
      });
      const listed = list.order.has(pin.id);
      dress(el, {
        n: number(pin.id),
        name: pin.name,
        placing: { named: false, shift: 0, below: false },
        dot: !listed,
      });
      if (first) {
        const drop = el.querySelector<HTMLElement>(".map-drop")!;
        drop.classList.add("is-dropping");
        drop.style.setProperty("--drop-delay", `${0.15 + Math.min(queue.indexOf(pin), 24) * 0.035}s`);
        drop.addEventListener("animationend", () => drop.classList.remove("is-dropping"), { once: true });
      }
      const marker = new maplibregl.Marker({ element: el }).setLngLat([pin.lon, pin.lat]).addTo(map);
      markers.set(pin.id, { marker, pin, el });
    }
    first = false;
    applyFilter();
  };

  // What the chips and names keep clear of, besides each other: the map's
  // zoom buttons and its credit's "i".
  const controls = (): Box[] => {
    const frame = container.getBoundingClientRect();
    return [
      ...container.querySelectorAll(".maplibregl-ctrl-group"),
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
    const placed = chips(
      listed.map(({ pin, at }) => ({ x: at.x, y: at.y, wide: measure(pin.name, font) })),
      width,
      height,
      [...shown.map(({ at }) => around(at.x, at.y, 6)), ...controls()],
    );
    listed.forEach(({ pin, el }, i) => dress(el, { n: number(pin.id), name: pin.name, placing: placed.placing[i] }));
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
  function fly(id: number) {
    const entry = markers.get(id);
    if (!entry) return;
    const { pin, el } = entry;
    popup.remove();
    for (const { el: other } of markers.values()) other.classList.remove("is-active");
    document.querySelectorAll(".spot--active").forEach((card) => card.classList.remove("spot--active"));
    document.querySelectorAll(`[data-place="${id}"]`).forEach((card) => card.classList.add("spot--active"));
    el.classList.add("is-active");
    active = id;

    // On a phone the map sits above the list: bring it into view first.
    const rect = container!.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      container!.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "center" });
    }

    const target = { center: [pin.lon, pin.lat] as [number, number], zoom: 16.4, pitch: 58, bearing: -20 };
    if (reducedMotion.matches) {
      map.jumpTo(target);
      open(id);
      return;
    }
    // Out a little, across, and down into the street: flyTo's curve does the
    // zoom-out-and-in; the pitch and bearing swing the camera as it lands.
    map.flyTo({ ...target, speed: 0.9, curve: 1.6, essential: true });
    map.once("moveend", () => {
      if (active === id) open(id);
    });
  }

  // Cards, list items and "Show on map" buttons, by delegation so cards a
  // live refresh swapped in still work. A click on a card's own button, link
  // or form does what that control does, not a fly.
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const flyButton = target.closest<HTMLElement>("[data-fly]");
    if (flyButton) {
      fly(Number(flyButton.dataset.fly));
      return;
    }
    if (target.closest("button, a, form, input, select, label")) return;
    const card = target.closest<HTMLElement>("[data-place]");
    if (card?.dataset.place) fly(Number(card.dataset.place));
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
    place();
  }
  const filters = document.querySelector<HTMLElement>(".filters");
  if (filters) {
    filters.hidden = false;
    filters.addEventListener("click", (event) => {
      const chip = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-filter]");
      if (!chip) return;
      filter = chip.dataset.filter ?? "all";
      filters.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((c) => {
        const on = c === chip;
        c.classList.toggle("chip--on", on);
        c.setAttribute("aria-pressed", String(on));
      });
      applyFilter();
    });
  }

  sync();
  document.addEventListener("spots:refreshed", () => {
    sync();
    // (fresh cards keep to the kind that's chosen)
    applyFilter();
    if (active !== null) document.querySelectorAll(`[data-place="${active}"]`).forEach((el) => el.classList.add("spot--active"));
  });

  // A search's answer is its cards; the map frames just their pins. One
  // match flies in like a click on it; clearing the search pulls back out.
  function frameSearch() {
    const searching = Boolean(document.getElementById("explore")?.dataset.q);
    const pins = [...markers.values()].map(({ pin }) => pin);
    const move = reducedMotion.matches ? { duration: 0 } : { duration: 1400 };
    if (!searching || pins.length === 0) {
      active = null;
      popup.remove();
      map.easeTo({ center: CANBERRA, zoom: 11.3, pitch: 0, bearing: 0, ...move });
      return;
    }
    if (pins.length === 1) {
      fly(pins[0].id);
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    for (const pin of pins) bounds.extend([pin.lon, pin.lat]);
    map.fitBounds(bounds, { padding: 64, maxZoom: 15, pitch: 30, bearing: 0, ...move });
  }
  document.addEventListener("spots:searched", frameSearch);
  if (document.getElementById("explore")?.dataset.q) frameSearch();

  // ---- sharing a place: find it on OpenStreetMap, then pick the match ------
  const finder = document.querySelector<HTMLElement>(".finder");
  const form = document.querySelector<HTMLFormElement>("#add-form");
  if (finder && form) {
    finder.hidden = false;
    const q = finder.querySelector<HTMLInputElement>("#find-q")!;
    const go = finder.querySelector<HTMLButtonElement>("#find-go")!;
    const list = finder.querySelector<HTMLUListElement>(".finder__results")!;
    const located = form.querySelector<HTMLElement>(".located")!;
    const field = (name: string) => form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!;
    let preview: maplibregl.Marker | null = null;

    // Its photo: the one found for the place picked (a Commons photo, or the
    // one it was shared with), which makes a photo of yours optional; or the
    // one you choose, shown before you share it.
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
      if (!photo) return;
      shown.querySelector("img")!.src = photo;
      shown.querySelector("figcaption")!.textContent = yours
        ? "Your photo"
        : `Photo: ${found!.credit}${found!.license ? `, ${found!.license}` : ""}`;
    };
    const showFound = (photo: Photo | null) => {
      found = photo;
      own.required = !photo;
      label.textContent = photo ? "Or use a photo of yours" : "Photo (required)";
      showPhoto();
    };
    own.addEventListener("change", showPhoto);

    const clearLocation = () => {
      for (const name of ["ref", "lat", "lon"]) field(name).value = "";
      showFound(null);
      located.hidden = true;
      preview?.remove();
      preview = null;
    };
    // Typing a different name by hand means it's no longer the place found.
    field("name").addEventListener("input", clearLocation);

    const search = async () => {
      const text = q.value.trim();
      if (text.length < 2) return;
      go.disabled = true;
      list.replaceChildren(Object.assign(document.createElement("li"), { textContent: "Searching…", className: "fine" }));
      try {
        const res = await fetch(`/api/lookup?q=${encodeURIComponent(text)}`);
        const results = res.ok ? await res.json() : [];
        list.replaceChildren();
        if (!Array.isArray(results) || results.length === 0) {
          list.append(Object.assign(document.createElement("li"), { textContent: "Nothing found in Canberra. Check the spelling, or fill it in by hand below.", className: "fine" }));
          return;
        }
        for (const r of results) {
          const li = document.createElement("li");
          const button = document.createElement("button");
          button.type = "button";
          button.className = "finder__hit";
          const name = document.createElement("strong");
          name.textContent = r.name;
          const where = document.createElement("span");
          where.textContent = r.detail;
          button.append(name, where);
          button.addEventListener("click", () => {
            field("ref").value = r.ref;
            field("lat").value = String(r.lat);
            field("lon").value = String(r.lon);
            field("name").value = r.name;
            field("area").value = r.area;
            field("kind").value = r.kind;
            showFound(r.photo ?? null);
            located.hidden = false;
            located.textContent = `📍 Found on the map: ${r.name}${r.area ? `, ${r.area}` : ""}. Now say why it's good.`;
            list.replaceChildren();
            preview?.remove();
            // The place found, not yet shared: its chip, named, over the rest.
            const el = mark(r.kind);
            el.classList.add("map-mark--preview");
            dress(el, { n: null, name: r.name, placing: { named: true, shift: 0, below: false } });
            preview = new maplibregl.Marker({ element: el }).setLngLat([r.lon, r.lat]).addTo(map);
            map.flyTo({ center: [r.lon, r.lat], zoom: 16, pitch: 50, essential: true, ...(reducedMotion.matches ? { duration: 0 } : {}) });
            field("why").focus();
          });
          li.append(button);
          list.append(li);
        }
      } catch {
        list.replaceChildren(Object.assign(document.createElement("li"), { textContent: "Search isn't available right now. Fill it in by hand below.", className: "fine" }));
      } finally {
        go.disabled = false;
      }
    };
    go.addEventListener("click", search);
    q.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        search();
      }
    });
  }
}
