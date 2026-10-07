import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// The Explore map. Every shared place with a location gets a pin; clicking a
// card (or its "Show on map" button, or a place on our list) flies the map to
// that place: a zoom and a tilt into the street, then its popup opens. The
// pins come from the #pins JSON inside #explore, so when the page refreshes
// itself live (a new shared place), the pins follow.

interface Pin {
  id: number;
  name: string;
  kind: "food" | "fun" | "outdoors";
  area: string;
  lat: number;
  lon: number;
}

// See scripts/copy-maplibre-worker.mjs.
maplibregl.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");

const CANBERRA: [number, number] = [149.128, -35.285];
const KIND_LABEL = { food: "Food", fun: "Fun", outdoors: "Outdoors" } as const;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const container = document.getElementById("map");

if (container) {
  const map = new maplibregl.Map({
    container,
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: CANBERRA,
    zoom: 11.3,
    attributionControl: false,
    cooperativeGestures: true,
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

  const markers = new Map<number, { marker: maplibregl.Marker; pin: Pin }>();
  const readPins = (): Pin[] => {
    try {
      return JSON.parse(document.getElementById("pins")?.textContent ?? "[]");
    } catch {
      return [];
    }
  };

  const popupFor = (pin: Pin) => {
    // Names and suburbs are typed by people, so they go in as text, never HTML.
    const box = document.createElement("div");
    box.className = "map-pop";
    const tag = document.createElement("span");
    tag.className = `tag spot--${pin.kind}`;
    tag.textContent = KIND_LABEL[pin.kind];
    const name = document.createElement("strong");
    name.textContent = pin.name;
    const area = document.createElement("span");
    area.className = "area";
    area.textContent = pin.area;
    box.append(tag, name, area);
    return new maplibregl.Popup({ offset: 22, closeButton: false, maxWidth: "15rem" }).setDOMContent(box);
  };

  const sync = () => {
    const pins = readPins();
    const seen = new Set(pins.map((p) => p.id));
    for (const [id, { marker }] of markers) {
      if (!seen.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }
    for (const pin of pins) {
      if (markers.has(pin.id)) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.className = `pin pin--${pin.kind}`;
      el.setAttribute("aria-label", `${pin.name}, on the map`);
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        fly(pin.id);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([pin.lon, pin.lat])
        .setPopup(popupFor(pin))
        .addTo(map);
      markers.set(pin.id, { marker, pin });
    }
    applyFilter();
  };

  let active: number | null = null;
  function fly(id: number) {
    const entry = markers.get(id);
    if (!entry) return;
    const { marker, pin } = entry;
    for (const { marker: m } of markers.values()) {
      m.getElement().classList.remove("pin--active");
      if (m.getPopup()?.isOpen()) m.togglePopup();
    }
    document.querySelectorAll(".spot--active").forEach((el) => el.classList.remove("spot--active"));
    document.querySelectorAll(`[data-place="${id}"]`).forEach((el) => el.classList.add("spot--active"));
    marker.getElement().classList.add("pin--active");
    active = id;

    // On a phone the map sits above the list: bring it into view first.
    const rect = container!.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      container!.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "center" });
    }

    const target = { center: [pin.lon, pin.lat] as [number, number], zoom: 16.4, pitch: 58, bearing: -20 };
    if (reducedMotion.matches) {
      map.jumpTo(target);
      marker.togglePopup();
      return;
    }
    // Out a little, across, and down into the street: flyTo's curve does the
    // zoom-out-and-in; the pitch and bearing swing the camera as it lands.
    map.flyTo({ ...target, speed: 0.9, curve: 1.6, essential: true });
    map.once("moveend", () => {
      if (active === id && !marker.getPopup()?.isOpen()) marker.togglePopup();
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
  function applyFilter() {
    document.querySelectorAll<HTMLElement>(".spots--explore [data-kind]").forEach((card) => {
      card.hidden = filter !== "all" && card.dataset.kind !== filter;
    });
    for (const { marker, pin } of markers.values()) {
      marker.getElement().style.display = filter === "all" || pin.kind === filter ? "" : "none";
    }
  }
  const chips = document.querySelector<HTMLElement>(".filters");
  if (chips) {
    chips.hidden = false;
    chips.addEventListener("click", (event) => {
      const chip = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-filter]");
      if (!chip) return;
      filter = chip.dataset.filter ?? "all";
      chips.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((c) => {
        const on = c === chip;
        c.classList.toggle("chip--on", on);
        c.setAttribute("aria-pressed", String(on));
      });
      applyFilter();
    });
  }

  // Markers are plain elements over the map, so they can go on before the
  // first frame renders (a tab opened in the background renders nothing yet).
  sync();
  document.addEventListener("spots:refreshed", () => {
    sync();
    if (active !== null) document.querySelectorAll(`[data-place="${active}"]`).forEach((el) => el.classList.add("spot--active"));
  });

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

    const clearLocation = () => {
      for (const name of ["osm", "lat", "lon"]) field(name).value = "";
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
          list.append(Object.assign(document.createElement("li"), { textContent: "Nothing found in Canberra. Try the suburb too, or fill it in by hand below.", className: "fine" }));
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
            field("osm").value = r.osm;
            field("lat").value = String(r.lat);
            field("lon").value = String(r.lon);
            field("name").value = r.name;
            field("area").value = r.area;
            field("kind").value = r.kind;
            located.hidden = false;
            located.textContent = `📍 Found on the map: ${r.name}${r.area ? `, ${r.area}` : ""}. Now say why it's good.`;
            list.replaceChildren();
            preview?.remove();
            const el = document.createElement("div");
            el.className = "pin pin--preview";
            preview = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([r.lon, r.lat]).addTo(map);
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
