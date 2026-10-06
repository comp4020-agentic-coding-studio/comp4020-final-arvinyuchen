import type { AstroCookies } from "astro";
import { type Member, memberFor } from "./db";

// Who counts as a person in Spots: whoever joined a group by name from this
// browser. No accounts; a per-group cookie holds the member id and a secret
// only the server and that browser know, so nobody can act as someone else by
// typing their name.
const cookieName = (groupId: string) => `spots_${groupId}`;

export const me = (cookies: AstroCookies, groupId: string): Member | undefined =>
  memberFor(groupId, cookies.get(cookieName(groupId))?.value);

export function remember(cookies: AstroCookies, groupId: string, memberId: number, secret: string): void {
  cookies.set(cookieName(groupId), `${memberId}.${secret}`, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export const clean = (value: FormDataEntryValue | null, max: number) => String(value ?? "").trim().slice(0, max);
