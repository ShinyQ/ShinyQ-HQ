# E2E Nightly Moves Implementation Plan

Status: in review.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Move the slowest budget sweeps and the duplicate viewport or tier variants of the e2e suite out of pull request and `main` runs into the nightly run, without deleting a test.

**Architecture:** A test moves by its title: the ` @nightly` suffix (the convention of `e2e/perf/timeline.spec.ts`). The e2e job passes `--grep-invert @nightly` unless the run is the nightly schedule or a dispatch with the `nightly` input, so pull requests and pushes to `main` (complement runs included) skip the tagged tests and the nightly runs the whole suite. Shard sizing (`specSeconds` in `scripts/e2e-plan.ts`, used by the planner and the complement) leaves the tagged tests' durations out. The local `e2e:changed` mirrors pull requests.

**Tech Stack:** Playwright, GitHub Actions, Bun, Vitest.

## Global Constraints

- No em dashes anywhere (code, docs, commits, PR text).
- No test is deleted and no budget changes: tests only move between pull request, `main` and nightly runs.
- The rendered L4 label sweep moves only after its unit twin (`tests/unit/library-label-sweep.test.ts`, the previous PR) landed.
- Built on #214 (main runs the complement of its merged PR's green CI run); rebased onto `main` after it merged.
- One PR; conventional commits; `bun run verify:quick` and `bun run e2e:changed` before pushing.

## What moves (durations from `e2e/durations.json` after the B1 refresh)

| Test | Worker-s | Why it can wait for the nightly |
|---|---|---|
| `library-labels` desktop and phone | 108 + 72 | The unit sweep runs the same poses and checks on every PR in about 1 s. |
| `gpu` boot warms every floor (full tier) | 288 | A full-tier program budget over every floor; the perf lane gates programs per floor (`e2e/perf/floors.spec.ts`) when the render path changes. |
| `daynight` day costs the same programs and calls as night on L1 | 120 | A cost parity sweep; the day and night behavior tests stay. |
| `highlights` L1 headroom under the floor budget (full) | 132 | A budget walk far under the L1 cap; the perf lane gates L1 settled on both tiers. |
| `memory` 10 Lobby to Roof round trips (lite) | 162 | `memory-full` in the perf lane gates the same round trips on the full tier; the B1 round trips and the Page View toggles stay. |
| `topics` end plaza labels (desktop) | 50.8 | Matrix: the phone (narrower caps, the most crowded screen) stays as the representative. |
| `labs-paths` arrival (1440x900 full) | 54.7 | Matrix: the phone arrival stays; the desktop full tier stays covered by the reactor drive. |

The perf-selection clause (run gpu, daynight and highlights with the perf selection when a pull request's perf
gates cover the same floor) is not implemented: the perf lane runs only `e2e/perf/`, so it would need a second
test directory and a per-floor grep in the e2e job. All three are nightly only.

Matrices left alone: every other viewport or tier pair costs under 25 s per variant (HUD corners, drawer, Page View
landing) or tests a tier-specific behavior (the first boost's shader programs, the Labs arrival calls per tier).

## Tasks

### Task 1: Tag the tests

- [x] Add ` @nightly` to the titles above (a per-variant suffix in the `topics` and `labs-paths` loops).
- [x] Rename the same keys in `e2e/durations.json`.
- [x] `bunx playwright test --list --grep @nightly` lists exactly 8 tests.

### Task 2: Skip them on pull requests and `main`

- [x] `specSeconds` leaves `@nightly` keys out; unit test.
- [x] ci.yml e2e step: `--grep-invert @nightly` unless `schedule` or the `nightly` input; workflow unit test.
- [x] `scripts/e2e-changed.ts`: the same default (`--nightly` to include them).
- [x] `scripts/e2e-shard.ts` lists with `--pass-with-no-tests`: a selection whose spec is all nightly-only (`library-labels`) lists no test; `specSeconds` counts such a spec as 0 s, not the unknown-spec default.
- [x] `scripts/e2e-durations.ts`: read the nightly schedule runs by default (pushes to main are complement runs and skip the nightly-only tests).

### Task 3: Docs and measurements

- [x] `docs/agents/performance.md` and `docs/agents/ci-and-deploy.md`: the nightly-only list and why; `docs/decisions.md` row; README of the plans.
- [x] Measure the worker-seconds of the full pull request and `main` e2e suite before and after.

## Measurements (`e2e/durations.json` after #214, `playwright test --list`)

| Run | Before | After |
|---|---|---|
| Full PR or `main` e2e suite | 588 tests, 8,598 worker-s (8 shards, about 1,075 s each) | 580 tests, 7,610 worker-s (8 shards, about 952 s each) |
| PR touching the L4 decor (6 specs) | 1,245 worker-s, 3 shards | 1,015 worker-s, 3 shards |
| PR touching the L1 hall | 1,134 worker-s, 3 shards | 1,002 worker-s, 3 shards |
| PR touching the L3 layout | 1,359 worker-s, 3 shards | 1,304 worker-s, 3 shards |
| PR touching the scene (`experience`, `gpu`) | 991 worker-s, 3 shards | 703 worker-s, 2 shards |
| Nightly | 590 tests, 8,624 worker-s | unchanged |
