# Highlights Hall gallery rebuild (Session A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the L1 Highlights Hall as a gallery (Part 2 of `docs/superpowers/specs/2026-10-13-spectacle-floor-ends-hall-design.md`): each station gets its own shape, a gateway arch with a floating "HIGHLIGHTS HALL" sign and a one-shot light curtain, a light fountain centerpiece and fake stage lighting, with the same content, pads, doors, deep links and budgets.

**Architecture:** One pure module (`hallGallery.ts`) owns every new shape (positions, faces, tall columns, light instances, the gate crossing test) so the layout, the scenery, the camera collision and the tests read the same numbers. `hallLayout.ts` keeps the station footprints, pads, doors and spurs exactly where they are and adds the two arch pillars as obstacles. `hallContent.ts` places the existing texts, screenshots and portrait on the new faces. The scenery stays a handful of draw calls: merged solids, merged lines, one text batch, one instanced light mesh (beams, cones and glow pools share one shader), one instanced tile mesh, one portrait hologram disc, one curtain shader used by the gate curtain and the experience portal, one pulse ring mesh and the gate sign. No real lights on any tier (a light changes the program of every lit material in the tower).

**Tech Stack:** React Three Fiber, three.js ShaderMaterial and InstancedBufferGeometry, troika BatchedText, Vitest, Playwright.

## Global Constraints

- No em dashes (U+2014) anywhere.
- No new content; any new label in EN and ID (`messages/*.json`). The sign reuses `hall.hall` ("Highlights Hall" / "Aula Sorotan").
- No client company names in 3D.
- L1 at most +20 scene calls over today (90 full spawn, 80 hall plaza), hard cap 125 (`FLOOR_SCENE_CAPS.L1`); under 30k triangles at every peak; programs within baseline + 2 (regenerate the baseline deliberately).
- Lite: simpler (fewer fountain beams, normal blending, no drift, no flicker); no real lights. Reduced motion: everything static, no sweep.
- Every new material precompiled through `src/experience/scene/precompile.ts` before the hall shows; new shader materials are never culled by the ride cull (#85), so they are cull-safe.
- New tall shapes go into the camera collision (`TALL` in `CameraDirector.tsx`); the rover drives under the arch.
- Pads, doors, point-and-go ids, deep links `#highlights-<station>`, Quick tour, Cmd-K, onboarding and hints unchanged.
- E2E port 4446.

## File map

- Create `src/experience/floors/lobby/hallGallery.ts`: pure shape data (gate, faces, monoliths, tiles, pedestal, arch, beacon, card, fountain, lights, tall columns, `gateCrossed`).
- Create `src/experience/floors/lobby/hallSolids.ts`: pure buffers for boxes plus prisms (cylinders) and their neon lines (circles included).
- Create `src/experience/floors/lobby/HallLights.tsx`: instanced beams, cones and pools (one shader, one call).
- Create `src/experience/floors/lobby/HallFx.tsx`: curtain shader (gate sweep, experience portal), stat tile plates (instanced, drift), portrait hologram disc, gate sign.
- Modify `hallLayout.ts` (arch pillars as obstacles, `HALL.gate`, per-station zoom and height, drop `HALL.sign`), `hallContent.ts` (labels and quads on the new faces), `HighlightsHall.tsx` (assembly, precompile on mount, sweep), `hallInteract.ts` (per-station height), `CameraDirector.tsx` (`TALL.L1`), `fx/probes.ts` (`hallGate`).
- Tests: `tests/unit/hall-gallery.test.ts` (new), `highlights-layout.test.ts`, `hall-content.test.ts`, `hall-interact.test.ts`, `e2e/highlights.spec.ts`.
- Docs: README, AGENTS.md (session key `hq:hall-gate`, hall description), spec 01, spec 08, perf baseline.

---

### Task 1: Pure gallery layout

**Files:** Create `hallGallery.ts`; modify `hallLayout.ts`; test `tests/unit/hall-gallery.test.ts`, `tests/unit/highlights-layout.test.ts`.

**Interfaces (produces):**
- `GATE = { x: 33, depth: 1.2, pillar: 1.2, north: { minZ: 9.4, maxZ: 10.6 }, south: { minZ: 19.8, maxZ: 21 }, h: 7.4, lintel: 1, sign: { y: 8.1 } }`, `gatePillars(): Rect[]`, `gateOpening(): { minZ, maxZ, top }`.
- `gateCrossed(prev: Vec2, next: Vec2): boolean`: true when the rover crosses `x = GATE.x` eastward inside the opening.
- `interface Face { origin: Vec2; right: Vec2; out: Vec2; yaw: number }`, `onFace(face, u, y, out?) => [x, y, z]`, `faceYaw(out)`.
- `aboutGallery()`: pedestal center, portrait disc (center, radius), `tiles: { face: Face; y: number; w: number; h: number; phase: number }[]`, text face.
- `projectMonoliths(count)`: `{ face: Face; box: Box }[]` (arc of radius 16 inside the projects footprint).
- `experienceArch()`: two pillars, lintel, opening (Face, width, height), columns `{ u, width }`.
- `contactBeacon()`: mast base, mast top, card box and Face.
- `FOUNTAIN = { x: 46, z: 3, ring: 2.2, beams: { full: 12, lite: 6 } }`.
- `hallLightInstances(tier)`: `LightInstance[]` (`kind: "beam" | "pool"`, `x, y, z, h, r0, r1, color, alpha, spin, phase`).
- `hallTall(): TallObstacle[]` (gate pillars, monoliths, experience pillars, mast, card).

- [ ] Write failing tests: the arch pillars are space-rule clean (cert wall at least 6 u away, south pillar touches the slab), the opening spans the 8 u lead road, the rover route from the spawn to every station pad passes the opening, `gateCrossed` fires once eastward only inside the opening, monoliths stay inside the projects footprint and clear of the pad by 0.9 u, every tile and face yaw reads toward the plaza, lights count per tier, tall columns cover every shape over 3.2 u.
- [ ] Implement; add the pillars to `HALL_LAYOUT.obstacles`, `HALL.zoom` per station in `stationZone`, `HALL.height` per station.
- [ ] Run `bunx vitest run tests/unit/hall-gallery.test.ts tests/unit/highlights-layout.test.ts`; commit `feat(l1): gallery layout for the Highlights Hall`.

### Task 2: Solids, lines and content placement

**Files:** Create `hallSolids.ts`; modify `hallContent.ts`; test `tests/unit/hall-content.test.ts`.

**Interfaces:** `prismBuffers(prisms)`, `hallGeometryBuffers(projectCount)` returning `{ positions, normals, indices }` and `hallLineBuffers(projectCount)` returning `Float32Array`; `hallLabels(input, labels, fonts)` returns `HallTexts = { labels: BatchedLabel[]; tile: number[] }` (`tile[i]` is the stat tile a label rides with, or -1); `hallShots(count)` on monolith faces; `hallPhoto(index)` as the hologram disc.

- [ ] Rewrite the content tests against faces (every label on its station's face, inside its width, between the base and the shape top; tile labels flagged; the floor sign gone; no first person added).
- [ ] Implement; run `bunx vitest run tests/unit/hall-content.test.ts`; commit.

### Task 3: Scenery components

**Files:** Create `HallLights.tsx`, `HallFx.tsx`; modify `HighlightsHall.tsx`, `fx/probes.ts`.

- [ ] `HallLights`: one `InstancedBufferGeometry` (open cylinder, 20 segments, y 0 to 1) with per-instance attributes, one `ShaderMaterial` (soft edge from the view angle for beams, radial fade for pools, beam spin around the fountain and height pulse from `uTime`), additive on full, normal on lite; `useUniformTime` freezes under reduced motion.
- [ ] `HallCurtain` (gate): plane in the opening, hidden until `gateCrossed` fires the first time this session (`sessionStorage["hq:hall-gate"]`), a 0.8 s sweep, never under reduced motion; probe `sceneProbes.hallGate = { sweeps, active }`. `PortalGlow` (experience opening) uses the same shader with a still band.
- [ ] `StatTiles`: instanced plates with a neon border in the shader; drift on full only (shader offset), the matching text members follow through the `BatchedLabels` handle.
- [ ] `PortraitHolo`: disc over the atlas photo cell, scanlines, flicker on full only.
- [ ] `GateSign`: troika `Text` plus a dark backing and a neon outline, turned by `yawTowards` every frame.
- [ ] `HighlightsHall`: hidden until `precompileObject` resolves for the hall group (all materials compiled and pinned), then visible.
- [ ] `bun run typecheck && bun run lint`; commit.

### Task 4: Camera, point-and-go heights

- [ ] `TALL.L1 = hallTall()`; `highlightsInteractables` height per station; update `tests/unit/hall-interact.test.ts`; commit.

### Task 5: E2E

- [ ] `e2e/highlights.spec.ts`: the arch is passable (drive from the plaza through the opening, the rover x crosses `GATE.x`), the sweep runs once per session (probe `sweeps` 1 after two passes) and never under reduced motion (`sweeps` 0), the budget test keeps its spots plus the arch.
- [ ] Run `E2E_PORT=4446 bun run e2e:changed`; commit.

### Task 6: Perf, visual gate, evidence, docs

- [ ] `E2E_PORT=4446 bun run e2e:perf e2e/perf/floors.spec.ts` then regenerate `e2e/perf/baseline.json` (note why in the PR).
- [ ] `E2E_PORT=4446 bun scripts/visual-gate.ts --base origin/main --grep l1-spawn` (rest of L1 unchanged).
- [ ] Captures before and after (1440x900 full, 2560x1440 full, 390x844 lite), arch drive frames, calls and triangles table.
- [ ] Docs: README hall paragraph, AGENTS.md (hall section, `hq:hall-gate`), spec 01 (L1 hall), spec 08 (hall budget line).
- [ ] `bun run verify:quick`, push, open the PR, get the four required checks green.

## Revision (after #87 merged)

Owner budget review: at most +2 shader programs per tier. `HallLights` and the separate hall shaders are gone: every hall effect is an instance kind of the shared holo program's `stage` mode (`fx/holoFx.ts`, instances from `floors/lobby/hallStage.ts`), the gateway sign uses `FloatingSigns`, and the tall columns live in `FloorLayout.tall`. Measured: +1 program per tier on L1.
