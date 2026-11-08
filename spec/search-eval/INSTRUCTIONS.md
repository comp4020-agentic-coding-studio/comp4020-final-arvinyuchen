# Labelling Spots search prompts

Spots is a website where a group of friends in Canberra finds places to go together. Its Explore search takes a prompt like "cheap dumplings" or "a walk with a view" and answers with place cards. We are building a fixed test set to measure that search. You label, for each prompt, which places are right answers. You never see the search's own output, so your labels must come from the places themselves.

## Files (read-only)
- `places.jsonl`: 702 places, one JSON object per line: `key`, `name`, `kind` (food, coffee, drinks, outdoors, culture, fun = activities), `area` (suburb), `why` (one sentence on why it's good).
- `prompts.json`: 49 prompts. Each has `text`. For a "near X" prompt, `pool` lists the only place keys allowed for it (those within 3 km of X); judge only those.

## What to do
1. Read ALL of `places.jsonl` first, every line. Don't rely on keyword search alone: "a walk with a view" fits a lookout described as "panorama from the summit".
2. For each prompt, list every place that answers it, in two grades:
   - `great`: a local friend asked this prompt would happily name it; it squarely matches what's asked.
   - `fits`: it does what's asked, but isn't a natural first answer (a general museum for "history of Canberra", a pub with a small courtyard for "a pub with a beer garden", a café that also does pastries for "bakery with great pastries").
   - Anything else is left out.
3. Judge from the place's name, kind, suburb and reason. Use your own knowledge of a real Canberra venue only when you're sure of it (for example, that a named place is a Korean BBQ restaurant). Never guess.
4. Every word of the prompt counts. "cheap dumplings": dumplings, and nothing that reads as expensive. "indoor rock climbing": indoors. "Korean BBQ": Korean barbecue, not any Korean place (those can be `fits`). "late night food after drinks": open late or known for late eating.
5. If nothing in the list answers a prompt, give empty lists. Several prompts may well have no answer; don't stretch to fill them.
6. Be complete: for a broad prompt list all that fit, even 30 or more.

## Output
Write ONE file (path given in your task) with this exact shape, every prompt present, keys exactly as in `places.jsonl`:

```json
{
  "cheap dumplings": { "great": ["key-a", "key-b"], "fits": ["key-c"], "note": "one short line on anything hard" },
  ...
}
```

Then check the file: valid JSON, 49 prompts, every key exists in `places.jsonl`, no key in both lists of the same prompt. Report back only: the file path, how many prompts have no answer, and up to five prompts you found hardest and why. Don't paste the labels.
