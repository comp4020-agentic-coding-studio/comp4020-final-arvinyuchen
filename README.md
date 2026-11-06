# Spots

> ✍️ 大纲（#202）：每节的【要写】是给你的提示，【素材】是可以直接用或改写的英文事实。
> 你写完一节就把提示删掉。总目标 400–600 词（标题不算），每节后面写了建议字数。
> 旧版完整内容在 git 历史里；功能清单移到了 `docs/what-it-does.md`，地图和数据来源移到了 `docs/sources-and-data.md`。

Canberra is not boring! Spots helps you and your friends find good places
you might not have heard of, vote on them to see which ones most of you
want, and then pin down a time to hang out. It's for one group at a time:
friends who already trust each other's taste, like a share house, a
tutorial group, or the group chat that keeps saying "we should go
somewhere".

## Try it

【要写】约 50 词，给只拿到网址的评分人：怎么在两个浏览器里看到它工作。

【素材】
- New group → your name, an email, and a passkey (face, fingerprint or PIN) → you land on the group with its invite link.
- Open the link in a second Chrome profile or an incognito window, join as someone else.
- Add a place from Explore, vote "keen" in one window, and watch the other re-rank within a second.
- (Checked 2026-11-04: Chrome incognito can make a passkey.)

## What good means here

【要写】约 250 词：六条，每条一两句说"好"是什么，再一句说怎么保证：
"*Enforced:* …（哪个测试）" 或 "*Judged:* …（怎么判断的）"。
开头可以先一句话说明：有些能测，有些只能靠人判断，下面每条都标出来。

1. **Everyone's voice counts the same.**
   【素材】One person, one keen per place; the keen records what the button showed, so a double tap can't undo it; nobody can vote as someone else, because who you are is your passkey, never a name typed in a form.
   *Enforced:* `spec/spots.test.ts` ("counts each person once", "sets a keen to what the button showed"), `spec/accounts.test.ts` (forged and replayed passkeys refused).
2. **Deciding together is quick, and live.**
   【素材】Every vote reaches every open page within a second and the list re-ranks, each card gliding to its new place, so a group in one room decides together.
   *Enforced:* `spec/spots.test.ts` ("streams changes to the group's open pages"). *Judged:* crit 9, several people voting at once in one room (why cards glide, and a tap just after a move is ignored).
3. **The group is private; the good places are everyone's.**
   【素材】A place gets in only with a sentence on why it's good, signed by whoever shared it, and every group explores that one pool; each group's list, votes and Talk stay inside the group. The invite link shows a preview, never the list.
   *Enforced:* `spec/spots.test.ts` ("refuses a place with no reason", "shows someone with the link a preview… never the list"), `spec/talk.test.ts` ("Talk's words stay in the group").
4. **Settling when is quick, and nobody's diary is on show.**
   【素材】The owner picks a day; everyone marks only when they're busy; the card shows when everyone's free for as long as the outing takes. Others see counts and who can't make it, never anyone's busy times.
   *Enforced:* `spec/plans.test.ts` ("never shows anyone else's busy times"), `spec/free.test.ts`. *Judged:* drawing busy times on a real iPhone.
5. **A set plan holds on the day, and never guesses.**
   【素材】The card says when a stop closes or is shut that day, the forecast for an outdoor stop, and the time between stops as "about". Hours nobody recorded say nothing.
   *Enforced:* `spec/outing.test.ts` ("says nothing when the hours are unknown, never a guess").
6. **Joining costs almost nothing, and you're you on every device.**
   【素材】A link, a name, an email and a passkey; no password, no app. A second device is added with a code; lose every device and the email gets a one-time link that lets a new one make a passkey.
   *Enforced:* `spec/accounts.test.ts` (device codes, the emailed link: once, 30 minutes, signs nobody in by itself). *Judged:* crit 10, two classmates got in from the URL alone.

（可选第 7 条，字数够再加：It remembers. *Enforced:* `spec/spots.test.ts` "keeps what people add and vote for". *Judged:* coming back the next day after the machine stopped.）

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
