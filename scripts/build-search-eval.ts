// Freezes what the search evaluation (spec/search-eval.test.ts) runs on:
// the starter places as they are now, each card's vector, and each labelled
// prompt's vector, all from Voyage, into spec/search-eval/vectors.json. The
// spec then ranks with src/lib/rank.ts on those fixed vectors, so it needs
// no key and no network, and gives the same answer every run, in CI too.
//
//   mise exec -- pnpm exec tsx scripts/build-search-eval.ts
//
// Run it again only when the labels gain a prompt, or to measure a new
// embedding model; the snapshot is otherwise the point.
import { readFileSync, writeFileSync } from "node:fs";
import { CATALOGUE } from "../src/lib/catalogue";
import { embed, EMBEDDING_MODEL } from "../src/lib/embed";
import { anchorsFrom, forMeaning, parseQuery } from "../src/lib/query";
import { cardText } from "../src/lib/rank";

const dir = new URL("../spec/search-eval/", import.meta.url);
const labels = JSON.parse(readFileSync(new URL("labels.json", dir), "utf8")) as { prompts: { text: string }[] };

const places = CATALOGUE.map((c) => ({ key: c.key, name: c.name, kind: c.kind, area: c.area, why: c.blurb, lat: c.lat, lon: c.lon }));
const b64 = (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64");

const cards: string[] = [];
for (let at = 0; at < places.length; at += 128) {
  const made = await embed(places.slice(at, at + 128).map(cardText), "document");
  if (!made) throw new Error("Voyage didn't answer: is VOYAGE_API_KEY set (mise exec)?");
  cards.push(...made.map(b64));
}

// What search.ts embeds for a prompt: its meaning once a where is taken out.
const anchors = anchorsFrom(places);
const asked = labels.prompts.map((p) => forMeaning(parseQuery(p.text, anchors)) || p.text);
const prompts = await embed(asked, "query");
if (!prompts) throw new Error("Voyage didn't answer for the prompts");

writeFileSync(
  new URL("vectors.json", dir),
  `${JSON.stringify({
    model: EMBEDDING_MODEL,
    made: new Date().toISOString().slice(0, 10),
    places: places.map((p, i) => ({ ...p, vec: cards[i] })),
    prompts: Object.fromEntries(labels.prompts.map((p, i) => [p.text, b64(prompts[i])])),
  })}\n`,
);
console.log(`${places.length} places and ${asked.length} prompts embedded with ${EMBEDDING_MODEL}`);
