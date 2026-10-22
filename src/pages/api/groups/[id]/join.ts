import type { APIRoute } from "astro";
import { getGroup, joinGroup } from "../../../../lib/db";
import { changed } from "../../../../lib/events";
import { clean, me, signedIn } from "../../../../lib/me";

// Joining needs the group's current invite link (once the owner resets it,
// the old link lets nobody new in) and an account: you join as yourself,
// under your account's name.
export const POST: APIRoute = async ({ params, cookies, request, redirect }) => {
  const group = getGroup(params.id ?? "");
  if (!group) return redirect("/", 303);
  const form = await request.formData();
  if (clean(form.get("link"), 20) !== group.link) return redirect(`/g/${clean(form.get("link"), 20)}`, 303);
  const account = signedIn(cookies);
  if (!account) return redirect(`/g/${group.link}?error=account#join`, 303);
  if (me(cookies, group.id)) return redirect(`/g/${group.link}`, 303);
  joinGroup(group.id, account);
  changed(group.id);
  return redirect(`/g/${group.link}`, 303);
};
