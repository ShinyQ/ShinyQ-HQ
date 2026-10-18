# E2E Shard Balance Implementation Plan

Status: shipped in #228, 2026-10-19.

**Goal:** Owner request: "balance the e2e shards (duration-sized greedy packing with the refreshed durations.json, or split the longest specs) so complement and full runs finish evenly. Fold that into PR 2 or a small separate PR." Target: under about 1.5 min between the fastest and slowest shard.

**Architecture:** Find the cause in CI logs first, then fix what a static plan can fix: worker-aware packing in `planShards`, a runner fingerprint in each shard log, and runner-speed-normalized medians in `bun run e2e:durations`.

**Tech Stack:** Bun scripts, Vitest, GitHub Actions logs.

## Evidence (7 runs on 2026-10-18)

Runs: main full runs 39109321428, 39112074274, 39114729615, 39116733269, 39119431246; complement 39125181678. Per shard: the planner's estimate, the sum of the list reporter's test times, the Playwright wall time and the job time.

- Complement 39125181678: all 8 shards planned at 1038 worker-s; actual 693 to 1182 worker-s, jobs 6.6 to 10.8 min.
- Main 39116733269: planned about 1004 worker-s each (durations before #214); shard 3/8 holds 1290 s by today's medians, so part of its 12.0 min was stale estimates (#214 refreshed them).
- Inside one shard every spec runs at about the same speed factor (tight IQR of the per-test ratio to its median), and the factor differs by shard: 0.65 to 1.21 across 48 shard jobs, for example complement 7/8 at 0.67 (IQR 0.57 to 0.75) next to 4/8 at 1.13. That is runner CPU speed (SwiftShader is CPU-bound), not test estimates.
- Not causes: no retries or failed attempts in any shard; Playwright wall time equals the test sum over 2 workers within 0.2 min (no serial pinning, no idle tail); setup is a constant 30 s.

Conclusion: a static plan cannot see runner speed, so the spread stays about 3 min on 9 to 10 min shards. Dynamic claiming of a shared tail pool would meet the target but needs `contents: write` on jobs that run PR code (owner decision pending); more shards raise concurrency. Both stay out of this PR.

## Tasks

### Task 1: Worker-aware packing

**Files:** `scripts/e2e-plan.ts`, `scripts/e2e-shard.ts`, `tests/unit/e2e-plan.test.ts`

- [x] `planShards(tests, total, durations, workers)`: longest first onto the least loaded of `total x workers` workers; `CI_WORKERS_PER_SHARD = 2` (a constant, so every shard computes the same plan). One worker per shard keeps the old plan.
- [x] `shardWallSeconds`: the estimate on 2 workers, logged next to the worker-seconds and in `--dry`.

### Task 2: Runner fingerprint

**Files:** `scripts/e2e-shard.ts`, `scripts/e2e-plan.ts`

- [x] Each shard logs `runner: <vCPUs> x <CPU model>, sha256 <n> MB/s`; `parseRunnerLine` reads it back.

### Task 3: Normalized medians

**Files:** `scripts/e2e-plan.ts`, `scripts/e2e-durations.ts`, `e2e/durations.json`

- [x] `runnerSpeedFactors` / `normalizeRunnerSpeed`: each job's median ratio (samples of at least 5 s, at least 5 of them) to the tests' medians; samples are divided by it before `medianDurations`.
- [x] `e2e:durations` skips runs without test results (a complement run on main can run none) and prints each job's factor and runner.
- [x] Refresh `e2e/durations.json`: `--event push --runs 10` (only one green nightly run exists and it predates B1; the 10 push runs with tests are 39109321428 to 39146622848, 80 e2e shard jobs, factors 0.63 to 1.23). The 8 `@nightly` keys take the median of their untagged titles, as #221 renamed them.

### Task 4: Docs and verification

- [x] `docs/agents/performance.md`, `docs/agents/folder-layout.md`, `docs/decisions/2026-10-18-ci-e2e-shard-balance-runner-speed.md`.
- [x] `bun run verify:quick`; then a full CI run (`full-ci` label) and a complement dispatch, reporting each shard's job time, factor and runner.

## Results

| Run | E2E shard jobs | Spread |
|---|---|---|
| Before: main 39116733269 (full) | 9.3 to 12.0 min | 2.7 min |
| Before: complement 39125181678 | 6.6 to 10.8 min | 4.2 min |
| After: full 39154907061 (`full-ci` on #228) | 7.5 to 9.9 min | 2.4 min |
| After: complement 39157121496 (`complement_pr=229`) | 6.5 to 10.0 min | 3.5 min |

- The plans are even (469 to 472 s planned wall per e2e shard); the residual spread is the runners. The speed factor follows the CPU model in the new fingerprint: AMD EPYC 7763 1.03 to 1.11, Intel Xeon Platinum 8573C 0.95 to 1.0, Intel Xeon 6973P-C 0.73 to 0.80, AMD EPYC 9V45 0.58 to 0.72.
- Perf lane on the complement dispatch (4 shards): the `memory-full` shard (10.6 min) is the floor; the others finish at 5.5 to 6.9 min.
