// Freezes the query vector of every place's name in the search evaluation's
// snapshot (spec/search-eval/vectors.json), embedded as search.ts would
// embed someone typing it, into spec/search-eval/names.json. The spec then
// measures searching by name (known-item search) offline, on the same cards.
//
//   mise exec -- pnpm exec tsx scripts/build-name-eval.ts
//
// Run it again only after vectors.json is rebuilt.
import { readFileSync, writeFileSync } from "node:fs";
import { embed, EMBEDDING_MODEL } from "../src/lib/embed";
import { anchorsFrom, forMeaning, parseQuery } from "../src/lib/query";

const dir = new URL("../spec/search-eval/", import.meta.url);
const frozen = JSON.parse(readFileSync(new URL("vectors.json", dir), "utf8")) as {
  model: string;
  places: { name: string; area: string; lat: number; lon: number }[];
};
if (frozen.model !== EMBEDDING_MODEL) throw new Error(`vectors.json is ${frozen.model}, search embeds with ${EMBEDDING_MODEL}`);

const names = [...new Set(frozen.places.map((p) => p.name))];
const anchors = anchorsFrom(frozen.places);
const asked = names.map((n) => forMeaning(parseQuery(n, anchors)) || n);
const b64 = (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64");

const vecs: string[] = [];
for (let at = 0; at < asked.length; at += 128) {
  const made = await embed(asked.slice(at, at + 128), "query");
  if (!made) throw new Error("Voyage didn't answer: is VOYAGE_API_KEY set (mise exec)?");
  vecs.push(...made.map(b64));
}

writeFileSync(
  new URL("names.json", dir),
  `${JSON.stringify({
    model: EMBEDDING_MODEL,
    made: new Date().toISOString().slice(0, 10),
    names: Object.fromEntries(names.map((n, i) => [n, vecs[i]])),
  })}\n`,
);
console.log(`${names.length} names embedded with ${EMBEDDING_MODEL}`);
