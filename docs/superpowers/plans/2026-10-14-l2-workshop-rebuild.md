# L2 Workshop rebuild (F3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the L2 Workshop annex (bench rows, long thin repo wall) with a composed Workshop: a forecourt with a time console and the Return pad, a gateway, ten workbenches with clickable holograms, a 20-repo skyline, and the Horizon deck at the end.

**Architecture:** The pure layout (`floors/career/layout.ts`) gains a forecourt plaza and a longer Workshop plaza; new pure modules `workshopLayout.ts` (benches, skyline, console, gateway, stops, camera zones) and `skyline.ts` (log height scale, language colors, top labels) feed one R3F component `WorkshopAnnex.tsx` that draws everything in about 10 draw calls (merged solids, merged edges, one instanced holo-plate mesh for skyline bars, bench cards and the console screen, one `BatchedLabels`, one `HoloIcon`, the unchanged window). Side projects and repos get their own drawer views (`L2:side-<id>`, `L2:repo-<slug>`), reached through point-and-go targets and `FloorLayout.roomStops`. The console opens a new picker kind (`console`) that beams to any year pad or to the elevator pad through the existing `teleport` intent.

**Tech Stack:** Next.js 16 static export, React Three Fiber, three.js, zustand, next-intl, Vitest, Playwright.

## Global Constraints

- No em dashes (U+2014) anywhere.
- EN and ID for every label; UI strings in `messages/{en,id}.json` with identical keys.
- No new content: everything shown comes from `sideProjects`, `publicRepos`, years and messages. No client company names in 3D.
- L2 stays under 30k triangles at every peak (rides included), at most +6 scene calls at the annex compared with main, programs within baseline + 2 (reuse `fx/holoFx.ts`), precompiled by the floor's `FloorPrep`.
- Lite tier simpler (no bench icons, no language legend). Reduced motion static (no sway, a teleport is the fade cut).
- Space rules (`expectSpaceRules`) hold with the real content; pads (including F1's Return pad) pass `padViolations`.
- E2E port 4452, never 4173. Keep work inside `src/experience/floors/career/*`, drawers and messages, plus the minimal shared hooks listed per task.

## Geometry (with today's content: last plaza ends at x 331)

| Piece | Where |
|---|---|
| Link | x 331 to 341, S-curve back to z 0 (unchanged) |
| Forecourt plaza | x 341 to 359, z -9 to 9 (`CAREER_ROAD.forecourt` 18 x 18) |
| Time console | north of the forecourt, 5 x 1.2 u at z about -11.1, screen facing +z (rail camera); stop at z -8 |
| Return pad (F1) | beside the console, 5.5 u west, z -8.2 (`workshop.returnPad`; west so its sign clears the WORKSHOP sign) |
| Gateway arch | x = Workshop start (359), posts at z +-5, WORKSHOP floating sign above |
| Workshop plaza | x 359 to 398, z -9 to 9 (`WORKSHOP.plaza`: 18 deep, length from the bench span, at least 34) |
| Repo skyline | north of the Workshop, plinth 18 x 3.6 u (10 columns x 2 rows, 1.8 u pitch), bars 1.5 u square, height `0.8 + 7.2 * ln(1 + stars) / ln(1 + max)`; stops at z -8 |
| Workbenches | south of the Workshop, two groups of 5 touching 2.2 u benches 6 u apart, starting 4 u past the gateway; stops at z 8 |
| Horizon deck | road end 4 u before the window; #87 window, bridge, skyline and sunrise unchanged |

Obstacles keep 6 u from each other (the benches start 4 u past the gateway posts and 5 u further south: 6.4 u) and from the window end of the slab (7 u). Executed decisions: the plaza went from 22 to 18 u deep after the first captures (the benches sat under the HUD pill); the bench and repo rooms stay out of the Cmd-K catalog (they pushed pods down in search; the Workshop room's keywords already list them).

---

### Task 1: Pure Workshop layout

**Files:**
- Create: `src/experience/floors/career/skyline.ts`, `src/experience/floors/career/workshopLayout.ts`
- Modify: `src/experience/floors/career/layout.ts`, `src/experience/types.ts` (`CareerLayoutInput.repos`, `CareerData.repos` objects, `FloorLayout.roomStops`), `src/content/experience.ts` (repo payload), `src/experience/config.ts` (`careerLayout` passes `roomStops`, `viewZones`, `tall`)
- Test: `tests/unit/career-layout.test.ts`, `tests/unit/career-workshop.test.ts`, `tests/unit/career-skyline.test.ts`, `tests/unit/career-horizon.test.ts`

**Interfaces (produces):**
- `skylineHeight(stars: number, max: number): number`, `languageColor(language: string): string`, `SKYLINE` constants, `skylineBars(repos: WorkshopRepo[]): SkylineBar[]` (`{ slug, name, language, stars, rank, x, z, h, color }` relative to the plinth origin), `topRepos(bars, n)`.
- `buildWorkshop(start: number, input: { benches: number; repos: WorkshopRepo[] }): WorkshopLayout` with `plaza`, `forecourt`, `gateway`, `console: { rect, stop, screen }`, `returnPad`, `benches: { id index, rect, stop }[]`, `skyline: { plinth, bars, stops }`, `deck`, `viewZones`, `obstacles`, `tall`.
- `CareerRoadLayout.workshop` becomes that `WorkshopLayout` (plus `room`, `at`); `annex` stays the Workshop plaza; new `forecourt: Plaza`.
- `sideProjectRoom(id)`, `repoRoom(slug)`, `repoSlug(name)` in `src/content/workshop.ts` (pure, client safe).

- [ ] Write failing tests: forecourt and Workshop plazas follow the last plaza; console north of the forecourt facing the camera with its stop on the plaza; benches one per side project, two groups, 6 u clear of the window; skyline 20 bars with heights monotonic in stars, log scale, color by language, top three spaced; stops on the plaza clear of obstacles; `expectSpaceRules` with the real content and the Return pad as a pad; scrub stops end with the forecourt and the Workshop; `placeAt` names the Workshop from the forecourt; horizon strips stay clear of the skyline and the benches.
- [ ] Run `bun run test tests/unit/career-*.test.ts`: fail.
- [ ] Implement the modules above.
- [ ] Run the tests: pass. Commit `feat(l2): workshop layout, forecourt and repo skyline scale`.

### Task 2: Drawers and catalog

**Files:**
- Create: `src/content/workshop.ts`
- Modify: `src/content/room-views/career.ts`, `src/content/room-views/types.ts` (`externalLabel`), `src/hud/drawer/RoomDrawer.tsx`, `src/experience/missions/host3d.ts` (`roomTarget` reads `layout.roomStops`), `src/experience/Experience.tsx` (`hasPage`: only career entries have an L2 page), `messages/{en,id}.json`
- Test: `tests/unit/room-views.test.ts`, `tests/unit/missions-host3d.test.ts`

- [ ] Failing tests: one view per side project and per repo (title, summary or description, language and stars meta, external link, prev and next chains), `roomTarget` returns the bench, repo and gateway stops.
- [ ] Implement, run, commit `feat(l2): side project and repo drawers`.

### Task 3: Point-and-go, console picker, hints

**Files:**
- Modify: `src/experience/interact/registry.ts` (L2 Workshop items: gateway `L2:station:workshop`, console `L2:station:time-console`, benches `L2:station:bench-<id>`, repos `L2:station:repo-<slug>`), `src/experience/interact/pick.ts` (`console-picker` action), `src/experience/nav/pads.ts` (`PickerRequest` `console`), `src/experience/nav/teleport.ts` (an elevator pad beam faces the car), `src/hud/pads/picker.ts` (`consoleOptions`), `src/hud/pads/PadPicker.tsx`, `src/hud/dialog/hintLines.ts`, `messages/{en,id}.json`, `src/experience/Experience.tsx` (labels)
- Test: `tests/unit/interact-registry.test.ts`, `tests/unit/interact-pick.test.ts`, `tests/unit/pad-picker.test.ts` (or the existing picker test), `tests/unit/hint-lines.test.ts`

- [ ] Failing tests: registry lists the new L2 targets with labels and stops; `performInteract` opens the console picker; `consoleOptions` lists Back to elevator plus every year; an elevator beam heads west.
- [ ] Implement, run, commit `feat(l2): time console and workshop targets`.

### Task 4: Scene

**Files:**
- Modify: `src/experience/floors/career/WorkshopAnnex.tsx` (rewrite), `src/experience/floors/career/labels.ts` (`workshopSigns`, `workshopLabelSet`), `src/experience/floors/career/YearGates.tsx` (extra signs in the same group), `src/experience/floors/CareerArchive.tsx`, `src/experience/floors/career/horizonLayout.ts`, `src/experience/prototype/FloorsPrototype.tsx`
- Test: `tests/unit/floor-signs.test.ts`, `tests/unit/floating-sign.test.ts`, `tests/unit/three-disposal.test.ts`

- [ ] Draw: merged solids (benches, console, gateway posts and beam, skyline plinth), merged edges, one instanced holo-plate mesh (skyline bars, bench cards, console screen), one `BatchedLabels` (bench titles, top repo names and stars, console screen lines, legend on full), one `HoloIcon` for bench icons (full only), the unchanged window, signs added to the career sign group.
- [ ] Typecheck, unit tests, commit `feat(l2): workshop scene`.

### Task 5: E2E, perf, docs, captures, PR

**Files:**
- Create: `e2e/workshop.spec.ts`
- Modify: `scripts/e2e-plan.ts` (map `src/experience/floors/career/**` to `workshop`), `README.md`, `docs/superpowers/specs/agent-hq/01-world-and-layout.md`, `02-interaction-and-states.md`, `08-quality-acceptance.md`, `AGENTS.md` (L2 paragraph), `e2e/perf/baseline.json` only with a reason

- [ ] E2E: console teleport to a year and back to the elevator, bench and repo drawers through point-and-go, forecourt routes (2026 plaza to console, Return pad spot, gateway, bench, back west), reduced motion cut and static scene.
- [ ] `bun run verify:quick`, `bun run e2e:changed`, `E2E_PORT=4452 bun run e2e:perf`, visual gate for unchanged L2 parts, before and after captures.
- [ ] Open the PR, post captures and measurements, get every required check green.
