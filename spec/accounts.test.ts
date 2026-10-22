import { describe, expect, it } from "vitest";
import { Authenticator, Jar } from "./authenticator";
import {
  baseUrl,
  join,
  origin,
  page,
  passkeyOf,
  request,
  savePasskey,
  signInWith,
  signUp,
  startGroup,
  you,
} from "./browser";

// Accounts by passkey, and the owner's tools. Everyone is an account: a
// name and one or more passkeys, made without any group, and the only way
// to be someone in one. Each Jar is one browser; one Authenticator is one
// person's synced passkey.
describe("accounts by passkey", () => {
  it("makes an account from a name and a passkey, then signs in on another device with no username", async () => {
    const phone = new Jar();
    expect((await signUp(phone, "Ana")).status).toBe(200);
    expect(phone.has("spots_session")).toBe(true);
    expect((await page(phone, "/me")).querySelector("h1")?.textContent).toBe("Ana's groups");
    const id = await startGroup(phone, "Passkey crew", "Ana");

    // A laptop that has never seen the group: no cookie, no name typed.
    const laptop = new Jar();
    expect(await you(laptop, id)).toBe("");
    const { res } = await signInWith(laptop, passkeyOf(phone));
    expect(res.status).toBe(200);
    expect(await you(laptop, id)).toContain("You're in as Ana");
    expect((await page(laptop, "/me")).body.textContent).toContain("Passkey crew");
  });

  it("refuses a passkey it never stored, a forged signature, and a replayed one", async () => {
    const real = new Authenticator();
    await signUp(new Jar(), "Ana", real);

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

  it("won't make an account without a name", async () => {
    const res = await request(new Jar(), "/api/passkeys/register/options", { json: { name: "   " } });
    expect(res.status).toBe(400);
  });

  it("joins a signed-in person to a group as themselves, with one tap", async () => {
    const jar = new Jar();
    await startGroup(jar, "First crew", "Ana");
    const host = new Jar();
    const second = await startGroup(host, "Second crew", "Ben");
    const invite = await page(jar, `/g/${second}`);
    expect(invite.querySelector('form#join input[name="name"]')).toBeNull();
    expect(invite.querySelector("form#join")?.textContent).toContain("as Ana");
    await join(jar, second, second, "ignored");
    expect(await you(jar, second)).toContain("You're in as Ana");
    const mine = (await page(jar, "/me")).body.textContent ?? "";
    expect(mine).toContain("First crew");
    expect(mine).toContain("Second crew");
  });

  it("has one name: renaming the account renames it in every group", async () => {
    const ana = new Jar();
    const first = await startGroup(ana, "Rename crew", "Ana");
    const ben = new Jar();
    const second = await startGroup(ben, "Ben's crew", "Ben");
    await join(ana, second, second, "Ana");

    await request(ana, "/api/account", { form: { name: "Annie" } });
    expect(await you(ana, first)).toContain("You're in as Annie");
    expect((await page(ben, `/g/${second}`)).querySelector(".members")?.textContent).toContain("Annie");
    // An empty name changes nothing.
    await request(ana, "/api/account", { form: { name: " " } });
    expect(await you(ana, first)).toContain("You're in as Annie");
  });

  it("keeps several passkeys, removes one, and never the last", async () => {
    const phone = new Jar();
    const iphone = new Authenticator();
    await signUp(phone, "Ana", iphone);
    const windows = new Authenticator();
    expect((await savePasskey(phone, windows)).status).toBe(200);
    const keys = async () => (await page(phone, "/me")).querySelectorAll("#keys .keys li");
    expect(await keys()).toHaveLength(2);
    expect((await signInWith(new Jar(), windows)).res.status).toBe(200);

    const idOf = (passkey: Authenticator) => Buffer.from(passkey.credentials[0].id).toString("base64url");
    await request(phone, "/api/passkeys/remove", { form: { id: idOf(iphone) } });
    expect(await keys()).toHaveLength(1);
    expect((await signInWith(new Jar(), iphone)).res.status).toBe(400);

    const last = await request(phone, "/api/passkeys/remove", { form: { id: idOf(windows) } });
    expect(last.headers.get("location")).toContain("error=last");
    expect(await keys()).toHaveLength(1);
    expect((await page(phone, "/me")).querySelector('#keys form[action="/api/passkeys/remove"]')).toBeNull();
  });

  it("only removes the signed-in account's own passkeys", async () => {
    const ana = new Authenticator();
    await signUp(new Jar(), "Ana", ana);
    const eve = new Jar();
    await signUp(eve, "Eve");
    await savePasskey(eve, new Authenticator());
    await request(eve, "/api/passkeys/remove", { form: { id: Buffer.from(ana.credentials[0].id).toString("base64url") } });
    expect((await signInWith(new Jar(), ana)).res.status).toBe(200);
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
    const benAgain = new Jar(); // Ben, after losing every passkey: a new account
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

  it("writes a note for the people they invite, on one line, that only they can change", async () => {
    const { owner, ben, id, act } = await crew();
    const invitee = async () => (await page(new Jar(), `/g/${id}`)).querySelector(".welcome__note");
    expect(await invitee()).toBeNull(); // no note, no bubble

    await act(owner, { action: "note", note: "  Where are we going Friday?\n\nAdd yours by Wednesday.  " });
    let note = await invitee();
    expect(note?.querySelector("blockquote")?.textContent).toBe("Where are we going Friday? Add yours by Wednesday.");
    expect(note?.querySelector("figcaption")?.textContent).toContain("Ana");
    // Members see the same words under the group's name.
    expect((await page(ben, `/g/${id}`)).querySelector(".group-note")?.textContent).toContain("Add yours by Wednesday.");

    await act(ben, { action: "note", note: "Ben was here" });
    expect((await invitee())?.querySelector("blockquote")?.textContent).not.toContain("Ben was here");

    await act(owner, { action: "note", note: "x".repeat(500) });
    expect((await invitee())?.querySelector("blockquote")?.textContent).toHaveLength(140);

    await act(owner, { action: "note", note: "   " });
    expect(await invitee()).toBeNull();
  });

  it("gives someone who lost every passkey their old self back, by merging it into their new account", async () => {
    const { owner, ben, benAgain, id, people, act } = await crew();
    await request(owner, `/api/groups/${id}/picks`, { form: { key: "questacon" } });
    const pick = (await page(ben, `/g/${id}`)).querySelector<HTMLInputElement>('#list input[name="pick"]')?.value ?? "";
    await request(ben, `/api/groups/${id}/keen`, { form: { pick } });

    const [, old, fresh] = await people();
    await act(owner, { action: "merge", member: old.id!, into: fresh.id! });

    const names = (await people()).map((p) => p.name);
    expect(names).toEqual(["Ana", "Ben"]);
    // The new account is Ben now, his old keen came with him, and the old
    // account (whoever has its passkey) is out of the group.
    expect(await you(benAgain, id)).toContain("You're in as Ben");
    expect((await page(owner, `/g/${id}`)).querySelector("#list .keen-who__names")?.textContent).toBe("Ben");
    expect(await you(ben, id)).toBe("");
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
    await join(stranger, id, id, "Cat");
    expect(await you(stranger, fresh)).toBe("");

    await join(stranger, id, fresh, "Cat");
    expect(await you(stranger, fresh)).toContain("You're in as Cat");
  });
});
