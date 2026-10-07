import type { APIRoute } from "astro";
import { claimAdmin } from "../../../lib/admin";
import { clean, signedIn } from "../../../lib/me";

// Becoming admin, once: signed in with a passkey, and knowing ADMIN_CODE.
export const POST: APIRoute = async ({ cookies, request, redirect }) => {
  const account = signedIn(cookies);
  if (!account) return redirect("/signin", 303);
  const result = claimAdmin(account.id, clean((await request.formData()).get("code"), 200));
  return redirect(`/admin?claim=${result}`, 303);
};
