# Agent Office on L1, part 3: the 3D Office Implementation Plan

Status: in review

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build section 4.1 of the Agent Office design on L1: one curved console row of five desks with five office Rovers and a screen wall on the south plaza strip, live states from `/api/office` (nine states with distinct faces, poses and screens), HTML chips over the Rovers, a drawer per Rover plus the summary and GitHub drawers, a Rover menu entry, all in a lazy chunk that is not on the first-frame path, inside the L1 draw-call, program, memory and byte budgets, with captures for the owner.

**Architecture:** Pure layout constants live on the main path (`floors/lobby/officeLayout.ts`): `buildFloorLayouts` turns them into L1 obstacles, a camera column, room stops and the `L1:office` view zone, and a tiny `OfficeMount` always draws the furniture shell (desks, legs, trays, wall frame: 2 calls on programs L1 already has) so the navgrid never holds an invisible desk. Everything live (Rovers, faces and desk screens in one canvas atlas, glow, the screen wall, polling, chips, drawer bodies, point-and-go targets) is the lazy office chunk (`floors/lobby/office/scene.ts`), loaded by `office/chunk.ts` after the first frame on idle when the rover is on L1 near the office, or when an office drawer opens. The shared client modules `src/lib/office/poll.ts` and `src/lib/office/model.ts` (no React, no three) are reused by the PR 4 Classic card. The HUD mounts the chunk's chips only once it is loaded (`hud/OfficeLayer.tsx`), and drawer bodies go through `lazyFromChunk` like the floor chunk bodies.

**Tech Stack:** Next.js 16 static export, React Three Fiber 9, three 0.186, Zustand, next-intl 4, Vitest 5 (node and jsdom), Playwright 1.64 (SwiftShader), Bun.

## Global Constraints

- Scope: spec section 4.1 only (PR 3 of 4). PR 1 (`src/lib/office/protocol.ts`, `src/lib/office/fixtures.ts`, `GET /api/office`) and PR 2 (local relay) are merged first; PR 4 adds the Classic home card (`/#office`) and the Ask note.
- Geometry: arc centre (3.5, 10), desk radius 8, Rover radius 9.2, desk angles -51.3, -25.65, 0, 25.65, 51.3 degrees from +z toward +x (slot 0 west), desk 2.6 x 0.9 u with its top at y 0.95, wall 17 x 4 u (bottom y 0.6, frame 0.2, thickness 0.3) centred at x 3.5 with its plane at z 20.7 facing north, stop (3.5, 14.2); the slab is not extended (`LOBBY.bounds.maxZ` 21).
- Clearances (unit tested): west Rover edge at least 3 u east of `kioskRect().maxX` (computed -8.35, gap 3.67); east Rover edge at least 2 u west of `HALL.lead[0]` (14, 15) (gap 2.32); stop at least 2 u in front of the middle desk (3.35); wall face at least 0.2 u behind the middle Rover (0.35); every office obstacle more than 1 u from every other L1 obstacle.
- Space-rule exception (owner approval pending): the office breaks the 6 u `SPACE_RULES` (desk gaps 0.1 to 4.2 u, 3.89 u to the kiosk, 2.32 u to the hall lead road whose half width is 4 u); `tests/unit/highlights-layout.test.ts` checks the Lobby without the office obstacles and `tests/unit/lobby-office.test.ts` checks the office's own rules.
- Draw calls: the office adds 7 scene calls (cap 12): shell solids, shell edges, Rover parts, treads, faces and desk screens, glow, screen wall; L1 stays at or under `FLOOR_SCENE_CAPS.L1` 125 (86 full, 84 lite at the spawn before this PR).
- Programs: zero new shader programs planned (standard non-instanced, line basic, instanced standard with `alphaHash`, basic with a map and `alphaHash`, instanced holo); the floors gate allows `e2e/perf/baseline.json` plus 2 (`PROGRAM_HEADROOM`); any change regenerates the baseline with the reason in the PR.
- Triangles: the office adds about 860 (35 Rover boxes, 20 shell boxes, 10 quads, 90 glow quads, the wall quad); L1 stays under 30,000.
- Bytes (owner approval pending): `BYTES_3D_BUDGET.office` is 14 KB gzip, measured in `bytes-3d` after the session floors, outside `sessionFloors` and the session total; the main-path addition stays under 1.5 KB gzip per tier. Measured at 020c7df3: session headroom 1.9 KB full (468.1 of 470), 2.0 KB lite (444.4 of 446.4); a scratch build of this plan as written measured the office chunk at 12.2 KB both tiers and the main path at +2.5 KB full, +2.4 KB lite (session 470.5 and 446.9, 0.5 KB over), so Task 13's fallbacks or the owner's session-cap raise (Owner actions) are required before merge.
- First frame: `?prefetch=off` never loads the office chunk on its own; it loads only after `afterFirstFrameIdle`, on an office drawer, or through `__hq.office.load()`.
- HTML and CSS: `/en` document stays under 83,968 B with at least 4 KB headroom; no new Tailwind utility classes (inline styles or existing classes only), so the 20,480 B CSS budget does not move.
- Polling (D6): `POLL = { activeMs: 10_000, restingMs: 30_000, idleStopMs: 600_000, keepLastMs: 60_000 }`; in 3D only while the office is in view on L1 (or an office drawer is open) and the tab is visible.
- Privacy (D3): show only protocol fields; a title only when the desk carries one, else "Client project"; never prompt or question text (the input state shows "Waiting for Kurniadi"); repository and GitHub links only for `github.com` URLs that pass a client-side check.
- Copy: every string EN and ID with identical keys; shared keys `office.agent.*`, `office.state.*`, `office.activity.*`, `office.clientProject`, `office.privacy`; 3D-only keys under `office.3d.*`; `office` is in `CLIENT_NAMESPACES`, never `LAYOUT_NAMESPACES`.
- Style: no em dashes anywhere, no client company names, no colored edge stripes (dots only), content stays data, reduced motion holds still poses and crossfades faces and screens.

## File Structure

```
src/lib/office/
  poll.ts                 NEW  shared poller (POLL, createOfficePoller, OfficeFeed)
  model.ts                NEW  shared pure model (officeCounts, deskTitle, STATE_TONE, sinceLabel)
src/experience/floors/lobby/
  officeLayout.ts         NEW  main path: OFFICE constants, slots, obstacles, wall, stops, view zone, shell boxes, room ids
  office/
    chunk.ts              NEW  main path: loadOffice, officeModule, useOfficeModule, officeHandle, officeLoadWanted
    OfficeMount.tsx       NEW  main path: furniture shell, load trigger, mounts OfficeScene once loaded
    scene.ts              NEW  chunk entry: OfficeScene, OfficeChips, OfficeBody, officeTest
    live.ts               NEW  chunk: the 3D poller instance, demand reasons, input wiring, test hooks
    runtime.ts            NEW  chunk: chip elements, anchors, far flags, in-view flag
    officeVisual.ts       NEW  chunk: OFFICE_STATE_STYLE, poses, Rover and desk-screen part sizes
    officeRig.ts          NEW  chunk: three matrices for parts, faces, desk screens, glow, chip anchors
    officeAtlas.ts        NEW  chunk: atlas cells and UVs, face and screen drawing, frame keys
    officeWall.ts         NEW  chunk: wall model and drawing, frame key
    officeModel.ts        NEW  chunk: five Rover views, chip lines, screen input, safe URLs
    interact.ts           NEW  chunk: seven point-and-go targets
    OfficeScene.tsx       NEW  chunk: precompile wrapper, Rovers, wall, watcher
    OfficeChips.tsx       NEW  chunk: HTML chips
    OfficeBody.tsx        NEW  chunk: summary, GitHub and desk drawer bodies
  ../Lobby.tsx            MOD  OfficeMount inside an IntroReveal, LobbyLabels.office
src/experience/config.ts  MOD  L1 obstacles, tall, stops, view zone
src/experience/Experience.tsx MOD  tOffice, rooms.office label, hasPage, __hq.office
src/experience/fx/probes.ts   MOD  sceneProbes.office
src/experience/missions/rooms.ts MOD  RoomKind and StructuralRoom "office", catalog entry
src/content/room-views/types.ts  MOD  RoomView.office
src/content/room-views/lobby.ts  MOD  seven office views
src/hud/OfficeLayer.tsx   NEW  main path: renders the chunk's chips when loaded
src/hud/Hud.tsx           MOD  mounts OfficeLayer
src/hud/drawer/bodies.tsx MOD  CHUNK_BODIES.office
src/i18n/client-messages.ts MOD  "office"
messages/en.json, messages/id.json MOD  hud.rooms.office, office namespace
content/site-content.json MOD  "office" mission
e2e/budgets.ts            MOD  BYTES_3D_BUDGET.office
e2e/perf/bytes-3d.spec.ts MOD  office chunk measurement
e2e/perf/floors.spec.ts   MOD  office settled before L1 and B1, office stop spot
e2e/office-fixtures.ts    NEW  deterministic snapshots (all nine states over two snapshots)
e2e/office.spec.ts        NEW  e2e
scripts/perf-report.ts    MOD  office line
scripts/e2e-plan.ts, scripts/perf-plan.ts MOD  rules
scripts/office-shots.ts   NEW  owner captures
tests/helpers/fake-canvas.ts NEW  recording 2D context
tests/unit/lobby-office.test.ts, office-rooms.test.ts, office-poll.test.ts, office-model.test.ts,
  office-visual.test.ts, office-rig.test.ts, office-atlas.test.ts, office-wall.test.ts,
  office-chunk.test.ts, office-chunk-graph.test.ts, office-interact.test.ts NEW
tests/hud/OfficeChips.test.tsx, tests/hud/OfficeBody.test.tsx NEW
tests/unit/highlights-layout.test.ts, tests/content/dataset.test.ts, tests/unit/e2e-plan.test.ts,
  tests/unit/perf-plan.test.ts, tests/unit/perf-report.test.ts MOD
docs: agents/floor-l1-lobby.md, agents/floors.md, agents/performance.md, agents/hud-and-drawer.md,
  agents/styling-and-i18n.md, agents/folder-layout.md, features.md, README.md (floor guide line), AGENTS.md (budget row),
  decisions/2026-10-19-agent-office-chunk-budget.md, this plan
```

### Task 1: Office layout on L1 (geometry, obstacles, stops, view zone)

**Files:**
- Create: `src/experience/floors/lobby/officeLayout.ts`
- Modify: `src/experience/config.ts`
- Modify: `tests/unit/highlights-layout.test.ts`, `tests/unit/hall-gallery.test.ts`
- Test: `tests/unit/lobby-office.test.ts`

**Interfaces:**
- Consumes: `yawLooking(dir: Vec2): number` (`camera/look.ts`), `ViewZone` (`camera/orbit.ts`), `Box` (`floors/roof/solids.ts`), `Rect`, `Vec2` (`types.ts`), `RoomId` (`@/content/schema`).
- Produces:
  - `type OfficeTranslate = (key: string, values?: Record<string, string | number>) => string`
  - `const OFFICE` (centre, radii, angles, desk, rover, wall, stop, view, loadRadius, slabEdge)
  - `OFFICE_ROOM`, `OFFICE_GITHUB_ROOM`, `officeDeskRoom(slot: number): RoomId`, `OFFICE_ROOMS: readonly RoomId[]`, `isOfficeRoom(room: string | null | undefined): boolean`
  - `interface OfficeSlot { slot: number; theta: number; yaw: number; desk: Vec2; rover: Vec2; rect: Rect }`, `officeSlots(): OfficeSlot[]`
  - `turnedHalf(w: number, d: number, yaw: number): Vec2`, `officeWallRect(): Rect`, `officeObstacles(): Rect[]`, `officeTall(): Rect & { h: number }`, `officeBounds(): Rect`, `officeStops(): Partial<Record<RoomId, Vec2>>`, `officeZone(): ViewZone`, `officeShellBoxes(): Box[]`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/lobby-office.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RoomIdSchema } from "@/content/schema";
import { yawLooking } from "@/experience/camera/look";
import { zoneAt, zoneView } from "@/experience/camera/orbit";
import { buildFloorLayouts, kioskRect, LOBBY, ROVER } from "@/experience/config";
import { HALL } from "@/experience/floors/lobby/hallLayout";
import {
  isOfficeRoom,
  OFFICE,
  OFFICE_ROOMS,
  officeBounds,
  officeDeskRoom,
  officeObstacles,
  officeShellBoxes,
  officeSlots,
  officeTall,
  officeWallRect,
  turnedHalf,
} from "@/experience/floors/lobby/officeLayout";
import { buildNavGrid, findPath, isWalkable } from "@/experience/nav/navgrid";
import { rectGap, wideGrid } from "@/experience/nav/space";
import type { Rect } from "@/experience/types";

const l1 = buildFloorLayouts(8).L1;
const slots = officeSlots();
const same = (a: Rect, b: Rect) => a.minX === b.minX && a.maxX === b.maxX && a.minZ === b.minZ && a.maxZ === b.maxZ;
const inside = (r: Rect, b: Rect) => r.minX >= b.minX - 1e-9 && r.maxX <= b.maxX + 1e-9 && r.minZ >= b.minZ - 1e-9 && r.maxZ <= b.maxZ + 1e-9;

describe("Agent Office layout (owner decisions D1 and D7)", () => {
  it("puts five desks on one arc around (3.5, 10), west to east, equally spaced, each facing the arc centre", () => {
    expect(slots.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4]);
    expect(slots[2].desk.x).toBeCloseTo(3.5);
    expect(slots[2].desk.z).toBeCloseTo(18);
    expect(slots[0].desk.x).toBeCloseTo(-2.743, 2);
    expect(slots[0].desk.z).toBeCloseTo(15, 2);
    expect(slots[4].desk.x).toBeCloseTo(9.743, 2);
    expect(slots[4].desk.z).toBeCloseTo(15, 2);
    const gaps = slots.slice(1).map((s, i) => Math.hypot(s.desk.x - slots[i].desk.x, s.desk.z - slots[i].desk.z));
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 6);
    for (const s of slots) {
      expect(Math.hypot(s.desk.x - OFFICE.center.x, s.desk.z - OFFICE.center.z)).toBeCloseTo(OFFICE.deskRadius);
      expect(Math.hypot(s.rover.x - OFFICE.center.x, s.rover.z - OFFICE.center.z)).toBeCloseTo(OFFICE.roverRadius);
      const dx = OFFICE.center.x - s.desk.x;
      const dz = OFFICE.center.z - s.desk.z;
      const d = Math.hypot(dx, dz);
      // Forward is (sin yaw, cos yaw), like the rover and `Box.yaw`.
      expect((Math.sin(s.yaw) * dx + Math.cos(s.yaw) * dz) / d).toBeCloseTo(1);
    }
    for (let i = 1; i < slots.length; i++) expect(slots[i].desk.x).toBeGreaterThan(slots[i - 1].desk.x);
  });

  it("stands the screen wall on the south edge, centred on the arc, clear of the middle Rover's back", () => {
    const wall = officeWallRect();
    expect((wall.minX + wall.maxX) / 2).toBeCloseTo(OFFICE.center.x);
    expect(wall.maxX - wall.minX).toBeCloseTo(OFFICE.wall.w + 2 * OFFICE.wall.frame);
    expect(OFFICE.slabEdge).toBe(LOBBY.bounds.maxZ);
    expect(wall.maxZ).toBe(LOBBY.bounds.maxZ);
    expect(wall.minZ).toBeCloseTo(OFFICE.wall.z - OFFICE.wall.t / 2);
    expect(wall.minZ - (slots[2].rover.z + OFFICE.rover.radius)).toBeGreaterThanOrEqual(0.2);
    expect(l1.tall).toContainEqual(officeTall());
    expect(officeTall().h).toBeCloseTo(OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame);
  });

  it("stays on the slab and the D7 strip, clear of the kiosk, the observatory, the lane ring and the hall lead road", () => {
    const b = officeBounds();
    expect(inside(b, LOBBY.bounds)).toBe(true);
    expect(b.minX).toBeGreaterThanOrEqual(-6);
    expect(b.maxX).toBeLessThanOrEqual(13);
    expect(b.minZ).toBeGreaterThanOrEqual(12);
    expect(slots[0].rover.x - OFFICE.rover.radius - kioskRect().maxX).toBeGreaterThanOrEqual(3);
    expect(HALL.lead[0].x - (slots[4].rover.x + OFFICE.rover.radius)).toBeGreaterThanOrEqual(2);
    expect(rectGap(b, LOBBY.observatory)).toBeGreaterThan(10);
    const h = LOBBY.hologram;
    const nearest = Math.hypot(Math.max(b.minX - h.x, 0, h.x - b.maxX), Math.max(b.minZ - h.z, 0, h.z - b.maxZ));
    expect(nearest).toBeGreaterThan(LOBBY.laneRadius + ROVER.radius);
  });

  it("adds one obstacle per desk and Rover plus the wall, more than 1 u from every other Lobby obstacle", () => {
    const office = officeObstacles();
    expect(office).toHaveLength(6);
    for (const o of office) expect(l1.obstacles).toContainEqual(o);
    const others = l1.obstacles.filter((o) => !office.some((x) => same(x, o)));
    expect(others.length).toBe(l1.obstacles.length - office.length);
    for (const o of office) for (const other of others) expect(rectGap(o, other), JSON.stringify(other)).toBeGreaterThan(1);
  });

  it("keeps the stop walkable, reachable from the spawn and the elevator, and 2 u or more in front of the middle desk", () => {
    const grid = buildNavGrid(l1, ROVER.radius);
    expect(isWalkable(grid, OFFICE.stop)).toBe(true);
    expect(findPath(grid, l1.spawn, OFFICE.stop)).not.toBeNull();
    expect(findPath(grid, l1.approach, OFFICE.stop)).not.toBeNull();
    // Drives from the spawn to the hall still pass east of the office.
    expect(findPath(grid, l1.spawn, HALL.lead[0])).not.toBeNull();
    const front = OFFICE.center.z + OFFICE.deskRadius - OFFICE.desk.d / 2;
    expect(front - OFFICE.stop.z).toBeGreaterThanOrEqual(2);
    // 6 u wide floor (the space rules' rover circle) reaches within 4 u of the stop.
    expect(isWalkable(wideGrid(l1), { x: OFFICE.stop.x, z: OFFICE.stop.z - 1.2 })).toBe(true);
  });

  it("leaves no pocket behind the desks that the rover could reach", () => {
    const grid = buildNavGrid(l1, ROVER.radius);
    for (const p of [{ x: -3, z: 18.5 }, { x: 10, z: 18.5 }, { x: 3.5, z: 20.4 }]) expect(isWalkable(grid, p), JSON.stringify(p)).toBe(false);
  });

  it("names the rooms, stops every office drive at the stop and turns the camera south there", () => {
    expect(OFFICE_ROOMS).toEqual(["L1:office", "L1:office-github", "L1:office-desk-1", "L1:office-desk-2", "L1:office-desk-3", "L1:office-desk-4", "L1:office-desk-5"]);
    expect(officeDeskRoom(0)).toBe("L1:office-desk-1");
    for (const room of OFFICE_ROOMS) {
      expect(RoomIdSchema.safeParse(room).success, room).toBe(true);
      expect(isOfficeRoom(room)).toBe(true);
      expect(l1.stops?.[room]).toEqual(OFFICE.stop);
    }
    expect(isOfficeRoom("L1:visits")).toBe(false);
    expect(isOfficeRoom("L1:officer")).toBe(false);
    expect(isOfficeRoom(null)).toBe(false);
    const zones = l1.viewZones ?? [];
    const zone = zoneAt("L1", OFFICE.stop, zones);
    expect(zone?.id).toBe("L1:office");
    expect(zone?.yaw).toBeCloseTo(yawLooking({ x: 0, z: 1 }));
    expect(zoneView(zone!, "desktop").zoom).toBe(OFFICE.view.zoom);
    expect(zoneView(zone!, "mobile").zoom).toBe(OFFICE.view.mobile);
    expect(zoneAt("L1", l1.spawn, zones)?.id).toBe("L1:kiosk");
    expect(zones.filter((z) => z.prime).map((z) => z.id)).toEqual(["L1:kiosk"]);
  });

  it("draws the furniture shell inside the obstacles: 5 desk tops, 10 legs, 4 cable trays and the wall frame", () => {
    const boxes = officeShellBoxes();
    expect(boxes).toHaveLength(20);
    const obstacles = officeObstacles();
    for (const b of boxes.filter((box) => box.h > 0.1)) {
      const h = turnedHalf(b.w, b.d, b.yaw ?? 0);
      const r = { minX: b.x - h.x, maxX: b.x + h.x, minZ: b.z - h.z, maxZ: b.z + h.z };
      expect(obstacles.some((o) => inside(r, o)), JSON.stringify(b)).toBe(true);
    }
    const top = Math.max(...boxes.map((b) => b.y + b.h));
    expect(top).toBeCloseTo(OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bunx vitest run tests/unit/lobby-office.test.ts`
Expected: FAIL with `Failed to resolve import "@/experience/floors/lobby/officeLayout"`.

- [ ] **Step 3: Write the layout module**

Create `src/experience/floors/lobby/officeLayout.ts`:

```ts
import type { RoomId } from "@/content/schema";
import { yawLooking } from "../../camera/look";
import type { ViewZone } from "../../camera/orbit";
import type { Rect, Vec2 } from "../../types";
import type { Box } from "../roof/solids";

/**
 * L1 Agent Office (owner decisions D1 and D7, 2026-10-18): one curved console row of five desks with a Rover
 * behind each (facing the plaza) and a screen wall on the south edge of the plaza strip (x about -6 to 13,
 * z 12 to 21). Pure and import-light: config.ts reads it (obstacles, camera column, stops, the view zone),
 * the main-path `OfficeMount` draws the furniture shell from it, and the lazy office chunk places the rest.
 * tests/unit/lobby-office.test.ts asserts every clearance.
 */

/** Resolves a key of the `office` messages namespace (Experience passes its translator for that namespace down to the Lobby). */
export type OfficeTranslate = (key: string, values?: Record<string, string | number>) => string;

export const OFFICE = {
  center: { x: 3.5, z: 10 },
  deskRadius: 8,
  roverRadius: 9.2,
  /** Desk angles (degrees from +z toward +x), slot 0 at the west end. */
  angles: [-51.3, -25.65, 0, 25.65, 51.3],
  /** Tangential width, radial depth, top height, top slab and leg thickness. */
  desk: { w: 2.6, d: 0.9, top: 0.95, slab: 0.08, leg: 0.12 },
  rover: { radius: 1 },
  /** The screen (17 x 4 u, bottom at y 0.6) inside a frame `frame` u wide, its plane at z 20.7 facing north. */
  wall: { x: 3.5, z: 20.7, w: 17, h: 4, bottom: 0.6, t: 0.3, frame: 0.2 },
  /** Point-and-go stop of every office room, in the concave front of the row. */
  stop: { x: 3.5, z: 14.2 },
  /** `L1:office` view zone: zoom per camera class and the half size of its area around the stop. */
  view: { zoom: 1.3, tablet: 1.25, mobile: 1.2, half: { x: 2, z: 1.4 } },
  /** The chunk loads once the rover (or the elevator arrival point during a ride to L1) is this close to the stop. */
  loadRadius: 40,
  /** `LOBBY.bounds.maxZ` (config.ts imports this module, so it cannot import config.ts). */
  slabEdge: 21,
} as const;

export const OFFICE_ROOM = "L1:office" as RoomId;
export const OFFICE_GITHUB_ROOM = "L1:office-github" as RoomId;
export const officeDeskRoom = (slot: number): RoomId => `L1:office-desk-${slot + 1}` as RoomId;
export const OFFICE_ROOMS: readonly RoomId[] = [OFFICE_ROOM, OFFICE_GITHUB_ROOM, ...OFFICE.angles.map((_, slot) => officeDeskRoom(slot))];

/** The office rooms have no route of their own (they keep /{locale}, like the Visitor Observatory). */
export function isOfficeRoom(room: string | null | undefined): boolean {
  return Boolean(room) && (room === OFFICE_ROOM || room!.startsWith("L1:office-"));
}

export interface OfficeSlot {
  slot: number;
  /** Angle from +z toward +x (radians). */
  theta: number;
  /** Turn of the desk and its Rover (three `rotation.y`): forward (sin, cos) points at the arc centre. */
  yaw: number;
  desk: Vec2;
  rover: Vec2;
  /** Axis-aligned box of the turned desk and the Rover's circle. */
  rect: Rect;
}

const DEG = Math.PI / 180;
const onArc = (theta: number, r: number): Vec2 => ({ x: OFFICE.center.x + r * Math.sin(theta), z: OFFICE.center.z + r * Math.cos(theta) });

/** Half extents of a w x d box turned by `yaw` (local x is the width, local z the depth). */
export function turnedHalf(w: number, d: number, yaw: number): Vec2 {
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  return { x: (w / 2) * c + (d / 2) * s, z: (w / 2) * s + (d / 2) * c };
}

export function officeSlots(): OfficeSlot[] {
  return OFFICE.angles.map((deg, slot) => {
    const theta = deg * DEG;
    const desk = onArc(theta, OFFICE.deskRadius);
    const rover = onArc(theta, OFFICE.roverRadius);
    const yaw = theta + Math.PI;
    const h = turnedHalf(OFFICE.desk.w, OFFICE.desk.d, yaw);
    const r = OFFICE.rover.radius;
    return {
      slot,
      theta,
      yaw,
      desk,
      rover,
      rect: {
        minX: Math.min(desk.x - h.x, rover.x - r),
        maxX: Math.max(desk.x + h.x, rover.x + r),
        minZ: Math.min(desk.z - h.z, rover.z - r),
        maxZ: Math.max(desk.z + h.z, rover.z + r),
      },
    };
  });
}

/** The wall frame's footprint, reaching back to the slab edge (no sliver of floor behind it). */
export function officeWallRect(): Rect {
  const { x, z, w, t, frame } = OFFICE.wall;
  return { minX: x - w / 2 - frame, maxX: x + w / 2 + frame, minZ: z - t / 2, maxZ: OFFICE.slabEdge };
}

/**
 * Navgrid obstacles: one per desk and Rover (the end ones reach back to the wall, so the rover cannot drive
 * around the row into the space behind it), then the wall. The concave floor in front of the desks stays open.
 */
export function officeObstacles(): Rect[] {
  const wall = officeWallRect();
  const slots = officeSlots();
  const last = slots.length - 1;
  return [...slots.map((s) => (s.slot === 0 || s.slot === last ? { ...s.rect, maxZ: wall.minZ } : s.rect)), wall];
}

/** Camera collision column: the wall frame. */
export function officeTall(): Rect & { h: number } {
  return { ...officeWallRect(), h: OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame };
}

/** Everything the office covers: the intro reveal rect and the in-view test. */
export function officeBounds(): Rect {
  const rects = officeObstacles();
  return {
    minX: Math.min(...rects.map((r) => r.minX)),
    maxX: Math.max(...rects.map((r) => r.maxX)),
    minZ: Math.min(...rects.map((r) => r.minZ)),
    maxZ: Math.max(...rects.map((r) => r.maxZ)),
  };
}

/** Where `drive` stops for every office room (`FloorLayout.stops`). */
export function officeStops(): Partial<Record<RoomId, Vec2>> {
  return Object.fromEntries(OFFICE_ROOMS.map((room) => [room, { x: OFFICE.stop.x, z: OFFICE.stop.z }]));
}

/** The office view: around the stop, looking south at the desks and the wall (tuned on the owner captures). */
export function officeZone(): ViewZone {
  const { stop, view } = OFFICE;
  return {
    id: "L1:office",
    area: { minX: stop.x - view.half.x, maxX: stop.x + view.half.x, minZ: stop.z - view.half.z, maxZ: stop.z + view.half.z },
    yaw: yawLooking({ x: 0, z: 1 }),
    zoom: view.zoom,
    classView: { tablet: { zoom: view.tablet }, mobile: { zoom: view.mobile } },
  };
}

/**
 * The furniture drawn on the main path (so the obstacles always show, before the chunk and if it fails):
 * five desk tops, two legs each, four cable trays along the arc between the desks, and the wall frame.
 */
export function officeShellBoxes(): Box[] {
  const { desk, wall } = OFFICE;
  const out: Box[] = [];
  const slots = officeSlots();
  for (const s of slots) {
    out.push({ x: s.desk.x, y: desk.top - desk.slab, z: s.desk.z, w: desk.w, h: desk.slab, d: desk.d, yaw: s.yaw });
    for (const side of [-1, 1]) {
      // Local x is (cos yaw, -sin yaw) in floor x and z.
      const off = side * (desk.w / 2 - 0.2);
      out.push({ x: s.desk.x + off * Math.cos(s.yaw), y: 0, z: s.desk.z - off * Math.sin(s.yaw), w: desk.leg, h: desk.top - desk.slab, d: desk.d * 0.8, yaw: s.yaw });
    }
  }
  for (let i = 0; i + 1 < slots.length; i++) {
    const a = slots[i].theta;
    const b = slots[i + 1].theta;
    const mid = (a + b) / 2;
    const at = onArc(mid, OFFICE.deskRadius);
    const chord = 2 * OFFICE.deskRadius * Math.sin((b - a) / 2);
    out.push({ x: at.x, y: 0, z: at.z, w: chord - desk.w + 0.2, h: 0.06, d: 0.3, yaw: mid + Math.PI });
  }
  out.push({ x: wall.x, y: 0, z: wall.z, w: wall.w + 2 * wall.frame, h: wall.bottom + wall.h + wall.frame, d: wall.t });
  return out;
}
```

- [ ] **Step 4: Wire the layout into L1**

In `src/experience/config.ts`, add the import after the `observatoryLayout` import:

```ts
import { officeObstacles, officeStops, officeTall, officeZone } from "./floors/lobby/officeLayout";
```

In `buildFloorLayouts`, replace the L1 obstacle list tail, `viewZones` and `tall`:

```ts
          ...HALL_LAYOUT.obstacles,
          { minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ },
          // Agent Office (D1, D7): one obstacle per desk and Rover, then the screen wall (floors/lobby/officeLayout.ts).
          ...officeObstacles(),
        ],
```

```ts
      viewZones: [...HALL_LAYOUT.viewZones, ...observatory.zones, lobbyArrivalZone(), officeZone()],
      // Every Agent Office room drives to the office stop (the rooms have no door).
      stops: officeStops(),
      // Gallery shapes taller than the camera clearance (gateway arch, monoliths, experience arch, beacon, contact
      // card), the observatory globe and the Agent Office screen wall.
      tall: [...hallTall(), LOBBY.observatory, officeTall()],
```

In `tests/unit/highlights-layout.test.ts`, add `import { officeObstacles } from "@/experience/floors/lobby/officeLayout";` after the `stations` import, and change the space-rules test body to:

```ts
    const [, skills] = l1.obstacles;
    // The Visitor Observatory's door (south-west corner) is reached on the navgrid like the rest of the Lobby,
    // not on the hall road: tests/unit/lobby-observatory.test.ts checks its pad.
    const hallDoors = l1.doors!.filter((d) => d.room !== "L1:visits");
    // The Agent Office is one fixture whose inner gaps are by design (owner approval, docs/decisions/2026-10-19-agent-office-chunk-budget.md);
    // tests/unit/lobby-office.test.ts checks its own clearances.
    const office = officeObstacles();
    const obstacles = l1.obstacles.filter((o) => !office.some((x) => x.minX === o.minX && x.maxX === o.maxX && x.minZ === o.minZ && x.maxZ === o.maxZ));
    const violations = spaceViolations({ bounds: l1.bounds, obstacles, doors: hallDoors, network: l1.road!, start: l1.approach, pads: l1.pads });
```

In `tests/unit/hall-gallery.test.ts` ("puts every tall shape into the camera collision"), add `import { officeTall } from "@/experience/floors/lobby/officeLayout";` and change the layout assertion to:

```ts
    expect(l1.tall).toEqual([...tall, LOBBY.observatory, officeTall()]);
```

- [ ] **Step 5: Run the tests**

Run: `bunx vitest run tests/unit/lobby-office.test.ts tests/unit/highlights-layout.test.ts tests/unit/lobby-observatory.test.ts tests/unit/kiosk.test.ts tests/unit/navgrid.test.ts tests/unit/rover.test.ts tests/unit/hall-gallery.test.ts tests/unit/minimap-model.test.ts tests/unit/interact-registry.test.ts`
Expected: PASS (the office obstacles are appended after the observatory, so index-based reads such as `l1.obstacles[2]` and `[3]` keep their elements).

- [ ] **Step 6: Commit**

```bash
git add src/experience/floors/lobby/officeLayout.ts src/experience/config.ts tests/unit/lobby-office.test.ts tests/unit/highlights-layout.test.ts tests/unit/hall-gallery.test.ts
git commit -m "feat(office): L1 office layout, obstacles, stops and view zone"
```

### Task 2: Office rooms, copy and the Rover menu entry

**Files:**
- Modify: `src/experience/missions/rooms.ts`
- Modify: `src/content/room-views/types.ts`
- Modify: `src/content/room-views/lobby.ts`
- Modify: `messages/en.json`, `messages/id.json`
- Modify: `src/i18n/client-messages.ts`
- Modify: `src/experience/floors/Lobby.tsx` (type only)
- Modify: `src/experience/Experience.tsx`
- Modify: `content/site-content.json`
- Modify: `tests/content/dataset.test.ts`, `tests/unit/missions-runner.test.ts`, `tests/hud/RoverTerminal.test.tsx`, `tests/hud/MissionHud.test.tsx`
- Test: `tests/unit/office-rooms.test.ts`

**Interfaces:**
- Consumes: `OFFICE_DESKS`, `OFFICE_STATES`, `OFFICE_ACTIVITIES`, `OFFICE_AGENTS` (`@/lib/office/protocol`, PR 1), `isOfficeRoom`, `OfficeTranslate` (Task 1), `single`, `chain`, `roomId`, `fill`, `messages` (`room-views/shared.ts`).
- Produces: `RoomKind` gains `"office"`, `StructuralRoom` gains `"office"`, `RoomView.office?: { panel: "summary" | "github" | "desk"; slot?: number }`, catalog room `L1:office` (path and floor path `/#office`, filled by PR 4), seven room views, `LobbyLabels.office: OfficeTranslate`, mission `office` (order 7), messages `hud.rooms.office` and the `office` namespace.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/office-rooms.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getContent } from "@/content/load";
import { buildRoomViews } from "@/content/room-views";
import { buildRoomCatalog } from "@/experience/missions/rooms";
import { OFFICE_ROOMS } from "@/experience/floors/lobby/officeLayout";
import { structuralLabels } from "@/hud/index-data";
import { OFFICE_ACTIVITIES, OFFICE_AGENTS, OFFICE_STATES } from "@/lib/office/protocol";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

describe("Agent Office rooms and copy", () => {
  it("lists one catalog room, L1:office, with no route of its own beyond the home anchor", () => {
    const catalog = buildRoomCatalog(getContent(), structuralLabels());
    const office = catalog.filter((r) => r.kind === "office");
    expect(office.map((r) => r.id)).toEqual(["L1:office"]);
    expect(office[0]).toMatchObject({ floor: "L1", path: "/#office", floorPath: "/#office", surpriseWeight: 0, title: { en: "Agent Office", id: "Agent Office" } });
  });

  for (const locale of ["en", "id"] as const) {
    it(`builds a drawer view for every office room, chained among themselves only (${locale})`, () => {
      const views = buildRoomViews(locale);
      for (const room of OFFICE_ROOMS) expect(views[room]?.kind, room).toBe("office");
      expect(views["L1:office"].office).toEqual({ panel: "summary" });
      expect(views["L1:office-github"].office).toEqual({ panel: "github" });
      for (let slot = 0; slot < 5; slot++) expect(views[`L1:office-desk-${slot + 1}`].office).toEqual({ panel: "desk", slot });
      expect(views["L1:office"].prev).toBeUndefined();
      expect(views["L1:office-desk-5"].next).toBeUndefined();
      expect(views["L1:visits"].next).toBeUndefined();
      expect(views["L1:office-desk-3"].title).toBe(locale === "en" ? "Desk 3" : "Meja 3");
    });
  }

  it("has a label for every protocol state, activity and agent in both locales", () => {
    for (const m of [en, id]) {
      expect(Object.keys(m.office.state).sort()).toEqual([...OFFICE_STATES].sort());
      expect(Object.keys(m.office.activity).sort()).toEqual([...OFFICE_ACTIVITIES].sort());
      expect(Object.keys(m.office.agent).sort()).toEqual([...OFFICE_AGENTS].sort());
      expect(m.office.clientProject.length).toBeGreaterThan(0);
      expect(m.office.privacy.length).toBeGreaterThan(0);
    }
  });

  it("adds the office mission to the Rover menu: drive to the office, open the summary", () => {
    const mission = getContent().missions.find((m) => m.id === "office");
    expect(mission?.order).toBe(7);
    expect(mission?.steps).toEqual([
      { kind: "elevator", floor: "L1" },
      { kind: "drive", to: "L1:office" },
      { kind: "open", room: "L1:office" },
    ]);
    expect(mission?.label).toEqual({ en: "Watch the AI agents at work", id: "Lihat agen AI bekerja" });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bunx vitest run tests/unit/office-rooms.test.ts`
Expected: FAIL (`expected [] to deeply equal [ 'L1:office' ]` and `Cannot read properties of undefined (reading 'state')`).

- [ ] **Step 3: Add the room kind, the structural label and the catalog entry**

In `src/experience/missions/rooms.ts`:

```ts
export type RoomKind = "lobby" | "highlights" | "career" | "workshop" | "pod" | "reactor" | "post" | "shelf" | "research" | "topics" | "roof" | "visits" | "ops" | "engine" | "office";
```

Add `| "office"` after `| "ops"` in `StructuralRoom`, and after the Visitor Observatory `add({ ... })` block:

```ts
  // L1 Agent Office (owner design 2026-10-18): live AI coding agents and public GitHub activity on the south plaza.
  // Its drawers keep /{locale} (`isOfficeRoom`); the Classic home card is `#office` (Agent Office part 4).
  add({
    floor: "L1",
    slug: "office",
    kind: "office",
    title: labels.office,
    keywords: ["agent office", "kantor agen", "agents", "agen", "AI agents", "Copilot", "Claude Code", "Codex", "GitHub", "CI", "live", "mission control", "lobby"],
    path: "/#office",
    floorPath: "/#office",
    surpriseWeight: 0,
  });
```

- [ ] **Step 4: Add the view field and the office views**

In `src/content/room-views/types.ts`, inside `RoomView` after `engine?: RoomEngine;`:

```ts
  /** L1 Agent Office: which panel `OfficeBody` shows; the live data is fetched on the client (`/api/office`). */
  office?: { panel: "summary" | "github" | "desk"; slot?: number };
```

In `src/content/room-views/lobby.ts`, change the imports and the return:

```ts
import { OFFICE_DESKS } from "@/lib/office/protocol";
import { chain, chipLogos, fill, messages, roomId, single } from "./shared";
```

Replace `  return chain([` (the first statement after `const profile = getProfile();`) with `  const lobby = chain([`, replace the file's last two lines (`  ]);` and `}`) with:

```ts
  ]);
  return [...lobby, ...buildOfficeViews(locale)];
}

/** L1 Agent Office: the summary half of the wall, the GitHub half and one drawer per desk (`OfficeBody`, live data on the client). */
function buildOfficeViews(locale: Locale): RoomView[] {
  const m = messages(locale);
  const o = m.office["3d"];
  return chain([
    single({ id: roomId("L1", "office"), kind: "office", title: m.hud.rooms.office, subtitle: o.subtitle, accent: "cyan", office: { panel: "summary" } }),
    single({ id: roomId("L1", "office-github"), kind: "office", title: o.githubTitle, subtitle: o.subtitle, accent: "green", office: { panel: "github" } }),
    ...Array.from({ length: OFFICE_DESKS }, (_, slot) =>
      single({ id: roomId("L1", `office-desk-${slot + 1}`), kind: "office", title: fill(o.desk, { n: String(slot + 1) }), subtitle: o.subtitle, accent: "cyan", office: { panel: "desk", slot } }),
    ),
  ]);
}
```

- [ ] **Step 5: Add the copy**

In `messages/en.json`, add `"office": "Agent Office"` as the last key of `hud.rooms`, and a top-level `office` namespace after `stats`:

```json
  "office": {
    "agent": { "copilot": "Copilot", "claude": "Claude", "codex": "Codex" },
    "state": { "working": "Working", "thinking": "Thinking", "reviewing": "Reviewing", "testing": "Running tests", "ci": "Waiting on CI", "input": "Needs Kurniadi", "done": "Done", "failed": "CI failed", "asleep": "Asleep" },
    "activity": { "editing": "Editing", "planning": "Planning", "reading": "Reading", "testing": "Testing", "building": "Building", "shell": "Running commands", "ci": "Watching CI", "git": "Using git", "asking": "Asking Kurniadi", "finished": "Finished", "failed": "Failed", "resting": "Resting" },
    "clientProject": "Client project",
    "privacy": "Only the activity type leaves Kurniadi's machine. Task titles show for public repositories only; code, prompts, file paths and client names never do.",
    "3d": {
      "subtitle": "Live AI coding agents and public GitHub activity",
      "agentFull": { "copilot": "GitHub Copilot", "claude": "Claude Code", "codex": "OpenAI Codex" },
      "offDuty": "Off duty",
      "clientPrivate": "Client project (private, details hidden)",
      "waiting": "Waiting for Kurniadi",
      "jobs": "{done} of {total} jobs",
      "desk": "Desk {n}",
      "githubTitle": "GitHub board",
      "mode": { "live": "LIVE", "semi": "SEMI-LIVE", "off": "RESTING", "offline": "OFFLINE" },
      "wall": { "control": "MISSION CONTROL", "active": "ACTIVE", "thinking": "THINKING", "waiting": "WAITING", "asleep": "ASLEEP", "now": "Now", "resting": "Every agent is resting. Public GitHub work is on the board.", "today": "Today: tasks done {tasks} · PRs merged {prs} · CI green {green} of {runs}", "github": "GITHUB", "githubSub": "Public repositories", "empty": "No public activity yet" },
      "drawer": { "agent": "Agent", "activity": "Activity", "task": "Task", "repo": "Repository", "since": "In this state", "updated": "Last update", "recent": "Recent activity", "agents": "Agents", "today": "Today", "tasksDone": "Tasks done", "prsMerged": "PRs merged", "ciGreen": "CI runs green", "none": "Nothing right now", "offline": "The office is offline. This is the last known activity." },
      "hooks": "Live from agent hooks on Kurniadi's machine, refreshed every 10 seconds while you watch.",
      "githubNote": "From public GitHub webhooks. Private repositories never appear here.",
      "target": { "office": "Agent Office: summary", "github": "Agent Office: GitHub board", "desk": "Desk {n}: {agent}" },
      "github": {
        "kind": { "run": "Workflow run", "pr": "Pull request", "push": "Push", "deploy": "Deploy" },
        "status": { "running": "running", "success": "passed", "failure": "failed", "merged": "merged", "opened": "opened", "pushed": "pushed" }
      }
    }
  },
```

In `messages/id.json`, add `"office": "Agent Office"` as the last key of `hud.rooms`, and after `stats`:

```json
  "office": {
    "agent": { "copilot": "Copilot", "claude": "Claude", "codex": "Codex" },
    "state": { "working": "Bekerja", "thinking": "Berpikir", "reviewing": "Meninjau", "testing": "Menjalankan tes", "ci": "Menunggu CI", "input": "Butuh Kurniadi", "done": "Selesai", "failed": "CI gagal", "asleep": "Tidur" },
    "activity": { "editing": "Mengedit", "planning": "Merencanakan", "reading": "Membaca", "testing": "Menguji", "building": "Build", "shell": "Menjalankan perintah", "ci": "Memantau CI", "git": "Memakai git", "asking": "Bertanya ke Kurniadi", "finished": "Selesai", "failed": "Gagal", "resting": "Istirahat" },
    "clientProject": "Proyek klien",
    "privacy": "Hanya jenis aktivitas yang keluar dari mesin Kurniadi. Judul tugas hanya tampil untuk repositori publik; kode, prompt, path file, dan nama klien tidak pernah.",
    "3d": {
      "subtitle": "Agen AI coding secara live dan aktivitas GitHub publik",
      "agentFull": { "copilot": "GitHub Copilot", "claude": "Claude Code", "codex": "OpenAI Codex" },
      "offDuty": "Tidak bertugas",
      "clientPrivate": "Proyek klien (privat, detail disembunyikan)",
      "waiting": "Menunggu Kurniadi",
      "jobs": "{done} dari {total} job",
      "desk": "Meja {n}",
      "githubTitle": "Papan GitHub",
      "mode": { "live": "LIVE", "semi": "SEMI-LIVE", "off": "ISTIRAHAT", "offline": "OFFLINE" },
      "wall": { "control": "MISSION CONTROL", "active": "AKTIF", "thinking": "BERPIKIR", "waiting": "MENUNGGU", "asleep": "TIDUR", "now": "Sekarang", "resting": "Semua agen sedang istirahat. Aktivitas GitHub publik ada di papan.", "today": "Hari ini: tugas selesai {tasks} · PR di-merge {prs} · CI hijau {green} dari {runs}", "github": "GITHUB", "githubSub": "Repositori publik", "empty": "Belum ada aktivitas publik" },
      "drawer": { "agent": "Agen", "activity": "Aktivitas", "task": "Tugas", "repo": "Repositori", "since": "Dalam status ini", "updated": "Pembaruan terakhir", "recent": "Aktivitas terbaru", "agents": "Agen", "today": "Hari ini", "tasksDone": "Tugas selesai", "prsMerged": "PR di-merge", "ciGreen": "Run CI hijau", "none": "Tidak ada saat ini", "offline": "Kantor sedang offline. Ini aktivitas terakhir yang diketahui." },
      "hooks": "Langsung dari hook agen di mesin Kurniadi, diperbarui setiap 10 detik selama Anda melihat.",
      "githubNote": "Dari webhook GitHub publik. Repositori privat tidak pernah muncul di sini.",
      "target": { "office": "Agent Office: ringkasan", "github": "Agent Office: papan GitHub", "desk": "Meja {n}: {agent}" },
      "github": {
        "kind": { "run": "Workflow run", "pr": "Pull request", "push": "Push", "deploy": "Deploy" },
        "status": { "running": "berjalan", "success": "lulus", "failure": "gagal", "merged": "di-merge", "opened": "dibuka", "pushed": "di-push" }
      }
    }
  },
```

In `src/i18n/client-messages.ts`, add `"office",` to `CLIENT_NAMESPACES` between `"library",` and `"paper",` (never to `LAYOUT_NAMESPACES`).

- [ ] **Step 6: Pass the translator and the label through the 3D tower**

In `src/experience/floors/Lobby.tsx`, add `import type { OfficeTranslate } from "./lobby/officeLayout";` and the field at the end of `LobbyLabels`:

```ts
  /** The `office` namespace translator (Agent Office: wall, screens, targets; the lazy chunk resolves its own keys). */
  office: OfficeTranslate;
```

In `src/experience/Experience.tsx`:
- add `import { isOfficeRoom } from "./floors/lobby/officeLayout";` after the `visitsRoom` import;
- add `const tOffice = useTranslations("office");` after `const tStats = useTranslations("stats");`;
- in `labels.lobby`, add `office: tOffice,` after `hall: { ... },`;
- in `interact.rooms`, add `office: t("rooms.office"),` after `ops: t("rooms.ops"),`;
- add `tOffice` to the `labels` `useMemo` dependency list;
- in `hasPage`, add `!isOfficeRoom(room) &&` at the start of the returned expression, and extend its comment with "The Agent Office rooms keep /{locale} too."

- [ ] **Step 7: Add the mission and its room to the dataset test**

In `content/site-content.json`, append after the `hire` mission (the last element of `missions`):

```json
    {
      "id": "office",
      "order": 7,
      "label": {
        "en": "Watch the AI agents at work",
        "id": "Lihat agen AI bekerja"
      },
      "steps": [
        {
          "kind": "elevator",
          "floor": "L1"
        },
        {
          "kind": "drive",
          "to": "L1:office"
        },
        {
          "kind": "open",
          "room": "L1:office"
        }
      ]
    }
```

In `tests/content/dataset.test.ts`, in "starts every mission with a known step and targets existing rooms", add `"L1:office",` after `"L1:highlights-about",`.

Update the tests that pin the Rover menu's missions:
- `tests/unit/missions-runner.test.ts`, in `describe("mission runner: catalog")`, add to `expected`: `office: ["elevator L1", "drive L1:office", "open L1:office"],`
- `tests/hud/RoverTerminal.test.tsx`: `expect(options).toHaveLength(9);`, `expect(dialog).toHaveTextContent("Pick: 1 to 8 or arrows + Enter · Close: Esc");`, add `"office"` at the end of the ids in "lists the Rover menu in catalog order, at most 9" and `"Watch the AI agents at work",` at the end of its labels;
- `tests/hud/MissionHud.test.tsx`, "the Rover menu never lists replay or hints": `expect(options).toHaveLength(9);`.

- [ ] **Step 8: Run the tests**

Run: `bunx vitest run tests/unit/office-rooms.test.ts tests/unit/missions-runner.test.ts tests/hud/RoverTerminal.test.tsx tests/hud/MissionHud.test.tsx tests/unit/room-views.test.ts tests/unit/missions-rooms.test.ts tests/unit/client-namespaces.test.ts tests/unit/ui-copy.test.ts tests/unit/kiosk.test.ts tests/unit/experience-data.test.ts tests/unit/interact-registry.test.ts tests/unit/hall-interact.test.ts tests/content/dataset.test.ts tests/unit/search.test.ts && bun run validate:content && bunx tsc --noEmit -p .`
Expected: PASS; `validate:content` prints no error; `tsc` exits 0.

- [ ] **Step 9: Commit**

```bash
git add src/experience/missions/rooms.ts src/content/room-views/types.ts src/content/room-views/lobby.ts messages/en.json messages/id.json src/i18n/client-messages.ts src/experience/floors/Lobby.tsx src/experience/Experience.tsx content/site-content.json tests/content/dataset.test.ts tests/unit/missions-runner.test.ts tests/hud/RoverTerminal.test.tsx tests/hud/MissionHud.test.tsx tests/unit/office-rooms.test.ts
git commit -m "feat(office): office rooms, EN and ID copy and the Rover menu mission"
```

### Task 3: Shared office fixtures and model (`src/lib/office/model.ts`)

**Files:**
- Create: `e2e/office-fixtures.ts`
- Create: `src/lib/office/model.ts`
- Test: `tests/unit/office-model.test.ts`

**Interfaces:**
- Consumes: `OFFICE_DESKS`, `OfficeDesk`, `OfficeState`, `OfficeAgent`, `OfficeActivity`, `OfficeSnapshotV1` (`@/lib/office/protocol`).
- Produces (fixed for the PR 4 Classic card):
  - `interface OfficeCounts { active: number; thinking: number; waiting: number; asleep: number }`
  - `officeCounts(desks: readonly OfficeDesk[], slots?: number): OfficeCounts`
  - `deskTitle(desk: OfficeDesk): string | null`
  - `STATE_TONE: Record<OfficeState, string>`
  - `sinceLabel(ms: number, locale: "en" | "id", now: number): string`
  - `e2e/office-fixtures.ts`: `OFFICE_REPO`, `officeDesk(...)`, `officeSnapshot(...)`, `statesA(now: number, extra?: number): OfficeSnapshotV1`, `statesB(now: number): OfficeSnapshotV1`, `STATES_A`, `STATES_B`

- [ ] **Step 1: Write the fixtures**

Create `e2e/office-fixtures.ts` (used by unit tests, the e2e spec and the capture script):

```ts
import type { OfficeActivity, OfficeAgent, OfficeDesk, OfficeSnapshotV1, OfficeState } from "../src/lib/office/protocol";

/**
 * Deterministic Agent Office snapshots: the nine states over two snapshots, one private desk (no title) and one
 * off-duty slot. The only repository named is this site's own public one. Times are relative to `now`.
 */
export const OFFICE_REPO = "ShinyQ/ShinyQ-HQ";

export function officeDesk(slot: number, agent: OfficeAgent, state: OfficeState, activity: OfficeActivity, now: number, extra: Partial<OfficeDesk> = {}): OfficeDesk {
  return { slot, agent, state, activity, since: now - 14 * 60_000, recent: [], ...extra };
}

export function officeSnapshot(desks: OfficeDesk[], now: number, extra = 0): OfficeSnapshotV1 {
  return {
    v: 1,
    enabled: true,
    mode: "live",
    updatedAt: now,
    desks,
    extra,
    github: [
      { kind: "run", status: "running", repo: OFFICE_REPO, title: "CI", at: now - 30_000, url: `https://github.com/${OFFICE_REPO}/actions`, progress: { done: 7, total: 12 } },
      { kind: "pr", status: "merged", repo: OFFICE_REPO, title: "feat: agent office", at: now - 10 * 60_000, url: `https://github.com/${OFFICE_REPO}/pulls` },
    ],
    today: { day: "2026-10-19", tasksDone: 3, prsMerged: 2, ciRuns: 6, ciGreen: 5 },
  };
}

/** Five of the nine states: working (public title), thinking (private), reviewing, testing, waiting on CI 7 of 12 (public); 2 more sessions. */
export function statesA(now: number, extra = 2): OfficeSnapshotV1 {
  return officeSnapshot(
    [
      officeDesk(0, "copilot", "working", "editing", now, {
        repo: OFFICE_REPO,
        title: "Agent office scene",
        recent: [
          { state: "testing", activity: "testing", at: now - 2 * 60_000 },
          { state: "thinking", activity: "planning", at: now - 4 * 60_000 },
        ],
      }),
      officeDesk(1, "claude", "thinking", "planning", now),
      officeDesk(2, "codex", "reviewing", "reading", now),
      officeDesk(3, "copilot", "testing", "testing", now),
      officeDesk(4, "claude", "ci", "ci", now, { repo: OFFICE_REPO, title: "Office chips", progress: { done: 7, total: 12 } }),
    ],
    now,
    extra,
  );
}

/** The other four: needs Kurniadi, done, CI failed with its job, asleep; slot 4 has no session (an off-duty Rover). */
export function statesB(now: number): OfficeSnapshotV1 {
  return officeSnapshot(
    [
      officeDesk(0, "codex", "input", "asking", now),
      officeDesk(1, "copilot", "done", "finished", now, { repo: OFFICE_REPO, title: "Office drawers" }),
      officeDesk(2, "claude", "failed", "failed", now, { repo: OFFICE_REPO, title: "Office wall", job: "Build, CV and e2e" }),
      officeDesk(3, "codex", "asleep", "resting", now),
    ],
    now,
  );
}

export const STATES_A: readonly OfficeState[] = ["working", "thinking", "reviewing", "testing", "ci"];
export const STATES_B: readonly OfficeState[] = ["input", "done", "failed", "asleep", "asleep"];
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/office-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { COLORS } from "@/experience/config";
import { deskTitle, officeCounts, sinceLabel, STATE_TONE } from "@/lib/office/model";
import { OFFICE_STATES } from "@/lib/office/protocol";
import { statesA, statesB } from "../../e2e/office-fixtures";

const NOW = 1_800_000_000_000;

describe("shared office model (src/lib/office/model.ts)", () => {
  it("counts active (working, reviewing, testing, done, failed), thinking, waiting (ci, input) and asleep plus empty slots", () => {
    expect(officeCounts(statesA(NOW).desks)).toEqual({ active: 3, thinking: 1, waiting: 1, asleep: 0 });
    expect(officeCounts(statesB(NOW).desks)).toEqual({ active: 2, thinking: 0, waiting: 1, asleep: 2 });
    expect(officeCounts([])).toEqual({ active: 0, thinking: 0, waiting: 0, asleep: 5 });
    expect(officeCounts([], 3).asleep).toBe(3);
  });

  it("returns a desk title only when the snapshot carries one", () => {
    const [working, thinking] = statesA(NOW).desks;
    expect(deskTitle(working)).toBe("Agent office scene");
    expect(deskTitle(thinking)).toBeNull();
    expect(deskTitle({ ...thinking, title: "" })).toBeNull();
  });

  it("has one tone per state, the palette tokens where one matches", () => {
    expect(Object.keys(STATE_TONE).sort()).toEqual([...OFFICE_STATES].sort());
    expect(STATE_TONE.working).toBe(COLORS.cyan);
    expect(STATE_TONE.thinking).toBe(COLORS.amber);
    expect(STATE_TONE.ci).toBe(COLORS.violet);
    expect(STATE_TONE.input).toBe(COLORS.pink);
    expect(STATE_TONE.done).toBe(COLORS.green);
    expect(new Set(Object.values(STATE_TONE)).size).toBe(OFFICE_STATES.length);
  });

  it("writes short since labels in both locales", () => {
    expect(sinceLabel(NOW - 20_000, "en", NOW)).toBe("just now");
    expect(sinceLabel(NOW - 3 * 60_000, "en", NOW)).toBe("3 min");
    expect(sinceLabel(NOW - 2 * 3_600_000, "en", NOW)).toBe("2 h");
    expect(sinceLabel(NOW - 3 * 86_400_000, "en", NOW)).toBe("3 d");
    expect(sinceLabel(NOW - 20_000, "id", NOW)).toBe("baru saja");
    expect(sinceLabel(NOW - 3 * 60_000, "id", NOW)).toBe("3 mnt");
    expect(sinceLabel(NOW - 2 * 3_600_000, "id", NOW)).toBe("2 j");
    expect(sinceLabel(NOW + 5_000, "en", NOW)).toBe("just now");
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `bunx vitest run tests/unit/office-model.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/office/model"`.

- [ ] **Step 4: Write the shared model**

Create `src/lib/office/model.ts`:

```ts
import { OFFICE_DESKS, type OfficeDesk, type OfficeState } from "./protocol";

/**
 * Shared Agent Office model (pure: no React, no three), used by the 3D office on L1 and the Classic home card,
 * so both count, title and color a desk the same way.
 */
export interface OfficeCounts {
  active: number;
  thinking: number;
  waiting: number;
  asleep: number;
}

const GROUP: Record<OfficeState, keyof OfficeCounts> = {
  working: "active",
  reviewing: "active",
  testing: "active",
  done: "active",
  failed: "active",
  thinking: "thinking",
  ci: "waiting",
  input: "waiting",
  asleep: "asleep",
};

/** Desks per group; slots without a session (up to `slots`) count as asleep. */
export function officeCounts(desks: readonly OfficeDesk[], slots: number = OFFICE_DESKS): OfficeCounts {
  const counts: OfficeCounts = { active: 0, thinking: 0, waiting: 0, asleep: 0 };
  for (const desk of desks) counts[GROUP[desk.state]] += 1;
  counts.asleep += Math.max(0, slots - desks.length);
  return counts;
}

/** The task title when the snapshot carries one (allowlisted public repositories only), else null: the UI shows "Client project". */
export function deskTitle(desk: OfficeDesk): string | null {
  return desk.title ? desk.title : null;
}

/** State colors (owner design D5): palette tokens where one matches (cyan, amber, violet, pink, green, blue), else the mock's teal, red and grey. */
export const STATE_TONE: Record<OfficeState, string> = {
  working: "#22d3ee",
  thinking: "#fbbf24",
  reviewing: "#2dd4bf",
  testing: "#60a5fa",
  ci: "#a78bfa",
  input: "#f472b6",
  done: "#34d399",
  failed: "#f87171",
  asleep: "#7c84a8",
};

const UNITS = {
  en: { now: "just now", min: "min", h: "h", d: "d", tag: "en-US" },
  id: { now: "baru saja", min: "mnt", h: "j", d: "hr", tag: "id-ID" },
} as const;

/** Short time since `ms` (epoch ms): "just now", "3 min", "2 h", "3 d" / "baru saja", "3 mnt", "2 j", "3 hr". */
export function sinceLabel(ms: number, locale: "en" | "id", now: number): string {
  const u = UNITS[locale];
  const minutes = Math.floor(Math.max(0, now - ms) / 60_000);
  if (minutes < 1) return u.now;
  const n = new Intl.NumberFormat(u.tag);
  if (minutes < 60) return `${n.format(minutes)} ${u.min}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${n.format(hours)} ${u.h}`;
  return `${n.format(Math.floor(hours / 24))} ${u.d}`;
}
```

- [ ] **Step 5: Run the test**

Run: `bunx vitest run tests/unit/office-model.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add e2e/office-fixtures.ts src/lib/office/model.ts tests/unit/office-model.test.ts
git commit -m "feat(office): shared office model and deterministic fixtures"
```

### Task 4: Shared poller (`src/lib/office/poll.ts`)

**Files:**
- Create: `src/lib/office/poll.ts`
- Test: `tests/unit/office-poll.test.ts`

**Interfaces:**
- Consumes: `OFFICE_PATH`, `parseOfficeResponse`, `OfficeSnapshotV1` (`./protocol`), `OFFICE_FIXTURES` (`./fixtures`, test only).
- Produces (fixed for PR 4):
  - `POLL = { activeMs: 10_000, restingMs: 30_000, idleStopMs: 600_000, keepLastMs: 60_000 } as const`
  - `type OfficeFeedStatus = "idle" | "loading" | "ready" | "offline" | "disabled"`
  - `interface OfficeFeed { status: OfficeFeedStatus; snapshot: OfficeSnapshotV1 | null; fetchedAt: number }`
  - `interface OfficePoller { start(): void; stop(): void; touch(): void; feed(): OfficeFeed; subscribe(listener: (feed: OfficeFeed) => void): () => void }`
  - `createOfficePoller(opts?: { fetcher?: typeof fetch; now?: () => number; visible?: () => boolean; setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (id: unknown) => void }): OfficePoller`
  - `pollInterval(feed: OfficeFeed): number`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/office-poll.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OFFICE_FIXTURES } from "@/lib/office/fixtures";
import { createOfficePoller, POLL, pollInterval, type OfficeFeed } from "@/lib/office/poll";
import { OFFICE_PATH } from "@/lib/office/protocol";
import { officeDesk, officeSnapshot, statesA } from "../../e2e/office-fixtures";

const T0 = 1_800_000_000_000;
type Reply = { status: number; body?: unknown };

/**
 * A fetch stand-in that answers from `replies` (the last one repeats) and records each call. It returns a minimal
 * response object (status and json) rather than a real `Response`, so no body stream depends on faked timers.
 */
function fakeFetch(replies: Reply[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    return { status: r.status, json: async () => r.body ?? null } as unknown as Response;
  });
  return { fetcher: fetcher as unknown as typeof fetch, calls };
}

const asleep = (now: number) => officeSnapshot([officeDesk(0, "codex", "asleep", "resting", now)], now);

beforeEach(() => vi.useFakeTimers({ now: T0 }));
afterEach(() => vi.useRealTimers());

describe("createOfficePoller", () => {
  it("fetches /api/office at once (JSON, no credentials) and every 10 s while a desk is awake", async () => {
    const { fetcher, calls } = fakeFetch([{ status: 200, body: statesA(T0) }]);
    const poller = createOfficePoller({ fetcher });
    const seen: OfficeFeed[] = [];
    poller.subscribe((feed) => seen.push(feed));
    poller.start();
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(OFFICE_PATH);
    expect(calls[0].init).toEqual({ headers: { accept: "application/json" }, credentials: "omit" });
    expect(poller.feed()).toMatchObject({ status: "ready", fetchedAt: T0 });
    expect(seen.map((f) => f.status)).toEqual(["loading", "ready"]);
    await vi.advanceTimersByTimeAsync(POLL.activeMs);
    expect(calls).toHaveLength(2);
  });

  it("slows to 30 s when every desk is asleep, the feed is semi-live or off, or there is no snapshot", async () => {
    expect(pollInterval({ status: "ready", snapshot: asleep(T0), fetchedAt: T0 })).toBe(POLL.restingMs);
    expect(pollInterval({ status: "ready", snapshot: { ...statesA(T0), mode: "semi-live" }, fetchedAt: T0 })).toBe(POLL.restingMs);
    expect(pollInterval({ status: "ready", snapshot: { ...statesA(T0), mode: "off" }, fetchedAt: T0 })).toBe(POLL.restingMs);
    expect(pollInterval({ status: "idle", snapshot: null, fetchedAt: 0 })).toBe(POLL.restingMs);
    const { fetcher, calls } = fakeFetch([{ status: 200, body: asleep(T0) }]);
    const poller = createOfficePoller({ fetcher });
    poller.start();
    await vi.advanceTimersByTimeAsync(POLL.activeMs);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(POLL.restingMs - POLL.activeMs);
    expect(calls).toHaveLength(2);
  });

  it("does not fetch while the page is hidden and fetches on the first tick after it shows again", async () => {
    let visible = false;
    const { fetcher, calls } = fakeFetch([{ status: 200, body: statesA(T0) }]);
    const poller = createOfficePoller({ fetcher, visible: () => visible });
    poller.start();
    await vi.advanceTimersByTimeAsync(POLL.restingMs * 2);
    expect(calls).toHaveLength(0);
    visible = true;
    await vi.advanceTimersByTimeAsync(POLL.restingMs);
    expect(calls).toHaveLength(1);
  });

  it("stops after 10 minutes without visitor input and restarts at once on touch()", async () => {
    const { fetcher, calls } = fakeFetch([{ status: 200, body: asleep(T0) }]);
    const poller = createOfficePoller({ fetcher });
    poller.start();
    await vi.advanceTimersByTimeAsync(POLL.idleStopMs);
    expect(calls).toHaveLength(POLL.idleStopMs / POLL.restingMs);
    await vi.advanceTimersByTimeAsync(POLL.restingMs * 4);
    expect(calls).toHaveLength(POLL.idleStopMs / POLL.restingMs);
    poller.touch();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(POLL.idleStopMs / POLL.restingMs + 1);
  });

  it("keeps the last good snapshot for 60 s after errors, then reports offline and keeps it for the last known events", async () => {
    const good = statesA(T0);
    const { fetcher } = fakeFetch([{ status: 200, body: good }, { status: 500 }]);
    const poller = createOfficePoller({ fetcher });
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    for (let s = 1; s < POLL.keepLastMs / POLL.activeMs; s++) {
      await vi.advanceTimersByTimeAsync(POLL.activeMs);
      expect(poller.feed()).toMatchObject({ status: "ready", fetchedAt: T0 });
      expect(poller.feed().snapshot).toEqual(good);
    }
    await vi.advanceTimersByTimeAsync(POLL.activeMs);
    expect(poller.feed().status).toBe("offline");
    expect(poller.feed().snapshot).toEqual(good);
  });

  it("treats 204, a non-200 status and an invalid body as errors, and { enabled: false } as disabled", async () => {
    for (const reply of [{ status: 204 }, { status: 503, body: {} }, { status: 200, body: { v: 9 } }] satisfies Reply[]) {
      const { fetcher } = fakeFetch([reply]);
      const poller = createOfficePoller({ fetcher });
      poller.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(poller.feed().status, JSON.stringify(reply)).toBe("offline");
      poller.stop();
    }
    const { fetcher } = fakeFetch([{ status: 200, body: OFFICE_FIXTURES.disabled }]);
    const poller = createOfficePoller({ fetcher });
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.feed()).toMatchObject({ status: "disabled", snapshot: null });
  });

  it("stop() ends the timers but keeps the feed; start() fetches again at once; unsubscribe stops notifications", async () => {
    const { fetcher, calls } = fakeFetch([{ status: 200, body: statesA(T0) }]);
    const poller = createOfficePoller({ fetcher });
    const listener = vi.fn();
    const off = poller.subscribe(listener);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    poller.stop();
    await vi.advanceTimersByTimeAsync(POLL.restingMs * 3);
    expect(calls).toHaveLength(1);
    expect(poller.feed().status).toBe("ready");
    off();
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bunx vitest run tests/unit/office-poll.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/office/poll"`.

- [ ] **Step 3: Write the poller**

Create `src/lib/office/poll.ts`:

```ts
import { OFFICE_PATH, parseOfficeResponse, type OfficeSnapshotV1 } from "./protocol";

/**
 * Agent Office polling (owner decision D6, spec section 8), shared by the 3D office on L1 and the Classic home card.
 * Pure of React and three; timers, the clock, the page visibility and fetch are injectable for tests.
 */
export const POLL = { activeMs: 10_000, restingMs: 30_000, idleStopMs: 600_000, keepLastMs: 60_000 } as const;

export type OfficeFeedStatus = "idle" | "loading" | "ready" | "offline" | "disabled";

export interface OfficeFeed {
  status: OfficeFeedStatus;
  snapshot: OfficeSnapshotV1 | null;
  /** `now()` of the last good response (0 before any). */
  fetchedAt: number;
}

export interface OfficePoller {
  /** Begin polling now (idempotent). */
  start(): void;
  /** Stop timers (keeps the last feed). */
  stop(): void;
  /** Visitor input: resets the 10 min idle stop, restarts if it had stopped for idleness. */
  touch(): void;
  feed(): OfficeFeed;
  subscribe(listener: (feed: OfficeFeed) => void): () => void;
}

export interface OfficePollerOptions {
  fetcher?: typeof fetch;
  now?: () => number;
  visible?: () => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

const IDLE: OfficeFeed = { status: "idle", snapshot: null, fetchedAt: 0 };

function pageVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

/** activeMs while a desk of a live snapshot is awake; restingMs for semi-live, off, every desk asleep or no snapshot. */
export function pollInterval(feed: OfficeFeed): number {
  const s = feed.snapshot;
  return s && s.mode === "live" && s.desks.some((d) => d.state !== "asleep") ? POLL.activeMs : POLL.restingMs;
}

export function createOfficePoller(opts: OfficePollerOptions = {}): OfficePoller {
  const fetcher = opts.fetcher ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const now = opts.now ?? Date.now;
  const visible = opts.visible ?? pageVisible;
  const setTimer = opts.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const listeners = new Set<(feed: OfficeFeed) => void>();
  let current: OfficeFeed = IDLE;
  let running = false;
  let idleStopped = false;
  let lastTouch = 0;
  let timer: unknown = null;
  let generation = 0;

  const set = (next: OfficeFeed) => {
    current = next;
    for (const listener of listeners) listener(next);
  };
  const clear = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  async function load(): Promise<void> {
    if (current.status === "idle") set({ ...current, status: "loading" });
    try {
      const res = await fetcher(OFFICE_PATH, { headers: { accept: "application/json" }, credentials: "omit" });
      if (res.status !== 200) throw new Error(`GET ${OFFICE_PATH}: ${res.status}`);
      const parsed = parseOfficeResponse(await res.json());
      if (!parsed) throw new Error(`GET ${OFFICE_PATH}: invalid body`);
      set(parsed.enabled ? { status: "ready", snapshot: parsed, fetchedAt: now() } : { status: "disabled", snapshot: null, fetchedAt: now() });
    } catch {
      // The last good snapshot stays "ready" for keepLastMs, then the feed reports offline (it keeps the snapshot
      // for the last known GitHub events).
      const keep = current.snapshot !== null && now() - current.fetchedAt < POLL.keepLastMs;
      set({ ...current, status: keep ? "ready" : "offline" });
    }
  }

  async function tick(gen: number): Promise<void> {
    timer = null;
    if (!running || gen !== generation) return;
    if (now() - lastTouch >= POLL.idleStopMs) {
      running = false;
      idleStopped = true;
      return;
    }
    if (visible()) await load();
    if (!running || gen !== generation) return;
    timer = setTimer(() => void tick(gen), pollInterval(current));
  }

  const poller: OfficePoller = {
    start() {
      if (running) return;
      running = true;
      idleStopped = false;
      lastTouch = now();
      generation += 1;
      void tick(generation);
    },
    stop() {
      running = false;
      idleStopped = false;
      generation += 1;
      clear();
    },
    touch() {
      lastTouch = now();
      if (idleStopped) poller.start();
    },
    feed: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return poller;
}
```

- [ ] **Step 4: Run the test**

Run: `bunx vitest run tests/unit/office-poll.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/office/poll.ts tests/unit/office-poll.test.ts
git commit -m "feat(office): shared office poller with resting, idle stop and keep-last rules"
```

### Task 5: State looks, poses and the Rover rig

**Files:**
- Create: `src/experience/floors/lobby/office/officeVisual.ts`
- Create: `src/experience/floors/lobby/office/officeRig.ts`
- Test: `tests/unit/office-visual.test.ts`, `tests/unit/office-rig.test.ts`

**Interfaces:**
- Consumes: `STATE_TONE` (Task 3), `OfficeState`, `OfficeProgress` (protocol), `OfficeSlot`, `officeSlots` (Task 1), `FACE_W`, `FACE_H` (`rover/faceTexture.ts`, test only), three `Color`, `Euler`, `Matrix4`, `Quaternion`, `Vector3`.
- Produces:
  - `type FaceKind = "focus" | "look" | "scan" | "watch" | "wait" | "ask" | "happy" | "oops" | "sleep"`, `type ScreenKind = "code" | "dots" | "diff" | "progress" | "ci" | "question" | "check" | "cross" | "off"`
  - `OFFICE_STATE_STYLE: Record<OfficeState, { color: string; face: FaceKind; screen: ScreenKind }>`
  - `interface OfficePose { y; rx; ry; rz; armL; armR; tipScale }`, `stillPose(state): OfficePose`, `pose(state, t, phase, reduced): OfficePose`, `poseOffset(state, p): number`, `slotPhase(slot): number`, `STILL_T`, `CROSSFADE_S`, `OFFICE_ROVER`, `DESK_SCREEN`
  - `PARTS_PER_ROVER` (5), `TREADS_PER_ROVER` (2), `GLOW_PER_ROVER` (18), `CHIP_LIFT` (2.75), `roverFrame(slot, p, out: Matrix4): Matrix4`, `writeRover(frame, p, parts: Float32Array, slot: number, treads: Float32Array): void`, `writeFace(frame, positions: Float32Array, quad: number): void`, `writeDeskScreen(slot, positions, quad): void`, `writeGlow(slot, frame, state, progress, tipScale, t, reduced, camera: { x: number; z: number }, matrices, colors): void`, `chipAnchor(frame, out: { x: number; y: number; z: number }): void`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/office-visual.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { STATE_TONE } from "@/lib/office/model";
import { OFFICE_STATES } from "@/lib/office/protocol";
import { FACE_H, FACE_W } from "@/experience/rover/faceTexture";
import { DESK_SCREEN, OFFICE_ROVER, OFFICE_STATE_STYLE, pose, poseOffset, slotPhase, stillPose } from "@/experience/floors/lobby/office/officeVisual";

const TIMES = Array.from({ length: 60 }, (_, i) => i * 0.137);

describe("Agent Office state looks (owner design D5)", () => {
  it("gives each of the nine states its own face, screen and tone", () => {
    expect(new Set(OFFICE_STATES.map((s) => OFFICE_STATE_STYLE[s].face)).size).toBe(9);
    expect(new Set(OFFICE_STATES.map((s) => OFFICE_STATE_STYLE[s].screen)).size).toBe(9);
    for (const s of OFFICE_STATES) expect(OFFICE_STATE_STYLE[s].color).toBe(STATE_TONE[s]);
  });

  it("holds the still pose under reduced motion at every time", () => {
    for (const s of OFFICE_STATES) for (const t of TIMES) {
      expect(pose(s, t, slotPhase(2), true)).toEqual(stillPose(s));
      expect(poseOffset(s, pose(s, t, slotPhase(2), true))).toBe(0);
    }
  });

  it("animates the moving states with full motion: typing bob, sway, hop, shake", () => {
    const moves = (s: (typeof OFFICE_STATES)[number]) => Math.max(...TIMES.map((t) => poseOffset(s, pose(s, t, slotPhase(1), false))));
    for (const s of ["working", "thinking", "reviewing", "ci", "input", "done", "asleep"] as const) expect(moves(s), s).toBeGreaterThan(0.005);
    expect(Math.max(...TIMES.map((t) => pose("done", t, 0, false).y))).toBeGreaterThan(0.3);
    expect(Math.max(...TIMES.map((t) => Math.abs(pose("working", t, 0, false).armL)))).toBeGreaterThan(0.2);
    expect(Math.max(...TIMES.map((t) => pose("thinking", t, 0, false).tipScale))).toBeGreaterThan(1.3);
  });

  it("raises an arm for input, both arms when done, leans in for tests and slumps when failed or asleep", () => {
    expect(stillPose("input").armL).toBeLessThan(-1.5);
    expect(stillPose("done").armL).toBeLessThan(-1.5);
    expect(stillPose("done").armR).toBeLessThan(-1.5);
    expect(stillPose("testing").rx).toBeGreaterThan(0);
    expect(stillPose("failed").rx).toBeGreaterThan(stillPose("asleep").rx);
    expect(stillPose("asleep").y).toBeLessThan(0);
  });

  it("keeps the face quad at the rover face's 4:3 and the desk screen at the 256 x 160 cell's ratio", () => {
    expect(OFFICE_ROVER.face.w / OFFICE_ROVER.face.h).toBeCloseTo(FACE_W / FACE_H, 3);
    expect(DESK_SCREEN.w / DESK_SCREEN.h).toBeCloseTo(256 / 160, 3);
    expect(OFFICE_ROVER.face.z).toBeGreaterThanOrEqual(OFFICE_ROVER.head[5] / 2);
  });
});
```

Create `tests/unit/office-rig.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Color, Matrix4, Vector3 } from "three";
import { OFFICE, officeSlots } from "@/experience/floors/lobby/officeLayout";
import { CHIP_LIFT, chipAnchor, GLOW_PER_ROVER, PARTS_PER_ROVER, roverFrame, TREADS_PER_ROVER, writeDeskScreen, writeFace, writeGlow, writeRover } from "@/experience/floors/lobby/office/officeRig";
import { DESK_SCREEN, OFFICE_ROVER, OFFICE_STATE_STYLE, stillPose } from "@/experience/floors/lobby/office/officeVisual";

const slots = officeSlots();
const corner = (a: Float32Array, quad: number, k: number) => new Vector3().fromArray(a, (quad * 4 + k) * 3);

describe("Agent Office Rover rig", () => {
  it("puts the middle Rover's face on its head, facing the plaza (north)", () => {
    const frame = roverFrame(slots[2], stillPose("working"), new Matrix4());
    const positions = new Float32Array(4 * 3);
    writeFace(frame, positions, 0);
    const [bl, br, , tl] = [0, 1, 2, 3].map((k) => corner(positions, 0, k));
    for (let k = 0; k < 4; k++) expect(corner(positions, 0, k).z).toBeCloseTo(slots[2].rover.z - OFFICE_ROVER.face.z, 5);
    expect(Math.abs(bl.x - br.x)).toBeCloseTo(OFFICE_ROVER.face.w, 5);
    expect(tl.y - bl.y).toBeCloseTo(OFFICE_ROVER.face.h, 5);
    const normal = new Vector3().subVectors(br, bl).cross(new Vector3().subVectors(tl, bl)).normalize();
    expect(normal.z).toBeCloseTo(-1, 5);
    expect(bl.y).toBeGreaterThan(OFFICE.desk.top);
  });

  it("writes five light parts and two treads per Rover, and raises the arm for input", () => {
    const parts = new Float32Array(slots.length * PARTS_PER_ROVER * 16);
    const treads = new Float32Array(slots.length * TREADS_PER_ROVER * 16);
    const p = stillPose("input");
    writeRover(roverFrame(slots[0], p, new Matrix4()), p, parts, 0, treads);
    const armL = new Matrix4().fromArray(parts, 2 * 16);
    const at = new Vector3().setFromMatrixPosition(armL);
    expect(at.y).toBeCloseTo(OFFICE_ROVER.shoulder.y + OFFICE_ROVER.arm.d / 2, 1);
    expect(new Vector3().setFromMatrixPosition(new Matrix4().fromArray(treads, 0)).y).toBeCloseTo(OFFICE_ROVER.treads[0][1], 5);
  });

  it("stands each desk screen on its desk, inside the desk's width, facing the plaza", () => {
    const positions = new Float32Array(slots.length * 4 * 3);
    for (const s of slots) writeDeskScreen(s, positions, s.slot);
    for (const s of slots) {
      for (let k = 0; k < 4; k++) {
        const c = corner(positions, s.slot, k);
        expect(c.y).toBeGreaterThanOrEqual(OFFICE.desk.top);
        expect(Math.hypot(c.x - s.desk.x, c.z - s.desk.z)).toBeLessThanOrEqual(OFFICE.desk.w / 2 + 0.05);
      }
      const bl = corner(positions, s.slot, 0);
      const br = corner(positions, s.slot, 1);
      const tl = corner(positions, s.slot, 3);
      const n = new Vector3().subVectors(br, bl).cross(new Vector3().subVectors(tl, bl)).normalize();
      const toCentre = new Vector3(OFFICE.center.x - s.desk.x, 0, OFFICE.center.z - s.desk.z).normalize();
      expect(n.dot(toCentre)).toBeGreaterThan(0.85);
    }
    expect(DESK_SCREEN.y - DESK_SCREEN.h / 2).toBeGreaterThanOrEqual(OFFICE.desk.top);
  });

  it("lights CI progress dots from done of total, hides them in other states and dims a sleeping tip", () => {
    const matrices = new Float32Array(GLOW_PER_ROVER * 16);
    const colors = new Float32Array(GLOW_PER_ROVER * 3);
    const frame = roverFrame(slots[0], stillPose("ci"), new Matrix4());
    writeGlow(slots[0], frame, "ci", { done: 6, total: 12 }, 1, 0, true, OFFICE.stop, matrices, colors);
    // Float32 colors: compare the red channel with a tolerance (unlit dots are the tone at 15%).
    const tone = new Color(OFFICE_STATE_STYLE.ci.color);
    const lit = Array.from({ length: OFFICE_ROVER.progress.count }, (_, i) => Math.abs(colors[(2 + i) * 3] - tone.r) < 1e-5).filter(Boolean).length;
    expect(lit).toBe(OFFICE_ROVER.progress.count / 2);
    writeGlow(slots[0], frame, "working", null, 1, 0, true, OFFICE.stop, matrices, colors);
    const scale = new Vector3().setFromMatrixScale(new Matrix4().fromArray(matrices, 2 * 16));
    expect(scale.x).toBe(0);
    writeGlow(slots[0], frame, "asleep", null, 1, 0, true, OFFICE.stop, matrices, colors);
    expect(Math.abs(colors[0] - new Color("#3b3f5c").r)).toBeLessThan(1e-5);
  });

  it("anchors the chip above the head", () => {
    const out = { x: 0, y: 0, z: 0 };
    chipAnchor(roverFrame(slots[3], stillPose("working"), new Matrix4()), out);
    expect(out).toEqual({ x: expect.closeTo(slots[3].rover.x, 5), y: expect.closeTo(CHIP_LIFT, 5), z: expect.closeTo(slots[3].rover.z, 5) });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bunx vitest run tests/unit/office-visual.test.ts tests/unit/office-rig.test.ts`
Expected: FAIL with `Failed to resolve import "@/experience/floors/lobby/office/officeVisual"`.

- [ ] **Step 3: Write the looks and poses**

Create `src/experience/floors/lobby/office/officeVisual.ts`:

```ts
import { STATE_TONE } from "@/lib/office/model";
import type { OfficeState } from "@/lib/office/protocol";

/**
 * Agent Office state looks (owner design D5, the approved mock's state table, eyes and pose switch): a face, a
 * desk screen and a tone per state, the Rover's pose over time, and the part sizes. Pure (no three).
 */
export type FaceKind = "focus" | "look" | "scan" | "watch" | "wait" | "ask" | "happy" | "oops" | "sleep";
export type ScreenKind = "code" | "dots" | "diff" | "progress" | "ci" | "question" | "check" | "cross" | "off";

export interface OfficeStateStyle {
  color: string;
  face: FaceKind;
  screen: ScreenKind;
}

export const OFFICE_STATE_STYLE: Record<OfficeState, OfficeStateStyle> = {
  working: { color: STATE_TONE.working, face: "focus", screen: "code" },
  thinking: { color: STATE_TONE.thinking, face: "look", screen: "dots" },
  reviewing: { color: STATE_TONE.reviewing, face: "scan", screen: "diff" },
  testing: { color: STATE_TONE.testing, face: "watch", screen: "progress" },
  ci: { color: STATE_TONE.ci, face: "wait", screen: "ci" },
  input: { color: STATE_TONE.input, face: "ask", screen: "question" },
  done: { color: STATE_TONE.done, face: "happy", screen: "check" },
  failed: { color: STATE_TONE.failed, face: "oops", screen: "cross" },
  asleep: { color: STATE_TONE.asleep, face: "sleep", screen: "off" },
};

/** Body offset (y), pitch toward the desk (rx, positive leans forward), sway (ry), roll (rz), arm angles about x (negative raises) and the antenna tip scale. */
export interface OfficePose {
  y: number;
  rx: number;
  ry: number;
  rz: number;
  armL: number;
  armR: number;
  tipScale: number;
}

/** Faces and screens under reduced motion are drawn at this fixed time (a frame that reads well), never animated. */
export const STILL_T = 0.5;
/** Reduced motion: a state change crossfades the face and the screen over this long instead of cutting. */
export const CROSSFADE_S = 0.4;
/** A stable phase per slot, so the five Rovers never move in step. */
export const slotPhase = (slot: number): number => slot * 1.7 + 0.4;

const REST: OfficePose = { y: 0, rx: 0, ry: 0, rz: 0, armL: 0, armR: 0, tipScale: 1 };

/** The pose a state holds under reduced motion (and the reference the bob probe measures from). */
export function stillPose(state: OfficeState): OfficePose {
  switch (state) {
    case "thinking":
      return { ...REST, armR: -0.9 };
    case "testing":
      return { ...REST, rx: 0.08, armL: -0.3, armR: -0.3 };
    case "input":
      return { ...REST, armL: -1.6 };
    case "done":
      return { ...REST, armL: -1.8, armR: -1.8 };
    case "failed":
      return { ...REST, y: -0.05, rx: 0.22 };
    case "asleep":
      return { ...REST, y: -0.06, rx: 0.14 };
    default:
      return { ...REST };
  }
}

/** The pose at time `t` (s): typing bob, head tilt, side to side, leaning in, idle sway, a raised arm, a hop, a slump with a shake, a sleepy breath. */
export function pose(state: OfficeState, t: number, phase: number, reduced: boolean): OfficePose {
  const p = stillPose(state);
  if (reduced) return p;
  switch (state) {
    case "working":
      p.y = Math.abs(Math.sin(t * 9 + phase)) * 0.04;
      p.armL = Math.sin(t * 14) * 0.25;
      p.armR = Math.sin(t * 14 + 2) * 0.25;
      break;
    case "thinking":
      p.rz = Math.sin(t * 1.2 + phase) * 0.08;
      p.tipScale = 1 + Math.sin(t * 5) * 0.35;
      break;
    case "reviewing":
      p.ry = Math.sin(t * 0.9 + phase) * 0.25;
      break;
    case "ci":
      p.y = Math.sin(t * 2 + phase) * 0.03;
      p.armL = Math.sin(t * 3) * 0.1;
      p.armR = Math.sin(t * 3 + 1) * 0.1;
      break;
    case "input":
      p.rz = Math.sin(t * 2 + phase) * 0.05;
      break;
    case "done":
      p.y = Math.max(0, Math.sin(t * 6 + phase)) * 0.35;
      p.ry = Math.sin(t * 3 + phase) * 0.2;
      break;
    case "failed":
      p.rz = Math.sin(t * 20) * (Math.sin(t * 1.5 + phase) > 0.8 ? 0.04 : 0);
      break;
    case "asleep":
      p.y += Math.sin(t * 1.1 + phase) * 0.015;
      break;
    default:
      break;
  }
  return p;
}

/** Largest body offset from the state's still pose (0 under reduced motion): the `bob` probe. */
export function poseOffset(state: OfficeState, p: OfficePose): number {
  const s = stillPose(state);
  return Math.max(Math.abs(p.y - s.y), Math.abs(p.rx - s.rx), Math.abs(p.ry - s.ry), Math.abs(p.rz - s.rz));
}

/** Rover parts in its own frame (forward +z, toward the plaza) as unit-box instances: x, y, z, w, h, d. */
export const OFFICE_ROVER = {
  treads: [
    [-0.6, 0.22, 0, 0.3, 0.44, 1.0],
    [0.6, 0.22, 0, 0.3, 0.44, 1.0],
  ],
  chest: [0, 0.7, 0, 1.2, 0.5, 0.9],
  head: [0, 1.45, 0, 1.1, 1.0, 0.85],
  stalk: [0.35, 2.15, -0.1, 0.05, 0.5, 0.05],
  shoulder: { x: 0.68, y: 0.85, z: 0.2 },
  arm: { w: 0.14, h: 0.14, d: 0.6 },
  /** The face screen (a 128 x 96 atlas cell) just in front of the head. */
  face: { y: 1.47, z: 0.43, w: 0.86, h: 0.645 },
  tip: { x: 0.35, y: 2.45, z: -0.1, size: 0.34 },
  halo: { size: 2.4, y: 0.03 },
  progress: { count: 16, r: 1.2, size: 0.16, y: 0.04 },
} as const;

/** The desk screen (a 256 x 160 atlas cell) in the desk's frame: beside the Rover's face, toed in toward the middle. */
export const DESK_SCREEN = { x: 0.8, y: 1.28, z: 0.1, w: 0.96, h: 0.6, toe: -0.3 } as const;
```

- [ ] **Step 4: Write the rig**

Create `src/experience/floors/lobby/office/officeRig.ts`:

```ts
import { Color, Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { OfficeProgress, OfficeState } from "@/lib/office/protocol";
import type { OfficeSlot } from "../officeLayout";
import { DESK_SCREEN, OFFICE_ROVER, OFFICE_STATE_STYLE, type OfficePose } from "./officeVisual";

/**
 * Instance matrices and quad corners for the office Rovers, written in place every frame the office is in view
 * (no allocation: module temporaries). Chest, head, two arms and the antenna stalk share one instanced mesh,
 * the treads another; the faces and desk screens are corners of one merged quad mesh; the antenna tips, the
 * halos and the progress dots are one instanced holo mesh.
 */
export const PARTS_PER_ROVER = 5;
export const TREADS_PER_ROVER = 2;
export const GLOW_PER_ROVER = 2 + OFFICE_ROVER.progress.count;
/** The HTML chip floats this high above the Rover's spot (above the antenna). */
export const CHIP_LIFT = 2.75;

const M = new Matrix4();
const A = new Matrix4();
const B = new Matrix4();
const Q = new Quaternion();
const E = new Euler(0, 0, 0, "YXZ");
const V = new Vector3();
const S = new Vector3();
const T = new Vector3();
const ONE = new Vector3(1, 1, 1);
const C = new Color();
const FLAT = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));
const SLEEP_TIP = "#3b3f5c";
type Part = readonly [number, number, number, number, number, number];

/** The Rover's frame: its spot, turned to face the arc centre, plus the pose (bob, pitch, sway, roll). */
export function roverFrame(slot: OfficeSlot, p: OfficePose, out: Matrix4): Matrix4 {
  E.set(p.rx, slot.yaw + p.ry, p.rz, "YXZ");
  return out.compose(T.set(slot.rover.x, p.y, slot.rover.z), Q.setFromEuler(E), ONE);
}

function box(frame: Matrix4, part: Part, target: Float32Array, index: number): void {
  A.compose(V.set(part[0], part[1], part[2]), Q.identity(), S.set(part[3], part[4], part[5]));
  M.multiplyMatrices(frame, A).toArray(target, index * 16);
}

export function writeRover(frame: Matrix4, p: OfficePose, parts: Float32Array, slot: number, treads: Float32Array): void {
  const R = OFFICE_ROVER;
  const at = slot * PARTS_PER_ROVER;
  box(frame, R.chest, parts, at);
  box(frame, R.head, parts, at + 1);
  const arms: readonly [number, number][] = [
    [-1, p.armL],
    [1, p.armR],
  ];
  arms.forEach(([side, angle], i) => {
    // Shoulder pivot: turn about x, then the arm reaches forward half its length.
    A.makeTranslation(side * R.shoulder.x, R.shoulder.y, R.shoulder.z);
    A.multiply(B.makeRotationX(angle));
    A.multiply(B.makeTranslation(0, 0, R.arm.d / 2));
    A.multiply(B.makeScale(R.arm.w, R.arm.h, R.arm.d));
    M.multiplyMatrices(frame, A).toArray(parts, (at + 2 + i) * 16);
  });
  box(frame, R.stalk, parts, at + 4);
  box(frame, R.treads[0], treads, slot * TREADS_PER_ROVER);
  box(frame, R.treads[1], treads, slot * TREADS_PER_ROVER + 1);
}

/** Four corners (bottom left, bottom right, top right, top left, counter-clockwise from the front) of a w x h quad facing the frame's +z. */
function writeQuad(frame: Matrix4, cx: number, cy: number, cz: number, w: number, h: number, positions: Float32Array, quad: number): void {
  const xs = [-w / 2, w / 2, w / 2, -w / 2];
  const ys = [-h / 2, -h / 2, h / 2, h / 2];
  for (let k = 0; k < 4; k++) V.set(cx + xs[k], cy + ys[k], cz).applyMatrix4(frame).toArray(positions, (quad * 4 + k) * 3);
}

export function writeFace(frame: Matrix4, positions: Float32Array, quad: number): void {
  const f = OFFICE_ROVER.face;
  writeQuad(frame, 0, f.y, f.z, f.w, f.h, positions, quad);
}

const DESK = new Matrix4();
export function writeDeskScreen(slot: OfficeSlot, positions: Float32Array, quad: number): void {
  E.set(0, slot.yaw, 0, "YXZ");
  DESK.compose(T.set(slot.desk.x, 0, slot.desk.z), Q.setFromEuler(E), ONE);
  DESK.multiply(A.makeTranslation(DESK_SCREEN.x, DESK_SCREEN.y, DESK_SCREEN.z));
  DESK.multiply(A.makeRotationY(DESK_SCREEN.toe));
  writeQuad(DESK, 0, 0, 0, DESK_SCREEN.w, DESK_SCREEN.h, positions, quad);
}

/**
 * One Rover's glow instances: the antenna tip (turned to the camera; dim when asleep), the halo on the floor, and
 * the progress dots around it (CI jobs done of total; a moving run of four while tests or a CI wait without numbers run).
 */
export function writeGlow(
  slot: OfficeSlot,
  frame: Matrix4,
  state: OfficeState,
  progress: OfficeProgress | null,
  tipScale: number,
  t: number,
  reduced: boolean,
  camera: { x: number; z: number },
  matrices: Float32Array,
  colors: Float32Array,
): void {
  const R = OFFICE_ROVER;
  const base = slot.slot * GLOW_PER_ROVER;
  const tone = OFFICE_STATE_STYLE[state].color;
  const asleep = state === "asleep";
  V.set(R.tip.x, R.tip.y, R.tip.z).applyMatrix4(frame);
  E.set(0, Math.atan2(camera.x - V.x, camera.z - V.z), 0, "YXZ");
  M.compose(V, Q.setFromEuler(E), S.setScalar(R.tip.size * tipScale)).toArray(matrices, base * 16);
  C.set(asleep ? SLEEP_TIP : tone).toArray(colors, base * 3);
  M.compose(T.set(slot.rover.x, R.halo.y, slot.rover.z), FLAT, S.setScalar(R.halo.size)).toArray(matrices, (base + 1) * 16);
  C.set(tone).multiplyScalar(asleep ? 0.08 : 0.35).toArray(colors, (base + 1) * 3);
  const n = R.progress.count;
  const show = state === "ci" || state === "testing";
  const lit = state === "ci" && progress && progress.total > 0 ? Math.round((progress.done / progress.total) * n) : -1;
  const head = reduced ? 0 : Math.floor(t * 6) % n;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    T.set(slot.rover.x + Math.sin(a) * R.progress.r, R.progress.y, slot.rover.z + Math.cos(a) * R.progress.r);
    M.compose(T, FLAT, S.setScalar(show ? R.progress.size : 0)).toArray(matrices, (base + 2 + i) * 16);
    const on = lit >= 0 ? i < lit : (i - head + n) % n < 4;
    C.set(tone).multiplyScalar(on ? 1 : 0.15).toArray(colors, (base + 2 + i) * 3);
  }
}

/** The chip anchor above the Rover (it follows the bob and the hop). */
export function chipAnchor(frame: Matrix4, out: { x: number; y: number; z: number }): void {
  V.set(0, CHIP_LIFT, 0).applyMatrix4(frame);
  out.x = V.x;
  out.y = V.y;
  out.z = V.z;
}
```

- [ ] **Step 5: Run the tests**

Run: `bunx vitest run tests/unit/office-visual.test.ts tests/unit/office-rig.test.ts`
Expected: PASS (5 and 5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/experience/floors/lobby/office/officeVisual.ts src/experience/floors/lobby/office/officeRig.ts tests/unit/office-visual.test.ts tests/unit/office-rig.test.ts
git commit -m "feat(office): state looks, poses and the instanced Rover rig"
```

### Task 6: Face and desk-screen atlas drawing

**Files:**
- Create: `tests/helpers/fake-canvas.ts`
- Create: `src/experience/floors/lobby/office/officeAtlas.ts`
- Test: `tests/unit/office-atlas.test.ts`

**Interfaces:**
- Consumes: `FACE_W`, `FACE_H` (`rover/faceTexture.ts`), `FaceKind`, `ScreenKind` (Task 5), `OfficeProgress` (protocol).
- Produces:
  - `ATLAS = { w: 1024, h: 512 }`, `SCREEN_CELL = { w: 256, h: 160 }`, `interface Cell { x; y; w; h }`, `faceCell(slot): Cell`, `screenCell(slot): Cell`, `cellUv(cell): [u0, v0, u1, v1]`, `circlePath(ctx, x, y, r): void`, `CODE_LINES: readonly string[]`
  - `interface ScreenInput { kind: ScreenKind; color: string; activity: string; progress: OfficeProgress | null; job: string | null }`, `interface ScreenTexts { waiting: string; jobs: (done: number, total: number) => string; sleep: string }`, `interface CanvasFonts { mono: string; sans: string }`
  - `drawFace(ctx, cell, kind, color, t, phase, font: string, alpha?: number, still?: boolean): void`
  - `drawScreen(ctx, cell, input: ScreenInput, texts: ScreenTexts, t, phase, fonts: CanvasFonts, alpha?: number): void`
  - `faceKey(kind, t, phase, fps, still): string`, `screenKey(input, t, fps, still): string`
  - `recordingContext(): { ctx: CanvasRenderingContext2D; calls: CanvasCall[]; texts(): string[]; named(name: string): CanvasCall[] }`

- [ ] **Step 1: Write the recording context helper**

Create `tests/helpers/fake-canvas.ts`:

```ts
/**
 * A CanvasRenderingContext2D stand-in that records every call and property write (node has no canvas), so pure
 * drawing functions can be tested: `texts()` lists `fillText` strings in order, `named(m)` the calls of one method.
 */
export interface CanvasCall {
  name: string;
  args: unknown[];
}

export function recordingContext(): { ctx: CanvasRenderingContext2D; calls: CanvasCall[]; texts: () => string[]; named: (name: string) => CanvasCall[] } {
  const calls: CanvasCall[] = [];
  const state: Record<string, unknown> = {};
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_, key) {
      if (typeof key !== "string") return undefined;
      if (key in state) return state[key];
      if (key === "measureText") return (text: string) => ({ width: text.length * 7 });
      return (...args: unknown[]) => {
        calls.push({ name: key, args });
      };
    },
    set(_, key, value) {
      if (typeof key !== "string") return false;
      state[key] = value;
      calls.push({ name: `set:${key}`, args: [value] });
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return {
    ctx,
    calls,
    texts: () => calls.filter((c) => c.name === "fillText").map((c) => String(c.args[0])),
    named: (name: string) => calls.filter((c) => c.name === name),
  };
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/office-atlas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FACE_H, FACE_W } from "@/experience/rover/faceTexture";
import { ATLAS, cellUv, CODE_LINES, drawFace, drawScreen, faceCell, faceKey, screenCell, screenKey, type ScreenInput } from "@/experience/floors/lobby/office/officeAtlas";
import { OFFICE_STATE_STYLE } from "@/experience/floors/lobby/office/officeVisual";
import { OFFICE_STATES } from "@/lib/office/protocol";
import { recordingContext } from "../helpers/fake-canvas";

const FONTS = { mono: "monospace", sans: "sans-serif" };
const TEXTS = { waiting: "Waiting for Kurniadi", jobs: (d: number, t: number) => `${d} of ${t} jobs`, sleep: "z Z" };
const input = (state: (typeof OFFICE_STATES)[number], extra: Partial<ScreenInput> = {}): ScreenInput => ({
  kind: OFFICE_STATE_STYLE[state].screen,
  color: OFFICE_STATE_STYLE[state].color,
  activity: "Editing",
  progress: null,
  job: null,
  ...extra,
});

describe("Agent Office atlas", () => {
  it("packs five 128 x 96 faces and five 256 x 160 screens into one 1024 x 512 canvas without overlap", () => {
    const cells = [0, 1, 2, 3, 4].flatMap((slot) => [faceCell(slot), screenCell(slot)]);
    expect(faceCell(0)).toMatchObject({ w: FACE_W, h: FACE_H });
    for (const c of cells) {
      expect(c.x + c.w).toBeLessThanOrEqual(ATLAS.w);
      expect(c.y + c.h).toBeLessThanOrEqual(ATLAS.h);
    }
    for (let i = 0; i < cells.length; i++)
      for (let k = i + 1; k < cells.length; k++) {
        const a = cells[i];
        const b = cells[k];
        expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
      }
    expect(cellUv(faceCell(0))).toEqual([0, 1 - FACE_H / ATLAS.h, FACE_W / ATLAS.w, 1]);
  });

  it("draws every face kind inside its cell, background first", () => {
    for (const state of OFFICE_STATES) {
      const rec = recordingContext();
      const cell = faceCell(3);
      drawFace(rec.ctx, cell, OFFICE_STATE_STYLE[state].face, OFFICE_STATE_STYLE[state].color, 1.2, 0.4, "monospace");
      expect(rec.named("translate")[0].args).toEqual([cell.x, cell.y]);
      expect(rec.named("fillRect")[0].args).toEqual([0, 0, FACE_W, FACE_H]);
      expect(rec.named("restore")).toHaveLength(1);
    }
  });

  it("shows a generic question card for input, never prompt text", () => {
    const rec = recordingContext();
    drawScreen(rec.ctx, screenCell(0), input("input", { activity: "Asking Kurniadi" }), TEXTS, 1, 0, FONTS);
    expect(rec.texts()).toEqual(["Asking Kurniadi", "Waiting for Kurniadi", "?"]);
  });

  it("shows CI progress as done of total jobs, and an indeterminate bar with no counts while tests run", () => {
    const ci = recordingContext();
    drawScreen(ci.ctx, screenCell(1), input("ci", { progress: { done: 7, total: 12 } }), TEXTS, 1, 0, FONTS);
    expect(ci.texts()).toContain("7 of 12 jobs");
    expect(ci.named("fillRect").some((c) => Math.abs((c.args[2] as number) - (256 - 24) * (7 / 12)) < 1e-6)).toBe(true);
    const testing = recordingContext();
    drawScreen(testing.ctx, screenCell(2), input("testing", { activity: "Testing" }), TEXTS, 3.3, 0, FONTS);
    expect(testing.texts()).toEqual(["Testing"]);
  });

  it("names the failed job, sleeps with z Z, and scrolls only the invented code lines", () => {
    const failed = recordingContext();
    drawScreen(failed.ctx, screenCell(3), input("failed", { job: "Build, CV and e2e" }), TEXTS, 1, 0, FONTS);
    expect(failed.texts()).toContain("Build, CV and e2e");
    const asleep = recordingContext();
    drawScreen(asleep.ctx, screenCell(4), input("asleep"), TEXTS, 1, 0, FONTS);
    expect(asleep.texts()).toEqual(["z Z"]);
    const working = recordingContext();
    drawScreen(working.ctx, screenCell(0), input("working"), TEXTS, 7.7, 1.3, FONTS);
    const lines = working.texts().slice(1);
    expect(lines).toHaveLength(6);
    for (const line of lines) expect(CODE_LINES.some((code) => code.startsWith(line))).toBe(true);
  });

  it("changes frame keys with time only for animated kinds and never under reduced motion", () => {
    expect(faceKey("sleep", 1, 0, 10, false)).toBe(faceKey("sleep", 2, 0, 10, false));
    expect(faceKey("look", 1, 0, 10, false)).not.toBe(faceKey("look", 1.2, 0, 10, false));
    expect(faceKey("look", 1, 0, 10, true)).toBe(faceKey("look", 9, 0, 10, true));
    const code = input("working");
    expect(screenKey(code, 1, 10, false)).not.toBe(screenKey(code, 1.2, 10, false));
    expect(screenKey(code, 1, 10, true)).toBe(screenKey(code, 5, 10, true));
    const ci = input("ci", { progress: { done: 3, total: 12 } });
    expect(screenKey(ci, 1, 10, false)).toBe(screenKey(ci, 4, 10, false));
    expect(screenKey(ci, 1, 10, false)).not.toBe(screenKey({ ...ci, progress: { done: 4, total: 12 } }, 1, 10, false));
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `bunx vitest run tests/unit/office-atlas.test.ts`
Expected: FAIL with `Failed to resolve import "@/experience/floors/lobby/office/officeAtlas"`.

- [ ] **Step 4: Write the atlas module**

Create `src/experience/floors/lobby/office/officeAtlas.ts`:

```ts
import type { OfficeProgress } from "@/lib/office/protocol";
import { FACE_H, FACE_W } from "../../../rover/faceTexture";
import type { FaceKind, ScreenKind } from "./officeVisual";

/**
 * The office's one canvas atlas: five Rover faces (128 x 96, like the player Rover's face) and five desk screens
 * (256 x 160), drawn by the pure functions below (any CanvasRenderingContext2D; tests use a recording fake).
 * Faces and screens are a port of the approved mock's eyes() and drawMonitor(), except the input screen, which
 * shows a generic card ("Waiting for Kurniadi"), never a question or prompt (owner decision D3).
 */
export const ATLAS = { w: 1024, h: 512 } as const;
export const SCREEN_CELL = { w: 256, h: 160 } as const;

export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function faceCell(slot: number): Cell {
  return { x: slot * FACE_W, y: 0, w: FACE_W, h: FACE_H };
}

export function screenCell(slot: number): Cell {
  return { x: (slot % 4) * SCREEN_CELL.w, y: FACE_H + Math.floor(slot / 4) * SCREEN_CELL.h, w: SCREEN_CELL.w, h: SCREEN_CELL.h };
}

/** UV rect [u0, v0, u1, v1] of a cell; a CanvasTexture flips Y, so v runs from the bottom. */
export function cellUv(c: Cell): [number, number, number, number] {
  return [c.x / ATLAS.w, 1 - (c.y + c.h) / ATLAS.h, (c.x + c.w) / ATLAS.w, 1 - c.y / ATLAS.h];
}

/** A full circle on the current path (moveTo first, so several circles never join). */
export function circlePath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/** Invented code for the working screen: generic snippets, never real data. */
export const CODE_LINES: readonly string[] = [
  "const rover = await boot(hq)",
  "export function plan(steps) {",
  "  return steps.map(run)",
  "if (ready) render(scene)",
  "test(\"desk lights up\", go)",
  "await build({ fast: true })",
  "for (const d of desks) d.wake()",
];

const FACE_BG = "#0b1020";

export function drawFace(ctx: CanvasRenderingContext2D, cell: Cell, kind: FaceKind, color: string, t: number, phase: number, font: string, alpha = 1, still = false): void {
  ctx.save();
  ctx.translate(cell.x, cell.y);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = FACE_BG;
  ctx.fillRect(0, 0, cell.w, cell.h);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  const blink = !still && Math.sin(t * 1.7 + phase) > 0.97;
  switch (kind) {
    case "focus":
      if (blink) ctx.fillRect(28, 46, 72, 4);
      else {
        ctx.fillRect(28, 36, 22, 14);
        ctx.fillRect(78, 36, 22, 14);
      }
      ctx.fillRect(48, 66, 32, 4);
      break;
    case "look": {
      const dx = Math.sin(t * 1.6 + phase) * 8;
      ctx.beginPath();
      circlePath(ctx, 40 + dx, 38, 9);
      circlePath(ctx, 88 + dx, 38, 9);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(56, 70);
      ctx.quadraticCurveTo(64, 66, 72, 70);
      ctx.stroke();
      break;
    }
    case "scan": {
      const k = (t * 1.3 + phase) % 2;
      const dx = (k < 1 ? k : 2 - k) * 16 - 8;
      ctx.fillRect(24, 34, 36, 18);
      ctx.fillRect(68, 34, 36, 18);
      ctx.fillRect(60, 40, 8, 4);
      ctx.fillStyle = FACE_BG;
      ctx.fillRect(38 + dx, 38, 10, 10);
      ctx.fillRect(82 + dx, 38, 10, 10);
      ctx.fillStyle = color;
      ctx.fillRect(52, 68, 24, 3);
      break;
    }
    case "watch": {
      const p = (t * 0.8 + phase) % 1;
      ctx.beginPath();
      circlePath(ctx, 40, 40, 10);
      circlePath(ctx, 88, 40, 10);
      ctx.fill();
      ctx.fillStyle = FACE_BG;
      ctx.beginPath();
      circlePath(ctx, 36 + p * 8, 42, 4);
      circlePath(ctx, 84 + p * 8, 42, 4);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(30, 66, 68, 5);
      ctx.fillStyle = FACE_BG;
      ctx.fillRect(30 + 68 * p, 66, 68 * (1 - p), 5);
      break;
    }
    case "wait": {
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(40, 44, 9, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(88, 44, 9, Math.PI, 0);
      ctx.stroke();
      const a = t * 3;
      ctx.beginPath();
      ctx.arc(64, 70, 6, a, a + 4.5);
      ctx.stroke();
      break;
    }
    case "ask":
      ctx.beginPath();
      circlePath(ctx, 40, 42, 10);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(78, 34);
      ctx.lineTo(98, 30);
      ctx.stroke();
      ctx.beginPath();
      circlePath(ctx, 88, 44, 8);
      ctx.fill();
      ctx.font = `700 22px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("?", 64, 84);
      break;
    case "happy":
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(28, 46);
      ctx.lineTo(40, 34);
      ctx.lineTo(52, 46);
      ctx.moveTo(76, 46);
      ctx.lineTo(88, 34);
      ctx.lineTo(100, 46);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(64, 62, 12, 0, Math.PI);
      ctx.stroke();
      break;
    case "oops":
      ctx.lineWidth = 6;
      ctx.beginPath();
      for (const x of [40, 88]) {
        ctx.moveTo(x - 9, 33);
        ctx.lineTo(x + 9, 51);
        ctx.moveTo(x + 9, 33);
        ctx.lineTo(x - 9, 51);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(48, 74);
      ctx.quadraticCurveTo(56, 66, 64, 74);
      ctx.quadraticCurveTo(72, 82, 80, 74);
      ctx.stroke();
      break;
    case "sleep":
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(26, 46);
      ctx.quadraticCurveTo(38, 52, 50, 46);
      ctx.moveTo(78, 46);
      ctx.quadraticCurveTo(90, 52, 102, 46);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

export interface ScreenInput {
  kind: ScreenKind;
  color: string;
  /** The localized activity label (the screen's header). */
  activity: string;
  progress: OfficeProgress | null;
  job: string | null;
}

export interface ScreenTexts {
  waiting: string;
  jobs: (done: number, total: number) => string;
  sleep: string;
}

export interface CanvasFonts {
  mono: string;
  sans: string;
}

export function drawScreen(ctx: CanvasRenderingContext2D, cell: Cell, s: ScreenInput, texts: ScreenTexts, t: number, phase: number, fonts: CanvasFonts, alpha = 1): void {
  const W = cell.w;
  const H = cell.h;
  ctx.save();
  ctx.translate(cell.x, cell.y);
  ctx.globalAlpha = alpha;
  ctx.textBaseline = "alphabetic";
  if (s.kind === "off") {
    ctx.fillStyle = "#0a0e1c";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#3a4166";
    ctx.font = `700 22px ${fonts.mono}`;
    ctx.textAlign = "center";
    ctx.fillText(texts.sleep, W / 2, H / 2 + 8);
    ctx.restore();
    return;
  }
  ctx.fillStyle = "#060a18";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = s.color;
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
  ctx.textAlign = "left";
  ctx.font = `500 13px ${fonts.mono}`;
  ctx.fillStyle = s.color;
  ctx.fillText(s.activity, 12, 22);
  switch (s.kind) {
    case "code": {
      const off = Math.floor(t * 2.2 + phase);
      for (let k = 0; k < 6; k++) {
        const line = CODE_LINES[(off + k) % CODE_LINES.length];
        const last = k === 5;
        ctx.fillStyle = last ? "#34d399" : "rgba(160, 230, 255, 0.75)";
        ctx.fillText(last ? line.slice(0, (Math.floor(t * 18) % line.length) + 1) : line, 12, 46 + k * 18);
      }
      break;
    }
    case "dots":
      for (let k = 0; k < 3; k++) {
        ctx.globalAlpha = alpha * (0.25 + 0.75 * Math.max(0, Math.sin(t * 3 - k * 0.6)));
        ctx.fillStyle = s.color;
        ctx.beginPath();
        circlePath(ctx, 98 + k * 30, 92, 9);
        ctx.fill();
      }
      ctx.globalAlpha = alpha;
      break;
    case "diff":
      for (let k = 0; k < 6; k++) {
        const add = k % 3 === 1;
        const del = k % 3 === 2;
        ctx.fillStyle = add ? "rgba(52, 211, 153, 0.85)" : del ? "rgba(248, 113, 113, 0.75)" : "rgba(160, 230, 255, 0.5)";
        const line = CODE_LINES[(k + 2) % CODE_LINES.length];
        ctx.fillText(add || del ? line.slice(0, 28) : line.slice(0, 30), 12, 46 + k * 18);
      }
      break;
    case "progress": {
      // Indeterminate: no test counts (the relay never sends them).
      const span = W - 24;
      const x = (((t * 0.4) % 1.3) - 0.3) * span;
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.fillRect(12, 70, span, 14);
      ctx.fillStyle = s.color;
      const a = Math.max(0, x);
      const b = Math.min(span, x + span * 0.3);
      if (b > a) ctx.fillRect(12 + a, 70, b - a, 14);
      break;
    }
    case "ci": {
      const span = W - 24;
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.fillRect(12, 70, span, 14);
      ctx.fillStyle = s.color;
      if (s.progress && s.progress.total > 0) {
        ctx.fillRect(12, 70, span * Math.min(1, s.progress.done / s.progress.total), 14);
        ctx.fillStyle = "#cfd6f5";
        ctx.fillText(texts.jobs(s.progress.done, s.progress.total), 12, 112);
      } else {
        const a = t * 3;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(W / 2, 112, 10, a, a + 4.5);
        ctx.stroke();
      }
      break;
    }
    case "question":
      ctx.fillStyle = "#fde2f0";
      ctx.font = `700 16px ${fonts.sans}`;
      ctx.fillText(texts.waiting, 12, 70);
      ctx.fillStyle = s.color;
      ctx.font = `700 40px ${fonts.sans}`;
      ctx.fillText("?", W - 44, 124);
      break;
    case "check":
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 30, 84);
      ctx.lineTo(W / 2 - 8, 106);
      ctx.lineTo(W / 2 + 32, 60);
      ctx.stroke();
      break;
    case "cross":
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 24, 48);
      ctx.lineTo(W / 2 + 24, 96);
      ctx.moveTo(W / 2 + 24, 48);
      ctx.lineTo(W / 2 - 24, 96);
      ctx.stroke();
      if (s.job) {
        ctx.font = `500 13px ${fonts.mono}`;
        ctx.textAlign = "center";
        ctx.fillText(s.job.slice(0, 32), W / 2, 130);
      }
      break;
  }
  ctx.restore();
}

const ANIMATED_FACES: ReadonlySet<FaceKind> = new Set<FaceKind>(["look", "scan", "watch", "wait"]);
const ANIMATED_SCREENS: ReadonlySet<ScreenKind> = new Set<ScreenKind>(["code", "dots", "progress"]);

/** Redraw key of a face: changes at `fps` for the moving kinds, on blinks for the focused face, never when still. */
export function faceKey(kind: FaceKind, t: number, phase: number, fps: number, still: boolean): string {
  if (still) return kind;
  if (ANIMATED_FACES.has(kind)) return `${kind}:${Math.floor(t * fps)}`;
  return kind === "focus" && Math.sin(t * 1.7 + phase) > 0.97 ? `${kind}:blink` : kind;
}

/** Redraw key of a screen: its content, plus time at `fps` for the moving kinds (and a CI wait without numbers), never when still. */
export function screenKey(s: ScreenInput, t: number, fps: number, still: boolean): string {
  const base = `${s.kind}|${s.activity}|${s.progress ? `${s.progress.done}/${s.progress.total}` : ""}|${s.job ?? ""}`;
  if (still) return base;
  return ANIMATED_SCREENS.has(s.kind) || (s.kind === "ci" && !s.progress) ? `${base}|${Math.floor(t * fps)}` : base;
}
```

- [ ] **Step 5: Run the test**

Run: `bunx vitest run tests/unit/office-atlas.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add tests/helpers/fake-canvas.ts src/experience/floors/lobby/office/officeAtlas.ts tests/unit/office-atlas.test.ts
git commit -m "feat(office): face and desk-screen atlas drawing"
```

### Task 7: Office view model and the screen wall

**Files:**
- Create: `src/experience/floors/lobby/office/officeModel.ts`
- Create: `src/experience/floors/lobby/office/officeWall.ts`
- Test: `tests/unit/office-view.test.ts`, `tests/unit/office-wall.test.ts`

**Interfaces:**
- Consumes: `officeCounts`, `deskTitle`, `sinceLabel` (Task 3), `OfficeFeed` (Task 4), `OFFICE_STATE_STYLE` (Task 5), `ScreenInput`, `circlePath`, `CanvasFonts` (Task 6), `COLORS` (`config.ts`), `OfficeTranslate` (Task 1).
- Produces:
  - `type OfficeViewMode = "live" | "semi-live" | "off" | "offline"`
  - `interface OfficeRoverView { slot; agent: OfficeAgent | null; state; activity; title: string | null; repo: string | null; progress: OfficeProgress | null; job: string | null; since: number | null; recent: readonly OfficeRecent[] }`
  - `interface OfficeView { mode; rovers: OfficeRoverView[]; counts: OfficeCounts; extra: number; github: readonly OfficeGithubItem[]; today: OfficeToday | null; updatedAt: number | null }`
  - `officeView(feed: Pick<OfficeFeed, "status" | "snapshot">): OfficeView`, `chipLines(r, t): { head: string; task: string | null; progress: number | null }`, `screenInput(r, t): ScreenInput`, `safeRepoUrl(repo: string | null): string | null`, `safeGithubUrl(url: string): string | null`
  - `WALL_BASE`, `WALL_CANVAS`, `STATUS_COLOR: Record<OfficeGithubStatus, string>`, `interface WallModel`, `wallModel(view, t, locale, now): WallModel`, `wallKey(m, t): string`, `drawWall(ctx, size, m, t, fonts): void`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/office-view.test.ts`:

```ts
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import type { OfficeTranslate } from "@/experience/floors/lobby/officeLayout";
import { chipLines, officeView, safeGithubUrl, safeRepoUrl, screenInput } from "@/experience/floors/lobby/office/officeModel";
import { OFFICE_FIXTURES } from "@/lib/office/fixtures";
import en from "../../messages/en.json";
import { STATES_A, STATES_B, statesA, statesB } from "../../e2e/office-fixtures";

const NOW = 1_800_000_000_000;
const t = createTranslator({ locale: "en", messages: en, namespace: "office" }) as unknown as OfficeTranslate;
const ready = (snapshot: ReturnType<typeof statesA>) => officeView({ status: "ready", snapshot });

describe("Agent Office view model", () => {
  it("always shows five Rovers in slot order, live desks with their state, title only when public", () => {
    const view = ready(statesA(NOW));
    expect(view.mode).toBe("live");
    expect(view.rovers.map((r) => r.state)).toEqual(STATES_A);
    expect(view.rovers.map((r) => r.title)).toEqual(["Agent office scene", null, null, null, "Office chips"]);
    expect(view.rovers[4].progress).toEqual({ done: 7, total: 12 });
    expect(view.rovers[0].progress).toBeNull();
    expect(view.counts).toEqual({ active: 3, thinking: 1, waiting: 1, asleep: 0 });
    expect(view.extra).toBe(2);
  });

  it("fills a slot without a session with an off-duty Rover and keeps a failed desk's job", () => {
    const view = ready(statesB(NOW));
    expect(view.rovers.map((r) => r.state)).toEqual(STATES_B);
    expect(view.rovers[4]).toMatchObject({ agent: null, state: "asleep", activity: "resting", title: null });
    expect(view.rovers[2].job).toBe("Build, CV and e2e");
  });

  it("puts every Rover to sleep when offline (keeping agents and the last GitHub events), off, disabled or before data", () => {
    const offline = officeView({ status: "offline", snapshot: statesA(NOW) });
    expect(offline.mode).toBe("offline");
    expect(offline.rovers.every((r) => r.state === "asleep")).toBe(true);
    expect(offline.rovers[0].agent).toBe("copilot");
    expect(offline.github).toHaveLength(2);
    expect(offline.counts).toEqual({ active: 0, thinking: 0, waiting: 0, asleep: 5 });
    expect(offline.extra).toBe(0);
    for (const feed of [{ status: "disabled", snapshot: null }, { status: "idle", snapshot: null }, { status: "loading", snapshot: null }] as const) {
      const view = officeView(feed);
      expect(view.mode).toBe("off");
      expect(view.rovers.every((r) => r.agent === null && r.state === "asleep")).toBe(true);
    }
    const semi = officeView({ status: "ready", snapshot: OFFICE_FIXTURES.semiLive as ReturnType<typeof statesA> });
    expect(semi.mode).toBe("semi-live");
    expect(semi.rovers.every((r) => r.state === "asleep")).toBe(true);
    const off = officeView({ status: "ready", snapshot: OFFICE_FIXTURES.off as ReturnType<typeof statesA> });
    expect(off.mode).toBe("off");
    expect(off.rovers.every((r) => r.state === "asleep")).toBe(true);
  });

  it("writes chip lines: agent and activity, the title or Client project, CI progress", () => {
    const view = ready(statesA(NOW));
    expect(chipLines(view.rovers[0], t)).toEqual({ head: "Copilot · Editing", task: "Agent office scene", progress: null });
    expect(chipLines(view.rovers[1], t)).toEqual({ head: "Claude · Planning", task: "Client project", progress: null });
    expect(chipLines(view.rovers[4], t).progress).toBeCloseTo(7 / 12);
    expect(chipLines(ready(statesB(NOW)).rovers[4], t)).toEqual({ head: "Off duty", task: null, progress: null });
  });

  it("feeds the desk screen the state's kind, the activity label and only protocol fields", () => {
    const [input, , failed] = ready(statesB(NOW)).rovers;
    expect(screenInput(input, t)).toEqual({ kind: "question", color: "#f472b6", activity: "Asking Kurniadi", progress: null, job: null });
    expect(screenInput(failed, t)).toMatchObject({ kind: "cross", job: "Build, CV and e2e" });
  });

  it("links only well-formed public GitHub repositories and github.com URLs", () => {
    expect(safeRepoUrl("ShinyQ/ShinyQ-HQ")).toBe("https://github.com/ShinyQ/ShinyQ-HQ");
    expect(safeRepoUrl("ShinyQ/../x")).toBeNull();
    expect(safeRepoUrl("ShinyQ/..")).toBeNull();
    expect(safeRepoUrl("javascript:alert(1)")).toBeNull();
    expect(safeRepoUrl(null)).toBeNull();
    expect(safeGithubUrl("https://github.com/ShinyQ/ShinyQ-HQ/pull/1")).toBe("https://github.com/ShinyQ/ShinyQ-HQ/pull/1");
    expect(safeGithubUrl("http://github.com/x")).toBeNull();
    expect(safeGithubUrl("https://evil.example/github.com")).toBeNull();
    expect(safeGithubUrl("not a url")).toBeNull();
  });
});
```

Create `tests/unit/office-wall.test.ts`:

```ts
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import type { OfficeTranslate } from "@/experience/floors/lobby/officeLayout";
import { officeView } from "@/experience/floors/lobby/office/officeModel";
import { drawWall, WALL_BASE, WALL_CANVAS, wallKey, wallModel } from "@/experience/floors/lobby/office/officeWall";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { statesA, statesB } from "../../e2e/office-fixtures";
import { recordingContext } from "../helpers/fake-canvas";

const NOW = 1_800_000_000_000;
const tEn = createTranslator({ locale: "en", messages: en, namespace: "office" }) as unknown as OfficeTranslate;
const tId = createTranslator({ locale: "id", messages: id, namespace: "office" }) as unknown as OfficeTranslate;
const FONTS = { mono: "monospace", sans: "sans-serif" };

describe("Agent Office screen wall", () => {
  it("summarizes the counts, the mode with its age, the +N chip, the awake desks and today", () => {
    const m = wallModel(officeView({ status: "ready", snapshot: statesA(NOW) }), tEn, "en", NOW + 20_000);
    expect(m.tiles.map((x) => [x.label, x.value])).toEqual([["ACTIVE", 3], ["THINKING", 1], ["WAITING", 1], ["ASLEEP", 0]]);
    expect(m.status).toBe("LIVE · just now");
    expect(m.extra).toBe("+2");
    expect(m.now.map((r) => r.head)).toEqual(["Copilot · Editing", "Claude · Planning"]);
    expect(m.now[1].sub).toBe("Client project");
    expect(m.resting).toBeNull();
    expect(m.today).toBe("Today: tasks done 3 · PRs merged 2 · CI green 5 of 6");
    expect(m.rows.map((r) => r.meta)).toEqual(["ShinyQ/ShinyQ-HQ · running · just now", "ShinyQ/ShinyQ-HQ · merged · 10 min"]);
    expect(m.rows[0].progress).toBeCloseTo(7 / 12);
  });

  it("rests when offline: every desk asleep, no today line, the last GitHub events kept", () => {
    const m = wallModel(officeView({ status: "offline", snapshot: statesB(NOW) }), tEn, "en", NOW);
    expect(m.status).toBe("OFFLINE");
    expect(m.tiles.map((x) => x.value)).toEqual([0, 0, 0, 5]);
    expect(m.resting).toBe(en.office["3d"].wall.resting);
    expect(m.today).toBeNull();
    expect(m.rows).toHaveLength(2);
    expect(wallModel(officeView({ status: "idle", snapshot: null }), tId, "id", NOW).status).toBe("ISTIRAHAT");
  });

  it("draws both halves at the tier's canvas size", () => {
    const rec = recordingContext();
    const m = wallModel(officeView({ status: "ready", snapshot: statesA(NOW) }), tEn, "en", NOW);
    drawWall(rec.ctx, WALL_CANVAS.lite, m, 0, FONTS);
    expect(rec.named("setTransform")[0].args).toEqual([WALL_CANVAS.lite.w / WALL_BASE.w, 0, 0, WALL_CANVAS.lite.h / WALL_BASE.h, 0, 0]);
    const texts = rec.texts();
    for (const s of ["MISSION CONTROL", "LIVE · just now", "+2", "3", "GITHUB", "Public repositories", "CI", "feat: agent office"]) expect(texts).toContain(s);
  });

  it("changes its frame key for content, and for the spinner only while a run is running", () => {
    const running = wallModel(officeView({ status: "ready", snapshot: statesA(NOW) }), tEn, "en", NOW);
    expect(wallKey(running, 0)).not.toBe(wallKey(running, 1));
    const idle = { ...running, rows: running.rows.filter((r) => r.status !== "running") };
    expect(wallKey(idle, 0)).toBe(wallKey(idle, 1));
    expect(wallKey(idle, 0)).not.toBe(wallKey({ ...idle, extra: "+3" }, 0));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bunx vitest run tests/unit/office-view.test.ts tests/unit/office-wall.test.ts`
Expected: FAIL with `Failed to resolve import "@/experience/floors/lobby/office/officeModel"`.

- [ ] **Step 3: Write the view model**

Create `src/experience/floors/lobby/office/officeModel.ts`:

```ts
import { deskTitle, officeCounts, type OfficeCounts } from "@/lib/office/model";
import type { OfficeFeed } from "@/lib/office/poll";
import { OFFICE_DESKS, type OfficeActivity, type OfficeAgent, type OfficeGithubItem, type OfficeProgress, type OfficeRecent, type OfficeState, type OfficeToday } from "@/lib/office/protocol";
import type { OfficeTranslate } from "../officeLayout";
import type { ScreenInput } from "./officeAtlas";
import { OFFICE_STATE_STYLE } from "./officeVisual";

/**
 * The 3D office's view of a feed: always five Rovers (a slot without a session is an off-duty Rover asleep),
 * every Rover asleep when the office is off, disabled or offline, and only protocol fields (owner decision D3).
 */
export type OfficeViewMode = "live" | "semi-live" | "off" | "offline";

export interface OfficeRoverView {
  slot: number;
  /** null: off duty (no session at this desk). */
  agent: OfficeAgent | null;
  state: OfficeState;
  activity: OfficeActivity;
  title: string | null;
  repo: string | null;
  progress: OfficeProgress | null;
  job: string | null;
  since: number | null;
  recent: readonly OfficeRecent[];
}

export interface OfficeView {
  mode: OfficeViewMode;
  rovers: OfficeRoverView[];
  counts: OfficeCounts;
  extra: number;
  github: readonly OfficeGithubItem[];
  today: OfficeToday | null;
  updatedAt: number | null;
}

const offDuty = (slot: number): OfficeRoverView => ({ slot, agent: null, state: "asleep", activity: "resting", title: null, repo: null, progress: null, job: null, since: null, recent: [] });

export function officeView(feed: Pick<OfficeFeed, "status" | "snapshot">): OfficeView {
  const snap = feed.status === "disabled" ? null : feed.snapshot;
  const mode: OfficeViewMode = feed.status === "offline" ? "offline" : snap ? snap.mode : "off";
  const sleeping = mode === "off" || mode === "offline";
  const rovers = Array.from({ length: OFFICE_DESKS }, (_, slot): OfficeRoverView => {
    const desk = snap?.desks.find((d) => d.slot === slot);
    if (!desk) return offDuty(slot);
    if (sleeping) return { ...offDuty(slot), agent: desk.agent };
    return {
      slot,
      agent: desk.agent,
      state: desk.state,
      activity: desk.activity,
      title: deskTitle(desk),
      repo: desk.repo ?? null,
      progress: desk.state === "ci" ? (desk.progress ?? null) : null,
      job: desk.state === "failed" ? (desk.job ?? null) : null,
      since: desk.since,
      recent: desk.recent,
    };
  });
  const live = snap && !sleeping ? snap : null;
  return {
    mode,
    rovers,
    counts: officeCounts(live ? live.desks : []),
    extra: live ? live.extra : 0,
    github: snap ? snap.github : [],
    today: live ? live.today : null,
    updatedAt: snap ? snap.updatedAt : null,
  };
}

/** Chip text: "<Agent> · <activity>", then the title or "Client project" (not for sleeping Rovers), then CI progress. */
export function chipLines(r: OfficeRoverView, t: OfficeTranslate): { head: string; task: string | null; progress: number | null } {
  const head = r.agent ? `${t(`agent.${r.agent}`)} · ${t(`activity.${r.activity}`)}` : t("3d.offDuty");
  const task = r.agent && r.state !== "asleep" ? (r.title ?? t("clientProject")) : null;
  const progress = r.progress && r.progress.total > 0 ? Math.min(1, r.progress.done / r.progress.total) : null;
  return { head, task, progress };
}

export function screenInput(r: OfficeRoverView, t: OfficeTranslate): ScreenInput {
  const style = OFFICE_STATE_STYLE[r.state];
  return { kind: style.screen, color: style.color, activity: r.agent ? t(`activity.${r.activity}`) : t("3d.offDuty"), progress: r.progress, job: r.job };
}

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** The repository page for an allowlisted public repository ("owner/name"), checked again on the client. */
export function safeRepoUrl(repo: string | null): string | null {
  if (!repo || !REPO.test(repo) || repo.split("/").some((part) => /^\.+$/.test(part))) return null;
  return `https://github.com/${repo}`;
}

/** A GitHub feed link, only when it is an https URL on github.com. */
export function safeGithubUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "github.com" ? u.href : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Write the wall**

Create `src/experience/floors/lobby/office/officeWall.ts`:

```ts
import { sinceLabel } from "@/lib/office/model";
import type { OfficeGithubStatus } from "@/lib/office/protocol";
import { COLORS } from "../../../config";
import type { OfficeTranslate } from "../officeLayout";
import { circlePath, type CanvasFonts } from "./officeAtlas";
import { chipLines, type OfficeView, type OfficeViewMode } from "./officeModel";
import { OFFICE_STATE_STYLE } from "./officeVisual";

/**
 * The screen wall (owner decision D1): as seen from the plaza, mission control on the left half (the mode with
 * the snapshot's age, four counters, up to two awake desks, today, a "+N" chip for sessions beyond five) and the
 * public GitHub board on the right half. Drawn in 1280 x 300 base units, scaled to the tier's canvas.
 */
export const WALL_BASE = { w: 1280, h: 300 } as const;
export const WALL_CANVAS = { full: { w: 1280, h: 300 }, lite: { w: 1024, h: 240 } } as const;

export const STATUS_COLOR: Record<OfficeGithubStatus, string> = {
  running: "#60a5fa",
  success: COLORS.green,
  failure: "#f87171",
  merged: COLORS.violet,
  opened: COLORS.cyan,
  pushed: "#8a93b5",
};

const MODE_COLOR: Record<OfficeViewMode, string> = { live: COLORS.green, "semi-live": COLORS.violet, off: "#8a93b5", offline: "#f87171" };

export interface WallRow {
  color: string;
  head: string;
  sub: string;
}

export interface WallGithubRow {
  status: OfficeGithubStatus;
  title: string;
  meta: string;
  progress: number | null;
}

export interface WallModel {
  control: string;
  status: string;
  statusColor: string;
  extra: string | null;
  tiles: { value: number; label: string; color: string }[];
  nowTitle: string;
  now: WallRow[];
  resting: string | null;
  today: string | null;
  github: string;
  githubSub: string;
  rows: WallGithubRow[];
  empty: string;
}

export function wallModel(view: OfficeView, t: OfficeTranslate, locale: "en" | "id", now: number): WallModel {
  const c = view.counts;
  const awake = view.rovers.filter((r) => r.agent && r.state !== "asleep");
  const label = t(`3d.mode.${view.mode === "semi-live" ? "semi" : view.mode}`);
  return {
    control: t("3d.wall.control"),
    status: view.mode === "live" && view.updatedAt !== null ? `${label} · ${sinceLabel(view.updatedAt, locale, now)}` : label,
    statusColor: MODE_COLOR[view.mode],
    extra: view.extra > 0 ? `+${view.extra}` : null,
    tiles: [
      { value: c.active, label: t("3d.wall.active"), color: COLORS.cyan },
      { value: c.thinking, label: t("3d.wall.thinking"), color: COLORS.amber },
      { value: c.waiting, label: t("3d.wall.waiting"), color: COLORS.violet },
      { value: c.asleep, label: t("3d.wall.asleep"), color: "#8a93b5" },
    ],
    nowTitle: t("3d.wall.now"),
    now: awake.slice(0, 2).map((r) => ({ color: OFFICE_STATE_STYLE[r.state].color, head: chipLines(r, t).head, sub: r.title ?? t("clientProject") })),
    resting: awake.length ? null : t("3d.wall.resting"),
    today: view.today ? t("3d.wall.today", { tasks: view.today.tasksDone, prs: view.today.prsMerged, green: view.today.ciGreen, runs: view.today.ciRuns }) : null,
    github: t("3d.wall.github"),
    githubSub: t("3d.wall.githubSub"),
    rows: view.github.slice(0, 4).map((g) => ({
      status: g.status,
      title: g.title,
      meta: `${g.repo} · ${t(`3d.github.status.${g.status}`)} · ${sinceLabel(g.at, locale, now)}`,
      progress: g.progress && g.progress.total > 0 ? Math.min(1, g.progress.done / g.progress.total) : null,
    })),
    empty: t("3d.wall.empty"),
  };
}

/** Redraw key: the content, plus a 2 fps spinner frame while a run is running. */
export function wallKey(m: WallModel, t: number): string {
  const spin = m.rows.some((r) => r.status === "running") ? Math.floor(t * 2) : 0;
  return `${JSON.stringify(m)}|${spin}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function statusIcon(ctx: CanvasRenderingContext2D, status: OfficeGithubStatus, x: number, y: number, color: string, t: number): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  switch (status) {
    case "running":
      ctx.arc(x, y, 10, t * 3, t * 3 + 4.6);
      ctx.stroke();
      break;
    case "success":
      ctx.moveTo(x - 9, y);
      ctx.lineTo(x - 2, y + 7);
      ctx.lineTo(x + 10, y - 8);
      ctx.stroke();
      break;
    case "failure":
      ctx.moveTo(x - 8, y - 8);
      ctx.lineTo(x + 8, y + 8);
      ctx.moveTo(x + 8, y - 8);
      ctx.lineTo(x - 8, y + 8);
      ctx.stroke();
      break;
    case "merged":
      circlePath(ctx, x, y, 8);
      ctx.fill();
      break;
    default:
      circlePath(ctx, x, y, 7);
      ctx.stroke();
  }
}

export function drawWall(ctx: CanvasRenderingContext2D, size: { w: number; h: number }, m: WallModel, t: number, fonts: CanvasFonts): void {
  ctx.save();
  ctx.setTransform(size.w / WALL_BASE.w, 0, 0, size.h / WALL_BASE.h, 0, 0);
  ctx.fillStyle = "#05070f";
  ctx.fillRect(0, 0, WALL_BASE.w, WALL_BASE.h);
  roundRect(ctx, 8, 8, 624, 284, 18);
  ctx.fillStyle = "rgba(18, 11, 42, 0.92)";
  ctx.fill();
  ctx.strokeStyle = COLORS.violet;
  ctx.lineWidth = 3;
  ctx.stroke();
  roundRect(ctx, 648, 8, 624, 284, 18);
  ctx.fillStyle = "rgba(6, 14, 20, 0.92)";
  ctx.fill();
  ctx.strokeStyle = COLORS.green;
  ctx.stroke();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  ctx.fillStyle = "#d8c8ff";
  ctx.font = `700 28px ${fonts.mono}`;
  ctx.fillText(m.control, 28, 46);
  ctx.fillStyle = m.statusColor;
  ctx.beginPath();
  circlePath(ctx, 34, 68, 6);
  ctx.fill();
  ctx.font = `500 18px ${fonts.mono}`;
  ctx.fillText(m.status, 48, 74);
  if (m.extra) {
    ctx.fillStyle = COLORS.amber;
    ctx.font = `700 22px ${fonts.mono}`;
    ctx.textAlign = "right";
    ctx.fillText(m.extra, 612, 46);
    ctx.textAlign = "left";
  }
  m.tiles.forEach((tile, k) => {
    const x = 28 + k * 150;
    ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
    roundRect(ctx, x, 90, 136, 84, 12);
    ctx.fill();
    ctx.fillStyle = tile.color;
    ctx.font = `800 44px ${fonts.sans}`;
    ctx.fillText(String(tile.value), x + 14, 140);
    ctx.font = `500 13px ${fonts.mono}`;
    ctx.fillText(tile.label, x + 14, 162);
  });
  ctx.fillStyle = "#cfd6f5";
  ctx.font = `500 16px ${fonts.mono}`;
  ctx.fillText(m.nowTitle, 28, 200);
  if (m.resting) {
    ctx.font = `400 17px ${fonts.sans}`;
    ctx.fillText(m.resting, 28, 228);
  }
  m.now.forEach((row, k) => {
    const y = 226 + k * 24;
    ctx.fillStyle = row.color;
    ctx.beginPath();
    circlePath(ctx, 34, y - 6, 5);
    ctx.fill();
    ctx.fillStyle = "#eef0ff";
    ctx.font = `600 16px ${fonts.sans}`;
    ctx.fillText(row.head, 48, y);
    ctx.fillStyle = "#98a2c8";
    ctx.font = `400 14px ${fonts.mono}`;
    ctx.fillText(row.sub.slice(0, 32), 330, y);
  });
  if (m.today) {
    ctx.fillStyle = "#98a2c8";
    ctx.font = `400 13px ${fonts.mono}`;
    ctx.fillText(m.today, 28, 282);
  }

  ctx.fillStyle = "#cdeee2";
  ctx.font = `700 28px ${fonts.mono}`;
  ctx.fillText(m.github, 668, 46);
  ctx.fillStyle = "#8a93b5";
  ctx.font = `500 15px ${fonts.mono}`;
  ctx.fillText(m.githubSub, 668, 70);
  if (!m.rows.length) {
    ctx.fillStyle = "#cfd6f5";
    ctx.font = `400 17px ${fonts.sans}`;
    ctx.fillText(m.empty, 668, 120);
  }
  m.rows.forEach((row, k) => {
    const y = 110 + k * 46;
    const color = STATUS_COLOR[row.status];
    statusIcon(ctx, row.status, 684, y - 6, color, t);
    ctx.fillStyle = "#eef0ff";
    ctx.font = `600 17px ${fonts.sans}`;
    ctx.fillText(row.title.slice(0, 44), 708, y);
    ctx.fillStyle = "#98a2c8";
    ctx.font = `400 13px ${fonts.mono}`;
    ctx.fillText(row.meta.slice(0, 64), 708, y + 18);
    if (row.progress !== null) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.fillRect(1060, y - 10, 190, 6);
      ctx.fillStyle = color;
      ctx.fillRect(1060, y - 10, 190 * row.progress, 6);
    }
  });
  ctx.restore();
}
```

- [ ] **Step 5: Run the tests**

Run: `bunx vitest run tests/unit/office-view.test.ts tests/unit/office-wall.test.ts`
Expected: PASS (6 and 4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/experience/floors/lobby/office/officeModel.ts src/experience/floors/lobby/office/officeWall.ts tests/unit/office-view.test.ts tests/unit/office-wall.test.ts
git commit -m "feat(office): office view model and the screen wall"
```

### Task 8: The office chunk loader, the live feed and the shared runtime

**Files:**
- Create: `src/experience/floors/lobby/office/chunk.ts` (main path)
- Create: `src/experience/floors/lobby/office/scene.ts` (chunk entry; grows in Tasks 9, 11 and 12)
- Create: `src/experience/floors/lobby/office/live.ts`
- Create: `src/experience/floors/lobby/office/runtime.ts`
- Modify: `src/experience/fx/probes.ts`
- Modify: `src/experience/Experience.tsx`
- Test: `tests/unit/office-chunk.test.ts`, `tests/unit/office-live.test.ts`

**Interfaces:**
- Consumes: `createOfficePoller`, `OfficeFeed` (Task 4), `OFFICE`, `officeSlots` (Task 1), `CHIP_LIFT` (Task 5), `OFFICE_DESKS`, `OFFICE_PATH` (protocol), `useSyncExternalStore` (react).
- Produces:
  - `chunk.ts`: `type OfficeModule = typeof import("./scene")`, `type OfficeChunkState = "idle" | "loading" | "ready" | "failed"`, `loadOffice(): Promise<OfficeModule>` (rejects on failure, retried on the next call), `officeModule(): OfficeModule | null`, `officeChunkState(): OfficeChunkState`, `subscribeOffice(listener): () => void`, `useOfficeModule(): OfficeModule | null`, `officeLoadWanted(input: OfficeLoadInput): boolean`, `officeHandle = { load(): Promise<void>; state(): OfficeChunkState; test(): OfficeTestHooks | null }`
  - `live.ts`: `officeLive = { want(reason: string, on: boolean): void; polling(): boolean }`, `useOfficeFeed(): OfficeFeed`, `officeTest = { feed(): OfficeFeed; poll(): void; advance(ms: number): void; polling(): boolean }`
  - `runtime.ts`: `OFFICE_CHIP_FAR` (28), `officeRuntime = { inView, chips, anchors, far }`, `setChipFar(slot, far): void`, `useChipFar(slot): boolean`
  - `sceneProbes.office = { loaded, desks, states, mode, wallFrames, chips, bob, inView, polling }`
  - `window.__hq.office` (Playwright)

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/office-chunk.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LOBBY } from "@/experience/config";
import { OFFICE } from "@/experience/floors/lobby/officeLayout";
import { officeChunkState, officeHandle, officeLoadWanted, officeModule } from "@/experience/floors/lobby/office/chunk";

const base = { idle: true, state: "idle", prefetch: true, floor: "L1", rideTo: null, at: LOBBY.spawn } as const;

describe("Agent Office chunk trigger", () => {
  it("loads after the first frame went idle, on L1 (or riding there) near the office, with prefetch on, once", () => {
    expect(Math.hypot(LOBBY.spawn.x - OFFICE.stop.x, LOBBY.spawn.z - OFFICE.stop.z)).toBeLessThan(OFFICE.loadRadius);
    expect(officeLoadWanted(base)).toBe(true);
    expect(officeLoadWanted({ ...base, idle: false })).toBe(false);
    expect(officeLoadWanted({ ...base, prefetch: false })).toBe(false);
    for (const state of ["loading", "ready", "failed"] as const) expect(officeLoadWanted({ ...base, state })).toBe(false);
    expect(officeLoadWanted({ ...base, floor: "L3" })).toBe(false);
    expect(officeLoadWanted({ ...base, floor: "L3", rideTo: "L1", at: LOBBY.arrival })).toBe(true);
    expect(officeLoadWanted({ ...base, rideTo: "L4" })).toBe(false);
    expect(officeLoadWanted({ ...base, at: { x: OFFICE.stop.x + OFFICE.loadRadius + 1, z: OFFICE.stop.z } })).toBe(false);
  });

  it("starts idle with no module and no test hooks", () => {
    expect(officeChunkState()).toBe("idle");
    expect(officeModule()).toBeNull();
    expect(officeHandle.state()).toBe("idle");
    expect(officeHandle.test()).toBeNull();
  });
});
```

Create `tests/unit/office-live.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { OFFICE_PATH } from "@/lib/office/protocol";
import { statesA } from "../../e2e/office-fixtures";

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<{ status: number; json: () => Promise<unknown> }>>(async () => ({ status: 200, json: async () => statesA(Date.now()) }));
vi.stubGlobal("fetch", fetchMock);

const { officeLive, officeTest } = await import("@/experience/floors/lobby/office/live");
const { officeRuntime, setChipFar } = await import("@/experience/floors/lobby/office/runtime");

afterEach(() => {
  officeLive.want("view", false);
  officeLive.want("drawer", false);
  fetchMock.mockClear();
});

describe("Agent Office live feed (3D)", () => {
  it("polls while any reason wants it (in view, a drawer open) and stops when none does", async () => {
    officeLive.want("view", true);
    officeLive.want("drawer", true);
    expect(officeLive.polling()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(OFFICE_PATH);
    await vi.waitFor(() => expect(officeTest.feed().status).toBe("ready"));
    officeLive.want("view", false);
    expect(officeLive.polling()).toBe(true);
    officeLive.want("drawer", false);
    expect(officeLive.polling()).toBe(false);
  });

  it("fetches at once for the test hook without starting the poller, and skews its clock", async () => {
    officeTest.poll();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(officeTest.polling()).toBe(false);
    officeTest.advance(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("anchors a chip over every Rover and notifies far changes once", () => {
    expect(officeRuntime.anchors).toHaveLength(5);
    expect(officeRuntime.chips).toEqual([null, null, null, null, null]);
    setChipFar(2, true);
    setChipFar(2, true);
    expect(officeRuntime.far[2]).toBe(true);
    setChipFar(2, false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bunx vitest run tests/unit/office-chunk.test.ts tests/unit/office-live.test.ts`
Expected: FAIL with `Failed to resolve import "@/experience/floors/lobby/office/chunk"`.

- [ ] **Step 3: Write the live feed and the runtime**

Create `src/experience/floors/lobby/office/live.ts`:

```ts
import { useSyncExternalStore } from "react";
import { createOfficePoller, type OfficeFeed } from "@/lib/office/poll";

/**
 * The 3D office's one poller (`src/lib/office/poll.ts`). It runs while any reason wants it: the office in view on
 * L1 ("view", OfficeScene) or an office drawer open ("drawer", OfficeBody). Visitor input resets its 10 minute
 * idle stop; the tab turning visible fetches at once. Chunk only.
 */
const clock = { skew: 0 };
const poller = createOfficePoller({ now: () => Date.now() + clock.skew });
const wants = new Set<string>();
const INPUT = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
let detach: (() => void) | null = null;

function attach(): () => void {
  const touch = () => poller.touch();
  const onVisible = () => {
    if (document.visibilityState !== "visible" || !wants.size) return;
    poller.stop();
    poller.start();
  };
  for (const type of INPUT) window.addEventListener(type, touch, { passive: true });
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    for (const type of INPUT) window.removeEventListener(type, touch);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

export const officeLive = {
  want(reason: string, on: boolean): void {
    const before = wants.size > 0;
    if (on) wants.add(reason);
    else wants.delete(reason);
    const after = wants.size > 0;
    if (after && !before) {
      detach = attach();
      poller.start();
    } else if (!after && before) {
      poller.stop();
      detach?.();
      detach = null;
    }
  },
  polling: (): boolean => wants.size > 0,
};

const subscribe = (onChange: () => void) => poller.subscribe(onChange);

export function useOfficeFeed(): OfficeFeed {
  return useSyncExternalStore(subscribe, poller.feed, poller.feed);
}

/** `__hq.office.test()` (Playwright): the feed, a fetch now, and a clock skew to cross the keep-last window. */
export const officeTest = {
  feed: (): OfficeFeed => poller.feed(),
  poll(): void {
    poller.stop();
    poller.start();
    if (!wants.size) poller.stop();
  },
  advance(ms: number): void {
    clock.skew += ms;
    officeTest.poll();
  },
  polling: (): boolean => wants.size > 0,
};
```

Create `src/experience/floors/lobby/office/runtime.ts`:

```ts
import { useSyncExternalStore } from "react";
import { OFFICE_DESKS } from "@/lib/office/protocol";
import { officeSlots } from "../officeLayout";
import { CHIP_LIFT } from "./officeRig";

/** A chip farther than this from the camera shows its first line only (the mock's `.tag.far`). */
export const OFFICE_CHIP_FAR = 28;

/**
 * Shared between the office scene (in the canvas) and its HUD chips, mutated outside React render: whether the
 * office is in view, the chip elements the scene moves every frame (HintProbe pattern), their world anchors
 * above each Rover, and whether each chip is far.
 */
export const officeRuntime = {
  inView: false,
  chips: Array.from({ length: OFFICE_DESKS }, (): HTMLElement | null => null),
  anchors: officeSlots().map((s) => ({ x: s.rover.x, y: CHIP_LIFT, z: s.rover.z })),
  far: Array.from({ length: OFFICE_DESKS }, () => false),
};

const farListeners = new Set<() => void>();

export function setChipFar(slot: number, far: boolean): void {
  if (officeRuntime.far[slot] === far) return;
  officeRuntime.far[slot] = far;
  for (const listener of farListeners) listener();
}

const subscribeFar = (listener: () => void) => {
  farListeners.add(listener);
  return () => {
    farListeners.delete(listener);
  };
};

export function useChipFar(slot: number): boolean {
  return useSyncExternalStore(subscribeFar, () => officeRuntime.far[slot], () => false);
}
```

- [ ] **Step 4: Write the chunk entry and the loader**

Create `src/experience/floors/lobby/office/scene.ts`:

```ts
/**
 * The Agent Office chunk entry (L1, loaded on demand by `./chunk.ts`): everything live about the office. Main-path
 * code imports nothing from here but types (tests/unit/office-chunk-graph.test.ts).
 */
export { officeTest } from "./live";
```

Create `src/experience/floors/lobby/office/chunk.ts`:

```ts
import { useSyncExternalStore } from "react";
import { OFFICE } from "../officeLayout";
import type * as OfficeChunk from "./scene";

/** The Agent Office chunk (`./scene.ts`): the Rovers, the wall, the chips, the drawer bodies and the live feed. */
export type OfficeModule = typeof OfficeChunk;
export type OfficeChunkState = "idle" | "loading" | "ready" | "failed";

let pending: Promise<OfficeModule> | null = null;
let loaded: OfficeModule | null = null;
let state: OfficeChunkState = "idle";
const listeners = new Set<() => void>();

const set = (next: OfficeChunkState) => {
  state = next;
  for (const listener of listeners) listener();
};

/**
 * Loads the office chunk once per page (one shared promise). Rejects when the import fails and forgets the promise,
 * so the next request (an office drawer, `__hq.office.load()`) retries; the speculative trigger never retries a
 * failed load. This import() is the only reference to the chunk entry.
 */
export function loadOffice(): Promise<OfficeModule> {
  if (!pending) {
    set("loading");
    pending = import("./scene").then(
      (mod) => {
        loaded = mod;
        set("ready");
        return mod;
      },
      (error: unknown) => {
        pending = null;
        set("failed");
        throw error;
      },
    );
  }
  return pending;
}

export function officeModule(): OfficeModule | null {
  return loaded;
}

export function officeChunkState(): OfficeChunkState {
  return state;
}

export function subscribeOffice(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOfficeModule(): OfficeModule | null {
  return useSyncExternalStore(subscribeOffice, officeModule, () => null);
}

export interface OfficeLoadInput {
  /** The first frame has drawn and the page went idle (`afterFirstFrameIdle`). */
  idle: boolean;
  state: OfficeChunkState;
  /** Speculative prefetches on (`?prefetch=off` turns them off). */
  prefetch: boolean;
  floor: string;
  rideTo: string | null;
  /** The rover, or the elevator arrival point during a ride. */
  at: { x: number; z: number };
}

/** The speculative trigger: after the first frame on idle, on L1 or riding there, within `OFFICE.loadRadius` of the stop. */
export function officeLoadWanted({ idle, state: chunk, prefetch, floor, rideTo, at }: OfficeLoadInput): boolean {
  if (!idle || chunk !== "idle" || !prefetch || (rideTo ?? floor) !== "L1") return false;
  return Math.hypot(at.x - OFFICE.stop.x, at.z - OFFICE.stop.z) <= OFFICE.loadRadius;
}

/** `window.__hq.office` (Playwright and the perf lane): load, the chunk state and the chunk's test hooks once loaded. */
export const officeHandle = {
  load: (): Promise<void> => loadOffice().then(() => undefined),
  state: officeChunkState,
  test: () => loaded?.officeTest ?? null,
};
```

- [ ] **Step 5: Add the probe and the Playwright handle**

In `src/experience/fx/probes.ts`, add inside `sceneProbes` after `ops`:

```ts
  /** L1 Agent Office (lazy chunk): compiled and shown, Rovers, their states in slot order, the view mode, wall redraws, chips on screen, the largest pose offset from the still pose (0 under reduced motion), in view, polling. */
  office: { loaded: false, desks: 0, states: [] as string[], mode: "off", wallFrames: 0, chips: 0, bob: 0, inView: false, polling: false },
```

In `src/experience/Experience.tsx`, add `import { officeHandle } from "./floors/lobby/office/chunk";` after the `floorChunks` import, and in the `__hq` object after `floorChunks: floorChunksHandle,`:

```ts
    // The lazy Agent Office chunk (L1): load, state and its test hooks (e2e/office.spec.ts, the bytes gate).
    office: officeHandle,
```

- [ ] **Step 6: Run the tests**

Run: `bunx vitest run tests/unit/office-chunk.test.ts tests/unit/office-live.test.ts && bunx tsc --noEmit -p .`
Expected: PASS (2 and 3 tests); `tsc` exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/experience/floors/lobby/office/chunk.ts src/experience/floors/lobby/office/scene.ts src/experience/floors/lobby/office/live.ts src/experience/floors/lobby/office/runtime.ts src/experience/fx/probes.ts src/experience/Experience.tsx tests/unit/office-chunk.test.ts tests/unit/office-live.test.ts
git commit -m "feat(office): lazy office chunk loader, live feed and shared runtime"
```

### Task 9: The office scene (Rovers, atlas, glow, wall, watcher, targets)

**Files:**
- Create: `src/experience/floors/lobby/office/interact.ts`
- Create: `src/experience/floors/lobby/office/OfficeScene.tsx`
- Modify: `src/experience/floors/lobby/office/scene.ts`
- Test: `tests/unit/office-interact.test.ts`

**Interfaces:**
- Consumes: `Interactable`, `registerExtraInteractables(floor, items): () => void` (`interact/registry.ts`), `createHoloMaterial`, `HOLO_MODE.dot` (`fx/holoFx.ts`), `neonColor(hex, k, tier)` (`fx/materials.ts`), `useDispose` (`fx/useDispose.ts`), `precompileObject(gl, object, camera, scene)` (`scene/precompile.ts`), `renderProbe.rendered`, `sceneTarget()`, `RIDE_CULL_BOUNDS`, `sceneProbes.office`, everything from Tasks 1 and 5 to 8.
- Produces: `officeInteractables(slots: readonly OfficeSlot[], labels: OfficeTargetLabels): Interactable[]`, `interface OfficeTargetLabels { office: string; github: string; desk: (slot: number) => string }`, `OfficeScene({ tier, t }: { tier: GpuTier; t: OfficeTranslate })`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/office-interact.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildFloorLayouts, ROVER } from "@/experience/config";
import { OFFICE, officeSlots, officeWallRect } from "@/experience/floors/lobby/officeLayout";
import { officeInteractables } from "@/experience/floors/lobby/office/interact";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";

const slots = officeSlots();
const items = officeInteractables(slots, { office: "Agent Office: summary", github: "Agent Office: GitHub board", desk: (slot) => `Desk ${slot + 1}` });

describe("Agent Office point-and-go targets", () => {
  it("adds the two wall halves and one target per Rover, each opening its drawer from the office stop", () => {
    expect(items.map((i) => i.id)).toEqual(["L1:station:office", "L1:station:office-github", "L1:station:office-desk-1", "L1:station:office-desk-2", "L1:station:office-desk-3", "L1:station:office-desk-4", "L1:station:office-desk-5"]);
    expect(items.map((i) => (i.action.type === "open-room" ? i.action.room : null))).toEqual(["L1:office", "L1:office-github", "L1:office-desk-1", "L1:office-desk-2", "L1:office-desk-3", "L1:office-desk-4", "L1:office-desk-5"]);
    for (const item of items) {
      expect(item).toMatchObject({ floor: "L1", kind: "station", at: OFFICE.stop });
    }
    expect(isWalkable(buildNavGrid(buildFloorLayouts(8).L1, ROVER.radius), OFFICE.stop)).toBe(true);
  });

  it("splits the wall: the summary is the east half (the canvas's left half, seen from the plaza), GitHub the west half", () => {
    const wall = officeWallRect();
    const [summary, github] = items;
    expect(summary.bounds).toMatchObject({ minX: OFFICE.wall.x, maxX: wall.maxX });
    expect(github.bounds).toMatchObject({ minX: wall.minX, maxX: OFFICE.wall.x });
    expect(summary.base).toBe(OFFICE.wall.bottom);
    expect(summary.height).toBe(OFFICE.wall.bottom + OFFICE.wall.h);
  });

  it("gives each Rover a turned pick box from its desk front to its back", () => {
    for (const s of slots) {
      const item = items[2 + s.slot];
      expect(item.box?.yaw).toBe(s.yaw);
      expect(item.box?.w).toBe(OFFICE.desk.w);
      expect(item.box?.d).toBeCloseTo(OFFICE.roverRadius + OFFICE.rover.radius - (OFFICE.deskRadius - OFFICE.desk.d / 2));
      const c = item.box!.center;
      expect(c.x).toBeGreaterThanOrEqual(item.bounds.minX);
      expect(c.x).toBeLessThanOrEqual(item.bounds.maxX);
      expect(item.label).toBe(`Desk ${s.slot + 1}`);
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bunx vitest run tests/unit/office-interact.test.ts`
Expected: FAIL with `Failed to resolve import "@/experience/floors/lobby/office/interact"`.

- [ ] **Step 3: Write the targets**

Create `src/experience/floors/lobby/office/interact.ts`:

```ts
import type { Interactable } from "../../../interact/registry";
import { OFFICE, OFFICE_GITHUB_ROOM, OFFICE_ROOM, officeDeskRoom, officeWallRect, turnedHalf, type OfficeSlot } from "../officeLayout";

export interface OfficeTargetLabels {
  office: string;
  github: string;
  desk: (slot: number) => string;
}

/** Pick volume top of a Rover (antenna tip plus a hop). */
const ROVER_TOP = 2.7;

/**
 * The office's point-and-go targets, registered by OfficeScene while it is mounted (`registerExtraInteractables`,
 * like the Highlights Hall): the summary and GitHub halves of the wall and one per Rover. Every drive stops at
 * the office stop; the drawer opens there.
 */
export function officeInteractables(slots: readonly OfficeSlot[], labels: OfficeTargetLabels): Interactable[] {
  const at = { x: OFFICE.stop.x, z: OFFICE.stop.z };
  const wall = officeWallRect();
  const face = { minZ: wall.minZ, maxZ: wall.minZ + OFFICE.wall.t };
  const base = OFFICE.wall.bottom;
  const height = OFFICE.wall.bottom + OFFICE.wall.h;
  const front = OFFICE.deskRadius - OFFICE.desk.d / 2;
  const back = OFFICE.roverRadius + OFFICE.rover.radius;
  const mid = (front + back) / 2;
  const d = back - front;
  return [
    // Seen from the stop (looking south) the canvas's left half, the summary, is the wall's east half.
    { id: "L1:station:office", floor: "L1", kind: "station", label: labels.office, at, bounds: { minX: OFFICE.wall.x, maxX: wall.maxX, ...face }, base, height, action: { type: "open-room", room: OFFICE_ROOM } },
    { id: "L1:station:office-github", floor: "L1", kind: "station", label: labels.github, at, bounds: { minX: wall.minX, maxX: OFFICE.wall.x, ...face }, base, height, action: { type: "open-room", room: OFFICE_GITHUB_ROOM } },
    ...slots.map((s): Interactable => {
      const center = { x: OFFICE.center.x + mid * Math.sin(s.theta), z: OFFICE.center.z + mid * Math.cos(s.theta) };
      const h = turnedHalf(OFFICE.desk.w, d, s.yaw);
      return {
        id: `L1:station:office-desk-${s.slot + 1}`,
        floor: "L1",
        kind: "station",
        label: labels.desk(s.slot),
        at,
        bounds: { minX: center.x - h.x, maxX: center.x + h.x, minZ: center.z - h.z, maxZ: center.z + h.z },
        box: { center, w: OFFICE.desk.w, d, yaw: s.yaw },
        height: ROVER_TOP,
        action: { type: "open-room", room: officeDeskRoom(s.slot) },
      };
    }),
  ];
}
```

- [ ] **Step 4: Run the test**

Run: `bunx vitest run tests/unit/office-interact.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the scene**

Create `src/experience/floors/lobby/office/OfficeScene.tsx`:

```tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DynamicDrawUsage,
  Frustum,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Sphere,
  Vector3,
  type Group,
  type InstancedMesh,
  type Mesh,
  type Object3D,
} from "three";
import type { OfficeState } from "@/lib/office/protocol";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { createHoloMaterial, HOLO_MODE } from "../../../fx/holoFx";
import { neonColor } from "../../../fx/materials";
import { sceneProbes } from "../../../fx/probes";
import { useDispose } from "../../../fx/useDispose";
import { registerExtraInteractables } from "../../../interact/registry";
import { sceneTarget } from "../../../scene/postHandle";
import { precompileObject } from "../../../scene/precompile";
import { renderProbe } from "../../../scene/renderProbe";
import { RIDE_CULL_BOUNDS } from "../../../tower/rideCull";
import type { GpuTier } from "../../../types";
import { OFFICE, officeBounds, officeSlots, type OfficeSlot, type OfficeTranslate } from "../officeLayout";
import { officeInteractables } from "./interact";
import { officeLive, useOfficeFeed } from "./live";
import { ATLAS, cellUv, drawFace, drawScreen, faceCell, faceKey, screenCell, screenKey, type CanvasFonts } from "./officeAtlas";
import { officeView, screenInput, type OfficeView } from "./officeModel";
import { chipAnchor, GLOW_PER_ROVER, PARTS_PER_ROVER, roverFrame, TREADS_PER_ROVER, writeDeskScreen, writeFace, writeGlow, writeRover } from "./officeRig";
import { CROSSFADE_S, OFFICE_STATE_STYLE, pose, poseOffset, slotPhase, STILL_T, stillPose } from "./officeVisual";
import { drawWall, WALL_CANVAS, wallKey, wallModel } from "./officeWall";
import { OFFICE_CHIP_FAR, officeRuntime, setChipFar } from "./runtime";

const NO_RAYCAST = () => null;
const QUADS = 10;
/** Faces and desk screens redraw at most this often, only the cells whose frame key changed (rover/faces.ts pattern). */
const ATLAS_FPS = { full: 10, lite: 5 } as const;
const FRAME = new Matrix4();

function cssFont(variable: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

/** Reads the site fonts for canvas text, again once web fonts are ready (then `onReady` forces a redraw). */
function useCanvasFonts(onReady: () => void): RefObject<CanvasFonts> {
  const fonts = useRef<CanvasFonts>({ mono: "monospace", sans: "sans-serif" });
  useEffect(() => {
    const read = () => {
      fonts.current.mono = cssFont("--font-jetbrains", "monospace");
      fonts.current.sans = cssFont("--font-inter", "sans-serif");
      onReady();
    };
    read();
    void document.fonts?.ready.then(read);
  }, [onReady]);
  return fonts;
}

/** Five faces then five desk screens as one merged quad mesh (one draw call, one atlas). */
function atlasQuads(slots: readonly OfficeSlot[]): BufferGeometry {
  const positions = new Float32Array(QUADS * 12);
  const uvs = new Float32Array(QUADS * 8);
  const index: number[] = [];
  for (let q = 0; q < QUADS; q++) {
    const [u0, v0, u1, v1] = cellUv(q < slots.length ? faceCell(q) : screenCell(q - slots.length));
    uvs.set([u0, v0, u1, v0, u1, v1, u0, v1], q * 8);
    const b = q * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  for (const s of slots) {
    writeFace(roverFrame(s, stillPose("asleep"), FRAME), positions, s.slot);
    writeDeskScreen(s, positions, slots.length + s.slot);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
  g.setAttribute("uv", new BufferAttribute(uvs, 2));
  g.setIndex(index);
  // The faces move with their Rovers: one fixed sphere around the whole office, so culling never trusts stale bounds.
  const b = officeBounds();
  g.boundingSphere = new Sphere(new Vector3((b.minX + b.maxX) / 2, 2, (b.minZ + b.maxZ) / 2), Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 3);
  return g;
}

/** Rest instances (every Rover asleep), attached at creation so precompile, bounds and culling see the final meshes. */
function restInstances(slots: readonly OfficeSlot[]) {
  const parts = new Float32Array(slots.length * PARTS_PER_ROVER * 16);
  const treads = new Float32Array(slots.length * TREADS_PER_ROVER * 16);
  const glow = new Float32Array(slots.length * GLOW_PER_ROVER * 16);
  const colors = new Float32Array(slots.length * GLOW_PER_ROVER * 3);
  const p = stillPose("asleep");
  for (const s of slots) {
    roverFrame(s, p, FRAME);
    writeRover(FRAME, p, parts, s.slot, treads);
    writeGlow(s, FRAME, "asleep", null, 1, 0, true, OFFICE.stop, glow, colors);
  }
  return { parts, treads, glow, colors };
}

/**
 * Compiles and pins every office program once the scene draws into its final target (HallReady in
 * HighlightsHall.tsx), showing hidden children for the synchronous compile, so the office never hitches on its
 * first view. Shared programs make it a no-op in practice; it stays for safety.
 */
function OfficeReady({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null);
  const tier = useHQStore((s) => s.tier);
  const [ready, setReady] = useState(false);
  const started = useRef(false);
  useFrame((state) => {
    const g = group.current;
    if (started.current || !g || !renderProbe.rendered || (tier === "full" && sceneTarget() === null)) return;
    started.current = true;
    const hidden: Object3D[] = [];
    g.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    const done = precompileObject(state.gl, g, state.camera, state.scene);
    for (const o of hidden) o.visible = false;
    void done.catch(() => null).finally(() => {
      setReady(true);
      sceneProbes.office.loaded = true;
    });
  });
  return (
    <group ref={group} name="agent-office-live" visible={ready}>
      {children}
    </group>
  );
}

/**
 * The five office Rovers: light parts and treads (two instanced standard meshes with `alphaHash`, the player
 * Rover's wheel program), their faces and the desk screens (one quad mesh on one canvas atlas, the player
 * face's material settings), and the glow (one instanced holo mesh: antenna tips, halos, progress dots).
 */
function OfficeRovers({ view, slots, tier, t }: { view: OfficeView; slots: readonly OfficeSlot[]; tier: GpuTier; t: OfficeTranslate }) {
  const reduced = useHQStore((s) => s.reducedMotion);
  const box = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useDispose(box);
  const light = useMemo(() => new MeshStandardMaterial({ color: "#d4d4d8", roughness: 0.55, alphaHash: true }), []);
  useDispose(light);
  const dark = useMemo(() => new MeshStandardMaterial({ color: "#27272a", roughness: 0.9, alphaHash: true }), []);
  useDispose(dark);
  const dot = useMemo(() => new PlaneGeometry(1, 1), []);
  useDispose(dot);
  const glow = useMemo(() => {
    const m = createHoloMaterial({ mode: HOLO_MODE.dot, color: neonColor("#ffffff", 1.6, tier), params: [0, 1, 0, 0] });
    // Dot mode never moves a vertex, so the ride cull may trust the instance bounds (like the observatory dots).
    m.userData[RIDE_CULL_BOUNDS] = true;
    return m;
  }, [tier]);
  useDispose(glow);
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = ATLAS.w;
    c.height = ATLAS.h;
    return c;
  }, []);
  const atlas = useMemo(() => {
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }, [canvas]);
  useDispose(atlas);
  const screens = useMemo(() => new MeshBasicMaterial({ map: atlas, color: neonColor("#ffffff", 1.6, tier), toneMapped: false, alphaHash: true }), [atlas, tier]);
  useDispose(screens);
  const quads = useMemo(() => atlasQuads(slots), [slots]);
  useDispose(quads);
  const rest = useMemo(() => restInstances(slots), [slots]);
  const parts = useRef<InstancedMesh>(null);
  const treads = useRef<InstancedMesh>(null);
  const glows = useRef<InstancedMesh>(null);
  // Per-frame writes go through the mesh refs (the geometry, the material's map), never through the memoized values.
  const screenMesh = useRef<Mesh>(null);
  const local = useRef({
    next: 0,
    faces: [] as string[],
    screens: [] as string[],
    states: view.rovers.map((r) => r.state),
    fades: view.rovers.map((): { from: OfficeState; at: number } | null => null),
  });
  const redraw = useCallback(() => {
    local.current.faces = [];
    local.current.screens = [];
  }, []);
  const fonts = useCanvasFonts(redraw);
  const fps = ATLAS_FPS[tier === "full" ? "full" : "lite"];

  useFrame(({ clock, camera }) => {
    const P = parts.current;
    const D = treads.current;
    const G = glows.current;
    const Q = screenMesh.current;
    if (!P || !D || !G || !Q || !officeRuntime.inView) return;
    const now = clock.elapsedTime;
    const position = Q.geometry.getAttribute("position") as BufferAttribute;
    const positions = position.array as Float32Array;
    let bob = 0;
    for (const r of view.rovers) {
      const s = slots[r.slot];
      const p = pose(r.state, now, slotPhase(r.slot), reduced);
      bob = Math.max(bob, poseOffset(r.state, p));
      roverFrame(s, p, FRAME);
      writeRover(FRAME, p, P.instanceMatrix.array as Float32Array, r.slot, D.instanceMatrix.array as Float32Array);
      writeFace(FRAME, positions, r.slot);
      writeGlow(s, FRAME, r.state, r.progress, p.tipScale, now, reduced, camera.position, G.instanceMatrix.array as Float32Array, G.instanceColor!.array as Float32Array);
      chipAnchor(FRAME, officeRuntime.anchors[r.slot]);
    }
    P.instanceMatrix.needsUpdate = true;
    D.instanceMatrix.needsUpdate = true;
    G.instanceMatrix.needsUpdate = true;
    G.instanceColor!.needsUpdate = true;
    position.needsUpdate = true;
    sceneProbes.office.bob = bob;

    const l = local.current;
    if (now < l.next) return;
    l.next = now + 1 / fps;
    const map = (Q.material as MeshBasicMaterial).map;
    const ctx = (map?.image as HTMLCanvasElement | undefined)?.getContext("2d");
    if (!map || !ctx) return;
    const drawT = reduced ? STILL_T : now;
    const texts = { waiting: t("3d.waiting"), jobs: (done: number, total: number) => t("3d.jobs", { done, total }), sleep: "z Z" };
    let dirty = false;
    for (const r of view.rovers) {
      const phase = slotPhase(r.slot);
      if (l.states[r.slot] !== r.state) {
        // Reduced motion crossfades the face and the screen; full motion cuts (the pose already moves).
        l.fades[r.slot] = reduced ? { from: l.states[r.slot], at: now } : null;
        l.states[r.slot] = r.state;
      }
      const fade = l.fades[r.slot];
      const k = fade ? Math.min(1, (now - fade.at) / CROSSFADE_S) : 1;
      const style = OFFICE_STATE_STYLE[r.state];
      const input = screenInput(r, t);
      const fk = `${faceKey(style.face, drawT, phase, fps, reduced)}|${k}`;
      if (fk !== l.faces[r.slot]) {
        l.faces[r.slot] = fk;
        const cell = faceCell(r.slot);
        if (fade && k < 1) drawFace(ctx, cell, OFFICE_STATE_STYLE[fade.from].face, OFFICE_STATE_STYLE[fade.from].color, drawT, phase, fonts.current.mono, 1, reduced);
        drawFace(ctx, cell, style.face, style.color, drawT, phase, fonts.current.mono, k, reduced);
        dirty = true;
      }
      const sk = `${screenKey(input, drawT, fps, reduced)}|${k}`;
      if (sk !== l.screens[r.slot]) {
        l.screens[r.slot] = sk;
        const cell = screenCell(r.slot);
        if (fade && k < 1) drawScreen(ctx, cell, { ...input, kind: OFFICE_STATE_STYLE[fade.from].screen, color: OFFICE_STATE_STYLE[fade.from].color }, texts, drawT, phase, fonts.current, 1);
        drawScreen(ctx, cell, input, texts, drawT, phase, fonts.current, k);
        dirty = true;
      }
      if (fade && k >= 1) l.fades[r.slot] = null;
    }
    if (dirty) map.needsUpdate = true;
  });

  return (
    <group name="office-rovers">
      <instancedMesh ref={parts} args={[box, light, slots.length * PARTS_PER_ROVER]} raycast={NO_RAYCAST} name="office-rover-parts">
        <instancedBufferAttribute attach="instanceMatrix" args={[rest.parts, 16]} usage={DynamicDrawUsage} />
      </instancedMesh>
      <instancedMesh ref={treads} args={[box, dark, slots.length * TREADS_PER_ROVER]} raycast={NO_RAYCAST} name="office-rover-treads">
        <instancedBufferAttribute attach="instanceMatrix" args={[rest.treads, 16]} usage={DynamicDrawUsage} />
      </instancedMesh>
      <mesh ref={screenMesh} geometry={quads} material={screens} raycast={NO_RAYCAST} name="office-screens" />
      <instancedMesh ref={glows} args={[dot, glow, slots.length * GLOW_PER_ROVER]} raycast={NO_RAYCAST} name="office-glow" renderOrder={1}>
        <instancedBufferAttribute attach="instanceMatrix" args={[rest.glow, 16]} usage={DynamicDrawUsage} />
        <instancedBufferAttribute attach="instanceColor" args={[rest.colors, 3]} usage={DynamicDrawUsage} />
      </instancedMesh>
    </group>
  );
}

/** The screen wall: one quad with its own canvas texture, redrawn at most twice a second, only when its content changed. */
function OfficeWall({ view, tier, t }: { view: OfficeView; tier: GpuTier; t: OfficeTranslate }) {
  const size = WALL_CANVAS[tier === "full" ? "full" : "lite"];
  const reduced = useHQStore((s) => s.reducedMotion);
  const locale = useHQStore((s) => s.locale);
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = size.w;
    c.height = size.h;
    return c;
  }, [size]);
  const texture = useMemo(() => {
    const tx = new CanvasTexture(canvas);
    tx.colorSpace = SRGBColorSpace;
    return tx;
  }, [canvas]);
  useDispose(texture);
  const plane = useMemo(() => new PlaneGeometry(OFFICE.wall.w, OFFICE.wall.h), []);
  useDispose(plane);
  const material = useMemo(() => new MeshBasicMaterial({ map: texture, color: neonColor("#ffffff", 1.3, tier), toneMapped: false, alphaHash: true }), [texture, tier]);
  useDispose(material);
  const wall = useRef<Mesh>(null);
  const local = useRef({ next: 0, key: "" });
  const redraw = useCallback(() => {
    local.current.key = "";
  }, []);
  const fonts = useCanvasFonts(redraw);
  useFrame(({ clock }) => {
    const l = local.current;
    const now = clock.elapsedTime;
    if (now < l.next || !officeRuntime.inView || !wall.current) return;
    l.next = now + 0.5;
    const model = wallModel(view, t, locale, Date.now());
    const drawT = reduced ? 0 : now;
    const key = wallKey(model, drawT);
    if (key === l.key) return;
    const map = (wall.current.material as MeshBasicMaterial).map;
    const ctx = (map?.image as HTMLCanvasElement | undefined)?.getContext("2d");
    if (!map || !ctx) return;
    l.key = key;
    drawWall(ctx, size, model, drawT, fonts.current);
    map.needsUpdate = true;
    sceneProbes.office.wallFrames += 1;
  });
  // The plane faces north (rotation y = pi), so the canvas reads left to right from the plaza.
  return (
    <mesh
      ref={wall}
      geometry={plane}
      material={material}
      raycast={NO_RAYCAST}
      name="office-wall"
      position={[OFFICE.wall.x, OFFICE.wall.bottom + OFFICE.wall.h / 2, OFFICE.wall.z - OFFICE.wall.t / 2 - 0.01]}
      rotation={[0, Math.PI, 0]}
    />
  );
}

/**
 * Every 0.5 s: is the office in view on L1 (a frustum test of its bounds)? That gates the per-frame work, the
 * wall redraws and the polling ("view"). Every frame: moves the HTML chips over their Rovers (HintProbe pattern)
 * and writes the probes. Renders nothing.
 */
function OfficeWatch({ view }: { view: OfficeView }) {
  const tmp = useMemo(() => ({ box: new Box3(), frustum: new Frustum(), m: new Matrix4(), v: new Vector3() }), []);
  const bounds = useMemo(() => officeBounds(), []);
  const next = useRef(0);
  useEffect(
    () => () => {
      officeRuntime.inView = false;
      officeLive.want("view", false);
    },
    [],
  );
  useFrame(({ camera, clock, size }) => {
    const s = getHQStore().getState();
    const here = s.floor === "L1" && !s.ride && (s.phase === "explore" || s.phase === "room");
    const now = clock.elapsedTime;
    if (now >= next.current) {
      next.current = now + 0.5;
      tmp.box.min.set(bounds.minX, 0, bounds.minZ);
      tmp.box.max.set(bounds.maxX, OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame, bounds.maxZ);
      tmp.frustum.setFromProjectionMatrix(tmp.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const inView = here && tmp.frustum.intersectsBox(tmp.box);
      officeRuntime.inView = inView;
      officeLive.want("view", inView);
      Object.assign(sceneProbes.office, { desks: view.rovers.length, states: view.rovers.map((r) => r.state), mode: view.mode, inView, polling: officeLive.polling() });
    }
    let chips = 0;
    officeRuntime.chips.forEach((el, slot) => {
      if (!el) return;
      const a = officeRuntime.anchors[slot];
      tmp.v.set(a.x, a.y, a.z);
      setChipFar(slot, camera.position.distanceTo(tmp.v) > OFFICE_CHIP_FAR);
      tmp.v.project(camera);
      const on = here && officeRuntime.inView && tmp.v.z < 1 && Math.abs(tmp.v.x) <= 1 && Math.abs(tmp.v.y) <= 1;
      const x = ((tmp.v.x + 1) / 2) * size.width;
      const y = ((1 - tmp.v.y) / 2) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      el.style.visibility = on ? "visible" : "hidden";
      el.style.opacity = on ? "1" : "0";
      if (on) chips += 1;
    });
    sceneProbes.office.chips = chips;
  });
  return null;
}

/**
 * The live L1 Agent Office (lazy chunk; the furniture shell is drawn by the main-path OfficeMount): five Rovers,
 * their faces and desk screens, the glow, the screen wall, the chips' positions and seven point-and-go targets.
 * Five draw calls here (parts, treads, screens, glow, wall), on programs L1 already has.
 */
export function OfficeScene({ tier, t }: { tier: GpuTier; t: OfficeTranslate }) {
  const feed = useOfficeFeed();
  const view = useMemo(() => officeView(feed), [feed]);
  const slots = useMemo(() => officeSlots(), []);
  const agents = view.rovers.map((r) => r.agent ?? "").join(",");
  useEffect(() => {
    const names = agents.split(",");
    return registerExtraInteractables(
      "L1",
      officeInteractables(slots, {
        office: t("3d.target.office"),
        github: t("3d.target.github"),
        desk: (slot) => t("3d.target.desk", { n: slot + 1, agent: names[slot] ? t(`agent.${names[slot]}`) : t("3d.offDuty") }),
      }),
    );
  }, [agents, slots, t]);
  useEffect(
    () => () => {
      Object.assign(sceneProbes.office, { loaded: false, desks: 0, states: [], chips: 0, bob: 0, inView: false, polling: false });
    },
    [],
  );
  return (
    <OfficeReady>
      <OfficeRovers view={view} slots={slots} tier={tier} t={t} />
      <OfficeWall view={view} tier={tier} t={t} />
      <OfficeWatch view={view} />
    </OfficeReady>
  );
}
```

Update `src/experience/floors/lobby/office/scene.ts`:

```ts
/**
 * The Agent Office chunk entry (L1, loaded on demand by `./chunk.ts`): everything live about the office. Main-path
 * code imports nothing from here but types (tests/unit/office-chunk-graph.test.ts).
 */
export { officeTest } from "./live";
export { OfficeScene } from "./OfficeScene";
```

- [ ] **Step 6: Typecheck and lint**

Run: `bunx tsc --noEmit -p . && bunx eslint src/experience/floors/lobby/office`
Expected: exit 0, no lint errors.

- [ ] **Step 7: Commit**

```bash
git add src/experience/floors/lobby/office/interact.ts src/experience/floors/lobby/office/OfficeScene.tsx src/experience/floors/lobby/office/scene.ts tests/unit/office-interact.test.ts
git commit -m "feat(office): office scene with Rovers, atlas, glow, wall and targets"
```

### Task 10: Mount the office in the Lobby (shell, trigger, intro reveal)

**Files:**
- Create: `src/experience/floors/lobby/office/OfficeMount.tsx`
- Modify: `src/experience/floors/Lobby.tsx`
- Modify: `tests/unit/intro-chunk-graph.test.ts`
- Test: `tests/unit/office-chunk-graph.test.ts`

**Interfaces:**
- Consumes: `afterFirstFrameIdle` (`boot-signals.ts`), `speculativePrefetchOn(search)` (`floors/floorChunks.ts`), `MergedBoxes`, `MergedEdges` (`floors/roof/kit.tsx`), `roverRuntime`, `LOBBY`, `COLORS`, `IntroReveal`, `useComposerLive` (already in `Lobby.tsx`), `officeShellBoxes`, `officeBounds`, `OfficeTranslate` (Task 1), `loadOffice`, `officeChunkState`, `officeLoadWanted`, `useOfficeModule` (Task 8).
- Produces: `OfficeMount({ tier, t, ready }: { tier: GpuTier; t: OfficeTranslate; ready: boolean })`; `REVEAL.office` in `Lobby.tsx`; `staticClosure` checks in `tests/unit/office-chunk-graph.test.ts` (`OFFICE_ONLY`, `MAIN`).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/office-chunk-graph.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, staticClosure } from "../helpers/import-graph";

const DIR = "src/experience/floors/lobby/office";
const ENTRY = `${DIR}/scene.ts`;
/** Office-only modules: the chunk entry reaches them; the main 3D path never does. */
const OFFICE_ONLY = [
  ENTRY,
  `${DIR}/live.ts`,
  `${DIR}/runtime.ts`,
  `${DIR}/officeVisual.ts`,
  `${DIR}/officeRig.ts`,
  `${DIR}/officeAtlas.ts`,
  `${DIR}/officeModel.ts`,
  `${DIR}/officeWall.ts`,
  `${DIR}/interact.ts`,
  `${DIR}/OfficeScene.tsx`,
  "src/lib/office/poll.ts",
  "src/lib/office/model.ts",
];
/** The main-path part of the office: the loader, the mount with the furniture shell and the layout. */
const MAIN = [`${DIR}/chunk.ts`, `${DIR}/OfficeMount.tsx`, "src/experience/floors/lobby/officeLayout.ts"];

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.tsx?$/.test(name)) out.push(relative(ROOT, full));
  }
  return out;
}

describe("Agent Office chunk boundary", () => {
  it("keeps the office-only code out of the main 3D chunk and the gate", () => {
    for (const entry of ["src/experience/Experience.tsx", "src/experience/ExperienceGate.tsx"]) {
      const main = staticClosure(entry);
      expect(OFFICE_ONLY.filter((f) => main.has(f)), entry).toEqual([]);
    }
  });

  it("keeps the loader, the mount and the layout on the main path", () => {
    const main = staticClosure("src/experience/Experience.tsx");
    for (const f of MAIN) expect(main.has(f), f).toBe(true);
  });

  it("lets no main-path file under src/experience or src/hud import a value from the office chunk", () => {
    const chunk = staticClosure(ENTRY);
    const offenders = [...files(join(ROOT, "src/experience")), ...files(join(ROOT, "src/hud"))]
      .filter((f) => !chunk.has(f))
      .filter((f) => OFFICE_ONLY.some((only) => staticClosure(f).has(only)));
    expect(offenders).toEqual([]);
    // One closure per file under two folders: slower than the default 5 s on a busy machine.
  }, 60_000);

  it("reaches every office-only module from the entry, imported dynamically from chunk.ts only", () => {
    const chunk = staticClosure(ENTRY);
    expect(OFFICE_ONLY.filter((f) => !chunk.has(f))).toEqual([]);
    expect(readFileSync(join(ROOT, `${DIR}/chunk.ts`), "utf8")).toContain(`import("./scene")`);
    const importers = files(join(ROOT, "src")).filter((f) => /import\(\s*["'][^"']*office\/scene["']\s*\)|import\(\s*["']\.\/scene["']\s*\)/.test(readFileSync(join(ROOT, f), "utf8")));
    expect(importers.filter((f) => f.startsWith(DIR) || f.includes("office"))).toEqual([`${DIR}/chunk.ts`]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bunx vitest run tests/unit/office-chunk-graph.test.ts`
Expected: FAIL in "keeps the loader, the mount and the layout on the main path" (`src/experience/floors/lobby/office/OfficeMount.tsx: expected false to be true`).

- [ ] **Step 3: Write the mount**

Create `src/experience/floors/lobby/office/OfficeMount.tsx`:

```tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { afterFirstFrameIdle } from "../../../boot-signals";
import { COLORS, LOBBY } from "../../../config";
import { roverRuntime } from "../../../rover/runtime";
import type { GpuTier } from "../../../types";
import { speculativePrefetchOn } from "../../floorChunks";
import { MergedBoxes, MergedEdges } from "../../roof/kit";
import { officeShellBoxes, type OfficeTranslate } from "../officeLayout";
import { loadOffice, officeChunkState, officeLoadWanted, useOfficeModule } from "./chunk";

/** One stable list, so MergedBoxes and MergedEdges build their geometry once. */
const SHELL = officeShellBoxes();

/**
 * L1 Agent Office mount (main path). Always draws the furniture shell (2 calls on the programs the observatory
 * already uses), which matches the navgrid obstacles, so the rover never bumps into an invisible desk before the
 * chunk loads or if it fails. Every 0.5 s after the first frame went idle it asks `officeLoadWanted` (on L1 or
 * riding there, near the office, `?prefetch=off` respected) and starts the chunk; opening an office drawer loads
 * it too (drawer body). The live scene mounts once loaded and `ready` (the full tier's composer exists, like the
 * intro beacons), never in the middle of the intro (its first compile would hitch the orbit); a load during the
 * boot card mounts at once, so the reveal ring switches it on. Once mounted it stays.
 */
export function OfficeMount({ tier, t, ready }: { tier: GpuTier; t: OfficeTranslate; ready: boolean }) {
  const mod = useOfficeModule();
  const onL1 = useHQStore((s) => (s.ride?.to ?? s.floor) === "L1");
  const intro = useHQStore((s) => s.phase === "intro");
  const [mounted, setMounted] = useState(false);
  if (mod && onL1 && ready && !intro && !mounted) setMounted(true);
  const idle = useRef(false);
  const next = useRef(0);
  useEffect(
    () =>
      afterFirstFrameIdle(() => {
        idle.current = true;
      }),
    [],
  );
  useFrame(({ clock }) => {
    if (clock.elapsedTime < next.current) return;
    next.current = clock.elapsedTime + 0.5;
    const s = getHQStore().getState();
    const want = officeLoadWanted({
      idle: idle.current,
      state: officeChunkState(),
      prefetch: speculativePrefetchOn(window.location.search),
      floor: s.floor,
      rideTo: s.ride?.to ?? null,
      at: s.ride ? LOBBY.arrival : roverRuntime,
    });
    if (want) void loadOffice().catch(() => null);
  });
  const Scene = mounted ? mod?.OfficeScene : undefined;
  return (
    <group name="agent-office">
      <MergedBoxes boxes={SHELL} color="#0b1020" emissive={COLORS.cyan} emissiveIntensity={0.05} />
      <MergedEdges boxes={SHELL} color={COLORS.cyan} tier={tier} opacity={0.6} />
      {Scene && <Scene tier={tier} t={t} />}
    </group>
  );
}
```

- [ ] **Step 4: Wire it into the Lobby**

In `src/experience/floors/Lobby.tsx`:

```ts
import { OfficeMount } from "./lobby/office/OfficeMount";
import { officeBounds, type OfficeTranslate } from "./lobby/officeLayout";
```

(replacing the `import type { OfficeTranslate }` line from Task 2), add to `REVEAL` after `hall: ...`:

```ts
  office: officeBounds(),
```

and in the JSX after the observatory's `IntroReveal`:

```tsx
      {/* Agent Office (D1, D7): the shell always, the live office from its lazy chunk (floors/lobby/office/). */}
      <IntroReveal rect={REVEAL.office}>
        <OfficeMount tier={tier} t={labels.office} ready={composerLive} />
      </IntroReveal>
```

In `tests/unit/intro-chunk-graph.test.ts`: the office loader also writes `import("./scene")`, so in "puts the beacons and the veil in the chunk entry" change the last assertion to `expect(importers.filter((f) => !f.startsWith("src/experience/floors/lobby/office/"))).toEqual(["src/experience/intro/chunk.ts"]);`, and give "lets no main-path file under src/experience import a value from the intro chunk" a 60 s timeout (`}, 60_000);`): the new office files make its one-closure-per-file scan cross the default 5 s.

The intro keeps its five landmark beacons (`INTRO_LANDMARKS` unchanged): the office's live part may still be loading when the orbit passes, and a beacon pulsing over an empty desk row would point at nothing; the shell still switches on with the reveal ring.

- [ ] **Step 5: Run the tests**

Run: `bunx vitest run tests/unit/office-chunk-graph.test.ts tests/unit/intro-chunk-graph.test.ts tests/unit/floor-chunks-graph.test.ts && bunx tsc --noEmit -p .`
Expected: PASS; `tsc` exits 0.

- [ ] **Step 6: Check it in the browser**

Run: `bun run build && E2E_PORT=4420 bunx playwright test e2e/experience.spec.ts --workers=1`
Expected: PASS (the Lobby still boots, explores and opens rooms with the office mounted).

- [ ] **Step 7: Commit**

```bash
git add src/experience/floors/lobby/office/OfficeMount.tsx src/experience/floors/Lobby.tsx tests/unit/office-chunk-graph.test.ts tests/unit/intro-chunk-graph.test.ts
git commit -m "feat(office): mount the office shell and the lazy office scene in the Lobby"
```

### Task 11: HTML chips over the Rovers

**Files:**
- Create: `src/experience/floors/lobby/office/OfficeChips.tsx`
- Create: `src/hud/OfficeLayer.tsx`
- Modify: `src/experience/floors/lobby/office/scene.ts`
- Modify: `src/hud/Hud.tsx`
- Modify: `tests/unit/office-chunk-graph.test.ts`
- Test: `tests/hud/OfficeChips.test.tsx`

**Interfaces:**
- Consumes: `useOfficeFeed` (Task 8), `officeView`, `chipLines` (Task 7), `OFFICE_STATE_STYLE` (Task 5), `officeRuntime`, `useChipFar` (Task 8), `officeDeskRoom` (Task 1), `goToRoom(id)` (`missions/bridge.ts`), `useHQStore`, `useOfficeModule` (Task 8).
- Produces: `OfficeChips()` (chunk, exported from `scene.ts`), `OfficeLayer()` (main path, mounted by `Hud`).

- [ ] **Step 1: Write the failing test**

Create `tests/hud/OfficeChips.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import type { OfficeFeed } from "@/lib/office/poll";
import { getHQStore } from "@/store/useHQStore";
import { statesA, statesB } from "../../e2e/office-fixtures";

const live = vi.hoisted(() => ({ feed: { status: "idle", snapshot: null, fetchedAt: 0 } as OfficeFeed }));
const bridge = vi.hoisted(() => ({ goToRoom: vi.fn() }));
vi.mock("@/experience/floors/lobby/office/live", () => ({ useOfficeFeed: () => live.feed, officeLive: { want: vi.fn(), polling: () => true } }));
vi.mock("@/experience/missions/bridge", () => bridge);

import { OfficeChips } from "@/experience/floors/lobby/office/OfficeChips";
import { officeRuntime, setChipFar } from "@/experience/floors/lobby/office/runtime";

const renderChips = () =>
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <OfficeChips />
    </NextIntlClientProvider>,
  );
const chip = (slot: number) => screen.getAllByTestId("office-chip").find((el) => el.dataset.slot === String(slot))!;

beforeEach(() => {
  getHQStore().setState({ phase: "explore", floor: "L1", activeRoom: null, device: { viewport: "desktop", camera: "desktop", coarse: false } });
  live.feed = { status: "ready", snapshot: statesA(Date.now()), fetchedAt: Date.now() };
});
afterEach(() => {
  cleanup();
  bridge.goToRoom.mockClear();
  for (let slot = 0; slot < 5; slot++) setChipFar(slot, false);
});

describe("Agent Office chips", () => {
  it("shows one chip per Rover with agent and activity, the title or Client project, and CI progress", () => {
    renderChips();
    expect(screen.getAllByTestId("office-chip")).toHaveLength(5);
    expect(chip(0)).toHaveTextContent("Copilot · Editing");
    expect(chip(0)).toHaveTextContent("Agent office scene");
    expect(chip(1)).toHaveTextContent(en.office.clientProject);
    expect(chip(4).querySelector("[data-progress]")).toHaveAttribute("data-progress", "58");
    expect(chip(0)).toHaveAttribute("data-state", "working");
    expect(officeRuntime.chips.every((el) => el instanceof HTMLElement)).toBe(true);
  });

  it("labels an off-duty Rover and drops the details of a far chip", () => {
    live.feed = { status: "ready", snapshot: statesB(Date.now()), fetchedAt: Date.now() };
    renderChips();
    expect(chip(4)).toHaveTextContent(en.office["3d"].offDuty);
    expect(chip(1)).toHaveTextContent("Office drawers");
    act(() => setChipFar(1, true));
    expect(chip(1)).not.toHaveTextContent("Office drawers");
    expect(chip(1)).toHaveAttribute("data-far", "true");
  });

  it("opens the Rover's desk drawer through the room mission (drive to the office stop, then open)", () => {
    renderChips();
    fireEvent.click(chip(2));
    expect(bridge.goToRoom).toHaveBeenCalledWith("L1:office-desk-3");
    // The chip stays visibility-hidden until the scene places it, so read the label rather than the computed name.
    expect(chip(2)).toHaveAttribute("aria-label", "Desk 3: Codex · Reading");
  });

  it("hides every chip on phones while a drawer covers the screen", () => {
    getHQStore().setState({ phase: "room", device: { viewport: "mobile", camera: "mobile", coarse: true } });
    renderChips();
    expect(screen.queryAllByTestId("office-chip")).toHaveLength(0);
    expect(officeRuntime.chips.every((el) => el === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bunx vitest run tests/hud/OfficeChips.test.tsx`
Expected: FAIL with `Failed to resolve import "@/experience/floors/lobby/office/OfficeChips"`.

- [ ] **Step 3: Write the chips**

Create `src/experience/floors/lobby/office/OfficeChips.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { goToRoom } from "@/experience/missions/bridge";
import { useHQStore } from "@/store/useHQStore";
import { officeDeskRoom } from "../officeLayout";
import { useOfficeFeed } from "./live";
import { chipLines, officeView, type OfficeRoverView } from "./officeModel";
import { OFFICE_STATE_STYLE } from "./officeVisual";
import { officeRuntime, useChipFar } from "./runtime";

/**
 * One chip over a Rover (the mock's `.tag`, in HUD tokens): a state dot (never an edge stripe) with
 * "<Agent> · <activity>", then the title or "Client project" and a CI progress bar, both dropped when far.
 * OfficeScene moves it every frame (HintProbe pattern) through `officeRuntime.chips`. A click opens the
 * Rover's drawer the way its point-and-go target does (drive to the office stop, then open).
 */
function Chip({ rover }: { rover: OfficeRoverView }) {
  const t = useTranslations("office");
  const far = useChipFar(rover.slot);
  const line = chipLines(rover, t);
  const color = OFFICE_STATE_STYLE[rover.state].color;
  return (
    <button
      ref={(el) => {
        officeRuntime.chips[rover.slot] = el;
      }}
      type="button"
      onClick={() => goToRoom(officeDeskRoom(rover.slot))}
      data-testid="office-chip"
      data-slot={rover.slot}
      data-state={rover.state}
      data-far={far ? "true" : "false"}
      aria-label={t("3d.target.desk", { n: rover.slot + 1, agent: line.head })}
      // Hidden until OfficeScene has placed it (it then writes the transform, visibility and opacity every frame).
      style={{ opacity: 0, visibility: "hidden" }}
      className="pointer-events-auto absolute top-0 left-0 flex flex-col items-center gap-1 will-change-transform"
    >
      <span className="glass glass-solid inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] text-ink">
        <span aria-hidden="true" className="hq-dot hq-dot-md" style={{ color }} />
        {line.head}
      </span>
      {!far && line.task && (
        <span className="text-[13px] leading-5 text-ink-2" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {line.task}
        </span>
      )}
      {!far && line.progress !== null && (
        <span aria-hidden="true" data-progress={Math.round(line.progress * 100)} style={{ display: "block", width: 110, height: 4, borderRadius: 2, background: "rgb(255 255 255 / 0.08)", overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${Math.round(line.progress * 100)}%`, background: color }} />
        </span>
      )}
    </button>
  );
}

/** The five chips; hidden on phones while a drawer (a bottom sheet) is open. Mounted by the HUD's OfficeLayer. */
export function OfficeChips() {
  const feed = useOfficeFeed();
  const view = useMemo(() => officeView(feed), [feed]);
  const hidden = useHQStore((s) => s.phase === "room" && s.device.viewport === "mobile");
  if (hidden) return null;
  return (
    <div data-testid="office-chips">
      {view.rovers.map((rover) => (
        <Chip key={rover.slot} rover={rover} />
      ))}
    </div>
  );
}
```

Add to `src/experience/floors/lobby/office/scene.ts`:

```ts
export { OfficeChips } from "./OfficeChips";
```

- [ ] **Step 4: Mount the chips from the HUD**

Create `src/hud/OfficeLayer.tsx`:

```tsx
"use client";

import { useOfficeModule } from "@/experience/floors/lobby/office/chunk";
import { useHQStore } from "@/store/useHQStore";

/**
 * The Agent Office chips' host (main path, a few lines): renders the lazy chunk's chips only once the chunk is
 * loaded and the rover is on L1 (not riding) while exploring or with a drawer open.
 */
export function OfficeLayer() {
  const mod = useOfficeModule();
  const show = useHQStore((s) => s.floor === "L1" && !s.ride && (s.phase === "explore" || s.phase === "room"));
  const Chips = mod?.OfficeChips;
  return show && Chips ? <Chips /> : null;
}
```

In `src/hud/Hud.tsx`, add `import { OfficeLayer } from "./OfficeLayer";` after the `InteractStatus` import, and render it right after `<BeamFade />` (below the drawer and the dialogs in DOM order):

```tsx
      <BeamFade />
      <OfficeLayer />
```

In `tests/unit/office-chunk-graph.test.ts`, add `` `${DIR}/OfficeChips.tsx`, `` to `OFFICE_ONLY` and `"src/hud/OfficeLayer.tsx"` to `MAIN`.

- [ ] **Step 5: Run the tests**

Run: `bunx vitest run tests/hud/OfficeChips.test.tsx tests/unit/office-chunk-graph.test.ts tests/unit/client-namespaces.test.ts tests/unit/edge-accents.test.ts tests/hud/HudCorners.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/experience/floors/lobby/office/OfficeChips.tsx src/experience/floors/lobby/office/scene.ts src/hud/OfficeLayer.tsx src/hud/Hud.tsx tests/hud/OfficeChips.test.tsx tests/unit/office-chunk-graph.test.ts
git commit -m "feat(office): HTML chips over the office Rovers"
```

### Task 12: Office drawers (summary, GitHub board, one per Rover)

**Files:**
- Create: `src/experience/floors/lobby/office/OfficeBody.tsx`
- Modify: `src/experience/floors/lobby/office/scene.ts`
- Modify: `src/hud/drawer/bodies.tsx`
- Modify: `tests/unit/office-chunk-graph.test.ts`
- Test: `tests/hud/OfficeBody.test.tsx`

**Interfaces:**
- Consumes: `RoomBodyProps` (`hud/drawer/bodies.tsx`, type only), `MetricTiles` (`hud/drawer/blocks.tsx`), `useOfficeFeed`, `officeLive` (Task 8), `officeView`, `chipLines`, `safeRepoUrl`, `safeGithubUrl` (Task 7), `sinceLabel` (Task 3), `OFFICE_STATE_STYLE` (Task 5), `STATUS_COLOR` (Task 7), `officeDeskRoom` (Task 1), `getHQStore().getState().openRoom(id)`, `lazyFromChunk` through `chunkBody` (`bodies.tsx`), `loadOffice` (Task 8).
- Produces: `OfficeBody({ view, locale }: RoomBodyProps)` (chunk), `CHUNK_BODIES.office`.

- [ ] **Step 1: Write the failing test**

Create `tests/hud/OfficeBody.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import type { RoomView } from "@/content/room-views/types";
import type { OfficeFeed } from "@/lib/office/poll";
import { getHQStore } from "@/store/useHQStore";
import { statesA, statesB } from "../../e2e/office-fixtures";

const live = vi.hoisted(() => ({ feed: { status: "idle", snapshot: null, fetchedAt: 0 } as OfficeFeed, want: vi.fn() }));
vi.mock("@/experience/floors/lobby/office/live", () => ({ useOfficeFeed: () => live.feed, officeLive: { want: live.want, polling: () => true } }));
// The drawer blocks import the localized Link (next-intl navigation), which needs the Next.js router.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, ...rest }: { href: string } & Record<string, unknown>) => <a href={`/en${href}`} {...rest} />,
}));

import { OfficeBody } from "@/experience/floors/lobby/office/OfficeBody";

const view = (office: NonNullable<RoomView["office"]>, id: string): RoomView => ({
  id,
  floor: "L1",
  kind: "office",
  code: id,
  title: "Agent Office",
  meta: [],
  badges: [],
  accent: "cyan",
  variant: "single",
  sections: [],
  metrics: [],
  stack: [],
  gallery: [],
  hologram: false,
  tabs: [],
  office,
});
const body = (office: NonNullable<RoomView["office"]>, id = "L1:office") =>
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <OfficeBody view={view(office, id)} locale="en" />
    </NextIntlClientProvider>,
  );
const o = en.office["3d"];

beforeEach(() => {
  live.feed = { status: "ready", snapshot: statesA(Date.now()), fetchedAt: Date.now() };
  getHQStore().setState({ phase: "room", floor: "L1", activeRoom: "L1:office" });
});
afterEach(() => {
  cleanup();
  live.want.mockClear();
});

describe("Agent Office drawers", () => {
  it("shows a public desk: state, full agent name, activity, title, repository link, time in state, recent activity, privacy note", () => {
    body({ panel: "desk", slot: 0 }, "L1:office-desk-1");
    expect(live.want).toHaveBeenCalledWith("drawer", true);
    expect(screen.getByTestId("office-state")).toHaveTextContent(en.office.state.working);
    expect(screen.getByTestId("office-body")).toHaveTextContent(o.agentFull.copilot);
    expect(screen.getByTestId("office-task")).toHaveTextContent("Agent office scene");
    expect(screen.getByTestId("office-repo")).toHaveAttribute("href", "https://github.com/ShinyQ/ShinyQ-HQ");
    expect(screen.getByTestId("office-repo")).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByTestId("office-body")).toHaveTextContent("14 min");
    expect(screen.getAllByTestId("office-recent")).toHaveLength(2);
    expect(screen.getByTestId("office-body")).toHaveTextContent(en.office.privacy);
  });

  it("hides a private desk's details and shows an off-duty desk as nothing right now", () => {
    body({ panel: "desk", slot: 1 }, "L1:office-desk-2");
    expect(screen.getByTestId("office-task")).toHaveTextContent(o.clientPrivate);
    expect(screen.queryByTestId("office-repo")).toBeNull();
    cleanup();
    live.feed = { status: "ready", snapshot: statesB(Date.now()), fetchedAt: Date.now() };
    body({ panel: "desk", slot: 4 }, "L1:office-desk-5");
    expect(screen.getByTestId("office-body")).toHaveTextContent(o.offDuty);
    expect(screen.getByTestId("office-task")).toHaveTextContent(o.drawer.none);
  });

  it("lists the five agents in the summary, opens a desk, shows today and the hooks note", () => {
    body({ panel: "summary" });
    const rows = screen.getAllByTestId("office-agent");
    expect(rows).toHaveLength(5);
    expect(rows[1]).toHaveTextContent("Desk 2: Claude · Planning");
    fireEvent.click(rows[2]);
    expect(getHQStore().getState().activeRoom).toBe("L1:office-desk-3");
    expect(screen.getAllByTestId("metric").map((m) => m.textContent)).toEqual([`3${o.drawer.tasksDone}`, `2${o.drawer.prsMerged}`, `5/6${o.drawer.ciGreen}`]);
    expect(screen.getByTestId("office-body")).toHaveTextContent(o.hooks);
  });

  it("lists public GitHub activity with status, links and progress, and its note", () => {
    body({ panel: "github" }, "L1:office-github");
    const rows = screen.getAllByTestId("office-feed-row");
    expect(rows.map((r) => r.dataset.status)).toEqual(["running", "merged"]);
    expect(within(rows[0]).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "7");
    expect(within(rows[1]).getByRole("link", { name: "feat: agent office" })).toHaveAttribute("href", "https://github.com/ShinyQ/ShinyQ-HQ/pulls");
    expect(screen.getByTestId("office-body")).toHaveTextContent(o.githubNote);
  });

  it("says so when the office is offline and keeps the last known activity", () => {
    live.feed = { status: "offline", snapshot: statesA(Date.now()), fetchedAt: Date.now() - 120_000 };
    body({ panel: "github" }, "L1:office-github");
    expect(screen.getByTestId("office-offline")).toHaveTextContent(o.drawer.offline);
    expect(screen.getAllByTestId("office-feed-row")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bunx vitest run tests/hud/OfficeBody.test.tsx`
Expected: FAIL with `Failed to resolve import "@/experience/floors/lobby/office/OfficeBody"`.

- [ ] **Step 3: Write the drawer bodies**

Create `src/experience/floors/lobby/office/OfficeBody.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Locale } from "@/content/schema";
import type { RoomBodyProps } from "@/hud/drawer/bodies";
import { MetricTiles } from "@/hud/drawer/blocks";
import { sinceLabel } from "@/lib/office/model";
import type { OfficeGithubItem } from "@/lib/office/protocol";
import { getHQStore } from "@/store/useHQStore";
import { officeDeskRoom } from "../officeLayout";
import { officeLive, useOfficeFeed } from "./live";
import { chipLines, officeView, safeGithubUrl, safeRepoUrl, type OfficeRoverView, type OfficeView } from "./officeModel";
import { OFFICE_STATE_STYLE } from "./officeVisual";
import { STATUS_COLOR } from "./officeWall";

// Existing classes only (no new Tailwind utilities: the CSS budget rides on every page).
const HEAD = "label text-ink-2";
const ROW = "rounded-xl border border-glass-border bg-white/[0.03] p-3";
const NOTE = "text-[13px] leading-5 text-ink-2";

function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** A state or status dot (never an edge stripe). */
function Dot({ color }: { color: string }) {
  return <span aria-hidden="true" className="hq-dot hq-dot-md" style={{ color }} />;
}

function Field({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="text-ink" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

function DeskPanel({ rover, updatedAt, locale, now }: { rover: OfficeRoverView; updatedAt: number | null; locale: Locale; now: number }) {
  const t = useTranslations("office");
  const repo = safeRepoUrl(rover.repo);
  const task = !rover.agent ? t("3d.drawer.none") : (rover.title ?? (rover.state === "asleep" ? t("3d.drawer.none") : t("3d.clientPrivate")));
  return (
    <>
      <p className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-glass-border px-2.5 text-[13px] text-ink-2" data-testid="office-state">
        <Dot color={OFFICE_STATE_STYLE[rover.state].color} />
        {t(`state.${rover.state}`)}
      </p>
      <dl className="space-y-2 text-[15px] leading-6">
        <Field label={t("3d.drawer.agent")}>{rover.agent ? t(`3d.agentFull.${rover.agent}`) : t("3d.offDuty")}</Field>
        <Field label={t("3d.drawer.activity")}>{t(`activity.${rover.activity}`)}</Field>
        <Field label={t("3d.drawer.task")} testId="office-task">
          {task}
        </Field>
        {repo && (
          <Field label={t("3d.drawer.repo")}>
            <a className="link" href={repo} target="_blank" rel="noopener noreferrer" data-testid="office-repo">
              {rover.repo}
            </a>
          </Field>
        )}
        {rover.since !== null && <Field label={t("3d.drawer.since")}>{sinceLabel(rover.since, locale, now)}</Field>}
        {updatedAt !== null && <Field label={t("3d.drawer.updated")}>{sinceLabel(updatedAt, locale, now)}</Field>}
      </dl>
      {rover.recent.length > 0 && (
        <section className="space-y-2">
          <h3 className={HEAD}>{t("3d.drawer.recent")}</h3>
          <ul className="space-y-2">
            {rover.recent.map((e, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px] leading-5 text-ink-2" data-testid="office-recent">
                <Dot color={OFFICE_STATE_STYLE[e.state].color} />
                <span className="text-ink">{t(`activity.${e.activity}`)}</span>
                <span>{sinceLabel(e.at, locale, now)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className={NOTE}>{t("privacy")}</p>
    </>
  );
}

function SummaryPanel({ office }: { office: OfficeView }) {
  const t = useTranslations("office");
  const today = office.today;
  return (
    <>
      <section className="space-y-2">
        <h3 className={HEAD}>{t("3d.drawer.agents")}</h3>
        <ul className="space-y-2">
          {office.rovers.map((r) => {
            const line = chipLines(r, t);
            return (
              <li key={r.slot}>
                <button type="button" className={`${ROW} hq-glow flex w-full items-center gap-2 text-left`} onClick={() => getHQStore().getState().openRoom(officeDeskRoom(r.slot))} data-testid="office-agent">
                  <Dot color={OFFICE_STATE_STYLE[r.state].color} />
                  <span className="text-ink">{t("3d.target.desk", { n: r.slot + 1, agent: line.head })}</span>
                  {line.task && <span className="text-xs text-ink-3">{line.task}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      {today && (
        <section className="space-y-2">
          <h3 className={HEAD}>{t("3d.drawer.today")}</h3>
          <MetricTiles
            fluid
            metrics={[
              { value: String(today.tasksDone), label: t("3d.drawer.tasksDone") },
              { value: String(today.prsMerged), label: t("3d.drawer.prsMerged") },
              { value: `${today.ciGreen}/${today.ciRuns}`, label: t("3d.drawer.ciGreen") },
            ]}
          />
        </section>
      )}
      <p className={NOTE}>{t("3d.hooks")}</p>
      <p className={NOTE}>{t("privacy")}</p>
    </>
  );
}

function GithubRow({ item, locale, now }: { item: OfficeGithubItem; locale: Locale; now: number }) {
  const t = useTranslations("office");
  const url = safeGithubUrl(item.url);
  const color = STATUS_COLOR[item.status];
  const progress = item.progress && item.progress.total > 0 ? item.progress : null;
  return (
    <li className={ROW} data-testid="office-feed-row" data-status={item.status}>
      <p className="flex items-center gap-2 text-ink">
        <Dot color={color} />
        {url ? (
          <a className="link" href={url} target="_blank" rel="noopener noreferrer">
            {item.title}
          </a>
        ) : (
          item.title
        )}
      </p>
      <p className="text-xs text-ink-3">{`${item.repo} · ${t(`3d.github.kind.${item.kind}`)} · ${t(`3d.github.status.${item.status}`)} · ${sinceLabel(item.at, locale, now)}`}</p>
      {progress && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          aria-label={t("3d.jobs", { done: progress.done, total: progress.total })}
          style={{ marginTop: 6, height: 4, borderRadius: 2, background: "rgb(255 255 255 / 0.08)", overflow: "hidden" }}
        >
          <div style={{ width: `${Math.round((progress.done / progress.total) * 100)}%`, height: "100%", background: color }} />
        </div>
      )}
    </li>
  );
}

function GithubPanel({ items, locale, now }: { items: readonly OfficeGithubItem[]; locale: Locale; now: number }) {
  const t = useTranslations("office");
  return (
    <>
      {items.length ? (
        <ul className="space-y-2" data-testid="office-feed">
          {items.map((item, i) => (
            <GithubRow key={`${item.url}-${i}`} item={item} locale={locale} now={now} />
          ))}
        </ul>
      ) : (
        <p className="text-[15px] leading-6 text-ink-2">{t("3d.wall.empty")}</p>
      )}
      <p className={NOTE}>{t("3d.githubNote")}</p>
    </>
  );
}

/**
 * Agent Office drawer bodies (chunk; registered as the `office` kind in hud/drawer/bodies.tsx): the summary half
 * of the wall, the GitHub half, or one Rover's desk, from the live feed. Opening any of them polls (reason
 * "drawer") until it closes. Only protocol fields: no prompt, no path, no private title.
 */
export function OfficeBody({ view, locale }: RoomBodyProps) {
  const t = useTranslations("office");
  const feed = useOfficeFeed();
  const office = useMemo(() => officeView(feed), [feed]);
  const now = useNow(5000);
  useEffect(() => {
    officeLive.want("drawer", true);
    return () => officeLive.want("drawer", false);
  }, []);
  const panel = view.office;
  if (!panel) return null;
  return (
    <div className="grid gap-6" data-testid="office-body" data-panel={panel.panel}>
      {feed.status === "offline" && (
        <p className={NOTE} role="status" data-testid="office-offline">
          {t("3d.drawer.offline")}
        </p>
      )}
      {panel.panel === "desk" ? (
        <DeskPanel rover={office.rovers[panel.slot ?? 0]} updatedAt={office.updatedAt} locale={locale} now={now} />
      ) : panel.panel === "github" ? (
        <GithubPanel items={office.github} locale={locale} now={now} />
      ) : (
        <SummaryPanel office={office} />
      )}
    </div>
  );
}
```

Add to `src/experience/floors/lobby/office/scene.ts`:

```ts
export { OfficeBody } from "./OfficeBody";
```

- [ ] **Step 4: Register the body**

In `src/hud/drawer/bodies.tsx`, add `import { loadOffice } from "@/experience/floors/lobby/office/chunk";` after the `floorChunks` import, after `const EngineBody = ...`:

```ts
// L1 Agent Office: its own lazy chunk (not a floor chunk); opening an office room loads it.
const OfficeBody = chunkBody(() => loadOffice().then((m) => m.OfficeBody));
```

and `office: OfficeBody,` after `engine: EngineBody,` in `CHUNK_BODIES`.

In `tests/unit/office-chunk-graph.test.ts`, add `` `${DIR}/OfficeBody.tsx`, `` to `OFFICE_ONLY`.

- [ ] **Step 5: Run the tests**

Run: `bunx vitest run tests/hud/OfficeBody.test.tsx tests/hud/DrawerHost.test.tsx tests/unit/office-chunk-graph.test.ts tests/unit/client-namespaces.test.ts tests/unit/edge-accents.test.ts && bunx tsc --noEmit -p .`
Expected: PASS; `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/experience/floors/lobby/office/OfficeBody.tsx src/experience/floors/lobby/office/scene.ts src/hud/drawer/bodies.tsx tests/hud/OfficeBody.test.tsx tests/unit/office-chunk-graph.test.ts
git commit -m "feat(office): summary, GitHub and Rover drawers"
```

### Task 13: Byte budget for the office chunk, and the size checks

**Files:**
- Modify: `e2e/budgets.ts`
- Modify: `e2e/perf/bytes-3d.spec.ts`
- Modify: `scripts/perf-report.ts`
- Modify: `tests/unit/perf-report.test.ts`

**Interfaces:**
- Consumes: `__hq.office.load()` (Task 8), `recordTransfers`, `writePerfEntry`, `kb` (existing).
- Produces: `BYTES_3D_BUDGET.office` (14 KB gzip, not in `sessionFloors`, not in the session total); `bytes3d` perf entries gain `office?: number`; the gates summary gains "Agent Office chunk (L1, lazy, not in the session total): X of 14.0 KB."

- [ ] **Step 1: Write the failing test**

In `tests/unit/perf-report.test.ts`, add inside the `describe` that holds the "Floor chunks (loaded on demand)" test:

```ts
  it("reports the Agent Office chunk against its own cap, outside the session total", () => {
    const entry = { kind: "bytes3d", tier: "lite", js: { "x.js": 400 * 1024 }, other: {}, office: 9.5 * 1024 } as const;
    const s = renderGates([entry], []);
    expect(s.markdown).toContain("Agent Office chunk (L1, lazy, not in the session total): 9.5 KB of 14.0 KB.");
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `bunx vitest run tests/unit/perf-report.test.ts`
Expected: FAIL (type error on `office` and the missing line: `expected '...' to contain 'Agent Office chunk ...'`).

- [ ] **Step 3: Add the cap and the report line**

In `e2e/budgets.ts`, extend the `BYTES_3D_BUDGET` doc comment with "The L1 Agent Office chunk (`floors/lobby/office/scene.ts`) is measured after the session floors and held to `office` (owner decision 2026-10-19), outside the session total." and add the field after `floors`:

```ts
  /** L1 Agent Office chunk (lazy, near the office or on an office drawer), incremental over the main path and the session floors. */
  office: 14 * 1024,
```

In `scripts/perf-report.ts`, change the `bytes3d` member of `PerfEntry` to:

```ts
  | { kind: "bytes3d"; tier: Tier; js: ChunkMap; other: ChunkMap; floors?: Partial<Record<"L3" | "L4" | "RF" | "B1", number>>; sessionTotal?: number; office?: number }
```

and in `renderGates`, after the `if (e.floors) { ... }` block:

```ts
    if (e.office !== undefined) out.markdown += `Agent Office chunk (L1, lazy, not in the session total): ${kb(e.office)} of ${kb(BYTES_3D_BUDGET.office)}.\n\n`;
```

- [ ] **Step 4: Measure the office chunk in the bytes gate**

In `e2e/perf/bytes-3d.spec.ts`, add after `measureFloor`:

```ts
type OfficeLoad = { __hq: { office?: { load: () => Promise<void> } } };

/** Bytes of the Agent Office chunk on top of the Page View, the main path and the floor chunks already counted; null on a build without it. */
async function measureOffice(page: Page, seen: Set<string>, counted: Set<string>): Promise<number | null> {
  if (!(await page.evaluate(() => Boolean((window as unknown as OfficeLoad).__hq.office)))) return null;
  const loaded = await recordTransfers(page, () => page.evaluate(() => (window as unknown as OfficeLoad).__hq.office!.load()), 2000);
  const bytes = loaded.filter((t) => t.type === "script" && !seen.has(t.path) && !counted.has(t.path)).reduce((n, t) => n + t.bytes, 0);
  for (const t of loaded) counted.add(t.path);
  return bytes;
}
```

In the test, after the `if (hasChunks) { for (const floor of BYTES_3D_BUDGET.sessionFloors) ... }` block and before `await context.close();`:

```ts
    // The Agent Office (L1) loads near the spawn in a normal session, but has its own cap outside the session total.
    const office = await measureOffice(page, seen, mainPaths);
```

Change the `writePerfEntry` call to:

```ts
    writePerfEntry({ kind: "bytes3d", tier, js, other, ...(hasChunks ? { floors: { ...floors, ...(b1 === null ? {} : { B1: b1 }) }, sessionTotal } : {}), ...(office === null ? {} : { office }) });
```

After the B1 log line:

```ts
    if (office !== null) console.log(`Agent Office chunk (${tier}): ${kb(office)} gzip (cap ${kb(BYTES_3D_BUDGET.office)}), not in the session total`);
```

And after the B1 assertions:

```ts
    if (office !== null) {
      expect(office, "Agent Office chunk: did __hq.office.load fetch any script?").toBeGreaterThan(0);
      expect(office, `Agent Office chunk ${kb(office)} is over its ${kb(BYTES_3D_BUDGET.office)} cap`).toBeLessThan(BYTES_3D_BUDGET.office);
    }
```

- [ ] **Step 5: Run the unit test and the bytes gate**

Run: `bunx vitest run tests/unit/perf-report.test.ts && bun run build && E2E_PORT=4421 PERF=1 bunx playwright test e2e/perf/bytes-3d.spec.ts --workers=1`
Expected: PASS; the log shows `Agent Office chunk (lite): ... gzip (cap 14.0 KB)` and `(full)`, each under 14 KB (measured 12.2 KB on both tiers in a scratch build of this plan), and both session totals under their caps (they fail by about 0.5 KB until Step 6's fallbacks or the owner's cap raise land).

- [ ] **Step 6: Measure the main-path addition against main**

```bash
git worktree add ../hq-office-main origin/main
(cd ../hq-office-main && bun install --frozen-lockfile && bun run build)
rm -rf out-main && cp -R ../hq-office-main/out out-main
rm -rf perf-report perf-report-main
E2E_DIR=out-main E2E_PORT=4422 PERF=1 bunx playwright test e2e/perf/bytes-3d.spec.ts --workers=1
mv perf-report perf-report-main
E2E_PORT=4423 PERF=1 bunx playwright test e2e/perf/bytes-3d.spec.ts --workers=1
bun scripts/perf-summary.ts gates --head perf-report --base perf-report-main
```

Expected: the "3D JS after the gate" rows grow by less than 1.5 KB on both tiers, and both session totals stay under 470 KB (full) and 446.4 KB (lite). Validation note: a scratch build of this plan as written at 020c7df3 measured +2.5 KB full and +2.4 KB lite (lite main path 417.1 to 419.5 KB, session 444.4 to 446.9; full 440.7 to 443.2, session 468.1 to 470.5). Turbopack regrouped the shared chunks (6 chunks became 7, including a new 434 B async-loader manifest chunk), so only about 1 KB is attributable to the new modules (`chunk.ts` about 250 B, `OfficeMount.tsx` about 290 B, `OfficeLayer.tsx`, the catalog entry and the `Experience`/`bodies` lines); `officeLayout.ts` lands in the shared page chunk that the Classic site also loads, so it counts against the Classic JS budget, not the 3D bytes. Expect this step to fail first. Record both numbers for the PR body and `docs/agents/performance.md`.

If the main path grows by 1.5 KB or more on either tier, or either session total is over its cap, apply in order and re-measure after each: (0) fold the trigger into `OfficeMount.tsx` and import `loadOffice` there only through one dynamic `import("./office/chunk")` inside the idle callback (one async edge instead of two, which removes the extra loader manifest chunk), and render `OfficeLayer` from the chunk's own portal instead of a `Hud.tsx` import; (1) drop `MergedEdges` from `OfficeMount` and draw the shell edges in `OfficeScene` instead (the shell keeps its solids); (2) move `officeShellBoxes` and the cable trays out of `officeLayout.ts` into the chunk and keep only the desk tops and the wall frame in the shell (`OfficeMount` builds them inline from `officeSlots()`); (3) trim the `L1:office` catalog keywords to `["agent office", "kantor agen", "Copilot", "Claude Code", "Codex", "GitHub"]`. If the session totals are still over after (0) to (3), stop and take the owner's choice from Owner actions: raise the session caps by 3 KB (full 473 KB, lite 449.4 KB) in `e2e/budgets.ts` with the owner note in the PR and the decision file, or move the whole shell meshes into the office chunk (the obstacle rects stay in `buildFloorLayouts`, since they come from `officeLayout.ts` in the shared page chunk, so the rover still collides with the desks before the chunk loads).

- [ ] **Step 7: Measure the HTML and CSS budgets**

```bash
ls out/en.html out/id.html out/en/index.html 2>/dev/null
for f in out/en.html out/id.html out-main/en.html out-main/id.html; do [ -f "$f" ] && printf "%s %s\n" "$f" "$(gzip -9c "$f" | wc -c)"; done
for d in out out-main; do printf "%s css %s\n" "$d" "$(find "$d/_next/static" -name '*.css' -exec cat {} + | gzip -9c | wc -c)"; done
```

Expected (scratch build: `/en` 55,458 to 56,457 B, `/id` 56,711 to 57,757 B, `/en/quick` unchanged at 76,560 B, CSS unchanged at 19,400 B): `/en` and `/id` grow by less than 1.5 KB gzip (the `office` namespace in the gate page's client messages) and stay at least 4 KB under 83,968 B; the CSS total is unchanged within 100 B (no new utility classes). If the HTML headroom drops under 4 KB, move the long drawer copy (`office.3d.drawer`, `office.3d.hooks`, `office.3d.githubNote`) to a server-only namespace `officeRoom` that `room-views/lobby.ts` bakes into `RoomView.office` (`notes` and `labels` fields read by `OfficeBody` instead of `useTranslations`), and re-measure. If the CSS grows, replace the new class with an existing one or an inline style.

- [ ] **Step 8: Clean up and commit**

```bash
git worktree remove ../hq-office-main
rm -rf perf-report-main
git add e2e/budgets.ts e2e/perf/bytes-3d.spec.ts scripts/perf-report.ts tests/unit/perf-report.test.ts
git commit -m "test(perf): Agent Office chunk cap outside the session total"
```

### Task 14: End-to-end tests, the L1 perf spot and the CI plans

**Files:**
- Create: `e2e/office.spec.ts`
- Modify: `e2e/perf/floors.spec.ts`
- Modify: `scripts/e2e-plan.ts`, `scripts/perf-plan.ts`
- Modify: `tests/unit/e2e-plan.test.ts`, `tests/unit/perf-plan.test.ts`

**Interfaces:**
- Consumes: `enterHQ`, `asReturningVisitor`, `waitForHQ`, `waitForPhase`, `waitForSceneLive`, `driveTo`, `waitForCameraSettle`, `waitForFrames`, `waitForRoom`, `clickablePoint`, `chooseMotion`, `collectErrors`, `expectRenderBudget`, `enterFloorRoute` (`e2e/hq.ts`), `FLOOR_SCENE_CAPS`, `OFFICE_FIXTURES`, `statesA`, `statesB`, `STATES_A`, `STATES_B`, `OFFICE`, `__hq.office`, `__hq.probes.office`.
- Produces: spec `office` (in `ALL_SPECS`), e2e-plan and perf-plan rules for the office paths, the perf title `L1 ${tier}: settled draw calls and shader programs at the Agent Office`.

- [ ] **Step 1: Write the plan pins (failing)**

In `tests/unit/e2e-plan.test.ts`, inside `describe("specsForChanges", ...)`:

```ts
  it("maps the Agent Office to its spec, the 3D experience and the Lobby specs", () => {
    const office = ["experience", "highlights", "interact", "office", "onboarding"];
    for (const f of [
      "src/experience/floors/lobby/officeLayout.ts",
      "src/experience/floors/lobby/office/OfficeScene.tsx",
      "src/experience/floors/lobby/office/OfficeMount.tsx",
      "src/lib/office/poll.ts",
      "src/lib/office/model.ts",
      "src/hud/OfficeLayer.tsx",
      "e2e/office-fixtures.ts",
    ])
      expect(specsForChanges([f]).specs, f).toEqual(office);
    // A spec file runs itself only (SPEC_FILE in specsForChanges).
    expect(specsForChanges(["e2e/office.spec.ts"]).specs).toEqual(["office"]);
    expect(specsForChanges(["scripts/office-shots.ts"]).specs).toEqual([]);
  });
```

In `tests/unit/perf-plan.test.ts`, inside `describe("perfKeysFor", ...)`:

```ts
  it("selects the bytes gate and the L1 gates for the office's shared client modules and its scene", () => {
    expect(perfKeysFor(["src/lib/office/poll.ts"])).toEqual(["bytes", "floor:L1"]);
    expect(perfKeysFor(["src/lib/office/model.ts"])).toEqual(["bytes", "floor:L1"]);
    expect(perfKeysFor(["src/experience/floors/lobby/office/OfficeScene.tsx"])).toEqual(["boot", "bytes", "floor:L1", "hover"]);
  });
```

Run: `bunx vitest run tests/unit/e2e-plan.test.ts tests/unit/perf-plan.test.ts`
Expected: FAIL (`office` is not a spec yet; `src/lib/office/poll.ts` maps to every perf key but memory).

- [ ] **Step 2: Add the rules**

In `scripts/e2e-plan.ts`:
- add `"office",` to `ALL_SPECS` between `"motion",` and `"onboarding",`;
- add `office-shots|` to the offline tools regex, after `media-sizes|`;
- insert before the comment `// Inline scripts under the per-page script policy`:

```ts
  // L1 Agent Office (3D, part 3 of the office): the layout on the main path, the lazy chunk, the shared poller and
  // model, the HUD chips host and the e2e fixtures. The spawn is within the office's load radius, so the
  // Lobby specs (point-and-go, the tour) see the office too.
  {
    test: /^src\/experience\/floors\/lobby\/(office\/|officeLayout\.ts$)|^src\/lib\/office\/(poll|model)\.ts$|^src\/hud\/OfficeLayer\.tsx$|^e2e\/office-fixtures\.ts$/,
    specs: ["office", "experience", "highlights", "interact", "onboarding"],
  },
```

In `scripts/perf-plan.ts`, add before the Lobby rule `[/^src\/experience\/floors\/(lobby\/|Lobby\.tsx$)/, ...]`:

```ts
  // The office's shared client modules (the 3D office chunk and, later, the Classic card): the bytes gate and L1.
  [/^src\/lib\/office\/(poll|model)\.ts$/, ["bytes", "floor:L1"]],
```

Run: `bunx vitest run tests/unit/e2e-plan.test.ts tests/unit/perf-plan.test.ts`
Expected: FAIL only in "knows every spec in e2e/" (`office` listed, `e2e/office.spec.ts` missing) until Step 3.

- [ ] **Step 3: Write the e2e spec**

Create `e2e/office.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import content from "../content/site-content.json";
import en from "../messages/en.json";
import id from "../messages/id.json";
import { OFFICE } from "../src/experience/floors/lobby/officeLayout";
import { OFFICE_FIXTURES } from "../src/lib/office/fixtures";
import { FLOOR_SCENE_CAPS } from "./budgets";
import {
  asReturningVisitor,
  chooseMotion,
  clickablePoint,
  collectErrors,
  driveTo,
  enterHQ,
  expectRenderBudget,
  waitForCameraSettle,
  waitForFrames,
  waitForHQ,
  waitForPhase,
  waitForRoom,
  waitForSceneLive,
} from "./hq";
import { STATES_A, STATES_B, statesA, statesB } from "./office-fixtures";

/**
 * L1 Agent Office (docs/superpowers/plans/2026-10-19-agent-office-3d.md): the lazy chunk near the spawn, five
 * Rovers with their states and chips, the Rover, summary and GitHub drawers, the Rover menu mission, the
 * semi-live, off, disabled and offline modes, reduced motion, Indonesian and the L1 budget at the office.
 * `/api/office` is answered from fixtures (Playwright route); waits are on state, never on time.
 */
test.describe.configure({ timeout: 180_000 });

type OfficeProbe = { loaded: boolean; desks: number; states: string[]; mode: string; wallFrames: number; chips: number; bob: number; inView: boolean; polling: boolean };
type OfficeHooks = { feed(): { status: string; fetchedAt: number }; poll(): void; advance(ms: number): void };
type OfficeWindow = Window & { __hq: { probes: { office: OfficeProbe }; office: { load(): Promise<void>; state(): string; test(): OfficeHooks | null } } };

const probe = (page: Page) => page.evaluate(() => (window as unknown as OfficeWindow).__hq.probes.office);
const chunkState = (page: Page) => page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.state());
const feed = (page: Page) => page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.test()?.feed() ?? null);
const chip = (page: Page, slot: number) => page.locator(`[data-testid="office-chip"][data-slot="${slot}"]`);

/** Answers `/api/office` from a mutable reply, so a test can switch fixtures or fail the endpoint mid-run. */
async function serveOffice(page: Page) {
  const reply: { status: number; body: unknown } = { status: 200, body: OFFICE_FIXTURES.disabled };
  await page.route("**/api/office", (route) =>
    route.fulfill(reply.status === 200 ? { status: 200, contentType: "application/json", body: JSON.stringify(reply.body) } : { status: reply.status, body: "" }),
  );
  return {
    set(body: unknown, status = 200) {
      reply.body = body;
      reply.status = status;
    },
  };
}

/** Fetches now (the poller restarts) and waits for that response. */
async function pollNow(page: Page) {
  await Promise.all([page.waitForResponse("**/api/office"), page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.test()?.poll())]);
}

/** Parks inside the office view, off the stop (a click still drives), once the office is loaded, in view and polling. */
async function atOffice(page: Page) {
  await page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.load());
  await expect.poll(async () => (await probe(page)).loaded, { timeout: 60_000 }).toBe(true);
  await driveTo(page, { x: OFFICE.stop.x + 1.5, z: OFFICE.stop.z - 1 });
  await waitForCameraSettle(page);
  await expect.poll(async () => (await probe(page)).polling, { timeout: 30_000 }).toBe(true);
}

async function show(page: Page, office: Awaited<ReturnType<typeof serveOffice>>, body: unknown, states: readonly string[]) {
  office.set(body);
  await pollNow(page);
  await expect.poll(async () => (await probe(page)).states, { timeout: 30_000 }).toEqual(states);
}

test.describe("Agent Office (L1)", () => {
  test("loads near the spawn after the first frame and shows five Rovers with their states and chips", async ({ page }) => {
    const errors = collectErrors(page);
    const office = await serveOffice(page);
    await enterHQ(page);
    // The spawn is within OFFICE.loadRadius: the chunk loads on idle after the first frame, with no visit.
    await expect.poll(() => chunkState(page), { timeout: 60_000 }).toBe("ready");
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    expect((await probe(page)).desks).toBe(5);
    await expect(chip(page, 0)).toContainText(`${en.office.agent.copilot} · ${en.office.activity.editing}`);
    await expect(chip(page, 0)).toContainText("Agent office scene");
    await expect(chip(page, 1)).toContainText(en.office.clientProject);
    await expect.poll(async () => (await probe(page)).chips).toBeGreaterThanOrEqual(3);
    await expect.poll(async () => (await probe(page)).wallFrames).toBeGreaterThan(0);
    await show(page, office, statesB(Date.now()), STATES_B);
    await expect(chip(page, 4)).toContainText(en.office["3d"].offDuty);
    expect(errors).toEqual([]);
  });

  test("never loads on its own with ?prefetch=off; an office drawer loads it", async ({ page }) => {
    await serveOffice(page);
    await asReturningVisitor(page);
    await page.goto("/en?tier=lite&prefetch=off");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    // Proving that nothing loads: 120 rendered frames after the first frame went idle.
    await waitForFrames(page, 120);
    expect(await chunkState(page)).toBe("idle");
    await page.evaluate(() => (window as unknown as { __hq: { store: { getState: () => { openRoom: (r: string) => void } } } }).__hq.store.getState().openRoom("L1:office"));
    await expect(page.getByTestId("office-body")).toHaveAttribute("data-panel", "summary", { timeout: 60_000 });
    expect(await chunkState(page)).toBe("ready");
  });

  test("clicking a Rover drives to the office stop and opens its desk; a chip does too; a private task stays hidden", async ({ page }) => {
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    const point = await clickablePoint(page, "L1:station:office-desk-1");
    expect(point).not.toBeNull();
    await page.mouse.click(point!.x, point!.y);
    await waitForRoom(page, "L1:office-desk-1");
    const drawer = page.getByTestId("room-drawer");
    await expect(drawer.getByTestId("office-body")).toHaveAttribute("data-panel", "desk");
    await expect(drawer).toContainText(en.office["3d"].agentFull.copilot);
    await expect(drawer.getByTestId("office-repo")).toHaveAttribute("href", "https://github.com/ShinyQ/ShinyQ-HQ");
    await expect(drawer).toContainText(en.office.privacy);
    await page.keyboard.press("Escape");
    await waitForPhase(page, "explore");
    await chip(page, 1).click();
    await waitForRoom(page, "L1:office-desk-2");
    await expect(page.getByTestId("office-task")).toHaveText(en.office["3d"].clientPrivate);
    await expect(page.getByTestId("office-repo")).toHaveCount(0);
  });

  test("the wall halves open the summary (agents, today) and the GitHub board", async ({ page }) => {
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    const summary = await clickablePoint(page, "L1:station:office");
    expect(summary).not.toBeNull();
    await page.mouse.click(summary!.x, summary!.y);
    await waitForRoom(page, "L1:office");
    await expect(page.getByTestId("office-agent")).toHaveCount(5);
    await expect(page.getByTestId("office-body")).toContainText(en.office["3d"].hooks);
    await page.getByTestId("office-agent").nth(2).click();
    await waitForRoom(page, "L1:office-desk-3");
    await page.keyboard.press("Escape");
    await waitForPhase(page, "explore");
    const github = await clickablePoint(page, "L1:station:office-github");
    expect(github).not.toBeNull();
    await page.mouse.click(github!.x, github!.y);
    await waitForRoom(page, "L1:office-github");
    await expect(page.getByTestId("office-feed-row")).toHaveCount(2);
    await expect(page.getByTestId("office-feed-row").first()).toHaveAttribute("data-status", "running");
    await expect(page.getByTestId("office-body")).toContainText("feat: agent office");
    await expect(page.getByTestId("office-body")).toContainText(en.office["3d"].githubNote);
  });

  test("the Rover menu's office mission drives to the office and opens the summary", async ({ page }) => {
    const mission = content.missions.find((m) => m.id === "office")!;
    await serveOffice(page);
    await enterHQ(page);
    await page.getByTestId("hud").getByRole("button", { name: en.hud.launcher.roverMenu, exact: true }).click();
    await page.getByRole("dialog", { name: en.hud.terminal.title, exact: true }).getByRole("option", { name: mission.label.en }).click();
    await waitForRoom(page, "L1:office");
    await expect(page.getByTestId("office-body")).toHaveAttribute("data-panel", "summary");
  });

  test("semi-live, off and disabled responses put every Rover to sleep", async ({ page }) => {
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    const asleep = ["asleep", "asleep", "asleep", "asleep", "asleep"];
    await show(page, office, statesA(Date.now()), STATES_A);
    await show(page, office, OFFICE_FIXTURES.semiLive, asleep);
    await expect.poll(async () => (await probe(page)).mode).toBe("semi-live");
    office.set(OFFICE_FIXTURES.off);
    await pollNow(page);
    await expect.poll(async () => (await probe(page)).mode).toBe("off");
    office.set(OFFICE_FIXTURES.disabled);
    await pollNow(page);
    await expect.poll(async () => (await feed(page))?.status).toBe("disabled");
    await expect.poll(async () => (await probe(page)).mode).toBe("off");
    expect((await probe(page)).states).toEqual(asleep);
  });

  test("a 204 or a 500 keeps the last snapshot for a minute, then the office shows offline", async ({ page }) => {
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    const before = (await feed(page))!.fetchedAt;
    office.set(null, 204);
    await pollNow(page);
    await waitForFrames(page, 4);
    expect(await feed(page)).toMatchObject({ status: "ready", fetchedAt: before });
    expect((await probe(page)).states).toEqual(STATES_A);
    office.set(null, 500);
    await Promise.all([page.waitForResponse("**/api/office"), page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.test()?.advance(61_000))]);
    await expect.poll(async () => (await feed(page))?.status).toBe("offline");
    await expect.poll(async () => (await probe(page)).mode).toBe("offline");
    expect((await probe(page)).states).toEqual(["asleep", "asleep", "asleep", "asleep", "asleep"]);
  });

  test("reduced motion holds every pose still", async ({ page }) => {
    await chooseMotion(page, "reduced");
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    for (let i = 0; i < 4; i++) {
      await waitForFrames(page, 6);
      expect((await probe(page)).bob).toBe(0);
    }
  });

  test("Motion Full animates the working Rovers", async ({ page }) => {
    await chooseMotion(page, "full");
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    await expect.poll(async () => (await probe(page)).bob).toBeGreaterThan(0);
  });

  test("speaks Indonesian", async ({ page }) => {
    const office = await serveOffice(page);
    await enterHQ(page, { path: "/id" });
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    await expect(chip(page, 0)).toContainText(`${id.office.agent.copilot} · ${id.office.activity.editing}`);
    await expect(chip(page, 1)).toContainText(id.office.clientProject);
  });

  test("L1 stays under its scene-call cap at the office (lite)", async ({ page }) => {
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    await driveTo(page, OFFICE.stop);
    await waitForCameraSettle(page);
    const peaks = await expectRenderBudget(page);
    expect(peaks.sceneCalls).toBeLessThanOrEqual(FLOOR_SCENE_CAPS.L1);
  });
});
```

- [ ] **Step 4: Add the office to the L1 and B1 perf gates and an office spot**

In `e2e/perf/floors.spec.ts`:
- change the `../hq` import to `import { driveTo, enterFloorRoute, expectRenderBudget, readGpuCounters, waitForCameraSettle } from "../hq";` and add `import { OFFICE } from "../../src/experience/floors/lobby/officeLayout";`;
- add after `const PROGRAMS = ...`:

```ts
type OfficeWindow = { __hq: { office?: { load(): Promise<void> }; probes: { office?: { loaded: boolean } } } };

/**
 * The Agent Office chunk loads near the spawn on idle; load it and wait until it shows, so L1 (and B1, ridden
 * from the Lobby) always measure the same programs. A build without the office (a main build) skips this.
 */
async function settleOffice(page: Page) {
  await page.evaluate(() => (window as unknown as OfficeWindow).__hq.office?.load());
  await page.waitForFunction(() => {
    const hq = (window as unknown as OfficeWindow).__hq;
    return !hq.office || hq.probes.office?.loaded === true;
  }, null, { timeout: 60_000 });
}
```

- give `measureFloor` a fourth parameter `{ record = true }: { record?: boolean } = {}` and wrap its `writePerfEntry(...)` call in `if (record)`;
- in the floor loop body: `await enterFloorRoute(page, path, { tier }); if (floor === "L1") await settleOffice(page); await measureFloor(page, tier, floor);`
- in the B1 test: `await enterB1Route(page, "/en", tier); await settleOffice(page); await rideTo(page, "B1");`
- after the B1 test, inside the tier loop:

```ts
  test(`L1 ${tier}: settled draw calls and shader programs at the Agent Office`, async ({ page }) => {
    await enterFloorRoute(page, "/en", { tier });
    await settleOffice(page);
    await driveTo(page, OFFICE.stop);
    // Same cap and program baseline as the L1 spawn; not recorded (the spawn entry is the L1 baseline).
    await measureFloor(page, tier, "L1", { record: false });
  });
```

- [ ] **Step 5: Run the pins, the spec and the perf spot**

Run: `bunx vitest run tests/unit/e2e-plan.test.ts tests/unit/perf-plan.test.ts && bun run build && E2E_PORT=4424 bunx playwright test e2e/office.spec.ts && E2E_PORT=4425 PERF=1 bunx playwright test e2e/perf/floors.spec.ts --grep "L1 (full|lite)|B1 (full|lite)" --workers=1`
Expected: PASS. The perf log prints the L1 numbers with the office loaded (spawn and office stop) on both tiers: scene calls at or under 125 (estimate 93 full and 91 lite at the spawn, about 7 more than before; not measured in the scratch validation), programs at or under the baseline plus 2 (expected: unchanged), triangles under 30k.

If programs grew, regenerate the baseline and give the reason in the PR body (docs/agents/performance.md, "Program baseline and known peaks"):

```bash
PERF=1 E2E_PORT=4426 bunx playwright test e2e/perf/floors.spec.ts --workers=1
bun scripts/perf-summary.ts baseline --head perf-report --write e2e/perf/baseline.json
```

If the lite L1 cap fails at the office stop: the halos share the glow call, so hiding them alone saves no call; instead render the glow mesh in `OfficeRovers` only on the full tier (`{tier === "full" && <instancedMesh ref={glows} ...>}`, and return early from the glow writes when `glows.current` is null: -1 call, no tips, halos or progress dots on lite; the chips still show CI progress), then, if still over, draw `MergedEdges` in `OfficeMount` only on the full tier (-1 call), and re-run.

- [ ] **Step 6: Commit**

```bash
git add e2e/office.spec.ts e2e/perf/floors.spec.ts scripts/e2e-plan.ts scripts/perf-plan.ts tests/unit/e2e-plan.test.ts tests/unit/perf-plan.test.ts
git commit -m "test(office): e2e for the Agent Office, the L1 perf spot and the CI plan rules"
```

### Task 15: Owner captures

**Files:**
- Create: `scripts/office-shots.ts`

**Interfaces:**
- Consumes: `statesA`, `statesB`, `STATES_A`, `STATES_B` (`e2e/office-fixtures.ts`), `OFFICE_FIXTURES`, `OFFICE`, `__hq.store`, `__hq.rover`, `__hq.camera`, `__hq.office`, `__hq.probes.office`.
- Produces: PNGs in `screenshots/office/` (git-ignored by `/screenshots/`): `states-a`, `states-b`, `drawer-summary`, `drawer-github`, `drawer-desk`, `semi-live`, `off`, each as `<name>-<tier>-<width>x<height>.png` for 1440x900 and 390x844 on the full and lite tiers (28 files).

- [ ] **Step 1: Write the script**

Create `scripts/office-shots.ts`:

```ts
#!/usr/bin/env bun
/**
 * Agent Office captures for the owner's review (part 3 of the office): the nine Rover states over two fixtures,
 * the summary, GitHub and Rover drawers, and the semi-live and off modes, at 1440x900 and 390x844 on the full and
 * lite tiers, on a served export with `/api/office` answered from fixtures. SwiftShader WebGL. Never committed.
 *
 *   bun run build && bun scripts/serve-static.ts --port 4300 --dir out &
 *   bun scripts/office-shots.ts --base http://127.0.0.1:4300 --out screenshots/office
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { STATES_A, STATES_B, statesA, statesB } from "../e2e/office-fixtures";
import { OFFICE } from "../src/experience/floors/lobby/officeLayout";
import { OFFICE_FIXTURES } from "../src/lib/office/fixtures";

const COMBOS = [
  { width: 1440, height: 900, tier: "full" },
  { width: 1440, height: 900, tier: "lite" },
  { width: 390, height: 844, tier: "full" },
  { width: 390, height: 844, tier: "lite" },
] as const;

type HQ = {
  store: { getState: () => { ride: unknown; phase: string; openRoom: (r: string) => void; closeRoom: () => void } };
  rover: { speed: number; drawCalls: number; autopilot: { point: { x: number; z: number }; state: string } | null };
  camera: () => [number, number, number];
  office: { load(): Promise<void>; test(): { poll(): void } | null };
  probes: { office: { loaded: boolean; states: string[]; mode: string } };
};
const hq = (page: Page) => page.evaluate(() => Boolean((window as unknown as { __hq?: HQ }).__hq));

let base = "http://127.0.0.1:4300";
let out = "screenshots/office";
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--base") base = argv[++i];
  else if (argv[i] === "--out") out = argv[++i];
}
mkdirSync(out, { recursive: true });

/** Rendered animation frames (state that changes per frame; SwiftShader can stall for seconds). */
const frames = (page: Page, count: number) =>
  page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const tick = () => (++seen >= n ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    count,
  );

/** A parked rover and a follow camera that holds still over 12 frames. */
async function settle(page: Page) {
  await page.waitForFunction(() => {
    const h = (window as unknown as { __hq: HQ }).__hq;
    return h.store.getState().ride === null && h.rover.speed < 0.2;
  }, null, { timeout: 120_000, polling: 250 });
  for (let i = 0; i < 40; i++) {
    const a = await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.camera());
    await frames(page, 12);
    const b = await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.camera());
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.03) return;
  }
}

async function driveTo(page: Page, point: { x: number; z: number }) {
  await page.evaluate((p) => ((window as unknown as { __hq: HQ }).__hq.rover.autopilot = { point: p, state: "pending" }), point);
  await page.waitForFunction(() => {
    const r = (window as unknown as { __hq: HQ }).__hq.rover;
    return r.autopilot?.state !== "pending" && r.autopilot?.state !== "driving" && r.speed < 0.5;
  }, null, { timeout: 120_000, polling: 250 });
  await settle(page);
}

/** Serves `body`, fetches it now and waits until the office shows `mode` and `states`. */
async function show(page: Page, reply: { body: unknown }, body: unknown, mode: string, states: readonly string[]) {
  reply.body = body;
  await Promise.all([page.waitForResponse("**/api/office"), page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.office.test()?.poll())]);
  await page.waitForFunction(
    ({ mode, states }) => {
      const o = (window as unknown as { __hq: HQ }).__hq.probes.office;
      return o.mode === mode && JSON.stringify(o.states) === states;
    },
    { mode, states: JSON.stringify(states) },
    { timeout: 60_000, polling: 250 },
  );
  await page.evaluate(() => document.fonts.ready);
  await frames(page, 30);
}

const asleep = ["asleep", "asleep", "asleep", "asleep", "asleep"];
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  for (const c of COMBOS) {
    const context = await browser.newContext({ viewport: { width: c.width, height: c.height }, deviceScaleFactor: 1, hasTouch: c.width < 1000, isMobile: c.width < 600 });
    await context.addInitScript(() => {
      localStorage.setItem("hq:terminal-seen", "1");
      localStorage.setItem("hq:onboarded", "done");
      localStorage.setItem("hq:hints", "off");
      localStorage.setItem("hq:floor-intro", JSON.stringify(["B1", "L1", "L2", "L3", "L4", "RF"]));
      sessionStorage.setItem("hq:intro", "seen");
    });
    const page = await context.newPage();
    const reply: { body: unknown } = { body: statesA(Date.now()) };
    await page.route("**/api/office", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reply.body) }));
    await page.goto(`${base}/en?tier=${c.tier}`);
    await page.waitForFunction(() => ((window as unknown as { __hq?: HQ }).__hq?.rover.drawCalls ?? 0) > 0 && !document.documentElement.hasAttribute("data-hq-boot"), null, { timeout: 180_000, polling: 250 });
    if (!(await hq(page))) throw new Error("no __hq handle");
    await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.office.load());
    await page.waitForFunction(() => (window as unknown as { __hq: HQ }).__hq.probes.office.loaded, null, { timeout: 120_000, polling: 250 });
    await driveTo(page, OFFICE.stop);
    const name = (shot: string) => join(out, `${shot}-${c.tier}-${c.width}x${c.height}.png`);

    await show(page, reply, statesA(Date.now()), "live", STATES_A);
    await page.screenshot({ path: name("states-a") });
    for (const [room, shot] of [
      ["L1:office", "drawer-summary"],
      ["L1:office-github", "drawer-github"],
      ["L1:office-desk-1", "drawer-desk"],
    ] as const) {
      await page.evaluate((r) => (window as unknown as { __hq: HQ }).__hq.store.getState().openRoom(r), room);
      await page.getByTestId("office-body").waitFor({ timeout: 60_000 });
      await page.evaluate(() => document.fonts.ready);
      await frames(page, 20);
      await page.screenshot({ path: name(shot) });
      await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.store.getState().closeRoom());
      await settle(page);
    }
    await show(page, reply, statesB(Date.now()), "live", STATES_B);
    await page.screenshot({ path: name("states-b") });
    await show(page, reply, OFFICE_FIXTURES.semiLive, "semi-live", asleep);
    await page.screenshot({ path: name("semi-live") });
    await show(page, reply, OFFICE_FIXTURES.off, "off", asleep);
    await page.screenshot({ path: name("off") });
    await context.close();
    console.log(`office shots: ${c.tier} ${c.width}x${c.height} done`);
  }
} finally {
  await browser.close();
}
```

- [ ] **Step 2: Run it**

Run: `bun run build && (bun scripts/serve-static.ts --port 4300 --dir out &) && bun scripts/office-shots.ts --base http://127.0.0.1:4300 --out screenshots/office && ls screenshots/office | wc -l`
Expected: four `office shots: ... done` lines and `28`. Stop the server afterwards with `kill <PID>` (from `lsof -ti tcp:4300`).

- [ ] **Step 3: Check the plan rules and commit**

Run: `bunx vitest run tests/unit/e2e-plan.test.ts`
Expected: PASS (`scripts/office-shots.ts` maps to no spec).

```bash
git add scripts/office-shots.ts
git commit -m "chore(office): capture script for the owner review"
```

### Task 16: Docs, the decision file, full verification and the pull request

**Files:**
- Modify: `docs/agents/floor-l1-lobby.md`, `docs/agents/floors.md`, `docs/agents/performance.md`, `docs/agents/hud-and-drawer.md`, `docs/agents/styling-and-i18n.md`, `docs/agents/folder-layout.md`, `docs/features.md`, `README.md` (floor guide line only), `AGENTS.md` (budget row only)
- Create: `docs/decisions/2026-10-19-agent-office-chunk-budget.md`
- Modify: `docs/superpowers/plans/2026-10-19-agent-office-3d.md` (Status line, once shipped)

**Interfaces:**
- Consumes: the numbers measured in Tasks 13 and 14 (`<office lite>`, `<office full>`, `<main lite>`, `<main full>`, `<L1 calls>` below are those measured values, written in at this step).
- Produces: current-state docs for the office; the owner decision record.

- [ ] **Step 1: L1 Lobby doc**

In `docs/agents/floor-l1-lobby.md`, extend the intro line with "and the Agent Office", and add before `## Rover menu kiosk`:

```markdown
## Agent Office

Design: owner decisions D1 to D7 (2026-10-18; spec in the office plans). Code: `floors/lobby/officeLayout.ts` (main path), `floors/lobby/office/` (the lazy chunk, entry `scene.ts`, loader `chunk.ts`), shared client modules `src/lib/office/poll.ts` and `src/lib/office/model.ts`.

### Layout

- South plaza strip (D7), slab unchanged: five desks on an arc around (3.5, 10), desk radius 8, at -51.3, -25.65, 0, 25.65 and 51.3 degrees from +z (slot 0 west); each Rover 1.2 u behind its desk (radius 9.2), facing the plaza; a 17 x 4 u screen wall (frame 17.4 u) on the south edge at z 20.7.
- Obstacles: one per desk and Rover (the end ones reach back to the wall, so no pocket behind the row is reachable) and the wall (to the slab edge); the wall is a camera column (`FloorLayout.tall`). The concave floor in front of the desks is open.
- Stop (3.5, 14.2) for every office room (`FloorLayout.stops`); view zone `L1:office` around it looks south (zoom 1.3, tablets 1.25, phones 1.2).
- Clearances (tests/unit/lobby-office.test.ts): 3.67 u east of the kiosk, 2.32 u west of the hall lead road start, the stop 3.35 u in front of the middle desk, the wall 0.35 u behind the middle Rover.
- Space rules: the office is one fixture whose inner gaps are by design (owner decision 2026-10-19); `tests/unit/highlights-layout.test.ts` checks the Lobby without it.

### Chunk and mounting

- `OfficeMount` (main path) always draws the furniture shell (desk tops, legs, cable trays, wall frame: `MergedBoxes` and `MergedEdges`), so the navgrid never holds an invisible desk.
- The chunk loads after the first frame on idle when the rover is on L1 (or riding there) within 40 u of the stop (the spawn is 13.5 u away), never with `?prefetch=off`; an office drawer loads it at once. It is not a floor chunk and never on the first-frame path.
- The live scene mounts once loaded and the full tier's composer exists, never in the middle of the intro (a load during the boot card mounts at once); `IntroReveal` switches the office on with the reveal ring. `INTRO_LANDMARKS` stays at five (no beacon over a row that may still be loading).
- `OfficeReady` precompiles and pins the office's programs like `HallReady`.

### Rendering (7 scene calls, no new program)

- Shell solids and shell edges (the observatory's programs).
- Rover parts and treads: two instanced unit-box meshes on `MeshStandardMaterial` with `alphaHash` (the player Rover's wheel program).
- Faces (128 x 96 cells) and desk screens (256 x 160 cells): one quad mesh on one 1024 x 512 canvas atlas, the player face's material settings; a cell redraws at most 10 fps (5 on lite) when its frame key changes.
- Glow: one instanced holo mesh (`HOLO_MODE.dot`): antenna tips, halos and CI progress dots.
- Screen wall: one quad with its own canvas (1280 x 300 full, 1024 x 240 lite), redrawn at most twice a second when its content changes.
- Per-frame work runs only while the office is in view (a frustum test of its bounds every 0.5 s). Reduced motion holds still poses and crossfades faces and screens over 0.4 s.
- Measured with the office loaded: L1 `<L1 calls>` scene calls at the spawn (cap 125); programs unchanged.

### States, chips and rooms

- Nine states (D5), `OFFICE_STATE_STYLE` (`office/officeVisual.ts`) with the tones in `STATE_TONE` (`src/lib/office/model.ts`). The input screen shows "Waiting for Kurniadi", never a question or prompt; the working screen scrolls invented code.
- HTML chips (`OfficeChips`, mounted by `hud/OfficeLayer.tsx` once loaded) follow the Rovers (HintProbe pattern): a state dot, "<Agent> · <activity>", the title or "Client project" and CI progress; past 28 u only the first line; hidden on phones while a drawer is open.
- Rooms: `L1:office` (summary half of the wall, the east half seen from the plaza), `L1:office-github` (west half), `L1:office-desk-1` to `-5` (per Rover); point-and-go targets `L1:station:office`, `L1:station:office-github`, `L1:station:office-desk-<n>`; all keep `/{locale}` (`isOfficeRoom`). The Rover menu mission `office` opens the summary.
- Polling (`src/lib/office/poll.ts`): 10 s while a desk works, 30 s when semi-live, off or all asleep; only while the office is in view on L1 or an office drawer is open and the tab is visible; stops after 10 minutes without input; the last snapshot stays 60 s after errors, then "offline".

### Probes and tests

- `__hq.office` (`load`, `state`, `test()` with `feed`, `poll`, `advance`), `__hq.probes.office` (`loaded`, `desks`, `states`, `mode`, `wallFrames`, `chips`, `bob`, `inView`, `polling`).
- Unit: `lobby-office`, `office-rooms`, `office-model`, `office-poll`, `office-visual`, `office-rig`, `office-atlas`, `office-view`, `office-wall`, `office-chunk`, `office-live`, `office-interact`, `office-chunk-graph`; jsdom: `tests/hud/OfficeChips.test.tsx`, `tests/hud/OfficeBody.test.tsx`. E2E: `e2e/office.spec.ts`; perf: the L1 gates load the office first, plus the office stop spot.
- Owner captures: `bun scripts/office-shots.ts` (not committed).
```

- [ ] **Step 2: Shared docs**

In `docs/agents/floors.md`, after the `### Structure` table's bullets in `## Floor chunks`, add:

```markdown
- Not a floor chunk: the L1 Agent Office loads its own chunk (`floors/lobby/office/chunk.ts`, entry `scene.ts`), with its own trigger and cap; see [floor-l1-lobby.md](floor-l1-lobby.md#agent-office). Never import the office chunk's modules statically from the `Experience.tsx` closure (`tests/unit/office-chunk-graph.test.ts`).
```

and change the `Measured:` line to append "; the Agent Office chunk `<office lite>` KB lite, `<office full>` KB full".

In `docs/agents/performance.md`:
- add after the B1 floor chunk row: `| L1 Agent Office chunk (`BYTES_3D_BUDGET.office`) | 14 KB gzip, outside the session total (measured <office lite> lite, <office full> full) | `e2e/budgets.ts` |`;
- update the two session rows' "measured" values to the Task 13 numbers;
- in `#### bytes-3d`, add a bullet: "The Agent Office chunk is loaded through `__hq.office.load()` after the session floors and held to `BYTES_3D_BUDGET.office`; it loads near the spawn in a normal session, but its cap is its own (owner decision 2026-10-19)."
- after the `scripts/b1-shots.ts` bullet: "- `scripts/office-shots.ts` is offline tooling too."

In `docs/agents/hud-and-drawer.md`:
- add after the `L1:visits` catalog row: `| `L1:office` | `office` | `/#office` (the Classic home card, Agent Office part 4), also its floor path | Agent Office summary; `L1:office-github` and `L1:office-desk-1` to `-5` have views but no catalog entry |`;
- add after the `engine` bodies row: `| `office` | `OfficeBody` (office chunk, fed by `RoomView.office` and the live feed): the summary (agents, today, notes), the GitHub board (status dots, links, progress) or one Rover's desk (state, agent, activity, task or "Client project (private, details hidden)", public repository link, time in state, recent activity, the privacy note) |`;
- add a bullet under `### Room catalog`: "- The Agent Office rooms keep /{locale} (`isOfficeRoom` in `hasPage`); their chips are HTML over the canvas (`hud/OfficeLayer.tsx`), see [floor-l1-lobby.md](floor-l1-lobby.md#agent-office)."

In `docs/agents/styling-and-i18n.md`, in the client messages bullet that names `engine`, change "(`engine`, the B1 Engine Room)" to "(`engine`, the B1 Engine Room; `office`, the Agent Office: shared keys `office.agent`, `office.state`, `office.activity`, `office.clientProject`, `office.privacy` for the 3D office and the Classic card, 3D-only keys under `office.3d`)".

In `docs/agents/folder-layout.md`, after the observatory bullet: "  - officeLayout.ts (the Agent Office layout, rooms, stops and view zone; main path) and office/ (the lazy Agent Office chunk: scene, Rovers, wall, chips, drawer bodies, live feed; `chunk.ts` and `OfficeMount.tsx` stay on the main path)." and after `src/lib/visits/`: "- `src/lib/office/`: the Agent Office client contract (protocol, fixtures), poller and shared model (3D office and Classic card)."; add the row `| Agent Office | `office.spec.ts`: the lazy chunk near the spawn, states and chips, Rover, summary and GitHub drawers, the mission, modes, offline, reduced motion, Indonesian, L1 budget at the office (lite) |` after the Highlights Hall row.

- [ ] **Step 3: Features, README line, AGENTS budget row, decision**

In `docs/features.md`, add before `## L1 Highlights Hall`:

```markdown
### Agent Office

`L1:office` (summary), `L1:office-github`, `L1:office-desk-1` to `-5`, also in the Rover menu ("Watch the AI agents at work") and Cmd-K.

- A curved console row of five desks on the south plaza, a Rover behind each desk facing you, and a screen wall behind them: mission control (counts, who is working now, today) and the public GitHub board.
- Live from Kurniadi's AI coding agents (GitHub Copilot, Claude Code, OpenAI Codex): nine states with their own faces, poses and desk screens; a chip over each Rover with the agent, the activity and the task (public repositories only, else "Client project").
- Click a Rover or a wall half to open its drawer; polling runs only while the office is in view.
- Semi-live (GitHub only), resting (off) and offline modes; reduced motion holds every Rover still.
```

and a Status row after the B1 row:

```markdown
| Agent Office (3D) | Part 3 of 4 (2026-10-19): the L1 office with five live Rovers, the screen wall, chips and drawers, in its own lazy chunk (Worker and relay in parts 1 and 2, the Classic card in part 4) | In review |
```

In `README.md`, change the L1 floor guide cell to: "Profile hologram, stats ring, skills and certification walls, the Rover menu kiosk, the Visitor Observatory and the Agent Office. Behind it, the Highlights Hall."

In `AGENTS.md`, add after the `Floor chunks (incremental)` budget row: `| Agent Office chunk (L1, lazy, outside the session total) | 14 KB gzip |` (the file must stay under 25 KB: `bunx vitest run tests/unit/agents-md.test.ts`).

Create `docs/decisions/2026-10-19-agent-office-chunk-budget.md`:

```markdown
# L1 Lobby

- Date: 2026-10-19

The Agent Office (L1) loads as its own lazy chunk with its own cap, `BYTES_3D_BUDGET.office` 14 KB gzip (measured <office lite> KB lite, <office full> KB full), measured after the session floors and kept outside the 3D session total (full 470 KB, lite 446.4 KB, which had about 1.9 and 2.0 KB of headroom); the main-path addition is <main lite> KB lite and <main full> KB full. The office's desks and wall form one fixture whose inner gaps (0.1 to 4.2 u), its 3.89 u to the kiosk and its 2.32 u to the hall lead road are exempt from the 6 u space rules; its own clearances are unit tested.
```

(Add the `- PR:` line once the PR number is known.)

- [ ] **Step 4: Check the docs**

Run: `bunx vitest run tests/unit/docs-index.test.ts tests/unit/agents-md.test.ts && rg -n "\x{2014}" docs AGENTS.md README.md src e2e scripts tests messages content || echo "no em dashes"`
Expected: PASS and `no em dashes`.

- [ ] **Step 5: Full verification**

Run, in order:

```bash
bun run verify:quick
bun run e2e:changed
E2E_PORT=4430 bun run e2e:perf
```

Expected: `verify:quick` passes (typecheck, lint, unit tests, build, og:check); `e2e:changed` runs `office`, `experience`, `highlights`, `interact`, `onboarding` and the specs of the other touched paths, all green; the perf lane passes (bytes with the office line, L1 and B1 floors with the office loaded, the office spot, peaks, memory-full). Run `E2E_PORT=4431 bun run e2e:look` only to confirm that differences are limited to poses that see the office (the office changes the Lobby by design), and `bun scripts/visual-gate.ts --base HEAD --profile strict` is not needed (this is not a look-preserving change).

- [ ] **Step 6: Captures**

Run Task 15 Step 2 on the final build and keep `screenshots/office/` for the PR body (28 PNGs).

- [ ] **Step 7: Push and open the pull request**

```bash
gh run list -R ShinyQ/ShinyQ-HQ -s in_progress
gh run list -R ShinyQ/ShinyQ-HQ -s queued
```

Expected: at most one pull request run in flight and no `main` run; otherwise wait. Then:

```bash
git add docs AGENTS.md README.md
git commit -m "docs(office): Agent Office on L1, the chunk budget decision and the plan"
git push -u origin HEAD
```

Open the PR with the `create_pull_request` tool: title "feat(office): Agent Office on L1, part 3: the 3D office"; body: the goal, the 7 draw calls and zero new programs, the measured office chunk and main-path sizes, the L1 scene calls with the office (spawn and stop, both tiers), the two owner approvals requested (the 14 KB office cap outside the session total; the space-rule exception), the `/en` and `/id` HTML sizes before and after, and the list of the 28 captures (names from Task 15) attached from `screenshots/office/`. After the PR number is known, add `- PR: [#<n>](https://github.com/ShinyQ/ShinyQ-HQ/pull/<n>)` to the decision file in a follow-up commit; once merged, set this plan's line to `Status: shipped in #<n> (<sha>), <date>`.

## Self-review

Spec section 4.1 and the plan brief, checked against the tasks:

- [x] Location D7, south plaza strip, slab not extended: Task 1 (`OFFICE`, `slabEdge` equals `LOBBY.bounds.maxZ`, bounds inside x -6 to 13, z 12 to 21).
- [x] Layout D1, one curved row of five desks plus a screen wall, Rovers 1.2 u behind their desks facing the plaza, neat equal spacing, trays along the arc: Tasks 1 and 5 (tests for spacing, facing, wall centring).
- [x] Clearances with the kiosk, lane ring, hall road, observatory, camera collision, walkable stop: Task 1 tests; the 6 u space-rule conflict is surfaced and exempted with an owner decision (Global Constraints, Task 1, Task 16).
- [x] Obstacles, minimap fixtures, `tall` wall: Task 1 (the minimap reads `buildFloorLayouts`; `minimap-model.test.ts` counts fixtures from the layout).
- [x] Point-and-go station `L1:station:office` plus per Rover and wall halves, registered from the chunk: Task 9; stop and view zone with phone class views: Task 1.
- [x] Rooms, catalog entry, room views, `hasPage`, Rover menu entry (mission `office`), RoomIdSchema: Task 2.
- [x] Lazy chunk not on the first-frame path, `afterFirstFrameIdle` plus 40 u trigger, drawer opens load it, `?prefetch=off` respected, `__hq.office`: Tasks 8 and 10, e2e in Task 14; chunk boundary test: Task 10 (extended in 11 and 12).
- [x] Drawer bodies through `lazyFromChunk`: Task 12. HTML chips (HintProbe pattern), host mounted only when the chunk is ready: Tasks 9 and 11.
- [x] Bytes: separate 14 KB cap outside the session total, measurement after the session floors, main path under 1.5 KB with measurement and fallbacks: Task 13.
- [x] Draw calls at most 12 (7 planned), programs zero new, triangles, `useDispose` on every memoized resource, `useFrame` only, precompile, ride-cull bounds, lite fallback: Tasks 9, 10 and 14.
- [x] Nine states with faces, poses and screens; no fake test counts; generic input card; invented code; tones from palette tokens plus one table: Tasks 3, 5 and 6.
- [x] Pure modules with tests (layout, visual, atlas with a recording fake, model, wall, poller with fake timers): Tasks 1 and 3 to 7.
- [x] Polling D6 and failure modes (keep-last 60 s, offline, disabled, semi-live, idle stop, visibility), in view only: Tasks 4, 8 and 9; PR 4's shared API exactly as coordinated: Tasks 3 and 4.
- [x] Reduced motion: still poses, crossfade, probe `bob` 0: Tasks 5, 9 and 14.
- [x] Chips: "<Agent> · <activity>", title or "Client project", CI bar, far and phone-drawer hiding, dots not stripes: Task 11.
- [x] Drawers: per Rover, summary, GitHub with notes: Task 12. Copy EN and ID under `office` (shared keys plus `office.3d`), client namespace, HTML measured: Tasks 2 and 13.
- [x] Probes `__hq.probes.office`: Tasks 8 and 9. E2E: Task 14. CI plan rules and pins: Task 14.
- [x] Docs, features, README line, decision file, plan status: Task 16. Captures: Tasks 15 and 16.
- [x] No placeholders in code steps; the only fill-ins are measured numbers in Task 16's docs, written in at that step from Tasks 13 and 14.

## Owner actions and captures

- Approve the office chunk cap: 14 KB gzip outside the 3D session total (measured 12.2 KB; the session totals have only about 1.9 KB full and 2.0 KB lite of headroom at 020c7df3).
- Decide the session-cap question: the plan as written measured +2.5 KB full and +2.4 KB lite on the main path (0.5 KB over both session caps). Either approve raising the session caps by 3 KB (full 473 KB, lite 449.4 KB) or require Task 13 Step 6's fallbacks until both totals pass. Note that the spawn is inside the load radius, so most L1 sessions download the chunk on idle after the first frame.
- Approve the space-rule exception: the office is one fixture; its inner gaps, its 3.89 u to the kiosk and its 2.32 u to the hall lead road are below the 6 u rule (any concave row of five desks breaks the pairwise rule).
- Review the 28 captures from `scripts/office-shots.ts` (1440x900 and 390x844, full and lite): `states-a` (working, thinking, reviewing, testing, CI 7 of 12), `states-b` (needs Kurniadi, done, CI failed with its job, asleep, off duty), `drawer-summary`, `drawer-github`, `drawer-desk`, `semi-live`, `off`; tune `OFFICE.view` zooms and `DESK_SCREEN` if needed.
- Optional after merge if the office shows in them: re-run `bun run floor:thumbs`, `bun run og:stills` and `bun scripts/readme-hero.ts`.
- Prerequisites: parts 1 and 2 merged (protocol, fixtures, `/api/office`, the relay); part 4 adds the Classic `#office` card that `L1:office`'s static path points to.
