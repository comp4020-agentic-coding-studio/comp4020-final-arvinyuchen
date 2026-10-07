import type { APIRoute } from "astro";
import { hidePlaces } from "../../../lib/admin";
import { placesChanged } from "../../../lib/events";
import { clean, signedIn } from "../../../lib/me";

// Hide shared places from Explore and the map, or bring them back.
export const POST: APIRoute = async ({ cookies, request, redirect }) => {
  if (!signedIn(cookies)?.isAdmin) return redirect("/admin", 303);
  const form = await request.formData();
  const ids = form.getAll("place").map(Number).filter(Number.isInteger);
  const action = clean(form.get("action"), 10);
  const n = action === "hide" || action === "unhide" ? hidePlaces(ids, action === "hide") : 0;
  if (n) placesChanged();
  return redirect(`/admin?done=${action}&n=${n}#places`, 303);
};
