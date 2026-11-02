import type { APIRoute } from "astro";
import { sent } from "../../lib/outing-stub";

// For the spec only: what the outing's fetchers would have sent to
// Overpass and Open-Meteo, while they're stubbed (OUTING_STUB). Without the
// stub, nothing is kept and this isn't here.
export const GET: APIRoute = () =>
  process.env.OUTING_STUB ? Response.json(sent()) : new Response(null, { status: 404 });
