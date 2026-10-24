# Spots

Spots is a shared list of places for one group of friends: the food spots, fun
places and things to do you might go to together. Someone starts a group and
shares the link; everyone joins with their name and a passkey, explores
places, adds the ones they're keen on, and votes. Votes show up live as people make them, the
list re-ranks itself as they vote, and it's still there next time the group
wants to go out.

## Who it's for

One group of friends deciding where to go: a share house, a tutorial group, a
group chat that keeps saying "we should go somewhere". Not a city guide and not
strangers' reviews. A group of four to twelve people who already trust each
other's taste.

## What good means here

- **Everyone's voice counts the same.** One person, one "keen" per spot. The
  friend who never speaks up in the group chat can still say what they want,
  and the list shows it.
- **Deciding together is quick.** From "where should we go?" to a list the
  group agrees on in minutes, not a 200-message thread. Votes show up on
  everyone's screen within a second, so a group in the same room decides
  together, live.
- **Settling when is quick too, and nobody's diary is on show.** Once the
  group has a favourite, whoever started it picks a day; everyone marks only
  when they're busy that day (free all day is one tap), and the page shows
  when everyone's free, best first. The others see how many are free when,
  and who can't make each time, never anyone's busy times. Nobody votes on a
  time: the owner sets it.
- **The list is the group's own; the good places are everyone's.** A friend's
  "best chilli oil in Canberra" beats a star rating from a stranger. Every
  group explores one shared pool of places, and a place only gets in when
  someone shares it with a sentence on why it's good, signed with their name.
  So the pool grows from people's real favourites, not from a directory, while
  each group's list, members and votes stay theirs alone.
- **You can see where it is.** Picking a place should answer "is that near
  us?" straight away, so every card can fly the map to its spot.
- **Ask the way you'd ask a friend.** "Cheap dumplings near Dickson" or "a
  walk with a view" should find places, and the answer should be places: cards
  and pins, not a paragraph. Places are matched on meaning, using the reasons
  people wrote, so the better the reasons, the better the search.
- **Joining costs almost nothing.** A link, your name and your face or
  fingerprint: no app to install, no password, no email. The link goes wherever the
  group already talks: one Share button opens the phone's own share sheet
  (Messages, WhatsApp, Instagram, WeChat), and there are direct links for
  everywhere else. It never goes to a public feed, since anyone who
  has it can join. Opening the link shows one invite card: the group, who
  started it, who's in, a line from whoever started it if they wrote one,
  and one button to join. Under it, the first few places on a small street
  map. The full list and its votes are for the group.
- **You're you, on every device, without a password.** Everyone is an
  account: a name and a passkey (face, fingerprint or PIN), made in the same
  tap that starts or joins a group. Signed in, joining another group is one
  button. Nobody can vote as someone else by typing their name, a friend on a
  second device is still the same person, and all your groups are in one
  place. One account has one name, and can have several passkeys (an iPhone's
  and a Windows laptop's), never none. Lose every passkey and there's no
  reset: make a new account, join again, and the group's owner merges your
  old name into it. Inside Instagram's or Facebook's own browser, where
  passkeys don't work, the invite says to open it in Safari or Chrome.
- **Whoever starts a group can look after it.** Rename it, write a line to
  the people they invite, take someone out, merge someone who joined twice,
  and reset the invite link if it spread too far, without losing anything
  the group made.
- **It remembers.** What the group added and voted for stays, across visits,
  restarts and redeploys, so next weekend starts from the list, not from
  scratch.

## What I looked at

- The final project brief's notes on good: the small web, games for a handful
  of friends, tools made for one workshop. They pushed me to build for one
  group, not for everyone.
- How my own friends decide where to go now: a group chat thread, a poll that
  half the group never answers, and someone's saved places in a maps app that
  nobody else can see.
- Map and review apps: good for finding a place, but built around strangers'
  ratings and one person's account, not a group deciding together. Google's
  Places API would bring thousands of restaurants but no judgement about which
  are good, which is the one thing Spots is for.
- Finding a real place to share: OpenStreetMap alone missed too many of
  Canberra's cafés and bars, so Find searches Overture Maps' places first
  (an open dataset, its Canberra places built into an index once), then
  OpenStreetMap through Photon, which forgives a half-remembered name
  ("Lonsdale Street Roasters" finds "Lonsdale St Roasters"). The index only
  helps someone find a place; Explore still holds only what people shared.
  OpenFreeMap serves the map tiles. The home page opens
  on a photo of the city from Mount Ainslie, and as you scroll it turns into
  a 3D map of the same view: OpenFreeMap's tiles over Mapzen's terrain, with
  the camera in the photographer's place, so the two line up. The camera
  climbs away round the city and comes down at a tilt over the whole of it,
  in the card where the starter places are pinned, and there it keeps
  turning slowly. Landed, it stays: scrolling back up doesn't fly it back,
  but the Spots logo does. Without WebGL or with reduced motion, the card holds a
  drawn map instead, OpenStreetMap too: its lake, reserves, parks, rivers,
  roads, side streets and suburb names come from one Overpass query, built
  into the page (and one streets picture beside it) by
  `scripts/build-hero-map.ts`, so nothing on it is drawn by hand and the site
  never queries OpenStreetMap for it. Its hills are shaded once from
  Mapzen's terrain by `scripts/build-hero-relief.ts`. The starter places were
  checked against Wikipedia, with photos from Wikimedia Commons credited on
  each card where there is one. Finding a free photo of every café and bar
  proved hopeless (Commons has few, and a venue's own are its own), so a
  place a person shares has the photo they upload, if any, kept with its
  location and every other bit of metadata stripped, and credited to them.
  One without isn't turned away: its card shows its kind's picture, one
  from Unsplash for each kind, named with the kind, so it's never taken
  for a photo of that place. Both street maps, the group's and the invite's small one, are
  OpenFreeMap's tiles recoloured to look like Apple Maps, with city parks
  in green, hairline side streets, hills shaded from Mapzen's open terrain
  tiles, and buildings that stand up as the group's map flies into a
  street. All three maps look like one: the same colours and line weights,
  the tiles' lettering swapped for a few place names in the page's own font,
  the same white chips for the places on a list (its number, and the name
  where there's room) and dots for the rest, and the credit folded behind an
  "i" in the map's corner. One photo of
  Canberra, from Unsplash and credited in the footer, opens the home page,
  every invite and a Spots link shared in a chat, so all three look like the
  same place.
- Picking a time: Doodle polls a few times someone guessed, and When2meet
  has everyone paint when they're free on a week's grid, which shows
  everyone's diary to everyone and fights the page's scroll on a phone.
  Phone calendars draw an event with a hold, then a drag, so a swipe still
  scrolls. Spots asks about one day, the owner's, for busy times (most of a
  Saturday is free, so there's less to mark), on a timeline drawn the
  calendar way.
- Voyage AI's embeddings turn each card and each search prompt into a
  vector; cards are ranked by how close they are in meaning (cosine
  similarity). Only card text and prompts are sent, nothing about a group.

## What I chose not to build

- **Passwords, email sign-up, "sign in with" and profiles.** An account is a
  passkey and a name, nothing more. I first left accounts out entirely, then
  made them optional, and found the cost both times: a friend on a second
  device became a second person, and a name typed into a form proved nothing.
  So every member is an account now, and a passkey keeps that to one tap.
  There's no email, so there's no account recovery either; the owner's merge
  is the way back. Passkeys belong to the site that made them, so there's no
  "sign in with WhatsApp or Instagram" to offer, and I wouldn't want one.
- **Public reviews and star ratings.** Spots is about what this group thinks.
- **A directory of every place in Canberra.** A short checked starter list,
  plus the places people share with a reason. Nothing is imported in bulk.
- **A chatbot that writes recommendations.** Generated text would say things
  about places that nobody here vouched for. Search hands back people's own
  cards, in the words they wrote.
- **Notifications, calendar invites and a share button for plans.** A plan
  lives on the group's page: a dot on Our list's tab, a note at the foot of
  an open page, and the card asking for your times. The group already has a
  chat for nudging each other.
- **Booking and directions.** The map shows where a place is; getting there
  and booking a table are for the apps that already do them well.

## Where it is now

Start a group, join by link, and explore the shared places on cards and a map:
click a card and the map flies to it. Add a place to your group's list, or
share a new one by looking it up on OpenStreetMap and saying why it's good; it
appears in every group's Explore. Vote "keen" and the count changes live in
every open page, and the list re-ranks itself, each card gliding to its new
place. Our list's Edit takes a place off again: yours until someone else is
keen on it or while it's in the plan on now, any for the owner, with Undo; put back, it starts from no keens.
The group's page is in tabs (Our list, Explore, Share a place, and
Settings for whoever started it), and the invite folds behind one button. Search Explore by describing what you're after: the answer is
the matching cards, best first, and the map frames their pins. Everyone signs
in with a passkey, is themselves on any device, and sees all their groups in
one place; your account page renames you everywhere and adds or removes
passkeys. The person who started a
group can rename it, write a note for the people they invite, remove or merge
members, and reset its invite link. They can also plan a day out: one place
from the list or a few in order (an outing with stops, "National Gallery →
Questacon"), a day, and how long it all takes (the hours it counts, 8am to
11pm, fold away under that and can be changed). Everyone marks when they're busy on that day's
hours, to the minute (tap for an hour, hold and drag to draw in 5-minute
steps, type exact minutes; without a script, rows of From and To), and the plan's card shows when everyone's
free for that long, longest first, as counts and who can't make it (or
says plainly that no stretch is that long). The owner sets the
time; it shows under the group's name as Next up and on the place's row in
the list, and if someone's times change after that, only the owner hears,
with a time to move to. Next: saying who's coming once the time is set.
