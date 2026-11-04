import { describe, expect, it } from "vitest";
import { Authenticator, Jar } from "./authenticator";
import { baseUrl, emailFor, join, origin, page, request, signUp, startGroup } from "./browser";
import { addDays, today } from "../src/lib/when";

// Who did what, as the logs say it (src/lib/log.ts): someone reading
// `flyctl logs` can tell who joined, voted, shared, planned and talked, in
// which group. Never what was said, an email, or anyone's busy times. The
// app keeps its last lines for /api/log-tail while stubbed (OUTING_STUB).
const tail = async () => (await (await fetch(new URL("/api/log-tail", baseUrl))).json()) as string[];
const inPage = (jar: Jar, path: string, form: Record<string, string>) =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { origin, cookie: jar.header, "x-spots": "in-page" },
    body: new URLSearchParams(form),
    redirect: "manual",
  });

describe("the logs", () => {
  it("say who did what in which group, and never what anyone said, their email or their busy times", async () => {
    expect((await fetch(new URL("/api/log-tail", baseUrl))).ok, "start the app with OUTING_STUB=1 for this spec").toBe(true);
    const anaEmail = emailFor("Ana");
    const ana = new Jar();
    await signUp(ana, "Ana", new Authenticator(), anaEmail);
    const id = await startGroup(ana, "Logbook crew", "Ana");
    const ben = new Jar();
    await join(ben, id, id, "Ben");
    const api = `/api/groups/${id}`;
    await request(ana, `${api}/picks`, { form: { key: "questacon" } });
    const doc = await page(ben, `/g/${id}`);
    const pick = doc.querySelector<HTMLInputElement>('#list input[name="pick"]')?.value ?? "";
    const place = doc.querySelector<HTMLElement>("#list [data-place-id]")?.dataset.placeId ?? "";
    await request(ben, `${api}/keen`, { form: { pick, keen: "on" } });
    const secret = `Quietly${Date.now()}`;
    expect((await inPage(ben, `${api}/talk`, { action: "send", place, body: `${secret} says the upstairs bit`, nonce: "log1" })).status).toBe(204);
    const planned = await request(ana, `${api}/plans`, { form: { action: "start", place, day: addDays(today(), 3) } });
    const plan = /#plan-(\d+)$/.exec(planned.headers.get("location") ?? "")?.[1] ?? "";
    expect((await inPage(ben, `${api}/busy`, { plan, busy: "617-683" })).status).toBe(204);
    const newEmail = emailFor("Ben");
    await request(ben, "/api/account", { form: { email: newEmail } });

    const lines = (await tail()).filter((l) => l.includes(id) || l.includes("email-set"));
    const said = (act: string, who: string) => lines.some((l) => l.startsWith(`spots ${act} `) && l.includes(`by="${who} (`));
    expect(said("group-start", "Ana")).toBe(true);
    expect(said("join", "Ben")).toBe(true);
    expect(said("list-add", "Ana")).toBe(true);
    expect(said("keen", "Ben")).toBe(true);
    expect(said("talk-send", "Ben")).toBe(true);
    expect(said("plan-start", "Ana")).toBe(true);
    expect(said("busy", "Ben")).toBe(true);
    expect(said("email-set", "Ben")).toBe(true);
    expect(lines.find((l) => l.startsWith("spots keen "))).toContain(`group="Logbook crew (${id})"`);

    // Everything kept, not just this group's: the words, the emails and the times never appear.
    const all = (await tail()).join("\n");
    for (const never of [secret, "upstairs", anaEmail, newEmail, "10:17", "11:23"]) expect(all).not.toContain(never);
    // (a busy answer says how many stretches, not when)
    expect(lines.find((l) => l.startsWith("spots busy "))).toMatch(/ plan=\d+ stretches=1$/);
  });
});
