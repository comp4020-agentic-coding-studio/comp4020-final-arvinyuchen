import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BBOX, H, W, where } from "../lib/hero-frame";
import { fine, look, quiet, STYLE } from "./map-look";

// The home page's photo turns into its map. The photo is taken from the
// lookout on Mount Ainslie, down the land axis to Parliament House; a 3D
// street map with the hills (Mapzen's terrain) is set up behind it with its
// camera in the photographer's place, so the two line up. As the page
// scrolls, the photo fades into that map and the camera climbs away round
// the city, tilting down as it goes, until it looks over the whole of it
// at a slant; the view narrows to the card the drawn map sits in
// (HeroMap.astro), framed the same, and the drawn map's pins, names and
// search are set on the live one. Down there, it keeps turning slowly.
//
// Only with motion allowed and WebGL working; otherwise the page stays as
// the photo with the drawn map card under it (the .fly rules in styles.css).

// See scripts/copy-maplibre-worker.mjs.
maplibregl.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");

const TERRAIN = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png";

// Where the photo was taken, found by lining up the War Memorial and
// Parliament House on the map with where they are in the photo: on the
// land axis just below the summit, about 100 m above the ground, looking
// down the axis, with a lens about 24 degrees tall.
const EYE = { lng: 149.16045, lat: -35.26824, alt: 930, bearing: -143.6, pitch: 85.5, fov: 24 };
const PHOTO = 2000 / 1325;

// The scroll, in parts of the way through the stage.
const WORDS = [0.03, 0.12];
const PHOTO_OUT = [0.1, 0.24];
const FLIGHT = [0.18, 0.66];
const NARROW = [0.74, 0.87];
const CARD_IN = [0.84, 0.95];

// The way down: from the photo's view through a few views, each given as
// where the camera looks, how much closer than the end it is (in zoom
// levels), its tilt and its heading, at a part of the flight; between them
// it's a smooth curve. It climbs round the city, more than half a turn, to
// the card's framing, north up.
type View = { at: number; center: [number, number]; closer: number; pitch: number; bearing: number };
const VIEWS: View[] = [
  { at: 0.3, center: [149.125, -35.286], closer: 1.8, pitch: 70, bearing: -200 },
  { at: 0.56, center: [149.118, -35.284], closer: 1, pitch: 52, bearing: -265 },
  { at: 0.8, center: [149.116, -35.2828], closer: 0.35, pitch: 22, bearing: -325 },
];
const NORTH = -360;

// Where it lands: at a tilt, the flight never tipping down past it. As it
// comes down the lens widens and the hills stand up taller (the photo's
// long lens, about 24 degrees, flattens them), by parts of the flight.
// Once down it carries on turning the way it came round, slowly, all the
// way round (seconds a turn), easing up to speed.
const TILT = { pitch: 58, hills: 1.5, lens: 40, widen: [0.3, 1], stand: [0.45, 1], turn: 80, speedUp: 3 };

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const part = (p: number, [a, b]: number[]) => clamp((p - a) / (b - a));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const fly = document.querySelector<HTMLElement>(".fly");
const motion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
const gl = (() => {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
})();

// A smooth curve through values at times (cubic Hermite, Catmull-Rom
// slopes), still at both ends.
function curve(times: number[], values: number[], t: number) {
  let i = 0;
  while (i < times.length - 2 && t > times[i + 1]) i++;
  const [t0, t1] = [times[i], times[i + 1]];
  const slope = (j: number) =>
    j === 0 || j === times.length - 1 ? 0 : (values[j + 1] - values[j - 1]) / (times[j + 1] - times[j - 1]);
  const h = t1 - t0;
  const u = clamp((t - t0) / h);
  const [u2, u3] = [u * u, u * u * u];
  return (
    (2 * u3 - 3 * u2 + 1) * values[i] +
    (u3 - 2 * u2 + u) * h * slope(i) +
    (-2 * u3 + 3 * u2) * values[i + 1] +
    (u3 - u2) * h * slope(i + 1)
  );
}

if (fly && motion && gl) {
  const stage = fly.querySelector<HTMLElement>(".fly__stage")!;
  const holder = fly.querySelector<HTMLElement>(".fly__map")!;
  const cardBox = fly.querySelector<HTMLElement>(".fly__card")!;
  const card = cardBox.querySelector<HTMLElement>(".hero-map__frame")!;
  // The form lands with the map, in the stage, so the two arrive together
  // and there's nothing more to scroll for: beside it on a wide screen,
  // under it on a narrow one. On a screen too short for both (a phone on
  // its side), it follows the stage, as it stands without the script.
  const form = document.querySelector<HTMLElement>("#start");
  const beside = matchMedia("(min-width: 64rem)");
  const under = matchMedia("(min-height: 36rem)");
  const place = () => {
    if (!form) return;
    const into = beside.matches || under.matches;
    fly.classList.toggle("is-beside", beside.matches);
    fly.classList.toggle("is-under", !beside.matches && into);
    if (into) stage.append(form);
    else fly.after(form);
  };
  place();
  // The header stays at the top through it all, so the landing has the
  // logo and the way to sign in too: white on the photo, ink once the
  // photo has gone (styles.css). It goes in the stage, pinned with it.
  const top = document.querySelector<HTMLElement>(".top");
  if (top) stage.prepend(top);
  fly.classList.add("is-live");

  const map = new maplibregl.Map({
    container: holder,
    style: STYLE,
    interactive: false,
    attributionControl: false,
    maxPitch: 89,
    // (a phone's third pixel a point would be half as much again to draw,
    // every frame, for a picture no one could tell from this)
    pixelRatio: Math.min(devicePixelRatio, 2),
    center: [149.13, -35.29],
    zoom: 12,
  });

  let ready = false;
  // Where it lands, and which way it was turning as it came down, to carry
  // on that way.
  let landing: maplibregl.JumpToOptions | undefined;
  let way = -1;
  let box = { top: 0, right: 0, bottom: 0, left: 0 };
  // (where the stage's scroll runs on the page, and how tall the stage is:
  // read when the sizes change, so a scroll reads nothing back from the
  // page and never makes it lay itself out again mid-frame)
  let span = { top: 0, height: 1, stage: 1 };
  // (and the card's size, and whether its pins and names have been measured
  // since it last changed)
  let size = { w: 0, h: 0 };
  let measured = false;
  // (the flight's views, the photo's first and the landing last, channel by
  // channel: longitude, latitude, zoom, tilt, heading, ground height)
  let track: { times: number[]; channels: number[][] } | undefined;
  let lens = EYE.fov;
  let hills = 1;

  // The photo fills the stage as `object-fit: cover`, centred: the map's
  // lens is cut to the part of the photo that shows.
  const frame = () => {
    const vw = stage.clientWidth;
    const vh = stage.clientHeight;
    const shown = Math.max(vh, vw / PHOTO);
    const fov = (2 * Math.atan(Math.tan(((EYE.fov / 2) * Math.PI) / 180) * (vh / shown)) * 180) / Math.PI;
    map.setVerticalFieldOfView(fov);
    lens = fov;
    const first = map.calculateCameraOptionsFromCameraLngLatAltRotation(
      [EYE.lng, EYE.lat],
      EYE.alt,
      EYE.bearing,
      EYE.pitch,
    );
    const at = maplibregl.LngLat.convert(first.center!);
    // The card, where the drawn map is: its frame shows the whole of
    // hero-frame.ts's picture, so the landing puts that picture there (its
    // middle moved to the card's, wherever on the stage it is).
    // (clear of the header, and under the map, as tall as the form leaves
    // room for)
    fly.style.setProperty("--head", `${top?.offsetHeight ?? 0}px`);
    fly.style.setProperty("--form-h", `${form?.parentElement === stage ? form.offsetHeight : 0}px`);
    const s = stage.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const f = fly.getBoundingClientRect();
    span = { top: f.top + scrollY, height: f.height, stage: vh };
    size = { w: c.width, h: c.height };
    measured = false;
    box = { top: c.top - s.top, left: c.left - s.left, right: s.right - c.right, bottom: s.bottom - c.bottom };
    const [, west, , east] = BBOX;
    const mid = where(W / 2, H / 2);
    const zoom = Math.log2(((c.width / (east - west)) * 360) / 512);
    const height = (c: [number, number]) => (map.getTerrain() ? map.queryTerrainElevation(c) : null) ?? 0;
    const ground = height([mid.lon, mid.lat]);
    // (the hills under it stood up as tall as they will be by then)
    landing = { center: [mid.lon, mid.lat], zoom, pitch: TILT.pitch, bearing: NORTH, elevation: ground * TILT.hills, padding: { ...box } };
    const views = [
      { at: 0, lng: at.lng, lat: at.lat, zoom: first.zoom!, pitch: first.pitch!, bearing: first.bearing!, ground: first.elevation ?? ground },
      ...VIEWS.map((v) => ({
        at: v.at,
        lng: v.center[0],
        lat: v.center[1],
        zoom: zoom + v.closer,
        // (never tipping down past the tilt it lands at)
        pitch: Math.max(v.pitch, TILT.pitch),
        bearing: v.bearing,
        ground: height(v.center),
      })),
      { at: 1, lng: mid.lon, lat: mid.lat, zoom, pitch: TILT.pitch, bearing: NORTH, ground },
    ];
    way = Math.sign(views.at(-1)!.bearing - views.at(-2)!.bearing) || -1;
    const keys = ["lng", "lat", "zoom", "pitch", "bearing", "ground"] as const;
    track = { times: views.map((v) => v.at), channels: keys.map((k) => views.map((v) => v[k])) };
  };

  // The flight follows the scroll a moment behind, easing after it: a
  // mouse wheel moves the page in steps, a hundred pixels at once and then
  // nothing, and a flight set straight from the scroll would lurch at each.
  // It eases twice over (FOLLOW seconds each, a point that chases the
  // scroll and the flight chasing that), so not only where it is but how
  // fast it goes changes smoothly, and the steps run into one movement. A
  // jump to the end the page makes itself (to the form) is taken at once,
  // by `leap`.
  const FOLLOW = 0.07;
  let chase = 0;
  let flown = 0;
  let settled = true;
  let drew = 0;
  let leap = false;
  let queued = false;
  const draw = (now = performance.now()) => {
    queued = false;
    const target = held ? 1 : clamp((scrollY - span.top) / (span.height - span.stage));
    // (a frame's worth of easing when it sets off again after resting)
    const dt = settled ? 1 / 60 : Math.min(0.05, (now - drew) / 1000);
    drew = now;
    const k = 1 - Math.exp(-dt / FOLLOW);
    chase = leap ? target : chase + (target - chase) * k;
    flown = leap ? target : flown + (chase - flown) * k;
    leap = false;
    if (Math.abs(target - flown) < 0.0003 && Math.abs(target - chase) < 0.0003) chase = flown = target;
    settled = flown === target;
    if (!settled) later();
    const p = flown;
    const onScreen = span.top + span.height - scrollY > 0;
    const s = fly.style;
    s.setProperty("--words", String(1 - part(p, WORDS)));
    // Until the map has drawn, the photo stays and goes straight to the card.
    const photo = ready ? 1 - part(p, PHOTO_OUT) : 1 - part(p, CARD_IN);
    s.setProperty("--photo", String(photo));
    top?.classList.toggle("is-paper", photo < 0.5);
    // (and once it's gone, it's not there at all, not even to be drawn
    // see-through)
    fly.classList.toggle("is-past", photo === 0);
    const n = ease(part(p, NARROW));
    s.setProperty(
      "--clip",
      `inset(${box.top * n}px ${box.right * n}px ${box.bottom * n}px ${box.left * n}px round ${22 * n}px)`,
    );
    const cardIn = part(p, CARD_IN);
    s.setProperty("--card", String(cardIn));
    cardBox.classList.toggle("is-on", cardIn > 0.5);
    cardBox.classList.toggle("is-out", cardIn === 0);
    form?.classList.toggle("is-on", cardIn > 0.5);
    if (!ready || !landing || !track) return;
    // (the camera's still out on the flight it's flown unseen to warm up,
    // until someone scrolls)
    if (warming) {
      if (target === 0) return;
      warming = false;
    }
    shown = cardIn > 0;
    // Down: it turns on its own while the stage is on screen, and the
    // scroll leaves it be.
    const u = part(p, FLIGHT);
    if (u >= 1) {
      deepen(1);
      map.jumpTo({ ...landing, bearing: NORTH + spun });
      if (onScreen) spin();
      else halt();
      if (settled) hold();
      return;
    }
    halt();
    // (scrolled back up into the flight, the way it has turned since it
    // came down unwinds as the flight rewinds, all of it by the time the
    // photo's back)
    const kept = ease(part(p, [PHOTO_OUT[1], FLIGHT[1]]));
    if (!kept) spun = 0;
    along(u, spun * kept);
  };
  // The camera `u` of the way through the flight, turned `turned` more.
  const along = (u: number, turned: number) => {
    const tall = deepen(u);
    const [lng, lat, zoom, pitch, bearing, ground] = track!.channels.map((c) => curve(track!.times, c, u));
    const k = (n: number) => n * ease(u);
    map.jumpTo({
      center: [lng, lat],
      zoom,
      pitch: Math.max(TILT.pitch, pitch),
      bearing: bearing + turned,
      // (the ground it looks at, lifted with the hills, so the camera rises
      // with it rather than sinking into it)
      elevation: ground * tall,
      padding: { top: k(box.top), right: k(box.right), bottom: k(box.bottom), left: k(box.left) },
    });
  };

  // Warmed up: while the photo still covers the map and nobody has
  // scrolled, the camera flies the whole way unseen, a view at a time,
  // each held until its tiles have come and been drawn, so the flight
  // itself has nothing left to fetch or get ready, which is what stalled
  // it. (Not where the visitor has asked to save data.)
  let warming = false;
  const warm = async () => {
    if ((navigator as { connection?: { saveData?: boolean } }).connection?.saveData) return;
    warming = true;
    // (the flight, then the landing faced four ways, as it turns there)
    const views = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1, 1.25, 1.5, 1.75];
    for (const u of views) {
      if (!warming) return;
      if (u < 1) along(u, 0);
      else {
        deepen(1);
        map.jumpTo({ ...landing!, bearing: NORTH + (u - 1) * 360 });
      }
      await new Promise<void>((done) => {
        const late = setTimeout(done, 2500);
        map.once("idle", () => {
          clearTimeout(late);
          done();
        });
      });
    }
    if (!warming) return;
    warming = false;
    draw();
  };

  // The hills, as tall as `tall` times their height. setTerrain would
  // build the terrain anew, its tiles drawn again from scratch, every frame
  // they grow; but the height is only a number the terrain multiplies its
  // elevations by as it draws and samples them, so it's changed in place
  // (MapLibre 6's Terrain and its TerrainCoverage), and setTerrain is only
  // the fallback should those ever not be there.
  type Tall = { exaggeration: number; coverage?: { exaggeration: number } };
  const terrain = (tall: number) => {
    if (tall === hills) return;
    hills = tall;
    const t = (map as unknown as { terrain?: Tall | null }).terrain;
    if (t && typeof t.exaggeration === "number" && typeof t.coverage?.exaggeration === "number") {
      t.exaggeration = t.coverage.exaggeration = tall;
      map.triggerRepaint();
    } else map.setTerrain({ source: "terrain", exaggeration: tall });
  };
  // `u` of the way through the flight: the lens widening and
  // the hills standing up. Gives how tall they are.
  const deepen = (u: number) => {
    map.setVerticalFieldOfView(mix(lens, TILT.lens, ease(part(u, TILT.widen))));
    const tall = mix(1, TILT.hills, ease(part(u, TILT.stand)));
    terrain(tall);
    return tall;
  };

  // Down, the turn: degrees turned so far, easing up to speed
  // from still each time it starts.
  let spun = 0;
  let spinning = 0;
  let began = 0;
  let then = 0;
  const turning = (now: number) => {
    if (!began) began = then = now;
    const speed = (1 - Math.cos(Math.PI * Math.min(1, (now - began) / 1000 / TILT.speedUp))) / 2;
    spun += ((way * 360) / TILT.turn) * ((now - then) / 1000) * speed;
    then = now;
    map.setBearing(NORTH + spun);
    spinning = requestAnimationFrame(turning);
  };
  const spin = () => {
    if (spinning) return;
    began = 0;
    spinning = requestAnimationFrame(turning);
  };
  const halt = () => {
    if (!spinning) return;
    cancelAnimationFrame(spinning);
    spinning = 0;
    // (the least way back round, should the flight unwind it)
    spun = ((((spun + 180) % 360) + 360) % 360) - 180;
  };

  // The drawn card's pins, names and cards over the live map, each placed
  // where its spot is on it every time the map draws. As it turns, a pin
  // fades out as it comes to the card's edge, its card with it, and back in
  // as it comes round; a name (placed for the map seen from above) fades
  // out while it would cover a pin, a chip or a name before it. A place's
  // card opens on whichever side of it (above, below, right or left) it
  // fits best, chosen as its turn in the search comes round, while it's
  // hidden, so a card never jumps; and it's slid back inside the card's
  // edges, where on a phone's small map it fits on no side whole.
  //
  // All of it every frame, so none of it may make the page lay itself out:
  // they're moved by translation from the card's corner, never by left and
  // top, and their sizes are read once, all together, before anything is
  // written (and again when the card changes size).
  let shown = false;
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const placed = [...card.querySelectorAll<HTMLElement>(".map-label, .hero-map__pin, .hero-map__card")].map((el) => {
    const at = where((parseFloat(el.style.left) / 100) * W, (parseFloat(el.style.top) / 100) * H);
    return {
      el,
      at: [at.lon, at.lat] as [number, number],
      name: el.classList.contains("map-label"),
      pin: el.classList.contains("hero-map__pin"),
      chip: el.querySelector<HTMLElement>(".hero-map__chip"),
      hangs: !!el.querySelector(".is-below"),
      card: el.classList.contains("hero-map__card"),
      // (a name only the wide card shows, on a narrow one)
      unshown: false,
      side: "above" as Side,
      choose: true,
      w: 0,
      h: 0,
      faded: "",
    };
  });
  for (const m of placed) {
    if (!m.card) continue;
    const choose = (e: AnimationEvent) => {
      if (e.animationName === "hm-card") m.choose = true;
    };
    m.el.addEventListener("animationstart", choose);
    m.el.addEventListener("animationiteration", choose);
  }
  const measure = () => {
    for (const m of placed) {
      m.w = (m.chip ?? m.el).offsetWidth;
      m.h = m.el.offsetHeight;
      m.unshown = m.name && !m.w;
    }
    for (const { el } of placed) {
      el.style.left = "0";
      el.style.top = "0";
    }
    measured = true;
  };
  // (where a place's card goes on each side of it, from its corner, and
  // how far that would run outside the map card)
  type Side = "above" | "below" | "right" | "left";
  const SIDES: Side[] = ["above", "below", "right", "left"];
  const opens = (side: Side, x: number, y: number, cw: number, ch: number) =>
    side === "above"
      ? [x - cw / 2, y - ch - 16]
      : side === "below"
        ? [x - cw / 2, y + 14]
        : side === "right"
          ? [x + 20, y - ch / 2]
          : [x - 20 - cw, y - ch / 2];
  const over = ([x0, y0]: number[], cw: number, ch: number) =>
    Math.max(0, 8 - x0) + Math.max(0, x0 + cw - (size.w - 8)) + Math.max(0, 8 - y0) + Math.max(0, y0 + ch - (size.h - 8));
  const fade = (m: (typeof placed)[number], seen: number) => {
    const f = seen > 0.99 ? "" : `opacity(${Math.max(0, seen).toFixed(2)})`;
    if (f !== m.faded) m.el.style.filter = m.faded = f;
  };
  const px = (n: number) => `${n.toFixed(1)}px`;
  map.on("render", () => {
    if (!shown) return;
    if (!measured) measure();
    const { w, h } = size;
    const taken: Box[] = [];
    const names: { m: (typeof placed)[number]; x: number; y: number }[] = [];
    for (const m of placed) {
      if (m.unshown) continue;
      const q = map.project(m.at);
      const [x, y] = [q.x - box.left, q.y - box.top];
      if (m.name) {
        m.el.style.transform = `translate(${px(x)}, ${px(y)})`;
        names.push({ m, x, y });
        continue;
      }
      // (gone by 6px from the edge, over the 24px before)
      fade(m, clamp((Math.min(x, w - x, y, h - y) - 6) / 24));
      if (m.card) {
        if (m.choose) {
          // (the first side that fits whole, else the one that runs out least)
          const fits = SIDES.map((side) => ({ side, out: over(opens(side, x, y, m.w, m.h), m.w, m.h) }));
          m.side = fits.reduce((a, b) => (b.out < a.out ? b : a)).side;
          m.choose = false;
        }
        const [x0, y0] = opens(m.side, x, y, m.w, m.h);
        const inside = (v: number, room: number) => Math.min(Math.max(v, 8), Math.max(8, room - 8));
        m.el.style.translate = `${px(inside(x0, w - m.w))} ${px(inside(y0, h - m.h))}`;
        continue;
      }
      m.el.style.transform = `translate(${px(x)}, ${px(y)})`;
      taken.push({ x0: x - 8, x1: x + 8, y0: y - 8, y1: y + 8 });
      if (!m.chip) continue;
      // (the chip as the CSS sets it: over its place, or hanging below and
      // running right, slid back inside the card)
      m.el.style.setProperty("--x", ((x / w) * 100).toFixed(2));
      const x0 = Math.min(Math.max(m.hangs ? x - 14 : x - m.w / 2, 6), w - 6 - m.w);
      taken.push({ x0, x1: x0 + m.w, ...(m.hangs ? { y0: y, y1: y + 40 } : { y0: y - 40, y1: y }) });
    }
    for (const { m, x, y } of names) {
      const at = { x0: x - m.w / 2, x1: x + m.w / 2, y0: y - m.h / 2, y1: y + m.h / 2 };
      const clear = !taken.some((t) => hits(t, at));
      if (clear) taken.push(at);
      fade(m, clear ? clamp((Math.min(at.x0, w - at.x1, at.y0, h - at.y1) - 4) / 16) : 0);
    }
  });

  const later = () => {
    if (!queued) requestAnimationFrame(draw);
    queued = true;
  };

  map.on("load", () => {
    quiet(map);
    look(map);
    fine(map);
    map.addSource("terrain", { type: "raster-dem", tiles: [TERRAIN], encoding: "terrarium", tileSize: 256, maxzoom: 14 });
    map.setTerrain({ source: "terrain", exaggeration: 1 });
    // The photo's sky, deep teal over a pale haze at the hills.
    map.setSky({
      "sky-color": "#1d93b0",
      "horizon-color": "#aed5da",
      "sky-horizon-blend": 0.7,
      "fog-color": "#cfe2e4",
      "fog-ground-blend": 0.55,
      "horizon-fog-blend": 0.8,
      "atmosphere-blend": 0,
    });
    frame();
    // (in the photographer's place, so it's the photo's view that loads first)
    map.jumpTo(map.calculateCameraOptionsFromCameraLngLatAltRotation([EYE.lng, EYE.lat], EYE.alt, EYE.bearing, EYE.pitch));
    // Ready once the photo's view has drawn, or after a few seconds
    // whatever's still loading (the rest fills in as it flies).
    const go = () => {
      if (ready) return;
      // (again, now the hills under the flight's views have loaded)
      frame();
      ready = true;
      fly.classList.add("is-ready");
      draw();
      if (scrollY <= span.top) warm();
    };
    map.once("idle", go);
    setTimeout(go, 4000);
  });

  // Landed, it stays landed: once the page has come to rest there, the
  // scroll the flight ran on goes, the stage with the form at the top of
  // the page and the footer under it, so a swipe back up (meant for the
  // page, or by mistake) doesn't fly it all back. (Not while a finger's
  // still down or the page is still moving: the page shortens above where
  // it's scrolled to, and it's scrolled up by as much at the same moment,
  // which is only seamless when nothing else is scrolling it.)
  let held = false;
  let resting = 0;
  let touching = 0;
  const hold = () => {
    clearTimeout(resting);
    resting = window.setTimeout(() => {
      if (held || touching || flown < 1) return;
      held = true;
      stop();
      const before = fly.offsetHeight;
      fly.classList.add("is-held");
      scrollTo({ top: Math.max(0, scrollY - (before - fly.offsetHeight)), behavior: "instant" });
      frame();
      later();
    }, 250);
  };
  for (const kind of ["touchstart", "touchend", "touchcancel"])
    addEventListener(
      kind,
      (e) => {
        touching = (e as TouchEvent).touches.length;
        if (!touching && flown === 1) hold();
      },
      { passive: true, capture: true },
    );

  frame();
  draw();
  addEventListener("scroll", later, { passive: true });
  // (and again whenever the stage or the card changes size, a scrollbar
  // coming and going included, so the landing stays exact)
  const sizes = new ResizeObserver(() => {
    map.resize();
    frame();
    later();
  });
  sizes.observe(card);
  sizes.observe(stage);
  if (form) sizes.observe(form);
  // Played for you: the page scrolls itself through the flight, so it's the
  // same flight as by hand. "See it from above" stops on the card; "Start a
  // group" carries on to the form and puts the cursor in it. Any wheel,
  // touch, key or click of the visitor's own stops it where it is.
  let playing = 0;
  const stop = () => cancelAnimationFrame(playing);
  for (const kind of ["wheel", "touchstart", "keydown", "pointerdown"])
    addEventListener(kind, stop, { passive: true, capture: true });
  const play = (to: number, then?: () => void) => {
    stop();
    const from = scrollY;
    // (about two seconds a screen of flight, so the circle isn't rushed)
    const time = Math.min(9000, Math.max(1200, (Math.abs(to - from) / innerHeight) * 1900));
    const began = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / time);
      // (speeding up over the first sixth, steady, slowing over the last)
      const r = 1 / 6;
      const v = 1 / (1 - r);
      const e = t < r ? (v * t * t) / (2 * r) : t > 1 - r ? 1 - (v * (1 - t) ** 2) / (2 * r) : v * (t - r / 2);
      scrollTo({ top: from + (to - from) * e, behavior: "instant" });
      if (t < 1) playing = requestAnimationFrame(step);
      else then?.();
    };
    playing = requestAnimationFrame(step);
  };
  const landed = () => fly.offsetTop + fly.offsetHeight - stage.clientHeight;
  fly.querySelector(".fly__go")?.addEventListener("click", () => play(landed()));
  const inStage = () => form?.parentElement === stage;
  fly.querySelector(".fly__start")?.addEventListener("click", (e) => {
    if (!form) return;
    e.preventDefault();
    const at = inStage()
      ? landed()
      : form.getBoundingClientRect().top + scrollY - Math.max(16, (innerHeight - form.offsetHeight) / 2);
    play(at, () => form.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }));
  });
  // (beside the map, a field tabbed to before it's landed takes the page
  // straight there, so what has the focus is in view)
  form?.addEventListener("focusin", () => {
    if (inStage() && scrollY < landed() - 1) {
      stop();
      leap = true;
      scrollTo({ top: landed(), behavior: "instant" });
    }
  });
  // (and a link to the form, as after a form sent without a name, lands)
  if (location.hash === "#start" && inStage()) {
    leap = true;
    scrollTo({ top: landed(), behavior: "instant" });
  }
  for (const query of [beside, under])
    query.addEventListener("change", () => {
      place();
      later();
    });

  // (the camera in the page's console, for lining it up)
  (window as unknown as { fly: unknown }).fly = { map, EYE, frame, draw };
}
