import { beforeAll, describe, expect, it } from "vitest";
import { Jar } from "./authenticator";
import { baseUrl, join, origin, page, request, startGroup } from "./browser";
import { listen } from "./live";

// A room full of people deciding at once, as at the showcase: a group of 30
// (PRESSURE_PEOPLE=100 for more), each with the group's page open, every
// one of them voting on all ten places on the list at the same moment.
// Each open page behaves as the page's script does: it hears "change" on
// its stream and reads the page again, one read at a time with one more
// queued for a change that lands mid-read (`refresh` in
// src/pages/g/[link].astro). Against the app as the spec runs it, never
// the live site: it says how much the app can take, not how fast a network
// is.
const PEOPLE = Number(process.env.PRESSURE_PEOPLE ?? 30);
const KEYS = ["questacon", "nga", "nma", "awm", "arboretum", "mt-ainslie", "bus-depot-markets", "the-cupping-room", "bentspoke-brewing-co", "kingpin"];

const counts = (html: string) => [...html.matchAll(/class="keen__count">(\d+)</g)].map((m) => Number(m[1]));

/** A member's open page: its stream, and the page read again on each change. */
async function openPage(jar: Jar, id: string) {
  const stream = await listen(jar, id);
  const state = { html: "", reads: 0, pending: false, again: false, done: Promise.resolve() };
  let heard = 0;
  const read = async () => {
    state.pending = true;
    do {
      state.again = false;
      const res = await fetch(new URL(`/g/${id}`, baseUrl), { headers: { cookie: jar.header } });
      state.html = await res.text();
      state.reads++;
    } while (state.again);
    state.pending = false;
  };
  const poll = setInterval(() => {
    if (stream.changes.length === heard) return;
    heard = stream.changes.length;
    if (state.pending) state.again = true;
    else state.done = read();
  }, 5);
  return {
    state,
    stream,
    stop() {
      clearInterval(poll);
      stream.stop();
    },
  };
}

const ms = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))];
let result: { votes: number[]; settled: number; pages: Awaited<ReturnType<typeof openPage>>[]; id: string; owner: Jar };

beforeAll(async () => {
  const jars = Array.from({ length: PEOPLE }, () => new Jar());
  const id = await startGroup(jars[0], "Showcase crew", "Host");
  for (const [i, jar] of jars.slice(1).entries()) await join(jar, id, id, `Guest ${i + 1}`);
  const api = `/api/groups/${id}`;
  for (const key of KEYS) await request(jars[0], `${api}/picks`, { form: { key } });
  const picks = [...(await page(jars[0], `/g/${id}`)).querySelectorAll<HTMLInputElement>('#list input[name="pick"]')].map((i) => i.value);
  expect(picks.length).toBe(KEYS.length);

  const pages = await Promise.all(jars.map((jar) => openPage(jar, id)));
  // Everyone, every place, at once.
  const votes: number[] = [];
  const start = performance.now();
  await Promise.all(
    jars.flatMap((jar) =>
      picks.map(async (pick) => {
        const sent = performance.now();
        const res = await fetch(new URL(`${api}/keen`, baseUrl), {
          method: "POST",
          headers: { origin, cookie: jar.header, "x-spots": "in-page" },
          body: new URLSearchParams({ pick, keen: "on" }),
          redirect: "manual",
        });
        expect(res.status).toBe(204);
        votes.push(performance.now() - sent);
      }),
    ),
  );
  const voted = performance.now();
  // Until every open page shows every vote.
  const everyVote = (html: string) => counts(html).length === KEYS.length && counts(html).every((n) => n === PEOPLE);
  while (!pages.every((p) => !p.state.pending && everyVote(p.state.html))) {
    if (performance.now() - voted > 30_000) break;
    await new Promise((r) => setTimeout(r, 5));
  }
  const settled = performance.now() - voted;
  for (const p of pages) p.stop();
  result = { votes, settled, pages, id, owner: jars[0] };
  const reads = pages.reduce((sum, p) => sum + p.state.reads, 0);
  console.log(
    [
      `pressure: ${PEOPLE} people, ${KEYS.length} places, ${votes.length} votes at once, all sent and answered in ${Math.round(voted - start)} ms`,
      `  a vote: median ${Math.round(ms(votes, 0.5))} ms, p95 ${Math.round(ms(votes, 0.95))} ms, slowest ${Math.round(Math.max(...votes))} ms`,
      `  every open page showing every vote ${Math.round(settled)} ms after the last was answered (${reads} page reads in all)`,
    ].join("\n"),
  );
}, 180_000);

// Set on 2026-11-07 from 30 people on a laptop (#214): a vote's p95 1.8 s,
// every page showing every vote 0.25–0.34 s after the last. With 300 votes
// in the same instant, a vote waits behind the open pages reading
// themselves again (each change, every page); 60 people took 6.3 s, 100
// ran out of connections on the laptop. Votes in a real room come over
// seconds, not in one instant.
const BUDGET = { voteP95: 4000, settled: 1500 };

describe("a room full of people voting at once", () => {
  it("counts every vote", async () => {
    expect(result.votes.length).toBe(PEOPLE * KEYS.length);
    const shown = counts((await request(result.owner, `/g/${result.id}`).then((r) => r.text())));
    expect(shown).toEqual(KEYS.map(() => PEOPLE));
  });

  it("answers each vote quickly", () => {
    expect(ms(result.votes, 0.95)).toBeLessThan(BUDGET.voteP95);
  });

  it("shows every vote on every open page soon after", () => {
    expect(result.pages.every((p) => counts(p.state.html).every((n) => n === PEOPLE))).toBe(true);
    expect(result.settled).toBeLessThan(BUDGET.settled);
  });
});
