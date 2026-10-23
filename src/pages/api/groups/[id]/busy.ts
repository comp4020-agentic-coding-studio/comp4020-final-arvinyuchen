import type { APIRoute } from "astro";
import { getGroup } from "../../../../lib/db";
import { changed } from "../../../../lib/events";
import { parseInterval, type Interval } from "../../../../lib/free";
import { me } from "../../../../lib/me";
import { answerPlan, currentPlan, planOf } from "../../../../lib/plans";

// When you're busy on the plan's day: the whole set at once, what your page
// showed, so sending it twice changes nothing. The timeline sends each
// stretch as busy=540-620; the plain form sends from/to pairs (a pair left
// on "–" is no stretch). None at all, or "I'm free all day", is free all
// day. Only you can answer for you: who's answering is the signed-in
// account (me()), never a field.
export const POST: APIRoute = async ({ params, cookies, request, redirect }) => {
  const group = getGroup(params.id ?? "");
  if (!group) return redirect("/", 303);
  const member = me(cookies, group.id);
  const inPage = request.headers.get("x-spots") === "in-page";
  if (!member) return inPage ? new Response(null, { status: 403 }) : redirect(`/g/${group.link}`, 303);
  const form = await request.formData();
  const refused = (error: string) =>
    inPage ? new Response(null, { status: 409 }) : redirect(`/g/${group.link}?busy&error=${error}#busy`, 303);

  const plan = planOf(group.id, Number(form.get("plan")));
  if (!plan || plan.id !== currentPlan(group.id)?.id) return refused("plan-gone");

  // ("I'm free all day" sends the form as it is, rows and all: it's none)
  const free = form.get("free") === "all";
  const busy: (Interval | null)[] = free ? [] : form.getAll("busy").map((v) => parseInterval(String(v)));
  const froms = free ? [] : form.getAll("from").map(String);
  const tos = form.getAll("to").map(String);
  froms.forEach((from, i) => {
    const to = tos[i] ?? "";
    if (from === "" && to === "") return;
    busy.push(from === "" || to === "" ? null : parseInterval(`${from}-${to}`));
  });
  if (busy.some((b) => b === null)) return refused("busy");

  const result = answerPlan(plan, member, busy as Interval[]);
  if (result === "invalid") return refused("busy");
  if (result) changed(group.id);
  return inPage ? new Response(null, { status: 204 }) : redirect(`/g/${group.link}#plan-${plan.id}`, 303);
};
