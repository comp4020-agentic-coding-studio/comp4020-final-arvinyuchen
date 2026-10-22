import type { APIRoute } from "astro";
import { createGroup } from "../../lib/db";
import { clean, signedIn } from "../../lib/me";

// Start a group: just its name. Whoever starts it is signed in (the home
// page's form makes the account first when they aren't), so they're its
// first member and owner under their account's name, and the page they
// land on has the link to share with everyone else.
export const POST: APIRoute = async ({ cookies, request, redirect }) => {
  const account = signedIn(cookies);
  if (!account) return redirect("/?error=account#start", 303);
  const groupName = clean((await request.formData()).get("group"), 60);
  if (!groupName) return redirect("/?error=missing#start", 303);
  const { group } = createGroup(groupName, account);
  return redirect(`/g/${group.link}?new=1`, 303);
};
