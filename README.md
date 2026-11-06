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

> ✍️ 压缩草稿（约 200 词）：意思和测试都对过了，请改成你自己的说法，改完删掉这行。

Some of this the spec checks on every push; some only people using it can
judge. Each point says which.

- **Everyone's voice counts the same.** One keen per person per place, and
  who you are is your passkey, never a name typed into a form.
  *Enforced:* `spec/spots.test.ts`, `spec/accounts.test.ts`.
- **Deciding together is quick and live.** A vote reaches every open page
  within a second, and the list re-ranks, each card gliding to its new
  place. *Enforced:* `spec/spots.test.ts`. *Judged:* at crit 9, by several
  people voting at once in one room.
- **The group is private; good places are shared.** A place gets in only
  with a reason, signed by whoever shared it, and every group explores that
  pool; a group's list, votes and Talk never leave it.
  *Enforced:* `spec/spots.test.ts`, `spec/talk.test.ts`.
- **Settling when is quick, and nobody's diary is on show.** Everyone marks
  only when they're busy; the others see who can come, never why.
  *Enforced:* `spec/plans.test.ts`, `spec/free.test.ts`.
- **A plan holds on the day, and never guesses.** The card warns when a stop
  closes early or rain is likely, and hours nobody recorded say nothing.
  *Enforced:* `spec/outing.test.ts`.
- **Joining costs almost nothing.** A link, a name, an email and a passkey,
  no password and no app; a lost device comes back by a code or an emailed
  link. *Enforced:* `spec/accounts.test.ts`. *Judged:* at crit 10, two
  classmates got in from the URL alone.

## What I read and looked at

【要写】约 120 词：每个来源一句话说它让你做了什么决定，不要只列名字。

【素材】（都已核实过）
- Clay Shirky, "Situated Software" (2004), http://www.shirky.com/writings/situated_software.html — software built for one particular group, leaning on the trust it already has. → why Spots is for one group of friends, not a city: the group's trust is the ranking.
- Robin Sloan, "An app can be a home-cooked meal" (2020), https://www.robinsloan.com/notes/home-cooked-app/ — an app for his family, kept simple, used by nobody else. → small is the point; no growth features.
- Maggie Appleton, "Home-Cooked Software and Barefoot Developers" (2024), https://maggieappleton.com/home-cooked-software — local software for the long tail of needs industrial software ignores. → （可选）
- Mark Weiser and John Seely Brown, "Designing Calm Technology" (1995), https://calmtech.com/papers/designing-calm-technology — information at the edge of attention, pulled to the centre when wanted. → no push: what's new waits on the page (a count, a dot, "N new").
- What I compared: When2meet and Doodle (painting free time shows everyone's diary; a poll of guessed times); map and review apps (strangers' stars, one person's saved places); how my own friends decide now (a long thread, a poll half never answer).

## What I chose not to build

【要写】约 80 词：五条，每条半句理由。

【素材】
- **Passwords and "sign in with".** An account is a name and a passkey; the email only ever brings a link back in, never signs anyone in.
- **Public ratings and a directory of everything.** Spots is about what this group thinks; places get in with a reason, nothing imported in bulk.
- **A chatbot that writes recommendations.** Search answers with people's own cards, never generated prose about places nobody vouched for.
- **Push notifications and a group chat.** The group already has a chat; Talk is one short thread per place, and you find out on the page.
- **Booking and routing.** Directions hand the stops to Apple or Google Maps; the time between stops is said as an estimate.
