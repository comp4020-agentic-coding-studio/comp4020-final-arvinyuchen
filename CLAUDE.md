# Spots: rules for the agent

What good means for Spots is argued in `README.md`. These are the rules that
follow from it; every change has to hold to them.

## The app

- **One group is the whole world.** A page only ever shows one group's
  members, list and votes. Nothing from one group may appear in another.
- **One person, one keen.** A member can vote "keen" on a spot once; voting
  again takes it back. Never let a vote be cast for someone else: identity is
  the per-group cookie (`src/lib/me.ts`), never a name typed into a form.
- **Joining stays a link and a name.** Don't add accounts, passwords, email or
  sign-up steps.
- **Live means live.** Any join, add or vote must reach every other open page
  of that group within about a second, without the viewer reloading
  (`src/pages/api/events.ts` + the page's refresh script). A new kind of
  change has to call `changed(groupId)`.
- **Nothing is lost.** All state lives in the one SQLite file on `/data`.
  Schema changes are additive only; never drop or rewrite data a group made.
- **It works without JavaScript**, as plain forms posting and redirecting. The
  live layer is an addition on top, not the only way to act.
- **Phones first.** Every page works at 375px wide with no sideways scroll.

## The work

- `pnpm check` must be green before a commit: start the app
  (`pnpm build && pnpm start`) and run it against `APP_URL`.
- A claim in `README.md` about how the app behaves gets checked in a real
  browser before it ships.
- Don't invent places: anything added to the starter list in
  `src/lib/catalogue.ts` has to be a real place in Canberra, checked.
