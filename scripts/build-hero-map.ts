// Builds src/lib/hero-map-data.ts: the geography under the home page's pins,
// from OpenStreetMap (© OpenStreetMap contributors, ODbL). Nothing on that map
// is drawn by hand: every outline and line comes from one Overpass query over
// the frame in src/lib/hero-frame.ts, projected into it and simplified.
//
//   node scripts/build-hero-map.ts
//
// Where Node can't reach Overpass but curl can, run the same query by hand:
//
//   node scripts/build-hero-map.ts --query > query.overpassql
//   curl -A "<the User-Agent below>" --data-urlencode data@query.overpassql \
//     https://overpass-api.de/api/interpreter > osm.json
//   node scripts/build-hero-map.ts --json osm.json
//
// One request per run, with the app's User-Agent. The output is committed, so
// the site never asks OpenStreetMap for anything; re-run only to refresh.
import { readFileSync, writeFileSync } from "node:fs";
import { at, BBOX, H, W } from "../src/lib/hero-frame.ts";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const OUT = "src/lib/hero-map-data.ts";
const LAKE = 3400115; // Lake Burley Griffin
const bbox = BBOX.join(",");

const query = `[out:json][timeout:90];
(
  relation(${LAKE});
  relation["leisure"="nature_reserve"]["name"](${bbox});
  nwr["leisure"="park"]["name"](${bbox});
  nwr["amenity"="university"]["name"="Australian National University"](${bbox});
  way["waterway"~"^(river|stream|canal)$"]["name"](${bbox});
  way["highway"~"^(motorway|trunk|primary)$"](${bbox});
  node["place"="suburb"](${bbox});
  node["natural"="peak"]["name"](${bbox});
);
out geom;`;

type LatLon = { lat: number; lon: number };
type Pt = { x: number; y: number };
type Element = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: LatLon[];
  members?: { type: string; role: string; geometry?: LatLon[] }[];
};

const project = (g: LatLon[]): Pt[] => g.map((p) => at(p.lat, p.lon));

// Douglas–Peucker: drop points that sit within `tol` px of the line through
// their neighbours. The map is a sketch at 560 px wide, not a survey.
function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let worst = 0;
  let index = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    // a closed ring starts and ends on the same point: measure from that point
    const d =
      len === 0
        ? Math.hypot(p.x - a.x, p.y - a.y)
        : Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
    if (d > worst) [worst, index] = [d, i];
  }
  if (worst <= tol) return [a, b];
  return [...simplify(pts.slice(0, index + 1), tol).slice(0, -1), ...simplify(pts.slice(index), tol)];
}

// Multipolygon members arrive as separate ways; join them end to end into
// closed rings.
function rings(ways: LatLon[][]): LatLon[][] {
  const key = (p: LatLon) => `${p.lat},${p.lon}`;
  const left = ways.filter((w) => w.length > 1).map((w) => [...w]);
  const out: LatLon[][] = [];
  while (left.length) {
    const ring = left.shift() as LatLon[];
    let grew = true;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const w = left[i];
        const end = key(ring[ring.length - 1]);
        if (key(w[0]) === end) ring.push(...w.slice(1));
        else if (key(w[w.length - 1]) === end) ring.push(...w.reverse().slice(1));
        else continue;
        left.splice(i, 1);
        grew = true;
        break;
      }
    }
    out.push(ring);
  }
  return out;
}

const inFrame = (pts: Pt[]) => pts.some((p) => p.x > -40 && p.x < W + 40 && p.y > -40 && p.y < H + 40);
const area = (pts: Pt[]) =>
  Math.abs(pts.reduce((s, p, i) => s + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0)) / 2;
const n = (v: number) => v.toFixed(1);
const line = (pts: Pt[]) => `M${pts.map((p) => `${n(p.x)} ${n(p.y)}`).join("L")}`;
const closed = (pts: Pt[]) => `${line(pts)}Z`;

// an area's outline as one path: outer rings and their holes (fill-rule evenodd)
function shape(e: Element, tol: number, minArea = 0): string | null {
  const parts =
    e.type === "way" && e.geometry
      ? [e.geometry]
      : rings((e.members ?? []).filter((m) => m.type === "way" && m.geometry).map((m) => m.geometry as LatLon[]));
  const kept = parts
    .map((r) => simplify(project(r), tol))
    .filter((r) => r.length > 2 && inFrame(r) && area(r) >= minArea);
  return kept.length ? kept.map(closed).join("") : null;
}

const USER_AGENT = "Spots hero map build (github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen)";
const flag = (name: string) => process.argv[process.argv.indexOf(`--${name}`) + 1];

if (process.argv.includes("--query")) {
  process.stdout.write(query);
  process.exit(0);
}

async function overpass(): Promise<{ elements: Element[] }> {
  if (process.argv.includes("--json")) return JSON.parse(readFileSync(flag("json"), "utf8"));
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": USER_AGENT },
    body: new URLSearchParams({ data: query }),
  });
  if (!res.ok) throw new Error(`Overpass: HTTP ${res.status}`);
  return res.json();
}
const { elements } = await overpass();
const tagged = (k: string, v: RegExp) => elements.filter((e) => v.test(e.tags?.[k] ?? ""));

const lakeEl = elements.find((e) => e.type === "relation" && e.id === LAKE);
const lake = lakeEl && shape(lakeEl, 0.8);
if (!lake) throw new Error(`Overpass returned no Lake Burley Griffin (relation ${LAKE})`);

const reserves = tagged("leisure", /^nature_reserve$/)
  .map((e) => ({ name: e.tags?.name ?? "", d: shape(e, 1.2, 60) }))
  .filter((r): r is { name: string; d: string } => r.d !== null);

const parks = tagged("leisure", /^park$/)
  .filter((e) => e.type !== "node")
  .map((e) => ({ name: e.tags?.name ?? "", d: shape(e, 0.8, 80) }))
  .filter((r): r is { name: string; d: string } => r.d !== null);

const campus = tagged("amenity", /^university$/)
  .filter((e) => e.type !== "node")
  .map((e) => shape(e, 1, 200))
  .filter((d): d is string => d !== null)
  .join("");

// Lines arrive as many short ways; joining those that meet end to end first
// lets the simplifier work on whole roads and rivers, not each fragment.
const paths = (els: Element[], tol: number) =>
  rings(els.filter((e) => e.geometry).map((e) => e.geometry as LatLon[]))
    .map((g) => simplify(project(g), tol))
    .filter(inFrame)
    .map(line)
    .join("");

const water = paths(tagged("waterway", /^(river|stream|canal)$/), 0.8);
const motorways = paths(tagged("highway", /^(motorway|trunk)$/), 1.4);
const roads = paths(tagged("highway", /^primary$/), 1.4);

const labels = (els: Element[]) =>
  els
    .filter((e) => e.type === "node" && e.tags?.name)
    .map((e) => ({ name: e.tags?.name as string, ...at(e.lat as number, e.lon as number) }))
    .filter((p) => p.x > 20 && p.x < W - 20 && p.y > 20 && p.y < H - 20)
    .map((p) => ({ name: p.name, x: Number(n(p.x)), y: Number(n(p.y)) }))
    .sort((a, b) => a.name.localeCompare(b.name));

const suburbs = labels(tagged("place", /^suburb$/));
const peaks = labels(tagged("natural", /^peak$/));

const today = new Date().toISOString().slice(0, 10);
const out = `// Generated by scripts/build-hero-map.ts on ${today}: do not edit by hand.
// Map data © OpenStreetMap contributors, ODbL 1.0 (openstreetmap.org/copyright),
// projected into the frame in ./hero-frame.ts and simplified.

export const LAKE = ${JSON.stringify(lake)};
export const RESERVES: { name: string; d: string }[] = ${JSON.stringify(reserves)};
export const PARKS: { name: string; d: string }[] = ${JSON.stringify(parks)};
export const CAMPUS = ${JSON.stringify(campus)};
export const WATER = ${JSON.stringify(water)};
export const MOTORWAYS = ${JSON.stringify(motorways)};
export const ROADS = ${JSON.stringify(roads)};
export const SUBURBS: { name: string; x: number; y: number }[] = ${JSON.stringify(suburbs)};
export const PEAKS: { name: string; x: number; y: number }[] = ${JSON.stringify(peaks)};
`;
writeFileSync(OUT, out);
console.log(
  `${OUT}: ${(out.length / 1024).toFixed(0)} KB · ${reserves.length} reserves, ${parks.length} parks, ` +
    `${suburbs.length} suburbs, ${peaks.length} peaks${campus ? ", ANU campus" : ""}`,
);
