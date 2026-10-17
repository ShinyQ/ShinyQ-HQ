# Round 8 J: L3-Style Arrivals Implementation Plan

Status: shipped in #184, 2026-10-17 (Round 8, sub-project J). Owner review: the RF availability sign turns west so it is in view with the mast on arrival.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every floor arrives like L3 today: the rover rolls out of the elevator heading east along the floor's main axis and the camera ends behind it, looking down that axis at the floor's main sight, reached by a 1.5 s glide out of the car.

**Architecture:** Each floor layout gets an `arrival` point on its main axis (east of the shaft, `+x`) and a view zone around the road from the shaft to that point (`travel` east), so the settled arrival view is an ordinary view zone (`zoneAt(floor, arrival)`), checked by pure unit tests. A new pure module `camera/arrival.ts` holds the glide (start pose low behind the rover in the car, eased into the zone's follow or rail pose); `CameraDirector` runs it from the moment the doors open and hands over to the normal rig, and the Director rolls the rover on (or cuts it there under reduced motion).

**Tech Stack:** Next.js 16 static export, React Three Fiber, three.js, Zustand, Vitest, Playwright, Bun.

## Global Constraints

- No em dashes (U+2014) anywhere, including commits and PR text.
- Budgets: 3D first-frame 450 KB gzip; session 470 KB full and 446.4 KB lite; L1 at most 125 draw calls, every floor under 150 and 30k triangles; no new shader program; memory gates green.
- Reduced motion: no glide, cut straight to the arrival pose.
- Input during the glide takes over at once (drive, orbit, zoom, reset).
- Keep: view zones after arrival, deep links (a room deep link drives straight to the room), the L1 intro and first-session spawn at the kiosk (owner decision 2026-10-14), the fast-return beam.
- L3's arrival framing stays as it is (`LABS.overview`, `L3:overview`, zoom 1.3, phones 1.45).
- Phones and tablets: the camera stays east of the elevator shaft (`SHAFT_EAST_FACE + 1.5`), the main sight and the rover in frame.
- Pure modules (`camera/*.ts`, layouts) stay free of React and three side effects.
- Do not touch HUD files (`src/hud/**`): a sibling session owns them.
- Docs in the same PR: `docs/agents/3d-experience.md`, `floors.md`, the floor files, `docs/decisions.md`, `docs/features.md`.

## Design

| Floor | Arrival point | Main sight ahead (east) | Zone yaw | Zoom desktop / phone |
|---|---|---|---|---|
| L1 | on the plaza axis west of the lane ring | the profile hologram and the stats ring | look east (`-3PI/4`) | tuned on captures, capped by the shaft |
| L2 | in the 2019 plaza on the road | the Career Road toward 2020 to 2026 | rail yaw that puts the camera due west of the rover | rail zoom capped by the shaft |
| L3 | `LABS.overview` (unchanged) | the three directory boards | unchanged | 1.3 / 1.45 |
| L4 | on the press plaza axis | the timeline road east, the headline wall at the left | look east | capped |
| RF | on the lead road at the plaza rim | the mast and the plaza | look east | capped |

- Main axis: every floor's elevator door faces east (`+x`), so the main axis is east on every floor and "behind the rover" means the camera to rover direction points east. The e2e asserts it within 0.1 rad.
- L1 keeps its session spawn (kiosk, `L1:kiosk` prime zone). The old `L1:arrival` zone (approach, looking south at the observatory) is replaced by the new arrival zone (owner words 2026-10-17 supersede the 2026-10-14 arrival view).
- L4 and RF: `spawn` stays equal to `arrival`, so a floor deep link opens on the same composition as an elevator arrival (as on L3).
- L2 rail: a zone may carry `railYaw` (used only by the rail rig); leaving such a zone eases the rail back to the side view unless the visitor turned it by hand.
- Glide: starts when the ride enters `opening`; the start pose is low behind the rover inside the car (`ARRIVAL_GLIDE.start`), the end pose is the rig's pose with the orbit primed to the arrival zone; `easeInOutCubic` over 1.5 s; the camera is snapped every frame (no spring lag) and collision rests during the glide. Any orbit, zoom or view intent, manual driving, or a phase other than explore or elevator ends it at once (the follow spring takes over from where it is).
- Zone hold: from the glide start until the glide ends and the arrival roll-on is done, `updateZone` is skipped, so the primed arrival view is not undone on the way. Then zones run as usual.
- Reduced motion: the Director teleports the rover to the arrival point heading east, sets `cameraSnap`; the camera primes the arrival zone; no glide.

## File structure

- Create `src/experience/camera/arrival.ts`: `ARRIVAL_GLIDE`, `ARRIVAL_HEADING`, `shoulderPose`, `glidePose`, `glideProgress`, `cameraBehindHeading`, `railYawBehind`, `shaftClearZoom`.
- Modify `src/experience/camera/orbit.ts`: `ViewZone.railYaw`, `OrbitState.zoneRailYaw`, rail-aware `primeZone` and `updateZone`, hand rotation clears `zoneRailYaw`.
- Modify `src/experience/camera/CameraDirector.tsx`: the glide, the zone hold, rail-aware zone calls, the probe `roverRuntime.cameraBehind`.
- Modify `src/experience/rover/runtime.ts`: `steering`, `cameraBehind`.
- Modify `src/experience/missions/host3d.ts`: `AutopilotRequest.arrival?: true`.
- Modify `src/experience/scene/Director.tsx`: roll-on flagged `arrival`, reduced-motion cut, `steering`.
- Modify floor layouts: `src/experience/config.ts` (L1 arrival), `floors/lobby/observatoryLayout.ts` (drop `L1:arrival`, add the arrival zone), `floors/career/layout.ts` (L2 arrival and zone), `floors/library/concepts/newsroom.ts` (spawn and zone), `floors/roof/layout.ts` (spawn and zone).
- Create `tests/unit/arrivals.test.ts`, `tests/unit/arrival-glide.test.ts`; update affected unit tests.
- Create `e2e/arrivals.spec.ts`; update affected e2e specs.
- Create `scripts/arrival-shots.ts` (captures, already written).

---

### Task 1: Pure glide module and rail-aware zones

**Files:**
- Create: `src/experience/camera/arrival.ts`
- Modify: `src/experience/camera/orbit.ts`
- Test: `tests/unit/arrival-glide.test.ts`, `tests/unit/orbit.test.ts` (or the existing orbit test file)

**Interfaces:**
- Produces:
  - `ARRIVAL_GLIDE = { duration: 1.5, start: { back: 2.4, up: 2.1, side: 0.7, look: 10, lookUp: 1.4 } }`
  - `ARRIVAL_HEADING = Math.PI / 2` (east; rover forward is `(sin h, cos h)`)
  - `LOOK_EAST_YAW = -3 * Math.PI / 4` (follow yaw looking east)
  - `shoulderPose(rover: Vec3, heading: number, fov: number): CameraPose`
  - `glideProgress(t: number): number` (eased 0..1, `easeInOutCubic(min(1, t / duration))`)
  - `glidePose(start: CameraPose, end: CameraPose, p: number): CameraPose`
  - `cameraBehindHeading(camera: Vec3, rover: Vec3): number` (atan2 of the horizontal camera to rover direction, heading convention `(sin, cos)`)
  - `railYawBehind(): number` returns `-Math.PI / 2`
  - `shaftClearZoom(cls, aspect, rig: "follow" | "rail", x: number): number` the largest zoom keeping the arrival camera at `x >= SHAFT_EAST_FACE + 1.5` for a rover at `x`
  - `ViewZone.railYaw?: number`, `OrbitState.zoneRailYaw: number | null`, `primeZone(s, zone, cls?, rail = false)`, `updateZone(s, zone, reduced, cls?, rail = false)`

- [x] **Step 1: Write failing tests** for `shoulderPose` (behind and above the rover, looking along the heading), `glidePose` (p 0 is start, p 1 is end, fov mixes), `glideProgress` (0 at 0, 1 at and after 1.5 s, monotonic), `cameraBehindHeading` (camera due west of the rover gives `PI / 2`), `shaftClearZoom` (the follow pose at that zoom has `x` equal to the limit), rail zones (`primeZone(..., rail)` sets `railYaw`, `updateZone` eases `railYawTarget` in and back to the nearest side view on exit, a hand rotation inside the zone keeps the rail where the visitor left it).
- [x] **Step 2: Run** `bunx vitest run tests/unit/arrival-glide.test.ts` and see them fail.
- [x] **Step 3: Implement** `arrival.ts` and the orbit changes.
- [x] **Step 4: Run** the new tests and the orbit and camera unit tests: pass.
- [x] **Step 5: Commit** `feat(camera): arrival glide math and rail-aware view zones`.

### Task 2: Floor arrivals and their views

**Files:**
- Modify: `src/experience/config.ts`, `src/experience/floors/lobby/observatoryLayout.ts`, `src/experience/floors/career/layout.ts`, `src/experience/floors/library/concepts/newsroom.ts`, `src/experience/floors/roof/layout.ts`
- Test: `tests/unit/arrivals.test.ts`; update `tests/unit/lobby-observatory.test.ts`, `tests/unit/roof-layout.test.ts`, `tests/unit/library-layout.test.ts` where they pin the old spawn or arrival.

**Interfaces:**
- Consumes: Task 1 (`LOOK_EAST_YAW`, `railYawBehind`, `shaftClearZoom`, `ViewZone.railYaw`).
- Produces: `FloorLayout.arrival` on every floor; a zone `"<floor>:arrival"` (L3 keeps `L3:overview`) that contains the arrival point and the road from the approach to it, `travel: { x: 1, z: 0 }`.

- [x] **Step 1: Write `tests/unit/arrivals.test.ts`** with, for every floor and the four sizes (1440x900, 1194x834, 834x1194, 390x844): `zoneAt(floor, { ...arrival, heading: PI/2 }, viewZones)` exists; the settled camera (follow: `followPose` with look-ahead and `followOffsetScale`, as in `labs-arrival.test.ts`; L2: `railPose` with the zone's `railYaw` and zoom) has `cameraBehindHeading` within 0.1 of `PI/2`; camera `x >= SHAFT_EAST_FACE + 1.5`; the rover and the main sight point project inside the safe box (`DESKTOP_SAFE` / `PHONE_SAFE`); the zone covers the straight road from the approach to the arrival.
- [x] **Step 2: Run** it and see L1, L2, L4, RF fail.
- [x] **Step 3: Implement** the arrival points and zones (numbers from captures; start from L1 `(-6, 0)`, L2 the 2019 plaza at `x = 0`, L4 `(-4, 0)`, RF `(-8, 0)`), drop `L1:arrival`, set L4 and RF spawn equal to arrival, move the RF availability sign yaw if the overview zone changes.
- [x] **Step 4: Run** all unit tests touching layouts: pass.
- [x] **Step 5: Commit** `feat(floors): L3-style arrival point and view on every floor`.

### Task 3: Roll-on, reduced-motion cut and the glide in the cameras

**Files:**
- Modify: `src/experience/missions/host3d.ts`, `src/experience/rover/runtime.ts`, `src/experience/scene/Director.tsx`, `src/experience/camera/CameraDirector.tsx`

**Interfaces:**
- Consumes: Task 1 and Task 2.
- Produces: `roverRuntime.steering: boolean` (manual drive input this frame), `roverRuntime.cameraBehind: number` (probe, `cameraBehindHeading` of the drawn camera), `roverRuntime.arrivalGlide: number` (probe: glide progress 0..1, -1 when no glide), the roll-on request `{ point, state, arrival: true }`.

- [x] **Step 1:** Director: flag the roll-on request `arrival: true`; under reduced motion teleport the rover to `to.arrival` heading `ARRIVAL_HEADING` and set `cameraSnap` instead of rolling; write `roverRuntime.steering = manual` every frame.
- [x] **Step 2:** CameraDirector: on the frame the stored ride enters `opening` (not reduced) prime the orbit to the destination's arrival zone (rail-aware) and start the glide; each glide frame compute the rig pose as usual (`end`), `shoulderPose` (`start`), draw `glidePose(start, end, glideProgress(t))` with `snap`, no collision clamp. End the glide at 1.5 s, on any orbit, zoom or view intent, on `roverRuntime.steering`, or when the phase leaves explore and elevator. Skip `updateZone` while the glide runs or the arrival roll-on drives. Under reduced motion prime the arrival zone on the frame the ride ends. Pass `rail` to `primeZone` and `updateZone`. Write the probes.
- [x] **Step 3:** Run `bun run typecheck && bun run lint && bun run test`.
- [x] **Step 4:** Commit `feat(camera): glide out of the elevator car into the arrival view`.

### Task 4: E2E and captures

**Files:**
- Create: `e2e/arrivals.spec.ts`
- Modify: e2e specs that relied on the old arrival (`e2e/visits.spec.ts`, `e2e/roof.spec.ts`, `e2e/fast-return.spec.ts`, others found by `bun run e2e:changed`).

- [x] **Step 1:** `e2e/arrivals.spec.ts`: ride L1 to L2, L3, L4, RF and back to L1 at 1440x900 (lite) and 390x844 (lite); after each arrival settles, `cameraBehind` within 0.1 of `PI/2` and rover heading within 0.1 of `PI/2`; the glide probe passes 0 < p < 1 during the ride end; a key press during the glide ends it (`arrivalGlide` -1 within a few frames); reduced motion: no glide frame, rover at the arrival point, same yaw check.
- [x] **Step 2:** Run `bun run e2e:changed` and fix fallout.
- [x] **Step 3:** After captures with `scripts/arrival-shots.ts` at four sizes, before (main) and after; send them to the coordinator.
- [x] **Step 4:** Perf: `E2E_PORT=4321 bun run e2e:perf` ride and floor peaks against main.
- [x] **Step 5:** Commit `test(e2e): arrival camera behind the rover on every floor`.

### Task 5: Docs

- [x] `docs/agents/3d-experience.md`: new "Elevator arrival" section (glide, hold, reduced motion, probes).
- [x] `docs/agents/floors.md`: `FloorLayout.arrival` on every floor and its zone rule.
- [x] Floor files: L1 (arrival zone replaces `L1:arrival`), L2 (rail arrival zone), L4, RF (spawn and arrival).
- [x] `docs/decisions.md`: dated row (2026-10-17, owner words). `docs/features.md`: status log line.
- [x] `docs/superpowers/README.md`: plan row.
- [x] Commit `docs: L3-style arrivals`.
