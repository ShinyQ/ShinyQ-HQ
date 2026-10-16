# Floating Floor Signs and Floor Ends (Session B) Implementation Plan

Status: shipped in #87 (43607d9), 2026-10-13. Later removed in #168: the L3 floating wing signs (the board titles name the paths)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every word painted on a floor becomes a floating, camera-facing sign (Part 1), and the empty ends of L2 and L3 get the owner-approved spectacle: the L2 "Horizon" and "Origin", the L3 "Reactor core" and the corner data waterfalls (Part 3).

**Design:** `docs/superpowers/specs/2026-10-13-spectacle-floor-ends-hall-design.md` (owner requests and decisions verbatim). Session A owns Part 2 (the L1 Highlights Hall, its "HIGHLIGHTS HALL" sign and `src/experience/floors/lobby/*`).

**Architecture:** One shared batched sign component (`fx/FloatingSign.tsx`) with a pure placement module (`fx/floatingSign.ts`): one instanced backing plate (dark fill plus a neon rim, drawn by one shader) and one `BatchedLabels` per floor, every member turned to the camera each frame with `yawTowards`, so it never reads mirrored. All new effects share one fragment-mode shader (`fx/holoFx.ts`: a `uMode` uniform selects the pattern) so they add as few programs as possible; every mesh is instanced or merged, uses a `ShaderMaterial` (never culled by the ride cull, its own distance fade, fog exempt), freezes under reduced motion and gets fewer instances on lite. Layout for the new pieces is pure (`floors/career/horizon.ts`, `floors/labs/reactor.ts`) and unit tested; the L3 east plaza becomes a ring road around the core so `roadRoute` and the navgrid go around it.

**Tech Stack:** Next.js 16 static export, React Three Fiber, three.js, troika-three-text, Vitest, Playwright.

## Global Constraints

- No em dashes (U+2014) anywhere.
- No new content: 3D text comes from existing content and messages; EN and ID for any new label.
- No client company names in 3D.
- Budgets: settled scene calls under 150 (L1 125, RF 79), post passes at most 20, triangles under 30,000 at every peak (rides, hover, boost); programs at most baseline + 2 (regenerate the baseline deliberately); 3D JS under 450 KB gzip.
- L2: at most +3k triangles and +6 calls. L3: at most +10 calls and +6k triangles.
- Lite gets simpler versions; reduced motion is static (no spin above 0.2 rad/s, no flow, no particles).
- Every new material compiles through the floor's precompile (`FloorPrep` and `precompileFloor` in `scene/precompile.ts`): mount new meshes with the floor content, never behind a later Suspense.
- Ride cull (`tower/rideCull.ts`) stays safe: new meshes use `ShaderMaterial` (never culled).
- Tall pieces join the camera collision set (`TALL` in `camera/CameraDirector.tsx`).
- E2E port 4447.

---

## Floor text audit (before)

| Floor | Text | Where | Today |
| --- | --- | --- | --- |
| L1 | "HIGHLIGHTS HALL" | `floors/lobby/hallContent.ts` | flat on the lead road (Session A owns it) |
| L2 | year digits "2019" to "2026" | `floors/career/YearGates.tsx` | flat at each plaza center, 5 u type, one draw call each |
| L2 | "L3 Labs above" | `floors/career/WorkshopAnnex.tsx` | upright on the window glass (not a floor word, unchanged) |
| L3 | wing names | `floors/labs/Hub.tsx` | already floating (PR #71), moves onto the shared component |
| L4 | zone names (Blog, Research, Models and datasets, Talks and workshops) | `floors/library/decor/common.tsx` `ZoneSigns` | flat on the road where each zone starts |
| L4 | timeline year marks | `floors/library/decor/NewsroomDecor.tsx` | flat on the timeline lane |
| L4 (dev concept only) | newest post title | `floors/library/decor/AtriumDecor.tsx` | flat in front of the atrium centerpiece |
| RF | none | `floors/roof/*` | every label is upright |
| dev prototypes | wing and pad labels | `src/experience/prototype/**` | dev-only routes, outside the audit |

### Task 1: Shared holo shader and FloatingSign

**Files:**
- Create: `src/experience/fx/holoFx.ts` (shader source, `HOLO_MODE`, `createHoloMaterial`)
- Create: `src/experience/fx/floatingSign.ts` (pure: `SignSpec`, `signPlate`, `signFacing`)
- Create: `src/experience/fx/FloatingSign.tsx` (`FloatingSigns`)
- Modify: `src/experience/fx/probes.ts` (`floatingSigns` probe)
- Test: `tests/unit/floating-sign.test.ts`

**Interfaces (produced):**
- `HOLO_MODE = { plate: 0, skyline: 1, glow: 2, flow: 3, pillar: 4, fall: 5, core: 6, ring: 7, strip: 8 }`
- `createHoloMaterial({ mode, color, opacity?, additive?, fade?: [near, far], side? }): ShaderMaterial` with uniforms `uTime`, `uColor`, `uOpacity`, `uFade` (vec2), `uMode`; per-instance `instanceColor` multiplies `uColor`; `fog: false`; tone mapping and color space chunks like `fx/materials.ts`.
- `interface SignSpec { text: string; x: number; y: number; z: number; color: string; fontSize: number; font?: string; tilt?: number; letterSpacing?: number; fade?: number /* road x for the L2 distance fade */ }`
- `signPlate(spec): { w: number; h: number }` (monospace width from `monoWidth`, padding 0.4 by 0.2 times font size)
- `signFacing(at: Vec2, camera: Vec2): number` (alias of `yawTowards`)
- `<FloatingSigns signs name tier fade? />`: one instanced plate (mode `plate`), one `BatchedLabels` (`exactColors`), per frame: each member and plate instance yaws toward the camera (around its own anchor), fades by `labelFade` when `fade` is set. Writes `sceneProbes.signs[name] = [{ text, facing }]` (facing = dot of the sign front and the direction to the camera, 1 means square).

- [x] Write `tests/unit/floating-sign.test.ts`: `signPlate` grows with text length and font size; `signFacing` faces the camera from 8 directions (front dot camera direction is 1); the holo shader source declares `uMode` and every mode constant.
- [x] Run `bunx vitest run tests/unit/floating-sign.test.ts` (fails: modules missing).
- [x] Implement the three modules.
- [x] Run the test (passes), `bun run typecheck`.
- [x] Commit `feat(3d): shared FloatingSigns and holo fx shader`.

### Task 2: Convert floor text to floating signs

**Files:**
- Modify: `src/experience/floors/labs/Hub.tsx` (wing signs through `FloatingSigns`)
- Modify: `src/experience/floors/career/YearGates.tsx` (floor digits become floating year markers over the south plaza edge, `yearMarkerSigns` in `floors/career/labels.ts`)
- Modify: `src/experience/floors/library/decor/common.tsx` (`ZoneSigns` floating), `NewsroomDecor.tsx` (year marks floating), `AtriumDecor.tsx` (newest title floating)
- Test: `tests/unit/career-labels.test.ts` (year marker placement), `tests/unit/floor-text.test.ts` (static audit)

- [x] Write `tests/unit/floor-text.test.ts`: scans `src/experience/**/*.{ts,tsx}` (except `prototype/`) for a drei or troika text laid flat (`rotation={[-Math.PI / 2` inside a `<Text` element, or a `BatchedLabel` with `tilt: Math.PI / 2`); only `floors/lobby/hallContent.ts` is allowed until Session A lands. Fails today on YearGates, common.tsx, NewsroomDecor and AtriumDecor.
- [x] Write the year marker test: one marker per year at the plaza center x, z on the plaza's south edge (`center.z + plazaDepth / 2`), bottom 5.2 u up, font 3, the floor accent.
- [x] Convert the four places; L2 markers keep the arch pulse (scale) and the distance fade; L3 keeps `signs[wing].float` at y 4.2.
- [x] Run the tests, typecheck, commit `feat(3d): floor words float as signs on L2, L3 and L4`.

### Task 3: L3 Reactor core (layout and routing)

**Files:**
- Create: `src/experience/floors/labs/reactor.ts` (pure: `REACTOR`, `reactorObstacle(center)`, `eastRing(center)`)
- Modify: `src/experience/floors/labs/layout.ts` (`LABS.east` 22; wing roads end on the ring; ring road `east-ring` closed; core obstacle; spine runs to the core; `LabsLayout.reactor`)
- Modify: `src/experience/nav/road.ts` (`Plaza.core?: number`: a plaza with a blocked center is not linked to the road through its center)
- Modify: `src/experience/camera/CameraDirector.tsx` (`TALL.L3` gains the core)
- Test: `tests/unit/labs-layout.test.ts`, `tests/unit/labs-reactor.test.ts`

Numbers: `REACTOR = { half: 1.6, ring: 6.5, segments: 16, height: 11, rings: [{ y: 4.2, r: 2.6 }, { y: 6.4, r: 3.4 }, { y: 8.6, r: 2.2 }] }`. Ring inner edge 6.5 cos(pi/16) - 4 = 2.38 u keeps the 3.2 u core square (corner 2.26 u) clear.

- [x] Tests: the space rules still pass with the real pods, a lopsided floor and an empty one; the core rect sits at the east plaza center; `pathBetween` from the end of the software road to the end of the ai road stays at least 2.3 u from the core center; `roadRoute` on the navgrid from a software pod door to an ai pod door never enters the core; the spine's last point is the core's west face; the slab ends one plaza radius plus margin past the plaza.
- [x] Implement; update the existing layout assertions that pin `points.at(-1)` to the plaza center (now the ring) and the spine end.
- [x] Commit `feat(l3): reactor core in the east plaza, ring road around it`.

### Task 4: L3 Reactor and waterfalls (render)

**Files:**
- Create: `src/experience/floors/labs/Reactor.tsx` (core column, instanced orbit rings, base disc: 3 draw calls; lite: 2 rings; reduced motion: no spin, no flow)
- Create: `src/experience/floors/labs/Waterfalls.tsx` (`waterfallPanels(bounds)` in `reactor.ts`: 8 panels, two per slab corner, hanging 12 u under the slab edge; one instanced draw; lite 4 panels)
- Modify: `src/experience/floors/Labs.tsx`, `PacketLanes.tsx` (packets reach the core)
- Test: `tests/unit/labs-reactor.test.ts` (panel placement on the corners, outside the slab footprint of L2 below)

- [x] Write placement tests, implement, check the spin rate constant is 0 under reduced motion (`reactorSpin(reduced)`), commit `feat(l3): reactor core visuals and corner data waterfalls`.

### Task 5: L2 Horizon and Origin

**Files:**
- Create: `src/experience/floors/career/horizon.ts` (pure: `HORIZON`, `buildHorizon(layout)`: bridge rect, skyline towers, glow disc, corner strips, origin pillar)
- Create: `src/experience/floors/career/Horizon.tsx` (bridge, skyline, sunrise glow, corner strips, origin pillar: 5 draw calls)
- Modify: `src/experience/floors/CareerArchive.tsx`
- Test: `tests/unit/career-horizon.test.ts`

Rules: the bridge starts at the window (`windowX`) and runs east off the slab; towers stand off the slab (x beyond the window), fog exempt with their own fade; corner strips stay inside the empty NE and SE corners (x 344 to 363, z -29 to -11.6 and x 341 to 363, z 14.5 to 29) and clear of the repo wall, benches, door pads and the 6 u reach; the origin pillar stands west of the 2019 plaza, at least 3 u from the call pad (-21, 0), the 2019 teleporter and the road, inside the slab.

- [x] Tests for every rule above, implement, commit `feat(l2): horizon bridge, skyline and origin pillar`.

### Task 6: E2E and probes

**Files:**
- Create: `e2e/spectacle.spec.ts`: signs face the camera from the default and a rotated camera on L2, L3, L4 (`__hq.probes.signs`); no flat text on any floor (`__hq.probes.flatText()`, allowing "HIGHLIGHTS HALL" on L1); autopilot and point-and-go across the L3 east plaza never enter the core; reduced motion (`?motion=reduce` or the Motion setting) freezes the reactor and waterfalls (`__hq.probes.spectacle`).
- Modify: `scripts/e2e-plan.ts` (map `floors/career/horizon*`, `floors/labs/reactor*`, `fx/FloatingSign*`, `fx/holoFx*` to `spectacle`), `src/experience/fx/probes.ts`.

- [x] Write, run locally on port 4447 with `bun run e2e:changed`, commit `test(e2e): floating signs, reactor routing and motion gating`.

### Task 7: Budgets, baseline, visuals, docs

- [x] `bun run verify:quick`.
- [x] `PERF=1 E2E_PORT=4447 bunx playwright test e2e/perf/floors.spec.ts`, then `bun scripts/perf-summary.ts baseline --head perf-report --write e2e/perf/baseline.json` (deliberate: new programs from the holo shader).
- [x] Peaks and bytes: `E2E_PORT=4447 bun run e2e:perf`.
- [x] Captures before (main build in `out-main/`) and after: L2 east (rail default, rotated east), L2 west, L3 east plaza from both wings, a waterfall corner, every converted sign, at 1440x900 full, 2560x1440 full, 390x844 lite; frame sequences of the reactor and a waterfall.
- [x] Docs: README, `AGENTS.md` (FloatingSign, holo fx, reactor, horizon), spec 01 (world), spec 08 (budget numbers).
- [x] PR, CI green, report.
