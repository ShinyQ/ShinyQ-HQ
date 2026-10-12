# Elevator Call Pads and L2 Year Teleporters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a glowing call pad in front of the elevator door on every floor (L1, L2, L3, L4, RF) that opens a floor-picker modal, and a teleporter pad on every L2 year plaza that opens a year picker and beams the rover to the chosen plaza.

**Architecture:** Pads are pure layout data (`FloorLayout.pads`, built in `buildFloorLayouts` and `buildCareerRoad`) checked by new pad space rules. The Director runs the existing door latch over pads (`stepPadLatch`) and opens a store-held picker (`store.picker`); a click on a pad opens it too. One HUD component (`PadPicker`) renders both pickers on the shared `Modal` (bottom sheet on phones); a floor pick emits the same `elevator` intent as the right-side panel, a year pick emits a new `teleport` intent that the Director turns into a short beam (`store.beam`, pure timeline in `nav/teleport.ts`) with a camera cut.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript strict, three.js with React Three Fiber and drei, zustand, next-intl, Tailwind CSS 4, Vitest (node and jsdom), Playwright on SwiftShader, Bun, libwebp (`cwebp`) for thumbnails.

## Global Constraints

- No em dashes (U+2014) anywhere: code, comments, copy, docs, commits, PR text. A unit test scans the repo. Use commas, colons, parentheses or "to".
- Bilingual: every UI string lives in `messages/en.json` and `messages/id.json` with identical keys and placeholders (`tests/unit/ui-copy.test.ts`). Indonesian is natural and professional, technical terms stay in English.
- Floor names in the picker are the elevator button names from `hud.floorLabel`: L1 Home, L2 Journey, L3 Work, L4 Writing, RF About (ID: Beranda, Perjalanan, Karya, Tulisan, Tentang).
- The right-side `ElevatorPanel` (`src/hud/ElevatorPanel.tsx`) stays exactly as it is.
- Render budget per floor: under 150 draw calls and under 30k triangles (`expectRenderBudget` in `e2e/hq.ts`).
- Pads pass the space rules (`expectSpaceRules` / new `expectPadRules`) and never block roads or doors: pads are not obstacles, stay off door pads and spurs, and stay off a road's driving width except at a dead end (the elevator approach).
- L2 years: every year plaza in content gets a teleporter (today 2019 to 2026; the 2016 prologue folds into 2019 as today and is shown on the 2019 option).
- Teleport: short beam (0.3 s rise, jump, 0.3 s fade); reduced motion: instant fade cut of 150 ms (`REDUCED_CUT`); camera follows (cut, not glide); walks, missions and deep links unaffected; a teleport cancels any mission leg, click-to-move drive and autopilot.
- One shared pad component and trigger (door-trigger latch: opens once, re-arms after leaving) and one shared picker (arrows, Home, End, Enter, Esc, focus trap, `aria-modal`, `aria-current` on the current option, bottom sheet on phones, 44 px touch targets).
- Floor thumbnails: static committed webp, 320 x 180, at most 16 KB each, loaded only when the picker opens.
- Pure modules (`nav/*.ts`, `floors/*/layout.ts`, `hud/pads/picker.ts`) stay free of React and three side effects. HUD and scene talk only through the store and intents.
- Coordination with the parallel HUD polish session: do not touch the top bar (`src/hud/Controls.tsx`), boost, `ProfileCard`, the L1 Lobby circle/square alignment (`src/experience/floors/lobby/*`) or the drawer footer (`src/hud/drawer/*`). The L1 pad derives from `layout.approach` (`standard()` in `src/experience/config.ts`: door x + 3), so it follows any door alignment fix. `src/hud/Hud.tsx` only gets one import line and two mount lines; on a rebase conflict keep the other session's version and re-add those three lines.
- Static export, no new routes, no new runtime dependencies.
- Before every push: `bun run verify:quick` then `bun run e2e:changed`. Because this work changes `e2e/hq.ts` and `package.json`, run `bun run e2e:full` once before opening the PR.
- Conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), prefer the `rtk` git wrapper, one PR, never merge without the owner.

---

## File Structure

Create:

- `src/experience/nav/pads.ts`: pad constants (`PAD`), ids, `elevatorPad`, `padAt`, `pickerFor`, `stepPadLatch`, `primedPadLatch`, type `PickerRequest`. Pure.
- `src/experience/nav/teleport.ts`: teleport beam timeline (`BEAM`, `Beam`, `startBeam`, `advanceBeam`, `beamGlow`, `beamDuration`, `beamJumpAt`). Pure.
- `src/experience/fx/PadGlow.tsx`: one instanced pad glow per floor plus a neon icon per pad kind; click opens the picker.
- `src/experience/fx/TeleportBeam.tsx`: the beam column (one draw call, only while beaming).
- `src/hud/pads/picker.ts`: pure picker helpers (`floorOptions`, `yearOptions`, `nextIndex`, `floorThumb`, `PickerOption`).
- `src/hud/pads/PadPicker.tsx`: `PadPicker` (both pickers on the shared `Modal`) and `BeamFade`.
- `scripts/floor-thumbs.ts`: converts floor captures to `public/floors/{id}.webp` with `cwebp`.
- `public/floors/L1.webp`, `L2.webp`, `L3.webp`, `L4.webp`, `RF.webp`: committed picker thumbnails.
- `tests/unit/pads.test.ts`, `tests/unit/pad-space.test.ts`, `tests/unit/floor-pads.test.ts`, `tests/unit/teleport.test.ts`, `tests/unit/pad-picker.test.ts`, `tests/hud/Modal.test.tsx`, `tests/hud/PadPicker.test.tsx`, `tests/content/floor-thumbs.test.ts`, `e2e/pads.spec.ts`.
- `docs/superpowers/plans/2026-10-12-elevator-pads-teleporters.md`: this plan, committed (AGENTS.md: write a plan before a phase).

Modify:

- `src/experience/types.ts`: `PadKind`, `PadTrigger`, `FloorLayout.pads`.
- `src/experience/nav/doors.ts`: generic latch (`DoorLatch<K>`, `DoorStep<K>`, `stepDoorLatch<K>`) and an optional `dwell`.
- `src/experience/nav/space.ts`: `SpaceInput.pads`, `padViolations`, `PadSpaceInput`, pad rules, `reachFrom` helper.
- `tests/helpers/space.ts`: `expectPadRules`.
- `src/experience/floors/career/layout.ts`: `CAREER_ROAD.teleport`, `CareerYear.teleport`, `CareerRoadLayout.pads`.
- `src/experience/config.ts`: elevator pad on every floor, L2 teleporters merged in.
- `src/experience/input/intents.ts`: `{ type: "teleport"; pad: string }`.
- `src/store/useHQStore.ts`: `picker`, `beam`, `openPicker`, `closePicker`, `setBeam`; a new ride clears the picker.
- `src/experience/fx/holoIcons.ts`: `PAD_ICONS`, `PAD_TONE`.
- `src/experience/tower/FloorLevel.tsx`: mounts `PadGlow`.
- `src/experience/scene/Scene.tsx`: mounts `TeleportBeam`.
- `src/experience/scene/Director.tsx`: pad latch, picker open, teleport intent, beam timeline, arrival priming.
- `src/experience/rover/runtime.ts`: `cameraSnap`.
- `src/experience/camera/CameraDirector.tsx`: cut on `cameraSnap`.
- `src/experience/Experience.tsx`: `window.__hq.layouts` for Playwright.
- `src/components/Modal.tsx`: `sheet` prop (bottom sheet on phones).
- `src/hud/Hud.tsx`: mounts `BeamFade` and `PadPicker`.
- `messages/en.json`, `messages/id.json`: `hud.pads.*`.
- `e2e/hq.ts`: `padsOf`, `driveTo`, `railScreenPoint` (moved from `career.spec.ts`).
- `e2e/career.spec.ts`: imports `railScreenPoint` from `./hq`.
- `e2e/screenshots.spec.ts`: floor thumbnail captures and pad picker captures.
- `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts`: `pads` spec and rules.
- `package.json`: `floor:thumbs` script.
- `tests/unit/career-layout.test.ts`, `tests/unit/store.test.ts`, `tests/unit/holo-icons.test.ts`: new cases.
- `AGENTS.md`, `README.md`: docs.

Pad geometry (verified against the real content at main @ 2f986ab): every floor's `approach` is 3 u east of the door on the shaft axis ((-21, 0) on L1 to L4, (-17, 0) on RF); the nearest obstacle is at least 6.65 u away. L2 teleporters sit at (plaza start + 3.5, plaza center z + 6.5): at least 4.5 u from obstacles, 7.38 u from spurs, 9.27 u from door pads, 6.5 u from the road centerline (road half width 4 plus pad radius 1.4 is 5.4), and clear of the floor digits (center plus or minus 2.5 u in z).

---

### Task 1: Pad model and the shared door latch

**Files:**
- Create: `src/experience/nav/pads.ts`
- Modify: `src/experience/types.ts` (after `DoorTrigger`, and `FloorLayout`)
- Modify: `src/experience/nav/doors.ts:61-140` (latch types and `stepDoorLatch`)
- Create: `docs/superpowers/plans/2026-10-12-elevator-pads-teleporters.md`
- Test: `tests/unit/pads.test.ts`

**Interfaces:**
- Consumes: `stepDoorLatch`, `DoorLatch`, `DOOR_DWELL` from `src/experience/nav/doors.ts`.
- Produces:
  - `type PadKind = "elevator" | "teleport"` and `interface PadTrigger { id: string; kind: PadKind; at: Vec2; radius?: number; year?: number; face: number }` in `types.ts`; `FloorLayout.pads?: PadTrigger[]`.
  - `PAD = { radius: 1.4, dwell: 0.6, iconY: 2.2, iconSize: 1.4 }`.
  - `type PickerRequest = { kind: "floor" } | { kind: "year"; from: number }`.
  - `elevatorPadId(floor: FloorId): string` (`"elevator:L2"`), `teleportPadId(year: number): string` (`"teleport:2021"`).
  - `elevatorPad(layout: Pick<FloorLayout, "id" | "approach">, face: number): PadTrigger`.
  - `padRadius(pad): number`, `padAt(pads, p): PadTrigger | null`, `pickerFor(pad): PickerRequest`.
  - `interface PadStep { riding: boolean; explore: boolean; following: boolean; now: number; speed: number }`.
  - `stepPadLatch(latch: DoorLatch<string>, pads, pose: Vec2, step: PadStep): PadTrigger | null`.
  - `primedPadLatch(pads, p: Vec2): DoorLatch<string>`.
  - `DoorLatch<K extends string = RoomId>`, `DoorStep<K>` with `dwell?: number`, `stepDoorLatch<K>(...)`.

- [ ] **Step 1: Create the branch and commit this plan into the repo**

Work in a writable ShinyQ-HQ checkout (never in the read-only reference clone `hq-local`).

```bash
rtk git fetch origin
rtk git checkout -b feat/elevator-pads-teleporters origin/main
cp /Users/shinyq/.copilot/session-state/d439b68f-b2e6-4b77-9feb-f9099e8cd824/files/plans/r3-c-pads-teleporters.md docs/superpowers/plans/2026-10-12-elevator-pads-teleporters.md
rtk git add docs/superpowers/plans/2026-10-12-elevator-pads-teleporters.md
rtk git commit -m "docs: plan for elevator call pads and L2 year teleporters"
```

Expected: a new branch with one commit.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/pads.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DoorLatch } from "@/experience/nav/doors";
import { elevatorPad, elevatorPadId, PAD, padAt, pickerFor, primedPadLatch, stepPadLatch, teleportPadId } from "@/experience/nav/pads";
import type { PadTrigger } from "@/experience/types";

const lift: PadTrigger = { id: "elevator:L2", kind: "elevator", at: { x: -21, z: 0 }, face: 0 };
const tele: PadTrigger = { id: "teleport:2021", kind: "teleport", at: { x: 40, z: 6.5 }, year: 2021, face: 0 };
const pads = [lift, tele];
const still = { riding: false, explore: true, following: false, now: 0, speed: 0 };

describe("floor pads", () => {
  it("places the elevator pad on the approach in front of the shaft door", () => {
    expect(elevatorPad({ id: "L3", approach: { x: -21, z: 0 } }, Math.PI / 2)).toEqual({
      id: "elevator:L3",
      kind: "elevator",
      at: { x: -21, z: 0 },
      face: Math.PI / 2,
    });
    expect(elevatorPadId("RF")).toBe("elevator:RF");
    expect(teleportPadId(2019)).toBe("teleport:2019");
  });

  it("finds the pad whose circle contains a point", () => {
    expect(padAt(pads, { x: -21 + PAD.radius - 0.01, z: 0 })?.id).toBe("elevator:L2");
    expect(padAt(pads, { x: -21 + PAD.radius + 0.01, z: 0 })).toBeNull();
    expect(padAt(pads, { x: 40.5, z: 7 })?.id).toBe("teleport:2021");
    expect(padAt(undefined, { x: 0, z: 0 })).toBeNull();
  });

  it("opens the floor picker on an elevator pad and the year picker on a teleporter", () => {
    expect(pickerFor(lift)).toEqual({ kind: "floor" });
    expect(pickerFor(tele)).toEqual({ kind: "year", from: 2021 });
  });

  it("fires once when the rover stops on a pad and re-arms after it leaves", () => {
    const latch: DoorLatch<string> = { room: null };
    expect(stepPadLatch(latch, pads, lift.at, still)?.id).toBe("elevator:L2");
    expect(stepPadLatch(latch, pads, lift.at, still)).toBeNull();
    expect(stepPadLatch(latch, pads, { x: 0, z: 0 }, still)).toBeNull();
    expect(stepPadLatch(latch, pads, lift.at, still)?.id).toBe("elevator:L2");
  });

  it("does not fire while driving across a pad at speed, only after PAD.dwell", () => {
    const latch: DoorLatch<string> = { room: null };
    const fast = { ...still, speed: 9 };
    expect(stepPadLatch(latch, pads, tele.at, { ...fast, now: 1 })).toBeNull();
    expect(stepPadLatch(latch, pads, tele.at, { ...fast, now: 1 + PAD.dwell - 0.05 })).toBeNull();
    expect(stepPadLatch(latch, pads, tele.at, { ...fast, now: 1 + PAD.dwell + 0.01 })?.id).toBe("teleport:2021");
  });

  it("ignores pads while following a path, riding, or while a picker, beam or room is up", () => {
    const latch: DoorLatch<string> = { room: null };
    expect(stepPadLatch(latch, pads, lift.at, { ...still, following: true })).toBeNull();
    expect(stepPadLatch(latch, pads, lift.at, { ...still, riding: true })).toBeNull();
    expect(stepPadLatch(latch, pads, lift.at, { ...still, explore: false })).toBeNull();
    // Standing on it while not exploring latches it: it stays silent until the rover leaves.
    expect(stepPadLatch(latch, pads, lift.at, still)).toBeNull();
  });

  it("primes the latch for a rover that starts or arrives on a pad", () => {
    const latch = primedPadLatch(pads, lift.at);
    expect(latch.room).toBe("elevator:L2");
    expect(stepPadLatch(latch, pads, lift.at, still)).toBeNull();
    expect(primedPadLatch(pads, { x: 0, z: 0 }).room).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bunx vitest run tests/unit/pads.test.ts`
Expected: FAIL with `Failed to resolve import "@/experience/nav/pads"`.

- [ ] **Step 4: Add the pad types**

In `src/experience/types.ts`, insert after the closing `}` of `interface DoorTrigger`:

```ts
/** Floor pad kinds: the elevator call pad (every floor) and the L2 year teleporter. */
export type PadKind = "elevator" | "teleport";

/** A glowing floor pad the rover parks on (or the visitor clicks) to open a picker. Not an obstacle. */
export interface PadTrigger {
  /** `elevator:<FloorId>` or `teleport:<year>`, unique per floor. */
  id: string;
  kind: PadKind;
  /** Center of the pad (floor-local). */
  at: Vec2;
  /** Trigger and glow radius (default PAD.radius). */
  radius?: number;
  /** Teleporters: the year whose plaza the pad stands on. */
  year?: number;
  /** Yaw of the floating icon (forward is (sin, cos)), toward the floor's camera. */
  face: number;
}
```

In the same file, inside `interface FloorLayout`, add after the `doors?: DoorTrigger[];` line:

```ts
  /** Floor pads (elevator call pad on every floor, L2 year teleporters), checked by the Director every frame. */
  pads?: PadTrigger[];
```

- [ ] **Step 5: Make the door latch generic and give it an optional dwell**

In `src/experience/nav/doors.ts`, replace the block from `/** Room whose zone the rover already used; ...` through the end of `stepDoorLatch` with:

```ts
/** Room whose zone the rover already used; it must leave the zone before that door fires again. Floor pads reuse it with pad ids. */
export interface DoorLatch<K extends string = RoomId> {
  room: K | null;
  /** Zone the rover is in and when it entered it (for the dwell). */
  zone?: K | null;
  since?: number;
  /**
   * Room opened by a mission, a click or the palette, whose pad must not fire again until the rover
   * has been on it and left (or has stopped elsewhere): a drawer can open while the rover is still
   * driving toward the pad, and closing it must not reopen the room when the rover gets there.
   */
  consumed?: K | null;
  consumedSeen?: boolean;
}

export interface DoorStep<K extends string = RoomId> {
  /** Phase is "explore" (no drawer, ride or overlay). */
  explore: boolean;
  /** The rover follows a path (click-to-move or mission autopilot). */
  following: boolean;
  /** Clock (s) and rover speed (u/s); a fast pass needs `dwell` in the zone. */
  now?: number;
  speed?: number;
  /** Rover heading (radians, forward is (sin, cos)) and the door's inward direction. */
  heading?: number;
  facing?: Vec2;
  /** The room whose drawer is open right now (store `activeRoom` while the phase is "room"). */
  openRoom?: K | null;
  /** Seconds a fast pass must stay in the zone before it fires (default DOOR_DWELL; floor pads use PAD.dwell). */
  dwell?: number;
}

/** Below this speed (u/s) the rover counts as stopped for releasing a consumed pad it never reached. */
const STOPPED = 0.1;

/** Driving within about 45 degrees of a door's inward direction counts as heading into it. */
export const DOOR_HEADING = Math.SQRT1_2;

/**
 * Advances the latch for the zone the rover is in and returns the room to open, if any.
 * Doors fire only on intent: the rover drives into the door (along `facing`), stops or slows down
 * on the pad, or stays on it for `dwell`. A path or a fast manual drive passing over a pad does not open it, and a mission
 * drive resolves before the drawer opens.
 */
export function stepDoorLatch<K extends string = RoomId>(
  latch: DoorLatch<K>,
  current: K | null,
  { explore, following, now = 0, speed = 0, heading, facing, openRoom = null, dwell = DOOR_DWELL }: DoorStep<K>,
): K | null {
  if (openRoom && openRoom !== latch.consumed) {
    latch.consumed = openRoom;
    latch.consumedSeen = false;
  }
  if (latch.consumed) {
    if (current === latch.consumed) latch.consumedSeen = true;
    // Released once the rover has left the pad, or has come to rest without ever reaching it.
    else if (latch.consumedSeen || (!openRoom && !following && speed < STOPPED)) latch.consumed = null;
  }
  if (!current) {
    latch.room = null;
    latch.zone = null;
    return null;
  }
  if (current !== latch.zone) {
    latch.zone = current;
    latch.since = now;
  }
  if (!explore) {
    // A room is already open (or a ride runs): standing here must not reopen it after closing.
    latch.room = current;
    return null;
  }
  if (current === latch.room || current === latch.consumed || following) return null;
  const into = heading !== undefined && facing !== undefined && Math.sin(heading) * facing.x + Math.cos(heading) * facing.z >= DOOR_HEADING;
  if (speed >= DOOR_SLOW && !into && now - (latch.since ?? now) < dwell) return null;
  latch.room = current;
  return current;
}
```

- [ ] **Step 6: Write the pad module**

Create `src/experience/nav/pads.ts`:

```ts
import type { FloorId } from "@/content/schema";
import type { FloorLayout, PadTrigger, Vec2 } from "../types";
import { stepDoorLatch, type DoorLatch } from "./doors";

/**
 * Floor pads (owner request): a glowing call pad in front of the elevator door on every floor, and a
 * teleporter on every L2 year plaza. Pure: no React or three. Pads are not obstacles; they use the door
 * latch, so a pad opens its picker once when the rover stops or slows on it, and again only after the
 * rover has left it.
 */
export const PAD = {
  /** Trigger and glow radius (u): wider than the rover (radius 1), so parking on it is easy. */
  radius: 1.4,
  /** A fast pass opens a pad only after this long on it; stopping or slowing opens it at once. */
  dwell: 0.6,
  /** Floating icon height and width (u). */
  iconY: 2.2,
  iconSize: 1.4,
} as const;

/** What a pad opens: the floor list (elevator) or the year list (L2 teleporter, `from` is its own year). */
export type PickerRequest = { kind: "floor" } | { kind: "year"; from: number };

export const elevatorPadId = (floor: FloorId) => `elevator:${floor}`;
export const teleportPadId = (year: number) => `teleport:${year}`;

/** The elevator call pad: on the approach spot in front of the shaft door, where the rover waits for the car. */
export function elevatorPad(layout: Pick<FloorLayout, "id" | "approach">, face: number): PadTrigger {
  return { id: elevatorPadId(layout.id), kind: "elevator", at: { x: layout.approach.x, z: layout.approach.z }, face };
}

export function padRadius(pad: PadTrigger): number {
  return pad.radius ?? PAD.radius;
}

/** The pad whose circle contains `p`, if any. */
export function padAt(pads: readonly PadTrigger[] | undefined, p: Vec2): PadTrigger | null {
  if (!pads) return null;
  for (const pad of pads) if (Math.hypot(p.x - pad.at.x, p.z - pad.at.z) <= padRadius(pad)) return pad;
  return null;
}

export function pickerFor(pad: PadTrigger): PickerRequest {
  return pad.kind === "teleport" && pad.year !== undefined ? { kind: "year", from: pad.year } : { kind: "floor" };
}

export interface PadStep {
  /** A ride runs: the rover is in the shaft, so no pad counts. */
  riding: boolean;
  /** A pad may open its picker now (phase explore, no beam, no picker open). */
  explore: boolean;
  /** The rover follows a path (click-to-move, autopilot) or a mission runs. */
  following: boolean;
  now: number;
  speed: number;
}

/** The door latch over pads: the pad whose picker should open this frame, if any. */
export function stepPadLatch(latch: DoorLatch<string>, pads: readonly PadTrigger[] | undefined, pose: Vec2, step: PadStep): PadTrigger | null {
  const pad = step.riding ? null : padAt(pads, pose);
  const fired = stepDoorLatch(latch, pad?.id ?? null, {
    explore: step.explore,
    following: step.following,
    now: step.now,
    speed: step.speed,
    dwell: PAD.dwell,
  });
  return fired && pad ? pad : null;
}

/** A latch for a rover standing at `p` (deep link, resume, elevator arrival): the pad under it stays quiet until it leaves. */
export function primedPadLatch(pads: readonly PadTrigger[] | undefined, p: Vec2): DoorLatch<string> {
  return { room: padAt(pads, p)?.id ?? null };
}
```

- [ ] **Step 7: Run the new and the existing door tests**

Run: `bunx vitest run tests/unit/pads.test.ts tests/unit/doors.test.ts`
Expected: PASS, `Test Files  2 passed (2)`, 7 pads tests plus every existing doors test green.

- [ ] **Step 8: Typecheck**

Run: `bun run typecheck`
Expected: exits 0, no TypeScript errors (the Director keeps `DoorLatch` with its `RoomId` default).

- [ ] **Step 9: Commit**

```bash
rtk git add src/experience/types.ts src/experience/nav/doors.ts src/experience/nav/pads.ts tests/unit/pads.test.ts
rtk git commit -m "feat(3d): floor pad model on the shared door latch"
```

---

### Task 2: Pad space rules

**Files:**
- Modify: `src/experience/nav/space.ts` (imports, header comment, `SpaceInput`, `SpaceRule`, end of `spaceViolations`, new functions)
- Modify: `tests/helpers/space.ts`
- Test: `tests/unit/pad-space.test.ts`

**Interfaces:**
- Consumes: `PAD` (Task 1), `PadTrigger` (Task 1), `padHalf` from `nav/doors.ts`, `ROAD`, `roadSegments`, `projectOnSegment` from `nav/road.ts`.
- Produces:
  - `SpaceInput.pads?: readonly PadTrigger[]` (when present, `spaceViolations` also runs the pad rules).
  - `interface PadSpaceInput { bounds: Rect; obstacles: readonly Rect[]; doors: readonly DoorTrigger[]; network?: RoadNetwork; start: Vec2; pads: readonly PadTrigger[] }`.
  - `padViolations(input: PadSpaceInput, rules?: SpaceRules): SpaceViolation[]` with rules `"pad-bounds" | "pad-blocked" | "pad-door" | "pad-spur" | "pad-road" | "pad-gap"`.
  - `expectPadRules(input: PadSpaceInput, rules?: Partial<SpaceRules>)` in `tests/helpers/space.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/pad-space.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { RoadNetwork } from "@/experience/nav/road";
import { padViolations, spaceViolations } from "@/experience/nav/space";
import type { DoorTrigger, PadTrigger, Rect } from "@/experience/types";
import { expectPadRules } from "../helpers/space";

const v = (x: number, z: number) => ({ x, z });
const network: RoadNetwork = {
  roads: [{ id: "main", points: [v(0, 0), v(60, 0)], width: 8 }],
  plazas: [{ id: "p", center: v(30, 0), w: 20, d: 18 }],
  spurs: [{ room: "L2:a", from: v(30, 0), to: v(30, -10.2) }],
};
const base = {
  bounds: { minX: -4, maxX: 64, minZ: -20, maxZ: 20 } as Rect,
  obstacles: [{ minX: 29, maxX: 31, minZ: -16, maxZ: -14 }] as Rect[],
  doors: [{ room: "L2:a", at: v(30, -10.2), facing: v(0, -1) }] as DoorTrigger[],
  network,
  start: v(0, 0),
};
const pad = (id: string, x: number, z: number, kind: PadTrigger["kind"] = "teleport"): PadTrigger => ({ id, kind, at: v(x, z), face: 0 });
const rules = (pads: PadTrigger[]) => padViolations({ ...base, pads }).map((x) => x.rule);

describe("pad space rules", () => {
  it("passes a pad beside the road and one on the road's dead end (the elevator approach)", () => {
    expectPadRules({ ...base, pads: [pad("elevator:L2", 0, 0, "elevator"), pad("teleport:2021", 23.5, 6.5)] });
  });

  it("flags a pad on the driving width of a road", () => {
    expect(rules([pad("t", 20, 3)])).toEqual(["pad-road"]);
  });

  it("flags a pad on a door pad or a spur", () => {
    expect(rules([pad("t", 30, -10.2)])).toEqual(expect.arrayContaining(["pad-door", "pad-spur"]));
    expect(rules([pad("t", 31.5, -7)])).toContain("pad-spur");
  });

  it("flags a pad the rover cannot park on (next to an obstacle) or one off the slab", () => {
    expect(rules([pad("t", 33, -15)])).toContain("pad-blocked");
    expect(rules([pad("t", 63, 10)])).toContain("pad-bounds");
  });

  it("flags a pad behind a gap narrower than 6 u", () => {
    const wall: Rect[] = [
      { minX: 40, maxX: 64, minZ: 10, maxZ: 10.5 },
      { minX: 36, maxX: 40, minZ: 10, maxZ: 20 },
    ];
    const found = padViolations({ ...base, obstacles: [...base.obstacles, ...wall], pads: [pad("t", 50, 16)] }).map((x) => x.rule);
    expect(found).toContain("pad-gap");
  });

  it("runs inside spaceViolations when a layout lists its pads", () => {
    expect(spaceViolations({ ...base, pads: [pad("t", 20, 3)] }).map((x) => x.rule)).toContain("pad-road");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/unit/pad-space.test.ts`
Expected: FAIL with `SyntaxError: The requested module '@/experience/nav/space' does not provide an export named 'padViolations'` (or `expectPadRules` is not exported).

- [ ] **Step 3: Implement the pad rules**

In `src/experience/nav/space.ts`:

Replace the import block at the top:

```ts
import type { DoorTrigger, Rect, Vec2 } from "../types";
import { distanceToRect } from "./collision";
import { buildNavGrid, isWalkable, type NavGrid } from "./navgrid";
import { inPlaza, projectOnSegment, ROAD, roadSegments, type RoadNetwork } from "./road";
```

with:

```ts
import type { DoorTrigger, PadTrigger, Rect, Vec2 } from "../types";
import { distanceToRect } from "./collision";
import { padHalf } from "./doors";
import { buildNavGrid, isWalkable, type NavGrid } from "./navgrid";
import { PAD } from "./pads";
import { inPlaza, projectOnSegment, ROAD, roadSegments, type RoadNetwork } from "./road";
```

In the header comment, after the line ` *   circle of 3 u) connects the start to within 4 u of every pad.` add:

```ts
 * - floor pads (elevator call pads, L2 teleporters, `padViolations`) sit inside the slab, keep the
 *   rover radius clear of obstacles, never overlap a door pad or a spur, stay off a road's driving
 *   width except at a dead end (the elevator approach) and are reachable through 6 u wide floor.
```

Replace `interface SpaceInput` with:

```ts
export interface SpaceInput {
  bounds: Rect;
  obstacles: readonly Rect[];
  doors: readonly DoorTrigger[];
  network: RoadNetwork;
  /** Where visitors arrive (the elevator approach). */
  start: Vec2;
  /** Floor pads; when present the pad rules run too. */
  pads?: readonly PadTrigger[];
}
```

Replace the `SpaceRule` type with:

```ts
export type SpaceRule =
  | "road-width"
  | "plaza-size"
  | "road-blocked"
  | "spur-blocked"
  | "obstacle-gap"
  | "bounds-gap"
  | "door-spur"
  | "spur-detached"
  | "door-gap"
  | "pad-bounds"
  | "pad-blocked"
  | "pad-door"
  | "pad-spur"
  | "pad-road"
  | "pad-gap";
```

At the end of `spaceViolations`, replace everything from `  const grid = wideGrid(input, rules.clear);` to the function's closing `}` with:

```ts
  const { startOk, reachable } = reachFrom(input, rules);
  if (!startOk) out.push({ rule: "door-gap", detail: `start (${fmt(input.start.x)}, ${fmt(input.start.z)}) has no 6 u wide floor around it` });
  else
    for (const door of doors) {
      if (!reachable(door.at)) out.push({ rule: "door-gap", detail: `door ${door.room} is only reachable through a gap narrower than ${rules.clear} u` });
    }

  if (input.pads) out.push(...padViolations({ ...input, pads: input.pads }, rules));
  return out;
}

/** Wide floor (rules.clear) flooded from the start, and whether it comes within `rules.doorReach` of a point. */
function reachFrom(input: Pick<SpaceInput, "bounds" | "obstacles" | "start">, rules: SpaceRules): { startOk: boolean; reachable: (p: Vec2) => boolean } {
  const grid = wideGrid(input, rules.clear);
  const reach = flood(grid, input.start);
  const reachable = (p: Vec2) => {
    const r = rules.doorReach;
    for (let x = p.x - r; x <= p.x + r + EPS; x += grid.cell) {
      for (let z = p.z - r; z <= p.z + r + EPS; z += grid.cell) {
        if (Math.hypot(x - p.x, z - p.z) > r) continue;
        const i = Math.floor((x - grid.minX) / grid.cell);
        const j = Math.floor((z - grid.minZ) / grid.cell);
        if (i < 0 || j < 0 || i >= grid.cols || j >= grid.rows) continue;
        if (reach[j * grid.cols + i]) return true;
      }
    }
    return false;
  };
  return { startOk: isWalkable(grid, input.start) || reach.some(Boolean), reachable };
}

/** What the pad rules need: floors without a road kit (L1, L4, RF) pass no network. */
export interface PadSpaceInput {
  bounds: Rect;
  obstacles: readonly Rect[];
  doors: readonly DoorTrigger[];
  network?: RoadNetwork;
  start: Vec2;
  pads: readonly PadTrigger[];
}

/** Distance from `p` to a door's trigger pad (0 inside it). */
function distanceToDoorPad(door: DoorTrigger, p: Vec2): number {
  const { along, across } = padHalf(door);
  const f = door.facing ?? { x: 0, z: 1 };
  const dx = p.x - door.at.x;
  const dz = p.z - door.at.z;
  const a = Math.abs(dx * f.x + dz * f.z) - along;
  const c = Math.abs(dx * f.z - dz * f.x) - across;
  return Math.hypot(Math.max(0, a), Math.max(0, c));
}

/** Every violated pad rule (empty when every pad sits on open, reachable floor away from roads, doors and spurs). */
export function padViolations(input: PadSpaceInput, rules: SpaceRules = SPACE_RULES): SpaceViolation[] {
  const out: SpaceViolation[] = [];
  const { bounds, obstacles, doors, network, pads } = input;
  const { startOk, reachable } = reachFrom(input, rules);
  for (const pad of pads) {
    const r = pad.radius ?? PAD.radius;
    const p = pad.at;
    if (p.x - r < bounds.minX - EPS || p.x + r > bounds.maxX + EPS || p.z - r < bounds.minZ - EPS || p.z + r > bounds.maxZ + EPS)
      out.push({ rule: "pad-bounds", detail: `pad ${pad.id} at (${fmt(p.x)}, ${fmt(p.z)}) leaves the slab` });
    const hit = obstacles.find((o) => distanceToRect(p, o) < r + rules.spurClear - EPS);
    if (hit) out.push({ rule: "pad-blocked", detail: `pad ${pad.id} is closer than ${fmt(r + rules.spurClear)} u to obstacle ${rectLabel(hit)}` });
    const door = doors.find((d) => distanceToDoorPad(d, p) < r - EPS);
    if (door) out.push({ rule: "pad-door", detail: `pad ${pad.id} overlaps the door pad of ${door.room}` });
    const spur = network?.spurs.find((s) => projectOnSegment(p, s.from, s.to).distance < r + (s.width ?? ROAD.spurWidth) / 2 - EPS);
    if (spur) out.push({ rule: "pad-spur", detail: `pad ${pad.id} overlaps the spur to ${spur.room}` });
    for (const road of network?.roads ?? []) {
      const near = roadSegments(road).some(([a, b]) => projectOnSegment(p, a, b).distance < road.width / 2 + r - EPS);
      const ends = road.closed ? [] : [road.points[0], road.points[road.points.length - 1]];
      const deadEnd = ends.some((e) => Math.hypot(e.x - p.x, e.z - p.z) <= r + EPS);
      if (near && !deadEnd) out.push({ rule: "pad-road", detail: `pad ${pad.id} at (${fmt(p.x)}, ${fmt(p.z)}) sits on the driving width of road ${road.id}` });
    }
    if (!startOk || !reachable(p)) out.push({ rule: "pad-gap", detail: `pad ${pad.id} is only reachable through a gap narrower than ${rules.clear} u` });
  }
  return out;
}
```

- [ ] **Step 4: Add the test helper**

Replace `tests/helpers/space.ts` with:

```ts
import { expect } from "vitest";
import { padViolations, spaceViolations, SPACE_RULES, type PadSpaceInput, type SpaceInput, type SpaceRules } from "@/experience/nav/space";

/**
 * Asserts the walkable-floor space rules (src/experience/nav/space.ts) on a floor layout. Use it in
 * every layout test of a floor with a road network (pass `pads` to check the floor pads too):
 *
 *   expectSpaceRules({ bounds, obstacles, doors, network, start: approach, pads });
 *
 * Fails with one line per violated rule, so a layout change shows exactly what got too tight.
 */
export function expectSpaceRules(input: SpaceInput, rules: Partial<SpaceRules> = {}) {
  const violations = spaceViolations(input, { ...SPACE_RULES, ...rules });
  expect(violations.map((v) => `${v.rule}: ${v.detail}`)).toEqual([]);
}

/** Asserts only the pad rules, for floors with or without a road kit (L1, L4 and RF have none). */
export function expectPadRules(input: PadSpaceInput, rules: Partial<SpaceRules> = {}) {
  const violations = padViolations(input, { ...SPACE_RULES, ...rules });
  expect(violations.map((v) => `${v.rule}: ${v.detail}`)).toEqual([]);
}
```

- [ ] **Step 5: Run the pad and the existing space tests**

Run: `bunx vitest run tests/unit/pad-space.test.ts tests/unit/road.test.ts tests/unit/career-layout.test.ts tests/unit/labs-layout.test.ts`
Expected: PASS, `Test Files  4 passed (4)` (the `reachFrom` refactor keeps every existing door-gap result).

- [ ] **Step 6: Commit**

```bash
rtk git add src/experience/nav/space.ts tests/helpers/space.ts tests/unit/pad-space.test.ts
rtk git commit -m "feat(3d): space rules for floor pads"
```

---
### Task 3: Pads in the floor layouts (elevator pads everywhere, L2 teleporters)

**Files:**
- Modify: `src/experience/floors/career/layout.ts` (imports, `CAREER_ROAD`, `CareerYear`, `CareerRoadLayout`, `buildCareerRoad`)
- Modify: `src/experience/config.ts` (imports, `careerLayout`, `buildFloorLayouts`)
- Modify: `tests/unit/career-layout.test.ts`
- Test: `tests/unit/floor-pads.test.ts`

**Interfaces:**
- Consumes: `elevatorPad`, `teleportPadId`, `PAD` (Task 1); `expectPadRules`, `SpaceInput.pads` (Task 2).
- Produces:
  - `CAREER_ROAD.teleport = { inset: 3.5, offset: 6.5 }`.
  - `CareerYear.teleport: Vec2` (pad center on that year's plaza).
  - `CareerRoadLayout.pads: PadTrigger[]` (one `teleport:<year>` pad per year, `face: 0`).
  - `buildFloorLayouts(...)[id].pads`: `[elevator:<id> at approach, ...L2 teleporters]` on every floor.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/career-layout.test.ts`:

Add to the imports (after the `DOOR_SIZE` import line):

```ts
import { PAD } from "@/experience/nav/pads";
```

Replace the first space rules test in `describe("buildCareerRoad", ...)`:

```ts
  it("passes the space rules", () => {
    expectSpaceRules({ bounds: c.bounds, obstacles: c.obstacles, doors: c.doors, network: c.network, start: c.approach });
  });
```

with:

```ts
  it("passes the space rules, teleporter pads included", () => {
    expectSpaceRules({ bounds: c.bounds, obstacles: c.obstacles, doors: c.doors, network: c.network, start: c.approach, pads: c.pads });
  });

  it("puts a teleporter pad on every year plaza, beside the road near the plaza start", () => {
    expect(c.pads.map((p) => p.id)).toEqual(c.years.map((y) => `teleport:${y.year}`));
    for (const y of c.years) {
      const x0 = y.plaza.center.x - y.plaza.w / 2;
      expect(y.teleport).toEqual({ x: x0 + CAREER_ROAD.teleport.inset, z: y.plaza.center.z + CAREER_ROAD.teleport.offset });
      expect(Math.abs(y.teleport.z - y.plaza.center.z) + PAD.radius).toBeLessThanOrEqual(y.plaza.d / 2);
    }
    expect(c.pads.every((p, i) => p.kind === "teleport" && p.year === c.years[i].year && p.at === c.years[i].teleport && p.face === 0)).toBe(true);
  });
```

In `describe("the real Career Road", ...)`, replace:

```ts
  it("passes the space rules with the real content", () => {
    expectSpaceRules({ bounds: c.bounds, obstacles: c.obstacles, doors: c.doors, network: c.network, start: c.approach });
  });
```

with:

```ts
  it("passes the space rules with the real content, teleporter pads included", () => {
    expectSpaceRules({ bounds: c.bounds, obstacles: c.obstacles, doors: c.doors, network: c.network, start: c.approach, pads: c.pads });
  });
```

Create `tests/unit/floor-pads.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { buildFloorLayouts, FLOOR_IDS, ROVER } from "@/experience/config";
import { careerLayoutInput } from "@/experience/floors/career/layout";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { expectPadRules, expectSpaceRules } from "../helpers/space";

const data = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });
const layouts = buildFloorLayouts(data.years.length, { labs: data.labs.pods, career: careerLayoutInput(data.career) });

describe("floor pads in the real layouts", () => {
  it("gives every floor one elevator call pad on its approach, 3 u in front of the shaft door", () => {
    for (const id of FLOOR_IDS) {
      const l = layouts[id];
      const lifts = (l.pads ?? []).filter((p) => p.kind === "elevator");
      expect(lifts.map((p) => p.id), id).toEqual([`elevator:${id}`]);
      expect(lifts[0].at, id).toEqual(l.approach);
      expect(lifts[0].at.z, id).toBe(l.door.z);
      expect(lifts[0].at.x - l.door.x, id).toBe(3);
    }
  });

  it("adds one teleporter per year on L2 only", () => {
    expect(layouts.L2.pads?.filter((p) => p.kind === "teleport").map((p) => p.year)).toEqual(data.years);
    for (const id of ["L1", "L3", "L4", "RF"] as const) expect(layouts[id].pads?.some((p) => p.kind === "teleport"), id).toBe(false);
  });

  it("keeps every pad on walkable floor and inside the pad rules", () => {
    for (const id of FLOOR_IDS) {
      const l = layouts[id];
      const grid = buildNavGrid(l, ROVER.radius);
      for (const pad of l.pads ?? []) expect(isWalkable(grid, pad.at), pad.id).toBe(true);
      expectPadRules({ bounds: l.bounds, obstacles: l.obstacles, doors: l.doors ?? [], network: l.road, start: l.approach, pads: l.pads ?? [] });
    }
  });

  it("keeps the road floors inside the full space rules with their pads", () => {
    for (const id of ["L2", "L3"] as const) {
      const l = layouts[id];
      expectSpaceRules({ bounds: l.bounds, obstacles: l.obstacles, doors: l.doors ?? [], network: l.road!, start: l.approach, pads: l.pads });
    }
  });

  it("keeps the placeholder corridor (no career data) with its elevator pad", () => {
    expect(buildFloorLayouts(8).L2.pads?.map((p) => p.id)).toEqual(["elevator:L2"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run tests/unit/career-layout.test.ts tests/unit/floor-pads.test.ts`
Expected: FAIL: `c.pads` is undefined (`TypeError: Cannot read properties of undefined (reading 'map')`) and the floor pad tests find no pads.

- [ ] **Step 3: Add teleporters to the Career Road**

In `src/experience/floors/career/layout.ts`:

Replace the import lines:

```ts
import { DOOR_SIZE } from "../../nav/doors";
import { ROAD, type Plaza, type Road, type RoadNetwork, type Spur } from "../../nav/road";
import type { CareerData, CareerLayoutInput, CareerType, DoorTrigger, Rect, Vec2 } from "../../types";
```

with:

```ts
import { DOOR_SIZE } from "../../nav/doors";
import { teleportPadId } from "../../nav/pads";
import { ROAD, type Plaza, type Road, type RoadNetwork, type Spur } from "../../nav/road";
import type { CareerData, CareerLayoutInput, CareerType, DoorTrigger, PadTrigger, Rect, Vec2 } from "../../types";
```

In `CAREER_ROAD`, after the `margin: 3,` line (before `} as const;`), add:

```ts
  /**
   * Year teleporter pad on every plaza: this far past the plaza start and this far south of the road
   * center (toward the rail camera), off the driving width, clear of the spurs and the floor digits.
   */
  teleport: { inset: 3.5, offset: 6.5 },
```

In `interface CareerYear`, after `rooms: CareerRoom[];` add:

```ts
  /** Center of the year's teleporter pad (`teleport:<year>`). */
  teleport: Vec2;
```

In `interface CareerRoadLayout`, after `doors: DoorTrigger[];` add:

```ts
  /** One teleporter pad per year plaza (FloorLayout.pads; the elevator pad is added by buildFloorLayouts). */
  pads: PadTrigger[];
```

In `buildCareerRoad`, replace:

```ts
    rooms.push(...list);
    years.push({ year, plaza, arch, rooms: list });
```

with:

```ts
    rooms.push(...list);
    const teleport: Vec2 = { x: x + C.teleport.inset, z: zc + C.teleport.offset };
    years.push({ year, plaza, arch, rooms: list, teleport });
```

Replace:

```ts
  const doors: DoorTrigger[] = [
    ...rooms.map((r) => ({ room: r.id, at: r.at, facing: { x: 0, z: r.side } })),
    { room: WORKSHOP_ROOM, at: workshopAt, facing: { x: 0, z: -1 } },
  ];
```

with:

```ts
  const doors: DoorTrigger[] = [
    ...rooms.map((r) => ({ room: r.id, at: r.at, facing: { x: 0, z: r.side } })),
    { room: WORKSHOP_ROOM, at: workshopAt, facing: { x: 0, z: -1 } },
  ];
  // Icons face the rail camera (+z), like the room icons.
  const pads: PadTrigger[] = years.map((y) => ({ id: teleportPadId(y.year), kind: "teleport", at: y.teleport, year: y.year, face: 0 }));
```

In the returned object, after `doors,` add `pads,`.

- [ ] **Step 4: Put the elevator pad on every floor**

In `src/experience/config.ts`:

Replace:

```ts
import type { FloorLayout, LayoutExtras, Rect, Vec2 } from "./types";
```

with:

```ts
import { elevatorPad } from "./nav/pads";
import type { FloorLayout, LayoutExtras, Rect, Vec2 } from "./types";
```

Replace the `careerLayout` return line:

```ts
  return { ...standard("L2", road.bounds, road.obstacles), doors: road.doors, scrubStops: road.stops, road: road.network };
```

with:

```ts
  return { ...standard("L2", road.bounds, road.obstacles), doors: road.doors, scrubStops: road.stops, road: road.network, pads: road.pads };
```

Replace the whole `buildFloorLayouts` function with:

```ts
/**
 * Elevator pad icon yaw per floor: toward the L2 rail camera (+z), elsewhere east, where the follow
 * camera sits when the rover drives up to the shaft.
 */
const ELEVATOR_PAD_FACE: Record<FloorId, number> = { L1: Math.PI / 2, L2: 0, L3: Math.PI / 2, L4: Math.PI / 2, RF: Math.PI / 2 };

/**
 * Every floor gets the elevator call pad on its approach (3 u in front of the shaft door, so it follows
 * the door constants), ahead of the floor's own pads (the L2 year teleporters).
 */
function withElevatorPad(layout: FloorLayout): FloorLayout {
  return { ...layout, pads: [elevatorPad(layout, ELEVATOR_PAD_FACE[layout.id]), ...(layout.pads ?? [])] };
}

/** Floor-local layouts. Floors without content yet are placeholder slabs. `extras` carries per-floor inputs. */
export function buildFloorLayouts(yearCount: number, extras: LayoutExtras = {}): Record<FloorId, FloorLayout> {
  const { hologram, skillsWall, certWall, kiosk } = LOBBY;
  const layouts: Record<FloorId, FloorLayout> = {
    L1: standard(
      "L1",
      LOBBY.bounds,
      [
        rect(hologram.x, hologram.z, hologram.radius * 2, hologram.radius * 2),
        rect(skillsWall.x, skillsWall.z, skillsWall.w, skillsWall.d),
        rect(certWall.x, certWall.z, certWall.w, certWall.d),
        rect(kiosk.x, kiosk.z, kiosk.w, kiosk.d),
      ],
      LOBBY.spawn,
    ),
    L2: careerLayout(yearCount, extras),
    // Project Roads: hub plaza in front of the shaft door, wing roads looping east (walkable floors plan).
    L3: buildLabsLayout(extras.labs ?? []).floor,
    // Deep links spawn L4 and RF in front of their content (the follow camera looks toward -x, -z).
    L4: { ...standard("L4", { minX: -24, maxX: 24, minZ: -16, maxZ: 16 }, libraryObstacles(), { x: 4, z: 3.5 }), doors: LIBRARY_DOORS },
    RF: { ...standard("RF", { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, roofObstacles(), { x: 4, z: 12 }), doors: ROOF_DOORS },
  };
  return Object.fromEntries(FLOOR_IDS.map((id) => [id, withElevatorPad(layouts[id])])) as Record<FloorId, FloorLayout>;
}
```

- [ ] **Step 5: Run the layout tests**

Run: `bunx vitest run tests/unit/career-layout.test.ts tests/unit/floor-pads.test.ts tests/unit/lobby-layout.test.ts tests/unit/labs-layout.test.ts tests/unit/library-roof-layout.test.ts tests/unit/doors.test.ts`
Expected: PASS, `Test Files  6 passed (6)`.

- [ ] **Step 6: Commit**

```bash
rtk git add src/experience/floors/career/layout.ts src/experience/config.ts tests/unit/career-layout.test.ts tests/unit/floor-pads.test.ts
rtk git commit -m "feat(3d): elevator call pad on every floor and a teleporter per L2 year plaza"
```

---

### Task 4: Teleport beam timeline, store state and the teleport intent

**Files:**
- Create: `src/experience/nav/teleport.ts`
- Modify: `src/experience/input/intents.ts:8-20` (`Intent` union)
- Modify: `src/store/useHQStore.ts` (imports, `HQState`, initial state, actions, `requestElevator`)
- Modify: `tests/unit/store.test.ts`
- Test: `tests/unit/teleport.test.ts`

**Interfaces:**
- Consumes: `PadTrigger` (Task 1), `PickerRequest` (Task 1), `REDUCED_CUT` (0.15) from `src/experience/tower/elevator.ts`.
- Produces:
  - `BEAM = { out: 0.3, in: 0.3 }`.
  - `interface Beam { pad: string; from: Vec2; to: Vec2; heading: number; t: number; jumped: boolean }`.
  - `startBeam(from: Vec2, pad: PadTrigger): Beam` (heading `Math.PI / 2`, east, forward in time).
  - `beamDuration(reduced: boolean): number`, `beamJumpAt(reduced: boolean): number`.
  - `advanceBeam(beam: Beam, dt: number, reduced: boolean): { beam: Beam | null; jump: boolean }`.
  - `beamGlow(beam: Beam | null, reduced: boolean): { at: Vec2; level: number } | null`.
  - Intent `{ type: "teleport"; pad: string }`.
  - Store: `picker: PickerRequest | null`, `beam: Beam | null`, `openPicker(picker)` (explore only, no ride, no beam), `closePicker()`, `setBeam(beam)`; `requestElevator` clears `picker` when it starts a ride.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/teleport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { advanceBeam, BEAM, beamDuration, beamGlow, beamJumpAt, startBeam } from "@/experience/nav/teleport";
import { REDUCED_CUT } from "@/experience/tower/elevator";
import type { PadTrigger } from "@/experience/types";

const target: PadTrigger = { id: "teleport:2023", kind: "teleport", at: { x: 140, z: -0.5 }, year: 2023, face: 0 };

describe("teleport beam", () => {
  it("starts at the rover and targets the pad, facing forward in time", () => {
    expect(startBeam({ x: -7.5, z: 6.5 }, target)).toEqual({
      pad: "teleport:2023",
      from: { x: -7.5, z: 6.5 },
      to: { x: 140, z: -0.5 },
      heading: Math.PI / 2,
      t: 0,
      jumped: false,
    });
  });

  it("rises, jumps once, then fades and ends", () => {
    let step = advanceBeam(startBeam({ x: 0, z: 0 }, target), BEAM.out - 0.05, false);
    expect(step.jump).toBe(false);
    step = advanceBeam(step.beam!, 0.1, false);
    expect(step.jump).toBe(true);
    expect(step.beam?.jumped).toBe(true);
    step = advanceBeam(step.beam!, 0.1, false);
    expect(step.jump).toBe(false);
    step = advanceBeam(step.beam!, BEAM.in, false);
    expect(step.beam).toBeNull();
    expect(beamDuration(false)).toBeCloseTo(BEAM.out + BEAM.in);
  });

  it("cuts in 150 ms under reduced motion, jumping halfway, even within one long frame", () => {
    expect(beamDuration(true)).toBe(REDUCED_CUT);
    expect(beamJumpAt(true)).toBe(REDUCED_CUT / 2);
    expect(advanceBeam(startBeam({ x: 0, z: 0 }, target), 0.25, true)).toEqual({ beam: null, jump: true });
  });

  it("draws a column at the origin while rising and at the target while fading, none under reduced motion", () => {
    const beam = startBeam({ x: 1, z: 2 }, target);
    const early = beamGlow({ ...beam, t: BEAM.out / 2 }, false)!;
    expect(early.at).toEqual({ x: 1, z: 2 });
    expect(early.level).toBeCloseTo(0.5);
    const late = beamGlow({ ...beam, t: BEAM.out + BEAM.in / 2, jumped: true }, false)!;
    expect(late.at).toEqual(target.at);
    expect(late.level).toBeCloseTo(0.5);
    expect(beamGlow(beam, true)).toBeNull();
    expect(beamGlow(null, false)).toBeNull();
  });
});
```

In `tests/unit/store.test.ts`, add these cases at the end of `describe("HQ store", ...)` (before its closing `});`):

```ts
  it("opens a pad picker only while exploring, and a new ride closes it", () => {
    store.getState().openPicker({ kind: "floor" });
    expect(store.getState().picker).toEqual({ kind: "floor" });
    store.getState().closePicker();
    expect(store.getState().picker).toBeNull();
    store.getState().openRoom("L3:voice-ai-contact-center");
    store.getState().openPicker({ kind: "year", from: 2021 });
    expect(store.getState().picker).toBeNull();
    store.getState().closeRoom();
    store.getState().openPicker({ kind: "year", from: 2021 });
    expect(store.getState().picker).toEqual({ kind: "year", from: 2021 });
    store.getState().requestElevator("L3");
    expect(store.getState().ride?.to).toBe("L3");
    expect(store.getState().picker).toBeNull();
  });

  it("holds the teleport beam and refuses a picker while it runs", () => {
    const beam = { pad: "teleport:2023", from: { x: 0, z: 0 }, to: { x: 140, z: -0.5 }, heading: Math.PI / 2, t: 0, jumped: false };
    store.getState().setBeam(beam);
    expect(store.getState().beam).toEqual(beam);
    store.getState().openPicker({ kind: "floor" });
    expect(store.getState().picker).toBeNull();
    store.getState().setBeam(null);
    expect(store.getState().beam).toBeNull();
    expect(storage.data.get(STORE_KEY) ?? "").not.toContain("picker");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run tests/unit/teleport.test.ts tests/unit/store.test.ts`
Expected: FAIL: `Failed to resolve import "@/experience/nav/teleport"` and `TypeError: store.getState(...).openPicker is not a function`.

- [ ] **Step 3: Write the beam module**

Create `src/experience/nav/teleport.ts`:

```ts
import { REDUCED_CUT } from "../tower/elevator";
import type { PadTrigger, Vec2 } from "../types";

/**
 * L2 year teleporters: a short beam. Pure. The beam rises over the origin pad, the rover jumps to the
 * target pad (the camera cuts with it), then the beam fades over the target. Reduced motion swaps it
 * for the elevator's 150 ms fade cut, jumping halfway under the fade.
 */
export const BEAM = { out: 0.3, in: 0.3 } as const;

export interface Beam {
  /** Target pad id (`teleport:<year>`). */
  pad: string;
  from: Vec2;
  to: Vec2;
  /** Heading after the jump: east, forward in time along the Career Road. */
  heading: number;
  /** Seconds since the beam started. */
  t: number;
  jumped: boolean;
}

export function startBeam(from: Vec2, pad: PadTrigger): Beam {
  return { pad: pad.id, from: { x: from.x, z: from.z }, to: { x: pad.at.x, z: pad.at.z }, heading: Math.PI / 2, t: 0, jumped: false };
}

export function beamDuration(reduced: boolean): number {
  return reduced ? REDUCED_CUT : BEAM.out + BEAM.in;
}

export function beamJumpAt(reduced: boolean): number {
  return reduced ? REDUCED_CUT / 2 : BEAM.out;
}

/** Advances the beam: `jump` is true on the one step that crosses the jump time, `beam` is null once it is over. */
export function advanceBeam(beam: Beam, dt: number, reduced: boolean): { beam: Beam | null; jump: boolean } {
  const t = beam.t + dt;
  const jump = !beam.jumped && t >= beamJumpAt(reduced);
  if (t >= beamDuration(reduced)) return { beam: null, jump };
  return { beam: { ...beam, t, jumped: beam.jumped || jump }, jump };
}

/** The beam column to draw: over the origin while it rises (0 to 1), over the target while it fades (1 to 0); none under reduced motion. */
export function beamGlow(beam: Beam | null, reduced: boolean): { at: Vec2; level: number } | null {
  if (!beam || reduced) return null;
  if (beam.t < BEAM.out) return { at: beam.from, level: beam.t / BEAM.out };
  return { at: beam.to, level: Math.max(0, 1 - (beam.t - BEAM.out) / BEAM.in) };
}
```

- [ ] **Step 4: Add the intent**

In `src/experience/input/intents.ts`, replace:

```ts
  | { type: "open"; room: RoomId }
```

with:

```ts
  | { type: "open"; room: RoomId }
  /** L2 year teleporter: beam the rover to the pad with this id (`teleport:<year>`) on the current floor. */
  | { type: "teleport"; pad: string }
```

- [ ] **Step 5: Add the store state**

In `src/store/useHQStore.ts`:

After `import type { Ride } from "@/experience/tower/elevator";` add:

```ts
import type { PickerRequest } from "@/experience/nav/pads";
import type { Beam } from "@/experience/nav/teleport";
```

In `interface HQState`, after `readme: boolean;` add:

```ts
  /** Floor pad picker over the world: floors (elevator call pad) or years (L2 teleporter). */
  picker: PickerRequest | null;
  /** L2 teleport beam in progress, advanced by the Director. */
  beam: Beam | null;
```

and after `notify: (notice: string | null) => void;` add:

```ts
  /** Opens a pad picker; only while exploring, with no ride and no beam running. */
  openPicker: (picker: PickerRequest) => void;
  closePicker: () => void;
  setBeam: (beam: Beam | null) => void;
```

In the initial state, after `readme: false,` add:

```ts
        picker: null,
        beam: null,
```

In `requestElevator`, replace:

```ts
          set({ ride: { from: floor, to, stage: "toDoor", t: 0 }, phase: "elevator", activeRoom: null });
```

with:

```ts
          set({ ride: { from: floor, to, stage: "toDoor", t: 0 }, phase: "elevator", activeRoom: null, picker: null });
```

After the `notify: (notice) => set({ notice }),` line add:

```ts
        openPicker: (picker) => {
          const { phase, ride, beam } = get();
          if (phase !== "explore" || ride || beam) return;
          set({ picker });
        },
        closePicker: () => set({ picker: null }),
        setBeam: (beam) => set({ beam }),
```

`partialize` stays unchanged (neither field persists).

- [ ] **Step 6: Run the tests**

Run: `bunx vitest run tests/unit/teleport.test.ts tests/unit/store.test.ts tests/unit/intents.test.ts tests/unit/elevator.test.ts`
Expected: PASS, `Test Files  4 passed (4)`.

- [ ] **Step 7: Commit**

```bash
rtk git add src/experience/nav/teleport.ts src/experience/input/intents.ts src/store/useHQStore.ts tests/unit/teleport.test.ts tests/unit/store.test.ts
rtk git commit -m "feat(3d): teleport beam timeline, pad picker and beam state, teleport intent"
```

---
### Task 5: Pad visuals (icons, PadGlow, TeleportBeam)

**Files:**
- Modify: `src/experience/fx/holoIcons.ts` (imports, new `PAD_ICONS`, `PAD_TONE`)
- Create: `src/experience/fx/PadGlow.tsx`
- Create: `src/experience/fx/TeleportBeam.tsx`
- Modify: `src/experience/tower/FloorLevel.tsx` (import, mount)
- Modify: `src/experience/scene/Scene.tsx` (import, mount)
- Test: `tests/unit/holo-icons.test.ts`

**Interfaces:**
- Consumes: `PAD`, `padRadius`, `pickerFor` (Task 1); `beamGlow` (Task 4); store `openPicker`, `beam` (Task 4); `HoloIcon` (`src/experience/fx/HoloIcon.tsx`, props `strokes, instances, color, size, tier, reducedMotion`); `proximityLevel`; `DRAG_THRESHOLD`, `intents`.
- Produces:
  - `PAD_ICONS: Record<PadKind, Stroke[]>` and `PAD_TONE: Record<PadKind, string>` (`elevator` cyan `#22d3ee`, `teleport` pink `#f472b6`, same values as `COLORS.cyan` and `COLORS.pink`).
  - `<PadGlow pads floorY interactive />`: 1 draw call for all pads of a floor, plus 1 icon draw call per kind present (2 on the full tier).
  - `<TeleportBeam />`: invisible unless a beam runs (1 draw call while visible).

- [ ] **Step 1: Write the failing test**

In `tests/unit/holo-icons.test.ts`, replace the import line with:

```ts
import { arc, CAREER_ICONS, CAREER_TONE, iconMesh, iconPath, PAD_ICONS, PAD_TONE } from "@/experience/fx/holoIcons";
```

and add inside `describe("career type icons", ...)`:

```ts
  it("has pad icons (elevator, teleporter) inside the 24 x 24 grid, each with its own tone", () => {
    expect(Object.keys(PAD_ICONS).sort()).toEqual(["elevator", "teleport"]);
    for (const strokes of Object.values(PAD_ICONS)) {
      expect(strokes.length).toBeGreaterThan(1);
      for (const s of strokes)
        for (const [x, y] of s.points) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(24);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(24);
        }
    }
    expect(PAD_TONE).toEqual({ elevator: "#22d3ee", teleport: "#f472b6" });
    expect(iconMesh(PAD_ICONS.teleport, { size: 1.4 }).positions.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/unit/holo-icons.test.ts`
Expected: FAIL, `PAD_ICONS` is undefined (`TypeError: Cannot convert undefined or null to object`).

- [ ] **Step 3: Add the pad icons**

In `src/experience/fx/holoIcons.ts`, replace `import type { CareerType } from "../types";` with:

```ts
import type { CareerType, PadKind } from "../types";
```

Append at the end of the file:

```ts
/** Closed ellipse around (cx, cy), `steps` points (a pad ring seen at an angle). */
function ring(cx: number, cy: number, rx: number, ry: number, steps = 16): Point[] {
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as Point;
  });
}

/** Floor pad icons on the same 24 x 24 grid: the elevator call pad and the L2 year teleporter. */
export const PAD_ICONS: Record<PadKind, Stroke[]> = {
  // Elevator: closed lift doors with an up and a down arrow.
  elevator: [shut([4, 3], [20, 3], [20, 21], [4, 21]), open([12, 3], [12, 21]), open([6, 10], [8, 7], [10, 10]), open([14, 14], [16, 17], [18, 14])],
  // Teleporter: three beams rising from a pad ring.
  teleport: [shut(...ring(12, 19, 8, 3)), open([8, 18], [8, 5]), open([12, 16], [12, 2]), open([16, 18], [16, 5])],
};

/** Pad neon tones: the values of COLORS.cyan and COLORS.pink, kept as literals because config.ts imports the career layout, which imports this module. */
export const PAD_TONE: Record<PadKind, string> = { elevator: "#22d3ee", teleport: "#f472b6" };
```

- [ ] **Step 4: Run the icon test**

Run: `bunx vitest run tests/unit/holo-icons.test.ts`
Expected: PASS.

- [ ] **Step 5: Write PadGlow**

Create `src/experience/fx/PadGlow.tsx`:

```tsx
"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, CircleGeometry, Color, Float32BufferAttribute, Object3D, RingGeometry, type InstancedMesh } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { DRAG_THRESHOLD, intents } from "../input/intents";
import { PAD, padRadius, pickerFor } from "../nav/pads";
import { roverRuntime } from "../rover/runtime";
import type { PadKind, PadTrigger } from "../types";
import { HoloIcon, type HoloIconInstance } from "./HoloIcon";
import { PAD_ICONS, PAD_TONE } from "./holoIcons";
import { neonColor } from "./materials";
import { proximityLevel } from "./proximity";

const KINDS: readonly PadKind[] = ["elevator", "teleport"];
const IDLE = 0.25;

/** Unit pad (radius 1, scaled per instance): a dim fill disc, a bright rim and an inner ring, with per-vertex brightness. */
function padGeometry() {
  const parts = [
    { g: new CircleGeometry(0.82, 48), k: 0.28 },
    { g: new RingGeometry(0.82, 1, 48), k: 1 },
    { g: new RingGeometry(0.42, 0.5, 48), k: 0.7 },
  ];
  for (const { g, k } of parts) g.setAttribute("color", new Float32BufferAttribute(new Array(g.getAttribute("position").count * 3).fill(k), 3));
  const merged = mergeGeometries(
    parts.map((p) => p.g),
    false,
  )!;
  for (const p of parts) p.g.dispose();
  merged.rotateX(-Math.PI / 2);
  return merged;
}

/**
 * Floor pads (elevator call pad, L2 year teleporters): one instanced additive disc for every pad on the
 * floor, brightening as the rover gets close, plus a floating neon icon per pad kind. Clicking or
 * tapping a pad on the current floor opens its picker without driving there.
 */
export function PadGlow({ pads, floorY, interactive }: { pads: PadTrigger[]; floorY: number; interactive: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const tier = useHQStore((s) => s.tier);
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  const geometry = useMemo(() => padGeometry(), []);
  const tones = useMemo(() => pads.map((p) => neonColor(PAD_TONE[p.kind], 1.6, tier)), [pads, tier]);
  const levels = useRef<number[]>([]);
  const tmp = useMemo(() => new Color(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const d = new Object3D();
    pads.forEach((pad, i) => {
      const r = padRadius(pad);
      d.position.set(pad.at.x, 0.03, pad.at.z);
      d.scale.set(r, 1, r);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, tmp.copy(tones[i]).multiplyScalar(IDLE));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    levels.current = pads.map(() => IDLE);
  }, [pads, tones, tmp]);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const here = Math.abs(roverRuntime.y - floorY) < 0.5;
    let dirty = false;
    pads.forEach((pad, i) => {
      const want = here ? Math.max(IDLE, proximityLevel(Math.hypot(roverRuntime.x - pad.at.x, roverRuntime.z - pad.at.z))) : IDLE;
      const cur = levels.current[i] ?? IDLE;
      const next = cur + (want - cur) * Math.min(1, dt * 8);
      if (Math.abs(next - cur) > 1e-3) {
        levels.current[i] = next;
        m.setColorAt(i, tmp.copy(tones[i]).multiplyScalar(next));
        dirty = true;
      }
    });
    if (dirty && m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  const icons = useMemo(() => {
    const out = {} as Record<PadKind, HoloIconInstance[]>;
    for (const kind of KINDS) out[kind] = pads.filter((p) => p.kind === kind).map((p) => ({ x: p.at.x, y: PAD.iconY, z: p.at.z, face: p.face }));
    return out;
  }, [pads]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    // A press that travelled past the drag threshold rotated the view; it is not a click or tap.
    const pointerType = "pointerType" in e.nativeEvent ? String((e.nativeEvent as PointerEvent).pointerType) : "mouse";
    if (e.delta > DRAG_THRESHOLD[pointerType as keyof typeof DRAG_THRESHOLD] || e.delta > DRAG_THRESHOLD.touch) return;
    const pad = e.instanceId === undefined ? undefined : pads[e.instanceId];
    if (!pad || getHQStore().getState().phase !== "explore") return;
    e.stopPropagation();
    // A click is manual input: it ends a mission leg or a drive first, like clicking the floor.
    intents.emit({ type: "cancel" });
    getHQStore().getState().openPicker(pickerFor(pad));
  };

  if (pads.length === 0) return null;
  return (
    <group name="floor-pads">
      <instancedMesh ref={mesh} args={[geometry, undefined, pads.length]} frustumCulled={false} {...(interactive ? { onClick } : { raycast: () => null })}>
        <meshBasicMaterial vertexColors transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      {KINDS.map((kind) =>
        icons[kind].length > 0 ? (
          <HoloIcon key={kind} strokes={PAD_ICONS[kind]} instances={icons[kind]} color={PAD_TONE[kind]} size={PAD.iconSize} tier={tier} reducedMotion={reducedMotion} />
        ) : null,
      )}
    </group>
  );
}
```

- [ ] **Step 6: Write TeleportBeam**

Create `src/experience/fx/TeleportBeam.tsx`:

```tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, CylinderGeometry, MeshBasicMaterial, type Mesh } from "three";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { floorY } from "../config";
import { PAD } from "../nav/pads";
import { beamGlow } from "../nav/teleport";
import { PAD_TONE } from "./holoIcons";
import { neonColor } from "./materials";

const HEIGHT = 6;

/**
 * The L2 teleport beam: an open neon column over the origin pad while it rises, then over the target
 * pad while it fades. One draw call, only while a beam runs; nothing under reduced motion (the HUD
 * fades instead, see BeamFade).
 */
export function TeleportBeam() {
  const ref = useRef<Mesh>(null);
  const tier = useHQStore((s) => s.tier);
  const geometry = useMemo(() => new CylinderGeometry(PAD.radius, PAD.radius, HEIGHT, 32, 1, true), []);
  const material = useMemo(
    () => new MeshBasicMaterial({ color: neonColor(PAD_TONE.teleport, 2, tier), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    [tier],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const s = getHQStore().getState();
    const glow = beamGlow(s.beam, s.reducedMotion);
    m.visible = glow !== null && glow.level > 0.01;
    if (!glow) return;
    const level = Math.max(0.01, glow.level);
    m.position.set(glow.at.x, floorY(s.floor) + (HEIGHT / 2) * level, glow.at.z);
    m.scale.set(1, level, 1);
    material.opacity = 0.65 * glow.level;
  });

  return <mesh ref={ref} geometry={geometry} material={material} visible={false} frustumCulled={false} raycast={() => null} />;
}
```

- [ ] **Step 7: Mount both**

In `src/experience/tower/FloorLevel.tsx`, after `import { ProximityGlow } from "../fx/ProximityGlow";` add:

```tsx
import { PadGlow } from "../fx/PadGlow";
```

and replace:

```tsx
        {near && layout.doors && <ProximityGlow doors={layout.doors} color={accent} floorY={y} />}
```

with:

```tsx
        {near && layout.doors && <ProximityGlow doors={layout.doors} color={accent} floorY={y} />}
        {near && layout.pads && <PadGlow pads={layout.pads} floorY={y} interactive={interactive} />}
```

In `src/experience/scene/Scene.tsx`, after `import { Motes } from "../fx/Motes";` add:

```tsx
import { TeleportBeam } from "../fx/TeleportBeam";
```

and replace `      <Rover tier={tier} />` with:

```tsx
      <Rover tier={tier} />
      <TeleportBeam />
```

- [ ] **Step 8: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: both exit 0 with no errors.

- [ ] **Step 9: Commit**

```bash
rtk git add src/experience/fx/holoIcons.ts src/experience/fx/PadGlow.tsx src/experience/fx/TeleportBeam.tsx src/experience/tower/FloorLevel.tsx src/experience/scene/Scene.tsx tests/unit/holo-icons.test.ts
rtk git commit -m "feat(3d): glowing floor pads with neon icons and the teleport beam"
```

---

### Task 6: Director wiring, camera cut and the first pads e2e spec

**Files:**
- Modify: `src/experience/scene/Director.tsx` (imports, local state, intent listener, frame loop)
- Modify: `src/experience/rover/runtime.ts` (add `cameraSnap`)
- Modify: `src/experience/camera/CameraDirector.tsx` (cut on `cameraSnap`)
- Modify: `src/experience/Experience.tsx:87` (`window.__hq.layouts`)
- Modify: `e2e/hq.ts` (add `PadSnapshot`, `padsOf`, `driveTo`)
- Modify: `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts`
- Create: `e2e/pads.spec.ts`

**Interfaces:**
- Consumes: `stepPadLatch`, `primedPadLatch`, `pickerFor` (Task 1); `startBeam`, `advanceBeam` (Task 4); store `openPicker`, `setBeam`, `beam`, `picker` (Task 4); intent `teleport` (Task 4); `FloorLayout.pads` (Task 3).
- Produces:
  - `roverRuntime.cameraSnap: boolean` (set by the Director on a teleport jump, consumed by `CameraDirector`).
  - `window.__hq.layouts: Record<FloorId, FloorLayout>` (read-only, for Playwright).
  - `e2e/hq.ts`: `interface PadSnapshot { id: string; kind: "elevator" | "teleport"; at: { x: number; z: number }; year?: number }`, `padsOf(page, floor): Promise<PadSnapshot[]>`, `driveTo(page, point, timeout?)`.
  - `scripts/e2e-plan.ts`: spec `"pads"`.

- [ ] **Step 1: Register the spec in the e2e plan (failing test first)**

In `tests/unit/e2e-plan.test.ts`, replace:

```ts
    expect(specsForChanges(["src/experience/floors/career/layout.ts"]).specs).toEqual(["career"]);
```

with:

```ts
    expect(specsForChanges(["src/experience/floors/career/layout.ts"]).specs).toEqual(["career", "pads"]);
```

and add a case inside `describe("specsForChanges", ...)`:

```ts
  it("maps floor pads, their pickers and thumbnails to the pads spec", () => {
    expect(specsForChanges(["src/experience/nav/pads.ts"]).specs).toEqual(["experience", "pads"]);
    expect(specsForChanges(["src/experience/fx/PadGlow.tsx"]).specs).toEqual(["experience", "pads"]);
    expect(specsForChanges(["src/hud/pads/PadPicker.tsx"]).specs).toEqual(["experience", "pads"]);
    expect(specsForChanges(["public/floors/L2.webp"]).specs).toEqual(["experience", "pads"]);
    expect(specsForChanges(["src/experience/nav/space.ts"]).specs).toEqual(["experience", "pads", "walk"]);
    expect(specsForChanges(["scripts/floor-thumbs.ts"]).specs).toEqual([]);
  });
```

Run: `bunx vitest run tests/unit/e2e-plan.test.ts`
Expected: FAIL (career maps to `["career"]`, pads paths fall back to the smoke specs).

- [ ] **Step 2: Add the rules**

In `scripts/e2e-plan.ts`:

In `ALL_SPECS`, add `"pads",` between `"missions",` and `"pageview",`.

Replace:

```ts
  { test: /^(docs|tests|\.github)\/|\.md$|^scripts\/(e2e-|validate-)|^lighthouserc\.json$|^eslint\.config\.mjs$|^vitest\.config\.mts$/, specs: [] },
```

with:

```ts
  { test: /^(docs|tests|\.github)\/|\.md$|^scripts\/(e2e-|validate-|floor-thumbs)|^lighthouserc\.json$|^eslint\.config\.mjs$|^vitest\.config\.mts$/, specs: [] },
```

Replace:

```ts
  { test: /^src\/experience\/nav\/(road|roadGeometry|space)\.ts$|^src\/experience\/fx\/RoadMarkings\.tsx$/, specs: ["walk", "experience"] },
```

with:

```ts
  { test: /^src\/experience\/nav\/(road|roadGeometry|space)\.ts$|^src\/experience\/fx\/RoadMarkings\.tsx$/, specs: ["walk", "experience", "pads"] },

  // Floor pads: elevator call pads, L2 year teleporters, the beam, their pickers and thumbnails.
  { test: /^src\/experience\/nav\/(pads|teleport)\.ts$|^src\/experience\/fx\/(PadGlow|TeleportBeam)\.tsx$|^src\/hud\/pads\/|^public\/floors\//, specs: ["pads", "experience"] },
```

Replace:

```ts
  { test: /^src\/experience\/floors\/career\//, specs: ["career"] },
```

with:

```ts
  { test: /^src\/experience\/floors\/career\//, specs: ["career", "pads"] },
```

- [ ] **Step 3: Write the failing e2e spec**

Create `e2e/pads.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { asReturningVisitor, collectErrors, driveTo, expectRenderBudget, padsOf, waitForFrames, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";

test.describe.configure({ timeout: 180_000 });

type PadWindow = Window & {
  __hq: {
    store: {
      getState: () => {
        picker: { kind: string; from?: number } | null;
        beam: unknown;
        closePicker: () => void;
        setBeam: (beam: unknown) => void;
      };
    };
    rover: { x: number; z: number };
    camera: () => [number, number, number];
  };
};

/** L2 as a returning visitor without the first-visit walk prompt (it sits over the floor on phones). */
async function openJourney(page: Page) {
  await asReturningVisitor(page);
  await page.goto("/en/journey?tier=lite&walk=off");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

const picker = (page: Page) => page.evaluate(() => (window as unknown as PadWindow).__hq.store.getState().picker);
const beam = (page: Page) => page.evaluate(() => (window as unknown as PadWindow).__hq.store.getState().beam);
const roverAt = (page: Page) =>
  page.evaluate(() => {
    const r = (window as unknown as PadWindow).__hq.rover;
    return { x: r.x, z: r.z };
  });

test.describe("floor pads on the Career Road (L2)", () => {
  test("the elevator pad stays quiet under a deep link, then asks for a floor once the rover leaves and stops on it again", async ({ page }) => {
    const errors = collectErrors(page);
    await openJourney(page);
    const lift = (await padsOf(page, "L2")).find((p) => p.kind === "elevator")!;
    expect(lift.id).toBe("elevator:L2");
    await waitForFrames(page, 30);
    expect(await picker(page)).toBeNull();
    await expectRenderBudget(page);

    await driveTo(page, { x: lift.at.x + 10, z: lift.at.z });
    expect(await picker(page)).toBeNull();
    await driveTo(page, lift.at);
    await expect.poll(() => picker(page)).toEqual({ kind: "floor" });
    expect(errors).toEqual([]);
  });

  test("a year teleporter asks for a year, and a beam lands the rover on the target pad with the camera", async ({ page }) => {
    await openJourney(page);
    const teleports = (await padsOf(page, "L2")).filter((p) => p.kind === "teleport");
    expect(teleports.length).toBeGreaterThanOrEqual(5);
    const first = teleports[0];
    const target = teleports[4];
    await driveTo(page, first.at);
    await expect.poll(() => picker(page)).toEqual({ kind: "year", from: first.year });

    // What a year pick does: close the picker and let the Director run the beam to the target pad.
    await page.evaluate((t) => {
      const w = window as unknown as PadWindow;
      const s = w.__hq.store.getState();
      s.closePicker();
      s.setBeam({ pad: t.id, from: { x: w.__hq.rover.x, z: w.__hq.rover.z }, to: t.at, heading: Math.PI / 2, t: 0, jumped: false });
    }, target);
    await expect.poll(() => beam(page)).toBeNull();
    const at = await roverAt(page);
    expect(Math.hypot(at.x - target.at.x, at.z - target.at.z)).toBeLessThan(0.5);
    // The rail camera cut with the rover instead of gliding about 150 u along the road.
    await waitForFrames(page, 2);
    const [cx] = await page.evaluate(() => (window as unknown as PadWindow).__hq.camera());
    expect(Math.abs(cx - at.x)).toBeLessThan(2);
    await expect(page.getByTestId("year-chip")).toHaveAttribute("data-place", String(target.year));
    // Landing on the target pad does not open its picker.
    await waitForFrames(page, 30);
    expect(await picker(page)).toBeNull();
  });
});
```

- [ ] **Step 4: Add the e2e helpers**

Append to `e2e/hq.ts`:

```ts
/** A floor pad as read from `window.__hq.layouts` (elevator call pad, L2 year teleporters). */
export interface PadSnapshot {
  id: string;
  kind: "elevator" | "teleport";
  at: { x: number; z: number };
  year?: number;
}

/** Floor pads of `floor` from the live layouts. */
export async function padsOf(page: Page, floor: string): Promise<PadSnapshot[]> {
  return page.evaluate((f) => (window as unknown as { __hq: { layouts: Record<string, { pads?: PadSnapshot[] }> } }).__hq.layouts[f].pads ?? [], floor);
}

/**
 * Drives the rover to `point` the way a mission leg does (an autopilot request, along the road on
 * walkable floors), then waits until the drive is over and the rover has nearly stopped.
 */
export async function driveTo(page: Page, point: { x: number; z: number }, timeout = 60_000) {
  await page.evaluate((p) => {
    (window as unknown as { __hq: { rover: { autopilot: unknown } } }).__hq.rover.autopilot = { point: p, state: "pending" };
  }, point);
  await page.waitForFunction(
    () => {
      const rover = (window as unknown as { __hq: { rover: { autopilot: { state: string } | null; speed: number } } }).__hq.rover;
      const state = rover.autopilot?.state;
      return state !== "pending" && state !== "driving" && rover.speed < 0.5;
    },
    null,
    { timeout },
  );
}
```

- [ ] **Step 5: Expose the layouts to Playwright**

In `src/experience/Experience.tsx`, replace:

```ts
  (window as unknown as { __hq?: unknown }).__hq = { store, rover: roverRuntime, marker: roverRuntime.marker, camera: () => [...roverRuntime.cameraPosition] };
```

with:

```ts
  (window as unknown as { __hq?: unknown }).__hq = { store, rover: roverRuntime, marker: roverRuntime.marker, camera: () => [...roverRuntime.cameraPosition], layouts };
```

- [ ] **Step 6: Add the camera cut flag**

In `src/experience/rover/runtime.ts`, after the `cameraPosition: [0, 0, 0] as [number, number, number],` line add:

```ts
  /** Set by the Director when a teleport moves the rover: the camera cuts to it on the next frame instead of gliding. */
  cameraSnap: false,
```

In `src/experience/camera/CameraDirector.tsx`, replace:

```ts
    l.desiredPos.set(...desired.position);
```

with:

```ts
    // A teleport moved the rover far along the road: cut to it instead of gliding across the floor.
    if (roverRuntime.cameraSnap) {
      roverRuntime.cameraSnap = false;
      if (!focus) snap = true;
    }
    l.desiredPos.set(...desired.position);
```

- [ ] **Step 7: Wire the Director**

In `src/experience/scene/Director.tsx`:

After `import { doorAt, stepDoorLatch, type DoorLatch } from "../nav/doors";` add:

```ts
import { pickerFor, primedPadLatch, stepPadLatch } from "../nav/pads";
```

After `import { buildRoadGraph, roadRoute, type RoadGraph } from "../nav/road";` add:

```ts
import { advanceBeam, startBeam } from "../nav/teleport";
```

Replace:

```ts
    door: { room: null } as DoorLatch,
```

with:

```ts
    door: { room: null } as DoorLatch,
    /** Floor pads (elevator call pad, L2 teleporters) run the door latch with pad ids. */
    pad: { room: null } as DoorLatch<string>,
```

Replace:

```ts
      if ((intent.type === "goto" || intent.type === "elevator" || intent.type === "cancel" || intent.type === "scrub") && missionRunning()) cancelMission();
```

with:

```ts
      if ((intent.type === "goto" || intent.type === "elevator" || intent.type === "cancel" || intent.type === "scrub" || intent.type === "teleport") && missionRunning()) cancelMission();
```

Replace:

```ts
        case "toggle":
          if (intent.what === "sound") audio.toggleMuted();
```

with:

```ts
        case "teleport": {
          // L2 year teleporters: beam to the chosen plaza's pad. Any drive (autopilot, click-to-move) ends here.
          const pad = layouts[s.floor].pads?.find((p) => p.id === intent.pad);
          if (!controller || !pad || s.phase !== "explore" || s.ride || s.beam) break;
          controller.clearPath();
          roverRuntime.target = null;
          roverRuntime.autopilot = null;
          s.setBeam(startBeam(controller.pose, pad));
          audio.play("whoosh");
          break;
        }
        case "toggle":
          if (intent.what === "sound") audio.toggleMuted();
```

Replace:

```ts
      local.door.room = doorAt(layouts[s.floor].doors, local.controller.pose)?.room ?? null;
    }
```

with:

```ts
      local.door.room = doorAt(layouts[s.floor].doors, local.controller.pose)?.room ?? null;
      // A deep link to L2 spawns on the elevator pad: it must not ask for a floor until the rover leaves it.
      local.pad = primedPadLatch(layouts[s.floor].pads, local.controller.pose);
    }
```

Replace:

```ts
    const canDrive = s.phase === "explore" || (s.phase === "elevator" && s.ride?.stage === "toDoor");
```

with:

```ts
    // Teleport beam (L2): the rover holds still while the beam rises, jumps to the target pad (the camera
    // cuts with it), then the beam fades. Reduced motion makes it a 150 ms fade cut (BeamFade in the HUD).
    if (s.beam) {
      const step = advanceBeam(s.beam, dt, s.reducedMotion);
      if (step.jump) {
        controller.teleport(s.beam.to, s.beam.heading);
        roverRuntime.cameraSnap = true;
      }
      s.setBeam(step.beam);
    }
    const canDrive = !s.beam && (s.phase === "explore" || (s.phase === "elevator" && s.ride?.stage === "toDoor"));
```

Replace:

```ts
          controller.teleport(to.approach, Math.PI / 2);
          s.arriveFloor(ride.to);
```

with:

```ts
          controller.teleport(to.approach, Math.PI / 2);
          // The rover steps out onto the new floor's elevator pad: it stays quiet until the rover leaves it.
          local.pad = primedPadLatch(to.pads, to.approach);
          s.arriveFloor(ride.to);
```

Replace:

```ts
    if (open) intents.emit({ type: "open", room: open });
```

with:

```ts
    if (open) intents.emit({ type: "open", room: open });

    // Floor pads: the door rules (stop or slow on the pad, or stay PAD.dwell), read from the live state
    // so a ride that ended this frame already sees the new floor's primed pad. A beam, a picker or any
    // other phase latches the pad under the rover instead.
    const live = store.getState();
    const padHit = stepPadLatch(local.pad, layouts[live.floor].pads, controller.pose, {
      riding: live.ride !== null,
      explore: live.phase === "explore" && !live.beam && !live.picker,
      following: controller.following || live.mission?.status === "running",
      now,
      speed: controller.pose.speed,
    });
    if (padHit) {
      live.openPicker(pickerFor(padHit));
      audio.play("beep");
    }
```

- [ ] **Step 8: Run unit checks**

Run: `bunx vitest run tests/unit/e2e-plan.test.ts && bun run typecheck && bun run lint`
Expected: e2e-plan PASS; typecheck and lint exit 0.

- [ ] **Step 9: Build and run the new spec**

Run: `bun run build && bun run e2e e2e/pads.spec.ts`
Expected: `2 passed`.

- [ ] **Step 10: Run the neighbouring 3D specs**

Run: `bun run e2e e2e/career.spec.ts e2e/experience.spec.ts e2e/walk.spec.ts`
Expected: all pass (deep links, rides, walks and missions unchanged; render budgets hold with the pads).

- [ ] **Step 11: Commit**

```bash
rtk git add src/experience/scene/Director.tsx src/experience/rover/runtime.ts src/experience/camera/CameraDirector.tsx src/experience/Experience.tsx e2e/hq.ts e2e/pads.spec.ts scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts
rtk git commit -m "feat(3d): pads open pickers, teleport beam with a camera cut, pads e2e spec"
```

---
### Task 7: Bottom sheet Modal, picker helpers and copy

**Files:**
- Modify: `src/components/Modal.tsx` (props, container and panel classes)
- Create: `src/hud/pads/picker.ts`
- Modify: `messages/en.json`, `messages/id.json` (`hud.pads`)
- Test: `tests/hud/Modal.test.tsx`, `tests/unit/pad-picker.test.ts`

**Interfaces:**
- Consumes: `FLOOR_IDS` from `src/experience/config.ts`; `CareerData` from `src/experience/types.ts`.
- Produces:
  - `ModalProps.sheet?: boolean`: on phones (below `sm`) the panel is a bottom sheet sized to its content (`max-h-[85dvh]`, top corners rounded, `data-sheet="bottom"`); tablets and desktops unchanged.
  - `interface PickerOption { id: string; title: string; detail: string; eyebrow?: string; thumb?: string; current: boolean }`.
  - `floorThumb(floor: FloorId): string` (`/floors/L2.webp`).
  - `floorOptions(current: FloorId, label: (f: FloorId) => string, describe: (f: FloorId) => string): PickerOption[]` (RF first, like the panel).
  - `yearOptions(career: CareerData, current: number, rooms: (count: number) => string, prologue: string): PickerOption[]` (oldest first).
  - `nextIndex(index: number, key: string, count: number): number | null`.
  - Messages `hud.pads.floorTitle`, `floorHint`, `yearTitle`, `yearHint`, `close`, `here`, `floorDesc.{L1,L2,L3,L4,RF}`.

- [ ] **Step 1: Write the failing tests**

Create `tests/hud/Modal.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Modal } from "@/components/Modal";

afterEach(cleanup);

describe("Modal", () => {
  it("is a full-screen sheet on phones by default", () => {
    render(
      <Modal labelledBy="t" onClose={() => {}} testId="m">
        <h2 id="t">Title</h2>
      </Modal>,
    );
    const panel = screen.getByRole("dialog", { name: "Title" });
    expect(panel).not.toHaveAttribute("data-sheet");
    expect(panel).toHaveClass("h-full");
    expect(screen.getByTestId("m-root")).toHaveClass("items-stretch");
  });

  it("becomes a bottom sheet sized to its content with `sheet`", () => {
    render(
      <Modal labelledBy="t" onClose={() => {}} testId="m" sheet>
        <h2 id="t">Title</h2>
      </Modal>,
    );
    const panel = screen.getByRole("dialog", { name: "Title" });
    expect(panel).toHaveAttribute("data-sheet", "bottom");
    expect(panel).not.toHaveClass("h-full");
    expect(panel).toHaveClass("max-h-[85dvh]");
    expect(screen.getByTestId("m-root")).toHaveClass("items-end");
  });
});
```

Create `tests/unit/pad-picker.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildCareerData } from "@/content/experience";
import { floorOptions, floorThumb, nextIndex, yearOptions } from "@/hud/pads/picker";

describe("pad picker options", () => {
  it("lists the floors top-down like the elevator panel, with labels, descriptions and thumbnails", () => {
    const options = floorOptions("L3", (f) => `label ${f}`, (f) => `desc ${f}`);
    expect(options.map((o) => o.id)).toEqual(["RF", "L4", "L3", "L2", "L1"]);
    expect(options[2]).toEqual({ id: "L3", eyebrow: "L3", title: "label L3", detail: "desc L3", thumb: "/floors/L3.webp", current: true });
    expect(options.filter((o) => o.current)).toHaveLength(1);
    expect(floorThumb("RF")).toBe("/floors/RF.webp");
  });

  it("lists every year plaza oldest first with rooms and organizations, and the prologue on the first year", () => {
    const career = buildCareerData("en");
    const options = yearOptions(career, career.years[2].year, (n) => `${n} rooms`, "Prologue");
    expect(options.map((o) => Number(o.id))).toEqual(career.years.map((y) => y.year));
    expect(options.map((o) => o.title)).toEqual(career.years.map((y) => String(y.year)));
    expect(options.filter((o) => o.current).map((o) => o.id)).toEqual([String(career.years[2].year)]);
    const first = career.years[0];
    expect(options[0].detail.startsWith(`${first.entries.length} rooms`)).toBe(true);
    expect(options[0].detail).toContain(first.entries[0].org);
    const early = first.entries.find((e) => e.prologue);
    expect(options[0].eyebrow).toBe(early ? `Prologue \u00B7 ${early.period}` : undefined);
    expect(options.slice(1).every((o) => o.eyebrow === undefined)).toBe(true);
  });

  it("moves the roving focus with the arrows (wrapping), Home and End", () => {
    expect(nextIndex(0, "ArrowDown", 5)).toBe(1);
    expect(nextIndex(4, "ArrowDown", 5)).toBe(0);
    expect(nextIndex(0, "ArrowUp", 5)).toBe(4);
    expect(nextIndex(2, "ArrowRight", 5)).toBe(3);
    expect(nextIndex(2, "ArrowLeft", 5)).toBe(1);
    expect(nextIndex(3, "Home", 5)).toBe(0);
    expect(nextIndex(1, "End", 5)).toBe(4);
    expect(nextIndex(1, "Enter", 5)).toBeNull();
    expect(nextIndex(0, "ArrowDown", 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run tests/hud/Modal.test.tsx tests/unit/pad-picker.test.ts`
Expected: FAIL: the Modal panel has no `data-sheet`, and `Failed to resolve import "@/hud/pads/picker"`.

- [ ] **Step 3: Add the bottom sheet to Modal**

In `src/components/Modal.tsx`:

In `interface ModalProps`, after `testId?: string;` add:

```ts
  /** Phones: a bottom sheet sized to its content instead of the full-screen sheet (short lists such as the pad pickers). */
  sheet?: boolean;
```

Replace the function signature line:

```tsx
export function Modal({ labelledBy, onClose, children, width = "md", testId }: ModalProps) {
```

with:

```tsx
export function Modal({ labelledBy, onClose, children, width = "md", testId, sheet = false }: ModalProps) {
```

Replace the returned portal (from `return createPortal(` to the end of the function) with:

```tsx
  return createPortal(
    <div
      className={`fixed inset-0 z-[60] flex ${sheet ? "items-end" : "items-stretch"} justify-center sm:items-center sm:p-6`}
      data-testid={testId ? `${testId}-root` : undefined}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-void/80 backdrop-blur-sm" onClick={() => close.current()} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        data-testid={testId}
        data-sheet={sheet ? "bottom" : undefined}
        onKeyDown={onKeyDown}
        className={`glass glass-solid relative flex w-full flex-col overflow-hidden shadow-[0_0_64px_-16px_rgb(0_0_0/0.9)] outline-none sm:max-h-[min(92dvh,1100px)] sm:rounded-2xl sm:border ${
          sheet ? "max-h-[85dvh] rounded-t-2xl rounded-b-none border-t" : "h-full rounded-none border-0"
        } ${WIDTH[width]}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
```

Update the component doc comment's first sentence to: `Shared modal dialog for the CV viewer, paper and certification previews and the floor pad pickers: ...` (keep the rest).

- [ ] **Step 4: Write the picker helpers**

Create `src/hud/pads/picker.ts`:

```ts
import type { FloorId } from "@/content/schema";
import { FLOOR_IDS } from "@/experience/config";
import type { CareerData } from "@/experience/types";

/** One row of a pad picker (pure data, so the lists are unit tested without React). */
export interface PickerOption {
  /** Floor id, or the year as a string. */
  id: string;
  title: string;
  detail: string;
  /** Small line above the title: the floor code, or the prologue note on the first year. */
  eyebrow?: string;
  /** Preview image (floors only). */
  thumb?: string;
  current: boolean;
}

/** Committed picker thumbnail of a floor (`bun run floor:thumbs`). */
export const floorThumb = (floor: FloorId) => `/floors/${floor}.webp`;

/** Floors top-down like the elevator panel (RF first), named with the panel's labels. */
export function floorOptions(current: FloorId, label: (floor: FloorId) => string, describe: (floor: FloorId) => string): PickerOption[] {
  return [...FLOOR_IDS].reverse().map((id) => ({ id, eyebrow: id, title: label(id), detail: describe(id), thumb: floorThumb(id), current: id === current }));
}

/** Year plazas oldest first: room count and up to two organizations; the first year notes the folded prologue. */
export function yearOptions(career: CareerData, current: number, rooms: (count: number) => string, prologue: string): PickerOption[] {
  return career.years.map(({ year, entries }) => {
    const orgs = [...new Set(entries.map((e) => e.org))].slice(0, 2);
    const early = entries.find((e) => e.prologue);
    return {
      id: String(year),
      eyebrow: early ? `${prologue} \u00B7 ${early.period}` : undefined,
      title: String(year),
      detail: [rooms(entries.length), ...orgs].join(" \u00B7 "),
      current: year === current,
    };
  });
}

/** Roving focus in a picker list: arrows move one step (wrapping), Home and End jump; other keys return null. */
export function nextIndex(index: number, key: string, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowUp":
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
```

- [ ] **Step 5: Add the copy**

In `messages/en.json`, replace the end of the `hud` object:

```json
    "floorLabel": {
      "L1": "Home",
      "L2": "Journey",
      "L3": "Work",
      "L4": "Writing",
      "RF": "About"
    }
  },
```

with:

```json
    "floorLabel": {
      "L1": "Home",
      "L2": "Journey",
      "L3": "Work",
      "L4": "Writing",
      "RF": "About"
    },
    "pads": {
      "floorTitle": "Take the elevator",
      "floorHint": "Pick a floor: arrows to move, Enter to ride, Esc to close.",
      "yearTitle": "Teleport to a year",
      "yearHint": "Pick a year: arrows to move, Enter to beam there, Esc to close.",
      "close": "Close",
      "here": "You are here",
      "floorDesc": {
        "L1": "Profile, stats, skills and certifications",
        "L2": "The Career Road: one plaza per year",
        "L3": "Product and AI engineering projects",
        "L4": "Blog posts, research papers and talks",
        "RF": "Contact channels and the CV"
      }
    }
  },
```

In `messages/id.json`, replace:

```json
    "floorLabel": {
      "L1": "Beranda",
      "L2": "Perjalanan",
      "L3": "Karya",
      "L4": "Tulisan",
      "RF": "Tentang"
    }
  },
```

with:

```json
    "floorLabel": {
      "L1": "Beranda",
      "L2": "Perjalanan",
      "L3": "Karya",
      "L4": "Tulisan",
      "RF": "Tentang"
    },
    "pads": {
      "floorTitle": "Naik lift",
      "floorHint": "Pilih lantai: panah untuk berpindah, Enter untuk naik, Esc untuk menutup.",
      "yearTitle": "Teleportasi ke tahun",
      "yearHint": "Pilih tahun: panah untuk berpindah, Enter untuk teleportasi, Esc untuk menutup.",
      "close": "Tutup",
      "here": "Anda di sini",
      "floorDesc": {
        "L1": "Profil, statistik, keahlian dan sertifikasi",
        "L2": "Career Road: satu plaza per tahun",
        "L3": "Proyek product engineering dan AI engineering",
        "L4": "Artikel blog, makalah riset dan talk",
        "RF": "Kanal kontak dan CV"
      }
    }
  },
```

- [ ] **Step 6: Run the tests**

Run: `bunx vitest run tests/hud/Modal.test.tsx tests/unit/pad-picker.test.ts tests/hud/Dialogs.test.tsx tests/unit/ui-copy.test.ts tests/content/fonts.test.ts tests/content/safety.test.ts`
Expected: PASS, `Test Files  6 passed (6)` (the CV, paper and certification dialogs keep their full-screen phone sheet; copy keys align; every new character is in the font cuts).

- [ ] **Step 7: Commit**

```bash
rtk git add src/components/Modal.tsx src/hud/pads/picker.ts messages/en.json messages/id.json tests/hud/Modal.test.tsx tests/unit/pad-picker.test.ts
rtk git commit -m "feat(hud): bottom sheet modal option, pad picker options and copy"
```

---

### Task 8: Floor preview thumbnails

**Files:**
- Modify: `e2e/screenshots.spec.ts` (thumbnail captures)
- Create: `scripts/floor-thumbs.ts`
- Modify: `package.json` (`floor:thumbs` script)
- Create: `public/floors/L1.webp`, `public/floors/L2.webp`, `public/floors/L3.webp`, `public/floors/L4.webp`, `public/floors/RF.webp`
- Test: `tests/content/floor-thumbs.test.ts`

**Interfaces:**
- Consumes: `floorThumb` (Task 7), `FLOOR_IDS`; pads render in the captures (Tasks 5 and 6).
- Produces: committed `public/floors/{id}.webp` (lossy VP8, 320 x 180, at most 16 KB each); `bun run floor:thumbs`.

- [ ] **Step 1: Write the failing test**

Create `tests/content/floor-thumbs.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FLOOR_IDS } from "@/experience/config";
import { floorThumb } from "@/hud/pads/picker";

/** Elevator picker thumbnails are committed renders (`bun run floor:thumbs`): one small lossy webp per floor. */
const MAX_BYTES = 16 * 1024;

describe("floor picker thumbnails", () => {
  it("has a 320 x 180 webp of at most 16 KB for every floor", () => {
    for (const id of FLOOR_IDS) {
      const bytes = readFileSync(path.join(process.cwd(), "public", floorThumb(id)));
      expect(bytes.toString("latin1", 0, 4), id).toBe("RIFF");
      expect(bytes.toString("latin1", 8, 12), id).toBe("WEBP");
      expect(bytes.toString("latin1", 12, 16), id).toBe("VP8 ");
      expect([bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff], id).toEqual([320, 180]);
      expect(bytes.length, id).toBeLessThanOrEqual(MAX_BYTES);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/content/floor-thumbs.test.ts`
Expected: FAIL with `ENOENT: no such file or directory, open '.../public/floors/L1.webp'`.

- [ ] **Step 3: Add the captures**

In `e2e/screenshots.spec.ts`, append at the end of the file:

```ts
const FLOOR_THUMBS = [
  { id: "L1", path: "/en" },
  { id: "L2", path: "/en/journey" },
  { id: "L3", path: "/en/labs" },
  { id: "L4", path: "/en/library" },
  { id: "RF", path: "/en/contact" },
] as const;

/** Elevator picker thumbnails: each floor from its start spot with the HUD hidden (`bun run floor:thumbs` converts them to public/floors/*.webp). */
for (const floor of FLOOR_THUMBS) {
  test(`floor thumbnail ${floor.id}`, async ({ browser }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await asReturningVisitor(page);
    await page.goto(`${floor.path}?tier=full&walk=off`);
    await waitForHQ(page);
    if (floor.id === "L1") await page.getByRole("button", { name: /Skip intro/ }).click();
    await waitForPhase(page, "explore");
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: "[data-testid='hud'], [data-testid^='ask-'] { display: none !important; }" });
    // The full tier renders through the bloom composer: give the floor time to mount and settle.
    await page.waitForTimeout(8000);
    await page.screenshot({ path: `screenshots/floor-thumbs/${floor.id}.png` });
    await context.close();
  });
}
```

- [ ] **Step 4: Write the converter and the script**

Create `scripts/floor-thumbs.ts`:

```ts
/**
 * `floor:thumbs` step 2: converts the "floor thumbnail" captures (e2e/screenshots.spec.ts, written to
 * screenshots/floor-thumbs/{id}.png) into the elevator picker thumbnails public/floors/{id}.webp:
 * 320 x 180, lossy, no alpha, no metadata. Needs libwebp (`cwebp`) on the PATH: `brew install webp`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

const FLOORS = ["L1", "L2", "L3", "L4", "RF"] as const;
const SOURCE = path.join("screenshots", "floor-thumbs");
const OUT = path.join("public", "floors");

mkdirSync(OUT, { recursive: true });
for (const id of FLOORS) {
  const png = path.join(SOURCE, `${id}.png`);
  if (!existsSync(png)) throw new Error(`missing ${png}: run the "floor thumbnail" captures first (bun run floor:thumbs)`);
  const out = path.join(OUT, `${id}.webp`);
  const result = spawnSync("cwebp", ["-quiet", "-noalpha", "-q", "62", "-m", "6", "-resize", "320", "180", "-metadata", "none", png, "-o", out], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`cwebp failed for ${id}: ${result.stderr || result.error?.message || "unknown error"}`);
  console.log(`${out} ${(statSync(out).size / 1024).toFixed(1)} KB`);
}
```

In `package.json` `scripts`, after the `"cv:pages": "bun scripts/cv-pages.ts",` line add:

```json
    "floor:thumbs": "SCREENSHOTS=1 playwright test e2e/screenshots.spec.ts -g \"floor thumbnail\" --workers=1 && bun scripts/floor-thumbs.ts",
```

- [ ] **Step 5: Generate the thumbnails**

Run: `which cwebp || brew install webp`, then `bun run build && bun run floor:thumbs`
Expected: `5 passed` from Playwright, then five lines such as `public/floors/L1.webp 8.4 KB` (each at most 16 KB). If one is over 16 KB, lower `-q` in `scripts/floor-thumbs.ts` to `55` and rerun `bun scripts/floor-thumbs.ts`.

Open the five files and check each shows its floor (L1 hologram plaza, L2 first plaza with the road, L3 hub, L4 shelves, RF beacon) without HUD panels.

- [ ] **Step 6: Run the test**

Run: `bunx vitest run tests/content/floor-thumbs.test.ts tests/content/assets.test.ts tests/unit/e2e-plan.test.ts`
Expected: PASS, `Test Files  3 passed (3)`.

- [ ] **Step 7: Commit**

```bash
rtk git add e2e/screenshots.spec.ts scripts/floor-thumbs.ts package.json public/floors tests/content/floor-thumbs.test.ts
rtk git commit -m "feat(hud): floor preview thumbnails for the elevator picker"
```

---
### Task 9: The pad pickers in the HUD, and the end-to-end flows

**Files:**
- Create: `src/hud/pads/PadPicker.tsx`
- Modify: `src/hud/Hud.tsx` (one import, two mounts)
- Modify: `e2e/hq.ts` (move `railScreenPoint` here), `e2e/career.spec.ts` (import it)
- Modify: `e2e/pads.spec.ts` (UI flows)
- Test: `tests/hud/PadPicker.test.tsx`

**Interfaces:**
- Consumes: `Modal` with `sheet` (Task 7); `floorOptions`, `yearOptions`, `nextIndex`, `PickerOption` (Task 7); store `picker`, `closePicker`, `beam`, `reducedMotion` (Task 4); `intents` (`elevator`, `teleport`); `teleportPadId` (Task 1); `padsOf`, `driveTo` (Task 6); messages `hud.pads.*`, `hud.floorLabel.*`, `hud.career.rooms`, `hud.career.prologue`.
- Produces:
  - `<PadPicker data={ExperienceData} />`: renders the floor picker or the year picker from `store.picker` (Modal `testId="pad-picker"`, options carry `data-option` with the floor id or year), closes itself when the phase leaves `explore`.
  - `<BeamFade />`: `data-testid="beam-fade"`, opaque only while `reducedMotion && beam`.
  - `e2e/hq.ts`: `railScreenPoint(page, p)` (moved unchanged from `career.spec.ts`).

- [ ] **Step 1: Write the failing component test**

Create `tests/hud/PadPicker.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { buildExperienceData } from "@/content/experience";
import type { Locale } from "@/content/schema";
import { intents, type Intent } from "@/experience/input/intents";
import { BeamFade, PadPicker } from "@/hud/pads/PadPicker";
import { getHQStore } from "@/store/useHQStore";

const names = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
let emitted: Intent[] = [];
let off: () => void = () => {};

beforeEach(() => {
  emitted = [];
  off = intents.on((intent) => {
    emitted.push(intent);
  });
  getHQStore().setState({ phase: "explore", floor: "L2", ride: null, beam: null, picker: null, reducedMotion: false });
});

afterEach(() => {
  off();
  cleanup();
  getHQStore().setState({ picker: null, beam: null, reducedMotion: false });
});

function mount(locale: Locale = "en") {
  const data = buildExperienceData(locale, names);
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : id}>
      <PadPicker data={data} />
      <BeamFade />
    </NextIntlClientProvider>,
  );
  return data;
}

const option = (dialog: HTMLElement, value: string) => dialog.querySelector<HTMLButtonElement>(`[data-option="${value}"]`)!;

describe("pad pickers", () => {
  it("lists every floor like the elevator panel, with descriptions and thumbnails, the current floor marked and focused", async () => {
    mount();
    act(() => getHQStore().getState().openPicker({ kind: "floor" }));
    const dialog = await screen.findByRole("dialog", { name: "Take the elevator" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("data-sheet", "bottom");
    expect([...dialog.querySelectorAll("[data-option]")].map((b) => b.getAttribute("data-option"))).toEqual(["RF", "L4", "L3", "L2", "L1"]);
    expect(option(dialog, "L3")).toHaveTextContent("Work");
    expect(option(dialog, "L3")).toHaveTextContent("Product and AI engineering projects");
    expect(option(dialog, "L2")).toHaveAttribute("aria-current", "true");
    expect(option(dialog, "L2")).toHaveTextContent("You are here");
    expect(option(dialog, "L2")).toHaveFocus();
    expect(option(dialog, "RF").querySelector("img")).toHaveAttribute("src", "/floors/RF.webp");
  });

  it("moves with the arrow keys, Home and End, and rides the elevator on Enter", async () => {
    const user = userEvent.setup();
    mount();
    act(() => getHQStore().getState().openPicker({ kind: "floor" }));
    const dialog = await screen.findByRole("dialog", { name: "Take the elevator" });
    await user.keyboard("{ArrowUp}");
    expect(option(dialog, "L3")).toHaveFocus();
    await user.keyboard("{End}");
    expect(option(dialog, "L1")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(option(dialog, "RF")).toHaveFocus();
    await user.keyboard("{Home}{ArrowDown}{ArrowDown}");
    expect(option(dialog, "L3")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getHQStore().getState().picker).toBeNull();
    expect(emitted).toContainEqual({ type: "elevator", to: "L3" });
  });

  it("closes on Esc without riding, and picking the current floor only closes", async () => {
    const user = userEvent.setup();
    mount();
    act(() => getHQStore().getState().openPicker({ kind: "floor" }));
    await screen.findByRole("dialog", { name: "Take the elevator" });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getHQStore().getState().picker).toBeNull();
    act(() => getHQStore().getState().openPicker({ kind: "floor" }));
    const dialog = await screen.findByRole("dialog", { name: "Take the elevator" });
    await user.click(option(dialog, "L2"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(emitted.filter((i) => i.type === "elevator")).toEqual([]);
  });

  it("lists every year plaza oldest first, notes the prologue on the first year and beams on a pick", async () => {
    const user = userEvent.setup();
    const data = mount();
    const years = data.career.years.map((y) => String(y.year));
    const from = data.career.years[2].year;
    const to = data.career.years[4].year;
    act(() => getHQStore().getState().openPicker({ kind: "year", from }));
    const dialog = await screen.findByRole("dialog", { name: "Teleport to a year" });
    expect([...dialog.querySelectorAll("[data-option]")].map((b) => b.getAttribute("data-option"))).toEqual(years);
    expect(option(dialog, String(from))).toHaveAttribute("aria-current", "true");
    expect(option(dialog, String(from))).toHaveFocus();
    expect(option(dialog, years[0])).toHaveTextContent("Prologue");
    expect(dialog.querySelectorAll("img")).toHaveLength(0);
    await user.click(option(dialog, String(to)));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(emitted).toContainEqual({ type: "teleport", pad: `teleport:${to}` });
  });

  it("closes itself when a ride, a room or the hologram takes over", async () => {
    mount();
    act(() => getHQStore().getState().openPicker({ kind: "floor" }));
    await screen.findByRole("dialog", { name: "Take the elevator" });
    act(() => getHQStore().setState({ phase: "room" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getHQStore().getState().picker).toBeNull();
  });

  it("speaks Indonesian", async () => {
    mount("id");
    act(() => getHQStore().getState().openPicker({ kind: "floor" }));
    const dialog = await screen.findByRole("dialog", { name: "Naik lift" });
    expect(option(dialog, "L3")).toHaveTextContent("Karya");
    expect(option(dialog, "L3")).toHaveTextContent("Proyek product engineering dan AI engineering");
    expect(within(dialog).getByRole("button", { name: "Tutup" })).toBeInTheDocument();
  });

  it("fades the screen during a reduced-motion teleport only", () => {
    mount();
    const fade = screen.getByTestId("beam-fade");
    expect(fade).toHaveClass("opacity-0");
    const beam = { pad: "teleport:2023", from: { x: 0, z: 0 }, to: { x: 140, z: -0.5 }, heading: Math.PI / 2, t: 0, jumped: false };
    act(() => getHQStore().setState({ beam }));
    expect(fade).toHaveClass("opacity-0");
    act(() => getHQStore().setState({ reducedMotion: true }));
    expect(fade).toHaveClass("opacity-100");
    act(() => getHQStore().setState({ beam: null }));
    expect(fade).toHaveClass("opacity-0");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/hud/PadPicker.test.tsx`
Expected: FAIL with `Failed to resolve import "@/hud/pads/PadPicker"`.

- [ ] **Step 3: Write the picker component**

Create `src/hud/pads/PadPicker.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { Modal } from "@/components/Modal";
import type { FloorId } from "@/content/schema";
import { intents } from "@/experience/input/intents";
import { teleportPadId } from "@/experience/nav/pads";
import type { ExperienceData } from "@/experience/types";
import { useHQStore } from "@/store/useHQStore";
import { floorOptions, nextIndex, yearOptions, type PickerOption } from "./picker";

/** Keyboard focus returns to the 3D world (where the rover's keys live) once a picker closes. */
function restoreWorldFocus() {
  requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-testid='hq-world']")?.focus({ preventScroll: true }));
}

interface PickerListProps {
  title: string;
  hint: string;
  options: PickerOption[];
  onPick: (id: string) => void;
  onClose: () => void;
}

/**
 * The one picker every floor pad uses: a titled list on the shared Modal (focus trap, Esc, backdrop),
 * a bottom sheet on phones. The current option is marked and focused first; arrows move (wrapping),
 * Home and End jump, Enter or a click picks.
 */
function PickerList({ title, hint, options, onPick, onClose }: PickerListProps) {
  const t = useTranslations("hud.pads");
  const titleId = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const index = buttons.current.findIndex((b) => b === document.activeElement);
    const next = nextIndex(Math.max(0, index), event.key, options.length);
    if (next === null) return;
    event.preventDefault();
    buttons.current[next]?.focus();
  };
  return (
    <Modal labelledBy={titleId} onClose={onClose} width="sm" sheet testId="pad-picker">
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold text-ink">
            {title}
          </h2>
          <p className="mt-0.5 text-[13px] leading-5 text-ink-3">{hint}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-line-2 text-ink transition hover:border-ink-2 hover:bg-surface-2"
        >
          <span aria-hidden="true" className="text-xl leading-none">
            ×
          </span>
        </button>
      </header>
      <ul className="flex flex-col gap-1 overflow-y-auto p-2" onKeyDown={onKeyDown}>
        {options.map((o, i) => (
          <li key={o.id}>
            <button
              ref={(node) => {
                buttons.current[i] = node;
              }}
              type="button"
              onClick={() => onPick(o.id)}
              aria-current={o.current ? "true" : undefined}
              data-autofocus={o.current ? "" : undefined}
              data-option={o.id}
              className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-cyan ${
                o.current ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
              }`}
            >
              {o.thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.thumb} alt="" width={96} height={54} loading="lazy" decoding="async" className="h-[54px] w-24 shrink-0 rounded-md border border-line object-cover" />
              )}
              <span className="min-w-0 flex-1">
                {o.eyebrow && <span className="label block truncate text-ink-3">{o.eyebrow}</span>}
                <span className="block text-sm font-semibold text-ink">{o.title}</span>
                <span className="block truncate text-[13px] leading-5 text-ink-2">{o.detail}</span>
              </span>
              {o.current && <span className="label shrink-0 text-cyan">{t("here")}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/**
 * Floor pad pickers (owner request): the floor list for the elevator call pad, the year list for the
 * L2 teleporters. Opened through `store.picker` (the Director, or a click on a pad); a floor rides the
 * elevator with the same intent as the right-side panel, a year beams the rover to that plaza's pad.
 */
export function PadPicker({ data }: { data: ExperienceData }) {
  const t = useTranslations("hud");
  const picker = useHQStore((s) => s.picker);
  const exploring = useHQStore((s) => s.phase === "explore");
  const floor = useHQStore((s) => s.floor);
  const closePicker = useHQStore((s) => s.closePicker);

  // A ride, a room or the hologram view takes over: the picker goes away with it.
  useEffect(() => {
    if (picker && !exploring) closePicker();
  }, [picker, exploring, closePicker]);

  if (!picker || !exploring) return null;
  const close = () => {
    closePicker();
    restoreWorldFocus();
  };
  if (picker.kind === "floor") {
    return (
      <PickerList
        title={t("pads.floorTitle")}
        hint={t("pads.floorHint")}
        options={floorOptions(floor, (id) => t(`floorLabel.${id}`), (id) => t(`pads.floorDesc.${id}`))}
        onClose={close}
        onPick={(id) => {
          close();
          if (id !== floor) intents.emit({ type: "elevator", to: id as FloorId });
        }}
      />
    );
  }
  const from = picker.from;
  return (
    <PickerList
      title={t("pads.yearTitle")}
      hint={t("pads.yearHint")}
      options={yearOptions(data.career, from, (count) => t("career.rooms", { count }), t("career.prologue"))}
      onClose={close}
      onPick={(id) => {
        close();
        if (Number(id) !== from) intents.emit({ type: "teleport", pad: teleportPadId(Number(id)) });
      }}
    />
  );
}

/** Reduced motion: a teleport is an instant fade cut, like the elevator ride (`CutFade` in Hud.tsx). */
export function BeamFade() {
  const cut = useHQStore((s) => s.reducedMotion && s.beam !== null);
  return <div aria-hidden="true" data-testid="beam-fade" className={`pointer-events-none absolute inset-0 bg-void ${cut ? "opacity-100" : "opacity-0"}`} />;
}
```

- [ ] **Step 4: Mount it in the HUD**

In `src/hud/Hud.tsx` (only these three lines; nothing else in this file changes):

After `import { ElevatorPanel } from "./ElevatorPanel";` add:

```tsx
import { BeamFade, PadPicker } from "./pads/PadPicker";
```

Replace `      <CutFade />` with:

```tsx
      <CutFade />
      <BeamFade />
```

Replace `      <FloorAnnouncer data={data} />` with:

```tsx
      <FloorAnnouncer data={data} />
      <PadPicker data={data} />
```

- [ ] **Step 5: Run the component tests**

Run: `bunx vitest run tests/hud/PadPicker.test.tsx tests/hud/Modal.test.tsx tests/hud/Dialogs.test.tsx`
Expected: PASS, `Test Files  3 passed (3)`.

- [ ] **Step 6: Move `railScreenPoint` into the shared e2e helpers**

In `e2e/hq.ts`, add at the top, after `import { expect, type Page } from "@playwright/test";`:

```ts
import { RAIL, RAIL_LOOK_AHEAD } from "../src/experience/camera/rigs";
```

and append at the end of the file (the function body is unchanged from `career.spec.ts`):

```ts
/**
 * Screen position (CSS px) of a floor point on L2, from the settled rail camera (desktop rig, no yaw):
 * the camera sits at `__hq.camera()` and looks at (rover x + RAIL_LOOK_AHEAD, floor, camera z - RAIL.z).
 */
export async function railScreenPoint(page: Page, p: { x: number; z: number }) {
  const [cx, cy, cz] = await page.evaluate(() => (window as unknown as { __hq: { camera: () => [number, number, number] } }).__hq.camera());
  const rover = (await snapshot(page)).rover;
  const { width, height } = page.viewportSize()!;
  const rig = RAIL.desktop;
  const target = [rover.x + RAIL_LOOK_AHEAD, cy - rig.y, cz - rig.z];
  const norm = (v: number[]) => v.map((c) => c / Math.hypot(...v));
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const f = norm([target[0] - cx, target[1] - cy, target[2] - cz]);
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const d = [p.x - cx, cy - rig.y - cy, p.z - cz];
  const t = Math.tan(((rig.fov / 2) * Math.PI) / 180);
  const ndc = { x: dot(d, r) / (dot(d, f) * t * (width / height)), y: dot(d, u) / (dot(d, f) * t) };
  return { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height };
}
```

In `e2e/career.spec.ts`: delete the line `import { RAIL, RAIL_LOOK_AHEAD } from "../src/experience/camera/rigs";`, delete the local `railScreenPoint` function together with its doc comment (the block starting `/**` ` * Screen position (CSS px) of a floor point on L2` through the function's closing `}`), and add `railScreenPoint` to the import list from `"./hq"`:

```ts
import { asReturningVisitor, collectErrors, expectRenderBudget, enterHQ, railScreenPoint, snapshot, waitForCameraSettle, waitForFloor, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";
```

- [ ] **Step 7: Add the UI flows to the pads spec**

In `e2e/pads.spec.ts`, replace the import lines:

```ts
import { expect, test, type Page } from "@playwright/test";
import { asReturningVisitor, collectErrors, driveTo, expectRenderBudget, padsOf, waitForFrames, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";
```

with:

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import en from "../messages/en.json";
import {
  asReturningVisitor,
  collectErrors,
  driveTo,
  expectRenderBudget,
  padsOf,
  railScreenPoint,
  waitForCameraSettle,
  waitForFloor,
  waitForFrames,
  waitForHQ,
  waitForPhase,
  waitForRoverMove,
  waitForSceneLive,
} from "./hq";
```

In the `PadWindow` type, replace `rover: { x: number; z: number };` with:

```ts
    rover: { x: number; z: number; autopilot: unknown; target: unknown };
```

Append at the end of the file:

```ts
test.describe("pad pickers", () => {
  test("the elevator pad lists every floor, Esc closes it for good, and a pick rides the elevator", async ({ page }) => {
    const errors = collectErrors(page);
    await openJourney(page);
    const lift = (await padsOf(page, "L2")).find((p) => p.kind === "elevator")!;
    const dialog = page.getByRole("dialog", { name: en.hud.pads.floorTitle });
    await driveTo(page, { x: lift.at.x + 10, z: lift.at.z });
    await driveTo(page, lift.at);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-option]")).toHaveCount(5);
    await expect(dialog.locator('[data-option="L3"]')).toContainText(en.hud.floorLabel.L3);
    await expect(dialog.locator('[data-option="L2"]')).toHaveAttribute("aria-current", "true");
    await expect(dialog.locator('[data-option="L2"]')).toBeFocused();
    await expect.poll(() => dialog.locator('[data-option="L1"] img').evaluate((img: HTMLImageElement) => (img.complete ? img.naturalWidth : 0))).toBeGreaterThan(0);
    const axe = await new AxeBuilder({ page }).include("[data-testid='pad-picker']").analyze();
    expect(axe.violations).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // Still on the pad: it stays quiet until the rover leaves.
    await waitForFrames(page, 30);
    await expect(dialog).toHaveCount(0);

    await driveTo(page, { x: lift.at.x + 10, z: lift.at.z });
    await driveTo(page, lift.at);
    await expect(dialog).toBeVisible();
    await page.keyboard.press("ArrowUp");
    await expect(dialog.locator('[data-option="L3"]')).toBeFocused();
    await page.keyboard.press("Enter");
    await waitForFloor(page, "L3");
    await expect(page.getByTestId("elevator-panel").locator('[data-floor="L3"]')).toHaveAttribute("aria-current", "true");
    // Stepping out onto the L3 elevator pad does not ask again.
    await waitForFrames(page, 30);
    await expect(dialog).toHaveCount(0);
    expect(errors).toEqual([]);
  });

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
    await expect(dialog.locator("[data-option]")).toHaveCount(teleports.length);
    await expect(dialog.locator(`[data-option="${first.year}"]`)).toHaveAttribute("aria-current", "true");
    await expect(dialog.locator(`[data-option="${first.year}"]`)).toContainText(en.hud.career.prologue);

    await dialog.locator(`[data-option="${target.year}"]`).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => beam(page)).toBeNull();
    const at = await roverAt(page);
    expect(Math.hypot(at.x - target.at.x, at.z - target.at.z)).toBeLessThan(0.5);
    await expect(page.getByTestId("year-chip")).toHaveAttribute("data-place", String(target.year));
    const drive = await page.evaluate(() => {
      const r = (window as unknown as PadWindow).__hq.rover;
      return { autopilot: r.autopilot, target: r.target };
    });
    expect(drive).toEqual({ autopilot: null, target: null });
    await waitForFrames(page, 30);
    expect(await picker(page)).toBeNull();

    // Driving works at once from the new plaza.
    await page.keyboard.down("d");
    await waitForRoverMove(page, target.at, 3);
    await page.keyboard.up("d");
    expect(errors).toEqual([]);
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("the teleport is a short fade cut that still lands on the target pad", async ({ page }) => {
      await openJourney(page);
      const teleports = (await padsOf(page, "L2")).filter((p) => p.kind === "teleport");
      const target = teleports[2];
      await driveTo(page, teleports[0].at);
      const dialog = page.getByRole("dialog", { name: en.hud.pads.yearTitle });
      await expect(dialog).toBeVisible();
      await dialog.locator(`[data-option="${target.year}"]`).click();
      await expect.poll(() => beam(page)).toBeNull();
      const at = await roverAt(page);
      expect(Math.hypot(at.x - target.at.x, at.z - target.at.z)).toBeLessThan(0.5);
      await expect(page.getByTestId("beam-fade")).toHaveClass(/opacity-0/);
    });
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test("the floor picker is a bottom sheet and a tap rides the elevator", async ({ page }) => {
      await openJourney(page);
      const lift = (await padsOf(page, "L2")).find((p) => p.kind === "elevator")!;
      await driveTo(page, { x: lift.at.x + 10, z: lift.at.z });
      await driveTo(page, lift.at);
      const dialog = page.getByRole("dialog", { name: en.hud.pads.floorTitle });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute("data-sheet", "bottom");
      const box = (await dialog.boundingBox())!;
      expect(Math.abs(box.y + box.height - 844)).toBeLessThanOrEqual(1);
      expect(box.height).toBeLessThan(844 * 0.9);
      await dialog.locator('[data-option="L1"]').tap();
      await waitForFloor(page, "L1");
      await waitForFrames(page, 30);
      await expect(dialog).toHaveCount(0);
    });
  });
});
```

- [ ] **Step 8: Typecheck, lint, build and run the specs**

Run: `bun run typecheck && bun run lint && bun run build && bun run e2e e2e/pads.spec.ts e2e/career.spec.ts`
Expected: typecheck and lint exit 0; Playwright reports every test passed (6 in `pads.spec.ts` plus the career specs).

- [ ] **Step 9: Commit**

```bash
rtk git add src/hud/pads/PadPicker.tsx src/hud/Hud.tsx tests/hud/PadPicker.test.tsx e2e/hq.ts e2e/career.spec.ts e2e/pads.spec.ts
rtk git commit -m "feat(hud): floor and year pickers for the elevator pads and L2 teleporters"
```

---
### Task 10: PR screenshots of the pads and pickers

**Files:**
- Modify: `e2e/screenshots.spec.ts` (import line, new captures)

**Interfaces:**
- Consumes: `open3DAt`, `shot`, `VIEWPORTS` (already in `screenshots.spec.ts`); `driveTo`, `padsOf` (Task 6); `PadPicker` with `testId="pad-picker"` (Task 9).
- Produces: `screenshots/hq-pad-floors-{w}x{h}.png`, `screenshots/hq-pad-years-{w}x{h}.png`, `screenshots/hq-pad-teleporter-{w}x{h}.png` for 1440x900, 1024x1366 and 390x844 (opt-in, `SCREENSHOTS=1`; also in the nightly and `screenshots`-label CI runs).

- [ ] **Step 1: Add the captures**

In `e2e/screenshots.spec.ts`, replace:

```ts
import { asReturningVisitor, waitForHQ, waitForPhase, waitForRoom } from "./hq";
```

with:

```ts
import { asReturningVisitor, driveTo, padsOf, waitForHQ, waitForPhase, waitForRoom } from "./hq";
```

Append at the end of the file:

```ts
for (const viewport of VIEWPORTS) {
  test(`3D pad pickers @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const { context, page } = await open3DAt(browser, viewport, "/en/journey");
    const pads = await padsOf(page, "L2");
    const lift = pads.find((p) => p.kind === "elevator")!;
    const teleport = pads.find((p) => p.kind === "teleport")!;
    const picker = page.getByTestId("pad-picker");

    await driveTo(page, { x: lift.at.x + 10, z: lift.at.z });
    await driveTo(page, lift.at);
    await expect(picker).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: shot("hq-pad-floors", viewport) });
    await page.keyboard.press("Escape");

    await driveTo(page, teleport.at);
    await expect(picker).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: shot("hq-pad-years", viewport) });
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);

    // The rover parked on the 2019 teleporter, with the pad glow and the floating icons.
    await page.waitForTimeout(1500);
    await page.screenshot({ path: shot("hq-pad-teleporter", viewport) });
    await context.close();
  });
}
```

- [ ] **Step 2: Capture and review**

Run: `bun run build && SCREENSHOTS=1 bunx playwright test e2e/screenshots.spec.ts -g "pad pickers" --workers=1`
Expected: `3 passed`; nine PNG files in `screenshots/` (`hq-pad-floors-*`, `hq-pad-years-*`, `hq-pad-teleporter-*`).

Open every file and check: the floor list shows five rows with thumbnails, names and descriptions, "You are here" on L2; the year list shows every year with the prologue note on the first; on 390x844 both pickers are bottom sheets; the teleporter shot shows the pink pad ring with its icon beside the road and the cyan elevator pad is not covering any road marking or door pad. `screenshots/` is gitignored, so nothing is committed from it.

- [ ] **Step 3: Commit**

```bash
rtk git add e2e/screenshots.spec.ts
rtk git commit -m "test(e2e): screenshots of the floor pads and pickers"
```

---

### Task 11: Docs, full verification and the PR

**Files:**
- Modify: `AGENTS.md` (folder layout, 3D experience, store additions, `window.__hq`, space rules, scripts)
- Modify: `README.md` (Try it, L2 paragraph, scripts table, structure)

**Interfaces:**
- Consumes: everything above.
- Produces: the documented feature and an open PR (label `screenshots`).

- [ ] **Step 1: Update AGENTS.md**

Make these edits (no em dashes):

1. In the folder layout, after the line starting `public/cv/pages/                CV page images for the in-site viewer` add:

```
public/floors/                  elevator picker thumbnails (320 x 180 webp, one per floor), output of `bun run floor:thumbs`, committed
```

2. After the line starting `  cv-pages.ts                   ` add:

```
  floor-thumbs.ts               `floor:thumbs` step 2: converts the "floor thumbnail" captures (e2e/screenshots.spec.ts) into public/floors/*.webp (needs webp)
```

3. Replace the line

```
  experience/nav/               pure navigation: navgrid, collision, doors; road.ts (road kit, pathBetween, roadRoute), roadGeometry.ts (road mesh data), space.ts (space rules)
```

with

```
  experience/nav/               pure navigation: navgrid, collision, doors; road.ts (road kit, pathBetween, roadRoute), roadGeometry.ts (road mesh data), space.ts (space rules, pad rules); pads.ts (floor pads, the pad latch), teleport.ts (L2 teleport beam timeline)
```

4. After the line starting `  experience/fx/HoloIcon.tsx    ` add:

```
  experience/fx/PadGlow.tsx     floor pads: one instanced glow per floor plus a neon icon per kind (PAD_ICONS); a click opens the picker. TeleportBeam.tsx draws the beam
```

5. After the line starting `  hud/walk/                     ` add:

```
  hud/pads/                     floor pad pickers: PadPicker (floor and year lists on the shared Modal, a bottom sheet on phones), BeamFade; pure picker.ts (options, roving focus, floorThumb)
```

6. Insert a new bullet in "3D experience" immediately before the bullet that starts `- L3 Project Roads (\`floors/labs/layout.ts\``:

```
- Floor pads (owner request, `nav/pads.ts`): `FloorLayout.pads` (`PadTrigger`: `id`, `kind` `elevator` | `teleport`, `at`, `radius` (default `PAD.radius`, 1.4 u), `year`, icon `face`). Every floor has an elevator call pad on its `approach` (3 u in front of the shaft door, so it follows the door constants; added by `buildFloorLayouts`), and L2 has a teleporter on every year plaza (`CAREER_ROAD.teleport`: 3.5 u past the plaza start, 6.5 u south of the road center; `CareerYear.teleport`). Pads are not obstacles. The Director runs the door latch over pads (`stepPadLatch`: stop or slow on a pad, or stay `PAD.dwell` 0.6 s on a fast pass; primed on deep links, resumes and elevator arrivals so a rover standing on a pad never opens it) and sets `store.picker` (`{ kind: "floor" }` or `{ kind: "year", from }`); clicking a pad on the current floor opens it without driving (`PadGlow`). `PadPicker` (`src/hud/pads/`) lists the floors (names from `hud.floorLabel`, like the elevator panel, which stays; `hud.pads.floorDesc`; thumbnails `public/floors/{id}.webp`) or the years (rooms, organizations, the prologue on the first year) on the shared `Modal` with `sheet` (bottom sheet on phones); arrows, Home and End move, Enter picks, Esc closes. A floor emits the panel's `elevator` intent; a year emits `{ type: "teleport", pad }`: the Director cancels any mission, path and autopilot, runs the beam (`nav/teleport.ts`: 0.3 s rise, jump, 0.3 s fade; reduced motion: the 150 ms fade cut with `BeamFade`), sets `roverRuntime.cameraSnap` so the camera cuts, and leaves the target pad latched. Pads pass `padViolations` (`nav/space.ts`, `SpaceInput.pads`, `expectPadRules`): inside the slab, the rover radius clear of obstacles, off door pads and spurs, off a road's driving width except at a dead end (the elevator approach), and reachable through 6 u wide floor. After a large floor change, regenerate the thumbnails with `bun run build && bun run floor:thumbs` (needs `cwebp`).
```

7. In the "Store additions beyond appendix 06" bullet, replace

```
`readme` (README view in the drawer); actions `openRoom(room, tab?)`,
```

with

```
`readme` (README view in the drawer), `picker` (floor pad picker) and `beam` (L2 teleport beam); actions `openPicker(picker)` (explore only, no ride or beam), `closePicker()`, `setBeam(beam)`, `openRoom(room, tab?)`,
```

and in the same bullet replace `` `beep` when the rover opens the terminal, `` with `` `beep` when the rover opens the terminal or a pad picker, `whoosh` on a teleport, ``.

8. Replace

```
- `window.__hq` exposes `{ store, rover }` for Playwright.
```

with

```
- `window.__hq` exposes `{ store, rover, layouts }` for Playwright (`layouts` carries the floor pads; e2e drives with `driveTo` and reads pads with `padsOf` from `e2e/hq.ts`).
```

9. At the end of the "Space rules (`src/experience/nav/space.ts`" bullet (after `and 6 u wide floor connects the start to within 4 u of every pad.`), append:

```
 Layouts with floor pads pass them as `pads` (the pad rules, see "Floor pads" under "3D experience").
```

10. In the Workflow bullet `- Package manager: Bun. Scripts: ...`, replace `` `serve`, `validate:content`. `` with `` `serve`, `validate:content`, `floor:thumbs`. ``.

11. In the e2e list line of the folder layout (`e2e/                            Playwright: ...`), add `floor pads and pickers (pads.spec.ts), ` right after `guided walks (walk.spec.ts: the L3 tour by default, other walks with ?walk=on), `.

- [ ] **Step 2: Update README.md**

1. In "Try it", replace

```
the mouse wheel or PageUp/PageDown.
```

with

```
the mouse wheel or PageUp/PageDown. Every floor also has a glowing call pad in front of the elevator door: stop on it (or click it) and pick a floor from a list with previews.
```

2. In the L2 paragraph (starts `On L2 (\`/en/journey\`) one road runs forward in time:`), after the sentence ending `and the Workshop annex at the end.` add:

```
 Every year plaza has a teleporter pad beside the road: stop on it (or click it) and pick a year to beam straight to that plaza.
```

3. In the Scripts table, after the `bun run validate:content` row add:

```
| `bun run floor:thumbs` | Captures every floor from its start spot (after a build) and writes the elevator picker thumbnails `public/floors/*.webp` (needs `cwebp`) |
```

4. In Structure, replace `scripts/      static server, e2e planning, content validator, CV page renderer (cv:pages)` with `scripts/      static server, e2e planning, content validator, CV page renderer (cv:pages), floor thumbnails (floor:thumbs)`.

- [ ] **Step 3: Check every changed text file for em dashes**

Run: `git --no-pager diff --name-only origin/main -- '*.ts' '*.tsx' '*.json' '*.md' | xargs perl -CSD -ne 'print "$ARGV:$.: $_" if /\x{2014}/; close ARGV if eof'`
Expected: no output.

- [ ] **Step 4: Commit the docs**

```bash
rtk git add AGENTS.md README.md
rtk git commit -m "docs: floor pads, pickers, teleporters and floor:thumbs"
```

- [ ] **Step 5: Rebase on main and resolve coordination conflicts**

Run: `rtk git fetch origin && rtk git rebase origin/main`
Expected: a clean rebase. If `src/hud/Hud.tsx` conflicts with the parallel HUD session, keep their version of the file and re-add only the `BeamFade`/`PadPicker` import and the two mount lines from Task 9 Step 4. If their L1 alignment fix changed `standard()` door constants or `LOBBY`, keep their values: the L1 pad follows `layout.approach`, and `tests/unit/floor-pads.test.ts` still asserts it sits 3 u in front of the door.

- [ ] **Step 6: Quick verification**

Run: `bun run verify:quick`
Expected: typecheck, lint, every Vitest file and `next build` pass (no em dash, copy alignment, fonts, safety and e2e-plan failures).

- [ ] **Step 7: Full e2e (this change touches `e2e/hq.ts` and `package.json`)**

Run: `bun run e2e:full`
Expected: the whole suite passes, including `pads.spec.ts` and every `expectRenderBudget` check (each floor under 150 draw calls and 30k triangles with the pads mounted). Fix any failure before continuing; do not add retries.

- [ ] **Step 8: Push and open the PR**

```bash
rtk git push -u origin feat/elevator-pads-teleporters
gh pr create --title "Elevator call pads on every floor and L2 year teleporters" --label screenshots --body "$(cat <<'EOF'
## What

- A glowing call pad in front of the elevator door on every floor (L1, L2, L3, L4, RF). Stop on it or click it to open a floor picker: each floor with its elevator name (L1 Home, L2 Journey, L3 Work, L4 Writing, RF About), a one-line description and a preview thumbnail; the current floor is marked. Picking a floor rides the elevator exactly like the right-side buttons, which stay.
- A teleporter pad on every L2 year plaza (2019 to 2026, the 2016 prologue noted on 2019). Stop on it or click it to open a year picker; picking a year beams the rover to that plaza's pad (0.3 s rise and 0.3 s fade, a 150 ms fade cut with reduced motion), the camera cuts with it, and any mission leg, drive or autopilot is cancelled.
- One shared pad component (instanced glow plus neon icons) on the door latch (opens once, re-arms after leaving), and one shared picker on the site Modal (arrows, Home, End, Enter, Esc, focus trap, bottom sheet on phones).
- Pad space rules (`padViolations`): pads stay off roads (except the elevator approach dead end), door pads and spurs, keep the rover radius clear of obstacles and are reachable through 6 u wide floor. Real layouts pass them.

## Tests

- Unit: pad model and latch, pad space rules, real floor layouts, Career Road teleporters, beam timeline, store, picker options, Modal sheet, PadPicker (keyboard, Esc, ID copy, reduced-motion fade), thumbnails, e2e plan.
- e2e (`pads.spec.ts`): deep link stays quiet on the pad, stop on the pad opens the floor picker, Esc closes for good until the rover leaves, a pick rides the elevator, click on a teleporter opens the year picker without driving, a pick beams the rover to the year plaza (year chip, camera cut, autopilot cleared), reduced motion, phone bottom sheet, axe, render budget.
- `bun run verify:quick` and `bun run e2e:full` pass locally.

## Screenshots

Labelled `screenshots`: the Screenshots workflow attaches `hq-pad-floors-*`, `hq-pad-years-*` and `hq-pad-teleporter-*` at 1440x900, 1024x1366 and 390x844.

## Notes

- The L1 pad is placed from the elevator door constants (`layout.approach`, 3 u in front of the door), so it follows the Lobby alignment fix in the parallel HUD session. `Hud.tsx` only gains one import and two mount lines.
- Thumbnails are committed renders (`bun run floor:thumbs`, 320 x 180 webp, at most 16 KB each) and load only when the picker opens.
EOF
)"
```

Expected: the PR URL is printed; CI starts (check, build, 4 e2e shards, Lighthouse CI) and the Screenshots workflow runs because of the label. Wait for `Build, CV and e2e` and `Lighthouse CI` to go green; do not merge (the owner merges).

---

## Self-Review

**1. Spec coverage**

| Requirement | Task |
|---|---|
| Circle pad in front of the elevator door on every floor (L1, L2, L3, L4, RF) | Task 3 (`elevatorPad` at `approach` in `buildFloorLayouts`), Task 5 (glow and icon) |
| Driving onto it (or clicking/tapping) opens a floor-picker modal | Task 1 (latch), Task 6 (Director), Task 5 (`PadGlow` click), Task 9 (UI) |
| Floor names like the elevator buttons, one-line description, EN/ID | Task 7 (`hud.floorLabel`, `hud.pads.floorDesc`), Task 9 |
| Small preview thumbnail per floor, small weight | Task 8 (320 x 180 webp, at most 16 KB, lazy) |
| Current floor marked | Task 7 (`current`), Task 9 (`aria-current`, "You are here", focused first) |
| Choosing a floor rides like the right-side buttons; buttons stay | Task 9 (`elevator` intent; `ElevatorPanel` untouched) |
| Teleporter at every L2 year plaza, all content years, prologue folded into 2019 | Task 3 (`CareerYear.teleport`, `pads`), Task 7 (`yearOptions` prologue), Task 9 |
| Year picker; beam to the year plaza pad; short beam; reduced motion instant fade | Task 4 (`nav/teleport.ts`), Task 5 (`TeleportBeam`), Task 6 (Director), Task 9 (`BeamFade`) |
| Camera follows; walks, missions, deep links unaffected; teleport cancels autopilot | Task 6 (camera cut, priming on deep links and arrivals, mission cancel, autopilot cleared), Task 9 e2e |
| One shared pad component and latch (opens once, re-arms after leaving) | Task 1 (`stepPadLatch` on `stepDoorLatch`), Task 5 (`PadGlow`) |
| One shared picker: arrows, Enter, Esc, focus trap, aria, mobile bottom sheet | Task 7 (`Modal` `sheet`, `nextIndex`), Task 9 (`PickerList`) |
| Space rules; do not block roads or doors | Task 2 (`padViolations`), Task 3 (real layouts pass) |
| Render budgets | Task 5 (1 glow call per floor, 1 to 2 icon calls per kind, beam only while beaming), Task 6 and Task 11 e2e budgets |
| Coordination with the HUD polish session | Global Constraints, Task 3 (L1 pad from `approach`), Task 9 Step 4, Task 11 Step 5 |
| Unit tests, e2e, screenshots, README/docs, PR | Tasks 1 to 9 (tests), Task 6 and 9 (e2e), Task 10 (screenshots), Task 11 (docs, PR) |

No gaps found.

**2. Placeholder scan:** no "TBD", "TODO", "implement later" or "similar to Task N"; every code step has complete code, every run step has a command and an expected result.

**3. Type consistency:** `PadTrigger` (`id`, `kind`, `at`, `radius?`, `year?`, `face`), `PickerRequest` (`{ kind: "floor" } | { kind: "year"; from }`), `Beam` (`pad`, `from`, `to`, `heading`, `t`, `jumped`), `stepPadLatch(latch, pads, pose, { riding, explore, following, now, speed })`, `primedPadLatch(pads, p)`, `pickerFor(pad)`, `teleportPadId(year)`, `elevatorPad(layout, face)`, store `openPicker`, `closePicker`, `setBeam`, `picker`, `beam`, intent `{ type: "teleport"; pad }`, `floorOptions(current, label, describe)`, `yearOptions(career, current, rooms, prologue)`, `nextIndex(index, key, count)`, `floorThumb(floor)`, e2e `padsOf(page, floor)`, `driveTo(page, point)`, `railScreenPoint(page, p)` and Modal `testId="pad-picker"` with `data-option` are used with the same names and shapes in every task.
