import type { APIRoute } from "astro";
import { getGroup } from "../../../../lib/db";
import { changed } from "../../../../lib/events";
import { parseInterval } from "../../../../lib/free";
import { clean, me } from "../../../../lib/me";
import { parseMinute } from "../../../../lib/when";
import {
  callOffPlan,
  changePlan,
  currentPlan,
  DEFAULT_DURATION,
  DEFAULT_RANGE,
  keepPlanTime,
  planOf,
  setPlanTime,
  startPlan,
  unsetPlanTime,
} from "../../../../lib/plans";

// The owner's side of a plan: start one (one to five places on the list,
// its stops in order; a day; the hours to count; how long it takes), set the time (a start offered, one
// from "Other", or an exact time), go back to picking, keep the time after
// someone's changed theirs, move it to another day, or call it off. Only
// the owner gets past the first check. The page's script posts in the
// background (a 204, or a 409 when it can't be done); a plain form post
// redirects back to the plan.
export const POST: APIRoute = async ({ params, cookies, request, redirect }) => {
  const group = getGroup(params.id ?? "");
  if (!group) return redirect("/", 303);
  const member = me(cookies, group.id);
  const inPage = request.headers.get("x-spots") === "in-page";
  if (!member || member.id !== group.ownerId) return inPage ? new Response(null, { status: 403 }) : redirect(`/g/${group.link}`, 303);
  const form = await request.formData();
  const action = clean(form.get("action"), 10);
  const done = (id: number, tell = true) => {
    if (tell) changed(group.id);
    return inPage ? new Response(null, { status: 204 }) : redirect(`/g/${group.link}#plan-${id}`, 303);
  };
  const refused = (error: string, then = "#plans") =>
    inPage ? new Response(null, { status: 409 }) : redirect(`/g/${group.link}?error=${error}${then}`, 303);

  // the day: a page's chosen day, or one typed in its date field
  const day = clean(form.get("date"), 10) || clean(form.get("day"), 10);
  // the hours to count, to the minute (480, or a time field's "08:00"; an
  // end of "00:00" is midnight), or (with none sent) these
  const minute = (key: string, end = false) => parseMinute(clean(form.get(key), 8), end) ?? NaN;
  const range = (or: { start: number; end: number }) => ({
    start: form.has("from") ? minute("from") : or.start,
    end: form.has("to") ? minute("to", true) : or.end,
  });
  // how long it takes, in minutes: the script's one field, or the plain
  // form's hours and minutes (or, with none sent, this)
  const whole = (key: string) => (/^\d{1,4}$/.test(clean(form.get(key), 4)) ? Number(clean(form.get(key), 4)) : NaN);
  const duration = (or: number) =>
    form.has("duration") ? whole("duration") : form.has("duration_h") ? whole("duration_h") * 60 + (clean(form.get("duration_m"), 4) ? whole("duration_m") : 0) : or;

  // the stops, in order: as the script tapped them ("order"), then any
  // ticked it doesn't name, in the list's order (a plain form's ticks)
  const ticked = form.getAll("place").map((v) => Number(v));
  const order = clean(form.get("order"), 200).split(",").filter(Boolean).map(Number).filter((id) => ticked.includes(id));
  const stops = [...new Set(order), ...ticked.filter((id) => !order.includes(id))];

  if (action === "start") {
    const id = startPlan(group, member, stops, day, range(DEFAULT_RANGE), duration(DEFAULT_DURATION));
    if (id === "exists") return refused("plan-exists");
    if (id === "invalid") return refused("plan-start", "&plan=new#plan-start");
    return done(id);
  }

  const plan = planOf(group.id, Number(form.get("plan")));
  // (only the plan now can be changed: one on another tab may be old news)
  if (!plan || plan.id !== currentPlan(group.id)?.id) return refused("plan-gone");

  if (action === "set") {
    // an exact time, typed; or a start among the offered, or one picked from "Other"
    const at = form.get("exact")
      ? [parseMinute(clean(form.get("set_from"), 8)) ?? NaN, parseMinute(clean(form.get("set_to"), 8), true) ?? NaN]
      : parseInterval(clean(form.get("other"), 12) || clean(form.get("at"), 12));
    return at && setPlanTime(plan, at[0], at[1]) ? done(plan.id) : refused("plan-set");
  }
  if (action === "unset") return unsetPlanTime(plan) ? done(plan.id) : refused("plan-set");
  // (the owner having seen a change is theirs alone: nobody else's page moves)
  if (action === "keep") return keepPlanTime(plan) ? done(plan.id, false) : refused("plan-set");
  if (action === "change") {
    // (the sheet sends its stops, "stops" saying so even when none are ticked)
    const id = changePlan(plan, member, day || plan.day, range(plan.range), duration(plan.duration), form.has("stops") ? stops : undefined);
    return id === "invalid" ? refused("plan-change") : done(id);
  }
  if (action === "off") return callOffPlan(plan) ? done(plan.id) : refused("plan-gone");
  return refused("plan-gone");
};
