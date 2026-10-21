// Builds public/images/hero-relief.webp: the hills under the home page's
// map, shaded the way the live maps shade them (src/scripts/map-look.ts),
// so Black Mountain and Mount Ainslie read as hills, not just names.
//
//   node scripts/build-hero-relief.ts
//
// Elevation is Mapzen's open terrain tiles (terrarium encoding, on AWS; see
// https://github.com/tilezen/joerd/blob/master/docs/attribution.md), fetched
// once per run for the frame in src/lib/hero-frame.ts and shaded here. The
// output is committed, so the site never asks for a tile; re-run only if the
// frame moves.
import sharp from "sharp";
import { BBOX, H, W, where } from "../src/lib/hero-frame.ts";

const OUT = "public/images/hero-relief.webp";
// About 30 m a pixel: the shape of the hills without every kerb and terrace
// (finer tiles band the slopes and speckle the flat suburbs).
const Z = 12;
const TILE = 256;
// One pixel per picture unit: the shading is soft, so a sharp screen
// stretching it loses nothing, and the file stays small.
const DENSITY = 1;

// Web Mercator, in pixels at zoom Z.
const mx = (lon: number) => ((lon + 180) / 360) * TILE * 2 ** Z;
const my = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * TILE * 2 ** Z;
};

// The tiles over the frame, with a tile of margin for the slope at the edges.
const [south, west, north, east] = BBOX;
const tx0 = Math.floor(mx(west) / TILE) - 1;
const tx1 = Math.floor(mx(east) / TILE) + 1;
const ty0 = Math.floor(my(north) / TILE) - 1;
const ty1 = Math.floor(my(south) / TILE) + 1;
const cols = tx1 - tx0 + 1;
const rows = ty1 - ty0 + 1;
const mosaic = new Float32Array(cols * TILE * rows * TILE);

for (let ty = ty0; ty <= ty1; ty++) {
  for (let tx = tx0; tx <= tx1; tx++) {
    const url = `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${Z}/${tx}/${ty}.png`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} for ${url}`);
    const { data } = await sharp(Buffer.from(await res.arrayBuffer()))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const i = (y * TILE + x) * 3;
        // terrarium: metres = R * 256 + G + B / 256 - 32768
        const metres = data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
        mosaic[((ty - ty0) * TILE + y) * cols * TILE + (tx - tx0) * TILE + x] = metres;
      }
    }
  }
}

// Elevation at a point in the picture, read off the mosaic (bilinear).
const elevation = (px: number, py: number) => {
  const { lat, lon } = where(px, py);
  const x = mx(lon) - tx0 * TILE;
  const y = my(lat) - ty0 * TILE;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (xx: number, yy: number) => mosaic[yy * cols * TILE + xx];
  return (
    at(x0, y0) * (1 - fx) * (1 - fy) +
    at(x0 + 1, y0) * fx * (1 - fy) +
    at(x0, y0 + 1) * (1 - fx) * fy +
    at(x0 + 1, y0 + 1) * fx * fy
  );
};

const w = W * DENSITY;
const h = H * DENSITY;
const grid = new Float32Array((w + 2) * (h + 2));
for (let y = -1; y <= h; y++)
  for (let x = -1; x <= w; x++) grid[(y + 1) * (w + 2) + (x + 1)] = elevation(x / DENSITY, y / DENSITY);
// Smoothed first (a box blur, three times over, is near enough a Gaussian):
// read off a coarser grid, the slopes would change in steps at its lines
// and the hills would come out ringed like contour lines.
const smooth = (src: Float32Array, gw: number, gh: number, r: number) => {
  const tmp = new Float32Array(src.length);
  const pass = (from: Float32Array, to: Float32Array, horizontal: boolean) => {
    const [n, m] = horizontal ? [gh, gw] : [gw, gh];
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < m; b++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) {
          const c = Math.min(m - 1, Math.max(0, b + k));
          sum += from[horizontal ? a * gw + c : c * gw + a];
        }
        to[horizontal ? a * gw + b : b * gw + a] = sum / (2 * r + 1);
      }
    }
  };
  for (let i = 0; i < 3; i++) {
    pass(src, tmp, true);
    pass(tmp, src, false);
  }
};
smooth(grid, w + 2, h + 2, 3);
const z = (x: number, y: number) => grid[(y + 1) * (w + 2) + (x + 1)];

// Hillshade (Horn's slope), lit from the north-west like a printed map: the
// slopes facing the light a soft white, those away from it a warm shadow,
// flat ground clear, the same two colours as the live maps' relief.
const metresPerPixel = 111_320 / (6236.266 * DENSITY);
const EXAGGERATION = 2.5;
const SUN = (315 * Math.PI) / 180;
const ALTITUDE = (45 * Math.PI) / 180;
const flat = Math.sin(ALTITUDE);
const out = Buffer.alloc(w * h * 4);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const dzdx =
      (z(x + 1, y - 1) + 2 * z(x + 1, y) + z(x + 1, y + 1) - (z(x - 1, y - 1) + 2 * z(x - 1, y) + z(x - 1, y + 1))) /
      (8 * metresPerPixel);
    const dzdy =
      (z(x - 1, y + 1) + 2 * z(x, y + 1) + z(x + 1, y + 1) - (z(x - 1, y - 1) + 2 * z(x, y - 1) + z(x + 1, y - 1))) /
      (8 * metresPerPixel);
    const slope = Math.atan(EXAGGERATION * Math.hypot(dzdx, dzdy));
    const aspect = Math.atan2(dzdy, -dzdx);
    const light =
      Math.sin(ALTITUDE) * Math.cos(slope) + Math.cos(ALTITUDE) * Math.sin(slope) * Math.cos(SUN - Math.PI / 2 - aspect);
    const d = light - flat;
    const i = (y * w + x) * 4;
    if (d < 0) {
      out.set([74, 66, 48, Math.round(Math.min(1, -d * 1.8) * 0.42 * 255)], i);
    } else {
      out.set([255, 255, 255, Math.round(Math.min(1, d * 2.4) * 0.5 * 255)], i);
    }
  }
}

await sharp(out, { raw: { width: w, height: h, channels: 4 } })
  .blur(0.8)
  // (the alpha kept whole: compressed, its soft steps band into contour lines)
  .webp({ quality: 80, alphaQuality: 100 })
  .toFile(OUT);
console.log(`wrote ${OUT} (${cols * rows} tiles at z${Z})`);
