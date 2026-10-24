import { describe, expect, it } from "vitest";
import { Jar } from "./authenticator";
import { baseUrl, join, origin, page, request, startGroup } from "./browser";
import { addDays, today } from "../src/lib/when";

// Deciding when, against the running app: the owner picks a place on the
// list and a day, everyone marks when they're busy, the owner sets the
// time. Only the owner runs the plan; only you answer for you; nobody sees
// anyone else's busy times; and every change reaches the group's pages.

const soon = addDays(today(), 3);

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
/** Starts a plan as the owner; returns its id. */
async function planned(c: Awaited<ReturnType<typeof crew>>, day = soon) {
  const res = await request(c.ana, `${c.api}/plans`, { form: { action: "start", place: c.place, day } });
  expect(res.status).toBe(303);
  return /#plan-(\d+)$/.exec(res.headers.get("location") ?? "")?.[1] ?? "";
}
const inPage = (jar: Jar, path: string, form: Record<string, string> | URLSearchParams) =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { origin, cookie: jar.header, "x-spots": "in-page" },
    body: form instanceof URLSearchParams ? form : new URLSearchParams(form),
    redirect: "manual",
  });

describe("a plan", () => {
  it("is the owner's to start, for a place on the list, one at a time", async () => {
    const c = await crew("Plan crew");
    // the owner's sheet asks how long; the hours (8am to 11pm) are folded away under it
    const sheet = (await page(c.ana, c.path)).querySelector("#plan-start");
    expect([...(sheet?.querySelectorAll(".sheet__rows") ?? [])][0]?.querySelector("[data-length]")).toBeTruthy();
    // under a header that asks it, the field named for it, the plain hours and minutes labelled
    const length = sheet?.querySelector("[data-length]");
    expect(length?.closest("fieldset")?.querySelector("legend")?.textContent).toBe("How long");
    expect(length?.querySelector(".length")?.getAttribute("aria-label")).toBe("How long");
    expect([...(length?.querySelectorAll("input") ?? [])].map((i) => i.getAttribute("aria-label"))).toEqual(["Hours", "Minutes"]);
    const hours = sheet?.querySelector("details[data-hours]");
    expect(hours?.hasAttribute("open")).toBe(false);
    expect(hours?.querySelector("summary")?.textContent).toContain("8am–11pm");
    expect([...(hours?.querySelectorAll('input[type="time"]') ?? [])].map((i) => i.getAttribute("name"))).toEqual(["from", "to"]);
    // not the owner, not a place on the list, not a day gone by
    expect((await inPage(c.ben, `${c.api}/plans`, { action: "start", place: c.place, day: soon })).status).toBe(403);
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "start", place: "999999", day: soon })).status).toBe(409);
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "start", place: c.place, day: addDays(today(), -1) })).status).toBe(409);
    // hours outside 6am to midnight, ending before they start, or not whole minutes
    for (const [from, to] of [["300", "1380"], ["05:59", "23:00"], ["1380", "1380"], ["22:00", "21:59"], ["480", "1441"], ["482.5", "1380"], ["8am", "11pm"]])
      expect((await inPage(c.ana, `${c.api}/plans`, { action: "start", place: c.place, day: soon, from, to })).status).toBe(409);

    const id = await planned(c);
    expect(id).toMatch(/^\d+$/);
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "start", place: c.place, day: soon })).status).toBe(409);
  });

  it("counts hours to the minute, sent as minutes or as the plain form's date and time fields", async () => {
    const c = await crew("Minute crew");
    // the plain form: a date typed, not a chip; 8:07am to midnight
    const res = await request(c.ana, `${c.api}/plans`, { form: { action: "start", place: c.place, date: addDays(today(), 20), from: "08:07", to: "00:00" } });
    expect(res.status).toBe(303);
    const plan = /#plan-(\d+)$/.exec(res.headers.get("location") ?? "")?.[1] ?? "";
    const data = () => page(c.ben, c.path).then((doc) => JSON.parse(doc.querySelector("#busy [data-timeline-data]")?.textContent ?? "{}"));
    expect(await data()).toMatchObject({ day: addDays(today(), 20), start: 487, end: 1440 });
    // the owner's sheet keeps that date in its plain date field (past the two weeks' chips), from today to a year on
    const date = (await page(c.ana, c.path)).querySelector('#plan-start input[type="date"][name="date"]');
    expect([date?.getAttribute("value"), date?.getAttribute("min"), date?.getAttribute("max")]).toEqual([addDays(today(), 20), today(), addDays(today(), 365)]);
    // and its hours as plain time fields, to the minute (12:00am the midnight it ends on)
    const hours = [...(await page(c.ana, c.path)).querySelectorAll('#plan-start input[type="time"]')].map((i) => [i.getAttribute("name"), i.getAttribute("value")]);
    expect(hours).toEqual([["from", "08:07"], ["to", "00:00"]]);
    expect((await page(c.ana, c.path)).querySelector("#plan-start details[data-hours] summary")?.textContent).toContain("8:07am–midnight");
    // other hours, as the script sends them
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "change", plan, from: "421", to: "1379" })).status).toBe(204);
    expect(await data()).toMatchObject({ start: 421, end: 1379 });
    // and a date more than a year ahead isn't one
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "change", plan, date: addDays(today(), 400) })).status).toBe(409);
  });

  it("takes your busy times from you alone, to the minute, the same answer twice changing nothing", async () => {
    const c = await crew("Busy crew");
    const plan = await planned(c);
    // someone who isn't in the group
    const olly = new Jar();
    await startGroup(olly, "Elsewhere", "Olly");
    expect((await inPage(olly, `${c.api}/busy`, { plan, busy: "540-600" })).status).toBe(403);

    expect((await inPage(c.ben, `${c.api}/busy`, { plan, busy: "541-607" })).status).toBe(204);
    expect((await inPage(c.ben, `${c.api}/busy`, { plan, busy: "600-540" })).status).toBe(409);
    expect((await inPage(c.ben, `${c.api}/busy`, { plan, busy: "540-1441" })).status).toBe(409);
    // the plain form's time fields: to the minute, an end of 00:00 being midnight
    expect((await inPage(c.ben, `${c.api}/busy`, { plan, from: "09:07", to: "10:21" })).status).toBe(204);
    expect((await inPage(c.ben, `${c.api}/busy`, { plan, from: "22:30", to: "00:00" })).status).toBe(204);
    expect((await inPage(c.ben, `${c.api}/busy`, { plan, from: "10:21", to: "09:07" })).status).toBe(409);
    expect((await inPage(c.ben, `${c.api}/busy`, { plan, from: "09:07", to: "" })).status).toBe(409);
    const twice = new URLSearchParams([["plan", plan], ["busy", "540-620"], ["busy", "840-1020"]]);
    expect((await inPage(c.ben, `${c.api}/busy`, twice)).status).toBe(204);
    expect((await inPage(c.ben, `${c.api}/busy`, twice)).status).toBe(204);
    // the plain form's from/to rows, one left empty
    const plain = await request(c.ana, `${c.api}/busy`, {
      form: Object.fromEntries([["plan", plan]]) as Record<string, string>,
    });
    expect(plain.status).toBe(303); // no rows at all: free all day
    expect(plain.headers.get("location")).toContain(`#plan-${plan}`);
  });

  it("can take in several places on the list, in the order given, one to five", async () => {
    const c = await crew("Stops crew");
    for (const key of ["nga", "nma", "awm", "glassworks", "arboretum"]) await request(c.ana, `${c.api}/picks`, { form: { key } });
    // the places by name, from the owner's sheet (one to pick for each place on the list)
    const boxes = [...(await page(c.ana, c.path)).querySelectorAll<HTMLInputElement>('#plan-start input[name="place"]')];
    const id: Record<string, string> = Object.fromEntries(boxes.map((b) => [b.dataset.name ?? "", b.value]));
    const all = Object.values(id);
    expect(all.length).toBe(6);
    const start = (places: string[], order = "") =>
      inPage(c.ana, `${c.api}/plans`, new URLSearchParams([["action", "start"], ["day", soon], ["stops", "1"], ["order", order], ...places.map((p): [string, string] => ["place", p])]));
    // none, six, or one not on the list
    expect((await start([])).status).toBe(409);
    expect((await start(all)).status).toBe(409);
    expect((await start([id.Questacon, "999999"])).status).toBe(409);
    expect((await start([id.Questacon, id.Questacon])).status).toBe(409);
    // two, in the order tapped (not the list's)
    const q = id.Questacon;
    const n = id["National Gallery of Australia"];
    expect((await start([n, q], `${q},${n}`)).status).toBe(204);
    let doc = await page(c.ben, c.path);
    const plan = doc.querySelector<HTMLElement>(".plan")?.dataset.planId ?? "";
    expect(doc.querySelector(".plan h3")?.textContent).toBe("Questacon → National Gallery of Australia");
    expect(doc.querySelector("#busy .sheet__sub")?.textContent).toContain("Questacon → National Gallery of Australia · ");
    const marks = [...doc.querySelectorAll("#list .pick__plan")].map((p) => p.textContent);
    expect(marks.sort()).toEqual([expect.stringContaining("stop 1"), expect.stringContaining("stop 2")]);
    // the owner's sheet has them ticked, in order
    const sheet = (await page(c.ana, c.path)).querySelector("#plan-start");
    expect(sheet?.querySelector<HTMLInputElement>('input[name="order"]')?.value).toBe(`${q},${n}`);

    // other stops keep everyone's times; a plain form's ticks go in the list's order
    await request(c.ben, `${c.api}/busy`, { form: { plan, from: "09:00", to: "10:00" } });
    const plain = new URLSearchParams([["action", "change"], ["plan", plan], ["stops", "1"], ["place", id.Questacon], ["place", id["National Museum of Australia"] ?? all[2]]]);
    expect((await inPage(c.ana, `${c.api}/plans`, plain)).status).toBe(204);
    doc = await page(c.ben, c.path);
    expect(doc.querySelector(".plan h3")?.textContent).toContain(" → ");
    expect(doc.querySelector(`#plan-${plan} .plan__mine`)?.textContent).toContain("busy 9–10am");
    // none ticked is refused, not "as it was"
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "change", plan, stops: "1" })).status).toBe(409);

    // a stop taken off the list leaves the plan, the rest moving up; the last one calls it off
    const pickOf = async (name: string) =>
      [...(await page(c.ana, c.path)).querySelectorAll("#list li")].find((li) => li.textContent?.includes(name))?.querySelector<HTMLInputElement>('input[name="pick"]')?.value ?? "";
    const firstName = doc.querySelector(".plan h3")?.textContent?.split(" → ")[0] ?? "";
    const secondName = doc.querySelector(".plan h3")?.textContent?.split(" → ")[1] ?? "";
    await request(c.ana, `${c.api}/picks`, { form: { remove: await pickOf(firstName) } });
    doc = await page(c.ben, c.path);
    expect(doc.querySelector(".plan h3")?.textContent).toBe(secondName);
    expect(doc.querySelector(`#plan-${plan} .plan__mine`)?.textContent).toContain("busy 9–10am");
    await request(c.ana, `${c.api}/picks`, { form: { remove: await pickOf(secondName) } });
    doc = await page(c.ben, c.path);
    expect(doc.querySelector(".plan")).toBeNull();
    expect(doc.querySelector("#past-plans")?.textContent).toContain("Called off");
    expect(doc.querySelector("#past-plans")?.textContent).toContain(secondName);
  });

  it("keeps its stops on the list while it's on: a member can't take one off, the owner can", async () => {
    const c = await crew("Locked crew");
    // Ben adds two places, and the plan takes in both
    for (const key of ["nga", "nma"]) await request(c.ben, `${c.api}/picks`, { form: { key } });
    const boxes = [...(await page(c.ana, c.path)).querySelectorAll<HTMLInputElement>('#plan-start input[name="place"]')];
    const id: Record<string, string> = Object.fromEntries(boxes.map((b) => [b.dataset.name ?? "", b.value]));
    const n = id["National Gallery of Australia"];
    const m = id["National Museum of Australia"];
    const form = new URLSearchParams([["action", "start"], ["day", soon], ["stops", "1"], ["order", `${n},${m}`], ["place", n], ["place", m]]);
    expect((await inPage(c.ana, `${c.api}/plans`, form)).status).toBe(204);
    const row = async (jar: Jar, placeId: string) => (await page(jar, `${c.path}?edit`)).querySelector(`#list li[data-place-id="${placeId}"]`);
    const pickOf = async (placeId: string) => (await row(c.ana, placeId))?.querySelector<HTMLInputElement>('input[name="pick"]')?.value ?? "";

    // in Edit, Ben's own planned places have no Remove, but a lock
    expect((await row(c.ben, n))?.querySelector('input[name="remove"]')).toBeNull();
    expect((await row(c.ben, n))?.querySelector(".pick__locked")?.getAttribute("aria-label")).toBe("In the plan, only the owner can take it off");
    expect((await row(c.ana, n))?.querySelector('input[name="remove"]')).toBeTruthy();
    // and the route refuses him: in the page a 409, a plain form back with a note
    const nPick = await pickOf(n);
    expect((await inPage(c.ben, `${c.api}/picks`, { remove: nPick })).status).toBe(409);
    const plain = await request(c.ben, `${c.api}/picks`, { form: { remove: nPick } });
    expect(plain.headers.get("location")).toContain("error=remove-planned");
    expect((await page(c.ben, `${c.path}?edit&error=remove-planned`)).querySelector(".list-note")?.textContent).toContain("in the plan");

    // the owner can: only that stop goes
    expect((await inPage(c.ana, `${c.api}/picks`, { remove: nPick })).status).toBe(204);
    expect((await page(c.ben, c.path)).querySelector(".plan h3")?.textContent).toBe("National Museum of Australia");

    // called off, Ben's own place is his to take off again
    const plan = (await page(c.ana, c.path)).querySelector<HTMLElement>(".plan")?.dataset.planId ?? "";
    await inPage(c.ana, `${c.api}/plans`, { action: "off", plan });
    expect((await row(c.ben, m))?.querySelector('input[name="remove"]')).toBeTruthy();
    expect((await inPage(c.ben, `${c.api}/picks`, { remove: await pickOf(m) })).status).toBe(204);
  });

  it("still reads a plan with one place, as plans were before stops", async () => {
    const c = await crew("One stop crew");
    // the form as it was: one place, no order
    const plan = await planned(c);
    const doc = await page(c.ben, c.path);
    expect(doc.querySelector(`#plan-${plan} h3`)?.textContent).toBe("Questacon");
    expect(doc.querySelector("#list .pick__plan")?.textContent).not.toContain("stop");
    expect(doc.querySelector("#busy .sheet__sub")?.textContent).toMatch(/^Questacon · /);
  });

  it("is set by the owner only, inside the hours it counts", async () => {
    const c = await crew("Set crew");
    const plan = await planned(c);
    expect((await inPage(c.ben, `${c.api}/plans`, { action: "set", plan, at: "855-1000" })).status).toBe(403);
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "set", plan, at: "400-500" })).status).toBe(409);
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "set", plan, at: "1000-857" })).status).toBe(409);
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "set", plan, at: "857-1003" })).status).toBe(204);
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "set", plan, at: "855-1000" })).status).toBe(204);
    // "Other": a start picked from the list wins over the offered one
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "set", plan, at: "855-1000", other: "900-1000" })).status).toBe(204);
  });

  it("is called off when its place leaves the list, and then takes no answers", async () => {
    const c = await crew("Off crew");
    const plan = await planned(c);
    const pick = (await page(c.ana, c.path)).querySelector<HTMLInputElement>('#list input[name="pick"]')?.value ?? "";
    await request(c.ana, `${c.api}/picks`, { form: { remove: pick } });
    expect((await inPage(c.ben, `${c.api}/busy`, { plan, busy: "540-600" })).status).toBe(409);
    // and the group can start another
    await request(c.ana, `${c.api}/picks`, { form: { key: "questacon" } });
    const again = (await page(c.ana, c.path)).querySelector<HTMLElement>("#list [data-place-id]")?.dataset.placeId ?? "";
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "start", place: again, day: soon })).status).toBe(204);
  });

  it("moves to another day as a new plan, and can be called off", async () => {
    const c = await crew("Move crew");
    const plan = await planned(c);
    const moved = await request(c.ana, `${c.api}/plans`, { form: { action: "change", plan, day: addDays(soon, 1) } });
    const next = /#plan-(\d+)$/.exec(moved.headers.get("location") ?? "")?.[1] ?? "";
    expect(next).not.toBe(plan);
    // the old one is done with: answering it, or acting on it, is refused
    expect((await inPage(c.ben, `${c.api}/busy`, { plan, busy: "540-600" })).status).toBe(409);
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "off", plan })).status).toBe(409);
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "off", plan: next })).status).toBe(204);
    expect((await inPage(c.ben, `${c.api}/busy`, { plan: next, busy: "540-600" })).status).toBe(409);
  });

  it("doesn't take answers from someone removed", async () => {
    const c = await crew("Removed crew");
    const plan = await planned(c);
    const benId = [...(await page(c.ana, c.path)).querySelectorAll("#settings .people li")]
      .find((li) => li.textContent?.includes("Ben"))
      ?.querySelector<HTMLInputElement>('input[name="member"]')?.value ?? "";
    await request(c.ana, `${c.api}/owner`, { form: { action: "remove", member: benId } });
    expect((await inPage(c.ben, `${c.api}/busy`, { plan, busy: "540-600" })).status).toBe(403);
  });

  it("tells the group's open pages when someone answers and when the time is set", async () => {
    const c = await crew("Live plan crew");
    const plan = await planned(c);
    const stream = await fetch(new URL(`/api/events?group=${c.id}`, baseUrl), { headers: { cookie: c.ana.header } });
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    let got = decoder.decode((await reader.read()).value, { stream: true }); // (connected)
    const hear = async () => {
      while (!got.includes("event: change")) {
        const { value, done } = await reader.read();
        if (done) break;
        got += decoder.decode(value, { stream: true });
      }
      const heard = got.includes("event: change");
      got = "";
      return heard;
    };
    await inPage(c.ben, `${c.api}/busy`, { plan, busy: "540-600" });
    expect(await hear()).toBe(true);
    await inPage(c.ana, `${c.api}/plans`, { action: "set", plan, at: "855-1000" });
    expect(await hear()).toBe(true);
    await reader.cancel();
  }, 10_000);
});

describe("the plan on the group's page", () => {
  it("asks each member for their times until they've given them, and works without a script", async () => {
    const c = await crew("Page crew");
    const plan = await planned(c);
    let doc = await page(c.ben, c.path);
    const card = doc.querySelector(`#plan-${plan}`);
    expect(card?.textContent).toContain("Questacon");
    expect(card?.textContent).toContain("Needs your answer");
    expect(card?.getAttribute("data-needs")).toBe("answer");
    expect(doc.querySelector(".tabs__dot")).toBeTruthy();
    // the plain form: rows of from/to time fields, to the minute, and "I'm free all day"
    const sheet = doc.querySelector("#busy form");
    expect(sheet?.getAttribute("action")).toBe(`${c.api}/busy`);
    const from = sheet?.querySelector('input[type="time"][name="from"]');
    expect([from?.getAttribute("min"), from?.getAttribute("max"), from?.getAttribute("step")]).toEqual(["08:00", "22:59", "60"]);
    expect(sheet?.querySelector('input[type="time"][name="to"]')).toBeTruthy();
    expect(sheet?.querySelector('button[name="free"][value="all"]')).toBeTruthy();
    // the place on the list says it's being planned
    // (quietly, after its suburb: the day, a screen reader told what it is)
    const mark = doc.querySelector("#list .pick__plan");
    expect(mark?.closest(".area")).toBeTruthy();
    expect(mark?.textContent).toContain("In the plan");

    await request(c.ben, `${c.api}/busy`, { form: { plan, from: "540", to: "620" } });
    doc = await page(c.ben, c.path);
    expect(doc.querySelector(`#plan-${plan}`)?.getAttribute("data-needs")).toBeNull();
    expect(doc.querySelector(`#plan-${plan} .plan__mine`)?.textContent).toContain("busy 9–10:20am");
    expect(doc.querySelector(".tabs__dot")).toBeNull();
    // one answer singles nothing out: the strip has no ring
    expect(doc.querySelector(`#plan-${plan} .heat`)).toBeTruthy();
    expect(doc.querySelector(`#plan-${plan} .heat__mark`)).toBeNull();
    // and its key is a scale from busy to free, no squares
    expect([...doc.querySelectorAll(`#plan-${plan} .heat__key span`)].map((k) => k.textContent)).toEqual(["busy", "free"]);
  });

  it("says when everyone's free for less than it takes, and lets the owner make it that long", async () => {
    const c = await crew("Shorter crew");
    const [cat, dan] = [new Jar(), new Jar()];
    await join(cat, c.id, c.id, "Cat");
    await join(dan, c.id, c.id, "Dan");
    const res = await request(c.ana, `${c.api}/plans`, { form: { action: "start", place: c.place, day: soon, duration: "240" } });
    const plan = /#plan-(\d+)$/.exec(res.headers.get("location") ?? "")?.[1] ?? "";
    // every 4h window leaves one out; all who've answered are free 10am to 1pm
    await request(c.ana, `${c.api}/busy`, { form: { plan, from: "480", to: "600" } });
    await request(c.ben, `${c.api}/busy`, { form: { plan, from: "780", to: "1380" } });
    await request(cat, `${c.api}/busy`, { form: { plan, free: "all" } });
    const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim();
    let doc = await page(c.ben, c.path);
    expect(text(doc.querySelector(`#plan-${plan} .plan__allfree p`))).toBe("Everyone so far is free 10am–1pm, 1h short.");
    // who hasn't answered, by name (you, to yourself)
    expect(text(doc.querySelector(`#plan-${plan} .plan__filled > span:last-child`))).toBe("Waiting on Dan");
    expect(text((await page(dan, c.path)).querySelector(`#plan-${plan} .plan__filled > span:last-child`))).toBe("Waiting on you");
    await request(dan, `${c.api}/busy`, { form: { plan, free: "all" } });
    doc = await page(c.ben, c.path);
    const note = doc.querySelector(`#plan-${plan} .plan__allfree`);
    expect(text(note?.querySelector("p"))).toBe("Everyone's free 10am–1pm, 1h short.");
    expect(text(doc.querySelector(`#plan-${plan} .plan__filled > span:last-child`))).toBe("Everyone's in");
    // each window: its times, and only who can't come (the badge counts who can)
    expect([...doc.querySelectorAll(`#plan-${plan} .win__when`)].map(text)).toEqual(["10am–11pm", "8am–1pm"]);
    expect([...doc.querySelectorAll(`#plan-${plan} .win__who`)].map(text)).toEqual(["you can't", "Ana can't"]);
    // the ranking stays: only windows of 4h or more, none with all four
    expect([...doc.querySelectorAll(`#plan-${plan} .win__when`)].every((w) => !w.textContent?.includes("10am–1pm"))).toBe(true);
    // a member sees the note; only the owner can act on it
    expect(note?.querySelector("button")).toBeNull();
    doc = await page(c.ana, c.path);
    const form = doc.querySelector(`#plan-${plan} .plan__allfree form`);
    expect(form?.querySelector("button")?.textContent).toBe("Make it 3h");
    const sent = new URLSearchParams([...(form?.querySelectorAll("input") ?? [])].map((i) => [i.getAttribute("name") ?? "", i.getAttribute("value") ?? ""]));
    expect((await inPage(c.ana, form?.getAttribute("action") ?? "", sent)).status).toBe(204);
    // it now takes 3h, everyone's answers kept, and that window comes first
    doc = await page(c.ana, c.path);
    const card = doc.querySelector(`#plan-${plan}`);
    expect(card?.querySelector(".plan__sub")?.textContent).toContain("3h");
    expect(card?.querySelector(".plan__allfree")).toBeNull();
    expect(card?.querySelector(".win__when")?.textContent).toContain("10am–1pm");
    expect(card?.querySelector(".win__who")?.textContent).toBe("Everyone free");
  });

  it("offers each window's earliest start and any later one typed, the whole length inside it", async () => {
    const c = await crew("Start crew");
    const plan = await planned(c);
    await request(c.ana, `${c.api}/busy`, { form: { plan, from: "545", to: "620" } });
    await request(c.ben, `${c.api}/busy`, { form: { plan, from: "690", to: "855" } });
    let card = (await page(c.ana, c.path)).querySelector(`#plan-${plan}`);
    // 2:15 to 11pm, 2h long: one chip, the earliest, and a time field from it to 9pm
    const starts = card?.querySelector(".starts");
    expect([...(starts?.querySelectorAll('input[name="at"]') ?? [])].map((r) => r.getAttribute("value"))).toEqual(["855-975"]);
    expect(starts?.querySelector(".st")?.textContent?.trim()).toBe("2:15pm");
    expect(starts?.querySelector('input[type="time"]')?.getAttribute("aria-label")).toBe("Start, between 2:15pm and 9pm");
    const field = starts?.querySelector('input[type="time"]');
    expect([field?.getAttribute("name"), field?.getAttribute("value"), field?.getAttribute("min"), field?.getAttribute("max"), field?.getAttribute("step")]).toEqual([
      "start-855",
      "14:15",
      "14:15",
      "21:00",
      "60",
    ]);
    // no list of starts to choose from, only the further windows
    expect(card?.querySelector('select[name="other"]')).toBeNull();
    // an exact time is in the ··· menu, a sheet of its own (open on the
    // page its link loads, without a script); only the owner's
    expect(card?.querySelector(".plan__menu [data-open-exact]")?.getAttribute("href")).toContain("?plan=exact#plan-exact");
    const exact = (await page(c.ana, `${c.path}?plan=exact`)).querySelector("#plan-exact");
    expect(exact?.hasAttribute("open")).toBe(true);
    expect([...(exact?.querySelectorAll("input[type=time]") ?? [])].map((i) => i.getAttribute("name"))).toEqual(["set_from", "set_to"]);
    expect(exact?.querySelector('input[name="exact"]')?.getAttribute("value")).toBe("1");
    expect((await page(c.ben, c.path)).querySelector("#plan-exact")).toBeNull();
    // the start typed is the one set, as long as the plan takes
    await request(c.ana, `${c.api}/plans`, { form: { action: "set", plan, at: "855-975", "start-855": "15:37" } });
    card = (await page(c.ana, c.path)).querySelector(`#plan-${plan}`);
    expect(card?.querySelector(".plan__when")?.textContent).toContain("3:37pm");
    expect(card?.textContent).toContain("Everyone's free till 5:37pm");
  });

  it("says a window's one start when it's just as long as the plan", async () => {
    const c = await crew("Snug crew");
    const plan = await planned(c);
    // free together only 10am to noon, and the plan takes 2h
    const form = new URLSearchParams([["plan", plan], ["from", "480"], ["to", "600"], ["from", "720"], ["to", "1380"]]);
    expect((await inPage(c.ana, `${c.api}/busy`, form)).status).toBe(204);
    const starts = (await page(c.ana, c.path)).querySelector(`#plan-${plan} .starts`);
    expect(starts?.querySelector(".st--only")?.textContent).toBe("Starts 10am, the one start that fits");
    expect(starts?.querySelector('input[type="time"]')).toBeNull();
  });

  it("shows the owner when everyone's free, lets them set it, then shows everyone the time", async () => {
    const c = await crew("Results crew");
    const plan = await planned(c);
    await request(c.ana, `${c.api}/busy`, { form: { plan, from: "545", to: "620" } });
    await request(c.ben, `${c.api}/busy`, { form: { plan, from: "690", to: "855" } });
    let doc = await page(c.ana, c.path);
    const card = doc.querySelector(`#plan-${plan}`);
    expect(card?.getAttribute("data-needs")).toBe("pick");
    expect(card?.textContent).toContain("Everyone's in");
    // the owner's ··· menu: two short items, calling off asked first
    expect([...(card?.querySelectorAll('.plan__menu [role="menuitem"]') ?? [])].map((i) => i.textContent?.trim())).toEqual(["Edit plan", "Set exact time", "Call off plan"]);
    expect(card?.querySelector('.plan__menu input[value="off"]')?.closest("form")?.getAttribute("data-confirm")).toContain("Call off");
    // longest first: 2:15–11pm, everyone free
    expect(card?.querySelector(".win__when")?.textContent).toContain("2:15–11pm");
    expect(card?.querySelector(".win__who")?.textContent).toBe("Everyone free");
    // the start offered ends two hours on, as long as the plan takes
    const first = card?.querySelector<HTMLInputElement>('input[name="at"]:checked')?.value;
    expect(first).toBe("855-975");
    // the ring round the owner's pick: 2:15 to 4:15pm of 8am to 11pm
    expect(card?.querySelector<HTMLElement>(".heat__mark")?.getAttribute("style")).toBe("left: 41.667%; width: 13.333%");
    // one unbroken strip: a run per shade, end to end, nothing between
    const fill = card?.querySelector<HTMLElement>(".heat__fill");
    expect(fill?.children.length).toBe(0);
    const stops = [...(fill?.getAttribute("style") ?? "").matchAll(/([\d.]+)% ([\d.]+)%/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(stops.length).toBe(5);
    expect(stops[0][0]).toBe(0);
    expect(stops.at(-1)?.[1]).toBe(100);
    stops.slice(1).forEach(([from], i) => expect(from).toBe(stops[i][1]));
    expect([...(card?.querySelectorAll(".heat__key span") ?? [])].map((k) => k.textContent)).toEqual(["nobody", "all 2"]);
    await request(c.ana, `${c.api}/plans`, { form: { action: "set", plan, at: first ?? "" } });

    doc = await page(c.ben, c.path);
    expect(doc.querySelector(".next-up")?.textContent).toContain("2:15pm");
    expect(doc.querySelector(`#plan-${plan} .plan__when`)?.textContent).toContain("2:15pm");
    expect(doc.querySelector(`#plan-${plan} .plan__going`)?.textContent).toContain("Everyone's free till 4:15pm");
    expect(doc.querySelector("#list .pick__plan")?.textContent).toContain("2:15pm");
    // once set, the strip rings the set time
    expect(doc.querySelector(`#plan-${plan} .plan__results--set .heat__mark`)?.getAttribute("style")).toBe("left: 41.667%; width: 13.333%");
    // (the ring needs no key: it's always on the time set)
    expect(doc.querySelector(`#plan-${plan} .plan__results--set .heat__key`)?.textContent).not.toContain("Outlined");
  });

  it("works out when everyone's free to the minute", async () => {
    const c = await crew("Minute results crew");
    const plan = await planned(c);
    await request(c.ana, `${c.api}/busy`, { form: { plan, from: "09:07", to: "10:21" } });
    await request(c.ben, `${c.api}/busy`, { form: { plan, from: "11:31", to: "14:13" } });
    const card = (await page(c.ana, c.path)).querySelector(`#plan-${plan}`);
    expect(card?.querySelector(".win__when")?.textContent).toContain("2:13–11pm");
    expect(card?.querySelector<HTMLInputElement>('input[name="at"]:checked')?.value).toBe("853-973");
    // its start field begins on the window's own minute, and goes to the minute
    const field = card?.querySelector('input[name="start-853"]');
    expect([field?.getAttribute("value"), field?.getAttribute("step")]).toEqual(["14:13", "60"]);
    // or an exact time, typed
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "set", plan, exact: "1", set_from: "14:13", set_to: "16:41" })).status).toBe(204);
    expect((await page(c.ben, c.path)).querySelector(`#plan-${plan} .plan__going`)?.textContent).toContain("till 4:41pm");
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "set", plan, exact: "1", set_from: "16:41", set_to: "14:13" })).status).toBe(409);
  });

  it("offers only times as long as the plan takes, and works it out again when that changes", async () => {
    const c = await crew("Length crew");
    // busy 10am to 10pm, and free all day: together 8 to 10am, and 10 to 11pm
    const plan = await planned(c);
    await request(c.ana, `${c.api}/busy`, { form: { plan, from: "10:00", to: "22:00" } });
    await request(c.ben, `${c.api}/busy`, { form: { plan } });
    const card = async (jar = c.ana) => (await page(jar, c.path)).querySelector(`#plan-${plan}`);
    const whens = async () => [...((await card())?.querySelectorAll(".win__when") ?? [])].map((w) => w.textContent?.split(" ·")[0].trim());
    // two hours: only the morning, and everyone sees how long it takes
    expect(await whens()).toEqual(["8–10am"]);
    expect((await card(c.ben))?.querySelector(".plan__sub")?.textContent).toBe("2h");
    expect((await page(c.ben, c.path)).querySelector("#busy .sheet__sub")?.textContent).toContain("Questacon · ");
    expect((await page(c.ben, c.path)).querySelector("#busy .sheet__sub")?.textContent).toContain("· 2h");
    // an hour (the plain form's hours and minutes): the evening too, longest first; nobody's answers lost
    expect((await request(c.ana, `${c.api}/plans`, { form: { action: "change", plan, duration_h: "1", duration_m: "0" } })).status).toBe(303);
    expect(await whens()).toEqual(["8–10am", "10–11pm"]);
    expect((await card())?.textContent).toContain("Everyone's in");
    // three hours: nothing fits, and the card says so, with a way to change it for the owner
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "change", plan, duration: "180" })).status).toBe(204);
    expect(await whens()).toEqual([]);
    const none = (await card())?.querySelector(".plan__none--short");
    expect(none?.textContent).toContain("No 3h stretch works for 2 or more");
    expect(none?.textContent).toContain("The longest is 2h");
    expect(none?.querySelector("[data-open-start]")).toBeTruthy();
    expect((await card(c.ben))?.querySelector(".plan__none--short [data-open-start]")).toBeNull();
  });

  it("takes a length from a minute to all the hours it counts, and nothing else", async () => {
    const c = await crew("Bad length crew");
    for (const duration of ["0", "-5", "901", "1.5", "two hours", ""])
      expect((await inPage(c.ana, `${c.api}/plans`, { action: "start", place: c.place, day: soon, duration })).status).toBe(409);
    // longer than the hours it counts
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "start", place: c.place, day: soon, from: "18:00", to: "20:00", duration: "121" })).status).toBe(409);
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "start", place: c.place, day: soon, duration_h: "1", duration_m: "x" })).status).toBe(409);
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "start", place: c.place, day: soon, from: "18:00", to: "20:00", duration: "120" })).status).toBe(204);
    const plan = (await page(c.ana, c.path)).querySelector<HTMLElement>(".plan")?.dataset.planId ?? "";
    // and changing it is checked the same
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "change", plan, duration: "121" })).status).toBe(409);
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "change", plan, duration: "1" })).status).toBe(204);
    // the owner's sheet has it as plain hours and minutes
    const sheet = (await page(c.ana, c.path)).querySelector("#plan-start [data-length]");
    expect([sheet?.querySelector<HTMLInputElement>('input[name="duration_h"]')?.getAttribute("value"), sheet?.querySelector<HTMLInputElement>('input[name="duration_m"]')?.getAttribute("value")]).toEqual(["0", "1"]);
  });

  it("never shows anyone else's busy times, only counts and who can't", async () => {
    const c = await crew("Private crew");
    const plan = await planned(c);
    await request(c.ana, `${c.api}/busy`, { form: { plan, from: "545", to: "620" } });
    await request(c.ben, `${c.api}/busy`, { form: { plan, from: "840", to: "1020" } });
    const html = await (await request(c.ben, c.path)).text();
    const doc = await page(c.ben, c.path);
    // Ben's sheet holds Ben's times alone
    const rows = [...doc.querySelectorAll<HTMLInputElement>('#busy input[type="time"]')].map((o) => o.getAttribute("value"));
    expect(rows).toEqual(["14:00", "17:00", "", ""]);
    const data = JSON.parse(doc.querySelector("#busy [data-timeline-data]")?.textContent ?? "{}");
    expect(data.busy).toEqual([[840, 1020]]);
    // one other answered: their counts would be their times, so none
    expect(data.others).toEqual([]);
    expect(html).not.toContain("busy 9:05–10:20am");
    expect(html).not.toContain("545-620");
  });

  it("has its places on the page before there's a plan, so one can arrive live", async () => {
    const c = await crew("Live plan crew");
    let doc = await page(c.ben, c.path);
    // (a live refresh only swaps parts that are there already)
    for (const part of ["#plans", "#plan-sheets", ".next-up-slot", ".tabs__flag", "#past-plans"]) expect(doc.querySelector(part)).toBeTruthy();
    expect(doc.querySelector("#busy")).toBeNull();
    const plan = await planned(c);
    doc = await page(c.ben, c.path);
    // the sheet is in its place, with what the timeline draws from
    const data = JSON.parse(doc.querySelector("#plan-sheets #busy [data-timeline-data]")?.textContent ?? "{}");
    expect(data).toMatchObject({ start: 480, end: 1380, busy: [], set: null });
    expect(data.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(doc.querySelector(`#plan-${plan}`)?.getAttribute("data-day")).toMatch(/^\w{3} \d{1,2} \w{3}$/);
  });

  it("isn't shown to someone who isn't in the group", async () => {
    const c = await crew("Secret plan crew");
    await planned(c);
    const stranger = await page(new Jar(), c.path);
    expect(stranger.querySelector(".plan, #plans, #busy, #plan-start, .next-up")).toBeNull();
    expect(stranger.body.textContent).not.toContain("Needs your answer");
  });

  it("keeps a called-off plan under Past plans", async () => {
    const c = await crew("Past crew");
    const plan = await planned(c);
    await request(c.ana, `${c.api}/plans`, { form: { action: "off", plan } });
    const doc = await page(c.ben, c.path);
    expect(doc.querySelector(".plan")).toBeNull();
    expect(doc.querySelector("#past-plans")?.textContent).toContain("Called off");
    expect(doc.querySelector("#past-plans")?.textContent).toContain("Questacon");
  });
});
