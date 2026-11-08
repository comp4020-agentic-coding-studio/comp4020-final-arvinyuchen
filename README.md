# Spots

Canberra is not boring! Spots helps you and your friends find good places
you might not have heard of, vote on them to see which ones most of you
want, and then pin down a time to hang out. It's for one group at a time:
friends who already trust each other's taste, like a share house, your
friends from uni, or the group chat that keeps saying "we should go
somewhere".

## Try it

1. On the home page, name your group, fill in your name and email, and make
   a passkey (face, fingerprint or PIN), which is how you sign in from then
   on. You land on the group's page with its invite link.
2. Open the link in a second Chrome profile or an incognito window, and join
   as someone else.
3. Add a place from Explore and vote "keen" in either window: the other one
   updates within a second.
4. In the owner's window, start a plan for a day. In each window, mark when
   that person is busy, and Spots suggests times long enough for the plan,
   with the most people free first, then the longest, then the earliest.

## What good means here

Spots is assessed against the characteristics of [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html): quantitatively by the spec on every push (Enforced), and qualitatively by who developed the Spots (Judged).

| Quality                                                 | What good means                                                                                                                                     | How it's tested                                                                                                                                                                                                                                                                              | Result                                                                                                                                               |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Functional suitability**                              | **Getting in:** easy sign-up and sign-in.                                                                                                           | *Enforced:* [`accounts.test.ts`][accounts]. *Judged by me*: a passkey to sign in, and an email only as insurance to recover the account, is my own design.                                                                                                                                   | —                                                                                                                                                    |
|                                                         | **Finding places:** search by a place's name, and by meaning, both fast and accurate.                                                               | *Enforced:* [`search-eval.test.ts`][search-eval]: every place's name, and 41 prompts labelled with the places they mean, checked for where the answer ranks. [`speed.test.ts`][speed]: six new prompts timed, under 600 ms required.                                                         | By name, Success@1 93% on 697 names. By meaning, Success@5 93% and Success@1 88%. About 240 ms locally with Voyage ([#206][206]).                    |
|                                                         | **Deciding:** one vote per person per place, shown live on every member's open page.                                                                | *Enforced:* [`deciding.test.ts`][deciding]: every other member's live stream timed from a vote, with six voting at once, and one person on two devices. [`two-windows.test.ts`][two-windows]: in Chrome, a phone and a desktop window, a tap in one timed until it shows in the other.       | Heard in 4 ms on CI. Every count right. Shown in the other window in 222–812 ms on CI, with no reload.                                               |
|                                                         | **Setting a time:** you mark only when you're busy, and Spots finds the most suitable time slot.                                                    | *Enforced:* [`plans.test.ts`][plans], [`free.test.ts`][free]: differential-tested against a brute-force solution on random schedules.                                                                                                                                                        | The same windows as brute force on all 3000 schedules ([#210][210]). It found one bug, now fixed ([#211][211]).                                      |
|                                                         | **Talk:** a thread on each place on the list, so what's said about a place stays beside it.                                                         | *Enforced:* [`talk.test.ts`][talk], [`talk-data.test.ts`][talk-data]: only the author can delete, with a day to undo before a deleted message is cleared. [`talk-live.test.ts`][talk-live]: timed from sending until every other member reads it, alone and with six people talking at once. | Read in 79 ms, and 145 ms with six at once, on CI.                                                                                                   |
| **Performance efficiency**                              | Pages answer quickly and fetch little before they work. The 3D map loads only once the page is idle.                                                | *Enforced:* [`speed.test.ts`][speed]: every page of a six-person group, held to 300 ms of server time and 550 KB before it works. [`pressure.test.ts`][pressure]: 30 people voting on ten places at once ([#214][214]). *Measured live:* from Canberra ([#204][204]).                        | Pages answer in 2–26 ms and fetch at most about 470 KB, on CI. Every open page up to date in 0.94 s on CI. The home page's first byte in 77 ms live. |
| **Interaction capability**                              | Desktop: main functions are in one page. Phones: each page has a core function.                                                                     | *Judged:* against [`CLAUDE.md`][claude]'s rules, on seeded groups in every plan state ([`scripts/seed-preview.ts`][seed-preview]), and at crits.                                                                                                                                             | —                                                                                                                                                    |
|                                                         | Every button's name says what it does ("I'm keen on Questacon").                                                                                    | *Enforced:* [`spots.test.ts`][spots], [`plans.test.ts`][plans]. No full accessibility audit yet.                                                                                                                                                                                             | —                                                                                                                                                    |
| **Reliability**                                         | Nothing lost: a lost passkey comes back by email, and a group is archived before it can be deleted.                                                 | *Enforced:* [`accounts.test.ts`][accounts], [`admin.test.ts`][admin].                                                                                                                                                                                                                        | —                                                                                                                                                    |
| **Security**                                            | 1. Passkeys only. 2. The link previews the group, never its votes. 3. Talk never leaves the group. 4. Logs say who did what, never what they wrote. | *Enforced:* [`accounts.test.ts`][accounts], [`spots.test.ts`][spots], [`talk.test.ts`][talk], [`log.test.ts`][log].                                                                                                                                                                          | —                                                                                                                                                    |
| **Compatibility, maintainability, flexibility, safety** | Not argued here.                                                                                                                                    | Not tested.                                                                                                                                                                                                                                                                                  | —                                                                                                                                                    |

[accounts]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/accounts.test.ts
[spots]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/spots.test.ts
[search-eval]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/search-eval.test.ts
[plans]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/plans.test.ts
[free]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/free.test.ts
[talk]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/talk.test.ts
[talk-data]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/talk-data.test.ts
[talk-live]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/talk-live.test.ts
[speed]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/speed.test.ts
[claude]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/CLAUDE.md
[seed-preview]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/scripts/seed-preview.ts
[admin]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/admin.test.ts
[log]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/log.test.ts
[204]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/issues/204
[206]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/issues/206
[210]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/issues/210
[211]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/issues/211
[214]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/issues/214
[deciding]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/deciding.test.ts
[pressure]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/pressure.test.ts
[two-windows]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/two-windows.test.ts

## What I read

The ideas came first, and reading afterwards gave three of them names.
[Clay Shirky's "Situated Software"](http://www.shirky.com/writings/situated_software.html)
(2004) is software for one group, not everyone: Spots serves one group,
whose trust in each other's taste does the ranking. [Robin Sloan's "An app
can be a home-cooked meal"](https://www.robinsloan.com/notes/home-cooked-app/)
(2020) names why it's fine for it to stay small. [Weiser and Brown's
"Designing Calm Technology"](https://calmtech.com/papers/designing-calm-technology)
(1995) names why nothing is pushed: what's new waits on the page.

## What I chose not to build

- **Passwords or "sign in with":** a passkey is the only way in.
- **Ratings or a directory:** a place gets in with a reason, shared by someone who genuinely likes it.
- **A chatbot:** search returns people's cards, never prose.
- **Booking or routing:** directions open Apple or Google Maps.
