# Process overview

## From the brief to Spots

My first idea was a trip itinerary, and it sounded flat: a shared list of
places and times is what a dozen planning apps already do. Then I asked
where a group outing actually goes wrong, and the answer was the group
deciding together (reflections/crit-8.md). After that the brief's three
rules were the point of the app: multi-user is the group, real-time is
everyone voting in the same room, and persistence is the list still being
there next weekend. The first working version, a group, a join link, keen
votes and a live list, was one commit,
[`1eddcc8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/1eddcc8).

## The stack, and what it costs

Spots is Astro rendering on the server, SQLite on Fly's volume, and
server-sent events for the live layer, on the one machine the course gives
([ADR 0001](docs/adr/0001-stack.md)). Every action is a plain form post,
which is what `spec/` can drive over HTTP. SQLite is one file, so it
survives restarts and redeploys with no database server. SSE is one-way,
which is all Spots needs: a browser acts through forms and only has to hear
that something changed.

The bus lives in one process, so Spots can only ever run on one machine. And
each change makes every open page read itself again. That's simple, but the
work grows with the square of the people in the room. I only saw how much
once the pressure test ran
([`7a80019`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/7a80019),
[#214](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/issues/214)):
30 people voting at once settle in about a third of a second on a laptop, 60
took 6.3 s, and 100 ran out of connections. A group of friends is far below
that, so I left it and wrote the numbers into the test.

Search by meaning needed embeddings, and 256 MB is too little to run a model
beside the app, so cards and prompts go to Voyage and are ranked by cosine
in plain JavaScript ([ADR 0002](docs/adr/0002-search-by-meaning.md)).
Without the key, search falls back to matching words. One early rule,
"everything works without JavaScript", came from the same stack choice. Once
every member needed a passkey, and so JavaScript, it only made each new
piece of UI carry a version nobody would see, and I dropped it
([`5887429`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/5887429),
[#116](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/issues/116)).

## How I worked with the agent

I decided what Spots is for and what good means, and the agent wrote most of
the code. Every change went the same way: one GitHub issue, one branch
(usually in its own worktree), and a pull request I merged only when I'd
said so. CI runs the spec on every push and deploys `main` by itself, so
nothing reaches the live site that hasn't passed. Over the project that came
to 54 merged pull requests and 304 commits on `main`.

The rules live in `CLAUDE.md`, each one following from the README's
definition of good, and `spec/` holds the ones a machine can check. For
search I didn't want one agent grading its own work. Search's 49 labelled
prompts were labelled by two Sonnet agents working apart from the code, and
a third, Opus, settled the 132 places only one of them listed, one by one
([`23d86e3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/23d86e3)).
Search was then tuned on one half of the prompts and checked on the other
half, which it never saw while tuning
([`de36cc7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/de36cc7)).

All of that is a lot of process for a small app. Some days the issue,
branch, review and merge took longer than the change itself.

## Corrections that landed in the harness

By crit 9 every vote reached every page within a second, and every vote
re-sorted the list, so in a room of people voting a keen could land on the
wrong place. I wrote down how the list should behave first
([`d1cb195`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/d1cb195),
[ADR 0004](docs/adr/0004-voting-at-once.md)), then the fix came with a rule
in `CLAUDE.md` and a test in `spec/spots.test.ts`
([`e638eca`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/e638eca)).

The free-time algorithm had a hand-worked test from the day the plan landed.
When I asked how we knew the algorithm was right, the answer was a random
check against a minute-by-minute brute force on 3000 schedules. It found
windows the algorithm missed, where a smaller set of people is free together
([#211](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/issues/211)).
The hand-worked test had the same mistake written into its expected answer.
The fix landed with the check that found it
([`4631e61`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/4631e61)).

The two-window Chrome test started its clock after the click, so 1217 ms on
CI counted as "within a second". It now times from before the tap
([`1ee835c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/1ee835c)),
and the README says "about a second", which is what CI measures.

Spots also had no logs. I noticed while writing a crit prompt for someone
else's app, which couldn't say who had done what, and then found the same
gap in mine. Now every action writes one line, never what anyone wrote, held
by `spec/log.test.ts` and a rule in `CLAUDE.md`
([`28488c9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/28488c9)).

## Where I stand on the small web

The ideas came before the reading, and the reading gave me words to argue
for them. I agree with Shirky that software for one group can lean on that
group: Spots has no ratings because the group's trust in each other's taste
does the ranking. Sloan's home-cooked app is where I part ways a little.
Spots is small and not built to grow, but it isn't home-made: it runs on
Fly, asks Voyage for search and Resend for mail. My line is that outside
services may do work for the group, never hold anything about it. Voyage
sees card text and prompts, never names or Talk. Calm technology is the idea
I followed most closely. Nothing is pushed, and what's new waits as a count
or a dot. The cost is that people have to open Spots to see it, and I've
accepted that the group chat they already have does the nudging.

## Looking back

The strongest checks came late. The brute-force check, the timing tests and
the pressure test all arrived in the last week, after the features they
check. Next time I would write the check that could prove a feature wrong in
the same pull request as the feature.