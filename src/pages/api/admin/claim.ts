import type { APIRoute } from "astro";
import { claimAdmin } from "../../../lib/admin";
import { clean, signedIn } from "../../../lib/me";
import * as log from "../../../lib/log";

// Becoming admin, once: signed in with a passkey, and knowing ADMIN_CODE.
export const POST: APIRoute = async ({ cookies, request, redirect }) => {
  const account = signedIn(cookies);
  if (!account) return redirect("/signin", 303);
  const result = claimAdmin(account.id, clean((await request.formData()).get("code"), 200));
  log.act("admin-claim", { by: log.account(account), result });
  return redirect(`/admin?claim=${result}`, 303);
};
