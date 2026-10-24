import type { APIRoute } from "astro";
import { PHOTO_FILE, readPhoto } from "../../lib/photos";

// The photos people uploaded with the places they shared, from the volume.
// A name is random and never reused, so a browser may keep one for good.
export const GET: APIRoute = async ({ params }) => {
  const file = params.file ?? "";
  if (!PHOTO_FILE.test(file)) return new Response("Not found", { status: 404 });
  try {
    return new Response(new Uint8Array(await readPhoto(file)), {
      headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
};
