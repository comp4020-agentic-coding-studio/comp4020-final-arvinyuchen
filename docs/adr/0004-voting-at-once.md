# Several people voting at once

Decided 2026-10-14; first landed in [`d1cb195`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/d1cb195).

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

On a wide screen the group's page first made each column a screen tall,
scrolling on its own, like an app's panes. With a long list that put Our
list in a small box under the plan. Next the list was as long as it is
and the page scrolled it, the header and Explore with the map staying put
beside it; but a scroll outside the columns moved only the left one, and
their tops came apart. Now the page is the window and never scrolls, and
each column scrolls on its own, the left one whole (the group's panel, the
plan and every row together), so the list is never a small box under a
panel that stays, the tops stay level, and the map is always there for a
tapped place.

The rows themselves were tidied after. The keen button said "3 I'm keen",
then "1 Keen!" once tapped, changing width under the finger and squeezing
names onto two lines; it's now one fixed width saying "3 keen" either way,
filled with a tick when it's yours, its spoken name the action ("I'm keen
on Questacon" / "Not keen on Questacon any more"). The leader's bigger
photo put its name at another x than the rest; now every row has the same
columns and the leader says so with "Most keen" and a size-up name. And a
stop of the plan was a bold blue line of its own competing with the
button; it's now "Parkes · Thu 29, stop 1" in the suburb's grey.
