# Process overview

> ✍️ 提纲（#224）：每节下面的【要写】是给你的提示，【事实】是核对过的英文事实和 commit 链接，可以直接引用。
> 写完一节就删掉那节的提示。总目标 900–1100 词（标题不算）。旧版的长篇决策已经移到 [`docs/adr/`](docs/adr/)，ADR 不算字数，这里链接过去就行。
> 课程要求：没有链接的说法不算证据，链接文字必须是 commit 哈希。

## From the brief to Spots

> ✍️ 约 120 词。
> 【要写】最初想做什么，为什么改成 Spots；作业的三条硬性要求（多人、实时、持久）在 Spots 里各变成了什么。
> 【事实】
> - First idea: a trip itinerary. The turn: a group's hard part is deciding together, not listing places (reflections/crit-8.md).
> - First working version, group + join by link + keen + live, in one commit: [`1eddcc8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/1eddcc8).

## The stack, and what it costs

> ✍️ 约 200 词。
> 【要写】为什么选 Astro 服务端渲染 + SQLite + SSE + 一台 Fly 机器；为什么搜索用 Voyage 而不是本地模型；每个选择的代价。细节链接 ADR。
> 【事实】
> - Decision and reasons: [ADR 0001](docs/adr/0001-stack.md). Every action is a plain HTTP route, which is what `spec/` drives.
> - SQLite is one file on the Fly volume: persists across restarts and redeploys, no database server.
> - SSE: one-way is all Spots needs; one process holds the bus, so one machine only.
> - Cost found later: each change makes every open page read itself again. The pressure test [`7a80019`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/7a80019) ([#214](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/issues/214)): 30 people at once settle in 0.25–0.34 s on a laptop, 60 took 6.3 s, 100 ran out of connections.
> - Search: 256 MB is too small for an embedding model beside the app, so Voyage embeddings, cosine in plain JS ([ADR 0002](docs/adr/0002-search-by-meaning.md)). Without the key it falls back to matching words.
> - The "works without JavaScript" rule, kept from the stack choice, was dropped once everyone needed a passkey (and so JavaScript) to sign in: [`5887429`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/5887429) ([#116](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/issues/116)).

## How I worked with the agent

> ✍️ 约 200 词。
> 【要写】你和 agent 怎么分工；工作流程是什么，为什么这样定；代价。
> 【事实】
> - One GitHub issue per change, one branch (often its own worktree) per issue; I open a PR and merge only when I say so; CI runs the spec on every push and deploys `main` by itself. 54 PRs merged, about 170 issues and PRs, 304 commits on `main`.
> - The rules live in `CLAUDE.md`, each derived from the README's definition of good; a change that breaks one fails review or `spec/`.
> - UI changes are looked at in a browser (phone and desktop) before they ship.
> - Search's 49 labelled prompts (41 with an answer): two Sonnet agents labelled them apart from the code (mean overlap 0.85), and Opus settled the 132 places only one listed, one by one ([`23d86e3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/23d86e3)), and search was tuned on one half and checked on the other ([`de36cc7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/de36cc7)), so the number isn't one it was tuned to.
> - Cost: many small PRs and a lot of process for a small app.

## Corrections that landed in the harness

> ✍️ 约 300 词。挑三到四个，每个讲清：出了什么错 → 怎么发现的 → 修在 `CLAUDE.md` 还是 `spec/`。
> 【事实】
> - **Cards jumping under people's fingers** (crit 9). Several people voting at once re-sorted the list on every screen, so a keen could land on the wrong place. Decided first ([`d1cb195`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/d1cb195), [ADR 0004](docs/adr/0004-voting-at-once.md)), then the rule went into `CLAUDE.md` and a test into `spec/spots.test.ts` with the fix ([`e638eca`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/e638eca)).
> - **A test that encoded the bug.** A random check of free times against a minute-by-minute brute force, 3000 schedules, found the algorithm missed windows where a smaller set of people is free together ([#211](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/issues/211)). The hand-worked expectation in `free.test.ts` had the bug written into it. Fixed with the check that found it: [`4631e61`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/4631e61).
> - **A timing test that passed when it shouldn't.** The two-window Chrome test started its clock after the click, so 1217 ms on CI passed as "within a second". Now timed from before the tap: [`1ee835c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/1ee835c).
> - **No logs** (crit 10). Writing the riff prompt for another app showed it couldn't say who did what; Spots had the same gap. One line per action, never what anyone wrote, held by `spec/log.test.ts` and a rule in `CLAUDE.md`: [`28488c9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/28488c9).
> - **A rule that stopped earning its keep.** "Works without JavaScript" made every new piece of UI carry a version nobody would see: [`5887429`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/5887429).

## Where I stand on the small web

> ✍️ 约 150 词。
> 【要写】README 里说想法先有、文章后来印证；这里讲你的立场：和 Shirky、Sloan、Weiser 哪里一致，哪里你走得不一样，为什么。
> 【事实】
> - Situated software (Shirky 2004): Spots serves one group whose trust does the ranking.
> - Home-cooked app (Sloan 2020): Spots stays small, but it still runs on Fly and calls Voyage, so it isn't purely home-made.
> - Calm technology (Weiser and Brown 1995): nothing is pushed; what's new waits on the page as a count or a dot.

## Looking back

> ✍️ 约 80 词，可选。
> 【要写】如果重来，哪些地方会换个做法。
