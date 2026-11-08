# Making the outing work on the day

Decided 2026-10-25; first landed in [`02ee3f8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/02ee3f8).

**Context.** With the time set, a plan could still fall apart on the day:
the gallery shuts at five and the group arrives at half past four, or the
walk up Mount Ainslie is in the rain. Nothing on the card said so.

**Opening hours.** Overture's places, which Find searches first, have no
hours at all, so the source is OpenStreetMap's `opening_hours` tag. The
choices were to build the tags into the index (a bulk download of every
place's hours, stale by the time anyone plans) or to ask the Overpass API
about each stop of a plan. I ask: by the place's OpenStreetMap id where it
was shared from OpenStreetMap, otherwise for what's named within 100 m of
it, matched to the place's name the way Find matches names (the name is
used here and never sent). No match, or no tag, is "unknown", and unknown
says nothing. Parsing the tag is the hard part: it has week days, months,
"PH off", "sunset", comments. I used opening_hours.js (3.15.0, pinned,
LGPL-3.0, used unmodified) rather than writing a parser for the common
forms, since it's the one OpenStreetMap's own tools use, and it knows
Australia's public holidays, the ACT's included, when told the place is
in the ACT, so "PH off" is right on Canberra Day. It works in the
process's local time, so a day and its minutes go in and come out as
wall-clock fields, which keeps it Canberra's time on a UTC server.

What to check against: before the time is set, the first window offered
at its earliest start, and each window's own row is marked too, so the
owner sees the problem before picking it; once set, the set time. A
multi-stop plan doesn't say how long each stop takes, so each gets an
even share, in order. The share only decides whether to warn; the words
("closes 5pm") are the place's own hours, true whatever the split.

**Weather.** Open-Meteo: free, no key, a forecast for 16 days. Only a
stop's coordinates and the date are sent. Only Outdoors stops get one, and
an Activities stop that OpenStreetMap tags as outside (a golf course, a
zoo); beyond 16 days there's nothing to show, so nothing is.

**Politeness and speed.** A page must never wait on either service, and a
live refresh redraws the card often, so the card reads only a cache in
SQLite. It's filled in the background: when a plan starts or changes, and
when a card is drawn with something missing or stale. Each service gets
one request at a time with a pause between, a timeout, and the same
question is never asked twice at once; hours are kept a week, a forecast
three hours, and a failure an hour before it's tried again, with whatever
was known still shown. When an answer comes back, the group's pages hear
the usual "changed" and redraw.

**Testing it.** The spec mustn't reach either service, so with
`OUTING_STUB=1` the same requests go to a local stub that answers from a
table (a museum open 9 to 5, a garden shut on Mondays, a place that times
out) and logs what it was sent; the spec reads that log to check that no
member's name, group or plan ever went out.

**Between the stops.** A multi-stop outing lives or dies on the legs. A
routing service (OSRM's demo server, OpenRouteService) would give real
times, but the public OSRM server is for light, non-production use and
OpenRouteService needs a key, and both would be one more thing to call,
cache and credit for a number the group only needs roughly. So each leg
is estimated: the straight line, times 1.3 for roads (Canberra's wind
round the lake and the hills), at 40 km/h with two minutes to park, or on
foot at 4.8 km/h when the stops are under 1.5 km apart. It's said as an
estimate ("about 13 min drive · 7.2 km"), and checked against a few legs I
know (Questacon to the Mount Ainslie lookout comes out at 13 minutes).
Directions are plain links, which need no key: Apple Maps' unified URLs
on an Apple device (an iPad's browser says it's a Mac, which also has
Maps), Google Maps' everywhere else, both from wherever the person is,
through every stop in order. A link to each stop is there all along; the
whole route once the time is set, when the order is the plan.

**Near the plan.** Once the plan is set, the next question is lunch near
Questacon. Explore already holds the places the group trusts, so "Near
your plan" is a way of ordering it, not a new list: the places nearest
any stop first, each card saying how far as the crow flies (a card
saying "400 m" shouldn't pretend to be a walking route), combined with
the kind chips rather than replacing them, so Food near the plan is two
taps, or one from the card's "Find food nearby" (coffee, when a stop is
already somewhere to eat). It's a plain link (`?near`, `?kind`), so it
works without a script, and the script swaps Explore in place. Without a
plan on, there's no chip and the address does nothing.

**Trade-offs.** OpenStreetMap's hours are only as good as its mappers;
plenty of Canberra's places have none, and those say nothing. The first
person to open a card for a new stop sees it without hours, then the card
fills in when the answer lands. Trying it against the real services showed
how late that can be: the public Overpass server queued even a tiny query
for half a minute, so its timeout is a minute (nobody waits on it), and
Node's fetch gave each of Overpass's addresses only 250 ms to connect from
Canberra before giving up on all of them, so the server now gives each
2.5 s.
