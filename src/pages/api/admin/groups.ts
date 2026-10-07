import type { APIRoute } from "astro";
import { archiveGroups, purgeGroups, restoreGroups } from "../../../lib/admin";
import { changed, placesChanged } from "../../../lib/events";
import { clean, signedIn } from "../../../lib/me";

// Archive, restore, or (archived only) delete groups for good, in bulk.
export const POST: APIRoute = async ({ cookies, request, redirect }) => {
  if (!signedIn(cookies)?.isAdmin) return redirect("/admin", 303);
  const form = await request.formData();
  const ids = form.getAll("group").map((v) => clean(v, 20)).filter(Boolean);
  const action = clean(form.get("action"), 10);
  const run = { archive: archiveGroups, restore: restoreGroups, purge: purgeGroups }[action];
  const n = run ? run(ids) : 0;
  // Open pages of those groups, and every Explore's "on N lists", catch up.
  for (const id of ids) changed(id);
  if (n) placesChanged();
  return redirect(`/admin?done=${action}&n=${n}#groups`, 303);
};
