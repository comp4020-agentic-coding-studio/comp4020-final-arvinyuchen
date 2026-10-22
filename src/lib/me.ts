import type { AstroCookies } from "astro";
import { type Account, accountForSession, endSession, SESSION_DAYS, startSession } from "./accounts";
import { type Member, memberOfAccount } from "./db";

// Who counts as a person in Spots: a signed-in account, and nothing else.
// Everyone in a group is an account, made with a name and a passkey, so
// nobody can act as someone else by typing their name, and the same person
// is themselves on every device. The account's member in a group is who
// they are there.
const SESSION = "spots_session";

export const signedIn = (cookies: AstroCookies): Account | undefined =>
  accountForSession(cookies.get(SESSION)?.value);

/** The member this browser's account is in a group, if it's in it. */
export function me(cookies: AstroCookies, groupId: string): Member | undefined {
  const account = signedIn(cookies);
  return account && memberOfAccount(groupId, account.id);
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

/** A page on this site to go to next, from a form or query: never somewhere else. */
export const nextPath = (value: string | null | undefined, fallback = "/me") =>
  value && /^\/(?![/\\])/.test(value) ? value : fallback;
