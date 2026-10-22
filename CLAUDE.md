# Spots: rules for the agent

What good means for Spots is argued in `README.md`. These are the rules that
follow from it; every change has to hold to them.

## The app

- **Places are shared; the group is private.** Every group explores the same
  pool of places, and a place one group shares shows up in everyone's
  Explore. A group's members, list and votes never leave that group: another
  group may see that a place is "on 3 lists", never whose lists or who's keen.
- **Before joining, the link shows a preview, not the group.** Someone who
  isn't a member sees only the group's name, who started it, its members'
  names, the owner's note to invitees, and its first three places, oldest
  first, so the order gives away no votes, pinned on a small map of just
  those three (`src/components/MiniMap.astro`). The server doesn't render the
  list, keens, Explore, the group's map or the invite card for them
  (`src/pages/g/[link].astro`, checked in `spec/`).
- **A place gets in with a reason.** Adding a place needs a "why it's good"
  from the person sharing it, shown with their name. That sentence is the
  filter: no reason, no place. Never import places in bulk from a directory or
  an API to pad the pool.
- **Look places up politely.** `src/pages/api/lookup.ts` asks OpenStreetMap's
  Nominatim only when someone presses Find, at most once a second, with the
  app's User-Agent, and caches answers. Keep it that way: no search-as-you-type,
  no autocomplete against Nominatim. Map tiles and data are credited on the
  map.
- **One person, one keen.** A member can vote "keen" on a spot once. The
  button sends the state it shows ("on" or "off") and the server sets exactly
  that (`setKeen`), so a double-tap or a second device never undoes a vote.
  Never let a vote be cast for someone else: identity is the signed-in
  account (`me()` in `src/lib/me.ts`), never a name typed into a form.
- **Everyone is a passkey account.** Starting or joining a group needs one,
  made in the same step from a name and a passkey (the home page's form, the
  invite, `/signin`); signed in, joining is one button. One account has one
  name, the same in every group, and one or more passkeys, never none. There's
  no recovery but the owner's merge: someone who lost every passkey makes a
  new account, joins again by the link, and the owner merges their old
  member into it. Never add a way in that isn't a passkey.
- **The invite goes person to person.** Whoever holds the link can join, so
  it's shared through private channels only: the system share sheet, Messages,
  WhatsApp, Telegram, email. Never add a button that posts it to a
  public feed (a Facebook post, X, a story). A link preview may name the group
  (Open Graph, `src/layouts/Base.astro`), never its members or votes.
- **Accounts are passkeys only.** No passwords, no email, no "sign in with"
  providers. An account is made from a name and a passkey
  (`src/pages/api/passkeys/`), its sessions store only a hash of their token,
  and `me()` in `src/lib/me.ts` is the one place that decides who someone is
  in a group: the signed-in account's member there, and nothing else.
- **The owner's tools keep what the group made.** Removing or merging a member
  marks them, never deletes them: what they added keeps their name. Only a
  removed member's keens go. Resetting the invite link retires the old one;
  members who follow it land on the new one, nobody new gets in.
- **Live means live.** Any join, add or vote must reach every other open page
  of that group within about a second, without the viewer reloading
  (`src/pages/api/events.ts` + the page's refresh script). A new kind of
  change has to call `changed(groupId)`; a change to the shared places also
  calls `placesChanged()` so every group's Explore catches up.
- **The list is always the ranking, and you can see it move.** A live
  change re-ranks Our list straight away, most keen first, and each card
  glides from its old place to its new one (under reduced motion it just
  swaps), so the group sees what moved. For a moment after a move a keen
  tap is ignored, since it was aimed at the card that was there before
  (PROCESS.md, "Several people voting at once"). Never jump cards without
  the glide, and never replay the cards' entrance on a refresh.
- **Nothing is lost.** All state lives in the one SQLite file on `/data`.
  Schema changes are additive only; never drop or rewrite data a group made.
  A place's kind is stored by its key (`src/lib/kinds.ts`), so a key is never
  renamed: relabel it instead, as Fun became Activities.
  The one exception is the site admin (`src/lib/admin.ts`): a group is
  archived first (closed, restorable), and only an archived group can be
  deleted for good, by an admin, after a confirm. Shared places are hidden,
  never deleted. An admin is a passkey account that once entered
  `ADMIN_CODE` (a Fly secret); never add another way to become one.
- **Signed in, it works without JavaScript**, as plain forms posting and
  redirecting. The live layer, the map and the place finder are additions on
  top, not the only way to act. Making an account and signing in need a
  passkey, so they need JavaScript and a browser that has passkeys; where
  there's none (another app's built-in browser, an old one), the page says
  to open it in Safari or Chrome (`src/components/NoPasskey.astro`).
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
  where it is; under `prefers-reduced-motion` it jumps instead. Every page's
  entrance, and the invite's scroll and pin-drop animations, are off there
  too: the page is simply there. A live refresh never replays an entrance.
  The home page's photo turning into the map (`src/scripts/fly.ts`) is
  driven by the scroll, so it goes as fast as the visitor scrolls and
  stops when they stop; it plays itself only when they press a button for
  it, and any touch, wheel or key stops it. Landed, the map turns slowly
  while it's on screen, and it stays landed: scrolling back up doesn't fly
  it back; the logo does, played like the buttons. Under reduced motion, or without WebGL, none of it
  runs: the page is the photo, the drawn map and the form.
- **One look everywhere.** Every page takes the invite page's design: the
  colours, cards, buttons and fields come from the `:root` tokens and shared
  classes in `src/styles.css` (`.card`, `.card__actions`, `.btn--primary`),
  the header and footer line up with the page's content through `--page`,
  every live map uses `src/scripts/map-look.ts`, and the home page's drawn
  map takes the same colours, relief and pins. A page doesn't bring its own
  palette or font.
- **Every map is the invite's map.** The group's map, the invite's and the
  home page's share one language: tiles' lettering hidden (street names only
  once the camera is down in a street) and a few place names set in the
  page's font, fine line weights, white chips for the places on a list and
  dots for the rest, a popup that is the chip grown into a card, and the
  credit folded behind an "i" on the map. Pins, names and credit are placed
  by `src/scripts/map-marks.ts` and styled once ("Map marks" in
  `src/styles.css`); the drawn maps share `src/components/MapDrawing.astro`.
  Don't give a map its own pin or label style.
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
