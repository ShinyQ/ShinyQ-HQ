# Visitor Observatory to the L1 Lobby, radial kiosk, kiosk spawn: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Visitor Observatory from RF to the south-west corner of the L1 Lobby (room `L1:visits`), put the Ask Rover kiosk on a straight radial spoke from the hologram ring facing it, and start the session in front of the kiosk, with the intro, the spawn view and the elevator arrival framed so the kiosk, the hologram and the observatory read.

**Architecture:** Pure layout data lives in `floors/lobby/` (`observatory.ts` gets an L1 placement, `kiosk.ts` derives its yaw from one axis), `config.ts` builds the L1 floor from it (obstacle, door, tall column, view zones), and `camera/orbit.ts` gains `yawLooking` plus a primed spawn zone so the intro ends exactly on the spawn view. RF loses every trace of the station and returns to its pre-#90 code. Old `RF:visits` ids and the `/contact#visits` hash resolve to `L1:visits` through one alias (`canonicalRoom`).

**Tech Stack:** Next.js 16 static export, React Three Fiber, three.js, zustand, Vitest, Playwright.

## Owner requests (verbatim)

1. "Also ive been thinking for the visitor observatory in the lobby instead". Choice: "South-west corner of the lobby, between the elevator and the Ask Rover kiosk: you see it right after stepping out of the elevator. Remove it from RF, keep the L1 visits tile on the stats ring and point it at the new spot (Recommended)".
2. "yeah and the rover kiosk not straight line into the circle".
3. "also first rover placement should be infront of his kiosk".

## Global Constraints

- No em dashes anywhere. EN and ID for every label (`messages/en.json`, `messages/id.json`, identical keys).
- L1 settled scene calls at most 125; triangles under 30k at every peak; shader programs within `e2e/perf/baseline.json` + 2 (no new program: the globe, dots and plates already use `holoFx`).
- Lite simpler (fewer land dots, lower sphere), reduced motion static (no globe spin, no country pulse).
- Classic site unchanged; `/{locale}/contact#visits` stays the Classic section and opens `L1:visits` in 3D.
- RF renders exactly as before #90 (`e02fc31b^`).
- E2E_PORT 4461 for local runs. CI is the authority for heavy e2e.

## Design (camera geometry)

The follow camera keeps a fixed default yaw: it sits along (+16, +18, +16) from the rover and looks north-west. The south-west corner is therefore behind the camera both at the elevator approach (-21, 0) and at the old spawn (14, 10) (captures in `screenshots/before/`). The composition puts the hologram H (6, 0), the spawn R, the kiosk K and the observatory O on one line (the kiosk axis), and turns the camera with view zones:

| Piece | Value |
| --- | --- |
| Observatory footprint `LOBBY.observatory` | x -24 to -17, z 14 to 21 (flush with the west and south slab edges) |
| Kiosk axis | unit vector from H to the observatory center (-20.5, 17.5) |
| Kiosk center | H + axis * 19.2 (about (-10.0, 10.6)), yaw faces H (`kioskFacing` = -axis) |
| Kiosk lane spoke | ring point on the axis to the kiosk front + 0.4 u: one straight radial segment |
| Spawn `LOBBY.spawn` | `kioskStop()` (about (-6.7, 8.5)), heading toward the kiosk |
| `L1:kiosk` view zone | around the kiosk stop, camera behind the rover looking down the axis (`yawLooking(-kioskFacing)`), zoom 1.35; primed (no ease) at boot, intro and deep-link spawn |
| `L1:arrival` view zone | around the elevator approach, camera looking toward the observatory and the kiosk (`yawLooking` of the direction about 70 degrees, south-south-east) |
| Observatory door | north face center, pad 1.1 u in front, facing (0, 1), spur none (L1 has no road here), view zone looking south at the panel |
| Panel | front right of the footprint, yaw facing north-north-east (reads from the spawn view and the arrival view) |
| Globe | back left of the footprint, radius 2.2, top at 6.8 (tall column 7.4) |

Reduced motion: view zones never auto-turn (existing rule), but the spawn zone is primed as an initial state (no motion), so the first frame is the same.

## File structure

- Move `src/experience/floors/roof/{observatory.ts,VisitsStation.tsx,visitsRoom.ts}` to `src/experience/floors/lobby/`; `observatoryParts(rect)` takes the L1 footprint and returns globe, panel and solids; `VisitsStation` takes `parts` and renders its own solids through the lobby (one merged box mesh on the holo plate program is not needed: the solids join the observatory plate instances).
- `src/experience/floors/lobby/kiosk.ts`: `KIOSK_AXIS`, `kioskCenter()`, yaw from the axis, `kioskBounds()` (axis-aligned box of the turned footprint), `kioskLaneEnd()`.
- `src/experience/config.ts`: `LOBBY.observatory`, kiosk center and spawn from `kiosk.ts` (no circular import: `kiosk.ts` gets the axis math from plain numbers in `config.ts`), L1 obstacles, doors, tall, view zones.
- `src/experience/camera/orbit.ts`: `yawLooking(dir)`, `primeZone(state, zone)`.
- `src/experience/camera/CameraDirector.tsx`: intro end pose uses the primed orbit yaw and zoom; prime on the first frame.
- `src/experience/floors/lobby/Lanes.tsx`: kiosk spoke from `kioskLaneEnd()`.
- `src/experience/floors/Lobby.tsx`: mounts `VisitsStation`.
- RF: `floors/roof/layout.ts`, `SignalGarden.tsx`, `kit.tsx`, `Roof.tsx`, `fx/holoIcons.ts` (the drone's `globe` cargo) back to their pre-#90 form.
- Rooms: `missions/rooms.ts` (`L1:visits`), `missions/roomAliases.ts` (`canonicalRoom`), `room-views/lobby.ts` (view moves here), `room-views/roof.ts` (removed), `interact/registry.ts`, `ExperienceGate.tsx`, `Experience.tsx` (`hasPage`), `hud/drawer/urlSync.ts`, `store/useHQStore.ts` (`openRoom` alias, `initialRover` heading), `scripts/e2e-plan.ts`.
- Tests: `tests/unit/{lobby-layout,kiosk,lobby-observatory,roof-layout,interact-registry,missions-rooms,e2e-plan,viewport,camera-orbit}.test.ts`, `e2e/visits.spec.ts`, `e2e/visual-gate.spec.ts` (L1 poses).
- Docs: `README.md`, `AGENTS.md`, specs 01, 03, 06, 08.

---

### Task 1: Camera helpers (`yawLooking`, `primeZone`)

**Files:** Modify `src/experience/camera/orbit.ts`; Test `tests/unit/orbit-look.test.ts`

**Interfaces:** Produces `yawLooking(dir: Vec2): number` (orbit yaw whose follow camera looks along `dir`) and `primeZone(s: OrbitState, zone: ViewZone | null): void` (sets yaw, yawTarget, zoom, zoomTarget and `zone` at once, no easing).

- [ ] Test: `yawLooking({x:0,z:-1})` is `-PI/4`; `yawLooking({x:-1,z:-1})` is 0; for any yaw, `orbitOffset(FOLLOW.desktop.offset, yawLooking(d), 0)` points along `-d`. `primeZone` sets `zone`, `yaw === yawTarget`, `easing === false`, then `updateZone` with the same zone changes nothing.
- [ ] Implement: `atan2(dz - dx, -(dx + dz))`; `primeZone` copies the zone yaw and zoom.
- [ ] Commit `feat(camera): yawLooking and primed view zones`.

### Task 2: Radial kiosk, spawn in front of it

**Files:** Modify `src/experience/config.ts`, `src/experience/floors/lobby/kiosk.ts`, `src/experience/floors/lobby/layout.ts`, `src/experience/floors/lobby/Lanes.tsx`, `src/experience/rover/runtime.ts`, `src/store/useHQStore.ts`, `src/experience/interact/registry.ts`; Test `tests/unit/kiosk.test.ts`, `tests/unit/lobby-layout.test.ts`, `tests/unit/viewport.test.ts`

**Interfaces:** Produces `KIOSK_AXIS: Vec2`, `kioskCenter(): Vec2`, `kioskFacing(): Vec2` (= -axis), `kioskBounds(): Rect`, `kioskLaneEnd(): Vec2`, `kioskStop(): Vec2`, `SPAWN_HEADING: number`.

- [ ] Tests: the kiosk center, its stop, the lane end and H are collinear (cross product 0) and in that order away from H; the facing points at H; the lane spoke starts on the ring circle and ends 0.4 u in front of the kiosk front; the kiosk keeps 4 u of walkway outside the lane ring; `buildFloorLayouts(8).L1.spawn` equals `kioskStop()`; the stop is walkable; `initialRover` faces the kiosk.
- [ ] Implement, then update `lobbyElements` (turned kiosk box) and the registry bounds.
- [ ] Commit `feat(lobby): kiosk on a straight radial spoke, session spawn in front of it`.

### Task 3: L1 observatory layout (pure)

**Files:** Move `floors/roof/observatory.ts` to `floors/lobby/observatory.ts`; Modify `src/experience/config.ts`; Test `tests/unit/lobby-observatory.test.ts` (from `roof-observatory.test.ts`)

**Interfaces:** Produces `LOBBY.observatory: Rect & { h: number }`, `observatoryParts(rect = LOBBY.observatory): ObservatoryParts`, `OBSERVATORY_DOOR: DoorTrigger`, L1 `viewZones` entries `L1:visits`, `L1:kiosk`, `L1:arrival`.

- [ ] Tests: footprint inside the slab, clear of the call pad (4 u), the elevator lane (z 0, 4 u), the kiosk (rover can pass, 2.5 u) and the camera zones of other features; the door pad is walkable, faces into the footprint, and the navgrid connects the approach to it; globe, panel and pedestal inside the footprint; the tall column covers the globe top; the zones are ordered so the kiosk zone wins at spawn and the arrival zone wins at the approach.
- [ ] Implement in `config.ts` (obstacle, door, tall, zones).
- [ ] Commit `feat(lobby): Visitor Observatory layout in the south-west corner`.

### Task 4: Room `L1:visits`, alias, scenery and RF removal

**Files:** Move `VisitsStation.tsx`, `visitsRoom.ts`; Modify `Lobby.tsx`, `Roof.tsx`, `roof/layout.ts`, `roof/SignalGarden.tsx`, `roof/kit.tsx`, `fx/holoIcons.ts`, `Experience.tsx`, `ExperienceGate.tsx`, `missions/rooms.ts`, `missions/roomAliases.ts` (new), `missions/bridge.ts`, `store/useHQStore.ts`, `hud/drawer/urlSync.ts`, `room-views/{lobby,roof,types}.ts`, `interact/registry.ts`, `scripts/e2e-plan.ts`; Tests as listed above.

- [ ] Tests: `canonicalRoom("RF:visits") === "L1:visits"`; `visitsRoomFromHash` answers `L1:visits` for `#visits` on RF and on L1; the catalog has `L1:visits` (path `/contact#visits`) and no `RF:visits`; the room views build `L1:visits` and the `L1:stats` link points at it; the registry has `L1:door:visits` (or `L1:station:visits`) and RF has no visits item; `roofActive` never returns `visits`; the RF layout equals the pre-#90 one (four obstacles, two doors, no tall).
- [ ] Implement; restore the RF files with `git show e02fc31b^:<path>` where nothing else changed them since.
- [ ] Commit `feat(lobby): L1:visits room, RF:visits alias; remove the observatory from RF`.

### Task 5: Spawn and arrival framing (intro handover)

**Files:** Modify `CameraDirector.tsx`, `Experience.tsx`; Test `tests/unit/camera-*.test.ts`, `e2e/visits.spec.ts`

- [ ] Prime the orbit to the spawn zone on the first frame and when the boot starts; the intro end pose is `followPose(cls, target, orbit.yaw, orbit.zoom)`, so the fly-in lands on the follow pose (no jump at `finishIntro`).
- [ ] Capture the first frame after the intro, the spawn, the arrival, the observatory close-up and the drawer at 1440x900 full, 2560x1440 full and 390x844 lite; tune the axis distance, zoom and arrival direction until all three read; record numbers here.
- [ ] Commit `feat(camera): intro lands on the kiosk spawn view; arrival zone shows the observatory`.

### Task 6: E2E, budgets, visual gate

- [ ] `e2e/visits.spec.ts`: station reachable from the elevator arrival (point-and-go), drawer filters, opt-out, ring tile link, `/en/contact#visits` and an `RF:visits` history entry open `L1:visits`.
- [ ] Fix specs that drive from the old spawn (`e2e:changed`).
- [ ] Perf lane: L1 spawn, arrival, south-west corner and RF before and after; programs baseline unchanged.
- [ ] Visual gate: RF poses against `e02fc31b^`; L1 poses documented as deliberate.

### Task 7: Docs

- [ ] README, AGENTS.md (room list, L1 layout, Public visit stats display, spawn), specs 01, 03, 06, 08.

## Self-review

- Spec coverage: move (Tasks 3, 4), RF removal (Task 4, 6), budgets (Task 6), Classic unchanged (Task 4 keeps `/contact#visits`), tests (all), docs (Task 7), kiosk (Task 2), spawn and intro (Tasks 2, 5).
- Names: `kioskFacing`, `kioskStop`, `KIOSK_AXIS`, `yawLooking`, `primeZone`, `canonicalRoom`, `visitsRoomFromHash`, `observatoryParts` are used consistently.
