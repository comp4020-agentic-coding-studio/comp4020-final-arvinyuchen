# Search by meaning, with Voyage embeddings

Decided 2026-10-07; first landed in [`56f4c19`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/56f4c19).

**Context.** I wanted people to find places the way they'd ask a friend
("cheap dumplings near Dickson"), with the answer being cards, not a chatbot's
paragraph. The machine has 256 MB, too little to run an embedding model
beside the app.

**Decision.** Each card (name, kind, suburb, the reason it was shared) is
embedded with Voyage AI's `voyage-4-lite` at 512 dimensions and stored in
SQLite. A prompt is embedded too, and cards are ranked by cosine similarity
in plain JavaScript; with hundreds of places a vector database adds nothing.
"near X" is read out of the prompt and applied as a 3 km filter, because a
vector only knows a card mentions a suburb, not where it is.

**Tuning.** My first cut-offs (keep cards scoring at least 0.3) were guesses.
Scoring real prompts showed `voyage-4-lite`'s similarities are low and
bunched: "a walk with a view" peaks at 0.21 (Mount Ainslie), while nonsense
like "xqzv blorfnik" or "tax return help" peaks at 0.11 to 0.16, and every
prompt has its own baseline ("brunch spot" scores even the worst card at
0.26). So a prompt gets no cards if its best is under 0.18, and otherwise a
card must reach 60% of the way from that prompt's median score to its best.

With 702 places that wasn't enough to say "nothing": "Ethiopian food"
(there's no Ethiopian restaurant among them) came back with Nepalese and
Greek places, its best only 0.24 above its median, which is where broad
prompts that do have answers also sit ("cheap date night" 0.16, "free
things to do" 0.17). What tells them apart is a word no card uses. Over
111 real prompts and 13 with no answer, a prompt with a word of four
letters or more that no card contains, and a lift under 0.26 (later 0.32,
#203) on meaning
alone, was always one with no answer (Ethiopian, Russian, snorkelling,
casino, beach volleyball, bingo), and no answerable prompt changed; one
with an unknown word that lifts well ("ice hockey", 0.35, finds the ice
rink) still answers.

**Trade-offs.** Card text and prompts go to a third party, and search needs
a network call; without the key or with Voyage down it falls back to matching
words, so it degrades rather than breaks. Embeddings are weak at "not" ("not
too loud" sits near "loud"), and the search is only as good as the reasons
people write.
