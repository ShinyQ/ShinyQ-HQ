# Agent Office wing (L1 south wing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

Status: in review

**Goal:** Move the L1 Agent Office out of the Lobby's south plaza strip into its own south wing of the L1 slab, reached by a lead road like the Highlights Hall. The desk arc meets the full `SPACE_RULES`, and the office's fixture exception goes away. Ships inside PR3 (the 3D office), before it merges.

**Owner request (verbatim):** "For the office can you expand the L1 so it have more room". Owner decisions, relayed by the coordinator on 2026-10-20:
- The office gets its own wing: a slab extension with a lead road and a dedicated plaza, the way the Highlights Hall works. Stations sit flush; colliders, point-and-go bounds and the minimap all derive from the config.
- A roomier desk arc that meets the full 6 u `SPACE_RULES`. Remove the fixture exception and the office's own clearance carve-outs.
- The wing goes on the SOUTH side. It is defined relative to the Lobby slab's south edge in one named `LOBBY.officeWing`, so the L1 re-spacing session (Lobby z ±21 to ±27, ring r 13.5, merging after PR3) moves the wing automatically.
- The lead road leaves the plaza inside x -3 to 9.
- `FloorLayout` bounds become a union of rects, with tests, so the minimap, point-and-go and the camera clamp cover the wing.
- Unchanged:
  - the plaza views and the `L1:kiosk` spawn view;
  - the intro orbit, which stays bit-identical (the reveal handles the wing);
  - L1 under 125 draw calls on both tiers;
  - the chip and wall-text no-overlap fixes.
- New: the office plaza gets its own stop, a camera zone for desktop, tablet and phone (the wall plus the desks with little empty sky), a lane and a road, an `IntroReveal` entry, and elevator and deep-link behaviour that matches the other stations.
- Re-measure the office chunk's prefetch distance. Set the 3D session caps per the owner's budget rule at merge time: the measured value plus about 0.6 KB, after rebasing on main.
- Docs: `docs/agents/floor-l1-lobby.md`, the office docs, and a decision entry. The 2026-10-19 space-rule exception is superseded.

**Architecture:** `FloorLayout.bounds` stays the main slab rect, so every test that pins `LOBBY.bounds` keeps passing. A new optional `FloorLayout.wings: Rect[]` holds the extensions. Pure helpers in `src/experience/nav/slab.ts` serve every consumer that needs the real walkable shape:
- `slabRects(layout)`: `[bounds, ...wings]`;
- `slabBox(layout)`: the bounding box;
- `inSlab(p, layout, inset = 0)`;
- `clampToSlab(p, layout, inset)`: the nearest point of the inset union.

`FloorLayout.roadZone` becomes `Rect | readonly Rect[]`. The office layout reads `LOBBY.officeWing` (the wing rect, its lead road and plaza), and the office constants become offsets from the wing.

**Tech stack:** TypeScript, React Three Fiber, Vitest, Playwright, Bun.

## Global constraints

- Repo rules apply (AGENTS.md): no em dash; content is data; bilingual; `useDispose`; `useFrame` only; floor chunk import rules; point-and-go registry; no words painted on floors; no colored edge stripes.
- **Bytes:**
  - Office scene chunk at most 14,336 B gzip; it is 14,229 B now.
  - Drawer body at most 6,144 B; it is 5,996 B now.
  - Main path: session full 471.0 KB and lite 447.4 KB measured. Keep main-path growth small; the caps are re-set at merge by the owner's rule.
  - `officeLayout.ts` is in the Classic page chunk (through `config.ts`), so keep it data-light. Classic JS on /en is at 237.0 of 240 KB.
- **Intro:** `tests/unit/intro.test.ts` "leaves every desktop pose as it was" and the phone and tablet property tests must stay green untouched. `LOBBY.spawn`, `LOBBY.hologram`, `LOBBY.spawnHeading` and `INTRO_LANDMARKS` (five ids) stay unchanged.
- **Unchanged views:** the plaza view zones (`L1:skills`, `L1:certifications`, the hall zones, the observatory zones, `L1:arrival`) and the spawn view.
- **Draw calls:** L1 below 125 on both tiers (measured 93 lite, 95 full). Wing road and plaza graphics reuse the hall's road kit programs and merge into as few meshes as possible.
- **Captures:** at desktop 1440x900, tablet 820x1180 and phone 390x844, full and lite tiers, three shots: the approach from the plaza, at the office stop, and with a drawer open. Plus a top-down L1 overview showing the wing.
- **Ports:** 44xx or 45xx, never 4173.

## Geometry (target; Task W2 may tune within the bounds, and every number is derived in code from `LOBBY.officeWing`)

S is `LOBBY.bounds.maxZ` (21 today).
- **Wing slab:** x -12 to 18, z S to S + 30. If the 6 u rules need it, x may widen to -12 to 24. It must not reach x < -12, so the observatory corner at (-18, 21) keeps 6 u, and it must stay clear of the hall gate's south pillar near x 32.
- **Lead road:** 8 u wide, centred on x 3 (x -1 to 7), from inside the Lobby plaza floor (around z 13, south of the ring lane, open floor) to the wing plaza. It never enters the hall's `roadZone`.
- **Wing plaza:** centred about (3, S + 12), at least 16 u across.
- **Office:**
  - Stop: (3, S + 13).
  - Desk arc: centre on the stop's axis; radius and angles chosen so desk-and-Rover obstacles either touch or keep 6 u between them, and keep 6 u to the wing edges unless flush.
  - Screen wall: flush with the wing's south edge (S + 30), facing north. Its obstacle touches the slab edge (allowed).
- **Office prefetch:** the chunk loads within `loadRadius` of the stop. Spawn to stop is about 27 u. Measure, and decide between keeping a 40 u radius (every session still fetches it) and about 22 u (the lead road and the wing only). Report session behaviour both ways.

## Task W1: Multi-rect slab (infrastructure, no visible change on any floor)

**Files:**
- Create: `src/experience/nav/slab.ts`, `tests/unit/slab.test.ts`
- Modify:
  - `src/experience/types.ts` (`FloorLayout.wings?: readonly Rect[]`; `roadZone?: Rect | readonly Rect[]`)
  - `src/experience/nav/navgrid.ts` (`buildNavGrid` over `slabBox`; a cell is walkable when its centre is inside the radius-inset union; the shared edge between two touching rects is not a wall)
  - `src/experience/nav/collision.ts` (`resolveCircle` clamps to the inset union through `clampToSlab`; the world type takes the layout's rects)
  - `src/experience/rover/movement.ts` (`world` carries the rects)
  - `src/experience/nav/road.ts` (`routeUsesRoad` accepts a zone list)
  - `src/experience/nav/space.ts` (`bounds-gap` measures against the union's outer edges only; `pad-bounds` uses `inSlab`; `wideGrid` passes the rects)
  - `src/experience/camera/collision.ts` (`cameraWorld`, `cameraBlocked`, `onSlab`, `viewOnSlab`, `clampCamera` use the union)
  - `src/experience/tower/FloorLevel.tsx` (one slab box and edge set per rect, plus one `GridFloor` per rect; no edge line across a shared joint: drop the edge segments that lie on a touching edge, or build the outline from the union polygon; `registerFloorSlab` registers each mesh or a merged geometry)
  - `src/experience/tower/Tower.tsx` (`towerFrame` from `slabBox`)
  - `src/hud/minimap/model.ts` and `MapLayers.tsx` (`view` from `slabBox`; `slab` becomes an array of rects, drawn as one SVG path, or as rects that share the fill without an inner stroke)
  - `e2e/camera.spec.ts` (`offSlab` uses every rect of `__hq.layouts[floor]`)
  - Tests that read `layouts[floor].bounds` as "the slab" for inclusion checks (`interact-registry.test.ts:280`, `camera-collision.test.ts`, `navgrid-bounded.test.ts`, `minimap-model.test.ts`): switch them to `slabRects` or keep them as they are when they are about the main rect.

**Steps:**
- [ ] Write `tests/unit/slab.test.ts` first, against an L-shaped layout (main rect plus a wing that touches it along part of one edge):
  - `inSlab` inside both rects, outside the missing corner, on the shared joint;
  - `clampToSlab` with the inset to the nearest valid point, including from the missing corner;
  - `slabBox`.
  Also add cases to the existing navgrid, collision, space, camera-collision and minimap tests:
  - navgrid: a rover can path across the joint, and no cell inside the missing corner is walkable;
  - space rules: an obstacle 6 u from the joint corner passes, 3 u fails, and the joint itself is not an edge;
  - minimap: the slab array and the view box.
- [ ] Implement. Floors without `wings` behave byte for byte as before. Add one test that asserts a single-rect layout's navgrid, collision and clamp results equal the old behaviour on sampled points.
- [ ] Run `bunx tsc --noEmit -p .`, `bunx vitest run tests/unit tests/hud`, `bun run build`, and the camera e2e (`E2E_PORT=4551 bunx playwright test e2e/camera.spec.ts`).
- [ ] Commit `feat(nav): multi-rect floor slabs (wings) for the navgrid, collision, camera, slab mesh and minimap`.

## Task W2: The office wing on L1 (layout, road, plaza, office move, space rules)

**Files:**
- Modify:
  - `src/experience/config.ts`: `LOBBY.officeWing`, a named object `{ rect, lead: { x, width, from, to }, plaza: { center, w, d }, stop }` derived from `LOBBY.bounds.maxZ`. L1 gets `wings: [LOBBY.officeWing.rect]`. `road` merges the hall network with the wing's lead road and plaza. `roadZone` becomes `[HALL_LAYOUT.zone, wing zone]`, where the wing zone is the wing rect plus the lead road's span in the Lobby.
  - `src/experience/floors/lobby/officeLayout.ts`: `OFFICE` constants relative to the wing (`slabEdge` becomes the wing's south edge). `officeObstacles` lays out the arc so it meets `SPACE_RULES`. `officeWallRect`, `officeStops`, `officeTall`, `officeZone` (the stop's camera zone; Task W3 tunes the class views) and `loadRadius` all follow. Keep the module import-light: it cannot import `config.ts`, so pass the wing in (for example `officeLayoutFor(wing)`), or move the wing constant into `officeLayout.ts` and have `config.ts` read it from there. Pick whichever keeps the single source of truth in `LOBBY.officeWing` as the coordinator asked. Re-exporting from `config.ts` is acceptable if the value lives in `officeLayout.ts` and `config.ts` builds `LOBBY.officeWing` from it.
  - `src/experience/floors/lobby/officeShell.ts`: cable trays and shell boxes for the new arc.
  - `src/experience/floors/lobby/office/runtime.ts` (`CHIP_ROW` arc over the wall) and `officeRig.ts`: unchanged logic, with positions from the slots and the wall.
  - `src/experience/floors/Lobby.tsx`:
    - add `REVEAL.wing` (the wing rect plus the lead road) and wrap the wing's road and plaza graphics and the office mount in `IntroReveal`;
    - draw the lead road and the plaza with the road kit the hall uses (merged meshes);
    - add a floating sign "AGENT OFFICE" through `FloatingSigns` if the hall gate has an equivalent; EN and ID copy, reusing `office.3d.target.office` or `hud.rooms.office` when it fits.
  - `tests/unit/highlights-layout.test.ts`: remove the office filter. The full L1 must pass `expectSpaceRules` with only the pre-existing skills wall `bounds-gap` exception.
  - `tests/unit/lobby-office.test.ts`: rewrite the clearances for the wing:
    - the desks meet the 6 u rule;
    - the stop is reachable from the spawn and the elevator through 6 u floor;
    - the lead road runs inside x -3 to 9;
    - the wing is relative to `LOBBY.bounds.maxZ`: build it with a stubbed maxZ of 27 and assert everything shifts by 6.
  - `tests/unit/office-chip-placement.test.ts`, `office-interact.test.ts` and the e2e/office.spec.ts parking spot: follow the new geometry.
  - `docs/decisions/2026-10-19-agent-office-space-rules.md`: leave it as history. The new decision file in W4 supersedes it.

**Steps:**
- [ ] Write the failing tests: space rules without the office filter, the wing relative to S, the lead road inside x -3 to 9, minimap and point-and-go cover the wing.
- [ ] Implement the layout. Verify in the dev floors route or a scratch capture that the rover drives from the spawn along the lead road into the wing, and that a point-and-go to `L1:office` follows the road.
- [ ] Mission and deep links: the office mission (elevator, drive `L1:office`, open) works from another floor. Office rooms keep `/{locale}` (`isOfficeRoom`) like the hall rooms. The elevator arrival is unchanged.
- [ ] Run `bunx vitest run tests/unit tests/hud`, `bun run build`, `E2E_PORT=4552 bunx playwright test e2e/office.spec.ts e2e/highlights.spec.ts e2e/interact.spec.ts e2e/experience.spec.ts`, and the L1 perf spots.
- [ ] Commit `feat(office): the Agent Office moves into its own south wing of the L1 slab`.

## Task W3: Office camera zone, intro check, prefetch distance, bytes

- [ ] **Office zone class views:** the zone at the new stop looks south at the wall. Tune `zoom` and `pitch` per class (desktop, tablet, mobile) so the wall plus the five desks fit with little sky. Targets:
  - Portrait phone and tablet: the sky above the wall frame is at most about 20% of the screen height.
  - Desktop: the wall is fully in frame.
  - The player Rover stays in view.
  Add a pure unit test in `office-chip-placement.test.ts` style: project the wall top and the desks with the zone's pose per class and assert those bounds. The wing stop sits farther from the wall than the old one, so the look target can sit over the desks. If the targets still cannot be met without a rig change, report the best values and stop.
- [ ] **L2 ghost outline** (the amber line, `tower/FloorLevel.tsx:87`): check whether the L2 slab's ghost outline crosses the new office view on any class. Report it with a capture; do not change the tower.
- [ ] **Intro:** `tests/unit/intro.test.ts` and `intro-landmarks.test.ts` pass untouched, and `git diff` shows no change in `src/experience/camera/intro.ts`.
- [ ] **Prefetch:** measure the spawn-to-stop distance and choose `loadRadius` (see Geometry). Pin it in `tests/unit/office-chunk.test.ts`. The bytes gate still measures the office chunk through `__hq.office.load()`.
- [ ] Run the bytes gate (`E2E_PORT=4553 PERF=1 bunx playwright test e2e/perf/bytes-3d.spec.ts --workers=1`) and the L1 perf spots (`-g "L1 (lite|full): settled"`). Report the main path, the session totals, the office scene and body bytes, and the L1 draw calls.
- [ ] Commit `feat(office): the wing's camera view and prefetch distance`.

## Task W4: Docs, decision, captures

- [ ] Write `docs/decisions/2026-10-20-agent-office-wing.md`: the owner request verbatim, the south wing relative to the Lobby edge, the full space rules (it supersedes 2026-10-19-agent-office-space-rules), the bounds union, and the prefetch distance.
- [ ] Update `docs/agents/floor-l1-lobby.md` (the Agent Office section: the wing layout, road, plaza, stop, zone, reveal, clearances; drop the fixture exception text), `docs/agents/floors.md` (multi-rect slabs, `wings`, the `slab.ts` helpers, `roadZone` lists), `docs/agents/office.md` where it names the position, `docs/features.md` (the part 3 row), and `docs/agents/performance.md` numbers.
- [ ] **Captures:** extend `scripts/office-shots.ts` with an `approach` shot (the rover on the lead road at the plaza edge looking into the wing) and an `overview` (top-down L1 at 1440x900 through `__hq` with an orthographic or high-pitch camera; if `__hq` cannot set the camera, take the minimap at large size instead and say so). Run it for desktop, tablet and phone, full and lite: approach, at the stop (states-a, states-b), drawer, plus the overview.
- [ ] Run `bun run verify:quick`, `bun run validate:content` and `bun run e2e:changed --base origin/main` (a full run because of the budgets; report flakes as before).
- [ ] Commit `docs(office): the Agent Office wing` and `chore(office): wing captures`.
