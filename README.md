# Spots

Spots is a shared list of places for one group of friends: the food spots, fun
places and things to do you might go to together. Someone starts a group and
shares the link; everyone joins with just a name, explores places, adds the
ones they're keen on, and votes. The list re-ranks live as people vote, and
it's still there next time the group wants to go out.

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
- **Joining costs nothing.** A link and a name. No app to install, no sign-up
  wall between the group chat and the decision.
- **You stay you, without a password.** Anyone who wants to be themselves on
  their phone and their laptop can save a passkey (face, fingerprint or PIN)
  and find all their groups in one place. It's optional, there's no
  password or email, and it never stands between someone and joining.
- **Whoever starts a group can look after it.** Rename it, take someone out,
  merge someone who joined twice, and reset the invite link if it spread too
  far, without losing anything the group made.
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
- OpenStreetMap: its Nominatim search finds a real place's name and location
  when someone shares it (under its usage policy: one request at a time, only
  when asked), and OpenFreeMap serves its map tiles. The home page's moving
  map is OpenStreetMap too: its lake, reserves, parks, rivers, main roads and
  suburb names come from one Overpass query, built into the page by
  `scripts/build-hero-map.ts`, so nothing on it is drawn by hand and the
  site never queries OpenStreetMap for it. The starter places were
  checked against Wikipedia, with photos from Wikimedia Commons credited on
  each card.
- Voyage AI's embeddings turn each card and each search prompt into a
  vector; cards are ranked by how close they are in meaning (cosine
  similarity). Only card text and prompts are sent, nothing about a group.

## What I chose not to build

- **Passwords, email sign-up and profiles.** An account is a passkey and a
  name, nothing more, and only for people who want one. I first left accounts
  out entirely, then found the cost: a friend on a second device became a
  second person. Passkeys fix that without a sign-up wall.
- **Public reviews and star ratings.** Spots is about what this group thinks.
- **A directory of every place in Canberra.** A short checked starter list,
  plus the places people share with a reason. Nothing is imported in bulk.
- **A chatbot that writes recommendations.** Generated text would say things
  about places that nobody here vouched for. Search hands back people's own
  cards, in the words they wrote.
- **Booking and directions.** The map shows where a place is; getting there
  and booking a table are for the apps that already do them well.

## Where it is now

Start a group, join by link, and explore the shared places on cards and a map:
click a card and the map flies to it. Add a place to your group's list, or
share a new one by looking it up on OpenStreetMap and saying why it's good; it
appears in every group's Explore. Vote "keen" and the list re-ranks live in
every open page. Search Explore by describing what you're after: the answer is
the matching cards, best first, and the map frames their pins. Save a passkey
to be yourself on any device and see all your groups; the person who started a
group can rename it, remove or merge members, and reset its invite link. Next:
deciding a date and time, and a "who's coming" for the chosen spot.
