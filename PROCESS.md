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

## How I worked with the agent

- I chose the idea and the audience; the agent offered options and pushed
  back on the generic version (a city guide is the "median answer").
- I set the rules in `CLAUDE.md` from the definition of good in `README.md`.
- The agent built the first version; I checked it in a browser and against
  `spec/`.
