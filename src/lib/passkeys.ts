import { randomBytes } from "node:crypto";
import type { AstroCookies } from "astro";

// The bits of a passkey ceremony that live between its two requests. The
// browser asks for options, the device signs the challenge, the browser
// posts the result back; the challenge has to be the one this browser was
// given, and only once. Kept in memory (the app is one process on one
// machine, fly.toml), keyed by a short-lived cookie; a restart mid-ceremony
// just means trying again.

export type Ceremony =
  | {
      kind: "register";
      challenge: string;
      /** The account to add a passkey to, or the new one to create. */
      accountId: number | null;
      handle: string;
      name: string;
      /** The member (and group) that becomes the new account's. */
      memberId: number | null;
      groupId: string | null;
    }
  | { kind: "signin"; challenge: string };

const TTL_MS = 5 * 60 * 1000;
const COOKIE = "spots_ceremony";
const pending = new Map<string, { ceremony: Ceremony; expires: number }>();

export function begin(cookies: AstroCookies, ceremony: Ceremony): void {
  const now = Date.now();
  for (const [id, entry] of pending) if (entry.expires < now) pending.delete(id);
  const id = randomBytes(18).toString("base64url");
  pending.set(id, { ceremony, expires: now + TTL_MS });
  cookies.set(COOKIE, id, { path: "/api/passkeys", httpOnly: true, sameSite: "strict", maxAge: TTL_MS / 1000 });
}

/** The ceremony this browser started, used up: a challenge answers once. */
export function finish(cookies: AstroCookies): Ceremony | undefined {
  const id = cookies.get(COOKIE)?.value;
  cookies.delete(COOKIE, { path: "/api/passkeys" });
  const entry = id ? pending.get(id) : undefined;
  if (id) pending.delete(id);
  return entry && entry.expires > Date.now() ? entry.ceremony : undefined;
}

/**
 * Who we are, to a passkey: the site's own host. Taken from the request,
 * so it's the fly.dev name in production and localhost in development
 * (astro.config.ts trusts Fly's forwarded host and protocol).
 */
export const relyingParty = (url: URL) => ({ rpName: "Spots", rpID: url.hostname, origin: url.origin });
