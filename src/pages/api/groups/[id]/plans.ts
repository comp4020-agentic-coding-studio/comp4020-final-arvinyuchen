import type { APIRoute } from "astro";
import { getGroup } from "../../../../lib/db";
import { changed } from "../../../../lib/events";
import { parseInterval } from "../../../../lib/free";
import { clean, me } from "../../../../lib/me";
import {
  callOffPlan,
  changePlan,
  currentPlan,
  DEFAULT_RANGE,
  keepPlanTime,
  planOf,
  setPlanTime,
  startPlan,
  unsetPlanTime,
} from "../../../../lib/plans";

// The owner's side of a plan: start one (a place on the list, a day, the
// hours to count), set the time, go back to picking, keep the time after
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
  // the hours to count, or (with none sent) these
  const range = (or: { start: number; end: number }) => ({
    start: form.has("from") ? Number(form.get("from")) : or.start,
    end: form.has("to") ? Number(form.get("to")) : or.end,
  });

  if (action === "start") {
    const id = startPlan(group, member, Number(form.get("place")), day, range(DEFAULT_RANGE));
    if (id === "exists") return refused("plan-exists");
    if (id === "invalid") return refused("plan-start", "&plan=new#plan-start");
    return done(id);
  }

  const plan = planOf(group.id, Number(form.get("plan")));
  // (only the plan now can be changed: one on another tab may be old news)
  if (!plan || plan.id !== currentPlan(group.id)?.id) return refused("plan-gone");

  if (action === "set") {
    // a start among the offered, or one picked from "Other"
    const at = parseInterval(clean(form.get("other"), 12) || clean(form.get("at"), 12));
    return at && setPlanTime(plan, at[0], at[1]) ? done(plan.id) : refused("plan-set");
  }
  if (action === "unset") return unsetPlanTime(plan) ? done(plan.id) : refused("plan-set");
  // (the owner having seen a change is theirs alone: nobody else's page moves)
  if (action === "keep") return keepPlanTime(plan) ? done(plan.id, false) : refused("plan-set");
  if (action === "change") {
    const id = changePlan(plan, member, day || plan.day, range(plan.range));
    return id === "invalid" ? refused("plan-change") : done(id);
  }
  if (action === "off") return callOffPlan(plan) ? done(plan.id) : refused("plan-gone");
  return refused("plan-gone");
};
