import type { APIRoute } from "astro";
import { addPick, getGroup, placeIdForSeed, removePick } from "../../../../lib/db";
import { changed, placesChanged } from "../../../../lib/events";
import { clean, me } from "../../../../lib/me";

// Put a shared place on the group's list: by its id from Explore, or by a
// starter place's key. Or take one off (remove=<its pick id>): the member who added
// it can until someone else is keen or while it's a stop of the plan on
// now, the owner always; it goes with its
// keens, so adding it back starts from none. The page's script posts in the
// background (and gets a 204, or a 409 when it may not be removed); a plain
// form post redirects back.
export const POST: APIRoute = async ({ params, cookies, request, redirect }) => {
  const group = getGroup(params.id ?? "");
  if (!group) return redirect("/", 303);
  const member = me(cookies, group.id);
  const inPage = request.headers.get("x-spots") === "in-page";
  if (!member) return inPage ? new Response(null, { status: 403 }) : redirect(`/g/${group.link}`, 303);
  const form = await request.formData();

  if (form.has("remove")) {
    const placeId = removePick(group, Number(form.get("remove")), member);
    if (placeId === undefined || placeId === "planned")
      return inPage ? new Response(null, { status: 409 }) : redirect(`/g/${group.link}?edit&error=${placeId === "planned" ? "remove-planned" : "remove"}#list`, 303);
    changed(group.id);
    placesChanged(); // its "on N lists" count moved
    return inPage ? new Response(null, { status: 204 }) : redirect(`/g/${group.link}?edit&removed=${placeId}#list`, 303);
  }

  const key = clean(form.get("key"), 40);
  const placeId = key ? placeIdForSeed(key) : Number(form.get("place"));
  if (placeId && addPick(group.id, placeId, member)) {
    changed(group.id);
    placesChanged(); // its "on N groups' lists" count moved
  }
  return inPage ? new Response(null, { status: 204 }) : redirect(`/g/${group.link}#list`, 303);
};
