# Point-and-Go Interactables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free click/tap-to-move with point-and-go: hovering (or a first tap on) a glowing in-world target highlights it with its name, and clicking it (or a second tap, or the Go chip) drives the rover there along the road and runs the target's action, all driven by one shared interactables registry.

**Architecture:** A pure registry (`src/experience/interact/registry.ts`) derives every target of a floor (doors, elevator call pads, L2 teleporters, RF and L1 stations, the L1 kiosk, L3 and L4 boards) from the existing layouts and the locale-resolved `ExperienceData`, and accepts extra targets from other features. Pure pick logic (`pick.ts`) gives each target a pick volume, decides click versus tap, and performs the action through injected mission helpers (`goToRoom`, `runMissionSteps`), so every drive is a cancellable mission leg on the road. One R3F component per tower (`InteractLayer.tsx`) puts all pick volumes of the current floor into one invisible instanced mesh (zero draw calls), writes the hovered target to the store, and draws the outline, destination ring and floating label (at most 4 draw calls, only while something is hovered); the HUD (`InteractStatus.tsx`) announces it, shows the Go chip after a first tap and a one-time hint after an empty click.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript strict, three.js with React Three Fiber 9 and drei 10, zustand 5, next-intl, Tailwind CSS 4, Vitest 5 (node and jsdom), Playwright on SwiftShader, Bun.

**Repo:** `ShinyQ/ShinyQ-HQ`, base `main` at `e2a6c53`. Work on branch `feat/point-and-go`.

## Global Constraints

- Owner request (verbatim): "i dont like click to walk freely i only want hover click to walk to a point (like elevator) the projects and etc".
- Remove click/tap-on-the-floor free movement everywhere: the `goto` intent, the floor slab click in `FloorLevel`, the click marker, the controls hint "Move: click floor" / "Gerak: klik lantai" (and "Move: tap floor" / "Gerak: ketuk lantai"), and the docs.
- Keep keyboard driving (WASD/arrows, Shift boost) and the touch joystick plus boost button unchanged.
- Point-and-go: desktop hover highlights a target (outline plus floating label with its name, pointer cursor; default cursor elsewhere); a click drives along the road (autopilot `roadRoute` through a mission `drive` step, `host3d.driveTo`) and on arrival runs the action: doors and stations open their room drawer, the elevator call pad opens the floor picker, L2 teleporters open the year picker, the L1 kiosk opens Ask Rover, L3 wing boards open the pods palette, the L4 archive board opens the posts palette. L1 certification badges and L4 research paper plates keep their own click.
- Touch (decided here): the first tap on a target selects it (outline, label, a "Go to {label}" chip in the HUD bottom band, aria-live text); a second tap on the same target, or the Go chip, drives there. A tap on another target moves the selection; a tap on empty floor clears it. Hover never comes from touch pointers.
- Clicking or tapping empty floor never moves the rover. It closes an open room drawer (no drive), clears a tap selection, and shows "Click a glowing object to go there." (coarse: "Tap a glowing object, then tap it again to go there.") once per browser session (`sessionStorage["hq:point-hint"]`).
- One raycast against registry footprints: one invisible `instancedMesh` of unit boxes per mounted layer (R3F events, `visible={false}`, no draw call), no per-object listeners on targets. Render budget stays under 150 draw calls and 30k triangles per floor with a target hovered (`expectRenderBudget`).
- Performance tiers: the additive fill box only on the full tier; lite draws the outline, destination ring and label only.
- Reduced motion: the highlight does not pulse (constant opacity 0.9).
- Accessibility: keyboard users keep Cmd-K, Ask Rover and guided walks; the hovered or selected target is announced through an `aria-live="polite"` region; the Go chip is a real button at least 44 px tall.
- Walks, missions, deep links, door triggers, pads and teleporters keep working; manual input (keys, joystick) cancels a point-and-go drive like any mission leg, and a guided walk pauses on `interact`.
- Shared registry contract (two parallel plans consume it): field names `id`, `floor`, `kind`, `label`, `at`, `bounds`, `height`, `action` and the kinds `door | elevator-pad | teleporter | station | kiosk | board` stay exactly as in "Shared interface contract" below.
- No em dashes (U+2014) anywhere: code, comments, copy, docs, commits, PR text (`tests/content/safety.test.ts` scans).
- Bilingual: every UI string lives in `messages/en.json` and `messages/id.json` with identical keys and placeholders (`tests/unit/ui-copy.test.ts`); Indonesian is natural and professional.
- Pure modules (`interact/registry.ts`, `interact/pick.ts`, `interact/runtime.ts`, `nav/*.ts`, floor `layout.ts` files) stay free of React and three side effects. HUD and scene talk only through the store and intents (the test probe `interactRuntime` is read by Playwright only).
- Static export, no new routes, no new runtime dependencies.
- Before every push: `bun run verify:quick` then `E2E_PORT=4391 bun run e2e:changed`. This work changes `e2e/hq.ts`, so run `E2E_PORT=4391 bun run e2e:full` once before opening the PR. Never run two e2e suites at once on one machine.
- Conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), the `rtk` git wrapper, one PR, never merge without the owner.

## Shared interface contract (final registry signatures)

`src/experience/interact/registry.ts` (pure):

```ts
export type InteractKind = "door" | "elevator-pad" | "teleporter" | "station" | "kiosk" | "board";

export type InteractAction =
  | { type: "open-room"; room: RoomId }
  | { type: "elevator-picker" }
  | { type: "teleport-picker"; year: number }
  | { type: "command"; command: string };

export interface Interactable {
  /** Stable: `${floor}:${short kind}:${key}`, e.g. "L3:door:voice-ai-contact-center", "L1:pad:elevator", "L2:teleporter:2021". */
  id: string;
  floor: FloorId;
  kind: InteractKind;
  /** Name shown on hover, already resolved for the tower's locale (the 3D chunk only has that locale). */
  label: string;
  /** Approach point the rover drives to (door pad center, pad center, the stop in front of a board or station). */
  at: Vec2;
  /** Hover and click footprint, floor-local x/z. */
  bounds: Rect;
  /** Pick volume height (u); also places the floating label. Defaults per kind (`PICK_HEIGHT` in pick.ts). */
  height?: number;
  action: InteractAction;
}

/** UI labels for targets without a content title (`hud.pads.floorTitle`, `hud.interact.*`, `hud.launcher.askRover`, `hud.rooms`). */
export interface InteractLabels {
  elevator: string;
  teleporter: (year: number) => string;
  kiosk: string;
  board: (wing: string) => string;
  archive: string;
  rooms: Record<StructuralRoom, string>;
}

export interface InteractData {
  experience: ExperienceData;
  labels: InteractLabels;
}

/** Built-in targets of one floor, in order: pads, doors and stations, then floor extras (L1 kiosk, boards). */
export function baseInteractables(floor: FloorId, layouts: FloorLayouts, data: InteractData): Interactable[];
/** Built-in targets plus registered extras for that floor (an extra whose id already exists is dropped). */
export function interactablesFor(floor: FloorId, layouts: FloorLayouts, data: InteractData): Interactable[];
/** Adds targets to a floor (for example the L1 Highlights Hall); returns the dispose function. Throws when an item's `floor` differs. */
export function registerExtraInteractables(floor: FloorId, items: readonly Interactable[]): () => void;
/** Registered extras of a floor; the same array instance until the extras change (safe for useSyncExternalStore). */
export function extraInteractables(floor: FloorId): readonly Interactable[];
/** Called whenever extras are registered or disposed. */
export function onInteractablesChange(listener: () => void): () => void;
export function mergeInteractables(base: readonly Interactable[], extras: readonly Interactable[]): Interactable[];
```

`FloorLayouts` is the existing `Record<FloorId, FloorLayout>`, exported as a named type from `src/experience/types.ts`.

Command strings understood by `parseCommand` (pick.ts): `"terminal"` (Ask Rover), `"palette:pods" | "palette:rooms" | "palette:posts"`, `"cv"` (CV viewer). Unknown commands drive to the target and do nothing else.

For consumers inside the canvas: `useInteractables(floor, layouts, data)` (`src/experience/interact/useInteractables.ts`) re-renders when extras change; `interactRuntime.items` (`src/experience/interact/runtime.ts`) always holds the current floor's full list (base plus extras), written by `InteractLayer`.

Deviations from the brief, on purpose: `label` is one resolved string, not `{ en, id }` (the 3D chunk receives only the active locale's `ExperienceData`; switching language reloads the tower), and `teleport-picker` carries its `year` (the year picker needs it as `from`). `interactablesFor` takes the `InteractData` third argument because content titles live there.

---

## File Structure

Create:

- `src/experience/interact/registry.ts`: target types, `InteractLabels`, `InteractData`, `baseInteractables`, `interactablesFor`, extras (`registerExtraInteractables`, `extraInteractables`, `onInteractablesChange`), `mergeInteractables`. Pure.
- `src/experience/interact/pick.ts`: `PICK_HEIGHT`, `LABEL_LIFT`, `REACH`, `pickVolume`, `labelAnchor`, `isDragClick`, `canPoint`, `HoverState`, `clickDecision`, `highlightOpacity`, `InteractCommand`, `parseCommand`, `InteractDeps`, `reach`, `performInteract`. Pure.
- `src/experience/interact/runtime.ts`: `interactRuntime` (current floor items, projection, `screenOf`, highlight opacity), exposed as `window.__hq.interact`. Pure.
- `src/experience/interact/useInteractables.ts`: React hook over the registry.
- `src/experience/interact/InteractLayer.tsx`: the invisible hit mesh, highlight, label and pointer handlers (R3F).
- `src/experience/interact/missed.ts`: `onWorldMissed` (Canvas `onPointerMissed`) and `POINT_HINT_KEY`.
- `src/hud/InteractStatus.tsx`: aria-live text, Go chip, one-time hint.
- `tests/unit/interact-registry.test.ts`, `tests/unit/interact-pick.test.ts`, `tests/unit/interact-missed.test.ts`, `tests/hud/InteractStatus.test.tsx`.
- `e2e/interact.spec.ts`.
- `docs/superpowers/plans/2026-10-12-point-and-go.md`: this plan, committed (AGENTS.md: write a plan before a phase).

Modify:

- `src/experience/types.ts`: `FloorLayouts` type.
- `src/experience/input/intents.ts`: `interact` intent in, `goto` intent out.
- `src/experience/scene/Director.tsx`: `interact` case (performInteract), `goto` case out.
- `src/store/useHQStore.ts`: `hover`, `pointHint`, `setHover`, `setPointHint`.
- `src/hud/walk/WalkLayer.tsx`: `interact` pauses a walk; `goto` out.
- `src/experience/scene/Scene.tsx`, `src/experience/Experience.tsx`: mount `InteractLayer`, labels, `onPointerMissed`, `__hq.interact`, `__hq.marker` out.
- `src/experience/rover/Rover.tsx`, `src/experience/rover/runtime.ts`: click marker out; targets behind the rover never light up.
- `src/experience/tower/FloorLevel.tsx`, `src/experience/tower/Tower.tsx`, `src/experience/fx/PadGlow.tsx`: floor click and pad click out.
- `src/experience/floors/career/CareerRooms.tsx`, `src/experience/floors/labs/Pods.tsx`, `src/experience/floors/labs/Hub.tsx`, `src/experience/floors/library/decor/common.tsx`, `src/experience/floors/library/decor/NewsroomDecor.tsx`, `src/experience/floors/Library.tsx`, `src/experience/floors/roof/kit.tsx`, `src/experience/floors/roof/SignalGarden.tsx`, `src/experience/floors/lobby/MissionKiosk.tsx`: per-object click handlers out.
- Delete `src/experience/floors/interact.ts` (`roomHandlers`, only used by the roof `HitBox`).
- Comments: `src/experience/rover/boost.ts`, `src/experience/nav/doors.ts`, `src/experience/nav/pads.ts`, `src/experience/fx/BatchedLabels.tsx`, `tests/unit/boost.test.ts`.
- `src/hud/Hud.tsx`: `InteractStatus` in the bottom band.
- `messages/en.json`, `messages/id.json`: `hud.interact.*`, new `hud.hintFine`, `hud.hintCoarse`, `hud.canvasDescription`.
- `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts`: `interact` spec and rule.
- `e2e/hq.ts`: point-and-go helpers; `railScreenPoint` out.
- `e2e/experience.spec.ts`, `e2e/career.spec.ts`, `e2e/pads.spec.ts`, `e2e/screenshots.spec.ts`.
- `tests/unit/store.test.ts`.
- `README.md`, `AGENTS.md`, `docs/superpowers/specs/agent-hq/03-rover-camera-input.md`, `docs/superpowers/specs/2026-10-09-agent-hq-design.md`, `docs/superpowers/specs/agent-hq/08-quality-acceptance.md`.

Out of scope: the dev-only prototypes (`src/experience/prototype/**`, `/dev/floors`, `/dev/library`) keep their own click-to-move harness and `protoFloors.hint` copy; they never ship in the export.

Task order: 1 registry, 2 pick logic, 3 intent, store and Director, 4 the hit layer and its e2e, 5 retire click-to-move and per-object handlers, 6 HUD status and copy, 7 screenshots, 8 docs, 9 full verification and PR.

---

### Task 1: The interactables registry

**Files:**
- Create: `src/experience/interact/registry.ts`
- Modify: `src/experience/types.ts` (append `FloorLayouts`)
- Modify: `messages/en.json`, `messages/id.json` (new `hud.interact` with `teleporter`, `board`, `archive`)
- Create: `docs/superpowers/plans/2026-10-12-point-and-go.md` (copy of this plan)
- Test: `tests/unit/interact-registry.test.ts`

**Interfaces:**
- Consumes: `buildFloorLayouts`, `LOBBY`, `FLOOR_IDS`, `ROVER` (`src/experience/config.ts`); `buildCareerRoad`, `careerLayoutInput`, `REPO_WALL` (`floors/career/layout.ts`); `buildLabsLayout`, `LABS` (`floors/labs/layout.ts`); `buildLibraryLayout` (`floors/library/layout.ts`); `libraryLayoutInput`, `LibraryZone` (`floors/library/model.ts`); `buildRoofLayout` (`floors/roof/layout.ts`); `roomTarget(room, id, layouts, years)` (`missions/host3d.ts`); `StructuralRoom` (`missions/rooms.ts`); `padHalf(door)` (`nav/doors.ts`); `PAD`, `padRadius(pad)` (`nav/pads.ts`); `ExperienceData`, `DoorTrigger`, `PadTrigger`, `Rect`, `Vec2` (`types.ts`).
- Produces: everything in "Shared interface contract" above, plus `export type FloorLayouts = Record<FloorId, FloorLayout>` in `src/experience/types.ts`.

- [ ] **Step 1: Create the branch and commit this plan into the repo**

```bash
rtk git fetch origin && rtk git switch -c feat/point-and-go origin/main
mkdir -p docs/superpowers/plans
cp /Users/shinyq/.copilot/session-state/d439b68f-b2e6-4b77-9feb-f9099e8cd824/files/plans/r4-i-point-and-go.md docs/superpowers/plans/2026-10-12-point-and-go.md
rtk git add docs/superpowers/plans/2026-10-12-point-and-go.md
rtk git commit -m "docs: point-and-go implementation plan"
```

Expected: a new branch `feat/point-and-go` with one commit (if you read this plan from another location, copy it from there).

- [ ] **Step 2: Add the label messages**

In `messages/en.json`, the `hud` object ends with `"boost": "Boost"`. Replace

```json
    "boost": "Boost"
  },
  "drawer": {
```

with

```json
    "boost": "Boost",
    "interact": {
      "teleporter": "Teleporter {year}",
      "board": "{wing} directory",
      "archive": "Post archive"
    }
  },
  "drawer": {
```

In `messages/id.json`, replace

```json
    "boost": "Turbo"
  },
  "drawer": {
```

with

```json
    "boost": "Turbo",
    "interact": {
      "teleporter": "Teleporter {year}",
      "board": "Direktori {wing}",
      "archive": "Arsip tulisan"
    }
  },
  "drawer": {
```

- [ ] **Step 3: Write the failing test**

Create `tests/unit/interact-registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { buildExperienceData } from "@/content/experience";
import type { FloorId } from "@/content/schema";
import { buildFloorLayouts, FLOOR_IDS, ROVER } from "@/experience/config";
import { careerLayoutInput } from "@/experience/floors/career/layout";
import { buildLabsLayout } from "@/experience/floors/labs/layout";
import { buildLibraryLayout } from "@/experience/floors/library/layout";
import { libraryLayoutInput } from "@/experience/floors/library/model";
import {
  interactablesFor,
  onInteractablesChange,
  registerExtraInteractables,
  type InteractData,
  type InteractLabels,
  type Interactable,
} from "@/experience/interact/registry";
import { roomTarget } from "@/experience/missions/host3d";
import { buildNavGrid, nearestWalkable } from "@/experience/nav/navgrid";

type Messages = typeof en;
const names = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };

function labelsFrom(m: Messages): InteractLabels {
  return {
    elevator: m.hud.pads.floorTitle,
    teleporter: (year) => m.hud.interact.teleporter.replace("{year}", String(year)),
    kiosk: m.hud.launcher.askRover,
    board: (wing) => m.hud.interact.board.replace("{wing}", wing),
    archive: m.hud.interact.archive,
    rooms: m.hud.rooms,
  };
}

function setup(locale: "en" | "id") {
  const experience = buildExperienceData(locale, names);
  const layouts = buildFloorLayouts(experience.years.length, {
    labs: experience.labs.pods,
    career: careerLayoutInput(experience.career),
    library: libraryLayoutInput(experience.library),
  });
  const data: InteractData = { experience, labels: labelsFrom((locale === "en" ? en : id) as Messages) };
  const items = Object.fromEntries(FLOOR_IDS.map((f) => [f, interactablesFor(f, layouts, data)])) as Record<FloorId, Interactable[]>;
  return { experience, layouts, data, items };
}

const { experience, layouts, data, items } = setup("en");
const find = (floor: FloorId, key: string) => items[floor].find((i) => i.id === key);

describe("interactablesFor on the real content", () => {
  it("puts the elevator call pad first on every floor, and it opens the floor picker", () => {
    for (const floor of FLOOR_IDS) {
      const [first] = items[floor];
      expect(first.id, floor).toBe(`${floor}:pad:elevator`);
      expect(first.kind).toBe("elevator-pad");
      expect(first.action).toEqual({ type: "elevator-picker" });
      expect(first.at).toEqual(layouts[floor].approach);
      expect(first.label).toBe(en.hud.pads.floorTitle);
    }
  });

  it("adds one teleporter per year on L2 that opens the year picker from its own year", () => {
    const teleporters = items.L2.filter((i) => i.kind === "teleporter");
    expect(teleporters.map((t) => t.action)).toEqual(experience.years.map((year) => ({ type: "teleport-picker", year })));
    for (const t of teleporters) {
      const year = (t.action as { year: number }).year;
      const pad = layouts.L2.pads!.find((p) => p.year === year)!;
      expect(t.id).toBe(`L2:teleporter:${year}`);
      expect(t.at).toEqual(pad.at);
      expect(t.label).toBe(`Teleporter ${year}`);
    }
    for (const floor of ["L1", "L3", "L4", "RF"] as const) expect(items[floor].some((i) => i.kind === "teleporter"), floor).toBe(false);
  });

  it("turns every door into a target that drives to the door pad and opens its room", () => {
    for (const floor of FLOOR_IDS) {
      for (const door of layouts[floor].doors ?? []) {
        const kind = floor === "RF" ? "station" : "door";
        const item = find(floor, `${floor}:${kind}:${door.room.slice(3)}`);
        expect(item, door.room).toBeDefined();
        expect(item!.kind).toBe(kind);
        expect(item!.action).toEqual({ type: "open-room", room: door.room });
        expect(item!.at).toEqual(door.at);
        expect(item!.at).toEqual(roomTarget(undefined, door.room, layouts, experience.years));
      }
    }
  });

  it("names rooms after their content", () => {
    for (const p of buildLabsLayout(experience.labs.pods).placed) expect(find("L3", `L3:door:${p.pod.slug}`)?.label).toBe(p.pod.title);
    for (const s of buildLibraryLayout(libraryLayoutInput(experience.library)).stations) {
      const post = experience.library.posts.find((x) => `L4:${x.slug}` === s.room);
      if (post) expect(find("L4", `L4:door:${post.slug}`)?.label).toBe(post.title);
    }
    expect(experience.library.research.length).toBeGreaterThan(0);
    expect(find("L4", "L4:door:research")?.label).toBe(en.hud.rooms.research);
    const entry = experience.career.years[0].entries[0];
    expect(find("L2", `L2:door:${entry.slug}`)?.label).toContain(entry.role);
    expect(find("L2", "L2:door:workshop")?.label).toBe(en.hud.rooms.workshop);
    expect(find("RF", "RF:station:contact")?.label).toBe(en.hud.rooms.contact);
    expect(find("RF", "RF:station:cv")?.label).toBe(en.hud.rooms.cv);
  });

  it("adds the L1 profile hologram, skills wall and Ask Rover kiosk", () => {
    expect(items.L1.map((i) => i.id)).toEqual(["L1:pad:elevator", "L1:station:profile", "L1:station:skills", "L1:kiosk:ask-rover"]);
    expect(find("L1", "L1:station:profile")!.at).toEqual(roomTarget(undefined, "L1:profile", layouts, experience.years));
    expect(find("L1", "L1:station:skills")!.action).toEqual({ type: "open-room", room: "L1:skills" });
    const kiosk = find("L1", "L1:kiosk:ask-rover")!;
    expect(kiosk.kind).toBe("kiosk");
    expect(kiosk.action).toEqual({ type: "command", command: "terminal" });
    expect(kiosk.label).toBe(en.hud.launcher.askRover);
  });

  it("adds both L3 wing directory boards, which open the projects palette from their stop", () => {
    const labs = buildLabsLayout(experience.labs.pods);
    for (const wing of ["software", "ai"] as const) {
      const board = find("L3", `L3:board:${wing}`)!;
      expect(board.kind).toBe("board");
      expect(board.action).toEqual({ type: "command", command: "palette:pods" });
      expect(board.at).toEqual(labs.boards[wing].stop);
      expect(board.label).toBe(`${experience.labs.wings[wing]} directory`);
    }
  });

  it("adds the L4 archive board only while older posts overflow the floor", () => {
    const library = buildLibraryLayout(libraryLayoutInput(experience.library));
    const board = find("L4", "L4:board:archive");
    if (library.board) {
      expect(board?.action).toEqual({ type: "command", command: "palette:posts" });
      expect(board?.at).toEqual(library.board.stop);
    } else {
      expect(board).toBeUndefined();
    }
  });

  it("keeps ids unique, footprints on the slab and every approach point on drivable floor", () => {
    for (const floor of FLOOR_IDS) {
      const list = items[floor];
      expect(new Set(list.map((i) => i.id)).size, floor).toBe(list.length);
      const grid = buildNavGrid(layouts[floor], ROVER.radius);
      const slab = layouts[floor].bounds;
      for (const item of list) {
        expect(item.floor, item.id).toBe(floor);
        expect(item.label.trim(), item.id).not.toBe("");
        const b = item.bounds;
        expect(b.maxX - b.minX, item.id).toBeGreaterThan(0);
        expect(b.maxZ - b.minZ, item.id).toBeGreaterThan(0);
        expect(b.minX, item.id).toBeGreaterThanOrEqual(slab.minX - 1e-6);
        expect(b.maxX, item.id).toBeLessThanOrEqual(slab.maxX + 1e-6);
        expect(b.minZ, item.id).toBeGreaterThanOrEqual(slab.minZ - 1e-6);
        expect(b.maxZ, item.id).toBeLessThanOrEqual(slab.maxZ + 1e-6);
        expect(item.height ?? 1, item.id).toBeGreaterThan(0);
        const near = nearestWalkable(grid, item.at);
        expect(near, item.id).not.toBeNull();
        expect(Math.hypot(near!.x - item.at.x, near!.z - item.at.z), item.id).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it("resolves every label in the active locale", () => {
    const indonesian = setup("id");
    expect(indonesian.items.L1[0].label).toBe(id.hud.pads.floorTitle);
    expect(indonesian.items.L1.find((i) => i.id === "L1:station:profile")!.label).toBe(id.hud.rooms.profile);
    expect(indonesian.items.L1.find((i) => i.id === "L1:kiosk:ask-rover")!.label).toBe(id.hud.launcher.askRover);
    expect(indonesian.items.L3.find((i) => i.id === "L3:board:software")!.label).toBe(`Direktori ${indonesian.experience.labs.wings.software}`);
  });
});

describe("registerExtraInteractables", () => {
  const hall: Interactable = {
    id: "L1:station:highlights-demo",
    floor: "L1",
    kind: "station",
    label: "Demo",
    at: { x: 0, z: 12 },
    bounds: { minX: -1, maxX: 1, minZ: 13, maxZ: 15 },
    height: 3,
    action: { type: "command", command: "palette:pods" },
  };

  it("adds extra targets to their floor until disposed, and tells listeners", () => {
    let calls = 0;
    const off = onInteractablesChange(() => calls++);
    const dispose = registerExtraInteractables("L1", [hall]);
    const withHall = interactablesFor("L1", layouts, data);
    expect(withHall[withHall.length - 1]).toEqual(hall);
    expect(interactablesFor("L3", layouts, data).some((i) => i.id === hall.id)).toBe(false);
    dispose();
    expect(interactablesFor("L1", layouts, data).some((i) => i.id === hall.id)).toBe(false);
    expect(calls).toBe(2);
    off();
  });

  it("keeps the built-in target when an extra reuses its id", () => {
    const dispose = registerExtraInteractables("L1", [{ ...hall, id: "L1:kiosk:ask-rover", label: "Clash" }]);
    expect(interactablesFor("L1", layouts, data).filter((i) => i.id === "L1:kiosk:ask-rover").map((i) => i.label)).toEqual([en.hud.launcher.askRover]);
    dispose();
  });

  it("refuses items that belong to another floor", () => {
    expect(() => registerExtraInteractables("L3", [hall])).toThrow(/L1:station:highlights-demo/);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `rtk bunx vitest run tests/unit/interact-registry.test.ts`
Expected: FAIL with `Failed to resolve import "@/experience/interact/registry" from "tests/unit/interact-registry.test.ts". Does the file exist?`

- [ ] **Step 5: Add the `FloorLayouts` type**

Append to `src/experience/types.ts` (after the `FloorLayout` interface):

```ts
/** Every floor's layout, as built by `buildFloorLayouts`. */
export type FloorLayouts = Record<FloorId, FloorLayout>;
```

- [ ] **Step 6: Write the registry**

Create `src/experience/interact/registry.ts`:

```ts
import type { FloorId, RoomId, Wing } from "@/content/schema";
import { LOBBY } from "../config";
import { buildCareerRoad, careerLayoutInput, REPO_WALL } from "../floors/career/layout";
import { buildLabsLayout, LABS, type LabsLayout } from "../floors/labs/layout";
import { buildLibraryLayout } from "../floors/library/layout";
import { libraryLayoutInput, type LibraryLayout, type LibraryZone } from "../floors/library/model";
import { buildRoofLayout } from "../floors/roof/layout";
import { roomTarget } from "../missions/host3d";
import type { StructuralRoom } from "../missions/rooms";
import { padHalf } from "../nav/doors";
import { PAD, padRadius } from "../nav/pads";
import type { DoorTrigger, ExperienceData, FloorLayouts, PadTrigger, Rect, Vec2 } from "../types";

/**
 * Point-and-go targets (owner request): everything the visitor can hover and click to drive the rover
 * there. Derived from the floor layouts and the locale-resolved ExperienceData, so the scene, the HUD,
 * the autopilot and the tests agree. Pure: no React, no three.
 */
export type InteractKind = "door" | "elevator-pad" | "teleporter" | "station" | "kiosk" | "board";

export type InteractAction =
  | { type: "open-room"; room: RoomId }
  | { type: "elevator-picker" }
  | { type: "teleport-picker"; year: number }
  | { type: "command"; command: string };

export interface Interactable {
  /** Stable: `${floor}:${short kind}:${key}`, e.g. "L3:door:voice-ai-contact-center", "L1:pad:elevator", "L2:teleporter:2021". */
  id: string;
  floor: FloorId;
  kind: InteractKind;
  /** Name shown on hover, already resolved for the tower's locale (the 3D chunk only has that locale). */
  label: string;
  /** Approach point the rover drives to (door pad center, pad center, the stop in front of a board or station). */
  at: Vec2;
  /** Hover and click footprint, floor-local x/z. */
  bounds: Rect;
  /** Pick volume height (u); also places the floating label. Defaults per kind (`PICK_HEIGHT` in pick.ts). */
  height?: number;
  action: InteractAction;
}

/** UI labels for targets without a content title (`hud.pads.floorTitle`, `hud.interact.*`, `hud.launcher.askRover`, `hud.rooms`). */
export interface InteractLabels {
  elevator: string;
  teleporter: (year: number) => string;
  kiosk: string;
  board: (wing: string) => string;
  archive: string;
  rooms: Record<StructuralRoom, string>;
}

export interface InteractData {
  experience: ExperienceData;
  labels: InteractLabels;
}

const WINGS: readonly Wing[] = ["software", "ai"];
/** Pads: the floating icon tops out here. */
const PAD_HEIGHT = PAD.iconY + PAD.iconSize / 2;
/** L2 rooms are open bays with a neon frame about 2.2 u tall. */
const CAREER_ROOM_HEIGHT = 2.4;
/** L4 stations (blog plinths are low, so their volume reaches their billboard titles). */
const STATION_HEIGHT: Record<LibraryZone, number> = { blog: 2, research: 3.2, models: 2.6, talks: 2.6 };
const KIOSK_HEIGHT = 3.2;
const PROFILE_HEIGHT = 7;
const ARCHIVE_HEIGHT = 4;
/** Door items without a known room footprint keep a plain door-pad volume this tall. */
const DOOR_HEIGHT = 2.6;

/** Rooms with a UI label instead of a content title. */
const STRUCTURAL: Partial<Record<RoomId, StructuralRoom>> = {
  "L1:profile": "profile",
  "L1:skills": "skills",
  "L2:workshop": "workshop",
  "L4:research": "research",
  "L4:publications": "publications",
  "L4:talks": "talks",
  "RF:contact": "contact",
  "RF:cv": "cv",
};

type Footprint = { rect: Rect; height: number };

const rectAround = (c: Vec2, w: number, d: number): Rect => ({ minX: c.x - w / 2, maxX: c.x + w / 2, minZ: c.z - d / 2, maxZ: c.z + d / 2 });
const bare = ({ minX, maxX, minZ, maxZ }: Rect): Rect => ({ minX, maxX, minZ, maxZ });
const union = (a: Rect, b: Rect): Rect => ({
  minX: Math.min(a.minX, b.minX),
  maxX: Math.max(a.maxX, b.maxX),
  minZ: Math.min(a.minZ, b.minZ),
  maxZ: Math.max(a.maxZ, b.maxZ),
});

/** A door's trigger pad as an axis-aligned rect (doors face along x or z). */
function doorRect(door: DoorTrigger): Rect {
  const { along, across } = padHalf(door);
  const f = door.facing ?? { x: 0, z: 1 };
  const hx = Math.abs(f.x) * along + Math.abs(f.z) * across;
  const hz = Math.abs(f.z) * along + Math.abs(f.x) * across;
  return { minX: door.at.x - hx, maxX: door.at.x + hx, minZ: door.at.z - hz, maxZ: door.at.z + hz };
}

function roomLabel(room: RoomId, data: InteractData): string {
  const structural = STRUCTURAL[room];
  if (structural) return data.labels.rooms[structural];
  const slug = room.slice(3);
  const { experience } = data;
  if (room.startsWith("L2:")) {
    const entry = experience.career.years.flatMap((y) => y.entries).find((e) => e.slug === slug);
    if (entry) return entry.org ? `${entry.role} · ${entry.org}` : entry.role;
  }
  if (room.startsWith("L3:")) {
    const pod = experience.labs.pods.find((p) => p.slug === slug);
    if (pod) return pod.title;
  }
  if (room.startsWith("L4:")) {
    const post = experience.library.posts.find((p) => p.slug === slug);
    if (post) return post.title;
  }
  return slug;
}

function padItem(floor: FloorId, pad: PadTrigger, labels: InteractLabels): Interactable {
  const r = padRadius(pad);
  const bounds = rectAround(pad.at, r * 2, r * 2);
  const at = { x: pad.at.x, z: pad.at.z };
  if (pad.kind === "teleport" && pad.year !== undefined) {
    return { id: `${floor}:teleporter:${pad.year}`, floor, kind: "teleporter", label: labels.teleporter(pad.year), at, bounds, height: PAD_HEIGHT, action: { type: "teleport-picker", year: pad.year } };
  }
  return { id: `${floor}:pad:elevator`, floor, kind: "elevator-pad", label: labels.elevator, at, bounds, height: PAD_HEIGHT, action: { type: "elevator-picker" } };
}

/** Every door of the floor; RF doors are stations (comms, CV), the rest are room doors. */
function doorItems(floor: FloorId, layouts: FloorLayouts, data: InteractData, rooms: ReadonlyMap<RoomId, Footprint>): Interactable[] {
  const kind = floor === "RF" ? "station" : "door";
  return (layouts[floor].doors ?? []).map((door) => {
    const pad = doorRect(door);
    const room = rooms.get(door.room);
    const at = roomTarget(undefined, door.room, layouts, data.experience.years);
    return {
      id: `${floor}:${kind}:${door.room.slice(3)}`,
      floor,
      kind,
      label: roomLabel(door.room, data),
      at: { x: at.x, z: at.z },
      bounds: room ? union(room.rect, pad) : pad,
      height: room?.height ?? DOOR_HEIGHT,
      action: { type: "open-room", room: door.room },
    };
  });
}

function lobbyItems(layouts: FloorLayouts, data: InteractData): Interactable[] {
  const { hologram, skillsWall, kiosk } = LOBBY;
  const stop = (room: RoomId) => {
    const at = roomTarget(undefined, room, layouts, data.experience.years);
    return { x: at.x, z: at.z };
  };
  return [
    {
      id: "L1:station:profile",
      floor: "L1",
      kind: "station",
      label: data.labels.rooms.profile,
      at: stop("L1:profile"),
      bounds: rectAround(hologram, hologram.radius * 2, hologram.radius * 2),
      height: PROFILE_HEIGHT,
      action: { type: "open-room", room: "L1:profile" },
    },
    {
      id: "L1:station:skills",
      floor: "L1",
      kind: "station",
      label: data.labels.rooms.skills,
      at: stop("L1:skills"),
      bounds: rectAround(skillsWall, skillsWall.w, skillsWall.d),
      height: skillsWall.h + skillsWall.plinth,
      action: { type: "open-room", room: "L1:skills" },
    },
    {
      id: "L1:kiosk:ask-rover",
      floor: "L1",
      kind: "kiosk",
      label: data.labels.kiosk,
      // On the open floor south of the kiosk, clear of its obstacle by more than the rover radius.
      at: { x: kiosk.x, z: kiosk.z - kiosk.d / 2 - 2.5 },
      bounds: rectAround(kiosk, kiosk.w, kiosk.d),
      height: KIOSK_HEIGHT,
      action: { type: "command", command: "terminal" },
    },
  ];
}

function labsBoards(labs: LabsLayout, data: InteractData): Interactable[] {
  return WINGS.map((wing) => {
    const board = labs.boards[wing];
    return {
      id: `L3:board:${wing}`,
      floor: "L3",
      kind: "board",
      label: data.labels.board(data.experience.labs.wings[wing]),
      at: { x: board.stop.x, z: board.stop.z },
      bounds: bare(board),
      height: LABS.board.h,
      action: { type: "command", command: "palette:pods" },
    };
  });
}

function archiveBoard(library: LibraryLayout, data: InteractData): Interactable[] {
  if (!library.board) return [];
  return [
    {
      id: "L4:board:archive",
      floor: "L4",
      kind: "board",
      label: data.labels.archive,
      at: { x: library.board.stop.x, z: library.board.stop.z },
      bounds: bare(library.board.rect),
      height: ARCHIVE_HEIGHT,
      action: { type: "command", command: "palette:posts" },
    },
  ];
}

/** Built-in targets of one floor, in order: pads, doors and stations, then floor extras (L1 kiosk, boards). */
export function baseInteractables(floor: FloorId, layouts: FloorLayouts, data: InteractData): Interactable[] {
  const pads = (layouts[floor].pads ?? []).map((pad) => padItem(floor, pad, data.labels));
  const { experience } = data;
  switch (floor) {
    case "L1":
      return [...pads, ...lobbyItems(layouts, data)];
    case "L2": {
      const road = buildCareerRoad(careerLayoutInput(experience.career));
      const rooms = new Map<RoomId, Footprint>(road.rooms.map((r) => [r.id, { rect: rectAround(r.center, r.w, r.d), height: CAREER_ROOM_HEIGHT }]));
      rooms.set(road.workshop.room, { rect: bare(road.workshop.wall), height: REPO_WALL.height });
      return [...pads, ...doorItems(floor, layouts, data, rooms)];
    }
    case "L3": {
      const labs = buildLabsLayout(experience.labs.pods);
      const rooms = new Map<RoomId, Footprint>(labs.placed.map((p) => [p.room, { rect: bare(p.rect), height: LABS.wallHeight }]));
      return [...pads, ...doorItems(floor, layouts, data, rooms), ...labsBoards(labs, data)];
    }
    case "L4": {
      const library = buildLibraryLayout(libraryLayoutInput(experience.library));
      const rooms = new Map<RoomId, Footprint>(library.stations.map((s) => [s.room, { rect: bare(s.rect), height: STATION_HEIGHT[s.zone] }]));
      return [...pads, ...doorItems(floor, layouts, data, rooms), ...archiveBoard(library, data)];
    }
    case "RF": {
      const roof = buildRoofLayout({ channels: experience.roof.channels.length });
      const rooms = new Map<RoomId, Footprint>([
        ["RF:contact", { rect: bare(roof.comms), height: 4 }],
        ["RF:cv", { rect: bare(roof.cv), height: 3.6 }],
      ]);
      return [...pads, ...doorItems(floor, layouts, data, rooms)];
    }
  }
}

const extras = new Map<FloorId, Set<readonly Interactable[]>>();
const snapshots = new Map<FloorId, readonly Interactable[]>();
const listeners = new Set<() => void>();

function changed() {
  snapshots.clear();
  listeners.forEach((listener) => listener());
}

/** Adds targets to a floor (for example the L1 Highlights Hall); returns the dispose function. */
export function registerExtraInteractables(floor: FloorId, items: readonly Interactable[]): () => void {
  const stray = items.find((item) => item.floor !== floor);
  if (stray) throw new Error(`Interactable ${stray.id} belongs to ${stray.floor}, not ${floor}`);
  const set = extras.get(floor) ?? new Set<readonly Interactable[]>();
  extras.set(floor, set);
  set.add(items);
  changed();
  return () => {
    if (set.delete(items)) changed();
  };
}

/** Registered extras of a floor; the same array instance until the extras change (safe for useSyncExternalStore). */
export function extraInteractables(floor: FloorId): readonly Interactable[] {
  let list = snapshots.get(floor);
  if (!list) {
    list = [...(extras.get(floor) ?? [])].flat();
    snapshots.set(floor, list);
  }
  return list;
}

/** Called whenever extras are registered or disposed. */
export function onInteractablesChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function mergeInteractables(base: readonly Interactable[], more: readonly Interactable[]): Interactable[] {
  const ids = new Set(base.map((item) => item.id));
  return [...base, ...more.filter((item) => !ids.has(item.id))];
}

/** Built-in targets plus registered extras for that floor (an extra whose id already exists is dropped). */
export function interactablesFor(floor: FloorId, layouts: FloorLayouts, data: InteractData): Interactable[] {
  return mergeInteractables(baseInteractables(floor, layouts, data), extraInteractables(floor));
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `rtk bunx vitest run tests/unit/interact-registry.test.ts`
Expected: PASS, `Test Files  1 passed (1)`, `Tests  12 passed (12)`.

If "keeps ids unique, footprints on the slab ..." fails on a bound, print the offending item (`console.log(item)`) and fix the footprint source in `baseInteractables` (never loosen the test). If it fails on the approach distance for one item, check that `at` comes from `roomTarget` or the layout stop exactly.

- [ ] **Step 8: Typecheck, lint and the copy test**

Run: `rtk bun run typecheck && rtk bun run lint && rtk bunx vitest run tests/unit/ui-copy.test.ts tests/content/safety.test.ts`
Expected: no type or lint errors; both test files PASS.

- [ ] **Step 9: Commit**

```bash
rtk git add src/experience/types.ts src/experience/interact/registry.ts tests/unit/interact-registry.test.ts messages/en.json messages/id.json
rtk git commit -m "feat: interactables registry for point-and-go targets"
```

---
### Task 2: Pick logic (volumes, click versus tap, commands, performing an action)

**Files:**
- Create: `src/experience/interact/pick.ts`
- Test: `tests/unit/interact-pick.test.ts`

**Interfaces:**
- Consumes: `Interactable`, `InteractKind` (Task 1); `DRAG_THRESHOLD` (`input/intents.ts`); `PAD`, `PickerRequest` (`nav/pads.ts`); `MissionStatus`, `PaletteFilter` (`missions/host.ts`); `MissionStep`, `RoomId` (`@/content/schema`); `Vec2` (`types.ts`).
- Produces:
  - `PICK_HEIGHT: Record<InteractKind, number>`, `LABEL_LIFT = 0.7`, `REACH = { pad: PAD.radius, point: 0.8 }`.
  - `interface PickVolume { center: [number, number, number]; size: [number, number, number] }`, `pickVolume(item: Pick<Interactable, "bounds" | "height" | "kind">): PickVolume`, `labelAnchor(item): [number, number, number]`.
  - `isDragClick(delta: number, pointerType: string): boolean`.
  - `interface PointState { phase: string; ride: unknown; beam: unknown; picker: unknown }`, `canPoint(s: PointState): boolean`.
  - `type HoverVia = "pointer" | "tap"`, `interface HoverState { item: Interactable; via: HoverVia }`, `clickDecision(hover: HoverState | null, item: Interactable, pointerType: string): "go" | "select"`.
  - `highlightOpacity(t: number, reducedMotion: boolean): number`.
  - `type InteractCommand = { type: "terminal" } | { type: "palette"; filter: PaletteFilter } | { type: "cv" }`, `parseCommand(command: string): InteractCommand | null`.
  - `interface InteractDeps { rover: () => Vec2; goToRoom: (room: RoomId) => void; runSteps: (id: string, steps: readonly MissionStep[]) => Promise<MissionStatus>; openPicker: (picker: PickerRequest) => void; command: (command: InteractCommand) => void }`.
  - `reach(item: Pick<Interactable, "action">): number`, `performInteract(item: Interactable, deps: InteractDeps): Promise<"done" | "cancelled">`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/interact-pick.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { MissionStep } from "@/content/schema";
import {
  canPoint,
  clickDecision,
  highlightOpacity,
  isDragClick,
  LABEL_LIFT,
  labelAnchor,
  parseCommand,
  performInteract,
  PICK_HEIGHT,
  pickVolume,
  REACH,
  reach,
  type InteractDeps,
} from "@/experience/interact/pick";
import type { Interactable } from "@/experience/interact/registry";
import { PAD, type PickerRequest } from "@/experience/nav/pads";

const pod: Interactable = {
  id: "L3:door:demo",
  floor: "L3",
  kind: "door",
  label: "Demo",
  at: { x: 10, z: 2 },
  bounds: { minX: 6, maxX: 14, minZ: 3, maxZ: 10 },
  height: 2.6,
  action: { type: "open-room", room: "L3:demo" },
};
const lift: Interactable = {
  id: "L3:pad:elevator",
  floor: "L3",
  kind: "elevator-pad",
  label: "Take the elevator",
  at: { x: -21, z: 0 },
  bounds: { minX: -22.5, maxX: -19.5, minZ: -1.5, maxZ: 1.5 },
  action: { type: "elevator-picker" },
};
const teleporter: Interactable = {
  ...lift,
  id: "L2:teleporter:2021",
  floor: "L2",
  kind: "teleporter",
  label: "Teleporter 2021",
  at: { x: 40, z: 6.5 },
  bounds: { minX: 38.5, maxX: 41.5, minZ: 5, maxZ: 8 },
  action: { type: "teleport-picker", year: 2021 },
};
const board: Interactable = { ...pod, id: "L3:board:software", kind: "board", label: "Product Engineering directory", at: { x: -10.7, z: -9.5 }, action: { type: "command", command: "palette:pods" } };

function deps(over: Partial<InteractDeps> = {}): InteractDeps {
  return {
    rover: () => ({ x: 0, z: 0 }),
    goToRoom: vi.fn(),
    runSteps: vi.fn(async () => "done" as const),
    openPicker: vi.fn(),
    command: vi.fn(),
    ...over,
  };
}

describe("pick volumes", () => {
  it("stands a box on the footprint, as tall as the target", () => {
    expect(pickVolume(pod)).toEqual({ center: [10, 1.3, 6.5], size: [8, 2.6, 7] });
  });

  it("falls back to the kind's height", () => {
    expect(pickVolume(lift).size[1]).toBe(PICK_HEIGHT["elevator-pad"]);
  });

  it("floats the label above the box", () => {
    expect(labelAnchor(pod)).toEqual([10, 2.6 + LABEL_LIFT, 6.5]);
  });
});

describe("isDragClick", () => {
  it("keeps a short press a click or a tap and turns a longer one into a drag", () => {
    expect(isDragClick(6, "mouse")).toBe(false);
    expect(isDragClick(6.5, "mouse")).toBe(true);
    expect(isDragClick(7, "pen")).toBe(true);
    expect(isDragClick(8, "touch")).toBe(false);
    expect(isDragClick(9, "touch")).toBe(true);
    expect(isDragClick(7, "")).toBe(true);
  });
});

describe("canPoint", () => {
  const base = { phase: "explore", ride: null, beam: null, picker: null };

  it("points while exploring or with a room open", () => {
    expect(canPoint(base)).toBe(true);
    expect(canPoint({ ...base, phase: "room" })).toBe(true);
  });

  it("never during the boot, the intro, a ride, a beam, a picker or another overlay", () => {
    for (const phase of ["boot", "intro", "elevator", "hologram", "terminal", "palette", "static"]) expect(canPoint({ ...base, phase }), phase).toBe(false);
    expect(canPoint({ ...base, ride: {} })).toBe(false);
    expect(canPoint({ ...base, beam: {} })).toBe(false);
    expect(canPoint({ ...base, picker: { kind: "floor" } })).toBe(false);
  });
});

describe("clickDecision", () => {
  it("goes at once with a mouse or a pen", () => {
    expect(clickDecision(null, pod, "mouse")).toBe("go");
    expect(clickDecision({ item: pod, via: "pointer" }, pod, "pen")).toBe("go");
  });

  it("selects on the first tap and goes on a second tap of the same target", () => {
    expect(clickDecision(null, pod, "touch")).toBe("select");
    expect(clickDecision({ item: pod, via: "tap" }, pod, "touch")).toBe("go");
  });

  it("moves the selection when another target is tapped, and never goes from a mouse hover", () => {
    expect(clickDecision({ item: lift, via: "tap" }, pod, "touch")).toBe("select");
    expect(clickDecision({ item: pod, via: "pointer" }, pod, "touch")).toBe("select");
  });
});

describe("highlightOpacity", () => {
  it("holds still under reduced motion", () => {
    expect(highlightOpacity(0, true)).toBe(0.9);
    expect(highlightOpacity(1.3, true)).toBe(0.9);
  });

  it("pulses gently otherwise", () => {
    const values = [0, 0.2, 0.4, 0.8].map((t) => highlightOpacity(t, false));
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0.4);
      expect(v).toBeLessThanOrEqual(0.9);
    }
    expect(new Set(values).size).toBeGreaterThan(1);
  });
});

describe("parseCommand", () => {
  it("knows Ask Rover, the palettes and the CV viewer", () => {
    expect(parseCommand("terminal")).toEqual({ type: "terminal" });
    expect(parseCommand("cv")).toEqual({ type: "cv" });
    expect(parseCommand("palette:pods")).toEqual({ type: "palette", filter: "pods" });
    expect(parseCommand("palette:posts")).toEqual({ type: "palette", filter: "posts" });
    expect(parseCommand("palette:rooms")).toEqual({ type: "palette", filter: "rooms" });
  });

  it("ignores anything else", () => {
    expect(parseCommand("palette:nope")).toBeNull();
    expect(parseCommand("launch")).toBeNull();
    expect(parseCommand("")).toBeNull();
  });
});

describe("reach", () => {
  it("counts the whole pad as arrived, and a short radius elsewhere", () => {
    expect(reach(lift)).toBe(PAD.radius);
    expect(reach(teleporter)).toBe(PAD.radius);
    expect(reach(board)).toBe(REACH.point);
  });
});

describe("performInteract", () => {
  it("sends rooms through goToRoom (elevator, drive along the road, open)", async () => {
    const d = deps();
    await expect(performInteract(pod, d)).resolves.toBe("done");
    expect(d.goToRoom).toHaveBeenCalledWith("L3:demo");
    expect(d.runSteps).not.toHaveBeenCalled();
  });

  it("drives to a pad before it opens the floor picker", async () => {
    const order: string[] = [];
    const d = deps({
      runSteps: vi.fn(async (id: string, steps: readonly MissionStep[]) => {
        order.push(`drive ${id} ${JSON.stringify(steps)}`);
        return "done" as const;
      }),
      openPicker: vi.fn((picker: PickerRequest) => void order.push(`picker ${JSON.stringify(picker)}`)),
    });
    await expect(performInteract(lift, d)).resolves.toBe("done");
    expect(order).toEqual([`drive interact:L3:pad:elevator ${JSON.stringify([{ kind: "drive", to: { x: -21, z: 0 } }])}`, `picker {"kind":"floor"}`]);
  });

  it("opens the year picker at once when the rover already stands on the teleporter", async () => {
    const d = deps({ rover: () => ({ x: 40.5, z: 7 }) });
    await expect(performInteract(teleporter, d)).resolves.toBe("done");
    expect(d.runSteps).not.toHaveBeenCalled();
    expect(d.openPicker).toHaveBeenCalledWith({ kind: "year", from: 2021 });
  });

  it("does nothing more when the drive is cancelled by manual input", async () => {
    const d = deps({ runSteps: vi.fn(async () => "cancelled" as const) });
    await expect(performInteract(teleporter, d)).resolves.toBe("cancelled");
    expect(d.openPicker).not.toHaveBeenCalled();
  });

  it("drives to a board, then runs its command", async () => {
    const d = deps();
    await performInteract(board, d);
    expect(d.runSteps).toHaveBeenCalledWith("interact:L3:board:software", [{ kind: "drive", to: { x: -10.7, z: -9.5 } }]);
    expect(d.command).toHaveBeenCalledWith({ type: "palette", filter: "pods" });
  });

  it("only drives for an unknown command", async () => {
    const d = deps();
    await performInteract({ ...board, action: { type: "command", command: "launch" } }, d);
    expect(d.runSteps).toHaveBeenCalledTimes(1);
    expect(d.command).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk bunx vitest run tests/unit/interact-pick.test.ts`
Expected: FAIL with `Failed to resolve import "@/experience/interact/pick" from "tests/unit/interact-pick.test.ts". Does the file exist?`

- [ ] **Step 3: Write the pick logic**

Create `src/experience/interact/pick.ts`:

```ts
import type { MissionStep, RoomId } from "@/content/schema";
import { DRAG_THRESHOLD } from "../input/intents";
import type { MissionStatus, PaletteFilter } from "../missions/host";
import { PAD, type PickerRequest } from "../nav/pads";
import type { Vec2 } from "../types";
import type { InteractKind, Interactable } from "./registry";

/**
 * Point-and-go pick logic: pick volumes, click versus tap, the highlight pulse and what a target does
 * once the rover gets there. Pure: no React, no three, no store (the Director injects `InteractDeps`).
 */

/** Height (u) of a pick volume when the registry entry gives none. */
export const PICK_HEIGHT: Record<InteractKind, number> = { door: 2.6, "elevator-pad": 2.9, teleporter: 2.9, station: 4, kiosk: 3.2, board: 7 };
/** The floating label sits this far above the pick volume. */
export const LABEL_LIFT = 0.7;
/** The rover counts as already there inside this radius: the whole pad for pickers, a short radius elsewhere. */
export const REACH = { pad: PAD.radius, point: 0.8 } as const;

export interface PickVolume {
  center: [number, number, number];
  size: [number, number, number];
}

/** The box the pointer hits: the footprint, standing on the floor, `height` tall. */
export function pickVolume(item: Pick<Interactable, "bounds" | "height" | "kind">): PickVolume {
  const h = item.height ?? PICK_HEIGHT[item.kind];
  const { minX, maxX, minZ, maxZ } = item.bounds;
  return { center: [(minX + maxX) / 2, h / 2, (minZ + maxZ) / 2], size: [maxX - minX, h, maxZ - minZ] };
}

/** Where the floating label stands (floor-local): above the middle of the pick volume. */
export function labelAnchor(item: Pick<Interactable, "bounds" | "height" | "kind">): [number, number, number] {
  const { center, size } = pickVolume(item);
  return [center[0], size[1] + LABEL_LIFT, center[2]];
}

/** A press that travelled past the drag threshold rotated the view; it is not a click or a tap. */
export function isDragClick(delta: number, pointerType: string): boolean {
  const limit = DRAG_THRESHOLD[pointerType as keyof typeof DRAG_THRESHOLD] ?? DRAG_THRESHOLD.mouse;
  return delta > limit;
}

export interface PointState {
  phase: string;
  ride: unknown;
  beam: unknown;
  picker: unknown;
}

/** Pointing works while exploring or with a room open, never during a ride, a beam, a picker or another overlay. */
export function canPoint(s: PointState): boolean {
  return (s.phase === "explore" || s.phase === "room") && !s.ride && !s.beam && !s.picker;
}

export type HoverVia = "pointer" | "tap";

/** The target under the mouse (`pointer`) or picked by a first tap (`tap`). */
export interface HoverState {
  item: Interactable;
  via: HoverVia;
}

/** Mouse and pen go at once; touch selects first and goes on a second tap of the same target. */
export function clickDecision(hover: HoverState | null, item: Interactable, pointerType: string): "go" | "select" {
  if (pointerType !== "touch") return "go";
  return hover?.via === "tap" && hover.item.id === item.id ? "go" : "select";
}

/** Highlight opacity: a gentle pulse, constant under reduced motion. */
export function highlightOpacity(t: number, reducedMotion: boolean): number {
  return reducedMotion ? 0.9 : 0.65 + 0.25 * Math.sin(t * 4);
}

export type InteractCommand = { type: "terminal" } | { type: "palette"; filter: PaletteFilter } | { type: "cv" };

const PALETTE_FILTERS: readonly PaletteFilter[] = ["pods", "rooms", "posts"];

/** `"terminal"`, `"cv"` or `"palette:<pods|rooms|posts>"`; anything else is null. */
export function parseCommand(command: string): InteractCommand | null {
  if (command === "terminal") return { type: "terminal" };
  if (command === "cv") return { type: "cv" };
  const [head, filter] = command.split(":");
  if (head === "palette" && PALETTE_FILTERS.includes(filter as PaletteFilter)) return { type: "palette", filter: filter as PaletteFilter };
  return null;
}

/** What `performInteract` needs from the world (the Director passes the real ones). */
export interface InteractDeps {
  rover: () => Vec2;
  /** Elevator, drive and open through the mission runner (`goToRoom` in missions/bridge.ts). */
  goToRoom: (room: RoomId) => void;
  /** Ad hoc mission steps (`runMissionSteps` in missions/bridge.ts): manual input cancels them. */
  runSteps: (id: string, steps: readonly MissionStep[]) => Promise<MissionStatus>;
  openPicker: (picker: PickerRequest) => void;
  command: (command: InteractCommand) => void;
}

export function reach(item: Pick<Interactable, "action">): number {
  const picker = item.action.type === "elevator-picker" || item.action.type === "teleport-picker";
  return picker ? REACH.pad : REACH.point;
}

/**
 * Drives to the target along the road (a mission leg, so keys and the joystick cancel it), then runs
 * its action. Rooms go through `goToRoom`, which drives to the door pad and opens the drawer.
 */
export async function performInteract(item: Interactable, deps: InteractDeps): Promise<"done" | "cancelled"> {
  const { action } = item;
  if (action.type === "open-room") {
    deps.goToRoom(action.room);
    return "done";
  }
  const here = deps.rover();
  if (Math.hypot(here.x - item.at.x, here.z - item.at.z) > reach(item)) {
    const status = await deps.runSteps(`interact:${item.id}`, [{ kind: "drive", to: { x: item.at.x, z: item.at.z } }]);
    if (status !== "done") return "cancelled";
  }
  if (action.type === "elevator-picker") deps.openPicker({ kind: "floor" });
  else if (action.type === "teleport-picker") deps.openPicker({ kind: "year", from: action.year });
  else {
    const command = parseCommand(action.command);
    if (command) deps.command(command);
  }
  return "done";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `rtk bunx vitest run tests/unit/interact-pick.test.ts`
Expected: PASS, `Tests  20 passed (20)`.

- [ ] **Step 5: Typecheck and lint**

Run: `rtk bun run typecheck && rtk bun run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
rtk git add src/experience/interact/pick.ts tests/unit/interact-pick.test.ts
rtk git commit -m "feat: point-and-go pick logic and actions"
```

---

### Task 3: The `interact` intent, the hover state and the Director

**Files:**
- Modify: `src/experience/input/intents.ts:1-20` (import and `Intent` union)
- Modify: `src/store/useHQStore.ts` (imports, `HQState`, initial state, actions)
- Modify: `src/experience/scene/Director.tsx` (imports, intent handler)
- Modify: `src/hud/walk/WalkLayer.tsx:148`
- Test: `tests/unit/store.test.ts`

**Interfaces:**
- Consumes: `HoverState`, `performInteract`, `InteractDeps` (Task 2); `Interactable` (Task 1); `goToRoom`, `runMissionSteps`, `cancelMission`, `isAutoOpenClaimed` (`missions/bridge.ts`); `openCv`, `openPalette`, `openTerminal` (`@/hud/events`).
- Produces:
  - Intent `{ type: "interact"; item: Interactable }` (the `goto` intent stays until Task 5).
  - Store: `hover: HoverState | null`, `pointHint: boolean`, `setHover(hover: HoverState | null): void` (ignores a repeat of the same id and `via`), `setPointHint(on: boolean): void`. Neither is persisted.
  - Director: on `interact`, cancels a running mission, cancels an elevator approach (`toDoor`), then runs `performInteract` with the real deps (pickers close an open room first and beep; commands: `terminal` emits the `terminal` intent, `palette` calls `openPalette(filter)`, `cv` calls `openCv()`).
  - WalkLayer: an `interact` intent pauses a driving walk, like `move`.

- [ ] **Step 1: Write the failing store test**

In `tests/unit/store.test.ts`, add the import under the existing ones:

```ts
import type { Interactable } from "@/experience/interact/registry";
```

and add inside `describe("HQ store", () => { ... })`, after the test `"holds the teleport beam and refuses a picker while it runs"`:

```ts
  it("holds the point-and-go target, ignores repeats and never persists it", () => {
    const item: Interactable = {
      id: "L3:door:demo",
      floor: "L3",
      kind: "door",
      label: "Demo",
      at: { x: 0, z: 0 },
      bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 },
      action: { type: "open-room", room: "L3:demo" },
    };
    expect(store.getState().hover).toBeNull();
    expect(store.getState().pointHint).toBe(false);
    const seen: (string | null)[] = [];
    const off = store.subscribe((s, prev) => {
      if (s.hover !== prev.hover) seen.push(s.hover ? `${s.hover.item.id}/${s.hover.via}` : null);
    });
    store.getState().setHover({ item, via: "pointer" });
    store.getState().setHover({ item, via: "pointer" });
    store.getState().setHover({ item, via: "tap" });
    store.getState().setHover(null);
    store.getState().setHover(null);
    off();
    expect(seen).toEqual(["L3:door:demo/pointer", "L3:door:demo/tap", null]);
    store.getState().setPointHint(true);
    expect(store.getState().pointHint).toBe(true);
    store.getState().setHover({ item, via: "tap" });
    expect(storage.data.get(STORE_KEY) ?? "").not.toMatch(/hover|pointHint|L3:door:demo/);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk bunx vitest run tests/unit/store.test.ts -t "point-and-go"`
Expected: FAIL with `expected undefined to be null` (the store has no `hover` yet).

- [ ] **Step 3: Add the store state**

In `src/store/useHQStore.ts`, add under `import type { Beam } from "@/experience/nav/teleport";`:

```ts
import type { HoverState } from "@/experience/interact/pick";
```

In `interface HQState`, replace

```ts
  /** L2 teleport beam in progress, advanced by the Director. */
  beam: Beam | null;
```

with

```ts
  /** L2 teleport beam in progress, advanced by the Director. */
  beam: Beam | null;
  /** Point-and-go: the target under the mouse (`via: "pointer"`) or picked by a first tap (`via: "tap"`). Not persisted. */
  hover: HoverState | null;
  /** The one-time "click a glowing object" hint is showing (`interact/missed.ts`). Not persisted. */
  pointHint: boolean;
```

and replace

```ts
  setBeam: (beam: Beam | null) => void;
```

with

```ts
  setBeam: (beam: Beam | null) => void;
  /** Sets the point-and-go target; a repeat of the same target and source is ignored (pointer moves fire often). */
  setHover: (hover: HoverState | null) => void;
  setPointHint: (on: boolean) => void;
```

In the initial state, replace

```ts
        picker: null,
        beam: null,
```

with

```ts
        picker: null,
        beam: null,
        hover: null,
        pointHint: false,
```

In the actions, replace

```ts
        setBeam: (beam) => set({ beam }),
```

with

```ts
        setBeam: (beam) => set({ beam }),
        setHover: (hover) => {
          const current = get().hover;
          if (current?.item.id === hover?.item.id && current?.via === hover?.via) return;
          set({ hover });
        },
        setPointHint: (pointHint) => set({ pointHint }),
```

(`partialize` already persists only `visited`, `firstVisit` and `locale`; do not change it.)

- [ ] **Step 4: Run the store tests to verify they pass**

Run: `rtk bunx vitest run tests/unit/store.test.ts`
Expected: PASS, every test in the file including the new one.

- [ ] **Step 5: Add the `interact` intent**

In `src/experience/input/intents.ts`, replace

```ts
import type { FloorId, RoomId } from "@/content/schema";
import type { Vec2 } from "../types";
```

with

```ts
import type { FloorId, RoomId } from "@/content/schema";
import type { Interactable } from "../interact/registry";
import type { Vec2 } from "../types";
```

and replace

```ts
  | { type: "goto"; point: Vec2 }
```

with

```ts
  | { type: "goto"; point: Vec2 }
  /** Point-and-go: a click (or a second tap, or the Go chip) on a registry target. The Director drives there and runs its action. */
  | { type: "interact"; item: Interactable }
```

- [ ] **Step 6: Handle `interact` in the Director**

In `src/experience/scene/Director.tsx`, replace

```ts
import { openTerminal } from "@/hud/events";
```

with

```ts
import { openCv, openPalette, openTerminal } from "@/hud/events";
```

replace

```ts
import { cancelMission, isAutoOpenClaimed } from "../missions/bridge";
```

with

```ts
import { performInteract } from "../interact/pick";
import { cancelMission, goToRoom, isAutoOpenClaimed, runMissionSteps } from "../missions/bridge";
```

replace

```ts
      if ((intent.type === "goto" || intent.type === "elevator" || intent.type === "cancel" || intent.type === "scrub" || intent.type === "teleport") && missionRunning()) cancelMission();
```

with

```ts
      if ((intent.type === "goto" || intent.type === "interact" || intent.type === "elevator" || intent.type === "cancel" || intent.type === "scrub" || intent.type === "teleport") && missionRunning()) cancelMission();
```

and insert this case right before `case "elevator":`:

```ts
        case "interact": {
          // Point-and-go (owner request): drive to the target along the road, then run its action. The
          // drive is a mission leg, so manual input cancels it like any mission.
          if (s.phase !== "explore" && s.phase !== "room" && s.phase !== "elevator") break;
          if (s.beam || s.picker || (s.ride && s.ride.stage !== "toDoor")) break;
          if (s.ride) {
            s.cancelRide();
            controller?.clearPath();
          }
          void performInteract(intent.item, {
            rover: () => (local.controller ? { x: local.controller.pose.x, z: local.controller.pose.z } : { x: roverRuntime.x, z: roverRuntime.z }),
            goToRoom,
            runSteps: runMissionSteps,
            openPicker: (picker) => {
              if (store.getState().phase === "room") store.getState().closeRoom();
              store.getState().openPicker(picker);
              if (store.getState().picker) audio.play("beep");
            },
            command: (command) => {
              if (command.type === "terminal") intents.emit({ type: "terminal" });
              else if (command.type === "palette") openPalette(command.filter);
              else openCv();
            },
          });
          break;
        }
```

Why the picker cannot open twice: the drive is a mission leg, so the pad latch sees `following` while it runs; `performInteract` resolves in the same animation frame callback that sees the drive done, before the Director's next frame, so the picker is already open (`explore` false) when the latch next looks and it simply latches the pad.

- [ ] **Step 7: Pause a walk on `interact`**

In `src/hud/walk/WalkLayer.tsx`, replace

```ts
      if (intent.type === "move" || intent.type === "goto" || intent.type === "scrub") {
```

with

```ts
      if (intent.type === "move" || intent.type === "goto" || intent.type === "interact" || intent.type === "scrub") {
```

- [ ] **Step 8: Verify**

Run: `rtk bun run typecheck && rtk bun run lint && rtk bunx vitest run tests/unit/store.test.ts tests/unit/intents.test.ts tests/unit/interact-pick.test.ts`
Expected: no errors; all three files PASS. Nothing emits `interact` yet, so the tower behaves exactly as before.

- [ ] **Step 9: Commit**

```bash
rtk git add src/experience/input/intents.ts src/store/useHQStore.ts src/experience/scene/Director.tsx src/hud/walk/WalkLayer.tsx tests/unit/store.test.ts
rtk git commit -m "feat: interact intent, hover state and the Director's point-and-go drive"
```

---
### Task 4: The hit layer: hover, highlight, label and click

**Files:**
- Create: `src/experience/interact/runtime.ts`
- Create: `src/experience/interact/useInteractables.ts`
- Create: `src/experience/interact/InteractLayer.tsx`
- Modify: `src/experience/scene/Scene.tsx` (labels type, mount)
- Modify: `src/experience/Experience.tsx` (interact labels, `__hq.interact`)
- Modify: `src/experience/rover/Rover.tsx` (targets behind the rover never light up)
- Modify: `e2e/hq.ts` (append helpers)
- Modify: `e2e/pads.spec.ts` (a teleporter click now drives there first)
- Modify: `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts`
- Test: `e2e/interact.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`baseInteractables`, `extraInteractables`, `mergeInteractables`, `onInteractablesChange`, `InteractData`, `InteractLabels`, `Interactable`), Task 2 (`pickVolume`, `labelAnchor`, `canPoint`, `clickDecision`, `isDragClick`, `highlightOpacity`), Task 3 (store `hover`, `setHover`; intent `interact`); `floorY` (`config.ts`); `FONTS` (`tower/primitives.tsx`).
- Produces:
  - `interactRuntime: { items: Interactable[]; floorY: number; highlight: number; project: ((p: { x: number; y: number; z: number }) => { x: number; y: number } | null) | null; screenOf(id: string, lift?: number): { x: number; y: number } | null }` (`window.__hq.interact`).
  - `useInteractables(floor: FloorId, layouts: FloorLayouts, data: InteractData): Interactable[]`.
  - `<InteractLayer layouts={FloorLayouts} data={InteractData} tier={GpuTier} />`: mounted once in `Scene`.
  - `SceneLabels.interact: InteractLabels`.
  - e2e helpers in `e2e/hq.ts`: `InteractSnapshot`, `TargetQuery`, `DESKTOP_SAFE`, `PHONE_SAFE`, `interactablesOf(page)`, `visibleTarget(page, query)`, `targetPoint(page, id, lift?)`, `hoveredTarget(page)`, `hoverTarget(page, id)`, `emptyFloorPoint(page)`, `highlightOf(page)`.
  - e2e plan: spec `interact`; `src/experience/interact/**` and `src/hud/InteractStatus.tsx` map to `career`, `experience`, `interact`, `pads`.

- [ ] **Step 1: Add the e2e helpers**

Append to `e2e/hq.ts`:

```ts
/** A point-and-go target as read from `window.__hq.interact` (current floor). */
export interface InteractSnapshot {
  id: string;
  kind: string;
  label: string;
  at: { x: number; z: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  action: { type: string; room?: string; year?: number; command?: string };
}

type ScreenPoint = { x: number; y: number };

type InteractWindow = Window & {
  __hq: {
    interact: {
      items: InteractSnapshot[];
      highlight: number;
      project: ((p: { x: number; y: number; z: number }) => ScreenPoint | null) | null;
      screenOf: (id: string, lift?: number) => ScreenPoint | null;
    };
    rover: { x: number; y: number; z: number; cameraForward: { x: number; z: number } };
    store: { getState: () => { hover: { item: { id: string }; via: string } | null } };
  };
};

/** CSS px kept clear of the HUD on a desktop viewport (top bar and profile card, bottom band, elevator panel). */
export const DESKTOP_SAFE = { top: 200, bottom: 200, side: 140 };
/** The same on a 390 x 844 phone (two top rows, the bottom band with the joystick). */
export const PHONE_SAFE = { top: 190, bottom: 320, side: 70 };

export interface TargetQuery {
  kinds: string[];
  safe?: { top: number; bottom: number; side: number };
  /** Skip targets whose approach point is closer than this to the rover (u). */
  minDistance?: number;
}

/** The current floor's targets. */
export async function interactablesOf(page: Page): Promise<InteractSnapshot[]> {
  return page.evaluate(() =>
    (window as unknown as InteractWindow).__hq.interact.items.map(({ id, kind, label, at, bounds, action }) => ({ id, kind, label, at, bounds, action })),
  );
}

/**
 * The target of `kinds` nearest to the rover whose pick volume shows on the bare canvas inside `safe`,
 * at least 100 px from the rover on screen (a click on the rover opens Ask Rover). Fails when none shows.
 */
export async function visibleTarget(page: Page, { kinds, safe = DESKTOP_SAFE, minDistance = 0 }: TargetQuery): Promise<InteractSnapshot> {
  const found = await page.evaluate(
    ({ kinds, safe, minDistance }) => {
      const { interact, rover } = (window as unknown as InteractWindow).__hq;
      if (!interact.project) return null;
      const self = interact.project({ x: rover.x, y: rover.y + 1, z: rover.z });
      const w = window.innerWidth;
      const h = window.innerHeight;
      const hits = interact.items
        .map((i) => ({ i, d: Math.hypot(i.at.x - rover.x, i.at.z - rover.z), p: interact.screenOf(i.id) }))
        .filter(({ i, d }) => kinds.includes(i.kind) && d >= minDistance)
        .filter(({ p }) => p !== null && p.x > safe.side && p.x < w - safe.side && p.y > safe.top && p.y < h - safe.bottom)
        .filter(({ p }) => document.elementFromPoint(p!.x, p!.y)?.tagName === "CANVAS")
        .filter(({ p }) => !self || Math.hypot(p!.x - self.x, p!.y - self.y) > 100)
        .sort((a, b) => a.d - b.d);
      const hit = hits[0]?.i;
      return hit ? { id: hit.id, kind: hit.kind, label: hit.label, at: hit.at, bounds: hit.bounds, action: hit.action } : null;
    },
    { kinds, safe, minDistance },
  );
  if (!found) throw new Error(`No ${kinds.join(" or ")} target on screen`);
  return found;
}

/** Screen position (CSS px) of a target's pick volume near its top, so the rover in front of it never takes the click. */
export async function targetPoint(page: Page, id: string, lift = 0.85): Promise<ScreenPoint> {
  const point = await page.evaluate(({ id, lift }) => (window as unknown as InteractWindow).__hq.interact.screenOf(id, lift), { id, lift });
  if (!point) throw new Error(`${id} is not on screen`);
  return point;
}

/** The store's point-and-go target: `{ id, via }` or null. */
export async function hoveredTarget(page: Page): Promise<{ id: string; via: string } | null> {
  return page.evaluate(() => {
    const hover = (window as unknown as InteractWindow).__hq.store.getState().hover;
    return hover ? { id: hover.item.id, via: hover.via } : null;
  });
}

/** Moves the mouse onto a target and waits until it is the hovered one. */
export async function hoverTarget(page: Page, id: string): Promise<ScreenPoint> {
  const point = await targetPoint(page, id);
  await page.mouse.move(point.x, point.y, { steps: 4 });
  await expect.poll(() => hoveredTarget(page)).toEqual({ id, via: "pointer" });
  return point;
}

/** Screen position of open floor near the rover, toward the camera: no target covers it and no HUD sits over it. */
export async function emptyFloorPoint(page: Page): Promise<ScreenPoint> {
  const point = await page.evaluate(() => {
    const { interact, rover } = (window as unknown as InteractWindow).__hq;
    if (!interact.project) return null;
    const f = rover.cameraForward;
    const len = Math.hypot(f.x, f.z) || 1;
    const back = { x: -f.x / len, z: -f.z / len };
    const right = { x: -back.z, z: back.x };
    for (const d of [2.5, 4, 6]) {
      for (const side of [0, 2, -2]) {
        const x = rover.x + back.x * d + right.x * side;
        const z = rover.z + back.z * d + right.z * side;
        if (interact.items.some((i) => x >= i.bounds.minX && x <= i.bounds.maxX && z >= i.bounds.minZ && z <= i.bounds.maxZ)) continue;
        const p = interact.project({ x, y: rover.y, z });
        if (p && document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS") return p;
      }
    }
    return null;
  });
  if (!point) throw new Error("No open floor between the rover and the camera");
  return point;
}

/** Highlight opacity drawn this frame. */
export async function highlightOf(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as InteractWindow).__hq.interact.highlight);
}
```

- [ ] **Step 2: Write the failing e2e spec**

Create `e2e/interact.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import {
  asReturningVisitor,
  collectErrors,
  expectRenderBudget,
  hoveredTarget,
  hoverTarget,
  snapshot,
  targetPoint,
  visibleTarget,
  waitForCameraSettle,
  waitForFrames,
  waitForHQ,
  waitForPhase,
  waitForRoom,
  waitForRoverMove,
  waitForSceneLive,
} from "./hq";

test.describe.configure({ timeout: 180_000 });

/** A floor route as a returning visitor with guided walks off (the first-visit prompt would cover the floor). */
async function openFloor(page: Page, path: string) {
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=lite&walk=off`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  await waitForCameraSettle(page);
}

type StoreWindow = Window & { __hq: { store: { getState: () => { mission: { status: string } | null; activeRoom: string | null } } } };
const roverAt = async (page: Page) => (await snapshot(page)).rover;
const missionStatus = (page: Page) => page.evaluate(() => (window as unknown as StoreWindow).__hq.store.getState().mission?.status ?? null);

test.describe("point and go with a mouse", () => {
  test("hovering a pod highlights it with its name, and a click drives to its door and opens the drawer", async ({ page }) => {
    const errors = collectErrors(page);
    await openFloor(page, "/en/labs");
    const pod = await visibleTarget(page, { kinds: ["door"] });
    expect(pod.action.type).toBe("open-room");
    await hoverTarget(page, pod.id);
    await expect.poll(() => page.evaluate(() => document.body.style.cursor)).toBe("pointer");
    // The outline, the destination ring and the floating label stay inside the floor budget.
    await waitForFrames(page, 10);
    await expectRenderBudget(page);
    const start = await roverAt(page);
    const point = await targetPoint(page, pod.id);
    await page.mouse.click(point.x, point.y);
    await waitForRoverMove(page, start, 2);
    await waitForRoom(page, pod.action.room!);
    const end = await roverAt(page);
    expect(Math.hypot(end.x - pod.at.x, end.z - pod.at.z)).toBeLessThan(1.5);
    expect(errors).toEqual([]);
  });

  test("moving off every target clears the highlight and the pointer cursor", async ({ page }) => {
    await openFloor(page, "/en/labs");
    const target = await visibleTarget(page, { kinds: ["door", "board"] });
    await hoverTarget(page, target.id);
    await page.mouse.move(4, 4, { steps: 4 });
    await expect.poll(() => hoveredTarget(page)).toBeNull();
    await expect.poll(() => page.evaluate(() => document.body.style.cursor)).toBe("");
  });

  test("manual driving cancels a point-and-go drive before it arrives", async ({ page }) => {
    await openFloor(page, "/en/labs");
    const pod = await visibleTarget(page, { kinds: ["door"], minDistance: 10 });
    const start = await roverAt(page);
    const point = await targetPoint(page, pod.id);
    await page.mouse.click(point.x, point.y);
    await waitForRoverMove(page, start, 1);
    await page.keyboard.down("s");
    await expect.poll(() => missionStatus(page)).toBe("cancelled");
    await page.keyboard.up("s");
    await waitForFrames(page, 30);
    const end = await roverAt(page);
    expect(Math.hypot(end.x - pod.at.x, end.z - pod.at.z)).toBeGreaterThan(1.5);
    expect(await page.evaluate(() => (window as unknown as StoreWindow).__hq.store.getState().activeRoom)).not.toBe(pod.action.room);
  });

  test("hovering on the Career Road stays inside the render budget", async ({ page }) => {
    await openFloor(page, "/en/journey");
    const target = await visibleTarget(page, { kinds: ["teleporter", "door"] });
    await hoverTarget(page, target.id);
    await waitForFrames(page, 10);
    await expectRenderBudget(page);
  });
});
```

- [ ] **Step 3: A teleporter click now drives there first**

In `e2e/pads.spec.ts`, replace `  railScreenPoint,` in the import list from `./hq` with `  targetPoint,` (keep the list alphabetical: after `padsOf`). Then replace

```ts
  test("a click on a teleporter opens the year picker without driving, and a pick beams the rover to that plaza", async ({ page }) => {
    const errors = collectErrors(page);
    await openJourney(page);
    await waitForCameraSettle(page);
    const teleports = (await padsOf(page, "L2")).filter((p) => p.kind === "teleport");
    const first = teleports[0];
    const target = teleports[4];
    const before = await roverAt(page);
    await page.getByTestId("hq-world").click({ position: await railScreenPoint(page, first.at) });
    const dialog = page.getByRole("dialog", { name: en.hud.pads.yearTitle });
    await expect(dialog).toBeVisible();
    const still = await roverAt(page);
    expect(Math.hypot(still.x - before.x, still.z - before.z)).toBeLessThan(0.5);
```

with

```ts
  test("a click on a teleporter drives there and opens the year picker, and a pick beams the rover to that plaza", async ({ page }) => {
    const errors = collectErrors(page);
    await openJourney(page);
    await waitForCameraSettle(page);
    const teleports = (await padsOf(page, "L2")).filter((p) => p.kind === "teleport");
    const first = teleports[0];
    const target = teleports[4];
    const before = await roverAt(page);
    const pad = await targetPoint(page, `L2:teleporter:${first.year}`);
    await page.mouse.click(pad.x, pad.y);
    const dialog = page.getByRole("dialog", { name: en.hud.pads.yearTitle });
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    const parked = await roverAt(page);
    expect(Math.hypot(parked.x - before.x, parked.z - before.z)).toBeGreaterThan(1);
    expect(Math.hypot(parked.x - first.at.x, parked.z - first.at.z)).toBeLessThan(1.4);
```

(The rest of that test, from `await expect(dialog.locator("[data-option]")).toHaveCount(teleports.length);` on, stays as it is.)

- [ ] **Step 4: Register the spec in the e2e plan**

In `scripts/e2e-plan.ts`, add `"interact",` to `ALL_SPECS` right after `"hud",`, and insert this rule right after the "Floor pads" rule:

```ts
  // Point-and-go: the registry, pick logic, the hit layer and its HUD status (pads and career rooms are clicked through it).
  { test: /^src\/experience\/interact\/|^src\/hud\/InteractStatus\.tsx$/, specs: ["interact", "experience", "pads", "career"] },
```

In `tests/unit/e2e-plan.test.ts`, add inside `describe("specsForChanges", ...)`:

```ts
  it("maps point-and-go code to the interact spec and the specs that click targets", () => {
    expect(specsForChanges(["src/experience/interact/registry.ts"]).specs).toEqual(["career", "experience", "interact", "pads"]);
    expect(specsForChanges(["src/hud/InteractStatus.tsx"]).specs).toEqual(["career", "experience", "interact", "pads"]);
    expect(specsForChanges(["e2e/interact.spec.ts"]).specs).toEqual(["interact"]);
  });
```

Run: `rtk bunx vitest run tests/unit/e2e-plan.test.ts`
Expected: PASS (the spec file exists and the rule matches).

- [ ] **Step 5: Run the new e2e spec to verify it fails**

Run: `rtk bun run build && E2E_PORT=4391 rtk bunx playwright test e2e/interact.spec.ts`
Expected: FAIL in every test with `TypeError: Cannot read properties of undefined (reading 'project')` from `visibleTarget` (`__hq.interact` does not exist yet).

- [ ] **Step 6: Write the runtime probe**

Create `src/experience/interact/runtime.ts`:

```ts
import { pickVolume } from "./pick";
import type { Interactable } from "./registry";

type Point3 = { x: number; y: number; z: number };
type ScreenPoint = { x: number; y: number };

/**
 * Point-and-go runtime, written by InteractLayer and never read during React render: the current
 * floor's targets (built-in plus extras), a world-to-screen projection and the highlight opacity drawn
 * this frame. Exposed to Playwright as `window.__hq.interact`; scene-side features may read `items`.
 */
export const interactRuntime = {
  items: [] as Interactable[],
  /** World y of the current floor (targets are floor-local). */
  floorY: 0,
  /** Highlight opacity drawn this frame (test probe: constant under reduced motion). */
  highlight: 0,
  /** World point to CSS px over the canvas; null behind the camera or off screen. Set while InteractLayer is mounted. */
  project: null as ((p: Point3) => ScreenPoint | null) | null,
  /** CSS px of a target's pick volume at `lift` of its height (0.85: near the top, so the rover in front never takes the click). */
  screenOf(id: string, lift = 0.85): ScreenPoint | null {
    const item = interactRuntime.items.find((i) => i.id === id);
    if (!item || !interactRuntime.project) return null;
    const { center, size } = pickVolume(item);
    return interactRuntime.project({ x: center[0], y: interactRuntime.floorY + size[1] * lift, z: center[2] });
  },
};
```

- [ ] **Step 7: Write the hook**

Create `src/experience/interact/useInteractables.ts`:

```ts
"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { FloorId } from "@/content/schema";
import type { FloorLayouts } from "../types";
import { baseInteractables, extraInteractables, mergeInteractables, onInteractablesChange, type InteractData, type Interactable } from "./registry";

const NO_EXTRAS: readonly Interactable[] = [];

/** The floor's targets (built-in plus registered extras); re-renders when extras change. Pass a memoized `data`. */
export function useInteractables(floor: FloorId, layouts: FloorLayouts, data: InteractData): Interactable[] {
  const base = useMemo(() => baseInteractables(floor, layouts, data), [floor, layouts, data]);
  const extras = useSyncExternalStore(onInteractablesChange, () => extraInteractables(floor), () => NO_EXTRAS);
  return useMemo(() => mergeInteractables(base, extras), [base, extras]);
}
```

- [ ] **Step 8: Write the layer**

Create `src/experience/interact/InteractLayer.tsx`:

```tsx
"use client";

import { Billboard, Text } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BoxGeometry,
  EdgesGeometry,
  Object3D,
  Vector3,
  type InstancedMesh,
  type LineBasicMaterial,
  type LineSegments,
  type Mesh,
  type MeshBasicMaterial,
} from "three";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { floorY } from "../config";
import { intents } from "../input/intents";
import { FONTS } from "../tower/primitives";
import type { FloorLayouts, GpuTier } from "../types";
import { canPoint, clickDecision, highlightOpacity, isDragClick, labelAnchor, pickVolume } from "./pick";
import type { Interactable, InteractData } from "./registry";
import { interactRuntime } from "./runtime";
import { useInteractables } from "./useInteractables";

const GLOW = "#67e8f9";
const NO_RAYCAST = () => null;

/** Outline of the pick volume, a destination ring where the rover will stop, and (full tier) a faint additive fill. */
function Highlight({ item, tier, reducedMotion }: { item: Interactable; tier: GpuTier; reducedMotion: boolean }) {
  const edges = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1);
    const geometry = new EdgesGeometry(box);
    box.dispose();
    return geometry;
  }, []);
  useEffect(() => () => edges.dispose(), [edges]);
  const line = useRef<LineSegments>(null);
  const fill = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const { center, size } = pickVolume(item);

  useFrame(({ clock }) => {
    const opacity = highlightOpacity(clock.elapsedTime, reducedMotion);
    interactRuntime.highlight = opacity;
    if (line.current) (line.current.material as LineBasicMaterial).opacity = opacity;
    if (ring.current) (ring.current.material as MeshBasicMaterial).opacity = opacity;
    if (fill.current) (fill.current.material as MeshBasicMaterial).opacity = opacity * 0.12;
  });

  return (
    <group name="interact-highlight">
      <lineSegments ref={line} geometry={edges} position={center} scale={size} raycast={NO_RAYCAST}>
        <lineBasicMaterial color={GLOW} transparent toneMapped={false} />
      </lineSegments>
      {tier === "full" && (
        <mesh ref={fill} position={center} scale={size} raycast={NO_RAYCAST}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color={GLOW} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <mesh ref={ring} position={[item.at.x, 0.05, item.at.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
        <ringGeometry args={[0.8, 1.05, 40]} />
        <meshBasicMaterial color={GLOW} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** The target's name floating above it, always facing the camera (one troika draw call). */
function Label({ item }: { item: Interactable }) {
  return (
    <Billboard position={labelAnchor(item)}>
      <Text
        font={FONTS.sansBold}
        fontSize={0.6}
        maxWidth={9}
        textAlign="center"
        anchorX="center"
        anchorY="bottom"
        lineHeight={1.1}
        color="#f4f4f5"
        outlineWidth={0.05}
        outlineColor="#05050c"
        material-toneMapped={false}
      >
        {item.label}
      </Text>
    </Billboard>
  );
}

/**
 * Point-and-go (owner request): every target of the current floor is one instance of an invisible unit
 * box (one raycast, no draw call, no per-object listeners). Hover (mouse, pen) sets `store.hover`; a
 * click emits `interact`; on touch the first tap selects and a second tap on the same target goes.
 */
export function InteractLayer({ layouts, data, tier }: { layouts: FloorLayouts; data: InteractData; tier: GpuTier }) {
  const floor = useHQStore((s) => s.floor);
  const hover = useHQStore((s) => s.hover);
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  const items = useInteractables(floor, layouts, data);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const mesh = useRef<InstancedMesh>(null);
  const lastDown = useRef("mouse");
  const y = floorY(floor);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const d = new Object3D();
    items.forEach((item, i) => {
      const v = pickVolume(item);
      d.position.set(...v.center);
      d.scale.set(...v.size);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
    });
    m.count = items.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);

  useEffect(() => {
    interactRuntime.items = items;
    interactRuntime.floorY = y;
  }, [items, y]);

  useEffect(() => {
    const v = new Vector3();
    interactRuntime.project = (p) => {
      v.set(p.x, p.y, p.z).project(camera);
      if (v.z > 1) return null;
      const x = ((v.x + 1) / 2) * size.width;
      const top = ((1 - v.y) / 2) * size.height;
      return x >= 0 && x <= size.width && top >= 0 && top <= size.height ? { x, y: top } : null;
    };
    return () => {
      interactRuntime.project = null;
    };
  }, [camera, size]);

  // A new floor starts with nothing pointed at; a ride, a beam, a picker or an overlay clears the target.
  useEffect(() => {
    const store = getHQStore();
    store.getState().setHover(null);
    return store.subscribe((s) => {
      if (s.hover && !canPoint(s)) s.setHover(null);
    });
  }, [floor]);

  useEffect(() => {
    if (hover?.via !== "pointer") return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hover]);

  const itemOf = (e: { instanceId?: number }) => (e.instanceId === undefined ? undefined : items[e.instanceId]);

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    lastDown.current = e.pointerType || "mouse";
  };
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (e.pointerType === "touch") return;
    const item = itemOf(e);
    const s = getHQStore().getState();
    if (!item || !canPoint(s)) return;
    e.stopPropagation();
    s.setHover({ item, via: "pointer" });
  };
  const onPointerOut = () => {
    const s = getHQStore().getState();
    if (s.hover?.via === "pointer") s.setHover(null);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const item = itemOf(e);
    const pointerType = lastDown.current;
    if (!item || isDragClick(e.delta, pointerType)) return;
    const s = getHQStore().getState();
    if (!canPoint(s)) return;
    e.stopPropagation();
    if (clickDecision(s.hover, item, pointerType) === "select") {
      s.setHover({ item, via: "tap" });
      return;
    }
    if (s.hover?.via === "tap") s.setHover(null);
    intents.emit({ type: "interact", item });
  };

  return (
    <group position={[0, y, 0]} name="interact">
      <instancedMesh
        key={`${floor}:${items.length}`}
        ref={mesh}
        args={[undefined, undefined, Math.max(1, items.length)]}
        visible={false}
        frustumCulled={false}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerOut={onPointerOut}
        onClick={onClick}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial />
      </instancedMesh>
      {hover && hover.item.floor === floor && (
        <>
          <Highlight item={hover.item} tier={tier} reducedMotion={reducedMotion} />
          {/* Text loads its font asynchronously; keep it from holding back the outline. */}
          <Suspense fallback={null}>
            <Label item={hover.item} />
          </Suspense>
        </>
      )}
    </group>
  );
}
```

Notes for the implementer: three's raycaster ignores `visible`, so the invisible instanced mesh still receives R3F events and costs no draw call (the roof `HitBox` relied on the same rule). The instance count is fixed at creation, so the `key` remounts the mesh when a floor change changes the number of targets.

- [ ] **Step 9: Mount the layer in the scene**

In `src/experience/scene/Scene.tsx`, add the imports:

```ts
import { InteractLayer } from "../interact/InteractLayer";
import type { InteractLabels } from "../interact/registry";
```

replace

```ts
export interface SceneLabels extends TowerLabels {
  rover: { hello: string };
}
```

with

```ts
export interface SceneLabels extends TowerLabels {
  rover: { hello: string };
  /** Point-and-go labels for targets without a content title. */
  interact: InteractLabels;
}
```

add right after the `layouts` `useMemo`:

```ts
  const interactData = useMemo(() => ({ experience: data, labels: labels.interact }), [data, labels.interact]);
```

and replace

```tsx
      <Tower layouts={layouts} data={data} labels={labels} tier={tier} />
```

with

```tsx
      <Tower layouts={layouts} data={data} labels={labels} tier={tier} />
      <InteractLayer layouts={layouts} data={interactData} tier={tier} />
```

- [ ] **Step 10: Labels and the test probe in Experience**

In `src/experience/Experience.tsx`, add the import:

```ts
import { interactRuntime } from "./interact/runtime";
```

replace

```ts
  (window as unknown as { __hq?: unknown }).__hq = { store, rover: roverRuntime, marker: roverRuntime.marker, camera: () => [...roverRuntime.cameraPosition], layouts };
```

with

```ts
  (window as unknown as { __hq?: unknown }).__hq = { store, rover: roverRuntime, marker: roverRuntime.marker, camera: () => [...roverRuntime.cameraPosition], layouts, interact: interactRuntime };
```

and in the `labels` `useMemo`, replace

```ts
      rover: { hello: t("statusHello") },
    }),
```

with

```ts
      rover: { hello: t("statusHello") },
      interact: {
        elevator: t("pads.floorTitle"),
        // A string, so next-intl does not format the year as a number ("2,021").
        teleporter: (year: number) => t("interact.teleporter", { year: String(year) }),
        kiosk: t("launcher.askRover"),
        board: (wing: string) => t("interact.board", { wing }),
        archive: t("interact.archive"),
        rooms: {
          profile: t("rooms.profile"),
          stats: t("rooms.stats"),
          skills: t("rooms.skills"),
          certifications: t("rooms.certifications"),
          workshop: t("rooms.workshop"),
          publications: t("rooms.publications"),
          talks: t("rooms.talks"),
          contact: t("rooms.contact"),
          cv: t("rooms.cv"),
          research: t("rooms.research"),
        },
      },
    }),
```

- [ ] **Step 11: Targets behind the rover never light up**

In `src/experience/rover/Rover.tsx`, replace

```tsx
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    intents.emit({ type: "terminal" });
  };
```

with

```tsx
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    intents.emit({ type: "terminal" });
  };
  // A click on the rover opens Ask Rover, so a target behind it must not light up. The over handler makes
  // the rover hover-tracked, which lets its stopPropagation clear the hover of objects behind it.
  const stopHover = (e: ThreeEvent<PointerEvent>) => e.stopPropagation();
```

and replace

```tsx
      <group ref={root} name="rover" onClick={onClick}>
```

with

```tsx
      <group ref={root} name="rover" onClick={onClick} onPointerOver={stopHover} onPointerMove={stopHover}>
```

- [ ] **Step 12: Run the specs to verify they pass**

Run: `rtk bun run build && E2E_PORT=4391 rtk bunx playwright test e2e/interact.spec.ts e2e/pads.spec.ts`
Expected: PASS, `4 passed` in `interact.spec.ts` plus every `pads.spec.ts` test.

If `visibleTarget` throws "No door target on screen" on `/en/labs`, print the candidates (`await interactablesOf(page)` and `targetPoint` for each) and adjust `DESKTOP_SAFE` to the real HUD boxes at 1280 x 720 (measure with `page.getByTestId("hud-bottom").boundingBox()` and the top bar); never click through the HUD.

- [ ] **Step 13: Quick verification**

Run: `rtk bun run verify:quick`
Expected: typecheck, lint, all unit tests and `next build` succeed.

Run: `E2E_PORT=4391 rtk bun run e2e:changed`
Expected: the full suite runs (this task changes `e2e/hq.ts`) and passes. Old click-to-move tests still pass: the floor slab click is untouched until Task 5.

- [ ] **Step 14: Commit**

```bash
rtk git add src/experience/interact src/experience/scene/Scene.tsx src/experience/Experience.tsx src/experience/rover/Rover.tsx e2e/hq.ts e2e/interact.spec.ts e2e/pads.spec.ts scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts
rtk git commit -m "feat: point-and-go hit layer with hover highlight and floating label"
```

---
### Task 5: Retire click-to-move and the per-object click handlers

**Files:**
- Modify: `src/experience/input/intents.ts` (`goto` out), `src/experience/scene/Director.tsx` (`goto` case out), `src/hud/walk/WalkLayer.tsx`
- Modify: `src/experience/tower/FloorLevel.tsx` (whole file below), `src/experience/tower/Tower.tsx:77`, `src/experience/fx/PadGlow.tsx`
- Modify: `src/experience/rover/Rover.tsx`, `src/experience/rover/runtime.ts`, `src/experience/Experience.tsx` (click marker out)
- Modify: `src/experience/floors/career/CareerRooms.tsx`, `src/experience/floors/labs/Pods.tsx`, `src/experience/floors/labs/Hub.tsx`, `src/experience/floors/library/decor/common.tsx`, `src/experience/floors/library/decor/NewsroomDecor.tsx`, `src/experience/floors/Library.tsx`, `src/experience/floors/roof/kit.tsx`, `src/experience/floors/roof/SignalGarden.tsx`, `src/experience/floors/lobby/MissionKiosk.tsx`
- Delete: `src/experience/floors/interact.ts`
- Modify (comments): `src/experience/rover/boost.ts`, `src/experience/nav/doors.ts`, `src/experience/nav/pads.ts`, `src/experience/fx/BatchedLabels.tsx`, `tests/unit/boost.test.ts`
- Modify: `e2e/hq.ts` (`railScreenPoint` out), `e2e/experience.spec.ts`, `e2e/career.spec.ts`

**Interfaces:**
- Consumes: Task 4 (`emptyFloorPoint`, `targetPoint`, the registry targets for every former click handler).
- Produces: the `Intent` union without `goto`; `FloorLevel({ layout, near, children })` (no `interactive`); `PadGlow({ pads, floorY })` (no click); `DecorProps.onStation?` and `StationShells({ stations, tier, onStation? })` (optional: only the dev L4 prototype passes it); `roverRuntime` without `marker`; `window.__hq` without `marker`.

- [ ] **Step 1: Write the failing e2e changes**

In `e2e/experience.spec.ts`, add `emptyFloorPoint,` to the import list from `./hq` (after `collectErrors,`). Replace

```ts
  test("click to move drives to the clicked point", async ({ page }) => {
    await enterHQ(page);
    await waitForCameraSettle(page);
    const start = (await snapshot(page)).rover;
    // Below and left of the rover, which sits near the screen center.
    await page.mouse.click(500, 580);
    await waitForRoverMove(page, start, 2);
    await page.waitForFunction(() => {
      const r = (window as unknown as { __hq: { store: { getState: () => { rover: { speed: number } } } } }).__hq.store.getState().rover;
      return r.speed === 0;
    });
  });
```

with

```ts
  test("a click on empty floor does not move the rover", async ({ page }) => {
    await enterHQ(page);
    await waitForCameraSettle(page);
    const start = (await snapshot(page)).rover;
    const empty = await emptyFloorPoint(page);
    await page.mouse.click(empty.x, empty.y);
    await waitForFrames(page, 30);
    const { rover, phase } = await snapshot(page);
    expect(Math.hypot(rover.x - start.x, rover.z - start.z)).toBeLessThan(0.05);
    expect(phase).toBe("explore");
  });
```

Replace

```ts
  test("tap to move, joystick and vertical swipe", async ({ page }) => {
    const errors = collectErrors(page);
    await enterHQ(page);

    await waitForCameraSettle(page);
    const start = (await snapshot(page)).rover;
    await page.touchscreen.tap(140, 600);
    await waitForRoverMove(page, start, 2);
    await page.waitForTimeout(1500);
```

with

```ts
  test("a tap on empty floor does not move the rover; the joystick and a vertical swipe still do", async ({ page }) => {
    const errors = collectErrors(page);
    await enterHQ(page);

    await waitForCameraSettle(page);
    const start = (await snapshot(page)).rover;
    const empty = await emptyFloorPoint(page);
    await page.touchscreen.tap(empty.x, empty.y);
    await waitForFrames(page, 30);
    const still = (await snapshot(page)).rover;
    expect(Math.hypot(still.x - start.x, still.z - start.z)).toBeLessThan(0.05);
```

(the joystick and swipe part of that test stays). Delete the whole test `"the click marker appears where the floor is clicked and fades"` at the end of the file.

In `e2e/career.spec.ts`, replace `railScreenPoint,` in the import list with `targetPoint,`, then replace

```ts
    // Rooms dock in one row on both plaza edges. Open the 2024 room on the north edge, back off its
    // pad into the plaza (S drives toward the camera), then click the room's floor: the rover drives
    // to the door pad, stops on it and the room opens (a straight drive back would hinge on the turn).
```

with

```ts
    // Rooms dock in one row on both plaza edges. Open the 2024 room on the north edge, back off its
    // pad into the plaza (S drives toward the camera), then click the room itself (point-and-go): the
    // rover drives back to the door pad and the room opens.
```

and

```ts
    const floor = await railScreenPoint(page, { x: pad.x, z: pad.z - 2.3 });
    await page.getByTestId("hq-world").click({ position: floor });
```

with

```ts
    const room = await targetPoint(page, "L2:door:crypto-tracker-2024");
    await page.mouse.click(room.x, room.y);
```

- [ ] **Step 2: Run them to verify the empty-floor tests fail**

Run: `rtk bun run build && E2E_PORT=4391 rtk bunx playwright test e2e/experience.spec.ts -g "empty floor"`
Expected: FAIL in both tests at `toBeLessThan(0.05)`: the floor click still drives the rover.

- [ ] **Step 3: Remove the `goto` intent**

In `src/experience/input/intents.ts`, delete the line `import type { Vec2 } from "../types";` and the line `  | { type: "goto"; point: Vec2 }`.

In `src/experience/scene/Director.tsx`, replace

```ts
      if ((intent.type === "goto" || intent.type === "interact" || intent.type === "elevator" || intent.type === "cancel" || intent.type === "scrub" || intent.type === "teleport") && missionRunning()) cancelMission();
```

with

```ts
      if ((intent.type === "interact" || intent.type === "elevator" || intent.type === "cancel" || intent.type === "scrub" || intent.type === "teleport") && missionRunning()) cancelMission();
```

delete the whole case

```ts
        case "goto": {
          // Clicking the floor while a room is open closes the drawer and drives away (appendix 02).
          if (s.phase === "room") s.closeRoom();
          if (!controller || (store.getState().phase !== "explore" && s.phase !== "elevator")) break;
          if (s.ride && s.ride.stage !== "toDoor") break;
          if (s.ride) s.cancelRide();
          const path = findPath(grids[s.floor], controller.pose, intent.point);
          if (path?.length) {
            controller.setPath(path, false);
            roverRuntime.target = path[path.length - 1];
          }
          break;
        }
```

and update two comments: `// Esc never skips the boot or the intro (owner decision); it stops elevator drives and click-to-move.` becomes `// Esc never skips the boot or the intro (owner decision); it stops elevator drives and scrub drives.`, and `// L2 year teleporters: beam to the chosen plaza's pad. Any drive (autopilot, click-to-move) ends here.` becomes `// L2 year teleporters: beam to the chosen plaza's pad. Any drive (autopilot, scrub) ends here.` (`findPath` stays imported: scrubbing uses it.)

In `src/hud/walk/WalkLayer.tsx`, replace

```ts
      if (intent.type === "move" || intent.type === "goto" || intent.type === "interact" || intent.type === "scrub") {
```

with

```ts
      if (intent.type === "move" || intent.type === "interact" || intent.type === "scrub") {
```

- [ ] **Step 4: The floor slab and the pads stop taking clicks**

Replace the whole of `src/experience/tower/FloorLevel.tsx` with:

```tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import { BoxGeometry, EdgesGeometry, type Group, type LineBasicMaterial, type MeshBasicMaterial } from "three";
import { getHQStore } from "@/store/useHQStore";
import { floorY, SLAB_THICKNESS } from "../config";
import { roverRuntime } from "../rover/runtime";
import type { FloorLayout } from "../types";
import { GridFloor } from "../fx/GridFloor";
import { ProximityGlow } from "../fx/ProximityGlow";
import { PadGlow } from "../fx/PadGlow";

const SLAB_COLOR = "#07070f";
const SOLID = 1;
const GHOST = 0.03;

/**
 * One floor slab with accent edges and its content. Floors above the rover turn
 * into ghosts each frame so the follow camera, which sits higher than
 * FLOOR_GAP, can look down through them. The slab takes no clicks: the rover
 * only drives to point-and-go targets (interact/InteractLayer.tsx).
 */
export function FloorLevel({ layout, near, children }: { layout: FloorLayout; near: boolean; children?: ReactNode }) {
  const y = floorY(layout.id);
  const { bounds, accent } = layout;
  const w = bounds.maxX - bounds.minX;
  const d = bounds.maxZ - bounds.minZ;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const fill = useRef<MeshBasicMaterial>(null);
  const edge = useRef<LineBasicMaterial>(null);
  const content = useRef<Group>(null);
  const center = useMemo<[number, number]>(() => [cx, cz], [cx, cz]);
  const edges = useMemo(() => new EdgesGeometry(new BoxGeometry(w, SLAB_THICKNESS, d)), [w, d]);

  useFrame(() => {
    const { phase, ride } = getHQStore().getState();
    const exterior = phase === "boot" || phase === "intro";
    const above = !exterior && y > roverRuntime.y + 0.5;
    // Content under the current slab is hidden by it, so skip drawing it unless the elevator is moving.
    const below = !exterior && !ride && y < roverRuntime.y - 0.5;
    if (fill.current) {
      fill.current.opacity = above ? GHOST : SOLID;
      fill.current.depthWrite = !above;
    }
    if (edge.current) edge.current.opacity = above ? 0.16 : 0.95;
    if (content.current) content.current.visible = !above && !below;
  });

  return (
    <group position={[0, y, 0]} name={`floor-${layout.id}`}>
      <mesh position={[cx, -SLAB_THICKNESS / 2, cz]}>
        <boxGeometry args={[w, SLAB_THICKNESS, d]} />
        <meshBasicMaterial ref={fill} color={SLAB_COLOR} transparent opacity={SOLID} />
      </mesh>
      <lineSegments geometry={edges} position={[cx, -SLAB_THICKNESS / 2, cz]}>
        <lineBasicMaterial ref={edge} color={accent} transparent opacity={0.95} toneMapped={false} />
      </lineSegments>
      <group ref={content}>
        {near && <GridFloor width={w} depth={d} center={center} />}
        {near && layout.doors && <ProximityGlow doors={layout.doors} color={accent} floorY={y} />}
        {near && layout.pads && <PadGlow pads={layout.pads} floorY={y} />}
        {children}
      </group>
    </group>
  );
}
```

In `src/experience/tower/Tower.tsx`, replace

```tsx
          <FloorLevel key={id} layout={layouts[id]} near={isNear} interactive={id === floor}>
```

with

```tsx
          <FloorLevel key={id} layout={layouts[id]} near={isNear}>
```

(`floor` is still used by `nearFloors`.)

In `src/experience/fx/PadGlow.tsx`:

- replace `import { useFrame, type ThreeEvent } from "@react-three/fiber";` with `import { useFrame } from "@react-three/fiber";`
- replace `import { getHQStore, useHQStore } from "@/store/useHQStore";` with `import { useHQStore } from "@/store/useHQStore";`
- delete `import { DRAG_THRESHOLD, intents } from "../input/intents";`
- replace `import { PAD, padRadius, pickerFor } from "../nav/pads";` with `import { PAD, padRadius } from "../nav/pads";`
- replace the doc comment line `* floor, brightening as the rover gets close, plus a floating neon icon per pad kind. Clicking or` and the next line `* tapping a pad on the current floor opens its picker without driving there.` with `* floor, brightening as the rover gets close, plus a floating neon icon per pad kind. Clicks go through` and `* point-and-go (interact/registry.ts): the rover drives onto the pad, then the picker opens.`
- replace `export function PadGlow({ pads, floorY, interactive }: { pads: PadTrigger[]; floorY: number; interactive: boolean }) {` with `export function PadGlow({ pads, floorY }: { pads: PadTrigger[]; floorY: number }) {`
- delete the whole `const onClick = (e: ThreeEvent<MouseEvent>) => { ... };` block (from `const onClick` to its closing `};`)
- replace `<instancedMesh ref={mesh} args={[geometry, undefined, pads.length]} frustumCulled={false} {...(interactive ? { onClick } : { raycast: () => null })}>` with `<instancedMesh ref={mesh} args={[geometry, undefined, pads.length]} frustumCulled={false} raycast={() => null}>`

- [ ] **Step 5: Remove the click marker**

In `src/experience/rover/Rover.tsx`:

- delete the two lines `const MARKER_FADE = 1.2;` and `const MARKER_GROW = 1.5;`
- delete `  const marker = useRef<Mesh>(null);`
- delete the whole effect

```tsx
  useEffect(
    () =>
      intents.on((intent) => {
        if (intent.type !== "goto") return;
        const m = roverRuntime.marker;
        m.x = intent.point.x;
        m.z = intent.point.z;
        m.opacity = 1;
        m.scale = 1;
        m.visible = true;
      }),
    [],
  );
```

- delete in `useFrame`

```tsx
    const mk = r.marker;
    if (mk.visible) {
      mk.opacity = Math.max(0, mk.opacity - dt * MARKER_FADE);
      if (!reduced) mk.scale *= 1 + dt * MARKER_GROW;
      if (mk.opacity <= 0) mk.visible = false;
    }
    if (marker.current) {
      marker.current.visible = mk.visible;
      marker.current.position.set(mk.x, r.y + 0.03, mk.z);
      marker.current.scale.setScalar(mk.scale);
      (marker.current.material as MeshBasicMaterial).opacity = mk.opacity;
    }

```

- delete in the JSX

```tsx
      <mesh ref={marker} rotation={[-Math.PI / 2, 0, 0]} visible={false} raycast={() => null}>
        <ringGeometry args={[0.3, 0.42, 32]} />
        <meshBasicMaterial color={GLOW_CYAN} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
```

(`intents`, `useEffect`, `AdditiveBlending`, `GLOW_CYAN` and `reduced` stay in use elsewhere in the file; `bun run lint` confirms.)

In `src/experience/rover/runtime.ts`, replace

```ts
  /** Current click-to-move destination, if any. */
  target: null as Vec2 | null,
```

with

```ts
  /** Current scrub destination on rail floors, if any (drawn as the target ring). */
  target: null as Vec2 | null,
```

and delete

```ts
  /** Click-to-move marker: a ring that expands and fades where the floor was clicked (also a test probe). */
  marker: { visible: false, opacity: 0, scale: 1, x: 0, z: 0 },
```

In `src/experience/Experience.tsx`, replace `marker: roverRuntime.marker, ` inside the `__hq` assignment with nothing, so it reads `{ store, rover: roverRuntime, camera: () => [...roverRuntime.cameraPosition], layouts, interact: interactRuntime }`.

- [ ] **Step 6: Remove the per-object click handlers on the floors**

`src/experience/floors/career/CareerRooms.tsx`: replace `import { useFrame, type ThreeEvent } from "@react-three/fiber";` with `import { useFrame } from "@react-three/fiber";`, delete `import { intents } from "../../input/intents";`, delete

```tsx
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6 || e.instanceId === undefined) return;
    e.stopPropagation();
    const room = rooms[e.instanceId];
    if (room) intents.emit({ type: "goto", point: room.at });
  };
```

and delete the three props `onClick={onClick}`, `onPointerOver={() => (document.body.style.cursor = "pointer")}` and `onPointerOut={() => (document.body.style.cursor = "")}` from the room pads `instancedMesh`.

`src/experience/floors/labs/Pods.tsx`: replace `import { useFrame, type ThreeEvent } from "@react-three/fiber";` with `import { useFrame } from "@react-three/fiber";`, delete `import { intents } from "../../input/intents";`, delete

```tsx
function setCursor(value: string) {
  document.body.style.cursor = value;
}

```

delete

```tsx
  // Clicking a pod drives the rover to its door, where the trigger opens the drawer.
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6 || e.instanceId === undefined) return;
    e.stopPropagation();
    const p = placed[e.instanceId];
    if (p) intents.emit({ type: "goto", point: p.door });
  };

```

and delete the props `onClick={onClick}`, `onPointerOver={() => setCursor("pointer")}` and `onPointerOut={() => setCursor("")}` from the glass `instancedMesh`.

`src/experience/floors/labs/Hub.tsx`: delete `import type { ThreeEvent } from "@react-three/fiber";` and `import { openPalette } from "@/hud/events";`, delete

```tsx
function setCursor(value: string) {
  document.body.style.cursor = value;
}

/** A click (not a drag) on a board opens every project in the palette. */
function onBoardClick(e: ThreeEvent<MouseEvent>) {
  if (e.delta > 6) return;
  e.stopPropagation();
  openPalette("pods");
}

```

and replace

```tsx
            <mesh position={[0, board.h / 2, 0]} onClick={onBoardClick} onPointerOver={() => setCursor("pointer")} onPointerOut={() => setCursor("")}>
```

with

```tsx
            <mesh position={[0, board.h / 2, 0]}>
```

`src/experience/floors/library/decor/common.tsx`: replace

```ts
  /** In-world click on a station: drive there and open its drawer. */
  onStation: (room: RoomId) => void;
```

with

```ts
  /** Dev prototypes only: a click on a station. The tower clicks stations through point-and-go (interact/registry.ts). */
  onStation?: (room: RoomId) => void;
```

replace

```tsx
export function StationShells({ stations, tier, onStation }: { stations: readonly LibraryStation[]; tier: GpuTier; onStation: (room: RoomId) => void }) {
```

with

```tsx
export function StationShells({ stations, tier, onStation }: { stations: readonly LibraryStation[]; tier: GpuTier; onStation?: (room: RoomId) => void }) {
```

replace

```tsx
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6 || e.instanceId === undefined) return;
    e.stopPropagation();
    const s = stations[e.instanceId];
    if (s) onStation(s.room);
  };
```

with

```tsx
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!onStation || e.delta > 6 || e.instanceId === undefined) return;
    e.stopPropagation();
    const s = stations[e.instanceId];
    if (s) onStation(s.room);
  };
  const handlers = onStation ? { onClick, onPointerOver: () => setCursor("pointer"), onPointerOut: () => setCursor("") } : {};
```

and in the station `instancedMesh` replace the three lines

```tsx
        onClick={onClick}
        onPointerOver={() => setCursor("pointer")}
        onPointerOut={() => setCursor("")}
```

(the first occurrence in the file, inside `StationShells`; the research paper plates further down keep theirs) with

```tsx
        {...handlers}
```

`src/experience/floors/library/decor/NewsroomDecor.tsx`: replace

```tsx
              onClick={(e) => {
                if (e.delta > 6 || !featured) return;
                e.stopPropagation();
                onStation(featured.room);
              }}
```

with

```tsx
              onClick={
                onStation
                  ? (e) => {
                      if (e.delta > 6 || !featured) return;
                      e.stopPropagation();
                      onStation(featured.room);
                    }
                  : undefined
              }
```

`src/experience/floors/Library.tsx`: delete `import type { RoomId } from "@/content/schema";`, `import { goToRoom } from "../missions/bridge";` and `  const onStation = useCallback((room: RoomId) => goToRoom(room), []);`, remove ` onStation={onStation}` from `<PickedDecor ... />`, and replace the doc comment line `* concepts. Stations open their drawer through `goToRoom` (drive to the door, then open); paper` with `* concepts. Stations are point-and-go targets (interact/registry.ts: drive to the door, then open); paper`.

`src/experience/floors/roof/kit.tsx`: delete `import type { RoomId } from "@/content/schema";` and `import { roomHandlers } from "../interact";`, replace `import type { ExperienceData, GpuTier, Rect, RoofData } from "../../types";` with `import type { ExperienceData, GpuTier, RoofData } from "../../types";`, and delete

```tsx
/** Invisible click target over a station (three raycasts hidden meshes; it costs no draw call): drives there and opens the room. */
export function HitBox({ rect, room, h, y = 0 }: { rect: Rect; room: RoomId; h: number; y?: number }) {
  return (
    <mesh position={[(rect.minX + rect.maxX) / 2, y + h / 2, (rect.minZ + rect.maxZ) / 2]} visible={false} {...roomHandlers(room)}>
      <boxGeometry args={[rect.maxX - rect.minX, h, rect.maxZ - rect.minZ]} />
    </mesh>
  );
}

```

`src/experience/floors/roof/SignalGarden.tsx`: remove `HitBox, ` from the `./kit` import and delete

```tsx
      <HitBox rect={layout.comms} h={4} room="RF:contact" />
      <HitBox rect={layout.cv} h={3.6} room="RF:cv" />
```

`src/experience/floors/lobby/MissionKiosk.tsx`: replace `import { useFrame, type ThreeEvent } from "@react-three/fiber";` with `import { useFrame } from "@react-three/fiber";`, delete `import { intents } from "../../input/intents";`, replace `/** Diegetic mirror of the Rover Terminal missions; clicking it opens the terminal. */` with `/** Diegetic mirror of the Rover Terminal missions; a point-and-go target (L1:kiosk:ask-rover) that opens Ask Rover. */`, delete

```tsx
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    intents.emit({ type: "terminal" });
  };
```

and replace `<mesh onClick={onClick}>` with `<mesh>`.

Delete the now unused helper: `rtk git rm src/experience/floors/interact.ts`.

- [ ] **Step 7: Comments that still say click-to-move**

- `src/experience/rover/boost.ts`: `* screens. Manual driving only; the autopilot (missions, walks, the elevator approach) and` / `* click-to-move keep their speed. Pure, so Vitest runs it in node.` becomes `* screens. Manual driving only; the autopilot (missions, walks, the elevator approach and` / `* point-and-go drives) keeps its speed. Pure, so Vitest runs it in node.`
- `tests/unit/boost.test.ts`: `// Autopilot (missions, walks, elevator approach) and click-to-move have no manual input.` becomes `// Autopilot (missions, walks, elevator approach, point-and-go drives) has no manual input.`
- `src/experience/nav/doors.ts`: `/** The rover follows a path (click-to-move or mission autopilot). */` becomes `/** The rover follows a path (scrub or mission autopilot). */`
- `src/experience/nav/pads.ts`: `/** The rover follows a path (click-to-move, autopilot) or a mission runs. */` becomes `/** The rover follows a path (scrub, autopilot) or a mission runs. */`
- `src/experience/fx/BatchedLabels.tsx`: `* label a fixed `yaw` toward where it is read from. Not raycast: wrap clickable signs in a `HitBox`.` becomes `* label a fixed `yaw` toward where it is read from. Not raycast: make clickable signs point-and-go targets (interact/registry.ts).`

- [ ] **Step 8: Drop the rail click helper from the e2e helpers**

In `e2e/hq.ts`, delete `import { RAIL, RAIL_LOOK_AHEAD } from "../src/experience/camera/rigs";` and the whole `railScreenPoint` function with its doc comment (no spec uses it after Step 1).

- [ ] **Step 9: Verify nothing still refers to the removed pieces**

Run: `rtk git grep -n -E '"goto"|roomHandlers|HitBox|railScreenPoint|roverRuntime\.marker|__hq\.marker|click-to-move|onFloorClick' -- src e2e tests`
Expected: no matches.

Run: `rtk bun run verify:quick`
Expected: typecheck, lint, unit tests and `next build` all succeed.

- [ ] **Step 10: Run the affected specs**

Run: `E2E_PORT=4391 rtk bunx playwright test e2e/experience.spec.ts e2e/career.spec.ts e2e/pads.spec.ts e2e/interact.spec.ts e2e/labs.spec.ts e2e/library-roof.spec.ts e2e/roof.spec.ts e2e/walk.spec.ts`
Expected: all PASS (empty clicks and taps no longer move the rover; the L2 room, teleporter, pods, boards, stations and kiosk are clicked through the registry).

- [ ] **Step 11: Commit**

```bash
rtk git add -A src e2e tests
rtk git commit -m "feat: remove click-to-move; in-world clicks go through point-and-go"
```

---
### Task 6: HUD status, the empty-click hint and the copy

**Files:**
- Create: `src/experience/interact/missed.ts`
- Create: `src/hud/InteractStatus.tsx`
- Modify: `src/experience/Experience.tsx` (Canvas `onPointerMissed`)
- Modify: `src/hud/Hud.tsx` (mount in the bottom band)
- Modify: `messages/en.json`, `messages/id.json` (`hud.interact.*`, `hud.hintFine`, `hud.hintCoarse`, `hud.canvasDescription`)
- Test: `tests/unit/interact-missed.test.ts`, `tests/hud/InteractStatus.test.tsx`, `e2e/interact.spec.ts` (append)

**Interfaces:**
- Consumes: store `hover`, `setHover`, `pointHint`, `setPointHint`, `closeRoom` (Task 3); intent `interact` (Task 3); e2e helpers `visibleTarget`, `targetPoint`, `hoverTarget`, `hoveredTarget`, `emptyFloorPoint`, `highlightOf`, `PHONE_SAFE` (Task 4).
- Produces:
  - `POINT_HINT_KEY = "hq:point-hint"` and `onWorldMissed(event: MouseEvent): void` (`interact/missed.ts`).
  - `<InteractStatus coarse={boolean} />` and `POINT_HINT_MS = 4000` (`src/hud/InteractStatus.tsx`); test ids `interact-live`, `interact-go`, `point-hint`.
  - Messages `hud.interact.live`, `liveTap`, `go`, `hintFine`, `hintCoarse` (plus Task 1's `teleporter`, `board`, `archive`).

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/interact-missed.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { Interactable } from "@/experience/interact/registry";
import { onWorldMissed, POINT_HINT_KEY } from "@/experience/interact/missed";
import { roverRuntime } from "@/experience/rover/runtime";
import { getHQStore } from "@/store/useHQStore";

const pod: Interactable = {
  id: "L3:door:demo",
  floor: "L3",
  kind: "door",
  label: "Demo",
  at: { x: 0, z: 0 },
  bounds: { minX: -1, maxX: 1, minZ: 1, maxZ: 3 },
  action: { type: "open-room", room: "L3:demo" },
};
const click = () => new MouseEvent("click");

beforeEach(() => {
  sessionStorage.clear();
  roverRuntime.autopilot = null;
  getHQStore().setState({ phase: "explore", activeRoom: null, ride: null, beam: null, picker: null, hover: null, pointHint: false });
});

describe("onWorldMissed (a click on no target)", () => {
  it("never drives, and shows the point-and-go hint once per session", () => {
    onWorldMissed(click());
    expect(getHQStore().getState().pointHint).toBe(true);
    expect(sessionStorage.getItem(POINT_HINT_KEY)).toBe("1");
    expect(roverRuntime.autopilot).toBeNull();
    getHQStore().getState().setPointHint(false);
    onWorldMissed(click());
    expect(getHQStore().getState().pointHint).toBe(false);
  });

  it("closes an open room instead of showing the hint", () => {
    getHQStore().setState({ phase: "room", activeRoom: "L3:demo" });
    onWorldMissed(click());
    expect(getHQStore().getState().phase).toBe("explore");
    expect(getHQStore().getState().activeRoom).toBeNull();
    expect(getHQStore().getState().pointHint).toBe(false);
  });

  it("clears a tap selection", () => {
    getHQStore().getState().setHover({ item: pod, via: "tap" });
    onWorldMissed(click());
    expect(getHQStore().getState().hover).toBeNull();
  });

  it("ignores right clicks, double clicks and overlays", () => {
    onWorldMissed(new MouseEvent("contextmenu"));
    onWorldMissed(new MouseEvent("dblclick"));
    getHQStore().setState({ picker: { kind: "floor" } });
    onWorldMissed(click());
    expect(getHQStore().getState().pointHint).toBe(false);
    expect(sessionStorage.getItem(POINT_HINT_KEY)).toBeNull();
  });
});
```

Create `tests/hud/InteractStatus.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { intents, type Intent } from "@/experience/input/intents";
import type { Interactable } from "@/experience/interact/registry";
import { InteractStatus, POINT_HINT_MS } from "@/hud/InteractStatus";
import { getHQStore } from "@/store/useHQStore";

const pod: Interactable = {
  id: "L3:door:demo",
  floor: "L3",
  kind: "door",
  label: "Demo Pod",
  at: { x: 1, z: 2 },
  bounds: { minX: 0, maxX: 2, minZ: 3, maxZ: 6 },
  height: 2.6,
  action: { type: "open-room", room: "L3:demo" },
};
let emitted: Intent[] = [];
let off: () => void = () => {};

beforeEach(() => {
  emitted = [];
  off = intents.on((intent) => {
    emitted.push(intent);
  });
  getHQStore().setState({ phase: "explore", hover: null, pointHint: false });
});

afterEach(() => {
  off();
  cleanup();
  vi.useRealTimers();
  getHQStore().setState({ hover: null, pointHint: false });
});

function mount(coarse = false) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <InteractStatus coarse={coarse} />
    </NextIntlClientProvider>,
  );
}

describe("InteractStatus", () => {
  it("announces the hovered target and offers no Go button to a mouse", () => {
    mount();
    expect(screen.getByTestId("interact-live")).toBeEmptyDOMElement();
    act(() => getHQStore().getState().setHover({ item: pod, via: "pointer" }));
    expect(screen.getByTestId("interact-live")).toHaveTextContent("Demo Pod. Click to go there.");
    expect(screen.getByTestId("interact-live")).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByTestId("interact-go")).toBeNull();
  });

  it("offers Go after a first tap; Go emits the interact intent and clears the selection", async () => {
    mount(true);
    act(() => getHQStore().getState().setHover({ item: pod, via: "tap" }));
    expect(screen.getByTestId("interact-live")).toHaveTextContent("Demo Pod selected. Tap it again or use the Go button.");
    await userEvent.click(screen.getByRole("button", { name: "Go to Demo Pod" }));
    expect(emitted).toEqual([{ type: "interact", item: pod }]);
    expect(getHQStore().getState().hover).toBeNull();
  });

  it("shows the one-time hint for the pointer type and hides it after a few seconds", () => {
    vi.useFakeTimers();
    mount(true);
    act(() => getHQStore().getState().setPointHint(true));
    expect(screen.getByTestId("point-hint")).toHaveTextContent(en.hud.interact.hintCoarse);
    act(() => vi.advanceTimersByTime(POINT_HINT_MS));
    expect(getHQStore().getState().pointHint).toBe(false);
    expect(screen.queryByTestId("point-hint")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `rtk bunx vitest run tests/unit/interact-missed.test.ts tests/hud/InteractStatus.test.tsx`
Expected: FAIL with `Failed to resolve import "@/experience/interact/missed"` and `Failed to resolve import "@/hud/InteractStatus"`.

- [ ] **Step 3: Add the copy**

In `messages/en.json`, replace the `hud.interact` object from Task 1

```json
    "interact": {
      "teleporter": "Teleporter {year}",
      "board": "{wing} directory",
      "archive": "Post archive"
    }
```

with

```json
    "interact": {
      "teleporter": "Teleporter {year}",
      "board": "{wing} directory",
      "archive": "Post archive",
      "live": "{label}. Click to go there.",
      "liveTap": "{label} selected. Tap it again or use the Go button.",
      "go": "Go to {label}",
      "hintFine": "Click a glowing object to go there.",
      "hintCoarse": "Tap a glowing object, then tap it again to go there."
    }
```

and change three existing `hud` strings:

- `"hintFine": "Drive: WASD or arrows · Boost: hold Shift · Move: click floor · Rotate: drag or Q/E · Floors: scroll or PgUp/PgDn",` becomes `"hintFine": "Drive: WASD or arrows · Boost: hold Shift · Go: click a glowing object · Rotate: drag or Q/E · Floors: scroll or PgUp/PgDn",`
- `"hintCoarse": "Move: tap floor · Drive: joystick · Boost: hold the boost button · Rotate: drag · Floors: swipe up or down",` becomes `"hintCoarse": "Drive: joystick · Boost: hold the boost button · Go: tap a glowing object twice · Rotate: drag · Floors: swipe up or down",`
- in `"canvasDescription"`, the text `(hold Shift to boost), or click a spot on the floor.` becomes `(hold Shift to boost). Hover a glowing object (a door, the elevator pad, a board) to see its name and click it to drive there.`

In `messages/id.json`, replace

```json
    "interact": {
      "teleporter": "Teleporter {year}",
      "board": "Direktori {wing}",
      "archive": "Arsip tulisan"
    }
```

with

```json
    "interact": {
      "teleporter": "Teleporter {year}",
      "board": "Direktori {wing}",
      "archive": "Arsip tulisan",
      "live": "{label}. Klik untuk menuju ke sana.",
      "liveTap": "{label} dipilih. Ketuk sekali lagi atau gunakan tombol Pergi.",
      "go": "Pergi ke {label}",
      "hintFine": "Klik objek yang menyala untuk menuju ke sana.",
      "hintCoarse": "Ketuk objek yang menyala, lalu ketuk sekali lagi untuk menuju ke sana."
    }
```

and change:

- `"hintFine": "Kemudi: WASD atau panah · Turbo: tahan Shift · Gerak: klik lantai · Putar: seret atau Q/E · Lantai: scroll atau PgUp/PgDn",` becomes `"hintFine": "Kemudi: WASD atau panah · Turbo: tahan Shift · Tuju: klik objek yang menyala · Putar: seret atau Q/E · Lantai: scroll atau PgUp/PgDn",`
- `"hintCoarse": "Gerak: ketuk lantai · Kemudi: joystick · Turbo: tahan tombol turbo · Putar: seret · Lantai: geser ke atas atau bawah",` becomes `"hintCoarse": "Kemudi: joystick · Turbo: tahan tombol turbo · Tuju: ketuk dua kali objek yang menyala · Putar: seret · Lantai: geser ke atas atau bawah",`
- in `"canvasDescription"`, the text `(tahan Shift untuk turbo), atau klik titik di lantai.` becomes `(tahan Shift untuk turbo). Arahkan kursor ke objek yang menyala (pintu, pad lift, papan) untuk melihat namanya, lalu klik untuk menuju ke sana.`

- [ ] **Step 4: Write the empty-click handler**

Create `src/experience/interact/missed.ts`:

```ts
import { getHQStore } from "@/store/useHQStore";

/** sessionStorage key: the one-time point-and-go hint was shown in this browser session. */
export const POINT_HINT_KEY = "hq:point-hint";

/**
 * Canvas `onPointerMissed`: a click or tap that hit no target. It never moves the rover (owner request):
 * it clears a tap selection, closes an open room, and shows the point-and-go hint once per session.
 */
export function onWorldMissed(event: MouseEvent) {
  if (event.type !== "click") return;
  const s = getHQStore().getState();
  if (s.hover?.via === "tap") s.setHover(null);
  if (s.phase === "room") {
    s.closeRoom();
    return;
  }
  if (s.phase !== "explore" || s.ride || s.beam || s.picker) return;
  try {
    if (window.sessionStorage.getItem(POINT_HINT_KEY)) return;
    window.sessionStorage.setItem(POINT_HINT_KEY, "1");
  } catch {
    return;
  }
  s.setPointHint(true);
}
```

- [ ] **Step 5: Write the HUD status**

Create `src/hud/InteractStatus.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { intents } from "@/experience/input/intents";
import { getHQStore, useHQStore } from "@/store/useHQStore";

/** How long the one-time "click a glowing object" hint stays on screen. */
export const POINT_HINT_MS = 4000;

/**
 * Point-and-go status in the bottom band: the hovered or tap-selected target for screen readers, the Go
 * chip after a first tap on touch screens, and the hint after a click on empty floor (once per session).
 */
export function InteractStatus({ coarse }: { coarse: boolean }) {
  const t = useTranslations("hud.interact");
  const hover = useHQStore((s) => s.hover);
  const hint = useHQStore((s) => s.pointHint);

  useEffect(() => {
    if (!hint) return;
    const id = window.setTimeout(() => getHQStore().getState().setPointHint(false), POINT_HINT_MS);
    return () => window.clearTimeout(id);
  }, [hint]);

  const go = () => {
    if (!hover) return;
    getHQStore().getState().setHover(null);
    intents.emit({ type: "interact", item: hover.item });
  };

  return (
    <>
      <p className="sr-only" aria-live="polite" data-testid="interact-live">
        {hover ? t(hover.via === "tap" ? "liveTap" : "live", { label: hover.item.label }) : ""}
      </p>
      {hover?.via === "tap" && (
        <button
          type="button"
          onClick={go}
          data-testid="interact-go"
          className="glass glass-solid pointer-events-auto min-h-11 max-w-full truncate px-4 text-sm font-semibold text-cyan"
        >
          {t("go", { label: hover.item.label })}
        </button>
      )}
      {hint && !hover && (
        <p role="status" data-testid="point-hint" className="glass glass-solid pointer-events-none max-w-full px-4 py-2 text-center text-[13px] leading-5 text-ink">
          {t(coarse ? "hintCoarse" : "hintFine")}
        </p>
      )}
    </>
  );
}
```

- [ ] **Step 6: Run the unit tests to verify they pass**

Run: `rtk bunx vitest run tests/unit/interact-missed.test.ts tests/hud/InteractStatus.test.tsx tests/unit/ui-copy.test.ts tests/content/safety.test.ts tests/content/fonts.test.ts`
Expected: PASS (7 new tests; the copy, safety and font coverage tests still pass with the new strings).

- [ ] **Step 7: Wire them in**

In `src/experience/Experience.tsx`, add the import `import { onWorldMissed } from "./interact/missed";` and add the prop to `<Canvas`, right after `aria-describedby="hq-desc"`:

```tsx
          onPointerMissed={onWorldMissed}
```

In `src/hud/Hud.tsx`, add the import `import { InteractStatus } from "./InteractStatus";` and replace

```tsx
            {explorable && !walking && <HintBar coarse={coarse} mobile={mobile} />}
```

with

```tsx
            <InteractStatus coarse={coarse} />
            {explorable && !walking && <HintBar coarse={coarse} mobile={mobile} />}
```

- [ ] **Step 8: Cover the wired feedback end to end**

Append to `e2e/interact.spec.ts` (and add `emptyFloorPoint`, `highlightOf` and `PHONE_SAFE` to its import list from `./hq`, plus `import en from "../messages/en.json";` under the Playwright import):

```ts
test.describe("point and go feedback", () => {
  test("the hovered target is announced for screen readers", async ({ page }) => {
    await openFloor(page, "/en/labs");
    const pod = await visibleTarget(page, { kinds: ["door"] });
    await hoverTarget(page, pod.id);
    await expect(page.getByTestId("interact-live")).toHaveText(en.hud.interact.live.replace("{label}", pod.label));
  });

  test("a click on empty floor does not move the rover and shows the hint once", async ({ page }) => {
    await openFloor(page, "/en/labs");
    const start = await roverAt(page);
    const empty = await emptyFloorPoint(page);
    await page.mouse.click(empty.x, empty.y);
    const hint = page.getByTestId("point-hint");
    await expect(hint).toHaveText(en.hud.interact.hintFine);
    await waitForFrames(page, 20);
    const still = await roverAt(page);
    expect(Math.hypot(still.x - start.x, still.z - start.z)).toBeLessThan(0.05);
    await expect(hint).toHaveCount(0, { timeout: 10_000 });
    await page.mouse.click(empty.x, empty.y);
    await waitForFrames(page, 20);
    await expect(hint).toHaveCount(0);
  });
});

test.describe("point and go on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

  test("a first tap selects a target and offers Go; Go drives there and opens it", async ({ page }) => {
    const errors = collectErrors(page);
    await openFloor(page, "/en/labs");
    const pod = await visibleTarget(page, { kinds: ["door"], safe: PHONE_SAFE });
    const start = await roverAt(page);
    const point = await targetPoint(page, pod.id);
    await page.touchscreen.tap(point.x, point.y);
    await expect.poll(() => hoveredTarget(page)).toEqual({ id: pod.id, via: "tap" });
    const go = page.getByTestId("interact-go");
    await expect(go).toBeVisible();
    await expect(go).toContainText(pod.label);
    await waitForFrames(page, 20);
    const still = await roverAt(page);
    expect(Math.hypot(still.x - start.x, still.z - start.z)).toBeLessThan(0.05);
    await go.tap();
    await waitForRoom(page, pod.action.room!);
    expect(errors).toEqual([]);
  });

  test("a second tap on the same target drives there; a tap on empty floor clears the selection", async ({ page }) => {
    await openFloor(page, "/en/labs");
    const pod = await visibleTarget(page, { kinds: ["door"], safe: PHONE_SAFE });
    const point = await targetPoint(page, pod.id);
    const go = page.getByTestId("interact-go");
    await page.touchscreen.tap(point.x, point.y);
    await expect(go).toBeVisible();
    const empty = await emptyFloorPoint(page);
    await page.touchscreen.tap(empty.x, empty.y);
    await expect(go).toHaveCount(0);
    await page.touchscreen.tap(point.x, point.y);
    await expect(go).toBeVisible();
    await page.touchscreen.tap(point.x, point.y);
    await waitForRoom(page, pod.action.room!);
  });
});

test.describe("point and go with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the highlight holds still", async ({ page }) => {
    await openFloor(page, "/en/labs");
    const pod = await visibleTarget(page, { kinds: ["door"] });
    await hoverTarget(page, pod.id);
    await waitForFrames(page, 5);
    expect(await highlightOf(page)).toBeCloseTo(0.9, 5);
    await waitForFrames(page, 20);
    expect(await highlightOf(page)).toBeCloseTo(0.9, 5);
  });
});
```

Run: `rtk bun run build && E2E_PORT=4391 rtk bunx playwright test e2e/interact.spec.ts`
Expected: PASS, `9 passed`. (The failing tests of this task are the unit tests of Step 1; to see these e2e tests fail first, run them on a build without Step 7: they time out waiting for `interact-live`, `point-hint` and `interact-go`.)

- [ ] **Step 9: Quick verification**

Run: `rtk bun run verify:quick && E2E_PORT=4391 rtk bun run e2e:changed`
Expected: everything passes (`e2e:changed` runs `experience`, `hud`, `missions`, `drawer-solid`, `interact`, `pads`, `career`, the smoke specs for messages and any spec the earlier commits on this branch touched).

- [ ] **Step 10: Commit**

```bash
rtk git add src/experience/interact/missed.ts src/hud/InteractStatus.tsx src/hud/Hud.tsx src/experience/Experience.tsx messages/en.json messages/id.json tests/unit/interact-missed.test.ts tests/hud/InteractStatus.test.tsx e2e/interact.spec.ts
rtk git commit -m "feat: point-and-go status, Go chip, empty-click hint and controls copy"
```

---
### Task 7: Screenshots for the owner

**Files:**
- Modify: `e2e/screenshots.spec.ts` (import list, new describe at the end)

**Interfaces:**
- Consumes: `visibleTarget`, `hoverTarget`, `targetPoint`, `emptyFloorPoint`, `PHONE_SAFE` (Task 4); test ids `point-hint`, `interact-go` (Task 6).
- Produces: `screenshots/hq-point-hover-1440x900.png`, `screenshots/hq-point-hint-1440x900.png`, `screenshots/hq-point-tap-390x844.png` (gitignored; CI uploads them as the `screenshots` artifact on a PR labelled `screenshots`).

- [ ] **Step 1: Add the captures**

In `e2e/screenshots.spec.ts`, replace

```ts
import { asReturningVisitor, driveTo, padsOf, waitForHQ, waitForPhase, waitForRoom } from "./hq";
```

with

```ts
import { asReturningVisitor, driveTo, emptyFloorPoint, hoverTarget, padsOf, PHONE_SAFE, targetPoint, visibleTarget, waitForHQ, waitForPhase, waitForRoom } from "./hq";
```

and append:

```ts
test.describe("point and go", () => {
  test("hover label and outline on L3 @ 1440x900", async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await asReturningVisitor(page);
    await page.goto("/en/labs?tier=full&walk=off");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await page.evaluate(() => document.fonts.ready);
    // The full tier renders through the bloom composer: give the floor time to mount and settle.
    await page.waitForTimeout(6000);
    const pod = await visibleTarget(page, { kinds: ["door"] });
    await hoverTarget(page, pod.id);
    // Troika builds the label glyphs slowly on SwiftShader.
    await page.waitForTimeout(2500);
    await page.screenshot({ path: "screenshots/hq-point-hover-1440x900.png" });
    const empty = await emptyFloorPoint(page);
    await page.mouse.click(empty.x, empty.y);
    await expect(page.getByTestId("point-hint")).toBeVisible();
    await page.screenshot({ path: "screenshots/hq-point-hint-1440x900.png" });
    await context.close();
  });

  test("tap to select with the Go chip on L3 @ 390x844", async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await asReturningVisitor(page);
    await page.goto("/en/labs?tier=lite&walk=off");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(4000);
    const pod = await visibleTarget(page, { kinds: ["door"], safe: PHONE_SAFE });
    const point = await targetPoint(page, pod.id);
    await page.touchscreen.tap(point.x, point.y);
    await expect(page.getByTestId("interact-go")).toBeVisible();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: "screenshots/hq-point-tap-390x844.png" });
    await context.close();
  });
});
```

- [ ] **Step 2: Capture and review**

Run: `rtk bun run build && SCREENSHOTS=1 E2E_PORT=4391 rtk bunx playwright test e2e/screenshots.spec.ts -g "point and go"`
Expected: `2 passed`; three PNGs in `screenshots/`.

Open each PNG and check: the cyan outline sits on the hovered pod, the destination ring sits on its door pad, the name floats above the pod and reads clearly (white with a dark outline), nothing overlaps the HUD; the hint pill sits in the bottom band center above the controls hint; on the phone the Go chip sits in the bottom band between the joystick and the view controls without overlapping either. If the label is hard to read, raise `fontSize` in `Label` (InteractLayer.tsx) in steps of 0.1 and capture again.

- [ ] **Step 3: Commit**

```bash
rtk git add e2e/screenshots.spec.ts
rtk git commit -m "test: point-and-go screenshots"
```

---

### Task 8: Docs (README, AGENTS, input spec)

**Files:**
- Modify: `README.md`, `AGENTS.md`, `docs/superpowers/specs/agent-hq/03-rover-camera-input.md`, `docs/superpowers/specs/2026-10-09-agent-hq-design.md`, `docs/superpowers/specs/agent-hq/08-quality-acceptance.md`

**Interfaces:**
- Consumes: the final names from Tasks 1 to 6 (keep them identical in prose).
- Produces: documentation only.

- [ ] **Step 1: README**

In the status table, after the row `| Walkable floors 3 | RF as a walkable roof deck: Signal Garden with the courier drone and the "Meet me" walk | Done |`, add:

```markdown
| Point-and-go | Hover or tap a glowing object (room doors, elevator pads, teleporters, stations, the Ask Rover kiosk, boards) to see its name and drive there; no free click-to-move | Done |
```

In the "Try it" paragraph, replace

```markdown
drive with WASD or the arrow keys (hold **Shift** to boost to about twice the speed; on touch screens hold the boost button next to the joystick) or click the floor, and change floors with the elevator panel
```

with

```markdown
drive with WASD or the arrow keys (hold **Shift** to boost to about twice the speed; on touch screens use the joystick and hold the boost button next to it), point at a glowing object (a room, a pad, a board, the kiosk) to see its name and click it to drive there and open it (on touch screens tap it, then tap again or press **Go**; empty floor never moves the rover), and change floors with the elevator panel
```

- [ ] **Step 2: AGENTS.md, folder layout and lists**

Apply these exact replacements:

1. `pads.ts (floor pads, the pad latch), teleport.ts (L2 teleport beam timeline)` becomes

```text
pads.ts (floor pads, the pad latch), teleport.ts (L2 teleport beam timeline)
  experience/interact/          point-and-go (owner request): pure registry.ts (Interactable, interactablesFor, registerExtraInteractables), pick.ts (pick volumes, click versus tap, performInteract, commands) and runtime.ts (`__hq.interact` probe); InteractLayer.tsx (one invisible instanced hit mesh, outline, destination ring, floating label), useInteractables.ts, missed.ts (empty clicks)
```

2. `(PAD_ICONS); a click opens the picker. TeleportBeam.tsx draws the beam` becomes `(PAD_ICONS); clicks go through point-and-go (the rover drives onto the pad, then the picker opens). TeleportBeam.tsx draws the beam`
3. `MissionHud, HudLaunchers, events, HologramOverlay` becomes `MissionHud, HudLaunchers, events, HologramOverlay, InteractStatus (point-and-go: aria-live target, Go chip, one-time hint)`
4. `drawer layout and URL, ASCII, hologram` becomes `drawer layout and URL, ASCII, hologram, interact registry and pick logic`
5. `floor pads and pickers (pads.spec.ts), opt-in screenshots` becomes `floor pads and pickers (pads.spec.ts), point-and-go (interact.spec.ts: hover, click, empty floor, touch, reduced motion), opt-in screenshots`

- [ ] **Step 3: AGENTS.md, behavior bullets**

6. `Manual driving only: the autopilot (missions, walks, the elevator approach) and click-to-move keep their speed.` becomes `Manual driving only: the autopilot (missions, walks, the elevator approach, point-and-go drives) keeps its speed.`
7. `Data flow: input sources (`input/useInputSources.ts`, HUD buttons, joystick) emit intents on the `intents` bus.` becomes `Data flow: input sources (`input/useInputSources.ts`, HUD buttons, joystick, the point-and-go layer) emit intents on the `intents` bus; a click on the floor emits nothing (there is no `goto` intent).`
8. `In-world room objects use `roomHandlers(room)` (`floors/interact.ts`), which calls `goToRoom`.` becomes `In-world targets are point-and-go registry entries (see "Point-and-go"); floors add no click handlers of their own.`
9. `clicking a pad on the current floor opens it without driving (`PadGlow`).` becomes `clicking a pad drives there through point-and-go and then opens the picker (at once when the rover already stands on it).`
10. `clicking it opens the pods palette (the full list).` becomes `clicking it drives to the board stop and opens the pods palette (the full list).`
11. `clicks go through invisible `HitBox`es:` becomes `clicks go through the point-and-go registry (`RF:station:contact`, `RF:station:cv`):`
12. `Click-to-move and scrubbing keep the navgrid.` becomes `Point-and-go drives are mission legs, so they follow the road too; scrubbing keeps the navgrid.`
13. `clicking the floor closes it and drives.` becomes `clicking empty floor closes it; the rover does not move.`
14. `` `window.__hq` exposes `{ store, rover, layouts }` for Playwright (`layouts` carries the floor pads; e2e drives with `driveTo` and reads pads with `padsOf` from `e2e/hq.ts`). `` becomes `` `window.__hq` exposes `{ store, rover, layouts, interact }` for Playwright (`layouts` carries the floor pads; `interact` is `interactRuntime`: the current floor's `items`, `project`, `screenOf(id)` and `highlight`; e2e drives with `driveTo`, reads pads with `padsOf` and points with `visibleTarget`, `targetPoint`, `hoverTarget` and `emptyFloorPoint` from `e2e/hq.ts`). ``
15. `` `sessionStorage` keys: `hq:intro` (boot and intro played this session, `src/lib/intro-session.ts`); owned by the Ask dock: `` becomes `` `sessionStorage` keys: `hq:intro` (boot and intro played this session, `src/lib/intro-session.ts`), `hq:point-hint` (the one-time point-and-go hint, `src/experience/interact/missed.ts`); owned by the Ask dock: ``
16. `` `picker` (floor pad picker) and `beam` (L2 teleport beam); actions `openPicker(picker)` `` becomes `` `picker` (floor pad picker), `beam` (L2 teleport beam), `hover` (point-and-go target, `HoverState`) and `pointHint` (its one-time hint); actions `setHover(hover)`, `setPointHint(on)`, `openPicker(picker)` ``
17. In "Fast verification", `(for example `src/experience/floors/labs/**` to `labs`, `gallery` and `walk`,` becomes `(for example `src/experience/floors/labs/**` to `labs`, `gallery` and `walk`, `src/experience/interact/**` to `interact`, `experience`, `pads` and `career`,`

- [ ] **Step 4: AGENTS.md, new section**

Insert right before the line `## Glass Drawer (shared room panel, Phase 4)`:

```markdown
## Point-and-go (owner request, October 2026)

- The rover never drives to a clicked floor point. Visitors drive with WASD or the arrows (Shift boost) or the joystick (boost button), or point at a glowing target: desktop hover highlights it (outline, destination ring, floating name, pointer cursor) and a click drives there along the road and runs its action; on touch the first tap selects it (HUD "Go to ..." chip, aria-live text) and a second tap or Go drives. A click on empty floor only closes an open room, clears a tap selection and shows a hint once per session (`hq:point-hint`).
- Targets come from one registry, `src/experience/interact/registry.ts` (pure): `interactablesFor(floor, layouts, { experience, labels })` returns `Interactable` entries: `id`, `floor`, `kind` (`door`, `elevator-pad`, `teleporter`, `station`, `kiosk`, `board`), `label` (resolved for the tower's locale), `at` (approach point), `bounds`, `height`, `action` (`open-room`, `elevator-picker`, `teleport-picker` with `year`, `command`). Doors come from `FloorLayout.doors` with room footprints from each floor's layout builder (RF doors are `station`s), pads from `FloorLayout.pads`, plus the L1 profile hologram, skills wall and Ask Rover kiosk, the L3 wing boards and the L4 archive board. Ids: `${floor}:door:${slug}`, `${floor}:pad:elevator`, `L2:teleporter:${year}`, `${floor}:station:${key}`, `L1:kiosk:ask-rover`, `L3:board:${wing}`, `L4:board:archive`.
- New in-world targets: add them to `baseInteractables` (built-in floor content) or call `registerExtraInteractables(floor, items)` from the feature (it returns the dispose function; ids must be unique, and the built-in entry wins a clash). Never put navigation `onClick` or hover handlers on scene objects; L1 certification badges and pills and L4 research paper plates keep their own clicks (they open previews, not drives). Commands: `terminal`, `palette:pods`, `palette:rooms`, `palette:posts`, `cv` (`parseCommand` in `pick.ts`).
- `InteractLayer` (mounted in `Scene`) puts every target of the current floor into one invisible instanced unit box (no draw call) and handles hover and clicks; the highlight costs at most 4 draw calls while a target is hovered (the additive fill only on the full tier; no pulse under reduced motion). The `interact` intent carries the target; the Director runs `performInteract`: rooms through `goToRoom`, everything else as a mission `drive` step followed by its action, so keys and the joystick cancel it and a guided walk pauses.
- Tests: `tests/unit/interact-registry.test.ts` (real content on every floor), `tests/unit/interact-pick.test.ts`, `tests/unit/interact-missed.test.ts`, `tests/hud/InteractStatus.test.tsx`, `e2e/interact.spec.ts`.
```

- [ ] **Step 5: Input spec, design spec and acceptance**

In `docs/superpowers/specs/agent-hq/03-rover-camera-input.md`:

- `- Click or tap to move uses A* on the floor navgrid with 8-way movement, then string-pulling to smooth the path. Unreachable targets snap to the nearest reachable cell.` becomes `- Point-and-go (owner request, October 2026; replaces click and tap to move): hovering a glowing target (door, elevator call pad, L2 teleporter, station, kiosk, board) highlights it with its name; a click (on touch: a first tap selects, a second tap or the Go chip goes) drives the rover along the road (`roadRoute`, with A* on the navgrid for the legs off the road) and runs the target's action on arrival. A click or tap on empty floor never moves the rover. Targets come from one registry (`src/experience/interact/registry.ts`).`
- `| Move | Click without drag | Click | WASD / arrows | Tap, or the joystick (its area never rotates) |` becomes two rows:

```markdown
| Move | WASD / arrows | WASD / arrows | WASD / arrows | The joystick (its area never rotates) |
| Go to a target | Hover to see its name, click to drive there | Same | Cmd-K or Ask Rover | Tap to select, tap again or press Go |
```

- `| `goto` | World point or `RoomId` | Click/tap on the floor, click a room label |` becomes `| `interact` | `Interactable` (registry entry) | Click on a hovered target, a second tap or the Go chip on touch |`
- `A shorter press stays a click or tap (click to move); a longer one only rotates.` becomes `A shorter press stays a click or tap (it picks a target, or does nothing on empty floor); a longer one only rotates.`
- `| Move within a floor | WASD/arrows or click to move | Tap to move, optional joystick | Tap to move. On L2 the camera is on a rail and horizontal swipe travels through time. |` becomes `| Move within a floor | WASD/arrows; click a glowing target to drive there | Joystick; tap a target, then tap again or press Go | Same as tablet. On L2 the camera is on a rail and horizontal swipe travels through time. |`
- `| Open a room | Drive into the doorway or click the room label | Same, by tap | Same, by tap |` becomes `| Open a room | Drive into the doorway or click the room (point-and-go) | Same, or tap the room twice | Same |`

In `docs/superpowers/specs/2026-10-09-agent-hq-design.md`, apply the same replacement to the `| Move within a floor | ... |` row.

In `docs/superpowers/specs/agent-hq/08-quality-acceptance.md`, `- The rover drives with keyboard, click-to-move, tap-to-move and joystick, with collision.` becomes `- The rover drives with keyboard and joystick, with collision (click and tap to move were replaced by point-and-go in October 2026, see appendix 03).`

- [ ] **Step 6: Verify the docs**

Run: `rtk git grep -n -i -E "click the floor|click-to-move|tap-to-move|tap to move|click to move" -- README.md AGENTS.md docs/superpowers/specs`
Expected: only the historical phase rows and plans remain (the README Phase 2 status row, files under `docs/superpowers/plans/`); no current-behavior text in README "Try it", AGENTS or the specs.

Run: `rtk bunx vitest run tests/content/safety.test.ts`
Expected: PASS (no em dashes or forbidden patterns in the new text).

- [ ] **Step 7: Commit**

```bash
rtk git add README.md AGENTS.md docs/superpowers/specs
rtk git commit -m "docs: point-and-go in README, AGENTS and the input spec"
```

---

### Task 9: Full verification and the PR

**Files:** none new.

**Interfaces:**
- Consumes: the whole branch.
- Produces: one PR against `main`, labelled `screenshots`.

- [ ] **Step 1: Quick checks**

Run: `rtk bun run verify:quick`
Expected: exit code 0 (typecheck, lint, every unit test including the em dash scan, `next build`).

- [ ] **Step 2: Full e2e (this branch changed `e2e/hq.ts`)**

Run: `E2E_PORT=4391 rtk bun run e2e:full`
Expected: every spec passes, including `walk`, `missions`, `pads`, `career`, `labs`, `library-roof`, `roof`, `hud`, `drawer-solid` and `interact`. A failure in a walk, mission or deep-link spec means a click handler still fires or the drive cancels too eagerly: reproduce it alone (`E2E_PORT=4391 rtk bun run e2e:full e2e/walk.spec.ts -g "<title>"`) and fix the cause, never add retries.

- [ ] **Step 3: Push and open the PR**

```bash
rtk git push -u origin feat/point-and-go
rtk gh pr create --base main --head feat/point-and-go --label screenshots --title "feat: point-and-go interactables instead of click-to-move" --body "$(cat <<'BODY'
Owner request: "i dont like click to walk freely i only want hover click to walk to a point (like elevator) the projects and etc".

## What changes
- Clicking or tapping the floor no longer moves the rover (the `goto` intent, the floor slab click and the click marker are gone). Keyboard (WASD, arrows, Shift boost) and the touch joystick and boost button are unchanged.
- Point-and-go: hover a glowing object to see an outline, a destination ring and its name; click it and the rover drives there along the road and runs its action (open the room, the floor picker, the year picker, Ask Rover, the projects or posts palette). On touch, the first tap selects (Go chip, aria-live), a second tap or Go drives.
- One shared registry, `src/experience/interact/registry.ts` (`interactablesFor`, `registerExtraInteractables`), consumed by the Highlights Hall and onboarding plans.
- One invisible instanced hit mesh per floor (no draw call); the highlight costs at most 4 draw calls while hovering; no pulse under reduced motion; the lite tier skips the additive fill.
- A click on empty floor closes an open room and shows a one-time hint.

## Verification
- `bun run verify:quick`
- `bun run e2e:full` (new `e2e/interact.spec.ts`: hover label, click to drawer, empty floor, touch tap flow at 390x844, manual cancel, reduced motion, render budget on L2 and L3)
- Screenshots: `hq-point-hover-1440x900`, `hq-point-hint-1440x900`, `hq-point-tap-390x844` (screenshots artifact)

Do not merge without the owner.
BODY
)"
```

Expected: the PR URL is printed. Do not merge.

---

## Open risks

- The consumer plans were drafted against `label: { en, id }`, a two-argument `interactablesFor` and a `HudCommand` command payload. This registry ships `label: string` (locale-resolved), a required third `InteractData` argument and string commands; the onboarding plan already isolates the registry behind one call site (`src/experience/hints/source.ts`), and scene-side consumers can read `interactRuntime.items` or call `useInteractables(floor, layouts, data)` instead.
- `visibleTarget` relies on the follow camera showing at least one target inside the safe area right after the `/en/labs` deep link (overview spot, view zone looking east). If the L3 view zone or the HUD layout changes, adjust `DESKTOP_SAFE` / `PHONE_SAFE` or drive closer first with `driveTo`; never click through the HUD.
- R3F delivers clicks to the nearest hit object first. Objects that keep their own handlers (rover, certification badges and pills, research paper plates) win when they are in front of a pick volume, which is intended; the rover additionally blocks hover behind it. A future scene object with a click handler placed inside a pick volume would steal clicks from that target.
- The L2 draw call budget is the tightest floor; the e2e test hovers on L2 to prove the 4 extra calls fit. If a later L2 change brings it close to 150, drop the destination ring on lite first.
- Touch detection uses the `pointerdown` pointer type of the last press on the hit mesh; hybrid laptops that report a pen or mouse behave as desktop (click goes at once), which is acceptable.
- Closing an open room on an empty click keeps the old drawer behavior without the drive. If the owner wants empty clicks to do strictly nothing, delete the `phase === "room"` branch in `missed.ts` and its unit test.

## Self-review

**Spec coverage**

| Requirement | Task |
|---|---|
| Remove click/tap free movement (intent, Director, slab click, marker, navgrid click use) | 5 |
| Hint text "Move: click floor" EN/ID and the touch variant, canvas description | 6 |
| Docs (README, AGENTS, specs) | 8 |
| Keep keyboard, Shift boost, joystick and boost button | 5 (untouched code), 5 Step 10 and 9 (experience e2e joystick test) |
| Hover highlight (outline/glow + floating label), pointer cursor, default elsewhere | 4 |
| Click drives along the road and runs the action (doors, elevator pad, teleporters, RF stations, boards, kiosk) | 2 (`performInteract`), 3 (Director), 4 (layer), 5 (old handlers removed) |
| L1 cert badges keep their own click | 5 (not touched), AGENTS rule in 8 |
| Touch: first tap selects, second tap or Go chip drives (decided) | 2 (`clickDecision`), 4, 6 |
| Empty floor does nothing, subtle hint once | 5, 6 |
| Shared registry with the agreed field names, extras for Highlights Hall, documented signatures | 1, contract section |
| One raycast, no per-object listeners, render budget, tiers, reduced motion | 4, 5, 6 (e2e budget and reduced motion) |
| Accessibility: Cmd-K and walks stay, aria-live hovered label | 3 (walk pause), 6 |
| Walks, missions, deep links, pads, teleporters keep working; manual keys cancel | 3, 4 (cancel e2e), 9 (full suite) |
| Unit tests: registry per floor from real content, pick logic | 1, 2, 6 |
| E2E: hover label, click opens drawer, empty floor, touch at 390x844, joystick | 4, 5, 6 |
| Screenshots | 7 |
| PR | 9 |

**Placeholder scan:** no TBD or "similar to" steps; every code step carries its code, every run step its command and expected result.

**Type consistency:** `Interactable`, `InteractAction` (`teleport-picker` with `year`), `InteractData`, `InteractLabels` (Task 1) match their use in `pick.ts` (Task 2), the store `HoverState` (Task 3), `InteractLayer` and `Experience` labels (Task 4), `missed.ts` and `InteractStatus` (Task 6). The intent is `{ type: "interact"; item: Interactable }` everywhere (intents, Director, WalkLayer, InteractLayer, InteractStatus, unit tests). Test ids `interact-live`, `interact-go`, `point-hint` and helpers `visibleTarget`, `targetPoint`, `hoverTarget`, `hoveredTarget`, `emptyFloorPoint`, `highlightOf`, `PHONE_SAFE`, `DESKTOP_SAFE` are defined in Task 4 or 6 before any later use. The registry ids used in tests (`L2:teleporter:${year}`, `L2:door:crypto-tracker-2024`, `L3:door:${slug}`) follow the id rules in `baseInteractables`.
