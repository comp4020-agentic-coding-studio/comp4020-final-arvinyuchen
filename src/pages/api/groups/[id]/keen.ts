import type { APIRoute } from "astro";
import { getGroup, toggleKeen } from "../../../../lib/db";
import { changed } from "../../../../lib/events";
import { me } from "../../../../lib/me";

// "I'm keen" on a spot, or not any more. One vote per person per spot.
export const POST: APIRoute = async ({ params, cookies, request, redirect }) => {
  const group = getGroup(params.id ?? "");
  if (!group) return redirect("/", 303);
  const member = me(cookies, group.id);
  if (!member) return redirect(`/g/${group.id}`, 303);
  const pickId = Number((await request.formData()).get("pick"));
  if (toggleKeen(pickId, member, group.id)) changed(group.id);
  return redirect(`/g/${group.id}#pick-${pickId}`, 303);
};
