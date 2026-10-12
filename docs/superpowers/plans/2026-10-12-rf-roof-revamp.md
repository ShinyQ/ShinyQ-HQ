# RF Roof Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "boring" RF Roof (beacon, seven comms terminals, CV kiosk) with a walkable roof deck in one of three owner-picked concepts, keeping every contact function, cutting draw calls, and adding a short "Meet me" guided walk.

**Architecture:** One concept-independent, pure layout builder (`buildRoofLayout(input)` in `src/experience/floors/roof/layout.ts`) defines the deck for all concepts: a lead road from the elevator into a round plaza around a centerpiece, the comms station (RF:contact) north, the CV station (RF:cv) east, the about board south-west, an availability stop south of the centerpiece, and a reserved elevator call pad. Three sceneries (Observatory, Helipad, Signal Garden) render on that layout with a shared kit (merged boxes and edges, instanced pulse rings, invisible hit boxes, one troika `BatchedText` for all labels), so the floor costs about 20 draw calls instead of about 70. Task 1 ships all three in a dev-only route plus screenshots and STOPS for the owner's pick; Tasks 2 to 6 promote the picked scenery into the real floor, then add the drawer meta, the walk, the budget tests, docs and the PR.

**Tech Stack:** Next.js 16 (static export), React 19, TypeScript strict, three.js 0.186 with React Three Fiber 9 and drei 10, troika-three-text 0.52 (`BatchedText`), zustand, next-intl, Vitest 5, Playwright 1.64 (SwiftShader WebGL), Bun 1.4.

## Global Constraints

- Owner request (verbatim): "also with the RF its looks so boring explore that".
- Task 1 = concepts for owner pick: a dev-only prototype route (`page.dev.tsx`, never exported) with 3 distinct concepts; capture screenshots at 1440x900, 834x1112 and 390x844 (headless WebGL `--use-angle=swiftshader`, normal desktop user agent, wait for the ready signal) and STOP for the owner's pick.
- Every concept keeps the existing functions: contact channels, copy email, the CV viewer, availability, location and timezone.
- Walkable-floor rules: roads at least 8 u wide, plazas at least 16 u, obstacles touching or at least 6 u apart (also from the slab edge), every door has a spur, 6 u wide floor from the start to within 4 u of every pad (`expectSpaceRules` from `tests/helpers/space.ts`); optional guided walk through the walk engine (`src/experience/missions/walk.ts`).
- Render budget: under 150 draw calls and 30k triangles per floor (`expectRenderBudget` in `e2e/hq.ts`); the new RF must draw fewer calls than today's RF (the RF terminals alone use about 46).
- Performance tier and reduced motion aware: the lite tier drops additive glow, halos and part of the decor; reduced motion freezes sweeps, pulses, chases and bobbing.
- Coordination: an elevator call pad will sit in front of the elevator on every floor; keep that spot free (`ROOF_DECK.callPad`, x -20 to -12, z -4 to 4: no obstacles, door pads, stops, labels or decor). Parallel sessions do HUD polish, elevator pads, the L4 revamp, landing and content: keep edits to shared files (`messages/*.json`, `src/hud/walk/WalkLayer.tsx`, `src/experience/config.ts`, `tests/unit/library-roof-layout.test.ts`, `e2e/library-roof.spec.ts`) small and local.
- No em dashes (U+2014) anywhere: code, comments, copy, docs, commits, PR text (a unit test scans the repo).
- Content is data: never hardcode career facts in components; read `ExperienceData` (`profile`, `roof`). Every user-facing string is `{ en, id }` or a key in both `messages/en.json` and `messages/id.json`.
- Static export: no server runtime; dev pages use the `.dev.tsx` extension (`pageExtensions` in `next.config.ts`).
- Never edit `public/cv/` or `content/site-content.json` in this plan.
- Workflow: Bun; commit in logical steps with conventional messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), prefixed with `rtk` for git; before pushing run `bun run verify:quick` and `bun run e2e:changed`; one PR, never merged without the owner.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `src/experience/floors/roof/layout.ts` | modify | `ROOF_DECK`, `buildRoofLayout(input)`, `RoofLayout`, `channelSlots(n)`, `roofActive(phase, room)`, `ROOF_STOPS`. Task 1 adds the deck next to today's exports; Task 2 deletes today's exports. |
| `src/experience/floors/roof/solids.ts` | create | Pure geometry: `boxBuffers`, `boxEdgeBuffers`, `latticeSegments`, `skylineBoxes`, `skylineWindows`, `scatter`, `ringPoints`, `mulberry32`, `roofDetail(tier)`. |
| `src/experience/floors/roof/kit.tsx` | create | Shared R3F pieces: `MergedBoxes`, `MergedEdges`, `PulseRings`, `HitBox`, `aboutCard`, `ROOF_BLUE`, `CHANNEL_TONE`, types `RoofLabels`, `RoofSceneryProps`. |
| `src/experience/floors/roof/concepts/Observatory.tsx` | create (Task 1), moved or deleted in Task 2 | Concept A scenery. |
| `src/experience/floors/roof/concepts/Helipad.tsx` | create (Task 1), moved or deleted in Task 2 | Concept B scenery. |
| `src/experience/floors/roof/concepts/SignalGarden.tsx` | create (Task 1), moved or deleted in Task 2 | Concept C scenery. |
| `src/experience/floors/roof/Sky.tsx` | modify | Imports `mulberry32` from `solids.ts` instead of its own copy. |
| `src/experience/floors/roof/Comms.tsx` | delete (Task 2) | Today's beacon, terminals and kiosk. |
| `src/experience/floors/Roof.tsx` | rewrite (Task 2) | Road markings, sky and the picked scenery. |
| `src/experience/fx/labelProps.ts` | create | Pure `BatchedLabel` type and `applyLabel(target, label)`. |
| `src/experience/fx/BatchedLabels.tsx` | create | One troika `BatchedText` for a list of labels (one draw call). |
| `src/experience/fx/holoIcons.ts` | modify | `ROOF_ICONS` (email, cv, about, signal). |
| `src/types/troika-three-text.d.ts` | modify | Types for `Text` and `BatchedText`. |
| `src/experience/types.ts` | modify | `RoofData.timezone`, `RoofData.subheadline`. |
| `src/content/experience-floors.ts` | modify | `buildRoofData` fills the two new fields. |
| `src/content/room-views/roof.ts` | modify (Task 3) | RF:contact header meta: location and timezone. |
| `src/experience/missions/walks.ts` | modify (Task 4) | `roofWalk(data, labels)` ("Meet me"). |
| `src/hud/walk/WalkLayer.tsx` | modify (Task 4) | Registers the RF walk. |
| `src/experience/config.ts` | modify (Task 2, Task 4) | `RF: buildRoofLayout().floor`; `WALK_FLOORS` adds `"RF"`. |
| `src/experience/tower/Tower.tsx`, `src/experience/Experience.tsx` | modify (Task 2) | New `Roof` props and labels. |
| `messages/en.json`, `messages/id.json` | modify | `hud.world.about`, `hud.world.availability` (Task 1); `walk.meet.*` (Task 4). |
| `src/experience/prototype/roof/RoofConcepts.tsx`, `RoofConceptsLoader.tsx` | create (Task 1), delete (Task 2) | Dev harness: concepts, stops, views, draw-call probe. |
| `src/app/[locale]/dev/roof/page.dev.tsx` | create (Task 1), delete (Task 2) | Dev-only route. |
| `scripts/capture-dev.ts` | create | Screenshots and draw-call metrics of dev routes or the served export at the three review sizes. |
| `tests/unit/roof-layout.test.ts`, `roof-solids.test.ts`, `roof-icons.test.ts`, `label-props.test.ts` | create | Unit tests. |
| `tests/unit/library-roof-layout.test.ts`, `missions-host3d.test.ts`, `experience-data.test.ts`, `room-views.test.ts`, `walk.test.ts`, `e2e-plan.test.ts` | modify | Follow the new layout and data. |
| `e2e/roof.spec.ts` | create (Task 3) | Deep link, contact actions, budget, walk. |
| `e2e/library-roof.spec.ts` | modify (Task 2) | Rover stop coordinates come from the layout. |
| `scripts/e2e-plan.ts` | modify (Task 3) | `roof` spec and its rule. |
| `README.md`, `AGENTS.md`, `docs/superpowers/plans/2026-10-12-rf-roof-revamp.md` | modify or create | Docs. |

Deck coordinates (floor-local, shared by every concept; the follow camera's default view looks north-west):

```
z=-20 +-----------------------------------------------+
      |            [ comms station  -4..8 ]           |   RF:contact pad (2, -12.9), facing north
      |                    (pad)                      |
      |                  .-----.                      |
 shaft| call pad  lead   /       \           (pad)[CV]|   RF:cv pad (14.9, 0), facing east; CV 16..22
 -28  |[-20..-12]=road=( centre  )--spur--> station  |
      |  approach -17   \  (2,0) /    spawn (8,7)     |   plaza: round, 20 u, centre (2, 0)
      |                  '-----'  avail. stop (2,6)   |
      |  [ about board -8..0 ] stop (-4, 12.5)        |
z=20  +-----------------------------------------------+
     x=-20                                         x=22
```

---

## Task 1: RF concepts prototype (owner pick gate)

Task 1 is split into sub-steps 1A to 1I, each with its own test cycle and commit. Everything here is additive: today's RF floor keeps rendering until Task 2.

### Task 1A: Branch, plan copy and the extra roof data

**Files:**
- Create: `docs/superpowers/plans/2026-10-12-rf-roof-revamp.md` (a copy of this plan)
- Modify: `src/experience/types.ts` (interface `RoofData`, at the end of the file)
- Modify: `src/content/experience-floors.ts:1-3` (imports) and `:42-54` (`buildRoofData`)
- Test: `tests/unit/experience-data.test.ts:3` (import) and a new `it` in `describe("buildExperienceData")`

**Interfaces:**
- Consumes: `getProfile()` from `@/content/load` (`profile.timezone: string`, `profile.subheadline: { en, id }`).
- Produces: `RoofData` gains `timezone: string` and `subheadline: string` (locale-resolved). Every scenery and the walk read them.

- [ ] **Step 1: Create the branch and copy the plan**

Run in your working clone of ShinyQ/ShinyQ-HQ (never in the read-only `hq-local` reference clone):

```bash
rtk git switch main && rtk git pull
rtk git switch -c feat/rf-roof-revamp
mkdir -p docs/superpowers/plans
cp /Users/shinyq/.copilot/session-state/d439b68f-b2e6-4b77-9feb-f9099e8cd824/files/plans/r3-f-rf-roof.md docs/superpowers/plans/2026-10-12-rf-roof-revamp.md
```

- [ ] **Step 2: Write the failing test**

In `tests/unit/experience-data.test.ts`, change line 3 to:

```ts
import { getAwards, getCertifications, getContent, getLibrary, getProfile, getPublicRepos, getRoof, getSideProjects, getStats, getYears } from "@/content/load";
```

and add this test right after `it("carries the Roof: availability, email and channels", ...)`:

```ts
  it("carries the Roof about card: timezone and one-line intro", () => {
    const profile = getProfile();
    expect(buildExperienceData("en", names).roof).toMatchObject({ timezone: profile.timezone, subheadline: profile.subheadline.en });
    expect(buildExperienceData("id", names).roof.subheadline).toBe(profile.subheadline.id);
  });
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `bunx vitest run tests/unit/experience-data.test.ts`
Expected: FAIL in "carries the Roof about card" (`expected { availability: ..., email: ..., channels: [...] } to match object { timezone: 'GMT+7', ... }`).

- [ ] **Step 4: Implement**

In `src/experience/types.ts`, replace the `RoofData` interface with:

```ts
/** RF payload for the 3D floor (locale-resolved; the drawer content comes from `room-views/roof.ts`). */
export interface RoofData {
  availability: string;
  email: string;
  channels: { id: "linkedin" | "github" | "huggingface" | "medium" | "googleScholar" | "ieeeXplore"; label: string; href: string }[];
  /** Profile timezone (for example "GMT+7"), shown next to the location on the about card. */
  timezone: string;
  /** One-line intro for the about card (`profile.subheadline`). */
  subheadline: string;
}
```

In `src/content/experience-floors.ts`, change the load import to:

```ts
import { getLibrary, getPosts, getProfile, getRoof } from "./load";
```

and replace `buildRoofData` with:

```ts
/** RF payload for the 3D chunk: availability, the comms channels and the about card's timezone and intro. */
export function buildRoofData(locale: Locale): RoofData {
  const { contact, availability } = getRoof();
  const profile = getProfile();
  const channels = (Object.keys(CHANNEL_LABEL) as (keyof typeof CHANNEL_LABEL)[]).flatMap((id) => {
    const href = contact[id];
    return href ? [{ id, label: CHANNEL_LABEL[id], href }] : [];
  });
  return {
    availability: availability[locale],
    email: contact.email,
    channels,
    timezone: profile.timezone,
    subheadline: profile.subheadline[locale],
  };
}
```

- [ ] **Step 5: Run the test to make sure it passes**

Run: `bunx vitest run tests/unit/experience-data.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 6: Commit**

```bash
rtk git add docs/superpowers/plans/2026-10-12-rf-roof-revamp.md src/experience/types.ts src/content/experience-floors.ts tests/unit/experience-data.test.ts
rtk git commit -m "feat(rf): roof payload carries the timezone and one-line intro; add the RF revamp plan"
```

### Task 1B: The roof deck layout (`buildRoofLayout`)

**Files:**
- Modify: `src/experience/floors/roof/layout.ts` (imports at the top; append a new section at the end; keep every existing export until Task 2)
- Create: `tests/unit/roof-layout.test.ts`

**Interfaces:**
- Consumes: `ROAD`, `Plaza`, `Road`, `RoadNetwork`, `Spur` from `../../nav/road`; `ViewZone` from `../../camera/orbit` (type only); `DoorTrigger`, `FloorLayout`, `Rect`, `Vec2` from `../../types`; the existing local helper `rect(cx, cz, w, d)` in `layout.ts`.
- Produces (used by every later task):
  - `ROOF_DECK` constants (`bounds`, `door`, `approach`, `callPad`, `accent`, `plaza`, `centerpiece`, `comms`, `cv`, `about`, `padInset`, `spurWidth`, `aboutStop`, `availability`, `spawn`, `overviewZoom`).
  - `type RoofStop = "about" | "availability" | "cv" | "contact"`.
  - `interface RoofLayoutInput { channels?: number }`.
  - `interface RoofLayout { floor: FloorLayout; network: RoadNetwork; plaza: Plaza; centerpiece: Rect & { center: Vec2 }; comms: Rect; cv: Rect; about: Rect; stops: Record<RoofStop, Vec2>; channelSlots: Vec2[]; callPad: Rect }`.
  - `buildRoofLayout(input?: RoofLayoutInput): RoofLayout`.
  - `channelSlots(n: number): Vec2[]`.
  - `type RoofActive = "contact" | "cv" | null` and `roofActive(phase: string, room: string | null): RoofActive`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/roof-layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { followPose, forwardOf } from "@/experience/camera/rigs";
import { ROVER } from "@/experience/config";
import { buildRoofLayout, channelSlots, ROOF_DECK, roofActive, type RoofStop } from "@/experience/floors/roof/layout";
import { distanceToRect } from "@/experience/nav/collision";
import { doorAt } from "@/experience/nav/doors";
import { buildNavGrid, findPath, isWalkable } from "@/experience/nav/navgrid";
import { rectGap } from "@/experience/nav/space";
import type { Rect, Vec2 } from "@/experience/types";
import { expectSpaceRules } from "../helpers/space";

const layout = buildRoofLayout();
const { floor } = layout;
const inside = (p: Vec2, r: Rect) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;

describe("RF roof deck layout", () => {
  it("passes the walkable floor space rules whatever the channel count", () => {
    for (const channels of [0, 6, 12]) {
      const l = buildRoofLayout({ channels });
      expectSpaceRules({ bounds: l.floor.bounds, obstacles: l.floor.obstacles, doors: l.floor.doors ?? [], network: l.network, start: l.floor.approach });
    }
  });

  it("keeps today's elevator door and approach, and rolls arrivals on to the spawn", () => {
    expect(floor).toMatchObject({ id: "RF", door: { x: -20, z: 0 }, approach: { x: -17, z: 0 }, accent: ROOF_DECK.accent });
    expect(floor.road).toBe(layout.network);
    expect(floor.arrival).toEqual(floor.spawn);
    expect(floor.spawn).not.toEqual(floor.approach);
  });

  it("keeps the spot in front of the elevator free for the call pad", () => {
    const pad = layout.callPad;
    expect(inside(floor.approach, pad)).toBe(true);
    for (const o of floor.obstacles) expect(rectGap(o, pad)).toBeGreaterThan(0);
    for (const d of floor.doors ?? []) expect(inside(d.at, pad)).toBe(false);
    for (const s of Object.values(layout.stops)) expect(inside(s, pad)).toBe(false);
    expect(inside(floor.spawn, pad)).toBe(false);
  });

  it("opens RF:contact at the comms station and RF:cv at the CV station, pads facing in", () => {
    expect(floor.doors).toEqual([
      { room: "RF:contact", at: layout.stops.contact, facing: { x: 0, z: -1 } },
      { room: "RF:cv", at: layout.stops.cv, facing: { x: 1, z: 0 } },
    ]);
    expect(distanceToRect(layout.stops.contact, layout.comms)).toBeCloseTo(ROOF_DECK.padInset);
    expect(distanceToRect(layout.stops.cv, layout.cv)).toBeCloseTo(ROOF_DECK.padInset);
    const [a, b] = floor.doors!;
    expect(Math.hypot(a.at.x - b.at.x, a.at.z - b.at.z)).toBeGreaterThan(3);
    expect(doorAt(floor.doors, floor.spawn)).toBeNull();
    expect(doorAt(floor.doors, floor.approach)).toBeNull();
    expect(doorAt(floor.doors, layout.stops.about)).toBeNull();
    expect(doorAt(floor.doors, layout.stops.availability)).toBeNull();
  });

  it("reaches every stop and the spawn from the elevator on the navgrid", () => {
    const grid = buildNavGrid(floor, ROVER.radius);
    for (const [name, stop] of Object.entries(layout.stops)) {
      expect(isWalkable(grid, stop), name).toBe(true);
      const path = findPath(grid, floor.approach, stop);
      expect(path?.length, name).toBeGreaterThan(0);
      const end = path![path!.length - 1];
      expect(Math.hypot(end.x - stop.x, end.z - stop.z), name).toBeLessThan(0.75);
    }
    expect(isWalkable(grid, floor.spawn)).toBe(true);
  });

  it("turns the follow camera toward each station at its stop", () => {
    const stations: [RoofStop, Rect][] = [
      ["contact", layout.comms],
      ["cv", layout.cv],
      ["about", layout.about],
      ["availability", layout.centerpiece],
    ];
    for (const [stop, station] of stations) {
      const p = layout.stops[stop];
      const zone = (floor.viewZones ?? []).find((z) => inside(p, z.area));
      expect(zone?.id, stop).toBe(`RF:${stop}`);
      const forward = forwardOf(followPose("desktop", [p.x, 0, p.z], zone!.yaw, zone!.zoom ?? 1));
      const c = { x: (station.minX + station.maxX) / 2 - p.x, z: (station.minZ + station.maxZ) / 2 - p.z };
      const cos = (forward.x * c.x + forward.z * c.z) / Math.hypot(c.x, c.z);
      expect(cos, stop).toBeGreaterThan(0.9);
    }
  });

  it("has view zones that never overlap, with the overview around the spawn", () => {
    const zones = floor.viewZones ?? [];
    for (let i = 0; i < zones.length; i++)
      for (let j = i + 1; j < zones.length; j++) expect(overlaps(zones[i].area, zones[j].area), `${zones[i].id} ${zones[j].id}`).toBe(false);
    expect(zones.find((z) => inside(floor.spawn, z.area))?.id).toBe("RF:overview");
  });

  it("spreads the channel anchors across the comms station", () => {
    expect(channelSlots(0)).toEqual([]);
    expect(channelSlots(1)).toEqual([{ x: 2, z: -17 }]);
    const six = layout.channelSlots;
    expect(six).toHaveLength(6);
    expect(six[0].x).toBeCloseTo(layout.comms.minX + 1);
    expect(six[5].x).toBeCloseTo(layout.comms.maxX - 1);
    for (let i = 1; i < six.length; i++) expect(six[i].x).toBeGreaterThan(six[i - 1].x);
    for (const s of six) expect(inside(s, layout.comms)).toBe(true);
    expect(buildRoofLayout({ channels: 3 }).channelSlots).toHaveLength(3);
  });

  it("maps the open RF room to the scenery state", () => {
    expect(roofActive("room", "RF:contact")).toBe("contact");
    expect(roofActive("room", "RF:cv")).toBe("cv");
    expect(roofActive("explore", "RF:contact")).toBeNull();
    expect(roofActive("room", "L4:talks")).toBeNull();
    expect(roofActive("room", null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `bunx vitest run tests/unit/roof-layout.test.ts`
Expected: FAIL, every test errors with `TypeError: buildRoofLayout is not a function` (or the module has no export `buildRoofLayout`).

- [ ] **Step 3: Implement**

At the top of `src/experience/floors/roof/layout.ts`, replace the two import lines with:

```ts
import type { ViewZone } from "../../camera/orbit";
import { towardPad } from "../../nav/doors";
import { ROAD, type Plaza, type Road, type RoadNetwork, type Spur } from "../../nav/road";
import type { DoorTrigger, FloorLayout, Rect, Vec2 } from "../../types";
```

Append at the end of the file:

```ts
/* ----------------------------------------------------------------- RF revamp: the roof deck */

/**
 * RF roof deck (RF revamp plan). The elevator approach leads east on one road into a round plaza
 * around the centerpiece (telescope, drone cradle or antenna mast, per the picked concept). The
 * stations sit flush with the slab edges, facing the plaza: comms (RF:contact) north, the CV station
 * (RF:cv) east, the about board south-west. Pure (no React or three): the floor layout, the scenery
 * and the "Meet me" walk all read it.
 */
export const ROOF_DECK = {
  bounds: { minX: -20, maxX: 22, minZ: -20, maxZ: 20 },
  door: { x: -20, z: 0 },
  approach: { x: -17, z: 0 },
  /** In front of the elevator: kept free for the elevator call pad (no obstacles, pads, stops, labels or decor). */
  callPad: { minX: -20, maxX: -12, minZ: -4, maxZ: 4 },
  accent: "#60a5fa",
  plaza: { x: 2, z: 0, size: 20 },
  centerpiece: { w: 4, d: 4 },
  comms: { minX: -4, maxX: 8, minZ: -20, maxZ: -14 },
  cv: { minX: 16, maxX: 22, minZ: -3, maxZ: 3 },
  about: { minX: -8, maxX: 0, minZ: 16, maxZ: 20 },
  /** Station front to door pad center. */
  padInset: 1.1,
  spurWidth: 4,
  /** About board front to the rover stop in front of it. */
  aboutStop: 3.5,
  /** Rover stop south of the centerpiece, facing its availability sign. */
  availability: { x: 2, z: 6 },
  /** Deep links spawn here and elevator arrivals roll on here: south-east of the plaza, looking north-west over it. */
  spawn: { x: 8, z: 7 },
  /** Overview zoom at the spawn: the plaza, the comms station and the CV station in frame. */
  overviewZoom: 1.25,
} as const;

export type RoofStop = "about" | "availability" | "cv" | "contact";

export interface RoofLayoutInput {
  /** Contact channels on the comms station (`RoofData.channels.length`, 6 today). Only the anchors depend on it. */
  channels?: number;
}

export interface RoofLayout {
  floor: FloorLayout;
  network: RoadNetwork;
  plaza: Plaza;
  centerpiece: Rect & { center: Vec2 };
  comms: Rect;
  cv: Rect;
  about: Rect;
  /** Where the rover parks: door pads for the rooms, points for the about board and the availability sign. */
  stops: Record<RoofStop, Vec2>;
  /** One anchor per channel across the comms station (x ascending); the scenery picks the height. */
  channelSlots: Vec2[];
  callPad: Rect;
}

/** Which RF room the drawer shows: the scenery "transmits" for contact and "launches" for the CV. */
export type RoofActive = "contact" | "cv" | null;

export function roofActive(phase: string, room: string | null): RoofActive {
  if (phase !== "room") return null;
  return room === "RF:contact" ? "contact" : room === "RF:cv" ? "cv" : null;
}

const plain = (r: Rect): Rect => ({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ });
const centerOf = (r: Rect): Vec2 => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });

/** `n` anchors spread across the comms station, 1 u in from its ends, on its center line. */
export function channelSlots(n: number): Vec2[] {
  const { comms } = ROOF_DECK;
  const z = (comms.minZ + comms.maxZ) / 2;
  if (n <= 0) return [];
  if (n === 1) return [{ x: (comms.minX + comms.maxX) / 2, z }];
  const from = comms.minX + 1;
  const step = (comms.maxX - comms.minX - 2) / (n - 1);
  return Array.from({ length: n }, (_, i) => ({ x: from + i * step, z }));
}

/** The roof deck: floor layout (road, plaza, doors, view zones), stations, stops and channel anchors. */
export function buildRoofLayout({ channels = 6 }: RoofLayoutInput = {}): RoofLayout {
  const D = ROOF_DECK;
  const center: Vec2 = { x: D.plaza.x, z: D.plaza.z };
  const rim = D.plaza.size / 2;
  const plaza: Plaza = { id: "plaza", center, w: D.plaza.size, d: D.plaza.size, round: true };
  const centerpiece = { ...rect(center.x, center.z, D.centerpiece.w, D.centerpiece.d), center };
  const comms = plain(D.comms);
  const cv = plain(D.cv);
  const about = plain(D.about);
  const contactPad: Vec2 = { x: centerOf(comms).x, z: comms.maxZ + D.padInset };
  const cvPad: Vec2 = { x: cv.minX - D.padInset, z: centerOf(cv).z };
  const stops: Record<RoofStop, Vec2> = {
    about: { x: centerOf(about).x, z: about.minZ - D.aboutStop },
    availability: { x: D.availability.x, z: D.availability.z },
    cv: cvPad,
    contact: contactPad,
  };
  const lead: Road = { id: "lead", points: [{ x: D.approach.x, z: D.approach.z }, { x: center.x - rim, z: center.z }], width: ROAD.minWidth };
  const spurs: Spur[] = [
    { room: "RF:contact", from: { x: contactPad.x, z: center.z - rim + 1 }, to: contactPad, width: D.spurWidth, color: D.accent },
    { room: "RF:cv", from: { x: center.x + rim - 1, z: cvPad.z }, to: cvPad, width: D.spurWidth, color: "#22d3ee" },
  ];
  const network: RoadNetwork = { roads: [lead], plazas: [plaza], spurs };
  const doors: DoorTrigger[] = [
    { room: "RF:contact", at: contactPad, facing: { x: 0, z: -1 } },
    { room: "RF:cv", at: cvPad, facing: { x: 1, z: 0 } },
  ];
  const spawn: Vec2 = { x: D.spawn.x, z: D.spawn.z };
  const box = (p: Vec2, r = 2): Rect => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });
  const viewZones: ViewZone[] = [
    // Spawn and arrival: the default south-east angle, zoomed out over the plaza toward the comms station.
    { id: "RF:overview", area: box(spawn, 3), yaw: 0, zoom: D.overviewZoom },
    // Comms (facing south): the camera south of the rover, looking north at the station and the channels above it.
    { id: "RF:contact", area: { minX: comms.minX, maxX: comms.maxX, minZ: contactPad.z - 2, maxZ: contactPad.z + 2 }, yaw: -Math.PI / 4 },
    // CV station (facing west): the camera west of the rover, looking east.
    { id: "RF:cv", area: { minX: cvPad.x - 2, maxX: cv.minX, minZ: cv.minZ, maxZ: cv.maxZ }, yaw: (-3 * Math.PI) / 4 },
    // About board (facing north): the camera north of the rover, looking south.
    { id: "RF:about", area: { minX: about.minX, maxX: about.maxX, minZ: stops.about.z - 2, maxZ: about.minZ }, yaw: (3 * Math.PI) / 4 },
    // Availability sign on the centerpiece (facing south): the camera south of the rover, looking north.
    { id: "RF:availability", area: box(stops.availability), yaw: -Math.PI / 4 },
  ];
  return {
    floor: {
      id: "RF",
      bounds: plain(D.bounds),
      door: { x: D.door.x, z: D.door.z },
      approach: { x: D.approach.x, z: D.approach.z },
      obstacles: [plain(centerpiece), comms, cv, about],
      spawn,
      arrival: spawn,
      accent: D.accent,
      doors,
      road: network,
      viewZones,
    },
    network,
    plaza,
    centerpiece,
    comms,
    cv,
    about,
    stops,
    channelSlots: channelSlots(channels),
    callPad: plain(D.callPad),
  };
}
```

- [ ] **Step 4: Run the test to make sure it passes**

Run: `bunx vitest run tests/unit/roof-layout.test.ts tests/unit/library-roof-layout.test.ts`
Expected: PASS (9 tests in `roof-layout.test.ts`; `library-roof-layout.test.ts` unchanged and green, since today's exports are untouched).

- [ ] **Step 5: Commit**

```bash
rtk git add src/experience/floors/roof/layout.ts tests/unit/roof-layout.test.ts
rtk git commit -m "feat(rf): roof deck layout builder with road, plaza, stations, stops and a free call pad"
```

### Task 1C: Pure scenery geometry (`solids.ts`)

**Files:**
- Create: `src/experience/floors/roof/solids.ts`
- Modify: `src/experience/floors/roof/Sky.tsx:1-19` (use the shared `mulberry32`)
- Create: `tests/unit/roof-solids.test.ts`

**Interfaces:**
- Consumes: `GpuTier`, `Rect`, `Vec2` from `../../types` (types only).
- Produces:
  - `interface Box { x: number; y: number; z: number; w: number; h: number; d: number; yaw?: number }` (`y` is the bottom).
  - `boxBuffers(boxes: readonly Box[]): { positions: Float32Array; normals: Float32Array; indices: Uint32Array }`.
  - `boxEdgeBuffers(boxes: readonly Box[]): Float32Array` (line segment pairs).
  - `latticeSegments(height: number, base: number, top: number, levels: number): Float32Array`.
  - `SKYLINE_GROUND = -56`; `skylineBoxes(count: number, seed?: number): Box[]` (returns `count + 2` boxes); `skylineWindows(boxes: readonly Box[], perBox: number, seed?: number): Float32Array`.
  - `scatter(count: number, area: Rect, reject: (p: Vec2) => boolean, seed?: number, tries?: number): Vec2[]`.
  - `ringPoints(c: Vec2, r: number, n: number): Vec2[]`.
  - `mulberry32(seed: number): () => number`.
  - `interface RoofDetail { skyline: number; windows: number; flowers: number }`; `roofDetail(tier: GpuTier): RoofDetail`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/roof-solids.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  boxBuffers,
  boxEdgeBuffers,
  latticeSegments,
  mulberry32,
  ringPoints,
  roofDetail,
  scatter,
  SKYLINE_GROUND,
  skylineBoxes,
  skylineWindows,
  type Box,
} from "@/experience/floors/roof/solids";

const unit: Box = { x: 0, y: 0, z: 0, w: 2, h: 4, d: 6 };

describe("roof solids", () => {
  it("merges boxes into one indexed buffer with outward normals", () => {
    const { positions, normals, indices } = boxBuffers([unit, { x: 10, y: 1, z: 0, w: 1, h: 1, d: 1 }]);
    expect(positions.length).toBe(2 * 24 * 3);
    expect(normals.length).toBe(positions.length);
    expect(indices.length).toBe(2 * 36);
    expect(Math.max(...indices)).toBe(47);
    for (let v = 0; v < 24; v++) {
      const [x, y, z] = positions.slice(v * 3, v * 3 + 3);
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(4);
      expect(Math.abs(z)).toBeLessThanOrEqual(3);
      const [nx, ny, nz] = normals.slice(v * 3, v * 3 + 3);
      // Every vertex lies on the side its normal points out of.
      expect(x * nx + (y - 2) * ny + z * nz).toBeGreaterThan(0);
    }
  });

  it("winds every face counter-clockwise seen from outside", () => {
    const { positions, normals, indices } = boxBuffers([unit]);
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]].map((i) => positions.slice(i * 3, i * 3 + 3));
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cross = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const n = normals.slice(indices[t] * 3, indices[t] * 3 + 3);
      expect(cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2]).toBeGreaterThan(0);
    }
  });

  it("turns boxes by yaw", () => {
    const { positions } = boxBuffers([{ x: 0, y: 0, z: 0, w: 4, h: 1, d: 1, yaw: Math.PI / 2 }]);
    let maxX = 0;
    let maxZ = 0;
    for (let i = 0; i < positions.length; i += 3) {
      maxX = Math.max(maxX, Math.abs(positions[i]));
      maxZ = Math.max(maxZ, Math.abs(positions[i + 2]));
    }
    expect(maxX).toBeCloseTo(0.5);
    expect(maxZ).toBeCloseTo(2);
  });

  it("draws the 12 edges of every box", () => {
    expect(boxEdgeBuffers([unit, unit]).length).toBe(2 * 12 * 6);
  });

  it("tapers the lattice mast to its top", () => {
    const seg = latticeSegments(14, 1.6, 0.4, 7);
    expect(seg.length).toBe(7 * 72);
    let maxY = 0;
    for (let i = 1; i < seg.length; i += 3) maxY = Math.max(maxY, seg[i]);
    expect(maxY).toBeCloseTo(14);
    for (let i = 0; i < seg.length; i += 3) if (Math.abs(seg[i + 1] - 14) < 1e-6) expect(Math.abs(seg[i])).toBeCloseTo(0.4);
  });

  it("puts the skyline far outside the slab, below the roof's eye line, the same every time", () => {
    const boxes = skylineBoxes(32);
    expect(boxes).toHaveLength(34);
    for (const b of boxes) {
      expect(Math.hypot(b.x, b.z)).toBeGreaterThan(70);
      expect(b.y).toBeGreaterThanOrEqual(SKYLINE_GROUND);
      expect(b.y + b.h).toBeLessThan(12);
    }
    expect(skylineBoxes(32)).toEqual(boxes);
    expect(skylineWindows(boxes, 3)).toHaveLength(34 * 3 * 3);
  });

  it("scatters seeded points that respect the reject rule", () => {
    const area = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
    const pts = scatter(40, area, (p) => p.x < 5);
    expect(pts.length).toBe(40);
    for (const p of pts) expect(p.x).toBeGreaterThanOrEqual(5);
    expect(scatter(40, area, (p) => p.x < 5)).toEqual(pts);
    expect(scatter(5, area, () => true)).toEqual([]);
  });

  it("places ring points and seeds a stable random sequence", () => {
    const ring = ringPoints({ x: 2, z: 0 }, 8, 4);
    expect(ring[0].x).toBeCloseTo(10);
    expect(ring[1].z).toBeCloseTo(8);
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect([a(), a()]).toEqual([b(), b()]);
  });

  it("keeps the lite tier lighter than the full tier", () => {
    const full = roofDetail("full");
    const lite = roofDetail("lite");
    for (const key of Object.keys(full) as (keyof typeof full)[]) expect(lite[key]).toBeLessThanOrEqual(full[key]);
    expect(lite.flowers).toBeLessThan(full.flowers);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `bunx vitest run tests/unit/roof-solids.test.ts`
Expected: FAIL with `Failed to load url @/experience/floors/roof/solids` (module does not exist).

- [ ] **Step 3: Implement**

Create `src/experience/floors/roof/solids.ts`:

```ts
import type { GpuTier, Rect, Vec2 } from "../../types";

/**
 * Pure geometry for the roof scenery (no three): merged boxes and their edges (one draw call each
 * for all the solids of a scenery), the antenna lattice, the far skyline and seeded scatter.
 * Vitest runs it in node.
 */

/** A box standing on `y` (its bottom), centered on (x, z), turned by `yaw` around the vertical axis. */
export interface Box {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  yaw?: number;
}

type V3 = readonly [number, number, number];

/** Unit cube faces: outward normal and four corners (x, y, z in -1 or 1), counter-clockwise from outside. */
const FACES: readonly { n: V3; v: readonly V3[] }[] = [
  { n: [1, 0, 0], v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];

const CORNERS: readonly V3[] = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, -1, 1],
  [-1, -1, 1],
  [-1, 1, -1],
  [1, 1, -1],
  [1, 1, 1],
  [-1, 1, 1],
];
const EDGES: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

function place(b: Box, [sx, sy, sz]: V3): [number, number, number] {
  const lx = (sx * b.w) / 2;
  const ly = ((sy + 1) / 2) * b.h;
  const lz = (sz * b.d) / 2;
  const c = Math.cos(b.yaw ?? 0);
  const s = Math.sin(b.yaw ?? 0);
  return [b.x + lx * c + lz * s, b.y + ly, b.z - lx * s + lz * c];
}

/** Every box as 6 faces of 4 vertices (flat normals), merged into one indexed buffer. */
export function boxBuffers(boxes: readonly Box[]): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const positions = new Float32Array(boxes.length * 24 * 3);
  const normals = new Float32Array(boxes.length * 24 * 3);
  const indices = new Uint32Array(boxes.length * 36);
  let v = 0;
  let i = 0;
  for (const b of boxes) {
    const c = Math.cos(b.yaw ?? 0);
    const s = Math.sin(b.yaw ?? 0);
    for (const face of FACES) {
      const base = v;
      const [nx, ny, nz] = face.n;
      for (const corner of face.v) {
        positions.set(place(b, corner), v * 3);
        normals.set([nx * c + nz * s, ny, -nx * s + nz * c], v * 3);
        v += 1;
      }
      indices.set([base, base + 1, base + 2, base, base + 2, base + 3], i);
      i += 6;
    }
  }
  return { positions, normals, indices };
}

/** The 12 edges of every box as line segment pairs (xyz, xyz). */
export function boxEdgeBuffers(boxes: readonly Box[]): Float32Array {
  const out = new Float32Array(boxes.length * EDGES.length * 6);
  let o = 0;
  for (const b of boxes)
    for (const [a, c] of EDGES) {
      out.set(place(b, CORNERS[a]), o);
      out.set(place(b, CORNERS[c]), o + 3);
      o += 6;
    }
  return out;
}

/**
 * A square lattice mast as line segment pairs: four corner legs tapering from `base` to `top` half
 * width, and at every level a ring and one diagonal brace per face.
 */
export function latticeSegments(height: number, base: number, top: number, levels: number): Float32Array {
  const out: number[] = [];
  const corner = (k: number, half: number, y: number): number[] => [(k === 0 || k === 3 ? -1 : 1) * half, y, (k < 2 ? -1 : 1) * half];
  for (let i = 0; i < levels; i++) {
    const y0 = (height * i) / levels;
    const y1 = (height * (i + 1)) / levels;
    const h0 = base + ((top - base) * i) / levels;
    const h1 = base + ((top - base) * (i + 1)) / levels;
    for (let k = 0; k < 4; k++) {
      const n = (k + 1) % 4;
      out.push(...corner(k, h0, y0), ...corner(k, h1, y1));
      out.push(...corner(k, h1, y1), ...corner(n, h1, y1));
      out.push(...corner(k, h0, y0), ...corner(n, h1, y1));
    }
  }
  return new Float32Array(out);
}

/** Deterministic PRNG so screenshots and tests see the same scenery. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Street level under the roof, in roof floor coordinates (the roof sits 56 u up). */
export const SKYLINE_GROUND = -56;

/** Far city silhouettes on a ring 75 to 110 u around the tower, tops below the roof's eye line, plus a slim obelisk to the north-west. */
export function skylineBoxes(count: number, seed = 3): Box[] {
  const rand = mulberry32(seed);
  const boxes: Box[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.08;
    const r = 75 + rand() * 35;
    boxes.push({ x: Math.cos(a) * r, y: SKYLINE_GROUND, z: Math.sin(a) * r, w: 6 + rand() * 10, h: 26 + rand() * 35, d: 6 + rand() * 8, yaw: -a });
  }
  boxes.push({ x: -70, y: SKYLINE_GROUND, z: -62, w: 3, h: 60, d: 3 }, { x: -70, y: SKYLINE_GROUND + 60, z: -62, w: 1.2, h: 4, d: 1.2 });
  return boxes;
}

/** Lit windows on the side of each skyline box that faces the tower (points, xyz). */
export function skylineWindows(boxes: readonly Box[], perBox: number, seed = 9): Float32Array {
  const rand = mulberry32(seed);
  const out: number[] = [];
  for (const b of boxes) {
    const len = Math.hypot(b.x, b.z) || 1;
    const nx = -b.x / len;
    const nz = -b.z / len;
    const half = Math.min(b.w, b.d) / 2;
    for (let k = 0; k < perBox; k++) {
      const u = (rand() - 0.5) * half * 1.6;
      const y = b.y + 2 + rand() * Math.max(0, b.h - 4);
      out.push(b.x + nx * (half + 0.2) - nz * u, y, b.z + nz * (half + 0.2) + nx * u);
    }
  }
  return new Float32Array(out);
}

/** Up to `count` seeded points in `area` that `reject` does not refuse (decor such as floor lights). */
export function scatter(count: number, area: Rect, reject: (p: Vec2) => boolean, seed = 5, tries = count * 20): Vec2[] {
  const rand = mulberry32(seed);
  const out: Vec2[] = [];
  for (let t = 0; t < tries && out.length < count; t++) {
    const p = { x: area.minX + rand() * (area.maxX - area.minX), z: area.minZ + rand() * (area.maxZ - area.minZ) };
    if (!reject(p)) out.push(p);
  }
  return out;
}

/** `n` points on a circle of radius `r` around `c`, starting east and turning toward +z. */
export function ringPoints(c: Vec2, r: number, n: number): Vec2[] {
  return Array.from({ length: n }, (_, i) => ({ x: c.x + Math.cos((i / n) * Math.PI * 2) * r, z: c.z + Math.sin((i / n) * Math.PI * 2) * r }));
}

/** How much decor each tier draws (the lite tier also drops additive glow and icon halos in the components). */
export interface RoofDetail {
  skyline: number;
  windows: number;
  flowers: number;
}

export function roofDetail(tier: GpuTier): RoofDetail {
  return tier === "full" ? { skyline: 56, windows: 6, flowers: 90 } : { skyline: 32, windows: 3, flowers: 40 };
}
```

In `src/experience/floors/roof/Sky.tsx`, delete the local `mulberry32` function (the doc comment and the function, lines 10 to 19) and add this import after the other imports:

```ts
import { mulberry32 } from "./solids";
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `bunx vitest run tests/unit/roof-solids.test.ts && bun run typecheck`
Expected: 9 tests PASS; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
rtk git add src/experience/floors/roof/solids.ts src/experience/floors/roof/Sky.tsx tests/unit/roof-solids.test.ts
rtk git commit -m "feat(rf): pure roof scenery geometry (merged boxes, lattice, skyline, scatter, tier detail)"
```

### Task 1D: Roof station icons

**Files:**
- Modify: `src/experience/fx/holoIcons.ts` (append after `CAREER_ICONS`)
- Create: `tests/unit/roof-icons.test.ts`

**Interfaces:**
- Consumes: the local `open`, `shut`, `arc` helpers and `Stroke` type in `holoIcons.ts`.
- Produces: `type RoofIcon = "email" | "cv" | "about" | "signal"`; `ROOF_ICONS: Record<RoofIcon, Stroke[]>` (24 x 24 grid), consumed by `HoloIcon strokes={ROOF_ICONS.email}`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/roof-icons.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { iconMesh, iconPath, ROOF_ICONS } from "@/experience/fx/holoIcons";

describe("roof station icons", () => {
  it("has line art for email, CV, about and signal inside the 24 x 24 grid", () => {
    expect(Object.keys(ROOF_ICONS).sort()).toEqual(["about", "cv", "email", "signal"]);
    for (const strokes of Object.values(ROOF_ICONS)) {
      expect(strokes.length).toBeGreaterThan(1);
      for (const s of strokes)
        for (const [x, y] of s.points) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(24);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(24);
        }
    }
  });

  it("turns into ribbons and SVG paths like the career icons", () => {
    for (const strokes of Object.values(ROOF_ICONS)) {
      expect(iconMesh(strokes, { size: 2 }).indices.length).toBeGreaterThan(0);
      expect(iconPath(strokes)).toMatch(/^M/);
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `bunx vitest run tests/unit/roof-icons.test.ts`
Expected: FAIL with `TypeError: Cannot convert undefined or null to object` (no `ROOF_ICONS` export).

- [ ] **Step 3: Implement**

Append to `src/experience/fx/holoIcons.ts`, right after the closing `};` of `CAREER_ICONS`:

```ts
/** Roof station icons (RF revamp), same 24 x 24 line-art grid as the career icons. */
export type RoofIcon = "email" | "cv" | "about" | "signal";

export const ROOF_ICONS: Record<RoofIcon, Stroke[]> = {
  // Email: envelope with its flap.
  email: [shut([3, 6], [21, 6], [21, 18], [3, 18]), open([3, 6], [12, 13], [21, 6])],
  // CV: page with a folded corner and three text lines.
  cv: [shut([6, 3], [15, 3], [19, 7], [19, 21], [6, 21]), open([15, 3], [15, 7], [19, 7]), open([9, 11], [16, 11]), open([9, 14], [16, 14]), open([9, 17], [13, 17])],
  // About: head and shoulders.
  about: [shut(...arc(12, 8, 4, 0, Math.PI * 2, 12).slice(0, -1)), open(...arc(12, 21, 7, Math.PI, Math.PI * 2, 10))],
  // Signal: a mast on a tripod with two waves.
  signal: [
    open([12, 22], [12, 10]),
    open([8, 22], [12, 15], [16, 22]),
    open(...arc(12, 9, 4, -Math.PI * 0.85, -Math.PI * 0.15, 6)),
    open(...arc(12, 9, 7.5, -Math.PI * 0.85, -Math.PI * 0.15, 8)),
  ],
};
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `bunx vitest run tests/unit/roof-icons.test.ts tests/unit/holo-icons.test.ts`
Expected: PASS (both files).

- [ ] **Step 5: Commit**

```bash
rtk git add src/experience/fx/holoIcons.ts tests/unit/roof-icons.test.ts
rtk git commit -m "feat(rf): neon line icons for the roof stations"
```

### Task 1E: One draw call for all labels (`BatchedLabels`)

**Files:**
- Create: `src/experience/fx/labelProps.ts`
- Create: `src/experience/fx/BatchedLabels.tsx`
- Modify: `src/types/troika-three-text.d.ts` (whole file)
- Create: `tests/unit/label-props.test.ts`

**Interfaces:**
- Consumes: troika `BatchedText` and `Text` (packed into one draw call; members keep their own font, size, color and local transform; WebGL2 needed, which the 3D tier already requires).
- Produces:
  - `interface BatchedLabel { text: string; position: [number, number, number]; yaw?: number; tilt?: number; font: string; fontSize: number; color: string; anchorX?: "left" | "center" | "right"; anchorY?: "top" | "middle" | "bottom"; textAlign?: "left" | "center" | "right"; maxWidth?: number; lineHeight?: number; letterSpacing?: number }`.
  - `applyLabel(target: LabelTarget, label: BatchedLabel): void`.
  - `<BatchedLabels labels={BatchedLabel[]} name?="labels" />`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/label-props.test.ts`:

```ts
import { Object3D } from "three";
import { describe, expect, it } from "vitest";
import { applyLabel, type LabelTarget } from "@/experience/fx/labelProps";

function target(): LabelTarget {
  return Object.assign(new Object3D(), {
    text: "",
    font: null as string | null,
    fontSize: 0.1,
    color: null as string | number | null,
    anchorX: "left" as LabelTarget["anchorX"],
    anchorY: "top" as LabelTarget["anchorY"],
    textAlign: "left" as LabelTarget["textAlign"],
    maxWidth: Infinity,
    lineHeight: "normal" as LabelTarget["lineHeight"],
    letterSpacing: 0,
  });
}

describe("applyLabel", () => {
  it("copies text, font, size, color and layout, with centered defaults", () => {
    const t = target();
    applyLabel(t, { text: "Hello", position: [1, 2, 3], font: "/fonts/a.woff", fontSize: 0.3, color: "#fff" });
    expect(t).toMatchObject({ text: "Hello", font: "/fonts/a.woff", fontSize: 0.3, color: "#fff", anchorX: "center", anchorY: "middle", textAlign: "left", maxWidth: Infinity, lineHeight: "normal", letterSpacing: 0 });
    expect(t.position.toArray()).toEqual([1, 2, 3]);
    expect(t.rotation.toArray()).toEqual([0, 0, 0, "YXZ"]);
  });

  it("turns by yaw first, then leans back by tilt", () => {
    const t = target();
    applyLabel(t, { text: "x", position: [0, 0, 0], font: "f", fontSize: 1, color: "#000", yaw: Math.PI / 2, tilt: 0.3, maxWidth: 4, textAlign: "center", lineHeight: 1.2, letterSpacing: 0.1 });
    expect(t.rotation.order).toBe("YXZ");
    expect(t.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(t.rotation.x).toBeCloseTo(-0.3);
    expect(t).toMatchObject({ maxWidth: 4, textAlign: "center", lineHeight: 1.2, letterSpacing: 0.1 });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `bunx vitest run tests/unit/label-props.test.ts`
Expected: FAIL with `Failed to load url @/experience/fx/labelProps`.

- [ ] **Step 3: Implement**

Create `src/experience/fx/labelProps.ts`:

```ts
import type { Object3D } from "three";

/** One in-world label for `BatchedLabels` (all labels of a floor in one draw call). */
export interface BatchedLabel {
  text: string;
  /** Relative to the `BatchedLabels` group. */
  position: [number, number, number];
  /** Radians around the vertical axis; 0 faces +z. Batched labels cannot billboard. */
  yaw?: number;
  /** Lean back (radians), for console screens. */
  tilt?: number;
  font: string;
  fontSize: number;
  color: string;
  anchorX?: "left" | "center" | "right";
  anchorY?: "top" | "middle" | "bottom";
  textAlign?: "left" | "center" | "right";
  maxWidth?: number;
  lineHeight?: number;
  letterSpacing?: number;
}

/** The troika `Text` fields `applyLabel` writes (a plain object in tests). */
export interface LabelTarget extends Pick<Object3D, "position" | "rotation"> {
  text: string;
  font: string | null;
  fontSize: number;
  color: string | number | null;
  anchorX: "left" | "center" | "right";
  anchorY: "top" | "middle" | "bottom";
  textAlign: "left" | "center" | "right";
  maxWidth: number;
  lineHeight: number | "normal";
  letterSpacing: number;
}

/** Copies a label onto a troika `Text`: troika's defaults except a centered anchor. */
export function applyLabel(t: LabelTarget, l: BatchedLabel): void {
  t.text = l.text;
  t.font = l.font;
  t.fontSize = l.fontSize;
  t.color = l.color;
  t.anchorX = l.anchorX ?? "center";
  t.anchorY = l.anchorY ?? "middle";
  t.textAlign = l.textAlign ?? "left";
  t.maxWidth = l.maxWidth ?? Infinity;
  t.lineHeight = l.lineHeight ?? "normal";
  t.letterSpacing = l.letterSpacing ?? 0;
  t.position.set(l.position[0], l.position[1], l.position[2]);
  t.rotation.set(l.tilt ? -l.tilt : 0, l.yaw ?? 0, 0, "YXZ");
}
```

Replace `src/types/troika-three-text.d.ts` with:

```ts
// troika-three-text ships no type entry for its ESM build. We use configureTextBuilder, patch
// GlyphsGeometry's instanceCount (src/experience/text-config.ts) and batch labels with BatchedText
// (src/experience/fx/BatchedLabels.tsx).
declare module "troika-three-text" {
  import type { InstancedBufferGeometry, Material, Mesh } from "three";

  export function configureTextBuilder(config: { useWorker?: boolean; defaultFontURL?: string; sdfGlyphSize?: number; textureWidth?: number }): void;
  export class GlyphsGeometry extends InstancedBufferGeometry {
    updateGlyphs(glyphBounds: Float32Array, glyphAtlasIndices: Float32Array, blockBounds: number[], chunkedBounds?: unknown[], glyphColors?: Uint8Array): void;
  }
  export class Text extends Mesh {
    text: string;
    font: string | null;
    fontSize: number;
    color: string | number | null;
    // Narrowed to the values this repo uses (troika also accepts numbers and percentages).
    anchorX: "left" | "center" | "right";
    anchorY: "top" | "middle" | "bottom";
    textAlign: "left" | "right" | "center";
    maxWidth: number;
    lineHeight: number | "normal";
    letterSpacing: number;
    material: Material;
    sync(callback?: () => void): void;
    dispose(): void;
  }
  export class BatchedText extends Text {
    addText(text: Text): void;
    removeText(text: Text): void;
  }
}
```

Create `src/experience/fx/BatchedLabels.tsx`:

```tsx
"use client";

import { useEffect, useMemo } from "react";
import { MeshBasicMaterial } from "three";
import { BatchedText, Text } from "troika-three-text";
import { applyLabel, type BatchedLabel } from "./labelProps";

/**
 * All labels of a floor in one draw call: a troika `BatchedText` packs every member's glyphs, font,
 * color and transform (relative to this group) into one mesh. Members cannot billboard, so give each
 * label a fixed `yaw` toward where it is read from. Not raycast: wrap clickable signs in a `HitBox`.
 */
export function BatchedLabels({ labels, name = "labels" }: { labels: readonly BatchedLabel[]; name?: string }) {
  const { batch, base } = useMemo(() => {
    const base = new MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false });
    const batch = new BatchedText();
    batch.material = base;
    batch.raycast = () => undefined;
    return { batch, base };
  }, []);

  useEffect(() => {
    const members = labels.map((label) => {
      const text = new Text();
      applyLabel(text, label);
      batch.addText(text);
      return text;
    });
    batch.sync();
    return () => {
      for (const text of members) {
        batch.removeText(text);
        text.dispose();
      }
    };
  }, [batch, labels]);

  useEffect(
    () => () => {
      batch.dispose();
      base.dispose();
    },
    [batch, base],
  );

  return <primitive object={batch} name={name} />;
}
```

- [ ] **Step 4: Run the tests, typecheck and lint**

Run: `bunx vitest run tests/unit/label-props.test.ts && bun run typecheck && bun run lint`
Expected: 2 tests PASS; typecheck and lint exit 0.

- [ ] **Step 5: Commit**

```bash
rtk git add src/experience/fx/labelProps.ts src/experience/fx/BatchedLabels.tsx src/types/troika-three-text.d.ts tests/unit/label-props.test.ts
rtk git commit -m "feat(3d): BatchedLabels draws every label of a floor in one call (troika BatchedText)"
```

### Task 1F: Shared scenery kit (`kit.tsx`)

**Files:**
- Create: `src/experience/floors/roof/kit.tsx`

**Interfaces:**
- Consumes: `boxBuffers`, `boxEdgeBuffers`, `Box` (Task 1C); `RoofLayout`, `RoofActive` (Task 1B); `BatchedLabel` (Task 1E); `roomHandlers` from `../interact`; `neonColor` from `../../fx/materials`; `useUniformTime` from `../../fx/useUniformTime`; `FONTS` from `../../tower/primitives`.
- Produces (every scenery and `Roof.tsx` use these exact names):
  - `ROOF_BLUE = "#60a5fa"`, `ROOF_CYAN = "#22d3ee"`, `ROOF_VIOLET = "#a78bfa"`.
  - `CHANNEL_TONE: Record<RoofData["channels"][number]["id"], string>`.
  - `interface RoofLabels { comms: string; email: string; cvTitle: string; cvHint: string; about: string; availability: string }`.
  - `interface RoofSceneryProps { layout: RoofLayout; roof: RoofData; profile: ExperienceData["profile"]; labels: RoofLabels; tier: GpuTier; reducedMotion: boolean; active: RoofActive }`.
  - `<MergedBoxes boxes color emissive? emissiveIntensity? />` (1 draw call), `<MergedEdges boxes color tier opacity? />` (1 draw call).
  - `interface PulseSource { x: number; y: number; z: number; color: string; phase?: number }`; `<PulseRings sources radius? grow? speed? tier reducedMotion />` (1 instanced draw call, frozen under reduced motion).
  - `<HitBox rect room h y? />` (invisible, no draw call; click drives to the room and opens it).
  - `aboutCard(at: { x: number; z: number; top: number; yaw: number; width: number }, profile, roof, labels): BatchedLabel[]`.

- [ ] **Step 1: Write the kit**

Create `src/experience/floors/roof/kit.tsx`:

```tsx
"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  NormalBlending,
  Object3D,
  RingGeometry,
  ShaderMaterial,
  type InstancedMesh,
} from "three";
import type { RoomId } from "@/content/schema";
import type { BatchedLabel } from "../../fx/labelProps";
import { neonColor } from "../../fx/materials";
import { useUniformTime } from "../../fx/useUniformTime";
import { FONTS } from "../../tower/primitives";
import type { ExperienceData, GpuTier, Rect, RoofData } from "../../types";
import { roomHandlers } from "../interact";
import type { RoofActive, RoofLayout } from "./layout";
import { boxBuffers, boxEdgeBuffers, type Box } from "./solids";

/** RF accent (FLOOR_COLOR.RF) and the station tints. */
export const ROOF_BLUE = "#60a5fa";
export const ROOF_CYAN = "#22d3ee";
export const ROOF_VIOLET = "#a78bfa";

/** One neon hue per contact channel (decor only, never a brand mark). */
export const CHANNEL_TONE: Record<RoofData["channels"][number]["id"], string> = {
  linkedin: "#38bdf8",
  github: "#e5e7eb",
  huggingface: "#fbbf24",
  medium: "#34d399",
  googleScholar: "#60a5fa",
  ieeeXplore: "#22d3ee",
};

/** In-world strings (messages, resolved by Experience). */
export interface RoofLabels {
  comms: string;
  email: string;
  cvTitle: string;
  cvHint: string;
  about: string;
  availability: string;
}

/** What every roof scenery (concept) gets. */
export interface RoofSceneryProps {
  layout: RoofLayout;
  roof: RoofData;
  profile: ExperienceData["profile"];
  labels: RoofLabels;
  tier: GpuTier;
  reducedMotion: boolean;
  /** RF room open in the drawer: the scenery transmits (contact) or launches (cv). */
  active: RoofActive;
}

/** All the solid boxes of a scenery in one mesh (one draw call). */
export function MergedBoxes({ boxes, color, emissive = "#000000", emissiveIntensity = 0 }: { boxes: readonly Box[]; color: string; emissive?: string; emissiveIntensity?: number }) {
  const geometry = useMemo(() => {
    const { positions, normals, indices } = boxBuffers(boxes);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("normal", new BufferAttribute(normals, 3));
    g.setIndex(new BufferAttribute(indices, 1));
    return g;
  }, [boxes]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} raycast={() => null}>
      <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissiveIntensity} roughness={0.7} metalness={0.2} />
    </mesh>
  );
}

/** Neon outlines of all the boxes in one line mesh (one draw call), boosted on the full tier so they bloom. */
export function MergedEdges({ boxes, color, tier, opacity = 0.85 }: { boxes: readonly Box[]; color: string; tier: GpuTier; opacity?: number }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(boxEdgeBuffers(boxes), 3));
    return g;
  }, [boxes]);
  const neon = useMemo(() => neonColor(color, 1.4, tier), [color, tier]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial color={neon} transparent opacity={opacity} toneMapped={false} />
    </lineSegments>
  );
}

export interface PulseSource {
  x: number;
  y: number;
  z: number;
  color: string;
  /** 0 to 1 offset in the pulse cycle (default: spread evenly). */
  phase?: number;
}

const PULSE_VS = `attribute vec3 aColor; attribute float aPhase;
uniform float uTime; uniform float uPulse; uniform float uSpeed; uniform float uGrow;
varying vec3 vColor; varying float vAlpha;
void main(){
  float k = mix(.35, fract(uTime*uSpeed + aPhase), uPulse);
  vColor = aColor; vAlpha = (1. - k)*mix(.6, 1., uPulse);
  vec3 p = position*(1. + k*uGrow);
  gl_Position = projectionMatrix*modelViewMatrix*instanceMatrix*vec4(p, 1.);
}`;
const PULSE_FS = `varying vec3 vColor; varying float vAlpha; void main(){ gl_FragColor = vec4(vColor, vAlpha*.8);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

/**
 * Flat signal rings that grow and fade from each source (one instanced draw call). Reduced motion
 * holds every ring still at a third of its growth; the lite tier blends normally instead of adding.
 */
export function PulseRings({ sources, radius = 0.6, grow = 4, speed = 0.5, tier, reducedMotion }: { sources: readonly PulseSource[]; radius?: number; grow?: number; speed?: number; tier: GpuTier; reducedMotion: boolean }) {
  const geometry = useMemo(() => {
    const g = new RingGeometry(radius, radius + 0.12, 40);
    g.rotateX(-Math.PI / 2);
    g.setAttribute("aColor", new InstancedBufferAttribute(new Float32Array(sources.flatMap((s) => new Color(s.color).toArray())), 3));
    g.setAttribute("aPhase", new InstancedBufferAttribute(new Float32Array(sources.map((s, i) => s.phase ?? i / Math.max(1, sources.length))), 1));
    return g;
  }, [sources, radius]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uPulse: { value: reducedMotion ? 0 : 1 }, uSpeed: { value: speed }, uGrow: { value: grow } },
        vertexShader: PULSE_VS,
        fragmentShader: PULSE_FS,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: tier === "full" ? AdditiveBlending : NormalBlending,
      }),
    [reducedMotion, speed, grow, tier],
  );
  const materials = useMemo(() => [material], [material]);
  useUniformTime(materials);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new Object3D();
    sources.forEach((s, i) => {
      o.position.set(s.x, s.y, s.z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [sources, geometry, material]);
  if (!sources.length) return null;
  return <instancedMesh ref={mesh} args={[geometry, material, sources.length]} frustumCulled={false} raycast={() => null} />;
}

/** Invisible click target over a station (three raycasts hidden meshes; it costs no draw call): drives there and opens the room. */
export function HitBox({ rect, room, h, y = 0 }: { rect: Rect; room: RoomId; h: number; y?: number }) {
  return (
    <mesh position={[(rect.minX + rect.maxX) / 2, y + h / 2, (rect.minZ + rect.maxZ) / 2]} visible={false} {...roomHandlers(room)}>
      <boxGeometry args={[rect.maxX - rect.minX, h, rect.maxZ - rect.minZ]} />
    </mesh>
  );
}

/** The about card rows, top to bottom from `top`: eyebrow, name, headline, role, location and timezone, one-line intro. */
export function aboutCard(
  at: { x: number; z: number; top: number; yaw: number; width: number },
  profile: RoofSceneryProps["profile"],
  roof: RoofData,
  labels: RoofLabels,
): BatchedLabel[] {
  const row = (text: string, dy: number, font: string, fontSize: number, color: string, extra: Partial<BatchedLabel> = {}): BatchedLabel => ({
    text,
    position: [at.x, at.top - dy, at.z],
    yaw: at.yaw,
    font,
    fontSize,
    color,
    maxWidth: at.width,
    textAlign: "center",
    ...extra,
  });
  return [
    row(labels.about.toUpperCase(), 0, FONTS.mono, 0.16, ROOF_BLUE, { letterSpacing: 0.14 }),
    row(profile.name, 0.45, FONTS.sansBold, 0.4, "#f8fafc"),
    row(profile.headline, 1.0, FONTS.sans, 0.22, "#e0e7ff"),
    row(profile.role, 1.4, FONTS.mono, 0.15, "#c7d2fe"),
    row(`${profile.location} · ${roof.timezone}`, 1.75, FONTS.mono, 0.15, "#c7d2fe"),
    row(roof.subheadline, 2.2, FONTS.sans, 0.19, "#cbd5e1", { lineHeight: 1.25 }),
  ];
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: both exit 0 (the kit has no node test: it is R3F; Task 1H renders it in the harness).

- [ ] **Step 3: Commit**

```bash
rtk git add src/experience/floors/roof/kit.tsx
rtk git commit -m "feat(rf): roof scenery kit (merged solids and edges, pulse rings, hit boxes, about card)"
```

### Task 1G: The three concept sceneries

**Files:**
- Create: `src/experience/floors/roof/concepts/Observatory.tsx`
- Create: `src/experience/floors/roof/concepts/Helipad.tsx`
- Create: `src/experience/floors/roof/concepts/SignalGarden.tsx`

**Interfaces:**
- Consumes: everything from Task 1F (`RoofSceneryProps`, `MergedBoxes`, `MergedEdges`, `PulseRings`, `HitBox`, `aboutCard`, `ROOF_BLUE`, `ROOF_CYAN`, `ROOF_VIOLET`, `CHANNEL_TONE`), Task 1C (`Box`, `boxBuffers`, `latticeSegments`, `skylineBoxes`, `skylineWindows`, `scatter`, `ringPoints`, `roofDetail`), Task 1D (`ROOF_ICONS`), Task 1E (`BatchedLabels`, `BatchedLabel`), `HoloIcon` (`strokes`, `instances: { x, y, z, face }[]`, `color`, `size`, `tier`, `reducedMotion`), `ROAD.minWidth`.
- Produces: `Observatory`, `Helipad`, `SignalGarden`, each `(props: RoofSceneryProps) => JSX.Element`. Draw calls on the lite tier (scenery only, without road markings and sky): Observatory 14, Helipad 11 (12 while a room is open), Signal Garden 11. Today's RF content is about 70.

Shared conventions in all three files: stations stay inside their layout rects (they are the navgrid obstacles); nothing is placed inside `layout.callPad`; text yaw 0 faces south (the plaza and the default camera), `-Math.PI / 2` faces west (CV station), `Math.PI` faces north (about board); `HoloIcon` `face` uses the same angles.

- [ ] **Step 1: Write concept A, the Rooftop Observatory**

Create `src/experience/floors/roof/concepts/Observatory.tsx`:

```tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, NormalBlending, Object3D, type Group, type InstancedMesh } from "three";
import { BatchedLabels } from "../../../fx/BatchedLabels";
import { HoloIcon } from "../../../fx/HoloIcon";
import { ROOF_ICONS } from "../../../fx/holoIcons";
import type { BatchedLabel } from "../../../fx/labelProps";
import { FONTS } from "../../../tower/primitives";
import type { GpuTier, Vec2 } from "../../../types";
import { aboutCard, HitBox, MergedBoxes, MergedEdges, PulseRings, ROOF_BLUE, ROOF_CYAN, ROOF_VIOLET, type PulseSource, type RoofSceneryProps } from "../kit";
import type { RoofActive } from "../layout";
import { boxBuffers, roofDetail, skylineBoxes, skylineWindows, type Box } from "../solids";

const mid = (a: number, b: number) => (a + b) / 2;

/** Far city silhouettes and their lit windows (two draw calls, no fog so they read on the horizon). */
function Skyline({ tier }: { tier: GpuTier }) {
  const detail = roofDetail(tier);
  const { body, windows } = useMemo(() => {
    const boxes = skylineBoxes(detail.skyline);
    const { positions, normals, indices } = boxBuffers(boxes);
    const body = new BufferGeometry();
    body.setAttribute("position", new BufferAttribute(positions, 3));
    body.setAttribute("normal", new BufferAttribute(normals, 3));
    body.setIndex(new BufferAttribute(indices, 1));
    const windows = new BufferGeometry();
    windows.setAttribute("position", new BufferAttribute(skylineWindows(boxes, detail.windows), 3));
    return { body, windows };
  }, [detail.skyline, detail.windows]);
  useEffect(
    () => () => {
      body.dispose();
      windows.dispose();
    },
    [body, windows],
  );
  return (
    <group name="skyline">
      <mesh geometry={body} raycast={() => null}>
        <meshBasicMaterial color="#0d1236" fog={false} />
      </mesh>
      <points geometry={windows} raycast={() => null}>
        <pointsMaterial color="#fbbf24" size={2} sizeAttenuation={false} transparent opacity={0.75} fog={false} depthWrite={false} toneMapped={false} />
      </points>
    </group>
  );
}

/** Telescope on the central pier: sweeps the sky, swings to the dish while the comms room is open (still under reduced motion). */
function Telescope({ at, tier, reducedMotion, active }: { at: Vec2; tier: GpuTier; reducedMotion: boolean; active: RoofActive }) {
  const yaw = useRef<Group>(null);
  useFrame((state) => {
    const g = yaw.current;
    if (!g) return;
    const sweep = reducedMotion ? 0.6 : 0.6 + Math.sin(state.clock.elapsedTime * 0.12) * 1.1;
    const target = active === "contact" ? Math.PI : sweep;
    g.rotation.y += (target - g.rotation.y) * (reducedMotion ? 1 : 0.04);
  });
  return (
    <group position={[at.x, 2.8, at.z]} name="telescope">
      <group ref={yaw}>
        <group rotation={[-0.55, 0, 0]}>
          <mesh position={[0, 0, 1]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
            <cylinderGeometry args={[0.32, 0.42, 3.2, 16]} />
            <meshStandardMaterial color="#1e293b" emissive={ROOF_BLUE} emissiveIntensity={0.35} roughness={0.5} metalness={0.4} />
          </mesh>
          <mesh position={[0, 0, 16.6]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
            <cylinderGeometry args={[2.4, 0.3, 28, 20, 1, true]} />
            <meshBasicMaterial color={ROOF_BLUE} transparent opacity={tier === "full" ? 0.12 : 0.08} blending={tier === "full" ? AdditiveBlending : NormalBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** The comms dish, opening up toward the plaza; it transmits (faster, wider rings) while the comms room is open. */
function Dish({ at, tier, reducedMotion, active }: { at: Vec2; tier: GpuTier; reducedMotion: boolean; active: RoofActive }) {
  const rings = useMemo<PulseSource[]>(
    () => [
      { x: 0, y: 1.2, z: 0.4, color: ROOF_BLUE, phase: 0 },
      { x: 0, y: 1.2, z: 0.4, color: ROOF_BLUE, phase: 0.5 },
    ],
    [],
  );
  const sending = active === "contact";
  return (
    <group position={[at.x, 2.2, at.z]} name="dish">
      <mesh rotation={[Math.PI + 0.5, 0, 0]} raycast={() => null}>
        <sphereGeometry args={[1.7, 24, 6, 0, Math.PI * 2, 0, Math.PI * 0.32]} />
        <meshStandardMaterial color="#1e293b" emissive={ROOF_BLUE} emissiveIntensity={0.3} side={DoubleSide} roughness={0.6} metalness={0.5} />
      </mesh>
      <PulseRings sources={rings} radius={0.5} grow={sending ? 7 : 3} speed={sending ? 1.2 : 0.35} tier={tier} reducedMotion={reducedMotion} />
    </group>
  );
}

/** One star per contact channel above the comms station, joined in a line (two draw calls). */
function Constellation({ stars, tier }: { stars: readonly { x: number; y: number; z: number }[]; tier: GpuTier }) {
  const mesh = useRef<InstancedMesh>(null);
  const lines = useMemo(() => {
    const pts: number[] = [];
    for (let i = 1; i < stars.length; i++) pts.push(stars[i - 1].x, stars[i - 1].y, stars[i - 1].z, stars[i].x, stars[i].y, stars[i].z);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pts), 3));
    return g;
  }, [stars]);
  useEffect(() => () => lines.dispose(), [lines]);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new Object3D();
    stars.forEach((s, i) => {
      o.position.set(s.x, s.y, s.z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [stars]);
  if (!stars.length) return null;
  return (
    <group name="constellation">
      <instancedMesh ref={mesh} args={[undefined, undefined, stars.length]} raycast={() => null}>
        <octahedronGeometry args={[0.3, 0]} />
        <meshBasicMaterial color="#dbeafe" toneMapped={false} />
      </instancedMesh>
      <lineSegments geometry={lines} raycast={() => null}>
        <lineBasicMaterial color={ROOF_BLUE} transparent opacity={tier === "full" ? 0.7 : 0.5} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

/**
 * Concept A, "Rooftop Observatory": a night deck. A telescope sweeps the sky from the central pier
 * (its plate shows the availability), the comms dish transmits under a constellation of the contact
 * channels, a CV log lectern faces the plaza from the east, and a star chart carries the about card.
 * Far skyline silhouettes ring the tower.
 */
export function Observatory({ layout, roof, profile, labels, tier, reducedMotion, active }: RoofSceneryProps) {
  const scene = useMemo(() => {
    const { centerpiece: cp, comms, cv, about } = layout;
    const commsX = mid(comms.minX, comms.maxX);
    const commsZ = mid(comms.minZ, comms.maxZ);
    const cvZ = mid(cv.minZ, cv.maxZ);
    const aboutX = mid(about.minX, about.maxX);
    const plateZ = cp.maxZ - 0.06;
    const solids: Box[] = [
      { x: cp.center.x, y: 0, z: cp.center.z, w: 4, h: 0.6, d: 4 },
      { x: cp.center.x, y: 0.6, z: cp.center.z, w: 1.2, h: 2.2, d: 1.2 },
      { x: cp.center.x, y: 0.9, z: plateZ, w: 3.8, h: 1.5, d: 0.08 },
      { x: commsX, y: 0, z: comms.maxZ - 1, w: 10, h: 1, d: 1.4 },
      { x: commsX, y: 0, z: commsZ - 1, w: 1.4, h: 2.2, d: 1.4 },
      { x: cv.minX + 1.2, y: 0, z: cvZ, w: 1.6, h: 1.2, d: 3.2 },
      { x: cv.maxX - 0.6, y: 0, z: cvZ, w: 0.4, h: 3.4, d: 5 },
      { x: aboutX, y: 0, z: about.minZ + 0.8, w: 7.6, h: 3.8, d: 0.4 },
    ];
    const stars = layout.channelSlots.map((s, i) => ({ x: s.x, y: 8.6 + (i % 2) * 1.4, z: s.z + 0.5 }));
    const text: BatchedLabel[] = [
      { text: labels.availability.toUpperCase(), position: [cp.center.x, 2.2, plateZ + 0.05], font: FONTS.mono, fontSize: 0.14, color: ROOF_BLUE, letterSpacing: 0.12 },
      { text: roof.availability, position: [cp.center.x, 1.55, plateZ + 0.05], font: FONTS.sansBold, fontSize: 0.19, color: "#eff6ff", maxWidth: 3.5, textAlign: "center", lineHeight: 1.2 },
      { text: labels.email.toUpperCase(), position: [commsX, 0.78, comms.maxZ - 0.28], font: FONTS.mono, fontSize: 0.14, color: ROOF_BLUE, letterSpacing: 0.12 },
      { text: roof.email, position: [commsX, 0.45, comms.maxZ - 0.28], font: FONTS.monoBold, fontSize: 0.24, color: "#dbeafe" },
      { text: labels.comms.toUpperCase(), position: [commsX, 11.6, commsZ + 0.5], font: FONTS.monoBold, fontSize: 0.42, color: ROOF_BLUE, letterSpacing: 0.14 },
      ...stars.map((s, i): BatchedLabel => ({ text: roof.channels[i]?.label ?? "", position: [s.x, s.y - 0.6, s.z], font: FONTS.sansBold, fontSize: 0.3, color: "#e0e7ff" })),
      { text: labels.cvTitle.toUpperCase(), position: [cv.maxX - 0.82, 2.7, cvZ], yaw: -Math.PI / 2, font: FONTS.monoBold, fontSize: 0.3, color: ROOF_CYAN, letterSpacing: 0.1 },
      { text: labels.cvHint, position: [cv.maxX - 0.82, 2.2, cvZ], yaw: -Math.PI / 2, font: FONTS.mono, fontSize: 0.17, color: "#cffafe", maxWidth: 4.4, textAlign: "center" },
      ...aboutCard({ x: aboutX, z: about.minZ + 0.56, top: 3.4, yaw: Math.PI, width: 7 }, profile, roof, labels),
    ];
    const icons = {
      email: [{ x: commsX, y: 2.4, z: comms.maxZ - 1, face: 0 }],
      cv: [{ x: cv.minX + 1.2, y: 2.3, z: cvZ, face: -Math.PI / 2 }],
      about: [{ x: aboutX, y: 4.8, z: about.minZ + 0.8, face: Math.PI }],
    };
    return { solids, stars, text, icons, dish: { x: commsX, z: commsZ - 1 } };
  }, [layout, roof, profile, labels]);

  return (
    <group name="roof-observatory">
      <Skyline tier={tier} />
      <MergedBoxes boxes={scene.solids} color="#0b0b18" emissive={ROOF_BLUE} emissiveIntensity={0.08} />
      <MergedEdges boxes={scene.solids} color={ROOF_BLUE} tier={tier} />
      <Telescope at={layout.centerpiece.center} tier={tier} reducedMotion={reducedMotion} active={active} />
      <Dish at={scene.dish} tier={tier} reducedMotion={reducedMotion} active={active} />
      <Constellation stars={scene.stars} tier={tier} />
      <BatchedLabels labels={scene.text} name="roof-labels" />
      <HoloIcon strokes={ROOF_ICONS.email} instances={scene.icons.email} color={ROOF_BLUE} size={1.6} tier={tier} reducedMotion={reducedMotion} />
      <HoloIcon strokes={ROOF_ICONS.cv} instances={scene.icons.cv} color={ROOF_CYAN} size={1.6} tier={tier} reducedMotion={reducedMotion} />
      <HoloIcon strokes={ROOF_ICONS.about} instances={scene.icons.about} color={ROOF_VIOLET} size={1.6} tier={tier} reducedMotion={reducedMotion} />
      <HitBox rect={layout.comms} h={4} room="RF:contact" />
      <HitBox rect={layout.comms} y={7.5} h={4} room="RF:contact" />
      <HitBox rect={layout.cv} h={3.6} room="RF:cv" />
    </group>
  );
}
```

- [ ] **Step 2: Write concept B, the Helipad Launch Deck**

Create `src/experience/floors/roof/concepts/Helipad.tsx`:

```tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, BufferAttribute, BufferGeometry, DoubleSide, InstancedBufferAttribute, Object3D, ShaderMaterial, type Group, type InstancedMesh } from "three";
import { BatchedLabels } from "../../../fx/BatchedLabels";
import { HoloIcon } from "../../../fx/HoloIcon";
import { ROOF_ICONS } from "../../../fx/holoIcons";
import type { BatchedLabel } from "../../../fx/labelProps";
import { neonColor } from "../../../fx/materials";
import { useUniformTime } from "../../../fx/useUniformTime";
import { FONTS } from "../../../tower/primitives";
import type { GpuTier, Vec2 } from "../../../types";
import { aboutCard, CHANNEL_TONE, HitBox, MergedBoxes, MergedEdges, PulseRings, ROOF_BLUE, ROOF_CYAN, ROOF_VIOLET, type PulseSource, type RoofSceneryProps } from "../kit";
import type { RoofActive } from "../layout";
import { ringPoints, type Box } from "../solids";

const mid = (a: number, b: number) => (a + b) / 2;
const AMBER = "#fbbf24";

const CHASE_VS = `attribute float aPhase; uniform float uTime; uniform float uChase; varying float vGlow;
void main(){ float k = fract(aPhase - uTime*.35); vGlow = mix(.7, .25 + .75*pow(1. - k, 6.), uChase);
  gl_Position = projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position, 1.); }`;
const CHASE_FS = `uniform vec3 uColor; varying float vGlow; void main(){ gl_FragColor = vec4(uColor*vGlow, 1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

/** Runway lights round the pad: one instanced draw, a light running round it (steady under reduced motion). */
function PadLights({ points, tier, reducedMotion }: { points: readonly Vec2[]; tier: GpuTier; reducedMotion: boolean }) {
  const geometry = useMemo(() => {
    const g = new BoxGeometry(0.35, 0.12, 0.35);
    g.setAttribute("aPhase", new InstancedBufferAttribute(new Float32Array(points.map((_, i) => i / points.length)), 1));
    return g;
  }, [points]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uChase: { value: reducedMotion ? 0 : 1 }, uColor: { value: neonColor(AMBER, tier === "full" ? 1.8 : 1, tier) } },
        vertexShader: CHASE_VS,
        fragmentShader: CHASE_FS,
      }),
    [reducedMotion, tier],
  );
  const materials = useMemo(() => [material], [material]);
  useUniformTime(materials);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new Object3D();
    points.forEach((p, i) => {
      o.position.set(p.x, 0.06, p.z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [points, geometry, material]);
  return <instancedMesh ref={mesh} args={[geometry, material, points.length]} frustumCulled={false} raycast={() => null} />;
}

/** The drone: hovers over its cradle and lifts off carrying the email or the CV icon while that room is open. */
function Drone({ at, active, tier, reducedMotion }: { at: Vec2; active: RoofActive; tier: GpuTier; reducedMotion: boolean }) {
  const group = useRef<Group>(null);
  const rotors = useRef<InstancedMesh>(null);
  const body = useMemo<Box[]>(
    () => [
      { x: 0, y: 0, z: 0, w: 1.4, h: 0.45, d: 1.4 },
      { x: 0, y: 0.18, z: 0, w: 3.6, h: 0.1, d: 0.22, yaw: Math.PI / 4 },
      { x: 0, y: 0.18, z: 0, w: 3.6, h: 0.1, d: 0.22, yaw: -Math.PI / 4 },
    ],
    [],
  );
  const icon = useMemo(() => [{ x: 0, y: 1.9, z: 0, face: 0 }], []);
  useLayoutEffect(() => {
    const m = rotors.current;
    if (!m) return;
    const o = new Object3D();
    [[1.27, 1.27], [-1.27, 1.27], [1.27, -1.27], [-1.27, -1.27]].forEach(([x, z], i) => {
      o.position.set(x, 0.32, z);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, []);
  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const lift = active ? 5 : 1.9;
    const y = lift + (reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 1.6) * 0.12);
    g.position.y = reducedMotion ? y : g.position.y + (y - g.position.y) * Math.min(1, dt * 2.5);
    if (!reducedMotion && active) g.rotation.y += dt * 0.6;
  });
  return (
    <group ref={group} position={[at.x, 1.9, at.z]} name="drone">
      <MergedBoxes boxes={body} color="#111827" emissive={ROOF_BLUE} emissiveIntensity={0.3} />
      <instancedMesh ref={rotors} args={[undefined, undefined, 4]} raycast={() => null}>
        <circleGeometry args={[0.62, 20]} />
        <meshBasicMaterial color={ROOF_BLUE} transparent opacity={0.45} depthWrite={false} side={DoubleSide} toneMapped={false} />
      </instancedMesh>
      {active && <HoloIcon strokes={active === "cv" ? ROOF_ICONS.cv : ROOF_ICONS.email} instances={icon} color={active === "cv" ? ROOF_CYAN : ROOF_BLUE} size={1.4} tier={tier} reducedMotion={reducedMotion} />}
    </group>
  );
}

/**
 * Concept B, "Helipad Launch Deck": the plaza is a landing pad with an "H" and runway lights running
 * round it. A drone hovers over the central cradle (its status board shows the availability) and
 * lifts off with the email or the CV when you open them. A beacon tower per contact channel pulses
 * in its own hue on the comms station, the CV sits in a hangar facing the pad, and a departures
 * board carries the about card.
 */
export function Helipad({ layout, roof, profile, labels, tier, reducedMotion, active }: RoofSceneryProps) {
  const scene = useMemo(() => {
    const { centerpiece: cp, comms, cv, about } = layout;
    const c = cp.center;
    const commsX = mid(comms.minX, comms.maxX);
    const commsZ = mid(comms.minZ, comms.maxZ);
    const cvX = mid(cv.minX, cv.maxX);
    const cvZ = mid(cv.minZ, cv.maxZ);
    const aboutX = mid(about.minX, about.maxX);
    const solids: Box[] = [
      { x: c.x, y: 0, z: c.z, w: 4, h: 0.4, d: 4 },
      { x: c.x, y: 0.4, z: cp.maxZ - 0.15, w: 3.6, h: 1.2, d: 0.1 },
      { x: commsX, y: 0, z: commsZ, w: 12, h: 0.4, d: 6 },
      ...layout.channelSlots.map((s): Box => ({ x: s.x, y: 0.4, z: s.z, w: 0.5, h: 4.6, d: 0.5 })),
      { x: commsX, y: 0.4, z: comms.maxZ - 0.8, w: 6, h: 0.9, d: 1 },
      { x: cvX + 0.5, y: 0, z: cvZ, w: 5, h: 3.2, d: 5.6 },
      { x: cv.minX + 0.95, y: 0.8, z: cvZ, w: 0.08, h: 1.9, d: 4 },
      { x: aboutX - 3.2, y: 0, z: about.minZ + 1, w: 0.3, h: 2, d: 0.3 },
      { x: aboutX + 3.2, y: 0, z: about.minZ + 1, w: 0.3, h: 2, d: 0.3 },
      { x: aboutX, y: 2, z: about.minZ + 1, w: 7.6, h: 2.6, d: 0.3 },
    ];
    const beacons: PulseSource[] = layout.channelSlots.map((s, i) => ({ x: s.x, y: 5.2, z: s.z, color: CHANNEL_TONE[roof.channels[i]?.id ?? "googleScholar"] }));
    const text: BatchedLabel[] = [
      { text: labels.availability.toUpperCase(), position: [c.x, 1.35, cp.maxZ - 0.09], font: FONTS.mono, fontSize: 0.13, color: AMBER, letterSpacing: 0.12 },
      { text: roof.availability, position: [c.x, 0.9, cp.maxZ - 0.09], font: FONTS.sansBold, fontSize: 0.15, color: "#fef3c7", maxWidth: 3.4, textAlign: "center", lineHeight: 1.15 },
      { text: labels.comms.toUpperCase(), position: [commsX, 7, commsZ], font: FONTS.monoBold, fontSize: 0.42, color: ROOF_BLUE, letterSpacing: 0.14 },
      ...layout.channelSlots.map((s, i): BatchedLabel => ({ text: roof.channels[i]?.label ?? "", position: [s.x, 5.9, s.z + 0.4], font: FONTS.sansBold, fontSize: 0.28, color: "#e0e7ff" })),
      { text: labels.email.toUpperCase(), position: [commsX, 1.08, comms.maxZ - 0.28], font: FONTS.mono, fontSize: 0.14, color: ROOF_BLUE, letterSpacing: 0.12 },
      { text: roof.email, position: [commsX, 0.75, comms.maxZ - 0.28], font: FONTS.monoBold, fontSize: 0.24, color: "#dbeafe" },
      { text: labels.cvTitle.toUpperCase(), position: [cv.minX + 0.89, 2.2, cvZ], yaw: -Math.PI / 2, font: FONTS.monoBold, fontSize: 0.3, color: ROOF_CYAN, letterSpacing: 0.1 },
      { text: labels.cvHint, position: [cv.minX + 0.89, 1.6, cvZ], yaw: -Math.PI / 2, font: FONTS.mono, fontSize: 0.17, color: "#cffafe", maxWidth: 3.6, textAlign: "center" },
      ...aboutCard({ x: aboutX, z: about.minZ + 0.83, top: 4.25, yaw: Math.PI, width: 7.2 }, profile, roof, labels),
    ];
    const marks: number[] = [];
    const y = 0.06;
    const ring = ringPoints(c, 8, 48);
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length];
      marks.push(p.x, y, p.z, q.x, y, q.z);
    });
    marks.push(c.x - 3, y, c.z - 3.5, c.x - 3, y, c.z + 3.5, c.x + 3, y, c.z - 3.5, c.x + 3, y, c.z + 3.5, c.x - 3, y, c.z, c.x + 3, y, c.z);
    const icons = {
      email: [{ x: commsX, y: 2.6, z: comms.maxZ - 0.8, face: 0 }],
      cv: [{ x: cvX + 0.5, y: 4.6, z: cvZ, face: -Math.PI / 2 }],
      about: [{ x: aboutX, y: 5.6, z: about.minZ + 1, face: Math.PI }],
    };
    return { solids, beacons, text, marks: new Float32Array(marks), lights: ringPoints(c, 9.4, 24), icons };
  }, [layout, roof, profile, labels]);

  const marks = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(scene.marks, 3));
    return g;
  }, [scene.marks]);
  useEffect(() => () => marks.dispose(), [marks]);
  const sending = active === "contact";

  return (
    <group name="roof-helipad">
      <MergedBoxes boxes={scene.solids} color="#0b0b18" emissive={ROOF_BLUE} emissiveIntensity={0.08} />
      <MergedEdges boxes={scene.solids} color={ROOF_BLUE} tier={tier} />
      <lineSegments geometry={marks} raycast={() => null}>
        <lineBasicMaterial color={AMBER} transparent opacity={0.8} toneMapped={false} />
      </lineSegments>
      <PadLights points={scene.lights} tier={tier} reducedMotion={reducedMotion} />
      <Drone at={layout.centerpiece.center} active={active} tier={tier} reducedMotion={reducedMotion} />
      <PulseRings sources={scene.beacons} radius={0.35} grow={sending ? 5 : 2.5} speed={sending ? 1.1 : 0.45} tier={tier} reducedMotion={reducedMotion} />
      <BatchedLabels labels={scene.text} name="roof-labels" />
      <HoloIcon strokes={ROOF_ICONS.email} instances={scene.icons.email} color={ROOF_BLUE} size={1.6} tier={tier} reducedMotion={reducedMotion} />
      <HoloIcon strokes={ROOF_ICONS.cv} instances={scene.icons.cv} color={ROOF_CYAN} size={1.6} tier={tier} reducedMotion={reducedMotion} />
      <HoloIcon strokes={ROOF_ICONS.about} instances={scene.icons.about} color={ROOF_VIOLET} size={1.6} tier={tier} reducedMotion={reducedMotion} />
      <HitBox rect={layout.comms} h={6} room="RF:contact" />
      <HitBox rect={layout.cv} h={3.4} room="RF:cv" />
    </group>
  );
}
```

- [ ] **Step 3: Write concept C, the Signal Garden**

Create `src/experience/floors/roof/concepts/SignalGarden.tsx`:

```tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, NormalBlending, Object3D, type InstancedMesh, type MeshBasicMaterial } from "three";
import { BatchedLabels } from "../../../fx/BatchedLabels";
import { HoloIcon } from "../../../fx/HoloIcon";
import { ROOF_ICONS } from "../../../fx/holoIcons";
import type { BatchedLabel } from "../../../fx/labelProps";
import { neonColor } from "../../../fx/materials";
import { ROAD } from "../../../nav/road";
import { FONTS } from "../../../tower/primitives";
import type { GpuTier, Vec2 } from "../../../types";
import { aboutCard, CHANNEL_TONE, HitBox, MergedBoxes, MergedEdges, PulseRings, ROOF_BLUE, ROOF_CYAN, ROOF_VIOLET, type PulseSource, type RoofSceneryProps } from "../kit";
import { latticeSegments, roofDetail, scatter, type Box } from "../solids";

const mid = (a: number, b: number) => (a + b) / 2;
const MAST_HEIGHT = 14;

/** The lattice antenna mast on the plaza (one line draw call). */
function Mast({ at, tier }: { at: Vec2; tier: GpuTier }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(latticeSegments(MAST_HEIGHT, 1.6, 0.35, 7), 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const neon = useMemo(() => neonColor(ROOF_BLUE, 1.5, tier), [tier]);
  return (
    <lineSegments geometry={geometry} position={[at.x, 0.5, at.z]} raycast={() => null}>
      <lineBasicMaterial color={neon} transparent opacity={0.9} toneMapped={false} />
    </lineSegments>
  );
}

/** Neon glow behind the availability sign: a slow breath, still under reduced motion. */
function SignGlow({ at, tier, reducedMotion }: { at: [number, number, number]; tier: GpuTier; reducedMotion: boolean }) {
  const material = useRef<MeshBasicMaterial>(null);
  useFrame((state) => {
    if (!material.current) return;
    material.current.opacity = reducedMotion ? 0.22 : 0.18 + Math.sin(state.clock.elapsedTime * 1.3) * 0.06;
  });
  return (
    <mesh position={at} raycast={() => null}>
      <planeGeometry args={[6, 2.2]} />
      <meshBasicMaterial ref={material} color={ROOF_BLUE} transparent opacity={0.22} blending={tier === "full" ? AdditiveBlending : NormalBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** Glowing floor lights in the channel hues, flat on the deck (one instanced draw call). */
function Flowers({ spots, tier }: { spots: readonly Vec2[]; tier: GpuTier }) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new Object3D();
    const color = new Color();
    const tones = Object.values(CHANNEL_TONE);
    spots.forEach((p, i) => {
      o.position.set(p.x, 0.04, p.z);
      o.rotation.set(-Math.PI / 2, 0, (i * 2.4) % (Math.PI * 2));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, color.set(tones[i % tones.length]));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [spots]);
  if (!spots.length) return null;
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, spots.length]} raycast={() => null}>
      <circleGeometry args={[0.24, 5]} />
      <meshBasicMaterial transparent opacity={tier === "full" ? 0.9 : 0.75} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

/**
 * Concept C, "Signal Garden / Comms Tower": a lattice mast rises from the plaza with signal rings at
 * its top and the availability as a neon sign. The comms station is a garden of small antennas, one
 * per contact channel, each ringing in its own hue (faster while the comms room is open); glowing
 * floor lights dot the deck. The CV sits at a kiosk facing the plaza and the about card is a story
 * wall with a bench in front.
 */
export function SignalGarden({ layout, roof, profile, labels, tier, reducedMotion, active }: RoofSceneryProps) {
  const detail = roofDetail(tier);
  const scene = useMemo(() => {
    const { centerpiece: cp, comms, cv, about } = layout;
    const c = cp.center;
    const commsX = mid(comms.minX, comms.maxX);
    const commsZ = mid(comms.minZ, comms.maxZ);
    const cvZ = mid(cv.minZ, cv.maxZ);
    const aboutX = mid(about.minX, about.maxX);
    const signZ = c.z + 1.5;
    const solids: Box[] = [
      { x: c.x, y: 0, z: c.z, w: 4, h: 0.5, d: 4 },
      { x: c.x, y: 4.2, z: signZ, w: 5.6, h: 1.8, d: 0.12 },
      { x: commsX, y: 0, z: commsZ, w: 12, h: 0.3, d: 6 },
      ...layout.channelSlots.map((s): Box => ({ x: s.x, y: 0.3, z: s.z, w: 0.25, h: 2.6, d: 0.25 })),
      { x: commsX, y: 0.3, z: comms.maxZ - 0.8, w: 6, h: 0.9, d: 1 },
      { x: cv.minX + 2, y: 0, z: cvZ, w: 2.4, h: 1.3, d: 4 },
      { x: cv.minX + 3.4, y: 1.3, z: cvZ, w: 0.2, h: 2.2, d: 4 },
      { x: aboutX, y: 0, z: about.maxZ - 0.6, w: 7.6, h: 3.4, d: 0.4 },
      { x: aboutX, y: 0, z: about.minZ + 0.9, w: 5, h: 0.5, d: 1.2 },
    ];
    const mastRings: PulseSource[] = [0, 1 / 3, 2 / 3].map((phase) => ({ x: c.x, y: MAST_HEIGHT + 0.6, z: c.z, color: ROOF_BLUE, phase }));
    const channelRings: PulseSource[] = layout.channelSlots.map((s, i) => ({ x: s.x, y: 3.0, z: s.z, color: CHANNEL_TONE[roof.channels[i]?.id ?? "googleScholar"] }));
    const text: BatchedLabel[] = [
      { text: labels.availability.toUpperCase(), position: [c.x, 5.6, signZ + 0.08], font: FONTS.mono, fontSize: 0.16, color: ROOF_BLUE, letterSpacing: 0.14 },
      { text: roof.availability, position: [c.x, 4.95, signZ + 0.08], font: FONTS.sansBold, fontSize: 0.24, color: "#eff6ff", maxWidth: 5.2, textAlign: "center", lineHeight: 1.2 },
      { text: labels.comms.toUpperCase(), position: [commsX, 5, commsZ], font: FONTS.monoBold, fontSize: 0.4, color: ROOF_BLUE, letterSpacing: 0.14 },
      ...layout.channelSlots.map((s, i): BatchedLabel => ({ text: roof.channels[i]?.label ?? "", position: [s.x, 3.6, s.z + 0.2], font: FONTS.sansBold, fontSize: 0.26, color: "#e0e7ff" })),
      { text: labels.email.toUpperCase(), position: [commsX, 0.98, comms.maxZ - 0.28], font: FONTS.mono, fontSize: 0.14, color: ROOF_BLUE, letterSpacing: 0.12 },
      { text: roof.email, position: [commsX, 0.65, comms.maxZ - 0.28], font: FONTS.monoBold, fontSize: 0.24, color: "#dbeafe" },
      { text: labels.cvTitle.toUpperCase(), position: [cv.minX + 3.28, 3.0, cvZ], yaw: -Math.PI / 2, font: FONTS.monoBold, fontSize: 0.3, color: ROOF_CYAN, letterSpacing: 0.1 },
      { text: labels.cvHint, position: [cv.minX + 3.28, 2.4, cvZ], yaw: -Math.PI / 2, font: FONTS.mono, fontSize: 0.17, color: "#cffafe", maxWidth: 3.6, textAlign: "center" },
      ...aboutCard({ x: aboutX, z: about.maxZ - 0.82, top: 3.1, yaw: Math.PI, width: 7 }, profile, roof, labels),
    ];
    const b = layout.floor.bounds;
    const pad = layout.callPad;
    const plazaR = layout.plaza.w / 2;
    const near = (p: Vec2, r: { minX: number; maxX: number; minZ: number; maxZ: number }, m: number) => p.x > r.minX - m && p.x < r.maxX + m && p.z > r.minZ - m && p.z < r.maxZ + m;
    const spots = scatter(
      detail.flowers,
      { minX: b.minX + 1, maxX: b.maxX - 1, minZ: b.minZ + 1, maxZ: b.maxZ - 1 },
      (p) =>
        near(p, pad, 1) ||
        (p.x < c.x && Math.abs(p.z - c.z) < ROAD.minWidth / 2 + 1) ||
        Math.hypot(p.x - c.x, p.z - c.z) < plazaR + 0.5 ||
        layout.floor.obstacles.some((o) => near(p, o, 0.5)) ||
        Object.values(layout.stops).some((s) => Math.hypot(p.x - s.x, p.z - s.z) < 2.5),
    );
    const icons = {
      email: [{ x: commsX, y: 2.4, z: comms.maxZ - 0.8, face: 0 }],
      cv: [{ x: cv.minX + 3.4, y: 4.4, z: cvZ, face: -Math.PI / 2 }],
      about: [{ x: aboutX, y: 4.6, z: about.maxZ - 0.6, face: Math.PI }],
    };
    return { solids, mastRings, channelRings, text, spots, icons, sign: [c.x, 5.1, signZ + 0.07] as [number, number, number] };
  }, [layout, roof, profile, labels, detail.flowers]);
  const sending = active === "contact";

  return (
    <group name="roof-signal-garden">
      <MergedBoxes boxes={scene.solids} color="#0b0b18" emissive={ROOF_BLUE} emissiveIntensity={0.08} />
      <MergedEdges boxes={scene.solids} color={ROOF_BLUE} tier={tier} />
      <Mast at={layout.centerpiece.center} tier={tier} />
      <PulseRings sources={scene.mastRings} radius={0.8} grow={sending ? 12 : 8} speed={sending ? 0.8 : 0.3} tier={tier} reducedMotion={reducedMotion} />
      <PulseRings sources={scene.channelRings} radius={0.3} grow={sending ? 5 : 3} speed={sending ? 1.3 : 0.5} tier={tier} reducedMotion={reducedMotion} />
      <SignGlow at={scene.sign} tier={tier} reducedMotion={reducedMotion} />
      <Flowers spots={scene.spots} tier={tier} />
      <BatchedLabels labels={scene.text} name="roof-labels" />
      <HoloIcon strokes={ROOF_ICONS.email} instances={scene.icons.email} color={ROOF_BLUE} size={1.6} tier={tier} reducedMotion={reducedMotion} />
      <HoloIcon strokes={ROOF_ICONS.cv} instances={scene.icons.cv} color={ROOF_CYAN} size={1.6} tier={tier} reducedMotion={reducedMotion} />
      <HoloIcon strokes={ROOF_ICONS.about} instances={scene.icons.about} color={ROOF_VIOLET} size={1.6} tier={tier} reducedMotion={reducedMotion} />
      <HitBox rect={layout.comms} h={4} room="RF:contact" />
      <HitBox rect={layout.cv} h={3.6} room="RF:cv" />
    </group>
  );
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: both exit 0. If lint flags `react-hooks/exhaustive-deps` on a `useLayoutEffect` that reads a ref, keep the deps shown above (they list the inputs that rebuild the mesh) and do not add the ref.

- [ ] **Step 5: Commit**

```bash
rtk git add src/experience/floors/roof/concepts
rtk git commit -m "feat(rf): three roof concepts (observatory, helipad launch deck, signal garden) on the shared deck"
```

### Task 1H: Dev-only concepts route (`/{locale}/dev/roof`)

**Files:**
- Modify: `messages/en.json` and `messages/id.json` (`hud.world`: add `about` and `availability` after `cvHint`)
- Create: `src/experience/prototype/roof/RoofConcepts.tsx`
- Create: `src/experience/prototype/roof/RoofConceptsLoader.tsx`
- Create: `src/app/[locale]/dev/roof/page.dev.tsx`

**Interfaces:**
- Consumes: Tasks 1B to 1G; today's `Roof` from `src/experience/floors/Roof.tsx` (signature `{ roof, labels: { beacon, comms, email, cvTitle, cvHint }, tier }`) as the "current" baseline; `followPose`, `zoneAt`, `cameraClass`, `sceneSettings`, `Rover`, `roverRuntime`, `GridFloor`, `RoadMarkings`, `FloorLine`, `SHAFT`, `spaceViolations`.
- Produces: the route `/{locale}/dev/roof?concept=current|observatory|helipad|garden&at=spawn|availability|about|cv|contact&view=rover|top&tier=full|lite&active=contact|cv&rm=1&ui=0`. The root `div[data-testid="roof-concepts"]` gets `data-ready="1"` after 60 rendered frames and `data-draw-calls` / `data-triangles` (all render passes of the last frame) every 30 frames; Task 1I waits on and reads them.
- Message keys `hud.world.about` and `hud.world.availability` (used by `RoofLabels` from here on).

- [ ] **Step 1: Add the two in-world strings**

In `messages/en.json`, inside `"hud" > "world"`, change `"cvHint": "Open the CV viewer"` to:

```json
      "cvHint": "Open the CV viewer",
      "about": "About me",
      "availability": "Availability"
```

In `messages/id.json`, inside `"hud" > "world"`, change `"cvHint": "Buka penampil CV"` to:

```json
      "cvHint": "Buka penampil CV",
      "about": "Tentang saya",
      "availability": "Ketersediaan"
```

Run: `bunx vitest run tests/content`
Expected: PASS (message key parity, fonts coverage and the safety lint accept the new strings).

- [ ] **Step 2: Write the harness**

Create `src/experience/prototype/roof/RoofConcepts.tsx`:

```tsx
"use client";

import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useMemo, useRef, useState, type JSX, type RefObject } from "react";
import { ACESFilmicToneMapping, type PerspectiveCamera } from "three";
import { cameraClass } from "@/lib/viewport";
import { getHQStore } from "@/store/useHQStore";
import "../../text-config";
import { zoneAt, type ViewZone } from "../../camera/orbit";
import { followPose } from "../../camera/rigs";
import { SHAFT } from "../../config";
import { Roof as CurrentRoof } from "../../floors/Roof";
import { Helipad } from "../../floors/roof/concepts/Helipad";
import { Observatory } from "../../floors/roof/concepts/Observatory";
import { SignalGarden } from "../../floors/roof/concepts/SignalGarden";
import type { RoofLabels, RoofSceneryProps } from "../../floors/roof/kit";
import { buildRoofLayout, ROOF_DECK, type RoofActive, type RoofStop } from "../../floors/roof/layout";
import { Sky } from "../../floors/roof/Sky";
import { GridFloor } from "../../fx/GridFloor";
import { RoadMarkings } from "../../fx/RoadMarkings";
import { spaceViolations } from "../../nav/space";
import { Rover } from "../../rover/Rover";
import { roverRuntime } from "../../rover/runtime";
import { sceneSettings } from "../../scene/settings";
import { FloorLine } from "../../tower/primitives";
import type { ExperienceData, GpuTier, Rect, Vec2 } from "../../types";

type Concept = "current" | "observatory" | "helipad" | "garden";
type At = "spawn" | RoofStop;
type View = "rover" | "top";

interface Params {
  concept: Concept;
  at: At;
  view: View;
  tier: Exclude<GpuTier, "static">;
  active: RoofActive;
  reduced: boolean;
  ui: boolean;
}

const SCENERY: Record<Exclude<Concept, "current">, (props: RoofSceneryProps) => JSX.Element> = { observatory: Observatory, helipad: Helipad, garden: SignalGarden };
const CONCEPTS: readonly Concept[] = ["current", "observatory", "helipad", "garden"];
const STOPS: readonly At[] = ["spawn", "availability", "about", "cv", "contact"];
const NAMES: Record<Concept, string> = { current: "Today", observatory: "A. Rooftop Observatory", helipad: "B. Helipad Launch Deck", garden: "C. Signal Garden" };
const NOTES: Record<Concept, string> = {
  current: "Today's roof: beacon, seven comms terminals and the CV kiosk.",
  observatory: "Night deck: a telescope sweeps the sky from the central pier, the comms dish transmits under a constellation of the channels, a CV log lectern, a star chart with the about card, far skyline silhouettes.",
  helipad: "Launch deck: a drone hovers over the pad and lifts off with the email or the CV when you open them, a beacon tower per channel, runway lights round the pad, a departures board with the about card.",
  garden: "Comms tower: a lattice mast with signal rings and the availability neon sign, a garden of channel antennas ringing in their own hues, glowing floor lights, a story wall with a bench.",
};
/** Rover heading per stop (0 faces +z), toward the station it reads. */
const HEADING: Record<At, number> = { spawn: (-3 * Math.PI) / 4, availability: Math.PI, about: 0, cv: Math.PI / 2, contact: Math.PI };
/** Today's deep link spawn, for the baseline. */
const CURRENT_SPAWN: Vec2 = { x: 4, z: 12 };

function readParams(): Params {
  const q = new URLSearchParams(window.location.search);
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const v = q.get(key);
    return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  };
  const active = q.get("active");
  return {
    concept: pick("concept", CONCEPTS, "observatory"),
    at: pick("at", STOPS, "spawn"),
    view: pick("view", ["rover", "top"] as const, "rover"),
    tier: pick("tier", ["full", "lite"] as const, "full"),
    active: active === "contact" || active === "cv" ? active : null,
    reduced: q.get("rm") === "1",
    ui: q.get("ui") !== "0",
  };
}

function writeParams(p: Params) {
  const q = new URLSearchParams({ concept: p.concept, at: p.at, view: p.view, tier: p.tier });
  if (p.active) q.set("active", p.active);
  if (p.reduced) q.set("rm", "1");
  if (!p.ui) q.set("ui", "0");
  window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
}

/** Follow camera as in the tower (view zones included), or a top-down plan with north up. */
function CameraRig({ at, view, bounds, zones }: { at: Vec2; view: View; bounds: Rect; zones: readonly ViewZone[] }) {
  useFrame(({ camera, size }) => {
    const cam = camera as PerspectiveCamera;
    if (view === "top") {
      const w = bounds.maxX - bounds.minX + 8;
      const d = bounds.maxZ - bounds.minZ + 8;
      const aspect = size.width / Math.max(1, size.height);
      const h = Math.max(d, w / aspect) / 2 / Math.tan((cam.fov * Math.PI) / 360);
      cam.up.set(0, 0, -1);
      cam.position.set((bounds.minX + bounds.maxX) / 2, h, (bounds.minZ + bounds.maxZ) / 2 + 0.001);
      cam.lookAt((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
      return;
    }
    const zone = zoneAt("RF", at, zones);
    const pose = followPose(cameraClass(size.width, size.height), [at.x, 1, at.z], zone?.yaw ?? 0, zone?.zoom ?? 1);
    cam.up.set(0, 1, 0);
    cam.position.set(...pose.position);
    cam.lookAt(...pose.target);
    if (cam.fov !== pose.fov) {
      cam.fov = pose.fov;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

/** Counts every render pass of the previous frame (composer passes included) and marks the page ready after 60 frames. */
function Probe({ root }: { root: RefObject<HTMLDivElement | null> }) {
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame(() => {
    frames.current += 1;
    const el = root.current;
    if (el && frames.current % 30 === 0) {
      el.dataset.drawCalls = String(gl.info.render.calls);
      el.dataset.triangles = String(gl.info.render.triangles);
    }
    if (el && frames.current === 60) el.dataset.ready = "1";
    gl.info.reset();
  });
  return null;
}

const seg = (on: boolean) => `inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold transition ${on ? "bg-blue text-void" : "border border-glass-border text-ink-2 hover:text-ink"}`;

/** Dev-only: the three RF concepts (and today's roof) on the real deck layout, for the owner's pick. */
export default function RoofConcepts({ data }: { data: ExperienceData }) {
  const t = useTranslations("hud");
  const tContact = useTranslations("contact");
  const tCommon = useTranslations("common");
  const [params, setParams] = useState<Params>(readParams);
  const [stats, setStats] = useState({ calls: "", tris: "" });
  const root = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => buildRoofLayout({ channels: data.roof.channels.length }), [data.roof.channels.length]);
  const violations = useMemo(
    () => spaceViolations({ bounds: layout.floor.bounds, obstacles: layout.floor.obstacles, doors: layout.floor.doors ?? [], network: layout.network, start: layout.floor.approach }),
    [layout],
  );
  const labels: RoofLabels = useMemo(
    () => ({ comms: t("world.comms"), email: tCommon("email"), cvTitle: tContact("cvTitle"), cvHint: t("world.cvHint"), about: t("world.about"), availability: t("world.availability") }),
    [t, tContact, tCommon],
  );
  const at: Vec2 = params.at === "spawn" ? (params.concept === "current" ? CURRENT_SPAWN : layout.floor.spawn) : layout.stops[params.at];

  useEffect(() => {
    roverRuntime.x = at.x;
    roverRuntime.y = 0;
    roverRuntime.z = at.z;
    roverRuntime.heading = HEADING[params.at];
    const store = getHQStore().getState();
    store.setTier(params.tier);
    store.setReducedMotion(params.reduced);
  }, [at.x, at.z, params.at, params.tier, params.reduced]);
  useEffect(() => writeParams(params), [params]);
  useEffect(() => {
    const id = window.setInterval(() => {
      const el = root.current;
      if (el) setStats({ calls: el.dataset.drawCalls ?? "", tris: el.dataset.triangles ?? "" });
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  const set = (patch: Partial<Params>) => setParams((p) => ({ ...p, ...patch }));
  const settings = sceneSettings(params.tier);
  const b = layout.floor.bounds;
  const pad = layout.callPad;
  const Scenery = params.concept === "current" ? null : SCENERY[params.concept];

  return (
    <div ref={root} className="fixed inset-0 z-[60] overflow-hidden bg-void text-ink" data-testid="roof-concepts" data-concept={params.concept}>
      <Canvas
        key={params.tier}
        dpr={params.tier === "full" ? [1, 2] : [1, 1.5]}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        camera={{ fov: 40, near: 0.5, far: 600, position: [30, 30, 30] }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = settings.exposure;
        }}
      >
        <color attach="background" args={[settings.fog.color]} />
        <fog attach="fog" args={[settings.fog.color, settings.fog.near, settings.fog.far]} />
        <hemisphereLight args={settings.hemisphere} />
        <directionalLight color={settings.directional.color} position={settings.directional.position} intensity={settings.directional.intensity} />
        <mesh position={[(b.minX + b.maxX) / 2, -0.2, (b.minZ + b.maxZ) / 2]}>
          <boxGeometry args={[b.maxX - b.minX, 0.4, b.maxZ - b.minZ]} />
          <meshBasicMaterial color="#07070f" />
        </mesh>
        <GridFloor width={b.maxX - b.minX} depth={b.maxZ - b.minZ} center={[(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2]} />
        <mesh position={[SHAFT.x, 3, SHAFT.z]}>
          <boxGeometry args={[SHAFT.size, 6, SHAFT.size]} />
          <meshStandardMaterial color="#111827" emissive="#22d3ee" emissiveIntensity={0.15} transparent opacity={0.7} />
        </mesh>
        {/* Reserved for the elevator call pad (parallel work). */}
        <FloorLine points={[[pad.minX, pad.minZ], [pad.maxX, pad.minZ], [pad.maxX, pad.maxZ], [pad.minX, pad.maxZ]]} color="#fbbf24" closed opacity={0.6} />
        <Suspense fallback={null}>
          {Scenery ? (
            <>
              <RoadMarkings network={layout.network} color={ROOF_DECK.accent} tier={params.tier} reducedMotion={params.reduced} />
              <Sky tier={params.tier} />
              <Scenery layout={layout} roof={data.roof} profile={data.profile} labels={labels} tier={params.tier} reducedMotion={params.reduced} active={params.active} />
            </>
          ) : (
            <CurrentRoof roof={data.roof} labels={{ ...labels, beacon: tContact("beacon") }} tier={params.tier} />
          )}
        </Suspense>
        <Rover tier={params.tier} />
        <CameraRig at={at} view={params.view} bounds={b} zones={layout.floor.viewZones ?? []} />
        <Probe root={root} />
        {params.tier === "full" && (
          <EffectComposer multisampling={4}>
            <Bloom mipmapBlur luminanceThreshold={0.6} intensity={0.9} radius={0.45} />
            <ToneMapping />
          </EffectComposer>
        )}
      </Canvas>

      {params.ui && (
        <details open className="glass glass-solid pointer-events-auto absolute top-3 left-3 w-[min(360px,calc(100%-1.5rem))] p-3 text-sm" data-testid="roof-panel">
          <summary className="label min-h-11 cursor-pointer content-center text-blue">RF concepts (dev)</summary>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Concept">
            {CONCEPTS.map((c) => (
              <button key={c} type="button" className={seg(params.concept === c)} aria-pressed={params.concept === c} onClick={() => set({ concept: c })}>
                {NAMES[c]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-2">{NOTES[params.concept]}</p>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Rover at">
            {STOPS.map((s) => (
              <button key={s} type="button" className={seg(params.at === s)} aria-pressed={params.at === s} onClick={() => set({ at: s })}>
                {s}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="View and room">
            {(["rover", "top"] as const).map((v) => (
              <button key={v} type="button" className={seg(params.view === v)} aria-pressed={params.view === v} onClick={() => set({ view: v })}>
                {v}
              </button>
            ))}
            {([null, "contact", "cv"] as const).map((a) => (
              <button key={a ?? "none"} type="button" className={seg(params.active === a)} aria-pressed={params.active === a} onClick={() => set({ active: a })}>
                {a === null ? "no room" : a === "contact" ? "open contact" : "open CV"}
              </button>
            ))}
          </div>
          <p className="label mt-2 text-ink-3">
            <a className="link" href={`?concept=${params.concept}&at=${params.at}&tier=${params.tier === "full" ? "lite" : "full"}`}>
              tier: {params.tier}
            </a>{" "}
            ·{" "}
            <button type="button" className="link" onClick={() => set({ reduced: !params.reduced })}>
              reduced motion: {params.reduced ? "on" : "off"}
            </button>
          </p>
          <p className="label text-ink-3" data-testid="roof-stats">
            draw calls {stats.calls} · triangles {stats.tris} (all passes)
          </p>
          <p className="label text-ink-3">
            space rules: <span className={violations.length ? "text-pink" : "text-green"}>{violations.length ? `${violations.length} violations` : "pass"}</span>
          </p>
        </details>
      )}
    </div>
  );
}
```

Create `src/experience/prototype/roof/RoofConceptsLoader.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";
import type { ExperienceData } from "../../types";

const RoofConcepts = dynamic(() => import("./RoofConcepts"), { ssr: false });

/** Client boundary for the dev-only RF concepts route (WebGL only, no server render). */
export function RoofConceptsLoader({ data }: { data: ExperienceData }) {
  return <RoofConcepts data={data} />;
}
```

Create `src/app/[locale]/dev/roof/page.dev.tsx`:

```tsx
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { experienceDataFor } from "@/experience/gate-data";
import { RoofConceptsLoader } from "@/experience/prototype/roof/RoofConceptsLoader";
import { assertLocale } from "@/i18n/locale";

/**
 * Dev-only route (`.dev.tsx` pages build only under `next dev` or with HQ_DEV_PAGES=1, see
 * next.config.ts): the RF concepts for the owner's pick at /{locale}/dev/roof.
 * Query: ?concept=current|observatory|helipad|garden&at=spawn|availability|about|cv|contact&view=rover|top&tier=full|lite&active=contact|cv&rm=1&ui=0.
 */
export const metadata: Metadata = { title: "RF concepts", robots: { index: false, follow: false } };

export default async function RoofConceptsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  return <RoofConceptsLoader data={await experienceDataFor(locale)} />;
}
```

- [ ] **Step 3: Verify the build and the dev route**

Run: `bun run verify:quick`
Expected: typecheck, lint, all unit tests and `next build` pass; the static export contains no `dev/roof` page (`ls out/en/dev 2>/dev/null` prints nothing).

Then start the dev server and open the route:

```bash
bun run dev
```

Open `http://localhost:3000/en/dev/roof?concept=observatory`, then the same with `helipad`, `garden` and `current`. Expected: each scenery renders on the deck, the panel shows "space rules: pass" and a draw call count, the amber rectangle in front of the shaft is empty, "open contact" makes the dish, beacons or mast rings pulse faster, "open CV" lifts the drone (Helipad), and the Indonesian route `/id/dev/roof` shows Indonesian labels.

- [ ] **Step 4: Commit**

```bash
rtk git add messages/en.json messages/id.json src/experience/prototype/roof "src/app/[locale]/dev/roof"
rtk git commit -m "feat(rf): dev-only /dev/roof route with the three concepts, today's roof and a draw call probe"
```

### Task 1I: Capture the concepts and STOP for the owner's pick

**Files:**
- Create: `scripts/capture-dev.ts`

**Interfaces:**
- Consumes: the `/dev/roof` route and its `data-ready`, `data-draw-calls`, `data-triangles` (Task 1H); `window.__hq.rover.drawCalls` on the served export.
- Produces: `bun scripts/capture-dev.ts [--base URL] [--out DIR] [--ready SELECTOR|hq] [--settle MS] name=/path?query ...` writing `<name>-<w>x<h>.png` for 1440x900, 834x1112 and 390x844 plus `metrics.json` (`{ "<file>": { drawCalls, triangles } }`) into `--out`. Task 5 reuses it for the final screenshots.

- [ ] **Step 1: Write the capture script**

Create `scripts/capture-dev.ts`:

```ts
#!/usr/bin/env bun
/**
 * Owner review captures: screenshots of dev-only routes (`bun run dev`) or of the served export
 * (`bun run serve`) at 1440x900, 834x1112 and 390x844, on SwiftShader WebGL with a normal desktop
 * user agent, after the page reports ready. Writes PNGs and metrics.json (draw calls and triangles
 * per shot) to --out.
 *
 *   bun scripts/capture-dev.ts --base http://localhost:3000 --out screenshots/roof-concepts \
 *     'observatory-spawn=/en/dev/roof?concept=observatory&at=spawn&ui=0'
 *
 * --ready takes a CSS selector (default: [data-ready='1']) or `hq` (waits for the 3D tower to draw).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 834, height: 1112 },
  { width: 390, height: 844 },
] as const;
const DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface Options {
  base: string;
  out: string;
  ready: string;
  settle: number;
  shots: { name: string; path: string }[];
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { base: "http://localhost:3000", out: "screenshots/capture", ready: "[data-ready='1']", settle: 1500, shots: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") opts.base = argv[++i];
    else if (a === "--out") opts.out = argv[++i];
    else if (a === "--ready") opts.ready = argv[++i];
    else if (a === "--settle") opts.settle = Number(argv[++i]);
    else {
      const eq = a.indexOf("=");
      if (eq < 1) throw new Error(`expected name=/path, got ${a}`);
      opts.shots.push({ name: a.slice(0, eq), path: a.slice(eq + 1) });
    }
  }
  if (!opts.shots.length) throw new Error("no shots: pass name=/path?query pairs");
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
mkdirSync(opts.out, { recursive: true });
const metrics: Record<string, { drawCalls: number | null; triangles: number | null }> = {};
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, userAgent: DESKTOP_UA });
    // A real visitor: not webdriver (the tier gate treats webdriver as a bot), Rover Terminal already seen.
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
      localStorage.setItem("hq:terminal-seen", "1");
    });
    const page = await context.newPage();
    for (const shot of opts.shots) {
      const file = `${shot.name}-${viewport.width}x${viewport.height}.png`;
      await page.goto(new URL(shot.path, opts.base).toString());
      if (opts.ready === "hq") {
        await page.waitForFunction(() => ((window as unknown as { __hq?: { rover: { drawCalls: number } } }).__hq?.rover.drawCalls ?? 0) > 20, null, { timeout: 180_000 });
      } else await page.waitForSelector(opts.ready, { timeout: 180_000 });
      await page.waitForTimeout(opts.settle);
      const m = await page.evaluate(() => {
        const hq = (window as unknown as { __hq?: { rover: { drawCalls: number; triangles: number } } }).__hq;
        if (hq) return { drawCalls: hq.rover.drawCalls, triangles: hq.rover.triangles };
        const el = document.querySelector<HTMLElement>("[data-draw-calls]");
        const num = (v: string | undefined) => (v === undefined ? null : Number(v));
        return { drawCalls: num(el?.dataset.drawCalls), triangles: num(el?.dataset.triangles) };
      });
      metrics[file] = m;
      await page.screenshot({ path: join(opts.out, file) });
      console.log(`${file} drawCalls=${m.drawCalls} triangles=${m.triangles}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  writeFileSync(join(opts.out, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
}
```

Run: `bun run typecheck && bun run lint`
Expected: both exit 0.

- [ ] **Step 2: Capture the concepts (dev server running from Task 1H)**

With `bun run dev` still running, in a second terminal:

```bash
bun scripts/capture-dev.ts --out screenshots/roof-concepts \
  'current-spawn=/en/dev/roof?concept=current&at=spawn&tier=full&ui=0' \
  'observatory-spawn=/en/dev/roof?concept=observatory&at=spawn&tier=full&ui=0' \
  'observatory-contact=/en/dev/roof?concept=observatory&at=contact&active=contact&tier=full&ui=0' \
  'observatory-about=/en/dev/roof?concept=observatory&at=about&tier=full&ui=0' \
  'observatory-top=/en/dev/roof?concept=observatory&view=top&tier=full&ui=0' \
  'helipad-spawn=/en/dev/roof?concept=helipad&at=spawn&tier=full&ui=0' \
  'helipad-contact=/en/dev/roof?concept=helipad&at=contact&active=contact&tier=full&ui=0' \
  'helipad-cv=/en/dev/roof?concept=helipad&at=cv&active=cv&tier=full&ui=0' \
  'helipad-top=/en/dev/roof?concept=helipad&view=top&tier=full&ui=0' \
  'garden-spawn=/en/dev/roof?concept=garden&at=spawn&tier=full&ui=0' \
  'garden-contact=/en/dev/roof?concept=garden&at=contact&active=contact&tier=full&ui=0' \
  'garden-about=/en/dev/roof?concept=garden&at=about&tier=full&ui=0' \
  'garden-top=/en/dev/roof?concept=garden&view=top&tier=full&ui=0'
```

Expected: 39 lines like `observatory-spawn-1440x900.png drawCalls=... triangles=...`, 39 PNGs and `metrics.json` in `screenshots/roof-concepts/` (gitignored). Open the PNGs: no blank canvases, labels readable, nothing drawn in the amber call pad rectangle. If a shot is blank, raise `--settle 4000` and capture that shot again.

- [ ] **Step 3: Measure draw calls on the lite tier (same harness, same camera)**

```bash
bun scripts/capture-dev.ts --out screenshots/roof-concepts/lite \
  'current=/en/dev/roof?concept=current&at=spawn&tier=lite&ui=0' \
  'observatory=/en/dev/roof?concept=observatory&at=spawn&tier=lite&ui=0' \
  'helipad=/en/dev/roof?concept=helipad&at=spawn&tier=lite&ui=0' \
  'garden=/en/dev/roof?concept=garden&at=spawn&tier=lite&ui=0'
```

Expected: at 1440x900, `current` reports roughly 75 to 90 draw calls and every concept at least 40 fewer (concepts about 30 to 40 including slab, grid, shaft stub and rover). Record the four numbers.

- [ ] **Step 4: Record the real-site baseline**

Stop the dev server, then:

```bash
bun run build && bun run serve
```

In a second terminal:

```bash
bun scripts/capture-dev.ts --base http://127.0.0.1:4173 --ready hq --settle 8000 --out screenshots/roof-baseline 'rf-today=/en/contact?tier=lite'
```

Expected: three lines `rf-today-<size>.png drawCalls=B ...`. Record B at 1440x900 (today's whole RF frame on the lite tier, under 150). Task 5 sets the new RF cap from it.

- [ ] **Step 5: STOP: present the concepts to the owner**

Post to the owner (session message or a draft PR comment with the images via the `github-pr-media` skill) and wait. Do not start Task 2 before the answer:

```markdown
RF concepts are ready to pick (dev route: `bun run dev`, then /en/dev/roof).

All three use the same walkable deck: a road from the elevator into a round plaza, comms (contact) north, CV east, an about board south-west, the availability on the centerpiece, and the spot in front of the elevator kept free for the call pad. Every function stays: channels, Email me and Copy email in the drawer, the CV viewer, availability, location and timezone.

| Concept | What you see | Draw calls (lite, 1440x900) |
|---|---|---|
| Today | beacon, 7 terminals, CV kiosk | <current> |
| A. Rooftop Observatory | night deck, sweeping telescope, comms dish that transmits when contact opens, channel constellation, far skyline | <observatory> |
| B. Helipad Launch Deck | landing pad and runway lights, drone that lifts off with the email or the CV, a beacon tower per channel, departures board | <helipad> |
| C. Signal Garden | lattice comms tower with signal rings and an availability neon sign, antenna garden per channel, floor lights, story wall and bench | <garden> |

Screenshots (1440x900, 834x1112, 390x844): screenshots/roof-concepts/<concept>-{spawn,contact,about|cv,top}-<size>.png

Questions:
1. Which concept: A, B or C (or a mix, for example B's drone on C's tower)?
2. Offer the short "Meet me" guided walk (about, availability, CV, contact) on the first visit to RF? (default: yes)
3. Any copy or color changes?
```

Fill each `<...>` with the numbers recorded in Steps 3 and 4 before posting.

---

## Task 2: Ship the picked concept as the RF floor

Start only after the owner's pick. In the steps below, `<Pick>` is the picked file and component: `Observatory`, `Helipad` or `SignalGarden`. If the owner asked for tweaks, apply them to `src/experience/floors/roof/concepts/<Pick>.tsx` first, recapture with Task 1I Step 2 (only the picked concept's shots) and get a thumbs-up.

**Files:**
- Move: `src/experience/floors/roof/concepts/<Pick>.tsx` to `src/experience/floors/roof/<Pick>.tsx`; delete the other two concepts and the `concepts/` folder
- Delete: `src/experience/floors/roof/Comms.tsx`, `src/experience/prototype/roof/`, `src/app/[locale]/dev/roof/`
- Modify: `src/experience/floors/roof/layout.ts` (delete today's exports; add `ROOF_STOPS`)
- Modify: `src/experience/floors/roof/solids.ts` (drop the helpers only unpicked concepts use)
- Rewrite: `src/experience/floors/Roof.tsx`
- Modify: `src/experience/tower/Tower.tsx:89`, `src/experience/Experience.tsx:251-257`, `src/experience/config.ts:5` and `:153`
- Modify: `tests/unit/library-roof-layout.test.ts`, `tests/unit/experience-data.test.ts`, `tests/unit/roof-layout.test.ts`, `tests/unit/roof-solids.test.ts`
- Modify: `e2e/library-roof.spec.ts:111` and `:134`

**Interfaces:**
- Consumes: `buildRoofLayout`, `roofActive`, `ROOF_DECK` (Task 1B); `RoofLabels`, `RoofSceneryProps` (Task 1F); `<Pick>` (Task 1G).
- Produces:
  - `Roof({ data, labels, tier }: { data: ExperienceData; labels: RoofLabels; tier: GpuTier })` and `export type { RoofLabels }` from `src/experience/floors/Roof.tsx`.
  - `layouts.RF` from `buildFloorLayouts` is `buildRoofLayout().floor` (road, plaza, doors, view zones, arrival).
  - `ROOF_STOPS: Record<RoofStop, Vec2>` (= `buildRoofLayout().stops`) from `roof/layout.ts`; `ROOF_STOPS.contact` and `ROOF_STOPS.cv` equal the door pads, so `roomTarget` and missions drive there unchanged.

- [ ] **Step 1: Write the failing test (the tower uses the deck)**

Append to `tests/unit/roof-layout.test.ts`:

```ts
describe("RF in the tower", () => {
  it("is the roof deck, with the stops on the door pads", async () => {
    const { buildFloorLayouts } = await import("@/experience/config");
    const { ROOF_STOPS } = await import("@/experience/floors/roof/layout");
    const rf = buildFloorLayouts(8).RF;
    expect(rf).toEqual(buildRoofLayout().floor);
    expect(ROOF_STOPS).toEqual(buildRoofLayout().stops);
    expect(rf.doors?.map((d) => d.at)).toEqual([ROOF_STOPS.contact, ROOF_STOPS.cv]);
  });
});
```

Run: `bunx vitest run tests/unit/roof-layout.test.ts`
Expected: FAIL in "is the roof deck" (`expected { id: 'RF', bounds: { minX: -20, maxX: 20, ...} } to deeply equal { ... }`).

- [ ] **Step 2: Promote the picked scenery and delete the rest**

```bash
rtk git mv src/experience/floors/roof/concepts/<Pick>.tsx src/experience/floors/roof/<Pick>.tsx
rtk git rm -r src/experience/floors/roof/concepts src/experience/floors/roof/Comms.tsx src/experience/prototype/roof "src/app/[locale]/dev/roof"
sed -i '' -e 's#"\.\./\.\./\.\./#"../../#g' -e 's#"\.\./kit"#"./kit"#' -e 's#"\.\./layout"#"./layout"#' -e 's#"\.\./solids"#"./solids"#' src/experience/floors/roof/<Pick>.tsx
grep -n 'from "' src/experience/floors/roof/<Pick>.tsx
```

Expected: every import is now `../../fx/...`, `../../tower/...`, `../../types`, `../../nav/road` (Signal Garden only), `./kit`, `./layout` or `./solids`. (On Linux use `sed -i` without `''`.)

Then remove the geometry helpers only the unpicked concepts used, with their tests:

| Pick | Delete from `solids.ts` | Delete from `tests/unit/roof-solids.test.ts` |
|---|---|---|
| Observatory | `latticeSegments`, `scatter`, `ringPoints` | tests "tapers the lattice mast to its top", "scatters seeded points that respect the reject rule", "places ring points and seeds a stable random sequence" (keep its `mulberry32` assertions by renaming it "seeds a stable random sequence" and deleting the three `ringPoints` lines) |
| Helipad | `latticeSegments`, `skylineBoxes`, `skylineWindows`, `SKYLINE_GROUND`, `scatter` | tests "tapers the lattice mast to its top", "puts the skyline far outside the slab...", "scatters seeded points..." |
| SignalGarden | `skylineBoxes`, `skylineWindows`, `SKYLINE_GROUND`, `ringPoints` | tests "puts the skyline far outside the slab...", "places ring points and seeds..." (keep the `mulberry32` lines as "seeds a stable random sequence") |

Also remove the deleted names from the test's import list, then trim `RoofDetail` and `roofDetail` to what the picked scenery reads:

| Pick | `RoofDetail` keeps | "keeps the lite tier lighter than the full tier" test |
|---|---|---|
| Observatory | `skyline`, `windows` | change its last assertion to `expect(lite.skyline).toBeLessThan(full.skyline);` |
| Helipad | nothing: delete `RoofDetail` and `roofDetail` | delete the test |
| SignalGarden | `flowers` | unchanged |

- [ ] **Step 3: Delete today's layout exports**

In `src/experience/floors/roof/layout.ts`:
- Delete everything from `/** RF Roof element positions (appendix 01 section 6). Floor-local, pure. */` down to the end of `ROOF_LANES` (the old `ROOF`, `TERMINAL_COUNT`, `STOP_GAP`, `TerminalSlot`, `terminalSlots`, `middle` const, `kiosk` const, old `ROOF_STOPS`, `roofObstacles`, `ROOF_DOORS`, `LANE_Z`, `ROOF_LANES`), but keep the `rect` helper.
- Remove `import { towardPad } from "../../nav/doors";`.
- Append:

```ts
/** Mission and walk stops on the roof (the door pads for RF:contact and RF:cv). */
export const ROOF_STOPS: Record<RoofStop, Vec2> = buildRoofLayout().stops;
```

- [ ] **Step 4: Rewrite `Roof.tsx` and wire it**

Replace `src/experience/floors/Roof.tsx` with (use the line for your pick in the import):

```tsx
"use client";

import { Suspense, useMemo } from "react";
import { useHQStore } from "@/store/useHQStore";
import { RoadMarkings } from "../fx/RoadMarkings";
import type { ExperienceData, GpuTier } from "../types";
import type { RoofLabels } from "./roof/kit";
import { buildRoofLayout, ROOF_DECK, roofActive } from "./roof/layout";
import { <Pick> as Scenery } from "./roof/<Pick>";
import { Sky } from "./roof/Sky";

export type { RoofLabels };

/** RF roof deck (RF revamp): road, plaza and stations from `buildRoofLayout`, dressed by the owner's picked scenery. */
export function Roof({ data, labels, tier }: { data: ExperienceData; labels: RoofLabels; tier: GpuTier }) {
  const layout = useMemo(() => buildRoofLayout({ channels: data.roof.channels.length }), [data.roof.channels.length]);
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  const active = useHQStore((s) => roofActive(s.phase, s.activeRoom));
  return (
    <group name="roof">
      <RoadMarkings network={layout.network} color={ROOF_DECK.accent} tier={tier} reducedMotion={reducedMotion} />
      <Sky tier={tier} />
      {/* Text loads fonts asynchronously; keep it from holding back the geometry. */}
      <Suspense fallback={null}>
        <Scenery layout={layout} roof={data.roof} profile={data.profile} labels={labels} tier={tier} reducedMotion={reducedMotion} active={active} />
      </Suspense>
    </group>
  );
}
```

In `src/experience/tower/Tower.tsx`, change line 89 to:

```tsx
                  <Roof data={data} labels={labels.roof} tier={tier} />
```

In `src/experience/Experience.tsx`, replace the `roof: { ... }` labels block (lines 251 to 257) with:

```tsx
      roof: {
        comms: t("world.comms"),
        email: tCommon("email"),
        cvTitle: tContact("cvTitle"),
        cvHint: t("world.cvHint"),
        about: t("world.about"),
        availability: t("world.availability"),
      },
```

In `src/experience/config.ts`, change line 5 to:

```ts
import { buildRoofLayout } from "./floors/roof/layout";
```

and the RF entry of `buildFloorLayouts` (line 153) to:

```ts
    // RF roof deck: lead road, round plaza, comms and CV stations, free call pad (RF revamp plan).
    RF: buildRoofLayout().floor,
```

and update the comment above the L4 line to `// Deep links spawn L4 in front of its content (the follow camera looks toward -x, -z).` The `standard()` helper keeps its `id === "RF"` door branch unused; change `const doorX = id === "RF" ? -20 : -24;` to `const doorX = -24;`.

- [ ] **Step 5: Move the RF unit tests off today's layout**

In `tests/unit/library-roof-layout.test.ts`:
- Line 4: delete the `@/experience/floors/roof/layout` import.
- Delete the whole `describe("RF Roof layout", ...)` block.
- In `it("spawn L4 and RF on walkable cells ...")` and `it("keep the deep link spawns and the elevator approach outside every zone")`, change `for (const floor of ["L4", "RF"] as const)` to `for (const floor of ["L4"] as const)` and the first title to `"spawns L4 on a walkable cell in front of its content"`.
- In `it("open the research shelf, ...")`, delete the `expect(layouts.RF.doors).toEqual([...])` statement and rename it `"open the research shelf, the models shelf and the talks stage at their stops"`.
- In `describe("L4 and RF lanes")`: rename it `"L4 lanes"`; in "lane ribbons stop before every door pad" delete the `[ROOF_LANES, ROOF_DOORS],` entry; in "lane ribbons never run under shelves, the stage or terminals" delete the `ROOF_LANES` line and rename it `"lane ribbons never run under shelves or the stage"`.
- Change `function expectReachable(floor: "L4" | "RF", stop: Vec2)` to `function expectReachable(floor: "L4", stop: Vec2)`.

(These are the only RF lines in the file; the L4 revamp session also edits it, so rebase before pushing.)

In `tests/unit/experience-data.test.ts`, replace line 4 with:

```ts
import { buildRoofLayout } from "@/experience/floors/roof/layout";
```

and replace the two lines

```ts
    // One comms terminal per channel plus email.
    expect(en.channels.length + 1).toBe(TERMINAL_COUNT);
```

with:

```ts
    // One anchor on the comms station per channel.
    expect(buildRoofLayout({ channels: en.channels.length }).channelSlots).toHaveLength(en.channels.length);
```

`tests/unit/missions-host3d.test.ts` keeps importing `ROOF_STOPS`; its expectations now hold for the new pads without edits.

In `e2e/library-roof.spec.ts`, add after the `import content ...` line:

```ts
import { ROOF_STOPS } from "../src/experience/floors/roof/layout";
```

and change `await expectRoverNear(page, { x: 0, z: 6.8 });` to `await expectRoverNear(page, ROOF_STOPS.contact);` and `await expectRoverNear(page, { x: 10, z: 9.4 });` to `await expectRoverNear(page, ROOF_STOPS.cv);`.

- [ ] **Step 6: Run the tests**

Run: `bunx vitest run tests/unit/roof-layout.test.ts tests/unit/roof-solids.test.ts tests/unit/library-roof-layout.test.ts tests/unit/experience-data.test.ts tests/unit/missions-host3d.test.ts tests/unit/doors.test.ts tests/unit/navgrid.test.ts tests/unit/e2e-plan.test.ts`
Expected: PASS, including "is the roof deck" and "every door on every floor points into its room".

Run: `bun run verify:quick`
Expected: exit 0.

Run: `bun run e2e:changed`
Expected: the plan includes `library-roof` (and `experience`, `labs`, `career`, `missions` through the floor and config rules); all pass. In particular "hire rides to the Roof, parks at the comms terminals and copies the email" and "cv drives to the kiosk, opens the CV viewer ..." pass with the new stops, and "L4 and RF stay under the draw call budget" passes.

- [ ] **Step 7: Commit**

```bash
rtk git add -A src/experience tests/unit e2e/library-roof.spec.ts "src/app/[locale]/dev"
rtk git commit -m "feat(rf): the roof deck ships with the <Pick> scenery; drop the terminals, kiosk and concept prototype"
```

## Task 3: Contact actions, drawer meta and the roof e2e spec

**Files:**
- Modify: `src/content/room-views/roof.ts` (imports; the RF:contact `single({...})`)
- Modify: `messages/en.json` and `messages/id.json` (`hud.rooms.contact`)
- Modify: `e2e/screenshots.spec.ts:73` (palette query)
- Modify: `scripts/e2e-plan.ts` (`ALL_SPECS`, `RULES`)
- Test: `tests/unit/room-views.test.ts`, `tests/unit/e2e-plan.test.ts`
- Create: `e2e/roof.spec.ts`

**Interfaces:**
- Consumes: `getProfile()`; `ROOF_STOPS`, `buildRoofLayout` (Task 2); e2e helpers `asReturningVisitor`, `collectErrors`, `expectRenderBudget`, `snapshot`, `waitForHQ`, `waitForPhase`, `waitForRoom`, `waitForSceneLive` from `e2e/hq.ts`.
- Produces:
  - RF:contact `RoomView.meta = [profile.location[locale], profile.timezone]` (the drawer header shows "Jakarta, Indonesia · GMT+7").
  - Room name `hud.rooms.contact`: "Comms station" / "Stasiun komunikasi" (there are no terminals any more; the room id `RF:contact`, its URL and the Page View stay).
  - `e2e/roof.spec.ts` with the helper `openRoof(page, { locale?, walk? })` (Task 4 and Task 5 add tests to it) and `RF_MAX_DRAW_CALLS`.
  - e2e plan: spec `roof`; `src/experience/floors/roof/**` and `src/experience/floors/Roof.tsx` map to `library-roof`, `roof`, `walk`; `src/content/room-views/roof.ts` maps to `library-roof`, `roof`.

- [ ] **Step 1: Write the failing unit tests**

In `tests/unit/room-views.test.ts`, change line 2 to:

```ts
import { getContent, getPods, getProfile } from "@/content/load";
```

and add inside `describe("room views (Glass Drawer content)", ...)`, after the `for (const locale of LOCALES) { ... }` loop:

```ts
  it("shows the location and timezone in the comms station header", () => {
    const profile = getProfile();
    for (const locale of LOCALES) expect(buildRoomViews(locale)["RF:contact"].meta).toEqual([profile.location[locale], profile.timezone]);
  });
```

In `tests/unit/e2e-plan.test.ts`, replace

```ts
    expect(specsForChanges(["src/experience/floors/roof/Comms.tsx"]).specs).toEqual(["library-roof"]);
```

with:

```ts
    expect(specsForChanges(["src/experience/floors/roof/layout.ts"]).specs).toEqual(["library-roof", "roof", "walk"]);
    expect(specsForChanges(["src/experience/floors/Roof.tsx"]).specs).toEqual(["library-roof", "roof", "walk"]);
    expect(specsForChanges(["src/content/room-views/roof.ts"]).specs).toEqual(["library-roof", "roof"]);
    expect(specsForChanges(["src/experience/floors/library/layout.ts"]).specs).toEqual(["library-roof"]);
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `bunx vitest run tests/unit/room-views.test.ts tests/unit/e2e-plan.test.ts`
Expected: FAIL: "shows the location and timezone" (`expected [] to deeply equal [ 'Jakarta, Indonesia', 'GMT+7' ]`) and "maps floor code to its spec" (`expected [ 'library-roof' ] to deeply equal [ 'library-roof', 'roof', 'walk' ]`).

- [ ] **Step 3: Implement the meta, the room name and the plan rules**

In `src/content/room-views/roof.ts`, change the first import to:

```ts
import { getContact, getProfile, getRoof } from "../load";
```

add `const profile = getProfile();` after `const contact = getContact();`, and add the meta line to the RF:contact view so it reads:

```ts
    single({
      id: roomId("RF", "contact"),
      kind: "roof",
      title: m.hud.rooms.contact,
      subtitle: roof.availability[locale],
      meta: [profile.location[locale], profile.timezone],
      accent: "blue",
      sections: [{ title: m.drawer.rooms.channels, items: channels }],
      page: "/contact",
    }),
```

Also change its doc comment to `/** RF roof deck: the comms station and the CV kiosk. `RoofBody` (hud/drawer/RoofBody.tsx) renders both. */`.

In `messages/en.json` change `"contact": "Comms terminals",` (inside `hud.rooms`) to `"contact": "Comms station",`. In `messages/id.json` change `"contact": "Terminal komunikasi",` (inside `hud.rooms`) to `"contact": "Stasiun komunikasi",`.

In `e2e/screenshots.spec.ts` line 73 change `query: "Comms terminals"` to `query: "Comms station"`.

In `scripts/e2e-plan.ts`, add `"roof",` to `ALL_SPECS` between `"pageview",` and `"seo",`, and insert these two rules directly above the existing `{ test: /^src\/experience\/floors\/(library|roof)\/|...` rule:

```ts
  { test: /^src\/experience\/floors\/roof\/|^src\/experience\/floors\/Roof\.tsx$/, specs: ["library-roof", "roof", "walk"] },
  { test: /^src\/content\/room-views\/roof\.ts$/, specs: ["library-roof", "roof"] },
```

The second rule must also sit above the `^(content|messages)\/|^src\/content\/` rule; placing both in the "3D floors" block (above the library rule) satisfies that.

- [ ] **Step 4: Run the unit tests**

Run: `bunx vitest run tests/unit/room-views.test.ts tests/unit/e2e-plan.test.ts tests/hud/LibraryRoofRooms.test.tsx tests/content`
Expected: PASS except "knows every spec in e2e/" in `e2e-plan.test.ts`, which fails until `e2e/roof.spec.ts` exists (next step).

- [ ] **Step 5: Write the roof e2e spec**

Create `e2e/roof.spec.ts`:

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import content from "../content/site-content.json";
import en from "../messages/en.json";
import { buildRoofLayout, ROOF_STOPS } from "../src/experience/floors/roof/layout";
import { asReturningVisitor, collectErrors, expectRenderBudget, snapshot, waitForHQ, waitForPhase, waitForRoom, waitForSceneLive } from "./hq";

/**
 * RF roof deck (RF revamp plan): deep link, contact actions, render budget and the "Meet me" walk.
 * Walks are off unless a test turns them on, so the first-visit prompt never races the palette.
 */
test.describe.configure({ timeout: 150_000 });

/** The whole RF frame on the lite tier. Today's roof measured B draw calls (Task 1I Step 4); keep this at most B - 30. */
const RF_MAX_DRAW_CALLS = 90;

const CHANNELS = { linkedin: "LinkedIn", github: "GitHub", huggingface: "Hugging Face", medium: "Medium", googleScholar: "Google Scholar", ieeeXplore: "IEEE Xplore" } as const;

async function openRoof(page: Page, { locale = "en", walk = "off" }: { locale?: "en" | "id"; walk?: "on" | "off" } = {}) {
  await asReturningVisitor(page);
  await page.goto(`/${locale}/contact?tier=lite&walk=${walk}`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

async function expectRoverNear(page: Page, point: { x: number; z: number }, tolerance = 1.5) {
  const { rover } = await snapshot(page);
  expect(Math.hypot(rover.x - point.x, rover.z - point.z)).toBeLessThan(tolerance);
}

async function openFromPalette(page: Page, query: string, room: string) {
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Command palette" }).getByRole("combobox")).toBeFocused();
  await page.keyboard.type(query);
  await page.keyboard.press("Enter");
  await waitForRoom(page, room);
}

test.describe("RF roof deck", () => {
  test("/en/contact deep links onto the deck in front of the plaza, the page stays underneath", async ({ page }) => {
    const errors = collectErrors(page);
    await openRoof(page);
    const s = await snapshot(page);
    expect(s).toMatchObject({ floor: "RF", phase: "explore", ride: null });
    const { spawn } = buildRoofLayout().floor;
    expect(Math.hypot(s.rover.x - spawn.x, s.rover.z - spawn.z)).toBeLessThan(1.5);
    await expect(page).toHaveURL(/\/en\/contact\?tier=lite/);
    await expect(page.locator("#site-shell")).toHaveAttribute("inert", "");
    await expect(page.locator("#cv")).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test("contact actions: location and timezone, Email me, Copy email, channels in new tabs, then the CV viewer", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openRoof(page);
    await openFromPalette(page, en.hud.rooms.contact, "RF:contact");
    await expectRoverNear(page, ROOF_STOPS.contact);
    const drawer = page.getByTestId("room-drawer");
    await expect(drawer).toContainText(content.floors.roof.availability.en);
    await expect(drawer).toContainText(`${content.profile.location.en} · ${content.profile.timezone}`);
    await expect(drawer.getByRole("link", { name: en.drawer.rooms.emailMe })).toHaveAttribute("href", `mailto:${content.floors.roof.contact.email}`);
    await drawer.getByRole("button", { name: en.drawer.rooms.copyEmail }).click();
    await expect(drawer.getByRole("status")).toHaveText(en.drawer.rooms.copied);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(content.floors.roof.contact.email);
    const contact = content.floors.roof.contact as Record<string, string | undefined>;
    for (const [id, name] of Object.entries(CHANNELS)) {
      if (!contact[id]) continue;
      const link = drawer.getByRole("link", { name: new RegExp(name) });
      await expect(link).toHaveAttribute("href", contact[id]!);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    const axe = await new AxeBuilder({ page }).include("[data-testid='room-drawer']").analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);

    await openFromPalette(page, en.hud.rooms.cv, "RF:cv");
    await expectRoverNear(page, ROOF_STOPS.cv);
    await drawer.getByRole("button", { name: en.drawer.rooms.cvView }).click();
    const viewer = page.getByRole("dialog", { name: "CV", exact: true });
    await expect(viewer.getByRole("button", { name: en.cv.close })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    await expect(drawer).toBeVisible();
  });

  test("RF stays under the floor budget and well under today's roof", async ({ page }) => {
    await openRoof(page);
    await page.waitForTimeout(1500);
    await expectRenderBudget(page);
    expect((await snapshot(page)).drawCalls).toBeLessThan(RF_MAX_DRAW_CALLS);
  });
});
```

If B (Task 1I Step 4) is below 120, set `RF_MAX_DRAW_CALLS` to B minus 30, rounded down to a multiple of 5 (for example B = 104 gives 70), so the test proves the reduction.

- [ ] **Step 6: Run the unit tests, build and the specs**

Run: `bunx vitest run tests/unit/e2e-plan.test.ts && bun run verify:quick && bunx playwright test e2e/roof.spec.ts e2e/library-roof.spec.ts`
Expected: unit tests PASS ("knows every spec in e2e/" included); verify:quick exits 0; Playwright reports `roof.spec.ts` 3 passed and `library-roof.spec.ts` all passed.

- [ ] **Step 7: Commit**

```bash
rtk git add src/content/room-views/roof.ts messages/en.json messages/id.json e2e/screenshots.spec.ts e2e/roof.spec.ts scripts/e2e-plan.ts tests/unit/room-views.test.ts tests/unit/e2e-plan.test.ts
rtk git commit -m "test(rf): roof spec for the deep link, contact actions and budget; comms station shows location and timezone"
```

## Task 4: "Meet me" guided walk on the roof

**Files:**
- Modify: `src/experience/missions/walks.ts` (imports; new `roofWalk`)
- Modify: `src/experience/config.ts` (`WALK_FLOORS`)
- Modify: `src/hud/walk/WalkLayer.tsx` (`useWalkDefinitions`)
- Modify: `messages/en.json`, `messages/id.json` (`walk.meet`)
- Test: `tests/unit/walk.test.ts`, `e2e/roof.spec.ts`

If the owner answered "no" to question 2 in Task 1I, still ship `roofWalk` and its registration but leave `WALK_FLOORS` unchanged (the walk then runs only with `?walk=on`), and drop the `WALK_FLOORS` assertion below.

**Interfaces:**
- Consumes: `ROOF_STOPS` (Task 2); `WalkDefinition`, `WalkStop` from `./walk`; `ExperienceData` (`roof`, `profile`).
- Produces:
  - `interface RoofWalkLabels { about: string; availability: string; cv: string; cvSub: string; contact: string }`.
  - `roofWalk(data: Pick<ExperienceData, "roof" | "profile">, labels: RoofWalkLabels): WalkDefinition` with `id: "meet"`, `floor: "RF"`, stops `RF:about` (point), `RF:availability` (point), `RF:cv` (room), `RF:contact` (room), no filters.
  - `WALK_FLOORS = ["L2", "L3", "RF"]`.
  - Message keys `walk.meet.title`, `.body`, `.start`, `.name`, `.about`, `.availability`, `.cv`, `.contact`.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/walk.test.ts`, change line 5 to:

```ts
import { careerWalk, labsWalk, roofWalk, walkFloorsEnabled } from "@/experience/missions/walks";
```

add after line 6:

```ts
import { WALK_FLOORS } from "@/experience/config";
import { ROOF_STOPS } from "@/experience/floors/roof/layout";
```

and add inside `describe("walk definitions", ...)`, before `it("offers walks on ready floors, ...")`:

```ts
  it("meets the owner on the roof: about, availability, the CV, then contact", () => {
    const walk = roofWalk(
      {
        roof: { availability: "Open to talk", email: "me@example.com", channels: [], timezone: "GMT+7", subheadline: "Builds AI." },
        profile: { name: "N", monogram: "N", headline: "H", role: "Role · Org", location: "Jakarta" },
      },
      { about: "About me", availability: "Availability", cv: "My CV", cvSub: "Read it here", contact: "Get in touch" },
    );
    expect(walk).toMatchObject({ id: "meet", floor: "RF" });
    expect(walk.filters).toBeUndefined();
    expect(walk.stops.map((s) => s.id)).toEqual(["RF:about", "RF:availability", "RF:cv", "RF:contact"]);
    expect(walk.stops[0]).toEqual({ id: "RF:about", to: ROOF_STOPS.about, title: "About me", subtitle: "Role · Org · Jakarta · GMT+7" });
    expect(walk.stops[1]).toEqual({ id: "RF:availability", to: ROOF_STOPS.availability, title: "Availability", subtitle: "Open to talk" });
    expect(walk.stops[2]).toEqual({ id: "RF:cv", to: "RF:cv", room: "RF:cv", title: "My CV", subtitle: "Read it here" });
    expect(walk.stops[3]).toEqual({ id: "RF:contact", to: "RF:contact", room: "RF:contact", title: "Get in touch", subtitle: "me@example.com" });
    expect(WALK_FLOORS).toEqual(["L2", "L3", "RF"]);
  });
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `bunx vitest run tests/unit/walk.test.ts`
Expected: FAIL in "meets the owner on the roof" with `TypeError: roofWalk is not a function`.

- [ ] **Step 3: Implement the walk**

In `src/experience/missions/walks.ts`, change the imports to:

```ts
import type { FloorId, RoomId, Wing } from "@/content/schema";
import { directoryStop, tourOrder } from "../floors/labs/layout";
import { ROOF_STOPS } from "../floors/roof/layout";
import type { CareerData, CareerType, ExperienceData, LabPod } from "../types";
import type { WalkDefinition, WalkStop } from "./walk";
```

and add after `labsWalk`:

```ts
export interface RoofWalkLabels {
  about: string;
  availability: string;
  cv: string;
  /** Subtitle of the CV stop (contact.cvIntro). */
  cvSub: string;
  contact: string;
}

/**
 * RF "Meet me": who I am (the about board), my availability (the centerpiece), the CV kiosk, then
 * the comms station. The first two are points with nothing to open; the last two open their rooms.
 */
export function roofWalk({ roof, profile }: Pick<ExperienceData, "roof" | "profile">, labels: RoofWalkLabels): WalkDefinition {
  const stops: WalkStop[] = [
    { id: "RF:about", to: ROOF_STOPS.about, title: labels.about, subtitle: [profile.role, profile.location, roof.timezone].join(" · ") },
    { id: "RF:availability", to: ROOF_STOPS.availability, title: labels.availability, subtitle: roof.availability },
    { id: "RF:cv", to: "RF:cv", room: "RF:cv", title: labels.cv, subtitle: labels.cvSub },
    { id: "RF:contact", to: "RF:contact", room: "RF:contact", title: labels.contact, subtitle: roof.email },
  ];
  return { id: "meet", floor: "RF", stops };
}
```

Also extend the module doc comment's first sentence to mention it: `L2 "Walk my journey" ..., L3 "Tour my projects" ... and RF "Meet me" visits the about board, the availability sign, the CV kiosk and the comms station.`

In `src/experience/config.ts`, change `export const WALK_FLOORS: readonly FloorId[] = ["L2", "L3"];` to:

```ts
export const WALK_FLOORS: readonly FloorId[] = ["L2", "L3", "RF"];
```

In `src/hud/walk/WalkLayer.tsx`, change the walks import to `import { careerWalk, labsWalk, roofWalk, walkFloorsEnabled } from "@/experience/missions/walks";` and replace `useWalkDefinitions` with:

```ts
/** Walk definitions for the floors that have one (labels resolved from messages). */
export function useWalkDefinitions(data: ExperienceData): Partial<Record<FloorId, WalkDefinition>> {
  const t = useTranslations("walk");
  const tc = useTranslations("common");
  const th = useTranslations("hud.career");
  const tContact = useTranslations("contact");
  return useMemo(
    () => ({
      L2: careerWalk(data.career, {
        types: { job: tc("type.job"), freelance: tc("type.freelance"), education: tc("type.education"), award: tc("type.award"), milestone: tc("type.milestone") },
        workshop: th("workshop"),
        workshopSub: t("workshopSub"),
        prologue: th("prologue"),
      }),
      L3: labsWalk(data.labs.pods, { wings: data.labs.wings, more: t("more"), moreSub: t("moreSub") }),
      RF: roofWalk(
        { roof: data.roof, profile: data.profile },
        { about: t("meet.about"), availability: t("meet.availability"), cv: t("meet.cv"), cvSub: tContact("cvIntro"), contact: t("meet.contact") },
      ),
    }),
    [data.career, data.labs, data.roof, data.profile, t, tc, th, tContact],
  );
}
```

In `messages/en.json`, inside `"walk"`, after the `"projects": { ... },` block, add:

```json
    "meet": {
      "title": "Meet me?",
      "body": "A short guided drive: who I am, my availability, my CV and how to reach me. Skip it to roam the roof on your own.",
      "start": "Meet me",
      "name": "Meet me walk",
      "about": "About me",
      "availability": "Availability",
      "cv": "My CV",
      "contact": "Get in touch"
    },
```

In `messages/id.json`, at the same place:

```json
    "meet": {
      "title": "Kenalan dulu?",
      "body": "Perjalanan singkat terpandu: siapa saya, ketersediaan saya, CV saya, dan cara menghubungi saya. Lewati jika ingin menjelajah atap sendiri.",
      "start": "Kenalan dengan saya",
      "name": "Tur perkenalan",
      "about": "Tentang saya",
      "availability": "Ketersediaan",
      "cv": "CV saya",
      "contact": "Hubungi saya"
    },
```

- [ ] **Step 4: Run the unit tests**

Run: `bunx vitest run tests/unit/walk.test.ts tests/content && bun run typecheck && bun run lint`
Expected: PASS; typecheck and lint exit 0.

- [ ] **Step 5: Add the walk e2e test**

Append inside `test.describe("RF roof deck", ...)` in `e2e/roof.spec.ts`:

```ts
  test("Meet me: the first visit offers the walk, which visits the about board, the availability, the CV and contact", async ({ page }) => {
    const errors = collectErrors(page);
    await openRoof(page, { walk: "on" });
    const prompt = page.getByTestId("walk-prompt");
    await expect(prompt.getByRole("heading")).toHaveText(en.walk.meet.title);
    await prompt.getByRole("button", { name: en.walk.meet.start }).click();
    const bar = page.getByTestId("walk-bar");
    await expect(page.getByTestId("walk-counter")).toContainText("Stop 1 of 4");
    await expect(bar).toHaveAttribute("data-stop", "RF:about");
    await expect(bar).toHaveAttribute("data-status", "arrived", { timeout: 90_000 });
    await expectRoverNear(page, ROOF_STOPS.about);
    await page.keyboard.press("]");
    await expect(page.getByTestId("walk-counter")).toContainText("Stop 2 of 4");
    await expect(bar).toHaveAttribute("data-stop", "RF:availability");
    await expect(bar).toHaveAttribute("data-status", "arrived", { timeout: 90_000 });
    await expectRoverNear(page, ROOF_STOPS.availability);
    await page.keyboard.press("]");
    await waitForRoom(page, "RF:cv");
    await page.keyboard.press("]");
    await waitForRoom(page, "RF:contact");
    expect(errors).toEqual([]);
  });
```

- [ ] **Step 6: Build and run the affected specs**

Run: `bun run verify:quick && bunx playwright test e2e/roof.spec.ts e2e/walk.spec.ts e2e/library-roof.spec.ts e2e/missions.spec.ts`
Expected: all pass. `library-roof.spec.ts` now sees the RF walk prompt after arrivals; it is a non-modal dialog, so the hire, CV and language tests still pass. If one fails because the prompt covers a control, end the prompt in that test with `await page.getByTestId("walk-prompt").getByRole("button", { name: en.walk.explore }).click()` (import `en` from `../messages/en.json`) rather than adding retries.

- [ ] **Step 7: Commit**

```bash
rtk git add src/experience/missions/walks.ts src/experience/config.ts src/hud/walk/WalkLayer.tsx messages/en.json messages/id.json tests/unit/walk.test.ts e2e/roof.spec.ts
rtk git commit -m "feat(rf): \"Meet me\" guided walk on the roof (about, availability, CV, contact)"
```

## Task 5: Reduced motion, budget calibration and final screenshots

**Files:**
- Modify: `e2e/roof.spec.ts` (reduced motion test; `RF_MAX_DRAW_CALLS` if needed)

**Interfaces:**
- Consumes: `openRoof`, `snapshot`, `expectRenderBudget` (Task 3); `scripts/capture-dev.ts` (Task 1I); the store's `reducedMotion` (set from `prefers-reduced-motion` by `Experience`).
- Produces: a reduced-motion e2e check and the owner's final screenshots in `screenshots/rf-final/`.

- [ ] **Step 1: Write the reduced motion test**

Append inside `test.describe("RF roof deck", ...)` in `e2e/roof.spec.ts`:

```ts
  test("reduced motion: the roof renders still and inside the budget", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openRoof(page);
    expect(await page.evaluate(() => (window as unknown as { __hq: { store: { getState: () => { reducedMotion: boolean } } } }).__hq.store.getState().reducedMotion)).toBe(true);
    await page.waitForTimeout(1500);
    await expectRenderBudget(page);
    expect((await snapshot(page)).drawCalls).toBeLessThan(RF_MAX_DRAW_CALLS);
  });
```

- [ ] **Step 2: Run it**

Run: `bun run build && bunx playwright test e2e/roof.spec.ts -g "reduced motion"`
Expected: 1 passed.

- [ ] **Step 3: Calibrate the cap**

Start `bun run serve` (it serves the build from Step 2) and read the RF draw calls:

```bash
bun scripts/capture-dev.ts --base http://127.0.0.1:4173 --ready hq --settle 8000 --out screenshots/rf-final/lite 'rf=/en/contact?tier=lite&walk=off'
```

Expected: `rf-1440x900.png drawCalls=N` with N at least 30 below B (Task 1I Step 4) and below `RF_MAX_DRAW_CALLS`. If `RF_MAX_DRAW_CALLS` is more than N + 15, lower it to N + 10 rounded up to a multiple of 5, so a regression shows; rerun `bunx playwright test e2e/roof.spec.ts`.

- [ ] **Step 4: Capture the final screenshots for the owner**

```bash
bun scripts/capture-dev.ts --base http://127.0.0.1:4173 --ready hq --settle 8000 --out screenshots/rf-final \
  'rf-deck=/en/contact?tier=full&walk=off' \
  'rf-deck-id=/id/contact?tier=full&walk=off' \
  'rf-walk-prompt=/en/contact?tier=full&walk=on'
SCREENSHOTS=1 bunx playwright test e2e/screenshots.spec.ts -g "hq-rf" --workers=1
```

Expected: 9 PNGs in `screenshots/rf-final/` (1440x900, 834x1112, 390x844) plus `hq-rf-roof-*` and `hq-rf-comms-*` in `screenshots/` from the screenshots spec (6 tests pass; the lite mobile shot passes its `drawCalls > 35` wait because the whole RF frame stays above 35). Check: labels readable, the drawer's comms station shows the location and timezone, nothing sits in front of the elevator.

- [ ] **Step 5: Commit**

```bash
rtk git add e2e/roof.spec.ts
rtk git commit -m "test(rf): reduced motion check and a draw call cap that proves the lighter roof"
```

## Task 6: Docs and pull request

**Files:**
- Modify: `README.md` (routes table row for `/{locale}/contact`; one paragraph after the L3 paragraph)
- Modify: `AGENTS.md` (folder layout, the L4 and RF coordinates bullet, walkable floors bullets, scripts and e2e lines)
- Modify: `docs/superpowers/plans/2026-10-12-rf-roof-revamp.md` (record the pick and the measured numbers at the top)

**Interfaces:**
- Consumes: the pick, B, the concept numbers (Task 1I) and N (Task 5).
- Produces: up-to-date docs and the PR.

- [ ] **Step 1: README**

Replace the routes row

```markdown
| `/{locale}/contact` | Roof: beacon, channels, CV kiosk |
```

with

```markdown
| `/{locale}/contact` | About; in 3D, the RF roof deck: the comms station (channels, email), the CV kiosk, availability, location and timezone, and the "Meet me" walk |
```

and add after the L3 paragraph (the one that starts "On L3 (Labs) the floor is **Project Roads**"):

```markdown
On RF (`/en/contact`) the roof is a walkable deck: a road from the elevator into a round plaza around the centerpiece, the comms station (all contact channels and the email) to the north, the CV kiosk to the east and an about board with location and timezone to the south-west. Opening the contact or CV room makes the deck react. The first visit offers **Meet me**, a four-stop guided drive (about, availability, CV, contact).
```

- [ ] **Step 2: AGENTS.md**

Make these edits (each "find" line exists verbatim today):

1. After the line starting `  experience/floors/labs/       L3 Project Roads:` add:

```
  experience/floors/roof/       RF roof deck: pure layout.ts (buildRoofLayout, ROOF_DECK, ROOF_STOPS, roofActive), solids.ts (merged boxes, scenery geometry), kit.tsx (MergedBoxes, MergedEdges, PulseRings, HitBox, aboutCard), the picked scenery and Sky
```

2. After the line starting `  experience/fx/HoloIcon.tsx` add:

```
  experience/fx/BatchedLabels.tsx  all labels of a floor in one draw call (troika BatchedText; labelProps.ts holds the pure label type)
```

3. In the line starting `  experience/missions/`, change `walks.ts (L2/L3 walk definitions)` to `walks.ts (L2, L3 and RF walk definitions)`.

4. After the line starting `  deploy-smoke.ts` add:

```
  capture-dev.ts                owner review captures (dev routes or the served export) at 1440x900, 834x1112 and 390x844 with draw call metrics
```

5. In the `e2e/` line, change `Library + Roof (library-roof.spec.ts),` to `Library + Roof (library-roof.spec.ts), RF roof deck and its walk (roof.spec.ts),`.

6. Replace the bullet that starts `- L4 and RF coordinates live in pure modules:` up to `so scene and autopilot never disagree.` with:

```
- L4 coordinates live in `floors/library/layout.ts` (`LIBRARY`, `spineSlots(n)`, `postStop(i, n)`, `LIBRARY_STOPS`, `LIBRARY_DOORS`, `libraryObstacles()`); RF is the roof deck (RF revamp plan): `buildRoofLayout(input)` in `floors/roof/layout.ts` returns the floor (lead road, round 20 u plaza, doors, view zones, `arrival`), the stations (centerpiece, comms north, CV east, about south-west, each flush with a slab edge), `stops` (also `ROOF_STOPS`) and `channelSlots`; `ROOF_DECK.callPad` (x -20 to -12, z -4 to 4) stays free for the elevator call pad. They feed the navgrid, the door triggers, `roomTarget` and the R3F components, so scene and autopilot never disagree.
```

(keep the rest of that bullet, from `Deep links spawn in front of the content` on, unchanged).

7. In the walkable floors design bullet, change `now \`["L2", "L3"]\`` to `now \`["L2", "L3", "RF"]\``.

8. In the guided walks bullet, change `` `walks.ts` builds the L2 (`careerWalk`, oldest first, then the Workshop; type filters) and L3 (`labsWalk`, "Tour my projects": wing by wing in docking order, hero then featured pods, then both wing directory boards; wing filters) definitions. `` to:

```
`walks.ts` builds the L2 (`careerWalk`, oldest first, then the Workshop; type filters), L3 (`labsWalk`, "Tour my projects": wing by wing in docking order, hero then featured pods, then both wing directory boards; wing filters) and RF (`roofWalk`, "Meet me": about board, availability, CV kiosk, comms station; no filters) definitions.
```

9. Add one bullet at the end of "3D experience":

```
- RF roof deck: the owner picked <concept name> (RF revamp plan, Task 1 captures). The scenery reads `RoofSceneryProps` (layout, roof, profile, labels, tier, reducedMotion, `active` from `roofActive`) and reacts while RF:contact or RF:cv is open. Solids and edges are merged meshes, labels one `BatchedLabels`, rings one instanced `PulseRings` per group, clicks go through invisible `HitBox`es: the whole RF frame draws about N calls on lite (today's roof drew B). Reduced motion freezes every sweep, pulse and bob; the lite tier drops additive glow, icon halos and part of the decor (`roofDetail`).
```

Replace `<concept name>`, N and B with the pick and the measured numbers.

- [ ] **Step 3: Record the outcome in the repo plan copy**

At the top of `docs/superpowers/plans/2026-10-12-rf-roof-revamp.md`, under the title, add:

```markdown
> Outcome: the owner picked <concept name> on <date>. Lite draw calls at 1440x900: today's RF B, picked roof N. Walk on first visit: <yes or no>.
```

with the real values.

- [ ] **Step 4: Verify the docs**

Run: `bunx vitest run tests/content`
Expected: PASS (the safety lint and the repo-wide em dash scan accept the docs). Then `grep -nP '\x{2014}' README.md AGENTS.md docs/superpowers/plans/2026-10-12-rf-roof-revamp.md` prints nothing.

- [ ] **Step 5: Final verification**

Run: `bun run verify:quick && bun run e2e:changed`
Expected: verify:quick exits 0; `e2e:changed` runs at least `library-roof`, `roof`, `walk`, `missions`, `experience` (and the smoke specs for `scripts/capture-dev.ts`) and all pass. Then rebase on `origin/main` (parallel sessions: HUD polish, elevator pads, L4 revamp, landing, content) and rerun both commands if anything changed. If the elevator pads work landed a `FloorLayout` call pad field first, set it in `buildRoofLayout` from `ROOF_DECK.callPad` and keep the "keeps the spot in front of the elevator free" test.

- [ ] **Step 6: Commit and open the PR**

```bash
rtk git add README.md AGENTS.md docs/superpowers/plans/2026-10-12-rf-roof-revamp.md
rtk git commit -m "docs(rf): roof deck, Meet me walk, capture script and the RF revamp outcome"
rtk git push -u origin feat/rf-roof-revamp
gh pr create --title "RF roof revamp: <concept name> deck with Meet me walk, fewer draw calls" --body-file - <<'BODY'
Owner request: "also with the RF its looks so boring explore that".

What changed
- RF is a walkable roof deck (`buildRoofLayout`): a road from the elevator into a round plaza, the comms station north, the CV kiosk east, an about board south-west. The spot in front of the elevator stays free for the call pad.
- Picked concept: <concept name>. The deck reacts while the contact or CV room is open.
- Everything kept: channels, Email me, Copy email, the CV viewer modal and PDF, availability; location and timezone now show on the about board and in the comms station header.
- "Meet me" guided walk (about, availability, CV, contact), offered on the first RF visit.
- Lite draw calls on RF: B before, N after (one batched text mesh for all labels, merged solids and edges, instanced rings).

Tests
- Unit: roof layout (space rules, call pad, doors, view zones), solids, icons, label props, walk, room views, e2e plan.
- e2e: `roof.spec.ts` (deep link, contact actions, budget, reduced motion, Meet me), `library-roof.spec.ts` updated stops.

Screenshots: 1440x900, 834x1112, 390x844 attached below.
BODY
```

Attach `screenshots/rf-final/*.png` to the PR with the `github-pr-media` skill. Do not merge; the owner reviews.

---

## Self-review

**Spec coverage**
- "RF looks boring, explore": Task 1 (three distinct concepts on one deck), Task 2 (ships the pick).
- Task 1 = concepts in a dev-only `page.dev.tsx` route, never exported: Task 1H (`/dev/roof`, verify:quick checks the export has no dev page).
- Concepts (a) observatory with skyline, sweeping telescope, transmitting dish, channel constellation; (b) helipad with drone launching the CV or email, runway lights, beacon tower per channel; (c) signal garden with comms tower, signal rings per channel, availability neon sign, bench and story wall, "Meet me" walk: Task 1G, Task 4.
- Keep contact channels, copy email, CV viewer, availability, location and timezone: drawer untouched (`RoofBody`), meta added (Task 3), in-world labels (Task 1G `aboutCard`, availability signs), e2e (Task 3).
- Walkable-floor rules: Task 1B (`expectSpaceRules`), Task 2 (tower wiring), optional walk via the walk engine (Task 4).
- Performance tier and reduced motion: `roofDetail`, `PulseRings` (`uPulse`), lite blending, reduced-motion branches in every animated piece (Task 1C, 1F, 1G), e2e (Task 5).
- Fewer draw calls than today, troika BatchedText: Task 1E, harness measurement (Task 1I Step 3 and 4), `RF_MAX_DRAW_CALLS` (Tasks 3 and 5).
- Screenshots at 1440x900, 834x1112, 390x844, SwiftShader, desktop UA, ready signal, then STOP: Task 1I.
- After the pick: `buildRoofLayout(input)`, `roofWalk`, components (Task 2, 4); tests for layout and space rules (1B), render budget e2e (3, 5), contact actions e2e (3), deep link `/en/contact` (3); screenshots (5); README and docs (6); PR (6).
- Coordination: call pad reserved and tested (1B, 6), shared files touched minimally and called out (Global Constraints, Task 2 Step 5, Task 6 Step 5).

**Placeholder scan:** `<Pick>`, `<concept name>`, B, N and `<date>` are values the owner's answer and the measurements in Task 1I and Task 5 supply; each is defined where it is introduced, with the exact command that produces it. No TBD or "similar to" steps.

**Type consistency:** `buildRoofLayout`, `RoofLayout`, `ROOF_DECK`, `ROOF_STOPS`, `RoofStop`, `roofActive`, `RoofActive`, `channelSlots` (1B, used in 1G, 1H, 2, 3, 4); `Box`, `boxBuffers`, `boxEdgeBuffers`, `latticeSegments`, `skylineBoxes`, `skylineWindows`, `scatter`, `ringPoints`, `roofDetail` (1C, used in 1F, 1G); `ROOF_ICONS` (1D); `BatchedLabel`, `applyLabel`, `BatchedLabels` (1E); `RoofLabels { comms, email, cvTitle, cvHint, about, availability }`, `RoofSceneryProps`, `MergedBoxes`, `MergedEdges`, `PulseRings`, `PulseSource`, `HitBox`, `aboutCard`, `ROOF_BLUE`, `ROOF_CYAN`, `ROOF_VIOLET`, `CHANNEL_TONE` (1F, used in 1G, 1H, 2); `Roof({ data, labels, tier })` (2); `roofWalk`, `RoofWalkLabels` (4); `openRoof`, `RF_MAX_DRAW_CALLS` (3, used in 4, 5).

## Open risks

- `BatchedText` is marked experimental in troika 0.52 (needs WebGL2 float textures; SwiftShader has them). If labels do not render in the Task 1I captures, swap `BatchedLabels` for one drei `<Text>` per label inside the same component (same props) and accept about 15 more draw calls; the budget still holds.
- The draw call numbers in this plan are estimates until Task 1I measures them; `RF_MAX_DRAW_CALLS` is set from the measurement.
- RF joins `WALK_FLOORS`: the first-visit prompt now appears on RF in older specs (`library-roof`, `missions`); Task 4 Step 6 covers it.
- Shared files with parallel sessions (`messages/*.json`, `WalkLayer.tsx`, `config.ts`, `library-roof-layout.test.ts`, `library-roof.spec.ts`, `screenshots.spec.ts`): rebase before pushing.
- The roof slab grows from x 20 to 22 (the CV station flushes with it); the tower frame follows layouts automatically, but check the exterior intro shot in the screenshots.
