import { JSDOM } from "jsdom";
import { inject } from "vitest";
import { Authenticator, Jar } from "./authenticator";

// A browser for the spec: requests carry a Jar of cookies, forms post the
// way a page would, and the passkey steps run through an Authenticator.
export const baseUrl = inject("baseUrl");
export const origin = new URL(baseUrl).origin;

export const request = async (jar: Jar, path: string, init: { form?: Record<string, string>; json?: unknown } = {}) =>
  jar.take(
    await fetch(new URL(path, baseUrl), {
      method: init.form || init.json !== undefined ? "POST" : "GET",
      headers: {
        origin,
        cookie: jar.header,
        ...(init.json !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.form ? new URLSearchParams(init.form) : init.json !== undefined ? JSON.stringify(init.json) : undefined,
      redirect: "manual",
    }),
  );
export const page = async (jar: Jar, path: string) =>
  new JSDOM(await (await request(jar, path)).text()).window.document;

/** Starts a group from this browser; returns its id (also its first link). */
export async function startGroup(jar: Jar, group: string, name: string): Promise<string> {
  const res = await request(jar, "/api/groups", { form: { group, name } });
  return (res.headers.get("location") ?? "").split("?")[0].replace("/g/", "");
}
export const join = (jar: Jar, id: string, link: string, name: string) =>
  request(jar, `/api/groups/${id}/join`, { form: { name, link } });

export async function savePasskey(jar: Jar, passkey: Authenticator, group?: string) {
  const options = await (await request(jar, "/api/passkeys/register/options", { json: { group } })).json();
  return request(jar, "/api/passkeys/register/verify", { json: passkey.create(options, origin) });
}
export async function signInWith(jar: Jar, passkey: Authenticator, group?: string) {
  const options = await (await request(jar, "/api/passkeys/signin/options", { json: {} })).json();
  const response = passkey.get(options, origin);
  return { res: await request(jar, "/api/passkeys/signin/verify", { json: { response, group } }), response };
}
export const you = async (jar: Jar, link: string) => (await page(jar, `/g/${link}`)).querySelector(".you")?.textContent ?? "";
