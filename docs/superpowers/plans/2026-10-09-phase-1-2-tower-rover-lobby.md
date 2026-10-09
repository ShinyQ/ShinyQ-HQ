# Phase 1-2: Tower Shell, Screen Rover and Lobby Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mount an explorable React Three Fiber tower on `/{locale}` (five neon floors, a glass elevator, camera rigs, input intents, GPU tier gate) with a drivable Screen Rover and a content-driven L1 Lobby, while the existing HTML page stays underneath for SEO and the static tier.

**Architecture:** A small client `ExperienceGate` decides the GPU tier and lazy-loads the 3D chunk into a fixed overlay portalled to `<body>`. All behaviour that can be pure is pure and unit-tested (store, intents, navgrid A*, collision, rover movement, elevator ride machine, camera rigs, tier decision, URL sync). R3F components only read the zustand store and per-frame controllers; the HUD is HTML/Tailwind and talks to the scene only through the store and the intent bus.

**Tech Stack:** Next.js 16 static export, React 19, three 0.186, @react-three/fiber 9, @react-three/drei 10 (`RoundedBox`, `Text`, `Edges`), @react-three/postprocessing 3 (bloom, full tier only), zustand 5 (`persist`), next-intl 4, Vitest, Playwright (SwiftShader WebGL).

## Global Constraints

- No em dashes (U+2014) anywhere. Ranges are written "X to Y".
- Content is data: Lobby text comes from `content/site-content.json` via `@/content/load`, never hardcoded. UI strings live in `messages/{en,id}.json` with identical keys.
- Static export: no server runtime, no API routes. The 3D chunk is client-only (`next/dynamic`, `ssr: false`).
- Every route works without WebGL. The 3D overlay never removes the HTML content; it is portalled on top and the page shell becomes `inert` only while the overlay is active.
- Floor constants (appendix 01): `FLOOR_GAP = 14`, `FLOORS = ["L1","L2","L3","L4","RF"]`, shaft center `(-28, *, 0)` 6 x 6, elevator door `(-24, 0)` (RF `(-20, 0)`), rover parks 3 u in front of the door, navgrid cell 1 u.
- Rover tuning (appendix 03): max speed 9 (fine) / 8 (coarse), autopilot 12, accel 18, braking 26, turn 3.5 rad/s, radius 1.0, tilt up to 8 degrees.
- Cameras (appendix 03): follow FOV 38/42/50 offsets (14,15,14)/(16,18,16)/(18,24,18); rail FOV 40/45/55 at (x,13,24)/(x,15,28)/(x,18,34) looking at (x+4,0,0); dolly easeInOutCubic 0.8 s; intro orbit radius 70/80/90, 120 degrees; spring half-life 0.18 s; drag yaw up to 25 degrees, springs back after 2 s; Ctrl+wheel / pinch zoom 0.8 to 1.25.
- Tiers (appendix 08): `full` (bloom, point lights, DPR up to 2), `lite` (no bloom, no point lights, fewer packets, DPR up to 1.5), `static` (no WebGL). `?tier=full|lite|static` overrides.
- Budgets: initial JS < 350 KB gzip before 3D, 3D chunk < 600 KB gzip, < 150 draw calls per floor.
- Reduced motion: no camera sway, instant elevator cut (150 ms fade), no particles, no typing effects, intro becomes a 200 ms fade.
- Store persistence key `hq:v1`, persisting only `visited`, `firstVisit`, `locale`, `sound`.
- Before pushing: `bun run typecheck && bun run lint && bun run test && bun run build && bun run e2e`.

## Decisions and deviations (documented here and in AGENTS.md)

1. **GPU tier heuristic instead of `detect-gpu`.** `detect-gpu` downloads benchmark tables at runtime from a CDN. Phase 1 uses a local heuristic: WebGL2 availability, the unmasked renderer string (software renderers such as SwiftShader or llvmpipe map to `lite`), `saveData`, coarse pointer with `deviceMemory < 4`, and `hardwareConcurrency <= 2`. Phase 6 may revisit with self-hosted benchmarks.
2. **Ready floors.** L2 to RF are placeholders in this phase. URL sync is implemented and tested, but floor URLs are only written for floors listed in `READY_FLOORS` (currently `["L1"]`). Placeholder floors keep the URL at `/{locale}` and the HUD offers a link to that floor's HTML page. The experience mounts only on `/{locale}`; Phases 3 and 4 add their routes.
3. **L3 elevator door.** Appendix 01 puts the L3 elevator door in the atrium at `(0, -7)` while the shaft runs at `x = -28`. The placeholder L3 uses `(-24, 0)` like the other floors and treats the shaft footprint as an obstacle. Phase 4 must resolve this (for example by offsetting the L3 group).
4. **Boot and intro.** First visit: boot overlay, then intro. Return visit (`firstVisit === false`): no boot overlay, intro plays and is skippable. Language switch resumes on the same floor with no boot and no intro (`sessionStorage["hq:resume"]`).
5. **Page view.** The HUD has a "Page view" button that hides the overlay for the session (`sessionStorage["hq:view"] = "page"`) and shows an "Explore in 3D" banner on the page.
6. **Store additions** beyond appendix 06: `device: { viewport, coarse }`, `reducedMotion`, `elevator` ride state, `notice` (toast text), `view` (`"3d" | "page"`).

## File structure

```
public/fonts/                    Inter + JetBrains Mono woff for troika Text (OFL, licenses alongside)
src/store/useHQStore.ts          createHQStore(storage?) factory + singleton hook, actions
src/lib/gpu-tier.ts              decideTier(inputs) pure + readTierInputs() browser probe
src/lib/url-sync.ts              parseHQUrl / serializeHQUrl / floorRoute
src/lib/viewport.ts              viewportClass(width, height), cameraClass(...)
src/lib/reduced-motion.ts        prefersReducedMotion()
src/lib/audio.ts                 sound stub (setSoundEnabled no-op)
src/content/experience.ts        getExperienceData(locale): serializable Lobby/tower data
src/experience/
  config.ts                      tower constants, floor layouts, READY_FLOORS, tuning tables
  types.ts                       Vec2, Rect, FloorLayout, ExperienceData
  ExperienceGate.tsx             client gate: tier, lazy import, portal, page-view banner
  Experience.tsx                 default export: Canvas + Scene + Hud (the lazy 3D chunk)
  scene/Scene.tsx                lights, fog, background, tower, rover, director, effects
  scene/Director.tsx             per-frame loop: input -> elevator machine -> rover controller -> store
  scene/Effects.tsx              bloom (full tier only)
  tower/Tower.tsx                floors + shaft + frame, level-of-detail by distance
  tower/FloorSlab.tsx            slab, accent edges, grid
  tower/ElevatorShaft.tsx        glass shaft, car, doors
  tower/PlaceholderFloor.tsx     label + optional L2 year ticks
  tower/elevator.ts              pure ride machine
  floors/Lobby.tsx               L1 composition
  floors/lobby/*.tsx             ProfileHologram, StatsRing, SkillsWall, CertWall, MissionKiosk, Lanes
  rover/Rover.tsx                procedural mesh, face screen, flag, dust
  rover/faces.ts                 pure face selection + frames
  rover/faceTexture.ts           CanvasTexture drawing
  rover/movement.ts              pure stepRover
  rover/controller.ts            RoverController (pose, path, update)
  nav/collision.ts               resolveCircle
  nav/navgrid.ts                 buildNavGrid, findPath, isWalkable, nearestWalkable
  camera/rigs.ts                 pure rig math, selectRig, springStep
  camera/CameraDirector.tsx      applies rigs each frame
  input/intents.ts               Intent union, IntentBus, pure mappers
  input/useInputSources.ts       keyboard, wheel, pointer swipe/pinch/drag listeners
  input/joystick.ts              shared joystick vector
src/hud/                         Hud, ProfileCard, ElevatorPanel, TopBar, MobileMenu, HintBar, Joystick, BootOverlay, IntroSkip, Toast
tests/unit/                      store, gpu-tier, url-sync, viewport, intents, navgrid, collision, movement, elevator, rigs, faces, experience-data
e2e/experience.spec.ts           boot, intro skip, elevator (panel, wheel, keys, swipe), rover (keys, click, tap, joystick), tier fallback
e2e/screenshots.spec.ts          + 1024x1366 and 3D captures
```

---

### Task 1: Pure foundations (config, types, viewport, gpu tier, url sync)

**Files:** create `src/experience/types.ts`, `src/experience/config.ts`, `src/lib/viewport.ts`, `src/lib/gpu-tier.ts`, `src/lib/url-sync.ts`; tests `tests/unit/gpu-tier.test.ts`, `tests/unit/url-sync.test.ts`, `tests/unit/viewport.test.ts`.

**Interfaces (produces):**
- `type Vec2 = { x: number; z: number }`, `type Rect = { minX; maxX; minZ; maxZ }`.
- `FLOOR_GAP = 14`, `FLOOR_IDS: readonly FloorId[]`, `floorIndex(id)`, `floorY(id)`, `READY_FLOORS: FloorId[]`.
- `buildFloorLayouts(yearCount: number): Record<FloorId, FloorLayout>` with `FloorLayout = { id, bounds: Rect, door: Vec2, approach: Vec2, obstacles: Rect[], spawn: Vec2, accent: string }`.
- `viewportClass(w, h): "desktop" | "tablet" | "mobile"`; `cameraClass(w, h)` (landscape phones use `tablet`).
- `decideTier(i: TierInputs): Tier` where `TierInputs = { override?: string | null; webgl2: boolean; renderer?: string; saveData?: boolean; coarse: boolean; deviceMemory?: number; cores?: number }`.
- `parseHQUrl(pathname, search): { locale, floor, activeRoom, view } | null`, `serializeHQUrl(state): string`, `floorRoute(floor)`.

- [ ] Write tests: tier override wins for valid values, ignored for junk; no WebGL2 or `saveData` gives `static`; SwiftShader renderer gives `lite`; coarse + `deviceMemory 2` gives `lite`; desktop default `full`. URL: `/en` to L1, `/id/journey` to L2, `/en/journey/x` to `L2:x`, `/en/labs/y?view=architecture` to `L3:y` + hologram view, `/en/blog/z` to `L4:z`, `/en/contact` to RF; serialize round-trips; unknown paths return null. Viewport: 390x844 mobile, 844x390 mobile with tablet camera, 1024x1366 desktop width rule, 800x1000 tablet.
- [ ] Run `bun run test` and see them fail, implement, see them pass.
- [ ] Commit `feat: tower config, gpu tier gate and url sync helpers`.

### Task 2: Store

**Files:** create `src/store/useHQStore.ts`; test `tests/unit/store.test.ts`.

**Interfaces:** `createHQStore(storage?: StateStorage)`, `useHQStore` (singleton, browser storage). State per appendix 06 plus decision 6. Actions: `setPhase`, `goToFloor(floor)`, `requestElevator(dir | floor)`, `setElevator(ride | null)`, `arriveFloor(floor)`, `openRoom`, `closeRoom`, `startMission`, `cancelMission`, `markVisited`, `setLocale`, `toggleSound`, `setTier`, `setRover(partial)`, `setDevice`, `notify(text)`, `finishIntro()`.

- [ ] Tests: defaults; `requestElevator("up")` from L1 creates a ride L1 to L2 in stage `toDoor`; ignored at RF; ignored while a ride is moving; `finishIntro` sets phase `explore` and `firstVisit false`; `markVisited` dedupes; persistence partializes only the four keys (inspect a memory storage after `setState`).
- [ ] Implement, pass, commit `feat: zustand HQ store`.

### Task 3: Input intents

**Files:** `src/experience/input/intents.ts`, `src/experience/input/joystick.ts`; test `tests/unit/intents.test.ts`.

**Interfaces:** `type Intent = { type: "move"; x; y } | { type: "goto"; point: Vec2 } | { type: "elevator"; to: "up" | "down" | FloorId } | { type: "scrub"; dx } | { type: "open"; room } | { type: "cancel" } | { type: "palette" } | { type: "terminal" } | { type: "toggle"; what: "sound" | "lang" | "readme" } | { type: "zoom"; factor } | { type: "orbit"; dyaw }`. `createIntentBus()` with `emit`, `on`. Pure mappers: `keyToIntent(key, {ctrl, meta, inText})`, `moveVectorFromKeys(held: Set<string>)`, `createWheelGate({ threshold, cooldownMs })`, `classifySwipe({dx, dy, ms})`, `applyDeadZone(x, y, dz)`.

- [ ] Tests: WASD/arrows to vectors (diagonals normalized); PageUp to elevator up; Esc to cancel; `m`, `l`, `t` toggles; `/` and Ctrl+K palette; anything ignored in text inputs; wheel gate fires once per gesture and respects cooldown; swipe > 60 px under 400 ms vertical up gives `up`, slow or short gives null, horizontal gives scrub; dead zone 12%.
- [ ] Implement, pass, commit `feat: input intents layer`.

### Task 4: Navigation (collision + navgrid A*)

**Files:** `src/experience/nav/collision.ts`, `src/experience/nav/navgrid.ts`; tests `tests/unit/collision.test.ts`, `tests/unit/navgrid.test.ts`.

**Interfaces:** `resolveCircle(p: Vec2, r, obstacles: Rect[], bounds: Rect): Vec2`. `buildNavGrid({ bounds, obstacles }, radius, cell = 1): NavGrid`, `isWalkable(grid, p)`, `findPath(grid, from, to): Vec2[] | null` (8-way, octile heuristic, no corner cutting, snap to nearest reachable cell, string-pulled).

- [ ] Tests: circle slides along a wall (tangential motion kept); circle inside a box pushed out by the shortest axis; bounds clamp. Path around a wall exists and never enters inflated obstacles; straight line in open space collapses to one waypoint; target inside an obstacle snaps to the closest reachable cell; target in a sealed pocket snaps to the reachable side; Lobby layout spawn to elevator approach reachable.
- [ ] Implement, pass, commit `feat: navgrid A* and circle collision`.

### Task 5: Rover logic (movement, faces, controller)

**Files:** `src/experience/rover/movement.ts`, `faces.ts`, `controller.ts`; tests `tests/unit/movement.test.ts`, `tests/unit/faces.test.ts`.

**Interfaces:** `stepRover(pose: RoverPose, desire: { x; z } | null, dt, tuning, world: { obstacles; bounds }): RoverPose` with `RoverPose = { x; z; heading; speed; tilt }`, forward = `(sin h, cos h)`. `cameraRelative(input: {x, y}, cameraForward: Vec2): Vec2`. `faceFor({ phase, speed, autopilot, blockedUntil, arrivedUntil, elevatorDir, now }): RoverFace`, `faceText(face, t)`. `RoverController` with `pose`, `setPath(points)`, `clearPath()`, `update(dt, manual, ctx): { arrived: boolean }`.

- [ ] Tests: accelerates at 18 u/s2 to the cap; brakes at 26 u/s2; turn rate capped at 3.5 rad/s; never exceeds max speed; collides with a wall without crossing it; camera-relative W points away from the camera; faces: driving `>>>`, elevator up glyph, blocked `o_o`, idle blink frames.
- [ ] Implement, pass, commit `feat: rover movement, faces and controller`.

### Task 6: Elevator ride machine and camera rigs

**Files:** `src/experience/tower/elevator.ts`, `src/experience/camera/rigs.ts`; tests `tests/unit/elevator.test.ts`, `tests/unit/rigs.test.ts`.

**Interfaces:** `type RideStage = "toDoor" | "boarding" | "closing" | "moving" | "opening" | "exiting"`; `advanceRide(ride, dt, { atDoor, reduced }): Ride | null`; `rideDuration(from, to)`; `carY(ride)`; `easeInOutCubic`. Rigs: `selectRig(phase, floor): "intro" | "follow" | "rail"`, `followPose(cls, target, yaw, zoom)`, `railPose(cls, roverX, floorY)`, `introPose(cls, t)`, `springFactor(dt, halfLife = 0.18)`.

- [ ] Tests: stage order; dolly lasts 0.8 s for one floor; reduced motion collapses to a 150 ms cut; `carY` is eased between floor heights; rail camera on L2, follow elsewhere; follow offsets per class; intro sweeps 120 degrees; spring factor 0.5 at one half-life.
- [ ] Implement, pass, commit `feat: elevator ride machine and camera rigs`.

### Task 7: Experience data and gate

**Files:** `src/content/experience.ts`, `src/experience/ExperienceGate.tsx`, `src/lib/reduced-motion.ts`, `src/lib/audio.ts`; modify `src/app/[locale]/layout.tsx` (wrap header/main/footer in `#site-shell`), `src/app/[locale]/page.tsx` (render the gate), `messages/*.json` (`hud` namespace); test `tests/unit/experience-data.test.ts`.

- [ ] Test `getExperienceData("id")` returns Indonesian labels, 6 stats, 4 skill groups, every certification, verify URLs only for those with `credentialUrl`, floor names, year count and room count.
- [ ] Gate: decides tier on mount, respects `?tier`, page view, lazy loads `Experience` with `next/dynamic`, portals into `document.body`, sets `inert` on `#site-shell` and locks scroll while active, listens for `hq:static` (context loss) to fall back with a toast.
- [ ] Commit `feat: experience gate and data bridge`.

### Task 8: Tower scene (Phase 1)

**Files:** `Experience.tsx`, `scene/*`, `tower/*`, `camera/CameraDirector.tsx`, `input/useInputSources.ts`, HUD `ElevatorPanel`, `TopBar`, `HintBar`, `ProfileCard`, `BootOverlay`, `IntroSkip`, `Toast`.

- [ ] Five slabs with accent edges and grid, glass shaft with car and doors, wireframe frame; neighbours render full detail, others silhouettes.
- [ ] Director runs elevator stages; wheel, PageUp/PageDown, vertical swipe and the panel all emit `elevator` intents.
- [ ] Follow, rail (L2 placeholder), dolly and intro rigs with spring smoothing; drag yaw and Ctrl+wheel/pinch zoom.
- [ ] Bloom on `full` only; DPR `[1, 2]` full, `[1, 1.5]` lite; context loss falls back to static.
- [ ] Commit `feat: tower shell, elevator and camera rigs`.

### Task 9: Rover and Lobby (Phase 2)

**Files:** `rover/Rover.tsx`, `rover/faceTexture.ts`, `floors/Lobby.tsx`, `floors/lobby/*`, HUD `Joystick`.

- [ ] Procedural rover per appendix 03 with CanvasTexture face (128 x 96, redrawn only when the frame changes), treads rolling with speed, tilt, antenna blink, dust on acceleration (not under reduced motion), arrival flag.
- [ ] Keyboard (camera-relative), click/tap-to-move via navgrid, joystick on coarse pointers, collision against Lobby obstacles.
- [ ] Lobby: hologram (KAW monogram, name, headline), stats ring, skills wall, certifications wall (badges open Microsoft Learn links), mission kiosk placeholder, lanes with packets.
- [ ] Commit `feat: screen rover and L1 Lobby`.

### Task 10: E2E, screenshots, docs, PR

**Files:** `playwright.config.ts` (SwiftShader args), `e2e/experience.spec.ts`, `e2e/helpers.ts`, `e2e/screenshots.spec.ts`, `AGENTS.md`, `README.md`.

- [ ] E2E: first visit boot overlay then intro skip; return visit has no boot; elevator via panel, wheel, PageUp/PageDown and swipe reaches every floor; WASD moves the rover and collision keeps it inside the Lobby; click-to-move and tap-to-move move the rover; joystick moves the rover on a touch context; `?tier=static` and a WebGL-less browser show the HTML only; no page errors.
- [ ] Screenshots at 1440x900, 1024x1366 and 390x844: Lobby 3D, L2 rail placeholder, plus the existing HTML pages (`?tier=static`).
- [ ] Docs: AGENTS.md sections for the experience layout, store additions, deviations above.
- [ ] Full check suite, push, PR "Phase 1-2: tower shell, rover and Lobby", local preview on port 4310.
