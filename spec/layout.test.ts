import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Jar } from "./authenticator";
import { baseUrl, join, request, signUp, startGroup } from "./browser";

// The layout, in the installed Chrome (CHROME_PATH to pick another), at a
// computer's size and a phone's. On a computer the group is one screen:
// Our list, Explore and the map side by side, the page itself never
// scrolling (each column does on its own). On a phone nothing scrolls
// sideways, and each tab shows its own part of the group and nothing
// else. And the things people do most take a tap or two: one to join when
// signed in, one for a keen, two for the invite (open it, copy it). (Signed in with the spec's sessions, as
// in two-windows.test.ts.)

const COMPUTER = { width: 1280, height: 800 };
const PHONE = { width: 375, height: 812 };

let browser: Browser;

async function open(jar: Jar | null, path: string, viewport: { width: number; height: number }): Promise<Page> {
  const context = await browser.newContext({ viewport });
  if (jar)
    await context.addCookies(
      jar.header.split("; ").map((pair) => {
        const [name, ...value] = pair.split("=");
        return { name, value: value.join("="), url: baseUrl };
      }),
    );
  const tab = await context.newPage();
  await tab.goto(new URL(path, baseUrl).href);
  await tab.waitForLoadState("load");
  return tab;
}

/** How far the page reaches past the window's right edge, in pixels. */
const sideways = (tab: Page) => tab.evaluate(() => document.documentElement.scrollWidth - innerWidth);

/** A group with two places on the list, Ana its owner and Ben in it. */
async function crew(name: string) {
  const ana = new Jar();
  const id = await startGroup(ana, name, "Ana");
  const ben = new Jar();
  await join(ben, id, id, "Ben");
  for (const key of ["questacon", "nga"]) await request(ana, `/api/groups/${id}/picks`, { form: { key } });
  return { ana, ben, id };
}

beforeAll(async () => {
  browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" });
}, 30_000);
afterAll(async () => {
  await browser?.close();
}, 30_000);

describe("the layout", () => {
  it("puts Our list, Explore and the map on one screen on a computer, and the page never scrolls", async () => {
    const { ana, id } = await crew("Layout desk crew");
    const tab = await open(ana, `/g/${id}`, COMPUTER);
    const boxes = await tab.evaluate(() =>
      [".group-side", "#explore", ".map-wrap"].map((selector) => {
        const box = document.querySelector(selector)!.getBoundingClientRect();
        return { selector, left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      }),
    );
    // each on screen, side by side, left to right, none over another (the
    // left one is the group's panel, its tabs, the plan and Our list; the
    // middle Explore's cards)
    for (const box of boxes) {
      expect(box.right - box.left, box.selector).toBeGreaterThan(200);
      expect(box.top, box.selector).toBeLessThan(COMPUTER.height / 2);
      expect(box.bottom, box.selector).toBeGreaterThan(COMPUTER.height / 2);
    }
    expect(boxes[0].right).toBeLessThanOrEqual(boxes[1].left + 1);
    expect(boxes[1].right).toBeLessThanOrEqual(boxes[2].left + 1);
    expect(boxes[2].right).toBeLessThanOrEqual(COMPUTER.width + 1);
    // the page itself doesn't scroll, either way
    await tab.mouse.move(COMPUTER.width / 2, 40);
    await tab.mouse.wheel(0, 2000);
    expect(await tab.evaluate(() => [scrollY, document.documentElement.scrollHeight - innerHeight])).toEqual([0, 0]);
    expect(await sideways(tab)).toBeLessThanOrEqual(0);
    await tab.context().close();
  }, 30_000);

  it("never scrolls sideways on a phone, and each tab shows only its own part", async () => {
    const { ana, id } = await crew("Layout phone crew");
    const pages: [string, Jar | null, string][] = [
      ["home", null, "/"],
      ["sign in", null, "/signin"],
      ["invite preview", null, `/g/${id}`],
      ["my groups", ana, "/me"],
    ];
    const wide: string[] = [];
    for (const [name, jar, path] of pages) {
      const tab = await open(jar, path, PHONE);
      if ((await sideways(tab)) > 0) wide.push(name);
      await tab.context().close();
    }
    const group = await open(ana, `/g/${id}`, PHONE);
    for (const which of ["list", "explore", "add", "settings"]) {
      await group.click(`.tabs a[data-tab="${which}"]`);
      const shown = await group.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("[data-panel]")].filter((p) => !p.hidden).map((p) => p.dataset.panel),
      );
      expect(new Set(shown), which).toEqual(new Set([which]));
      if ((await sideways(group)) > 0) wide.push(`group page, ${which}`);
    }
    expect(wide).toEqual([]);
    await group.context().close();
  }, 60_000);

  it("takes one tap to join when signed in, one to be keen, and two to copy the invite", async () => {
    const { ana, id } = await crew("Layout taps crew");
    const taps: Record<string, number> = {};

    // Cleo, signed in, opens the invite on her phone: one tap and she's in.
    const cleo = new Jar();
    await signUp(cleo, "Cleo");
    const phone = await open(cleo, `/g/${id}`, PHONE);
    await Promise.all([phone.waitForURL((url) => url.pathname === `/g/${id}`, { waitUntil: "load" }), phone.click(".welcome__join")]);
    taps.join = 1;
    await phone.waitForSelector("#list .keen");
    expect(await phone.locator(".tabs").count()).toBe(1);

    // One tap on keen, and the count says so. (A moment after the page
    // opens, as in two-windows.test.ts: a keen tapped while the list is
    // still settling is ignored, since the row under it may have moved.)
    await phone.waitForTimeout(1500);
    await phone.evaluate(() => document.querySelector<HTMLButtonElement>("#list .keen")!.click());
    taps.keen = 1;
    await phone.waitForFunction(() => document.querySelector("#list .keen__count")?.textContent === "1");

    // On a computer, Invite friends opens the invite (it's open already in a
    // group of one) and one more tap copies its link.
    const desk = await open(ana, `/g/${id}`, COMPUTER);
    await desk.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(baseUrl).origin });
    const link = await desk.getAttribute("[data-invite]", "data-invite");
    await desk.click(".invite__open");
    await desk.click("[data-invite]");
    taps.invite = 2;
    expect(await desk.evaluate(() => navigator.clipboard.readText())).toBe(link);

    console.log(`taps: join ${taps.join}, keen ${taps.keen}, invite ${taps.invite}`);
    expect(taps).toEqual({ join: 1, keen: 1, invite: 2 });
    await phone.context().close();
    await desk.context().close();
  }, 60_000);
});
