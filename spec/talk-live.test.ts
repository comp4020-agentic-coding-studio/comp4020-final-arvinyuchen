import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { Jar } from "./authenticator";
import { baseUrl, join, origin, page, request, startGroup } from "./browser";
import { listen } from "./live";

// Talk, timed: from a message being sent until every other member's open
// page has heard which thread changed and read the message back, as the
// page's own script does (src/scripts/talk.ts), within a second. Alone,
// and with several people talking at once. (What Talk does is in
// talk.test.ts; this is only how soon.)

async function crew(group: string, names: string[]) {
  const [owner, ...rest] = names.map(() => new Jar());
  const id = await startGroup(owner, group, names[0]);
  for (const [i, jar] of rest.entries()) await join(jar, id, id, names[i + 1]);
  const api = `/api/groups/${id}`;
  await request(owner, `${api}/picks`, { form: { key: "questacon" } });
  const place = (await page(owner, `/g/${id}`)).querySelector<HTMLElement>("#list [data-place-id]")?.dataset.placeId ?? "";
  return { id, api, place, jars: [owner, ...rest] };
}
type Crew = Awaited<ReturnType<typeof crew>>;
let nonces = 0;
// (as the page's own script sends it: in the background, answered 204)
const say = (c: Crew, jar: Jar, body: string) =>
  fetch(new URL(`${c.api}/talk`, baseUrl), {
    method: "POST",
    headers: { origin, cookie: jar.header, "x-spots": "in-page" },
    body: new URLSearchParams({ action: "send", place: c.place, body, nonce: `live${++nonces}` }),
    redirect: "manual",
  });
const words = async (c: Crew, jar: Jar) => {
  const doc = new JSDOM(await (await request(jar, `${c.api}/thread?place=${c.place}`)).text()).window.document;
  return [...doc.querySelectorAll(".msg__bubble")].map((b) => b.textContent ?? "").join("\n");
};

/**
 * When this member, with the thread open, has read every one of `said`:
 * each time the stream says the thread changed, it reads it again, as the
 * page does.
 */
async function readAll(c: Crew, stream: Awaited<ReturnType<typeof listen>>, jar: Jar, said: string[], sent: number) {
  let after = sent;
  for (;;) {
    after = await stream.next(after, 2000);
    const now = await words(c, jar);
    if (said.every((w) => now.includes(w))) return performance.now();
  }
}

describe("Talk, live", () => {
  it("has a new message read on every other member's open thread within a second", async () => {
    const c = await crew("Talk heard crew", ["Ana", "Ben", "Cleo", "Dev"]);
    const [ana, ...others] = c.jars;
    const streams = await Promise.all(others.map((jar) => listen(jar, c.id, "talk")));
    try {
      const sent = performance.now();
      expect((await say(c, ana, "Is it open Mondays?")).status).toBe(204);
      const read = await Promise.all(others.map((jar, i) => readAll(c, streams[i], jar, ["Is it open Mondays?"], sent)));
      const slowest = Math.max(...read) - sent;
      console.log(`a message read by ${others.length} other members in ${Math.round(slowest)} ms at most`);
      expect(slowest).toBeLessThan(1000);
    } finally {
      for (const s of streams) s.stop();
    }
  });

  it("has six people talking at once read by everyone within a second", async () => {
    const names = ["Ana", "Ben", "Cleo", "Dev", "Eli", "Fay"];
    const c = await crew("Talk rush crew", names);
    const streams = await Promise.all(c.jars.map((jar) => listen(jar, c.id, "talk")));
    try {
      const said = names.map((name) => `${name} says the upstairs bit is better`);
      const sent = performance.now();
      const statuses = await Promise.all(c.jars.map((jar, i) => say(c, jar, said[i]).then((r) => r.status)));
      expect(statuses).toEqual(c.jars.map(() => 204));
      const read = await Promise.all(c.jars.map((jar, i) => readAll(c, streams[i], jar, said, sent)));
      const slowest = Math.max(...read) - sent;
      console.log(`${names.length} messages at once, all read by everyone in ${Math.round(slowest)} ms at most`);
      expect(slowest).toBeLessThan(1000);
    } finally {
      for (const s of streams) s.stop();
    }
  });
});
