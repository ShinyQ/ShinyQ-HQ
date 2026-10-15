# L3 Three Paths (Round 7 G) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn L3 into three paths that all start at the hub fork (Product north, Data and ML straight along the centre spine, AI south) and meet at the Tech Reactor plaza, with a three-board directory wall at the fork whose titles are about 25 percent and list values about 20 percent smaller.

**Architecture:** All geometry stays in the pure `floors/labs/layout.ts` (Vitest in node). The Data and ML annex east of the reactor goes; a `data` road runs straight from the hub centre to the reactor ring's west point, its pods docked on both sides. The wing roads keep their pods and turns but leave the hub rim at 30 degrees off the spine and run wider apart (`layout.wingZ`, from the deepest spine and inner pods) so the spine fits between the inner rows. The directory wall becomes a row of three raised boards on four posts: the middle (Data and ML) board is a gate the spine road and the rover pass under. View zones on the spine get an optional travel direction (`ViewZone.travel`) so driving the spine west never swings the camera to look east.

**Tech Stack:** TypeScript, React Three Fiber, troika text (`BatchedLabels`), Vitest, Playwright, Bun.

## Global Constraints

- Spec: Round 7 design sections 1, 2, 7, 11 (binding). Owner request: "In L3 the board for Product & AI Engineering value text was too big reduce it a little also i dont like the Data & ML Section is behind since land on the L3 we can make it Split into 3 Path." Owner chose Option 1.
- No em dashes (U+2014) anywhere. EN and ID for every user-facing string (no new strings expected: wing names come from `common.wing`).
- Never change the aesthetic beyond what this sub-project states: same materials, programs, neon rims, sign style.
- L3 under 150 draw calls and the 30k triangle cap, no new shader program, L3 floor chunk cap from #157 (20 KB), ride peaks unchanged.
- Keep working: hub view zones, wing camera zones, the project tour (Product, AI, Data and ML), deep links `L3:*` pods, the Tech Reactor filter, the Ops Control Room, the Express Return pad, point-and-go targets, the hologram stage.
- Do not push until PR #157 is merged; then rebase on `main`. One CI run at a time (`gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued` before every push).
- Delete `tests/scratch/` (prototype harness) before the first commit.

## Decisions (made in planning, numbers checked with a projection harness)

| Topic | Decision |
| --- | --- |
| Spine | Road `data` from the hub centre `(-4, 0)` straight east to `ringEntry(loopEnd, hubC)` (the ring road's west point). Always present, also without data pods. |
| Spine pods | Dock alternating north (`row: "outer"`) from `LABS.data.start` = 24 and south (`row: "inner"`) from 34, one `slot` (12) plus `gap` (7) apart, at most `LABS.data.maxPods` (8); the rest and listed pods go to the data directory. |
| Wing spacing | `wingZ = max(24, 2 * (road/2 + forecourt) + spineDepth + rowGap + innerDepth)` with `rowGap` 6, `spineDepth` the deepest docked data pod (0 without), `innerDepth` the deepest inner wing pod or `OPS.d`. Today: 4+3+7+6+9+3+4 = 36. |
| Wing mouths | Each wing road is `[hubC, mouth, (wingStartX, ±wingZ), turn, ringEntry]`, `mouth` on the hub rim 30 degrees off the spine: `(-4 + 13 cos 30°, ±13 sin 30°)` = `(7.258, ±6.5)`. |
| Reactor plaza | `loopEnd.x = max(turn(software), turn(ai), lastSpineEdge + tail + east/2)`: 107 today (unchanged), so the reactor, Ops Control Room (x 97 to 103) and Return pad `(117, 9)` keep their x. |
| Wall | Three raised boards at x = 17, thin along x (`w` 0.6): Product z [-11.1, -4.5], Data and ML (gate) z [-4.5, 4.5], AI z [4.5, 11.1]; bottoms at `base` 3.2 (rover 2.8), tops at `h` 11.2. Four posts (0.4 along z) from the floor to `base`: z [-11.1, -10.7], [-4.5, -4.1], [4.1, 4.5], [10.7, 11.1]. The posts are the obstacles; the board rects are `tall` camera columns. |
| Text | Title 0.8 to 0.6 (-25%), desktop list 0.46 to 0.37 (-20%), phone list 0.56 to 0.45 (-20%); text width 6.0 on every face (outer boards 6.6 wide, gate centred); 10 list lines fit. |
| Road signs | Exactly one floating sign per road (`labs-wing-signs`): wing signs 2 u along the road past their mouth, the spine sign over the spine at x = 12; plate bottom 3.0 u (rover drives under), font 0.8, wrapped at 12 characters (two lines for the wing names). No other floating wing label. |
| Arrival framing | Overview `(8.5, 0)` unchanged. Overview zone x [4.5, 12.7], z [-2, 2], yaw east, zoom 1.3 (desktop, tablet), `classView.mobile.zoom` 1.9. Board zones x [12.7, 16.7] over each board's z span, zoom 0.9. All four have `travel: { x: 1, z: 0 }`. |
| Lanes | Two packet spines at z = ±(road/2 + forecourt + spineDepth + rowGap/2) (±17 today) from x 18.3 to the east plaza's west rim, a branch into the back wall of every inner wing pod and every spine pod. Same `PacketLanes` mesh and packet counts. |
| Naming | `HUB_WINGS`/`HubWing` become `SIDE_WINGS`/`SideWing` (the two wings beside the spine); `WING_SIDE` stays. `LabsLayout.dataPlaza`, the `directory` stub road and `LABS.data.{plaza,boardGap}` are removed. `LabsLayout.wingZ` is new. |

Measured with the harness (wall, mouths, signs; final numbers come from the tests):

| View | Boards on screen | Signs |
| --- | --- | --- |
| 1440x900, zoom 1.3 | x 316 to 1124, y 137 to 344 (safe box 40..1400, 90..810) | below the boards, no overlap |
| 390x844, zoom 1.9 | x 35 to 355, y 293 to 368 (safe box 24..366, 120..704) | below the boards, inside 0..390 |

---

### Task 1: Directional view zones

**Files:**
- Modify: `src/experience/camera/orbit.ts:179-243` (`ViewZone`, `zoneAt`)
- Test: `tests/unit/orbit-travel.test.ts` (create)

**Interfaces:**
- Produces: `ViewZone.travel?: Vec2` and `zoneAt(floor: FloorId, p: Vec2 & { heading?: number }, extra?: readonly ViewZone[]): ViewZone | null`. A zone with `travel` applies only when `p.heading` is undefined (pure callers, tests) or the rover forward `(sin h, cos h)` has a non-negative dot with `travel`. `CameraDirector` already passes `roverRuntime` (it carries `heading`), so no call site changes.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { zoneAt, type ViewZone } from "@/experience/camera/orbit";

const zone: ViewZone = { id: "L3:test", area: { minX: 0, maxX: 10, minZ: -2, maxZ: 2 }, yaw: 0, travel: { x: 1, z: 0 } };
const plain: ViewZone = { id: "L3:plain", area: { minX: 20, maxX: 30, minZ: -2, maxZ: 2 }, yaw: 0 };

describe("directional view zones (Round 7 G)", () => {
  it("applies a travel zone to a rover facing within 90 degrees of its direction, or without a heading", () => {
    expect(zoneAt("L3", { x: 5, z: 0 }, [zone])?.id).toBe("L3:test");
    expect(zoneAt("L3", { x: 5, z: 0, heading: Math.PI / 2 }, [zone])?.id).toBe("L3:test");
    expect(zoneAt("L3", { x: 5, z: 0, heading: Math.PI / 4 }, [zone])?.id).toBe("L3:test");
    expect(zoneAt("L3", { x: 5, z: 0, heading: 0 }, [zone])?.id).toBe("L3:test");
  });

  it("skips a travel zone for a rover driving against it", () => {
    expect(zoneAt("L3", { x: 5, z: 0, heading: -Math.PI / 2 }, [zone])).toBeNull();
    expect(zoneAt("L3", { x: 5, z: 0, heading: (-3 * Math.PI) / 4 }, [zone])).toBeNull();
  });

  it("leaves zones without a travel direction as they were", () => {
    expect(zoneAt("L3", { x: 25, z: 0, heading: -Math.PI / 2 }, [plain])?.id).toBe("L3:plain");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/orbit-travel.test.ts`
Expected: FAIL (`travel` is not a `ViewZone` property; the against-travel case returns the zone).

- [ ] **Step 3: Implement**

In `ViewZone` add after `prime?`:

```ts
  /**
   * Applies only while the rover faces within 90 degrees of this direction (forward `(sin h, cos h)`),
   * so a zone that looks along a road never turns the camera against a rover driving the other way.
   * Callers without a heading (pure tests, layout checks) always get the zone.
   */
  travel?: Vec2;
```

Replace `zoneAt`:

```ts
/** The zone the rover is in: static `VIEW_ZONES` first, then the floor layout's own (`FloorLayout.viewZones`). */
export function zoneAt(floor: FloorId, p: Vec2 & { heading?: number }, extra: readonly ViewZone[] = []): ViewZone | null {
  const heading = p.heading;
  const inside = (z: ViewZone) =>
    p.x >= z.area.minX &&
    p.x <= z.area.maxX &&
    p.z >= z.area.minZ &&
    p.z <= z.area.maxZ &&
    (!z.travel || heading === undefined || Math.sin(heading) * z.travel.x + Math.cos(heading) * z.travel.z >= -1e-9);
  return VIEW_ZONES[floor]?.find(inside) ?? extra.find(inside) ?? null;
}
```

Import `Vec2` if `orbit.ts` does not already (it uses `Vec2` in `ViewZone.area`'s `Rect`; check the imports).

- [ ] **Step 4: Run tests**

Run: `bunx vitest run tests/unit/orbit-travel.test.ts tests/unit/orbit.test.ts tests/unit/camera*.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/experience/camera/orbit.ts tests/unit/orbit-travel.test.ts
rtk git commit -m "feat(camera): view zones with an optional travel direction"
```

---

### Task 2: Three paths in the pure L3 layout

**Files:**
- Modify: `src/experience/floors/labs/layout.ts` (constants, `directoryBoard`, `directoryStop`, `wallPosts`, `buildLabsLayout`, `opsPlacement`, module comment)
- Modify: `src/experience/floors/labs/techReactor.ts` (`roadGlow`)
- Modify: `src/experience/missions/host3d.ts:61` (one line)
- Modify: `src/experience/interact/registry.ts` (`labsBoards`: `base`)
- Test: `tests/unit/labs-layout.test.ts`, rename `tests/unit/labs-data-annex.test.ts` to `tests/unit/labs-spine.test.ts`, `tests/unit/labs-reactor.test.ts`, `tests/unit/labs-ops.test.ts`, `tests/unit/facing.test.ts`, `tests/unit/missions-host3d.test.ts`, `tests/unit/interact-registry.test.ts`, `tests/unit/floor-pads.test.ts` (only if it hard-codes L3 numbers)

**Interfaces:**
- Consumes: `ViewZone.travel` (Task 1).
- Produces (later tasks rely on these exact names):
  - `LABS.board = { x: 17, w: 0.6, h: 11.2, base: 3.2, d: 6.6, gate: 9, post: 0.4 }`, `LABS.rowGap = 6`, `LABS.mouthAngle = Math.PI / 6`, `LABS.overviewZoomPhone = 1.9`, `LABS.signAlong = 2`, `LABS.spineSignX = 12`, `LABS.data = { maxPods: 8, start: 24 }`.
  - `SIDE_WINGS: readonly ["software", "ai"]`, `type SideWing`, `WING_SIDE: Record<SideWing, -1 | 1>`, `LABS_WINGS` (unchanged order software, ai, data), `WING_TINT` (unchanged).
  - `directoryBoard(wing: Wing): DirectoryBoard`, `directoryStop(wing: Wing): Vec2`, `wallPosts(): Rect[]`.
  - `LabsLayout`: `boards: Record<Wing, DirectoryBoard>`, `signs: Record<Wing, WingSign>`, `wingZ: number`, no `dataPlaza`; roads `lead`, `data`, `software`, `ai`, `east-ring` (no `directory`).
  - `FloorLayout.directoryStops` has all three wings.

- [ ] **Step 1: Rewrite the layout tests first (failing)**

Update `tests/unit/labs-layout.test.ts`:
- Replace `LABS.wingZ` with `layout.wingZ` (and `lopsided.wingZ` etc.) everywhere; replace `HUB_WINGS` with `SIDE_WINGS`.
- "wing roads" test: assert `points[0]` is the hub centre, `points[1]` is the mouth `{ x: hub.x + 13 * cos(PI/6), z: ∓13 * sin(PI/6) }` (`toBeCloseTo` per field), `points[2]` is `{ x: LABS.wingStartX, z: ∓layout.wingZ }`, and the turn is `points[3]` (was `points[2]`); keep the ring-entry and loop checks with the new indices.
- "ends each wing road one tail past its last docked pod": use `points[3]`; the east plaza x is `max(turns, lastSpineEdge + LABS.tail + LABS.east / 2)`.
- Replace "drives from the arrival spot straight to either panel along a short road stub" with:

```ts
  it("runs the Data and ML spine straight from the hub centre to the reactor ring's west point", () => {
    const spine = network.roads.find((r) => r.id === "data")!;
    expect(spine.points).toEqual([layout.hub.center, ringEntry(layout.east.center, layout.hub.center)]);
    expect(spine.points[1]).toEqual({ x: layout.east.center.x - REACTOR.ring, z: 0 });
    expect(network.roads.some((r) => r.id === "directory")).toBe(false);
    expect(onNetwork(network, LABS.overview)).toBe(true);
    expect(onNetwork(network, directoryStop("data"))).toBe(true);
  });

  it("drives from the arrival spot to every board stop without turning back toward the hub", () => {
    const grid = buildNavGrid(floor, ROVER.radius);
    for (const wing of LABS_WINGS) {
      const stop = directoryStop(wing);
      const route = roadRoute(network, grid, LABS.overview, stop)!;
      expect(route.at(-1)).toEqual(stop);
      for (const p of route) expect(p.x, `${wing} ${p.x},${p.z}`).toBeGreaterThanOrEqual(LABS.overview.x - 1e-6);
      let length = 0;
      let at = LABS.overview;
      for (const p of route) {
        length += Math.hypot(p.x - at.x, p.z - at.z);
        at = p;
      }
      expect(length, wing).toBeLessThan(13);
    }
  });
```

- Replace the packet spine test with:

```ts
  it("runs two packet spines between the spine pods and the inner wing pods, with a branch into each back wall", () => {
    const laneZ = LABS.road / 2 + LABS.forecourt + Math.max(...layout.placed.filter((p) => p.pod.wing === "data").map((p) => p.depth)) + LABS.rowGap / 2;
    const spines = layout.lanes.filter((l) => l[0][1] === l[1][1]);
    expect(spines).toEqual([
      [[LABS.board.x + LABS.board.w / 2 + 1, -laneZ], [layout.east.center.x - LABS.east / 2, -laneZ]],
      [[LABS.board.x + LABS.board.w / 2 + 1, laneZ], [layout.east.center.x - LABS.east / 2, laneZ]],
    ]);
    const fed = layout.placed.filter((p) => p.pod.wing === "data" || p.row === "inner");
    expect(layout.lanes.length).toBe(2 + fed.length);
    for (const p of fed) {
      const back = p.facing > 0 ? p.rect.minZ : p.rect.maxZ;
      expect(layout.lanes).toContainEqual([[p.center.x, Math.sign(p.center.z) * laneZ], [p.center.x, back]]);
    }
  });
```

- Replace the wall test with:

```ts
  it("stands three raised boards at the fork, Product north, Data and ML over the spine, AI south, on four posts", () => {
    const grid = buildNavGrid(floor, ROVER.radius);
    expect(layout.boards.software.maxZ).toBeCloseTo(layout.boards.data.minZ);
    expect(layout.boards.data.maxZ).toBeCloseTo(layout.boards.ai.minZ);
    expect(layout.boards.data.center.z).toBe(0);
    expect(layout.boards.data.maxZ - layout.boards.data.minZ).toBeCloseTo(LABS.board.gate);
    for (const wing of SIDE_WINGS) {
      const b = layout.boards[wing];
      expect(b.maxZ - b.minZ).toBeCloseTo(LABS.board.d);
      expect(Math.sign(b.center.z)).toBe(WING_SIDE[wing]);
    }
    // The spine road passes between the gate posts; the rover (2.8 u) fits under the board.
    const posts = wallPosts();
    expect(posts).toHaveLength(4);
    for (const p of posts) expect(floor.obstacles).toContainEqual(p);
    const inner = posts.filter((p) => Math.abs(p.minZ + p.maxZ) / 2 < LABS.board.gate / 2);
    for (const p of inner) expect(Math.min(Math.abs(p.minZ), Math.abs(p.maxZ))).toBeGreaterThan(LABS.road / 2);
    expect(LABS.board.base).toBeGreaterThan(ROVER_HEIGHT);
    // No board rect blocks the floor; each is a tall camera column.
    for (const wing of LABS_WINGS) {
      const b = layout.boards[wing];
      expect(floor.obstacles).not.toContainEqual({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ });
      expect(floor.tall).toContainEqual({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, h: LABS.board.h });
      const stop = directoryStop(wing);
      expect(stop).toEqual(b.stop);
      expect(stop).toEqual({ x: b.minX - LABS.boardStop, z: b.center.z });
      expect(isWalkable(grid, stop), wing).toBe(true);
      expect(Math.hypot(stop.x - LABS.overview.x, stop.z - LABS.overview.z), wing).toBeGreaterThan(HINT.radius);
      const zone = zoneAt("L3", stop, floor.viewZones);
      expect(zone?.id).toBe(`L3:directory:${wing}`);
      expect(zone?.yaw).toBeCloseTo((-3 * Math.PI) / 4);
      expect(zone?.zoom).toBe(LABS.boardZoom);
      for (const p of layout.placed) expect(rectGap(b, p.rect), p.room).toBeGreaterThanOrEqual(6);
    }
    expect(floor.directoryStops).toEqual({ software: directoryStop("software"), ai: directoryStop("ai"), data: directoryStop("data") });
  });
```

- Overview test: keep spawn/arrival/inPlaza/walkable/camera-position checks; assert `zone.classView?.mobile?.zoom === LABS.overviewZoomPhone`; replace the "Driving the roads never swings the camera" loop by: sample every road both ways (heading from the segment direction, `Math.atan2(dx, dz)`); for the wing roads, the lead road and the ring no sample may return `L3:overview` or `L3:directory:*`; for the `data` road driven west (`heading = -PI/2`) no sample may return them either.
- "turns the camera at each door": add the spine pods (all `placed`), and replace the wing-road sampling with `zoneAt("L3", { x, z: WING_SIDE[wing] * layout.wingZ }, ...)`.
- "feeds the tour": `expect(boards).toEqual([directoryStop("software"), directoryStop("ai"), directoryStop("data")])`.

Create `tests/unit/labs-spine.test.ts` (and `git rm tests/unit/labs-data-annex.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { zoneAt } from "@/experience/camera/orbit";
import { buildFloorLayouts, ROVER } from "@/experience/config";
import { buildLabsLayout, directoryStop, LABS, tourOrder, WING_SIDE, WING_TINT } from "@/experience/floors/labs/layout";
import { REACTOR } from "@/experience/floors/labs/reactor";
import { roadGlow } from "@/experience/floors/labs/techReactor";
import { labsWalk } from "@/experience/missions/walks";
import { distanceToRect } from "@/experience/nav/collision";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { roadRoute } from "@/experience/nav/roadRoute";
import { padViolations, rectGap } from "@/experience/nav/space";
import type { LabPod } from "@/experience/types";
import { expectSpaceRules } from "../helpers/space";

/** The Data and ML spine (Round 7 G, Option 1): the centre path from the hub fork to the Tech Reactor. */
const FLOOR_NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const real = buildExperienceData("en", FLOOR_NAMES).labs.pods;
const sidePods = real.filter((p) => p.wing !== "data");
const pod = (slug: string, wing: LabPod["wing"], tier: LabPod["tier"], order: number): LabPod => ({
  id: slug, slug, title: slug, tier, wing, accent: "amber", hologram: "chart", order, hasHologramView: tier === "hero", hasGallery: false,
});
const layout = buildLabsLayout(real);
const { floor, network } = layout;
const spinePods = layout.placed.filter((p) => p.pod.wing === "data");

describe("L3 Data and ML spine", () => {
  it("passes the space rules and the pad rules with the real pods, six spine pods, a hero spine pod and none", () => {
    const sets = [
      real,
      [...sidePods, ...Array.from({ length: 6 }, (_, i) => pod(`d${i}`, "data", "featured", i))],
      [...sidePods, pod("hero-data", "data", "hero", 0), pod("f-data", "data", "featured", 1)],
      sidePods,
      [],
    ];
    for (const pods of sets) {
      const l = buildLabsLayout(pods);
      expectSpaceRules({ bounds: l.floor.bounds, obstacles: l.floor.obstacles, doors: l.floor.doors ?? [], network: l.network, start: l.floor.approach });
      const pads = buildFloorLayouts(8, { labs: pods }).L3.pads ?? [];
      expect(padViolations({ bounds: l.floor.bounds, obstacles: l.floor.obstacles, doors: l.floor.doors ?? [], network: l.network, start: l.floor.approach, pads })).toEqual([]);
    }
  });

  it("docks spine pods alternating north and south from x = 24, doors facing the spine, 6 u from the inner wing rows", () => {
    expect(spinePods.map((p) => p.pod.slug)).toEqual(tourOrder(real.filter((p) => p.wing === "data")).map((p) => p.slug));
    spinePods.forEach((p, i) => {
      expect(Math.sign(p.center.z), p.room).toBe(i % 2 === 0 ? -1 : 1);
      expect(p.roadZ).toBe(0);
      expect(Math.sign(0 - p.center.z)).toBe(p.facing);
      expect(Math.min(Math.abs(p.rect.minZ), Math.abs(p.rect.maxZ))).toBeCloseTo(LABS.road / 2 + LABS.forecourt);
    });
    const north = spinePods.filter((p) => p.center.z < 0);
    const south = spinePods.filter((p) => p.center.z > 0);
    expect(north[0].center.x).toBe(LABS.data.start + LABS.slot / 2);
    expect(south[0].center.x - north[0].center.x).toBe(LABS.innerStart - LABS.outerStart);
    const inner = layout.placed.filter((p) => p.pod.wing !== "data" && p.row === "inner");
    for (const s of spinePods) for (const w of inner) expect(rectGap(s.rect, w.rect), `${s.room} ${w.room}`).toBeGreaterThanOrEqual(LABS.rowGap);
    expect(Math.min(...inner.map((w) => Math.min(Math.abs(w.rect.minZ), Math.abs(w.rect.maxZ)))) - Math.max(...spinePods.map((s) => Math.max(Math.abs(s.rect.minZ), Math.abs(s.rect.maxZ))))).toBeCloseTo(LABS.rowGap);
  });

  it("widens the wing roads just enough for the spine and keeps the reactor plaza, Ops Control Room and Return pad x", () => {
    expect(layout.wingZ).toBe(36);
    expect(buildLabsLayout([]).wingZ).toBeGreaterThanOrEqual(LABS.wingZ);
    expect(layout.east.center).toEqual({ x: 107, z: 0 });
    expect(layout.ops.rect.minX).toBe(97);
    expect(floor.returnPad).toEqual({ x: 117, z: 9 });
    expect(floor.bounds.maxX).toBe(layout.east.center.x + LABS.east / 2 + LABS.margin);
    expect(floor.stops!["L3:reactor"]).toEqual({ x: layout.east.center.x + REACTOR.ring, z: 0 });
  });

  it("reaches every spine door along the road from the elevator, the camera turning at each", () => {
    const grid = buildNavGrid(floor, ROVER.radius);
    for (const p of spinePods) {
      expect(isWalkable(grid, p.door), p.room).toBe(true);
      const route = roadRoute(network, grid, floor.approach, p.door)!;
      expect(Math.hypot(route.at(-1)!.x - p.door.x, route.at(-1)!.z - p.door.z)).toBeLessThan(1);
      expect(zoneAt("L3", p.door, floor.viewZones)?.id).toBe(p.room);
      expect(distanceToRect(floor.returnPad!, p.rect)).toBeGreaterThanOrEqual(6);
    }
  });

  it("sends spine pods past its capacity and listed data pods to the data directory", () => {
    const many = Array.from({ length: LABS.data.maxPods + 2 }, (_, i) => pod(`m${i}`, "data", "featured", i));
    const crowded = buildLabsLayout([...sidePods, ...many, pod("listed-data", "data", "listed", 99)]);
    expect(crowded.placed.filter((p) => p.pod.wing === "data")).toHaveLength(LABS.data.maxPods);
    expect(crowded.directory.data.map((p) => p.slug)).toEqual([`m${LABS.data.maxPods}`, `m${LABS.data.maxPods + 1}`, "listed-data"]);
    expectSpaceRules({ bounds: crowded.floor.bounds, obstacles: crowded.floor.obstacles, doors: crowded.floor.doors ?? [], network: crowded.network, start: crowded.floor.approach });
  });

  it("glows the spine from the reactor ring back to the westmost lit spine pod", () => {
    const lit = [spinePods[1], spinePods[3]];
    const segs = roadGlow(layout, lit);
    const entry = network.roads.find((r) => r.id === "data")!.points.at(-1)!;
    expect(segs).toContainEqual({ a: entry, b: { x: Math.min(...lit.map((p) => p.door.x)), z: 0 } });
    for (const p of lit) expect(segs).toContainEqual({ a: { x: p.door.x, z: 0 }, b: p.door });
    expect(segs).toHaveLength(1 + lit.length);
  });

  it("tours Product, AI, then Data and ML, ending at all three boards of the wall", () => {
    const walk = labsWalk(real, { wings: { software: "Product Engineering", ai: "AI Engineering", data: "Data and ML" }, more: "More projects here", moreSub: "" });
    const rooms = walk.stops.filter((s) => s.room).map((s) => s.room);
    const by = (w: LabPod["wing"]) => layout.placed.filter((p) => p.pod.wing === w).map((p) => p.room);
    expect(rooms).toEqual([...by("software"), ...by("ai"), ...by("data")]);
    expect(walk.stops.slice(-3).map((s) => s.to)).toEqual([directoryStop("software"), directoryStop("ai"), directoryStop("data")]);
    expect(WING_TINT.data).toBe("#fbbf24");
    expect(WING_SIDE).toEqual({ software: -1, ai: 1 });
  });

  it("puts one floating sign at each road: wing signs past their mouths, the spine sign over the spine before the wall", () => {
    for (const wing of ["software", "ai"] as const) {
      const road = network.roads.find((r) => r.id === wing)!;
      expect(layout.signs[wing].at).toEqual(road.points[1]);
      expect(Math.hypot(layout.signs[wing].float.x - road.points[1].x, layout.signs[wing].float.z - road.points[1].z)).toBeCloseTo(LABS.signAlong);
    }
    expect(layout.signs.data.float).toEqual({ x: LABS.spineSignX, z: 0 });
    expect(layout.signs.data.float.x).toBeLessThan(layout.boards.data.minX);
    expect(Object.keys(layout.signs).sort()).toEqual(["ai", "data", "software"]);
  });
});
```

Other test files:
- `tests/unit/labs-reactor.test.ts`: `floor.tall` boards count stays `Object.keys(layout.boards).length` (now 3); any `points[2]` turn index becomes `points[3]`.
- `tests/unit/labs-ops.test.ts`: `{ x: 100, z: LABS.wingZ }` becomes `{ x: 100, z: layout.wingZ }`; `east.center` stays `{ x: 107, z: 0 }`.
- `tests/unit/facing.test.ts`: iterate `SIDE_WINGS` (or all three) with `layout.signs[wing]`.
- `tests/unit/missions-host3d.test.ts`: `directoryStop("software")` unchanged; add `roomTarget` for a listed data pod returns `directoryStop("data")`.
- `tests/unit/interact-registry.test.ts`: `L3:board:software|ai|data` exist with `base: LABS.board.base`, `height: LABS.board.h`.

- [ ] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/unit/labs-layout.test.ts tests/unit/labs-spine.test.ts tests/unit/labs-reactor.test.ts tests/unit/labs-ops.test.ts tests/unit/facing.test.ts tests/unit/missions-host3d.test.ts tests/unit/interact-registry.test.ts`
Expected: FAIL (missing exports `SIDE_WINGS`, `wallPosts`, `layout.wingZ`, the spine road).

- [ ] **Step 3: Implement `layout.ts`**

Constants (replace the `LABS` fields named here; keep the others):

```ts
  /** Minimum |z| of the wing roads; `buildLabsLayout` widens it (`LabsLayout.wingZ`) so the Data and ML spine fits between the inner rows. */
  wingZ: 24,
  /** Clear floor between the backs of the spine pods and the inner wing pods (the packet lanes run in it). */
  rowGap: 6,
  /** Each wing road leaves the hub rim this far (rad) off the spine, so all three road mouths sit in the arrival view. */
  mouthAngle: Math.PI / 6,
  /**
   * Directory wall where the three roads fork (Round 7 G): a row of raised boards on four posts, thin
   * along x, west faces toward the arrival camera. Product north, Data and ML in the middle as a gate
   * the spine road and the rover (2.8 u) pass under, AI south. `gate` and `d` are the middle and outer
   * board widths along z; boards run from `base` to `h`; posts are `post` deep along z.
   */
  board: { x: 17, w: 0.6, h: 11.2, base: 3.2, d: 6.6, gate: 9, post: 0.4 },
  /** Phones frame all three road mouths and the whole wall from the arrival spot. */
  overviewZoomPhone: 1.9,
  /** Wing signs float this far along their road past the mouth; the spine sign floats over the spine at `spineSignX`. */
  signAlong: 2,
  spineSignX: 12,
  /** Data and ML spine: pods dock from `start` (north row; the south row half a pitch later), at most `maxPods`. */
  data: { maxPods: 8, start: 24 },
```

Wings, boards, posts (replace `HUB_WINGS`, `HubWing`, `WING_SIDE`, `panelAt`, `directoryBoard`, `directoryStop`):

```ts
/** The two wings beside the spine; the `data` wing is the spine itself. */
export const SIDE_WINGS = ["software", "ai"] as const;
export type SideWing = (typeof SIDE_WINGS)[number];
/** Every wing in tour order: Product, AI, then Data and ML. */
export const LABS_WINGS: readonly Wing[] = ["software", "ai", "data"];
/** -1 = north (`software` wing), +1 = south (`ai` wing); display names come from messages (`common.wing`). */
export const WING_SIDE: Record<SideWing, -1 | 1> = { software: -1, ai: 1 };

/** A board of the directory wall at the fork (fixed: it does not depend on the pods). */
export function directoryBoard(wing: Wing): DirectoryBoard {
  const { x, w, gate, d } = LABS.board;
  const [minZ, maxZ] = wing === "data" ? [-gate / 2, gate / 2] : WING_SIDE[wing] < 0 ? [-(gate / 2 + d), -gate / 2] : [gate / 2, gate / 2 + d];
  const center = { x, z: (minZ + maxZ) / 2 };
  return { minX: x - w / 2, maxX: x + w / 2, minZ, maxZ, center, stop: { x: x - w / 2 - LABS.boardStop, z: center.z } };
}

/** Where `drive` stops for a listed item, and the tour's "More projects here" stop: in front of its wing's board. */
export function directoryStop(wing: Wing): Vec2 {
  return directoryBoard(wing).stop;
}

/** The four posts that carry the wall (the floor obstacles): one at each outer end, two framing the spine road under the gate. */
export function wallPosts(): Rect[] {
  const { x, w, gate, d, post } = LABS.board;
  const at = (minZ: number, maxZ: number): Rect => ({ minX: x - w / 2, maxX: x + w / 2, minZ, maxZ });
  const g = gate / 2;
  const o = gate / 2 + d;
  return [at(-o, -o + post), at(-g, -g + post), at(g - post, g), at(o - post, o)];
}
```

`LabsLayout` changes: `boards: Record<Wing, DirectoryBoard>`, `signs: Record<Wing, WingSign>`, remove `dataPlaza`, add `/** |z| of the wing roads: wide enough for the spine pods, the row gap and the inner wing pods. */ wingZ: number;`, update the `east`, `signs`, `lanes` doc comments (lanes: "two packet spines between the spine pods and the inner wing rows, and a branch into each of their back walls").

`buildLabsLayout` body (replace from `const placed` through the return):

```ts
  const placed: PlacedPod[] = [];
  const directory: Record<Wing, LabPod[]> = { software: [], ai: [], data: [] };
  // Docking lists first: the deepest spine and inner wing pods set how far apart the wing roads run.
  const docked: Record<Wing, LabPod[]> = { software: [], ai: [], data: [] };
  for (const wing of LABS_WINGS) {
    const inWing = pods.filter((p) => p.wing === wing);
    const tour = tourOrder(inWing);
    const cap = wing === "data" ? L.data.maxPods : L.maxPerWing;
    docked[wing] = tour.slice(0, cap);
    directory[wing] = [...tour.slice(cap), ...inWing.filter((p) => p.tier === "listed").sort(comparePods)];
  }
  const depthOf = (p: LabPod) => (p.tier === "hero" ? L.hero.d : L.featured.d);
  const spineDepth = Math.max(0, ...docked.data.map(depthOf));
  const innerDepth = Math.max(OPS.d, ...SIDE_WINGS.flatMap((w) => docked[w].filter((_, i) => i % 2 === 1).map(depthOf)));
  const wingZ = Math.max(L.wingZ, 2 * (half + L.forecourt) + spineDepth + L.rowGap + innerDepth);
  const lastEdge: Record<SideWing, number> = { software: -Infinity, ai: -Infinity };

  const dock = /* unchanged */;

  for (const wing of SIDE_WINGS) {
    const zr = WING_SIDE[wing] * wingZ;
    const cursor = { outer: L.outerStart as number, inner: L.innerStart as number };
    docked[wing].forEach((pod, i) => {
      const row = i % 2 === 0 ? "outer" : "inner";
      const side = (row === "outer" ? WING_SIDE[wing] : -WING_SIDE[wing]) as -1 | 1;
      const p = dock(pod, zr, side, cursor[row], row);
      cursor[row] += L.slot + L.gap;
      placed.push(p);
      lastEdge[wing] = Math.max(lastEdge[wing], p.rect.maxX);
    });
  }
  // The spine: north row from `data.start`, south row half a pitch later (the wings' outer and inner offsets).
  const spineCursor = { outer: L.data.start as number, inner: L.data.start + L.innerStart - L.outerStart };
  let spineEdge = -Infinity;
  docked.data.forEach((pod, i) => {
    const row = i % 2 === 0 ? "outer" : "inner";
    const p = dock(pod, 0, row === "outer" ? -1 : 1, spineCursor[row], row);
    spineCursor[row] += L.slot + L.gap;
    placed.push(p);
    spineEdge = Math.max(spineEdge, p.rect.maxX);
  });

  const aiInner = placed.filter((p) => p.pod.wing === "ai" && p.row === "inner").map((p) => p.rect.maxX);
  const opsMinX = aiInner.length ? Math.max(...aiInner) + OPS.gap : L.innerStart;
  const minTurn: Record<SideWing, number> = { software: -Infinity, ai: opsMinX + OPS.w + half };
  const turnX = (wing: SideWing) => Math.max(L.wingStartX + L.east + L.margin, lastEdge[wing] + L.tail, minTurn[wing]);
  // The reactor plaza sits on the later wing turn, and a `tail` plus its radius past the last spine pod.
  const loopEnd: Vec2 = { x: Math.max(turnX("software"), turnX("ai"), spineEdge + L.tail + L.east / 2), z: 0 };
  const r = L.hub.size / 2;
  const mouth = (wing: SideWing): Vec2 => ({ x: hubC.x + r * Math.cos(L.mouthAngle), z: hubC.z + WING_SIDE[wing] * r * Math.sin(L.mouthAngle) });
  const wingRoad = (wing: SideWing): Road => {
    const z = WING_SIDE[wing] * wingZ;
    const turn = { x: turnX(wing), z };
    return { id: wing, points: [hubC, mouth(wing), { x: L.wingStartX, z }, turn, ringEntry(loopEnd, turn)], width: L.road };
  };
  const spine: Road = { id: "data", points: [hubC, ringEntry(loopEnd, hubC)], width: L.road };
  const ring: Road = { id: "east-ring", points: ringPoints(loopEnd), width: L.road, closed: true };
  const core = reactorRect(loopEnd);
  const lead: Road = { id: "lead", points: [L.approach, hubC], width: L.road };
  const east: Plaza = { id: "east", center: loopEnd, w: L.east, d: L.east, round: true, core: REACTOR.half };
  const hubEndX = loopEnd.x + L.east / 2 + L.margin;

  const ops = opsPlacement(opsMinX, wingZ);
  const spurs: Spur[] = [
    ...placed.map((p) => ({ room: p.room, from: { x: p.door.x, z: p.roadZ }, to: p.door, width: L.spurWidth, color: WING_TINT[p.pod.wing] })),
    { room: OPS_ROOM, from: { x: ops.door.x, z: WING_SIDE.ai * wingZ }, to: ops.door, width: L.spurWidth, color: OPS_TINT },
  ];
  // No floor arrows on L3 (owner request 2026-10-13): the roads, signs and directory guide the way.
  const network: RoadNetwork = { roads: [lead, spine, wingRoad("software"), wingRoad("ai"), ring], plazas: [hub, east], spurs, chevrons: false };

  const boards = { software: directoryBoard("software"), ai: directoryBoard("ai"), data: directoryBoard("data") } satisfies Record<Wing, DirectoryBoard>;
  const wingSign = (wing: SideWing): WingSign => {
    const at = mouth(wing);
    const to = { x: L.wingStartX, z: WING_SIDE[wing] * wingZ };
    const len = Math.hypot(to.x - at.x, to.z - at.z);
    const heading = { x: (to.x - at.x) / len, z: (to.z - at.z) / len };
    return { at, heading, float: { x: at.x + heading.x * L.signAlong, z: at.z + heading.z * L.signAlong } };
  };
  const spineSign: WingSign = { at: { x: hubC.x + r, z: 0 }, heading: { x: 1, z: 0 }, float: { x: L.spineSignX, z: 0 } };

  const doors: DoorTrigger[] = [
    ...placed.map((p) => ({ room: p.room, at: p.door, facing: { x: 0, z: -p.facing } })),
    { room: OPS_ROOM, at: ops.door, facing: { x: 0, z: ops.facing } },
  ];
  const EAST: Vec2 = { x: 1, z: 0 };
  const boardZone = (wing: Wing): ViewZone => {
    const b = boards[wing];
    return { id: `L3:directory:${wing}`, area: { minX: b.stop.x - 1, maxX: b.minX, minZ: b.minZ, maxZ: b.maxZ }, yaw: LOOK_EAST, zoom: L.boardZoom, travel: EAST };
  };
  const viewZones: ViewZone[] = [
    // Board stops first: the camera stands west of the rover and looks east at the board, zoomed so it fits under the HUD.
    ...LABS_WINGS.map(boardZone),
    // The arrival spot on the hub's east rim, on the spine: the camera sits west of the rover and looks east at
    // the wall with all three road mouths in front of it (phones zoom out further). Only rovers heading east
    // get it (`travel`), so driving the spine back to the hub never turns the camera around.
    {
      id: "L3:overview",
      area: { minX: L.overview.x - 4, maxX: boards.data.stop.x - 1, minZ: -2, maxZ: 2 },
      yaw: LOOK_EAST,
      zoom: L.overviewZoom,
      classView: { mobile: { zoom: L.overviewZoomPhone } },
      travel: EAST,
    },
    { id: REACTOR_ROOM, area: { minX: reactorStop(loopEnd).x - 2, maxX: reactorStop(loopEnd).x + 2, minZ: -2, maxZ: 2 }, yaw: LOOK_WEST, zoom: REACTOR_ZOOM },
    ...placed.map((p) => ({
      id: p.room,
      area: { minX: p.rect.minX, maxX: p.rect.maxX, minZ: p.door.z - VIEW_ZONE_DEPTH, maxZ: p.door.z + VIEW_ZONE_DEPTH },
      yaw: p.facing > 0 ? 0 : Math.PI / 2,
    })),
    { id: OPS_ROOM, area: { minX: ops.rect.minX, maxX: ops.rect.maxX, minZ: ops.door.z - VIEW_ZONE_DEPTH, maxZ: ops.door.z + VIEW_ZONE_DEPTH }, yaw: 0, zoom: OPS_ZOOM },
  ];
  const obstacles: Rect[] = [...placed.map((p) => bare(p.rect)), ...wallPosts(), core, ops.rect];
  const extentZ = Math.max(wingZ + half, ...placed.map((p) => Math.max(Math.abs(p.rect.minZ), Math.abs(p.rect.maxZ))));
  const bounds: Rect = { minX: L.slabMinX, maxX: hubEndX, minZ: -(extentZ + L.margin), maxZ: extentZ + L.margin };

  // Packet lanes: two spines in the row gap between the spine pods and the inner wing pods (east of the
  // wall to the reactor plaza's west rim), with a branch into the back wall of each pod on either side.
  const laneZ = half + L.forecourt + spineDepth + L.rowGap / 2;
  const laneFrom = L.board.x + L.board.w / 2 + 1;
  const laneTo = loopEnd.x - L.east / 2;
  const lanes: [number, number][][] = [];
  if (laneTo > laneFrom) for (const s of [-1, 1]) lanes.push([[laneFrom, s * laneZ], [laneTo, s * laneZ]]);
  for (const p of placed) {
    if (p.pod.wing !== "data" && p.row !== "inner") continue;
    const back = p.facing > 0 ? p.rect.minZ : p.rect.maxZ;
    lanes.push([[p.center.x, Math.sign(p.center.z) * laneZ], [p.center.x, back]]);
  }

  return {
    floor: {
      id: "L3",
      bounds,
      door: L.door,
      approach: L.approach,
      obstacles,
      // The boards (11.2 u), the reactor core and the Ops Control Room block a low camera up to their own height.
      tall: [...LABS_WINGS.map((w) => ({ ...bare(boards[w]), h: L.board.h })), { ...core, h: REACTOR.height }, { ...ops.rect, h: OPS.h }],
      spawn: L.overview,
      arrival: L.overview,
      accent: L.accent,
      doors,
      road: network,
      viewZones,
      // Fast return (F1): south-east of the reactor core, outside the ring road's driving width.
      returnPad: { x: loopEnd.x + 10, z: 9 },
      stops: { [REACTOR_ROOM]: reactorStop(loopEnd) },
      directoryStops: { software: boards.software.stop, ai: boards.ai.stop, data: boards.data.stop },
    },
    placed,
    directory,
    boards,
    network,
    hub,
    east,
    signs: { software: wingSign("software"), ai: wingSign("ai"), data: spineSign },
    lanes,
    reactor: { center: loopEnd, rect: core },
    ops,
    wingZ,
  };
```

`opsPlacement(minX: number, wingZ: number)`: replace `L.wingZ` with the parameter.

Rewrite the module comment (no em dashes): hub, lead road, three roads from the hub (spine straight to the ring's west point; wing roads leave the rim 30 degrees off the spine, run out to `wingZ`, turn east and end on the ring), wall at the fork (three raised boards on four posts, gate over the spine), docking per wing and on the spine, `wingZ` rule, no chevrons.

- [ ] **Step 4: `roadGlow`, host3d, registry**

`techReactor.ts` `roadGlow` (keep the doc comment, reworded "from the reactor out: per road with a lit pod ..."):

```ts
export function roadGlow(layout: LabsLayout, lit: readonly PlacedPod[]): GlowSegment[] {
  const out: GlowSegment[] = [];
  for (const wing of LABS_WINGS) {
    const pods = lit.filter((p) => p.pod.wing === wing);
    if (!pods.length) continue;
    const road = layout.network.roads.find((r) => r.id === wing);
    if (!road || road.points.length < 2) continue;
    const entry = road.points[road.points.length - 1];
    if (wing === "data") {
      out.push({ a: { ...entry }, b: { x: Math.min(...pods.map((p) => p.door.x)), z: entry.z } });
      for (const p of pods) out.push({ a: { x: p.door.x, z: p.roadZ }, b: { ...p.door } });
      continue;
    }
    if (road.points.length < 4) continue;
    const turn = road.points[road.points.length - 2];
    const start = road.points[road.points.length - 3];
    const z = turn.z;
    const west = Math.max(start.x, Math.min(...pods.map((p) => p.door.x)));
    out.push({ a: { ...entry }, b: { ...turn } });
    if (turn.x > west) out.push({ a: { ...turn }, b: { x: west, z } });
    for (const p of pods) out.push({ a: { x: p.door.x, z }, b: { ...p.door } });
  }
  return out;
}
```

Import `LABS_WINGS` from `./layout` (replace the `HubWing` type import).

`host3d.ts` line 61: `if (floor === "L3" && room?.wing) return layout.directoryStops?.[room.wing] ?? directoryStop(room.wing);`

`registry.ts` `labsBoards`: add `base: LABS.board.base,` before `height`.

- [ ] **Step 5: Run the tests**

Run: `bunx vitest run tests/unit/labs-layout.test.ts tests/unit/labs-spine.test.ts tests/unit/labs-reactor.test.ts tests/unit/labs-ops.test.ts tests/unit/facing.test.ts tests/unit/missions-host3d.test.ts tests/unit/interact-registry.test.ts tests/unit/floor-pads.test.ts tests/unit/tech-reactor.test.ts tests/unit/walk.test.ts tests/unit/hint*.test.ts`
Expected: PASS. Then `bun run typecheck` (fix every `HUB_WINGS`, `HubWing`, `dataPlaza`, `LABS.data.plaza` reference; `src/experience/prototype/FloorsPrototype.tsx` uses `labs.signs[wing]` and `labs.east`, both still exist).

- [ ] **Step 6: Commit**

```bash
rtk git add -A src/experience tests/unit
rtk git commit -m "feat(l3): three paths, Data and ML spine from the hub fork to the reactor (Round 7 G)"
```

---

### Task 3: The three-board directory wall, smaller text, road signs

**Files:**
- Modify: `src/experience/floors/labs/directory.ts`
- Modify: `src/experience/floors/labs/Hub.tsx`
- Test: `tests/unit/labs-directory.test.ts`, `tests/unit/labs-arrival.test.ts`

**Interfaces:**
- Consumes: `LABS.board`, `directoryBoard`, `wallPosts`, `LabsLayout.signs` (Task 2).
- Produces: `PANEL` (title 0.6, list 0.37), `LIST_STYLE.compact.size` 0.45, `ROAD_SIGN = { font: 0.8, y: 3, wrap: 12 }`, `roadSigns(layout: LabsLayout, wings: Record<Wing, string>, font: string): SignSpec[]`, `wallSolids(boards?)`, `wallLines(boards?)`, `wallLabels(...)` (same signatures; `boards` defaults to all three fixed boards).

- [ ] **Step 1: Update the tests (failing)**

`tests/unit/labs-directory.test.ts`:
- `panelRows().titleTop < LABS.board.h`, `listBottom >= LABS.board.base`, `listLines >= LABS.boardEntries * PANEL.list.perEntry` (10).
- Sizes: `expect(PANEL.title.size).toBeCloseTo(0.8 * 0.75)`, `expect(PANEL.list.size).toBeCloseTo(0.46 * 0.8, 2)`, `expect(LIST_STYLE.compact.size).toBeCloseTo(0.56 * 0.8, 2)`.
- `wallSolids()` has 3 boards (`y: LABS.board.base`, `h: LABS.board.h - LABS.board.base`, `d` = board width along z) plus 4 posts (`y: 0`, `h: LABS.board.base`), matching `wallPosts()`.
- Every text of `wallLabels` sits on its board's face (`|z - center.z| <= width/2`) and between `base` and `h`; the gate board shows "DATA AND ML" (`labels.wings.data`) on both faces.
- `roadSigns`: exactly three specs, one per wing, texts `wrapSign(name.toUpperCase(), 12)`, plate bottom at `ROAD_SIGN.y` (`spec.y - signPlate(spec).h / 2 === ROAD_SIGN.y`), x/z from `layout.signs[wing].float`; no other spec contains a wing name.

`tests/unit/labs-arrival.test.ts`: iterate `LABS_WINGS` (three boards); `westFace` spans y from `LABS.board.base` to `LABS.board.h`; `settledCamera` passes `zoneView(zone, cls).zoom` (import `zoneView`) instead of `zone.zoom`, so the phone gets 1.9. Thresholds (today's times the requested 0.75 / 0.8):

```ts
  it("reads the board titles on arrival on a laptop", () => {
    for (const wing of LABS_WINGS) expect(em(1440, 900, LABS.overview, wing, TITLE_Y, PANEL.title.size), wing).toBeGreaterThanOrEqual(15);
  });
  it("reads the top projects on arrival on a laptop and a big monitor, and from the board's stop on a phone", () => {
    for (const wing of LABS_WINGS) {
      expect(em(1440, 900, LABS.overview, wing, LIST_Y, PANEL.list.size), wing).toBeGreaterThanOrEqual(9.2);
      expect(em(2560, 1440, LABS.overview, wing, LIST_Y, PANEL.list.size), wing).toBeGreaterThanOrEqual(14.4);
      expect(em(390, 844, directoryStop(wing), wing, LIST_Y, PANEL.list.size), wing).toBeGreaterThanOrEqual(8);
      expect(em(390, 844, directoryStop(wing), wing, LIST_Y, LIST_STYLE.compact.size), wing).toBeGreaterThanOrEqual(9.6);
    }
  });
```

with `LIST_Y = LABS.board.base + 1.2` and `TITLE_Y = LABS.board.h - 1.4`. Add the framing test:

```ts
  for (const { w, h, safe } of VIEWPORTS) {
    it(`shows the three road signs and their mouths at ${w}x${h}, no sign over a board`, () => {
      const { camera } = settledCamera(w, h, LABS.overview);
      const boards = LABS_WINGS.map((wing) => westFace(camera, w, h, wing));
      for (const spec of roadSigns(layout, WING_NAMES, "mono")) {
        const box = signBox(camera, w, h, spec);
        expect(box.minX, spec.text).toBeGreaterThanOrEqual(0);
        expect(box.maxX, spec.text).toBeLessThanOrEqual(w);
        expect(box.minY, spec.text).toBeGreaterThanOrEqual(safe.top);
        expect(box.maxY, spec.text).toBeLessThanOrEqual(h - safe.bottom);
        for (const b of boards) expect(overlap(box, b), spec.text).toBe(false);
      }
      for (const road of ["software", "ai", "data"] as const) {
        const p = road === "data" ? { x: layout.hub.center.x + LABS.hub.size / 2, z: 0 } : layout.network.roads.find((r) => r.id === road)!.points[1];
        const s = screen(camera, w, h, p.x, 0, p.z);
        expect(s.x).toBeGreaterThanOrEqual(safe.side);
        expect(s.x).toBeLessThanOrEqual(w - safe.side);
        expect(s.y).toBeLessThanOrEqual(h - safe.bottom);
      }
    });
  }
```

`signBox` projects the four corners of the plate (`signPlate(spec)` width and height, centred on `spec.x, spec.y, spec.z`, turned to the camera with `yawTowards`), `overlap` is a strict box intersection, `WING_NAMES = { software: "Product Engineering", ai: "AI Engineering", data: "Data and ML" }`. Also check the board stops: from each stop no sign overlaps that stop's board.

- [ ] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/unit/labs-directory.test.ts tests/unit/labs-arrival.test.ts`
Expected: FAIL (old sizes, two boards, no `roadSigns`).

- [ ] **Step 3: Implement `directory.ts`**

- `PANEL.title.size` 0.6, `PANEL.list.size` 0.37, `LIST_STYLE.compact` `{ size: 0.45, lineHeight: 1.25, perEntry: 2, entries: 3 }`; update the comments (owner request Round 7: titles about 25 percent and values about 20 percent smaller).
- `textWidth = () => LABS.board.d - 2 * PANEL.inset` (6.0, the same on every face).
- `panelRows`: `listBottom = LABS.board.base + PANEL.footer.y + PANEL.footer.size + PANEL.footer.gap`; `titleTop` from `LABS.board.h` as today.
- `HUB_BOARDS` becomes `WALL_BOARDS: WallBoards = Object.fromEntries(LABS_WINGS.map((w) => [w, directoryBoard(w)]))`.
- `wallSolids(boards)`: per board `{ x, y: LABS.board.base, z: b.center.z, w: LABS.board.w, h: LABS.board.h - LABS.board.base, d: b.maxZ - b.minZ }`, then `wallPosts()` as `{ x: centre x, y: 0, z: centre z, w, h: LABS.board.base, d }`.
- `wallLines(boards)`: board rims from `base` to `h` (12 edges), each post's four vertical edges in the tint of the board above it (outer posts: their wing; gate posts: data), title underlines as today. One batch.
- `wallLabels`: the footer at `LABS.board.base + PANEL.footer.y`; everything else unchanged.
- New, pure:

```ts
/** The floating road signs (Round 7 G): one per road, upright over its mouth, plate bottom above the rover. */
export const ROAD_SIGN = { font: 0.8, y: 3, wrap: 12 } as const;

export function roadSigns(layout: Pick<LabsLayout, "signs">, wings: Record<Wing, string>, font: string): SignSpec[] {
  return LABS_WINGS.map((wing) => {
    const text = wrapSign(wings[wing].toUpperCase(), ROAD_SIGN.wrap);
    const { h } = signPlate({ text, fontSize: ROAD_SIGN.font });
    const at = layout.signs[wing].float;
    return { text, x: at.x, y: ROAD_SIGN.y + h / 2, z: at.z, color: WING_TINT[wing], fontSize: ROAD_SIGN.font, font };
  });
}
```

`Hub.tsx`: `WingSigns` uses `roadSigns(layout, labels.wings, FONTS.monoBold)` (drop `SIGN_Y`, `SIGN_FONT`); the wall comment: three raised boards on four posts, the middle a gate over the spine; still three draw calls. Pass `layout.boards` as today.

- [ ] **Step 4: Tune if a framing or overlap check fails**

Allowed knobs, in this order: `LABS.spineSignX` (11 to 13), `ROAD_SIGN.y` (3 to 3.4), `LABS.signAlong` (0 to 3), `LABS.overviewZoomPhone` (1.8 to 2.1), `LABS.boardZoom` (0.9 to 1.1). Never change the font sizes. Re-run until green.

- [ ] **Step 5: Run the tests**

Run: `bunx vitest run tests/unit/labs-*.test.ts tests/unit/floating-sign.test.ts tests/unit/floor-text.test.ts tests/unit/floor-signs.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/experience/floors/labs tests/unit
rtk git commit -m "feat(l3): three-board directory wall with smaller text and one sign per road (Round 7 G)"
```

---

### Task 4: End-to-end coverage and captures

**Files:**
- Modify: `e2e/labs-data.spec.ts` (annex to spine)
- Create: `e2e/labs-paths.spec.ts`
- Modify: `scripts/e2e-plan.ts` (map `src/experience/floors/labs/**` and `src/experience/camera/orbit.ts` to `labs-paths` too) and its unit test if it lists specs
- Modify: any e2e spec that hard-codes the old annex, stub road or `wingZ` 24 (grep `e2e/` for `dataPlaza`, `"directory"`, `24`, `boards.data`, `annex`)

**Interfaces:**
- Consumes: `__hq.layouts.L3` (`road`, `stops`, `directoryStops`, `arrival`), `__hq.probes.signs["labs-wing-signs"]`, `__hq.rover` (`drawCalls`, `triangles`), helpers in `e2e/hq.ts` (`enterFloorRoute`, `waitForSceneLive`, `waitForCameraSettle`, `driveTo`, `expectRenderBudget`).

- [ ] **Step 1: Write `e2e/labs-paths.spec.ts`**

For `[{ size: 1440x900, tier: "full" }, { size: 390x844, tier: "lite", isMobile: true, hasTouch: true }]`:
1. Arrival: `enterFloorRoute(page, "/en/labs?tier=<tier>")`, `waitForCameraSettle`. Assert the camera zone is `L3:overview` (read `__hq.rover` or the orbit probe the existing labs spec uses), `__hq.probes.signs["labs-wing-signs"]` has exactly three entries whose texts (spaces collapsed) are `PRODUCT ENGINEERING`, `DATA AND ML`, `AI ENGINEERING`, and `expectRenderBudget`.
2. Road entrances: for `software`, `data`, `ai`, drive to the point 18 u along the road from its first point (computed in the page from `__hq.layouts.L3.road.roads`), settle, assert the budget.
3. Reactor plaza: drive to `__hq.layouts.L3.stops["L3:reactor"]`, settle, assert the budget.
4. When `LABS_SHOTS=<dir>` is set, save `page.screenshot` for each pose as `<dir>/<size>-<pose>.png` (arrival, entrance-software, entrance-data, entrance-ai, reactor). The capture code only reads `__hq.layouts`, so the same spec captures a main build too ("before").

- [ ] **Step 2: Update `e2e/labs-data.spec.ts`**

Replace the annex expectations (data plaza, panel past the plaza, sign past the reactor) with: the data directory stop equals `__hq.layouts.L3.directoryStops.data` and lies west of x = 17; a data pod door is reachable and opens its drawer; the Cmd-K "Data and ML projects" row rides to the data board at the fork.

- [ ] **Step 3: Run**

Run: `bun run build && E2E_PORT=4410 bunx playwright test e2e/labs-paths.spec.ts e2e/labs-data.spec.ts e2e/labs.spec.ts e2e/reactor.spec.ts e2e/production.spec.ts e2e/walk.spec.ts e2e/fast-return.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add e2e scripts tests/unit
rtk git commit -m "test(l3): e2e for the three paths: arrival, road entrances, reactor plaza"
```

---

### Task 5: Docs

**Files:**
- Modify: `AGENTS.md` (L3 Project Roads, L3 Data and ML annex (rename to "L3 Data and ML spine"), L3 Ops Control Room numbers (z 23 to 29 today), Fast return, "hub-only code uses `HUB_WINGS`" to `SIDE_WINGS`, `ViewZone.travel` in the camera paragraph, the `labs-data-annex` test name)
- Modify: `docs/features.md` (L3 section and the status log line for Round 7 G)

- [ ] **Step 1: Edit** both files: three paths, the raised three-board wall with the gate, smaller text (titles about 25 percent, values about 20 percent), one sign per road, `wingZ` rule, the travel-direction zones. No em dashes (`bun run test tests/content/em-dash*` or the repo scan test).
- [ ] **Step 2: Commit** `rtk git commit -am "docs: L3 three paths (Round 7 G)"`.

---

### Task 6: Verification, measurements, PR

- [ ] `rm -rf tests/scratch`; `bun run verify:quick`; `bun run e2e:changed`.
- [ ] Perf lane (render path, floor mounting): `E2E_PORT=<port> bun run e2e:perf`; L3 scene calls, triangles and programs before (main) and after from `perf-report/`. If the L3 counts in `e2e/perf/baseline.json` move by design (no new program), regenerate per AGENTS.md and say why.
- [ ] Visual gate (other floors unchanged): `E2E_PORT=<port> bun scripts/visual-gate.ts --base origin/main --profile strict`; L3 poses differ by design, every other pose within strict.
- [ ] Captures: build main in a sibling worktree, serve, run `LABS_SHOTS=<before dir> bunx playwright test e2e/labs-paths.spec.ts` against it; same on this branch into `<after dir>`.
- [ ] After #157 merges: `rtk git fetch && rtk git rebase origin/main`, rerun `verify:quick` and the L3 chunk byte gate (`e2e/perf/bytes-3d`), check CI capacity, push, open the PR (do not merge), message the coordinator with the PR link, captures, the before/after numbers and test results.
