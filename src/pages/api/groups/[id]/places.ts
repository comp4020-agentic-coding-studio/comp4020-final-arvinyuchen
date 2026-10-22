import type { APIRoute } from "astro";
import { KIND_LABEL, type Kind } from "../../../../lib/catalogue";
import { addPick, addPlace, getGroup, placeIdForOsm } from "../../../../lib/db";
import { changed, placesChanged } from "../../../../lib/events";
import { clean, me } from "../../../../lib/me";
import { photoForOsm, savePhoto } from "../../../../lib/photos";
import { indexPlaces } from "../../../../lib/search";

// Share a new place with every group, and put it on this group's list. A
// place only gets in with a reason it's good: that line is what Spots keeps
// instead of a star rating. Picked from the OpenStreetMap search it carries
// its OSM id and location; typed by hand (no JavaScript) it has neither, and
// simply won't have a pin on the map. And it gets in only with a photo: the
// sharer's own if they chose one, or else the Commons photo its OpenStreetMap
// tags lead to (worked out here, never taken from the browser).
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

  const osmId = /^(node|way|relation)\/\d+$/.test(clean(form.get("osm"), 40)) ? clean(form.get("osm"), 40) : null;
  const lat = Number(form.get("lat"));
  const lon = Number(form.get("lon"));
  const located = osmId !== null && Number.isFinite(lat) && Number.isFinite(lon) && inCanberra(lat, lon);

  // (already shared by someone, with its photo: it goes on the list as it is)
  const shared = located ? placeIdForOsm(osmId!) : undefined;
  const upload = form.get("photo");
  const photo = shared
    ? null
    : upload instanceof File && upload.size > 0
      ? await savePhoto(upload, member.name)
      : located
        ? await photoForOsm(osmId!)
        : null;
  if (!shared && !photo) return redirect(`/g/${group.link}?error=photo#add`, 303);

  const placeId = shared ?? addPlace(
    {
      osmId: located ? osmId : null,
      name,
      kind,
      area: clean(form.get("area"), 40),
      why,
      lat: located ? lat : null,
      lon: located ? lon : null,
      source: located ? `https://www.openstreetmap.org/${osmId}` : "",
      photo: photo!,
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
