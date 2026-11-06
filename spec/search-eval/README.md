# The search evaluation

What `spec/search-eval.test.ts` measures search against, and how it was made
(2026-11-06, #203).

- **Prompts.** 49, written before looking at what search answers: 41 that
  people might type for food, coffee, drinks, outdoors, culture and
  activities (with "near Braddon", "near Kingston" and a rainy day among
  them), and 8 that might have no answer (Ethiopian food, casino,
  skydiving…). Whether a prompt has an answer was left to the labellers.
- **Places.** The 702 starter places as they were that day, frozen with
  their vectors in `vectors.json` (`scripts/build-search-eval.ts`), so a
  place added later doesn't move the numbers.
- **Labels.** Two labellers (Claude Sonnet 5.5 agents) worked apart from
  `INSTRUCTIONS.md`, reading all 702 places, never search's own output or
  the code: `labeller-a.json`, `labeller-b.json`. They agreed on all 8
  prompts with no answer, and on the rest with a mean Jaccard overlap of
  0.85. The 132 places only one of them listed were adjudicated one by one
  (Claude Opus 5.5, for the owner): 96 kept as `fits` (a dog-friendly
  reserve for "somewhere to take a dog", a café with all-day breakfast for
  "brunch with good eggs"), 36 dropped for missing a word of the prompt (a
  Chinese grill for "Korean BBQ", a dumpling house for "yum cha", a café
  never described as quiet for "a quiet cafe to study in"). `labels.json`
  is the result: `great` where both said great, `fits` for the rest kept.
- **Halves.** Each prompt is in one half (`half` in `labels.json`):
  answerable and no-answer prompts alternately, 21 + 4 in `dev`, 20 + 4 in
  `test`. Search may be tuned on `dev`; `test` says whether it holds.

First measured: found in the top 5 for 90% of answerable prompts, the first
card right for 85%, precision in the top 5 75%, and nothing for 7 of the 8
prompts nothing answers.

**Tuned on dev** (the same day). Two causes, both found on `dev`: function
words ("when it's raining") counted as words no card uses, so a rainy-day
prompt was taken for one with no answer, and "skydiving" (a word no card
uses, lifting 0.30) came back with trampolines. Stop words now cover them,
and the unknown-word lift moved from 0.26 to 0.32 (anything from 0.30 to
0.34 did the same on `dev`). `dev` went from 19 of 21 found to 20, 3 of 4
with nothing to 4. `test` didn't move (18 of 20 found, 4 of 4 with
nothing): the change fixes nothing there and breaks nothing. Not blind:
the first run's misses, across both halves, were seen before the split.

What's left is one kind of miss: an everyday word no card uses ("study",
"birthday", "hard") reads as asking for something no place has, so "a
quiet cafe to study in" gets nothing. Its lift (0.254) is level with
"Ethiopian food" (0.247), which rightly gets nothing, so the lift alone
can't tell them apart.
