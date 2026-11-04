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
    expect(doc.querySelector<HTMLButtonElement>("#share-link")?.dataset.invite).toContain("/g/");
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
    // one label either way, "1 keen", filled with a tick when it's yours;
    // its name says what a tap would do
    const mine = doc.querySelector("#list .keen");
    expect([mine?.classList.contains("keen--on"), mine?.textContent?.replace(/\s+/g, ""), !!mine?.querySelector(".keen__tick")]).toEqual([true, "1keen", true]);
    expect(mine?.getAttribute("aria-label")).toMatch(/^Not keen on .+ any more, 1 keen$/);
    const theirs = (await page(ben, path)).querySelector("#list .keen");
    expect([theirs?.classList.contains("keen--on"), theirs?.textContent?.replace(/\s+/g, ""), !!theirs?.querySelector(".keen__tick")]).toEqual([false, "1keen", false]);
    expect(theirs?.getAttribute("aria-label")).toMatch(/^I'm keen on .+, 1 keen$/);
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
    const link = doc.querySelector<HTMLButtonElement>("#share-link")?.dataset.invite ?? "";
    const meta = (property: string) => doc.querySelector(`meta[property="${property}"]`)?.getAttribute("content");

    // The card a chat app builds from the link.
    expect(meta("og:title")).toBe("Join Share crew on Spots");
    expect(meta("og:url")).toBe(link);
    const image = await fetch(meta("og:image") ?? "");
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toContain("image/jpeg");

    // One button, private channels only (the share sheet or a copy of the link), never a public feed.
    const invite = doc.querySelectorAll<HTMLButtonElement>(".share__row button");
    expect(invite).toHaveLength(1);
    expect(invite[0].dataset.invite).toBe(link);
    expect(invite[0].dataset.title).toBe("Join Share crew on Spots");
    expect(doc.querySelectorAll(".share a[href]")).toHaveLength(0);
    expect(doc.body.innerHTML).not.toMatch(/facebook\.com\/sharer|twitter\.com\/intent|x\.com\/intent/);
  });

  it("folds the invite away once someone else is in, and puts every part of the group behind its tab", async () => {
    const { jar: ana, id, path } = await started("Tabbed crew");
    const invite = async (where: string) => (await page(ana, where)).querySelector<HTMLDetailsElement>("details#invite");
    expect((await invite(path))?.hasAttribute("open")).toBe(true); // just the owner: open
    await join(new Jar(), id, id, "Ben");
    expect((await invite(path))?.hasAttribute("open")).toBe(false);
    expect((await invite(`${path}?new=1`))?.hasAttribute("open")).toBe(true);
    // Folded, the invite is still all there: its one button, with the link.
    expect((await invite(path))?.querySelector<HTMLButtonElement>("#share-link")?.dataset.invite).toContain("/g/");

    // Each tab is a link to its part, and without a script every part is on the page.
    const doc = await page(ana, path);
    const tabs = [...doc.querySelectorAll<HTMLAnchorElement>(".tabs a[data-tab]")].map((a) => a.getAttribute("href"));
    expect(tabs).toEqual(["#list", "#explore-section", "#add", "#settings"]);
    for (const hash of tabs) expect(doc.querySelector(`${hash}[data-panel]`)).toBeTruthy();
  });

  it("lets the owner write the invitees' note in the invite card, with the link as a QR code beside it", async () => {
    const { jar: ana, id, path, api } = await started("Card crew");
    const ben = new Jar();
    await join(ben, id, id, "Ben");
    // The note's field is the owner's, in the invite card; the code carries the link.
    const owners = await page(ana, path);
    expect(owners.querySelector("#invite-note[data-note] [name='note']")).toBeTruthy();
    expect(owners.querySelector("#settings input[name='note']")).toBeNull();
    expect(owners.querySelector(".share__qr svg")).toBeTruthy();
    expect((await page(ben, path)).querySelector("#invite-note")).toBeNull();

    // Saved in the page, it's on the invite at once.
    const saved = await fetch(new URL(`${api}/owner`, baseUrl), {
      method: "POST",
      headers: { origin, cookie: ana.header, "x-spots": "in-page" },
      body: new URLSearchParams({ action: "note", note: "Pick yours by Friday" }),
      redirect: "manual",
    });
    expect(saved.status).toBe(204);
    expect((await page(new Jar(), path)).querySelector(".welcome__note")?.textContent).toContain("Pick yours by Friday");
  });

  it("tells each member who joined since they last looked, until they dismiss it", async () => {
    const { jar: ana, id, path, api } = await started("Joining crew");
    const joinedFor = async (jar: Jar) => (await page(jar, path)).querySelector(".joined__text")?.textContent?.trim();
    expect(await joinedFor(ana)).toBeUndefined();

    const ben = new Jar();
    await join(ben, id, id, "Ben");
    expect(await joinedFor(ana)).toBe("Ben joined Joining crew");
    expect(await joinedFor(ben)).toBeUndefined(); // never your own joining, nor those before you
    expect(await joinedFor(ana)).toBe("Ben joined Joining crew"); // still there on the next visit

    await join(new Jar(), id, id, "Cat");
    expect(await joinedFor(ana)).toBe("Ben and Cat joined Joining crew");
    expect(await joinedFor(ben)).toBe("Cat joined Joining crew");

    // Dismissed, it's gone for that member only, until someone else joins.
    const closed = await fetch(new URL(`${api}/seen`, baseUrl), {
      method: "POST",
      headers: { origin, cookie: ana.header, "x-spots": "in-page" },
      redirect: "manual",
    });
    expect(closed.status).toBe(204);
    expect(await joinedFor(ana)).toBeUndefined();
    expect(await joinedFor(ben)).toBe("Cat joined Joining crew");
    for (const name of ["Dev", "Eve", "Fay"]) await join(new Jar(), id, id, name);
    expect(await joinedFor(ana)).toBe("Dev, Eve and Fay joined Joining crew");
    expect(await joinedFor(ben)).toBe("Cat, Dev and 2 others joined Joining crew");
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

  it("finds places to share only for someone signed in", async () => {
    // (never a free way into Photon for anyone: signed out, it's refused)
    expect((await request(new Jar(), "/api/lookup?q=cafe")).status).toBe(401);
    const { jar } = await started("Finder crew");
    const res = await request(jar, "/api/lookup?q=c");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
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
    expect(src).toBe("/kinds/coffee.webp");
    expect((await fetch(new URL(src, baseUrl))).headers.get("content-type")).toBe("image/webp");
    // (drawn for Spots, and said to be one)
    expect(art?.querySelector("figcaption")?.textContent).toContain("Illustration");
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
    // (Canberra, and the Canberra District wineries just over the border at Murrumbateman)
    expect(pins.every((p) => p.lat < -34.9 && p.lat > -36)).toBe(true);
    expect(doc.querySelector("#map")).toBeTruthy();
  });

  it("shows Explore a page of cards at a time, of the kind asked for, with the map still showing every place", async () => {
    const { jar, path } = await started("Paging crew");
    const doc = await page(jar, path);
    const cards = [...doc.querySelectorAll("#explore .spots--explore > li")];
    const pins = JSON.parse(doc.querySelector("#pins")?.textContent ?? "[]") as { id: number; kind: string }[];
    expect(cards).toHaveLength(24);
    expect(pins.length).toBeGreaterThan(24);
    // (the first page shows every kind, not a page of one)
    expect(new Set(cards.map((c) => c.getAttribute("data-kind"))).size).toBe(6);
    const more = doc.querySelector<HTMLAnchorElement>("#explore [data-more-link]");
    expect(more?.textContent?.trim()).toBe("Show 24 more");
    expect((await page(jar, more!.getAttribute("href")!)).querySelectorAll("#explore .spots--explore > li")).toHaveLength(48);
    // (?kind: only that kind's cards; ?at: a place's card first, for the map's callout)
    const culture = [...(await page(jar, `${path}?kind=culture`)).querySelectorAll("#explore .spots--explore > li")];
    expect(culture.length).toBeGreaterThan(0);
    expect(culture.every((c) => c.getAttribute("data-kind") === "culture")).toBe(true);
    const far = pins.find((p) => !cards.some((c) => c.getAttribute("data-place") === String(p.id)))!;
    const at = (await page(jar, `${path}?at=${far.id}`)).querySelector("#explore .spots--explore > li");
    expect(at?.getAttribute("data-place")).toBe(String(far.id));
  });

  it("streams changes to the group's open pages", async () => {
    const { jar: ana, id, api } = await started("Live crew");
    const stream = await fetch(new URL(`/api/events?group=${id}`, baseUrl), { headers: { cookie: ana.header } });
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

  it("streams only to the group's members, and stops for one removed", async () => {
    const { jar: ana, id } = await started("Quiet crew");
    const events = (jar?: Jar) => fetch(new URL(`/api/events?group=${id}`, baseUrl), { headers: jar ? { cookie: jar.header } : {} });
    // (nobody signed in, and someone signed in who isn't in it)
    expect((await events()).status).toBe(403);
    const outsider = new Jar();
    await startGroup(outsider, "Elsewhere", "Olly");
    expect((await events(outsider)).status).toBe(403);

    const ben = new Jar();
    await join(ben, id, id, "Ben");
    const stream = await events(ben);
    expect(stream.status).toBe(200);
    const reader = stream.body!.getReader();
    await reader.read(); // (connected)
    const benId = [...(await page(ana, `/g/${id}`)).querySelectorAll("#settings .people li")]
      .find((li) => li.textContent?.includes("Ben"))
      ?.querySelector<HTMLInputElement>('input[name="member"]')?.value ?? "";
    await request(ana, `/api/groups/${id}/owner`, { form: { action: "remove", member: benId } });
    // Removed, the change that says so is the last thing Ben's stream hears: it ends.
    let got = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      got += new TextDecoder().decode(value);
    }
    expect(got).not.toContain("event: change");
    expect((await events(ben)).status).toBe(403);
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
    expect((await page(ben, `${path}?edit`)).querySelector("#list .pick__by")?.textContent).toBe("Others keen");

    // The owner is asked first (one keen goes with it), then it's gone.
    const owner = await page(ana, `${path}?edit`);
    expect(owner.querySelector("#list form[data-remove]")?.getAttribute("data-confirm")).toContain("1 keen goes");
    await remove(ana, api, pick);
    expect(await onList(cy, path)).not.toContain("National Arboretum");
  });

  it("tells the group's open pages, and every group's Explore", async () => {
    const { ana, ben, id, api, pick } = await crew("Live remove crew");
    const stream = await fetch(new URL(`/api/events?group=${id}`, baseUrl), { headers: { cookie: ana.header } });
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
    // (every answer is on the map; Explore shows them a page at a time)
    const answers = (await ask("somewhere near Braddon")).pins.map((p) => p.name);
    expect(answers).toContain("Haig Park");
    expect(answers).not.toContain("Tidbinbilla Nature Reserve");
    expect(answers).not.toContain("National Arboretum");
  });

  it("answers nothing, rather than anything, when nothing fits", async () => {
    const { cards, doc } = await ask("xqzv blorfnik");
    expect(cards).toEqual([]);
    expect(doc.querySelector(".ask-meta")?.textContent).toContain("Nothing shared fits");
  });
});
