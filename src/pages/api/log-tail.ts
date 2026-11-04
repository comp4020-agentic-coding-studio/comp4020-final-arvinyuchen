import type { APIRoute } from "astro";
import { logged } from "../../lib/log";

// For the spec only: the last lines of who did what (src/lib/log.ts), while
// stubbed (OUTING_STUB). Otherwise this isn't here: the logs are Fly's.
export const GET: APIRoute = () =>
  process.env.OUTING_STUB ? Response.json(logged()) : new Response(null, { status: 404 });
