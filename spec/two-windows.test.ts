import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Jar } from "./authenticator";
import { baseUrl, join, page, request, startGroup } from "./browser";

// Live, as the marker sees it: the installed Chrome (CHROME_PATH to pick
// another), two contexts that share no cookies, as two Chrome profiles do,
// one at a phone's width and one at a desktop's, both on the group's page.
// A keen tapped in one shows in the other within a second, with no reload:
// the stream, the page's script reading itself again and the list redrawn.
// Each is signed in with its account's session from the spec (a passkey
// made in Chrome would need its own authenticator; signing in is tested in
// accounts.test.ts).

let browser: Browser;

async function open(jar: Jar, path: string, viewport: { width: number; height: number }): Promise<Page> {
  const context = await browser.newContext({ viewport });
  await context.addCookies(
    jar.header.split("; ").map((pair) => {
      const [name, ...value] = pair.split("=");
      return { name, value: value.join("="), url: baseUrl };
    }),
  );
  const tab = await context.newPage();
  // (listening once its stream has answered)
  const streaming = tab.waitForResponse((res) => res.url().includes("/api/events"));
  await tab.goto(new URL(path, baseUrl).href);
  await streaming;
  await tab.evaluate(() => ((window as unknown as { notReloaded: boolean }).notReloaded = true));
  return tab;
}

// (a page someone has had open a moment: loaded, and a second and a half
// for its map to draw, so the tap isn't timed against the page starting up)
async function settled(tab: Page) {
  await tab.waitForLoadState("load");
  await tab.waitForTimeout(1500);
}

const shows = (tab: Page, n: string) =>
  tab.waitForFunction((n) => document.querySelector("#list .keen__count")?.textContent === n, n, { timeout: 1000, polling: "raf" });

beforeAll(async () => {
  browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" });
}, 30_000);
afterAll(async () => {
  await browser?.close();
}, 30_000);

describe("two windows on one group", () => {
  it("shows a keen tapped in one in the other within a second, without a reload", async () => {
    const ana = new Jar();
    const id = await startGroup(ana, "Two windows crew", "Ana");
    const ben = new Jar();
    await join(ben, id, id, "Ben");
    await request(ana, `/api/groups/${id}/picks`, { form: { key: "questacon" } });
    expect((await page(ben, `/g/${id}`)).querySelector("#list .keen__count")?.textContent).toBe("0");

    const desk = await open(ana, `/g/${id}`, { width: 1280, height: 800 });
    const phone = await open(ben, `/g/${id}`, { width: 375, height: 812 });
    await Promise.all([settled(desk), settled(phone)]);

    // Ana taps keen on her desktop; Ben's phone shows it.
    let tapped = Date.now();
    await desk.click("#list .keen");
    await shows(phone, "1");
    const toPhone = Date.now() - tapped;

    // Ben taps it on his phone (its list behind its tab, so pressed as a tap would); Ana's desktop shows it.
    tapped = Date.now();
    await phone.evaluate(() => document.querySelector<HTMLButtonElement>("#list .keen")!.click());
    await shows(desk, "2");
    const toDesk = Date.now() - tapped;

    console.log(`two windows: desktop to phone ${toPhone} ms, phone to desktop ${toDesk} ms`);
    for (const tab of [desk, phone]) expect(await tab.evaluate(() => (window as unknown as { notReloaded?: boolean }).notReloaded)).toBe(true);
  }, 30_000);
});
