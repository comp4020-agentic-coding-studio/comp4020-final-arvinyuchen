// The home page map's frame: central Canberra, from Belconnen's edge to
// Fyshwick, projected flat into a 560 x 493 picture. Shared by the component
// (src/components/HeroMap.astro) and the script that builds its map layers
// (scripts/build-hero-map.ts), so pins and geography line up.

export const W = 560;
export const H = 493;
const LON0 = 149.06;
const LAT0 = -35.243;
const SCALE = 6236.266; // px per degree of latitude; longitude shrinks by cos(lat)
const COS = Math.cos((35.28 * Math.PI) / 180);

export const at = (lat: number, lon: number) => ({ x: (lon - LON0) * COS * SCALE, y: (LAT0 - lat) * SCALE });

// the frame in degrees, south, west, north, east (Overpass's order)
export const BBOX = [LAT0 - H / SCALE, LON0, LAT0, LON0 + W / (COS * SCALE)] as const;
