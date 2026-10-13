# Realistic Boost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the rover boost feel fast and physical (owner pick: "Full package: path-following light trails, rover leans and squats, camera widens and pulls back, speed streaks, wheel sparks") and turn the touch BOOST button into a toggle (owner: "also can you makr in mobile or tab the speed is toggle on off instead").

**Architecture:** Every effect is a pure TypeScript module (Vitest in node) plus a thin R3F layer. The three new boost meshes (twin ribbon trail, screen-space streaks, instanced sparks) live in one new component, `src/experience/fx/BoostFx.tsx`, mounted by `Rover.tsx`; they are invisible (no draw call) unless the boost level is above `BOOST.trailMin`. Body dynamics run in `Rover.tsx` on critically damped springs from `rover/bodyDynamics.ts`. The camera reads the eased boost level through one pure helper (`camera/boostView.ts`), so the Director and the GPU and precompile code stay untouched (other open PRs own them).

**Tech Stack:** Next.js 16, React 19, R3F 9, three 0.186, Vitest, Playwright, Bun.

## Global Constraints

- No em dashes (U+2014) anywhere.
- New copy in EN and ID (`messages/en.json`, `messages/id.json`, identical keys); spoken dialog lines at most 110 characters.
- Do not change anything else about the aesthetic. Normal (unboosted) driving looks exactly as on main.
- Budgets: at most 3 extra draw calls while boosting, 0 when not boosting (meshes invisible); idle frame and L1 draw counts identical to main.
- No new shader programs compiled at runtime: the boost materials compile once at mount, into the render target the scene pass uses.
- Reduced motion: no trail (as on main), no streaks, no sparks, no camera kick, no body buzz or lean. Cap dt (`MAX_FRAME_DT`) so hidden tabs never accumulate.
- Lite tier: shorter trail with fewer segments, fewer and fainter streaks, at most 16 sparks; full tier at most 48 sparks.
- Keep changes inside `src/experience/rover/`, `src/experience/fx/`, a small hook in `camera/CameraDirector.tsx`, the HUD boost button and tests (Director, precompile and GPU code belong to other PRs).
- Local e2e uses `E2E_PORT=4443`; CI is the authority.

## File Structure

| File | Responsibility |
|---|---|
| `src/experience/fx/boostConfig.ts` (new, pure) | Tier and reduced-motion gating (`boostFxConfig`), shared constants |
| `src/experience/fx/boostTrail.ts` (new, pure) | Ring buffer of rear-wheel samples and the camera-facing twin ribbon writer |
| `src/experience/fx/sparks.ts` (new, pure) | Pooled spark simulation (typed arrays, capped count) |
| `src/experience/fx/streaks.ts` (new, pure) | Static streak geometry attributes and the clip-space shader source |
| `src/experience/fx/BoostFx.tsx` (new) | The three meshes, per-frame updates, one-time warm compile, probes |
| `src/experience/rover/bodyDynamics.ts` (new, pure) | Critically damped spring, squat, dip, lean and buzz |
| `src/experience/camera/boostView.ts` (new, pure) | FOV kick and pull-back from the boost level |
| `src/experience/rover/Rover.tsx` | Drop the flat trail plane, mount `BoostFx`, apply body dynamics |
| `src/experience/rover/runtime.ts` | New probes: `streaks`, `sparks`, `boostFx`, `boostPitch`, `boostRoll`, `boostFov`, `boostPull` |
| `src/experience/camera/CameraDirector.tsx` | Apply pull-back and FOV kick |
| `src/hud/BoostButton.tsx`, `src/experience/input/joystick.ts` | Touch toggle with `aria-pressed`, resets |
| `messages/{en,id}.json` | Touch boost copy ("tap to toggle") |
| tests | `tests/unit/boost-trail.test.ts`, `tests/unit/boost-body.test.ts`, `tests/unit/boost-fx.test.ts`, `tests/hud/BoostButton.test.tsx`, `e2e/boost.spec.ts` |
| docs | README, AGENTS.md, specs 03 and 08 |

---

### Task 1: Pure boost effect modules

**Files:** create `src/experience/fx/boostConfig.ts`, `src/experience/fx/boostTrail.ts`, `src/experience/fx/sparks.ts`, `src/experience/rover/bodyDynamics.ts`, `src/experience/camera/boostView.ts`; tests `tests/unit/boost-trail.test.ts`, `tests/unit/boost-body.test.ts`, `tests/unit/boost-fx.test.ts`.

**Interfaces (produced):**

```ts
// fx/boostConfig.ts
export interface BoostFxConfig { trail: { samples: number; spacing: number; maxAge: number; width: number } | null; streaks: { count: number; opacity: number } | null; sparks: { max: number; rate: number } | null; buzz: boolean; camera: boolean; body: boolean }
export function boostFxConfig(tier: GpuTier, reduced: boolean): BoostFxConfig
export function fxActive(level: number): boolean // level > BOOST.trailMin

// fx/boostTrail.ts
export class TrailBuffer { constructor(capacity: number); readonly capacity: number; count: number; reset(): void; push(sample: TrailSample, spacing: number): boolean; at(i: number): TrailSample /* 0 = newest */ }
export interface TrailSample { lx: number; lz: number; rx: number; rz: number; y: number; t: number }
export function rearCorners(x: number, z: number, heading: number, out: TrailSample): TrailSample
export function trailVertexCount(samples: number): number // 2 ribbons x (samples + 1 head) x 2 edges
export function trailIndices(samples: number): Uint16Array
export function writeTrail(buf: TrailBuffer, head: TrailSample, camera: { x: number; y: number; z: number }, level: number, now: number, cfg: { maxAge: number; width: number }, positions: Float32Array, colors: Float32Array): number // returns the drawn alpha peak

// fx/sparks.ts
export class SparkPool { constructor(max: number); readonly max: number; alive: number; emit(x, y, z, vx, vy, vz, life): void; step(dt: number): void; clear(): void; /* typed arrays */ px, py, pz, vx, vy, vz, life, maxLife }

// rover/bodyDynamics.ts
export function springStep(s: { x: number; v: number }, target: number, omega: number, dt: number): void
export interface BodyState { pitch: {x,v}; roll: {x,v}; envelope: number; lastSpeed: number; lastHeading: number; accel: number; buzzY: number; buzzRoll: number }
export function createBodyState(): BodyState
export function stepBody(s: BodyState, input: { speed: number; heading: number; level: number; dt: number; t: number; enabled: boolean; buzz: boolean; topSpeed: number }): void

// camera/boostView.ts
export function boostView(level: number, blend: number, enabled: boolean): { fovKick: number; pull: number }
```

- [ ] Write failing tests: ring buffer keeps the newest `capacity` samples, spacing gate, reset on a jump over `TRAIL_JUMP` (3 u) or a y change; the ribbon centerline follows a curved path exactly; alpha falls with age and position and is 0 at level 0; springs converge without overshoot and stay stable at `MAX_FRAME_DT`; body pitch is nose-up (negative x rotation) under acceleration, nose-down under braking, roll follows yaw rate times speed, everything is 0 when disabled and on normal unboosted driving; spark pool caps at `max` and expires; `boostFxConfig` gates reduced motion and lite.
- [ ] Run `bunx vitest run tests/unit/boost-*.test.ts`: FAIL (modules missing).
- [ ] Implement the modules (no allocations in per-frame functions).
- [ ] Run the tests: PASS. Commit `feat(rover): pure boost trail, sparks, body and camera helpers`.

### Task 2: BoostFx meshes and rover body

**Files:** create `src/experience/fx/streaks.ts`, `src/experience/fx/BoostFx.tsx`; modify `src/experience/rover/Rover.tsx`, `src/experience/rover/runtime.ts`.

- Trail: one `BufferGeometry` (static index from `trailIndices`, dynamic `position` and RGBA `color`), `MeshBasicMaterial({ vertexColors, transparent, blending: AdditiveBlending, depthWrite: false, toneMapped: false })`, `frustumCulled = false`. Samples are the two rear wheel contact points (local x plus or minus 0.7, z -0.45, lamp height 0.3); each ribbon faces the camera; cyan (#67e8f9) at the rover to violet (`COLORS.violet`) at the tail.
- Streaks: up to 28 quads (lite 14, fainter) in a `ShaderMaterial` that writes clip space directly (no camera matrix, so no lag), radial lines in the outer ellipse (radius 0.72 to 1.45 of the half screen) moving outward, alpha `uLevel * sin(pi t)`; `depthTest: false`, additive, `renderOrder` 10.
- Sparks: `InstancedMesh` of a thin box (0.025 x 0.025 x 0.2), `MeshBasicMaterial` additive with `instanceColor` fading amber to dark, stretched along velocity, emitted from the rear wheels at `rate * level * (0.4 + turn)`.
- Every mesh is `visible = false` unless `fxActive(level)` (sparks: while any is alive). Warm compile: a hook records the renderer target from the always-drawn ring's `onBeforeRender`; the next frame compiles the boost group into that target once per tier (`gl.compile` traverses hidden objects).
- Body: `stepBody` drives `body.rotation.x` (squat and dip), adds to `rotation.z` (lean) and `position.y` (buzz, full tier).
- Probes on `roverRuntime`: `trail` (kept), `streaks`, `sparks`, `boostFx` (visible boost meshes), `boostPitch`, `boostRoll`.
- [ ] Implement, `bun run typecheck && bun run lint`, commit `feat(rover): path-following twin trails, streaks, sparks and body dynamics`.

### Task 3: Camera boost response

**Files:** modify `src/experience/camera/CameraDirector.tsx`, `src/experience/rover/runtime.ts` (`boostFov`, `boostPull`).

- Follow and rail rigs multiply the zoom by `pull` (1 to 1.08) before `clampCamera`, so collision still wins; `fov += fovKick` (7 degrees third person, 3 in first person, blended by `orbit.blend`); nothing in the intro or focus rigs; 0 under reduced motion. No shake.
- [ ] Implement, typecheck, unit tests, commit `feat(camera): widen and pull back while boosting`.

### Task 4: Touch boost toggle

**Files:** `src/hud/BoostButton.tsx`, `src/experience/input/joystick.ts`, `messages/{en,id}.json`, `tests/hud/BoostButton.test.tsx`.

- A real `<button type="button" aria-pressed aria-label={t("boost")}>`; pointerdown toggles (works while another finger holds the joystick), keyboard click toggles; on state: cyan text, `hq-glow` lit hairline (`aria-pressed="true"` lights it) and a glowing `AccentDot`. No edge stripes.
- Resets to off on floor change, when an elevator ride starts, on unmount (Page view, hologram) and on reload (not persisted). Shift stays hold-to-boost.
- Copy: `hud.hintCoarse` and `dialog.onboarding.moveCoarse` say "tap to toggle" in EN and ID.
- [ ] Failing jsdom tests (tap on, tap off, floor change and ride reset, unmount reset), implement, pass, commit `feat(hud): touch boost button toggles`.

### Task 5: E2E, measurements, docs, PR

- `e2e/boost.spec.ts` (mapped in `scripts/e2e-plan.ts`): hold Shift, trail, streaks and sparks become visible (peaks) and `boostFx` returns to 0 after release; reduced motion keeps all at 0 and no FOV kick; touch at 390x844 and 820x1180: tap gives `aria-pressed=true` and boost visuals while the joystick drives, tap off clears it, a floor change resets it.
- Measure boosting draw calls, triangles and frame time at 1440x900 full and 390x844 lite against main; capture before and after screenshots and a boosted-turn frame sequence; post them in a PR comment.
- Docs: README (controls and feature text), AGENTS.md (boost bullet), specs 03 and 08.
- `bun run verify:quick`, `bun run e2e:changed` with `E2E_PORT=4443`, open the PR, get the required checks green, do not merge.
