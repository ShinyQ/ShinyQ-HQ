# Ask the HQ

- Date: 2026-10-19
- PR: [#238](https://github.com/ShinyQ/ShinyQ-HQ/pull/238)

Evals use under 20% of the 10,000 free daily Workers AI neurons that production Ask shares. On 2026-10-18 a local `--cli` run of the full golden, red-team and suggestion sets (418 Gemma calls, 7,867 neurons) and the nightly eval (310 calls, 5,746 neurons) used about 14,600 neurons, so production fell back to Groq and the next day's quota stayed exhausted. Decided: the nightly `ask-eval.yml` runs only a fixed 20-question smoke set on the primary Workers AI model (golden, red-team, Rover voice and adjacent cases; about 800 neurons) and runs golden, red team and a daily seventh of the curated pills on the Groq backup models; every Workers AI eval run prints its estimated neurons first and stops above 2,000 unless `--budget` allows more. Runbook section 9a.
