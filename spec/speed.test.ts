import { JSDOM } from "jsdom";
import { gzipSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import { Jar } from "./authenticator";
import { baseUrl, join, origin, page, request, startGroup } from "./browser";
import { addDays, today } from "../src/lib/when";

// Quick to use, measured: a group of the size Spots is for (six people, ten
// places on the list, keens, a plan, Talk) and every page they open, each
// held to a budget for how long the server takes to answer and what the
// browser has to fetch before the page works: its HTML, its CSS, the
// JavaScript it imports at once and the images it doesn't defer. What loads
// later (the map, photos below the fold) is reported, not held.
//
// Sizes are gzipped (the server sends brotli, a little smaller). Times are
// the median of five, after one to warm up, against the app as the spec
// runs it, so they say how much work a page is, not how fast a network is;
// the live site's times, measured from outside, are in #204.

const KB = 1024;
const gz = (b: Buffer) => gzipSync(b).length;

// (given several paths, each of the five asks the next, as a search asks a
// new prompt; the first warms up)
async function timed(jar: Jar, ...paths: string[]) {
  await request(jar, paths[0]);
  const times: number[] = [];
  let res: Response | undefined;
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    res = await request(jar, paths[(i + 1) % paths.length]);
    await res.clone().arrayBuffer();
    times.push(performance.now() - start);
  }
  return { ms: times.sort((a, b) => a - b)[2], res: res! };
}

const fetched = new Map<string, Promise<Buffer>>();
const asset = (path: string) => {
  if (!fetched.has(path)) fetched.set(path, fetch(new URL(path, baseUrl)).then(async (r) => Buffer.from(await r.arrayBuffer())));
  return fetched.get(path)!;
};

/** What a page makes the browser fetch: at once, and later. */
async function weigh(html: string) {
  const doc = new JSDOM(html).window.document;
  const own = (url: string | null) => (url && url.startsWith("/") && !url.startsWith("//") ? url : null);
  const css = [...doc.querySelectorAll("link[rel=stylesheet]")].map((l) => own(l.getAttribute("href")));
  const js = [...doc.querySelectorAll("script[src], link[rel=modulepreload]")].map((s) => own(s.getAttribute("src") ?? s.getAttribute("href")));
  const imgs = [...doc.querySelectorAll("img[src]")];
  const eager = imgs.filter((i) => i.getAttribute("loading") !== "lazy").map((i) => own(i.getAttribute("src")));
  const lazy = imgs.filter((i) => i.getAttribute("loading") === "lazy").map((i) => own(i.getAttribute("src")));
  // (a module's own imports are fetched before it runs; import() waits)
  const now = new Set<string>();
  const later = new Set<string>();
  const walk = async (path: string, into: Set<string>) => {
    if (now.has(path) || into.has(path)) return;
    into.add(path);
    const text = (await asset(path)).toString();
    const at = (m: RegExpMatchArray) => new URL(m[1], `http://x${path}`).pathname;
    for (const m of text.matchAll(/(?:^|[;}\s])import\s*(?:[\w$*{}\s,]+from\s*)?["'`](\.{1,2}\/[^"'`]+)["'`]/g)) await walk(at(m), into);
    for (const m of text.matchAll(/import\(\s*["'`](\.{1,2}\/[^"'`]+)["'`]\s*\)/g)) await walk(at(m), later);
  };
  for (const path of js) if (path) await walk(path, now);
  const sum = async (paths: (string | null)[], size: (b: Buffer) => number) =>
    (await Promise.all([...new Set(paths)].filter((p): p is string => !!p).map(async (p) => size(await asset(p))))).reduce((a, b) => a + b, 0);
  const laterJs = [...later].filter((p) => !now.has(p));
  return {
    html: gz(Buffer.from(html)),
    css: await sum(css, gz),
    js: await sum([...now], gz),
    images: await sum(eager, (b) => b.length),
    later: { js: await sum(laterJs, gz), images: await sum(lazy, (b) => b.length) },
  };
}

type Weighed = Awaited<ReturnType<typeof weigh>> & { path: string; ms: number };
const pages = new Map<string, Weighed>();
let rows = 0;
async function measure(name: string, jar: Jar, ...paths: string[]) {
  const { ms, res } = await timed(jar, ...paths);
  const path = paths.at(-1)!;
  expect(res.status, path).toBe(200);
  pages.set(name, { path, ms, ...(await weigh(await res.text())) });
}

beforeAll(async () => {
  const ana = new Jar();
  const id = await startGroup(ana, "Speed crew", "Ana");
  const api = `/api/groups/${id}`;
  const crew = [ana];
  for (const name of ["Ben", "Cleo", "Dev", "Eli", "Fay"]) {
    const jar = new Jar();
    await join(jar, id, id, name);
    crew.push(jar);
  }
  // (every kind, as a group's list has; Explore's pool is shared with the
  // rest of the spec, so mostly places other tests already put on lists)
  const keys = ["questacon", "nga", "nma", "awm", "arboretum", "mt-ainslie", "bus-depot-markets", "the-cupping-room", "bentspoke-brewing-co", "kingpin"];
  for (const [i, key] of keys.entries()) await request(crew[i % crew.length], `${api}/picks`, { form: { key } });
  const doc = await page(ana, `/g/${id}`);
  const picks = [...doc.querySelectorAll<HTMLInputElement>("#list input[name=pick]")].map((i) => i.value);
  const places = [...doc.querySelectorAll<HTMLElement>("#list [data-place-id]")].map((e) => e.dataset.placeId ?? "");
  for (const [i, jar] of crew.entries())
    for (const pick of picks.filter((_, j) => (i + j) % 2 === 0)) await request(jar, `${api}/keen`, { form: { pick, keen: "on" } });
  await request(ana, `${api}/plans`, { form: { action: "start", place: places[0], day: addDays(today(), 3) } });
  for (const [i, jar] of crew.entries())
    await fetch(new URL(`${api}/talk`, baseUrl), {
      method: "POST",
      headers: { origin, cookie: jar.header, "x-spots": "in-page" },
      body: new URLSearchParams({ action: "send", place: places[0], body: `Message ${i + 1} about the first stop`, nonce: `speed${i}` }),
    });

  rows = (await page(ana, `/g/${id}`)).querySelectorAll("#list input[name=pick]").length;

  const out = new Jar();
  await measure("home", out, "/");
  await measure("sign in", out, "/signin");
  await measure("invite preview", out, `/g/${id}`);
  await measure("group page", ana, `/g/${id}`);
  // A search with a prompt the server hasn't seen each time: with a Voyage
  // key, the prompt's vector is a round trip to Voyage (the cards' are
  // kept, and so is a prompt once asked, so a server the spec has run
  // against before answers these from memory); without one, as in CI, it's
  // matching words.
  const prompts = ["cheap dumplings", "a good bowl of ramen", "somewhere for the kids on a rainy day", "a picnic spot with a view", "live music on a Friday night", "a quiet walk in the bush"];
  await measure("a search", ana, ...prompts.map((q) => `/g/${id}?q=${encodeURIComponent(q)}`));
  await measure("a thread", ana, `${api}/thread?place=${places[0]}`);
  await measure("my groups", ana, "/me");

  const k = (n: number) => `${Math.round(n / KB)} KB`;
  console.log(
    [
      "page                 server  html   css    js now  images  | later: js, images",
      ...[...pages].map(
        ([name, p]) =>
          `${name.padEnd(20)} ${`${Math.round(p.ms)} ms`.padStart(6)}  ${k(p.html).padEnd(6)} ${k(p.css).padEnd(6)} ${k(p.js).padEnd(7)} ${k(p.images).padEnd(7)} | ${k(p.later.js)}, ${k(p.later.images)}`,
      ),
    ].join("\n"),
  );
}, 120_000);

// What each page may take: the server's time (median of five), and what it
// fetches before it works (HTML, CSS, JavaScript imported at once, images
// not deferred), gzipped. Set on 2026-11-06 at what was measured with room
// to spare (#204); a page over it has to say why, here.
const BUDGET: Record<string, { ms: number; now: number; js?: number }> = {
  // (the photo and the form first; the 3D map's 281 KB of script waits for
  // the page to load and the browser to be idle, and never comes under
  // reduced motion)
  home: { ms: 200, now: 250 * KB, js: 20 * KB },
  "sign in": { ms: 200, now: 60 * KB },
  // (the small map of its first three places is the 300 KB of script)
  "invite preview": { ms: 200, now: 550 * KB },
  "group page": { ms: 300, now: 500 * KB },
  // (with a Voyage key, 210–240 ms on 2026-11-07, most of it the round trip
  // for the prompt's vector; matching words, without one, 15 ms; #206)
  "a search": { ms: 600, now: 500 * KB },
  "a thread": { ms: 200, now: 10 * KB },
  "my groups": { ms: 200, now: 60 * KB },
};

describe("pages, held to a budget", () => {
  it("measures a group of the size Spots is for", () => {
    expect(rows).toBe(10);
    expect([...pages.keys()].sort()).toEqual(Object.keys(BUDGET).sort());
  });

  it.each(Object.keys(BUDGET))("%s answers quickly and fetches little before it works", (name) => {
    const p = pages.get(name)!;
    const budget = BUDGET[name];
    expect(p.ms, `${name}: server time`).toBeLessThan(budget.ms);
    expect(p.html + p.css + p.js + p.images, `${name}: fetched at once`).toBeLessThan(budget.now);
    if (budget.js) expect(p.js, `${name}: script at once`).toBeLessThan(budget.js);
  });
});
