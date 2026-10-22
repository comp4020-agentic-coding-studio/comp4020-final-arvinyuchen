// Builds the index that Find searches first (src/data/places-index.json):
// the places in and around Canberra from Overture Maps' places theme, kept
// to the kinds a group goes out to (somewhere to eat, a coffee, a drink,
// outdoors, culture, something to do), each with the suburb it's in.
//
// It's only a finder's index. Nothing in it reaches Explore by itself: a
// place gets there when a person shares it, with a reason and a photo.
//
//   node scripts/build-places-index.ts [release]
//
// With no release it takes Overture's newest. Overture's places are under
// CDLA Permissive 2.0 (credited in the footer), and so are the suburb
// boundaries each place is matched to, from its divisions theme.
import { writeFileSync } from "node:fs";
import { DuckDBInstance } from "@duckdb/node-api";
import type { Kind } from "../src/lib/kinds.ts";

const BOX = { west: 148.76, east: 149.4, south: -35.92, north: -35.12 };
const OUT = new URL("../src/data/places-index.json", import.meta.url);

async function newestRelease(): Promise<string> {
  const res = await fetch("https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/?list-type=2&prefix=release/&delimiter=/");
  const releases = [...(await res.text()).matchAll(/<Prefix>release\/([^<]+)\/<\/Prefix>/g)].map((m) => m[1]).sort();
  if (!releases.length) throw new Error("no Overture releases listed");
  return releases.at(-1)!;
}

// Overture's taxonomy to Spots' kinds; anything not named here is left out
// (gyms, clinics, shops, offices, places of worship, betting...).
const KINDS: Record<Kind, string[]> = {
  coffee: [
    "cafe", "coffee_shop", "bakery", "bubble_tea_shop", "dessert_shop", "ice_cream_shop", "gelato_shop", "tea_room",
    "donut_shop", "chocolatier", "cupcake_shop", "pie_shop", "smoothie_juice_bar", "frozen_yogurt_shop", "pancake_house",
  ],
  drinks: [
    "bar", "pub", "cocktail_bar", "wine_bar", "winery", "brewery", "distillery", "gastropub", "sports_bar", "lounge",
    "hotel_bar", "beer_bar", "dive_bar", "beer_garden", "irish_pub", "gay_bar", "tiki_bar", "champagne_bar", "dance_club",
  ],
  food: [],
  outdoors: [
    "park", "national_park", "hiking_trail", "mountain_bike_trail", "mountain", "lake", "nature_reserve", "beach",
    "botanical_garden", "forest", "waterfall", "pier",
  ],
  culture: [
    "art_gallery", "museum", "history_museum", "science_museum", "art_museum", "state_museum", "childrens_museum",
    "theatre_venue", "performing_arts_venue", "music_venue", "jazz_and_blues_venue", "auditorium", "observatory",
    "sculpture_statue", "street_art", "comedy_club", "cultural_center", "historic_site", "monument",
  ],
  fun: [
    "movie_theater", "arcade", "amusement_park", "karaoke_venue", "escape_room", "zoo", "aquarium", "wildlife_sanctuary",
    "circus_venue", "fairgrounds", "glass_blowing_venue", "stadium_arena", "festival_venue", "bowling_alley",
    "miniature_golf_course", "water_park", "rock_climbing_spot", "paintball", "laser_tag", "go_kart_club",
    "ice_skating_rink", "indoor_playcenter", "pool_hall", "pool_billiards", "adventure_sports_center", "sky_diving",
    "hang_gliding_center", "bike_rental", "canoe_and_kayak_hire_service", "boat_rental_and_training", "horse_riding",
    "horseback_riding_service", "driving_range", "golf_course", "swimming_pool", "archery_range", "skate_park",
  ],
};
// (and everywhere to eat: the rest of food and drink, but not these)
const NOT_FOOD = new Set(["airport_lounge", "internet_cafe", "cafeteria", "candy_store"]);
// (a road filed as a park or a landmark, like Parkes Way: a street isn't a
// place to go, though a café named for one is)
const ROAD = /\b(street|st|road|rd|avenue|ave|way|terrace|tce|drive|dr|parade|circuit|cct|crescent|cres|highway|hwy)\.?$/i;

function kindOf(primary: string, top: string): Kind | null {
  for (const [kind, names] of Object.entries(KINDS) as [Kind, string[]][]) if (names.includes(primary)) return kind;
  return top === "food_and_drink" && !NOT_FOOD.has(primary) ? "food" : null;
}

const release = process.argv[2] ?? (await newestRelease());
console.log(`Overture release ${release}`);
const db = await DuckDBInstance.create(":memory:");
const sql = await db.connect();
await sql.run("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';");
const theme = (name: string, type: string) =>
  `read_parquet('s3://overturemaps-us-west-2/release/${release}/theme=${name}/type=${type}/*', hive_partitioning = 1)`;
const inBox = `bbox.xmin < ${BOX.east} AND bbox.xmax > ${BOX.west} AND bbox.ymin < ${BOX.north} AND bbox.ymax > ${BOX.south}`;

// Where each place is: the suburb whose boundary it's inside (Overture's
// divisions: Canberra's suburbs are its "macrohoods"), else the town around
// it, leaving out the ACT's big districts, which no one would call a suburb.
await sql.run(`
  CREATE TABLE areas AS
  SELECT names.primary AS name, geometry, CASE subtype WHEN 'macrohood' THEN 0 ELSE 1 END AS rank
    FROM ${theme("divisions", "division_area")}
   WHERE ${inBox} AND subtype IN ('macrohood', 'locality') AND names.primary NOT LIKE 'District of %'`);
const rows = (
  await sql.runAndReadAll(`
    WITH p AS (
      SELECT id, names.primary AS name, taxonomy.primary AS kind, taxonomy.hierarchy[1] AS top,
             addresses[1].freeform AS address, geometry,
             (bbox.xmin + bbox.xmax) / 2 AS lon, (bbox.ymin + bbox.ymax) / 2 AS lat
        FROM ${theme("places", "place")}
       WHERE bbox.xmin > ${BOX.west} AND bbox.xmax < ${BOX.east} AND bbox.ymin > ${BOX.south} AND bbox.ymax < ${BOX.north}
         AND names.primary IS NOT NULL AND confidence >= 0.6
         AND coalesce(operating_status, 'open') = 'open'
    )
    SELECT p.id, p.name, p.kind, p.top, p.address, p.lon, p.lat,
           (SELECT a.name FROM areas a WHERE ST_Contains(a.geometry, p.geometry) ORDER BY a.rank LIMIT 1) AS area
      FROM p`)
).getRowObjectsJson() as {
  id: string;
  name: string;
  kind: string;
  top: string;
  address: string | null;
  lat: number;
  lon: number;
  area: string | null;
}[];

const index = rows
  .map((r) => ({ ...r, kind: kindOf(r.kind ?? "", r.top ?? "") }))
  .filter((r): r is typeof r & { kind: Kind } => r.kind !== null)
  .filter((r) => !((r.kind === "outdoors" || r.kind === "culture") && ROAD.test(r.name.trim())))
  .map((r) => ({
    id: r.id,
    name: r.name.trim(),
    kind: r.kind,
    area: r.area ?? "",
    address: (r.address ?? "").trim(),
    lat: Math.round(Number(r.lat) * 1e6) / 1e6,
    lon: Math.round(Number(r.lon) * 1e6) / 1e6,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(
  OUT,
  JSON.stringify({
    source: `Overture Maps Foundation, places theme, release ${release} (CDLA Permissive 2.0)`,
    places: index,
  }),
);
const by = Object.groupBy(index, (p) => p.kind);
console.log(`${index.length} places:`, Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v!.length])));
