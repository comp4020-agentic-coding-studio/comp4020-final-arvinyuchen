import type { APIRoute } from "astro";
import { bus } from "../../lib/events";

// Server-sent events: every open page of a group holds one of these. It hears
// "change" the moment anyone in the group joins, picks or votes, and "places"
// when any group shares a new place. The page then re-reads itself in place
// (see src/pages/g/[id].astro).
export const GET: APIRoute = ({ url }) => {
  const groupId = url.searchParams.get("group") ?? "";
  let onChange: (payload: { groupId: string }) => void;
  let onPlaces: () => void;
  let heartbeat: ReturnType<typeof setInterval>;
  const stream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue(": connected\n\n");
      heartbeat = setInterval(() => controller.enqueue(": ping\n\n"), 30_000);
      onChange = (payload) => {
        if (payload.groupId === groupId) controller.enqueue("event: change\ndata: {}\n\n");
      };
      onPlaces = () => controller.enqueue("event: places\ndata: {}\n\n");
      bus.on("change", onChange);
      bus.on("places", onPlaces);
    },
    cancel() {
      clearInterval(heartbeat);
      bus.off("change", onChange);
      bus.off("places", onPlaces);
    },
  });
  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
};
