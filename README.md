# Spots

> ✍️ 大纲（#202）：每节的【要写】是给你的提示，【素材】是可以直接用或改写的英文事实。
> 你写完一节就把提示删掉。总目标 400–600 词（标题不算），每节后面写了建议字数。
> 旧版完整内容在 git 历史里；功能清单移到了 `docs/what-it-does.md`，地图和数据来源移到了 `docs/sources-and-data.md`。

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

> ✍️ 表格草稿：按 ISO/IEC 25010:2023 的质量特性分，中列说什么算好，右列说怎么验证。事实和测试都对过了，请改成你自己的说法，改完删掉这行。

Spots is assessed against the characteristics of [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html): quantitatively by the spec on every push (Enforced), and qualitatively by people using it (Judged).

| Quality                                                 | What good means                                                                                                                                | How it's tested                                                                                                                                                                                                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Functional suitability**                              | **Getting in:** easy sign-up and sign-in.                                                                                                      | *Enforced:* [`accounts.test.ts`][accounts]. *Judged by me*: a passkey to sign in, and an email only as insurance to recover the account, is my own design.                                                                                                              |
|                                                         | **Sharing:** one button sends the invitation.                                                                                                  | *Enforced:* [`spots.test.ts`][spots].                                                                                                                                                                                                                                   |
|                                                         | **Finding places:** search by a place's name, and by meaning; both fast and accurate.                                                          | *Enforced:* [`search-eval.test.ts`][search-eval]: by name, Success@1 93% on 697 names; by meaning, Success@5 93% and Success@1 88% on 41 labelled prompts. [`speed.test.ts`][speed]: under 600 ms is required; about 240 ms measured locally with Voyage ([#206][206]). |
|                                                         | **Deciding:** one vote per person per place, shown live on every member's open page.                                                           | *Enforced:* [`spots.test.ts`][spots].                                                                                                                                                                                                                                   |
|                                                         | **Setting a time:** you mark only when you're busy; Spots finds the most suitable time slot.                                                   | *Enforced:* [`plans.test.ts`][plans], [`free.test.ts`][free].                                                                                                                                                                                                           |
|                                                         | **Talk:** a thread per place on the list avoiding swapping between apps.                                                                       | *Enforced:* [`talk.test.ts`][talk].                                                                                                                                                                                                                                     |
| **Performance efficiency**                              | Under 300 ms of server time a page, under 550 KB before it works; the 3D map waits until the page is idle.                                     | *Enforced:* [`speed.test.ts`][speed]. *Judged:* the live home page's first byte in 77 ms ([#204][204]).                                                                                                                                                                 |
| **Interaction capability**                              | One look: one palette, every map the invite's, phones first, motion only to show where things go.                                              | *Judged:* against [`CLAUDE.md`][claude]'s rules, on seeded groups in every plan state ([`scripts/seed-preview.ts`][seed-preview]), and at crits.                                                                                                                        |
|                                                         | Every button's name says what it does ("I'm keen on Questacon").                                                                               | *Enforced:* [`spots.test.ts`][spots], [`plans.test.ts`][plans]. No full accessibility audit yet.                                                                                                                                                                        |
| **Reliability**                                         | Nothing lost: a lost passkey comes back by email, or the owner merges the old self into the new; a group is archived before it can be deleted. | *Enforced:* [`accounts.test.ts`][accounts], [`admin.test.ts`][admin].                                                                                                                                                                                                   |
| **Security**                                            | Passkeys only; the link previews the group, never its votes; Talk never leaves the group; logs say who did what, never what they wrote.        | *Enforced:* [`accounts.test.ts`][accounts], [`spots.test.ts`][spots], [`talk.test.ts`][talk], [`log.test.ts`][log].                                                                                                                                                     |
| **Compatibility, maintainability, flexibility, safety** | Not argued here.                                                                                                                               | Not tested.                                                                                                                                                                                                                                                             |

[accounts]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/accounts.test.ts
[spots]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/spots.test.ts
[search-eval]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/search-eval.test.ts
[plans]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/plans.test.ts
[free]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/free.test.ts
[talk]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/talk.test.ts
[speed]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/speed.test.ts
[claude]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/CLAUDE.md
[seed-preview]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/scripts/seed-preview.ts
[admin]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/admin.test.ts
[log]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/blob/main/spec/log.test.ts
[204]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/issues/204
[206]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/issues/206

## What I read and looked at

> ✍️ 草稿（约 85 词）：请改成你自己的说法，改完删掉这行。

[Clay Shirky's "Situated Software"](http://www.shirky.com/writings/situated_software.html)
(2004) is why Spots serves one group, not a city: the group's trust in each
other does the ranking. [Robin Sloan's "An app can be a home-cooked
meal"](https://www.robinsloan.com/notes/home-cooked-app/) (2020) is why it
stays small, with nothing built for growth. [Weiser and Brown's "Designing
Calm Technology"](https://calmtech.com/papers/designing-calm-technology)
(1995) is why nothing is pushed: what's new waits on the page as a count or
a dot. I also compared When2meet, which shows everyone's diary, so Spots
asks only when you're busy, and review apps, which rank places by
strangers' stars.

## What I chose not to build

> ✍️ 草稿（约 45 词）：请改成你自己的说法，改完删掉这行。

- **Passwords or "sign in with":** a passkey is the only way in.
- **Ratings or a directory:** a place gets in with a reason.
- **A chatbot:** search returns people's cards, never prose.
- **Push or a group chat:** the group already has one.
- **Booking or routing:** directions open Apple or Google Maps.
