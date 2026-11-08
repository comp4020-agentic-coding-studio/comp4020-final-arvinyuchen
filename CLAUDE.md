# Spots: rules for the agent

What good means for Spots is argued in `README.md`. These are the rules that
follow from it; every change has to hold to them.

## The app

- **Places are shared; the group is private.** Every group explores the same
  pool of places, and a place one group shares shows up in everyone's
  Explore. A group's members, list and votes never leave that group: another
  group may see that a place is "on 3 lists", never whose lists or who's keen.
- **Before joining, the link shows a preview, not the group.** Someone who
  isn't a member sees only the group's name, who started it, its members
  (two more by name, the rest a count: "with Mia, Leo +1"), the owner's note to invitees, and its first three places, oldest
  first, so the order gives away no votes, pinned on a small map of just
  those three (`src/components/MiniMap.astro`). The server doesn't render the
  list, keens, Explore, the group's map or the invite card for them
  (`src/pages/g/[link].astro`, checked in `spec/`).
- **A place gets in with a reason.** Adding a place needs a "why it's good"
  from the person sharing it, shown with their name. That sentence is the
  filter: no reason, no place.
- **A place's photo is the sharer's own, or there's none.** One a member
  uploads (`src/lib/photos.ts`) is re-encoded with all its metadata (GPS
  among it) stripped and credited to them; a place shared without one
  still gets in, and its card shows its kind's picture
  (`src/lib/kind-art.ts`, an illustration drawn for the kind in the
  starter places' style, `public/kinds/`), named with the kind so it isn't
  taken for that place. Nothing is fetched to give a place a photo, and it
  never takes a photo's address from the browser. The first starter places,
  and places shared before, keep the credited Commons photos they have
  (copies of ours at the card's size, `public/places/commons/`, so a page
  never waits on Wikimedia); the
  later starter places have an illustration made for Spots
  (`public/places/`, licence `ILLUSTRATED` in `src/lib/catalogue.ts`): a
  dish, or what you do there, never the venue, and its card says
  "Illustration", never "Photo". Most share theirs with places of the same
  kind of thing (`public/places/dish/`, Toque's DishArt for the dish the
  reason names; `public/places/do/` for an activity). Never
  take a venue's own photos or a photographer's from their sites. Never
  import places in bulk from a directory or an API to pad the pool: each
  starter place is one an editorial source recommends (a local guide or
  paper, VisitCanberra, ACT Government), with its reason in our words
  from that source, however many there are (`src/data/starter-places.json`,
  `scripts/build-starter-places.py`); a directory's or a shopping centre's
  listing is not a reason, and chains stay out.
- **Look places up politely.** Find (`src/pages/api/lookup.ts`) searches
  Overture Maps' Canberra places on the server first
  (`src/data/places-index.json`, built by `scripts/build-places-index.ts`),
  then OpenStreetMap through Photon. It asks only when someone presses
  Find, with the app's User-Agent, and caches answers; only someone signed
  in can ask, 60 new searches an hour each. Keep it that way: no
  search-as-you-type, no autocomplete against Photon. The index
  is only a finder's: none of it is in Explore until someone shares it.
  Overture, Photon, map tiles and data are credited.
- **The outing on the day asks politely, and only about places.** The
  plan's card says, quietly, when a stop won't be open for its part of
  the plan, once: on each window's row until the time is set ("Questacon
  opens 9am", that window's start then offered from 9am, `fitStart`), at
  the card's foot after ("Closes 5pm"), and a stop shut all day at the
  foot either way ("Closed Mondays"); and, for a stop outside, the day's forecast
  ("24° · 10% rain") once it's within Open-Meteo's 16 days
  (`src/lib/outing.ts`, `src/components/PlanOuting.astro`). Hours are
  OpenStreetMap's `opening_hours` tag (Overture's places carry none),
  asked of Overpass and read by the pinned opening_hours.js, which knows
  the ACT's public holidays; forecasts are Open-Meteo's, with no key.
  Only a place's coordinates, its OpenStreetMap id and a date ever go out
  (`src/lib/outing-fetch.ts`), never a member, a group, a plan or a
  place's name, always with the app's User-Agent (`src/lib/agent.ts`).
  They're asked in the background (`src/lib/outing-data.ts`): when a plan
  starts or changes, or a card finds something missing or stale; one
  request at a time per service; never while a page waits. Answers are
  kept in SQLite (hours a week, a forecast three hours, a failure an hour
  before it's tried again), and a page reads only that, so a service
  that's down never slows the card. Unknown hours, and days beyond the
  forecast, say nothing: never a guess. Overpass, OpenStreetMap,
  opening_hours.js and Open-Meteo are credited in the footer. The spec
  runs the app with `OUTING_STUB=1`, whose stub (`src/lib/outing-stub.ts`)
  answers instead and logs what would have gone out.
- **Getting between the stops is an estimate, and says so.** A multi-stop
  plan's card shows each leg ("about 12 min drive · 6 km", a walk under
  1.5 km) from the straight line, a road factor and a town speed
  (`legBetween` in `src/lib/outing.ts`): no routing service, nothing
  fetched, always "about". Directions are plain links, no key: to each
  stop, and once the time is set, the whole route in order; Apple Maps'
  unified URLs on an Apple device (told from the browser), Google Maps'
  elsewhere, in a new tab with `rel="noopener"` (`directionsUrl`). Never
  send a member, a group or a plan in one.
- **Explore comes a page at a time; the map shows everything.** With
  hundreds of places, Explore shows 24 cards and "Show 24 more" (`?more`),
  of the kind its chip asks for (`?kind`, asked of the server, so a live
  refresh redraws a page, never hundreds). Unsearched, places on a group's
  list and places members shared lead, then the starter places take turns
  by kind, so the first page shows every kind. The group's map has two
  modes, switched on the map (top left), so neither covers the other: Our
  list, only the list's numbered chips with their names; Explore, every
  place Explore could show as a dot drawn by the map itself (a circle
  layer), one becoming a mark under the pointer or when flown to. A list
  row or a place's Talk turns it to Our list; an Explore card, a search or
  a kind chip to Explore; it opens on Explore when the address asks for
  one (`?q`, `?kind`, `?near`) or the list is empty. Across the city three or more dots close together
  gather into a frosted chip: a small disc for each of the three kinds it
  holds most of, in the kind's colour with its icon, "+2" for any more
  kinds, then how many, in the page's
  font, under our list's chips, until the camera is down
  among the suburbs (zoom 13); a tap zooms in to where it comes apart. Its callout on a place whose card isn't showing puts
  that card first (`?at`). A search's answers are all on the map, its
  cards a page at a time.
- **"Near your plan" only reorders Explore.** While the group has a plan
  on with a stop on the map, Explore has one "Near your plan" chip
  (`src/components/NearPlan.astro`, `?near`, a link, so it works without
  a script) that puts the places nearest any stop first, each card saying
  how far ("400 m from Questacon", as the crow flies; `nearPlan` in
  `src/lib/outing.ts`); it combines with the kind chips, and `?kind` opens
  on one, as the card's "Find food nearby" does. It shows the same places
  as ever, a place on the list as it always is; it adds none, and without
  a plan the chip and `?near` are simply not there.
- **One person, one keen.** A member can vote "keen" on a spot once. The
  button sends the state it shows ("on" or "off") and the server sets exactly
  that (`setKeen`), so a double-tap or a second device never undoes a vote.
  On Our list it's one fixed width and one label either way ("3 keen",
  filled with a tick when it's yours, its accessible name the action:
  "I'm keen on X" / "Not keen on X any more"), so a tap never moves the
  row; every row's rank, photo and name sit in the same columns, and a
  stop of the plan says so quietly after its suburb, in grey.
  Never let a vote be cast for someone else: identity is the signed-in
  account (`me()` in `src/lib/me.ts`), never a name typed into a form.
- **Everyone is a passkey account.** Starting or joining a group needs one,
  made in the same step from a name, an email and a passkey (the home page's
  form, the invite, `/signin`); signed in, joining is one button. One account
  has one name, the same in every group, one email (changed on My account;
  accounts from before #195 are asked at the top of My groups, #197), and one or more passkeys,
  never none. A
  device without your passkey is added from one signed in: `/add-device`
  there shows a code (and its QR code, ten minutes, once, the newest only),
  and with it the new device makes its own passkey for that account; the code
  never signs anyone in by itself (`newDeviceCode` in `src/lib/accounts.ts`).
  Someone who lost every device gets the same thing by email (#195):
  `/signin` → Lost your passkey → `/recover`, the account's email gets a
  link to `/add-device` with a long code (30 minutes, once, `newEmailCode`),
  and that device makes a new passkey for the account. The answer is the
  same whether or not the email has an account, asking is rate-limited, and
  the link's origin is `APP_ORIGIN` (fly.toml), never the request's host.
  Mail goes through Resend (`src/lib/mail.ts`, `RESEND_API_KEY` and
  `MAIL_FROM` as Fly secrets); without a key, or with `OUTING_STUB`, it's
  kept and logged, and the spec reads it from `/api/mail-log`. The fallback
  stays the owner's merge: someone with no email left makes a new account
  and joins again by the link, saying who they were (the join form's "Been
  in this group before?", anyone but the owner); the owner is asked "Same
  person?" in Settings, as for two members with one name, and Same person
  merges the old member into the new one, Not them stops asking
  (`mergeAsks` in `src/lib/db.ts`). Never add a way in that isn't a
  passkey: the email only ever brings a link that lets a device make one,
  and is never shown to anyone, admin included.
- **The invite goes person to person.** Whoever holds the link can join, so
  it's shared through private channels only, by one button: the system
  share sheet on a touch screen that has one, a copy of the link elsewhere
  (no app icons of our own: the sheet already has every chat app). Under
  it, two small links each open a panel, one at a time: Show QR code (a
  computer only; drawn on the server with `uqr`, nothing fetched, #119)
  and, for the owner, Add a note / Edit note, the note to invitees (#118). Never add a button that posts it to a
  public feed (a Facebook post, X, a story). A link preview may name the group
  (Open Graph, `src/layouts/Base.astro`), never its members or votes.
- **Who joined is said in the app, until you dismiss it.** At the top of
  the group's column, each member sees a slim notice of who joined after
  them and since they last dismissed it ("Zoe joined Saturday crew",
  `newcomers` in `src/lib/db.ts`, by member id in `joins_seen_id`). It
  arrives live and waits across visits, since nothing is pushed, and
  dismissing it (`/api/groups/[id]/seen`) is theirs alone (#120).
- **Accounts are passkeys only.** No passwords, no "sign in with" providers,
  and the email never signs in (it only gets the lost-passkey link). An
  account is made from a name, an email and a passkey
  (`src/pages/api/passkeys/`), its sessions store only a hash of their token,
  and `me()` in `src/lib/me.ts` is the one place that decides who someone is
  in a group: the signed-in account's member there, and nothing else.
- **The owner's tools keep what the group made.** Removing or merging a member
  marks them, never deletes them: what they added keeps their name. Only a
  removed member's keens go. Resetting the invite link retires the old one;
  members who follow it land on the new one, nobody new gets in.
- **Live means live.** Any join, add, removal or vote must reach every other open page
  of that group within about a second, without the viewer reloading
  (`src/pages/api/events.ts` + the page's refresh script). A new kind of
  change has to call `changed(groupId)`; a change to the shared places also
  calls `placesChanged()` so every group's Explore catches up. The stream
  answers only a signed-in member of that group (`me()`), and one open when
  its account stops being a member ends at the next change. Talk says only
  which thread changed (`talked(groupId, placeId)`, "event: talk" with the
  place's id): never words on the stream.
- **Taking a place off the list is for whoever put it there.** In Edit
  mode (`?edit`), the member who added a place can take it off until
  someone else is keen on it, and never while it's a stop of the plan on
  now (not called off, its day not gone; the route refuses); the owner can
  take any off, asked first when others are keen (`removePick` in
  `src/lib/db.ts`). Edit gives every row one slot where its keen button
  was (kept, unseen, so rows don't reflow), with exactly one thing in it:
  a red minus circle to take it off, a grey lock circle the same size on
  a stop of the plan on (labelled "In the plan, only the owner can take it
  off"; the row's "Thu 29, stop 1" after its suburb says which), or, muted on one
  line, whose it is. It goes with its keens, so adding it back starts from
  none; it stays in Explore, and the page offers Undo.
- **The list is always the ranking, and you can see it move.** A live
  change re-ranks Our list straight away, most keen first, and each card
  glides from its old place to its new one (under reduced motion it just
  swaps), so the group sees what moved. For a moment after a move a keen
  tap is ignored, since it was aimed at the card that was there before
  (`docs/adr/0004-voting-at-once.md`). Never jump cards without
  the glide, and never replay the cards' entrance on a refresh.
- **A plan is the owner's to decide, from busy times nobody else sees.** The
  owner starts one plan at a time: one outing, to one to five places on Our
  list in order (its stops, `plan_places`; `plans.place_id` is always the
  first), on a day, with one length for all of it (`src/lib/plans.ts`); only times at least that long are
  offered, never a shorter one; but when none of those has everyone who's
  answered free and a shorter time does, the card says so above them,
  naming the longest ("Everyone's free 1–4:30pm, 30 min short", `allFree` in
  `planView`), and gives the owner "Make it 3h 30m", the change route's
  new length (answers kept). The owner's sheet asks only how long; the
  hours it counts (8am to 11pm unless changed, and only time inside them
  is ever free, so never the night) fold away under it; each member marks only their own busy times
  (`me()`), and the owner sets the time: a window's earliest start (one
  chip), or a later one typed or swiped in its time field, kept so the
  whole length fits in the window (`start-` and the window's start, read
  by the set route; a plain time input with min and max without a
  script); the windows past the best few sit behind "N more windows", and
  "Set exact time" in the owner's ··· menu (a sheet, `PlanExact.astro`,
  `?plan=exact` without a script) is for a time outside them or another
  end. The card says each thing once, in as few words: the length under
  the title (the tile has the date), "Waiting on …" or "Everyone's in",
  each window's times and who can't (its badge counts who can), and a
  key that's only the strip's scale. Times are Canberra's wall clock:
  a local date and whole minutes since its midnight, to the minute
  (`src/lib/when.ts`), never the server's zone; on the timeline a drag
  lands on 5 minutes and exact minutes are typed. Nobody sees anyone else's
  busy times: the page shows how many are free when and who can't make a
  window (`src/lib/free.ts`), and the timeline gets the others' counts only
  once two others have answered. Never send another member's busy times to
  the browser. There's no push, email or share button for a plan: a dot on
  Our list's tab, a note on an open page, the card. Once the time is set, a
  member's change tells only the owner. A plan moved to another day is a
  new plan, the old one called off and kept. A stop whose place leaves the
  list is dropped, the others moving up; a plan whose last stop goes is
  called off and kept. Changing the stops keeps everyone's times.
- **Talk is about a place on the list, and stays in the group.** Each place
  on Our list has one thread (`src/lib/talk.ts`), kept by group and place
  (`comments`), never by pick, so a place taken off and put back finds its
  thread again; while it's off, its thread is hidden and takes nothing.
  There's no group-wide chat and no Talk on a place in Explore that isn't
  on the list. Only the group's members read or write (`me()`, checked by
  the thread route and the post route alike). A message is plain text, 500
  characters at most, drawn as text with a web address as a link and
  nothing else; 10 a minute and 300 a day per member; a nonce sends a
  double tap once; a thread shows 50 at a time, "Earlier messages" for
  more. Only its author can delete a message, never the owner; deleted, it's
  a "Message removed" stub its author can undo for a day, and then its
  words are cleared (`clearDeleted`: as the module loads, hourly, and before
  every read or write, since there's no cron). Any member can react to a
  message that isn't deleted, one reaction each from five
  (`REACTIONS`, `comment_reactions`); another replaces it, the same again
  takes it back. Its words never reach a link
  preview, the invite's preview, another group, Explore, search or Voyage,
  the live stream, or `/admin` (which counts messages, never shows them);
  `spec/talk.test.ts` holds each of those. People find out in the app, never
  by push, email or a share button: the bubble on the row (its count, blue
  and bold with what's new to you, `comment_reads`), the dot on Our list's
  tab, "N new" on My groups. On a phone the thread is a sheet over the list
  sized to the visual viewport (the keyboard); on a wide screen it takes
  Explore's column and the map flies to the place. The box is outside
  anything a refresh redraws, so a half-typed message survives others'.
  No editing, reactions, images, @mentions or typing dots.
- **Nothing is lost.** All state lives in the one SQLite file on `/data`.
  Schema changes are additive only; never drop or rewrite data a group made.
  A place's kind is stored by its key (`src/lib/kinds.ts`), so a key is never
  renamed: relabel it instead, as Fun became Activities.
  The exceptions: a starter place taken off the
  list in `src/lib/catalogue.ts` is deleted, with its keens, its place
  on every list and any plans for it (`src/lib/db.ts`); a place a member takes off their group's
  list goes from that list with its keens (its Talk stays, hidden, for when
  it's back); a message its author deleted has its words cleared a day
  later, the stub kept (the one change to what someone wrote, and theirs to
  make); and the site admin
  (`src/lib/admin.ts`) archives a group first (closed, restorable), and only
  an archived group can be deleted for good, by an admin, after a confirm,
  its Talk with it (as a deleted starter place takes its threads).
  An admin can hide a shared place. An admin is a passkey account that once entered
  `ADMIN_CODE` (a Fly secret); never add another way to become one.
- **Every action says who did it, in the logs, and nothing more.** Each
  route that changes something writes one line with `log.act`
  (`src/lib/log.ts`): the act, who (`log.member` or `log.account`), the
  group (`log.group`) and the ids of what it touched, so `flyctl logs`
  tells who joined, voted, shared, planned, talked or was taken out (#200).
  A new kind of action gets its line. Never put in a line what someone
  wrote (a Talk message, an invite note: a count at most), an email, busy
  times (how many stretches, never when), a search prompt, a code, a token
  or a passkey. `spec/log.test.ts` checks both halves through
  `/api/log-tail`, which exists only while stubbed.
- **The page's script is assumed; every action is still a plain route.**
  Making an account and signing in need a passkey, so they need JavaScript
  and a browser that has passkeys; where there's none (another app's
  built-in browser, an old one), the page says to open it in Safari or
  Chrome (`src/components/NoPasskey.astro`). So everyone signed in has the
  script, and new UI may rely on it, with no version for a page without it
  (#116). Every action stays a plain HTTP route, a form post that
  redirects or answers 204 in the page, because that's what `spec/`
  drives. The no-script fallbacks already there can stay; take one out
  when it's in the way of a change.
- **Search answers with cards, never prose.** A prompt comes back as the
  matching places, best first, and their pins: no generated text, nothing
  said about a place that its card doesn't say. Ranking is cosine similarity
  between Voyage embeddings of the prompt and each card (`src/lib/search.ts`);
  "near X" is a hard distance filter, never left to the vectors (a suburb,
  a shared place, or a town centre people say: Civic, Woden,
  Tuggeranong, Weston Creek). Bad weather ("a rainy day") is read as
  wanting somewhere indoors, the weather words swapped out before the
  vectors see them (`forMeaning` in `src/lib/query.ts`). When nothing
  is close enough, say so; don't pad with the least-bad matches: a
  prompt with a word no card uses whose best match stands out only
  weakly ("Ethiopian food", `UNHEARD_LIFT`) is asking for something no
  place has, and gets nothing. The field's × (or emptying it) is every
  place again in one tap; on a phone's Explore the search stays pinned
  over the cards once they've scrolled it away.
- **The embeddings key stays on the server.** `VOYAGE_API_KEY` is a Fly secret
  (and lives in `mise.local.toml` locally); it never goes to the browser or
  into git. Without it, or with Voyage down, search falls back to matching
  words and still works. Only card text and prompts go to Voyage, never
  names of members or anything about a group, and never what's said in Talk.
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
  dots for the rest, and the credit folded behind an "i" on the map. On the
  group's map (the only one with a card) a tapped place's chip becomes its
  card: on a wide map a callout grown from the chip (its photo, name, kind
  and suburb, its number on the list); on a phone's short map the chip
  fills with its kind's colour and the same card sits at the map's foot,
  with one action (keen, or Add). Pins, names and credit are placed
  by `src/scripts/map-marks.ts` and styled once ("Map marks" in
  `src/styles.css`); the drawn maps share `src/components/MapDrawing.astro`.
  Don't give a map its own pin or label style.
- **Phones first.** Every page works at 375px wide with no sideways scroll.
  On a phone the group's tabs are a small frosted pill floating over the
  screen's foot, the open tab named, tucked away while you scroll down and
  back when you scroll up. The group's map can fold away there (a chevron
  on it, "Show map" in its place, remembered on the device), and a place
  tapped unfolds it before the map flies.
- **On a wide screen, the page is the window.** The group's page is three
  columns (from 1180px, with the script): the header, the three columns
  level under it and the footer fill the window exactly, and the page never
  scrolls. Each column scrolls on its own, held so it doesn't hand on to the
  page: the left one whole (the group's panel, the tabs, the plan and every
  row of Our list together, never Our list alone in a box under a panel
  that stays, as #41 had), Explore's cards inside their column (or Share,
  or Settings), and the map fills its own. This replaced the page scrolling
  the left column beside sticky ones (#97), whose tops came apart (#115).
  Phones and tablets are one column, opening on the same panel: a card
  with Canberra across its top, the group's name, who's in and Invite,
  Our list's header only, so another tab opens on its own content.

## The work

- `pnpm check` must be green before a commit: start the app
  (`pnpm build && pnpm start`) with `OUTING_STUB=1`, and run it against
  `APP_URL`. Never run the spec against the live site.
- A claim in `README.md` about how the app behaves gets checked in a real
  browser before it ships.
- Don't invent places: anything added to the starter list in
  `src/lib/catalogue.ts` has to be a real place in Canberra, checked against a
  source that's cited in the entry, with coordinates, and a photo only if
  it's credited and its licence allows reuse.
