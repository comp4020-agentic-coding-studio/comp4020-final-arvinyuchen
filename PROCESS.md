# Process overview

## The idea

The brief fixes three things: multi-user, real-time, persistent. I started
from a trip-itinerary idea, then narrowed it to **Spots**: one group of
friends exploring places and voting on where to go. What changed my mind was
asking what a group actually struggles with. It isn't listing places, it's
deciding together, which is where multi-user and real-time stop being
requirements and become the point.

## Stack decision

**Context.** One Fly machine with 256 MB and one volume at `/data`; the app
must be live by the crit 8 cutoff, with two hours to build.

**Decision.** Astro (server output, Node adapter) + SQLite (`better-sqlite3`)
on the volume + server-sent events for the live layer.

**Why.**
- Server-rendered pages with plain HTML forms work with no JavaScript, and are
  easy to test over HTTP, which is how `spec/` checks the running app.
- SQLite is one file on the volume: it persists across restarts and redeploys
  with no separate database server, which the course setup doesn't allow.
- SSE is one-way (server to browser) over plain HTTP, which is all Spots
  needs: browsers act through forms and only need to hear "something changed".
  WebSockets would add a second channel for no gain.
- I used the same shape for my crit 7 prototype, so its failure modes (CSRF
  behind Fly's proxy, the volume path) were already known.

**Trade-offs.** One process holds the SSE bus in memory, so the app can only
ever run on one machine; that's what `fly.toml` fixes anyway. A page re-fetches
itself on each change rather than receiving a diff, which is simple but heavier
with a big group.

## Search by meaning

**Context.** I wanted people to find places the way they'd ask a friend
("cheap dumplings near Dickson"), with the answer being cards, not a chatbot's
paragraph. The machine has 256 MB, too little to run an embedding model
beside the app.

**Decision.** Each card (name, kind, suburb, the reason it was shared) is
embedded with Voyage AI's `voyage-4-lite` at 512 dimensions and stored in
SQLite. A prompt is embedded too, and cards are ranked by cosine similarity
in plain JavaScript; with hundreds of places a vector database adds nothing.
"near X" is read out of the prompt and applied as a 3 km filter, because a
vector only knows a card mentions a suburb, not where it is.

**Tuning.** My first cut-offs (keep cards scoring at least 0.3) were guesses.
Scoring real prompts showed `voyage-4-lite`'s similarities are low and
bunched: "a walk with a view" peaks at 0.21 (Mount Ainslie), while nonsense
like "xqzv blorfnik" or "tax return help" peaks at 0.11 to 0.16, and every
prompt has its own baseline ("brunch spot" scores even the worst card at
0.26). So a prompt gets no cards if its best is under 0.18, and otherwise a
card must reach 60% of the way from that prompt's median score to its best.

**Trade-offs.** Card text and prompts go to a third party, and search needs
a network call; without the key or with Voyage down it falls back to matching
words, so it degrades rather than breaks. Embeddings are weak at "not" ("not
too loud" sits near "loud"), and the search is only as good as the reasons
people write.

## Accounts, by passkey only

**Context.** Group links persist (they're rows in SQLite on the volume), but
who you are in a group was only a cookie in one browser. On a second device,
or after clearing cookies, a friend joined again and became a second person,
with none of their keens. And whoever started a group had no way to look
after it.

**Decision.** Optional accounts whose only credential is a passkey
(WebAuthn, via SimpleWebAuthn): no password, no email, no third-party sign-in.
An account starts from a member already in a group, so joining is still a
link and a name. Passkeys are discoverable, so signing in needs no username;
they sync through iCloud Keychain or Google Password Manager, and a QR code
covers a phone signing in on someone else's laptop. The group's first member
is its owner, with four tools: rename, remove, merge duplicates, reset the
invite link. A reset retires the old link instead of changing the group's
id, so members following an old link are sent to the new one.

**Why not the alternatives.** A magic link by email needs a mail service, a
key and people's email addresses, and lands in spam. "Sign in with Google"
needs app registration, client secrets and a consent screen, and makes
Spots depend on someone else's account.

**Trade-offs.** Passkeys need JavaScript and a device that has them; without
both the buttons don't appear and everything else still works. Lose every
device holding the passkey and the account is gone (the groups aren't); a
second passkey on another device is the only recovery. Real Face ID can't be
driven from the test suite, so `spec/authenticator.ts` is a software
passkey that signs exactly as a device does, and the server's real
verification runs against it.

## Several people voting at once

**Context.** The moment Spots is for is a group in the same room, all voting
at once. Every keen reaches every open page within a second, and each page
swaps in the list again, sorted most keen first. So in a burst of votes the
cards keep moving: a spot jumps up just as someone reaches for the card that
was there, and their keen lands on a place they didn't mean. On top of that,
keen was a toggle on whatever the server held: a double-tap, or the same
person on their phone and their laptop (which passkeys now make normal),
could cancel their own vote.

**Options.**
1. *Re-rank live on every vote* (what it did). The ranking is always true,
   but the list moves under people's fingers exactly when the group is busiest.
2. *Re-rank live, but animate the moves* and ignore taps for a moment after
   one. Easier to follow, but cards still move while you're aiming.
3. *A stable list plus a live "top 3"*. Nothing moves under you, but the full
   list is never in rank order, which is the thing the group is deciding.
4. *Hold each person's order, offer the new one.* Counts and who's keen update
   live, but cards stay where they are until you ask for the new order.

**Decision.** Option 4. While someone is on the page, their list keeps its
order and only the counts, names and keen buttons change. When the ranking
underneath has changed, a "New order — show it" bar appears above the list,
and tapping it re-sorts. While the list is out of rank order its position
numbers are hidden, since they would be wrong. Opening or reloading the page
always shows the current ranking. A place someone adds joins the bottom of the list until then.
A keen button now sends the state it shows ("keen" or "not keen") and the
server sets exactly that, so repeating it changes nothing.

**Why.** Two parts of "What good means here" pull against each other.
"Deciding together is quick" wants the ranking live. "Everyone's voice counts
the same" means a keen has to land where the person meant it, and a vote on
the wrong card is a voice miscounted. Option 4 keeps the second without losing
the first: every count is still live within a second, and the ranking is one
tap away. The person who decides when the list moves is the one looking at it.

**Revisited (October 2026).** Using it, the held order read as a list that
was wrong until you tapped a bar, and the bar was one more thing on the
screen. The list is now always the ranking (option 2): a live change
re-ranks it at once, and each card glides from its old place to its new
one (a FLIP animation; under reduced motion they just swap), so everyone
sees what moved and why. A keen tap within about half a second of a move
is ignored, since it was aimed at whatever card was there before, and the
keen button still sends the state it shows, so a tap that does land never
undoes a vote. The New order bar and the held state are gone.
Sending the shown state fixes the same problem from the other side: the vote
records what the person saw, not whatever the server held at that moment.

**Trade-offs.** For a while, someone's screen can show a list that isn't in
rank order. They might read the top card as the favourite when it no longer
is. The bar is there for exactly this, but it only helps if people notice it.
Two people in the room can be looking at different orders, so "the second one
down" can mean different spots. Holding the order means voting stays on the
page (the keen form posts in the background), so without JavaScript the form
still works but reloads into the current ranking, as before. Two devices, one
showing keen and one not, can still disagree for up to a second. Whichever
tap arrives last wins, but it can no longer undo a vote by accident.

## Deciding when

**Context.** Spots got a group to "where", then left "when" to the group
chat, which is where plans stall: someone suggests Saturday, half reply,
nobody says what time. The group needed a time without a poll that half of
it never answers, and on a phone, since that's where the chat is.

**Options.**
1. *The owner suggests a few times and everyone votes.* Quick, but the
   owner guesses, and "none of these" is a dead end.
2. *Everyone paints when they're free over a week* (When2meet). It finds
   the overlap, but asks a lot, shows everyone's diary to everyone, and on a
   phone the painting fights the page's scroll.
3. *The owner picks a day and everyone marks when they're busy that day;*
   the app finds when people are free together, and the owner decides.

For marking busy times on a phone I mocked up four ways: a timeline of the
day, From and To rows, parts of the day (morning, afternoon, evening), and
a grid of half hours.

**Decision.** Option 3, on a timeline to the minute (at first 5-minute
steps, but a class out at 10:07 had to round, and rounding can hide a
window or make one up), and the owner says up front how long it takes
(2h unless they say). Busy rather than free, since most of a Saturday is
free: less to mark, and "I'm free all day" is one tap. The day draws the way phone
calendars do: a swipe scrolls, a tap adds an hour, a hold (400ms) then a
drag draws, and a stretch has dots to drag and exact times behind a tap.
Without a script the same sheet is From and To rows. The card lists only
times at least as long as the plan takes: when everyone is free, longest
first, then a longer time that most can make. At first there was no
shortest time, a 15-minute overlap marked in gold; but a time the outing
doesn't fit in isn't a choice, so now it isn't offered, and when nothing is
long enough the card says so ("No 2h stretch works for 2 or more"), with
the longest there is, and the owner can make it shorter. Only times when
at least two are free count. A start the owner picks ends that long after;
an exact time can still be typed. The sheet first asked for the hours to
count as well, a start and an end, but with how long asked that's one
question too many: the hours fold away under it, 8am to 11pm (so night
is never "free"), shown in grey with Change. The owner can set a time whenever they like,
and is nudged once everyone's in. After that, someone changing their times
tells only the owner, with a time to move to, or Keep.

**Why.** "Deciding together is quick": one day, one sheet, and the overlap
worked out instead of argued. "Everyone's voice counts the same": each
person's times weigh the same, and the owner sees who can't make each
time, so nobody is quietly left out. The group is private, and inside it
each person's diary is too: the card says how many are free and who can't
come, never what anyone is doing. Telling only the owner after the time is
set keeps a settled plan from buzzing the whole group again.

**Trade-offs.** The owner decides alone; the others have their say only
through their times. Counts can still give someone away in a small group (if
two have answered and one is busy, the other knows who), so the timeline
hides the others' strip until two others have answered, but the card's
counts can't avoid it entirely. A hold to draw is harder to discover than
painting, so the empty day says how. Moving the plan to another day starts
everyone's answers again (the old plan is kept, called off); other hours
or another length keep them. A length set too long hides every time until
the owner shortens it, so the card says what the longest is. Times are
Canberra's, so someone away sees Canberra times. The hold and drag needs
checking on a real iPhone: Safari decides scrolling from the first touch,
and the drag relies on stopping the page's scroll once a hold has armed.
To the minute, a finger moves a few minutes a millimetre, so a drag on the
timeline lands on 5 minutes (counted from the plan's start) and says its
from–to on itself as it goes; exact minutes are typed in a stretch's exact
times. A stretch at an odd minute keeps its length when moved.

## How I worked with the agent

- I chose the idea and the audience; the agent offered options and pushed
  back on the generic version (a city guide is the "median answer").
- I set the rules in `CLAUDE.md` from the definition of good in `README.md`.
- The agent built the first version; I checked it in a browser and against
  `spec/`.
