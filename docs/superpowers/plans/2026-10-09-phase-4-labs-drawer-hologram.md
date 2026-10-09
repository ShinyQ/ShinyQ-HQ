# Phase 4: Labs, Glass Drawer and Hologram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the L3 Labs floor from content, the shared Glass Drawer for rooms on every floor, the hologram view for hero pods and the README easter egg.

**Architecture:** Pure modules carry the logic (L3 layout generation, door triggers, drawer layout and URL sync, ASCII renderer, hologram camera pose) and are unit-tested in node. Room content reaches the client as locale-resolved `RoomView` JSON built on the server per floor (`src/content/room-views/*`) and exported as static files (`/data/rooms/{locale}.json`), so neither zod nor the dataset ships to the browser. The drawer and the hologram overlay are HTML; the L3 floor and the 3D diagram are R3F components that read the store and per-frame runtimes only.

**Tech Stack:** Next.js 16 static export, React 19, R3F 9 + drei 10, three 0.186, zustand 5, next-intl 4, Vitest 5 + Testing Library, Playwright 1.64 (SwiftShader).

## Global Constraints

- No em dashes anywhere (unit test scans the repo).
- Content is data: no career facts in components; every user-facing string is `{ en, id }` or a `messages/*.json` key present in both files.
- Static export: no server runtime. Every route pre-renders; dynamic segments set `dynamicParams = false`.
- Every route works without WebGL; 3D mounts on top of the HTML page.
- Shared files (`host3d.ts`, `config.ts`, store, `Director.tsx`, `Experience.tsx`, `ExperienceGate.tsx`) change additively: Phase 3 (L2) and Phase 5a (L4, RF) build on them in parallel.
- Draw calls on L3 stay under 150 (appendix 08).
- Do not use port 4310 (owner's server). E2E uses the default 4173 or `E2E_PORT`.

## Decisions

1. **L3 layout (resolves the elevator conflict).** The global shaft stays at `x = -28`. The L3 slab spans `x -24..52`, `z -24..24`. The rover lands in an **atrium** directly in front of the shaft door (`x -24..-10`, `z -7..7`, approach `(-21, 0)`). A spine lane runs east along `z = 0`. The **Software Wing** is the hall north of the spine (`z < 0`, cyan tint) and the **AI Wing** is its mirror image south of the spine (`z > 0`, violet tint), so both wings start at the same distance from the elevator (equal billing). Per wing: a hero row of up to 3 pods (12 x 9) next to the spine at `|z| = 8`, centers `x = 6, 21, 36`; a featured row of up to 6 pods (9 x 7) at `|z| = 19.5`, centers `x = -5.25 + 10.5 i`; a back lane at `|z| = 14.25` between the rows. Hero doors face the spine (`|z| = 2.2`); featured doors face the back lane (`|z| = 14.8`). Directory pillars stand in the atrium at `(-12, -5)` (software) and `(-12, 5)` (AI). Appendix 01 section 4 is updated to match.
2. **Room content contract.** `RoomView` (`src/content/room-views/types.ts`) is serializable and locale-resolved. One builder file per floor (`lobby`, `career`, `labs`, `library`, `roof`), aggregated by `buildRoomViews(locale)`. Phase 3 and Phase 5a own their floor builders and may plug custom single-pane bodies into `src/hud/drawer/bodies.tsx`.
3. **Data delivery.** `src/app/data/[...path]/route.ts` pre-renders `/data/rooms/en.json` and `/data/rooms/id.json`. The drawer fetches once per page load (`loadRoomViews`), so pages do not grow.
4. **Door triggers are generic.** `FloorLayout.doors?: DoorTrigger[]` (`{ room, at, size? }`, 2 x 2 by default). The Director checks them in `explore`, latched until the rover leaves, skipped while a mission autopilot drives or a click-to-move path ends elsewhere, and emits `{ type: "open", room }`, which it handles with `store.openRoom`.
5. **Drawer.** `role="dialog"` with `aria-modal="true"` and a focus trap: the world keyboard pauses while it is open (same rule as the other HUD overlays), clicking the floor closes it and drives ("drive away"). Side panel (420 px) on desktop and landscape tablets at least 900 px wide; bottom sheet with snap points 45% and 92% otherwise. The follow camera shifts the rover 15% left (side panel) or 20% up (sheet) with `camera.setViewOffset`.
6. **URL.** Opening a room pushes `serializeHQUrl` for the room; switching rooms replaces; closing goes back when the entry was pushed by the drawer, else replaces with the floor URL. The hologram adds `?view=architecture` with `replaceState`. `popstate` reopens or closes rooms.
7. **Hologram view.** Phase `hologram`. The L3 floor writes a camera focus pose (`camera/focus.ts`) 9 u in front of the stage (pulled back on narrow screens so the diagram fits). A shroud plane behind the diagram dims the world to about 25%. Nodes are laid out by `layer` and `row`; packets run along edges at 2 u/s; async edges are dashed. Results are HTML cards (right on landscape, below on portrait). Left/right arrows and swipes move between hero pods; Esc returns to the drawer.
8. **README.** `t` inside a room (or the drawer overflow menu) toggles a terminal view of the same content; `renderAsciiArchitecture` draws the diagram with box-drawing characters.
9. **Deep links.** `ExperienceGate({ data, startFloor?, startRoom? })` (shape agreed with Phase 3 and Phase 5a). `/labs` starts on L3, `/labs/[slug]` opens the pod drawer, `?view=architecture` opens the hologram. Intro is skipped.

## File Structure

| File | Responsibility |
|---|---|
| `src/content/room-views/types.ts` | `RoomView` contract (types only) |
| `src/content/room-views/{lobby,career,labs,library,roof,index}.ts` | Server builders per floor, aggregate |
| `src/app/data/[...path]/route.ts` | Static JSON export of room views |
| `src/experience/floors/labs/layout.ts` | Pure L3 layout: pods placement, obstacles, doors, lanes, stages |
| `src/experience/floors/labs/hologramParts.ts` | Pure per-kind hologram geometry recipes |
| `src/experience/floors/Labs.tsx` + `labs/*.tsx` | L3 R3F floor: atrium, pods, holograms, lanes, directory, 3D diagram |
| `src/experience/nav/doors.ts` | Pure door trigger detection |
| `src/experience/camera/focus.ts`, `hologramPose` in `rigs.ts` | Camera focus for the hologram fly-in |
| `src/hud/drawer/RoomDrawer.tsx` | Drawer UI (tabs, single pane, metrics, actions, README) |
| `src/hud/drawer/DrawerHost.tsx` | Connects store, data and URL to the drawer |
| `src/hud/drawer/layout.ts` | Side panel vs sheet, snap points, camera shift |
| `src/hud/drawer/urlSync.ts` | pushState/replaceState/popstate controller |
| `src/hud/drawer/data.ts` | Fetch and cache room views |
| `src/hud/drawer/ascii.ts` | README renderer (ASCII architecture) |
| `src/hud/drawer/bodies.tsx` | Custom single-pane bodies per room kind |
| `src/hud/HologramOverlay.tsx` | HTML side of the hologram view |

## Tasks

### Task 1: Store, layout extras and door triggers
- [ ] Store: `openRoom(room, tab?)`, `setDrawerTab`, `readme` + `toggleReadme`, `openHologram`, `closeHologram`; elevator blocked during `hologram`. Tests in `tests/unit/store.test.ts`.
- [ ] `DoorTrigger`, `FloorLayout.doors?`, `LayoutExtras` in `types.ts`; `nav/doors.ts` (`doorAt(doors, p)`, `shouldTrigger`). Tests `tests/unit/doors.test.ts`.
- [ ] Director: step the controller in `room`/`hologram` without manual input, door triggers, `open` intent, floor click in `room` closes and drives. host3d: generic door `roomTarget`, `openRoom` opens the drawer on ready floors, `driveTo` closes an open room first. Tests in `tests/unit/missions-host3d.test.ts`.
- [ ] Commit `feat: drawer-ready store, door triggers and openRoom in 3D`.

### Task 2: L3 layout generation
- [ ] `buildLabsLayout(pods)` returns `{ floor: FloorLayout, pods: PlacedPod[], atrium, pillars, lanes }`. Tests `tests/unit/labs-layout.test.ts`: wing placement (software `z < 0`, AI `z > 0`), hero order nearest the atrium, featured row, listed not placed, doors reachable on the navgrid from the approach, door zones clear of obstacles, approach inside the atrium, shaft outside the slab, mirror symmetry.
- [ ] `READY_FLOORS` gains `L3`; `buildFloorLayouts(yearCount, extras)` uses the labs layout when `extras.labs` is given; `ExperienceData.labs` from `buildExperienceData`. Commit.

### Task 3: Room views and data export
- [ ] `RoomView` types, builders for all floors, `/data/rooms/{locale}.json` route, `loadRoomViews`. Tests `tests/unit/room-views.test.ts`: every catalog room has a view in both locales, hero pods have architecture and `hologram: true`, prev/next within wing, no em dashes. Commit.

### Task 4: ASCII renderer
- [ ] `renderAsciiArchitecture(arch)` and `renderReadme(view)`. Tests `tests/unit/ascii.test.ts`: boxes per node in layer columns, connectors, async marker, deterministic output, width bound. Commit.

### Task 5: Glass Drawer
- [ ] `drawerLayout(width, height)` + `cameraShift(layout)`; `urlSync` controller with fake history. Tests `tests/unit/drawer-layout.test.ts`, `tests/unit/drawer-url.test.ts`.
- [ ] `RoomDrawer` + `DrawerHost` + bodies + messages (`drawer` namespace, en and id). Testing Library `tests/hud/RoomDrawer.test.tsx`: focus moves in and is trapped, Esc closes, tabs switch with arrows, single pane for non-pods, metrics with context, prev/next, `t` toggles README, View architecture only on heroes. Commit.

### Task 6: L3 floor rendering
- [ ] `Labs.tsx`: slab tints, atrium, signs, directory pillars, pods (merged edges + instanced fills), per-kind holograms (one instanced mesh), lanes with packets, door markers, labels; click a pod to drive to its door. Mount in `Tower.tsx`. Commit.

### Task 7: Hologram view
- [ ] `hologramPose` + camera focus in `CameraDirector`, drawer camera shift. Tests in `tests/unit/rigs.test.ts`.
- [ ] `HologramDiagram` (3D) and `HologramOverlay` (HTML results, prev/next, Esc). Commit.

### Task 8: Routes, deep links, docs
- [ ] `ExperienceGate` on `/labs` and `/labs/[slug]` with `startFloor`/`startRoom`; `?view=architecture`.
- [ ] Update appendix 01 section 4 and AGENTS.md (drawer API, L3 layout, store additions). Commit.

### Task 9: E2E and screenshots
- [ ] `e2e/labs.spec.ts`: drive to a pod via Cmd-K, deep link, hologram with prev/next and Esc, README toggle, mobile bottom sheet, axe on the drawer. Screenshots: L3 with drawer and hologram at 1440x900, 1024x1366, 390x844.
- [ ] Full check suite, push, PR "Phase 4: Labs, drawer and hologram".
