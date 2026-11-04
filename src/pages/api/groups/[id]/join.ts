import type { APIRoute } from "astro";
import { claimMember, getGroup, joinGroup } from "../../../../lib/db";
import { changed } from "../../../../lib/events";
import { clean, me, signedIn } from "../../../../lib/me";
import * as log from "../../../../lib/log";

// Joining needs the group's current invite link (once the owner resets it,
// the old link lets nobody new in) and an account: you join as yourself,
// under your account's name, and may say who you were here before.
export const POST: APIRoute = async ({ params, cookies, request, redirect }) => {
  const group = getGroup(params.id ?? "");
  if (!group) return redirect("/", 303);
  const form = await request.formData();
  if (clean(form.get("link"), 20) !== group.link) return redirect(`/g/${clean(form.get("link"), 20)}`, 303);
  const account = signedIn(cookies);
  if (!account) return redirect(`/g/${group.link}?error=account#join`, 303);
  if (me(cookies, group.id)) return redirect(`/g/${group.link}`, 303);
  const member = joinGroup(group.id, account);
  // (back after losing every device: who they were, for the owner to confirm)
  const was = Number(form.get("was"));
  if (was) claimMember(group, member, was);
  log.act("join", { by: log.member(member), account: `a${account.id}`, group: log.group(group), was: was || undefined });
  changed(group.id);
  return redirect(`/g/${group.link}`, 303);
};
