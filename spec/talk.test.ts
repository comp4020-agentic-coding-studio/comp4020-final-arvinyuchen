import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { Jar } from "./authenticator";
import { baseUrl, join, origin, page, request, signUp, startGroup } from "./browser";

// Talk, against the running app: a thread on each place on a group's list,
// for the group's members only. Only a message's author can delete it.
// Its words never leave the group: not in a link preview, the invite's
// preview, Explore, another group, the admin's page, the live stream or
// search. (What a day does to a deleted message is in talk-data.test.ts.)

/** A group with Questacon on its list, its owner Ana and a member Ben. */
async function crew(name: string) {
  const ana = new Jar();
  const id = await startGroup(ana, name, "Ana");
  const ben = new Jar();
  await join(ben, id, id, "Ben");
  const api = `/api/groups/${id}`;
  await request(ana, `${api}/picks`, { form: { key: "questacon" } });
  const place = (await page(ana, `/g/${id}`)).querySelector<HTMLElement>("#list [data-place-id]")?.dataset.placeId ?? "";
  return { ana, ben, id, api, place, path: `/g/${id}` };
}
type Crew = Awaited<ReturnType<typeof crew>>;
let nonces = 0;
const inPage = (jar: Jar, path: string, form: Record<string, string>) =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { origin, cookie: jar.header, "x-spots": "in-page" },
    body: new URLSearchParams(form),
    redirect: "manual",
  });
const say = (c: Crew, jar: Jar, body: string, place = c.place, nonce = `n${++nonces}`) =>
  inPage(jar, `${c.api}/talk`, { action: "send", place, body, nonce });
const threadOf = async (c: Crew, jar: Jar, place = c.place, query = "") => {
  const res = await request(jar, `${c.api}/thread?place=${place}${query}`);
  return { status: res.status, doc: new JSDOM(await res.text()).window.document };
};
const words = async (c: Crew, jar: Jar) =>
  [...(await threadOf(c, jar)).doc.querySelectorAll(".msg__bubble")].map((b) => b.textContent?.replace(/^.*?: /, "").trim());
const idOf = async (c: Crew, jar: Jar, text: string) =>
  [...(await threadOf(c, jar)).doc.querySelectorAll<HTMLElement>(".msg")].find((m) => m.textContent?.includes(text))?.dataset.msg ?? "";

describe("Talk", () => {
  it("is for the group's members, on a place on its list", async () => {
    const c = await crew("Talk crew");
    expect((await say(c, c.ben, "Is it open Mondays?")).status).toBe(204);
    expect(await words(c, c.ana)).toEqual(["Is it open Mondays?"]);
    // someone signed in who isn't in the group, and someone signed out
    const olly = new Jar();
    await startGroup(olly, "Elsewhere", "Olly");
    expect((await say(c, olly, "let me in")).status).toBe(403);
    expect((await threadOf(c, olly)).status).toBe(403);
    expect((await threadOf(c, new Jar())).status).toBe(403);
    // a place in Explore that isn't on the list has no Talk
    const pins = JSON.parse((await page(c.ana, c.path)).querySelector("#pins")?.textContent ?? "[]") as { id: number; name: string }[];
    const elsewhere = String(pins.find((p) => p.name !== "Questacon")!.id);
    const res = await say(c, c.ana, "here?", elsewhere);
    expect([res.status, res.headers.get("x-spots-error")]).toEqual([409, "gone"]);
    expect((await threadOf(c, c.ana, elsewhere)).status).toBe(404);
  });

  it("hides a place's thread while it's off the list, and has it back as it was", async () => {
    const c = await crew("Off and on crew");
    await say(c, c.ben, "Worth it for the free fall slide");
    const pick = (await page(c.ana, c.path)).querySelector("#list .picks > li")?.id.replace("pick-", "") ?? "";
    await request(c.ana, `${c.api}/picks`, { form: { remove: pick } });
    expect((await threadOf(c, c.ben)).status).toBe(404);
    expect((await say(c, c.ben, "still there?")).status).toBe(409);
    await request(c.ana, `${c.api}/picks`, { form: { place: c.place } });
    expect(await words(c, c.ben)).toEqual(["Worth it for the free fall slide"]);
  });

  it("lets only a message's author delete it, not the owner, leaves a stub, and undoes", async () => {
    const c = await crew("Delete crew");
    await say(c, c.ben, "Ben's secret plan");
    const id = await idOf(c, c.ben, "Ben's secret plan");
    // only Ben's own has a bin to delete it
    expect((await threadOf(c, c.ana)).doc.querySelector(`#msg-${id} [data-talk-delete]`)).toBeNull();
    expect((await threadOf(c, c.ben)).doc.querySelector(`#msg-${id} [data-talk-delete]`)).toBeTruthy();
    expect((await inPage(c.ana, `${c.api}/talk`, { action: "delete", message: id, place: c.place })).status).toBe(409);
    expect(await words(c, c.ana)).toEqual(["Ben's secret plan"]);
    expect((await inPage(c.ben, `${c.api}/talk`, { action: "delete", message: id, place: c.place })).status).toBe(204);
    // a stub, without its words, for everyone; Ben's has Undo
    const forAna = await threadOf(c, c.ana);
    expect(forAna.doc.querySelector(`#msg-${id}`)?.textContent?.trim()).toBe("Message removed");
    expect(forAna.doc.body.innerHTML).not.toContain("secret plan");
    const forBen = await threadOf(c, c.ben);
    expect(forBen.doc.querySelector(`#msg-${id} .msg__stub`)?.textContent).toContain("You removed this message");
    expect(forBen.doc.body.innerHTML).not.toContain("secret plan");
    expect(forBen.doc.querySelector(`#msg-${id} [data-talk-undo]`)).toBeTruthy();
    expect((await inPage(c.ana, `${c.api}/talk`, { action: "undo", message: id, place: c.place })).status).toBe(409);
    expect((await inPage(c.ben, `${c.api}/talk`, { action: "undo", message: id, place: c.place })).status).toBe(204);
    expect(await words(c, c.ana)).toEqual(["Ben's secret plan"]);
  });

  it("lets anyone in the group react to a message, one each, shown under it with who", async () => {
    const c = await crew("React crew");
    await say(c, c.ben, "Saturday 10am?");
    const id = await idOf(c, c.ben, "Saturday 10am?");
    // every message has the five, yours and theirs
    expect((await threadOf(c, c.ana)).doc.querySelectorAll(`#msg-${id} .msg__picker button[name=emoji]`)).toHaveLength(5);
    const react = (who: typeof c.ana, emoji: string) => inPage(who, `${c.api}/talk`, { action: "react", message: id, place: c.place, emoji });
    expect((await react(c.ana, "🎉")).status).toBe(204);
    expect((await react(c.ben, "🎉")).status).toBe(204);
    const chip = (await threadOf(c, c.ana)).doc.querySelector(`#msg-${id} .msg__chip`);
    expect(chip?.getAttribute("title")).toBe("You, Ben");
    expect(chip?.getAttribute("aria-pressed")).toBe("true");
    expect(chip?.textContent?.replace(/\s+/g, "")).toBe("🎉2");
    // the same again takes yours back
    expect((await react(c.ana, "🎉")).status).toBe(204);
    expect((await threadOf(c, c.ana)).doc.querySelector(`#msg-${id} .msg__chip`)?.getAttribute("title")).toBe("Ben");
    expect((await react(c.ana, "nope")).status).toBe(409);
  });

  it("takes plain text up to 500 characters, sends a double tap once, and holds back a flood", async () => {
    const c = await crew("Limits crew");
    const long = await say(c, c.ben, "x".repeat(501));
    expect([long.status, long.headers.get("x-spots-error")]).toEqual([409, "long"]);
    expect((await say(c, c.ben, "   ")).headers.get("x-spots-error")).toBe("empty");
    // HTML is words, never markup; an address is a link and only that
    await say(c, c.ben, `<img src=x onerror=alert(1)> see https://example.com/menu.`);
    const { doc } = await threadOf(c, c.ana);
    expect(doc.querySelector(".msg__bubble img")).toBeNull();
    expect(doc.querySelector(".msg__bubble")?.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(doc.querySelector(".msg__bubble a")?.getAttribute("href")).toBe("https://example.com/menu");
    expect(doc.querySelector(".msg__bubble a")?.getAttribute("rel")).toContain("noopener");
    // one nonce, one message
    expect((await say(c, c.ana, "twice?", c.place, "same-nonce")).status).toBe(204);
    expect((await say(c, c.ana, "twice?", c.place, "same-nonce")).status).toBe(204);
    expect((await words(c, c.ana)).filter((w) => w === "twice?")).toHaveLength(1);
    // ten a minute (Ben has sent one)
    for (let i = 0; i < 9; i++) expect((await say(c, c.ben, `quick ${i}`)).status).toBe(204);
    const slow = await say(c, c.ben, "one too many");
    expect([slow.status, slow.headers.get("x-spots-error")]).toEqual([409, "slow"]);
  });

  it("pages back 50 at a time", async () => {
    const c = await crew("Pages crew");
    // (six people, so the ten-a-minute limit isn't what's tested)
    const jars = [c.ana, c.ben];
    for (const name of ["Cy", "Di", "Ed", "Fa"]) {
      const jar = new Jar();
      await join(jar, c.id, c.id, name);
      jars.push(jar);
    }
    for (let i = 1; i <= 55; i++) await say(c, jars[i % 6], `#${i}`);
    const newest = await threadOf(c, c.ana);
    const shown = [...newest.doc.querySelectorAll<HTMLElement>(".msg")];
    expect(shown).toHaveLength(50);
    expect(shown[0].textContent).toContain("#6");
    const earlier = newest.doc.querySelector<HTMLAnchorElement>("[data-talk-earlier]");
    expect(earlier?.getAttribute("href")).toBe(`/g/${c.id}?talk=${c.place}&before=${shown[0].dataset.msg}#talk`);
    const before = await threadOf(c, c.ana, c.place, `&before=${shown[0].dataset.msg}`);
    expect([...before.doc.querySelectorAll(".msg__bubble")].map((b) => b.textContent?.split(": ")[1])).toEqual(["#1", "#2", "#3", "#4", "#5"]);
    expect(before.doc.querySelector("[data-talk-earlier]")).toBeNull();
  });

  it("works without a script: a plain form sends and deletes, and lands back on the thread", async () => {
    const c = await crew("Plain crew");
    const sent = await request(c.ben, `${c.api}/talk`, { form: { action: "send", place: c.place, body: "plain and simple", nonce: "p1" } });
    expect(sent.status).toBe(303);
    expect(sent.headers.get("location")).toBe(`/g/${c.id}?talk=${c.place}#talk`);
    const id = await idOf(c, c.ben, "plain and simple");
    const gone = await request(c.ben, `${c.api}/talk`, { form: { action: "delete", place: c.place, message: id } });
    expect(gone.headers.get("location")).toBe(`/g/${c.id}?talk=${c.place}#msg-${id}`);
    const long = await request(c.ben, `${c.api}/talk`, { form: { action: "send", place: c.place, body: "y".repeat(600), nonce: "p2" } });
    expect(long.headers.get("location")).toBe(`/g/${c.id}?talk=${c.place}&error=talk-long#talk`);
  });

  it("tells the group's open pages which thread changed, and never what was said", async () => {
    const c = await crew("Live talk crew");
    const stream = await fetch(new URL(`/api/events?group=${c.id}`, baseUrl), { headers: { cookie: c.ana.header } });
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    let got = decoder.decode((await reader.read()).value, { stream: true }); // (connected)
    await say(c, c.ben, "a very private thought");
    while (!got.includes("event: talk")) {
      const { value, done } = await reader.read();
      if (done) break;
      got += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    const event = got.slice(got.indexOf("event: talk")).split("\n\n")[0];
    expect(event).toBe(`event: talk\ndata: {"place":${c.place}}`);
    expect(got).not.toContain("private");
  }, 10_000);
});

describe("Talk on the group's page", () => {
  it("shows each row's count, what's new to you, and a dot on Our list's tab, until you've read it", async () => {
    const c = await crew("Count crew");
    const row = async (jar: Jar) => (await page(jar, c.path)).querySelector<HTMLAnchorElement>(`#list [data-talk-open="${c.place}"]`);
    // nothing said: just the way in, a link to the thread
    let link = await row(c.ana);
    expect(link?.getAttribute("href")).toBe(`/g/${c.id}?talk=${c.place}#talk`);
    expect(link?.classList.contains("is-empty")).toBe(true);
    await say(c, c.ben, "Saturday?");
    await say(c, c.ben, "Or Sunday");
    link = await row(c.ana);
    expect(link?.classList.contains("is-new")).toBe(true);
    expect(link?.textContent?.trim()).toBe("2 new");
    expect(link?.getAttribute("aria-label")).toBe("Talk about Questacon: 2 messages, 2 new");
    let doc = await page(c.ana, c.path);
    expect(doc.querySelector('.tabs a[data-tab="list"] .tabs__dot')?.textContent).toContain("2 new in Talk");
    // My groups says so too
    expect((await page(c.ana, "/me")).querySelector(".my-group__new")?.textContent).toBe("2 new");
    // Ben said them, so they're not new to him
    expect((await row(c.ben))?.classList.contains("is-new")).toBe(false);
    expect((await row(c.ben))?.textContent?.trim()).toBe("2");
    // Ana opens the thread (the plain way, ?talk=): it's there, open, and read
    doc = await page(c.ana, `${c.path}?talk=${c.place}`);
    const sheet = doc.querySelector("dialog#talk");
    expect(sheet?.hasAttribute("open")).toBe(true);
    expect(sheet?.querySelector("#talk-title")?.textContent).toBe("Questacon");
    expect([...(sheet?.querySelectorAll(".msg__bubble") ?? [])].map((b) => b.textContent?.split(": ")[1])).toEqual(["Saturday?", "Or Sunday"]);
    const compose = sheet?.querySelector("form[data-talk-send]");
    expect(compose?.getAttribute("action")).toBe(`${c.api}/talk`);
    expect(compose?.querySelector("textarea")?.getAttribute("maxlength")).toBe("500");
    expect(compose?.querySelector<HTMLInputElement>('input[name="nonce"]')?.value).toMatch(/.{16,}/);
    expect(doc.querySelector(`#list [data-talk-open="${c.place}"]`)?.classList.contains("is-new")).toBe(false);
    expect(doc.querySelector(".tabs__dot")).toBeNull();
    expect((await page(c.ana, "/me")).querySelector(".my-group__new")).toBeNull();
    // the thread is never in a region a live refresh redraws: the box keeps what's typed
    expect(doc.querySelector("#list #talk, #plans #talk, #plan-sheets #talk, #explore #talk")).toBeNull();
  });

  it("has no Talk for a place in Explore that isn't on the list", async () => {
    const c = await crew("Explore crew");
    const doc = await page(c.ana, c.path);
    expect(doc.querySelector("#explore-section [data-talk-open]")).toBeNull();
    const pins = JSON.parse(doc.querySelector("#pins")?.textContent ?? "[]") as { id: number; name: string }[];
    const elsewhere = pins.find((p) => p.name !== "Questacon")!.id;
    const asked = await page(c.ana, `${c.path}?talk=${elsewhere}`);
    expect(asked.querySelector("dialog#talk")?.hasAttribute("open")).toBe(false);
    expect(asked.querySelector("#list .notice")?.textContent).toContain("isn't on the list");
  });

  it("asks for the thread and posts in the background, keeping the stream open", async () => {
    const c = await crew("Script crew");
    const html = await (await request(c.ana, c.path)).text();
    // the live stream stays open for Talk's posts, as for a keen
    expect(html).toMatch(/matches\("[^"]*\[data-talk\][^"]*"\)\) source\.close\(\)/);
    expect(html).toContain('source.addEventListener("talk"');
  });
});

describe("Talk's words stay in the group", () => {
  const secret = `zqxv${Date.now().toString(36)}`;

  it("aren't in the invite's preview, a link preview, another group, Explore or search", async () => {
    const c = await crew("Private crew");
    await say(c, c.ben, `the ${secret} is upstairs`);
    expect(await words(c, c.ana)).toEqual([`the ${secret} is upstairs`]);
    // the invite's preview, signed out and signed in elsewhere
    expect(await (await request(new Jar(), c.path)).text()).not.toContain(secret);
    const olly = new Jar();
    const theirs = await startGroup(olly, "Other crew", "Olly");
    expect(await (await request(olly, c.path)).text()).not.toContain(secret);
    // another group with the same place on its list: its own thread, its own page
    await request(olly, `/api/groups/${theirs}/picks`, { form: { key: "questacon" } });
    const other = await request(olly, `/api/groups/${theirs}/thread?place=${c.place}`);
    expect(other.status).toBe(200);
    expect(await other.text()).not.toContain(secret);
    expect(await (await request(olly, `/g/${theirs}`)).text()).not.toContain(secret);
    // the group's own page: not in its head (the link preview), nor in Explore
    const ours = await page(c.ana, c.path);
    expect(ours.head.innerHTML).not.toContain(secret);
    expect(ours.querySelector("#explore-section")?.innerHTML).not.toContain(secret);
    // search finds places by their cards, never by what a group said about them
    const found = await page(c.ana, `${c.path}?q=${secret}`);
    expect(found.querySelectorAll("#explore .spots--explore > li")).toHaveLength(0);
  });

  it.skipIf(!process.env.ADMIN_CODE)("aren't on the admin's page, which counts them", async () => {
    const c = await crew("Admin can't read crew");
    await say(c, c.ben, `admin never sees ${secret}`);
    const boss = new Jar();
    await signUp(boss, "Ada");
    await request(boss, "/api/admin/claim", { form: { code: process.env.ADMIN_CODE! } });
    const html = await (await request(boss, "/admin")).text();
    expect(html).toContain("Admin can't read crew");
    expect(html).not.toContain(secret);
    // and the admin, not in the group, can't open the thread
    expect((await request(boss, `${c.api}/thread?place=${c.place}`)).status).toBe(403);
  });
});
