import type { APIRoute } from "astro";
import { KIND_LABEL, type Kind } from "../../../../lib/catalogue";
import { addCataloguePick, addCustomPick, getGroup } from "../../../../lib/db";
import { changed } from "../../../../lib/events";
import { clean, me } from "../../../../lib/me";

// Add a spot to the group's list: one from Explore (by its catalogue key), or
// one of the group's own finds (name, kind, area, a note on why).
export const POST: APIRoute = async ({ params, cookies, request, redirect }) => {
  const group = getGroup(params.id ?? "");
  if (!group) return redirect("/", 303);
  const member = me(cookies, group.id);
  if (!member) return redirect(`/g/${group.id}`, 303);
  const form = await request.formData();
  const key = clean(form.get("key"), 40);
  if (key) {
    addCataloguePick(group.id, key, member.id);
  } else {
    const name = clean(form.get("name"), 80);
    const kind = clean(form.get("kind"), 10) as Kind;
    if (!name || !(kind in KIND_LABEL)) return redirect(`/g/${group.id}?error=spot#add`, 303);
    addCustomPick(group.id, member.id, name, kind, clean(form.get("area"), 40), clean(form.get("note"), 140));
  }
  changed(group.id);
  return redirect(`/g/${group.id}#list`, 303);
};
