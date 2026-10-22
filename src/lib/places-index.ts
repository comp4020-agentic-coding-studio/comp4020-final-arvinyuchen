import index from "../data/places-index.json";
import type { Candidate } from "./finder";
import type { Kind } from "./kinds";

// The places Find searches first: Canberra's places to eat, drink and go
// from Overture Maps, built by scripts/build-places-index.ts. Only a finder's
// index: none of it is in Explore until someone shares it.
export const LOCAL: Candidate[] = (
  index.places as { id: string; name: string; kind: string; area: string; address: string; lat: number; lon: number }[]
).map((p) => ({
  ref: `overture/${p.id}`,
  name: p.name,
  kind: p.kind as Kind,
  area: p.area,
  address: p.address,
  lat: p.lat,
  lon: p.lon,
}));

const byRef = new Map(LOCAL.map((c) => [c.ref, c]));
/** One of the index's places, by its "overture/<id>". */
export const localPlace = (ref: string) => byRef.get(ref);
