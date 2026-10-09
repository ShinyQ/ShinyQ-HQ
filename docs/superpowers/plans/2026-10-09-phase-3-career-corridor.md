# Phase 3: Career Archive Corridor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the L2 placeholder slab into the Career Archive corridor described in appendix 01 section 3. It is generated from `getYears()`, uses the rail camera and swipe scrubbing, has real door triggers, and supports deep links at `/{locale}/journey` and `/{locale}/journey/[slug]`.

**Architecture:** The corridor layout is computed in one pure module (`floors/career/layout.ts`) from a small serializable `career` payload on `ExperienceData`. That layout feeds `buildFloorLayouts` (navgrid obstacles, door zones, scrub stops), the mission host (`roomTarget`) and the R3F components (instanced room geometry, troika labels). Door zones follow the generic `FloorLayout.doors` contract agreed with Phase 4. Rooms open through `store.openRoom`, and a temporary `RoomPeek` HUD panel shows them until the Phase 4 Glass Drawer replaces it.

**Tech Stack:** Next.js 16 static export, React Three Fiber 9, drei `Text` (troika), three `InstancedMesh`, zustand, Vitest, Playwright (SwiftShader).

## Global Constraints

- No em dashes (U+2014) anywhere. The safety test scans the repo.
- Content is data. Career facts come from `content/site-content.json` through `@/content/load`. Never hardcode them in components.
- Bilingual: every new UI string goes into both `messages/en.json` and `messages/id.json`, with identical keys.
- Static export: pages pre-render, `dynamicParams = false` stays, and there is no runtime server.
- Every route works without WebGL. The gate mounts on top of the HTML page and never replaces it.
- Pure modules (layout, doors, rigs, scrub) stay free of React and three, so Vitest runs them in node.
- The 3D chunk never imports `@/content/load` or zod. Data arrives through `ExperienceData`.
- Draw calls per floor < 150 (appendix 08), so repeated room geometry uses instancing or merged lines.
- Keep shared-file edits (`host3d.ts`, `config.ts`, `Director.tsx`, store, `Tower.tsx`, `Experience*.tsx`) small and additive. Phase 4 and Phase 5a edit the same files.

## Cross-session contracts (agreed 2026-10-09)

| Contract | Owner | Shape |
|---|---|---|
| Deep links | Phase 5a + 3 + 4 | `ExperienceGate({ data, startFloor?: FloorId, startRoom?: RoomId })` passes both through to `Experience`. `startSession` resumes at `layouts[startFloor].spawn` (or at the room's door) and skips boot and intro |
| Door zones | Phase 4 (Director), Phase 3 fills L2 | `FloorLayout.doors?: { room: RoomId; at: Vec2; size?: number }[]`, where `at` is the center of a 2 × 2 zone. The Director checks them in explore, latches until the rover leaves, and emits `{ type: "open", room }`, which it handles with `store.openRoom(room)` |
| Room links | Phase 3 | `RoomInfo.link?: RoomId` (career `podRef` to `L3:<pod>`, pod `timelineRef` to `L2:<slug>`) |
| Layout inputs | Phase 4 + 3 | `buildFloorLayouts(yearCount, extras: LayoutExtras = {})`, where `LayoutExtras` in `types.ts` has optional per-floor inputs (`labs?`, `career?`). `roomTarget` checks `layouts[floor].doors` first for every floor |
| Mission jump | Phase 3 | `goToRoom(room, tab?)` in `missions/bridge.ts` calls `runner?.goTo` |
| Drawer | Phase 4 | Renders from `store.activeRoom` and closes with `closeRoom()`. After Phase 4 merges, delete `RoomPeek` and move L2 content into `src/content/room-views/career.ts` plus a body in `src/hud/drawer/bodies.tsx` |

## Design decisions

1. **Segments.** One segment of 14 u per year from `getYears()`, starting at x = -20. Pre-2019 entries are already folded into 2019 by `groupEntriesByYear`. The year gate (arch plus large mono digits) sits at the segment start.
2. **Rooms.** Within a year, entry `i` goes on side `i % 2 === 0 ? -1 : +1`, in row `floor(i / 2)`, with center z = `side * (10 + 9 * row)` (so rows sit at ±10, ±19, ±28 and so on) and center x = segment start + 7. Award rooms are 6 × 6 trophy plinths. Every other room is 9 × 8. Rooms are open bays: only the 2 × 2 hologram pedestal is an obstacle, so stacked rows are reachable across the inner bay.
3. **Doors.** Each door sits on the room's corridor-facing edge. The zone center `at` is 1 u further toward the corridor, so row 0 zones sit just outside the 8 u corridor and the rover never trips them while driving along the corridor center. `roomTarget` drives to `at`.
4. **Trigger rule.** Triggers fire only when the rover is not following a path. Click-to-move or autopilot through a zone therefore never opens it, while arriving inside a zone (a mission `drive`, or a click on the room) does. This also keeps a mission's `drive` step from stalling: the open happens on the frame after the arrival marks the request `done`.
5. **Rail camera z-follow.** The rail rig keeps the spec pose while |z| ≤ 4 (the corridor). Outside it, the camera and its target shift by `sign(z) * (|z| - 4)`, so the rover stays in frame inside stacked rooms. This is a documented extension of appendix 03.
6. **Scrub.** A horizontal swipe on L2 (`scrub` intent, Δx in px) moves the rover along the corridor to a year stop: `n = max(1, round(|dx| / (0.3 * width)))` stops from the nearest stop. Swiping left moves forward in time. The stops are the segment centers plus the annex.
7. **Workshop annex.** A 20 × 16 u hall right after the last segment. Side-project benches sit in two rows, and a repo wall on the north side (z = -8) lists the public repos and the Hugging Face models. The workshop door zone sits in front of the wall, not on the corridor line. The glass window at the far end looks up at the L3 silhouette.
8. **Bounds.** x from -24 to the annex end. |z| goes up to the outermost room edge + 2 (at least 14).
9. **Interim room panel.** `RoomPeek` (non-modal) shows role, org, period and summary, plus "Read the page", "See the case study on L3" (`goToRoom(link)`) and Close. Esc, a click on the floor, a swipe or a mission drive closes it, and so does a new move (any move other than the key still held from driving in).
10. **URL sync.** It also writes `activeRoom` on ready floors (`/en/journey/<slug>`), so a deep link keeps its URL.

## File map

| File | Change |
|---|---|
| `src/experience/floors/career/layout.ts` | **New.** Pure: `buildCorridor`, `scrubTarget`, constants |
| `src/experience/nav/doors.ts` | **New.** Pure: `doorAt`, `stepDoors` |
| `src/experience/types.ts` | `FloorLayout.doors?`, `FloorLayout.scrubStops?`, `ExperienceData.career` |
| `src/experience/config.ts` | `READY_FLOORS` += L2. `buildFloorLayouts(yearCount, extras)` builds L2 from `extras.career` (`LayoutExtras` is shared with Phase 4) |
| `src/experience/camera/rigs.ts`, `CameraDirector.tsx` | `railPose(..., roverZ)` with the dead band |
| `src/experience/scene/Director.tsx` | `scrub` intent, door check, `open` intent handler |
| `src/experience/missions/host3d.ts` | `roomTarget` uses `layout.doors` first |
| `src/experience/missions/rooms.ts`, `bridge.ts` | `RoomInfo.link`, `goToRoom` |
| `src/experience/floors/CareerArchive.tsx`, `floors/career/*.tsx` | **New.** `CareerArchive` (floor root, next to `Lobby.tsx`), `YearGates`, `CareerRooms`, `WorkshopAnnex` |
| `src/experience/tower/Tower.tsx` | Mounts `CareerArchive` on L2 |
| `src/experience/Experience.tsx`, `ExperienceGate.tsx` | `startFloor`/`startRoom`, URL sync of `activeRoom` |
| `src/content/experience.ts` | `buildCareerData(locale)` |
| `src/hud/RoomPeek.tsx`, `Hud.tsx` | Interim room panel |
| `src/app/[locale]/journey/page.tsx`, `journey/[slug]/page.tsx` | Mount `ExperienceGate` |
| `messages/{en,id}.json` | `hud.career.*` labels |
| `tests/unit/career-layout.test.ts`, `doors.test.ts` | **New** |
| `tests/unit/{rigs,missions-host3d,experience-data,missions-rooms}.test.ts` | Extended |
| `e2e/career.spec.ts` | **New:** drive, scrub, open room, deep link, L3 link, draw calls |
| `e2e/experience.spec.ts`, `e2e/screenshots.spec.ts` | Placeholder test moves to L3, language-switch URL, L2 screenshots |
| `AGENTS.md` | Phase 3 notes (READY_FLOORS, contracts, deviations) |

## Tasks

### Task 1: Corridor layout (pure)

**Files:** create `src/experience/floors/career/layout.ts` and `tests/unit/career-layout.test.ts`.

**Produces:**
```ts
export type CareerType = "job" | "freelance" | "education" | "award" | "milestone";
export interface CorridorInput { years: { year: number; entries: { slug: string; type: CareerType }[] }[] }
export const CORRIDOR: { startX: -20; segment: 14; halfWidth: 4; roomZ: 10; rowPitch: 9; annexLength: 20; annexDepth: 16; doorDepth: 2 };
export interface CareerRoomLayout { id: RoomId; slug: string; type: CareerType; year: number; index: number; side: -1 | 1; row: number; center: Vec2; w: number; d: number; door: Vec2; at: Vec2 }
export interface YearSegment { year: number; startX: number; endX: number; centerX: number; rooms: CareerRoomLayout[] }
export interface CorridorLayout { segments: YearSegment[]; rooms: CareerRoomLayout[]; endX: number; annex: Rect; workshop: { at: Vec2; wallZ: number; benches: Vec2[] }; windowX: number; bounds: Rect; obstacles: Rect[]; doors: { room: RoomId; at: Vec2 }[]; stops: number[] }
export function buildCorridor(input: CorridorInput, benchCount?: number): CorridorLayout;
export function scrubTarget(x: number, dx: number, width: number, stops: readonly number[]): number;
```

- [ ] Write tests: segment x positions (`-20 + 14 i`), ascending years, alternating sides, outward rows (±10, ±19, ±28), award 6 × 6, door and `at` positions, pedestal obstacles, bounds containing every room and the annex, workshop door in front of the wall, stops, and `scrubTarget` (left swipe goes forward, at least one stop, clamped at the ends).
- [ ] Run `bunx vitest run tests/unit/career-layout.test.ts`. It should fail.
- [ ] Implement, then run again. It should pass. Commit `feat: generate the L2 corridor layout from year data`.

### Task 2: Door zones and rail z-follow (pure)

**Files:** create `src/experience/nav/doors.ts` and `tests/unit/doors.test.ts`; modify `src/experience/camera/rigs.ts` and `tests/unit/rigs.test.ts`.

**Produces:** `doorAt(doors, p): RoomId | null` (zone half size `size/2`, default 1), and `stepDoors(latch: { room: RoomId | null }, doors, p, { following, canOpen }): RoomId | null`, which updates the latch when not following and returns a room to open only on entering a new zone while `canOpen`. Also `railShift(z)` and `railPose(cls, x, floorY, zoom, z = 0)`.

- [ ] Tests: entering opens once, staying does not reopen, leaving and re-entering reopens, following never opens or updates the latch, a latch set while `canOpen` is false prevents reopening after close. `railShift` is 0 inside |z| ≤ 4 and linear outside it. `railPose` shifts the position and target z.
- [ ] Implement, run, commit `feat: door zones and rail camera z-follow`.

### Task 3: Data, layouts, host and links

**Files:** `src/experience/types.ts`, `src/content/experience.ts`, `src/experience/config.ts`, `src/experience/missions/{host3d,rooms,bridge}.ts`, tests `experience-data`, `missions-host3d`, `missions-rooms`.

**Produces:**
```ts
// ExperienceData.career
career: {
  years: { year: number; entries: CareerEntryView[]; awards: { title: string; placement: string }[] }[];
  sideProjects: { id: string; title: string; year: number | null; stack: string[] }[];
  repos: { name: string; language: string | null; stars: number }[];
  models: { id: string; title: string }[];
};
interface CareerEntryView { slug: string; type: CareerType; role: string; org: string; period: string; summary: string; prologue: boolean; link: RoomId | null; linkTitle: string | null }
// config
buildFloorLayouts(yearCount: number, extras: LayoutExtras = {}): Record<FloorId, FloorLayout> // extras.career: L2 gets bounds/obstacles/doors/scrubStops from buildCorridor
READY_FLOORS = ["L1", "L2"]
// bridge
goToRoom(room: RoomId, tab?: DrawerTab): void
```
- [ ] Tests: career years equal `getYears()`, Jenius has `link: "L3:digital-banking-integrations"`, the prologue flag is set for 2016, there are no em dashes, and both locales differ. `roomTarget("L2:jenius-2024")` equals that door's `at`. `RoomInfo.link` is set for career rooms with `podRef` and for pods with `timelineRef`. L2 layout doors cover every career room plus `L2:workshop`.
- [ ] Implement, run `bun run test`, commit `feat: career data, L2 layout and room links for the 3D tower`.

### Task 4: Corridor scene

**Files:** create `src/experience/floors/CareerArchive.tsx` and `src/experience/floors/career/{YearGates,CareerRooms,WorkshopAnnex}.tsx`; modify `Tower.tsx`, `Scene.tsx`, `Experience.tsx` (labels and `buildFloorLayouts` args), and the messages.

- Corridor strip: a `GlassBox` floor strip plus a merged line of year ticks.
- Gates: one merged `lineSegments` for every arch, and one `Text` per year. The 2019 gate gets a "Prologue" plaque.
- Rooms: one `InstancedMesh` for pad fills (clickable, which emits `goto` to `at`), merged pad edges, one `InstancedMesh` for pedestals, one `InstancedMesh` per hologram type (job: stacked boxes, freelance: octahedron, education: torus, milestone: tall pillar, award: trophy cups, one per award that year), rotated in `useFrame`. Each room gets one `Text` label (role, org and period). The active room gets a highlight ring.
- Annex: instanced benches with a label each, a wall `GlassBox` with one `Text` for the repo grid and one for the models, and a window pane with its caption.
- [ ] Typecheck, check visually with `bun run build:web` and a manual screenshot on port 4320, then commit `feat: L2 corridor scene with year gates, rooms and the Workshop annex`.

### Task 5: Director wiring, deep links, RoomPeek

**Files:** `Director.tsx` (scrub, doors, open), `CameraDirector.tsx` (rail z), `Experience.tsx`/`ExperienceGate.tsx` (`startFloor`, `startRoom`, URL sync of `activeRoom`), `src/hud/RoomPeek.tsx`, `Hud.tsx`, the journey pages, and the messages.

- [ ] Implement, typecheck, run unit tests, commit `feat: L2 door triggers, scrubbing, deep links and the interim room panel`.

### Task 6: E2E and screenshots

**Files:** `e2e/career.spec.ts`, `e2e/experience.spec.ts`, `e2e/screenshots.spec.ts`.

- Tests: `/en/journey?tier=lite` starts on L2 in explore with no intro. Holding D moves x forward past a year gate. A palette search for "Jenius" drives there and opens the room (RoomPeek visible, URL `/en/journey/jenius-2024`). A deep link to `/en/journey/jenius-2024` opens that room. "See the case study on L3" rides to L3 and lands on `/en/labs/digital-banking-integrations`. A mobile horizontal swipe advances x by at least one segment. Draw calls stay under 150 on L2. Axe finds nothing serious with RoomPeek open.
- [ ] Run with `E2E_PORT=4321 bun run e2e` (never port 4310), then `SCREENSHOTS=1 E2E_PORT=4321 bun run screenshots`. Commit `test: e2e for the Career Archive corridor`.

### Task 7: Docs, full check, PR

- [ ] Update `AGENTS.md` (READY_FLOORS, career layout, door contract, rail z-follow deviation, RoomPeek being temporary).
- [ ] `bun run typecheck && bun run lint && bun run test && bun run build && E2E_PORT=4321 bun run e2e`
- [ ] Rebase on `origin/main`, push, open PR "Phase 3: Career Archive corridor" with screenshots, and report to the creator session.

## After Phase 4 merged (rebase notes)

Phase 4 (#8) shipped the shared pieces first, so this branch was ported onto it:

- Decisions 9 and 10 are replaced by the Glass Drawer. `RoomPeek` is gone. Career rooms render through `room-views/career.ts` (trophy cases list that year's placings, prologue entries are tagged, the Workshop adds the Hugging Face models), and room URLs come from `hud/drawer/urlSync.ts`.
- Deep links, `goToRoom`, the door-first `roomTarget` and the `open` intent come from Phase 4. Phase 3 adds `doorAlong`, a swept door check, to Phase 4's latch so slow frames cannot skip a zone.
- `RoomInfo.link` was dropped: `RoomView.link` carries the cross-floor link instead.
- Since L3 is a ready floor now, "See the case study on L3" rides up and opens the pod's drawer in 3D.
