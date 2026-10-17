# Rover Idle Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After 15 s with no input and the rover standing still, the rover looks around, blinks, hops or spins and beeps once; it varies the sequence and stops at once on any input (Round 9 O, spec section 5.2).

**Architecture:** A pure state machine (`rover/idle.ts`) decides, every frame, which idle action runs and returns a head yaw, a body spin and one-shot triggers (blink, hop, beep). A tiny activity counter (`rover/activity.ts`) is bumped by any DOM input and every intent. `Rover.tsx` feeds both into its existing `useFrame`, wraps the head parts in a pivot group (no new mesh, material or program) and applies the output. Probes on `roverRuntime`.

**Tech Stack:** React Three Fiber, three.js, Vitest, Playwright.

## Global Constraints

- No em dashes (U+2014) anywhere, including commits and PR text.
- No new shader program; no change to draw calls (groups only, no new meshes or materials).
- Never during missions, point-and-go or any autopilot drive, rides, beams, pickers, the drawer (phase `room`), the hologram, the terminal, the palette, the boot, the intro, first person (`cameraBlend > 0.01`) or while the Ask dock drives the face (`askFace()`).
- Reduced motion: blink only (no look, hop, spin or beep).
- Beep goes through `audio.play("beep")` (a no-op when muted or effects are off), at most once per idle period.
- Animate with `useFrame` deltas; never start another rAF loop. Under automation (`navigator.webdriver`) the idle delay is `Infinity` unless a test sets `roverRuntime.idleDelay`, so visual captures never catch a hop.
- Docs: `docs/agents/3d-experience.md` (Rover idle section), `docs/features.md`, `docs/decisions.md` row.

---

### Task 1: Pure idle machine and activity counter

**Files:**
- Create: `src/experience/rover/idle.ts`
- Create: `src/experience/rover/activity.ts`
- Test: `tests/unit/rover-idle.test.ts`

**Interfaces:**
- Produces:
  - `IDLE: { delay: 15; gapMin: 8; gapMax: 14; lookYaw: 0.6 }`
  - `type IdleAction = "look" | "blink" | "hop" | "spin" | "beep"`
  - `interface IdleStep { action: IdleAction; at: number; dur: number }`
  - `IDLE_SEQUENCES: readonly (readonly IdleStep[])[]` (4 templates, each with look, a blink, a hop or a spin, and one beep)
  - `interface IdleState`, `createIdleState(): IdleState`
  - `interface IdleInput { t: number; seq: number; eligible: boolean; reduced: boolean; delay: number; random: () => number }`
  - `interface IdleOutput { action: IdleAction | null; headYaw: number; spin: number; blink: boolean; hop: boolean; beep: boolean }`
  - `stepIdle(s: IdleState, i: IdleInput): IdleOutput`
  - `interface EligibleInput { phase: string; missionRunning: boolean; ride: boolean; beam: boolean; picker: boolean; driving: boolean; speed: number; cameraBlend: number; askFace: boolean }`
  - `idleEligible(i: EligibleInput): boolean` (phase `explore`, none of the others, `speed < 0.05`, `cameraBlend <= 0.01`)
  - `activity.ts`: `export const activity = { seq: 0 }`, `bumpActivity(): void`, `ACTIVITY_EVENTS = ["keydown", "pointerdown", "pointermove", "wheel", "touchstart"] as const`, `watchActivity(target: Pick<Document, "addEventListener" | "removeEventListener">): () => void` (capture, passive listeners that bump).

Behavior of `stepIdle`:
- First call primes `quietSince = t`, `seenSeq = seq`.
- `seq !== seenSeq` or `!eligible`: reset (`quietSince = t`, no sequence, `beeped = false`), return the zero output (`action: null`, yaw 0, spin 0, no triggers).
- Quiet for `delay` s: start a sequence (a template index different from the last one; `random` picks), `start = t`.
- While a sequence runs: each step fires once when `t - start >= step.at` (triggers `blink`, `hop`, `beep` are true on exactly that frame). `beep` fires only if not yet beeped this idle period. `look` gives `headYaw = lookYaw * sin(2 pi p) * sin(pi p)` style (left, right, back to 0) with `p = (t - start - at) / dur`; `spin` gives `spin = dir * 2 pi * easeInOut(p)` (`dir` is +1 or -1 from `random` at the sequence start), exactly 0 when not spinning. `action` is the latest started step.
- Reduced motion: only `blink` steps fire; `look`, `hop`, `spin`, `beep` are skipped (yaw and spin stay 0).
- When the last step ends: no sequence, next start at `end + gapMin + random() * (gapMax - gapMin)`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/rover-idle.test.ts` covering: nothing before 15 s; a sequence starts at 15 s; every template fires exactly one beep and at least one blink, a look and a hop or spin; a bump of `seq` mid-sequence returns the zero output on that frame and restarts the 15 s wait; `eligible: false` behaves the same; two consecutive sequences use different templates; reduced motion fires only blinks; beep at most once per idle period across several sequences; spin ends at a multiple of 2 pi and yaw returns to 0 at a step end; `idleEligible` truth table (each blocker alone makes it false); `watchActivity` adds and removes the five listeners and bumps `activity.seq`.
- [ ] **Step 2: Run** `bunx vitest run tests/unit/rover-idle.test.ts`, expect failures (module missing).
- [ ] **Step 3: Implement** `idle.ts` and `activity.ts` (pure, no three.js imports in `idle.ts`).
- [ ] **Step 4: Run** the test file, expect PASS; run `bun run typecheck` and `bun run lint`.
- [ ] **Step 5: Commit** `feat: add the rover idle state machine and activity counter`.

### Task 2: Wire idle into the rover

**Files:**
- Modify: `src/experience/rover/Rover.tsx` (head pivot group, useFrame wiring, activity watch)
- Modify: `src/experience/rover/runtime.ts` (probes `idle: string | null`, `idleDelay: number`, `idleYaw: number`, `idleSpin: number`)
- Test: `e2e/rover-idle.spec.ts`

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: `roverRuntime.idle`, `roverRuntime.idleDelay` (default `IDLE.delay`, `Infinity` under `navigator.webdriver`; tests set it), `roverRuntime.idleYaw`, `roverRuntime.idleSpin` (as drawn).

Steps:
- [ ] **Step 1:** Wrap the head parts (head RoundedBox at y 1.5, face plane, back strip, antenna, tip) in `<group ref={head} position={[0, 1.5, 0]}>` with each child's y reduced by 1.5. No new mesh or material.
- [ ] **Step 2:** In `useEffect`, `watchActivity(document)` plus `intents.on(bumpActivity)`; clean both up.
- [ ] **Step 3:** In `useFrame`, compute `idleEligible` from the store (`phase`, `mission?.status === "running"`, `ride`, `beam`, `picker`), `roverRuntime.driving`, `roverRuntime.speed`, `roverRuntime.cameraBlend`, `askFace() !== null`; call `stepIdle`. Apply: `blink` sets `l.blinkUntil = t + 0.15`; `hop` sets `r.hopUntil = t + 0.35`; `beep` calls `audio.play("beep")`; yaw and spin: drawn values follow the output, and when the output drops to 0 mid-move they decay to 0 within about 0.15 s (`x *= exp(-dt * 30)`, the spin first wrapped to the nearest turn). `head.rotation.y = idleYaw`, `body.rotation.y = idleSpin`.
- [ ] **Step 4:** Write `e2e/rover-idle.spec.ts` (helpers from `e2e/hq.ts`): enter the HQ as a returning visitor, set `__hq.rover.idleDelay = 1`, wait (on state) for `__hq.rover.idle` to become non-null and for a nonzero `idleYaw` or `idleSpin` (or a hop), press a key, then expect `idle === null` on the next frames and yaw and spin back to 0 within 0.5 s; a second test with reduced motion (`chooseMotion`) expects only `blink` and zero yaw and spin; a third checks that with a room open (drawer) `idle` stays null for 3 s. Also assert draw calls (`__hq.rover.drawCalls`) stay within 1 of the pre-idle value during idle.
- [ ] **Step 5:** Run `bun run verify:quick`, then `bunx playwright test e2e/rover-idle.spec.ts`; commit `feat: rover idle animations (look, blink, hop or spin, beep)`.

### Task 3: Docs and gates

**Files:**
- Modify: `docs/agents/3d-experience.md` (new "Rover idle" section after "Boost feel"), `docs/features.md` (rover bullet and status log), `docs/decisions.md` (dated row: 2026-10-17 Rover idle after 15 s, reduced motion blink only)
- Modify: `scripts/ci-plan.ts` only if the new spec needs a mapping (check how e2e specs are selected).

- [ ] **Step 1:** Write the docs (current state only), run `bun run verify:quick` and `bun run e2e:changed`.
- [ ] **Step 2:** Run the perf lane `E2E_PORT=<free port> bun run e2e:perf` (render path touched): draw calls and programs unchanged, memory gates green.
- [ ] **Step 3:** Commit `docs: rover idle`.
