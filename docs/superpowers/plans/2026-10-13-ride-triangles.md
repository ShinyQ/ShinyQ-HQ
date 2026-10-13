# Ride Triangles Under 30k Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the two elevator ride peaks that P4 (#79) recorded as expected failures (`full ride-L2-L1`: 34,059 triangles, `lite ride-L3-L2`: 31,306 triangles) under the 30,000 triangle budget of spec 08 with no visible change, then drop both `KNOWN_OVER` ids.

**Architecture:** While a ride runs, every mesh of a floor below the rover whose world bounds lie entirely in the shadow of a solid slab between it and the camera is skipped for that render only (hidden in `scene.onBeforeRender`, restored in `scene.onAfterRender`). The test is pure geometry (a central projection of the bounds' 8 corners onto the slab's top face), so a skipped mesh cannot reach a pixel. Visibility rules (`tower/visibility.ts`, `tower/near.ts`), P6's `FloorPrep`, P2's precompile and warm state, and the arrival look stay untouched.

**Tech Stack:** three r186, React Three Fiber, troika-three-text 0.52, Vitest, Playwright (perf lane and `scripts/visual-gate.ts`).

## Global Constraints

- No em dashes (U+2014) anywhere (code, comments, docs, commits, PR text).
- Do not change the aesthetic; no visible change during rides (visual gate, strict profile: per-pixel 0.1, at most 0.1% of pixels).
- Do not change P6's `FloorPrep`, P2's precompile or warm state, or the arrival look.
- No new shader programs during rides (`e2e/gpu.spec.ts`, `e2e/perf/baseline.json` + `PROGRAM_HEADROOM`), and `e2e/ride.spec.ts` (P6 smoothness) stays green.
- Budgets (spec 08 section 2, `e2e/budgets.ts`): under 150 scene calls, at most 20 post passes, under 30,000 triangles.
- Local e2e uses `E2E_PORT=4444` (never 4173); CI is the authority for heavy 3D e2e.

## Findings (measured on main a9e1638, before any change)

Per-frame attribution (scratch spec, `renderBufferDirect` hooked per draw) shows both peaks while the car is **parked** at a floor, not mid-dolly:

| Ride | Peak stage | What draws |
|---|---|---|
| full L2 to L1 | boarding on L2: 34,042 | L2 content 19.5k + L1 content 9.3k (the target, under the solid L2 slab) + rover 4.5k |
| lite L3 to L2 | parked on L3: 30.9k; opening on L2: 31.3k | L3 7.3k + L2 18.3k (target under L3); then L2 18.3k + L1 7.7k (one gap under L2) |

Rendering each mesh alone over the frame without its floor (real GPU, depth test, changed pixels) shows the floor under a parked slab is partly visible from the west-side ride camera (up to 74k px of L2 under L3, 169k px of L1 under L2, through the glass shaft and under the slab's west edge), so hiding whole floors would change the look. But the visible part is only the grid plane, road strip, pad glows and a few rings near the shaft; every heavy mesh (room labels 8k, door glows 4.4k, lobby tori, label batches) adds 0 px. Hence a per-mesh cull.

## Changes made during execution

- The whole-box shadow test alone did not cull L2 under L3: L2's road-long batches (room labels, door glows) reach past L3's east edge. Their far end is off screen, so each box is first clipped to the view frustum (`clipBoxToFrustum` in `slabShadow.ts`, exact vertex enumeration of the convex intersection, then its bounds) and a box with no part in view is culled outright.
- The lite L3 to L2 peak (31,306) was the first frame after arrival: the store's ride is already null while FloorLevel's visibility still holds it (one-frame useFrame order, also on main). The cull therefore runs on every render outside boot and intro; in explore no floor below the rover is visible, so it finds nothing.
- The hook install moved into `rideCull.ts` (`installRideCull`): the React compiler lint forbids mutating the scene returned by `useThree` inside the component.

## File Structure

- Create `src/experience/tower/slabShadow.ts`: pure geometry (`inSlabShadow`, `boxCorners`), no three import.
- Create `src/experience/tower/rideCull.ts`: three side. `cullUnderSlabs(scene, camera, input)` decides and hides, `restoreCulled()` restores; cached world bounds per object (position and instance matrix versions); `rideCullStats` probe.
- Create `src/experience/tower/RideCullHooks.tsx` (not `RideCull.tsx`: macOS file systems are case-insensitive and `rideCull.ts` exists): mounts `installRideCull` on the scene, active outside boot and intro.
- Modify `src/experience/tower/floorRegistry.ts`: `registerFloorSlab` / `getFloorSlab` (the fill mesh FloorLevel draws).
- Modify `src/experience/tower/FloorLevel.tsx`: register the slab fill mesh.
- Modify `src/experience/tower/Tower.tsx`: mount `<RideCull />`.
- Modify `src/experience/Experience.tsx`: expose `rideCull` stats on `window.__hq.probes`.
- Test `tests/unit/slab-shadow.test.ts`, `tests/unit/ride-cull.test.ts`.
- Modify `e2e/perf/peaks.spec.ts` (drop `KNOWN_OVER` ids), `e2e/visual-gate.spec.ts` (ride poses for both rides at parked and dolly frames), `docs/superpowers/specs/agent-hq/08-quality-acceptance.md`, `AGENTS.md` (3D experience notes), `README.md` only if it lists the known-over entries.

### Task 1: Pure slab shadow test

**Files:** Create `src/experience/tower/slabShadow.ts`, Test `tests/unit/slab-shadow.test.ts`

**Interfaces:**
- Produces: `type Vec3 = [number, number, number]`, `interface Box3Like { min: Vec3; max: Vec3 }`, `interface SlabRect { minX: number; maxX: number; minZ: number; maxZ: number; top: number; bottom: number }`, `SHADOW_MARGIN = 0.5`, `inSlabShadow(eye: Vec3, slab: SlabRect, box: Box3Like, margin = SHADOW_MARGIN): boolean`.

Rule: false unless `eye[1] > slab.top + 1e-3` and `box.max[1] < slab.bottom` and the box is finite and non-empty; otherwise project each of the 8 corners P along the ray from the eye onto the plane `y = slab.top` (`t = (eye.y - top) / (eye.y - P.y)`, `Q = eye + (P - eye) * t`) and require every Q inside the slab rectangle shrunk by `margin`. Central projection maps segments to segments, so the box's image is the hull of the corner images and the rectangle is convex: all corners inside means the whole box is hidden.

- [ ] Write failing tests: a box straight under the middle of a slab with the eye above is covered; a box under the slab edge seen from outside the rectangle is not; eye below the top is not; a box reaching above the slab bottom is not; an empty or infinite box is not; margin shrinks coverage.
- [ ] Run `bunx vitest run tests/unit/slab-shadow.test.ts` (fails: module missing), implement, run again (passes).
- [ ] Commit `feat: pure slab shadow test for ride culling`.

### Task 2: Ride cull (three side) and wiring

**Files:** Create `src/experience/tower/rideCull.ts`, `src/experience/tower/RideCull.tsx`; modify `floorRegistry.ts`, `FloorLevel.tsx`, `Tower.tsx`, `Experience.tsx`; Test `tests/unit/ride-cull.test.ts`.

**Interfaces:**
- Consumes: `inSlabShadow`, `SlabRect` (Task 1); `getFloorContent(id)`; new `getFloorSlab(id): Mesh | null`.
- Produces: `cullUnderSlabs(camera: Camera, floors: readonly CullFloor[]): number` (hides, returns triangles skipped), `restoreCulled(): void`, `cullable(object: Object3D): boolean`, `worldBounds(object): Box3Like | null`, `rideCullStats = { meshes, triangles, frames }`; `interface CullFloor { id: FloorId; y: number; bounds: FloorBounds }`.

Rules (each one a unit test with plain three objects in node):
- Candidates: floor content groups that are `visible` and below a slab that is solid this frame (slab group visible, fill `opacity >= 0.999`, `depthWrite`), with the eye above that slab's top.
- A drawable is cullable when it is a visible `Mesh`, `Line` or `Points` (not skinned), every material has `depthTest !== false`, `visible !== false`, and is not a `ShaderMaterial` (a custom vertex shader may move vertices outside the geometry bounds). Troika text (derived materials, bounds kept by troika) is cullable.
- World bounds: troika `Text`/`BatchedText` read `geometry.boundingBox` every frame (kept by troika; empty means not cullable); `InstancedMesh` unions the geometry box under each of `count` instance matrices (cached by `instanceMatrix.version`); other geometry uses `boundingBox` (computed when null, recomputed when the position attribute version changes). Then `applyMatrix4(matrixWorld)`.
- Hidden objects are restored in `restoreCulled()`; a culled troika text still gets `sync()` so typesetting (P6's `ridePrep.texts`) happens on the same frames as before.
- `RideCull` sets `scene.onBeforeRender` (restore leftovers, then cull when `ride !== null` and the phase is not `boot`/`intro`) and `scene.onAfterRender` (restore), chaining previous hooks, and removes them on unmount. `gl.compile` never calls these hooks, so precompile still sees every mesh.

- [ ] Write failing unit tests (`tests/unit/ride-cull.test.ts`), run (fail), implement, run (pass).
- [ ] `bun run typecheck && bun run lint`.
- [ ] Commit `perf: skip meshes hidden under a solid slab during rides`.

### Task 3: Measure, prove and gate

- [ ] `bun run build`, then `PERF=1 E2E_PORT=4444 bunx playwright test e2e/perf/peaks.spec.ts -g ride`: both ids now "expected to fail, but passed"; record every ride's calls and triangles.
- [ ] Remove both ids from `KNOWN_OVER` (keep the mechanism and comment for future ids); rerun peaks: all green.
- [ ] Scratch pixel check (real GPU) on the head build: render the culled meshes over the frame and count changed pixels on every ride frame for both rides at 1440x900 and 390x844: expect 0.
- [ ] Add ride poses to `e2e/visual-gate.spec.ts`: `ride-down-l2-l1` (parked: boarding; dolly: 24 frames into moving) and `ride-down-l3-l2` (parked on L3: boarding; arrival: opening). Run `E2E_PORT=4444 bun scripts/visual-gate.ts --base origin/main --profile strict` (3 devices); expect PASS.
- [ ] `E2E_PORT=4444 bun run e2e:perf` (bytes, floors, peaks, memory) and `E2E_PORT=4444 bunx playwright test e2e/ride.spec.ts e2e/gpu.spec.ts`.
- [ ] Commit `test: ride peaks within budget, visual gate ride poses`.

### Task 4: Docs and PR

- [ ] Spec 08 section 2: remove "Known over budget", note the ride cull. AGENTS.md: one bullet under "3D experience". README only if it mentions the known-over rides.
- [ ] `bun run verify:quick`, `bun run e2e:changed`.
- [ ] Commit `docs: ride cull, budgets met`, push, open the PR with the before and after table (calls and triangles per ride, all floors and tiers) and the visual gate results; get "Typecheck, lint, unit tests", "Build, CV and e2e", "Lighthouse CI" and "3D perf gates" green. Do not merge.
