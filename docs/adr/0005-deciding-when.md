# Deciding when: busy times, and the free windows they leave

Decided 2026-10-23; first landed in [`33a00e3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/33a00e3).

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
the longest there is, and the owner can make it shorter. Later a group
saw only "6 of 7" times for its 4h plan while all seven were free for
3h 30m: still never offered, but now named above the list ("Everyone's
free 1–4:30pm, 30 min short"), with "Make it
3h 30m" for the owner, so the trade between length and everyone is in
view rather than hidden. Only times when
at least two are free count. A start the owner picks ends that long after;
an exact time can still be typed. The starts were first a row of chips
every half hour inside the chosen window, with "Other…" listing every 5
minutes; that was a lot to scan and still not to the minute. Now a window
offers its earliest start as one chip and, beside it, the same time field
to type or swipe as the sheet's, held between that start and the latest
that still fits; the ring on the strip and "Set it" follow it as it
turns. "Other…" kept only its other half, the windows past the best few,
now behind "N more windows"; an exact time stays, as the only way to a
time outside every window or a different end, but as "Set exact time" in
the owner's ··· menu rather than a fold on the card. Then the card itself
was cut to say each thing once: "Thu 29 Oct · 8am–11pm · 4h" under the
title became "4h" (the tile has the date), "7 of 8 filled in · Ivy hasn't
yet" became "Waiting on Ivy", "6 of 7 free · Kai can't" became "Kai
can't" beside its 6/7, and the "So far" header, the ring's key and "Start
between …" went, the last kept only for screen readers. The sheet first asked for the hours to
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

Later a plan became one outing that can take in several places, in order
(the National Gallery, then Questacon), with one length for all of it
rather than one each: the group still settles one time, and the stops
just say where it goes. They're chosen by tapping, each numbered as
tapped (without a script, ticked, in the list's order), one to five. A
stop's place taken off the list drops that stop, the rest moving up,
rather than calling off a whole outing for one part of it; the last one
going calls it off. A plan is made once the list has settled, so while
one is on, its stops stay put: a member can't take one off, even one they
added (a grey lock sits where the red minus would be); only the owner can, and
once the plan is called off or its day has gone the usual rules are
back. There's no "Went" mark after. The stops live in their own table beside the plan,
which keeps its first place as before, so plans from before read the
same.
