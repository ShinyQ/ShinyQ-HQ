# Memory-Full Split Implementation Plan

Status: on hold (owner held it on 2026-10-18; branch `feat/memory-full-split` stays unpushed).

**Goal:** Owner request: "Split memory-full into 2 or 3 parallel parts that keep the same total coverage (for example by floor groups or round-trip halves), so the main wall floor drops from about 12 min. memory-full stays on main and on PRs that touch memory paths. Not nightly-only." No test leaves the suite; the gate keeps its budget.

**Architecture:** `e2e/perf/memory-full.spec.ts` becomes `GPU_MEMORY_BUDGET.fullTierParts` (3) independent tests, one per round trip of `fullTierRoundTrips` (3). Each part runs the unchanged baseline procedure on its own fresh page (enter on the full tier with Motion Full, the Motion Full warm-up tour L2, L3, L4, RF, L1, one shaped Lobby to Roof trip, settled baseline) and then measures its share of the trips (1) against the same gates (zero growth in geometries, textures and programs, JS heap growth under 2 MB). Parts are separate tests, so the duration-balanced perf shards (`scripts/e2e-shard.ts`) place them on different workers and runners.

**Tech Stack:** Playwright (SwiftShader in CI), Vitest, Bun.

## Evidence (main run 39116733269)

- Perf shards: 10.5, 9.3, 12.1 and 10.4 min jobs (8.6 to 11.2 min of tests on 2 workers each).
- `memory-full`: 9.6 min (boot, 7 baseline rides, 3 measured trips = 13 Motion Full rides, about 41 s each). It sat on shard 1 with only the 53 s bytes gate, so one worker idled about 8.7 min.
- Shard 3 (12.1 min) was the wall floor of that run, not the memory shard: the perf entries of `e2e/durations.json` are stale (the full-tier floor gates ran 3.4 to 4.0 min against 156 to 174 s estimates).

## Design choice: round-trip thirds

- Floor groups would change what each part measures (shorter trips than Lobby to Roof) and every part still needs the whole Motion Full warm-up tour: a Lobby to Roof ride mounts the floors next to both ends, and a reduced warm-up missed objects in CI (#201, #203). So the warm-up is the fixed cost of a part either way.
- Round-trip thirds keep the exact procedure, floors, trip shape and gates. Per part: boot plus 9 rides, about 6.9 min estimated (the 13-ride test took 9.6 min).
- Cost: the warm-up repeats per part, about 20.6 worker-min for the gate instead of 9.6. Trade-off: no full-tier part runs 3 consecutive trips; a per-trip leak still shows after the first trip (the budget's design point), and `e2e/memory.spec.ts` keeps 10 consecutive Lobby to Roof round trips on lite in the regular suite.

## Tasks

### Task 1: Split the spec

**Files:** `e2e/budgets.ts`, `e2e/perf/memory-full.spec.ts`

- [x] `GPU_MEMORY_BUDGET.fullTierParts: 3`; `fullTierRoundTrips` stays the total (3); the spec asserts it divides evenly.
- [x] One test per part, titled `... round trips leave renderer memory at its baseline (part N of 3)` (still matched by the `memory` key of `scripts/perf-plan.ts`).

### Task 2: Report entries

**Files:** `scripts/perf-report.ts`, `tests/unit/perf-report.test.ts`

- [x] The memory perf entry gets an optional `part`; its id becomes `memory-full-<part>` so the parts do not overwrite each other in the merged summary; the summary table names the part.

### Task 3: Planner and durations

**Files:** `tests/unit/perf-plan.test.ts`, `e2e/durations.json`

- [x] The perf title list expands the part loop; every part title matches the `memory` grep.
- [x] Replace the refreshed `memory-full` duration (558 s median, #214) with one estimate per part until CI timings exist: boot plus 9 of the 13 rides, about 45 + 9 x 39.5 = 400 s.

### Task 4: Docs

**Files:** `docs/agents/performance.md`, `docs/features.md`, `docs/decisions.md`, `docs/superpowers/README.md`

- [x] Current rule in `performance.md`; dated owner decision row; plan index row.

### Task 5: Verify

- [x] `bun run verify:quick`.
- [x] `E2E_PORT=<port> bun run e2e:perf -- --grep "round trips leave renderer memory"`: every part passes; record per-part durations.
