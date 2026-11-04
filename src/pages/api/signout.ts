import type { APIRoute } from "astro";
import { signedIn, signOut } from "../../lib/me";
import * as log from "../../lib/log";

export const POST: APIRoute = ({ cookies, redirect }) => {
  const account = signedIn(cookies);
  if (account) log.act("sign-out", { by: log.account(account) });
  signOut(cookies);
  return redirect("/", 303);
};
