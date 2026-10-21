import type * as maplibregl from "maplibre-gl";

// Spots' one map look, for the group's map (src/scripts/map.ts) and the
// invite's small one (src/scripts/minimap.ts): OpenFreeMap's quiet Positron
// tiles recoloured to something like Apple Maps. A warm neutral ground, fresh
// parks, clear blue water, white streets with pale yellow highways, fine
// lines, and the hills in soft relief from Mapzen's open terrain tiles. The
// tiles' lettering gives way to a few names in the page's own font
// (src/scripts/map-marks.ts). The home page's drawn map
// (src/components/HeroMap.astro) is built in the same colours and widths.

export const STYLE = "https://tiles.openfreemap.org/styles/positron";

type PaintKey = Parameters<maplibregl.Map["setPaintProperty"]>[1];
const white = (id: string): [string, PaintKey, string] => [id, "line-color", "#ffffff"];

const PAINT: [string, PaintKey, string | number][] = [
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
  ["railway", "line-color", "#d3d0c8"],
  ...["highway_minor", "highway_path", "highway_major_inner", "highway_major_subtle"].map(white),
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

/** Recolours a loaded Positron map and shades its hills. */
export function look(map: maplibregl.Map) {
  for (const id of ["highway_path", "railway_dashline", "aeroway-taxiway"])
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
  for (const [id, key, value] of PAINT) if (map.getLayer(id)) map.setPaintProperty(id, key, value);
  // Positron only greens nature reserves; a city's parks and lawns are
  // OpenMapTiles' grass, and Apple Maps shows them, so this does too.
  map.addLayer(
    {
      id: "landcover_grass",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["==", ["get", "class"], "grass"],
      paint: { "fill-color": "#d5eac6" },
    },
    "landcover_wood",
  );
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

/**
 * Hides the map's own lettering, all but the layers in `keep`: the names a
 * map shows are printed over it in the page's font instead (map-marks.ts).
 */
export function quiet(map: maplibregl.Map, keep: string[] = []) {
  for (const layer of map.getStyle().layers)
    if (layer.type === "symbol" && !keep.includes(layer.id)) map.setLayoutProperty(layer.id, "visibility", "none");
}

// Line widths as the invite's card shows them, in pixels: hairline side
// streets, clear main roads, highways a little wider, as Apple Maps draws a city.
export const WIDTH: [string, number][] = [
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

// The same lines on a map that zooms, as [zoom, width] stops: as fine as the
// card's across the city (zoom 11 to 13), widening as the camera comes down
// into a street, where a side street is a lane you could walk down.
const motorway = [8, 1.2, 11, 2.4, 12, 2.8, 14, 4.2, 16, 8.4, 18, 17.5, 20, 34];
const motorwayCasing = [8, 2, 11, 3.4, 12, 3.8, 14, 5.4, 16, 10, 18, 20, 20, 38];
const ZOOMED: [string, number[]][] = [
  ["highway_minor", [11, 0.4, 13, 0.7, 15, 1.6, 16.5, 3.6, 18, 8, 20, 18]],
  ["highway_major_subtle", [6, 0.6, 11, 1.2]],
  ["highway_major_casing", [10, 2.2, 12, 2.8, 14, 4.2, 16, 8, 18, 17, 20, 30]],
  ["highway_major_inner", [10, 1.4, 12, 1.9, 14, 3, 16, 6.4, 18, 14.5, 20, 27]],
  ["highway_motorway_casing", motorwayCasing],
  ["highway_motorway_inner", motorway],
  ["highway_motorway_bridge_casing", motorwayCasing],
  ["highway_motorway_bridge_inner", motorway],
  ["tunnel_motorway_casing", motorwayCasing],
  ["tunnel_motorway_inner", motorway],
  ["waterway", [11, 0.8, 16, 2, 20, 5]],
  ["railway", [13, 0.8, 16, 1.4, 20, 4]],
];

/** Fine lines for a map shown at its own size, at whatever zoom it's at. */
export function fine(map: maplibregl.Map) {
  for (const [id, stops] of ZOOMED)
    if (map.getLayer(id)) map.setPaintProperty(id, "line-width", ["interpolate", ["linear"], ["zoom"], ...stops]);
}

/** The map's own lettering in the same quiet greys, and water names in blue. */
export function letters(map: maplibregl.Map) {
  for (const layer of map.getStyle().layers) {
    if (layer.type !== "symbol") continue;
    const water = layer.id.startsWith("water");
    map.setPaintProperty(layer.id, "text-color", water ? "#2f7fbf" : "rgba(60, 60, 67, 0.75)");
    map.setPaintProperty(layer.id, "text-halo-color", water ? "rgba(255, 255, 255, 0.7)" : "#ffffff");
  }
  // Road shields and the state's name are noise in a city map.
  for (const id of ["highway-shield-non-us", "highway-shield-us-interstate", "road_shield_us", "label_state"])
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
}

/** Buildings stand up when the camera tilts into a street. */
export function buildings(map: maplibregl.Map) {
  map.addLayer(
    {
      id: "building-3d",
      type: "fill-extrusion",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 15,
      paint: {
        "fill-extrusion-color": "#e8e5de",
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 15, 0, 15.5, 0.9],
      },
    },
    "waterway_line_label",
  );
}
