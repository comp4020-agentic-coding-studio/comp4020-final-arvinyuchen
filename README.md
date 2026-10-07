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
- **Joining costs nothing.** A link and a name. No account, no app to install,
  no sign-up wall between the group chat and the decision.
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
  when asked), and OpenFreeMap serves its map tiles. The starter places were
  checked against Wikipedia, with photos from Wikimedia Commons credited on
  each card.

## What I chose not to build

- **Accounts and profiles.** A name inside one group is enough to tell friends
  apart; logging in would be the biggest barrier between the chat and the app.
- **Public reviews and star ratings.** Spots is about what this group thinks.
- **A directory of every place in Canberra.** A short checked starter list,
  plus the places people share with a reason. Nothing is imported in bulk.
- **Booking and directions.** The map shows where a place is; getting there
  and booking a table are for the apps that already do them well.

## Where it is now

Start a group, join by link, and explore the shared places on cards and a map:
click a card and the map flies to it. Add a place to your group's list, or
share a new one by looking it up on OpenStreetMap and saying why it's good; it
appears in every group's Explore. Vote "keen" and the list re-ranks live in
every open page. Next: searching the places by describing what you're after,
deciding a date and time, and a "who's coming" for the chosen spot.
