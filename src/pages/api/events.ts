import type { APIRoute } from "astro";
import { bus } from "../../lib/events";

// Server-sent events: every open page of a group holds one of these, and
// hears "something changed in this group" the moment anyone joins, adds a
// spot or votes. The page then re-reads the group (see src/pages/g/[id].astro).
export const GET: APIRoute = ({ url }) => {
  const groupId = url.searchParams.get("group") ?? "";
  let onChange: (payload: { groupId: string }) => void;
  let heartbeat: ReturnType<typeof setInterval>;
  const stream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue(": connected\n\n");
      heartbeat = setInterval(() => controller.enqueue(": ping\n\n"), 30_000);
      onChange = (payload) => {
        if (payload.groupId === groupId) controller.enqueue(`event: change\ndata: {}\n\n`);
      };
      bus.on("change", onChange);
    },
    cancel() {
      clearInterval(heartbeat);
      bus.off("change", onChange);
    },
  });
  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
};
