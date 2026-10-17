# Camera Fixes (Round 9 M) Implementation Plan

Status: shipped in #197, 2026-10-17 (Round 9, sub-project M).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No black flicker with a low camera, no flicker when hovering the L3 directory boards, and a continuous intro fly-in that lands behind the rover.

**Architecture:** Pure camera math stays in `src/experience/camera/*` and `src/experience/interact/pick.ts` (Vitest in node); `CameraDirector`, `FloorLevel` and `InteractLayer` only apply it. One new runtime probe (`roverRuntime.introFly`) carries the fly-in progress from the camera to the slabs.

**Tech Stack:** Next.js 16 static export, React Three Fiber, three.js, Vitest, Playwright (SwiftShader).

## Global Constraints

- No em dashes anywhere (code, comments, docs, commits, PR text).
- Budgets: 3D first-frame gate 450 KB, session totals 470/446.4 KB, floor chunk caps, L1 at most 125 draw calls, floors under 150 calls and 30k triangles, no new shader program, memory gates.
- Reduced motion respected: the intro keeps today's still shot (2.5 s) and cut.
- Keep the deep-link intro path (`?view=architecture`, room links) working.
- Keep changes in camera and pointer code (siblings own the rover idle animations, the L1 skills wall and the HUD menu).
- Docs current in the same PR: `docs/agents/3d-experience.md`, `docs/agents/floors.md`, `docs/features.md`, `docs/decisions.md`.

## Root causes (systematic-debugging, Phase 1 evidence)

Captures: SwiftShader, served export, per-frame canvas reads (`scripts/_mprobe-*.ts`, not committed).

1. **Low camera black band (3.1).** At the lowest pitch the follow camera sits 2.2 to 3.7 u above the floor and 25 to 44 u behind the rover. `cameraBlocked` lets a camera stand outside the slab once it is 2.5 u (`CAMERA_CLEARANCE.edge`) above the floor, so a low camera hangs off the slab edge and the bottom of its view looks into the void under the slab (flat background). Per-frame logs on L1 and L4: the bottom quarter is dark in 40 of 41 frames with the camera off the slab and in 3 of 39 on it. Driving or turning moves the camera across the edge and across the 2.5 u line, so the band pops on and off. The clamp also runs on the wanted pose only; the smoothed pose may cut through blocked space between two valid poses.
   - Rejected: the near plane cutting the floor. The follow camera never drew below 1.47 u (the clamp pulls toward the rover target at 1 u), and the near plane reaches at most `near / cos(fov / 2)` = 0.56 u below the eye at the widest FOV (55 degrees), under the 0.6 u ground clearance.
2. **L3 board hover flicker (3.2).** The hover state is stable: sweeping the pointer across all three boards (20 points each) logs exactly one transition per board (`L3:board:*`), so the pick ray never alternates (only the instanced pick mesh has handlers; troika text is never raycast). The L3 boards are the only targets whose pick volume is the object itself (`box` = the board solid, `wallSolids`), so the hover `Highlight` (outline edges and the full-tier additive fill box) is coplanar with the board faces: z-fighting, which shimmers on a GPU as the camera moves.
3. **Intro snap (3.3).** The intro flies from the orbit's end to the follow pose in 0.6 s on a straight line (3 frames on SwiftShader). During `boot` and `intro` FloorLevel keeps every slab solid and draws L2's content, and the follow pose sits above L2 (19 to 30 u, `FLOOR_GAP` 14), so the last fly-in frames show the opaque L2 slab (two fully black frames), then explore turns L2 into a ghost and the Lobby pops in.

## File map

| File | Change |
|---|---|
| `src/experience/camera/collision.ts` | View-aware edge rule (`viewOnSlab`, `clampCamera(..., fov)`) |
| `src/experience/camera/CameraDirector.tsx` | Pass the FOV to the clamp, clamp the smoothed pose, intro fly-in timing, takeover, fog mix, `introFly` probe |
| `src/experience/camera/rigs.ts` | `INTRO_FLY` 1.7 s, `INTRO_REDUCED` 2.5 s, `introFlyProgress`, curved `introPose` |
| `src/experience/rover/runtime.ts` | `introFly`, `blinkUntil` |
| `src/experience/tower/visibility.ts` | `introGhost`, `contentVisible` hides L2 once the fly-in starts |
| `src/experience/tower/FloorLevel.tsx` | Slabs above fade to ghosts over the fly-in |
| `src/experience/scene/Director.tsx` | Landing beat: beep and blink with the existing greet |
| `src/experience/rover/Rover.tsx` | One read of `roverRuntime.blinkUntil` |
| `src/experience/interact/pick.ts`, `InteractLayer.tsx` | `highlightVolume` (pick volume grown by `HIGHLIGHT_MARGIN`) |
| `tests/unit/camera-collision.test.ts`, `rigs.test.ts`, `tower-visibility.test.ts`, `interact-pick.test.ts` | Unit tests |
| `e2e/camera.spec.ts`, `e2e/interact.spec.ts`, `e2e/experience.spec.ts` | Low camera sweep, L3 hover sweep, intro fly-in and takeover (the existing reduced-motion intro test stays) |

---

### Task 1: Low cameras stay on the slab (3.1)

**Files:** Modify `src/experience/camera/collision.ts`, `src/experience/camera/CameraDirector.tsx`; Test `tests/unit/camera-collision.test.ts`.

**Interfaces:** Produces `viewOnSlab(camera: Vec3, target: Vec3, w: CameraWorld, fov: number): boolean` and `clampCamera(target, camera, w, from = target, fov?: number): Vec3`.

- [x] **Step 1: Failing tests** in `camera-collision.test.ts`:

```ts
it("pulls a low camera off the slab edge back until the bottom of its view lands on the slab", () => {
  // Low view (about 3.5 degrees) from outside the east edge (x = 20), looking west at the rover.
  const target: Vec3 = [10, 1, 0];
  const cam: Vec3 = [44, 3.1, 0];
  expect(viewOnSlab(cam, target, world, 40)).toBe(false);
  const out = clampCamera(target, cam, world, target, 40);
  expect(viewOnSlab(out, target, world, 40)).toBe(true);
  // Same view ray: the camera only moves in.
  expect((out[1] - 1) / (out[0] - 10)).toBeCloseTo((3.1 - 1) / 34);
});

it("keeps a high camera outside the slab while the bottom of its view lands on the slab", () => {
  const target: Vec3 = [14, 1, 0];
  const cam: Vec3 = [26, 19, 0];
  expect(viewOnSlab(cam, target, world, 40)).toBe(true);
  expect(clampCamera(target, cam, world, target, 40)).toBe(cam);
});

it("keeps the near plane above the floor at the ground clearance for every FOV", () => {
  for (const fov of [35, 40, 42, 45, 50, 55, 65, 70, 80]) {
    expect(CAMERA_NEAR / Math.cos(((fov / 2) * Math.PI) / 180)).toBeLessThan(CAMERA_CLEARANCE.ground);
  }
});
```

Extend "leaves the default follow and L2 cameras alone on every floor" to pass `fov` (`follow.fov`, `rail.fov`) and also loop over every door and pad of every floor.

- [x] **Step 2:** `bunx vitest run tests/unit/camera-collision.test.ts` fails (`viewOnSlab` missing).
- [x] **Step 3: Implement** in `collision.ts`:

```ts
const onSlab = (x: number, z: number, b: Rect) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;

/**
 * True when the bottom edge of the view (vertical `fov`, degrees) lands on the slab: the camera is on it, or the
 * bottom-center ray, aimed at `target` and tilted down by half the FOV, meets the floor plane inside the bounds.
 */
export function viewOnSlab(camera: Vec3, target: Vec3, w: CameraWorld, fov: number): boolean {
  if (onSlab(camera[0], camera[2], w.bounds)) return true;
  const dx = target[0] - camera[0];
  const dz = target[2] - camera[2];
  const run = Math.hypot(dx, dz);
  const h = camera[1] - w.floorY;
  const down = Math.atan2(camera[1] - target[1], run) + (fov * Math.PI) / 360;
  if (h <= 0 || down <= 0) return false;
  const d = down >= Math.PI / 2 || run < 1e-9 ? 0 : h / Math.tan(down);
  return onSlab(camera[0] + (run ? (dx / run) * d : 0), camera[2] + (run ? (dz / run) * d : 0), w.bounds);
}
```

In `clampCamera`, take `fov?: number`; blocked = `cameraBlocked(p, w) || (fov !== undefined && !viewOnSlab(p, target, w, fov))` for every sample; skip the early high return when `fov` is set and the camera is off the slab.

- [x] **Step 4:** In `CameraDirector`, pass `desired.fov` to the wanted-pose clamp; after the spring, clamp the smoothed pose in place:

```ts
if (world && !focus && rig !== "intro" && !glide) {
  const drawn = clampCamera(toVec3(l.target), toVec3(l.pos), world, roverTarget, desired.fov);
  l.pos.set(drawn[0], drawn[1], drawn[2]);
}
```

- [x] **Step 5:** Tests pass; commit `fix(camera): keep low cameras on the slab so the view never drops off the edge`.
- [x] **Found while verifying:** in the app some yaws still escaped: the ray from the look-ahead point started inside the L1 kiosk column next to the rover, and the clamp returned the camera unchanged. The clamp now skips that blocked start stretch. The L2 rail view stands beside its narrow road by design, so it passes no FOV (no view rule).

### Task 2: Hover highlight never shares a face with its target (3.2)

**Files:** Modify `src/experience/interact/pick.ts`, `src/experience/interact/InteractLayer.tsx`; Test `tests/unit/interact-pick.test.ts`.

**Interfaces:** Produces `HIGHLIGHT_MARGIN = 0.06` and `highlightVolume(v: PickVolume): PickVolume`.

- [x] **Step 1: Failing test:** every L3 board's highlight volume encloses its board solid (`wallSolids`) by at least `HIGHLIGHT_MARGIN` on every side (same center and yaw, size larger by `2 * HIGHLIGHT_MARGIN`).
- [x] **Step 2: Implement:**

```ts
/** The hover highlight stands this far outside the pick volume, so its outline and fill never z-fight with an object whose volume is the object itself (the L3 boards). */
export const HIGHLIGHT_MARGIN = 0.06;

export function highlightVolume(v: PickVolume): PickVolume {
  const m = 2 * HIGHLIGHT_MARGIN;
  return { center: v.center, size: [v.size[0] + m, v.size[1] + m, v.size[2] + m], yaw: v.yaw };
}
```

`Highlight` uses `highlightVolume(pickVolume(item))`.
- [x] **Step 3:** Tests pass; commit `fix(interact): grow the hover highlight so it never z-fights with the L3 boards`.

### Task 3: Intro fly-in (3.3)

**Files:** Modify `rigs.ts`, `CameraDirector.tsx`, `rover/runtime.ts`, `tower/visibility.ts`, `tower/FloorLevel.tsx`, `scene/Director.tsx`, `rover/Rover.tsx`; Tests `tests/unit/rigs.test.ts`, `tests/unit/tower-visibility.test.ts`.

**Interfaces:** Produces `INTRO_FLY = 1.7`, `INTRO_DURATION = INTRO_ORBIT + INTRO_FLY` (3.6 s), `INTRO_REDUCED = 2.5`, `introFlyProgress(t: number): number` (-1 before the fly-in, then eased 0 to 1), `introGhost(fly: number): number` (0 to 1), `contentVisible({..., introFly?})`, `roverRuntime.introFly` (-1 outside the fly-in), `roverRuntime.blinkUntil` (rover clock seconds).

- [x] **Step 1: Failing tests** (`rigs.test.ts`): `introFlyProgress` is -1 during the orbit, 0 at `INTRO_ORBIT`, 1 at `INTRO_DURATION`, monotonic, with zero speed at both ends; `introPose` is continuous (no step larger than 3 percent of the path between 120 samples) and lands exactly on `end`; the fly-in descends without rising above the orbit's last height; `INTRO_FLY` is between 1.5 and 2. (`tower-visibility.test.ts`): `introGhost(-1) = 0`, `introGhost(0.5) = 1`; exterior content is L1 and L2 before the fly-in and L1 only once it started.
- [x] **Step 2: Implement** `introPose` fly-in as a quadratic Bezier from the orbit's end to `end` whose control point extends the follow offset (`end.position - end.target`) by 0.8 and is capped at the orbit's last height, so the camera settles in along the follow line from behind and above; the target eases along a straight line; progress `easeInOutCubic` (the arrival glide's curve).
- [x] **Step 3:** `CameraDirector`: publish `roverRuntime.introFly`; finish at `INTRO_DURATION` (reduced motion: still shot until `INTRO_REDUCED`, then cut); a `move`, `orbit`, `zoom` or `view` intent during the fly-in sets a takeover flag, the next frame calls `finishIntro()` and the spring eases on from the drawn pose; fog near and far mix from the intro range to the follow range by the fly progress.
- [x] **Step 4:** `FloorLevel`: slabs above the rover fade from solid to ghost by `introGhost(roverRuntime.introFly)` (ghosts by 20 percent of the fly-in) during the exterior (depth writes off once they start to fade); `contentVisible` gets `introFly`.
- [x] **Step 5:** Landing beat in the Director's greet (the frame the intro hands over): `audio.play("beep")` (silent when muted) and `roverRuntime.blinkUntil = now + 0.18`; `Rover.tsx` blinks while `t < roverRuntime.blinkUntil` too.
- [x] **Step 6:** Tests pass; commit `feat(camera): continuous intro fly-in into the follow view behind the rover`.

### Task 4: E2E and docs

**Files:** `e2e/camera.spec.ts`, `e2e/interact.spec.ts`, `e2e/experience.spec.ts` (the planner already maps camera, interact and tower paths to them), docs.

- [x] Low camera sweep on L1, L3 and L4 (lite, 1440x900): drag to the lowest pitch, turn 360 degrees in 12 steps; after each step and settle, read the bottom rows of the canvas right after a render (a one-shot `gl.render` hook) and assert no flat band (rows whose max minus min is under 3 in every channel across the width, with the background color) and that `viewOnSlab` holds for the drawn camera.
- [x] L3 hover sweep: for each board, 20 points across its pick volume; a store subscription logs every hover change; assert exactly one change per board (into it) and none while inside.
- [x] Intro: the drawn camera is continuous over the fly-in (no frame step over 25 percent of the fly distance on SwiftShader, `introFly` increasing), the L2 slab is a ghost (`probes.ghosts.L2`) before explore, and the first explore frame continues from the last intro frame; a key press during the fly-in hands over early; reduced motion holds a still shot and cuts.
- [x] Docs: `3d-experience.md` (Boot and intro, Collision), `floors.md` (point-and-go highlight), `features.md` status log, `decisions.md` row.
- [x] Verify: `bun run verify:quick`, `bun run e2e:changed`, perf lane, strict visual gate. Commit `test(e2e): camera fixes` and `docs: camera fixes`.
