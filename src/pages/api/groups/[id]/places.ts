import type { APIRoute } from "astro";
import { KIND_LABEL, type Kind } from "../../../../lib/catalogue";
import { addPick, addPlace, getGroup } from "../../../../lib/db";
import { changed, placesChanged } from "../../../../lib/events";
import { clean, me } from "../../../../lib/me";
import { indexPlaces } from "../../../../lib/search";

// Share a new place with every group, and put it on this group's list. A
// place only gets in with a reason it's good: that line is what Spots keeps
// instead of a star rating. Picked from the OpenStreetMap search it carries
// its OSM id and location; typed by hand (no JavaScript) it has neither, and
// simply won't have a pin on the map.
const inCanberra = (lat: number, lon: number) => lat > -35.95 && lat < -35.1 && lon > 148.7 && lon < 149.45;

export const POST: APIRoute = async ({ params, cookies, request, redirect }) => {
  const group = getGroup(params.id ?? "");
  if (!group) return redirect("/", 303);
  const member = me(cookies, group.id);
  if (!member) return redirect(`/g/${group.id}`, 303);
  const form = await request.formData();
  const name = clean(form.get("name"), 80);
  const kind = clean(form.get("kind"), 10) as Kind;
  const why = clean(form.get("why"), 160);
  if (!name || !(kind in KIND_LABEL) || !why) return redirect(`/g/${group.id}?error=place#add`, 303);

  const osmId = /^(node|way|relation)\/\d+$/.test(clean(form.get("osm"), 40)) ? clean(form.get("osm"), 40) : null;
  const lat = Number(form.get("lat"));
  const lon = Number(form.get("lon"));
  const located = osmId !== null && Number.isFinite(lat) && Number.isFinite(lon) && inCanberra(lat, lon);

  const placeId = addPlace(
    {
      osmId: located ? osmId : null,
      name,
      kind,
      area: clean(form.get("area"), 40),
      why,
      lat: located ? lat : null,
      lon: located ? lon : null,
      source: located ? `https://www.openstreetmap.org/${osmId}` : "",
    },
    member,
  );
  addPick(group.id, placeId, member);
  changed(group.id);
  placesChanged();
  // Its vector is made now, so the next search can already find it.
  void indexPlaces();
  return redirect(`/g/${group.id}?added=${placeId}#list`, 303);
};
