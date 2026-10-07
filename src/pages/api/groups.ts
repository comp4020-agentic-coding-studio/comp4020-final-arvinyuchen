import type { APIRoute } from "astro";
import { createGroup } from "../../lib/db";
import { clean, remember, signedIn } from "../../lib/me";

// Start a group: its name and yours. You're its first member and its owner,
// and the page you land on has the link to share with everyone else.
export const POST: APIRoute = async ({ cookies, request, redirect }) => {
  const form = await request.formData();
  const groupName = clean(form.get("group"), 60);
  const name = clean(form.get("name"), 40);
  if (!groupName || !name) return redirect("/?error=missing#start", 303);
  const { group, member, secret } = createGroup(groupName, name, signedIn(cookies)?.id ?? null);
  remember(cookies, group.id, member.id, secret);
  return redirect(`/g/${group.link}?new=1`, 303);
};
