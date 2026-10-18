# E2E Animation Speed Experiment Implementation Plan

Status: shipped in #231, 2026-10-19, after 3 consecutive green full CI runs with no retries.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut e2e worker-seconds with a test-only animation speed (4x) for elevator rides, autopilot drives, beams, camera eases and the intro, used by functional e2e specs only. The same end-state assertions must pass at 4x across 3 consecutive CI runs with no new flakes; otherwise the PR stays open.

**Owner request (verbatim):** "D. Separate experiment, its own PR, merge only if it proves stable: a test-only animation time scale (for example `?e2eSpeed=4` or a window flag set by an e2e fixture) applied to elevator rides, rover drive, camera tweens and the intro, used by functional e2e only. Perf gates and memory tests must always run at real speed. Show the same end-state assertions pass at 4x across 3 consecutive CI runs with no new flakes, and report the e2e worker-seconds saved." and "Keep the earlier constraint: don't drop any test from the suite; tests only move between PR, main and nightly. Report the measurements per PR."

**Architecture:**

- One reader, `animationSpeed()` (`src/experience/scene/animationSpeed.ts`): 1 unless the page runs under automation (`navigator.webdriver`) and an e2e fixture set `window.__hqE2ESpeed` (clamped to at most 8). Read once per frame, so a test can drop back to real speed mid-test. Visitors never have the flag; the perf lane never sets it.
- Applied after the per-frame caps, so a slow SwiftShader frame still adds 4x the game time (scaling the R3F clock instead would be eaten by `RIDE_CAP` and `MAX_FRAME_DT`):
  - `advanceRide` (`speed` option): stage time `min(frameDt, cap) * speed`. The closed-door waits (`held`, `PREPARE_TIMEOUT`, `chunkHeld`) stay on real frame time, so the car still never moves before the floor is ready.
  - `RoverController.step` (`speed` in the context): the autopilot drive (door approach, roll-on, point-and-go, missions) and the coast after it. Manual input stays real-time, so key-hold tests see the same rover.
  - `advanceBeam`: the beam time.
  - `CameraDirector`: the ease, glide, orbit easing, FOV and drawer shift springs and the intro clock. Held Q/E/R/F rotate at real speed (input).
- Decorative clocks (orbiting labels, shaders, idle sequences, HUD timers, mission `say` pauses) keep real time.
- E2E: `fastAnimations(page | context)` in `e2e/hq.ts` sets the flag before any page script (`E2E_SPEED`, default 4; `E2E_SPEED=1` measures real speed; forced to 1 under `PERF=1`). Each functional spec opts in with a `beforeEach`. `resetRenderPeaks` drops the page to real speed until `readRenderPeaks`, so every render-budget window in the default suite measures at real speed.
- Never opted in: `e2e/perf/**` (the perf lane), `memory.spec.ts`, `gpu.spec.ts` (program gates through boot and arrivals), `ride.spec.ts` (ride pacing under CPU throttle), `motion.spec.ts` and `fast-return.spec.ts` (dolly pacing, mid-drive samples), `boost.spec.ts` (manual driving), `perf-probes.spec.ts`, `daynight.spec.ts` (programs and calls), `rover-idle.spec.ts`, `lifecycle.spec.ts`, the visual and screenshot specs and the static-page specs. A unit test keeps the perf lane and the memory specs free of `fastAnimations`.

**Tech Stack:** Next.js 16 static export, R3F, Playwright (SwiftShader), Vitest, Bun.

## Global Constraints

- No em dashes anywhere.
- No test dropped; no budget changed; the 3D bytes budget moves by well under 1 KB.
- Animate with `useFrame` deltas only; no new rAF loop.
- E2E waits on state through the `e2e/hq.ts` helpers.
- No push or PR before the coordinator frees the CI slot.

## Tasks

### Task 1: Runtime speed

**Files:** `src/experience/scene/animationSpeed.ts`, `tower/elevator.ts`, `rover/controller.ts`, `scene/Director.tsx`, `camera/CameraDirector.tsx`

- [x] `animationSpeed()` with the webdriver guard and clamp.
- [x] `advanceRide` `speed` option; `RoverController.step` `speed`; Director passes them (autopilot only) and scales the beam.
- [x] CameraDirector scales its eases and the intro clock, not the key rotation.
- [x] Unit tests: `tests/unit/animation-speed.test.ts` (guard, clamp, ride stages scaled with real-time waits, controller speed, no fixture in the perf lane or memory specs).

### Task 2: E2E fixture and opt-in

**Files:** `e2e/hq.ts`, functional specs

- [x] `fastAnimations`, `realAnimations`, `setAnimationSpeed`, `ANIMATION_SPEED`; `resetRenderPeaks` and `readRenderPeaks` hold real speed over the window.
- [x] Opt the functional ride, drive and intro specs in; keep a test at real speed with `realAnimations` only where it asserts pacing or samples motion mid-flight.

### Task 3: Measure locally

- [x] Run the opted-in specs at `E2E_SPEED=1` and `E2E_SPEED=4` on the same build and compare worker-seconds per spec.

### Task 4: Docs

- [x] `docs/agents/performance.md` (Writing 3D tests, the speed and its exclusions), `docs/agents/3d-experience.md` (Testing hooks), `docs/features.md` status log if it lists test infrastructure, this plan in `docs/superpowers/README.md`.

### Task 5: CI proof

- [x] Ask the coordinator for the slot; 3 consecutive full CI runs (`full-ci`), compare the e2e shard worker-seconds with `e2e/durations.json` and list retries (`scripts/flaky-report.ts`).
- [x] Merge only if all 3 are green with no new flakes.

## Measurements

### Scope (`e2e/durations.json` from #228, runner-speed-normalized: 592 tests, 8784 median worker-seconds; 584 tests and 7820 s without `@nightly`)

The 30 opted-in specs hold 293 of the 584 PR and `main` tests and 6059 of their 7820 median worker-seconds. The other 20 specs (perf-sensitive, pacing, manual driving, static pages) run unchanged, and so do the 8 `@nightly` tests.

### Local, controlled (Apple M-series, 2 workers, the same build, back to back at load average 14 to 15)

The 30 opted-in specs without `@nightly` (296 tests), all passing at both speeds:

| Speed | Wall | Worker-seconds |
|---|---|---|
| `E2E_SPEED=1` | 37.1 min | 4441 |
| `E2E_SPEED=4` | 32.4 min | 3871 (-12.8%) |

Ride- and drive-heavy specs save the most (`arrivals` -54%, `b1-unlock` -41%, `highlights` -38%, `interact` -36%, `ambience` -34%, `labs-data` -30%, `production` -29%); specs dominated by page loads, shader compiles and settles barely move, and single specs vary by up to 40% either way between runs. Projected on CI: 12.8% of 6059 s is about 780 worker-seconds per full run (about 10% of the e2e lane). The 3 CI runs below are the measurement that counts.

An earlier pair of full runs on a busier machine (the 4x pass at load 40 to 60, the 1x pass at about 25) showed no saving; the load difference swamped the effect, so those numbers are not used.

Correctness: two specs found issues at 4x:

- `fast-return`: a beam could end on its jump frame, so the pad it landed on (the elevator call pad) was not latched and opened the floor picker. A real bug at real speed too: under reduced motion the beam is a 0.15 s cut with the jump at 0.075 s, so one slow frame does both. It shipped on its own in #222.
- `fast-return` and `motion` assert the dolly's car heights (`distinctY`) and drive samples mid-flight: they stay at real speed. In `experience`, the intro tests that assert its length or skip it mid-flight run at real speed (`realAnimations`); the room deep link that plays the intro and rides on runs at 4x.

### CI

- Run 39164830803 (attempt 1, superseded): green, but `library-roof` "cv drives to the kiosk" passed only on retry: `snapshot().rover` read 1.77 u from the stop (tolerance 1.5). The store's rover mirror syncs every `STORE_SYNC_S` (0.1 s) of real time, and the mission opens the room while the rover still rolls at about 4.4 u/s of game speed, so at 4x a stale mirror can sit 1.76 u back (0.44 u at 1x; an offline drive simulation at every frame size arrives within 0.26 u). Fix: the mirror syncs every `STORE_SYNC_S / speed`. Its re-run on the old code was cancelled, and the 3-run proof restarted on the fix.
- The proof, 3 consecutive full runs (`full-ci`) of 90f3eb79: 39168635632 attempts 1, 2 and 3. All green, no test passed on retry, no failed attempt; the perf gates and Lighthouse passed (real speed). None overlapped the nightly (39172279589 ran 22:27 to 22:45 UTC, between attempts 1 and 2).
- E2E shard worker-seconds over the same 523 tests (`@nightly` excluded), from the `list` reporter lines in the shard logs, against tonight's nightly 39172279589 on main:

| Run | Opted-in specs | Other specs | Total |
|---|---|---|---|
| Nightly 39172279589 (real speed) | 6468 | 1855 | 8323 |
| Attempt 1 | 5293 | 1757 | 7050 |
| Attempt 2 | 5143 | 1761 | 6905 |
| Attempt 3 | 5287 | 1762 | 7050 |
| Mean of the 3 | 5241 (-19%) | 1760 (-5%) | 7002 (-1321 s, -16%) |

- The unchanged specs also came out 5% faster, which is runner speed, not the change. With each shard scaled by a runner speed factor measured on the unchanged specs only, the opted-in specs go from 6101 to a mean of 5363 worker-seconds (-738 s, -12%) while the unchanged ones stay flat (1792 to 1785): about 740 worker-seconds saved per full run, about 9.5% of the 7820 s PR and `main` e2e lane, in line with the local projection (780 s).

