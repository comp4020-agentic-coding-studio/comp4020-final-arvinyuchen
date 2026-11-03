import type { APIRoute } from "astro";
import { getGroup } from "../../../../lib/db";
import { talked } from "../../../../lib/events";
import { me } from "../../../../lib/me";
import { deleteMessage, react, sendMessage, undoDelete } from "../../../../lib/talk";

// Talk on a place on the list: say something (send), take back something
// you said (delete), bring it back within the day (undo), or react to a
// message (react: one each, the same again takes it back). Only a member
// of the group, as themselves (me()), and only on a place on its list;
// only a message's author can delete it, not even the owner. The page's
// script posts in the background (a 204, or a 409 saying why in
// x-spots-error); a plain form post goes back to the thread.
export const POST: APIRoute = async ({ params, cookies, request, redirect }) => {
  const group = getGroup(params.id ?? "");
  if (!group) return redirect("/", 303);
  const member = me(cookies, group.id);
  const inPage = request.headers.get("x-spots") === "in-page";
  if (!member) return inPage ? new Response(null, { status: 403 }) : redirect(`/g/${group.link}`, 303);
  const form = await request.formData();
  const action = String(form.get("action") ?? "");
  const thread = (placeId: number, then = "#talk") => `/g/${group.link}?talk=${placeId}${then}`;
  const done = (placeId: number, then?: string) => {
    talked(group.id, placeId);
    return inPage ? new Response(null, { status: 204 }) : redirect(thread(placeId, then), 303);
  };
  const refused = (error: string, placeId: number) =>
    inPage
      ? new Response(null, { status: 409, headers: { "x-spots-error": error } })
      : redirect(error === "gone" ? `/g/${group.link}?error=talk-gone#list` : thread(placeId, `&error=talk-${error}#talk`), 303);

  if (action === "send") {
    const placeId = Number(form.get("place"));
    // (the field's own limit is 500; anything far past it is cut before it's looked at)
    const body = String(form.get("body") ?? "").slice(0, 2000);
    const result = sendMessage(group, member, placeId, body, String(form.get("nonce") ?? ""));
    if (result === "sent") return done(placeId);
    // (sent already, by a tap that came first: nothing new to tell)
    if (result === "again") return inPage ? new Response(null, { status: 204 }) : redirect(thread(placeId), 303);
    return refused(result, placeId);
  }
  const id = Number(form.get("message"));
  const placeId = Number(form.get("place"));
  if (action === "delete") {
    const at = deleteMessage(group, member, id);
    return at === undefined ? refused("not-yours", placeId) : done(at, `#msg-${id}`);
  }
  if (action === "react") {
    const at = react(group, member, id, String(form.get("emoji") ?? ""));
    return at === undefined ? refused("not-yours", placeId) : done(at, `#msg-${id}`);
  }
  if (action === "undo") {
    const at = undoDelete(group, member, id);
    return at === undefined ? refused("not-yours", placeId) : done(at, `#msg-${id}`);
  }
  return refused("gone", placeId);
};
