# Intro: Rover Wakes Up, Then a Reveal Orbit Implementation Plan

Status: shipped in #227 (a4fc4c6), 2026-10-19

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the intro's exterior orbit and fly-in (Round 9 M), whose first half frames the bare tower shell, with a close-up of Rover's face booting in the dark, L1 floor lights coming on in rings from Rover, and a descending reveal orbit of about 270 degrees around Rover that highlights the Lobby landmarks and hands off to the follow camera at rest.

**Architecture:** A pure timeline module (`src/experience/camera/intro.ts`) turns intro time into a camera pose, a rover heading, a face, a reveal radius and a fog range. `CameraDirector` drives it and publishes the state in a shared runtime object (`src/experience/intro/runtime.ts`) that the Lobby, the floor shaders, the rover, the Director, the landmark beacons and a camera veil read on the next frame. Landmarks stay hidden until the reveal ring reaches them (programs are already compiled at boot; `gl.compile` covers hidden objects), the grid floor and the lanes mask themselves by a shared reveal uniform, and the fog hides plain meshes beyond the ring.

**Tech Stack:** Next.js 16 static export, React Three Fiber, three 0.186, Zustand store, Vitest, Playwright (virtual frame clock `e2e/vclock.ts`).

## Global Constraints

- Owner request (verbatim): "Also current intro animation there is lots blank just square things before snatching to rover thats looks so bad wht about something like kinda orbitting L1 (you think more creatively)". Approved design: "Rover wakes up, then a reveal orbit" (about 6 to 7 s, skippable).
- Never show empty grid squares as the main subject of a shot; frame landmarks.
- L1 only: no extra floor loads. The slabs above L1 are ghosts for the whole boot and intro; L2 content never draws then.
- Budgets (`e2e/budgets.ts`): first-frame 3D JS at most 450 KB gzip, session totals at most 470 KB full and 446.4 KB lite, L1 at most 125 scene draw calls, intro peaks under 150, shader programs per floor at most `e2e/perf/baseline.json` plus 2 (no new program: the beacon uses the shared holo program, the veil a `MeshBasicMaterial` variant L1 already has).
- Skip: any drive, turn, zoom or reset input, or Esc, during the intro jumps cleanly to the follow pose (a cut softened by a 0.3 s veil). The Boot rover button still starts it (the boot card is unchanged).
- Reduced motion: no camera motion; the boot shows the dark close-up still, Boot rover cuts to the follow pose under a veil that fades out over `INTRO.reduced` (0.9 s), then explore.
- No snap at the end: the orbit lands exactly on the follow pose with zero velocity, so the follow spring takes over with no jump.
- Do not change the aesthetic beyond the request. All copy EN and ID (no new copy is planned). No em dashes anywhere. Do not edit `src/experience/scene/QualityController.tsx` or the postprocessing pipeline (a parallel session fixes a flicker there).
- Docs in the same PR: `docs/agents/3d-experience.md` (Boot and intro), `docs/agents/floor-l1-lobby.md` (hall mount, landmarks), `docs/features.md`, a dated row in `docs/decisions.md` (the intro is now skippable by input, superseding "nothing skips them"), this plan in `docs/superpowers/README.md`.

## Choreography (desktop and phone, about 6.6 s)

| t (s) | Camera | World |
|---|---|---|
| boot | still close-up on Rover's dark face (`introPose(plan, 0)`) | face `off`, reveal radius 0 (landmarks hidden, grid dark), fog tight |
| 0 to 1.1 | close-up, a slow push-in | face `off`, then `boot` (cursor) at 0.35 s, `^_^` at 0.8 s with a blink; the reveal ring starts at 0.55 s |
| 1.1 to 2.9 | pulls up and back, the orbit starts | ring spreads (radius 0 to 80 u by 3.0 s): grid and lanes light up, landmarks switch on with a neon flicker as the ring reaches them; Rover turns from the wake heading to its spawn heading (1.3 to 2.6 s) |
| 2.9 to 6.6 | descending orbit around Rover (270 degrees in total from the close-up angle), easing to rest on the follow pose | each landmark gets a floor beacon pulse when it passes through the middle of the view |
| 6.6 | follow camera, explore | landing beat (hop, blink, beep), beacons gone |

The orbit is centered on Rover's spawn. Its start angle is `endAngle - 1.5 PI`, so the sweep is 270 degrees on every camera class; Rover faces the close-up camera at boot (the wake heading) and turns to its spawn heading during the pull-back.

---

### Task 1: Pure intro timeline (`camera/intro.ts`)

**Files:**
- Create: `src/experience/camera/intro.ts`
- Modify: `src/experience/camera/rigs.ts` (remove `INTRO_RADIUS`, `INTRO_SWEEP`, `INTRO_ORBIT`, `INTRO_FLY`, `INTRO_DURATION`, `INTRO_REDUCED`, `INTRO_APPROACH`, `TOWER_CENTER`, `introAngle`, `introFlyProgress`, `introPose`, `reducedIntroPose`, and the now unused `bezier`, `lerp3` helpers if nothing else uses them)
- Test: `tests/unit/intro.test.ts` (new); `tests/unit/rigs.test.ts` (drop the intro cases)

**Interfaces:**
- Produces (exact names used by later tasks):
  - `INTRO: { wake: 1.1; duration: 6.6; faceBoot: 0.35; faceOn: 0.8; revealStart: 0.55; revealEnd: 3.0; revealReach: 80; sweep: number /* 1.5 PI */; turn: readonly [1.3, 2.6]; reduced: 0.9; skipFade: 0.3 }`
  - `FACE_Y = 1.52` (face screen center above the floor)
  - `interface IntroPlan { center: Vec3; start: number; sweep: number; wakeHeading: number; spawnHeading: number; end: CameraPose; endAngle: number; endRadius: number; endHeight: number; endAhead: number; endLookY: number; wake: { distance: number; fov: number }; peak: { radius: number; height: number }; endError: { position: Vec3; target: Vec3 } }`
  - `introPlan(cls: ViewportClass, rover: Vec3, spawnHeading: number, end: CameraPose): IntroPlan`
  - `introPose(plan: IntroPlan, t: number): CameraPose` (t clamped to [0, INTRO.duration]; exact `plan.end` at `INTRO.duration`)
  - `introHeading(plan: IntroPlan, t: number): number`
  - `introFace(t: number): "off" | "boot" | null` (null means the normal face)
  - `revealRadius(t: number): number` (0 before `revealStart`, `Infinity` after `revealEnd`)
  - `introFog(camDistance: number, reveal: number, follow: { near: number; far: number }): { near: number; far: number }`
  - `cubicBezierEase(x1: number, y1: number, x2: number, y2: number): (s: number) => number`

- [ ] **Step 1: Write the failing tests** in `tests/unit/intro.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { followPose, FOLLOW_LOOK_AHEAD, followForward } from "@/experience/camera/rigs";
import { cubicBezierEase, FACE_Y, INTRO, introFace, introFog, introHeading, introPlan, introPose, revealRadius } from "@/experience/camera/intro";
import { LOBBY, SHAFT } from "@/experience/config";
import type { ViewportClass } from "@/experience/types";

const rover: [number, number, number] = [LOBBY.spawn.x, 0, LOBBY.spawn.z];
// The primed spawn views (L1:kiosk): desktop turned 0.62 rad, tablet and phone straight down the kiosk axis (zoom from observatoryLayout).
const endFor = (cls: ViewportClass, yaw: number, zoom: number) => {
  const f = followForward(cls, yaw);
  const ahead = FOLLOW_LOOK_AHEAD[cls];
  return followPose(cls, [rover[0] + f.x * ahead, 1, rover[2] + f.z * ahead], yaw, zoom);
};
const cases: [ViewportClass, number, number][] = [
  ["desktop", 0.9, 1.5],
  ["mobile", 0.3, 1.75],
];
const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));

describe("intro timeline", () => {
  it("lands exactly on the follow pose at rest", () => {
    for (const [cls, yaw, zoom] of cases) {
      const end = endFor(cls, yaw, zoom);
      const plan = introPlan(cls, rover, LOBBY.spawnHeading, end);
      const last = introPose(plan, INTRO.duration);
      expect(dist(last.position, end.position)).toBeLessThan(1e-9);
      expect(dist(last.target, end.target)).toBeLessThan(1e-9);
      expect(last.fov).toBeCloseTo(end.fov, 9);
      const near = introPose(plan, INTRO.duration - 1 / 60);
      expect(dist(near.position, end.position) * 60).toBeLessThan(0.5);
      expect(introPose(plan, INTRO.duration + 5)).toEqual(last);
    }
  });

  it("opens on a close-up of the face and sweeps 270 degrees around Rover", () => {
    for (const [cls, yaw, zoom] of cases) {
      const plan = introPlan(cls, rover, LOBBY.spawnHeading, endFor(cls, yaw, zoom));
      const first = introPose(plan, 0);
      const toFace = Math.hypot(first.position[0] - first.target[0], first.position[2] - first.target[2]);
      expect(toFace).toBeLessThan(3.5);
      expect(first.target[1]).toBeCloseTo(FACE_Y, 1);
      expect(plan.sweep).toBeCloseTo(1.5 * Math.PI);
      expect(plan.wakeHeading).toBeCloseTo(plan.start);
      // The camera's angle around Rover never goes back.
      let prev = -Infinity;
      for (let i = 0; i <= 400; i++) {
        const p = introPose(plan, (INTRO.duration * i) / 400).position;
        const a = Math.atan2(p[0] - rover[0], p[2] - rover[2]);
        const unwrapped = prev === -Infinity ? a : prev + Math.atan2(Math.sin(a - prev), Math.cos(a - prev));
        expect(unwrapped).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = unwrapped;
      }
    }
  });

  it("never moves faster than a cinematic pace and never jumps between frames", () => {
    for (const [cls, yaw, zoom] of cases) {
      const plan = introPlan(cls, rover, LOBBY.spawnHeading, endFor(cls, yaw, zoom));
      for (let i = 1; i <= INTRO.duration * 60; i++) {
        const a = introPose(plan, (i - 1) / 60).position;
        const b = introPose(plan, i / 60).position;
        expect(dist(a, b) * 60).toBeLessThan(60);
      }
    }
  });

  it("stays above the floor, out of the elevator shaft and above the skills wall", () => {
    const wall = LOBBY.skillsWall;
    for (const [cls, yaw, zoom] of cases) {
      const plan = introPlan(cls, rover, LOBBY.spawnHeading, endFor(cls, yaw, zoom));
      for (let i = 0; i <= 600; i++) {
        const [x, y, z] = introPose(plan, (INTRO.duration * i) / 600).position;
        expect(y).toBeGreaterThan(0.8);
        const inShaft = Math.abs(x - SHAFT.x) < SHAFT.size / 2 + 1 && Math.abs(z - SHAFT.z) < SHAFT.size / 2 + 1;
        expect(inShaft).toBe(false);
        const overWall = Math.abs(x - wall.x) < wall.w / 2 + 1 && Math.abs(z - wall.z) < wall.d / 2 + 1;
        if (overWall) expect(y).toBeGreaterThan(wall.h + 1);
      }
    }
  });

  it("turns Rover from the wake heading to the spawn heading during the pull-back", () => {
    const plan = introPlan("desktop", rover, LOBBY.spawnHeading, endFor("desktop", 0.9, 1.5));
    expect(introHeading(plan, 0)).toBeCloseTo(plan.wakeHeading);
    expect(introHeading(plan, INTRO.turn[0])).toBeCloseTo(plan.wakeHeading);
    const done = introHeading(plan, INTRO.turn[1]);
    expect(Math.cos(done - LOBBY.spawnHeading)).toBeCloseTo(1, 9);
  });

  it("boots the face, then hands back to the normal face", () => {
    expect(introFace(0)).toBe("off");
    expect(introFace(INTRO.faceBoot)).toBe("boot");
    expect(introFace(INTRO.faceOn)).toBeNull();
  });

  it("spreads the reveal ring from Rover and then turns it off", () => {
    expect(revealRadius(0)).toBe(0);
    expect(revealRadius(INTRO.revealStart)).toBe(0);
    expect(revealRadius((INTRO.revealStart + INTRO.revealEnd) / 2)).toBeGreaterThan(0);
    expect(revealRadius(INTRO.revealEnd - 1e-6)).toBeLessThanOrEqual(INTRO.revealReach);
    expect(revealRadius(INTRO.revealEnd)).toBe(Infinity);
    for (let i = 1; i < 100; i++) expect(revealRadius(i * 0.03)).toBeGreaterThanOrEqual(revealRadius((i - 1) * 0.03));
  });

  it("opens the fog with the ring and ends on the follow range", () => {
    const follow = { near: 38, far: 80 };
    const dark = introFog(2.3, 0, follow);
    expect(dark.far).toBeLessThan(20);
    expect(dark.near).toBeGreaterThan(2.3);
    expect(introFog(40, Infinity, follow)).toEqual(follow);
  });

  it("eases like a CSS cubic-bezier", () => {
    const ease = cubicBezierEase(0.42, 0, 0.58, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5, 3);
    expect(ease(0.01)).toBeLessThan(0.01);
  });
});
```

- [ ] **Step 2: Run** `bun run test -- tests/unit/intro.test.ts` and confirm it fails (module missing). (Check `package.json` for the exact Vitest script name; `bunx vitest run tests/unit/intro.test.ts` works too.)

- [ ] **Step 3: Implement `src/experience/camera/intro.ts`**:

```ts
import type { ViewportClass } from "../types";
import type { CameraPose, Vec3 } from "./rigs";

/** Intro timeline (s): the wake close-up, the reveal ring, the pull-back and the orbit, then explore (owner design 2026-10-18). */
export const INTRO = {
  wake: 1.1,
  duration: 6.6,
  faceBoot: 0.35,
  faceOn: 0.8,
  revealStart: 0.55,
  revealEnd: 3.0,
  revealReach: 80,
  sweep: 1.5 * Math.PI,
  turn: [1.3, 2.6] as const,
  reduced: 0.9,
  skipFade: 0.3,
} as const;

/** Height of the rover's face screen center above its floor (Rover.tsx head at 1.5, screen +0.02). */
export const FACE_Y = 1.52;
/** How far in front of the face screen the camera looks at it (the screen sits 0.45 u in front of the rover's center). */
const FACE_AHEAD = 0.45;
const WAKE: Record<ViewportClass, { distance: number; fov: number }> = {
  desktop: { distance: 2.3, fov: 36 },
  tablet: { distance: 2.7, fov: 42 },
  mobile: { distance: 3.1, fov: 46 },
};
/** The orbit's high point after the pull-back (u above Rover's floor, radius around Rover). */
const PEAK: Record<ViewportClass, { radius: number; height: number }> = {
  desktop: { radius: 20, height: 30 },
  tablet: { radius: 22, height: 34 },
  mobile: { radius: 24, height: 40 },
};
/** How far past Rover the camera looks during the orbit, so the far side of the plaza (the landmarks) fills the frame. */
const ACROSS = 10;
const ACROSS_Y = 2.5;

export function cubicBezierEase(x1: number, y1: number, x2: number, y2: number): (s: number) => number {
  const bx = (u: number) => 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
  const by = (u: number) => 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
  const dx = (u: number) => 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
  return (s: number) => {
    if (s <= 0) return 0;
    if (s >= 1) return 1;
    let u = s;
    for (let i = 0; i < 8; i++) {
      const d = dx(u);
      if (Math.abs(d) < 1e-6) break;
      u = Math.min(1, Math.max(0, u - (bx(u) - s) / d));
    }
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 30 && Math.abs(bx(u) - s) > 1e-7; i++) {
      if (bx(u) < s) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return by(u);
  };
}

const span = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const smooth = (x: number) => x * x * (3 - 2 * x);
/** Pull-back: leaves the close-up gently, settles early. */
const pullEase = cubicBezierEase(0.35, 0, 0.2, 1);
/** Orbit: builds up, then a long settle onto the follow pose (zero velocity at the end). */
const orbitEase = cubicBezierEase(0.45, 0, 0.25, 1);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface IntroPlan {
  center: Vec3;
  start: number;
  sweep: number;
  wakeHeading: number;
  spawnHeading: number;
  end: CameraPose;
  endAngle: number;
  endRadius: number;
  endHeight: number;
  endAhead: number;
  endLookY: number;
  wake: { distance: number; fov: number };
  peak: { radius: number; height: number };
  /** What the raw path misses `end` by at the end; added in with the orbit ease, so the intro lands exactly on `end`. */
  endError: { position: Vec3; target: Vec3 };
}

export function introPlan(cls: ViewportClass, rover: Vec3, spawnHeading: number, end: CameraPose): IntroPlan {
  const [cx, cy, cz] = rover;
  const ex = end.position[0] - cx;
  const ez = end.position[2] - cz;
  const endAngle = Math.atan2(ex, ez);
  const start = endAngle - INTRO.sweep;
  const plan: IntroPlan = {
    center: rover,
    start,
    sweep: INTRO.sweep,
    wakeHeading: start,
    spawnHeading,
    end,
    endAngle,
    endRadius: Math.hypot(ex, ez),
    endHeight: end.position[1] - cy,
    // The follow target lies on the line from the camera through Rover (followPose), endAhead past Rover.
    endAhead: -((end.target[0] - cx) * Math.sin(endAngle) + (end.target[2] - cz) * Math.cos(endAngle)),
    endLookY: end.target[1] - cy,
    wake: WAKE[cls],
    peak: PEAK[cls],
    endError: { position: [0, 0, 0], target: [0, 0, 0] },
  };
  const raw = rawPose(plan, INTRO.duration);
  plan.endError = {
    position: [0, 1, 2].map((i) => end.position[i] - raw.position[i]) as Vec3,
    target: [0, 1, 2].map((i) => end.target[i] - raw.target[i]) as Vec3,
  };
  return plan;
}

function rawPose(plan: IntroPlan, t: number): CameraPose {
  const { wake, peak } = plan;
  const push = smooth(span(t, 0, INTRO.wake));
  const pull = pullEase(span(t, INTRO.wake, INTRO.wake + 1.8));
  const orbit = orbitEase(span(t, INTRO.wake, INTRO.duration));
  const settle = orbitEase(span(t, INTRO.wake + 0.9, INTRO.duration));
  const angle = plan.start + plan.sweep * orbit;
  const radius = wake.distance * (1 - 0.1 * push) + (peak.radius - wake.distance * 0.9) * pull + (plan.endRadius - peak.radius) * settle;
  const height = FACE_Y + 0.1 + (peak.height - FACE_Y - 0.1) * pull + (plan.endHeight - peak.height) * settle;
  const ahead = -FACE_AHEAD + (ACROSS + FACE_AHEAD) * pull + (plan.endAhead - ACROSS) * settle;
  const lookY = FACE_Y + (ACROSS_Y - FACE_Y) * pull + (plan.endLookY - ACROSS_Y) * settle;
  const fov = wake.fov + (plan.end.fov - wake.fov) * orbit;
  const [cx, cy, cz] = plan.center;
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  return {
    position: [cx + s * radius, cy + height, cz + c * radius],
    target: [cx - s * ahead, cy + lookY, cz - c * ahead],
    fov,
  };
}

export function introPose(plan: IntroPlan, t: number): CameraPose {
  const at = Math.min(INTRO.duration, Math.max(0, t));
  if (at >= INTRO.duration) return { position: [...plan.end.position], target: [...plan.end.target], fov: plan.end.fov };
  const raw = rawPose(plan, at);
  const k = orbitEase(span(at, INTRO.wake, INTRO.duration));
  const { position: dp, target: dt } = plan.endError;
  return {
    position: [raw.position[0] + dp[0] * k, raw.position[1] + dp[1] * k, raw.position[2] + dp[2] * k],
    target: [raw.target[0] + dt[0] * k, raw.target[1] + dt[1] * k, raw.target[2] + dt[2] * k],
    fov: raw.fov,
  };
}

export function introHeading(plan: IntroPlan, t: number): number {
  const k = smooth(span(t, INTRO.turn[0], INTRO.turn[1]));
  return plan.wakeHeading + wrap(plan.spawnHeading - plan.wakeHeading) * k;
}

export function introFace(t: number): "off" | "boot" | null {
  if (t < INTRO.faceBoot) return "off";
  if (t < INTRO.faceOn) return "boot";
  return null;
}

export function revealRadius(t: number): number {
  if (t >= INTRO.revealEnd) return Infinity;
  if (t <= INTRO.revealStart) return 0;
  return INTRO.revealReach * Math.pow(span(t, INTRO.revealStart, INTRO.revealEnd), 1.6);
}

/** Fog during the boot and the intro: everything farther than the ring (as seen from the camera) fades into the night. */
export function introFog(camDistance: number, reveal: number, follow: { near: number; far: number }): { near: number; far: number } {
  if (!Number.isFinite(reveal)) return { ...follow };
  const near = Math.min(follow.near, camDistance + reveal + 1);
  return { near, far: Math.min(follow.far, near + 12) };
}
```

Note: the constants (`PEAK`, `ACROSS`, eases, `WAKE`) are first guesses to be tuned from captures in Task 6; keep the tests green when tuning.

- [ ] **Step 4: Remove the old intro exports from `rigs.ts` and their cases from `tests/unit/rigs.test.ts`** (keep everything else, including `selectRig`). `CameraDirector.tsx` will not compile until Task 4; to keep the tree green between commits, in this task change only the imports in `CameraDirector.tsx` minimally: replace the intro branch with the new `introPlan`/`introPose` and `INTRO.duration` (no skip, veil or runtime yet), and set `roverRuntime.introFly` to `-1`.

- [ ] **Step 5: Run** `bunx vitest run tests/unit/intro.test.ts tests/unit/rigs.test.ts` and `bunx tsc --noEmit -p .`; both pass.

- [ ] **Step 6: Commit** `feat(intro): pure wake and reveal orbit timeline`.

### Task 2: Shared intro runtime and reveal-masked floor shaders

**Files:**
- Create: `src/experience/intro/runtime.ts`
- Modify: `src/experience/fx/materials.ts` (`createGridFloorMaterial`, `createLaneMaterial`)
- Test: `tests/unit/intro-reveal.test.ts` (new)

**Interfaces:**
- Produces:
  - `introRuntime: { active: boolean; t: number; reveal: number; heading: number | null; face: "off" | "boot" | null; veil: number; lit: string[]; skipped: boolean }` (defaults: `active false, t -1, reveal Infinity, heading null, face null, veil 0, lit [], skipped false`)
  - `revealUniforms: { uReveal: { value: number }; uRevealAt: { value: Vector2 } }` (shared by reference by every grid and lane material; `uReveal` 1e5 when off)
  - `setReveal(radius: number, at: { x: number; z: number }): void` (writes `introRuntime.reveal` and the uniforms; `Infinity` writes 1e5)
  - `resetIntroRuntime(): void`

- [ ] **Step 1: Failing test** `tests/unit/intro-reveal.test.ts`: every grid and lane material shares `revealUniforms.uReveal` by reference; the fragment shaders contain `uReveal`; `setReveal(Infinity, ...)` writes 1e5 and `introRuntime.reveal === Infinity`; `setReveal(12, {x: 1, z: 2})` writes 12 and the origin.

- [ ] **Step 2: Implement** `runtime.ts`, then the shaders. Grid fragment (keep the old math, multiply by `lit`, add the wavefront; with `uReveal` 1e5 the output is bit-identical: `lit` is exactly 1 and both rings are exactly 0):

```glsl
uniform float uReveal; uniform vec2 uRevealAt;
...
float rr = length(vW - uRevealAt);
float lit = 1. - smoothstep(uReveal - 3., uReveal, rr);
float front = exp(-pow((rr - uReveal) / 1.1, 2.)) + .35 * exp(-pow((rr - uReveal + 7.) / 2.2, 2.));
vec3 c = uBg + (uLine*(l1*.07 + l5*.2)*fade + vec3(.012,.012,.03)*(1.-min(d,1.)))*lit + uLine*(l1*.8 + l5*1.2 + .18)*front*step(rr, uReveal + 4.);
```

Lane material: pass the world xz from the vertex shader (`vW = (modelMatrix*vec4(position,1.)).xz`) and multiply `a` by the same `lit`, adding `front * .8` to `a` inside `step(rr, uReveal + 4.)`.

- [ ] **Step 3: Run** the new test plus `bunx vitest run tests/unit` for anything snapshotting these shaders; pass.
- [ ] **Step 4: Commit** `feat(intro): shared reveal runtime and ring-masked grid and lanes`.

### Task 3: Rover wake (face and heading)

**Files:**
- Modify: `src/experience/types.ts` (`RoverFace` adds `"off"` and `"boot"`), `src/experience/rover/faces.ts`, `src/experience/rover/faceTexture.ts`, `src/experience/scene/Director.tsx`
- Test: `tests/unit/faces.test.ts` (extend or create)

**Interfaces:**
- Consumes: `introRuntime.face`, `introRuntime.heading` (Task 2).
- Produces: `FaceInput.wake?: "off" | "boot" | null`; `faceFrame("off")` gives `{ lines: [""], key: "off" }`; `faceFrame("boot", t)` gives a blinking `"_"` cursor (key changes only on the blink).

- [ ] **Step 1: Failing tests**: `faceFor({..., wake: "off"})` is `"off"` (wins over everything but a ride); `faceFrame("off", 0).key` is `"off"`; `faceFrame("boot", 0).lines[0]` is `"_"` and `faceFrame("boot", 0.3).lines[0]` is `" "` (2.5 Hz blink).
- [ ] **Step 2: Implement.** `drawFace`: when `frame.key === "off"` fill `#010603` only (no scanlines, no text). Director: right after it writes `roverRuntime.heading = pose.heading`, `if ((s.phase === "boot" || s.phase === "intro") && introRuntime.heading !== null) roverRuntime.heading = introRuntime.heading;` and pass `wake: s.phase === "boot" || s.phase === "intro" ? introRuntime.face : null` into `faceFor`.
- [ ] **Step 3: Run** the face tests and `bunx tsc --noEmit -p .`; pass. **Commit** `feat(intro): Rover's face boots and it turns to its spawn heading`.

### Task 4: Lobby reveal, landmark beacons and hall at boot

**Files:**
- Create: `src/experience/intro/landmarks.ts` (pure), `src/experience/intro/IntroReveal.tsx`, `src/experience/intro/IntroBeacons.tsx`
- Modify: `src/experience/fx/holoFx.ts` (mode `beacon: 14`), `src/experience/floors/Lobby.tsx`, `src/experience/tower/visibility.ts`, `src/experience/tower/FloorLevel.tsx`
- Test: `tests/unit/intro-landmarks.test.ts` (new), `tests/unit/tower-visibility.test.ts`, `tests/unit/holo-*.test.ts` if they enumerate modes

**Interfaces:**
- Produces:
  - `INTRO_LANDMARKS: readonly { id: "stats" | "skills" | "hall" | "observatory" | "elevator"; x: number; z: number; w: number; d: number; y: number }[]` (beacon footprint center and size on the floor, `y` the height the pass check projects), built from `LOBBY`, `HALL` and `SHAFT`.
  - `revealDistance(rover: { x: number; z: number }, rect: { minX: number; maxX: number; minZ: number; maxZ: number }): number` (0 inside).
  - `beaconAlpha(sinceHit: number): number` (0 before, rises over 0.3 s, holds, gone by 2 s).
  - `<IntroReveal rect={...}>` wraps Lobby children: visible when `!introRuntime.active` or the ring has reached `rect` (with a 0.06 s on, 0.08 s off neon flicker after the crossing).
  - `<IntroBeacons />`: one instanced holo mesh (mode 14, 5 instances, `aAlpha`), mounted by `Lobby` only in `boot` and `intro`; each frame it projects every landmark through the camera and latches its hit time when `|ndc.x| < 0.55 && |ndc.y| < 0.75` and `introRuntime.t > INTRO.wake`, pushing the id into `introRuntime.lit`.
- Visibility: during boot and intro only L1 content draws (`contentVisible` drops the L2 clause and the `introFly` input), and the slabs above Rover are ghosts from the first boot frame (`FloorLevel` fade is 1; `introGhost` and `INTRO_GHOST_BY` go away).
- Hall: `useHallReady` wants `(ride?.to ?? floor) === "L1"` (no phase condition), so the hall builds during the boot card.

- [ ] **Step 1: Failing tests** for `INTRO_LANDMARKS` (five ids, footprints inside `LOBBY.bounds`), `revealDistance`, `beaconAlpha`, and the new `contentVisible` rule (exterior: L1 true, L2 false).
- [ ] **Step 2: Implement.** Beacon fragment (add to `HOLO_FS` and `HOLO_MODE`):

```glsl
} else if (uMode == 14) {
  vec2 p = (vUv - .5) * vSize;
  float r = min(vSize.x, vSize.y) * .5;
  vec2 q = abs(p) - (vSize * .5 - r);
  float d = length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r;
  float rim = exp(-d * d * 7.);
  float wash = smoothstep(-3., 0., d) * step(d, 0.) * .22;
  float scan = .75 + .25 * sin(uTime * 5. - length(p) * .9);
  col = c * (rim * 1.5 + wash) * scan;
  a = (rim * .85 + wash) * vAlpha;
}
```

Wrap in `Lobby.tsx`: `Lanes` (rect of the lane ring and spokes), `ProfileHologram` with `StatsRing` (the ring rect), `SkillsWall`, `CertWall`, `MissionKiosk`, the `VisitsStation` Suspense, `HighlightsHall`. `IntroBeacons` renders when `phase` is `boot` or `intro`.
- [ ] **Step 3: Run** the unit tests and `bunx tsc --noEmit -p .`; pass. **Commit** `feat(intro): landmarks switch on with the reveal ring and light up as the orbit passes`.

### Task 5: CameraDirector integration, skip, reduced-motion crossfade and the veil

**Files:**
- Create: `src/experience/intro/IntroVeil.tsx`
- Modify: `src/experience/camera/CameraDirector.tsx`, `src/experience/scene/Scene.tsx` (mount `IntroVeil` after `CameraDirector`), `src/experience/Experience.tsx` (`__hq.intro` probe), `src/experience/rover/runtime.ts` (remove `introFly`), `src/experience/scene/Director.tsx` (Esc comment)
- Test: `tests/unit/intro.test.ts` (skip helper if extracted)

**Behavior:**
- Boot: `plan = introPlan(cls, rover, LOBBY.spawnHeading, end)` (end as today: the primed spawn follow pose); camera `introPose(plan, 0)`; `introRuntime = { active: true, t: 0, face: "off", heading: plan.wakeHeading, reveal: 0, veil: 0 }`; fog `introFog(dist, 0, follow)`.
- Intro, full motion: `t = now - introStart`; pose, heading, face, `setReveal(revealRadius(t), rover)`, fog `introFog(|camera - rover|, reveal, follow)`; at `t >= INTRO.duration`: `finishIntro()`, `resetIntroRuntime()`.
- Skip: in the intents handler, during `intro` (never `boot`), `move`, `orbit`, `zoom`, `view` and `cancel` set `l.skip`. Next frame: `finishIntro()`, `l.cut = true`, `resetIntroRuntime()`, `introRuntime.veil = 0.6` and `introRuntime.skipped = true`; `IntroVeil` fades the veil to 0 over `INTRO.skipFade`.
- Reduced motion: boot holds `introPose(plan, 0)` (dark still). On intro: cut to `end`, reveal off at once (`setReveal(Infinity)`), heading spawn, face null, `veil = 1` easing linearly to 0 over `INTRO.reduced`, then `finishIntro()`.
- `IntroVeil`: a camera-facing quad 0.5 u in front of the camera covering the view (`MeshBasicMaterial`, `color` the scene background, `transparent`, `depthTest false`, `depthWrite false`, `toneMapped false`, `renderOrder 1e9`), `visible` only while `introRuntime.veil > 0`; it decays `veil` by `dt / INTRO.skipFade` after a skip.
- Probe: `__hq.intro = introRuntime`.
- Director keeps Esc as a no-op in `boot`; the comment says the camera's intro skip owns Esc in `intro`.

- [ ] **Step 1:** Implement, then `bunx tsc --noEmit -p .` and `bunx vitest run tests/unit`; pass.
- [ ] **Step 2:** `bun run dev -- -p 3417` and `bun scripts/intro-shots.ts --base http://localhost:3417 --out <session dir>/intro-after` (desktop and phone); look at the strips.
- [ ] **Step 3: Commit** `feat(intro): drive the wake and reveal orbit, skip on input, reduced-motion crossfade`.

### Task 6: Tune from captures, e2e, perf, docs

**Files:**
- Modify: `e2e/experience.spec.ts` (the three intro tests), `e2e/motion.spec.ts` (intro under OS reduce), `e2e/visual-gate.spec.ts` (intro pose frame), `scripts/readme-hero.ts` (comment about the intro), docs listed in Global Constraints, `docs/superpowers/README.md`.

- [ ] **Step 1:** Tune `WAKE`, `PEAK`, `ACROSS`, eases and beacon thresholds until the strips show: the face close-up, the ring, each landmark lit, no frame dominated by empty grid, a seamless handoff (1440x900 and 390x844).
- [ ] **Step 2: e2e.** Replace "the intro flies down to the rover in one continuous move and lands on the follow view" with "the intro opens on Rover's face, lights the Lobby and lands on the follow view": sample `__hq.intro` and the camera each frame; assert the first intro frame is within 4 u of Rover, `reveal` goes from 0 to `Infinity`, `lit` holds all five landmark ids before explore, the intro lasts at least 5 s, and the first explore frame is within 0.5 u of the last intro frame. Replace "driving during the fly-in" with "input skips the intro to the follow view" (press `w` 0.5 s after Boot rover, explore within 10 frames, `__hq.intro.skipped` true, camera within 1 u of the explore pose 5 frames later). Replace "reduced motion holds a still intro of the same length" with "reduced motion crossfades to the follow view without moving" (camera still between two reads during intro, explore within 3 s).
- [ ] **Step 3:** `bun run verify:quick`, `bun run e2e:changed`, and `E2E_PORT=<port> bun run e2e:perf` (boot and intro peaks, bytes, L1 calls, programs).
- [ ] **Step 4:** Docs and the decisions row; commit `docs(intro): wake and reveal orbit`.
- [ ] **Step 5:** Captures for the owner (frame strips and MP4 at 1440x900 and 390x844, plus reduced motion) sent to the coordinator; PR opened ready for review; no merge before the owner's OK.
