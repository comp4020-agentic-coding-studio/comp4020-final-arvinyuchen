import type { APIRoute } from "astro";
import { cleanEmail, renameAccount, setEmail } from "../../lib/accounts";
import { changed } from "../../lib/events";
import { clean, signedIn } from "../../lib/me";

// Your name or your email, from the account page. One account has one
// name, so it changes in every group you're in, live on your friends'
// pages too. The email changes nothing anyone sees: it's only where a
// lost-passkey link goes (src/pages/api/recover.ts).
export const POST: APIRoute = async ({ cookies, request, redirect }) => {
  const account = signedIn(cookies);
  if (!account) return redirect("/signin", 303);
  const form = await request.formData();
  if (form.has("email")) {
    const email = cleanEmail(form.get("email"));
    if (!email) return redirect("/me?error=email#you", 303);
    setEmail(account.id, email);
    return redirect("/me?done=email#you", 303);
  }
  const name = clean(form.get("name"), 40);
  if (!name) return redirect("/me?error=name#you", 303);
  if (name !== account.name) for (const groupId of renameAccount(account.id, name)) changed(groupId);
  return redirect("/me?done=renamed#you", 303);
};
