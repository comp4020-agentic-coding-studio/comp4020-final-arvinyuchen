import type { APIRoute } from "astro";
import { renameAccount } from "../../lib/accounts";
import { changed } from "../../lib/events";
import { clean, signedIn } from "../../lib/me";

// Your name, from the account page. One account has one name, so it changes
// in every group you're in, live on your friends' pages too.
export const POST: APIRoute = async ({ cookies, request, redirect }) => {
  const account = signedIn(cookies);
  if (!account) return redirect("/signin", 303);
  const name = clean((await request.formData()).get("name"), 40);
  if (!name) return redirect("/me?error=name#you", 303);
  if (name !== account.name) for (const groupId of renameAccount(account.id, name)) changed(groupId);
  return redirect("/me?done=renamed#you", 303);
};
