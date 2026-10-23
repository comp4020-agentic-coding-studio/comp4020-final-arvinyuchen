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
    // not the owner, not a place on the list, not a day gone by
    expect((await inPage(c.ben, `${c.api}/plans`, { action: "start", place: c.place, day: soon })).status).toBe(403);
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "start", place: "999999", day: soon })).status).toBe(409);
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "start", place: c.place, day: addDays(today(), -1) })).status).toBe(409);
    // hours outside 6am to midnight, or not in 5-minute steps
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "start", place: c.place, day: soon, from: "300", to: "1380" })).status).toBe(409);
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "start", place: c.place, day: soon, from: "482", to: "1380" })).status).toBe(409);

    const id = await planned(c);
    expect(id).toMatch(/^\d+$/);
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "start", place: c.place, day: soon })).status).toBe(409);
  });

  it("takes your busy times from you alone, in 5-minute steps, the same answer twice changing nothing", async () => {
    const c = await crew("Busy crew");
    const plan = await planned(c);
    // someone who isn't in the group
    const olly = new Jar();
    await startGroup(olly, "Elsewhere", "Olly");
    expect((await inPage(olly, `${c.api}/busy`, { plan, busy: "540-600" })).status).toBe(403);

    expect((await inPage(c.ben, `${c.api}/busy`, { plan, busy: "541-600" })).status).toBe(409);
    expect((await inPage(c.ben, `${c.api}/busy`, { plan, busy: "600-540" })).status).toBe(409);
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

  it("is set by the owner only, inside the hours it counts", async () => {
    const c = await crew("Set crew");
    const plan = await planned(c);
    expect((await inPage(c.ben, `${c.api}/plans`, { action: "set", plan, at: "855-1000" })).status).toBe(403);
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "set", plan, at: "400-500" })).status).toBe(409);
    expect((await inPage(c.ana, `${c.api}/plans`, { action: "set", plan, at: "857-1000" })).status).toBe(409);
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
