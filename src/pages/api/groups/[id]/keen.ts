import type { APIRoute } from "astro";
import { getGroup, setKeen } from "../../../../lib/db";
import { changed } from "../../../../lib/events";
import { me } from "../../../../lib/me";

// "I'm keen" on a spot, or not any more. One vote per person per spot. The
// button sends the state it's asking for ("on" or "off"), so repeating it
// changes nothing. The page's script posts in the background (and gets a
// 204, so it stays where it is); a plain form post redirects back.
export const POST: APIRoute = async ({ params, cookies, request, redirect }) => {
  const group = getGroup(params.id ?? "");
  if (!group) return redirect("/", 303);
  const member = me(cookies, group.id);
  const inPage = request.headers.get("x-spots") === "in-page";
  if (!member) return inPage ? new Response(null, { status: 403 }) : redirect(`/g/${group.link}`, 303);
  const form = await request.formData();
  const pickId = Number(form.get("pick"));
  const keen = form.get("keen");
  if (setKeen(pickId, member, group.id, keen === "on" ? true : keen === "off" ? false : undefined)) changed(group.id);
  return inPage ? new Response(null, { status: 204 }) : redirect(`/g/${group.link}#pick-${pickId}`, 303);
};
