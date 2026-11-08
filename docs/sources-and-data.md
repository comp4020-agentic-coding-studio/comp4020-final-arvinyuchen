# Where the places, maps and data come from

What the README's "What I looked at" said about the data and the maps, kept
here when the README was cut to its argument (#202).

## What I looked at, in full

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
  Mapzen's terrain by `scripts/build-hero-relief.ts`. The first starter
  places were checked against Wikipedia, with photos from Wikimedia Commons
  credited on each card. The other sixty-seven were picked for breadth, one for
  each kind of thing a group might search for (a cuisine, a bar, bowling, a
  river swim, a stage) across the suburbs, after a "mexican food" search
  found nothing. Then the pool grew to about seven hundred, so a search
  for almost anything finds something: 330 cafés, restaurants and bars
  that Toque, the owner's Canberra food app, already knew were open and
  that an editorial article recommends, and about three hundred
  activities, walks, wineries and stages from local guides, Parks ACT and
  VisitCanberra. Each cites the source that recommends it, with its reason
  in our words from that source (no chains, nothing a directory merely
  lists), and its picture is an illustration, a dish or what you do
  there, never the venue, labelled "Illustration" on its card; places of
  one kind share a few (Toque's DishArt for the dishes). With that many,
  Explore shows them a page at a time, of the kind you pick, and the map
  draws every one. Finding a free photo of every café and bar
  proved hopeless (Commons has few, and a venue's own are its own), so a
  place a person shares has the photo they upload, if any, kept with its
  location and every other bit of metadata stripped, and credited to them.
  One without isn't turned away: its card shows its kind's picture, an
  illustration drawn for each kind in the starter places' style, named with the kind, so it's never taken
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
- Whether a stop will be open: Overture's places, which Find searches
  first, carry no opening hours, so they come from OpenStreetMap's
  `opening_hours` tag, asked of the Overpass API one place at a time and
  kept for a week, and read with opening_hours.js, the parser
  OpenStreetMap's own tools use, which knows the ACT's public holidays.
  Forecasts come from Open-Meteo, free and keyless; only a place's
  coordinates and the date are sent.
- Voyage AI's embeddings turn each card and each search prompt into a
  vector; cards are ranked by how close they are in meaning (cosine
  similarity). Only card text and prompts are sent, nothing about a group.

