import { describe, expect, it } from "vitest";
import { Jar } from "./authenticator";
import sharp from "sharp";
import { baseUrl, join, origin, page, photo, request, startGroup } from "./browser";

// Spots' own promises, against the running app: someone with an account can
// start a group, a friend can join by its link, a spot added and voted for
// is still there when they come back, one person counts once, a place
// shared by one group reaches every group's Explore (but never another
// group's list), no place gets in without a reason, one without a photo
// shows its kind's picture, an uploaded photo keeps nothing of where it was
// taken, and the group's page
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
    expect(doc.querySelector("#list .keen__count")?.textContent).toBe("1");
    expect(doc.querySelector("#list .keen")?.getAttribute("aria-pressed")).toBe("true");
    expect((await page(ben, path)).querySelector("#list .keen")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows someone with the link a preview to join, never the list or its votes", async () => {
    const { jar: ana, path, api } = await started("Preview crew");
    for (const key of ["questacon", "arboretum", "nga", "haig-park"]) await request(ana, `${api}/picks`, { form: { key } });
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
  });

  it("folds the invite away once someone else is in, and puts every part of the group behind its tab", async () => {
    const { jar: ana, id, path } = await started("Tabbed crew");
    const invite = async (where: string) => (await page(ana, where)).querySelector<HTMLDetailsElement>("details#invite");
    expect((await invite(path))?.hasAttribute("open")).toBe(true); // just the owner: open
    await join(new Jar(), id, id, "Ben");
    expect((await invite(path))?.hasAttribute("open")).toBe(false);
    expect((await invite(`${path}?new=1`))?.hasAttribute("open")).toBe(true);
    // Folded, the invite is still all there, its links included.
    expect((await invite(path))?.querySelector(".share__by a[href^='https://wa.me/']")).toBeTruthy();

    // Each tab is a link to its part, and without a script every part is on the page.
    const doc = await page(ana, path);
    const tabs = [...doc.querySelectorAll<HTMLAnchorElement>(".tabs a[data-tab]")].map((a) => a.getAttribute("href"));
    expect(tabs).toEqual(["#list", "#explore-section", "#add", "#settings"]);
    for (const hash of tabs) expect(doc.querySelector(`${hash}[data-panel]`)).toBeTruthy();
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
    expect((await page(drifter, path)).querySelector(".who")).toBeNull();
    expect((await page(jar, path)).querySelector(".who__count")?.textContent).toContain("1 person");
  });

  it("shares a new place with every group, with its reason, and keeps it on the sharer's list", async () => {
    const ours = await started("Sharers");
    const name = `Spec Dumplings ${Date.now()}`;
    const res = await request(ours.jar, `${ours.api}/places`, {
      form: { name, kind: "food", area: "Dickson", why: "Chilli oil worth the trip", photo: await photo() },
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
    const res = await request(jar, `${api}/places`, { form: { name, kind: "fun", area: "Civic", why: "", photo: await photo() } });
    expect(res.headers.get("location")).toContain("error=place");
    expect((await page(jar, path)).querySelector("#explore")?.textContent).not.toContain(name);
  });

  it("shares a place with no photo, its card showing its kind, not a photo of it", async () => {
    const { jar, path, api } = await started("No photo crew");
    const name = `Unseen ${Date.now()}`;
    const res = await request(jar, `${api}/places`, { form: { name, kind: "coffee", area: "Civic", why: "Good flat white" } });
    expect(res.headers.get("location")).not.toContain("error");
    const doc = await page(jar, path);
    const card = [...doc.querySelectorAll("#explore .spot")].find((c) => c.textContent?.includes(name));
    const art = card?.querySelector("[data-kind-art]");
    expect(art?.getAttribute("data-kind-art")).toBe("coffee");
    expect(art?.querySelector("figcaption")?.textContent).toContain("Coffee");
    const src = art?.querySelector("img")?.getAttribute("src") ?? "";
    expect(src).toBe("/kinds/coffee.jpg");
    expect((await fetch(new URL(src, baseUrl))).headers.get("content-type")).toBe("image/jpeg");
    // (a picture of the kind says nothing about the place: no alt text names it)
    expect(card?.querySelector(`img[alt*="${name}"]`)).toBeNull();
    const pick = [...doc.querySelectorAll("#list .pick")].find((c) => c.textContent?.includes(name));
    expect(pick?.querySelector("[data-kind-art]")).toBeTruthy();
  });

  it("sends back a file that isn't a photo", async () => {
    const { jar, path, api } = await started("Junk photo crew");
    const name = `Unreadable ${Date.now()}`;
    const junk = new Blob(["not a photo"], { type: "image/jpeg" });
    const res = await request(jar, `${api}/places`, { form: { name, kind: "coffee", area: "Civic", why: "Good flat white", photo: junk } });
    expect(res.headers.get("location")).toContain("error=photo");
    expect((await page(jar, path)).querySelector("#explore")?.textContent).not.toContain(name);
  });

  it("keeps an uploaded photo, credited, with nothing of where it was taken", async () => {
    const { jar, path, api } = await started("Photo crew", "Fay");
    const name = `Spec Photo Cafe ${Date.now()}`;
    await request(jar, `${api}/places`, { form: { name, kind: "coffee", area: "Braddon", why: "Sunny window seat", photo: await photo() } });
    const card = [...(await page(jar, path)).querySelectorAll("#explore .spot")].find((c) => c.textContent?.includes(name));
    expect(card?.querySelector("figcaption")?.textContent).toContain("Photo: Fay");
    const src = card?.querySelector("img")?.getAttribute("src") ?? "";
    expect(src).toMatch(/^\/photos\/[\w-]{16}-800\.jpg$/);
    const served = await fetch(new URL(src, baseUrl));
    expect(served.headers.get("content-type")).toBe("image/jpeg");
    const meta = await sharp(Buffer.from(await served.arrayBuffer())).metadata();
    expect(meta.width).toBeLessThanOrEqual(800);
    expect(meta.exif).toBeUndefined();
  });

  it("shows every card with a photo or its kind's picture", async () => {
    const { jar, path, api } = await started("Every photo crew");
    // (one on the list with a photo, one without)
    await request(jar, `${api}/picks`, { form: { key: "questacon" } });
    await request(jar, `${api}/places`, { form: { name: `Bare ${Date.now()}`, kind: "drinks", area: "City", why: "Jazz most nights" } });
    const doc = await page(jar, path);
    const cards = [...doc.querySelectorAll("#explore .spot, #list .pick")];
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.querySelector("img[src], [data-kind-art]"))).toBe(true);
    // (on Our list the picture's corner names the kind, for a screen reader too)
    const picks = [...doc.querySelectorAll("#list .pick")];
    expect(picks.length).toBe(2);
    expect(picks.every((c) => c.querySelector(".photo__badge, [data-kind-art]")?.textContent?.trim())).toBe(true);
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

// Taking a place off Our list: whoever added it can, until someone else is
// keen; the owner can, always. It goes with its keens, so adding it back
// starts from none, and it stays in Explore.
describe("taking a place off the list", () => {
  /** A group of Ana (the owner), Ben and Cy, with Ben's Arboretum on its list. */
  async function crew(name: string) {
    const { jar: ana, id, path, api } = await started(name);
    const ben = new Jar();
    const cy = new Jar();
    await join(ben, id, id, "Ben");
    await join(cy, id, id, "Cy");
    await request(ben, `${api}/picks`, { form: { key: "arboretum" } });
    const doc = await page(ben, path);
    const pick = doc.querySelector<HTMLInputElement>('#list [data-keen] input[name="pick"]')?.value ?? "";
    return { ana, ben, cy, id, path, api, pick };
  }
  const remove = (jar: Jar, api: string, pick: string) => request(jar, `${api}/picks`, { form: { remove: pick } });
  const onList = async (jar: Jar, path: string) => (await page(jar, path)).querySelector("#list")?.textContent ?? "";

  it("lets whoever added it take it off, and it comes back from no keens", async () => {
    const { ben, path, api, pick } = await crew("Remove crew");
    await request(ben, `${api}/keen`, { form: { pick, keen: "on" } });
    const doc = await page(ben, `${path}?edit`);
    expect(doc.querySelector("#list")?.hasAttribute("data-editing")).toBe(true);
    expect(doc.querySelector(`#list form[data-remove] input[name="remove"][value="${pick}"]`)).not.toBeNull();

    const res = await remove(ben, api, pick);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\?edit&removed=\d+#list$/);
    expect(await onList(ben, path)).not.toContain("National Arboretum");
    // Undo, without a script: the notice's form puts it back, from no keens
    const back = await page(ben, res.headers.get("location")!);
    expect(back.querySelector(".list-note")?.textContent).toContain("Took National Arboretum off the list.");
    const place = back.querySelector<HTMLInputElement>('.list-note input[name="place"]')?.value ?? "";
    await request(ben, `${api}/picks`, { form: { place } });
    const again = await page(ben, path);
    expect(again.querySelector("#list")?.textContent).toContain("National Arboretum");
    expect(again.querySelector("#list .keen__count")?.textContent).toBe("0");
    // (and it never left Explore)
    expect(again.querySelector("#explore")?.textContent).toContain("National Arboretum");
  });

  it("doesn't let anyone else take it off, nor anyone from another group", async () => {
    const { cy, path, api, pick } = await crew("Not yours crew");
    const doc = await page(cy, `${path}?edit`);
    expect(doc.querySelector("#list form[data-remove]")).toBeNull();
    expect(doc.querySelector("#list .pick__by")?.textContent).toBe("Ben's");
    const res = await remove(cy, api, pick);
    expect(res.headers.get("location")).toContain("error=remove");

    const other = await started("Elsewhere crew", "Dee");
    await remove(other.jar, other.api, pick); // (another group's pick id)
    expect(await onList(cy, path)).toContain("National Arboretum");
  });

  it("keeps it for the group once someone else is keen, but the owner can still take it off", async () => {
    const { ana, ben, cy, path, api, pick } = await crew("Keen lock crew");
    await request(cy, `${api}/keen`, { form: { pick, keen: "on" } });
    const inPage = await fetch(new URL(`${api}/picks`, baseUrl), {
      method: "POST",
      headers: { origin, cookie: ben.header, "x-spots": "in-page" },
      body: new URLSearchParams({ remove: pick }),
      redirect: "manual",
    });
    expect(inPage.status).toBe(409);
    expect((await page(ben, `${path}?edit`)).querySelector("#list .pick__by")?.textContent).toBe("Others are keen");

    // The owner is asked first (one keen goes with it), then it's gone.
    const owner = await page(ana, `${path}?edit`);
    expect(owner.querySelector("#list form[data-remove]")?.getAttribute("data-confirm")).toContain("1 keen goes");
    await remove(ana, api, pick);
    expect(await onList(cy, path)).not.toContain("National Arboretum");
  });

  it("tells the group's open pages, and every group's Explore", async () => {
    const { ben, id, api, pick } = await crew("Live remove crew");
    const stream = await fetch(new URL(`/api/events?group=${id}`, baseUrl));
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    let got = "";
    // (once the stream has said hello, so the change can't come before it)
    got += decoder.decode((await reader.read()).value, { stream: true });
    await remove(ben, api, pick);
    while (!(got.includes("event: change") && got.includes("event: places"))) {
      const { value, done } = await reader.read();
      if (done) break;
      got += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    expect(got).toContain("event: change");
    expect(got).toContain("event: places");
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
