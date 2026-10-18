# B1 Engine Room, PR 2: The Floor Implementation Plan

Status: in review (PR 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A walkable B1 Engine Room one floor under the Lobby (seven bays, stations 1 to 5 lit, bays 6 and 7 dark, pipes with light pulses, rack rows with LEDs, a workbench at the end of the aisle) in its own lazy floor chunk, whose stations open Glass Drawer bodies fed by the build story, reachable only while the store flag `b1Unlocked` is true, which in this PR only the dev and test flag `?unlock=b1` sets.

**Architecture:** `B1` joins `FloorIdSchema` and sits first in `FLOOR_IDS`, with `floorY(id) = (floorIndex(id) - floorIndex("L1")) * FLOOR_GAP`, so L1 to RF keep their heights and B1 is at y = -14. A separate `PUBLIC_FLOORS` list (`src/lib/floors.ts`) keeps everything public (tours, thumbnails, the dashboard count, the tower and shaft while locked) at five floors. The floor layout is a pure module in the main path (`floors/engine/layout.ts`, needed by `buildFloorLayouts`, the navgrid, the registry and the minimap); the scenery (pure `floors/engine/scenery.ts`, `EngineFx.tsx`, `EngineRoom.tsx`) and the drawer body (`hud/drawer/EngineBody.tsx`) ship only in the B1 chunk (`floors/chunks/engine.ts`). Drawer content is a serializable `RoomView` per station built on the server from `content/build-story.json` and `content/generated/build-facts.json` into `/data/rooms/{locale}.json`. Locked sessions never mount, prefetch or draw anything of B1.

**Tech Stack:** Next.js 16 static export, React 19, React Three Fiber and three.js, zustand, next-intl, Vitest, Playwright (SwiftShader), Bun.

## Global Constraints

Spec (binding): `2026-10-17-b1-engine-room-design.md` (coordinator session files), sections 2, 3, 4 and 8. Controller decisions (binding): `b1-pr2-pr3-decisions.md`. Copied verbatim:

- Spec 1: "Place: a basement floor, **B1**, reached by the elevator."
- Spec 1: "Look: **the Engine Room**, a workshop basement with server racks, glowing pipes and cables, and a workbench; each station explains one part of how the site was built."
- Spec 1: "First version stations (1 to 5): Blueprint table, Build timeline, Agent workbench, CI and gates rack, Live dashboard. Later (6 and 7, plus owner additions): Rover's brain, Rejected designs. The floor ships with empty bays ready for them."
- Spec 2: "A dev and test flag `?unlock=b1` (ignored in production builds unless `?debug`) for e2e and captures."
- Spec 3: "A new floor `B1` with its own lazy floor chunk (pattern from #157: `floorChunks.ts`, `chunks/`), prefetched when unlocked and on elevator intent. Floor below L1 in the shaft (`FLOOR_GAP`), with the elevator stopping there; the follow camera and ghosting of floors above must work for a floor below L1."
- Spec 3: "Arrival L3-style (#184): the rover leaves the car facing down the main aisle toward the workbench; glide out of the car."
- Spec 3: "Layout (pure module, Vitest-tested, like the other floors): a central aisle with **seven bays**, stations 1 to 5 lit, bays 6 and 7 dark with a \"coming soon\" plate. Pipes and cable trays along the ceiling with slow light pulses traveling along them (data flowing), a row of server racks with blinking status LEDs, a workbench at the end of the aisle, a Return pad. Same neon palette; a warmer amber accent for the Engine Room (like the Data and ML wing)."
- Spec 3: "Stations open the Glass Drawer (existing room panel) with the details; point-and-go targets and view zones per bay; the minimap (#183) shows B1."
- Spec 3: "Budgets: under 150 scene calls and 30k triangles (target well below: instancing for racks, pipes and LEDs), no new shader program (reuse `fx/holoFx.ts` materials and the existing road kit), floor chunk cap about 16 KB gzip, memory gates; ride peaks for the new B1 rides within budget; day and night (#182) sky is not visible underground (skip the dome on B1)."
- Spec 4: "All text EN and ID, from a schema-validated `content/build-story.json`; numbers from the snapshot (section 5)."
- Spec 7: "The owner reviews B1 captures (arrival, aisle, each station, unlock moment; desktop and phone) before PR 2 merges."
- Spec 8: "A floor below L1 is new for the shaft, camera and floor ghosting; test rides L1 to B1 and RF to B1." "Locked state must never trap a visitor (B1 unreachable is fine; nothing else changes)." "Snapshot numbers must be true; when a number cannot be computed reliably it is omitted, not guessed."
- Decision: "B1 is reachable only when the store flag `b1Unlocked` is true; in PR 2 the only way to set it is the dev/test flag `?unlock=b1` (honoured in dev builds, e2e and with `?debug` in production). Without the flag, nothing about B1 is visible (no picker row, no shaft stop label, no Cmd-K entry), so PR 2 can merge on its own safely."
- Decision: "`FloorIdSchema` gains \"B1\"; RoomId regex gains B1. Every `Record<FloorId, ...>` gets a B1 entry (typecheck enforces completeness)."
- Decision: "L1 stays at y = 0. B1 sits one `FLOOR_GAP` below (y = -14). Implement as a floor order list that starts with B1 and `floorY(id) = (floorIndex(id) - floorIndex(\"L1\")) * FLOOR_GAP`, so all hard-coded heights of L1 to RF keep their values. Ride time by index distance stays correct."
- Decision: "Keep a separate list of the five public floors (for visit tracking, onboarding floor lines, missions, OG stills, thumbnails) so B1 never counts toward 5/5 and never appears in public tours."
- Decision: "Sky: no dome or sun/moon on B1 (underground); fog and lights tuned for the Engine Room."
- Decision: "Stations are point-and-go targets with view zones; each opens the Glass Drawer with a client body fed by a serializable B1 room view built server-side from build-story.json and build-facts.json (reuse src/lib/build-page.ts helpers; never import zod-backed loaders into client code)." "Each drawer links the Classic /build section." "FloatingSigns for station names (no words painted on the floor)." "Minimap and floor overview show B1 when unlocked."
- Decision: "Budgets: under 150 scene calls (set a FLOOR_SCENE_CAPS entry for B1 at or below 100 if measurement allows), under 30k triangles, no new shader program beyond baseline plus 2 (add B1 entries to e2e/perf/baseline.json from measurement), B1 chunk cap 16 KB gzip in BYTES_3D_BUDGET.floors, session total stays within its cap (B1 prefetches only when unlocked, so locked sessions pay nothing), memory gates, ride peaks for L1 to B1 and RF to B1 within budget."
- Decision: "Day and night (#182) and floor ambience (#193) must not break on B1 (ambience: a low machine hum layer if the ambience system takes per-floor layers, else silence)." (It takes per-floor layers: `AMBIENCE_LAYERS`, so B1 gets a hum layer.)
- Decision: "Captures for owner approval before PR 2 merges: locked B1 row, unlock moment, arrival, the aisle, each station's drawer; 1440x900 and 390x844 (the locked row and unlock moment come from PR 3, so PR 2 and PR 3 are captured together from the PR 3 branch stacked on PR 2)."

Repository rules (AGENTS.md, verbatim where quoted):

- "**No em dashes** (U+2014) anywhere: code, comments, copy, docs, commits, PR text."
- "**Bilingual.** Every user-facing content string is `{ en, id }`. Indonesian is natural and professional (\"saya\"); technical terms stay in English. UI strings live in `messages/en.json` and `messages/id.json` with identical keys."
- "**Content is data.** Pages, rooms, pods and missions are generated from `content/site-content.json`. Never hardcode career facts in components." (B1 text comes from `content/build-story.json`, numbers from `content/generated/build-facts.json`.)
- "**Static export.** `output: \"export\"`: no server runtime, no middleware/proxy, no API routes, no `next/image` optimization."
- "**Every route works without WebGL.**"
- Client bundles: "Client code imports locale values from `@/content/locales`, never values from `@/content/schema` or `@/content/load`; `bun run build` fails otherwise". `@/content/build-story` is server-only too.
- Floor chunks: "Never import `Labs`, `Library`, `Roof` or their HUD pieces statically from the `Experience.tsx` closure" (this PR adds `EngineRoom` and `EngineBody` to that list).
- 3D memory: "`useDispose(value)` after every memoized geometry, texture or material". 3D loop: "Animate with `useFrame` deltas; never start another rAF loop".
- Floor text: "No words painted on a floor: use `FloatingSigns`". Interaction: "In-world targets go through the point-and-go registry; no navigation `onClick` on scene objects".
- Audio: "Use `audio` / `useAudio` from `@/lib/audio`; never create another `AudioContext`".
- Styling: "No colored edge stripes; use `AccentDot` and `hq-glow`". Motion: "Write reduce rules as `@variant motion-reduce`, never a bare `prefers-reduced-motion` query".
- E2E: "Wait on state, never on time; use the `e2e/hq.ts` helpers".
- Workflow: "One CI run at a time: before pushing, check `gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued`". "Before pushing: `bun run verify:quick`, then `bun run e2e:changed`. Add the perf lane when you touch the render path, materials, floor mounting, the elevator or what the 3D chunk imports." "Do not merge without the owner".

Budgets (AGENTS.md table, verbatim; numbers in `e2e/budgets.ts`, `e2e/perf/baseline.json`, `lighthouserc.json`):

| Budget | Limit |
|---|---|
| 3D JS on the first-frame path (`?prefetch=off`, per tier) | under 450 KB gzip |
| 3D session total (main path plus all floor chunks) | full 470 KB, lite 446.4 KB gzip |
| Floor chunks (incremental) | L3 20 KB, L4 16 KB, RF 8 KB gzip |
| Scene draw calls per frame, any floor | under 150 (L1 125, RF 79); at most 20 post passes |
| Triangles per frame | under 30k |
| Shader programs per floor | `e2e/perf/baseline.json` plus 2 |
| Memory gates | zero growth in geometries, textures and programs; under 2 MB JS heap growth |
| Classic site (Lighthouse CI) | LCP 2 s, CLS 0.01, TBT 200 ms; JS 240 KB, CSS 20,480 B, fonts 60 KB, HTML 80 KB |

This PR adds (owner-approved by the spec): B1 chunk 16 KB gzip (`BYTES_3D_BUDGET.floors.B1`), `FLOOR_SCENE_CAPS.B1` 100, B1 programs in `e2e/perf/baseline.json` from measurement, and the session total counts the public floor chunks only (B1 loads only for unlocked visitors).

## Before you start: PR #197 (Round 9 M camera fixes) is merged

#197 merged as 1bcd491d; branch from `origin/main` at or after it. It changed `tower/FloorLevel.tsx` (intro ghosting, `introGhost`), `tower/visibility.ts` (`introFly`), `camera/collision.ts` (`cameraWorld` adds the shaft as a column, `SHAFT_COLUMN`, `viewOnSlab`, `clampCamera(..., fov)`) and added the `tests/unit/camera-collision.test.ts` case "leaves every floor's default views alone", which iterates every layout of `buildFloorLayouts`, so B1's spawn, approach and arrival views are checked by it.

- [x] `git fetch origin && git log --oneline -1 origin/main` shows 1bcd491d or later; branch from it.
- [x] Re-checks this plan relies on (each task says when): Task 1 runs `tests/unit/camera-collision.test.ts` with B1 in the layouts; Task 3 reads the current `FloorLevel.tsx` and `visibility.ts` before editing and runs `tests/unit/tower-visibility.test.ts`.

## File structure

| File | Responsibility |
|---|---|
| `src/lib/floors.ts` (new) | `PUBLIC_FLOORS`, `PublicFloor`, `SECRET_FLOOR`, `isPublicFloor`. No imports but types; safe for every bundle. |
| `src/content/schema.ts` | `FloorIdSchema` gains `B1`; `RoomIdSchema` regex gains `B1`. |
| `src/experience/config.ts` | `FLOOR_IDS` (B1 first), `floorY`, `towerFloors`, `shaftSpan`, B1 color and pad faces, `buildFloorLayouts` adds B1. |
| `src/experience/floors/engine/layout.ts` (new, main path) | Pure B1 layout: `ENGINE`, `ENGINE_BAYS`, `ENGINE_STATIONS`, `engineBays`, `engineRacks`, `buildEngineLayout`. |
| `src/experience/b1.ts` (new) | `b1UnlockFlag`, `canEnterFloor` (PR 3 adds the visit tracking helpers here). |
| `src/hud/floorRows.ts` (new) | `floorRows(b1Unlocked)`: elevator rows top-down; B1 only when unlocked (PR 3 adds the locked row). |
| `src/experience/floors/engine/scenery.ts` (new, chunk only) | Pure scenery: solids, strip and fall instances, signs, tier detail. |
| `src/experience/floors/engine/EngineFx.tsx` (new, chunk only) | `FlowMesh`, `PanelMesh`: one instanced holo draw each. |
| `src/experience/floors/EngineRoom.tsx` (new, chunk only) | The floor component. |
| `src/experience/floors/chunks/engine.ts` (new) | Chunk entry: `EngineRoom`, `EngineBody`. |
| `src/experience/floors/{floorChunks,floorPrefetch,lazyFloors,FloorChunkPrefetch}.ts(x)` | B1 as a lazy floor; prefetch only when unlocked. |
| `src/experience/tower/{Tower,ElevatorShaft,near}.tsx/ts`, `src/experience/sky/{dayNight.ts,SkyController.tsx,skyRuntime.ts}` | Tower floors from `towerFloors`, shaft down to B1, no sky underground. |
| `src/content/room-views/engine.ts` (new), `types.ts`, `index.ts` | Station drawer views (`RoomEngine`). |
| `src/components/diagram/{metrics.ts (new), text.ts (new), layout.ts, DiagramSvg.tsx}`, `src/components/ArchitectureDiagram.tsx` | Client-safe drawing constants, `DrawnDiagram`, shared diagram texts and summary. |
| `src/hud/drawer/EngineBody.tsx` (new, chunk only), `bodies.tsx` | Station drawer body, registered as a chunk body. |
| `src/content/experience-floors.ts`, `src/content/experience.ts`, `src/experience/types.ts` | `EngineData` in `ExperienceData.engine`. |
| `src/experience/interact/registry.ts` | B1 doors are stations with bay footprints. |
| `src/lib/audio/ambience.ts`, `src/lib/audio/README.md` | B1 machine hum layer. |
| `e2e/b1.ts` (new), `e2e/engine-room.spec.ts` (new), `e2e/memory.spec.ts`, `e2e/perf/{floors,peaks,bytes-3d}.spec.ts`, `e2e/budgets.ts`, `e2e/perf/baseline.json`, `scripts/perf-report.ts`, `scripts/e2e-plan.ts` | Tests, gates and budgets. |
| `scripts/b1-shots.ts` (new) | Owner review captures into `screenshots/b1/` (gitignored). |
| Docs | `docs/features.md`, `docs/agents/{floors,floor-b1-engine-room (new),3d-experience,hud-and-drawer,performance,content}.md`, `AGENTS.md`, `docs/superpowers/README.md`. |

Shared names (PR 3 uses them unchanged): `PUBLIC_FLOORS`, `PublicFloor`, `SECRET_FLOOR`, `isPublicFloor`, `towerFloors`, `canEnterFloor`, `b1UnlockFlag`, store `b1Unlocked` and `unlockB1()`, `floorRows`, `FloorRow`, `floorOptions(current, label, describe, b1Unlocked)`, `PrefetchSnapshot.b1Unlocked`, `ENGINE`, `engineRoom`, `EngineData`, `e2e/b1.ts` (`B1_QUERY`, `enterB1Route`, `rideTo`), `scripts/b1-shots.ts`.

---

### Task 1: B1 joins the floor model, invisible to visitors

B1 becomes a `FloorId` with a real, pure layout, while every visitor-facing list keeps the five public floors. After this task nothing on screen changes: the tower, the shaft labels, the elevator rows and the picker still show L1 to RF, and the store refuses a ride to B1.

**Files:**
- Create: `src/lib/floors.ts`, `src/experience/floors/engine/layout.ts`
- Modify: `src/content/schema.ts:36-43`, `src/experience/config.ts` (floor ids, `floorY`, colors, pad faces, `buildFloorLayouts`), `src/lib/url-sync.ts:14-20`, `src/experience/missions/rooms.ts:61-67`, `src/experience/tower/floorRegistry.ts:5`, `src/lib/accent.ts:15-21`, `src/hud/FloorButtons.tsx:12-20`, `src/hud/CommandPalette.tsx:25-31`, `src/hud/pads/picker.ts:24-26`, `src/experience/tower/Tower.tsx:107-140`, `src/experience/tower/ElevatorShaft.tsx:126-130`, `src/experience/tower/near.ts:23-31`, `src/store/useHQStore.ts:196-200`, `src/experience/Experience.tsx:342-345`, `src/experience/types.ts` (`EngineData`, `ExperienceData.engine`), `src/content/experience.ts:97-121`, `src/content/experience-floors.ts` (`buildEngineData`), `src/experience/interact/registry.ts` (B1 branch), `src/components/build/BuildDashboard.tsx:3,16`, `messages/en.json`, `messages/id.json`
- Test: `tests/unit/floor-ids.test.ts` (new), `tests/unit/engine-layout.test.ts` (new), `tests/unit/arrivals.test.ts` (B1 rows), `tests/content/floor-thumbs.test.ts`

**Interfaces:**
- Consumes: `STATION_IDS`, `COMING_SOON_IDS`, `getBuildStory()` from `src/content/build-story.ts` (PR 1, server only); `yawLooking` (`camera/look.ts`); `Road`, `RoadNetwork`, `Spur` (`nav/road.ts`).
- Produces:
  - `src/lib/floors.ts`: `PUBLIC_FLOORS: readonly ["L1", "L2", "L3", "L4", "RF"]`, `type PublicFloor`, `SECRET_FLOOR: "B1"`, `isPublicFloor(id: FloorId): id is PublicFloor`.
  - `src/experience/config.ts`: `FLOOR_IDS: readonly ["B1", "L1", "L2", "L3", "L4", "RF"]`, `READY_FLOORS = FLOOR_IDS`, `floorY(id: FloorId): number` (L1 0, B1 -14, RF 56), `towerFloors(b1Unlocked: boolean): readonly FloorId[]`, `shaftSpan(floors: readonly FloorId[]): { bottom: number; height: number }`, `FLOOR_COLOR.B1 = ENGINE.accent`.
  - `src/experience/floors/engine/layout.ts`: `ENGINE_BAYS`, `type EngineBayId`, `ENGINE_STATIONS`, `type EngineStationId`, `isEngineStation(id)`, `engineRoom(id: EngineStationId): RoomId`, `ENGINE`, `interface EngineBay`, `interface EngineLayout`, `engineBays(): EngineBay[]`, `engineRacks(bays): Rect[]`, `buildEngineLayout(): EngineLayout`.
  - `src/experience/types.ts`: `interface EngineData { bays: { id: EngineBayId; room: RoomId | null; title: string }[] }`, `ExperienceData.engine: EngineData`.
  - `src/content/experience-floors.ts`: `buildEngineData(locale: Locale): EngineData`.
  - `buildExperienceData(locale, floorNames: Record<PublicFloor, string>)` (B1's name comes from `messages.floors.B1`).
  - `nearFloors(floor, target, exterior, reach = 1, warm = null, floors: readonly FloorId[] = PUBLIC_FLOORS)`.

- [x] **Step 1: Write the failing tests**

`tests/unit/floor-ids.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RoomIdSchema, FloorIdSchema } from "@/content/schema";
import { FLOOR_GAP, FLOOR_IDS, floorIndex, floorY, READY_FLOORS, shaftSpan, SLAB_THICKNESS, towerFloors } from "@/experience/config";
import { dollyDuration, rideDirection } from "@/experience/tower/elevator";
import { nearFloors } from "@/experience/tower/near";
import { isPublicFloor, PUBLIC_FLOORS, SECRET_FLOOR } from "@/lib/floors";
import { createHQStore } from "@/store/useHQStore";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

describe("floor ids (B1 Engine Room, PR 2)", () => {
  it("orders the floors bottom up with B1 under the Lobby and keeps a list of the five public floors", () => {
    expect(FloorIdSchema.options).toEqual(["L1", "L2", "L3", "L4", "RF", "B1"]);
    expect([...FLOOR_IDS]).toEqual(["B1", "L1", "L2", "L3", "L4", "RF"]);
    expect([...PUBLIC_FLOORS]).toEqual(["L1", "L2", "L3", "L4", "RF"]);
    expect(SECRET_FLOOR).toBe("B1");
    expect(FLOOR_IDS.filter(isPublicFloor)).toEqual([...PUBLIC_FLOORS]);
    expect(READY_FLOORS).toContain("B1");
    expect(RoomIdSchema.safeParse("B1:blueprint").success).toBe(true);
  });

  it("keeps every public floor at its height and puts B1 one floor gap below the Lobby", () => {
    expect(PUBLIC_FLOORS.map(floorY)).toEqual([0, 14, 28, 42, 56]);
    expect(floorY("B1")).toBe(-FLOOR_GAP);
    expect(floorIndex("L1") - floorIndex("B1")).toBe(1);
  });

  it("times rides by floor distance, B1 included", () => {
    expect(dollyDuration("L1", "B1")).toBeCloseTo(0.8, 9);
    expect(dollyDuration("RF", "B1")).toBeCloseTo(0.8 + 0.15 * 4, 9);
    expect(rideDirection({ from: "L1", to: "B1", stage: "moving", t: 0 })).toBe("down");
  });

  it("draws and serves B1 only once unlocked: tower floors, near floors and the shaft", () => {
    expect(towerFloors(false)).toEqual(PUBLIC_FLOORS);
    expect(towerFloors(true)).toEqual(FLOOR_IDS);
    expect(nearFloors("L1", null, false)).toEqual(["L1", "L2"]);
    expect(nearFloors("L1", null, false, 1, null, towerFloors(true))).toEqual(["B1", "L1", "L2"]);
    expect(shaftSpan(PUBLIC_FLOORS)).toEqual({ bottom: -SLAB_THICKNESS, height: floorY("RF") + 8 + SLAB_THICKNESS });
    expect(shaftSpan(FLOOR_IDS)).toEqual({ bottom: floorY("B1") - SLAB_THICKNESS, height: floorY("RF") + 8 - floorY("B1") + SLAB_THICKNESS });
  });

  it("never rides to B1 while it is locked, not even one floor down from the Lobby", () => {
    const store = createHQStore(memory());
    store.setState({ phase: "explore", floor: "L1", ride: null });
    store.getState().requestElevator("B1");
    expect(store.getState().ride).toBeNull();
    store.getState().requestElevator("down");
    expect(store.getState().ride).toBeNull();
    store.getState().requestElevator("up");
    expect(store.getState().ride?.to).toBe("L2");
  });
});
```

`tests/unit/engine-layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { COMING_SOON_IDS, STATION_IDS } from "@/content/build-story";
import { yawLooking } from "@/experience/camera/look";
import { buildEngineLayout, ENGINE, ENGINE_BAYS, ENGINE_STATIONS, engineRoom } from "@/experience/floors/engine/layout";
import type { Rect } from "@/experience/types";
import { realLayouts } from "../helpers/real-layouts";
import { expectSpaceRules } from "../helpers/space";

const layout = buildEngineLayout();
const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
const inside = (r: Rect, b: Rect) => r.minX >= b.minX && r.maxX <= b.maxX && r.minZ >= b.minZ && r.maxZ <= b.maxZ;

describe("B1 Engine Room layout", () => {
  it("keeps the bays in the build story's order: stations 1 to 5, then the two coming-soon bays", () => {
    expect([...ENGINE_BAYS]).toEqual([...STATION_IDS, ...COMING_SOON_IDS]);
    expect([...ENGINE_STATIONS]).toEqual([...STATION_IDS]);
  });

  it("lines seven bays along the aisle, alternating north and south; stations have doors, bays 6 and 7 are dark", () => {
    expect(layout.bays.map((b) => b.side)).toEqual(["north", "south", "north", "south", "north", "south", "north"]);
    expect(layout.bays.filter((b) => b.lit).map((b) => b.room)).toEqual(ENGINE_STATIONS.map(engineRoom));
    for (const bay of layout.bays.filter((b) => !b.lit)) expect([bay.room, bay.pad]).toEqual([null, null]);
    expect(layout.floor.doors?.map((d) => d.room)).toEqual(ENGINE_STATIONS.map(engineRoom));
    for (const bay of layout.bays) expect(inside(bay.rect, layout.floor.bounds), bay.id).toBe(true);
  });

  it("puts a rack row in every wall gap between two bays on the same side", () => {
    expect(layout.racks).toHaveLength(5);
    for (const rack of layout.racks) expect(layout.bays.filter((b) => b.rect.maxX === rack.minX || b.rect.minX === rack.maxX)).toHaveLength(2);
  });

  it("passes the road kit's space rules and the pad rules with the elevator and Return pads", () => {
    const b1 = realLayouts().B1;
    expect(b1.pads?.map((p) => p.kind)).toEqual(["elevator", "return"]);
    expectSpaceRules({ bounds: b1.bounds, obstacles: b1.obstacles, doors: b1.doors ?? [], network: layout.network, start: b1.approach, pads: b1.pads });
  });

  it("keeps the elevator call pad area free and the workbench flush with the east edge, across the aisle's end", () => {
    for (const o of layout.floor.obstacles) expect(overlaps(o, layout.callPad)).toBe(false);
    expect(layout.workbench.maxX).toBe(ENGINE.bounds.maxX);
    expect(layout.workbench.minX).toBeGreaterThanOrEqual(ENGINE.aisle.endX + 6);
    expect(layout.workbench.minZ).toBeLessThan(0);
    expect(layout.workbench.maxZ).toBeGreaterThan(0);
  });

  it("rolls the rover on east along the aisle and looks east at the workbench; every station has a view into its bay", () => {
    const { floor } = layout;
    expect(floor.arrival).toEqual(ENGINE.arrival);
    expect(floor.spawn).toEqual(ENGINE.arrival);
    const zones = new Map(floor.viewZones?.map((z) => [z.id, z]));
    expect(zones.get("B1:arrival")).toMatchObject({ yaw: yawLooking({ x: 1, z: 0 }), travel: { x: 1, z: 0 }, arrivalOnly: true });
    expect(zones.get("B1:workbench")?.yaw).toBe(yawLooking({ x: 1, z: 0 }));
    for (const bay of layout.bays.filter((b) => b.lit)) expect(zones.get(`B1:${bay.id}`)?.yaw, bay.id).toBe(yawLooking(bay.facing));
  });
});
```

`tests/unit/arrivals.test.ts`: add B1 to the two per-floor records (the loops already run over `FLOOR_IDS`):

```ts
import { ENGINE } from "@/experience/floors/engine/layout";
// ...
const ZONE_ID: Record<FloorId, string> = { B1: "B1:arrival", L1: "L1:arrival", L2: "L2:arrival", L3: "L3:overview", L4: "L4:arrival", RF: "RF:arrival" };
// in SIGHTS:
  B1: [
    { label: "the aisle ahead", at: [ENGINE.arrival.x + 10, 0, 0] },
    { label: "the aisle at the second bay", at: [ENGINE.bay.x0 + ENGINE.bay.pitch, 0, 0] },
  ],
```

`tests/content/floor-thumbs.test.ts`: iterate `PUBLIC_FLOORS` (from `@/lib/floors`) instead of `FLOOR_IDS`: the picker thumbnails cover the public floors only.

- [x] **Step 2: Run them and see them fail**

Run: `bunx vitest run tests/unit/floor-ids.test.ts tests/unit/engine-layout.test.ts`
Expected: FAIL (`@/lib/floors` and `@/experience/floors/engine/layout` do not exist; `FloorIdSchema` has no B1).

- [x] **Step 3: The public floor list and the schema**

`src/lib/floors.ts`:

```ts
import type { FloorId } from "@/content/schema";

/**
 * The five public floors, bottom up: what visitors tour, what counts toward unlocking B1 (PR 3), what the
 * picker thumbnails and the build dashboard cover, and what the tower draws while B1 is locked.
 */
export const PUBLIC_FLOORS = ["L1", "L2", "L3", "L4", "RF"] as const satisfies readonly FloorId[];
export type PublicFloor = (typeof PUBLIC_FLOORS)[number];

/** The secret basement floor: the B1 Engine Room (spec 2026-10-17). */
export const SECRET_FLOOR = "B1" as const satisfies FloorId;

export function isPublicFloor(id: FloorId): id is PublicFloor {
  return (PUBLIC_FLOORS as readonly FloorId[]).includes(id);
}
```

`src/content/schema.ts`:

```ts
export const FloorIdSchema = z.enum(["L1", "L2", "L3", "L4", "RF", "B1"]);
// ...
export const RoomIdSchema = z
  .string()
  .regex(/^(L1|L2|L3|L4|RF|B1):[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected FloorId:slug");
```

- [x] **Step 4: The B1 layout (pure, main path)**

`src/experience/floors/engine/layout.ts`:

```ts
import type { RoomId } from "@/content/schema";
import { yawLooking } from "../../camera/look";
import type { ViewZone } from "../../camera/orbit";
import type { Road, RoadNetwork, Spur } from "../../nav/road";
import type { DoorTrigger, FloorLayout, Rect, Vec2 } from "../../types";

/**
 * B1 Engine Room (spec 2026-10-17, section 3): a central aisle east from the elevator with seven bays,
 * alternating north and south; bays 1 to 5 hold the build story's stations, bays 6 and 7 stay dark until their
 * stations ship. Server rack rows fill the wall gaps between bays, a workbench closes the aisle at the east
 * edge. Pure (no React or three): the floor layout, the registry, the minimap and the scenery read it.
 * The bay order must equal `[...STATION_IDS, ...COMING_SOON_IDS]` of `src/content/build-story.ts` (a test
 * checks it; that module is server-only, so the ids are repeated here).
 */
export const ENGINE_BAYS = ["blueprint", "timeline", "agents", "gates", "dashboard", "brain", "rejected"] as const;
export type EngineBayId = (typeof ENGINE_BAYS)[number];
export const ENGINE_STATIONS = ["blueprint", "timeline", "agents", "gates", "dashboard"] as const satisfies readonly EngineBayId[];
export type EngineStationId = (typeof ENGINE_STATIONS)[number];

export function isEngineStation(id: EngineBayId): id is EngineStationId {
  return (ENGINE_STATIONS as readonly EngineBayId[]).includes(id);
}

export const engineRoom = (id: EngineStationId): RoomId => `B1:${id}`;

export const ENGINE = {
  bounds: { minX: -24, maxX: 48, minZ: -14, maxZ: 14 },
  door: { x: -24, z: 0 },
  approach: { x: -21, z: 0 },
  /** In front of the elevator: kept free for the elevator call pad. */
  callPad: { minX: -24, maxX: -16, minZ: -4, maxZ: 4 },
  /** The Engine Room's warmer amber (the Data and ML wing is #fbbf24). */
  accent: "#f59e0b",
  aisle: { width: 8, endX: 38 },
  /** Bay k stands at x = x0 + k * pitch, north for even k; w along x, d from the wall, h its wall height. */
  bay: { x0: -10, pitch: 7, w: 8, d: 6, h: 4.6 },
  /** Bay front to door pad center. */
  padInset: 1.1,
  spurWidth: 4,
  /** Rack rows stand this deep against the wall, between the bays. */
  rackDepth: 3,
  workbench: { minX: 44, maxX: 48, minZ: -5, maxZ: 5 },
  returnPad: { x: 40, z: 9 },
  /** Elevator arrivals roll on here and deep links spawn here (Round 8 J), looking east down the aisle. */
  arrival: { x: -12, z: 0 },
  /** Arrival zooms: the widest view whose camera stays east of the glass shaft (`shaftClearZoom`), as on RF. */
  arrivalZoom: 0.95,
  arrivalZoomPhone: 0.8,
  /** Height of the ceiling pipe runs (u above the slab). */
  ceiling: 6.4,
} as const;

export interface EngineBay {
  id: EngineBayId;
  /** 0 to 6, from the elevator east. */
  index: number;
  side: "north" | "south";
  rect: Rect;
  center: Vec2;
  /** z of the bay's open face toward the aisle. */
  front: number;
  /** Unit direction from the aisle into the bay (the door facing). */
  facing: Vec2;
  lit: boolean;
  room: RoomId | null;
  /** Door pad center for lit bays; null for the dark bays. */
  pad: Vec2 | null;
}

export interface EngineLayout {
  floor: FloorLayout;
  network: RoadNetwork;
  bays: EngineBay[];
  /** Rack rows (obstacles) in the wall gaps between same-side bays. */
  racks: Rect[];
  workbench: Rect;
  callPad: Rect;
}

const plain = (r: Rect): Rect => ({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ });
const LOOK_EAST = yawLooking({ x: 1, z: 0 });

export function engineBays(): EngineBay[] {
  const { bounds, bay: B, padInset } = ENGINE;
  return ENGINE_BAYS.map((id, index) => {
    const side = index % 2 === 0 ? "north" : "south";
    const x = B.x0 + B.pitch * index;
    const rect: Rect =
      side === "north" ? { minX: x - B.w / 2, maxX: x + B.w / 2, minZ: bounds.minZ, maxZ: bounds.minZ + B.d } : { minX: x - B.w / 2, maxX: x + B.w / 2, minZ: bounds.maxZ - B.d, maxZ: bounds.maxZ };
    const front = side === "north" ? rect.maxZ : rect.minZ;
    const facing: Vec2 = { x: 0, z: side === "north" ? -1 : 1 };
    const lit = isEngineStation(id);
    return {
      id,
      index,
      side,
      rect,
      center: { x, z: (rect.minZ + rect.maxZ) / 2 },
      front,
      facing,
      lit,
      room: lit ? engineRoom(id) : null,
      pad: lit ? { x, z: front - facing.z * padInset } : null,
    };
  });
}

/** Rack rows in every wall gap between neighbouring bays on the same side, touching both bays and the wall. */
export function engineRacks(bays: readonly EngineBay[]): Rect[] {
  const { bounds, rackDepth } = ENGINE;
  const racks: Rect[] = [];
  for (const side of ["north", "south"] as const) {
    const row = bays.filter((b) => b.side === side);
    for (let i = 0; i + 1 < row.length; i++) {
      const [minX, maxX] = [row[i].rect.maxX, row[i + 1].rect.minX];
      racks.push(side === "north" ? { minX, maxX, minZ: bounds.minZ, maxZ: bounds.minZ + rackDepth } : { minX, maxX, minZ: bounds.maxZ - rackDepth, maxZ: bounds.maxZ });
    }
  }
  return racks;
}

/** The Engine Room: floor layout (aisle, spurs, doors, view zones, arrival, Return pad), bays, racks and the workbench. */
export function buildEngineLayout(): EngineLayout {
  const E = ENGINE;
  const bays = engineBays();
  const racks = engineRacks(bays);
  const workbench = plain(E.workbench);
  const aisle: Road = { id: "aisle", points: [{ ...E.approach }, { x: E.aisle.endX, z: 0 }], width: E.aisle.width };
  const stations = bays.flatMap((b) => (b.room && b.pad ? [{ ...b, room: b.room, pad: b.pad }] : []));
  const spurs: Spur[] = stations.map((b) => ({ room: b.room, from: { x: b.center.x, z: 0 }, to: b.pad, width: E.spurWidth, color: E.accent }));
  const network: RoadNetwork = { roads: [aisle], plazas: [], spurs };
  const doors: DoorTrigger[] = stations.map((b) => ({ room: b.room, at: b.pad, facing: b.facing }));
  const arrival: Vec2 = { ...E.arrival };
  const viewZones: ViewZone[] = [
    // Arrival (eastbound only, primed by an arrival or a deep link): behind the rover, down the aisle to the workbench.
    {
      id: "B1:arrival",
      area: { minX: arrival.x - 2, maxX: arrival.x + 2, minZ: arrival.z - 2, maxZ: arrival.z + 2 },
      yaw: LOOK_EAST,
      zoom: E.arrivalZoom,
      classView: { mobile: { zoom: E.arrivalZoomPhone } },
      travel: { x: 1, z: 0 },
      arrivalOnly: true,
    },
    // Each station: on its door pad the camera stands on the aisle side and looks into the bay.
    ...stations.map((b): ViewZone => ({ id: `B1:${b.id}`, area: { minX: b.rect.minX, maxX: b.rect.maxX, minZ: b.pad.z - 2, maxZ: b.pad.z + 2 }, yaw: yawLooking(b.facing) })),
    // The aisle's end: looking east at the workbench (eastbound only, so driving back never turns the camera).
    { id: "B1:workbench", area: { minX: E.aisle.endX - 4, maxX: workbench.minX, minZ: -E.aisle.width / 2, maxZ: E.aisle.width / 2 }, yaw: LOOK_EAST, travel: { x: 1, z: 0 } },
  ];
  return {
    floor: {
      id: "B1",
      bounds: plain(E.bounds),
      door: { ...E.door },
      approach: { ...E.approach },
      obstacles: [...bays.map((b) => b.rect), ...racks, workbench],
      spawn: arrival,
      arrival,
      accent: E.accent,
      doors,
      road: network,
      returnPad: { ...E.returnPad },
      viewZones,
    },
    network,
    bays,
    racks,
    workbench,
    callPad: plain(E.callPad),
  };
}
```

- [x] **Step 5: Floor ids, heights and per-floor records in `src/experience/config.ts`**

```ts
import { PUBLIC_FLOORS, SECRET_FLOOR } from "@/lib/floors";
import { buildEngineLayout, ENGINE } from "./floors/engine/layout";
// ...
/** Every floor bottom up: the secret B1 Engine Room under the Lobby, then the five public floors (`PUBLIC_FLOORS`). */
export const FLOOR_IDS = [SECRET_FLOOR, ...PUBLIC_FLOORS] as const satisfies readonly FloorId[];
export const SLAB_THICKNESS = 0.4;

/** Floors whose 3D content is built (B1 has no route of its own: its URL stays /{locale}, `FLOOR_ROUTE`). */
export const READY_FLOORS: readonly FloorId[] = FLOOR_IDS;
// FLOOR_COLOR gains:  B1: ENGINE.accent,

/** Height of a floor's slab top: L1 stays at 0, so every public floor keeps its height and B1 sits one gap below. */
export function floorY(id: FloorId): number {
  return (floorIndex(id) - floorIndex("L1")) * FLOOR_GAP;
}

/** The floors the tower draws and the elevator serves: B1 only once it is unlocked (store `b1Unlocked`). */
export function towerFloors(b1Unlocked: boolean): readonly FloorId[] {
  return b1Unlocked ? FLOOR_IDS : PUBLIC_FLOORS;
}

/** The glass shaft's span for the floors the tower draws: from under the lowest slab to 8 u above the roof. */
export function shaftSpan(floors: readonly FloorId[]): { bottom: number; height: number } {
  const bottom = Math.min(...floors.map(floorY)) - SLAB_THICKNESS;
  return { bottom, height: floorY("RF") + 8 - bottom };
}
```

`floorAt` keeps indexing `FLOOR_IDS`. Add `B1: Math.PI / 2` to `ELEVATOR_PAD_FACE` and `B1: -Math.PI / 2` to `RETURN_PAD_FACE`, and in `buildFloorLayouts` add `B1: buildEngineLayout().floor,` (comment: "B1 Engine Room: the aisle, seven bays and the workbench (floors/engine/layout.ts)"). `withFloorPads` already runs over `FLOOR_IDS`.

- [x] **Step 6: Every other `Record<FloorId, ...>` and the public-floor guards**

- `src/lib/url-sync.ts` `FLOOR_ROUTE`: `B1: "/"` with the comment "B1 has no route: its URL stays the Lobby's (/{locale}); its Classic counterpart is /build (`FLOOR_PATHS`)". `parseHQUrl` never matches "/" to a section, and `serializeHQUrl` writes `/{locale}` for B1.
- `src/experience/missions/rooms.ts` `FLOOR_PATHS`: `B1: "/build"`.
- `src/experience/tower/floorRegistry.ts` `FLOOR_ROOT`: `B1: "engine-room"` (Task 4's root group name).
- `src/lib/accent.ts` `FLOOR_ACCENT`: `B1: "amber"` (no new CSS token; the 3D floor uses the warmer `ENGINE.accent`).
- `src/hud/FloorButtons.tsx` `FLOOR_ACTIVE`: `B1: "border-amber bg-amber/15 text-amber"`; `TOP_DOWN` becomes `[...PUBLIC_FLOORS].reverse()` (Task 2 replaces it with `floorRows`).
- `src/hud/CommandPalette.tsx` `FLOOR_BADGE`: `B1: "text-amber border-amber/40"`.
- `src/hud/pads/picker.ts` `floorOptions`: `[...PUBLIC_FLOORS].reverse()` (Task 2 replaces it).
- `src/experience/tower/near.ts`: add the last parameter and filter it instead of `FLOOR_IDS`:

```ts
export function nearFloors(floor: FloorId, target: FloorId | null, exterior: boolean, reach = 1, warm: FloorId | null = null, floors: readonly FloorId[] = PUBLIC_FLOORS): FloorId[] {
  return floors.filter((id) => {
```

- `src/experience/tower/Tower.tsx`: `{PUBLIC_FLOORS.map((id) => {` instead of `FLOOR_IDS.map`, and in `floorContent` a `case "B1": return null;` (comment: "Task 4 mounts the Engine Room; until then nothing below the Lobby is drawn"). Task 3 switches both to `towerFloors`.
- `src/experience/tower/ElevatorShaft.tsx`: the indicators map `PUBLIC_FLOORS` (Task 3 passes the tower's floors).
- `src/store/useHQStore.ts` `resolveTarget`:

```ts
function resolveTarget(base: FloorId, target: ElevatorTarget): FloorId | undefined {
  const to = target === "up" ? FLOOR_IDS[floorIndex(base) + 1] : target === "down" ? FLOOR_IDS[floorIndex(base) - 1] : target;
  // B1 stays out of reach until Task 2 adds the unlock.
  return to && isPublicFloor(to) ? to : undefined;
}
```

- `src/experience/Experience.tsx` ambience: `audio.setFloor(isPublicFloor(f) ? f : null)` at both call sites (B1 is silent until Task 6 adds its layer).
- `src/components/build/BuildDashboard.tsx`: `dashboardTiles(getBuildFacts(), PUBLIC_FLOORS.length)` and drop the `FloorIdSchema` import (the dashboard's "Floors in the 3D tower" stays 5: B1 is secret).

- [x] **Step 7: `ExperienceData.engine` and the B1 station titles**

`src/experience/types.ts`:

```ts
import type { EngineBayId } from "./floors/engine/layout";
// ...
/** B1 Engine Room payload (locale-resolved): one entry per bay in `ENGINE_BAYS` order; `room` is null for the dark bays. */
export interface EngineData {
  bays: { id: EngineBayId; room: RoomId | null; title: string }[];
}
// in ExperienceData, after `highlights`:
  /** B1 Engine Room: bay titles for the floor's signs and the point-and-go labels (drawer content: room-views/engine.ts). */
  engine: EngineData;
```

`src/content/experience-floors.ts`:

```ts
import { ENGINE_BAYS, engineRoom, isEngineStation } from "@/experience/floors/engine/layout";
import type { EngineData } from "@/experience/types";
import { getBuildStory } from "./build-story";
// ...
/** B1 Engine Room bay titles from the build story (stations, then the coming-soon bays). */
export function buildEngineData(locale: Locale): EngineData {
  const story = getBuildStory();
  return {
    bays: ENGINE_BAYS.map((id) =>
      isEngineStation(id) ? { id, room: engineRoom(id), title: story.stations[id].title[locale] } : { id, room: null, title: story.comingSoon[id].title[locale] },
    ),
  };
}
```

`src/content/experience.ts`: change the parameter to `floorNames: Record<PublicFloor, string>`, build the floor names with B1 from the messages and add the engine payload:

```ts
export function buildExperienceData(locale: Locale, floorNames: Record<PublicFloor, string>): ExperienceData {
  getContent();
  const profile = getProfile();
  const names: Record<FloorId, string> = { ...floorNames, B1: (locale === "en" ? en : id).floors.B1 };
  return {
    // ...unchanged fields...
    floors: Object.fromEntries((Object.keys(FLOOR_ROUTE) as FloorId[]).map((f) => [f, { name: names[f], route: FLOOR_ROUTE[f] }])) as ExperienceData["floors"],
    // ...
    highlights: buildHighlightsData(locale),
    engine: buildEngineData(locale),
  };
}
```

- [x] **Step 8: B1 stations in the point-and-go registry**

`src/experience/interact/registry.ts`:

```ts
import { buildEngineLayout, ENGINE } from "../floors/engine/layout";
// doorItems: B1 doors are stations, like RF's
  const kind = floor === "RF" || floor === "B1" ? "station" : "door";
// roomLabel, before the final `return slug;`
  if (room.startsWith("B1:")) {
    const bay = experience.engine.bays.find((b) => b.room === room);
    if (bay) return bay.title;
  }
// baseInteractables, a new case
    case "B1": {
      const engine = buildEngineLayout();
      const rooms = new Map<RoomId, Footprint>(engine.bays.flatMap((b): [RoomId, Footprint][] => (b.room ? [[b.room, { rect: bare(b.rect), height: ENGINE.bay.h }]] : [])));
      return [...pads, ...doorItems(floor, layouts, data, rooms)];
    }
```

Ids are `B1:station:<station>` (`door.room.slice(3)`), so `tests/unit/interact-registry.test.ts` (which loops over `FLOOR_IDS`) covers B1 with no change.

- [x] **Step 9: Messages (both files, identical keys)**

`messages/en.json`: `floors.B1: "Engine Room"`; `hud.floorLabel.B1: "Build"`; `hud.pads.floorDesc.B1: "How this site was built: five stations"`; a new `hud.engine` object `{ "title": "Engine Room", "subtitle": "How this site was built", "soon": "Coming soon" }`.
`messages/id.json`: `floors.B1: "Ruang Mesin"`; `hud.floorLabel.B1: "Pembuatan"`; `hud.pads.floorDesc.B1: "Cara situs ini dibuat: lima stasiun"`; `hud.engine` `{ "title": "Ruang Mesin", "subtitle": "Cara situs ini dibuat", "soon": "Segera hadir" }`.

- [x] **Step 10: Run the tests and the type check**

Run: `bunx vitest run tests/unit/floor-ids.test.ts tests/unit/engine-layout.test.ts tests/unit/arrivals.test.ts tests/unit/floor-pads.test.ts tests/unit/interact-registry.test.ts tests/unit/camera-collision.test.ts tests/content/floor-thumbs.test.ts tests/unit/build-page.test.ts`
Expected: PASS. If an `arrivals` sight or the "default views alone" check (#197) fails for B1, move `ENGINE.arrival.x` east or west in 2 u steps, or lower `arrivalZoomPhone` by 0.05, keeping `arrival.x > approach.x + 5`; do not change other floors.

Run: `bun run typecheck && bun run lint && bun run test`
Expected: PASS (the compiler finds any `Record<FloorId, ...>` still missing B1; add its entry following Step 6).

- [x] **Step 11: Commit**

```bash
git add src/lib/floors.ts src/experience/floors/engine/layout.ts src/content/schema.ts src/experience/config.ts src/lib/url-sync.ts src/experience/missions/rooms.ts src/experience/tower src/lib/accent.ts src/hud src/store/useHQStore.ts src/experience/Experience.tsx src/experience/types.ts src/content/experience.ts src/content/experience-floors.ts src/experience/interact/registry.ts src/components/build/BuildDashboard.tsx messages tests
git commit -m "feat(b1): B1 floor id, public floor list and the Engine Room layout (hidden)"
```

### Task 2: The unlock flag, elevator access and the B1 elevator row

`?unlock=b1` (dev builds, or with `debug` in production) sets the store flag; only then does the elevator serve B1 and do the elevator rail, the Corners floor sheet and the call pad picker show a normal "B1 Build" row below L1. Without the flag every list is unchanged.

**Files:**
- Create: `src/experience/b1.ts`, `src/hud/floorRows.ts`
- Modify: `src/store/useHQStore.ts` (state, action, `resolveTarget`), `src/experience/Experience.tsx` (`startSession`), `src/hud/FloorButtons.tsx`, `src/hud/pads/picker.ts`, `src/hud/pads/PadPicker.tsx:125`
- Test: `tests/unit/b1-unlock-flag.test.ts` (new), `tests/unit/pad-picker.test.ts`, `tests/hud/FloorChip.test.tsx`

**Interfaces:**
- Consumes: `PUBLIC_FLOORS`, `SECRET_FLOOR`, `isPublicFloor` (Task 1), `FLOOR_IDS`, `floorIndex` (Task 1).
- Produces:
  - `src/experience/b1.ts`: `B1_UNLOCK_PARAM = "unlock"`, `b1UnlockFlag(search: string, dev: boolean): boolean`, `canEnterFloor(floor: FloorId, b1Unlocked: boolean): boolean`.
  - Store: `b1Unlocked: boolean` (default false, not persisted in PR 2), `unlockB1(): void`.
  - `src/hud/floorRows.ts`: `interface FloorRow { id: FloorId; locked: boolean }`, `floorRows(b1Unlocked: boolean): FloorRow[]` (top-down; PR 3 adds the locked B1 row).
  - `floorOptions(current: FloorId, label: (f: FloorId) => string, describe: (f: FloorId) => string, b1Unlocked = false): PickerOption[]` (B1 has no thumbnail).

- [x] **Step 1: Write the failing tests**

`tests/unit/b1-unlock-flag.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { b1UnlockFlag, canEnterFloor } from "@/experience/b1";
import { floorRows } from "@/hud/floorRows";
import { createHQStore } from "@/store/useHQStore";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

describe("B1 unlock flag (dev and test only)", () => {
  it("honours ?unlock=b1 in a dev build, and in a production build only with debug", () => {
    expect(b1UnlockFlag("?unlock=b1", true)).toBe(true);
    expect(b1UnlockFlag("?unlock=B1&tier=lite", true)).toBe(true);
    expect(b1UnlockFlag("?unlock=b1", false)).toBe(false);
    expect(b1UnlockFlag("?unlock=b1&debug=1", false)).toBe(true);
    expect(b1UnlockFlag("?unlock=b1&debug", false)).toBe(true);
    expect(b1UnlockFlag("?debug=1", true)).toBe(false);
    expect(b1UnlockFlag("", true)).toBe(false);
  });

  it("lets every public floor in and B1 only once unlocked", () => {
    expect(canEnterFloor("RF", false)).toBe(true);
    expect(canEnterFloor("B1", false)).toBe(false);
    expect(canEnterFloor("B1", true)).toBe(true);
  });

  it("lists the elevator rows top-down, with B1 below L1 only once unlocked", () => {
    expect(floorRows(false)).toEqual(["RF", "L4", "L3", "L2", "L1"].map((id) => ({ id, locked: false })));
    expect(floorRows(true).map((r) => r.id)).toEqual(["RF", "L4", "L3", "L2", "L1", "B1"]);
    expect(floorRows(true).every((r) => !r.locked)).toBe(true);
  });

  it("rides to B1 (by name or one floor down from the Lobby) once the store flag is set", () => {
    const store = createHQStore(memory());
    store.setState({ phase: "explore", floor: "L1", ride: null });
    expect(store.getState().b1Unlocked).toBe(false);
    store.getState().requestElevator("B1");
    expect(store.getState().ride).toBeNull();
    store.getState().unlockB1();
    store.getState().requestElevator("down");
    expect(store.getState().ride).toMatchObject({ from: "L1", to: "B1", stage: "toDoor" });
  });

  it("never persists the PR 2 flag", () => {
    const storage = memory();
    const store = createHQStore(storage);
    store.getState().unlockB1();
    store.getState().setLocale("id");
    expect(storage.getItem("hq:v1")).not.toContain("b1Unlocked");
  });
});
```

`tests/unit/pad-picker.test.ts`, inside "lists the floors top-down...":

```ts
    expect(floorOptions("L1", (f) => `label ${f}`, (f) => `desc ${f}`, true).map((o) => o.id)).toEqual(["RF", "L4", "L3", "L2", "L1", "B1"]);
    expect(floorOptions("L1", (f) => f, (f) => f, true).at(-1)).toEqual({ id: "B1", eyebrow: "B1", title: "B1", detail: "B1", current: false });
```

`tests/hud/FloorChip.test.tsx`, a new case (add `B1: { name: "Engine Room", route: "/" }` to the test's `data.floors`):

```tsx
  it("lists B1 Build below L1 in the floor sheet only once B1 is unlocked", async () => {
    const user = userEvent.setup();
    await user.click(mount("phone"));
    const sheet = screen.getByTestId("floor-sheet");
    expect(sheet.querySelector('[data-floor="B1"]')).toBeNull();
    cleanup();
    getHQStore().setState({ b1Unlocked: true });
    await user.click(mount("phone"));
    const rows = [...screen.getByTestId("floor-sheet").querySelectorAll("[data-floor]")].map((b) => b.getAttribute("data-floor"));
    expect(rows).toEqual(["RF", "L4", "L3", "L2", "L1", "B1"]);
    getHQStore().setState({ b1Unlocked: false });
  });
```

- [x] **Step 2: Run them and see them fail**

Run: `bunx vitest run tests/unit/b1-unlock-flag.test.ts tests/unit/pad-picker.test.ts tests/hud/FloorChip.test.tsx`
Expected: FAIL (`@/experience/b1` and `@/hud/floorRows` are missing; the store has no `unlockB1`).

- [x] **Step 3: `src/experience/b1.ts`**

```ts
import type { FloorId } from "@/content/schema";
import { SECRET_FLOOR } from "@/lib/floors";

/** Query parameter of the dev and test unlock: `?unlock=b1`. */
export const B1_UNLOCK_PARAM = "unlock";

/**
 * `?unlock=b1` unlocks B1 for the session: always in a dev build, in a production build only together with
 * `debug` (`?unlock=b1&debug=1`: how e2e and the capture scripts reach the floor before the real unlock exists).
 */
export function b1UnlockFlag(search: string, dev: boolean): boolean {
  const query = new URLSearchParams(search);
  return query.get(B1_UNLOCK_PARAM)?.toLowerCase() === "b1" && (dev || query.has("debug"));
}

/** Whether the elevator, a deep link or a language-switch resume may take the rover to `floor`. */
export function canEnterFloor(floor: FloorId, b1Unlocked: boolean): boolean {
  return floor !== SECRET_FLOOR || b1Unlocked;
}
```

- [x] **Step 4: `src/hud/floorRows.ts`**

```ts
import type { FloorId } from "@/content/schema";
import { PUBLIC_FLOORS, SECRET_FLOOR } from "@/lib/floors";

export interface FloorRow {
  id: FloorId;
  /** PR 3: B1 before the visitor has seen all five floors (padlock, "Visit all 5 floors (n/5)"). */
  locked: boolean;
}

/** The elevator's rows top-down (RF first, like the panel), with B1 below L1 once it is unlocked. */
export function floorRows(b1Unlocked: boolean): FloorRow[] {
  const rows: FloorRow[] = [...PUBLIC_FLOORS].reverse().map((id) => ({ id, locked: false }));
  return b1Unlocked ? [...rows, { id: SECRET_FLOOR, locked: false }] : rows;
}
```

- [x] **Step 5: Store flag and the elevator guard**

`src/store/useHQStore.ts`:

```ts
import { canEnterFloor } from "@/experience/b1";
// HQState, after `topics`:
  /** B1 Engine Room is reachable (PR 2: only `?unlock=b1`, applied by `startSession`; not persisted). */
  b1Unlocked: boolean;
// actions:
  /** Unlocks B1 for this session: the elevator serves it and the floor rows list it. */
  unlockB1: () => void;
// ...
function resolveTarget(base: FloorId, target: ElevatorTarget, b1Unlocked: boolean): FloorId | undefined {
  const to = target === "up" ? FLOOR_IDS[floorIndex(base) + 1] : target === "down" ? FLOOR_IDS[floorIndex(base) - 1] : target;
  return to && canEnterFloor(to, b1Unlocked) ? to : undefined;
}
// initial state:   b1Unlocked: false,
// in requestElevator:  const to = resolveTarget(ride ? ride.to : floor, target, get().b1Unlocked);
// action:          unlockB1: () => set({ b1Unlocked: true }),
```

`partialize` stays as it is (the flag is not persisted in PR 2). Drop the Task 1 `isPublicFloor` import if it is now unused.

- [x] **Step 6: Apply the flag at session start; a resume never lands on a locked B1**

`src/experience/Experience.tsx`, in `startSession` right after `s.setDevice(readDevice());`:

```ts
  // Dev and test unlock (B1 Engine Room, PR 2): `?unlock=b1`, in production only with `debug`.
  if (b1UnlockFlag(window.location.search, process.env.NODE_ENV !== "production")) s.unlockB1();
```

and replace `const resume = first ? takeResume() : null;` with:

```ts
  const taken = first ? takeResume() : null;
  // A language switch on B1 resumes there only while B1 is unlocked (the PR 2 flag rides along in the query).
  const resume = taken && canEnterFloor(taken.floor, getHQStore().getState().b1Unlocked) ? taken : null;
```

- [x] **Step 7: Rows in the rail, the floor sheet and the call pad picker**

`src/hud/FloorButtons.tsx`: delete `TOP_DOWN`, read the flag and map the rows:

```tsx
import { floorRows } from "./floorRows";
// in FloorButtons:
  const b1Unlocked = useHQStore((s) => s.b1Unlocked);
  // ...
  return floorRows(b1Unlocked).map(({ id }) => {
```

`src/hud/pads/picker.ts`:

```ts
import { isPublicFloor } from "@/lib/floors";
import { floorRows } from "../floorRows";
// ...
/** Floors top-down like the elevator panel (RF first), named with the panel's labels; B1 (unlocked) has no thumbnail. */
export function floorOptions(current: FloorId, label: (floor: FloorId) => string, describe: (floor: FloorId) => string, b1Unlocked = false): PickerOption[] {
  return floorRows(b1Unlocked).map(({ id }) => ({ id, eyebrow: id, title: label(id), detail: describe(id), ...(isPublicFloor(id) ? { thumb: floorThumb(id) } : {}), current: id === current }));
}
```

`src/hud/pads/PadPicker.tsx`: `const b1Unlocked = useHQStore((s) => s.b1Unlocked);` and pass it as the fourth argument of `floorOptions`.

- [x] **Step 8: Run the tests**

Run: `bunx vitest run tests/unit/b1-unlock-flag.test.ts tests/unit/pad-picker.test.ts tests/hud/FloorChip.test.tsx tests/hud/PadPicker.test.tsx tests/unit/floor-ids.test.ts`
Expected: PASS.

Run: `bun run typecheck && bun run lint && bun run test`
Expected: PASS.

- [x] **Step 9: Commit**

```bash
git add src/experience/b1.ts src/hud/floorRows.ts src/store/useHQStore.ts src/experience/Experience.tsx src/hud/FloorButtons.tsx src/hud/pads tests
git commit -m "feat(b1): dev and test unlock flag, elevator access and the B1 row"
```

### Task 3: The tower, the shaft and the sky below the Lobby

Once unlocked, the tower draws B1's slab and the shaft reaches down to it with a "B1" stop label; rides, ghosting of the floors above and the ride cull work for a floor below L1; the day and night sky is not drawn while the rover is underground. Locked sessions draw exactly what they drew before (five slabs, the shaft from L1 up).

Read the current (post-#197) `src/experience/tower/FloorLevel.tsx` and `src/experience/tower/visibility.ts` before editing (they gained `introGhost` and `introFly`); this task does not change either file, it only adds tests that run through them.

**Files:**
- Modify: `src/experience/tower/Tower.tsx`, `src/experience/tower/ElevatorShaft.tsx`, `src/experience/sky/dayNight.ts`, `src/experience/sky/SkyController.tsx`, `src/experience/sky/skyRuntime.ts`
- Test: `tests/unit/tower-visibility.test.ts`, `tests/unit/day-night.test.ts`

**Interfaces:**
- Consumes: `towerFloors`, `shaftSpan`, `nearFloors(..., floors)` (Task 1), store `b1Unlocked` (Task 2), `contentVisible`, `floorContentVisible`, `belowParkedCar` (unchanged), `roverRuntime.y`.
- Produces: `underground(roverY: number): boolean` and `UNDERGROUND_BELOW = -0.5` in `sky/dayNight.ts`; `skyRuntime.underground: boolean` (probe, read by Task 7 through `__hq.sky`); `ElevatorShaft` prop `floors: readonly FloorId[]`.

- [x] **Step 1: Write the failing tests**

`tests/unit/day-night.test.ts`:

```ts
import { underground, UNDERGROUND_BELOW } from "@/experience/sky/dayNight";
import { floorY } from "@/experience/config";
// ...
describe("no sky underground (B1 Engine Room)", () => {
  it("is underground only below the Lobby slab", () => {
    expect(UNDERGROUND_BELOW).toBe(-0.5);
    expect(underground(floorY("B1"))).toBe(true);
    expect(underground(floorY("L1"))).toBe(false);
    expect(underground(floorY("RF"))).toBe(false);
    // The car between the Lobby and B1: the sky goes as soon as the car is below the Lobby slab.
    expect(underground(-1)).toBe(true);
  });
});
```

`tests/unit/tower-visibility.test.ts`:

```ts
import { floorY } from "@/experience/config";
import { floorContentVisible } from "@/experience/tower/near";
import { contentVisible } from "@/experience/tower/visibility";
// ...
describe("a floor below the Lobby (B1)", () => {
  const onB1 = { roverY: floorY("B1"), exterior: false };
  it("ghosts every floor above B1 and draws B1 itself", () => {
    for (const id of ["L1", "L2", "L3", "L4", "RF"] as const) expect(contentVisible({ id, floorY: floorY(id), ...onB1, rideTo: null }), id).toBe(false);
    expect(contentVisible({ id: "B1", floorY: floorY("B1"), ...onB1, rideTo: null })).toBe(true);
  });

  it("shows B1 during rides down to it, from the Lobby and from the roof", () => {
    // Mid ride from RF: the car is between L2 and L1; B1, the target, draws; floors above the car do not.
    const roverY = 7;
    expect(contentVisible({ id: "B1", floorY: floorY("B1"), roverY, exterior: false, rideTo: "B1" })).toBe(true);
    expect(contentVisible({ id: "L1", floorY: floorY("L1"), roverY, exterior: false, rideTo: "B1" })).toBe(true);
    expect(contentVisible({ id: "L3", floorY: floorY("L3"), roverY, exterior: false, rideTo: "B1" })).toBe(false);
    // Parked at B1 with the doors opening: nothing below B1 exists, B1 draws.
    expect(floorContentVisible({ floorY: floorY("B1"), roverY: floorY("B1"), exterior: false, ride: { stage: "opening" }, ready: true })).toBe(true);
  });

  it("keeps B1 out of the boot and intro exterior", () => {
    expect(contentVisible({ id: "B1", floorY: floorY("B1"), roverY: 0, exterior: true, rideTo: null })).toBe(false);
  });
});
```

- [x] **Step 2: Run them and see them fail**

Run: `bunx vitest run tests/unit/day-night.test.ts tests/unit/tower-visibility.test.ts`
Expected: FAIL on the missing `underground` export (the visibility cases already pass: they pin today's rules for B1).

- [x] **Step 3: The tower draws `towerFloors(b1Unlocked)`**

`src/experience/tower/Tower.tsx`:

```tsx
import { COLORS, floorY, SHAFT, towerFloors } from "../config";
// in Tower:
  const b1Unlocked = useHQStore((s) => s.b1Unlocked);
  // B1 (the Engine Room) exists in the tower only once unlocked: locked sessions mount, draw and prefetch nothing of it.
  const floors = towerFloors(b1Unlocked);
  const near = nearFloors(floor, target, exterior, neighbours ? 1 : 0, warming, floors);
  // The floor warmed during boot stays out of the shaft: its doors and indicator would show in the exterior.
  const shaftNear = nearFloors(floor, target, exterior, neighbours ? 1 : 0, null, floors);
  // ...
      {floors.map((id) => {
  // ...
      <ElevatorShaft layouts={layouts} near={shaftNear} floors={floors} />
```

The tower outline (`towerFrame`, `FRAME_TOP`) stays around L1 to RF: B1 is a basement under it.

- [x] **Step 4: The shaft spans the tower's floors**

`src/experience/tower/ElevatorShaft.tsx`: delete `TOP` and `HEIGHT`, import `shaftSpan`, and:

```tsx
/** Glass shaft on the west side of the tower with the car, doors and door bridges, from under the lowest drawn floor (B1 once unlocked) to above the roof. */
export function ElevatorShaft({ layouts, near, floors }: { layouts: Record<FloorId, FloorLayout>; near: FloorId[]; floors: readonly FloorId[] }) {
  const { bottom, height } = shaftSpan(floors);
  return (
    <group name="elevator">
      <GlassBox size={[SHAFT.size, height, SHAFT.size]} position={[SHAFT.x, bottom + height / 2, SHAFT.z]} color={COLORS.cyan} fillOpacity={0.035} edgeOpacity={0.85} />
      <Car />
      {near.map((id) => (
        <group key={id}>
          <Doors floor={id} />
          <Bridge layout={layouts[id]} />
        </group>
      ))}
      <Suspense fallback={null}>
        {floors.map((id) => (
          <Indicator key={id} floor={id} visible={near.includes(id)} />
        ))}
      </Suspense>
    </group>
  );
}
```

With the five public floors `shaftSpan` returns the old box exactly (bottom -0.4, height 64.4), so locked sessions keep today's pixels. `GlassBox` re-memoizes and disposes its geometries when the height changes.

- [x] **Step 5: No sky underground**

`src/experience/sky/dayNight.ts`:

```ts
/** Rover heights below this are under the Lobby slab (B1): no dome, no sun or moon, and the night state holds. */
export const UNDERGROUND_BELOW = -0.5;

export function underground(roverY: number): boolean {
  return roverY < UNDERGROUND_BELOW;
}
```

`src/experience/sky/skyRuntime.ts`: add `underground: false,` with the doc comment "The rover is below the Lobby (B1): the sky group is hidden and the night state holds (test probe)."

`src/experience/sky/SkyController.tsx`:

```tsx
import { roverRuntime } from "../rover/runtime";
import { clockPhase, createSkyState, parseSkyParam, parseSkyValue, resolveSkyMode, skyState, underground, type SkyMode } from "./dayNight";
// in SkyController, next to `mode`:
  const under = useRef(false);
// in resolve(): the sky shows only when the mode draws it and the rover is above ground
      const visible = !mode.current.still && !under.current;
// first lines of useFrame:
    // B1 is underground: hide the dome and the orbs and hold the night state (phase 0 is today's look) until the rover is back above the Lobby.
    const below = underground(roverRuntime.y);
    if (below !== under.current) {
      under.current = below;
      last.current = null;
      if (group.current) group.current.visible = !mode.current.still && !below;
      skyRuntime.underground = below;
    }
// replace the phase line:
    const phase = under.current ? 0 : (m.phase ?? clockPhase(Date.now()));
```

Fog near and far stay with `CameraDirector`; the scene lights, background and fog color hold night while underground. No light is added for B1 (a new light would change every lit program).

- [x] **Step 6: Run the tests**

Run: `bunx vitest run tests/unit/day-night.test.ts tests/unit/tower-visibility.test.ts tests/unit/floor-ids.test.ts tests/unit/holo-sky.test.ts`
Expected: PASS.

Run: `bun run typecheck && bun run lint && bun run test`
Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add src/experience/tower/Tower.tsx src/experience/tower/ElevatorShaft.tsx src/experience/sky tests/unit/day-night.test.ts tests/unit/tower-visibility.test.ts
git commit -m "feat(b1): the tower and shaft reach B1 once unlocked; no sky underground"
```

### Task 4: The Engine Room scenery and the B1 floor chunk

The floor itself, in its own chunk: bay shells, rack rows, the workbench, pipes and cable trays with slow pulses, rack LEDs, data screens and floating signs, all on programs that already exist (one merged standard mesh, one line mesh, two instanced holo draws, the floating sign pair, the road kit). B1 is a lazy floor that only unlocked sessions prefetch.

**Files:**
- Create: `src/experience/floors/engine/scenery.ts`, `src/experience/floors/engine/EngineFx.tsx`, `src/experience/floors/EngineRoom.tsx`, `src/experience/floors/chunks/engine.ts`
- Modify: `src/experience/floors/floorChunks.ts`, `src/experience/floors/lazyFloors.tsx`, `src/experience/floors/floorPrefetch.ts`, `src/experience/floors/FloorChunkPrefetch.tsx`, `src/experience/tower/Tower.tsx` (`TowerLabels.engine`, `case "B1"`), `src/experience/Experience.tsx` (labels)
- Test: `tests/unit/engine-scenery.test.ts` (new), `tests/unit/floor-chunks.test.ts`, `tests/unit/floor-prefetch.test.ts`, `tests/unit/floor-chunks-graph.test.ts`, `tests/unit/floating-sign.test.ts`

**Interfaces:**
- Consumes: `buildEngineLayout`, `ENGINE`, `EngineBay`, `EngineLayout` (Task 1), `EngineData` (Task 1), `MergedBoxes`, `MergedEdges` (`floors/roof/kit.tsx`), `Box` (`floors/roof/solids.ts`), `createHoloMaterial`, `HOLO_MODE.strip`, `HOLO_MODE.fall` (`fx/holoFx.ts`), `neonColor`, `useDispose`, `useUniformTime`, `FloatingSigns`, `SignSpec`, `RoadMarkings`.
- Produces:
  - `scenery.ts`: `FlowInstance`, `PanelInstance`, `EngineScenery`, `EngineLabels { title: string; subtitle: string; soon: string }`, `ENGINE_TONES`, `engineDetail(tier): { leds: number }`, `engineScenery(layout: EngineLayout, tier: GpuTier): EngineScenery`, `engineSigns(layout: EngineLayout, data: EngineData, labels: EngineLabels): SignSpec[]`.
  - `EngineFx.tsx`: `FlowMesh({ items, tier })`, `PanelMesh({ items, tier })`.
  - `EngineRoom({ data, labels, tier })`, root group name `"engine-room"` (`FLOOR_ROOT.B1`).
  - `floorChunks.ts`: `LAZY_FLOORS = ["L3", "L4", "RF", "B1"]`, `PUBLIC_LAZY_FLOORS = ["L3", "L4", "RF"]`, `FloorChunkModules.B1`, `prefetchAll()` over `PUBLIC_LAZY_FLOORS`.
  - `lazyFloors.tsx`: `engineFloor`.
  - `floorPrefetch.ts`: `PrefetchSnapshot.b1Unlocked?: boolean`, `PrefetchSnapshot.idle?: boolean`.
  - `TowerLabels.engine: EngineLabels`.

- [x] **Step 1: Write the failing tests**

`tests/unit/engine-scenery.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { buildEngineLayout, ENGINE } from "@/experience/floors/engine/layout";
import { ENGINE_TONES, engineScenery, engineSigns, type PanelInstance } from "@/experience/floors/engine/scenery";
import type { Rect } from "@/experience/types";

const layout = buildEngineLayout();
const data = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" }).engine;
const labels = { title: "Engine Room", subtitle: "How this site was built", soon: "Coming soon" };
const b = ENGINE.bounds;
const within = (r: Rect) => r.minX >= b.minX - 1e-9 && r.maxX <= b.maxX + 1e-9 && r.minZ >= b.minZ - 1e-9 && r.maxZ <= b.maxZ + 1e-9;
const box = (p: { x: number; z: number; w: number; d: number }): Rect => ({ minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2 });
const panelRect = (p: PanelInstance): Rect => (p.flat ? box({ x: p.x, z: p.z, w: p.w, d: p.h }) : Math.abs(Math.sin(p.yaw)) > 0.5 ? box({ x: p.x, z: p.z, w: 0, d: p.w }) : box({ x: p.x, z: p.z, w: p.w, d: 0 }));
const inRect = (p: { x: number; z: number }, r: Rect) => p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ;

describe("B1 Engine Room scenery", () => {
  for (const tier of ["full", "lite"] as const) {
    const s = engineScenery(layout, tier);
    it(`keeps every solid, pipe, LED and screen on the slab (${tier})`, () => {
      for (const solid of s.solids) expect(within(box(solid)), JSON.stringify(solid)).toBe(true);
      for (const f of s.flows) expect(within(box(f)), JSON.stringify(f)).toBe(true);
      for (const p of s.panels) expect(within(panelRect(p)), JSON.stringify(p)).toBe(true);
    });

    it(`lights the five station bays and leaves bays 6 and 7 dark (${tier})`, () => {
      for (const bay of layout.bays) {
        const screens = s.panels.filter((p) => inRect(p, bay.rect));
        const strips = s.flows.filter((f) => f.y < 0.1 && inRect(f, bay.rect));
        expect(strips.length, bay.id).toBe(bay.lit ? 1 : 0);
        if (!bay.lit) expect(screens, bay.id).toEqual([]);
        if (bay.lit && bay.id !== "gates") expect(screens.length, bay.id).toBeGreaterThan(0);
      }
    });
  }

  it("draws half the rack LEDs on the lite tier and stays small enough to instance", () => {
    const leds = (tier: "full" | "lite") => engineScenery(layout, tier).flows.filter((f) => f.h === 0.08).length;
    expect(leds("full")).toBe(2 * leds("lite"));
    expect(leds("lite")).toBeGreaterThan(0);
    const full = engineScenery(layout, "full");
    expect(full.solids.length).toBeLessThan(200);
    expect(full.flows.length).toBeLessThan(250);
    expect(full.panels.length).toBeLessThan(40);
  });

  it("names every bay on an upright floating sign, adds Coming soon to the dark bays and titles the workbench", () => {
    const signs = engineSigns(layout, data, labels);
    expect(signs).toHaveLength(layout.bays.length + 2 + 2);
    for (const bay of layout.bays) {
      const title = data.bays.find((x) => x.id === bay.id)!.title;
      expect(signs.find((sg) => sg.text === title)?.color, bay.id).toBe(bay.lit ? ENGINE_TONES.amber : ENGINE_TONES.dim);
    }
    expect(signs.filter((sg) => sg.text === labels.soon)).toHaveLength(2);
    expect(signs.some((sg) => sg.text === "ENGINE ROOM")).toBe(true);
    for (const sg of signs) expect(sg.tilt, sg.text).toBeUndefined();
  });
});
```

`tests/unit/floor-chunks.test.ts`: add B1 to `setup` (`d.B1`, `calls.B1`, loader `B1: () => (calls.B1++, d.B1.promise)`), and change the expectations: `LAZY_FLOORS` is `["L3", "L4", "RF", "B1"]`; `snapshot()` adds `B1: "idle"`; `ensure`/`prefetch` of eager floors leaves `{ L3: 0, L4: 0, RF: 0, B1: 0 }`; `prefetchAll()` gives `{ L3: 1, L4: 1, RF: 1, B1: 0 }` with the comment "B1 is never part of the idle prefetch: only unlocked sessions load it (FloorChunkPrefetch)".

`tests/unit/floor-prefetch.test.ts`:

```ts
  it("adds B1 to the picker and call pad prefetch, and to the idle prefetch, only once unlocked", () => {
    expect(prefetchFor({ ...idle, picker: { kind: "floor" }, b1Unlocked: true })).toEqual({ need: [], soon: ["L3", "L4", "RF", "B1"] });
    expect(prefetchFor({ ...idle, b1Unlocked: true })).toEqual({ need: [], soon: [] });
    expect(prefetchFor({ ...idle, b1Unlocked: true, idle: true })).toEqual({ need: [], soon: ["B1"] });
    expect(prefetchFor({ ...idle, idle: true })).toEqual({ need: [], soon: [] });
  });
```

`tests/unit/floor-chunks-graph.test.ts`: add to `LAZY_ONLY` `"src/experience/floors/EngineRoom.tsx"`, `"src/experience/floors/engine/scenery.ts"`, `"src/experience/floors/engine/EngineFx.tsx"`, `"src/experience/floors/chunks/engine.ts"`; in "puts each floor ... in its chunk entry" add `expect(staticClosure("src/experience/floors/chunks/engine.ts").has("src/experience/floors/EngineRoom.tsx")).toBe(true);`; in the loader check iterate `["labs", "library", "roof", "engine"]`; add a case that the main path keeps the pure layout: `expect(MAIN.has("src/experience/floors/engine/layout.ts")).toBe(true);`.

`tests/unit/floating-sign.test.ts`: add `"floors/engine/EngineFx.tsx"` to the instanced-holo file list.

- [x] **Step 2: Run them and see them fail**

Run: `bunx vitest run tests/unit/engine-scenery.test.ts tests/unit/floor-chunks.test.ts tests/unit/floor-prefetch.test.ts tests/unit/floor-chunks-graph.test.ts tests/unit/floating-sign.test.ts`
Expected: FAIL (missing modules, B1 not lazy).

- [x] **Step 3: The pure scenery**

`src/experience/floors/engine/scenery.ts`:

```ts
import type { SignSpec } from "../../fx/signLayout";
import type { EngineData, GpuTier, Rect } from "../../types";
import type { Box } from "../roof/solids";
import { ENGINE, type EngineBay, type EngineLayout } from "./layout";

/**
 * Pure scenery of the B1 Engine Room (no React or three): the solid boxes (one merged mesh plus its edges), the
 * holo `strip` instances (pipes, cable trays, drops, bay front strips, rack LEDs: edges plus a slow pulse along
 * x with a random phase per instance, so pipes carry data and LEDs blink with no CPU work) and the holo `fall`
 * screens (data waterfalls). Positions are floor-local; `y` is a box's bottom for solids and its center for
 * instances.
 */
export interface FlowInstance {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
}

/** An upright screen facing `yaw` (forward (sin, cos)), or `flat` on a table top; `y` is its center. */
export interface PanelInstance {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  yaw: number;
  flat?: boolean;
  color: string;
}

export interface EngineScenery {
  solids: Box[];
  flows: FlowInstance[];
  panels: PanelInstance[];
}

/** Floor words (hud.engine.*): the workbench title and subtitle, and the dark bays' plate. */
export interface EngineLabels {
  title: string;
  subtitle: string;
  soon: string;
}

export const ENGINE_TONES = { amber: ENGINE.accent, cyan: "#22d3ee", violet: "#a78bfa", green: "#34d399", dim: "#71717a", warm: "#fde68a" } as const;
const LED_TONES = [ENGINE_TONES.green, ENGINE_TONES.amber, ENGINE_TONES.cyan] as const;

/** LEDs per rack cabinet; the lite tier draws half. */
export function engineDetail(tier: GpuTier): { leds: number } {
  return { leds: tier === "full" ? 8 : 4 };
}

const WALL = 0.8;
const SIDE = 0.3;
const CABINET = { w: 1.8, h: 3.6, pitch: 2 } as const;
const SIGN_Y = 5.3;
/** Pipe runs hang over the bay fronts (z = +-PIPE_Z, held by brackets on the bay walls); cable trays over the aisle edges. */
const PIPE_Z = 8.4;
const TRAY_Z = 3;

/** +1 when the bay's open face looks toward +z (north bays), -1 for south bays. */
const out = (bay: EngineBay): 1 | -1 => (bay.side === "north" ? 1 : -1);
/** z of the inner face of the bay's back wall. */
const backFace = (bay: EngineBay) => (bay.side === "north" ? bay.rect.minZ + WALL : bay.rect.maxZ - WALL);
/** Upright screens in a bay face the aisle. */
const faceYaw = (bay: EngineBay) => (bay.side === "north" ? 0 : Math.PI);

function bayShell(bay: EngineBay): Box[] {
  const { w, d, h } = ENGINE.bay;
  const { x } = bay.center;
  const bracketZ = bay.front - out(bay) * 0.4;
  return [
    { x, y: 0, z: backFace(bay) - out(bay) * (WALL / 2), w, h, d: WALL },
    { x: bay.rect.minX + SIDE / 2, y: 0, z: bay.center.z, w: SIDE, h, d },
    { x: bay.rect.maxX - SIDE / 2, y: 0, z: bay.center.z, w: SIDE, h, d },
    { x, y: 0, z: bay.center.z, w: w - 2 * SIDE, h: 0.12, d: d - WALL },
    { x: bay.rect.minX + SIDE / 2, y: h, z: bracketZ, w: 0.2, h: ENGINE.ceiling - h, d: 0.2 },
    { x: bay.rect.maxX - SIDE / 2, y: h, z: bracketZ, w: 0.2, h: ENGINE.ceiling - h, d: 0.2 },
  ];
}

function cabinetLeds(x: number, frontZ: number, dir: 1 | -1, count: number, seed: number): FlowInstance[] {
  return Array.from({ length: count }, (_, j) => ({
    x: x - 0.6 + (j % 4) * 0.4,
    y: 3 - Math.floor(j / 4) * 0.45,
    z: frontZ + dir * 0.03,
    w: 0.16,
    h: 0.08,
    d: 0.04,
    color: LED_TONES[(seed + j) % LED_TONES.length],
  }));
}

function rackRow(rack: Rect, leds: number, seed: number): { solids: Box[]; flows: FlowInstance[] } {
  const north = rack.minZ === ENGINE.bounds.minZ;
  const z = (rack.minZ + rack.maxZ) / 2;
  const front = north ? rack.maxZ : rack.minZ;
  const count = Math.floor((rack.maxX - rack.minX) / CABINET.pitch);
  const solids: Box[] = [];
  const flows: FlowInstance[] = [];
  for (let i = 0; i < count; i++) {
    const x = rack.minX + CABINET.pitch * (i + 0.5);
    solids.push({ x, y: 0, z, w: CABINET.w, h: CABINET.h, d: rack.maxZ - rack.minZ });
    flows.push(...cabinetLeds(x, front, north ? 1 : -1, leds, seed + i));
  }
  return { solids, flows };
}

function stationProps(bay: EngineBay, leds: number): { solids: Box[]; flows: FlowInstance[]; panels: PanelInstance[] } {
  const { x, z: cz } = bay.center;
  const o = out(bay);
  const back = backFace(bay);
  const yaw = faceYaw(bay);
  const onBack = back + o * 0.05;
  switch (bay.id) {
    case "blueprint":
      // A table with the site diagram glowing on its top.
      return { solids: [{ x, y: 0, z: cz, w: 4.4, h: 1.1, d: 2.4 }], flows: [], panels: [{ x, y: 1.13, z: cz, w: 4.2, h: 2.2, yaw: 0, flat: true, color: ENGINE_TONES.cyan }] };
    case "timeline":
      // Nine lit screens on the back wall: rounds 1 to 9.
      return { solids: [], flows: [], panels: Array.from({ length: 9 }, (_, i) => ({ x: x - 3.2 + i * 0.8, y: 2.5, z: onBack, w: 0.6, h: 2.8, yaw, color: ENGINE_TONES.violet })) };
    case "agents": {
      // A desk with two monitors.
      const screenZ = back + o * 0.25;
      return {
        solids: [{ x, y: 0, z: back + o * 0.9, w: 5, h: 1, d: 1.6 }, ...[-1.2, 1.2].map((dx): Box => ({ x: x + dx, y: 1, z: screenZ, w: 1.8, h: 1.2, d: 0.12 }))],
        flows: [],
        panels: [-1.2, 1.2].map((dx) => ({ x: x + dx, y: 1.6, z: screenZ + o * 0.07, w: 1.6, h: 0.9, yaw, color: ENGINE_TONES.green })),
      };
    }
    case "gates": {
      // Three gate cabinets with their LEDs.
      const front = back + o * 1.6;
      const xs = [-2.2, 0, 2.2].map((dx) => x + dx);
      return { solids: xs.map((cx): Box => ({ x: cx, y: 0, z: back + o * 0.8, w: CABINET.w, h: 3.8, d: 1.6 })), flows: xs.flatMap((cx, i) => cabinetLeds(cx, front, o, leds, i)), panels: [] };
    }
    case "dashboard":
      // A wall of numbers over a console.
      return { solids: [{ x, y: 0, z: cz + o * 0.8, w: 4, h: 0.9, d: 1 }], flows: [], panels: [{ x, y: 2.6, z: onBack, w: 6.4, h: 2.8, yaw, color: ENGINE_TONES.cyan }] };
    default:
      // Bays 6 and 7: empty until their stations ship.
      return { solids: [], flows: [], panels: [] };
  }
}

function pipes(layout: EngineLayout): FlowInstance[] {
  const from = ENGINE.approach.x - 1;
  const to = ENGINE.bounds.maxX - 2;
  const x = (from + to) / 2;
  const w = to - from;
  const drops = layout.bays
    .filter((bay) => bay.lit)
    .map((bay) => ({ x: bay.center.x + 3, y: (ENGINE.bay.h + ENGINE.ceiling) / 2, z: bay.front - out(bay) * 0.4, w: 0.2, h: ENGINE.ceiling - ENGINE.bay.h, d: 0.2, color: ENGINE_TONES.amber }));
  return [
    ...[-PIPE_Z, PIPE_Z].map((z) => ({ x, y: ENGINE.ceiling, z, w, h: 0.36, d: 0.36, color: ENGINE_TONES.amber })),
    ...[-TRAY_Z, TRAY_Z].map((z) => ({ x, y: ENGINE.ceiling + 0.5, z, w, h: 0.12, d: 0.9, color: ENGINE_TONES.cyan })),
    ...drops,
  ];
}

const frontStrip = (bay: EngineBay): FlowInstance => ({ x: bay.center.x, y: 0.03, z: bay.front - out(bay) * 0.15, w: ENGINE.bay.w - 0.6, h: 0.04, d: 0.25, color: ENGINE_TONES.amber });

export function engineScenery(layout: EngineLayout, tier: GpuTier): EngineScenery {
  const { leds } = engineDetail(tier);
  const solids: Box[] = [];
  const flows: FlowInstance[] = pipes(layout);
  const panels: PanelInstance[] = [];
  for (const bay of layout.bays) {
    const props = stationProps(bay, leds);
    solids.push(...bayShell(bay), ...props.solids);
    flows.push(...props.flows, ...(bay.lit ? [frontStrip(bay)] : []));
    panels.push(...props.panels);
  }
  layout.racks.forEach((rack, i) => {
    const row = rackRow(rack, leds, i);
    solids.push(...row.solids);
    flows.push(...row.flows);
  });
  const w = layout.workbench;
  solids.push({ x: w.minX + 1.4, y: 0, z: 0, w: 2.6, h: 1.1, d: 7 }, { x: w.maxX - 0.4, y: 0, z: 0, w: 0.8, h: 5, d: w.maxZ - w.minZ });
  panels.push({ x: w.maxX - 0.85, y: 3.2, z: 0, w: 7, h: 2.6, yaw: -Math.PI / 2, color: ENGINE_TONES.amber });
  return { solids, flows, panels };
}

/** Station names over every bay (lit amber, dark dim with a Coming soon plate) and the title over the workbench. */
export function engineSigns(layout: EngineLayout, data: EngineData, labels: EngineLabels): SignSpec[] {
  const titles = new Map(data.bays.map((bay) => [bay.id, bay.title]));
  const signs: SignSpec[] = [];
  for (const bay of layout.bays) {
    const z = bay.front - out(bay) * 0.6;
    signs.push({ text: titles.get(bay.id) ?? bay.id, x: bay.center.x, y: SIGN_Y, z, color: bay.lit ? ENGINE_TONES.amber : ENGINE_TONES.dim, fontSize: 0.42 });
    if (!bay.lit) signs.push({ text: labels.soon, x: bay.center.x, y: SIGN_Y - 0.8, z, color: ENGINE_TONES.dim, fontSize: 0.3, opacity: 0.8 });
  }
  const x = (layout.workbench.minX + layout.workbench.maxX) / 2;
  signs.push({ text: labels.title.toLocaleUpperCase(), x, y: 6.6, z: 0, color: ENGINE_TONES.amber, fontSize: 0.7 });
  signs.push({ text: labels.subtitle, x, y: 5.7, z: 0, color: ENGINE_TONES.warm, fontSize: 0.36 });
  return signs;
}
```

- [x] **Step 4: The two instanced holo draws**

`src/experience/floors/engine/EngineFx.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { BoxGeometry, Object3D, PlaneGeometry } from "three";
import { createHoloMaterial, HOLO_MODE } from "../../fx/holoFx";
import { neonColor } from "../../fx/materials";
import { useDispose } from "../../fx/useDispose";
import { useUniformTime } from "../../fx/useUniformTime";
import type { GpuTier } from "../../types";
import type { FlowInstance, PanelInstance } from "./scenery";

const NO_RAYCAST = () => null;

/** Instance matrices and colors, set at creation (attached), so the floor's precompile builds the final program and culling sees real bounds. */
function instanceArrays<T extends { color: string }>(items: readonly T[], place: (o: Object3D, item: T) => void, tier: GpuTier) {
  const o = new Object3D();
  const matrices = new Float32Array(items.length * 16);
  const colors = new Float32Array(items.length * 3);
  items.forEach((item, i) => {
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.set(1, 1, 1);
    place(o, item);
    o.updateMatrix();
    o.matrix.toArray(matrices, i * 16);
    neonColor(item.color, 1.4, tier).toArray(colors, i * 3);
  });
  return { matrices, colors };
}

/** Pipes, cable trays, drops, bay front strips and rack LEDs: one instanced draw on the holo `strip` mode. */
export function FlowMesh({ items, tier }: { items: readonly FlowInstance[]; tier: GpuTier }) {
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useDispose(geometry);
  const material = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.strip, opacity: tier === "full" ? 1 : 0.85, fade: [40, 110] }), [tier]);
  useDispose(material);
  useUniformTime(useMemo(() => [material], [material]));
  const { matrices, colors } = useMemo(
    () =>
      instanceArrays(
        items,
        (o, f) => {
          o.position.set(f.x, f.y, f.z);
          o.scale.set(f.w, f.h, f.d);
        },
        tier,
      ),
    [items, tier],
  );
  if (items.length === 0) return null;
  return (
    <instancedMesh name="engine-flows" args={[geometry, material, items.length]} raycast={NO_RAYCAST}>
      <instancedBufferAttribute attach="instanceMatrix" args={[matrices, 16]} />
      <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
    </instancedMesh>
  );
}

/** Data screens (timeline wall, monitors, the dashboard wall, the blueprint table, the workbench): one instanced draw on the holo `fall` mode. */
export function PanelMesh({ items, tier }: { items: readonly PanelInstance[]; tier: GpuTier }) {
  const geometry = useMemo(() => new PlaneGeometry(1, 1), []);
  useDispose(geometry);
  const material = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.fall, opacity: tier === "full" ? 0.95 : 0.8, params: [14, 3, 0, 0], fade: [40, 110] }), [tier]);
  useDispose(material);
  useUniformTime(useMemo(() => [material], [material]));
  const { matrices, colors } = useMemo(
    () =>
      instanceArrays(
        items,
        (o, p) => {
          o.position.set(p.x, p.y, p.z);
          o.rotation.set(p.flat ? -Math.PI / 2 : 0, p.flat ? 0 : p.yaw, 0);
          o.scale.set(p.w, p.h, 1);
        },
        tier,
      ),
    [items, tier],
  );
  if (items.length === 0) return null;
  return (
    <instancedMesh name="engine-panels" args={[geometry, material, items.length]} raycast={NO_RAYCAST}>
      <instancedBufferAttribute attach="instanceMatrix" args={[matrices, 16]} />
      <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
    </instancedMesh>
  );
}
```

Reduced motion freezes both (`useUniformTime` stops `uTime`): pipes and LEDs hold still, screens stop falling.

- [x] **Step 5: The floor component and the chunk entry**

`src/experience/floors/EngineRoom.tsx`:

```tsx
"use client";

import { Suspense, useMemo } from "react";
import { useHQStore } from "@/store/useHQStore";
import { FloatingSigns } from "../fx/FloatingSign";
import { RoadMarkings } from "../fx/RoadMarkings";
import type { ExperienceData, GpuTier } from "../types";
import { FlowMesh, PanelMesh } from "./engine/EngineFx";
import { buildEngineLayout, ENGINE } from "./engine/layout";
import { engineScenery, engineSigns, type EngineLabels } from "./engine/scenery";
import { MergedBoxes, MergedEdges } from "./roof/kit";

export type { EngineLabels };

/**
 * B1 Engine Room (spec 2026-10-17): the aisle (road kit), seven bays with their stations, rack rows, pipes and
 * the workbench. Scene draws: the road kit, one merged solid mesh and its edges, two instanced holo draws and
 * the floating sign pair. Stations are point-and-go targets (interact/registry.ts); their drawers are
 * `EngineBody` in this chunk.
 */
export function EngineRoom({ data, labels, tier }: { data: ExperienceData; labels: EngineLabels; tier: GpuTier }) {
  const layout = useMemo(() => buildEngineLayout(), []);
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  const scene = useMemo(() => engineScenery(layout, tier), [layout, tier]);
  const signs = useMemo(() => engineSigns(layout, data.engine, labels), [layout, data.engine, labels]);
  return (
    <group name="engine-room">
      <RoadMarkings network={layout.network} color={ENGINE.accent} tier={tier} reducedMotion={reducedMotion} />
      <MergedBoxes boxes={scene.solids} color="#0c0a09" emissive={ENGINE.accent} emissiveIntensity={0.06} />
      <MergedEdges boxes={scene.solids} color={ENGINE.accent} tier={tier} opacity={0.7} />
      <FlowMesh items={scene.flows} tier={tier} />
      <PanelMesh items={scene.panels} tier={tier} />
      {/* Text loads fonts asynchronously; keep it from holding back the geometry. */}
      <Suspense fallback={null}>
        <FloatingSigns signs={signs} name="engine-signs" tier={tier} />
      </Suspense>
    </group>
  );
}
```

`src/experience/floors/chunks/engine.ts`:

```ts
/** B1 chunk entry (B1 Engine Room, PR 2). Imported only by floorChunks.ts. Task 5 adds EngineBody. */
export { EngineRoom } from "../EngineRoom";
```

`MergedBoxes` and `MergedEdges` come from the RF chunk's `roof/kit.tsx`; the bundler moves that module into a shared async chunk, which `bytes-3d` counts toward RF (the floor loaded first, as with L3 and L4 today).

- [x] **Step 6: B1 as a lazy floor, prefetched only when unlocked**

`src/experience/floors/floorChunks.ts`:

```ts
import type * as EngineChunk from "./chunks/engine";
// ...
/** On-demand floors: L3, L4 and RF for every visitor, B1 only once unlocked. */
export const LAZY_FLOORS = ["L3", "L4", "RF", "B1"] as const satisfies readonly FloorId[];
export type LazyFloor = (typeof LAZY_FLOORS)[number];
/** The lazy floors every session prefetches after the first frame (B1 joins in FloorChunkPrefetch once unlocked). */
export const PUBLIC_LAZY_FLOORS = ["L3", "L4", "RF"] as const satisfies readonly LazyFloor[];
// ...
const ALL_FLOORS: readonly FloorId[] = ["B1", "L1", "L2", "L3", "L4", "RF"];
// in createFloorChunks' return:
    prefetchAll: () => PUBLIC_LAZY_FLOORS.forEach(prefetch),
// FloorChunkModules:
  B1: typeof EngineChunk;
// loaders of the app instance:
    B1: () => import("./chunks/engine"),
```

`src/experience/floors/lazyFloors.tsx`: `export const engineFloor = appFloor("B1", (m) => m.EngineRoom);`

`src/experience/floors/floorPrefetch.ts`:

```ts
import { PUBLIC_LAZY_FLOORS, type FloorChunkState } from "./floorChunks";

export interface PrefetchSnapshot {
  ride: { to: FloorId } | null;
  picker: { kind: string } | null;
  hover: { item: { kind: string } } | null;
  /** B1 is unlocked: its chunk joins the speculative prefetches. */
  b1Unlocked?: boolean;
  /** The first frame is drawn and the page went idle once (FloorChunkPrefetch). */
  idle?: boolean;
}

/**
 * Which floor chunks a store state needs now (`need`: the ride target, loaded even with ?prefetch=off) or will
 * likely need soon (`soon`: the floor picker is open or an elevator call pad is targeted; B1 also on idle once
 * unlocked). B1 never loads for a locked visitor.
 */
export function prefetchFor({ ride, picker, hover, b1Unlocked = false, idle = false }: PrefetchSnapshot): { need: FloorId[]; soon: FloorId[] } {
  const intent = picker?.kind === "floor" || hover?.item.kind === "elevator-pad";
  const lazy: FloorId[] = b1Unlocked ? [...PUBLIC_LAZY_FLOORS, "B1"] : [...PUBLIC_LAZY_FLOORS];
  const soon: FloorId[] = intent ? lazy : b1Unlocked && idle ? ["B1"] : [];
  return { need: ride ? [ride.to] : [], soon };
}
```

`src/experience/floors/FloorChunkPrefetch.tsx`:

```tsx
export function FloorChunkPrefetch() {
  useEffect(() => {
    const store = getHQStore();
    let idle = false;
    let rideKey: string | null = null;
    const apply = () => {
      const state = store.getState();
      const { need, soon } = prefetchFor({ ...state, idle });
      // A failed chunk is retried once at ride start, so the car holds for it (rideChunkHold).
      const retry = rideRetry(rideKey, state.ride, state.ride ? floorChunks.state(state.ride.to) : "idle");
      rideKey = retry.key;
      if (retry.retry) floorChunks.ensure(retry.retry);
      // Only idle floors: this runs on every store change, and ensure on a failed floor would restart its import.
      for (const id of need) if (floorChunks.state(id) === "idle") floorChunks.ensure(id);
      for (const id of soon) if (floorChunks.state(id) === "idle") floorChunks.prefetch(id);
    };
    const offIdle = afterFirstFrameIdle(() => {
      idle = true;
      floorChunks.prefetchAll();
      apply();
    });
    apply();
    const off = store.subscribe(apply);
    return () => {
      offIdle();
      off();
    };
  }, []);
  return null;
}
```

(Update its doc comment: "every public lazy floor once the first frame is drawn and the page is idle, B1 too once unlocked".) (`afterFirstFrameIdle` returns its cancel function.)

- [x] **Step 7: Mount it in the tower and pass the labels**

`src/experience/tower/Tower.tsx`:

```tsx
import type { EngineLabels } from "../floors/EngineRoom";
import { engineFloor, labsFloor, libraryFloor, roofFloor, useFloorChunks } from "../floors/lazyFloors";
// TowerLabels:
  /** B1 Engine Room floor words (`hud.engine`). */
  engine: EngineLabels;
// in Tower:
  const EngineRoom = engineFloor();
// floorContent:
      case "B1":
        return EngineRoom && <EngineRoom data={data} labels={labels.engine} tier={tier} />;
```

`src/experience/Experience.tsx`, in the `labels` memo after `roof`: `engine: { title: t("engine.title"), subtitle: t("engine.subtitle"), soon: t("engine.soon") },`.

- [x] **Step 8: Run the tests**

Run: `bunx vitest run tests/unit/engine-scenery.test.ts tests/unit/floor-chunks.test.ts tests/unit/floor-prefetch.test.ts tests/unit/floor-chunks-graph.test.ts tests/unit/floating-sign.test.ts tests/unit/three-disposal.test.ts tests/unit/floor-text.test.ts`
Expected: PASS.

Run: `bun run typecheck && bun run lint && bun run test`
Expected: PASS.

- [x] **Step 9: Commit**

```bash
git add src/experience/floors src/experience/tower/Tower.tsx src/experience/Experience.tsx tests/unit
git commit -m "feat(b1): Engine Room scenery in its own floor chunk, prefetched only when unlocked"
```

### Task 5: Station drawers from the build story

Each lit bay opens the Glass Drawer on a `B1:<station>` room with an Engine Room body: the site diagram (laid out on the server, drawn by the existing `DiagramSvg`), the rounds with their pull request links and before and after captures, the agent loop with a plan excerpt, the gates with their status dots, and the measured numbers. Every view links its Classic `/build#<station>` section. All text and numbers are resolved on the server into `/data/rooms/{locale}.json`; the client body imports no content loader and no message namespace beyond what the drawer already has.

**Files:**
- Create: `src/components/diagram/metrics.ts`, `src/components/diagram/text.ts`, `src/content/room-views/engine.ts`, `src/hud/drawer/EngineBody.tsx`
- Modify: `src/components/diagram/layout.ts` (constants re-exported from `metrics.ts`, `DrawnDiagram`, `drawnDiagram`), `src/components/diagram/DiagramSvg.tsx` (imports, prop type), `src/components/ArchitectureDiagram.tsx` (use `text.ts`), `src/content/room-views/types.ts` (`EngineShot`, `RoomEngine`, `RoomView.engine`), `src/content/room-views/index.ts`, `src/experience/missions/rooms.ts:5` (`RoomKind` adds `"engine"`), `src/hud/drawer/bodies.tsx`, `src/experience/floors/chunks/engine.ts`, `src/experience/Experience.tsx` (`hasPage`)
- Test: `tests/unit/engine-views.test.ts` (new), `tests/hud/EngineBody.test.tsx` (new), `tests/unit/floor-chunks-graph.test.ts`

**Interfaces:**
- Consumes: `getBuildStory()`, `getBuildFacts()` (server), `timelineRows`, `roundDates`, `dashboardTiles`, `prUrl`, `repoFileUrl` (`src/lib/build-page.ts`), `layoutArchitecture`, `DIAGRAM_PRESETS` (`src/components/diagram/layout.ts`), `ENGINE_STATIONS`, `engineRoom`, `EngineStationId` (Task 1), `PUBLIC_FLOORS` (Task 1), `chain`, `single`, `messages` (`room-views/shared.ts`), `MetricTiles`, `Sections` (`hud/drawer/blocks.tsx`), `AccentDot`, `BuildVisits` (`src/components/build/BuildVisits.tsx`, a client island), `lazyFromChunk`.
- Produces:
  - `src/components/diagram/metrics.ts`: `PAD`, `LINE_GAP`, `lineHeight(size)`.
  - `src/components/diagram/layout.ts`: `type DrawnDiagram = Pick<DiagramLayout, "preset" | "width" | "height" | "nodes" | "edges" | "groups">`, `drawnDiagram(layout: DiagramLayout): DrawnDiagram`.
  - `src/components/diagram/text.ts`: `diagramTexts(locale, kindLabel)`, `diagramSummary(architecture, words)`.
  - `src/content/room-views/types.ts`: `EngineShot`, `RoomEngine` (fields below), `RoomView.engine?: RoomEngine`.
  - `buildEngineViews(locale: Locale): RoomView[]`, `RoomKind` `"engine"`, `EngineBody({ view, locale }: RoomBodyProps)` with root `data-engine-station={station}`.

- [x] **Step 1: Write the failing tests**

`tests/unit/engine-views.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getBuildFacts, getBuildStory, STATION_IDS } from "@/content/build-story";
import { buildRoomViews } from "@/content/room-views";
import { LOCALES } from "@/content/schema";
import { DIAGRAM_PRESETS } from "@/components/diagram/layout";
import { dashboardTiles, prUrl, timelineRows } from "@/lib/build-page";

const story = getBuildStory();
const facts = getBuildFacts();

describe("B1 Engine Room drawers", () => {
  for (const locale of LOCALES) {
    const views = buildRoomViews(locale);
    const view = (id: string) => views[`B1:${id}`]!;

    it(`gives every station a single-pane engine view on B1, chained in station order, linking its /build section (${locale})`, () => {
      for (const [i, id] of STATION_IDS.entries()) {
        expect(view(id)).toMatchObject({ floor: "B1", kind: "engine", variant: "single", page: `/build#${id}`, accent: "amber", title: story.stations[id].title[locale] });
        expect(view(id).engine?.station).toBe(id);
        expect(view(id).prev).toBe(i > 0 ? `B1:${STATION_IDS[i - 1]}` : undefined);
        expect(JSON.parse(JSON.stringify(view(id)))).toEqual(view(id));
      }
      expect(Object.keys(views).filter((k) => k.startsWith("B1:")).sort()).toEqual(STATION_IDS.map((id) => `B1:${id}`).sort());
    });

    it(`lays the site diagram out for the drawer width and names it (${locale})`, () => {
      const diagram = view("blueprint").engine?.diagram;
      expect(diagram?.layout.nodes).toHaveLength(story.stations.blueprint.architecture.nodes.length);
      expect(diagram?.layout.width).toBeLessThanOrEqual(DIAGRAM_PRESETS.phone.maxWidth);
      expect(diagram?.label.length).toBeGreaterThan(20);
    });

    it(`lists every round with its measured pull requests, linking all but the unlinked ones (${locale})`, () => {
      const rows = timelineRows(story, facts);
      const rounds = view("timeline").engine?.rounds ?? [];
      expect(rounds.map((r) => r.id)).toEqual(rows.map((r) => r.round.id));
      rounds.forEach((r, i) => {
        expect(r.prs.map((p) => p.n)).toEqual(rows[i].prs);
        for (const p of r.prs) expect(p.href).toBe(rows[i].unlinked.includes(p.n) ? undefined : prUrl(p.n));
      });
    });

    it(`shows every gate, the plan excerpt and only the numbers the snapshot carries (${locale})`, () => {
      expect(view("gates").engine?.gates?.map((g) => g.id)).toEqual(story.stations.gates.gates.map((g) => g.id));
      expect(view("agents").engine?.excerpt?.href.endsWith(story.stations.agents.excerpt.path)).toBe(true);
      expect(view("dashboard").engine?.tiles?.map((t) => t.id)).toEqual(dashboardTiles(facts, 5).map((t) => t.id));
      expect(view("dashboard").engine?.tiles?.find((t) => t.id === "floors")?.value).toBe("5");
    });
  }
});
```

`tests/hud/EngineBody.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRoomViews } from "@/content/room-views";
import { EngineBody } from "@/hud/drawer/EngineBody";

const views = buildRoomViews("en");
const body = (id: string) => render(<EngineBody view={views[`B1:${id}`]!} locale="en" />).container;

beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline")))));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EngineBody (B1 station drawers)", () => {
  it("draws the site diagram as one named image", () => {
    const root = body("blueprint");
    expect(root.querySelector("[data-engine-station='blueprint'] svg")).not.toBeNull();
    expect(screen.getByRole("img", { name: views["B1:blueprint"]!.engine!.diagram!.label })).toBeInTheDocument();
  });

  it("links every linked pull request in a new tab", () => {
    const root = body("timeline");
    const links = [...root.querySelectorAll<HTMLAnchorElement>("a[href*='/pull/']")];
    const expected = views["B1:timeline"]!.engine!.rounds!.flatMap((r) => r.prs.filter((p) => p.href));
    expect(links).toHaveLength(expected.length);
    for (const a of links) expect([a.target, a.rel]).toEqual(["_blank", "noopener noreferrer"]);
  });

  it("lists every gate with a status dot, and the excerpt with its source link", () => {
    expect(body("gates").querySelectorAll("[data-gate] [data-accent-dot]")).toHaveLength(views["B1:gates"]!.engine!.gates!.length);
    cleanup();
    const agents = body("agents");
    expect(agents.querySelector(`a[href='${views["B1:agents"]!.engine!.excerpt!.href}']`)).not.toBeNull();
  });

  it("shows the measured numbers and the hourly uptime check", () => {
    const root = body("dashboard");
    for (const tile of views["B1:dashboard"]!.engine!.tiles!) expect(root.textContent).toContain(tile.value);
    expect(root.querySelector("[data-tile='uptime']")).not.toBeNull();
  });
});
```

`tests/unit/floor-chunks-graph.test.ts`: add `"src/hud/drawer/EngineBody.tsx"` to `LAZY_ONLY` and `expect(staticClosure("src/experience/floors/chunks/engine.ts").has("src/hud/drawer/EngineBody.tsx")).toBe(true);`.

- [x] **Step 2: Run them and see them fail**

Run: `bunx vitest run tests/unit/engine-views.test.ts tests/hud/EngineBody.test.tsx tests/unit/floor-chunks-graph.test.ts`
Expected: FAIL (no B1 views, no `EngineBody`).

- [x] **Step 3: A client-safe diagram drawing and shared diagram text**

`src/components/diagram/metrics.ts`:

```ts
/** Drawing constants shared by the layout and `DiagramSvg` (no layout code, so a client drawer can import the renderer alone). */
export const PAD = 10;
export const LINE_GAP = 4;
export const lineHeight = (size: number) => size + LINE_GAP;
```

`src/components/diagram/layout.ts`: delete its own `PAD`, `LINE_GAP` and `lineHeight` definitions, add `import { LINE_GAP, PAD, lineHeight } from "./metrics";` and `export { LINE_GAP, PAD, lineHeight };`, and append:

```ts
/** What `DiagramSvg` draws: a laid-out diagram without the order-search bookkeeping (JSON-safe: a room view can carry it). */
export type DrawnDiagram = Pick<DiagramLayout, "preset" | "width" | "height" | "nodes" | "edges" | "groups">;

export function drawnDiagram({ preset, width, height, nodes, edges, groups }: DiagramLayout): DrawnDiagram {
  return { preset, width, height, nodes, edges, groups };
}
```

`src/components/diagram/DiagramSvg.tsx`: `import type { DiagramKind, DrawnDiagram, LaidEdge, Point } from "./layout";`, `import { LINE_GAP, PAD, lineHeight } from "./metrics";`, and type the prop `layout: DrawnDiagram` (every helper in the file reads only these fields).

`src/components/diagram/text.ts`:

```ts
import type { Architecture, Locale } from "@/content/schema";
import type { DiagramNode, DiagramText } from "./layout";

/** Node texts for `layoutArchitecture`: the kind label upper-cased for the locale, the label and the localized sublabel. */
export function diagramTexts(locale: Locale, kindLabel: (kind: DiagramNode["kind"]) => string): (node: DiagramNode) => DiagramText {
  return (n) => ({ kind: kindLabel(n.kind).toLocaleUpperCase(locale), label: n.label, sublabel: n.sublabel?.[locale] });
}

/** The figure's text alternative: its node count and every connection with its label and "async". */
export function diagramSummary(
  architecture: Architecture,
  words: { flow: (from: string, to: string) => string; async: string; summary: (count: number, flows: string) => string },
): string {
  const byId = new Map(architecture.nodes.map((n) => [n.id, n.label]));
  const flows = architecture.edges.map((e) => [words.flow(byId.get(e.from)!, byId.get(e.to)!), e.label, e.async ? words.async : undefined].filter(Boolean).join(", ")).join("; ");
  return words.summary(architecture.nodes.length, `${flows}.`);
}
```

`src/components/ArchitectureDiagram.tsx`: replace the inline `texts`, `byId`, `flows` and `summary` with:

```tsx
  const texts = diagramTexts(locale, (kind) => t(`nodeKind.${kind}`));
  // ...the three layoutArchitecture calls stay...
  const summary = diagramSummary(architecture, { flow: (from, to) => td("flow", { from, to }), async: td("async"), summary: (count, flows) => td("summary", { count, flows }) });
```

The Classic page output is unchanged (`tests/unit/diagram-layout.test.ts`, `tests/unit/post-diagrams.test.ts` and `e2e/pageview.spec.ts` cover it; add both unit files to Step 7's run).

- [x] **Step 4: The room view contract**

`src/content/room-views/types.ts`:

```ts
import type { DrawnDiagram } from "@/components/diagram/layout";
import type { EngineStationId } from "@/experience/floors/engine/layout";
// ...
/** One before or after capture on the B1 timeline. */
export interface EngineShot {
  src: string;
  alt: string;
  width: number;
  height: number;
}

/** B1 Engine Room station drawer (`EngineBody`): the build story's station, laid out and labelled on the server. */
export interface RoomEngine {
  station: EngineStationId;
  /** Blueprint: the site diagram laid out for the drawer (`DIAGRAM_PRESETS.phone`) and its text alternative. */
  diagram?: { layout: DrawnDiagram; label: string };
  /** Timeline: rounds oldest first with the measured pull requests (`href` absent for unlinked ones). */
  rounds?: { id: string; heading: string; dates?: string; title: string; summary: string; open: boolean; count?: string; listLabel: string; prs: { n: number; href?: string }[]; shots?: { before: EngineShot; after: EngineShot; caption: string } }[];
  /** Gates: what each CI gate checks, its budget and whether it blocks a merge. */
  gates?: { id: string; title: string; text: string; budget: string; required: boolean }[];
  /** Agents: a real plan excerpt and its file on GitHub. */
  excerpt?: { text: string; href: string };
  /** Dashboard: only the numbers the snapshot carries, formatted. */
  tiles?: { id: string; value: string; label: string }[];
  /** Resolved words (the drawer loads no `build` messages on the client). */
  labels: { before: string; after: string; budget: string; blocksMerge: string; reportsOnly: string; inProgress: string; excerpt: string; source: string; hourly: string; uptime: string; visits: string };
}
// in RoomView, after `ops`:
  /** B1:<station>: the Engine Room station (`EngineBody`). */
  engine?: RoomEngine;
```

`src/experience/missions/rooms.ts`: add `"engine"` to `RoomKind`. B1 rooms are not in the room catalog (no Cmd-K row and no Classic search entry in PR 2); the drawer opens them through `openRoom` and the point-and-go registry.

- [x] **Step 5: Build the views**

`src/content/room-views/engine.ts`:

```ts
import { createTranslator } from "next-intl";
import { DIAGRAM_PRESETS, drawnDiagram, layoutArchitecture } from "@/components/diagram/layout";
import { diagramSummary, diagramTexts } from "@/components/diagram/text";
import { ENGINE_STATIONS, engineRoom, type EngineStationId } from "@/experience/floors/engine/layout";
import { dashboardTiles, prUrl, repoFileUrl, roundDates, timelineRows } from "@/lib/build-page";
import { PUBLIC_FLOORS } from "@/lib/floors";
import { formatDate, intlLocale } from "@/lib/format";
import { getBuildFacts, getBuildStory } from "../build-story";
import type { Locale, LocalizedText } from "../schema";
import { chain, messages, single } from "./shared";
import type { RoomEngine, RoomSection, RoomView } from "./types";

type StationContent = { engine: Omit<RoomEngine, "station" | "labels">; sections: RoomSection[] };

/**
 * B1 Engine Room: one drawer per station from the build story (`content/build-story.json`) and the build-time
 * snapshot (`content/generated/build-facts.json`), through the same helpers as the Classic page
 * (`src/lib/build-page.ts`), so a number is shown only when the snapshot carries it.
 */
export function buildEngineViews(locale: Locale): RoomView[] {
  const m = messages(locale);
  const t = createTranslator({ locale, messages: m, namespace: "build" });
  const tLabs = createTranslator({ locale, messages: m, namespace: "labs" });
  const tDiagram = createTranslator({ locale, messages: m, namespace: "diagram" });
  const story = getBuildStory();
  const facts = getBuildFacts();
  const number = new Intl.NumberFormat(intlLocale(locale));
  const date = formatDate(facts.generatedAt, locale);
  const snapshot = facts.commit ? t("snapshot", { date, commit: facts.commit }) : t("snapshotDate", { date });
  const labels: RoomEngine["labels"] = {
    before: t("before"),
    after: t("after"),
    budget: t("budget"),
    blocksMerge: t("blocksMerge"),
    reportsOnly: t("reportsOnly"),
    inProgress: t("inProgress"),
    excerpt: t("excerpt"),
    source: t("excerptSource"),
    hourly: t("hourly"),
    uptime: t("tiles.uptime"),
    visits: t("tiles.visits"),
  };
  const shot = (s: { src: string; width: number; height: number; alt: LocalizedText }) => ({ src: s.src, width: s.width, height: s.height, alt: s.alt[locale] });
  const { blueprint, agents, gates } = story.stations;

  const content: Record<EngineStationId, StationContent> = {
    blueprint: {
      engine: {
        diagram: {
          layout: drawnDiagram(layoutArchitecture(blueprint.architecture, diagramTexts(locale, (kind) => tLabs(`nodeKind.${kind}`)), DIAGRAM_PRESETS.phone)),
          label: diagramSummary(blueprint.architecture, { flow: (from, to) => tDiagram("flow", { from, to }), async: tDiagram("async"), summary: (count, flows) => tDiagram("summary", { count, flows }) }),
        },
      },
      sections: [{ title: t("howItRuns"), bullets: blueprint.steps.map((s) => s[locale]) }],
    },
    timeline: {
      engine: {
        rounds: timelineRows(story, facts).map(({ round, prs, unlinked, first, last, open }) => ({
          id: round.id,
          heading: t("round", { n: round.number }),
          dates: roundDates({ first, last }, locale, t("dateTo")),
          title: round.title[locale],
          summary: round.summary[locale],
          open,
          count: prs.length > 0 ? t("prCount", { count: prs.length }) : undefined,
          listLabel: t("prList", { n: round.number }),
          prs: prs.map((n) => (unlinked.includes(n) ? { n } : { n, href: prUrl(n) })),
          ...(round.shots ? { shots: { before: shot(round.shots.before), after: shot(round.shots.after), caption: round.shots.caption[locale] } } : {}),
        })),
      },
      sections: [{ body: t("prHint") }],
    },
    agents: {
      engine: { excerpt: { text: agents.excerpt.text, href: repoFileUrl(agents.excerpt.path) } },
      sections: [
        { title: t("loop"), bullets: agents.steps.map((s) => `${s.title[locale]}: ${s.text[locale]}`) },
        { title: t("tools"), chips: [...agents.tools] },
      ],
    },
    gates: {
      engine: { gates: gates.gates.map((g) => ({ id: g.id, title: g.title[locale], text: g.text[locale], budget: g.budget[locale], required: g.required })) },
      sections: [],
    },
    dashboard: {
      engine: {
        // The tower's public floor count (B1 stays a secret here too).
        tiles: dashboardTiles(facts, PUBLIC_FLOORS.length).map((tile) => {
          const value = number.format(tile.value);
          return { id: tile.id, value: tile.unit === "kb" ? t("kb", { value }) : value, label: t(`tiles.${tile.id}`, { date: tile.since ? formatDate(tile.since, locale) : "" }) };
        }),
      },
      sections: [],
    },
  };

  return chain(
    ENGINE_STATIONS.map((id) =>
      single({
        id: engineRoom(id),
        kind: "engine",
        title: story.stations[id].title[locale],
        subtitle: story.stations[id].summary[locale],
        meta: [snapshot],
        badges: [{ label: "B1", accent: "amber" }],
        accent: "amber",
        sections: content[id].sections,
        page: `/build#${id}`,
        engine: { station: id, labels, ...content[id].engine },
      }),
    ),
  );
}
```

`src/content/room-views/index.ts`: import `buildEngineViews` and append `...buildEngineViews(locale)` after the roof views.

- [x] **Step 6: The client body (B1 chunk only)**

`src/hud/drawer/EngineBody.tsx`:

```tsx
"use client";

import { AccentDot } from "@/components/AccentDot";
import { BuildVisits } from "@/components/build/BuildVisits";
import { DiagramSvg } from "@/components/diagram/DiagramSvg";
import type { RoomBodyProps } from "./bodies";
import { MetricTiles, Sections } from "./blocks";

const PR = "inline-flex min-h-6 items-center px-1 font-mono text-[13px] text-ink-2";

/**
 * B1 Engine Room station drawer (ships in the B1 chunk): the station's own block (diagram, rounds, gates,
 * numbers or the plan excerpt) around the generic sections. Uses only utility classes the site already
 * ships (CSS budget).
 */
export function EngineBody({ view, locale }: RoomBodyProps) {
  const e = view.engine;
  if (!e) return <Sections sections={view.sections} />;
  const l = e.labels;
  return (
    <div className="space-y-6" data-engine-station={e.station}>
      {e.diagram && (
        <figure role="img" aria-label={e.diagram.label} className="card overflow-x-auto p-3">
          <DiagramSvg layout={e.diagram.layout} className="mx-auto block h-auto max-w-full" />
        </figure>
      )}
      {e.tiles && (
        <div className="space-y-3">
          <MetricTiles metrics={e.tiles.map(({ value, label }) => ({ value, label }))} fluid />
          <ul className="grid grid-cols-2 gap-3">
            <li className="card flex flex-col gap-2 p-4" data-tile="uptime">
              <p className="text-xl font-semibold text-ink">{l.hourly}</p>
              <p className="text-[13px] text-ink-3">{l.uptime}</p>
            </li>
            <BuildVisits locale={locale} label={l.visits} />
          </ul>
        </div>
      )}
      <Sections sections={view.sections} />
      {e.gates && (
        <ul className="space-y-4">
          {e.gates.map((g) => (
            <li key={g.id} data-gate={g.id}>
              <p className="flex items-center gap-2 font-semibold text-ink">
                <AccentDot tone={g.required ? "green" : "muted"} glow={g.required} />
                {g.title}
              </p>
              <p className="mt-1 text-sm text-ink-2">{g.text}</p>
              <p className="mt-1 text-sm text-ink">
                <span className="label text-ink-3">{l.budget}</span> {g.budget}
              </p>
              <p className="mt-1 text-[13px] text-ink-3">{g.required ? l.blocksMerge : l.reportsOnly}</p>
            </li>
          ))}
        </ul>
      )}
      {e.rounds && (
        <ol className="space-y-6">
          {e.rounds.map((r) => (
            <li key={r.id}>
              <p className="label flex flex-wrap gap-x-3 text-ink-3">
                <span>{r.heading}</span>
                {r.dates && <span>{r.dates}</span>}
                {r.open && <span className="text-cyan">{l.inProgress}</span>}
              </p>
              <h3 className="mt-1 text-base font-semibold text-ink">{r.title}</h3>
              <p className="mt-2 text-sm text-ink-2">{r.summary}</p>
              {r.count && <p className="mt-3 text-[13px] text-ink-3">{r.count}</p>}
              {r.prs.length > 0 && (
                <ul aria-label={r.listLabel} className="mt-1 flex flex-wrap gap-x-1">
                  {r.prs.map((p) => (
                    <li key={p.n}>
                      {p.href ? (
                        <a href={p.href} target="_blank" rel="noopener noreferrer" className={`${PR} hover:text-cyan`}>{`#${p.n}`}</a>
                      ) : (
                        <span className={PR}>{`#${p.n}`}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {r.shots && (
                <figure className="mt-3 grid grid-cols-2 gap-2">
                  {(["before", "after"] as const).map((key) => (
                    <div key={key}>
                      <p className="label mb-1 text-ink-3">{l[key]}</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.shots![key].src} width={r.shots![key].width} height={r.shots![key].height} alt={r.shots![key].alt} loading="lazy" decoding="async" className="h-auto w-full rounded-md border border-line" />
                    </div>
                  ))}
                  <figcaption className="col-span-2 text-[13px] text-ink-3">{r.shots.caption}</figcaption>
                </figure>
              )}
            </li>
          ))}
        </ol>
      )}
      {e.excerpt && (
        <figure>
          <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-semibold text-ink">{l.excerpt}</span>
            <a href={e.excerpt.href} target="_blank" rel="noopener noreferrer" className="text-sm text-ink-2 hover:text-cyan">
              {l.source}
            </a>
          </figcaption>
          <pre className="card p-3 font-mono text-[13px] whitespace-pre-wrap text-ink-2">
            <code>{e.excerpt.text}</code>
          </pre>
        </figure>
      )}
    </div>
  );
}
```

Before committing, check that every class above already appears somewhere under `src/` (`rg -o --no-filename "class(Name)?=\"[^\"]*\"" src | tr ' "' '\n\n' | sort -u > classes.txt` and compare); replace any that does not with one that does, so the Classic CSS budget (20,480 B) does not move. Delete `classes.txt` afterwards.

`src/experience/floors/chunks/engine.ts`: add `export { EngineBody } from "@/hud/drawer/EngineBody";`.

`src/hud/drawer/bodies.tsx`:

```tsx
const EngineBody = chunkBody(() => floorChunks.load("B1").then((m) => m.EngineBody));
// CHUNK_BODIES:
  engine: EngineBody,
```

`src/experience/Experience.tsx` `hasPage`: add `&& !room.startsWith("B1:")` (B1 rooms keep the floor URL, `/{locale}`, and are remembered in the history entry).

- [x] **Step 7: Run the tests**

Run: `bunx vitest run tests/unit/engine-views.test.ts tests/hud/EngineBody.test.tsx tests/unit/floor-chunks-graph.test.ts tests/unit/room-views.test.ts tests/unit/client-namespaces.test.ts tests/unit/diagram-layout.test.ts tests/unit/post-diagrams.test.ts tests/hud/RoomDrawer.test.tsx`
Expected: PASS.

Run: `bun run typecheck && bun run lint && bun run test && bun run build`
Expected: PASS; `out/data/rooms/en.json` contains `"B1:blueprint"` (`grep -c '"B1:blueprint"' out/data/rooms/en.json` prints at least 1) and `bun scripts/check-client-chunks.ts` (part of the build) reports no zod or content loader in a client chunk.

- [x] **Step 8: Commit**

```bash
git add src/components src/content/room-views src/experience/missions/rooms.ts src/hud/drawer src/experience/floors/chunks/engine.ts src/experience/Experience.tsx tests
git commit -m "feat(b1): station drawers from the build story, linking the Classic /build sections"
```

### Task 6: Machine hum on B1

The ambience system takes one layer per floor (`AMBIENCE_LAYERS`), so B1 gets a low machine hum instead of silence.

**Files:**
- Modify: `src/lib/audio/ambience.ts` (type, list, `createEngineLayer`, `AMBIENCE_LAYERS.B1`), `src/lib/audio/README.md` (layer table row), `src/experience/Experience.tsx` (report every floor again)
- Test: `tests/unit/audio-ambience.test.ts` (runs over `AMBIENCE_FLOORS`, so B1 joins the bounded-notes, cleanup and pentatonic checks)

**Interfaces:**
- Consumes: `createKit`, `lowpass`, `noiseLoop`, `midiToHz`, `Track` (in `ambience.ts`).
- Produces: `AmbienceFloor` adds `"B1"`; `AMBIENCE_FLOORS` ends with `"B1"`; `B1_HUM_MIDI = [36, 43]`.

- [x] **Step 1: Write the failing test**

`tests/unit/audio-ambience.test.ts`:

```ts
  it("has a B1 Engine Room layer: a low C and G hum and relay ticks in the scale", () => {
    expect(AMBIENCE_FLOORS).toContain("B1");
    expect(B1_HUM_MIDI).toEqual([36, 43]);
    expect(typeof AMBIENCE_LAYERS.B1).toBe("function");
  });
```

(import `B1_HUM_MIDI` from `@/lib/audio/ambience`).

- [x] **Step 2: Run it and see it fail**

Run: `bunx vitest run tests/unit/audio-ambience.test.ts`
Expected: FAIL (`B1_HUM_MIDI` is not exported).

- [x] **Step 3: The layer**

`src/lib/audio/ambience.ts`:

```ts
export type AmbienceFloor = "L1" | "L2" | "L3" | "L4" | "RF" | "B1";
export const AMBIENCE_FLOORS: readonly AmbienceFloor[] = ["L1", "L2", "L3", "L4", "RF", "B1"];
// (update the module comment: "... wind and a distant radio beacon (RF), a low machine hum (B1).")

/* B1 Engine Room: a low machine hum. Two detuned sawtooth pairs on C2 and G2 under a 180 Hz lowpass (a slow beat),
an air handling bed of band-passed noise, and a soft relay tick on G5 every 3 to 6 s. */

/** C2 and G2: low, inside the pentatonic scale. */
export const B1_HUM_MIDI = [36, 43] as const;
const B1_HUM_LEVEL = 0.05;
const B1_AIR_LEVEL = 0.03;
const B1_TICK_PEAK = 0.025;
const B1_TICK_HZ = midiToHz(79);

function createEngineLayer(ctx: BaseAudioContext, destination: AudioNode, random: () => number = Math.random): AmbienceLayer {
  const kit = createKit(ctx, destination, random);

  const low = lowpass(kit, 180, 0.9);
  const hum = ctx.createGain();
  hum.gain.setValueAtTime(B1_HUM_LEVEL, kit.t);
  low.connect(hum).connect(kit.output);
  kit.fixed(low, hum);
  for (const midi of B1_HUM_MIDI) {
    for (const cents of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(midiToHz(midi), kit.t);
      osc.detune.setValueAtTime(cents, kit.t);
      osc.connect(low);
      osc.start(kit.t);
      kit.loop(osc);
    }
  }

  const air = noiseLoop(kit);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.setValueAtTime(320, kit.t);
  band.Q.setValueAtTime(0.8, kit.t);
  const airGain = ctx.createGain();
  airGain.gain.setValueAtTime(B1_AIR_LEVEL, kit.t);
  air.connect(band).connect(airGain).connect(kit.output);
  kit.fixed(band, airGain);

  const relay: Track = {
    delay: kit.range(1, 3),
    step(when) {
      const end = when + 0.09;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(B1_TICK_HZ, when);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(B1_TICK_PEAK, when + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(kit.output);
      osc.start(when);
      osc.stop(end + 0.02);
      kit.note([osc], [osc, gain]);
      return kit.range(3, 6);
    },
  };

  return kit.run([relay]);
}
// AMBIENCE_LAYERS gains:  B1: createEngineLayer,
```

`src/experience/Experience.tsx`: back to `audio.setFloor(s.floor)` at both call sites (every floor has a layer); drop the `isPublicFloor` import if unused.

`src/lib/audio/README.md`: add the row `| B1 Engine Room | Machine hum | Two detuned sawtooth pairs on C2 and G2 under a 180 Hz lowpass, a band-passed noise bed as air handling, and a soft G5 relay tick every 3 to 6 s |` and "(`\"L1\"` to `\"RF\"`, and `\"B1\"`)" in the `setFloor` row.

- [x] **Step 4: Run the tests**

Run: `bunx vitest run tests/unit/audio-ambience.test.ts tests/unit/audio.test.ts`
Expected: PASS (B1 included in the bounded-notes, cleanup and pentatonic checks).

Run: `bun run typecheck && bun run lint && bun run test`
Expected: PASS.

- [x] **Step 5: Listen once** (`bun run dev`, open `/en?unlock=b1`, sound and Floor ambience on, ride to B1): the hum sits under the music like the other layers; if it is louder, lower `B1_HUM_LEVEL` in steps of 0.01.

- [x] **Step 6: Commit**

```bash
git add src/lib/audio src/experience/Experience.tsx tests/unit/audio-ambience.test.ts
git commit -m "feat(audio): B1 Engine Room machine hum ambience layer"
```

### Task 7: End-to-end tests for the floor

**Files:**
- Create: `e2e/b1.ts`, `e2e/engine-room.spec.ts`
- Modify: `e2e/budgets.ts` (the two B1 caps, so the settled-cap test has its number), `e2e/memory.spec.ts` (a B1 round-trip gate), `scripts/e2e-plan.ts` (`ALL_SPECS`, a rule), `tests/unit/e2e-plan.test.ts`
- Test: the specs themselves

**Interfaces:**
- Consumes: `asReturningVisitor`, `collectErrors`, `expectRenderBudget`, `snapshot`, `targetPoint`, `visibleTarget`, `waitForCameraSettle`, `waitForFloor`, `waitForHQ`, `waitForPhase`, `waitForRoom`, `waitForSceneLive`, `readSettledGpuCounters`, `readJsHeapAfterGc`, `expectNoGpuGrowth`, `chooseMotion` (`e2e/hq.ts`); `FLOOR_SCENE_CAPS`, `GPU_MEMORY_BUDGET` (`e2e/budgets.ts`; Task 8 adds `B1`); `ENGINE`, `ENGINE_STATIONS` (Task 1); `ARRIVAL_HEADING` (`src/experience/camera/arrival.ts`).
- Produces (`e2e/b1.ts`, used by Task 8, Task 9 and PR 3): `B1_QUERY = "unlock=b1&debug=1"`, `enterB1Route(page: Page, path?: string, tier?: string): Promise<void>`, `rideTo(page: Page, floor: string): Promise<void>`; `FLOOR_SCENE_CAPS.B1 = 100`, `BYTES_3D_BUDGET.floors.B1 = 16 * 1024`, `BYTES_3D_BUDGET.sessionFloors = ["L3", "L4", "RF"]`.

- [x] **Step 1: Helpers and the B1 budget numbers**

`e2e/budgets.ts` (owner-approved by the spec: "floor chunk cap about 16 KB gzip"; decision: "a FLOOR_SCENE_CAPS entry for B1 at or below 100"):

```ts
/** Tighter caps on settled scene calls (inclusive): L1 is the densest floor, RF stays light, B1 is mostly instanced. */
export const FLOOR_SCENE_CAPS: Readonly<Record<string, number>> = { L1: 125, RF: 79, B1: 100 };
// BYTES_3D_BUDGET:
  floors: { L3: 20 * 1024, L4: 16 * 1024, RF: 8 * 1024, B1: 16 * 1024 },
  /** Floor chunks every session loads (idle prefetch): the session total counts these. B1 loads only for unlocked visitors. */
  sessionFloors: ["L3", "L4", "RF"],
```

and extend the `BYTES_3D_BUDGET` comment: "B1 is measured after RF, so modules it shares with RF (the roof kit) count toward RF, and it is left out of the session total."


`e2e/b1.ts`:

```ts
import type { Page } from "@playwright/test";
import { asReturningVisitor, waitForFloor, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";

/** The dev and test unlock: `?unlock=b1` is honoured in a production build only with `debug` (src/experience/b1.ts). */
export const B1_QUERY = "unlock=b1&debug=1";

type StoreWindow = Window & { __hq: { store: { getState: () => { goToFloor: (floor: string) => void } } } };

/** Opens a floor route as a returning visitor with B1 unlocked for this session, and waits for explore. */
export async function enterB1Route(page: Page, path = "/en", tier = "lite") {
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=${tier}&${B1_QUERY}`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

/** Calls the elevator to `floor` through the store and waits for the arrival (`waitForFloor` follows the ride). */
export async function rideTo(page: Page, floor: string) {
  await page.evaluate((f) => (window as unknown as StoreWindow).__hq.store.getState().goToFloor(f), floor);
  await waitForFloor(page, floor, 90_000);
}
```

- [x] **Step 2: The spec**

`e2e/engine-room.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { ARRIVAL_HEADING } from "../src/experience/camera/arrival";
import { ENGINE, ENGINE_STATIONS } from "../src/experience/floors/engine/layout";
import { B1_QUERY, enterB1Route, rideTo } from "./b1";
import { FLOOR_SCENE_CAPS } from "./budgets";
import { collectErrors, enterHQ, expectRenderBudget, snapshot, targetPoint, visibleTarget, waitForCameraSettle, waitForFloor, waitForHQ, waitForPhase, waitForRoom } from "./hq";

/**
 * B1 Engine Room, PR 2: the floor exists only for sessions unlocked with the dev and test flag; rides from the
 * Lobby and the roof, the arrival, the drawers, the minimap and the render budget. Waits are on state.
 */
test.describe.configure({ timeout: 240_000 });

type Probe = Window & {
  __hq: {
    store: { getState: () => { floor: string; ride: unknown; goToFloor: (f: string) => void; openRoom: (r: string) => void; closeRoom: () => void } };
    rover: { x: number; z: number; heading: number; cameraBehind: number };
    floorChunks: { state: (id: string) => string };
    sky: { underground: boolean };
    audio: () => { floor: string | null };
  };
};
/** One read of the live probes (the page's CSP forbids eval, so no serialized callbacks). */
const probe = (page: Page) =>
  page.evaluate(() => {
    const h = (window as unknown as Probe).__hq;
    const s = h.store.getState();
    return {
      floor: s.floor,
      ride: s.ride,
      rover: { x: h.rover.x, z: h.rover.z, heading: h.rover.heading, behind: h.rover.cameraBehind },
      chunks: { L3: h.floorChunks.state("L3"), B1: h.floorChunks.state("B1") },
      underground: h.sky.underground,
      ambience: h.audio().floor,
    };
  });
const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const elevator = (page: Page) => page.getByRole("navigation", { name: "Elevator" });

test("without the unlock flag nothing of B1 shows, loads or rides", async ({ page }) => {
  const errors = collectErrors(page);
  await enterHQ(page);
  await expect(elevator(page).locator("[data-floor]")).toHaveCount(5);
  await expect(elevator(page).locator('[data-floor="B1"]')).toHaveCount(0);
  // Idle prefetch has run once L3 is ready; B1 must still be untouched.
  await expect.poll(async () => (await probe(page)).chunks.L3, { timeout: 60_000 }).toBe("ready");
  expect((await probe(page)).chunks.B1).toBe("idle");
  await page.evaluate(() => (window as unknown as Probe).__hq.store.getState().goToFloor("B1"));
  expect((await probe(page)).ride).toBeNull();
  expect(errors).toEqual([]);
});

test("?unlock=b1 without debug is ignored in a production build", async ({ page }) => {
  await enterHQ(page, { path: "/en", tier: "lite" });
  await page.goto("/en?tier=lite&unlock=b1");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await expect(elevator(page).locator('[data-floor="B1"]')).toHaveCount(0);
});

test("rides from the Lobby to B1: the rover glides out facing the workbench, underground, with the hum, on the Lobby URL", async ({ page }) => {
  const errors = collectErrors(page);
  await enterB1Route(page);
  await expect(elevator(page).locator("[data-floor]").last()).toHaveAttribute("data-floor", "B1");
  await elevator(page).locator('[data-floor="B1"]').click();
  await waitForFloor(page, "B1", 90_000);
  await expect.poll(async () => {
    const { rover } = await probe(page);
    return Math.hypot(rover.x - ENGINE.arrival.x, rover.z - ENGINE.arrival.z);
  }, { timeout: 60_000 }).toBeLessThan(1.5);
  await waitForCameraSettle(page);
  const p = await probe(page);
  expect(angleGap(p.rover.heading, ARRIVAL_HEADING)).toBeLessThan(0.1);
  expect(angleGap(p.rover.behind, ARRIVAL_HEADING)).toBeLessThan(0.1);
  expect(p.underground).toBe(true);
  expect(p.ambience).toBe("B1");
  expect(p.chunks.B1).toBe("ready");
  await expect(page).toHaveURL(new RegExp(`/en\\?tier=lite&${B1_QUERY}$`));
  await expect(page.getByTestId("minimap")).toHaveAttribute("data-floor", "B1");
  expect(errors).toEqual([]);
});

test("settled on B1 the frame stays under its scene cap", async ({ page }) => {
  await enterB1Route(page);
  await rideTo(page, "B1");
  await waitForCameraSettle(page);
  const peaks = await expectRenderBudget(page);
  expect(peaks.sceneCalls).toBeLessThanOrEqual(FLOOR_SCENE_CAPS.B1);
});

test("every station opens its drawer with its body and a Classic link to its /build section; a click on a station drives there", async ({ page }) => {
  await enterB1Route(page);
  await rideTo(page, "B1");
  for (const id of ENGINE_STATIONS) {
    await page.evaluate((r) => (window as unknown as Probe).__hq.store.getState().openRoom(r), `B1:${id}`);
    await waitForRoom(page, `B1:${id}`);
    const drawer = page.getByTestId("room-drawer");
    await expect(drawer.locator(`[data-engine-station="${id}"]`)).toBeVisible();
    await expect(drawer.locator(`a[href$="/build#${id}"]`).first()).toBeAttached();
    await page.evaluate(() => (window as unknown as Probe).__hq.store.getState().closeRoom());
  }
  await waitForCameraSettle(page);
  const target = await visibleTarget(page, { kinds: ["station"], minDistance: 2 });
  const point = await targetPoint(page, target.id);
  await page.mouse.click(point.x, point.y);
  await waitForRoom(page, `B1:${target.id.split(":").at(-1)}`);
});

test("rides from the roof down to B1 and back up to the Lobby", async ({ page }) => {
  const errors = collectErrors(page);
  await enterB1Route(page);
  await rideTo(page, "RF");
  await rideTo(page, "B1");
  expect((await snapshot(page)).floor).toBe("B1");
  await rideTo(page, "L1");
  expect((await snapshot(page)).floor).toBe("L1");
  expect(errors).toEqual([]);
});
```

- [x] **Step 3: The memory gate for B1 rides**

`e2e/memory.spec.ts`, a third test using the same reduced-motion setup:

```ts
import { enterB1Route } from "./b1";
// ...
test("Lobby to B1 round trips leave renderer memory at its baseline", async ({ page }) => {
  await enterB1Route(page);
  await ride(page, "B1");
  await ride(page, "L1");
  await readSettledGpuCounters(page);
  await ride(page, "B1");
  await ride(page, "L1");
  const base = await readSettledGpuCounters(page);
  const heapBase = await readJsHeapAfterGc(page);
  for (let i = 0; i < TRIPS; i++) {
    await ride(page, "B1");
    await ride(page, "L1");
  }
  const after = await readSettledGpuCounters(page);
  expectNoGpuGrowth(base, after, GPU_MEMORY_BUDGET, "B1 round trips");
  expect((await readJsHeapAfterGc(page)) - heapBase).toBeLessThan(HEAP_SLACK);
});
```

- [x] **Step 4: Plan rules**

`scripts/e2e-plan.ts`: add `"engine-room"` to `ALL_SPECS` (alphabetical), and before the floor chunk rule (`^src\/experience\/floors\/(floorChunks|...)`) add:

```ts
  // B1 Engine Room (PR 2): the floor, its layout, chunk, drawers, unlock flag and rows.
  { test: /^src\/experience\/floors\/engine\/layout\.ts$/, specs: ["engine-room", "arrivals", "memory"] },
  { test: /^src\/experience\/floors\/(engine\/|EngineRoom\.tsx$|chunks\/engine\.ts$)|^src\/hud\/drawer\/EngineBody\.tsx$|^src\/content\/room-views\/engine\.ts$|^src\/experience\/b1\.ts$|^src\/hud\/floorRows\.ts$|^e2e\/b1\.ts$/, specs: ["engine-room", "floor-chunks", "memory"] },
```

`tests/unit/e2e-plan.test.ts`:

```ts
  it("maps the B1 Engine Room files to its spec", () => {
    expect(specsForChanges(["src/experience/floors/engine/scenery.ts"]).specs).toEqual(expect.arrayContaining(["engine-room", "floor-chunks"]));
    expect(specsForChanges(["src/experience/floors/engine/layout.ts"]).specs).toEqual(expect.arrayContaining(["engine-room", "arrivals"]));
  });
```

- [x] **Step 5: Run**

Run: `bunx vitest run tests/unit/e2e-plan.test.ts` (PASS), then `bun run build` and `E2E_PORT=4433 bunx playwright test e2e/engine-room.spec.ts e2e/memory.spec.ts`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add e2e/b1.ts e2e/engine-room.spec.ts e2e/memory.spec.ts e2e/budgets.ts scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts
git commit -m "test(b1): e2e for the Engine Room floor, its rides, drawers and memory"
```

### Task 8: Budgets, the perf lane and the program baseline

**Files:**
- Modify: `e2e/perf/bytes-3d.spec.ts`, `e2e/perf/floors.spec.ts`, `e2e/perf/peaks.spec.ts`, `e2e/perf/baseline.json` (generated), `scripts/perf-report.ts`
- Test: the perf lane (`PERF=1`)

**Interfaces:**
- Consumes: `enterB1Route`, `rideTo` (Task 7).
- Produces: baseline entries `programs.lite.B1` and `programs.full.B1`; the bytes gate's session total over `BYTES_3D_BUDGET.sessionFloors`.

- [x] **Step 1: The numbers** are in `e2e/budgets.ts` since Task 7 (`FLOOR_SCENE_CAPS.B1` 100, `BYTES_3D_BUDGET.floors.B1` 16 KB, `sessionFloors`); this task makes the perf lane use them.

- [x] **Step 2: Bytes gate: B1 capped on its own, not in the session total**

`e2e/perf/bytes-3d.spec.ts`: the floor loop already runs over `Object.keys(BYTES_3D_BUDGET.floors)` (B1 last). Replace the session sum:

```ts
    const sessionFloors = new Set<string>(BYTES_3D_BUDGET.sessionFloors);
    const floorsTotal = Object.entries(floors).filter(([f]) => sessionFloors.has(f)).reduce((n, [, bytes]) => n + bytes, 0);
```

and the log line's "floor chunks" with "public floor chunks". `scripts/perf-report.ts`: type `floors?: Partial<Record<keyof typeof BYTES_3D_BUDGET.floors, number>>` and the sentence "Session total with every public floor chunk".

- [x] **Step 3: Settled B1 in `floors.spec.ts`**

Move the body of the per-floor test into `async function measureFloor(page: Page, tier: "lite" | "full", floor: string)` (everything after `enterFloorRoute`), keep the loop calling it, and add:

```ts
import { enterB1Route, rideTo } from "../b1";
// ...
for (const tier of ["lite", "full"] as const) {
  test(`B1 ${tier}: settled draw calls and shader programs`, async ({ page }) => {
    // B1 has no route: unlock it on the Lobby and ride down (its baseline includes the Lobby's programs).
    await enterB1Route(page, "/en", tier);
    await rideTo(page, "B1");
    await measureFloor(page, tier, "B1");
  });
}
```

- [x] **Step 4: Ride peaks to B1 in `peaks.spec.ts`**

```ts
import { enterB1Route } from "../b1";
// RIDES gains:
  { tier: "lite", from: "L1", to: "B1" },
  { tier: "lite", from: "RF", to: "B1" },
  { tier: "full", from: "L1", to: "B1" },
  { tier: "full", from: "RF", to: "B1" },
// in the ride test, replace `await enterFloorRoute(page, ROUTE[from], { tier });` with:
    if (to === "B1") await enterB1Route(page, ROUTE[from], tier);
    else await enterFloorRoute(page, ROUTE[from], { tier });
```

- [x] **Step 5: Measure** (one run at a time on this machine; build first)

```bash
bun run build
E2E_PORT=4433 bun run e2e:perf e2e/perf/bytes-3d.spec.ts
E2E_PORT=4433 bun run e2e:perf e2e/perf/floors.spec.ts -g "B1"
bun scripts/perf-summary.ts baseline --head perf-report --write e2e/perf/baseline.json
E2E_PORT=4433 bun run e2e:perf e2e/perf/floors.spec.ts
E2E_PORT=4433 bun run e2e:perf e2e/perf/peaks.spec.ts -g "to B1"
E2E_PORT=4433 bun run e2e:perf e2e/perf/peaks.spec.ts
E2E_PORT=4433 bun run e2e:perf e2e/perf/memory-full.spec.ts
```

Expected: B1 chunk under 16 KB gzip on both tiers; main path and session totals unchanged from main within 2 KB (the B1 layout, the flag and the rows are the only main-path additions); B1 settled under 100 scene calls and 30k triangles on both tiers; the regenerated baseline adds only `B1` (every other floor's count unchanged; if one moved, find out why before committing); B1 rides under 150 scene calls, 20 post passes and 30k triangles; the full-tier memory gate passes. If B1 is over 100 scene calls, merge more of the scenery (fold the panel instances into the flow draw) rather than raising the cap. Record every number in the PR text.

- [x] **Step 6: Commit**

```bash
git add e2e/perf scripts/perf-report.ts
git commit -m "test(b1): B1 chunk and scene caps, ride peaks and the program baseline"
```

### Task 9: Look-preserving check and the owner's captures

Locked sessions must look exactly like main, and the owner reviews B1 before PR 2 merges (spec section 7).

**Files:**
- Create: `scripts/b1-shots.ts`
- Test: the strict visual gate; the script's output under `screenshots/b1/` (gitignored by `/screenshots/`)

**Interfaces:**
- Consumes: `B1_QUERY` (Task 7), `__hq` probes, `ENGINE_STATIONS`.
- Produces: `bun scripts/b1-shots.ts --base <url> --out <dir> [--only floor]`; files `<dir>/<name>-<w>x<h>.png` for `arrival`, `aisle`, `station-<id>` (PR 3 adds `locked-row`, `unlock-moment`, `unlocked-row` behind `--only unlock`).

- [x] **Step 1: The visual gate against main** (no B1 pixels for a locked visitor)

Run: `E2E_PORT=4433 bun scripts/visual-gate.ts --base origin/main --profile strict`
Expected: PASS 48/48. A failing pose means something of B1 leaked into a locked session (the shaft, the tower frame, a slab, the sky): fix it, do not loosen the profile.

- [x] **Step 2: The capture script**

`scripts/b1-shots.ts`:

```ts
#!/usr/bin/env bun
/**
 * B1 Engine Room captures for the owner's review (spec section 7): the arrival, the aisle and each station's
 * drawer at 1440x900 (full tier) and 390x844 (lite), on a served export, unlocked with the dev and test flag.
 * PR 3 adds the locked row and the unlock moment (`--only unlock`). SwiftShader WebGL.
 *
 *   bun scripts/serve-static.ts --port 4300 --dir out &
 *   bun scripts/b1-shots.ts --base http://127.0.0.1:4300 --out screenshots/b1
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { B1_QUERY } from "../e2e/b1";
import { ENGINE_STATIONS } from "../src/experience/floors/engine/layout";

const VIEWPORTS = [
  { width: 1440, height: 900, tier: "full" },
  { width: 390, height: 844, tier: "lite" },
] as const;

type HQ = {
  store: { getState: () => { floor: string; ride: unknown; phase: string; goToFloor: (f: string) => void; openRoom: (r: string) => void; closeRoom: () => void } };
  rover: { x: number; z: number; speed: number; driving: boolean; drawCalls: number; autopilot: { point: { x: number; z: number }; state: string } | null };
  camera: () => [number, number, number];
  layouts: Record<string, { arrival?: { x: number; z: number }; doors?: { room: string; at: { x: number; z: number } }[] }>;
};

let base = "http://127.0.0.1:4300";
let out = "screenshots/b1";
let only: "floor" | "unlock" | "all" = "all";
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--base") base = argv[++i];
  else if (argv[i] === "--out") out = argv[++i];
  else if (argv[i] === "--only") only = argv[++i] as typeof only;
}
mkdirSync(out, { recursive: true });

async function settle(page: Page) {
  await page.waitForFunction(() => {
    const h = (window as unknown as { __hq: HQ }).__hq;
    const s = h.store.getState();
    return s.ride === null && s.phase !== "elevator" && !h.rover.driving && h.rover.speed < 0.2;
  }, null, { timeout: 120_000 });
  for (let i = 0; i < 40; i++) {
    const a = await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.camera());
    await page.waitForTimeout(600);
    const b = await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.camera());
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.03) return;
  }
}

async function driveTo(page: Page, point: { x: number; z: number }) {
  await page.evaluate((p) => ((window as unknown as { __hq: HQ }).__hq.rover.autopilot = { point: p, state: "pending" }), point);
  await page.waitForFunction(() => {
    const r = (window as unknown as { __hq: HQ }).__hq.rover;
    return r.autopilot?.state !== "pending" && r.autopilot?.state !== "driving" && r.speed < 0.5;
  }, null, { timeout: 120_000 });
  await settle(page);
}

const shot = (page: Page, name: string, vp: { width: number; height: number }) => page.screenshot({ path: join(out, `${name}-${vp.width}x${vp.height}.png`) });

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.width < 1000, isMobile: vp.width < 600 });
    await context.addInitScript(() => {
      localStorage.setItem("hq:terminal-seen", "1");
      localStorage.setItem("hq:onboarded", "done");
      localStorage.setItem("hq:hints", "off");
      localStorage.setItem("hq:floor-intro", JSON.stringify(["L1", "L2", "L3", "L4", "RF"]));
      sessionStorage.setItem("hq:intro", "seen");
    });
    if (only !== "unlock") {
      const page = await context.newPage();
      await page.goto(`${base}/en?tier=${vp.tier}&${B1_QUERY}`);
      await page.waitForFunction(() => ((window as unknown as { __hq?: HQ }).__hq?.rover.drawCalls ?? 0) > 0 && !document.documentElement.hasAttribute("data-hq-boot"), null, { timeout: 180_000 });
      await settle(page);
      await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.store.getState().goToFloor("B1"));
      await page.waitForFunction(() => (window as unknown as { __hq: HQ }).__hq.store.getState().floor === "B1", null, { timeout: 120_000 });
      await settle(page);
      await shot(page, "arrival", vp);
      await driveTo(page, { x: 12, z: 0 });
      await shot(page, "aisle", vp);
      const doors = await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.layouts.B1.doors ?? []);
      for (const id of ENGINE_STATIONS) {
        const door = doors.find((d) => d.room === `B1:${id}`)!;
        await driveTo(page, door.at);
        await page.evaluate((r) => (window as unknown as { __hq: HQ }).__hq.store.getState().openRoom(r), `B1:${id}`);
        await page.locator(`[data-testid="room-drawer"] [data-engine-station="${id}"]`).waitFor({ timeout: 60_000 });
        await page.evaluate(() => document.fonts.ready);
        await shot(page, `station-${id}`, vp);
        await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.store.getState().closeRoom());
      }
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}
```

- [x] **Step 3: Capture and hand over**

```bash
bun run build
bun scripts/serve-static.ts --port 4300 --dir out &
bun scripts/b1-shots.ts --base http://127.0.0.1:4300 --out screenshots/b1
```

Stop the server (`kill <pid>`). Expected: 14 PNGs (arrival, aisle, five stations, two sizes). Send them to the coordinator; the owner reviews them together with PR 3's locked row and unlock moment, captured from the PR 3 branch stacked on this one.

- [x] **Step 4: Commit**

```bash
git add scripts/b1-shots.ts
git commit -m "chore(b1): capture script for the owner's B1 review"
```

### Task 10: Docs, full verification and the PR

**Files:**
- Create: `docs/agents/floor-b1-engine-room.md`
- Modify: `docs/features.md`, `docs/agents/floors.md`, `docs/agents/3d-experience.md`, `docs/agents/hud-and-drawer.md`, `docs/agents/performance.md`, `docs/agents/content.md`, `AGENTS.md`, `docs/superpowers/README.md`, this plan (status line)

- [x] **Step 1: Current-state docs** (no history in `docs/agents/`)

- `docs/agents/floor-b1-engine-room.md` (new, same shape as `floor-rf-roof.md`): Layout (`ENGINE`, seven bays alternating north and south from x -10 in 7 u steps, stations 1 to 5 lit, bays 6 and 7 dark, rack rows in the wall gaps, the workbench flush with the east edge, the call pad area, the Return pad at (40, 9), arrival (-12, 0) with `B1:arrival`, one zone per station and `B1:workbench`); Scenery (one merged solid mesh and its edges from the roof kit, `FlowMesh` on holo `strip` for pipes, trays, drops, front strips and rack LEDs, `PanelMesh` on holo `fall` for the screens, `FloatingSigns` for bay names, Coming soon plates and the workbench title; lite draws half the LEDs; reduced motion freezes `uTime`); Drawers (`B1:<station>` views from `room-views/engine.ts`, `EngineBody` in the B1 chunk, links to `/build#<station>`); Access (only `b1Unlocked`, set in PR 2 by `?unlock=b1`, in production with `debug`); Draw calls (measured numbers from Task 8, cap 100); Sky and sound (no dome underground, machine hum layer).
- `docs/agents/floors.md`: per-floor file list adds B1; Ready floors lists `["B1", "L1", "L2", "L3", "L4", "RF"]` and says B1 has no route (URL `/{locale}`, Classic counterpart `/build`); Arrival list adds "B1 (-12, 0)"; the floor chunk table gains `| B1 | EngineRoom, EngineBody |`; the rule "Never import `Labs`, `Library`, `Roof`, `EngineRoom` or those HUD pieces statically"; prefetch: "B1 only once unlocked (idle, picker, call pad hover)"; Return pad table adds B1; point-and-go ids add `B1:station:<station>`; "Probes, tests and sizes" adds the B1 chunk size from Task 8.
- `docs/agents/3d-experience.md`: floor order `FLOOR_IDS` (B1 first) and `floorY` relative to L1; `PUBLIC_FLOORS` and `towerFloors`; the shaft span; store table rows `b1Unlocked` / `unlockB1()` (not persisted in this PR); "Day and night": no sky while `underground(roverY)`, night held, probe `__hq.sky.underground`; "Floor mounting": locked sessions mount nothing of B1.
- `docs/agents/hud-and-drawer.md`: elevator rows come from `floorRows` (B1 below L1 once unlocked); Custom bodies table row `| engine | EngineBody: ... |`; the minimap shows B1 when the rover is there.
- `docs/agents/performance.md`: floor chunk caps add B1 16 KB; session total counts `BYTES_3D_BUDGET.sessionFloors`; `FLOOR_SCENE_CAPS` B1 100; perf lane B1 entries (floors, peaks `-g "to B1"`); `e2e:changed` table row for the B1 files.
- `docs/agents/content.md`: the build story also feeds the B1 drawers (`buildEngineViews`) and `ExperienceData.engine` (`buildEngineData`).
- `docs/features.md`: a "B1 Engine Room" section (what the floor shows, how it is reached in this PR: not yet for visitors) and a status row "B1 Engine Room floor | Round 9 (PR 2 of 3): the floor, stations and drawers, reachable only with the dev and test flag until PR 3 | In review"; the `/build` route line says its 3D counterpart is the B1 Engine Room.
- `AGENTS.md`: budgets table rows become "L3 20 KB, L4 16 KB, RF 8 KB, B1 16 KB gzip" and "under 150 (L1 125, RF 79, B1 100)"; the session total row says "(main path plus the public floor chunks)"; the Floor chunks rule adds `EngineRoom`; the detail docs table adds `floor-b1-engine-room.md`. Run `bunx vitest run tests/unit/agents-md.test.ts` (size and line limits).
- `docs/superpowers/README.md`: a row `| [B1 Engine Room, PR 2: The Floor Implementation Plan](plans/2026-10-17-b1-engine-room-floor.md) | in review | [#<this PR>](https://github.com/ShinyQ/ShinyQ-HQ/pull/<this PR>) |` and the count line (plans +1, in review +1; the PR 3 plan's row comes with PR 3).
- `docs/decisions.md`: no new row unless the owner states a new decision in the capture review; then one dated row in the existing format, quoting the owner.
- This plan: status line "Status: in review (PR 2 of 3)" and tick the boxes.

- [x] **Step 2: Verify**

```bash
bun run verify:quick
bun run e2e:changed
```

Expected: green. Then `grep -rn $'\u2014' docs src e2e scripts messages content` prints nothing.

- [ ] **Step 3: Push and open the PR** (one CI run at a time)

```bash
gh run list -R ShinyQ/ShinyQ-HQ -s in_progress
gh run list -R ShinyQ/ShinyQ-HQ -s queued
```

When both are empty: push and open the PR "feat(b1): the B1 Engine Room floor, stations and drawers (PR 2 of 3)" with the measured numbers (chunk, main path, session, scene calls, triangles, programs, ride peaks), the visual gate result, and a note that the owner reviews the captures (sent with PR 3's) before merge. Do not merge without the owner.
