# Astro, SQLite and server-sent events on one machine

Decided 2026-10-07; first landed in [`1eddcc8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/1eddcc8).

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

**Later.** For a while that became a rule: signed in, everything works
without JavaScript. Once every member was a passkey account, nobody could
sign in without it, so the rule only made each new piece of UI carry a
version nobody would see. It was dropped (#116): the page's script is
assumed, and what stays is the reason the forms were chosen, every action a
plain HTTP route the spec can drive.
