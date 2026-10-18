# CI

- Date: 2026-10-18
- PR: [#201](https://github.com/ShinyQ/ShinyQ-HQ/pull/201)

Test suite trim. Owner request: "Is there maybe other things like reducing out perf or e2e that is too much or unused". Every removed or merged check names what still guards it; no budget in `e2e/budgets.ts` or `e2e/perf/baseline.json` changes and every user flow stays. The settled lite floor budgets on deep links live only in `e2e/perf/floors.spec.ts` (issue #114); L3 poses past the arrival and the reactor run only with `LABS_SHOTS`; tier-independent label sweeps run on lite; one desktop arrivals tour covers the elevator panel and routes on every floor; layout distances move to Vitest; the full-tier memory gate warms up with Motion Reduced and measures with Motion Full. Estimated 12664 to about 10600 worker-seconds per full CI run (about 16 percent).
