import type { APIRoute } from "astro";
import { getGroup, joinGroup } from "../../../../lib/db";
import { changed } from "../../../../lib/events";
import { clean, me, remember, signedIn } from "../../../../lib/me";

// Joining needs the group's current invite link: once the owner resets it,
// the old link lets nobody new in. Someone signed in joins as their account.
export const POST: APIRoute = async ({ params, cookies, request, redirect }) => {
  const group = getGroup(params.id ?? "");
  if (!group) return redirect("/", 303);
  const form = await request.formData();
  if (clean(form.get("link"), 20) !== group.link) return redirect(`/g/${clean(form.get("link"), 20)}`, 303);
  if (me(cookies, group.id)) return redirect(`/g/${group.link}`, 303);
  const name = clean(form.get("name"), 40);
  if (!name) return redirect(`/g/${group.link}?error=name`, 303);
  const { member, secret } = joinGroup(group.id, name, signedIn(cookies)?.id ?? null);
  remember(cookies, group.id, member.id, secret);
  changed(group.id);
  return redirect(`/g/${group.link}`, 303);
};
