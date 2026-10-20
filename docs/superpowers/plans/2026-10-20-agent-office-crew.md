# Agent Office revamp A: living crew Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: planned (2026-10-20); look approved by the owner 2026-10-20 (thought trail only, beacon 1.6 u wide, slim LED-lane
tower, the done spin ending on the camera, no debug labels in captures); coding waits on the office enhancement PR.

**Goal:** The five office Rovers act out their real states with their bodies (sparks, a thought trail, CI pacing, a raised flag,
a victory spin, a slump with a red flicker, docking to charge), a beacon over the wing and a minimap cue show from
anywhere in the Lobby when Kurniadi is needed, and the drawer reads the crew aloud.

**Architecture:** A pure choreography module (`crew.ts`) turns each desk's state into a blended pose and an fx record;
thin writers add instances to the existing parts and glow meshes and one flag cell to the atlas (no new draw call in
the scene chunk). A tiny main-path signal and watch (`officeSignal.ts`, `officeWatch.ts`) drive a one-mesh beacon on
the hall's stage program and a minimap cue, without loading the office chunk. The CI tower and ship dock arrive as
furniture shell (stage B lights them fully).

**Tech Stack:** Next.js 16 static export, React 19, react-three-fiber, three.js, Zustand (`useHQStore`), Vitest, Playwright, Bun.

Design: [`2026-10-20-agent-office-revamp-design.md`](../specs/2026-10-20-agent-office-revamp-design.md) sections 5, 8 to 11.

## Global Constraints

- No em dashes (U+2014) anywhere: code, comments, docs, commits, PR text.
- Bun only; `rtk` for git. Conventional commits.
- Every user-facing string `{ en, id }` / `messages/en.json` and `messages/id.json` with identical keys.
- No new shader program on L1 (`e2e/perf/baseline.json` unchanged for L1); `useDispose` after every memoized geometry,
  texture or material; animate with `useFrame` deltas only.
- Never import the office scene or body modules statically from the `Experience.tsx` closure
  (`tests/unit/office-chunk-graph.test.ts`).
- L1 under 125 scene draw calls on both tiers; office scene chunk and main path re-set by measured plus 0.6 KB; new
  `BYTES_3D_BUDGET.officeTotal` 40 KB (scene plus body plus, later, replay).
- Reduced motion: every state holds a readable still pose; nothing flashes more than 3 times per second.
- Privacy (office D3): no new data fields; the watch reads only `enabled`, `desks[].state` and `github[]` kind, status and `at`.
- Wait on state, never on time, in e2e (`e2e/hq.ts` helpers).

## File structure

| File | Responsibility |
|---|---|
| `src/experience/floors/lobby/office/crew.ts` (new, scene chunk) | Pure choreography: look yaws, per-state target pose, blend, fx record, spark, thought trail and confetti positions |
| `src/experience/floors/lobby/office/crewFx.ts` (new, scene chunk) | Writes crew glow instances and the crew glow key; tower lane dots |
| `src/experience/floors/lobby/office/officeVisual.ts` | `OfficePose` gains `x`, `z`, `yaw`, `flag`, `wave`; failed still pose deepens |
| `src/experience/floors/lobby/office/officeRig.ts` | `roverFrame` applies the offsets; `writeRover` writes the flag pole; `writeFlag` quad; `writeGlow` gain |
| `src/experience/floors/lobby/office/officeFrame.ts` | `RoverWrites.pose` compares the new fields |
| `src/experience/floors/lobby/office/officeAtlas.ts` | The flag cell |
| `src/experience/floors/lobby/office/OfficeScene.tsx` | Actors per desk, wiring, probes, feeding the main-path signal |
| `src/experience/floors/lobby/officeLayout.ts` | `officeTower(w)`, `officeDock(w)`, obstacles, look anchor |
| `src/experience/floors/lobby/officeShell.ts` | Shell boxes for the tower and dock |
| `src/experience/floors/lobby/office/officeSignal.ts` (new, main path) | Shared `needsKurniadi` / `deployFlash` / `sceneFeeding` store |
| `src/experience/floors/lobby/office/officeWatch.ts` (new, main path) | Minimal v1 fetch loop while on L1 |
| `src/experience/floors/lobby/office/beacon.ts` (new, main path, pure) | Beacon instance layout over time |
| `src/experience/floors/lobby/office/OfficeBeacon.tsx` (new, main path) | One stage-material cylinder mesh |
| `src/hud/minimap/OfficeCue.tsx` (new) + `MapLayers.tsx`, `Minimap.tsx` | Minimap cue and label |
| `src/experience/floors/lobby/office/crewSummary.ts` (new, body chunk) + `OfficeBody.tsx` | Screen-reader crew summary |
| `messages/en.json`, `messages/id.json` | `office.3d.crew.*`, `hud.map.officeAsks` |
| tests | `office-crew`, `office-crew-fx`, `office-signal`, `office-watch`, `office-beacon`, `office-beacon-view`, `office-crew-summary`, updated `office-rig`, `office-frame`, `office-visual`, `lobby-office`, `office-chip-placement`, `minimap-model`, jsdom `OfficeCue`, `OfficeBody`, e2e `office.spec.ts` |

---

### Task 0: Start from main after the enhancement PR

- [ ] **Step 1:** Confirm the office enhancement PR (privacy sentence removed, higher wall, more console to wall space) is merged: `gh pr list -R ShinyQ/ShinyQ-HQ --state merged --search "office in:title" --limit 5`.
- [ ] **Step 2:** Rebase this branch: `rtk git fetch origin && rtk git rebase origin/main`, then `bun install`.
- [ ] **Step 3:** Re-read `OFFICE.wall` and `OFFICE_WING` (the new wall height and console offsets); every number below that names the wall top or the Rover radius is read from those constants in code, never copied.
- [ ] **Step 4:** Baseline: `bun run verify:quick` passes before any change.

### Task 1: Crew choreography (pure)

**Files:**
- Create: `src/experience/floors/lobby/office/crew.ts`
- Modify: `src/experience/floors/lobby/office/officeVisual.ts` (pose fields, failed still pose)
- Test: `tests/unit/office-crew.test.ts`, update `tests/unit/office-visual.test.ts`

**Interfaces:**
- Produces: `OfficePose` with `x, z, yaw, flag, wave` (all 0 at rest); `CREW`; `lookYaw(slot, target, clamp)`;
  `crewTarget(state, t, phase, reduced, look, spin)`; `newActor(state)`; `stepCrew(actor, state, dt, phase, reduced, look)`;
  `crewFx(actor, reduced)`; `sparkAt`, `trailAt`, `confettiAt` (Rover-local positions); `CrewLook = { camera: number; tower: number }`.

- [ ] **Step 1: Extend the pose type.** In `officeVisual.ts` change `OfficePose` and `REST`, and deepen the failed slump:

```ts
/** ... plus offsets along the Rover's own axes (x across, z forward toward the desk), a turn (yaw) on top of the desk heading, the flag (0 lowered to 1 raised) and its wave angle. */
export interface OfficePose {
  y: number;
  rx: number;
  ry: number;
  rz: number;
  armL: number;
  armR: number;
  tipScale: number;
  x: number;
  z: number;
  yaw: number;
  flag: number;
  wave: number;
}

const REST: OfficePose = { y: 0, rx: 0, ry: 0, rz: 0, armL: 0, armR: 0, tipScale: 1, x: 0, z: 0, yaw: 0, flag: 0, wave: 0 };
```

and in `stillPose`:

```ts
    case "failed":
      return { ...REST, y: -0.08, rx: 0.3, armL: 0.35, armR: 0.35 };
```

`poseChanged` compares the five new fields too:

```ts
  return a.y !== b.y || a.rx !== b.rx || a.ry !== b.ry || a.rz !== b.rz || a.armL !== b.armL || a.armR !== b.armR || a.tipScale !== b.tipScale || a.x !== b.x || a.z !== b.z || a.yaw !== b.yaw || a.flag !== b.flag || a.wave !== b.wave;
```

- [ ] **Step 2: Write the failing tests** `tests/unit/office-crew.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { OFFICE_STATES, type OfficeState } from "@/lib/office/protocol";
import { LOBBY } from "@/experience/config";
import { officeSlots } from "@/experience/floors/lobby/officeLayout";
import { CREW, crewFx, crewTarget, lookYaw, newActor, stepCrew, sparkAt, type CrewLook } from "@/experience/floors/lobby/office/crew";
import { stillPose } from "@/experience/floors/lobby/office/officeVisual";

const LOOK: CrewLook = { camera: 0.4, tower: -0.7 };
const run = (from: OfficeState, to: OfficeState, seconds: number, reduced = false, dt = 1 / 60) => {
  const a = newActor(from);
  for (let t = 0; t < 2; t += dt) stepCrew(a, from, dt, 0.4, reduced, LOOK);
  const out = [] as number[];
  for (let t = 0; t < seconds; t += dt) out.push(stepCrew(a, to, dt, 0.4, reduced, LOOK).yaw);
  return { a, yaws: out };
};

describe("crew targets", () => {
  it("turns to the tower on ci, to the camera on input, rests otherwise", () => {
    expect(crewTarget("ci", 5, 0, true, LOOK, 0).yaw).toBe(LOOK.tower);
    expect(crewTarget("input", 5, 0, true, LOOK, 0)).toMatchObject({ yaw: LOOK.camera, flag: 1 });
    for (const s of ["working", "thinking", "reviewing", "testing", "asleep", "failed"] as const) expect(crewTarget(s, 5, 0, true, LOOK, 0).yaw).toBe(0);
  });
  it("docks back and down when asleep, paces only in full motion", () => {
    expect(crewTarget("asleep", 1, 0, false, LOOK, 0)).toMatchObject({ z: -CREW.dock.back });
    expect(crewTarget("ci", 1.3, 0, true, LOOK, 0).x).toBe(0);
    const xs = Array.from({ length: 50 }, (_, i) => crewTarget("ci", i * 0.1, 0, false, LOOK, 0).x);
    expect(Math.max(...xs)).toBeCloseTo(CREW.pace.amp, 1);
  });
  it("spins one full turn and ends facing the camera (owner)", () => {
    expect(crewTarget("done", 0, 0, false, LOOK, 0.5).yaw).toBeCloseTo(LOOK.camera + Math.PI, 5);
    expect(crewTarget("done", 0, 0, false, LOOK, 1).yaw).toBe(LOOK.camera);
    expect(crewTarget("done", 0, 0, true, LOOK, 0).yaw).toBe(LOOK.camera);
  });
});

describe("blending", () => {
  it("never turns faster than the turn rate and settles", () => {
    const { a, yaws } = run("ci", "input", 1.5);
    const steps = yaws.slice(1).map((y, i) => Math.abs(y - yaws[i]) * 60);
    expect(Math.max(...steps)).toBeLessThanOrEqual(CREW.turnRate * 1.6);
    expect(a.pose.yaw).toBeCloseTo(LOOK.camera, 5);
  });
  it("retargets mid-blend from the blended pose (no jump)", () => {
    const a = newActor("working");
    for (let i = 0; i < 10; i++) stepCrew(a, "ci", 1 / 60, 0, false, LOOK);
    const before = a.pose.yaw;
    const after = stepCrew(a, "input", 1 / 60, 0, false, LOOK).yaw;
    expect(Math.abs(after - before)).toBeLessThan(0.1);
  });
  it("cuts under reduced motion and holds still", () => {
    const a = newActor("working");
    const p1 = { ...stepCrew(a, "input", 1 / 60, 0, true, LOOK) };
    const p2 = { ...stepCrew(a, "input", 1, 0, true, LOOK) };
    expect(p1).toEqual(p2);
    expect(p1.yaw).toBe(LOOK.camera);
  });
  it("is deterministic", () => {
    expect(run("asleep", "done", 2).yaws).toEqual(run("asleep", "done", 2).yaws);
  });
});

describe("fx", () => {
  it("lights the right effects per state", () => {
    const fx = (s: OfficeState, reduced = false) => {
      const a = newActor(s);
      for (let i = 0; i < 120; i++) stepCrew(a, s, 1 / 60, 0, reduced, LOOK);
      return crewFx(a, reduced);
    };
    expect(fx("working").sparks).toBeGreaterThan(0);
    expect(fx("thinking").trail).toBe(1);
    expect(fx("working").trail).toBe(0);
    expect(fx("asleep").deskLight).toBeCloseTo(0.1);
    expect(fx("working").deskLight).toBe(1);
    expect(fx("failed", true).flicker).toBe(1);
  });
  it("sparks stay over the desk between the hands", () => {
    const o = { x: 0, y: 0, z: 0, a: 0 };
    for (let t = 0; t < 3; t += 0.05) for (let i = 0; i < 5; i++) {
      sparkAt(i, t, 0.4, false, o);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(0.45);
      expect(o.y).toBeGreaterThanOrEqual(1.1);
      expect(o.y).toBeLessThanOrEqual(1.6);
    }
  });
  it("never flashes more than 3 times a second when failed", () => {
    const a = newActor("failed");
    let flips = 0;
    let prev = crewFx(a, false).flicker;
    for (let i = 0; i < 600; i++) {
      stepCrew(a, "failed", 1 / 60, 0, false, LOOK);
      const f = crewFx(a, false).flicker;
      if (f !== prev && f > prev) flips++;
      prev = f;
    }
    expect(flips / 10).toBeLessThanOrEqual(3);
  });
});

describe("look and room", () => {
  const slots = officeSlots(LOBBY.officeWing);
  it("clamps the camera turn to 70 degrees", () => {
    const behind = { x: slots[0].rover.x - Math.sin(slots[0].yaw) * 10, z: slots[0].rover.z - Math.cos(slots[0].yaw) * 10 };
    expect(Math.abs(lookYaw(slots[0], behind, CREW.cameraClamp))).toBeCloseTo(CREW.cameraClamp, 5);
  });
  it("every state has a still pose", () => {
    for (const s of OFFICE_STATES) expect(stillPose(s)).toBeDefined();
  });
});
```

- [ ] **Step 3:** Run `bun run test tests/unit/office-crew.test.ts`; expect FAIL (module not found).

- [ ] **Step 4: Implement `crew.ts`:**

```ts
import type { OfficeState } from "@/lib/office/protocol";
import type { Vec2 } from "../../../types";
import type { OfficeSlot } from "../officeLayout";
import { pose, stillPose, type OfficePose } from "./officeVisual";

/**
 * The living crew (design 2026-10-20 section 5): each desk's Rover acts out its state with its body. Pure: an actor
 * per desk, stepped by frame deltas; every motion is a function of the actor's state clock and the slot phase, so the
 * same steps give the same poses. Under reduced motion every pose is a held still pose and a state change cuts.
 */
export const CREW = {
  /** Shortest blend between two states (s); longer when the turn would exceed `turnRate`. */
  blend: 0.35,
  turnRate: 3,
  cameraClamp: (70 * Math.PI) / 180,
  workPitch: 0.12,
  pace: { amp: 0.4, hz: 0.2 },
  dock: { back: 0.35, drop: 0.06 },
  spin: { s: 0.9, hop: 0.3 },
  /** Two short bursts every period (s): at most 2 flashes in 3 s. */
  flicker: { period: 3, on: [[0, 0.12], [0.25, 0.37]] as const },
  charge: { hz: 0.2, lo: 0.3, hi: 0.6, still: 0.45 },
  confetti: 1.2,
  wave: { hz: 1.2, amp: 0.35 },
} as const;

/** Yaw offsets (radians, on top of the desk heading) toward the camera and the CI tower. */
export interface CrewLook {
  camera: number;
  tower: number;
}

export interface CrewActor {
  state: OfficeState;
  /** Seconds in the current state. */
  t: number;
  from: OfficePose;
  blendFor: number;
  pose: OfficePose;
}

export interface CrewFx {
  /** 0 to 1: how many of the 5 sparks show (0 none). */
  sparks: number;
  trail: number;
  /** Confetti burst progress 0 to 1, -1 when none. */
  confetti: number;
  /** Halo and antenna tip gain (1 steady). */
  flicker: number;
  /** Charge pad level (0 none). */
  charge: number;
  /** Desk light level 0 to 1. */
  deskLight: number;
}

const TAU = Math.PI * 2;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => x * x * (3 - 2 * x);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const hash = (n: number) => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

/** Turn (radians, on top of the slot's heading) that faces `target`, clamped to `clamp` either side. */
export function lookYaw(slot: OfficeSlot, target: Vec2, clamp = Math.PI): number {
  const want = Math.atan2(target.x - slot.rover.x, target.z - slot.rover.z);
  const d = wrap(want - slot.yaw);
  return Math.max(-clamp, Math.min(clamp, d));
}

/** The pose a state aims for at its local time `t`; `spin` is the victory spin's progress (0 to 1). */
export function crewTarget(state: OfficeState, t: number, phase: number, reduced: boolean, look: CrewLook, spin: number): OfficePose {
  const p = pose(state, t, phase, reduced);
  switch (state) {
    case "working":
      p.rx += CREW.workPitch;
      break;
    case "ci":
      p.yaw = look.tower;
      if (!reduced) p.x = Math.sin(t * TAU * CREW.pace.hz + phase) * CREW.pace.amp;
      break;
    case "input":
      p.yaw = look.camera;
      p.flag = 1;
      p.wave = reduced ? 0 : Math.sin(t * TAU * CREW.wave.hz + phase) * CREW.wave.amp;
      break;
    case "done":
      // The spin ends facing the camera, so the happy face reads (owner decision 2026-10-20).
      p.yaw = look.camera;
      if (spin > 0 && spin < 1) {
        p.yaw += TAU * smooth(spin);
        p.y += CREW.spin.hop * Math.sin(Math.PI * spin);
      }
      break;
    case "asleep":
      p.z = -CREW.dock.back;
      p.y -= CREW.dock.drop;
      break;
    default:
      break;
  }
  return p;
}

export function newActor(state: OfficeState): CrewActor {
  const p = { ...stillPose(state) };
  return { state, t: 1e3, from: { ...p }, blendFor: 0, pose: p };
}

function mix(a: OfficePose, b: OfficePose, w: number, out: OfficePose): void {
  for (const k of Object.keys(out) as (keyof OfficePose)[]) out[k] = a[k] + (b[k] - a[k]) * w;
}

const spinOf = (a: CrewActor, reduced: boolean) => (a.state === "done" && !reduced ? clamp01((a.t - a.blendFor) / CREW.spin.s) : 0);

/** Advances the actor by `dt` toward `state`; returns its pose (the same object every call). */
export function stepCrew(a: CrewActor, state: OfficeState, dt: number, phase: number, reduced: boolean, look: CrewLook): OfficePose {
  if (state !== a.state) {
    const aim = crewTarget(state, 0, phase, reduced, look, 0);
    a.from = { ...a.pose };
    a.blendFor = reduced ? 0 : Math.max(CREW.blend, Math.abs(wrap(aim.yaw - a.pose.yaw)) / CREW.turnRate);
    a.state = state;
    a.t = 0;
  } else {
    a.t += dt;
  }
  const target = crewTarget(state, a.t, phase, reduced, look, spinOf(a, reduced));
  const w = a.blendFor <= 0 ? 1 : smooth(clamp01(a.t / a.blendFor));
  if (w >= 1) Object.assign(a.pose, target);
  else mix(a.from, target, w, a.pose);
  return a.pose;
}

/** The actor's effects now (read by `crewFx.ts`). */
export function crewFx(a: CrewActor, reduced: boolean): CrewFx {
  const s = a.state;
  const t = a.t;
  const spinEnd = a.blendFor + CREW.spin.s;
  const confetti = s === "done" ? (reduced ? -1 : t < a.blendFor || t > spinEnd + CREW.confetti ? -1 : clamp01((t - a.blendFor) / (CREW.spin.s + CREW.confetti))) : -1;
  let flicker = 1;
  if (s === "failed" && !reduced) {
    const k = t % CREW.flicker.period;
    flicker = CREW.flicker.on.some(([on, off]) => k >= on && k < off) ? 1.8 : 0.55;
  }
  const charge = s !== "asleep" ? 0 : reduced ? CREW.charge.still : CREW.charge.lo + (CREW.charge.hi - CREW.charge.lo) * (0.5 + 0.5 * Math.sin(t * TAU * CREW.charge.hz));
  return {
    sparks: s === "working" ? (reduced ? 0.6 : 1) : 0,
    trail: s === "thinking" ? 1 : 0,
    confetti,
    flicker,
    charge,
    deskLight: s === "asleep" ? 0.1 : 1,
  };
}

export interface FxPoint {
  x: number;
  y: number;
  z: number;
  a: number;
}

/** Spark `i` (0 to 4) in the Rover's frame: pops 0.2 to 0.6 u over the keys between the hands, living 0.3 s. Reduced motion: three fixed sparks. */
export function sparkAt(i: number, t: number, phase: number, reduced: boolean, o: FxPoint): FxPoint {
  if (reduced) {
    o.x = (i - 1) * 0.3;
    o.y = 1.3;
    o.z = 0.9;
    o.a = i < 3 ? 1 : 0;
    return o;
  }
  const cycle = t / 0.6 + hash(i + phase);
  const life = cycle - Math.floor(cycle);
  const k = Math.floor(cycle);
  o.x = (hash(k * 7 + i * 13 + phase) - 0.5) * 0.9;
  o.y = 1.15 + clamp01(life / 0.5) * 0.4;
  o.z = 0.9;
  o.a = life < 0.5 ? 1 - life / 0.5 : 0;
  return o;
}

/** Thought trail dot `j` (0 to 2), rising from the tip, sizes 0.08, 0.12 and 0.18 u. */
export const TRAIL_SIZE = [0.08, 0.12, 0.18] as const;
export function trailAt(j: number, t: number, reduced: boolean, o: FxPoint): FxPoint {
  o.x = 0.35 + j * 0.12;
  o.y = 2.55 + (j + 1) * 0.22 + (reduced ? 0 : Math.sin(t * 2.4 + j) * 0.04);
  o.z = -0.1;
  o.a = 1;
  return o;
}

/** Confetti dot `j` (0 to 5) at burst progress `u`. */
export function confettiAt(j: number, u: number, o: FxPoint): FxPoint {
  const a = (j / 6) * TAU;
  o.x = Math.cos(a) * u * 1.2;
  o.y = 1.9 + u * 0.9 - u * u * 0.6;
  o.z = Math.sin(a) * u * 1.2;
  o.a = 1 - u;
  return o;
}
```

- [ ] **Step 5:** Run `bun run test tests/unit/office-crew.test.ts tests/unit/office-visual.test.ts`; fix `office-visual` expectations that pinned the old failed pose or the old `REST` keys (add the five zero fields). Expected: PASS.
- [ ] **Step 6:** Commit: `rtk git add -A && rtk git commit -m "feat(office): crew choreography model (living crew, part A)"`.

### Task 2: Rig, frame and atlas plumbing (flag, offsets, gain)

**Files:**
- Modify: `officeRig.ts`, `officeFrame.ts`, `officeAtlas.ts`
- Test: `tests/unit/office-rig.test.ts`, `tests/unit/office-frame.test.ts`, `tests/unit/office-atlas.test.ts`

**Interfaces:**
- Consumes: `OfficePose` (Task 1).
- Produces: `PARTS_PER_ROVER = 6` (the flag pole is part 5); `writeFlag(frame, p, positions, quad)`; `FLAG_CELL`;
  `writeGlow(..., gain = 1)`; `RoverWrites.pose` compares all twelve fields; `roverFrame` applies `x`, `z`, `yaw`.

- [ ] **Step 1: Tests first.** Add to `tests/unit/office-rig.test.ts`:

```ts
it("offsets and turns the Rover on its own axes", () => {
  const s = OFFICE_SLOTS[2];
  const base = roverFrame(s, stillPose("working"), new Matrix4());
  const moved = roverFrame(s, { ...stillPose("working"), z: -0.35, yaw: 0.5 }, new Matrix4());
  const p0 = new Vector3().setFromMatrixPosition(base);
  const p1 = new Vector3().setFromMatrixPosition(moved);
  expect(p0.distanceTo(p1)).toBeCloseTo(0.35, 5);
  // Backward is away from the arc centre.
  expect(Math.hypot(p1.x - LOBBY.officeWing.arc.x, p1.z - LOBBY.officeWing.arc.z)).toBeGreaterThan(Math.hypot(p0.x - LOBBY.officeWing.arc.x, p0.z - LOBBY.officeWing.arc.z));
});
it("hides the flag pole and quad while lowered and raises them with the flag", () => {
  const parts = new Float32Array(PARTS_PER_ROVER * 16);
  const treads = new Float32Array(TREADS_PER_ROVER * 16);
  const quads = new Float32Array(12);
  const f = roverFrame(OFFICE_SLOTS[0], stillPose("input"), new Matrix4());
  writeRover(f, { ...stillPose("input"), flag: 0 }, parts, 0, treads);
  writeFlag(f, { ...stillPose("input"), flag: 0 }, quads, 0);
  expect(new Matrix4().fromArray(parts, 5 * 16).determinant()).toBeCloseTo(0, 8);
  expect(quads.every((v, i) => v === quads[i % 3])).toBe(true);
  writeRover(f, { ...stillPose("input"), flag: 1 }, parts, 0, treads);
  writeFlag(f, { ...stillPose("input"), flag: 1 }, quads, 0);
  expect(Math.abs(new Matrix4().fromArray(parts, 5 * 16).determinant())).toBeGreaterThan(0);
  const ys = [1, 4, 7, 10].map((i) => quads[i]);
  expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.4, 2);
});
```

Add to `tests/unit/office-frame.test.ts`:

```ts
it("marks a pose write when only an offset, the turn or the flag changed", () => {
  const w = new RoverWrites(1, stillPose("asleep"), "asleep", { x: 0, z: 0 });
  for (const k of ["x", "z", "yaw", "flag", "wave"] as const) {
    w.done(0);
    expect(w.pose(0, { ...w.poses[0], [k]: w.poses[0][k] + 0.1 })).toBe(true);
  }
});
```

Add to `tests/unit/office-atlas.test.ts`:

```ts
it("keeps the flag cell clear of the faces and screens", () => {
  const cells = Array.from({ length: ATLAS_CELLS }, (_, i) => atlasCell(i));
  const overlap = (a: Cell, b: Cell) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  expect(cells.some((c) => overlap(c, FLAG_CELL))).toBe(false);
  expect(FLAG_CELL.x + FLAG_CELL.w).toBeLessThanOrEqual(ATLAS.w);
});
```

- [ ] **Step 2:** Run the three files; expect FAIL.
- [ ] **Step 3: Implement.** In `officeRig.ts`:

```ts
export const PARTS_PER_ROVER = 6;
/** The flag pole (in the parts mesh) and plate (a quad on the atlas's flag cell), held in the raised left hand. */
export const FLAG = { pole: { w: 0.06, h: 1.2 }, plate: { w: 0.6, h: 0.4 } } as const;
const ACROSS = new Vector3();

/** The Rover's frame: its spot plus the pose's offsets on its own axes, turned to face the arc centre plus the pose's turn. */
export function roverFrame(slot: OfficeSlot, p: OfficePose, out: Matrix4): Matrix4 {
  const c = Math.cos(slot.yaw);
  const s = Math.sin(slot.yaw);
  // Local x is (cos yaw, -sin yaw) and local z (sin yaw, cos yaw) in floor x and z.
  T.set(slot.rover.x + p.x * c + p.z * s, p.y, slot.rover.z - p.x * s + p.z * c);
  E.set(p.rx, slot.yaw + p.ry + p.yaw, p.rz, "YXZ");
  return out.compose(T, Q.setFromEuler(E), ONE);
}

/** The left hand's point in the Rover's frame for an arm angle (the arm's far end). */
function hand(angle: number, out: Vector3): Vector3 {
  const R = OFFICE_ROVER;
  return out.set(-R.shoulder.x, R.shoulder.y - Math.sin(angle) * R.arm.d, R.shoulder.z + Math.cos(angle) * R.arm.d);
}
```

In `writeRover`, after the stalk:

```ts
  hand(p.armL, ACROSS);
  const h = FLAG.pole.h * p.flag;
  A.compose(V.set(ACROSS.x, ACROSS.y + h / 2, ACROSS.z), Q.identity(), S.set(p.flag > 0 ? FLAG.pole.w : 0, h, p.flag > 0 ? FLAG.pole.w : 0));
  M.multiplyMatrices(frame, A).toArray(parts, (at + 5) * 16);
```

and the flag quad (positions indexes follow the faces and desk screens, quad `10 + slot`):

```ts
/** The flag plate at the pole's top, waving about the pole by `p.wave`; collapsed to a point while lowered. */
export function writeFlag(frame: Matrix4, p: OfficePose, positions: Float32Array, quad: number): void {
  hand(p.armL, ACROSS);
  const top = ACROSS.y + FLAG.pole.h * p.flag;
  A.copy(frame).multiply(B.makeTranslation(ACROSS.x, top - FLAG.plate.h / 2, ACROSS.z)).multiply(B.makeRotationY(p.wave)).multiply(B.makeTranslation(-FLAG.plate.w / 2, 0, 0.01));
  const k = p.flag > 0.98 ? 1 : 0;
  writeQuad(A, 0, 0, 0, FLAG.plate.w * k, FLAG.plate.h * k, positions, quad);
}
```

`writeGlow` gains a last parameter `gain = 1` multiplying the tip and halo colours (`C.set(...).multiplyScalar(gain)` for the tip, `asleep ? 0.08 : 0.35 * gain` for the halo).

In `officeFrame.ts`, `RoverWrites.pose` uses `poseChanged` from `officeVisual.ts`:

```ts
  pose(slot: number, p: OfficePose): boolean {
    const a = this.poses[slot];
    if (!poseChanged(a, p)) return false;
    Object.assign(a, p);
    this.posePending[slot] = true;
    this.glowPending[slot] = true;
    return true;
  }
```

In `officeAtlas.ts`:

```ts
/** The flag plate (one cell shared by every Rover): right of the five faces in the top row. */
export const FLAG_CELL: Cell = { x: 5 * FACE_W, y: 0, w: FACE_W, h: FACE_H };

/** The flag: the input tone with a white "!" mark (a symbol, not a word). */
export function drawFlag(ctx: CanvasRenderingContext2D, c: Cell, color: string): void {
  ctx.clearRect(c.x, c.y, c.w, c.h);
  ctx.fillStyle = color;
  ctx.fillRect(c.x + 4, c.y + 4, c.w - 8, c.h - 8);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(c.x + c.w / 2 - 6, c.y + 18, 12, 40);
  ctx.fillRect(c.x + c.w / 2 - 6, c.y + 66, 12, 12);
}
```

- [ ] **Step 4:** Run the three test files plus `office-visual`, `office-runtime`; expected PASS.
- [ ] **Step 5:** Commit `feat(office): rig offsets, turn and flag for the crew`.

### Task 3: CI tower and ship dock (layout, obstacles, shell)

**Files:**
- Modify: `src/experience/floors/lobby/officeLayout.ts`, `src/experience/floors/lobby/officeShell.ts`
- Test: `tests/unit/lobby-office.test.ts`, `tests/unit/office-chip-placement.test.ts`, `tests/unit/highlights-layout.test.ts` (unchanged expectations must still pass)

**Interfaces:**
- Produces: `OFFICE.tower = { column: 2, h: 9, plinth: 0.4 }`, `OFFICE.dock = { pad: 0.25 }`; `officeTower(w): Rect`,
  `officeDock(w): Rect`, `officeTowerColumn(w): { x: number; z: number }` (the column's centre, the crew's `tower` look
  target), `officeDockPad(w): { x: number; z: number }`; both rects appended to `officeObstacles(w)` (so the navgrid,
  the minimap fixtures and the camera clamp follow), the tower column as a camera column in `officeTall` callers.

- [ ] **Step 1: Tests first.** In `tests/unit/lobby-office.test.ts` add:

```ts
describe("CI tower and ship dock", () => {
  const w = LOBBY.officeWing;
  const [east, , west] = officeObstacles(w);
  const tower = officeTower(w);
  const dock = officeDock(w);
  it("fill the corners beside the end row boxes, touching them and the wing's edges", () => {
    expect(tower).toMatchObject({ minX: east.maxX, maxX: w.rect.maxX, maxZ: w.rect.maxZ });
    expect(dock).toMatchObject({ minX: w.rect.minX, maxX: west.minX, maxZ: w.rect.maxZ });
    expect(tower.minZ).toBeCloseTo(east.minZ, 6);
    expect(dock.minZ).toBeCloseTo(west.minZ, 6);
  });
  it("meet the space rules (touch or 6 u) with every other L1 obstacle", () => {
    for (const r of [tower, dock]) for (const o of LOBBY.obstacles.filter((o) => o !== r)) {
      const gap = rectGap(r, o);
      expect(gap === 0 || gap >= 6 - 1e-6, `${JSON.stringify(r)} vs ${JSON.stringify(o)}: ${gap}`).toBe(true);
    }
  });
  it("leave the stop reachable from the spawn and the elevator, with no pocket", () => {
    expect(reachable(LOBBY, LOBBY.spawn, w.stop)).toBe(true);
    expect(reachable(LOBBY, LOBBY.arrival, w.stop)).toBe(true);
    expect(pocketCells(LOBBY)).toEqual([]);
  });
  it("keeps every Rover's footprint (radius 1) inside the office obstacles while pacing and docked", () => {
    const boxes = officeObstacles(w);
    const inside = (x: number, z: number) => boxes.some((b) => x >= b.minX - 1e-6 && x <= b.maxX + 1e-6 && z >= b.minZ - 1e-6 && z <= b.maxZ + 1e-6);
    for (const s of officeSlots(w)) {
      const across = { x: Math.cos(s.yaw), z: -Math.sin(s.yaw) };
      const fwd = { x: Math.sin(s.yaw), z: Math.cos(s.yaw) };
      for (const [dx, dz] of [[CREW.pace.amp, 0], [-CREW.pace.amp, 0], [0, -CREW.dock.back]]) {
        const cx = s.rover.x + across.x * dx + fwd.x * dz;
        const cz = s.rover.z + across.z * dx + fwd.z * dz;
        for (let k = 0; k < 32; k++) {
          const a = (k / 32) * Math.PI * 2;
          expect(inside(cx + Math.cos(a), cz + Math.sin(a)), `slot ${s.slot} at ${dx},${dz}`).toBe(true);
        }
      }
    }
  });
  it("puts the tower column on the tower and in front of the wall line", () => {
    const c = officeTowerColumn(w);
    expect(c.x).toBeGreaterThan(tower.minX);
    expect(c.x).toBeLessThan(tower.maxX);
    expect(c.z).toBeLessThan(w.wall.z);
  });
});
```

(`rectGap`, `reachable` and `pocketCells` are the helpers this file already uses for the console; reuse them by name.
Import `CREW` from `office/crew` and `officeSlots` for the footprint test, which moved here from Task 1: the end Rovers'
pace and dock reach past their own row boxes by up to 0.24 u, into the tower and dock corners.)
In `tests/unit/office-chip-placement.test.ts`, add the tower column's projected box (x from `officeTowerColumn`, y 0 to
`OFFICE.tower.h`) to the boxes no chip may cover, on the six sizes.

- [ ] **Step 2:** Run both files; expect FAIL.
- [ ] **Step 3: Implement** in `officeLayout.ts`:

```ts
  /** The CI tower (south-east corner, stage B lights its lane matrix) and the ship dock (south-west corner). */
  tower: { column: 2, h: 9, plinth: 0.4 },
  dock: { pad: 0.25 },
```

(inside `OFFICE`), and:

```ts
/** The south-east corner beside the east row box: touches it and the wing's east and south edges (SPACE_RULES allow touching). */
export function officeTower(w: OfficeWing): Rect {
  const east = officeSlots(w)[0].rect;
  return { minX: east.maxX, maxX: w.rect.maxX, minZ: east.minZ, maxZ: w.rect.maxZ };
}

/** The south-west corner beside the west row box, mirrored. */
export function officeDock(w: OfficeWing): Rect {
  const west = officeSlots(w)[OFFICE.angles.length - 1].rect;
  return { minX: w.rect.minX, maxX: west.minX, minZ: west.minZ, maxZ: w.rect.maxZ };
}

/** The tower column's centre (the crew's look target): the corner's middle, nudged toward the stop. */
export function officeTowerColumn(w: OfficeWing): Vec2 {
  const r = officeTower(w);
  return { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
}

export function officeDockPad(w: OfficeWing): Vec2 {
  const r = officeDock(w);
  return { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
}
```

and append `officeTower(w), officeDock(w)` to the array `officeObstacles` returns. In `officeShell.ts`, `officeShellBoxes`
pushes the tower plinth, column and the dock plinth:

```ts
  const tower = officeTower(w);
  const dock = officeDock(w);
  const col = officeTowerColumn(w);
  const pad = officeDockPad(w);
  out.push({ x: (tower.minX + tower.maxX) / 2, y: 0, z: (tower.minZ + tower.maxZ) / 2, w: tower.maxX - tower.minX, h: OFFICE.tower.plinth, d: tower.maxZ - tower.minZ });
  out.push({ x: col.x, y: OFFICE.tower.plinth, z: col.z, w: OFFICE.tower.column, h: OFFICE.tower.h, d: OFFICE.tower.column, yaw: Math.atan2(w.stop.x - col.x, w.stop.z - col.z) });
  out.push({ x: pad.x, y: 0, z: pad.z, w: dock.maxX - dock.minX, h: OFFICE.dock.pad, d: dock.maxZ - dock.minZ });
```

If the rects' 6 u rule fails against another L1 obstacle (the observatory corner west, the hall lead road east), shrink
the rect's north edge (`minZ`) until it passes and record the measured gaps in the test names; never move the wing.
- [ ] **Step 4:** Run `bun run test tests/unit/lobby-office.test.ts tests/unit/office-chip-placement.test.ts tests/unit/highlights-layout.test.ts tests/unit/minimap-model.test.ts`; expected PASS.
- [ ] **Step 5:** Commit `feat(office): CI tower and ship dock corners in the wing`.

### Task 4: Crew fx writer and tower lane dots

**Files:**
- Create: `src/experience/floors/lobby/office/crewFx.ts`
- Test: `tests/unit/office-crew-fx.test.ts`

**Interfaces:**
- Consumes: `CrewFx`, `sparkAt`, `trailAt`, `confettiAt`, `TRAIL_SIZE` (Task 1); `roverFrame` (Task 2);
  `officeTowerColumn` (Task 3); `STATE_TONE`.
- Produces: `CREW_GLOW = { sparks: 0, trail: 5, confetti: 8, charge: 14, desk: 15, count: 16 }`;
  `GLOW_PER_ROVER` becomes `18 + CREW_GLOW.count` (34; defined in `officeRig.ts`, which imports `CREW_GLOW`);
  `writeCrewGlow(slot, frame, state, fx, t, phase, reduced, matrices, colors)`; `crewGlowKey(state, fx, t, reduced): string`;
  `TOWER = { lanes: 24, dots: 8, start: 5 * GLOW_PER_ROVER }`; `towerLanes(view): { total: number; done: number; running: boolean }`;
  `writeTower(lanes, t, reduced, matrices, colors)`; `towerKey(lanes, t, reduced): string`.

- [ ] **Step 1: Tests first** `tests/unit/office-crew-fx.test.ts`:

```ts
import { Matrix4 } from "three";
import { describe, expect, it } from "vitest";
import { CREW_GLOW, crewGlowKey, TOWER, towerKey, towerLanes, writeCrewGlow, writeTower } from "@/experience/floors/lobby/office/crewFx";
import { crewFx, newActor, stepCrew } from "@/experience/floors/lobby/office/crew";
import { GLOW_PER_ROVER, roverFrame } from "@/experience/floors/lobby/office/officeRig";
import { stillPose } from "@/experience/floors/lobby/office/officeVisual";
import { OFFICE_SLOTS } from "@/experience/floors/lobby/officeShell";
import { officeView } from "@/experience/floors/lobby/office/officeModel";
import { OFFICE_FIXTURES } from "@/lib/office/fixtures";

const LOOK = { camera: 0, tower: 0 };
const scaleAt = (m: Float32Array, i: number) => new Matrix4().fromArray(m, i * 16).getMaxScaleOnAxis();

describe("crew glow", () => {
  it("shows sparks only while working and hides the rest", () => {
    const m = new Float32Array(5 * GLOW_PER_ROVER * 16);
    const c = new Float32Array(5 * GLOW_PER_ROVER * 3);
    const a = newActor("working");
    stepCrew(a, "working", 0.1, 0, false, LOOK);
    const f = roverFrame(OFFICE_SLOTS[1], stillPose("working"), new Matrix4());
    writeCrewGlow(OFFICE_SLOTS[1], f, "working", crewFx(a, false), 0.1, 0, false, m, c);
    const base = 1 * GLOW_PER_ROVER + 18;
    const sparks = Array.from({ length: 5 }, (_, i) => scaleAt(m, base + CREW_GLOW.sparks + i));
    expect(sparks.some((s) => s > 0)).toBe(true);
    for (let i = CREW_GLOW.trail; i < CREW_GLOW.charge; i++) expect(scaleAt(m, base + i)).toBe(0);
    expect(scaleAt(m, base + CREW_GLOW.desk)).toBeGreaterThan(0);
  });
  it("keys stay still under reduced motion and while asleep step only with the charge level", () => {
    const fx = crewFx(newActor("working"), true);
    expect(crewGlowKey("working", fx, 1, true)).toBe(crewGlowKey("working", fx, 9, true));
    const a = newActor("asleep");
    const keys = new Set<string>();
    for (let i = 0; i < 300; i++) keys.add(crewGlowKey("asleep", crewFx((stepCrew(a, "asleep", 1 / 60, 0, false, LOOK), a), false), i / 60, false));
    expect(keys.size).toBeLessThanOrEqual(12);
  });
});

describe("tower lanes (v1: anonymous progress)", () => {
  it("reads the newest running run's progress", () => {
    const view = officeView({ status: "live", snapshot: OFFICE_FIXTURES.busy });
    const lanes = towerLanes(view);
    expect(lanes.total).toBeLessThanOrEqual(TOWER.lanes);
    expect(lanes.done).toBeLessThanOrEqual(lanes.total);
  });
  it("is dark and keyed still without a run", () => {
    const view = officeView({ status: "live", snapshot: OFFICE_FIXTURES.quiet });
    const lanes = towerLanes(view);
    expect(lanes).toEqual({ total: 0, done: 0, running: false });
    const m = new Float32Array((TOWER.start + TOWER.lanes * TOWER.dots) * 16);
    const c = new Float32Array((TOWER.start + TOWER.lanes * TOWER.dots) * 3);
    writeTower(lanes, 3, false, m, c);
    expect(towerKey(lanes, 3, true)).toBe(towerKey(lanes, 8, true));
  });
});
```

(If `OFFICE_FIXTURES.busy` has no running run, add one to the fixture in this task: a `run` item with `status: "running"` and `progress: { done: 5, total: 12 }`.)

- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** `crewFx.ts`:

```ts
import { Color, Euler, Matrix4, Quaternion, Vector3 } from "three";
import { STATE_TONE } from "@/lib/office/model";
import type { OfficeState } from "@/lib/office/protocol";
import { LOBBY } from "../../../config";
import { OFFICE, officeTowerColumn, type OfficeSlot } from "../officeLayout";
import { confettiAt, sparkAt, trailAt, TRAIL_SIZE, type CrewFx, type FxPoint } from "./crew";
import type { OfficeView } from "./officeModel";

/** Crew instances per Rover in the glow mesh, after the 18 the rig writes (tip, halo, 16 progress dots). */
export const CREW_GLOW = { sparks: 0, trail: 5, confetti: 8, charge: 14, desk: 15, count: 16 } as const;
const RIG_GLOW = 18;

const M = new Matrix4();
const Q = new Quaternion();
const V = new Vector3();
const S = new Vector3();
const C = new Color();
const P: FxPoint = { x: 0, y: 0, z: 0, a: 0 };
const FLAT = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));
const SPARK = "#a5f3fc";
const CONFETTI = ["#34d399", "#22d3ee", "#fbbf24", "#f472b6", "#a78bfa", "#ffffff"] as const;

function dot(frame: Matrix4, p: FxPoint, size: number, color: string, gain: number, i: number, matrices: Float32Array, colors: Float32Array, flat = false): void {
  V.set(p.x, p.y, p.z).applyMatrix4(frame);
  M.compose(V, flat ? FLAT : Q.identity(), S.setScalar(p.a > 0 ? size : 0)).toArray(matrices, i * 16);
  C.set(color).multiplyScalar(gain * p.a).toArray(colors, i * 3);
}

/** Writes one Rover's 16 crew instances (hidden ones scaled to 0). `frame` is the Rover's frame from `roverFrame`. */
export function writeCrewGlow(slot: OfficeSlot, frame: Matrix4, state: OfficeState, fx: CrewFx, t: number, phase: number, reduced: boolean, matrices: Float32Array, colors: Float32Array): void {
  const base = slot.slot * (RIG_GLOW + CREW_GLOW.count) + RIG_GLOW;
  const tone = STATE_TONE[state];
  for (let i = 0; i < 5; i++) {
    sparkAt(i, t, phase, reduced, P);
    if (fx.sparks === 0) P.a = 0;
    dot(frame, P, 0.09, SPARK, 1.4, base + CREW_GLOW.sparks + i, matrices, colors);
  }
  for (let j = 0; j < 3; j++) {
    trailAt(j, t, reduced, P);
    P.a *= fx.trail;
    dot(frame, P, TRAIL_SIZE[j], tone, 1, base + CREW_GLOW.trail + j, matrices, colors);
  }
  for (let j = 0; j < 6; j++) {
    if (fx.confetti < 0) P.a = 0;
    else confettiAt(j, fx.confetti, P);
    dot(frame, P, 0.1, CONFETTI[j], 1.3, base + CREW_GLOW.confetti + j, matrices, colors);
  }
  P.x = 0;
  P.y = 0.04;
  P.z = 0;
  P.a = fx.charge;
  dot(frame, P, 2.1, "#67e8f9", 0.6, base + CREW_GLOW.charge, matrices, colors, true);
  // The desk light: a long flat glow on the desk's front edge, in the state tone (dims to 10% asleep).
  const front = OFFICE.roverRadius - OFFICE.deskRadius + OFFICE.desk.d / 2 - 0.05;
  V.set(0, OFFICE.desk.top + 0.01, front).applyMatrix4(frame);
  M.compose(V, Q.setFromRotationMatrix(M.extractRotation(frame)).multiply(FLAT), S.set(OFFICE.desk.w * 0.85, 0.12, 1)).toArray(matrices, (base + CREW_GLOW.desk) * 16);
  C.set(tone).multiplyScalar(0.6 * fx.deskLight).toArray(colors, (base + CREW_GLOW.desk) * 3);
}

/** Changes when any crew instance would change: animated effects tick at 30 Hz, the charge in tenths, the flicker by its gain. */
export function crewGlowKey(state: OfficeState, fx: CrewFx, t: number, reduced: boolean): string {
  if (reduced) return `${state}:${fx.confetti >= 0 ? 1 : 0}`;
  if (state === "asleep") return `asleep:${Math.round(fx.charge * 10)}`;
  if (state === "failed") return `failed:${fx.flicker}`;
  if (fx.sparks || fx.trail || fx.confetti >= 0) return `${state}:${Math.floor(t * 30)}`;
  return state;
}

/** The tower's LED matrix after the five Rovers' glow: up to 24 lanes of 8 dots, bottom to top. */
export const TOWER = { lanes: 24, dots: 8, start: 5 * (RIG_GLOW + CREW_GLOW.count), gap: 0.3 } as const;

export interface TowerLanes {
  total: number;
  done: number;
  running: boolean;
}

/** Stage A (v1 data): the newest running public run's progress as anonymous lanes; dark without one. */
export function towerLanes(view: OfficeView): TowerLanes {
  const run = view.github.find((g) => g.kind === "run" && g.status === "running");
  if (!run) return { total: 0, done: 0, running: false };
  const total = Math.min(TOWER.lanes, run.progress?.total ?? 1);
  return { total, done: Math.min(total, run.progress?.done ?? 0), running: true };
}

const COL = officeTowerColumn(LOBBY.officeWing);
const FACE = Math.atan2(LOBBY.officeWing.stop.x - COL.x, LOBBY.officeWing.stop.z - COL.z);

/** Writes the lane dots on the column's stop-facing side: done lanes green, the next lane chasing, the rest dim. */
export function writeTower(lanes: TowerLanes, t: number, reduced: boolean, matrices: Float32Array, colors: Float32Array): void {
  const cx = Math.cos(FACE);
  const sx = -Math.sin(FACE);
  const fx = Math.sin(FACE);
  const fz = Math.cos(FACE);
  const head = reduced ? 0 : Math.floor(t * 8) % TOWER.dots;
  for (let lane = 0; lane < TOWER.lanes; lane++) {
    for (let d = 0; d < TOWER.dots; d++) {
      const i = TOWER.start + lane * TOWER.dots + d;
      const across = (d - (TOWER.dots - 1) / 2) * 0.2;
      V.set(COL.x + cx * across + fx * (OFFICE.tower.column / 2 + 0.02), OFFICE.tower.plinth + 0.6 + lane * TOWER.gap, COL.z + sx * across + fz * (OFFICE.tower.column / 2 + 0.02));
      const shown = lane < lanes.total;
      M.compose(V, Q.setFromAxisAngle(S.set(0, 1, 0), FACE), S.setScalar(shown ? 0.14 : 0.08)).toArray(matrices, i * 16);
      const color = lane < lanes.done ? "#34d399" : lane === lanes.done && lanes.running ? "#a78bfa" : "#3b3f5c";
      const on = lane < lanes.done ? 1 : lane === lanes.done && lanes.running ? (d === head ? 1.4 : 0.35) : 0.12;
      C.set(color).multiplyScalar(on).toArray(colors, i * 3);
    }
  }
}

export function towerKey(lanes: TowerLanes, t: number, reduced: boolean): string {
  return `${lanes.total}:${lanes.done}:${lanes.running}:${reduced || !lanes.running ? 0 : Math.floor(t * 8) % TOWER.dots}`;
}
```

In `officeRig.ts` set `export const GLOW_PER_ROVER = 2 + OFFICE_ROVER.progress.count + CREW_GLOW.count;` (import
`CREW_GLOW` from `./crewFx`; the rig's own writes keep indexes `base` to `base + 17`).
- [ ] **Step 4:** Run `bun run test tests/unit/office-crew-fx.test.ts tests/unit/office-rig.test.ts`; expected PASS.
- [ ] **Step 5:** Commit `feat(office): crew glow effects and tower lane dots`.

### Task 5: Wire the crew into the scene

**Files:**
- Modify: `src/experience/floors/lobby/office/OfficeScene.tsx`, `src/experience/fx/probes.ts` (office probe gains `crew`)
- Test: `tests/unit/office-runtime.test.ts` (unchanged), e2e in Task 9

**Interfaces:**
- Consumes: Tasks 1 to 4.
- Produces: probe `__hq.probes.office.crew: { state: OfficeState; yaw: number; flag: number; z: number }[]` (one per
  desk, updated every 0.5 s with the in-view check); quads mesh has `QUADS = 15` (faces 0 to 4, desk screens 5 to 9,
  flags 10 to 14); glow mesh count `slots.length * GLOW_PER_ROVER + TOWER.lanes * TOWER.dots`.

- [ ] **Step 1:** In `atlasQuads`, set `QUADS = 15`; uvs for quads 10 to 14 use `cellUv(FLAG_CELL)`; `restInstances` and
  the glow arrays size to `slots.length * GLOW_PER_ROVER + TOWER.lanes * TOWER.dots`, writing `writeCrewGlow` (asleep
  fx) and `writeTower({ total: 0, done: 0, running: false }, 0, true, ...)` at creation so bounds include the tower.
- [ ] **Step 2:** In `paintAtlas`, the first paint (`!l.primed`) also calls `drawFlag(atlasCtx, FLAG_CELL, STATE_TONE.input)`
  (the flag cell never repaints).
- [ ] **Step 3:** In `OfficeRovers`, keep one actor per slot and a cached look per slot:

```ts
  const crew = useMemo(() => slots.map(() => newActor("asleep")), [slots]);
  const looks = useMemo(() => slots.map((s) => ({ camera: 0, tower: lookYaw(s, officeTowerColumn(LOBBY.officeWing)) })), [slots]);
  const lanesKey = useRef("");
```

and replace the pose loop in `useFrame` (frame deltas clamped like `OfficeMount`):

```ts
    const dt = Math.min(rawDt, MAX_FRAME_DT) * animationSpeed();
    const camMoved = writes.camera(camera.position.x, camera.position.z);
    for (const r of view.rovers) {
      const look = looks[r.slot];
      if (camMoved) look.camera = lookYaw(slots[r.slot], writes.cam, CREW.cameraClamp);
      const p = stepCrew(crew[r.slot], r.state, dt, slotPhase(r.slot), reduced, look);
      bob = Math.max(bob, poseOffset(r.state, p));
      writes.pose(r.slot, p);
      const fx = crewFx(crew[r.slot], reduced);
      writes.glow(r.slot, glowKey(r.state, r.progress, reduced, now) + "|" + crewGlowKey(r.state, fx, now, reduced));
    }
    const lanes = towerLanes(view);
    const tk = towerKey(lanes, now, reduced);
    const towerDue = tk !== lanesKey.current;
```

`flushRovers` gains the crew: for a glow-due Rover it calls `writeGlow(..., gain = fx.flicker)` then
`writeCrewGlow(slots[slot], FRAME, r.state, fx, now, slotPhase(slot), reduced, matrices, colors)`; for a pose-due Rover
it also calls `writeFlag(FRAME, p, position.array, 10 + slot)`. When `towerDue`, `whenDrawn` runs `writeTower` and sets
`lanesKey.current = tk` and both glow buffers' `needsUpdate`. `poseOffset` ignores `x`, `z`, `yaw`, `flag` and `wave`
(the bob probe still measures the body's own motion; reduced motion keeps 0).
- [ ] **Step 4:** In `OfficeWatch`'s 0.5 s block add `crew: crewProbe` where `crewProbe` reads the actors through a
  module-level `officeRuntime.crew` array the scene fills (`{ state, yaw, flag, z }` per slot); extend
  `sceneProbes.office` in `fx/probes.ts` with `crew: [] as { state: OfficeState; yaw: number; flag: number; z: number }[]`
  and reset it on unmount.
- [ ] **Step 5:** `bun run typecheck && bun run test tests/unit/office-*`; expected PASS.
- [ ] **Step 6:** Commit `feat(office): the living crew in the office scene`.

### Task 6: Main-path signal and watch

**Files:**
- Create: `src/experience/floors/lobby/office/officeSignal.ts`, `src/experience/floors/lobby/office/officeWatch.ts`
- Modify: `OfficeScene.tsx` (feeds the signal), `OfficeMount.tsx` (starts the watch)
- Test: `tests/unit/office-signal.test.ts`, `tests/unit/office-watch.test.ts`

**Interfaces:**
- Produces: `officeSignal = { needsKurniadi: boolean; asking: number[]; deployAt: number | null; sceneFeeding: boolean }`,
  `setOfficeSignal(patch)`, `subscribeOfficeSignal(cb)`, `useOfficeSignal<T>(select)`; `signalFromBody(body: unknown, now: number): { asking: number[]; deployAt: number | null } | null`;
  `startOfficeWatch(opts: { fetch?: typeof fetch; now?: () => number; every?: number }): () => void`.

- [ ] **Step 1: Tests first** `tests/unit/office-signal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { signalFromBody } from "@/experience/floors/lobby/office/officeSignal";
import { OFFICE_FIXTURES } from "@/lib/office/fixtures";

describe("signalFromBody", () => {
  it("lists asking desks and a recent deploy", () => {
    const snap = { ...OFFICE_FIXTURES.busy, desks: OFFICE_FIXTURES.busy.desks.map((d, i) => (i === 1 ? { ...d, state: "input" } : d)), github: [{ kind: "deploy", status: "success", repo: "ShinyQ/ShinyQ-HQ", title: "Deploy · production", at: 1_000, url: "https://github.com/ShinyQ/ShinyQ-HQ" }] };
    expect(signalFromBody(snap, 20_000)).toEqual({ asking: [snap.desks[1].slot], deployAt: 1_000 });
    expect(signalFromBody(snap, 40_000)?.deployAt).toBeNull();
  });
  it("returns null for anything malformed, never throws", () => {
    for (const bad of [null, 1, "x", [], { v: 1 }, { v: 1, enabled: true, desks: "x" }, { v: 1, enabled: true, desks: [{ state: 1, slot: "a" }], github: [] }]) expect(signalFromBody(bad, 0)).toBeNull();
    expect(signalFromBody({ v: 1, enabled: false }, 0)).toEqual({ asking: [], deployAt: null });
  });
});
```

`tests/unit/office-watch.test.ts` (fake timers and a stubbed fetch):

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { getHQStore } from "@/store/useHQStore";
import { officeSignal, setOfficeSignal } from "@/experience/floors/lobby/office/officeSignal";
import { startOfficeWatch } from "@/experience/floors/lobby/office/officeWatch";

const body = (state: string) => ({ v: 1, enabled: true, mode: "live", updatedAt: 1, desks: [{ slot: 2, state }], extra: 0, github: [], today: {} });
const fetcher = (state: string) => vi.fn(async () => new Response(JSON.stringify(body(state)), { status: 200 }));

afterEach(() => {
  vi.useRealTimers();
  setOfficeSignal({ needsKurniadi: false, asking: [], deployAt: null, sceneFeeding: false });
});

describe("office watch", () => {
  it("polls every 30 s on L1 and raises needsKurniadi", async () => {
    vi.useFakeTimers();
    getHQStore().setState({ floor: "L1", ride: null });
    const f = fetcher("input");
    const stop = startOfficeWatch({ fetch: f, now: () => Date.now(), every: 30_000 });
    await vi.advanceTimersByTimeAsync(10);
    expect(officeSignal.needsKurniadi).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f).toHaveBeenCalledTimes(2);
    stop();
  });
  it("does not fetch off L1, while the scene feeds, or with a hidden tab", async () => {
    vi.useFakeTimers();
    const f = fetcher("input");
    getHQStore().setState({ floor: "L2", ride: null });
    const stop = startOfficeWatch({ fetch: f, now: () => Date.now(), every: 30_000 });
    await vi.advanceTimersByTimeAsync(31_000);
    getHQStore().setState({ floor: "L1" });
    setOfficeSignal({ sceneFeeding: true });
    await vi.advanceTimersByTimeAsync(31_000);
    expect(f).not.toHaveBeenCalled();
    stop();
  });
  it("clears the beacon after 60 s without a good answer", async () => {
    vi.useFakeTimers();
    getHQStore().setState({ floor: "L1", ride: null });
    let ok = true;
    const f = vi.fn(async () => (ok ? new Response(JSON.stringify(body("input"))) : new Response("x", { status: 500 })));
    const stop = startOfficeWatch({ fetch: f, now: () => Date.now(), every: 30_000 });
    await vi.advanceTimersByTimeAsync(10);
    ok = false;
    await vi.advanceTimersByTimeAsync(61_000);
    expect(officeSignal.needsKurniadi).toBe(false);
    stop();
  });
});
```

- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** `officeSignal.ts` (main path, no imports beyond React's `useSyncExternalStore`):

```ts
import { useSyncExternalStore } from "react";

/**
 * Main-path Agent Office signal (design 2026-10-20 section 5.3): whether a Rover needs Kurniadi (the beacon and the
 * minimap cue) and when the last production deploy succeeded (stage B's beam). Fed by the office watch's small fetch,
 * or by the office scene's own feed once that chunk runs (`sceneFeeding`), so there is one request stream.
 */
export interface OfficeSignal {
  needsKurniadi: boolean;
  asking: number[];
  deployAt: number | null;
  sceneFeeding: boolean;
  /** Epoch ms of the last good answer (the 60 s keep-last window). */
  goodAt: number;
}

export const officeSignal: OfficeSignal = { needsKurniadi: false, asking: [], deployAt: null, sceneFeeding: false, goodAt: 0 };
const listeners = new Set<() => void>();
let version = 0;

export function setOfficeSignal(patch: Partial<OfficeSignal>): void {
  Object.assign(officeSignal, patch);
  officeSignal.needsKurniadi = officeSignal.asking.length > 0;
  version += 1;
  for (const l of listeners) l();
}

export const subscribeOfficeSignal = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function useOfficeSignal<T>(select: (s: OfficeSignal) => T): T {
  return useSyncExternalStore(subscribeOfficeSignal, () => select(officeSignal), () => select({ needsKurniadi: false, asking: [], deployAt: null, sceneFeeding: false, goodAt: 0 }));
}

export const officeSignalVersion = () => version;

const DEPLOY_FRESH_MS = 30_000;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Reads only what the beacon needs from a GET /api/office body; null when it does not look like one. Never renders text. */
export function signalFromBody(body: unknown, now: number): { asking: number[]; deployAt: number | null } | null {
  if (!isObj(body) || body.v !== 1) return null;
  if (body.enabled === false) return { asking: [], deployAt: null };
  if (body.enabled !== true || !Array.isArray(body.desks) || !Array.isArray(body.github)) return null;
  const asking: number[] = [];
  for (const d of body.desks) {
    if (!isObj(d) || typeof d.state !== "string" || !Number.isInteger(d.slot) || (d.slot as number) < 0 || (d.slot as number) > 4) return null;
    if (d.state === "input") asking.push(d.slot as number);
  }
  let deployAt: number | null = null;
  for (const g of body.github) {
    if (isObj(g) && g.kind === "deploy" && g.status === "success" && Number.isInteger(g.at) && now - (g.at as number) <= DEPLOY_FRESH_MS) deployAt = Math.max(deployAt ?? 0, g.at as number);
  }
  return { asking, deployAt };
}
```

`officeWatch.ts` (main path):

```ts
import { getHQStore } from "@/store/useHQStore";
import { officeSignal, setOfficeSignal, signalFromBody } from "./officeSignal";

const KEEP_MS = 60_000;
const IDLE_MS = 10 * 60_000;
const INPUT = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * The beacon's own small poll of GET /api/office (v1): every `every` ms while the visitor is on L1 (not riding), the tab
 * is visible, there was input in the last 10 min and the office scene is not feeding the signal itself. Keeps the
 * last good answer 60 s, then clears the beacon (never a stale one).
 */
export function startOfficeWatch(opts: { fetch?: typeof fetch; now?: () => number; every?: number } = {}): () => void {
  const get = opts.fetch ?? ((u: string) => fetch(u, { cache: "no-store" }));
  const now = opts.now ?? Date.now;
  const every = opts.every ?? 30_000;
  let lastInput = now();
  let busy = false;
  const touch = () => {
    lastInput = now();
  };
  const tick = async () => {
    const s = getHQStore().getState();
    const due = s.floor === "L1" && !s.ride && !officeSignal.sceneFeeding && (typeof document === "undefined" || document.visibilityState === "visible") && now() - lastInput < IDLE_MS;
    if (!officeSignal.sceneFeeding && officeSignal.goodAt && now() - officeSignal.goodAt > KEEP_MS && officeSignal.needsKurniadi) setOfficeSignal({ asking: [], deployAt: null });
    if (!due || busy) return;
    busy = true;
    try {
      const res = await get("/api/office");
      const sig = res.ok ? signalFromBody(await res.json(), now()) : null;
      if (sig) setOfficeSignal({ ...sig, goodAt: now() });
    } catch {
      // Offline: the keep-last window above clears the beacon.
    } finally {
      busy = false;
    }
  };
  if (typeof window !== "undefined") for (const t of INPUT) window.addEventListener(t, touch, { passive: true });
  const first = setTimeout(tick, 0);
  const id = setInterval(tick, every);
  return () => {
    clearTimeout(first);
    clearInterval(id);
    if (typeof window !== "undefined") for (const t of INPUT) window.removeEventListener(t, touch);
  };
}
```

`OfficeMount.tsx`: `useEffect(() => afterFirstFrameIdle(() => { stopWatch = startOfficeWatch(); }), [])` with cleanup
calling `stopWatch?.()`. `OfficeScene.tsx`: an effect sets `sceneFeeding: true` on mount (false on unmount) and, on every
`feed` change, `setOfficeSignal({ asking: view.mode === "live" ? view.rovers.filter((r) => r.state === "input").map((r) => r.slot) : [], goodAt: Date.now() })`
(an offline feed sets `asking: []`).
- [ ] **Step 4:** Run the two files and `tests/unit/office-chunk-graph.test.ts` (the signal and watch are main-path and must not import the scene); expected PASS.
- [ ] **Step 5:** Commit `feat(office): main-path signal and watch for the beacon`.

### Task 7: The beacon (main path)

**Files:**
- Create: `src/experience/floors/lobby/office/beacon.ts` (pure), `src/experience/floors/lobby/office/OfficeBeacon.tsx`
- Modify: `OfficeMount.tsx` (mounts `OfficeBeacon` beside the shell)
- Test: `tests/unit/office-beacon.test.ts`, `tests/unit/office-beacon-view.test.ts`

**Interfaces:**
- Consumes: `officeSignal`, `useOfficeSignal` (Task 6); `createStageMaterial`, `stageAttributes`, `STAGE_KIND` (hall); `OFFICE_SLOTS`.
- Produces: `beaconGain(atStop)`; `BEACON = { h: 26, r: 0.8, bands: 3, period: 1.6, band: 0.3, slots: 5 }` (instance 0 the column, 1 to 3 the
  bands, 4 reserved for stage B's deploy beam); `beaconOrigin(asking: number[]): Vec2`;
  `beaconInstances(t: number, reduced: boolean, out: BeaconInstance[]): void` with
  `BeaconInstance = { y: number; r: number; h: number; alpha: number }`; probe `__hq.probes.office.beacon: boolean`.

- [ ] **Step 1: Tests first** `tests/unit/office-beacon.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BEACON, beaconInstances, beaconOrigin } from "@/experience/floors/lobby/office/beacon";
import { LOBBY } from "@/experience/config";
import { OFFICE_SLOTS } from "@/experience/floors/lobby/officeShell";

const make = () => Array.from({ length: BEACON.slots }, () => ({ y: 0, r: 0, h: 0, alpha: 0 }));

describe("beacon", () => {
  it("rises behind the asking Rover, or the plaza centre when several ask", () => {
    const one = beaconOrigin([2]);
    const arc = LOBBY.officeWing.arc;
    const r = OFFICE_SLOTS[2].rover;
    expect(Math.hypot(one.x - r.x, one.z - r.z)).toBeCloseTo(1.25, 5);
    expect(Math.hypot(one.x - arc.x, one.z - arc.z)).toBeGreaterThan(Math.hypot(r.x - arc.x, r.z - arc.z));
    expect(beaconOrigin([0, 4])).toEqual(LOBBY.officeWing.plaza.center);
  });
  it("bands climb the column and widen, then restart", () => {
    const a = make();
    const b = make();
    beaconInstances(0.2, false, a);
    beaconInstances(0.6, false, b);
    expect(a[0]).toMatchObject({ h: BEACON.h, r: BEACON.r });
    expect(b[1].y).toBeGreaterThan(a[1].y);
    expect(b[1].r).toBeGreaterThan(a[1].r);
    for (const i of a.slice(1, 4)) expect(i.y).toBeLessThanOrEqual(BEACON.h);
  });
  it("holds still under reduced motion", () => {
    const a = make();
    const b = make();
    beaconInstances(0.2, true, a);
    beaconInstances(5, true, b);
    expect(a).toEqual(b);
  });
});
```

`tests/unit/office-beacon-view.test.ts` reuses the camera helpers of `tests/unit/office-chip-placement.test.ts` (the
primed spawn camera, the elevator arrival camera and a camera on the hall lead road, on 1440x900, 1280x720, 1180x820,
820x1180, 390x844 and 844x390) and asserts, for an origin `beaconOrigin([2])`, that at least 30% of the column's height
projects inside the screen on every landscape size from the spawn and the hall road. Where a size cannot see it (the
portrait sizes from the spawn), the test records it in a named list that must equal the measured one, and the minimap
cue (Task 8) carries the signal there.

- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** `beacon.ts`:

```ts
import { LOBBY } from "../../../config";
import type { Vec2 } from "../../../types";
import { OFFICE_SLOTS } from "../officeShell";

/** The Needs Kurniadi beacon (design 2026-10-20 section 5.3): a tall column plus three bands rising it, on the hall's stage program. */
export const BEACON = { h: 26, r: 0.8, bands: 3, period: 1.6, band: 0.3, slots: 5 } as const;

export interface BeaconInstance {
  y: number;
  r: number;
  h: number;
  alpha: number;
}

/** 1.25 u behind the asking Rover (between it and the wall, so the column never hides it or its flag), or the wing plaza's centre when several Rovers ask. */
export function beaconOrigin(asking: readonly number[]): Vec2 {
  if (asking.length !== 1) return LOBBY.officeWing.plaza.center;
  const s = OFFICE_SLOTS[asking[0]];
  // Forward (sin yaw, cos yaw) points at the arc centre, so behind is the opposite way.
  return { x: s.rover.x - Math.sin(s.yaw) * 1.25, z: s.rover.z - Math.cos(s.yaw) * 1.25 };
}

/** The beacon's gain: 25% while the rover stands at the office stop (the flag carries the signal there). */
export const beaconGain = (atStop: boolean) => (atStop ? 0.25 : 1);

/** Column (0) and bands (1 to 3) at time `t`; instance 4 (stage B's beam) is left as is. Reduced motion: bands fixed at a third, two thirds and the top. */
export function beaconInstances(t: number, reduced: boolean, out: BeaconInstance[]): void {
  Object.assign(out[0], { y: 0, r: BEACON.r, h: BEACON.h, alpha: 0.9 });
  for (let i = 0; i < BEACON.bands; i++) {
    const u = reduced ? (i + 1) / (BEACON.bands + 1) : ((t / BEACON.period + i / BEACON.bands) % 1);
    Object.assign(out[1 + i], { y: u * (BEACON.h - BEACON.band), r: BEACON.r * (1.4 + u * 2.6), h: BEACON.band, alpha: reduced ? 0.7 : 1 - u });
  }
}
```

`OfficeBeacon.tsx` (main path; one instanced mesh over the unit open cylinder, `STAGE_KIND.beam`, additive, drawn only
while `needsKurniadi`, so it leaves the draw otherwise):

```tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, CylinderGeometry, InstancedBufferAttribute, Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";
import { STATE_TONE } from "@/lib/office/model";
import { useHQStore } from "@/store/useHQStore";
import { sceneProbes } from "../../../fx/probes";
import { useDispose } from "../../../fx/useDispose";
import { MAX_FRAME_DT } from "../../../rover/controller";
import { animationSpeed } from "../../../scene/animationSpeed";
import { createStageMaterial } from "../HallFx";
import { STAGE_KIND } from "../hallStage";
import { atOfficeStop } from "../officeShell";
import { BEACON, beaconGain, beaconInstances, beaconOrigin, type BeaconInstance } from "./beacon";
import { officeSignal, useOfficeSignal } from "./officeSignal";

const NO_RAYCAST = () => null;
const M = new Matrix4();
const Q = new Quaternion();
const V = new Vector3();
const S = new Vector3();

/** Rings over the wing while a Rover needs Kurniadi (1 draw call while lit, none otherwise; the hall's stage program). */
export function OfficeBeacon() {
  const lit = useOfficeSignal((s) => s.needsKurniadi);
  const reduced = useHQStore((s) => s.reducedMotion);
  const geometry = useMemo(() => {
    const g = new CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0);
    const n = BEACON.slots;
    const stage = new Float32Array(n * 4);
    const stage2 = new Float32Array(n * 4);
    const uv = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      stage.set([STAGE_KIND.beam, 1, 1, 1], i * 4);
      stage2.set([0, 0, i * 0.7, 1], i * 4);
      uv.set([0, 0, 1, 1], i * 4);
    }
    g.setAttribute("aStage", new InstancedBufferAttribute(stage, 4));
    g.setAttribute("aStage2", new InstancedBufferAttribute(stage2, 4));
    g.setAttribute("aStageUv", new InstancedBufferAttribute(uv, 4));
    return g;
  }, []);
  useDispose(geometry);
  const material = useMemo(() => createStageMaterial({ additive: true }), []);
  useDispose(material);
  const mesh = useRef<InstancedMesh>(null);
  const local = useRef({ t: 0, inst: Array.from({ length: BEACON.slots }, (): BeaconInstance => ({ y: 0, r: 0, h: 0, alpha: 0 })) });
  useFrame((_, rawDt) => {
    const m = mesh.current;
    sceneProbes.office.beacon = lit;
    if (!m || !lit) return;
    const l = local.current;
    l.t += Math.min(rawDt, MAX_FRAME_DT) * animationSpeed();
    beaconInstances(l.t, reduced, l.inst);
    const o = beaconOrigin(officeSignal.asking);
    const alpha = m.geometry.getAttribute("aStage2") as InstancedBufferAttribute;
    for (let i = 0; i < BEACON.bands + 1; i++) {
      const b = l.inst[i];
      M.compose(V.set(o.x, b.y, o.z), Q.identity(), S.set(b.r, b.h, b.r));
      m.setMatrixAt(i, M);
      alpha.setW(i, b.alpha * beaconGain(atOfficeStop()));
    }
    m.instanceMatrix.needsUpdate = true;
    alpha.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[geometry, material, BEACON.slots]} visible={lit} frustumCulled={false} raycast={NO_RAYCAST} name="office-beacon" renderOrder={2}>
      <instancedBufferAttribute attach="instanceColor" args={[new Float32Array(Array.from({ length: BEACON.slots }, () => new Color(STATE_TONE.input).toArray()).flat()), 3]} />
    </instancedMesh>
  );
}
```

(Instance 4 starts scaled to zero: set its matrix to a zero scale once in a layout effect. If `createStageMaterial`
lives in a module the main path should not grow by, move it with `stageAttributes` into `hallStage.ts`, which `HallFx`
already imports; both are on the main path today. The beacon must mount on the full tier only once the composer exists,
like the intro beacons, so the precompile builds no canvas-target program: gate it on `OfficeMount`'s `ready`.)
- [ ] **Step 4:** Run the two beacon files and `bun run typecheck`; expected PASS.
- [ ] **Step 5:** Commit `feat(office): the Needs Kurniadi beacon over the wing`.

### Task 8: Minimap cue

**Files:**
- Create: `src/hud/minimap/OfficeCue.tsx`
- Modify: `src/hud/minimap/MapLayers.tsx` (renders the cue on L1), `src/hud/minimap/Minimap.tsx` (label), `src/app/globals.css` (the pulse), `messages/en.json`, `messages/id.json`
- Test: `tests/hud/OfficeCue.test.tsx`

**Interfaces:**
- Consumes: `useOfficeSignal` (Task 6), `LOBBY.officeWing.stop`, `MINIMAP_RADIUS`.
- Produces: `OfficeCue({ center, radius }: { center: { x: number; z: number } | null; radius: number })`: an SVG group
  `data-map="office-cue"` with a ring at the stop when inside the window, else a pip on the window's rim in the
  office's direction (`center` null in the overview: ring only); `hud.map.officeAsks` string.

- [ ] **Step 1: Test first** `tests/hud/OfficeCue.test.tsx`:

```tsx
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OfficeCue } from "@/hud/minimap/OfficeCue";
import { setOfficeSignal } from "@/experience/floors/lobby/office/officeSignal";
import { LOBBY } from "@/experience/config";

const svg = (el: React.ReactNode) => render(<svg>{el}</svg>);
afterEach(() => setOfficeSignal({ asking: [] }));

describe("OfficeCue", () => {
  it("renders nothing until a Rover asks", () => {
    const { container } = svg(<OfficeCue center={null} radius={22} />);
    expect(container.querySelector('[data-map="office-cue"]')).toBeNull();
  });
  it("rings the stop when it is in the window, else pins the rim toward it", () => {
    act(() => setOfficeSignal({ asking: [1] }));
    const near = svg(<OfficeCue center={LOBBY.officeWing.stop} radius={22} />);
    expect(near.container.querySelector('[data-cue="ring"]')).not.toBeNull();
    const far = svg(<OfficeCue center={{ x: LOBBY.officeWing.stop.x, z: LOBBY.officeWing.stop.z - 60 }} radius={22} />);
    const pip = far.container.querySelector('[data-cue="pip"]')!;
    expect(Number(pip.getAttribute("cy"))).toBeGreaterThan(LOBBY.officeWing.stop.z - 60);
  });
});
```

- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** `OfficeCue.tsx`:

```tsx
"use client";

import { LOBBY } from "@/experience/config";
import { useOfficeSignal } from "@/experience/floors/lobby/office/officeSignal";

const TONE = "var(--color-pink)";

/** The minimap's Needs Kurniadi cue: a pulsing ring at the office stop, or a pip on the rim pointing at it (design 5.3). */
export function OfficeCue({ center, radius }: { center: { x: number; z: number } | null; radius: number }) {
  const on = useOfficeSignal((s) => s.needsKurniadi);
  if (!on) return null;
  const stop = LOBBY.officeWing.stop;
  const dx = center ? stop.x - center.x : 0;
  const dz = center ? stop.z - center.z : 0;
  const d = Math.hypot(dx, dz);
  if (!center || d <= radius - 2) {
    return (
      <g data-map="office-cue">
        <circle data-cue="ring" cx={stop.x} cy={stop.z} r={3.2} fill="none" stroke={TONE} strokeWidth={1.2} className="office-cue" vectorEffect="non-scaling-stroke" />
      </g>
    );
  }
  const k = (radius - 2) / d;
  return (
    <g data-map="office-cue">
      <circle data-cue="pip" cx={center.x + dx * k} cy={center.z + dz * k} r={1.6} fill={TONE} className="office-cue" />
    </g>
  );
}
```

`globals.css`:

```css
.office-cue {
  animation: office-cue 1.6s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}
@keyframes office-cue {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(1.35); }
}
@variant motion-reduce {
  .office-cue { animation: none; }
}
```

`MapLayers` gets an optional `cueCenter` prop and renders `{map.floor === "L1" && <OfficeCue center={cueCenter ?? null} radius={MINIMAP_RADIUS} />}` after the rooms;
`MinimapButton` passes `cueCenter={rover}` and appends `t("map.officeAsks")` to its `aria-label` while
`useOfficeSignal((s) => s.needsKurniadi)` on L1. Messages: `"officeAsks": ", Agent Office: a Rover is waiting for Kurniadi"`
(en) and `", Kantor Agen: sebuah Rover menunggu Kurniadi"` (id) under `hud.map`.
- [ ] **Step 4:** `bun run test tests/hud/OfficeCue.test.tsx tests/unit/minimap-model.test.ts tests/unit/messages*.test.ts`; expected PASS.
- [ ] **Step 5:** Commit `feat(office): minimap cue when a Rover needs Kurniadi`.

### Task 9: Crew summary in the drawer

**Files:**
- Create: `src/experience/floors/lobby/office/crewSummary.ts`
- Modify: `src/experience/floors/lobby/office/OfficeBody.tsx`, `messages/en.json`, `messages/id.json`
- Test: `tests/unit/office-crew-summary.test.ts`, `tests/hud/OfficeBody.test.tsx`

**Interfaces:**
- Consumes: `OfficeView`, `OfficeTranslate`.
- Produces: `crewLines(view, t, locale, now): string[]` (one sentence per desk); `crewAnnouncement(prev: OfficeView | null, next: OfficeView, t): string | null`
  (only state changes, null when none); strings `office.3d.crew.line` ("Desk {n}: {agent} is {state}, since {time}"),
  `office.3d.crew.offDuty` ("Desk {n}: off duty"), `office.3d.crew.state.<state>` (nine phrases, e.g. input "waiting for
  Kurniadi"), `office.3d.crew.title` ("Crew now").

- [ ] **Step 1: Tests first** `tests/unit/office-crew-summary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { crewAnnouncement, crewLines } from "@/experience/floors/lobby/office/crewSummary";
import { officeView } from "@/experience/floors/lobby/office/officeModel";
import { OFFICE_FIXTURES } from "@/lib/office/fixtures";
import en from "@/../messages/en.json";
import { makeT } from "../helpers/office-t";

const t = makeT(en.office);
const view = (snap = OFFICE_FIXTURES.busy) => officeView({ status: "live", snapshot: snap });

describe("crew summary", () => {
  it("has one line per desk, off-duty desks included", () => {
    const lines = crewLines(view(), t, "en", OFFICE_FIXTURES.busy.updatedAt);
    expect(lines).toHaveLength(5);
    expect(lines.every((l) => /^Desk [1-5]: /.test(l))).toBe(true);
  });
  it("announces only state changes", () => {
    const a = view();
    const b = view({ ...OFFICE_FIXTURES.busy, desks: OFFICE_FIXTURES.busy.desks.map((d, i) => (i === 0 ? { ...d, state: "input" as const, activity: "asking" as const } : d)) });
    expect(crewAnnouncement(a, a, t)).toBeNull();
    expect(crewAnnouncement(a, b, t)).toMatch(/waiting for Kurniadi/);
  });
});
```

(Create `tests/helpers/office-t.ts` if no translator helper exists yet: `makeT(messages)` resolving dotted keys and `{name}` placeholders, the way `tests/hud/OfficeBody.test.tsx` builds its `t` today; reuse that one if present.)
In `tests/hud/OfficeBody.test.tsx`: the summary drawer renders a `role="status"` region with `aria-live="polite"`,
its text changes on a state change, and two changes within 10 s produce one announcement (fake timers).
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** `crewSummary.ts`:

```ts
import { sinceLabel } from "@/lib/office/model";
import type { OfficeTranslate } from "../officeLayout";
import type { OfficeView } from "./officeModel";

/** One sentence per desk for the summary drawer's live region (design 5.6). */
export function crewLines(view: OfficeView, t: OfficeTranslate, locale: string, now: number): string[] {
  return view.rovers.map((r) =>
    r.agent
      ? t("3d.crew.line", { n: r.slot + 1, agent: t(`agent.${r.agent}`), state: t(`3d.crew.state.${r.state}`), time: r.since ? sinceLabel(r.since, now, locale) : "" })
      : t("3d.crew.offDuty", { n: r.slot + 1 }),
  );
}

/** The sentences of desks whose state changed (null when none): what the live region announces. */
export function crewAnnouncement(prev: OfficeView | null, next: OfficeView, t: OfficeTranslate): string | null {
  if (!prev) return null;
  const changed = next.rovers.filter((r) => prev.rovers[r.slot]?.state !== r.state && r.agent);
  if (!changed.length) return null;
  return changed.map((r) => t("3d.crew.change", { n: r.slot + 1, agent: t(`agent.${r.agent!}`), state: t(`3d.crew.state.${r.state}`) })).join(" ");
}
```

(Check `sinceLabel`'s real signature in `src/lib/office/model.ts` and call it the way the chips do.) In `OfficeBody`'s
summary view, render the lines in a list and a visually hidden `<p role="status" aria-live="polite">` whose text is set
from `crewAnnouncement` at most every 10 s (a ref holds the pending text and a timeout flushes it). Messages: the keys
above in both locales, Indonesian natural ("Meja {n}: {agent} sedang {state}, sejak {time}"; input "menunggu Kurniadi").
- [ ] **Step 4:** Run the two files plus `tests/unit/messages*.test.ts` and `tests/unit/client-namespaces.test.ts`; expected PASS.
- [ ] **Step 5:** Commit `feat(office): crew summary for screen readers in the drawer`.

### Task 10: Relay: sub-agent helpers (count only)

**Files:**
- Create: `tools/office-relay/src/helpers.ts`
- Modify: `tools/office-relay/src/hook.ts`, `beat.ts`, `install.ts`, `map.ts` (event names only), `store.ts` (helpers file), `tools/office-relay/README.md`, `src/lib/office/protocol.ts` (`OfficeBeatV1.helpers?`, `parseOfficeBeat`)
- Test: `tests/relay/helpers.test.ts` (new), `tests/relay/hook.test.ts`, `tests/relay/install.test.ts`, `tests/relay/fixtures.ts`, `tests/office/protocol.test.ts`

**Interfaces:**
- Produces: `OFFICE_HELPERS_MAX = 9`; `OfficeBeatV1.helpers?: number` (0 to 9; `parseOfficeBeat` rejects anything else);
  `HELPER_TTL_MS = 30 * 60_000`; `helperEvent(agent, event): "start" | "stop" | null`; `helperId(agent, payload): string | null`
  (the tool's sub-agent id field, else null); `parentSession(agent, payload): string | null` (the raw parent session id);
  `applyHelper(state: HelperState, kind, idHash, now): HelperState`, `helperCount(state, now): number` (live ids, capped
  at 9); `HelperState = { ids: Record<string, number> }` (hashed id to start time); `readHelpers` / `writeHelpers`
  (`<sessions>/<hash32>.helpers.json`); `Sent.helpers?: number`; `shouldSend` also compares `helpers`.

- [ ] **Step 1: Pin each tool's payloads.** Read the current hooks references (Copilot CLI:
  https://docs.github.com/en/copilot/reference/hooks-reference; Claude Code: https://docs.anthropic.com/en/docs/claude-code/hooks;
  Codex: the hooks page of the Codex docs) and check the installed CLIs' versions (`copilot --version`, `claude --version`,
  `codex --version`). For each tool record in `tests/relay/fixtures.ts` a start and a stop payload with the documented
  field names, plus planted secrets in every free-text field (a prompt with "sk-live-secret", a description with a
  client name from the safety fixture, a transcript path under `/Users/someone/private`). Note per tool which field names
  the parent session (Claude: `session_id`, with `agent_id` for the helper) and which names the helper. If a tool's
  payload has no parent session id (for example a sub-agent that reports its own session), `parentSession` returns null
  and that tool shows no helpers: say so in the README's mapping table. If a tool documents no sub-agent hook, leave it
  out of the install lists and document it.
- [ ] **Step 2: Tests first** `tests/relay/helpers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyHelper, HELPER_TTL_MS, helperCount, helperEvent } from "../../tools/office-relay/src/helpers";

describe("helpers", () => {
  it("maps each tool's start and stop events", () => {
    expect(helperEvent("claude", "SubagentStart")).toBe("start");
    expect(helperEvent("claude", "SubagentStop")).toBe("stop");
    expect(helperEvent("copilot", "subagentStart")).toBe("start");
    expect(helperEvent("copilot", "subagentStop")).toBe("stop");
    expect(helperEvent("claude", "PreToolUse")).toBeNull();
  });
  it("counts live ids, dedupes repeats, caps at 9 and expires after the TTL", () => {
    let s = { ids: {} as Record<string, number> };
    s = applyHelper(s, "start", "a", 0);
    s = applyHelper(s, "start", "a", 10);
    s = applyHelper(s, "start", "b", 20);
    expect(helperCount(s, 30)).toBe(2);
    s = applyHelper(s, "stop", "a", 40);
    expect(helperCount(s, 50)).toBe(1);
    expect(helperCount(s, 20 + HELPER_TTL_MS)).toBe(0);
    for (let i = 0; i < 12; i++) s = applyHelper(s, "start", `x${i}`, 100);
    expect(helperCount(s, 200)).toBe(9);
  });
  it("a stop without an id removes the oldest (tools that send no helper id)", () => {
    let s = applyHelper(applyHelper({ ids: {} }, "start", null, 0), "start", null, 5);
    s = applyHelper(s, "stop", null, 10);
    expect(helperCount(s, 11)).toBe(1);
  });
});
```

In `tests/relay/hook.test.ts`, for each tool's fixture pair: a start dispatches one beat whose JSON has `helpers: 1` and
the session's last state; the dispatched body never contains any planted secret, the helper id, the agent type or the
word from the description (`expect(body).not.toMatch(...)` for each); a second start with the same id dispatches nothing;
the stop dispatches `helpers: 0`; `runHook` returns within the same synchronous call (no network). In `install.test.ts`:
the new events are written for the tools that support them, and uninstall removes them. In `tests/office/protocol.test.ts`:
`parseOfficeBeat` accepts `helpers` 0 and 9 and rejects -1, 10, 1.5 and "2".
- [ ] **Step 3:** Run `bunx vitest run tests/relay tests/office/protocol.test.ts`; expect FAIL.
- [ ] **Step 4: Implement** `helpers.ts`:

```ts
import { createHmac } from "node:crypto";
import type { OfficeAgent } from "../../../src/lib/office/protocol";
import { OFFICE_HELPERS_MAX } from "../../../src/lib/office/protocol";

/** A helper (sub-agent) with no stop event for this long is dropped. */
export const HELPER_TTL_MS = 30 * 60_000;

export interface HelperState {
  /** Salted hash of the helper id (or a synthetic key) to its start time. */
  ids: Record<string, number>;
}

const START = new Set(["subagentstart"]);
const STOP = new Set(["subagentstop"]);

/** Whether an event starts or stops a helper (event names compared case-insensitively). */
export function helperEvent(agent: OfficeAgent, event: string): "start" | "stop" | null {
  const e = event.toLowerCase();
  if (START.has(e)) return "start";
  if (STOP.has(e)) return "stop";
  return null;
}

const str = (x: unknown): string | null => (typeof x === "string" && x.length > 0 && x.length <= 200 ? x : null);

/** The tool's own id for the helper (never sent; only its salted hash is stored locally). */
export function helperId(agent: OfficeAgent, p: Record<string, unknown>): string | null {
  return str(p.agent_id) ?? str(p.agentId) ?? str(p.subagent_id) ?? str(p.subagentId) ?? null;
}

export const hashHelper = (id: string, salt: string) => createHmac("sha256", salt).update(`helper:${id}`).digest("hex").slice(0, 32);

export function applyHelper(s: HelperState, kind: "start" | "stop", idHash: string | null, now: number): HelperState {
  const ids = Object.fromEntries(Object.entries(s.ids).filter(([, at]) => now - at < HELPER_TTL_MS));
  if (kind === "start") {
    ids[idHash ?? `anon:${now}:${Object.keys(ids).length}`] = ids[idHash ?? ""] ?? now;
    return { ids };
  }
  if (idHash && idHash in ids) delete ids[idHash];
  else if (!idHash) {
    const oldest = Object.entries(ids).sort((a, b) => a[1] - b[1])[0];
    if (oldest) delete ids[oldest[0]];
  }
  return { ids };
}

export function helperCount(s: HelperState, now: number): number {
  return Math.min(OFFICE_HELPERS_MAX, Object.values(s.ids).filter((at) => now - at < HELPER_TTL_MS).length);
}
```

(Adjust `helperId` and `parentSession` to the field names Step 1 pinned; `parentSession` returns the existing
`rawSessionId(payload)` for tools whose sub-agent payload carries the parent's session id, null otherwise.)
In `hook.ts`, before `mapEvent`: when `helperEvent(agent, safeEvent)` is not null, require `parentSession(agent, payload)`
(else log `"<agent> <event> no-parent ignored"` and return `"ignored"`), update the helper file under that session's
hash, and build the beat from the session's last sent state and activity (`readSent`; a session with none uses
`working` / `editing`) with `helpers: helperCount(...)`; send when the count changed (`shouldSend` compares `helpers`).
Every other beat carries `helpers` only when the session's helper file has a non-zero count or the last sent beat had
one (so the count reaches 0 on the server). In `protocol.ts`: `OFFICE_HELPERS_MAX = 9`, `helpers?: number` on
`OfficeBeatV1`, `"helpers"` in `BEAT_KEYS`, `optional(raw, "helpers", (x) => isInt(x, 0, OFFICE_HELPERS_MAX))`.
In `install.ts`: add `"subagentStart", "subagentStop"` to `COPILOT_EVENTS` and `"SubagentStart", "SubagentStop"` to
`CLAUDE_EVENTS` and `CODEX_EVENTS` (only for the tools Step 1 confirmed). README: the mapping table rows, the privacy
line ("only the number of active helpers leaves the machine") and the reinstall steps (Task 17).
- [ ] **Step 5:** Run the relay and protocol tests; expected PASS. Measure a hook call: `bun -e` timing of `runHook` with
  a fixture stays under 50 ms (it does no network).
- [ ] **Step 6:** Commit `feat(office-relay): count sub-agent helpers per session (count only)`.

### Task 11: Worker and snapshot: helpers per desk

**Files:**
- Modify: `workers/office/src/state.ts`, `workers/office/src/ingest.ts` (`sanitizeBeat` keeps `helpers`), `src/lib/office/protocol.ts` (`OfficeDesk.helpers?`, `isDesk`), `src/lib/office/fixtures.ts`
- Test: `tests/office/state.test.ts`, `tests/office/ingest.test.ts`, `tests/office/protocol.test.ts`

**Interfaces:**
- Produces: `TIMING.helpersTtl = 10 * 60_000`; `SessionRecord.helpers?: number`; `effectiveHelpers(s, e, now): number`;
  `OfficeDesk.helpers?: number` (1 to 9, absent at 0); a `busy` fixture desk with `helpers: 3` and one with `helpers: 6`.

- [ ] **Step 1: Tests first:** `applyBeat` stores `helpers` from a beat that carries it and keeps the previous value for
  a beat without it; `view` emits `helpers` only when the effective count is 1 to 9, drops it when the session is asleep,
  removed, or quiet for 10 min; a beat with `helpers: 0` clears it; `sanitizeBeat` passes `helpers` through for every
  repository (it is not repository data); `parseOfficeResponse` accepts a desk with `helpers` 1 and 9 and rejects 0, 10
  and a string (0 must be omitted), and the Classic and 3D parsers still accept every old fixture.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement:** in `applyBeat`, `helpers: beat.helpers ?? prev?.helpers` (omit when undefined or 0); in
  `deskOf`, `...(h > 0 ? { helpers: h } : {})` with

```ts
/** Helpers show while the session is awake and beat within the last 10 min (a lost stop event decays). */
export function effectiveHelpers(s: SessionRecord, e: Effective, now: number): number {
  if (!s.helpers || e.state === "asleep" || now - s.lastBeat >= TIMING.helpersTtl) return 0;
  return Math.min(OFFICE_HELPERS_MAX, s.helpers);
}
```

and in `protocol.ts` `"helpers"` in `DESK_KEYS` with `optional(x, "helpers", (h) => isInt(h, 1, OFFICE_HELPERS_MAX))`.
`applyChange` `privatized` keeps `helpers` (not repository data). Changing a session's helpers counts as a change for
`recent` only when the state also changed (helpers do not flood `recent`).
- [ ] **Step 4:** Run `bunx vitest run tests/office`; expected PASS.
- [ ] **Step 5:** Commit `feat(office): helpers per desk in the snapshot (optional v1 field)`.

### Task 12: Helper drones in the 3D office

**Files:**
- Modify: `officeRig.ts` (`PARTS_PER_ROVER` +4, drone writes), `crewFx.ts` (`CREW_GLOW` +4 eye lights), `officeModel.ts` (`OfficeRoverView.helpers`), `OfficeScene.tsx`
- Test: `tests/unit/office-drones.test.ts` (new), `tests/unit/office-model.test.ts`

**Interfaces:**
- Produces: `DRONES = { max: 4, r: 1.15, y: 2.5, speed: 1.2, bob: 0.06, body: [0.3, 0.12, 0.3] }`;
  `dronePoint(i: number, n: number, t: number, phase: number, reduced: boolean, out: FxPoint): FxPoint` (Rover-local,
  pure, in `crew.ts`); `writeDrones(frame, n, t, phase, reduced, parts, at)` and drone eye lights in `writeCrewGlow`
  (scaled 0 on lite or for drones beyond `n`); `OfficeRoverView.helpers: number` (0 when asleep, off duty, off or offline).

- [ ] **Step 1: Tests first:** `dronePoint` for n 1 to 4 keeps every drone at radius 1.15 from the head axis and evenly
  spaced (angle step 2 pi / n); two times give different points in full motion and the same point under reduced motion;
  `writeDrones` writes `min(n, 4)` non-zero bodies and zero-scale for the rest; on the lite tier the eye-light instances are
  zero-scale; `officeView` maps desk `helpers` to `OfficeRoverView.helpers` and zeroes it when the view is offline or off.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** in `crew.ts`:

```ts
export const DRONES = { max: 4, r: 1.15, y: 2.5, speed: 1.2, bob: 0.06, body: [0.3, 0.12, 0.3] } as const;

/** Drone `i` of `n` (at most 4 drawn) orbiting the head; parked at fixed angles under reduced motion. */
export function dronePoint(i: number, n: number, t: number, phase: number, reduced: boolean, o: FxPoint): FxPoint {
  const k = Math.max(1, Math.min(n, DRONES.max));
  const a = (i / k) * TAU + (reduced ? 0.6 : t * DRONES.speed + phase);
  o.x = Math.cos(a) * DRONES.r;
  o.y = DRONES.y + (reduced ? 0 : Math.sin(t * 2.2 + i * 1.3 + phase) * DRONES.bob);
  o.z = Math.sin(a) * DRONES.r;
  o.a = i < Math.min(n, DRONES.max) ? 1 : 0;
  return o;
}
```

`writeRover` writes parts `at + 6` to `at + 9` as drone bodies from `dronePoint` (zero scale when `o.a` is 0); the glow
key includes the drone count and, in full motion with drones, the 30 Hz tick. `OfficeScene` passes `r.helpers` and the
tier. Rest instances start with zero-scale drones.
- [ ] **Step 4:** Run the drone, model, rig and crew-fx tests; expected PASS.
- [ ] **Step 5:** Commit `feat(office): helper drones orbit their Rover`.

### Task 13: Helper text: chips, drawer, crew summary and Classic card

**Files:**
- Modify: `officeModel.ts` (`chipLines`), `OfficeChips.tsx` ("+N" pill), `OfficeBody.tsx`, `crewSummary.ts`, `src/components/office/OfficePanel.tsx`, `src/components/office/labels.ts`, `messages/en.json`, `messages/id.json`
- Test: `tests/hud/OfficeChips.test.tsx`, `tests/hud/OfficeBody.test.tsx`, `tests/hud/OfficePanel.test.tsx`, `tests/unit/office-crew-summary.test.ts`, `tests/unit/office-card-labels.test.ts`, `e2e/office-classic.spec.ts` (no layout shift with helpers)

**Interfaces:**
- Produces: message `office.helpers` = `"{n, plural, one {# helper} other {# helpers}}"` (en) and `"{n, plural, other {# asisten}}"` (id);
  `chipLines(r, t).head` = `"<Agent> · <activity> · <n helpers>"` when `r.helpers > 0`; chip pill `"+<n - 4>"` when
  `r.helpers > 4`; phone compact chips add the helpers text to `aria-label` only.

- [ ] **Step 1: Tests first:** chip head "Copilot · Editing · 3 helpers" and "Copilot · Mengedit · 3 asisten"; "1 helper";
  no helpers text at 0; a "+2" pill at 6; the desk drawer shows the same head; `crewLines` says "... is editing with 3
  helpers"; the Classic card row reads "Editing · 3 helpers" on the activity line (its labels resolved server-side through
  `officeCardLabels`, the count filled by `fill`), and `e2e/office-classic.spec.ts` adds a fixture with helpers to its
  no-layout-shift states at 1440x900 and 390x844 in both locales.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** the strings and the four places. The Classic row truncates (`truncate`) so the row height is
  unchanged; `OFFICE_RESERVE` stays as it is (the e2e proves it).
- [ ] **Step 4:** Run the listed tests plus `messages` and `client-namespaces`; expected PASS.
- [ ] **Step 5:** Commit `feat(office): helper counts on chips, drawer, summary and the Classic card`.

### Task 14: E2E, probes and fixtures

**Files:**
- Modify: `e2e/office-fixtures.ts` (a fixture per state lineup: `CREW_A` working, thinking, ci, input, done; `CREW_B` failed, asleep, working, thinking, asleep), `e2e/office.spec.ts`

- [ ] **Step 1:** Add tests to `e2e/office.spec.ts` (use `driveTo`, `waitForRoom`, the office probes, never timeouts):

```ts
test("the crew acts out each state @office", async ({ page }) => {
  await openOffice(page, CREW_A); // existing helper: routes /api/office, drives to the stop, waits for loaded
  await expect.poll(() => page.evaluate(() => window.__hq.probes.office.crew.map((c) => c.state))).toEqual(["working", "thinking", "ci", "input", "done"]);
  const crew = await page.evaluate(() => window.__hq.probes.office.crew);
  expect(crew[3].flag).toBe(1);
  expect(Math.abs(crew[2].yaw)).toBeGreaterThan(0.2);
});

test("the beacon shows from the spawn when a Rover asks, the minimap cue too @office", async ({ page }) => {
  await routeOffice(page, CREW_A);
  await bootToExplore(page);
  await expect.poll(() => page.evaluate(() => window.__hq.probes.office.beacon)).toBe(true);
  await expect(page.locator('[data-map="office-cue"]')).toBeVisible();
  await routeOffice(page, OFFICE_FIXTURES.busy);
  await page.evaluate(() => window.__hq.office.watchNow?.());
  await expect.poll(() => page.evaluate(() => window.__hq.probes.office.beacon)).toBe(false);
});

test("reduced motion holds the poses @office", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openOffice(page, CREW_A);
  await expect.poll(() => page.evaluate(() => window.__hq.probes.office.bob)).toBe(0);
  const a = await page.evaluate(() => window.__hq.probes.office.crew);
  await waitForFrames(page, 30);
  expect(await page.evaluate(() => window.__hq.probes.office.crew)).toEqual(a);
});
```

Add `__hq.office.watchNow()` (main path, test hook: runs one watch tick now) beside the existing `__hq.office` hooks.
Add a drone test: a fixture desk with `helpers: 3` draws 3 drones (probe `__hq.probes.office.drones[slot]`), one with 6
draws 4 and its chip shows "+2", reduced motion keeps the drone positions still across frames.
- [ ] **Step 2:** `bun run build && bun run e2e:changed`; expected PASS (the office specs and the smoke set).
- [ ] **Step 3:** Commit `test(office): crew states, beacon and reduced motion e2e`.

### Task 15: Budgets and the perf lane

**Files:**
- Modify: `e2e/budgets.ts`, `e2e/perf/*` (the office stop and spawn-with-beacon spots), `docs/agents/performance.md`
- Create: `docs/decisions/2026-10-2X-office-crew-budgets.md` (date of the measurement)

- [ ] **Step 1:** Add `officeTotal: 40 * 1024` to `BYTES_3D_BUDGET` and a check in the 3D bytes spec that sums the
  office scene chunk and the drawer body (and later the replay chunk) against it, measured like `office` and `officeBody`.
- [ ] **Step 2:** Run the perf lane on a free port: `E2E_PORT=4512 bun run e2e:perf`. Record: main path first frame and
  session totals (full, lite), office scene chunk, drawer body, L1 calls at the spawn (beacon off and on) and at the
  office stop on both tiers, programs, memory.
- [ ] **Step 3:** Re-set the caps by the owner rule: each touched cap is the measured value plus about 0.6 KB
  (`office`, `officeBody`, first frame, session full and lite). L1 calls must stay under 125; programs at the baseline.
- [ ] **Step 4:** Write the decision file (heading `# L1 Agent Office`, measured numbers before and after) and update
  `docs/agents/performance.md` and the AGENTS.md budget table rows for the office chunks if their values changed.
- [ ] **Step 5:** Commit `perf(office): crew budgets measured and re-set`.

### Task 16: Captures and the states video

**Files:**
- Modify: `scripts/office-shots.ts` (shots `crew-a`, `crew-b`, `beacon-spawn`; a `--video` flag)

- [ ] **Step 1:** Add the shots: `crew-a` and `crew-b` at the office stop from `CREW_A` and `CREW_B` (each with one desk
  carrying `helpers: 3` and one `helpers: 6`, realistic public titles, no debug labels); `beacon-spawn` at the
  primed spawn with one desk asking. Add `--video <dir>`: a 1440x900 full-tier context with `recordVideo`, driving to
  the stop and feeding `CREW_A`, then `CREW_B`, then the all-asleep fixture, about 6 s each (waits on the crew probe
  between feeds, the length is the recording's, not a test wait), saved as `crew-states.webm`.
- [ ] **Step 2:** Run: `bun run build && bun scripts/serve-static.ts --port 4481 --dir out &` then
  `bun scripts/office-shots.ts --base http://127.0.0.1:4481 --out <session files>/captures-a --only full-1440x900,lite-1440x900,full-820x1180,lite-820x1180,full-390x844,lite-390x844 --shots crew-a,crew-b,beacon-spawn`
  and `--video <session files>/captures-a`. Stop the server.
- [ ] **Step 3:** Look at every capture; fix overlaps (flag over a chip, beacon clipped) before sending.
- [ ] **Step 4:** Send the captures and the video to the coordinator (`send_session_message`), then wait for the owner's
  review before merge. Commit the script change: `chore(office): crew captures and states video`.

### Task 17: Docs and the PR

- [ ] **Step 1:** Update `docs/agents/office.md` (signal and watch, beacon, minimap cue), `docs/agents/floor-l1-lobby.md`
  (Agent Office: layout rows for the tower and dock, rendering counts, states table with the crew motions, probes, tests),
  `docs/features.md` (L1 Agent Office bullets and the status log line), and set this plan's `Status:` to `in review`.
- [ ] **Step 2:** `bun run verify:quick && bun run e2e:changed`; check CI in flight (`gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued`), then push and open a ready-for-review PR titled `feat(office): the living crew (revamp part A)` with the captures summary and the measured budgets.
- [ ] **Step 3:** After merge, send the coordinator the relay reinstall steps from `tools/office-relay/README.md`
  (pull main, `bun tools/office-relay/src/cli.ts install`, restart the three CLIs, Codex `/hooks` trust, `office-relay status`
  to confirm the new events and the install time), and set `Status: shipped in #N (sha), date` in a follow-up docs commit of stage B.

## Self-review notes

- Spec 5.1 to 5.7 map to Tasks 1 to 9 and 14; 5.8 (helpers) to Tasks 10 to 13; budgets (spec 8) to Task 15; captures
  and process (spec 13) to Tasks 16 and 17.
- The flag plate is an atlas quad (no instance colour on the parts mesh, which would compile a new program variant),
  so `PARTS_PER_ROVER` grows by one (the pole), not two.
- Names used across tasks: `CrewLook`, `stepCrew`, `crewFx`, `CREW_GLOW`, `GLOW_PER_ROVER`, `TOWER`, `towerLanes`,
  `officeTower`, `officeDock`, `officeTowerColumn`, `officeSignal`, `setOfficeSignal`, `useOfficeSignal`,
  `signalFromBody`, `startOfficeWatch`, `BEACON`, `beaconOrigin`, `beaconInstances`, `OfficeCue`, `crewLines`,
  `crewAnnouncement`.
