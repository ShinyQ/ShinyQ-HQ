# Tests

- Date: 2026-10-18
- PR: [#221](https://github.com/ShinyQ/ShinyQ-HQ/pull/221)

Owner request: "Move budget and matrix checks out of the PR and main e2e into nightly-only ... Implement this as a tag (for example @nightly) plus a grep-invert on PR and main, so nothing is deleted", with "don't drop any test from the suite; tests only move between PR, main and nightly". Eight tests end their title with ` @nightly` (the L4 label sweep after its unit twin landed, the gpu boot warm-up, the day/night cost parity, the L1 full-tier headroom walk, the lite memory round trips, and the desktop variants of the end plaza labels and the L3 arrival); PRs and pushes to `main` pass `--grep-invert @nightly`, the nightly schedule and a dispatch with `nightly` run them. The perf-selection clause for gpu, daynight and highlights is not implemented (it would need the perf lane to run e2e specs): they are nightly only. Full PR and `main` e2e suite: 588 tests and 8,598 worker-s before, 580 and 7,610 after (minus 988, 11.5 percent); list and reasons in `docs/agents/performance.md`.
