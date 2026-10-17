# Test Suite Trim Implementation Plan

Status: in review.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut CI runner-minutes of the e2e and perf lanes by removing duplicated, over-sampled and unit-testable e2e checks, without dropping a budget gate or a user flow and without changing a budget.

**Architecture:** Evidence first: refresh `e2e/durations.json` from the last 5 green `main` runs, list the CI tests (`playwright test --list`, perf lane with `--grep-invert "@nightly|@look"`) and sum their median seconds per file. Every removal names what still guards the behavior (another e2e, the perf lane or a Vitest). Pose sweeps far under budget move to the capture modes (`LABS_SHOTS`); tier-independent checks run on lite; the issue #114 duplicates of `e2e/perf/floors.spec.ts` lite go.

**Tech Stack:** Playwright (SwiftShader in CI), Vitest, Bun.

## Global Constraints

- No em dashes anywhere (code, docs, commits, PR text).
- `e2e/budgets.ts` and `e2e/perf/baseline.json` do not change; no threshold is lowered.
- Every budget gate (draw calls, triangles, programs, bytes, memory growth) and every user-flow test stays.
- `scripts/ci-plan.ts` and `.github/workflows/` stay out of this PR; `scripts/e2e-plan.ts` RULES follow any moved check.
- One PR; conventional commits; `bun run verify:quick` and `bun run e2e:changed` before pushing.

## Evidence (CI medians, runs 39055045013 and the 4 green `main` runs before it)

Baseline: e2e lane 9453 worker-s (600 tests), perf lane 3211 worker-s (29 tests), 12664 worker-s in total (211 runner-minutes at 2 workers per shard counted as worker-time).

- L3 poses (`labs-paths`, run 39055045013): every pose sits at 44 to 67 scene calls and 14.6k to 18.1k triangles against 150 and 30k. Arrival (66 full, 59 lite) and the reactor (67 full) are the highest.
- L1 hall walk (`highlights`): full is lite plus 2 scene calls at every spot (spawn 86/84, gate 75/73, (20, 15) 55/53, station pads 45/44) against the L1 cap 125.
- L4 label placement (`src/experience/floors/library/signPlacement.ts`, `decor/useEndSignPlacement.ts`) has no quality-tier input: the desktop sweep does not need the full tier.

## Tasks

### Task 1: Refresh durations

- [x] `bun run e2e:durations` (5 green `main` push runs); commit `e2e/durations.json`.

### Task 2: labs-paths keeps arrival and the reactor

**Files:** `e2e/labs-paths.spec.ts`

- [x] Desktop full and phone lite keep the arrival test (view, signs, boards, mirror, budget); desktop full keeps the reactor drive (the highest drive pose and the only full-tier L3 budget away from the arrival).
- [x] The other poses (3 entrances, 3 board stops, reactor approach and top, and the phone reactor) run only with `LABS_SHOTS=<dir>`. Still guarded: `tests/unit/labs-layout.test.ts` (mirror, board stops reachable along the spine), `labs-arrival.test.ts` (boards apart and whole), `labs.spec`/`labs-data.spec` board drives, `production.spec` L3 budget at the Ops room beside the reactor, perf `floors` L3.

### Task 3: tier-independent label sweeps on lite

**Files:** `e2e/library-labels.spec.ts`

- [x] Desktop 1440x900 runs on lite; the full-tier L4 budget stays in perf `floors` L4 full.

### Task 4: one elevator tour for arrivals, panel and routes

**Files:** `e2e/arrivals.spec.ts`, `e2e/experience.spec.ts`, `e2e/library-roof.spec.ts`

- [x] The desktop arrivals tour rides through the elevator panel and checks `aria-current`, the floor announcer, the floor's route, no "open floor page" link and no page errors on every floor.
- [x] Remove `experience` "the panel reaches every floor", "built floors sync their route" and `library-roof` "riding to L4 and RF writes their routes".
- [x] Remove the phone arrivals tour: arrival heading and glide have no viewport input (`camera/arrival.ts`); phone camera classes are unit tested (`tests/unit/arrivals.test.ts`); phone rides stay in `pads` and `hud-corners`.

### Task 5: issue #114 duplicates of perf floors lite

**Files:** `e2e/experience.spec.ts`, `e2e/career.spec.ts`, `e2e/labs.spec.ts`, `e2e/library-roof.spec.ts`, `e2e/roof.spec.ts`

- [x] Remove the settled lite L1, L2, L3, L4 and RF budget tests; keep `roof` reduced motion and the `labs` arrival ratchet.

### Task 6: duplicates inside the suite

- [x] `experience` Shift boost and reduced-motion boost (superseded by `boost.spec`; the speed bounds move there).
- [x] `boost` tablet toggle (same as the phone toggle) and `hud-corners` joystick boost (subset of the `boost` phone toggle).
- [x] `experience` first-visit tour (subset of `onboarding` greeting), floor deep link intro (folded into `onboarding` deep link), L2 orbit (subset of `camera` L2 turn), language toggle (folded into `library-roof` Roof toggle).
- [x] `highlights` lite walk (dominated by the full walk, lite L1 stays in perf `floors`, the About me station and the reduced-motion hall test) and the full walk's two station pads (45 calls).
- [x] `highlights` stations as targets (`tests/unit/hall-interact.test.ts`, `interact.spec` hover and cursor).
- [x] `production` snapshot without perf (`tests/unit/labs-ops-live.test.ts`).
- [x] `gpu` pixel budget Retina and 5K (`tests/unit/scene-settings.test.ts`; DPR 1 and phone keep the wiring).

### Task 7: fast return distances in Vitest

**Files:** `tests/unit/fast-return.test.ts`, `e2e/fast-return.spec.ts`

- [x] Vitest: the L3 deep-link spawn and the RF plaza corner are 25 to 40 u from their call pads and drive (no beam).
- [x] Remove the L3 and RF everyday-spot e2e cases; the L1 spawn and the L2 within-40 u cases keep the wiring.

### Task 8: memory gates without per-trip settles

**Files:** `e2e/memory.spec.ts`, `e2e/perf/memory-full.spec.ts`

- [x] Per-trip numbers (failure message only) read unsettled; base and after stay settled reads.
- [x] `memory-full`: the warm-up tour rides with Motion Reduced; the shaped trip and the measured trips stay Motion Full.

### Task 9: planner, docs

- [x] `scripts/e2e-plan.ts` RULES: FloorButtons, Hud and `Experience.tsx` add `arrivals`; `tests/unit/e2e-plan.test.ts`.
- [x] `docs/agents/performance.md`, `docs/decisions.md`, `docs/superpowers/README.md`.
- [x] `bun run verify:quick`, `bun run e2e:changed`, `E2E_PORT=<port> bun run e2e:perf e2e/perf/memory-full.spec.ts`.
