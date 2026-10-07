# Spots: rules for the agent

What good means for Spots is argued in `README.md`. These are the rules that
follow from it; every change has to hold to them.

## The app

- **Places are shared; the group is private.** Every group explores the same
  pool of places, and a place one group shares shows up in everyone's
  Explore. A group's members, list and votes never leave that group: another
  group may see that a place is "on 3 lists", never whose lists or who's keen.
- **A place gets in with a reason.** Adding a place needs a "why it's good"
  from the person sharing it, shown with their name. That sentence is the
  filter: no reason, no place. Never import places in bulk from a directory or
  an API to pad the pool.
- **Look places up politely.** `src/pages/api/lookup.ts` asks OpenStreetMap's
  Nominatim only when someone presses Find, at most once a second, with the
  app's User-Agent, and caches answers. Keep it that way: no search-as-you-type,
  no autocomplete against Nominatim. Map tiles and data are credited on the
  map; photos are credited on the card.
- **One person, one keen.** A member can vote "keen" on a spot once; voting
  again takes it back. Never let a vote be cast for someone else: identity is
  the per-group cookie (`src/lib/me.ts`), never a name typed into a form.
- **Joining stays a link and a name.** An account is optional and never stands
  between someone and joining or voting.
- **Accounts are passkeys only.** No passwords, no email, no "sign in with"
  providers. An account starts from a member who's already in a group
  (`src/pages/api/passkeys/`), its sessions store only a hash of their token,
  and `me()` in `src/lib/me.ts` is the one place that decides who someone is:
  their account's member first, then the group cookie.
- **The owner's tools keep what the group made.** Removing or merging a member
  marks them, never deletes them: what they added keeps their name. Only a
  removed member's keens go. Resetting the invite link retires the old one;
  members who follow it land on the new one, nobody new gets in.
- **Live means live.** Any join, add or vote must reach every other open page
  of that group within about a second, without the viewer reloading
  (`src/pages/api/events.ts` + the page's refresh script). A new kind of
  change has to call `changed(groupId)`; a change to the shared places also
  calls `placesChanged()` so every group's Explore catches up.
- **Nothing is lost.** All state lives in the one SQLite file on `/data`.
  Schema changes are additive only; never drop or rewrite data a group made.
- **It works without JavaScript**, as plain forms posting and redirecting. The
  live layer, the map and the place finder are additions on top, not the only
  way to act.
- **Search answers with cards, never prose.** A prompt comes back as the
  matching places, best first, and their pins: no generated text, nothing
  said about a place that its card doesn't say. Ranking is cosine similarity
  between Voyage embeddings of the prompt and each card (`src/lib/search.ts`);
  "near X" is a hard distance filter, never left to the vectors. When nothing
  is close enough, say so; don't pad with the least-bad matches.
- **The embeddings key stays on the server.** `VOYAGE_API_KEY` is a Fly secret
  (and lives in `mise.local.toml` locally); it never goes to the browser or
  into git. Without it, or with Voyage down, search falls back to matching
  words and still works. Only card text and prompts go to Voyage, never
  names of members or anything about a group.
- **Motion is a guide, not a show.** The map flies to a place so you can see
  where it is; under `prefers-reduced-motion` it jumps instead.
- **Phones first.** Every page works at 375px wide with no sideways scroll.

## The work

- `pnpm check` must be green before a commit: start the app
  (`pnpm build && pnpm start`) and run it against `APP_URL`.
- A claim in `README.md` about how the app behaves gets checked in a real
  browser before it ships.
- Don't invent places: anything added to the starter list in
  `src/lib/catalogue.ts` has to be a real place in Canberra, checked against a
  source that's cited in the entry, with coordinates and a credited photo
  whose licence allows reuse.
