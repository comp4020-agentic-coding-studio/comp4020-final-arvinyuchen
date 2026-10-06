import type { APIRoute } from "astro";
import { getGroup, joinGroup } from "../../../../lib/db";
import { changed } from "../../../../lib/events";
import { clean, remember } from "../../../../lib/me";

export const POST: APIRoute = async ({ params, cookies, request, redirect }) => {
  const group = getGroup(params.id ?? "");
  if (!group) return redirect("/", 303);
  const name = clean((await request.formData()).get("name"), 40);
  if (!name) return redirect(`/g/${group.id}?error=name`, 303);
  const { member, secret } = joinGroup(group.id, name);
  remember(cookies, group.id, member.id, secret);
  changed(group.id);
  return redirect(`/g/${group.id}`, 303);
};
