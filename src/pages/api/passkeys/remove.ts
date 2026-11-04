import type { APIRoute } from "astro";
import { removePasskey } from "../../../lib/accounts";
import { clean, signedIn } from "../../../lib/me";
import * as log from "../../../lib/log";

// Forget one of your passkeys (a lost phone, a password manager you left).
// Never the last: the account page doesn't offer it, and this refuses it.
export const POST: APIRoute = async ({ cookies, request, redirect }) => {
  const account = signedIn(cookies);
  if (!account) return redirect("/signin", 303);
  const removed = removePasskey(account.id, clean((await request.formData()).get("id"), 512));
  if (removed) log.act("passkey-remove", { by: log.account(account) });
  return redirect(`/me?${removed ? "done=removed" : "error=last"}#keys`, 303);
};
