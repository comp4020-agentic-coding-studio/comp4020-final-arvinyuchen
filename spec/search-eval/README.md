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
- **Held out.** The search's thresholds were tuned earlier on other prompts
  (PROCESS.md); this set is for measuring, not tuning. If search is ever
  tuned on it, split it first and measure on the half it wasn't tuned on.

First measured: found in the top 5 for 90% of answerable prompts, the first
card right for 85%, precision in the top 5 75%, and nothing for 7 of the 8
prompts nothing answers.
