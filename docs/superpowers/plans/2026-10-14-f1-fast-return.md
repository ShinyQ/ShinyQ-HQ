# F1 Fast Return Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Getting back to the elevator is never a long drive: Express Return pads (`return:<floor>`) beam the rover to its floor's elevator call pad, and any floor change requested more than 25 u from the elevator pad beams the rover into the car before the ride.

**Architecture:** One pure module (`src/experience/nav/fastReturn.ts`) holds the rule (`FAST_RETURN.beamDistance`, `shouldBeamToCar`), the Return pad trigger and the beam to the elevator pad (`elevatorBeam`). Floors opt in with an optional `FloorLayout.returnPad: Vec2`; `buildFloorLayouts` turns it into a `PadTrigger` of kind `return`, so the pad latch, `PadGlow`, the point-and-go registry and the pad space rules all see it. The Director reuses the existing beam stage (`store.beam`, `advanceBeam`, `TeleportBeam`, `BeamFade`) in two places: the pad latch (Return pad) and the first frame of a ride's `toDoor` stage (every floor change goes through `requestElevator`, so one check covers the floor rail, PgUp/PgDn, the elevator panel, the call pad picker, Cmd-K, swipes and missions).

**Tech Stack:** Next.js 16 static export, React Three Fiber, zustand, Vitest, Playwright.

Design: `/Users/shinyq/.copilot/session-state/d439b68f-b2e6-4b77-9feb-f9099e8cd824/files/plans/2026-10-14-functional-floor-ends-design.md`, section 1 (owner approved 2026-10-14).

## Global Constraints

- No em dashes (U+2014) anywhere (a unit test scans the repo).
- EN and ID for every label: "Back to elevator" / "Kembali ke lift".
- Owner decision: "Beam when far: if the rover is more than about 25 u from the elevator, a floor change or the Return pad beams it into the car (short beam effect, a cut under reduced motion); closer than that it drives as today."
- Reduced motion follows the effective `reducedMotion` (Motion setting from #86): the existing 150 ms fade cut (`BeamFade`).
- Pad id `return:<floor>`; optional `returnPad: Vec2` on `FloorLayout`; rendered for every floor that sets it. Initial coordinates: L2 annex forecourt, L3 east plaza clear of the reactor ring road. F2 (`floors/labs/*`) and F3 (`floors/career/*`) move them later: edits in their files are the coordinate only.
- Budgets: scene calls under 150, triangles under 30k at every peak, programs within `e2e/perf/baseline.json` + 2, new materials precompiled with the floor.
- No regressions in missions, walks, tours, point-and-go, ride smoothness (`e2e/ride.spec.ts`, P6 ride stats) and the ride cull (#85).
- E2E port 4450 locally (`E2E_PORT=4450`), never 4173.

## Decisions (made here, documented in specs 02, 03, 08)

- **Distance metric: straight line** from the rover to the floor's elevator call pad (`FloorLayout.approach`). O(1), no path search on the request frame, and it matches what the visitor sees. Consequence today: the L1 spawn (36.4 u), the L3 overview (29.5 u) and the RF arrival spot (25.9 u) beam; the L4 arrival spot (15.3 u) drives.
- **Beam into the car** = the existing beam (0.3 s rise over the rover, jump, 0.3 s fade) landing on the elevator call pad facing the car; the ride's `toDoor` stage sees the rover at the door and boards at once (boarding, closing, moving as today, so P6's ride stats and the ride cull are untouched). Under reduced motion: 150 ms fade cut, then the ride's own cut.
- **Missions, walks, tours:** a beam inside a ride is part of the ride, so mission `elevator` steps (tours, "Follow my career", deep link continuations) keep running and simply arrive sooner. A manual floor change still cancels a running mission or pauses a walk (unchanged). The Return pad uses the pad latch, which never fires while a mission or walk drives (`following`), so tours never beam by accident. Esc does nothing during a beam (it lands on the elevator pad either way).
- **Return pad** is a pad kind (`return`), not a picker: stopping on it (or point-and-go: drive there, then the action) beams to the elevator pad in explore. Landing leaves the elevator pad latched, so its floor picker does not pop up.
- Cost: the return disc joins the existing instanced pad mesh (0 calls); one more `HoloIcon` kind (1 call lite, 2 full); the "Back to elevator" `FloatingSigns` group (2 calls, only while the rover is within the `labelFade` range of the pad along x, else 0). No new shader programs (holo plate, batched text and HoloIcon programs exist on L2 and L3).

## File Structure

- Create `src/experience/nav/fastReturn.ts`: rule, pad trigger, beams, sign spec (pure).
- Modify `src/experience/nav/teleport.ts`: `startBeam(from, pad, heading = Math.PI / 2)`.
- Modify `src/experience/types.ts`: `PadKind` adds `"return"`, `FloorLayout.returnPad?: Vec2`.
- Modify `src/experience/config.ts`: `withFloorPads` adds the Return pad after the elevator pad; `RETURN_PAD_FACE`.
- Modify `src/experience/floors/career/layout.ts` and `src/experience/floors/labs/layout.ts`: the coordinate only.
- Modify `src/experience/fx/holoIcons.ts`: `PAD_ICONS.return`, `PAD_TONE.return`.
- Modify `src/experience/fx/PadGlow.tsx`: `KINDS` adds `"return"`.
- Create `src/experience/fx/ReturnPadSign.tsx`: one `FloatingSigns` group per floor with a Return pad.
- Modify `src/experience/tower/FloorLevel.tsx`, `src/experience/tower/Tower.tsx`, `src/experience/Experience.tsx`: mount the sign, pass the label.
- Modify `src/experience/fx/TeleportBeam.tsx`: green column for elevator beams, pink for year teleports.
- Modify `src/experience/interact/registry.ts`, `src/experience/interact/pick.ts`: kind `return-pad`, action `return-beam`, `InteractDeps.beamHome`.
- Modify `src/hud/dialog/hintLines.ts` and `messages/{en,id}.json`: hint line and labels.
- Modify `src/experience/scene/Director.tsx`: Return pad latch, `return-beam` action, ride beam.
- Modify `src/store/useHQStore.ts`: `beam` doc comment.
- Tests: `tests/unit/fast-return.test.ts` (new), `tests/unit/floor-pads.test.ts`, `tests/unit/interact-registry.test.ts`, `tests/unit/interact-pick.test.ts`, `e2e/fast-return.spec.ts` (new), `scripts/e2e-plan.ts` rule.
- Docs: `README.md`, `AGENTS.md` (floor pads paragraph), `docs/superpowers/specs/agent-hq/02-interaction-and-states.md`, `03-rover-camera-input.md`, `08-quality-acceptance.md`.

---

### Task 1: Pure rule, pad and beams

**Files:**
- Create: `src/experience/nav/fastReturn.ts`
- Modify: `src/experience/nav/teleport.ts`, `src/experience/types.ts`
- Test: `tests/unit/fast-return.test.ts`

**Interfaces:**
- Produces:
  - `FAST_RETURN: { beamDistance: 25; signY: number; signSize: number }`
  - `returnPadId(floor: FloorId): string` returns `return:<floor>`
  - `returnPad(layout: Pick<FloorLayout, "id" | "returnPad">, face: number): PadTrigger | null`
  - `distanceToElevator(pose: Vec2, layout: Pick<FloorLayout, "approach">): number`
  - `shouldBeamToCar(pose: Vec2, layout: Pick<FloorLayout, "approach">): boolean` (strictly greater than 25)
  - `CAR_HEADING = -Math.PI / 2`
  - `elevatorBeam(from: Vec2, layout: Pick<FloorLayout, "id" | "approach">): Beam` (pad `elevator:<floor>`, to the approach, heading `CAR_HEADING`)
  - `returnSign(pad: Vec2, text: string): SignSpec`
  - `isElevatorBeam(beam: Pick<Beam, "pad">): boolean`
  - `startBeam(from, pad, heading = Math.PI / 2)` in teleport.ts

- [ ] **Step 1: failing tests** for the threshold (24.9 and 25 drive, 25.1 beams), `returnPad` null without a coordinate and `{ id: "return:L2", kind: "return", at, face }` with one, `elevatorBeam` (pad id, to equals approach, heading -PI/2, t 0, not jumped), `startBeam` default and custom heading, `returnSign` (text, above the pad icon, `fadeX` = pad x), `isElevatorBeam`.
- [ ] **Step 2:** `bunx vitest run tests/unit/fast-return.test.ts` fails (module missing).
- [ ] **Step 3:** implement; add `"return"` to `PadKind` and `returnPad?: Vec2` to `FloorLayout`.
- [ ] **Step 4:** tests pass; `bun run typecheck` (PadKind records in `holoIcons.ts` fail until Task 2: do Task 2 before typechecking).
- [ ] **Step 5:** commit `feat(nav): fast return rule, Return pad trigger and elevator beam`.

### Task 2: Return pads in the layouts and on the floor

**Files:**
- Modify: `src/experience/config.ts`, `src/experience/floors/career/layout.ts`, `src/experience/floors/labs/layout.ts`, `src/experience/fx/holoIcons.ts`, `src/experience/fx/PadGlow.tsx`, `src/experience/tower/FloorLevel.tsx`, `src/experience/tower/Tower.tsx`, `src/experience/Experience.tsx`, `messages/en.json`, `messages/id.json`
- Create: `src/experience/fx/ReturnPadSign.tsx`
- Test: `tests/unit/floor-pads.test.ts`

Coordinates (checked against `padViolations` with the real content, all clear):
- L2: `{ x: annexStart - 5, z: 8 }` = (336, 8): the forecourt south of the S-curve into the annex, 10.5 u from the road center, 9 u from the benches, face 0 (the rail camera).
- L3: `{ x: loopEnd.x + 10, z: 9 }` = (117, 9): south-east of the reactor core, 13.5 u from its center (the ring road's driving width ends at 10.5 u), face -PI/2.

- [ ] **Step 1: failing tests** in `floor-pads.test.ts`: L2 and L3 each have exactly one `return:<floor>` pad after the elevator pad, at their layout's `returnPad`, more than `FAST_RETURN.beamDistance` from the approach; L1, L4, RF have none; the placeholder corridor keeps only `elevator:L2`. The existing "pad rules" tests cover the new pads.
- [ ] **Step 2:** run, expect failure.
- [ ] **Step 3:** implement: `returnPad` in both floor builders (coordinate only), `withFloorPads` in config.ts, `PAD_ICONS.return` (lift doors with an arrow into them), `PAD_TONE.return` green (its own tone; the sign and the elevator beam share it), `PadGlow` kinds, `ReturnPadSign` mounted by `FloorLevel` when `near && layout.returnPad`, label `hud.interact.returnPad` through `TowerLabels.returnPad`.
- [ ] **Step 4:** tests pass, typecheck.
- [ ] **Step 5:** commit `feat(L2,L3): Express Return pads with a floating sign`.

### Task 3: Point-and-go and hints

**Files:**
- Modify: `src/experience/interact/registry.ts`, `src/experience/interact/pick.ts`, `src/hud/dialog/hintLines.ts`, `messages/{en,id}.json`, `src/experience/Experience.tsx`
- Test: `tests/unit/interact-registry.test.ts`, `tests/unit/interact-pick.test.ts`

**Interfaces:**
- `InteractKind` adds `"return-pad"`; `InteractAction` adds `{ type: "return-beam" }`; `InteractLabels.returnPad: string`; `InteractDeps.beamHome: () => void`; registry id `${floor}:pad:return`.

- [ ] **Step 1: failing tests**: the real L2 and L3 registries contain `L2:pad:return` / `L3:pad:return` (kind `return-pad`, label "Back to elevator", action `return-beam`, `at` = pad center); `performInteract` on a far return target drives there, then calls `beamHome` once; already on the pad it calls `beamHome` without a drive; `reach` is the pad radius; `labelAnchor` lifts the tag like other pads.
- [ ] **Step 2:** run, expect failure.
- [ ] **Step 3:** implement; `HINT_KINDS` adds `return-pad`; `dialog.hints.kind.return-pad` EN "Stop on me to beam back to the elevator." ID "Berhenti di sini untuk kembali ke lift dalam sekejap."
- [ ] **Step 4:** tests pass (`tests/unit/dialog-copy.test.ts` too).
- [ ] **Step 5:** commit `feat(interact): Return pad target and hint`.

### Task 4: Director wiring

**Files:**
- Modify: `src/experience/scene/Director.tsx`, `src/experience/fx/TeleportBeam.tsx`, `src/store/useHQStore.ts`

- [ ] **Step 1:** `beamHome()` helper in the Director: in explore with no ride, beam, or picker, clear the path, target and autopilot, `setBeam(elevatorBeam(pose, layout))`, play `whoosh`.
- [ ] **Step 2:** pad latch: a `return` pad calls `beamHome()` instead of opening a picker (counts in `padOpens`, so the point-and-go action does not beam twice).
- [ ] **Step 3:** `performInteract` deps: `beamHome` guarded by `padOpens` like `openPicker`.
- [ ] **Step 4:** ride `toDoor`: on the first frame (`ride.t === 0`, no beam yet) and `shouldBeamToCar`, clear the path and start `elevatorBeam`; while `s.beam` is set in `toDoor`, the rover does not drive and `atDoor` is the distance check (the jump lands on the approach, so boarding starts on the jump frame). Esc and manual input do nothing during the beam.
- [ ] **Step 5:** `TeleportBeam` color: green (`PAD_TONE.return`) for `isElevatorBeam`, pink otherwise (uniform change, same program).
- [ ] **Step 6:** `bun run typecheck && bun run lint && bunx vitest run`; commit `feat(director): beam into the car when far, Return pads beam to the elevator`.

### Task 5: E2E

**Files:**
- Create: `e2e/fast-return.spec.ts`
- Modify: `scripts/e2e-plan.ts` (map `src/experience/nav/fastReturn.ts` and `fx/ReturnPadSign.tsx` to `fast-return`, add `fast-return` to the Director, elevator, pads and interact rules)

Tests (L2 `/en/journey?tier=lite&walk=off` as a returning visitor; the rover is placed near the annex with a test beam through `store.setBeam`, the way `pads.spec.ts` does):
1. Return pad: drive onto `return:L2`, a beam runs (`beam.pad === "elevator:L2"`), the rover lands within 0.5 u of the elevator pad facing the car (heading about -PI/2), the floor picker stays closed.
2. Floor rail from the annex: click L3 on the elevator panel, a beam into the car is observed during `toDoor` (store subscription), the rover arrives on L3, `ridePrep.lastRide` has `timedOut false` and `programs 0`.
3. Within 25 u: from 10 u east of the elevator pad, click L3: no beam at any point, the rover drives (its x moves continuously), arrives on L3.
4. Reduced motion: the annex ride beams with `BeamFade` at full opacity at some point (MutationObserver), no beam column drawn, arrives on L3.
5. L3 Return pad: present in `padsOf(page, "L3")` and the interact registry; a point-and-go click on it drives and beams to the L3 elevator pad.

- [ ] **Step 1:** write the spec, build, run `E2E_PORT=4450 bunx playwright test e2e/fast-return.spec.ts`.
- [ ] **Step 2:** `bun run e2e:changed` (ride, pads, interact, experience, missions specs); fix regressions.
- [ ] **Step 3:** `E2E_PORT=4450 bun run e2e:perf` (programs within baseline + 2, peaks).
- [ ] **Step 4:** commit `test(e2e): fast return`.

### Task 6: Docs, captures, PR

- [ ] README (try-it paragraph and the L2 paragraph), AGENTS.md (floor pads paragraph: `return` pads, `returnPad`, the 25 u rule), spec 02 (state diagram note: explore to elevator with a beam when far), spec 03 (the rule, metric, cancellation), spec 08 (acceptance: tests and budgets).
- [ ] Captures at 1440x900 full: the L2 and L3 Return pads, a frame sequence of a far floor change (beam rise, jump, boarding, moving), and the reduced motion cut; 390x844 lite of the L2 pad.
- [ ] `bun run verify:quick`, push, open the PR, comment with the captures and measurements, get "Typecheck, lint, unit tests", "Build, CV and e2e", "Lighthouse CI", "3D perf gates" green. Do not merge.
