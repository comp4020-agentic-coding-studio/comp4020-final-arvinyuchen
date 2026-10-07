import { describe, expect, it } from "vitest";
import { Authenticator, Jar } from "./authenticator";
import { page, request, savePasskey, startGroup, you } from "./browser";

// Site admin: archive and restore groups, delete archived ones for good,
// hide shared places. The app under test needs ADMIN_CODE, and the spec the
// same value (CI sets both); without it these step aside.
const code = process.env.ADMIN_CODE;

/** A browser signed in with a passkey, not (yet) an admin. */
async function account(name = "Ada") {
  const jar = new Jar();
  const id = await startGroup(jar, `${name}'s own crew`, name);
  await savePasskey(jar, new Authenticator(), id);
  return jar;
}
async function admin() {
  const jar = await account();
  await request(jar, "/api/admin/claim", { form: { code: code! } });
  return jar;
}
const groupsAct = (jar: Jar, action: string, ids: string[]) =>
  request(jar, "/api/admin/groups", { form: Object.fromEntries([["action", action], ...ids.map((id) => ["group", id])]) });
const explore = async (jar: Jar, link: string) =>
  [...(await page(jar, `/g/${link}`)).querySelectorAll("#explore .spots--explore > li h3")].map((h) => h.textContent?.trim());

describe("site admin", () => {
  it("sends someone signed out to sign in, and ignores admin actions from anyone else", async () => {
    expect((await request(new Jar(), "/admin")).headers.get("location")).toBe("/signin");
    const owner = new Jar();
    const id = await startGroup(owner, "Not yours", "Bo");
    const nobody = await account("Cy");
    await groupsAct(nobody, "archive", [id]);
    expect(await you(owner, id)).toContain("You're in as Bo");
  });

  it.skipIf(!code)("makes an account admin only with the right code", async () => {
    const jar = await account();
    await request(jar, "/api/admin/claim", { form: { code: "not the code" } });
    expect((await page(jar, "/admin")).querySelector("#groups")).toBeNull();
    await request(jar, "/api/admin/claim", { form: { code: code! } });
    expect((await page(jar, "/admin")).querySelector("#groups")).toBeTruthy();
  });

  it.skipIf(!code)("archives a group, restores it, and deletes it for good only once archived", async () => {
    const boss = await admin();
    const owner = new Jar();
    const id = await startGroup(owner, "Test crew 1", "Bo");
    await request(owner, `/api/groups/${id}/picks`, { form: { key: "nma" } });

    await groupsAct(boss, "purge", [id]);
    expect(await you(owner, id)).toContain("You're in as Bo");

    await groupsAct(boss, "archive", [id]);
    expect((await page(owner, `/g/${id}`)).querySelector("h1")?.textContent).toBe("This group has been closed");
    const vote = await request(owner, `/api/groups/${id}/picks`, { form: { key: "awm" } });
    expect(vote.headers.get("location")).toBe("/");

    await groupsAct(boss, "restore", [id]);
    expect(await you(owner, id)).toContain("You're in as Bo");

    await groupsAct(boss, "archive", [id]);
    await groupsAct(boss, "purge", [id]);
    expect((await request(owner, `/g/${id}`)).headers.get("location")).toBe("/");
    expect((await page(boss, "/admin")).body.textContent).not.toContain("Test crew 1");
  });

  it.skipIf(!code)("hides a shared place from every group's Explore, but never a starter place", async () => {
    const boss = await admin();
    const sharer = new Jar();
    const ours = await startGroup(sharer, "Sharing crew", "Di");
    const name = `Admin test place ${Date.now()}`;
    await request(sharer, `/api/groups/${ours}/places`, { form: { name, kind: "food", why: "testing the admin page" } });
    const viewer = new Jar();
    const theirs = await startGroup(viewer, "Looking crew", "Ed");
    expect(await explore(viewer, theirs)).toContain(name);

    const row = [...(await page(boss, "/admin")).querySelectorAll("#places tbody tr")].find((tr) => tr.textContent?.includes(name));
    const placeId = row?.querySelector<HTMLInputElement>('input[name="place"]')?.value ?? "";
    await request(boss, "/api/admin/places", { form: { action: "hide", place: placeId } });
    expect(await explore(viewer, theirs)).not.toContain(name);

    await request(boss, "/api/admin/places", { form: { action: "unhide", place: placeId } });
    expect(await explore(viewer, theirs)).toContain(name);

    const pins = JSON.parse((await page(viewer, `/g/${theirs}`)).querySelector("#pins")?.textContent ?? "[]") as { id: number; name: string }[];
    const questacon = pins.find((p) => p.name === "Questacon")!;
    await request(boss, "/api/admin/places", { form: { action: "hide", place: String(questacon.id) } });
    expect(await explore(viewer, theirs)).toContain("Questacon");
  });
});
