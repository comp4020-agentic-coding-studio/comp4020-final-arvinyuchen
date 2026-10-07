import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

// Spots' own promises, against the running app: a stranger can start a
// group, a friend can join by its link, a spot added and voted for is still
// there when they come back, one person counts once, a place shared by one
// group reaches every group's Explore (but never another group's list), no
// place gets in without a reason, and the group's page streams changes live.
const baseUrl = inject("baseUrl");

const post = (path: string, body: Record<string, string>, cookie = "") =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { origin: new URL(baseUrl).origin, ...(cookie ? { cookie } : {}) },
    body: new URLSearchParams(body),
    redirect: "manual",
  });
const cookieOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const page = async (path: string, cookie = "") =>
  new JSDOM(await (await fetch(new URL(path, baseUrl), { headers: cookie ? { cookie } : {} })).text()).window.document;

describe("a group", () => {
  it("can be started by a stranger, and lands on its own page with an invite link", async () => {
    const res = await post("/api/groups", { group: "Spec crew", name: "Ana" });
    expect(res.status).toBe(303);
    const where = res.headers.get("location") ?? "";
    expect(where).toMatch(/^\/g\/[\w-]+/);
    const doc = await page(where, cookieOf(res));
    expect(doc.querySelector("h1")?.textContent).toBe("Spec crew");
    expect(doc.querySelector<HTMLInputElement>("#share-link")?.value).toContain("/g/");
  });

  it("keeps what people add and vote for, and counts each person once", async () => {
    const start = await post("/api/groups", { group: "Persist crew", name: "Ana" });
    const ana = cookieOf(start);
    const groupPath = (start.headers.get("location") ?? "").split("?")[0];

    const join = await post(`${groupPath.replace("/g/", "/api/groups/")}/join`, { name: "Ben", link: groupPath.replace("/g/", "") });
    const ben = cookieOf(join);

    await post(`${groupPath.replace("/g/", "/api/groups/")}/picks`, { key: "questacon" }, ana);
    let doc = await page(groupPath, ben);
    const pick = doc.querySelector<HTMLInputElement>('#list input[name="pick"]')?.value ?? "";
    expect(doc.querySelector("#list")?.textContent).toContain("Questacon");

    const keen = (cookie: string) => post(`${groupPath.replace("/g/", "/api/groups/")}/keen`, { pick }, cookie);
    await keen(ana);
    await keen(ben);
    doc = await page(groupPath, ana);
    expect(doc.querySelector("#list .keen__count")?.textContent).toBe("2");

    await keen(ben); // voting again takes it back
    doc = await page(groupPath);
    expect(doc.querySelector("#list .keen__count")).toBeNull(); // no vote buttons for a non-member
    expect(doc.querySelector("#list")?.textContent).toContain("Keen: Ana");
    expect(doc.querySelector("#list")?.textContent).not.toContain("Ben,");
  });

  it("doesn't let someone without the group's cookie add or vote", async () => {
    const start = await post("/api/groups", { group: "Closed crew", name: "Ana" });
    const groupPath = (start.headers.get("location") ?? "").split("?")[0];
    await post(`${groupPath.replace("/g/", "/api/groups/")}/picks`, { key: "nga" });
    const doc = await page(groupPath, cookieOf(start));
    expect(doc.querySelector("#list")?.textContent).not.toContain("National Gallery");
  });

  it("shares a new place with every group, with its reason, and keeps it on the sharer's list", async () => {
    const ours = await post("/api/groups", { group: "Sharers", name: "Ana" });
    const ana = cookieOf(ours);
    const ourPath = (ours.headers.get("location") ?? "").split("?")[0];
    const name = `Spec Dumplings ${Date.now()}`;
    const res = await post(
      `${ourPath.replace("/g/", "/api/groups/")}/places`,
      { name, kind: "food", area: "Dickson", why: "Chilli oil worth the trip" },
      ana,
    );
    expect(res.status).toBe(303);
    expect((await page(ourPath, ana)).querySelector("#list")?.textContent).toContain(name);

    const theirs = await post("/api/groups", { group: "Another crew", name: "Ben" });
    const theirPath = (theirs.headers.get("location") ?? "").split("?")[0];
    const explore = (await page(theirPath, cookieOf(theirs))).querySelector("#explore")?.textContent ?? "";
    expect(explore).toContain(name);
    expect(explore).toContain("Chilli oil worth the trip");
    // the other group's members and list stay their own
    expect((await page(theirPath)).querySelector("#list")?.textContent).not.toContain(name);
  });

  it("refuses a place with no reason it's good", async () => {
    const start = await post("/api/groups", { group: "No reason crew", name: "Ana" });
    const groupPath = (start.headers.get("location") ?? "").split("?")[0];
    const name = `Unexplained ${Date.now()}`;
    const res = await post(
      `${groupPath.replace("/g/", "/api/groups/")}/places`,
      { name, kind: "fun", area: "Civic", why: "" },
      cookieOf(start),
    );
    expect(res.headers.get("location")).toContain("error=place");
    expect((await page(groupPath)).querySelector("#explore")?.textContent).not.toContain(name);
  });

  it("puts every located place on the map", async () => {
    const start = await post("/api/groups", { group: "Map crew", name: "Ana" });
    const doc = await page((start.headers.get("location") ?? "").split("?")[0], cookieOf(start));
    const pins = JSON.parse(doc.querySelector("#pins")?.textContent ?? "[]") as { name: string; lat: number }[];
    expect(pins.map((p) => p.name)).toContain("Questacon");
    expect(pins.every((p) => p.lat < -35 && p.lat > -36)).toBe(true);
    expect(doc.querySelector("#map")).toBeTruthy();
  });

  it("streams changes to the group's open pages", async () => {
    const start = await post("/api/groups", { group: "Live crew", name: "Ana" });
    const ana = cookieOf(start);
    const id = (start.headers.get("location") ?? "").split("?")[0].replace("/g/", "");
    const stream = await fetch(new URL(`/api/events?group=${id}`, baseUrl));
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    const reader = stream.body!.getReader();
    await post(`/api/groups/${id}/picks`, { key: "arboretum" }, ana);
    const decoder = new TextDecoder();
    let got = "";
    while (!got.includes("event: change")) {
      const { value, done } = await reader.read();
      if (done) break;
      got += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    expect(got).toContain("event: change");
  }, 10_000);
});

// Searching Explore by describing what you're after. The answer is cards
// and pins only. These hold whether the app is matching on meaning (with a
// Voyage key) or falling back to words (without one, as in CI).
describe("search", () => {
  const ask = async (q: string) => {
    const start = await post("/api/groups", { group: "Search crew", name: "Ana" });
    const path = (start.headers.get("location") ?? "").split("?")[0];
    const doc = await page(`${path}?q=${encodeURIComponent(q)}`, cookieOf(start));
    return {
      doc,
      cards: [...doc.querySelectorAll("#explore .spots--explore > li h3")].map((h) => h.textContent?.trim()),
      pins: JSON.parse(doc.querySelector("#pins")?.textContent ?? "[]") as { name: string }[],
    };
  };

  it("is a plain GET form, so it works without JavaScript", async () => {
    const { doc } = await ask("");
    const form = doc.querySelector<HTMLFormElement>("form[data-search]");
    expect(form?.getAttribute("method")).toBe("get");
    expect(form?.querySelector('input[name="q"]')).toBeTruthy();
  });

  it("puts the place a prompt names first, and the map shows only the answers", async () => {
    const { cards, pins } = await ask("Questacon");
    expect(cards[0]).toBe("Questacon");
    expect(pins.map((p) => p.name).sort()).toEqual([...cards].filter(Boolean).sort());
  });

  it("takes 'near' literally: only places within a few kilometres", async () => {
    const { cards } = await ask("somewhere near Braddon");
    expect(cards).toContain("Lonsdale Street");
    expect(cards).toContain("Haig Park");
    expect(cards).not.toContain("Tidbinbilla Nature Reserve");
    expect(cards).not.toContain("National Arboretum");
  });

  it("answers nothing, rather than anything, when nothing fits", async () => {
    const { cards, doc } = await ask("xqzv blorfnik");
    expect(cards).toEqual([]);
    expect(doc.querySelector(".ask-meta")?.textContent).toContain("Nothing shared fits");
  });
});
