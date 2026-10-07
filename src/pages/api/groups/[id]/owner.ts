import type { APIRoute } from "astro";
import { getGroup, mergeMembers, removeMember, renameGroup, resetLink } from "../../../../lib/db";
import { changed } from "../../../../lib/events";
import { clean, me } from "../../../../lib/me";

// The owner's tools: rename the group, take someone out, fold a duplicate
// into the person they really are, and reset the invite link. Only the
// owner gets past the first check; everything else just goes back.
export const POST: APIRoute = async ({ params, cookies, request, redirect }) => {
  const group = getGroup(params.id ?? "");
  if (!group) return redirect("/", 303);
  const back = (link: string, done: string) => redirect(`/g/${link}?done=${done}#settings`, 303);
  const owner = me(cookies, group.id);
  if (!owner || owner.id !== group.ownerId) return redirect(`/g/${group.link}`, 303);

  const form = await request.formData();
  const action = clean(form.get("action"), 10);
  if (action === "rename") {
    const name = clean(form.get("name"), 60);
    if (!name) return back(group.link, "none");
    renameGroup(group.id, name);
    changed(group.id);
    return back(group.link, "renamed");
  }
  if (action === "remove") {
    const done = removeMember(group, Number(form.get("member")));
    if (done) changed(group.id);
    return back(group.link, done ? "removed" : "none");
  }
  if (action === "merge") {
    const done = mergeMembers(group, Number(form.get("member")), Number(form.get("into")));
    if (done) changed(group.id);
    return back(group.link, done ? "merged" : "none");
  }
  if (action === "reset") {
    const link = resetLink(group.id);
    changed(group.id);
    return back(link, "reset");
  }
  return back(group.link, "none");
};
