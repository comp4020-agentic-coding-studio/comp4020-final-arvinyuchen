import type { APIRoute } from "astro";
import { getGroup, seeJoins } from "../../../../lib/db";
import { me } from "../../../../lib/me";

// Closes the note saying who joined since you last looked (#120): for the
// signed-in member only, and only their own. 204 in the page, otherwise back.
export const POST: APIRoute = async ({ params, cookies, request, redirect }) => {
  const group = getGroup(params.id ?? "");
  if (!group) return redirect("/", 303);
  const member = me(cookies, group.id);
  if (member) seeJoins(group.id, member.id);
  if (request.headers.get("x-spots") === "in-page") return new Response(null, { status: member ? 204 : 403 });
  return redirect(`/g/${group.link}`, 303);
};
