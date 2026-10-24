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
// at the next change.
export const GET: APIRoute = ({ url, cookies }) => {
  const groupId = url.searchParams.get("group") ?? "";
  const member = me(cookies, groupId);
  if (!member?.accountId) return new Response(null, { status: 403 });
  const accountId = member.accountId;
  let onChange: (payload: { groupId: string }) => void;
  let onPlaces: () => void;
  let heartbeat: ReturnType<typeof setInterval>;
  const stop = () => {
    clearInterval(heartbeat);
    bus.off("change", onChange);
    bus.off("places", onPlaces);
  };
  const stream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue(": connected\n\n");
      heartbeat = setInterval(() => controller.enqueue(": ping\n\n"), 30_000);
      onChange = (payload) => {
        if (payload.groupId !== groupId) return;
        if (memberOfAccount(groupId, accountId)) controller.enqueue("event: change\ndata: {}\n\n");
        else {
          stop();
          controller.close();
        }
      };
      onPlaces = () => controller.enqueue("event: places\ndata: {}\n\n");
      bus.on("change", onChange);
      bus.on("places", onPlaces);
    },
    cancel: () => stop(),
  });
  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
};
