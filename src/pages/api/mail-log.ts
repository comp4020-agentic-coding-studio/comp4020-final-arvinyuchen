import type { APIRoute } from "astro";
import { kept } from "../../lib/mail";

// For the spec only: the mail Spots would have sent, while stubbed
// (OUTING_STUB, src/lib/mail.ts). Otherwise this isn't here.
export const GET: APIRoute = () =>
  process.env.OUTING_STUB ? Response.json(kept()) : new Response(null, { status: 404 });
