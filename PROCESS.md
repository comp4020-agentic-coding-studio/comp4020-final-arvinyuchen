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

## How I worked with the agent

- I chose the idea and the audience; the agent offered options and pushed
  back on the generic version (a city guide is the "median answer").
- I set the rules in `CLAUDE.md` from the definition of good in `README.md`.
- The agent built the first version; I checked it in a browser and against
  `spec/`.
