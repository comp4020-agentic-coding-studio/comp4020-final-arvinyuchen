import { describe, expect, it } from "vitest";
import { Authenticator, Jar } from "./authenticator";
import { baseUrl, join, origin, page, request, savePasskey, signInWith, startGroup } from "./browser";
import { listen } from "./live";

// Deciding, with several people at once: one vote per person per place,
// heard on every other member's open page within a second, however many
// vote at the same moment and from however many devices.

async function crew(group: string, names: string[]) {
  const [owner, ...rest] = names.map(() => new Jar());
  const id = await startGroup(owner, group, names[0]);
  for (const [i, jar] of rest.entries()) await join(jar, id, id, names[i + 1]);
  const api = `/api/groups/${id}`;
  await request(owner, `${api}/picks`, { form: { key: "questacon" } });
  const pick = (await page(owner, `/g/${id}`)).querySelector<HTMLInputElement>('#list input[name="pick"]')?.value ?? "";
  return { id, api, pick, jars: [owner, ...rest] };
}
// (as the page's own script sends it: in the background, answered 204)
const vote = (jar: Jar, api: string, pick: string, keen: "on" | "off") =>
  fetch(new URL(`${api}/keen`, baseUrl), {
    method: "POST",
    headers: { origin, cookie: jar.header, "x-spots": "in-page" },
    body: new URLSearchParams({ pick, keen }),
    redirect: "manual",
  });
const count = async (jar: Jar, id: string) => (await page(jar, `/g/${id}`)).querySelector("#list .keen__count")?.textContent;

describe("deciding together", () => {
  it("tells every other member's open page about a vote within a second", async () => {
    const { id, api, pick, jars } = await crew("Heard crew", ["Ana", "Ben", "Cleo", "Dev"]);
    const [ana, ...others] = jars;
    const streams = await Promise.all(others.map((jar) => listen(jar, id)));
    try {
      const sent = performance.now();
      expect((await vote(ana, api, pick, "on")).status).toBe(204);
      const heard = await Promise.all(streams.map((s) => s.next(sent, 1000)));
      const slowest = Math.max(...heard) - sent;
      console.log(`a vote heard by ${others.length} other members in ${Math.round(slowest)} ms at most`);
      expect(slowest).toBeLessThan(1000);
    } finally {
      for (const s of streams) s.stop();
    }
  });

  it("counts six people voting at the same moment, each once", async () => {
    const { id, api, pick, jars } = await crew("Rush crew", ["Ana", "Ben", "Cleo", "Dev", "Eli", "Fay"]);
    const statuses = await Promise.all(jars.map((jar) => vote(jar, api, pick, "on").then((r) => r.status)));
    expect(statuses).toEqual(jars.map(() => 204));
    expect(await count(jars[0], id)).toBe("6");
    await Promise.all(jars.slice(0, 3).map((jar) => vote(jar, api, pick, "off")));
    expect(await count(jars[0], id)).toBe("3");
  });

  it("counts one person once when two of their devices vote at the same moment", async () => {
    const { id, api, pick, jars } = await crew("Two-phone crew", ["Ana", "Ben"]);
    const [ana] = jars;
    const phone = new Jar();
    const passkey = new Authenticator();
    await savePasskey(ana, passkey);
    await signInWith(phone, passkey);
    await Promise.all([ana, phone, ana, phone].map((jar) => vote(jar, api, pick, "on")));
    expect(await count(ana, id)).toBe("1");
    expect(await count(phone, id)).toBe("1");
  });
});
