# Crit 10 reflection

## What was the breakthrough that moved the work forward?

The breakthrough came from someone else's app. In last week's riff my pod
wrote the crit 10 prompt for our crit agent's Colophon, and reading its code
against this brief, the gap was plain: it had no logging at all, so nobody
could say from the logs who had done what. A week later, checking my own repo
on the morning of the cutoff, Spots had the same gap. It already tells people
apart well: a member is a name in one group, or a passkey across devices, and
the server checks every action through `me()`, the owner's tools and the
admin's. But apart from two warnings about the search service, nothing writes
down who joined, voted, shared or removed someone. The checks are real but
invisible, and a narrator with only `flyctl logs` would see machines starting
and stopping, nothing else. Seeing the gap clearly in a stranger's app first is
what let me name it in my own.

## What did this work change about who I want to be as a software developer?

I didn't build the logging this week. With under two hours to the cutoff I
checked how crit 10 is marked, and chose to ship what's true now and build the
logging properly for the final project, where it matters more. I want to be
the developer who makes that call openly instead of rushing a half-done
feature in. But it's the second week running that the work started on the
morning of the cutoff, after I wrote in crit 9 that I'd run the check at the
start of the week. I want to be someone who keeps the promises in their own
reflections. For the final project that means starting the logging and the
written decision about who may see and change what this week, not the morning
it's due.
