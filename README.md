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

> ✍️ 分类草稿（约 250 词，全文才能压在 600 内）：三类，每条一句话加证据。事实和测试都对过了，请改成你自己的说法，改完删掉这行。

Each part is easy and holds up, the pages are quick, and it all looks like
one thing. The spec checks the first two on every push (*Enforced*);
people judge the third (*Judged*).

**Easy, and it holds up**

- **Getting in:** a name, an email and a passkey; a new device joins by a
  code, a lost passkey by an emailed link. *Enforced:* `accounts.test.ts`. *Judged:* at crit
  10, two classmates joined from the URL alone.
- **Sharing:** one button, or a QR code; the link previews the group,
  never its votes. *Enforced:* `spots.test.ts`.
- **Finding places:** cards, not prose. Of 49 labelled prompts, 93% get a
  right place in the top five, and all 8 with no answer get nothing.
  *Enforced:* `search-eval.test.ts`.
- **Deciding:** one keen each, live everywhere within a second.
  *Enforced:* `spots.test.ts`. *Judged:* at crit 9, a room voting at once.
- **Setting a time:** you mark only when you're busy; others see who can
  come, never why. *Enforced:* `plans.test.ts`, `free.test.ts`.
- **On the day:** closing times and forecasts, never a guess.
  *Enforced:* `outing.test.ts`.
- **Talk:** a thread per place; its words never leave the group.
  *Enforced:* `talk.test.ts`.
- **Nothing lost:** the owner can give someone who lost every passkey their
  old self back; logs say who did what, never what they wrote. *Enforced:* `accounts.test.ts`,
  `log.test.ts`.

**Quick**

- Server time under 300 ms a page, under 550 KB before it works; the 3D
  map waits until the page is idle. *Enforced:* `speed.test.ts`.
  *Judged:* the live home page's first byte in 77 ms (#204).

**One look**

- One palette, every map the invite's, phones first, motion only to show
  where things go. *Judged:* against `CLAUDE.md`'s rules, on seeded groups
  in every plan state (`scripts/seed-preview.ts`), and at crits.

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
