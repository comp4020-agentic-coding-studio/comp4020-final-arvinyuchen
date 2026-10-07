import type { APIRoute } from "astro";
import { addPick, getGroup, placeIdForSeed } from "../../../../lib/db";
import { changed, placesChanged } from "../../../../lib/events";
import { clean, me } from "../../../../lib/me";

// Put a shared place on the group's list: by its id from Explore, or by a
// starter place's key.
export const POST: APIRoute = async ({ params, cookies, request, redirect }) => {
  const group = getGroup(params.id ?? "");
  if (!group) return redirect("/", 303);
  const member = me(cookies, group.id);
  if (!member) return redirect(`/g/${group.id}`, 303);
  const form = await request.formData();
  const key = clean(form.get("key"), 40);
  const placeId = key ? placeIdForSeed(key) : Number(form.get("place"));
  if (placeId && addPick(group.id, placeId, member)) {
    changed(group.id);
    placesChanged(); // its "on N groups' lists" count moved
  }
  return redirect(`/g/${group.id}#list`, 303);
};
