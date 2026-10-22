import { JSDOM } from "jsdom";
import sharp from "sharp";
import { inject } from "vitest";
import { Authenticator, Jar } from "./authenticator";

// A browser for the spec: requests carry a Jar of cookies, forms post the
// way a page would, and the passkey steps run through an Authenticator.
export const baseUrl = inject("baseUrl");
export const origin = new URL(baseUrl).origin;

// (a form with a file in it posts as multipart, the way a page's would)
const body = (form: Record<string, string | Blob>) => {
  if (!Object.values(form).some((v) => v instanceof Blob)) return new URLSearchParams(form as Record<string, string>);
  const data = new FormData();
  for (const [key, value] of Object.entries(form)) data.append(key, value);
  return data;
};

export const request = async (jar: Jar, path: string, init: { form?: Record<string, string | Blob>; json?: unknown } = {}) =>
  jar.take(
    await fetch(new URL(path, baseUrl), {
      method: init.form || init.json !== undefined ? "POST" : "GET",
      headers: {
        origin,
        cookie: jar.header,
        ...(init.json !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.form ? body(init.form) : init.json !== undefined ? JSON.stringify(init.json) : undefined,
      redirect: "manual",
    }),
  );
/** A photo as a phone takes one: a JPEG that says where it was taken. */
export const photo = async () =>
  new Blob(
    [
      await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#4a7a3a" } })
        .withExif({ IFD3: { GPSLatitudeRef: "S", GPSLatitude: "35/1 16/1 52/1", GPSLongitudeRef: "E", GPSLongitude: "149/1 7/1 44/1" } })
        .jpeg()
        .toBuffer(),
    ],
    { type: "image/jpeg" },
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
