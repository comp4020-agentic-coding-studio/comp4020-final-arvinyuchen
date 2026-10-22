import { describe, expect, it } from "vitest";
import { Jar } from "./authenticator";
import { baseUrl, join, origin, page, request, startGroup } from "./browser";

// Spots' own promises, against the running app: someone with an account can
// start a group, a friend can join by its link, a spot added and voted for
// is still there when they come back, one person counts once, a place
// shared by one group reaches every group's Explore (but never another
// group's list), no place gets in without a reason, and the group's page
// streams changes live. Each Jar is one browser, signed up with its own
// passkey (spec/browser.ts).

/** A browser that started a group: its jar, the group's id and its page and API paths. */
async function started(group: string, name = "Ana") {
  const jar = new Jar();
  const id = await startGroup(jar, group, name);
  return { jar, id, path: `/g/${id}`, api: `/api/groups/${id}` };
}

describe("a group", () => {
  it("can be started by anyone with an account, and lands on its own page with an invite link", async () => {
    const jar = new Jar();
    await startGroup(jar, "Warm-up crew", "Ana"); // (makes the account)
    const res = await request(jar, "/api/groups", { form: { group: "Spec crew" } });
    expect(res.status).toBe(303);
    const where = res.headers.get("location") ?? "";
    expect(where).toMatch(/^\/g\/[\w-]+/);
    const doc = await page(jar, where);
    expect(doc.querySelector("h1")?.textContent).toBe("Spec crew");
    expect(doc.querySelector<HTMLInputElement>("#share-link")?.value).toContain("/g/");
  });

  it("keeps what people add and vote for, and counts each person once", async () => {
    const { jar: ana, id, path, api } = await started("Persist crew");
    const ben = new Jar();
    await join(ben, id, id, "Ben");

    await request(ana, `${api}/picks`, { form: { key: "questacon" } });
    let doc = await page(ben, path);
    const pick = doc.querySelector<HTMLInputElement>('#list input[name="pick"]')?.value ?? "";
    expect(doc.querySelector("#list")?.textContent).toContain("Questacon");

    const keen = (jar: Jar) => request(jar, `${api}/keen`, { form: { pick } });
    await keen(ana);
    await keen(ben);
    doc = await page(ana, path);
    expect(doc.querySelector("#list .keen__count")?.textContent).toBe("2");

    await keen(ben); // voting again takes it back
    doc = await page(ana, path);
    expect(doc.querySelector("#list")?.textContent).toContain("Keen: Ana");
    expect(doc.querySelector("#list")?.textContent).not.toContain("Ben,");
  });

  it("shows someone with the link a preview to join, never the list or its votes", async () => {
    const { jar: ana, path, api } = await started("Preview crew");
    for (const key of ["questacon", "arboretum", "nga", "lonsdale-st"]) await request(ana, `${api}/picks`, { form: { key } });
    const doc = await page(ana, path);
    const last = [...doc.querySelectorAll<HTMLInputElement>('#list input[name="pick"]')].map((i) => i.value).at(-1) ?? "";
    await request(ana, `${api}/keen`, { form: { pick: last, keen: "on" } }); // the newest pick now ranks first

    const stranger = await page(new Jar(), path);
    expect(stranger.querySelector("h1")?.textContent).toBe("Preview crew");
    expect(stranger.body.textContent).toContain("Ana started it");
    // The first three places, oldest first: the order says nothing about votes.
    const preview = [...stranger.querySelectorAll(".welcome__stop strong")].map((s) => s.textContent);
    expect(preview).toEqual(["Questacon", "National Arboretum", "National Gallery of Australia"]);
    expect(stranger.querySelector('form#join input[name="name"]')).toBeTruthy();
    // Members only: the list, its keens, Explore, the map and the invite card.
    for (const members of ["#list", "#explore", "#map", "#share-link", ".keen"]) {
      expect(stranger.querySelector(members)).toBeNull();
    }
    expect(stranger.body.textContent).not.toContain("Keen:");
  });

  it("sets a keen to what the button showed, so tapping twice can't undo it", async () => {
    const { jar: ana, path, api } = await started("Double-tap crew");
    await request(ana, `${api}/picks`, { form: { key: "questacon" } });
    let doc = await page(ana, path);
    const pick = doc.querySelector<HTMLInputElement>('#list input[name="pick"]')?.value ?? "";
    expect(doc.querySelector<HTMLInputElement>('#list input[name="keen"]')?.value).toBe("on");

    await request(ana, `${api}/keen`, { form: { pick, keen: "on" } });
    await request(ana, `${api}/keen`, { form: { pick, keen: "on" } }); // a double-tap, or a second device
    doc = await page(ana, path);
    expect(doc.querySelector("#list .keen__count")?.textContent).toBe("1");
    expect(doc.querySelector<HTMLInputElement>('#list input[name="keen"]')?.value).toBe("off");

    // The page's own script posts in the background and stays where it is.
    const inPage = await fetch(new URL(`${api}/keen`, baseUrl), {
      method: "POST",
      headers: { origin, cookie: ana.header, "x-spots": "in-page" },
      body: new URLSearchParams({ pick, keen: "off" }),
      redirect: "manual",
    });
    expect(inPage.status).toBe(204);
    doc = await page(ana, path);
    expect(doc.querySelector("#list .keen__count")?.textContent).toBe("0");
  });

  it("shares its invite person to person, with a card that names the group", async () => {
    const { jar, path } = await started("Share crew");
    const doc = await page(jar, path);
    const link = doc.querySelector<HTMLInputElement>("#share-link")?.value ?? "";
    const meta = (property: string) => doc.querySelector(`meta[property="${property}"]`)?.getAttribute("content");

    // The card a chat app builds from the link.
    expect(meta("og:title")).toBe("Join Share crew on Spots");
    expect(meta("og:url")).toBe(link);
    const image = await fetch(meta("og:image") ?? "");
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toContain("image/jpeg");

    // Private channels, each carrying the link; never a public feed.
    const hrefs = [...doc.querySelectorAll<HTMLAnchorElement>(".share__by a")].map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.map((h) => h.split(/[?:]/)[0])).toEqual(["sms", "https", "https", "mailto"]);
    expect(hrefs.some((h) => h.startsWith("https://wa.me/"))).toBe(true);
    expect(hrefs.some((h) => h.startsWith("https://t.me/share/url"))).toBe(true);
    for (const href of hrefs) expect(decodeURIComponent(href)).toContain(link);
    expect(doc.body.innerHTML).not.toMatch(/facebook\.com\/sharer|twitter\.com\/intent|x\.com\/intent/);

    // A QR code for friends in the same room, drawn on the server.
    expect(doc.querySelector(".share__qr svg")).toBeTruthy();
  });

  it("doesn't let anyone who isn't a member add or vote, signed in or not", async () => {
    const { jar, path, api } = await started("Closed crew");
    await request(new Jar(), `${api}/picks`, { form: { key: "nga" } });
    const outsider = new Jar();
    await startGroup(outsider, "Their own crew", "Eve"); // an account, just not in this group
    await request(outsider, `${api}/picks`, { form: { key: "awm" } });
    const list = (await page(jar, path)).querySelector("#list")?.textContent;
    expect(list).not.toContain("National Gallery");
    expect(list).not.toContain("War Memorial");
  });

  it("can't be started or joined without an account", async () => {
    const res = await request(new Jar(), "/api/groups", { form: { group: "Nameless crew", name: "Ana" } });
    expect(res.headers.get("location")).toBe("/?error=account#start");
    const { jar, id, path } = await started("Account crew");
    const drifter = new Jar();
    const tried = await request(drifter, `/api/groups/${id}/join`, { form: { link: id, name: "Ana" } });
    expect(tried.headers.get("location")).toContain("error=account");
    // Typing a member's name gets nobody in as them.
    expect((await page(drifter, path)).querySelector(".you")).toBeNull();
    expect((await page(jar, path)).querySelector(".members")?.textContent).toContain("1 person");
  });

  it("shares a new place with every group, with its reason, and keeps it on the sharer's list", async () => {
    const ours = await started("Sharers");
    const name = `Spec Dumplings ${Date.now()}`;
    const res = await request(ours.jar, `${ours.api}/places`, {
      form: { name, kind: "food", area: "Dickson", why: "Chilli oil worth the trip" },
    });
    expect(res.status).toBe(303);
    expect((await page(ours.jar, ours.path)).querySelector("#list")?.textContent).toContain(name);

    const theirs = await started("Another crew", "Ben");
    const explore = (await page(theirs.jar, theirs.path)).querySelector("#explore")?.textContent ?? "";
    expect(explore).toContain(name);
    expect(explore).toContain("Chilli oil worth the trip");
    // the other group's members and list stay their own
    expect((await page(theirs.jar, theirs.path)).querySelector("#list")?.textContent).not.toContain(name);
  });

  it("refuses a place with no reason it's good", async () => {
    const { jar, path, api } = await started("No reason crew");
    const name = `Unexplained ${Date.now()}`;
    const res = await request(jar, `${api}/places`, { form: { name, kind: "fun", area: "Civic", why: "" } });
    expect(res.headers.get("location")).toContain("error=place");
    expect((await page(jar, path)).querySelector("#explore")?.textContent).not.toContain(name);
  });

  it("puts every located place on the map", async () => {
    const { jar, path } = await started("Map crew");
    const doc = await page(jar, path);
    const pins = JSON.parse(doc.querySelector("#pins")?.textContent ?? "[]") as { name: string; lat: number }[];
    expect(pins.map((p) => p.name)).toContain("Questacon");
    expect(pins.every((p) => p.lat < -35 && p.lat > -36)).toBe(true);
    expect(doc.querySelector("#map")).toBeTruthy();
  });

  it("streams changes to the group's open pages", async () => {
    const { jar: ana, id, api } = await started("Live crew");
    const stream = await fetch(new URL(`/api/events?group=${id}`, baseUrl));
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    const reader = stream.body!.getReader();
    await request(ana, `${api}/picks`, { form: { key: "arboretum" } });
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
    const { jar, path } = await started("Search crew");
    const doc = await page(jar, `${path}?q=${encodeURIComponent(q)}`);
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
