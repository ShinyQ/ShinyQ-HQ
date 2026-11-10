# CI: test suite pruning and PR perf gates

- Date: 2026-11-11

The owner approved an aggressive pruning of the test suite and a faster PR pipeline, with the protection of the
critical paths kept (content safety, Ask security, routes and SEO, i18n parity, the no-WebGL Classic site,
accessibility, deploy and rollback, and the 3D memory, byte and draw-call gates on `main` and in the nightly).
On pull requests the 3D perf gates run only for 3D code and 3D assets: a content module under `src/content/` that the
3D roots import moves only the 3D bytes gate plus its own rule's keys, not the whole lane (run 42862856057, a
content PR, spent 12 to 13 min on 4 perf shards for `src/content/tech-rings.ts`; replayed over the last 100 merged
PRs, 10 of 72 selective runs leave the whole lane and the selective perf worker-seconds drop from 144,715 to
104,217). `main` (the complement run) and the nightly still run every gate, thresholds unchanged. Second
viewports and tiers of six e2e behaviors moved to the nightly (the arrival flag program check, 333 worker-s, among
them), duplicate e2e and unit cases were deleted, the slowest unit files stopped repeating work, the two recurring
CI flakes (the boot cover poll and the first-person hover pick) were fixed at the source, `e2e/durations.json` was
refreshed from the last five green nightlies, and Stryker joined as a dev-only tool for scoped mutation testing
before tests are pruned (`bun run mutation`).
