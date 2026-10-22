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

// Everyone in Spots is an account, so a browser that starts or joins a
// group signs up first: a name and a new passkey. Each browser's passkey is
// kept, so a test can sign in with it somewhere else.
const passkeys = new WeakMap<Jar, Authenticator>();
export const passkeyOf = (jar: Jar) => passkeys.get(jar)!;

/** Makes an account from this browser: a name and a passkey. */
export async function signUp(jar: Jar, name: string, passkey = new Authenticator()) {
  const options = await (await request(jar, "/api/passkeys/register/options", { json: { name } })).json();
  passkeys.set(jar, passkey);
  return request(jar, "/api/passkeys/register/verify", { json: passkey.create(options, origin) });
}
const ensureAccount = async (jar: Jar, name: string) => {
  if (!jar.has("spots_session")) await signUp(jar, name);
};

/** Starts a group from this browser (an account named `name`, made if need be); returns its id. */
export async function startGroup(jar: Jar, group: string, name: string): Promise<string> {
  await ensureAccount(jar, name);
  const res = await request(jar, "/api/groups", { form: { group } });
  return (res.headers.get("location") ?? "").split("?")[0].replace("/g/", "");
}
/** Joins by a link from this browser, as its account (made as `name` if need be). */
export async function join(jar: Jar, id: string, link: string, name: string) {
  await ensureAccount(jar, name);
  return request(jar, `/api/groups/${id}/join`, { form: { link } });
}

/** Adds another passkey to the signed-in account. */
export async function savePasskey(jar: Jar, passkey: Authenticator) {
  const options = await (await request(jar, "/api/passkeys/register/options", { json: {} })).json();
  return request(jar, "/api/passkeys/register/verify", { json: passkey.create(options, origin) });
}
export async function signInWith(jar: Jar, passkey: Authenticator) {
  const options = await (await request(jar, "/api/passkeys/signin/options", { json: {} })).json();
  const response = passkey.get(options, origin);
  return { res: await request(jar, "/api/passkeys/signin/verify", { json: { response } }), response };
}
export const you = async (jar: Jar, link: string) => (await page(jar, `/g/${link}`)).querySelector(".you")?.textContent ?? "";
