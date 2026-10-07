import { describe, expect, it } from "vitest";
import { Authenticator, Jar } from "./authenticator";
import { baseUrl, join, origin, page, request, savePasskey, signInWith, startGroup, you } from "./browser";

// Accounts by passkey, and the owner's tools. Joining stays a link and a
// name; a passkey is optional and lets a member be themselves on any device.
// Each Jar is one browser; one Authenticator is one person's synced passkey.
describe("accounts by passkey", () => {
  it("saves a passkey from a group, then signs in on another device with no username", async () => {
    const phone = new Jar();
    const id = await startGroup(phone, "Passkey crew", "Ana");
    const passkey = new Authenticator();
    expect((await savePasskey(phone, passkey, id)).status).toBe(200);
    expect(phone.has("spots_session")).toBe(true);
    expect((await page(phone, "/me")).body.textContent).toContain("Passkey crew");

    // A laptop that has never seen the group: no cookie, no name typed.
    const laptop = new Jar();
    expect(await you(laptop, id)).toBe("");
    const { res } = await signInWith(laptop, passkey);
    expect(res.status).toBe(200);
    expect(await you(laptop, id)).toContain("You're in as Ana");
    expect((await page(laptop, "/me")).body.textContent).toContain("Passkey crew");
  });

  it("refuses a passkey it never stored, a forged signature, and a replayed one", async () => {
    const jar = new Jar();
    const id = await startGroup(jar, "Guarded crew", "Ana");
    const real = new Authenticator();
    await savePasskey(jar, real, id);

    expect((await signInWith(new Jar(), stranger())).res.status).toBe(400);

    const forger = new Jar();
    const options = await (await request(forger, "/api/passkeys/signin/options", { json: {} })).json();
    const response = real.get(options, origin);
    const forged = { ...response, response: { ...response.response, signature: Buffer.from("not a signature").toString("base64url") } };
    expect((await request(forger, "/api/passkeys/signin/verify", { json: { response: forged } })).status).toBe(400);
    expect(forger.has("spots_session")).toBe(false);

    // A good answer only counts once: its challenge is used up.
    const again = new Jar();
    const first = await signInWith(again, real);
    expect(first.res.status).toBe(200);
    const replay = await request(new Jar(), "/api/passkeys/signin/verify", { json: { response: first.response } });
    expect(replay.status).toBe(400);
  });

  it("only lets someone already in a group make an account", async () => {
    const res = await request(new Jar(), "/api/passkeys/register/options", { json: {} });
    expect(res.status).toBe(401);
  });

  it("joins a signed-in person to a new group as themselves", async () => {
    const jar = new Jar();
    const first = await startGroup(jar, "First crew", "Ana");
    await savePasskey(jar, new Authenticator(), first);
    const host = new Jar();
    const second = await startGroup(host, "Second crew", "Ben");
    const form = (await page(jar, `/g/${second}`)).querySelector<HTMLInputElement>('form input[name="name"]');
    expect(form?.value).toBe("Ana");
    await join(jar, second, second, "Ana");
    const mine = (await page(jar, "/me")).body.textContent ?? "";
    expect(mine).toContain("First crew");
    expect(mine).toContain("Second crew");
  });
});

function stranger() {
  // A passkey made for this site by a device Spots has never been shown.
  const other = new Authenticator();
  other.create({ challenge: "x", rp: { id: new URL(baseUrl).hostname }, user: { id: "eA" } }, origin);
  return other;
}

describe("the owner's tools", () => {
  async function crew() {
    const owner = new Jar();
    const id = await startGroup(owner, "Tools crew", "Ana");
    const ben = new Jar();
    await join(ben, id, id, "Ben");
    const benAgain = new Jar(); // Ben on his phone, before passkeys
    await join(benAgain, id, id, "Ben");
    const people = async () =>
      [...(await page(owner, `/g/${id}`)).querySelectorAll("#settings .people li")].map((li) => ({
        name: li.querySelector(".people__name")?.firstChild?.textContent?.trim(),
        id: li.querySelector<HTMLInputElement>('input[name="member"]')?.value,
      }));
    const act = (jar: Jar, form: Record<string, string>) => request(jar, `/api/groups/${id}/owner`, { form });
    return { owner, ben, benAgain, id, people, act };
  }

  it("shows the settings only to the owner, and ignores anyone else using them", async () => {
    const { ben, id, act } = await crew();
    expect((await page(ben, `/g/${id}`)).querySelector("#settings")).toBeNull();
    await act(ben, { action: "rename", name: "Ben's crew now" });
    expect((await page(ben, `/g/${id}`)).querySelector("h1")?.textContent).toBe("Tools crew");
  });

  it("renames the group", async () => {
    const { owner, id, act } = await crew();
    await act(owner, { action: "rename", name: "Friday crew" });
    expect((await page(new Jar(), `/g/${id}`)).querySelector("h1")?.textContent).toBe("Friday crew");
  });

  it("merges a duplicate into the person they are, keeping their keens", async () => {
    const { owner, benAgain, id, people, act } = await crew();
    await request(owner, `/api/groups/${id}/picks`, { form: { key: "questacon" } });
    const pick = (await page(benAgain, `/g/${id}`)).querySelector<HTMLInputElement>('#list input[name="pick"]')?.value ?? "";
    await request(benAgain, `/api/groups/${id}/keen`, { form: { pick } });

    const [, ben, dupe] = await people();
    await act(owner, { action: "merge", member: dupe.id!, into: ben.id! });

    const names = (await people()).map((p) => p.name);
    expect(names).toEqual(["Ana", "Ben"]);
    // The phone that was the duplicate is now Ben, and his keen came with him.
    expect(await you(benAgain, id)).toContain("You're in as Ben");
    expect((await page(owner, `/g/${id}`)).querySelector("#list .keen-who")?.textContent).toBe("Keen: Ben");
  });

  it("removes someone: they can't act any more, and their keens go", async () => {
    const { owner, ben, id, people, act } = await crew();
    await request(owner, `/api/groups/${id}/picks`, { form: { key: "arboretum" } });
    const pick = (await page(ben, `/g/${id}`)).querySelector<HTMLInputElement>('#list input[name="pick"]')?.value ?? "";
    await request(ben, `/api/groups/${id}/keen`, { form: { pick } });

    const [ana, benMember] = await people();
    await act(owner, { action: "remove", member: benMember.id! });
    expect(await you(ben, id)).toBe("");
    expect((await page(owner, `/g/${id}`)).querySelector("#list .keen-who")?.textContent).toBe("No one's keen yet");

    // The owner can't be removed.
    await act(owner, { action: "remove", member: ana.id ?? "" });
    expect(await you(owner, id)).toContain("You're in as Ana");
  });

  it("resets the invite link: members follow it, nobody new gets in with the old one", async () => {
    const { owner, ben, id, act } = await crew();
    const res = await act(owner, { action: "reset" });
    const fresh = (res.headers.get("location") ?? "").split("?")[0].replace("/g/", "");
    expect(fresh).not.toBe(id);

    const old = await request(ben, `/g/${id}`);
    expect(old.status).toBe(303);
    expect(old.headers.get("location")).toBe(`/g/${fresh}`);

    const stranger = new Jar();
    expect((await page(stranger, `/g/${id}`)).querySelector("h1")?.textContent).toBe("This link has been reset");
    await join(stranger, id, id, "Eve");
    expect(await you(stranger, fresh)).toBe("");

    await join(stranger, id, fresh, "Cat");
    expect(await you(stranger, fresh)).toContain("You're in as Cat");
  });
});
