import type { APIRoute } from "astro";
import { KIND_LABEL, type Kind } from "../../../../lib/catalogue";
import { addPick, addPlace, getGroup, placeIdForRef } from "../../../../lib/db";
import { changed, placesChanged } from "../../../../lib/events";
import { clean, me } from "../../../../lib/me";
import { photoForOsm, savePhoto } from "../../../../lib/photos";
import { localPlace } from "../../../../lib/places-index";
import { indexPlaces } from "../../../../lib/search";

// Share a new place with every group, and put it on this group's list. A
// place only gets in with a reason it's good: that line is what Spots keeps
// instead of a star rating. Picked from Find (src/pages/api/lookup.ts) it
// carries where it was found and its location; typed by hand (no
// JavaScript) it has neither, and simply won't have a pin on the map. Its
// photo is the sharer's own if they chose one, or else the Commons photo its
// OpenStreetMap tags lead to (worked out here, never taken from the
// browser), or none, and its card shows its kind's picture.
const inCanberra = (lat: number, lon: number) => lat > -35.95 && lat < -35.1 && lon > 148.7 && lon < 149.45;

export const POST: APIRoute = async ({ params, cookies, request, redirect }) => {
  const group = getGroup(params.id ?? "");
  if (!group) return redirect("/", 303);
  const member = me(cookies, group.id);
  if (!member) return redirect(`/g/${group.link}`, 303);
  const form = await request.formData();
  const name = clean(form.get("name"), 80);
  const kind = clean(form.get("kind"), 10) as Kind;
  const why = clean(form.get("why"), 160);
  if (!name || !(kind in KIND_LABEL) || !why) return redirect(`/g/${group.link}?error=place#add`, 303);

  // Where it was found: a place in Overture's index (its location is the
  // index's, not the form's), or on OpenStreetMap (its location from the
  // search, if it's in Canberra), or nowhere, typed by hand.
  const ref = clean(form.get("ref") ?? form.get("osm"), 80);
  const overture = /^overture\/[\w-]{8,64}$/.test(ref) ? localPlace(ref) : undefined;
  const osm = /^(node|way|relation)\/\d+$/.test(ref) ? ref : null;
  const lat = overture?.lat ?? Number(form.get("lat"));
  const lon = overture?.lon ?? Number(form.get("lon"));
  const located = (overture !== undefined || osm !== null) && Number.isFinite(lat) && Number.isFinite(lon) && inCanberra(lat, lon);
  const found = located ? (overture?.ref ?? osm) : null;

  // (already shared by someone, with its photo: it goes on the list as it is)
  const shared = found ? placeIdForRef(found) : undefined;
  const upload = form.get("photo");
  const chosen = !shared && upload instanceof File && upload.size > 0;
  const photo = shared ? null : chosen ? await savePhoto(upload, member.name) : osm && located ? await photoForOsm(osm) : null;
  // (a file chosen that isn't a photo we can read is sent back, not dropped)
  if (chosen && !photo) return redirect(`/g/${group.link}?error=photo#add`, 303);

  const placeId =
    shared ??
    addPlace(
      {
        ref: found,
        name,
        kind,
        area: clean(form.get("area"), 40),
        why,
        lat: located ? lat : null,
        lon: located ? lon : null,
        source: !found ? "" : overture ? found.replace("/", ":") : `https://www.openstreetmap.org/${found}`,
        photo,
      },
      member,
    );
  addPick(group.id, placeId, member);
  changed(group.id);
  placesChanged();
  // Its vector is made now, so the next search can already find it.
  void indexPlaces();
  return redirect(`/g/${group.link}?added=${placeId}#list`, 303);
};
