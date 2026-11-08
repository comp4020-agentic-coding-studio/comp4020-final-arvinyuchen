import type { APIRoute } from "astro";
import { getGroup, removeMember, renameGroup, resetLink, setNote, NOTE_MAX } from "../../../../lib/db";
import { changed } from "../../../../lib/events";
import { clean, me } from "../../../../lib/me";
import * as log from "../../../../lib/log";

// The owner's tools: rename the group, write a note to the people they
// invite, take someone out, and reset the invite link. Only the owner
// gets past the first check; everything else just goes back.
export const POST: APIRoute = async ({ params, cookies, request, redirect }) => {
  const group = getGroup(params.id ?? "");
  if (!group) return redirect("/", 303);
  const back = (link: string, done: string) => redirect(`/g/${link}?done=${done}#settings`, 303);
  const owner = me(cookies, group.id);
  if (!owner || owner.id !== group.ownerId) return redirect(`/g/${group.link}`, 303);

  const form = await request.formData();
  const action = clean(form.get("action"), 10);
  const by = { by: log.member(owner), group: log.group(group) };
  if (action === "rename") {
    const name = clean(form.get("name"), 60);
    if (!name) return back(group.link, "none");
    renameGroup(group.id, name);
    log.act("group-rename", { ...by, to: name });
    changed(group.id);
    return back(group.link, "renamed");
  }
  if (action === "note") {
    const note = clean(form.get("note"), NOTE_MAX).replace(/\s+/g, " ");
    setNote(group.id, note);
    // (its words are the owner's to their invitees: only how long it is)
    log.act("note", { ...by, chars: note.length });
    changed(group.id);
    // (from the invite card, in the page: it says so itself)
    if (request.headers.get("x-spots") === "in-page") return new Response(null, { status: 204 });
    return back(group.link, "noted");
  }
  if (action === "remove") {
    const done = removeMember(group, Number(form.get("member")));
    if (done) log.act("member-remove", { ...by, member: Number(form.get("member")) });
    if (done) changed(group.id);
    return back(group.link, done ? "removed" : "none");
  }
  if (action === "reset") {
    const link = resetLink(group.id);
    log.act("link-reset", by);
    changed(group.id);
    return back(link, "reset");
  }
  return back(group.link, "none");
};
