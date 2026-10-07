import type { AstroCookies } from "astro";
import { type Account, accountForSession, endSession, SESSION_DAYS, startSession } from "./accounts";
import { type Member, memberFor, memberOfAccount } from "./db";

// Who counts as a person in Spots. Joining a group by name from a browser
// sets a per-group cookie holding the member id and a secret only the server
// and that browser know, so nobody can act as someone else by typing their
// name. Someone who saved a passkey is also signed in: on any device, their
// account says which member they are in each of their groups.
const cookieName = (groupId: string) => `spots_${groupId}`;
const SESSION = "spots_session";
const YEAR = 60 * 60 * 24 * 365;

export const signedIn = (cookies: AstroCookies): Account | undefined =>
  accountForSession(cookies.get(SESSION)?.value);

/** The member this browser is in a group: by account first, then by cookie. */
export function me(cookies: AstroCookies, groupId: string): Member | undefined {
  const account = signedIn(cookies);
  return (account && memberOfAccount(groupId, account.id)) ?? memberFor(groupId, cookies.get(cookieName(groupId))?.value);
}

/** The member this browser's own cookie says it is, ignoring any account. */
export const cookieMember = (cookies: AstroCookies, groupId: string): Member | undefined =>
  memberFor(groupId, cookies.get(cookieName(groupId))?.value);

export function remember(cookies: AstroCookies, groupId: string, memberId: number, secret: string): void {
  cookies.set(cookieName(groupId), `${memberId}.${secret}`, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: YEAR,
  });
}

export function signIn(cookies: AstroCookies, accountId: number): void {
  cookies.set(SESSION, startSession(accountId), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  });
}

export function signOut(cookies: AstroCookies): void {
  endSession(cookies.get(SESSION)?.value);
  cookies.delete(SESSION, { path: "/" });
}

export const clean = (value: FormDataEntryValue | null, max: number) => String(value ?? "").trim().slice(0, max);
