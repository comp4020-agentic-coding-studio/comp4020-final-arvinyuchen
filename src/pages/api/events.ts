import type { APIRoute } from "astro";
import { memberOfAccount } from "../../lib/db";
import { bus } from "../../lib/events";
import { me } from "../../lib/me";

// Server-sent events: every open page of a group holds one of these. It hears
// "change" the moment anyone in the group joins, picks or votes, and "places"
// when any group shares a new place. The page then re-reads itself in place
// (see src/pages/g/[id].astro). Only the group's members hear it: even
// with no words in it, when a group is busy is the group's own. A stream
// open when its account stops being a member (removed, merged away) closes
// at the next change. "talk" says which place's thread has something new
// (its id, never the words): the page asks the thread route for it.
export const GET: APIRoute = ({ url, cookies }) => {
  const groupId = url.searchParams.get("group") ?? "";
  const member = me(cookies, groupId);
  if (!member?.accountId) return new Response(null, { status: 403 });
  const accountId = member.accountId;
  let onChange: (payload: { groupId: string }) => void;
  let onPlaces: () => void;
  let onTalk: (payload: { groupId: string; placeId: number }) => void;
  let heartbeat: ReturnType<typeof setInterval>;
  const stop = () => {
    clearInterval(heartbeat);
    bus.off("change", onChange);
    bus.off("places", onPlaces);
    bus.off("talk", onTalk);
  };
  const stream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue(": connected\n\n");
      heartbeat = setInterval(() => controller.enqueue(": ping\n\n"), 30_000);
      // (each event for the group is said only while the account is still in it)
      const tell = (event: string) => {
        if (memberOfAccount(groupId, accountId)) controller.enqueue(event);
        else {
          stop();
          controller.close();
        }
      };
      onChange = (payload) => {
        if (payload.groupId === groupId) tell("event: change\ndata: {}\n\n");
      };
      onTalk = (payload) => {
        if (payload.groupId === groupId) tell(`event: talk\ndata: ${JSON.stringify({ place: payload.placeId })}\n\n`);
      };
      onPlaces = () => controller.enqueue("event: places\ndata: {}\n\n");
      bus.on("change", onChange);
      bus.on("places", onPlaces);
      bus.on("talk", onTalk);
    },
    cancel: () => stop(),
  });
  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
};
