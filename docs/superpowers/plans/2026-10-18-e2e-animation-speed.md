# E2E Animation Speed Experiment Implementation Plan

Status: in review.

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

- [ ] Ask the coordinator for the slot; 3 consecutive full CI runs (`full-ci`), compare the e2e shard worker-seconds with `e2e/durations.json` and list retries (`scripts/flaky-report.ts`).
- [ ] Merge only if all 3 are green with no new flakes.

## Measurements

### Scope

The 30 opted-in specs hold 300 of the 598 CI e2e tests and 7165 of the 9515 median worker-seconds in `e2e/durations.json`. The other 20 specs (perf-sensitive, pacing, manual driving, static pages) run unchanged.

### Local (Apple M-series, 2 workers, a shared machine at load average 20 to 60)

Back-to-back runs on one build are too noisy on this machine to rank specs (one spec moved by more than 2x between runs at the same speed), so the numbers that count are interleaved A/B pairs of the same spec at 4x then 1x:

| Spec | 4x (s) | 1x (s) | Saved |
|---|---|---|---|
| `career` | 108.2 | 149.7 | 28% |
| `b1-unlock` | 123.3 | 132.9 | 7% |
| `engine-room` | 247.8 | 256.9 | 4% |
| `drawer-solid` | 32.0 | 32.8 | 2% |
| `floor-chunks` | 53.2 | 51.7 | -3% (chunk waits, real time by design) |

Per test in the full runs, the ride- and drive-heavy tests save the most: `workshop` forecourt routes 69 to 18 s, the `production` point-and-go room 66 to 21 s, `ambience` floor following 94 to 39 s, the `arrivals` desktop tour 132 to 73 s, the `spectacle` L4 signs 44 to 18 s, `pads` elevator pad 65 to 32 s.

Correctness: all 30 specs pass at 4x (294 tests); the one 4x failure on the first pass (`experience` boot and intro: a describe-wide real-speed hook also slowed the room deep-link test into its 30 s intro wait) is fixed by scoping real speed to the three intro tests that assert its length or catch it mid-flight. Two specs found real issues at 4x:

- `fast-return`: a beam could end on its jump frame, so the pad it landed on (the elevator call pad) was not latched and opened the floor picker. The Director now primes the pad latch on the jump frame. A real bug at real speed too: under reduced motion the beam is a 0.15 s cut with the jump at 0.075 s, so one slow frame does both. It shipped on its own in #222.
- `fast-return` and `motion` assert the dolly's car heights (`distinctY`) and drive samples mid-flight: they stay at real speed.

### CI

Filled in from the 3 consecutive full CI runs (the e2e shard worker-seconds against the medians in `e2e/durations.json`, and the retries from `scripts/flaky-report.ts`).
