# R5 P8: L3 Layout Consolidation Implementation Plan

Status: shipped in #71 (b751c71), 2026-10-13. Later replaced in #164 and #168: the road layout by the three paths, the directory wall and the floating wing signs by three separate boards

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate L3 Project Roads so each wing road ends right after its last pod, drop the L3 floor arrows and floor-painted wing names, make the floating wing signs readable (never mirrored) from any camera yaw, and turn the two wing directory boards into a prominent directory wall that fills the arrival view, without raising the L3 render cost.

**Architecture:** Everything positional stays data-driven in the pure `buildLabsLayout` (Vitest in node): each wing road turns `LABS.tail` past its last docked pod into a moved-in east plaza, `RoadNetwork.chevrons: false` switches chevrons off for L3 only (read by the pure `chevronMarks`, so `RoadMarkings` needs no new prop), and the directory boards move from the hub's west rim (behind the arrival camera) to a two-panel wall where the wing roads fork, with the arrival spot and view zones retuned so the wall fills the frame at 1440x900, 2560x1440 and 390x844 (asserted with a three.js projection test). The wall's content is a new pure module (`directory.ts`: solids, line segments and pre-wrapped BatchedText labels, 3 draw calls in total, following the L1 Highlights Hall pattern), and the floating signs turn to the camera every frame through a pure `yawTowards` (yaw only, upright text on a dark backing).

**Tech Stack:** Next.js 16 static export, React Three Fiber, drei `Text`, troika `BatchedText` (`fx/BatchedLabels.tsx`), three.js, Vitest (node), Playwright on SwiftShader, Bun.

## Global Constraints

- Owner request (verbatim): "The layout for L3 need consolidation since the end of each section is just empty and we dont need arrow on the floor also Product Engineering and AI Engineering word dont need to show in the floor and the floating for tht is reserved (so it cant be read properly, fix it). The board near elevator in L3 list of the Product Engineering and AI Engineering also not noticable". "reserved" means reversed/mirrored.
- Owner decision: remove floor arrows (road chevrons) on **L3 only**; every other floor keeps its chevrons unchanged.
- The aesthetic is fixed elsewhere: any task that can change pixels outside L3 needs a before/after screenshot diff (desktop full 1440x900 and 2560x1440, phone lite 390x844, same camera poses) with an explicit threshold and a rollback note. L3 itself changes on purpose (owner request); its before/after captures go to the owner for review.
- Never remove the rover, neon look, bloom, holograms, missions or the intro.
- Measure before and after with the same method; record the numbers in the PR body.
- Lighthouse CI budgets stay green: LCP 2000 ms, CLS 0.01, TBT 200 ms, JS 240 KB, CSS 20 KB, fonts 60 KB, HTML 80 KB.
- Render budgets: < 150 draw calls, < 30k triangles per floor; L1 cap 140, RF cap 80. L3 arrival must stay at or under its pre-P8 count (REPORT M47: 64 lite / 82 full; re-measured in Task 1).
- No em dashes (U+2014) anywhere: code, comments, copy, docs, commits, PR text (a unit test scans the repo).
- Bilingual: user-facing strings are `{ en, id }` or `messages/en.json` + `messages/id.json` with identical keys. This plan adds no new strings: wing names come from `common.wing` via `ExperienceData.labs.wings`, the board header from `drawer.directory`, `walk.boardCount` and `walk.boardOpen`. Never hardcode wing names.
- Content is data and every project list uses the gallery-first order (`comparePods` / `tourOrder`); never hard-code slugs.
- Space rules (`expectSpaceRules` from `tests/helpers/space.ts`): roads >= 8 u wide, plazas >= 16 u, roads clear of obstacles, obstacles touching or >= 6 u apart (also from the slab edge), a spur to every door, 6 u wide floor from the start to every pad.
- Registry ids stay `L3:door:<slug>` and `L3:board:software|ai`; deep links `/labs` and `/labs/<slug>`, the `labsWalk` tour order, packet lanes off door pads, and the L3 elevator pad on the approach keep working. L3 has no teleporters.
- Fast verification before every push: `bun run verify:quick`, then `E2E_PORT=4437 bun run e2e:changed`. Never run two e2e suites at once; Playwright workers stay at 2.
- Bun is the package manager; conventional commits; prefer the `rtk` wrapper for git (`rtk git ...`). One PR; do not merge without the owner.
- Public repo: no client names, private data or em dashes in captures, docs or PR text.

---

## Measured facts this plan relies on (main @ f61fbba)

- Real content docks 9 pods per wing (5 outer, 4 inner), incl. `solutions-marketing-site` and `event-ticketing-platform` (Product Engineering, featured). The last outer pods span x 92..100 in both wings; the last inner pods end at x 87.
- Today the wing roads run straight to x = 110 (`farX + tail`, tail 8), then diagonally 14 u to the east plaza at (124, 0); the slab ends at x = 139. Roughly 24 u of straight road plus the diagonal and the plaza carry no pod on either wing (the "empty end").
- The directory boards stand at (-14, -9.5 / +9.5). The arrival camera (overview zone at (12, 0), yaw -3PI/4, zoom 1.3) stands at about (-11.4, 24.4, 0) looking east, so the boards are behind and beside it: they never appear in the arrival frame (projected x -1104..157 at 1440x900).
- The floating signs use a fixed yaw of PI/4 (`FACE_CAMERA` in `Hub.tsx`): from the arrival camera the AI Engineering sign shows its back (dot of its front with the direction to the camera is -0.99), which renders the text mirrored; the Product Engineering one is edge-on. Under P7's free rotation any fixed yaw is mirrored from half of all camera yaws.
- Proposed numbers validated against the real layout code in a scratch run: with tail 7 the wing roads turn at x = 107, the east plaza sits at (107, 0), the slab ends at x = 122 (17 u shorter); space rules pass for the real pods, a lopsided 9/3 floor and an empty floor; the directory wall at x = 17 (panels 0.6 x 7.5 u, 9.5 u tall, touching at z = 0) is 6.72 u from the nearest pod with the inner row starting at x = 24; at the arrival spot (8.5, 0) both panels project whole inside the HUD-safe box at 1440x900 (x 447..993, y 158..432), 2560x1440 (x 844..1716, y 253..691) and 390x844 (x 33..357, y 241..395); wing titles project at 25.6 px (1440x900) and 14.2 px (390x844), list lines at 12.0 px (1440x900) and 10.1 px from the board stop on a phone.
- Inter ExtraBold (the list font) measures 0.51 to 0.57 em per character on the 36 docked titles (EN and ID); with 0.46 u type and 6.9 u of text width every title wraps to at most two lines (widest line 6.68 u). The tier marks (U+25C6, U+25C7) and U+25B8 come from the troika fallback font `jetbrains-mono-symbols-700.woff` (`text-config.ts`).

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/experience/floors/labs/layout.ts` | Modify (Tasks 2 to 5) | Pure L3 layout: wing roads turn after the last pod, moved-in east plaza and slab, chevrons off, sign float points, directory wall position, arrival spot, view zones, packet spine |
| `src/experience/floors/labs/directory.ts` | Create (Task 6) | Pure content of the directory wall: panel rows, word wrap, title fit, top-5 list, solids, line segments, BatchedText labels |
| `src/experience/floors/labs/Hub.tsx` | Rewrite (Tasks 4, 6) | R3F: camera-facing wing signs with a dark backing (no floor text); the directory wall in 3 draw calls |
| `src/experience/floors/Labs.tsx` | Modify (Task 6) | Memoized hub labels so the batched wall text never re-syncs on re-render |
| `src/experience/fx/facing.ts` | Create (Task 4) | Pure `yawTowards(from, viewer)` |
| `src/experience/nav/road.ts` | Modify (Task 3) | `RoadNetwork.chevrons?: boolean` |
| `src/experience/nav/roadGeometry.ts` | Modify (Task 3) | `chevronMarks` returns `[]` when a network turns chevrons off |
| `src/experience/fx/RoadMarkings.tsx` | Modify (Task 3, doc comment only) | Documents the per-network chevron switch |
| `tests/unit/labs-layout.test.ts` | Modify (Tasks 2, 3, 5) | Road end vs last pod, slab bounds, lopsided and empty floors, no L3 chevrons, wall placement, arrival spot |
| `tests/unit/labs-arrival.test.ts` | Create (Task 5), extend (Task 6) | Projection: both panels framed on arrival and from their stops; legibility in px |
| `tests/unit/labs-directory.test.ts` | Create (Task 6) | Wall content: rows, wrap, titles from messages, top-5 list, faces not mirrored, solids and lines |
| `tests/unit/facing.test.ts` | Create (Task 4) | Sign faces the camera from any yaw and reads left to right; documents the old mirrored yaw |
| `tests/unit/road.test.ts` | Modify (Task 3) | `chevronMarks` honors `chevrons: false` |
| `e2e/labs.spec.ts` | Modify (Tasks 1, 7) | L3 arrival draw-call caps; wall framing at 1440x900 and 390x844; click and tap open the full list |
| `e2e/screenshots.spec.ts` | Modify (Task 1) | Opt-in `r5-p8` captures: L3 review poses with metrics, and the unchanged-floors diff gate |
| `.gitignore` | Modify (Task 1) | Ignore `/e2e/*-snapshots/` (local diff baselines) |
| `public/floors/L3.webp` | Regenerate (Task 8) | Elevator picker thumbnail of the new L3 arrival |
| `README.md`, `AGENTS.md`, `docs/superpowers/specs/agent-hq/01-world-and-layout.md` | Modify (Task 8) | L3 description, road kit, RoadMarkings draw calls, appendix 01 section 4 |

Untouched on purpose: `Pods.tsx`, `PacketLanes.tsx`, `HologramStage.tsx` (they read the layout data), `interact/registry.ts` (its `labsBoards` reads `labs.boards[wing]` and `LABS.board.h`, both still valid), `missions/walks.ts` and `missions/host3d.ts` (they call `directoryStop`), and the dev prototype `prototype/FloorsPrototype.tsx` (dev-only; it reads `boards`, `signs[wing].at` and `east`, which keep their shape).

## Cross-workstream conflicts and rebase notes

| File(s) | Other workstream | What they do there | Rebase note |
|---|---|---|---|
| `src/experience/camera/rigs.ts`, `orbit.ts`, `CameraDirector.tsx`, `hud/ViewControls.tsx` (read only here) | P7 free camera | 360 yaw, pitch, wheel zoom, first person, collision | P8 tests call `followPose(cls, target, yaw, zoom)`, `FOLLOW_LOOK_AHEAD`, `followOffsetScale` and `zoneAt`, and the captures click "Reset view (0)" and "Rotate left (Q)". If P7 changes those signatures, the zone semantics (yaw on entry) or the button names, update `settledCamera` in `tests/unit/labs-arrival.test.ts`, the overview test in `labs-layout.test.ts` and `p8WingEnd` in `e2e/screenshots.spec.ts`. Tell P7: the wall is an obstacle 9.5 u tall (`LABS.board.h`) at x = 17, include it if its camera collision uses floor obstacles; signs already face the camera from any yaw (`yawTowards`), the wall is double-sided. |
| `src/experience/fx/BatchedLabels.tsx`, `fx/labelProps.ts` (used, not changed) | P2 GPU, batched labels | Batches L1 stats ring and L2 labels | P8 adds one consumer (the L3 wall). If P2 changes the `BatchedLabel` shape, re-run `tests/unit/labs-directory.test.ts`. The two floating signs stay troika `Text`: they turn every frame, which batched members cannot. |
| `src/experience/floors/labs/Hub.tsx`, `fx/RoadMarkings.tsx` | P3 CPU/lifecycle | Geometry and material disposal fixes per floor | P8 rewrites `Hub.tsx` (GlassBox and BoardFace are gone); keep P8's file and re-apply any P3 disposal rule to the new code (the wall's `LineBatch` geometry is already disposed on unmount). P8 changes only a doc comment in `RoadMarkings.tsx`. |
| `e2e/hq.ts` (read only), `e2e/labs.spec.ts` | P4 measurement gates | Scene vs post-pass draw-call split, peak sampling | If P4 changes what `__hq.rover.drawCalls` counts, re-measure the L3 caps with the same method on main and update `L3_ARRIVAL_CALLS`. |
| `e2e/screenshots.spec.ts`, `.gitignore` | P2, P1 (diff gates and captures) | Their own capture blocks | P8 only appends a block at the end and extends the `./hq` import line; on conflict keep both blocks and merge the import names. |
| `public/fonts/*` (read only) | P1 font subset (SP10) | Troika font subsetting and caching | The wall uses U+25C6, U+25C7, U+00B7, U+25B8 (symbols fallback font) and Inter ExtraBold latin; L3 no longer draws U+2192 on the floor. Keep those glyphs in any subset. |
| `AGENTS.md`, `README.md`, spec appendices | All | Docs | Re-apply the L3 paragraph edits from Task 8 on top of theirs. |
| `content/site-content.json` (read only) | P5 CV refresh | May change pod tiers or titles | Every P8 test is relational (last pod edge, tour order, wrap widths), so content changes keep them valid; re-run `labs-directory.test.ts` to confirm all titles still wrap in two lines. |

### Task 1: Baseline harness, captures and L3 draw-call caps

Baseline for every later comparison (REPORT M47 for the 64/82 calls; global rule: same method before and after). This commit changes no runtime code, so its captures equal main.

**Files:**
- Modify: `e2e/screenshots.spec.ts` (import line 2, append a block at the end)
- Modify: `e2e/labs.spec.ts` (imports, append two tests)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `__hq.rover.drawCalls` / `triangles` via `snapshot(page)`, `__hq.layouts.L3.road`, `interactablesOf(page)`, `driveTo`, `waitForCameraSettle`, `waitForSceneLive` (all in `e2e/hq.ts`).
- Produces: `screenshots/r5-p8/{before,after}/*.png` and `metrics.jsonl`; local diff baselines `e2e/screenshots.spec.ts-snapshots/r5-p8-*.png`; the `L3_ARRIVAL_CALLS` caps used in Task 7 and Task 8.

- [x] **Step 1: Branch from main**

```bash
rtk git fetch origin && rtk git switch -c r5/p8-l3-consolidation origin/main
```

Expected: `Switched to a new branch 'r5/p8-l3-consolidation'`.

- [x] **Step 2: Ignore local diff baselines**

Append to `.gitignore`:

```gitignore
# Local screenshot-diff baselines (Playwright toMatchSnapshot), never committed.
/e2e/*-snapshots/
```

- [x] **Step 3: Add the L3 arrival draw-call caps to `e2e/labs.spec.ts`**

Change the `./hq` import (line 3) to:

```ts
import { asReturningVisitor, collectErrors, expectRenderBudget, enterFloorRoute, enterHQ, snapshot, waitForCameraSettle, waitForFloor, waitForFrames, waitForHQ, waitForPhase } from "./hq";
```

Append at the end of the file:

```ts
/**
 * L3 arrival draw calls before the round 5 consolidation (P8 Task 1 baseline on SwiftShader, default
 * 1280x720 viewport, deep link to /en/labs): the directory wall in the arrival view must not raise them.
 */
const L3_ARRIVAL_CALLS = { lite: 64, full: 82 } as const;

for (const tier of ["lite", "full"] as const) {
  test(`the Labs arrival view stays at or under its pre-consolidation draw calls (${tier})`, async ({ page }) => {
    await enterFloorRoute(page, "/en/labs", { tier });
    await waitForCameraSettle(page);
    await page.waitForFunction(() => (window as unknown as { __hq: { rover: { drawCalls: number } } }).__hq.rover.drawCalls > 10);
    // Troika texts typeset asynchronously; give them time to land, like the floor budget test above.
    await page.waitForTimeout(1500);
    const { drawCalls } = await snapshot(page);
    console.log(`L3 arrival draw calls (${tier}): ${drawCalls}`);
    expect(drawCalls).toBeLessThanOrEqual(L3_ARRIVAL_CALLS[tier]);
  });
}
```

- [x] **Step 4: Add the opt-in `r5-p8` capture block to `e2e/screenshots.spec.ts`**

Change the imports at the top to:

```ts
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { asReturningVisitor, driveTo, emptyFloorPoint, hoverTarget, interactablesOf, padsOf, PHONE_SAFE, snapshot, targetPoint, visibleTarget, waitForCameraSettle, waitForHQ, waitForPhase, waitForRoom, waitForSceneLive } from "./hq";
```

(keep the remaining existing import lines unchanged). Append at the end of the file:

```ts
/**
 * Round 5 P8 (L3 consolidation). `r5-p8 L3 review`: owner review captures of L3 (arrival, the end of each
 * wing road looking east, the Product Engineering directory stop) with draw calls and triangles per pose.
 * `r5-p8 unchanged`: the diff gate for floors P8 must not change (L1, L2, L4, RF arrivals, reduced motion so
 * nothing spins or pulses); write the baselines on the Task 1 commit with --update-snapshots, compare later.
 * P8_PHASE=before|after picks the output folder under screenshots/r5-p8/.
 */
const P8_VIEWPORTS: readonly Viewport[] = [VIEWPORTS[0], { name: "desktop", width: 2560, height: 1440, tier: "full", touch: false }, VIEWPORTS[2]];
const P8_PHASE = process.env.P8_PHASE === "after" ? "after" : "before";
const p8Shot = (name: string, v: Viewport) => `screenshots/r5-p8/${P8_PHASE}/${name}-${v.width}x${v.height}.png`;

async function p8Open(browser: Browser, v: Viewport, path: string, reducedMotion: "reduce" | "no-preference") {
  const context = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 1,
    hasTouch: v.touch,
    isMobile: v.name === "mobile",
    reducedMotion,
  });
  const page = await context.newPage();
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=${v.tier}&walk=off`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  await page.evaluate(() => document.fonts.ready);
  await waitForCameraSettle(page);
  await page.waitForTimeout(1500);
  return { context, page };
}

async function p8Metrics(page: Page, name: string, v: Viewport) {
  const { drawCalls, triangles } = await snapshot(page);
  const file = `screenshots/r5-p8/${P8_PHASE}/metrics.jsonl`;
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify({ name, viewport: `${v.width}x${v.height}`, tier: v.tier, drawCalls, triangles })}\n`);
}

type RoadsWindow = Window & { __hq: { layouts: { L3: { road: { roads: { id: string; points: { x: number; z: number }[] }[] } } } } };

/** Drives along a wing road to 14 u before its turn, then turns the camera to look east at the road end (reset, then three 45 degree steps left). */
async function p8WingEnd(page: Page, wing: "software" | "ai") {
  const end = await page.evaluate((id) => (window as unknown as RoadsWindow).__hq.layouts.L3.road.roads.find((r) => r.id === id)!.points[2], wing);
  await driveTo(page, { x: end.x - 14, z: end.z });
  await page.getByRole("button", { name: en.hud.view.reset }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: en.hud.view.rotateLeft }).click();
  await waitForCameraSettle(page);
  await page.waitForTimeout(1000);
}

for (const v of P8_VIEWPORTS) {
  test(`r5-p8 L3 review @ ${v.width}x${v.height}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const { context, page } = await p8Open(browser, v, "/en/labs", "no-preference");
    await page.screenshot({ path: p8Shot("l3-arrival", v) });
    await p8Metrics(page, "l3-arrival", v);
    for (const wing of ["software", "ai"] as const) {
      await p8WingEnd(page, wing);
      await page.screenshot({ path: p8Shot(`l3-end-${wing}`, v) });
      await p8Metrics(page, `l3-end-${wing}`, v);
    }
    const board = (await interactablesOf(page)).find((i) => i.id === "L3:board:software")!;
    await driveTo(page, board.at);
    await waitForCameraSettle(page);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: p8Shot("l3-board-software", v) });
    await p8Metrics(page, "l3-board-software", v);
    await context.close();
  });

  for (const floor of [
    { id: "L1", path: "/en" },
    { id: "L2", path: "/en/journey" },
    { id: "L4", path: "/en/library" },
    { id: "RF", path: "/en/contact" },
  ] as const) {
    test(`r5-p8 unchanged ${floor.id} @ ${v.width}x${v.height}`, async ({ browser }) => {
      test.setTimeout(240_000);
      const { context, page } = await p8Open(browser, v, floor.path, "reduce");
      await p8Metrics(page, `unchanged-${floor.id}`, v);
      // Gate: at most 1% of pixels may differ by more than the per-pixel threshold 0.2 (SwiftShader noise floor, checked in Task 1 Step 7).
      expect(await page.screenshot()).toMatchSnapshot(`r5-p8-${floor.id}-${v.width}x${v.height}.png`, { maxDiffPixelRatio: 0.01, threshold: 0.2 });
      await context.close();
    });
  }
}
```

- [x] **Step 5: Build and measure the L3 arrival draw calls**

```bash
rtk bun run build && E2E_PORT=4437 bunx playwright test e2e/labs.spec.ts -g "pre-consolidation draw calls" --workers=1
```

Expected: 2 passed, and the log prints `L3 arrival draw calls (lite): 64` and `L3 arrival draw calls (full): 82`. If the printed numbers differ (another merge moved them), set `L3_ARRIVAL_CALLS` to the printed values, re-run the command and expect 2 passed. Record both numbers for the PR body.

- [x] **Step 6: Capture the baseline (L3 review poses and the unchanged-floor snapshots)**

```bash
rm -rf screenshots/r5-p8/before && E2E_PORT=4437 SCREENSHOTS=1 P8_PHASE=before bunx playwright test e2e/screenshots.spec.ts -g "r5-p8" --workers=1 --update-snapshots
```

Expected: 15 passed (3 review + 12 unchanged); `screenshots/r5-p8/before/` holds `l3-arrival-*`, `l3-end-software-*`, `l3-end-ai-*`, `l3-board-software-*` at 1440x900, 2560x1440 and 390x844 plus `metrics.jsonl`; `e2e/screenshots.spec.ts-snapshots/` holds 12 `r5-p8-*` baselines.

- [x] **Step 7: Prove the diff gate's noise floor on the unchanged build**

```bash
E2E_PORT=4437 SCREENSHOTS=1 P8_PHASE=before bunx playwright test e2e/screenshots.spec.ts -g "r5-p8 unchanged" --workers=1
```

Expected: 12 passed against the baselines written in Step 6. If a floor fails on this identical build, raise `maxDiffPixelRatio` for all floors to the smallest value of 0.015 or 0.02 that passes twice in a row, note the value in the PR body, and never go above 0.02 (above that the gate cannot tell noise from a change; capture that floor at the lite tier instead).

- [x] **Step 8: Capture the top-down plan view of the current layout**

The dev prototype draws the real `buildLabsLayout` from above. Start it in the background and capture:

```bash
bunx next dev -p 4438
```

(async; wait until `http://localhost:4438/en` answers), then:

```bash
bun scripts/capture-dev.ts --base http://localhost:4438 --out screenshots/r5-p8/before/top --ready "[data-testid='floors-prototype'][data-ready]" 'l3-top=/en/dev/floors?floor=L3&view=top&tier=full'
```

Expected: `screenshots/r5-p8/before/top/l3-top-{1440x900,834x1112,390x844}.png` and `metrics.json`. Stop the dev server (kill its PID).

- [x] **Step 9: Commit the harness (captures stay local, `screenshots/` is git-ignored)**

```bash
rtk git add .gitignore e2e/labs.spec.ts e2e/screenshots.spec.ts && rtk git commit -m "test(l3): baseline captures, unchanged-floor diff gate and arrival draw-call caps for the L3 consolidation"
```

### Task 2: Wing roads end at the last pod (compact loop and slab)

Owner: "the end of each section is just empty". Each wing road now turns `LABS.tail` (7 u: half the road plus a forecourt) past the far edge of its own last docked pod and runs straight into the east plaza, which moves onto that turn line; the slab ends one plaza radius and a margin later (x = 122 instead of 139 with today's pods). Pod positions do not change in this task.

**Files:**
- Modify: `src/experience/floors/labs/layout.ts` (LABS `tail`/`loop`, `buildLabsLayout` loop and roads, doc comments)
- Test: `tests/unit/labs-layout.test.ts`

**Interfaces:**
- Consumes: `LabPod`, `tourOrder`, `WING_SIDE`, `expectSpaceRules`.
- Produces: `LABS.tail = 7` (meaning changed: road past the last pod's far edge), `LABS.loop` removed. Each wing road is `[hub center, (wingStartX, ±wingZ), (turn(wing), ±wingZ), east.center]` where `turn(wing) = max(wingStartX + east + margin, lastPodMaxX(wing) + tail)` and `east.center = (max(turn(software), turn(ai)), 0)`. `floor.bounds.maxX = east.center.x + east / 2 + margin` (unchanged formula).

- [x] **Step 1: Write the failing tests**

In `tests/unit/labs-layout.test.ts`, add inside `describe("L3 Project Roads layout", ...)` right after the test `"has a round hub of at least 20 u and wing roads that loop at the east plaza"`:

```ts
  it("ends each wing road one tail past its last docked pod, so no stretch of road runs on empty (owner request 2026-10-13)", () => {
    for (const wing of ["software", "ai"] as const) {
      const road = network.roads.find((r) => r.id === wing)!;
      const docked = layout.placed.filter((p) => p.pod.wing === wing);
      const lastEdge = Math.max(...docked.map((p) => p.rect.maxX));
      expect(road.points[2].x, wing).toBe(lastEdge + LABS.tail);
      // From the last door to the turn is at most half a hero pod plus the tail.
      const lastDoor = Math.max(...docked.map((p) => p.door.x));
      expect(road.points[2].x - lastDoor, wing).toBeLessThanOrEqual(LABS.hero.w / 2 + LABS.tail);
      expect(road.points.at(-1)).toEqual(layout.east.center);
    }
    // The east plaza sits on the later of the two turns, on the axis between the wings.
    const turns = network.roads.filter((r) => r.id !== "lead").map((r) => r.points[2].x);
    expect(layout.east.center).toEqual({ x: Math.max(...turns), z: 0 });
  });

  it("ends the slab one plaza radius and a margin past the east plaza, right after the last pods", () => {
    const lastEdge = Math.max(...layout.placed.map((p) => p.rect.maxX));
    expect(floor.bounds.maxX).toBe(layout.east.center.x + LABS.east / 2 + LABS.margin);
    expect(floor.bounds.maxX - lastEdge).toBe(LABS.tail + LABS.east / 2 + LABS.margin);
  });

  it("keeps a lopsided floor and an empty floor inside the space rules, a shorter wing cutting across to the plaza", () => {
    const lopsided = buildLabsLayout([
      ...Array.from({ length: 9 }, (_, i) => pod(`s${i}`, "software", i % 3 ? "featured" : "hero", i)),
      ...Array.from({ length: 3 }, (_, i) => pod(`a${i}`, "ai", "hero", i)),
    ]);
    expectSpaceRules({ bounds: lopsided.floor.bounds, obstacles: lopsided.floor.obstacles, doors: lopsided.floor.doors ?? [], network: lopsided.network, start: lopsided.floor.approach });
    const ai = lopsided.network.roads.find((r) => r.id === "ai")!;
    const software = lopsided.network.roads.find((r) => r.id === "software")!;
    const aiEdge = Math.max(...lopsided.placed.filter((p) => p.pod.wing === "ai").map((p) => p.rect.maxX));
    expect(ai.points[2].x).toBe(aiEdge + LABS.tail);
    expect(ai.points[2].x).toBeLessThan(software.points[2].x);
    expect(ai.points.at(-1)).toEqual(lopsided.east.center);
    const empty = buildLabsLayout([]);
    expectSpaceRules({ bounds: empty.floor.bounds, obstacles: empty.floor.obstacles, doors: empty.floor.doors ?? [], network: empty.network, start: empty.floor.approach });
    expect(empty.east.center.x).toBe(LABS.wingStartX + LABS.east + LABS.margin);
  });
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `rtk bunx vitest run tests/unit/labs-layout.test.ts`
Expected: FAIL in the three new tests, for example `expected 110 to be 107` (today the roads turn at `farX + 8`) and `expected 139 to be 122`-style mismatches; the 17 existing tests still pass.

- [x] **Step 3: Implement the road ends in `src/experience/floors/labs/layout.ts`**

Replace the module doc comment (lines 7 to 16) with:

```ts
/**
 * L3 Project Roads (walkable floors plan, part 2; consolidated in round 5, owner request 2026-10-13).
 * The global elevator shaft stays at x = -28, so a short lead road runs from its door into a round hub
 * plaza with the two wing directory boards. The `software` wing road (north, z < 0) and the `ai` wing
 * road (south, z > 0) leave the hub and run east; each turns `tail` past its last pod into the east
 * plaza, so the floor is one loop without dead ends or empty road ends. Hero and featured pods dock on
 * both sides of their wing road in site order (`comparePods`: gallery pods nearest the hub), one `slot`
 * each, so both wings stay mirror images whatever their tiers; each pod has a forecourt and a spur to
 * its door, at least 6 u apart. Listed pods stay on the directory boards.
 * Pure module (no React or three): Vitest runs it in node.
 */
```

In `LABS`, replace:

```ts
  /** Road from the last pod to the loop corner, and the corner's x offset to the east plaza. */
  tail: 8,
  loop: 14,
```

with:

```ts
  /** Road past the far edge of a wing's last pod before it turns into the east plaza: half the road plus a forecourt. */
  tail: 7,
```

Replace the doc comment of `buildLabsLayout`:

```ts
/**
 * Places pods from data (`ExperienceData.labs.pods`). Per wing, hero and featured pods dock in
 * `tourOrder` along the wing road from the hub eastward, one slot each, alternating the outer and the
 * inner side; the loop corner follows the farthest pod of either wing, so both wings share one east plaza.
 */
```

with:

```ts
/**
 * Places pods from data (`ExperienceData.labs.pods`). Per wing, hero and featured pods dock in
 * `tourOrder` along the wing road from the hub eastward, one slot each, alternating the outer and the
 * inner side; each wing road turns `tail` past its own last pod and both meet at one east plaza.
 */
```

Replace:

```ts
  const directory: Record<Wing, LabPod[]> = { software: [], ai: [] };
  let farX: number = L.wingStartX;
```

with:

```ts
  const directory: Record<Wing, LabPod[]> = { software: [], ai: [] };
  // Far edge (max x) of each wing's last docked pod.
  const lastEdge: Record<Wing, number> = { software: -Infinity, ai: -Infinity };
```

Replace:

```ts
        forecourt: { minX: x - w / 2, maxX: x + w / 2, minZ: Math.min(edge, front), maxZ: Math.max(edge, front) },
      });
    });
    farX = Math.max(farX, cursor.outer - L.gap, cursor.inner - L.gap);
  }

  const turnX = farX + L.tail;
  const loopEnd: Vec2 = { x: turnX + L.loop, z: 0 };
  const wingRoad = (wing: Wing): Road => {
    const z = WING_SIDE[wing] * L.wingZ;
    return { id: wing, points: [hubC, { x: L.wingStartX, z }, { x: turnX, z }, loopEnd], width: L.road };
  };
```

with:

```ts
        forecourt: { minX: x - w / 2, maxX: x + w / 2, minZ: Math.min(edge, front), maxZ: Math.max(edge, front) },
      });
      lastEdge[wing] = Math.max(lastEdge[wing], x + w / 2);
    });
  }

  // Each wing road turns `tail` past its own last pod; the east plaza sits on the later turn, so a
  // shorter wing cuts across to it instead of running on empty. An empty wing still reaches a plaza
  // and a margin past the point where the wing roads start.
  const turnX = (wing: Wing) => Math.max(L.wingStartX + L.east + L.margin, lastEdge[wing] + L.tail);
  const loopEnd: Vec2 = { x: Math.max(turnX("software"), turnX("ai")), z: 0 };
  const wingRoad = (wing: Wing): Road => {
    const z = WING_SIDE[wing] * L.wingZ;
    return { id: wing, points: [hubC, { x: L.wingStartX, z }, { x: turnX(wing), z }, loopEnd], width: L.road };
  };
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `rtk bunx vitest run tests/unit/labs-layout.test.ts tests/unit/interact-registry.test.ts tests/unit/walk.test.ts tests/unit/pad-space.test.ts`
Expected: PASS (labs layout 20 tests, the others unchanged).

- [x] **Step 5: Typecheck and commit**

```bash
rtk bun run typecheck && rtk git add src/experience/floors/labs/layout.ts tests/unit/labs-layout.test.ts && rtk git commit -m "feat(l3): end each wing road right after its last pod and move the east plaza in"
```

Expected: typecheck clean (no other file read `LABS.loop`).

### Task 3: No road chevrons on L3

Owner decision: no floor arrows on L3 only. The switch is data on the road network (`RoadNetwork.chevrons`), read by the pure `chevronMarks`, so `RoadMarkings` (shared by every floor and the dev prototype) needs no prop and other floors cannot change by accident; L3 saves one draw call.

**Files:**
- Modify: `src/experience/nav/road.ts` (`RoadNetwork`)
- Modify: `src/experience/nav/roadGeometry.ts` (`chevronMarks`)
- Modify: `src/experience/fx/RoadMarkings.tsx` (doc comment)
- Modify: `src/experience/floors/labs/layout.ts` (network)
- Test: `tests/unit/road.test.ts`, `tests/unit/labs-layout.test.ts`

**Interfaces:**
- Produces: `RoadNetwork.chevrons?: boolean` (absent or `true` draws chevrons, `false` draws none); `chevronMarks(net, spacing)` returns `[]` when `net.chevrons === false`. `buildLabsLayout(...).network.chevrons === false`.

- [x] **Step 1: Write the failing tests**

In `tests/unit/road.test.ts`, add after the test `"points chevrons forward and skips plazas"`:

```ts
  it("draws no chevrons on a network that turns them off, and the same ones when it says so explicitly", () => {
    expect(chevronMarks({ ...STRAIGHT, chevrons: false }, 4)).toEqual([]);
    expect(chevronMarks({ ...STRAIGHT, chevrons: true }, 4)).toEqual(chevronMarks(STRAIGHT, 4));
  });
```

In `tests/unit/labs-layout.test.ts`, add these imports:

```ts
import { careerLayoutInput } from "@/experience/floors/career/layout";
import { libraryLayoutInput } from "@/experience/floors/library/model";
import { chevronMarks } from "@/experience/nav/roadGeometry";
```

and this test inside the describe block:

```ts
  it("paints no chevrons on L3 (owner request 2026-10-13) while every other walkable floor keeps them", () => {
    const experience = buildExperienceData("en", FLOOR_NAMES);
    const layouts = buildFloorLayouts(experience.years.length, {
      labs: experience.labs.pods,
      career: careerLayoutInput(experience.career),
      library: libraryLayoutInput(experience.library),
    });
    expect(network.chevrons).toBe(false);
    expect(layouts.L3.road?.chevrons).toBe(false);
    expect(chevronMarks(layouts.L3.road!, 5)).toEqual([]);
    for (const id of ["L1", "L2", "L4", "RF"] as const) {
      expect(layouts[id].road?.chevrons, id).toBeUndefined();
      expect(chevronMarks(layouts[id].road!, 5).length, id).toBeGreaterThan(0);
    }
  });
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `rtk bunx vitest run tests/unit/road.test.ts tests/unit/labs-layout.test.ts`
Expected: FAIL. `road.test.ts` fails with `expected [ { x: 2, ... }, ... ] to deeply equal []` (chevrons are still drawn); the L3 test fails with `expected undefined to be false`.

- [x] **Step 3: Implement**

In `src/experience/nav/road.ts` replace:

```ts
export interface RoadNetwork {
  roads: Road[];
  plazas: Plaza[];
  spurs: Spur[];
}
```

with:

```ts
export interface RoadNetwork {
  roads: Road[];
  plazas: Plaza[];
  spurs: Spur[];
  /** Forward chevrons on the roads (default true). L3 turns them off (owner request 2026-10-13). */
  chevrons?: boolean;
}
```

In `src/experience/nav/roadGeometry.ts` replace:

```ts
/**
 * Forward chevrons every `spacing` u along each road's centerline. Chevrons inside plazas are
 * skipped (plazas are open floor), and so is the first half spacing so arrows never sit on a junction.
 */
export function chevronMarks(net: RoadNetwork, spacing = 4): Chevron[] {
  const out: Chevron[] = [];
```

with:

```ts
/**
 * Forward chevrons every `spacing` u along each road's centerline. Chevrons inside plazas are
 * skipped (plazas are open floor), and so is the first half spacing so arrows never sit on a junction.
 * A network with `chevrons: false` gets none.
 */
export function chevronMarks(net: RoadNetwork, spacing = 4): Chevron[] {
  if (net.chevrons === false) return [];
  const out: Chevron[] = [];
```

In `src/experience/fx/RoadMarkings.tsx` replace the component doc comment:

```ts
/**
 * Road markings for a walkable floor: the road, plaza and spur fill (one mesh), colored spur stubs
 * at the doors (one mesh), dashed edge lines (one line geometry) and forward chevrons (one instanced
 * mesh) with a pulse running forward. The lite tier and reduced motion drop the pulse; the lite
 * tier also drops the edge glow (no additive blending, dimmer lines).
 */
```

with:

```ts
/**
 * Road markings for a walkable floor: the road, plaza and spur fill (one mesh), colored spur stubs
 * at the doors (one mesh), dashed edge lines (one line geometry) and forward chevrons (one instanced
 * mesh) with a pulse running forward. A network with `chevrons: false` (L3) draws no chevrons and
 * saves that draw call. The lite tier and reduced motion drop the pulse; the lite tier also drops the
 * edge glow (no additive blending, dimmer lines).
 */
```

In `src/experience/floors/labs/layout.ts` replace:

```ts
  const network: RoadNetwork = { roads: [lead, wingRoad("software"), wingRoad("ai")], plazas: [hub, east], spurs };
```

with:

```ts
  // No floor arrows on L3 (owner request 2026-10-13): the wing roads, signs and directory guide the way.
  const network: RoadNetwork = { roads: [lead, wingRoad("software"), wingRoad("ai")], plazas: [hub, east], spurs, chevrons: false };
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `rtk bunx vitest run tests/unit/road.test.ts tests/unit/labs-layout.test.ts tests/unit/fx-geometry.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
rtk bun run typecheck && rtk git add src/experience/nav/road.ts src/experience/nav/roadGeometry.ts src/experience/fx/RoadMarkings.tsx src/experience/floors/labs/layout.ts tests/unit/road.test.ts tests/unit/labs-layout.test.ts && rtk git commit -m "feat(l3): no road chevrons on L3 through a per-network switch, other floors unchanged"
```

### Task 4: Floating wing signs face the camera; no wing names on the floor

Owner: the wing words "dont need to show in the floor" and the floating ones are mirrored. The floor-painted `NAME  ->` text goes; the floating sign turns to the camera every frame (yaw only, so it stays upright) and sits on a dark backing, so it reads left to right from any camera yaw, including P7's free rotation and first person. Draw calls: floor texts -2; each sign trades its troika outline pass for a backing plane (same count).

**Files:**
- Create: `src/experience/fx/facing.ts`
- Modify: `src/experience/floors/labs/layout.ts` (`LabsLayout.signs`, `sign()`)
- Rewrite: `src/experience/floors/labs/Hub.tsx` (wing signs; boards unchanged in this task)
- Test: `tests/unit/facing.test.ts`

**Interfaces:**
- Produces: `yawTowards(from: Vec2, viewer: Vec2): number` (rotation about +y that turns a +z-facing plane toward `viewer`; 0 when they coincide). `LabsLayout.signs: Record<Wing, { at: Vec2; heading: Vec2; float: Vec2 }>` where `float = at + heading * 5` is where the floating sign stands.
- Consumes: `zoneAt`, `followPose`, `FOLLOW_LOOK_AHEAD` (test only).

- [x] **Step 1: Write the failing test `tests/unit/facing.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { zoneAt } from "@/experience/camera/orbit";
import { FOLLOW_LOOK_AHEAD, followPose } from "@/experience/camera/rigs";
import { buildLabsLayout, LABS } from "@/experience/floors/labs/layout";
import { yawTowards } from "@/experience/fx/facing";
import type { Vec2 } from "@/experience/types";

/** World direction of a yawed text's front (its local +z). */
const front = (yaw: number): Vec2 => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
/** World direction the yawed text reads in (its local +x). */
const reading = (yaw: number): Vec2 => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });
/** Horizontal screen-right of a camera at `eye` looking at `at`: forward x up. */
function screenRight(eye: Vec2, at: Vec2): Vec2 {
  const fx = at.x - eye.x;
  const fz = at.z - eye.z;
  const len = Math.hypot(fx, fz);
  return { x: -fz / len, z: fx / len };
}
const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.z * b.z;
function toward(from: Vec2, to: Vec2): Vec2 {
  const len = Math.hypot(to.x - from.x, to.z - from.z);
  return { x: (to.x - from.x) / len, z: (to.z - from.z) / len };
}

describe("yawTowards", () => {
  it("turns a sign's front to a camera anywhere around it, reading left to right (never mirrored)", () => {
    const sign = { x: 6.6, z: -18.1 };
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const eye = { x: sign.x + Math.sin(a) * 30, z: sign.z + Math.cos(a) * 30 };
      const yaw = yawTowards(sign, eye);
      expect(dot(front(yaw), toward(sign, eye))).toBeCloseTo(1, 9);
      expect(dot(reading(yaw), screenRight(eye, sign))).toBeCloseTo(1, 9);
    }
  });

  it("keeps the default facing when the camera stands right above the sign", () => {
    expect(yawTowards({ x: 1, z: 2 }, { x: 1, z: 2 })).toBe(0);
  });
});

describe("L3 floating wing signs (owner request 2026-10-13)", () => {
  const pods = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" }).labs.pods;
  const layout = buildLabsLayout(pods);
  const zone = zoneAt("L3", LABS.overview, layout.floor.viewZones)!;
  // The arrival camera as the Director settles it: FOLLOW_LOOK_AHEAD ahead of the rover along its forward (+x here).
  const [x, , z] = followPose("desktop", [LABS.overview.x + FOLLOW_LOOK_AHEAD.desktop, 0, LABS.overview.z], zone.yaw, zone.zoom).position;
  const eye = { x, z };

  it("stand on their wing road, 5 u past the hub-rim marker", () => {
    for (const wing of ["software", "ai"] as const) {
      const { at, heading, float } = layout.signs[wing];
      expect(float.x).toBeCloseTo(at.x + heading.x * 5);
      expect(float.z).toBeCloseTo(at.z + heading.z * 5);
    }
  });

  it("showed the AI Engineering sign's back to the arrival camera with the old fixed yaw of PI/4 (the mirrored text)", () => {
    expect(dot(front(Math.PI / 4), toward(layout.signs.ai.float, eye))).toBeLessThan(0);
  });

  it("face the arrival camera and read left to right once turned with yawTowards", () => {
    for (const wing of ["software", "ai"] as const) {
      const s = layout.signs[wing].float;
      const yaw = yawTowards(s, eye);
      expect(dot(front(yaw), toward(s, eye))).toBeCloseTo(1, 9);
      expect(dot(reading(yaw), screenRight(eye, s))).toBeCloseTo(1, 9);
    }
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `rtk bunx vitest run tests/unit/facing.test.ts`
Expected: FAIL with `Failed to resolve import "@/experience/fx/facing"`.

- [x] **Step 3: Create `src/experience/fx/facing.ts`**

```ts
import type { Vec2 } from "../types";

/**
 * Rotation about the vertical axis that turns a text or plane whose front faces +z toward `viewer` on
 * the floor plane, so it always reads left to right (never mirrored) from wherever the camera stands.
 * Yaw only: the text stays upright. Pure (Vitest runs it in node).
 */
export function yawTowards(from: Vec2, viewer: Vec2): number {
  const dx = viewer.x - from.x;
  const dz = viewer.z - from.z;
  return dx === 0 && dz === 0 ? 0 : Math.atan2(dx, dz);
}
```

- [x] **Step 4: Add the sign float point in `src/experience/floors/labs/layout.ts`**

In `interface LabsLayout` replace:

```ts
  /** Where each wing road leaves the hub (signs), and its heading. */
  signs: Record<Wing, { at: Vec2; heading: Vec2 }>;
```

with:

```ts
  /** Where each wing road leaves the hub, its heading, and where the floating wing sign stands (5 u further along the road). */
  signs: Record<Wing, { at: Vec2; heading: Vec2; float: Vec2 }>;
```

Replace:

```ts
    // Just past the hub rim, on the wing road.
    const r = L.hub.size / 2 + 3;
    return { at: { x: hubC.x + heading.x * r, z: hubC.z + heading.z * r }, heading };
```

with:

```ts
    // Just past the hub rim, on the wing road; the floating sign stands 5 u further along it.
    const r = L.hub.size / 2 + 3;
    const at = { x: hubC.x + heading.x * r, z: hubC.z + heading.z * r };
    return { at, heading, float: { x: at.x + heading.x * 5, z: at.z + heading.z * 5 } };
```

- [x] **Step 5: Run the test to verify it passes**

Run: `rtk bunx vitest run tests/unit/facing.test.ts tests/unit/labs-layout.test.ts`
Expected: PASS.

- [x] **Step 6: Rewrite `src/experience/floors/labs/Hub.tsx` (signs face the camera, no floor text; boards as before)**

Replace the whole file with:

```tsx
"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { Vector3, type Group } from "three";
import type { Wing } from "@/content/schema";
import { yawTowards } from "../../fx/facing";
import type { LabPod, Vec2 } from "../../types";
import { FONTS, GlassBox } from "../../tower/primitives";
import { LABS, tourOrder, WING_TINT, type LabsLayout } from "./layout";

export interface HubLabels {
  wings: Record<Wing, string>;
  directory: string;
  /** Board footer: the full list opens in the palette. */
  open: string;
  /** "{count} projects", localized. */
  count: (count: number) => string;
}

const WINGS = ["software", "ai"] as const;
const { board } = LABS;
const TIER_MARK: Record<LabPod["tier"], string> = { hero: "\u25C6", featured: "\u25C7", listed: "\u00B7" };
/** Height of the floating wing signs (bottom of the text). */
const SIGN_Y = 4.2;
const NO_RAYCAST = () => null;
/** troika's laid-out text block: [minX, minY, maxX, maxY] in local units. */
type TextSync = { textRenderInfo?: { blockBounds?: number[] } };

/**
 * A wing name floating above its wing road where it leaves the hub (owner request 2026-10-13: nothing
 * painted on the floor). It turns to the camera every frame (yaw only, so it stays upright) on a dark
 * backing, so it reads left to right from any camera yaw and never shows its mirrored back.
 */
function WingSign({ at, text, color }: { at: Vec2; text: string; color: string }) {
  const group = useRef<Group>(null);
  const world = useMemo(() => new Vector3(), []);
  const [box, setBox] = useState<number[] | null>(null);
  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    g.getWorldPosition(world);
    g.rotation.y = yawTowards({ x: world.x, z: world.z }, { x: camera.position.x, z: camera.position.z });
  });
  return (
    <group ref={group} position={[at.x, SIGN_Y, at.z]}>
      {box && (
        <mesh position={[(box[0] + box[2]) / 2, (box[1] + box[3]) / 2, -0.02]} raycast={NO_RAYCAST}>
          <planeGeometry args={[box[2] - box[0] + 0.8, box[3] - box[1] + 0.4]} />
          <meshBasicMaterial color="#05050c" transparent opacity={0.9} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <Text
        font={FONTS.monoBold}
        fontSize={1}
        color={color}
        anchorX="center"
        anchorY="bottom"
        whiteSpace="nowrap"
        renderOrder={1}
        material-toneMapped={false}
        onSync={(t: TextSync) => {
          const b = t.textRenderInfo?.blockBounds;
          if (b) setBox([b[0], b[1], b[2], b[3]]);
        }}
      >
        {text}
      </Text>
    </group>
  );
}

function WingSigns({ layout, labels }: { layout: LabsLayout; labels: HubLabels }) {
  return (
    <group>
      {WINGS.map((wing) => (
        <WingSign key={wing} at={layout.signs[wing].float} text={labels.wings[wing].toUpperCase()} color={WING_TINT[wing]} />
      ))}
    </group>
  );
}

const TOP = { name: 0.3, sub: 1.05, list: 1.55, listBottom: 1.95, footer: 1.3 } as const;

/**
 * One face of a directory board, sized to read from the board stop on a phone: the wing name, the
 * project count, the top entries (docking order, gallery first) in large type, and a footer that points to the
 * full list (clicking the board, or Open on the tour stop, opens the projects palette).
 */
function BoardFace({ wing, list, labels, side }: { wing: Wing; list: readonly LabPod[]; labels: HubLabels; side: 1 | -1 }) {
  const name = labels.wings[wing].toUpperCase();
  const top = tourOrder(list).slice(0, LABS.boardEntries);
  const lines = top.map((p) => `${TIER_MARK[p.tier]} ${p.title}`).join("\n");
  const width = board.d - 0.6;
  return (
    <group position={[(side * board.w) / 2 + side * 0.03, 0, 0]} rotation={[0, (side * Math.PI) / 2, 0]}>
      {/* Wing names come from messages (`common.wing`); long names shrink to the board width instead of wrapping. */}
      <Text
        font={FONTS.monoBold}
        fontSize={Math.min(0.56, width / (0.62 * Math.max(1, name.length)))}
        color={WING_TINT[wing]}
        anchorX="center"
        anchorY="top"
        whiteSpace="nowrap"
        position={[0, board.h - TOP.name, 0]}
        material-toneMapped={false}
      >
        {name}
      </Text>
      <Text font={FONTS.mono} fontSize={0.24} color="#a1a1aa" anchorX="center" anchorY="top" whiteSpace="nowrap" position={[0, board.h - TOP.sub, 0]}>
        {`${labels.directory.toUpperCase()} \u00B7 ${labels.count(list.length).toUpperCase()}`}
      </Text>
      <Text
        font={FONTS.sansBold}
        fontSize={0.34}
        lineHeight={1.25}
        maxWidth={width}
        color="#f4f4f5"
        anchorX="left"
        anchorY="top"
        position={[-width / 2, board.h - TOP.list, 0]}
        clipRect={[-0.05, -(board.h - TOP.list - TOP.listBottom), width + 0.1, 0.2]}
      >
        {lines}
      </Text>
      <Text font={FONTS.monoBold} fontSize={0.3} color={WING_TINT[wing]} anchorX="center" anchorY="bottom" whiteSpace="nowrap" position={[0, TOP.footer, 0]} material-toneMapped={false}>
        {`\u25B8 ${labels.open.toUpperCase()}`}
      </Text>
    </group>
  );
}

/**
 * Directory boards on the hub rim. Both faces carry the same content: the east face greets the hub
 * and the stop in front of it, the west face the rover arriving from the elevator.
 */
function DirectoryBoards({ layout, labels, pods }: { layout: LabsLayout; labels: HubLabels; pods: readonly LabPod[] }) {
  return (
    <group>
      {WINGS.map((wing) => {
        const { center } = layout.boards[wing];
        const list = pods.filter((p) => p.wing === wing);
        return (
          <group key={wing} position={[center.x, 0, center.z]} name={`directory-${wing}`}>
            <GlassBox size={[board.w, board.h, board.d]} position={[0, board.h / 2, 0]} color={WING_TINT[wing]} fillOpacity={0.12} />
            {/* Opaque core: each face shows only its own text, never the mirrored one behind it. */}
            <mesh position={[0, board.h / 2, 0]}>
              <boxGeometry args={[board.w * 0.5, board.h - 0.04, board.d - 0.04]} />
              <meshBasicMaterial color="#070712" />
            </mesh>
            <BoardFace wing={wing} list={list} labels={labels} side={1} />
            <BoardFace wing={wing} list={list} labels={labels} side={-1} />
          </group>
        );
      })}
    </group>
  );
}

/** The hub plaza in front of the elevator: wing directory boards and the floating signs to each wing road. */
export function Hub({ layout, labels, pods }: { layout: LabsLayout; labels: HubLabels; pods: readonly LabPod[] }) {
  return (
    <group name="labs-hub">
      <WingSigns layout={layout} labels={labels} />
      <DirectoryBoards layout={layout} labels={labels} pods={pods} />
    </group>
  );
}
```

- [x] **Step 7: Verify and commit**

Run: `rtk bun run typecheck && rtk bun run lint && rtk bunx vitest run tests/unit/facing.test.ts tests/unit/labs-layout.test.ts`
Expected: clean typecheck and lint, tests PASS.

```bash
rtk git add src/experience/fx/facing.ts src/experience/floors/labs/layout.ts src/experience/floors/labs/Hub.tsx tests/unit/facing.test.ts && rtk git commit -m "fix(l3): floating wing signs turn to the camera on a dark backing; no wing names painted on the floor"
```

### Task 5: Directory wall where the wing roads fork, framed on arrival

Owner: the directory boards "near elevator ... not noticable". They stand behind the arrival camera today. They become a wall of two touching double-sided panels at x = 17 between the wing roads (Product Engineering north, AI Engineering south), west faces toward the arrival camera; the arrival spot moves to (8.5, 0) on the hub's east rim (beyond the hint radius of both board stops, so no hint bubble covers the wall); the inner pod row starts half a pitch later (x = 24) so the first inner pod stays 6 u clear of the wall; the packet spine starts east of the wall. Registry ids, `directoryStop`, the tour and deep links keep their API.

**Files:**
- Modify (full replacement): `src/experience/floors/labs/layout.ts`
- Modify: `tests/unit/labs-layout.test.ts` (replace two tests, add one)
- Create: `tests/unit/labs-arrival.test.ts`

**Interfaces:**
- Consumes: Task 2 roads, Task 3 `chevrons: false`, Task 4 `signs[wing].float`.
- Produces: `LABS.board = { x: 17, z: 3.75, w: 0.6, d: 7.5, h: 9.5 }` (`z` = each panel's |z| center, `d` = width along z), `LABS.boardStop = 3` (in front of the WEST face now), `LABS.boardZoom = 0.9`, `LABS.innerStart = 24`, `LABS.overview = { x: 8.5, z: 0 }`; `directoryBoard(wing)` returns the panel rect, `center` and `stop = { x: board.x - board.w / 2 - boardStop, z: center.z }`; view zones in this order: `L3:directory:software`, `L3:directory:ai` (yaw -3PI/4, zoom 0.9), `L3:overview` (yaw -3PI/4, zoom 1.3, x 4.5..9.5, |z| <= 4), then one per door.

- [x] **Step 1: Write the failing projection test `tests/unit/labs-arrival.test.ts`**

```ts
import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { zoneAt } from "@/experience/camera/orbit";
import { followOffsetScale } from "@/experience/camera/offset";
import { FOLLOW_LOOK_AHEAD, followPose } from "@/experience/camera/rigs";
import { buildLabsLayout, directoryBoard, LABS } from "@/experience/floors/labs/layout";
import type { Vec2 } from "@/experience/types";
import { cameraClass } from "@/lib/viewport";

const pods = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" }).labs.pods;
const { floor } = buildLabsLayout(pods);
const WINGS = ["software", "ai"] as const;
/** Camera west of the rover, looking east along the floor. */
const LOOK_EAST = (-3 * Math.PI) / 4;

type Safe = { top: number; bottom: number; side: number };
/** The owner's review sizes and the HUD-free box of each (`DESKTOP_SAFE`, `PHONE_SAFE` in e2e/hq.ts). */
const VIEWPORTS: readonly { w: number; h: number; safe: Safe }[] = [
  { w: 1440, h: 900, safe: { top: 90, bottom: 90, side: 40 } },
  { w: 2560, h: 1440, safe: { top: 90, bottom: 90, side: 40 } },
  { w: 390, h: 844, safe: { top: 120, bottom: 140, side: 24 } },
];

/**
 * The follow camera the Director settles on with the rover at `at` inside an east-looking view zone
 * (CameraDirector: it aims FOLLOW_LOOK_AHEAD ahead along its forward, +x here, and scales the offset by aspect).
 */
function settledCamera(w: number, h: number, at: Vec2) {
  const zone = zoneAt("L3", at, floor.viewZones);
  if (!zone) throw new Error(`no view zone at ${at.x}, ${at.z}`);
  const cls = cameraClass(w, h);
  const pose = followPose(cls, [at.x + FOLLOW_LOOK_AHEAD[cls], 1, at.z], zone.yaw, (zone.zoom ?? 1) * followOffsetScale(cls, w / h));
  const camera = new PerspectiveCamera(pose.fov, w / h, 0.1, 500);
  camera.position.set(...pose.position);
  camera.lookAt(new Vector3(...pose.target));
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return { camera, zone };
}

function screen(camera: PerspectiveCamera, w: number, h: number, x: number, y: number, z: number) {
  const v = new Vector3(x, y, z).project(camera);
  return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
}

/** A panel's west face on screen (CSS px), and its vertical scale (px per u) between `y` and `y + 1`. */
function westFace(camera: PerspectiveCamera, w: number, h: number, wing: (typeof WINGS)[number]) {
  const b = directoryBoard(wing);
  const corners = [b.minZ, b.maxZ].flatMap((z) => [0, LABS.board.h].map((y) => screen(camera, w, h, b.minX, y, z)));
  return {
    minX: Math.min(...corners.map((c) => c.x)),
    maxX: Math.max(...corners.map((c) => c.x)),
    minY: Math.min(...corners.map((c) => c.y)),
    maxY: Math.max(...corners.map((c) => c.y)),
    scale: (y: number) => Math.abs(screen(camera, w, h, b.minX, y, b.center.z).y - screen(camera, w, h, b.minX, y + 1, b.center.z).y),
  };
}

function expectInside(face: ReturnType<typeof westFace>, w: number, h: number, safe: Safe, label: string) {
  expect(face.minX, label).toBeGreaterThanOrEqual(safe.side);
  expect(face.maxX, label).toBeLessThanOrEqual(w - safe.side);
  expect(face.minY, label).toBeGreaterThanOrEqual(safe.top);
  expect(face.maxY, label).toBeLessThanOrEqual(h - safe.bottom);
}

describe("L3 arrival frames the wing directory wall (owner request 2026-10-13)", () => {
  for (const { w, h, safe } of VIEWPORTS) {
    it(`shows both panels whole and clear of the HUD on arrival at ${w}x${h}`, () => {
      const { camera, zone } = settledCamera(w, h, LABS.overview);
      expect(zone.id).toBe("L3:overview");
      expect(zone.yaw).toBeCloseTo(LOOK_EAST);
      for (const wing of WINGS) expectInside(westFace(camera, w, h, wing), w, h, safe, `${wing} arrival ${w}x${h}`);
    });

    it(`fits the whole panel under the HUD from its stop at ${w}x${h}`, () => {
      for (const wing of WINGS) {
        const { camera, zone } = settledCamera(w, h, directoryBoard(wing).stop);
        expect(zone.id).toBe(`L3:directory:${wing}`);
        expect(zone.yaw).toBeCloseTo(LOOK_EAST);
        expectInside(westFace(camera, w, h, wing), w, h, safe, `${wing} stop ${w}x${h}`);
      }
    });
  }
});
```

- [x] **Step 2: Replace two tests and add one in `tests/unit/labs-layout.test.ts`**

Change the rigs import to `import { FOLLOW_LOOK_AHEAD, followPose } from "@/experience/camera/rigs";` and add `import { HINT } from "@/experience/hints/select";`.

Replace the whole test `"stands the directory boards on the hub, with walkable stops in front that turn the camera to them"` with:

```ts
  it("stands the directory wall where the wing roads fork, its panels facing west with walkable stops that turn the camera to them", () => {
    const grid = buildNavGrid(floor, ROVER.radius);
    // Two touching panels on z = 0, Product Engineering north.
    expect(layout.boards.software.maxZ).toBeCloseTo(0);
    expect(layout.boards.ai.minZ).toBeCloseTo(0);
    expect(rectGap(layout.boards.software, layout.boards.ai)).toBe(0);
    for (const wing of ["software", "ai"] as const) {
      const board = layout.boards[wing];
      const stop = directoryStop(wing);
      expect(stop).toEqual(board.stop);
      expect(Math.sign(board.center.z)).toBe(WING_SIDE[wing]);
      // East of the hub, between the wing roads, 6 u clear of every pod.
      expect(board.minX).toBeGreaterThan(layout.hub.center.x + layout.hub.w / 2);
      expect(board.maxZ).toBeLessThan(LABS.wingZ - LABS.road / 2);
      expect(board.minZ).toBeGreaterThan(-(LABS.wingZ - LABS.road / 2));
      for (const p of layout.placed) expect(rectGap(board, p.rect), p.room).toBeGreaterThanOrEqual(6);
      // The stop is 3 u in front of the west face, walkable, reached along the road, and turns the camera to the panel.
      expect(stop.x).toBeCloseTo(board.minX - LABS.boardStop);
      expect(stop.z).toBe(board.center.z);
      expect(isWalkable(grid, stop)).toBe(true);
      expect(roadRoute(network, grid, floor.approach, stop)).not.toBeNull();
      const zone = zoneAt("L3", stop, floor.viewZones);
      expect(zone?.id).toBe(`L3:directory:${wing}`);
      expect(zone?.yaw).toBeCloseTo((-3 * Math.PI) / 4);
      expect(zone?.zoom).toBe(LABS.boardZoom);
    }
    // The lead road from the elevator never turns the camera.
    expect(zoneAt("L3", layout.hub.center, floor.viewZones)).toBeNull();
  });
```

Replace the whole test `"parks deep links and elevator arrivals at the hub overview, with the shaft behind the camera"` with:

```ts
  it("parks deep links and elevator arrivals on the hub's east rim facing the wall, with the shaft behind the camera", () => {
    expect(floor.spawn).toEqual(LABS.overview);
    expect(floor.arrival).toEqual(LABS.overview);
    expect(inPlaza(layout.hub, LABS.overview)).toBe(true);
    expect(LABS.overview.x).toBeLessThan(layout.boards.software.minX);
    expect(isWalkable(buildNavGrid(floor, ROVER.radius), LABS.overview)).toBe(true);
    // No hint bubble pops over the wall on arrival: both board stops lie beyond the hint radius.
    for (const wing of ["software", "ai"] as const) {
      const stop = directoryStop(wing);
      expect(Math.hypot(stop.x - LABS.overview.x, stop.z - LABS.overview.z), wing).toBeGreaterThan(HINT.radius);
    }
    const zone = zoneAt("L3", LABS.overview, floor.viewZones);
    expect(zone?.id).toBe("L3:overview");
    for (const cls of ["desktop", "tablet", "mobile"] as const) {
      // The Director aims FOLLOW_LOOK_AHEAD ahead of the rover along the camera's forward (+x here).
      const [cx, , cz] = followPose(cls, [LABS.overview.x + FOLLOW_LOOK_AHEAD[cls], 0, LABS.overview.z], zone!.yaw, zone!.zoom).position;
      // The camera looks east along the floor from west of the rover, and stays clear of the shaft column.
      expect(cx).toBeLessThan(LABS.overview.x);
      expect(Math.abs(cz - LABS.overview.z)).toBeLessThan(0.01);
      expect(cx).toBeGreaterThan(SHAFT.x + SHAFT.size / 2 + 3);
    }
    // Driving the roads never swings the camera to the overview or a panel.
    for (const road of network.roads)
      for (let i = 0; i < road.points.length - 1; i++)
        for (let k = 0; k <= 40; k++) {
          const a = road.points[i];
          const b = road.points[i + 1];
          const p = { x: a.x + ((b.x - a.x) * k) / 40, z: a.z + ((b.z - a.z) * k) / 40 };
          const id = zoneAt("L3", p, floor.viewZones)?.id ?? "";
          expect(id === "L3:overview" || id.startsWith("L3:directory:"), `${road.id} at ${p.x},${p.z}`).toBe(false);
        }
  });
```

Add after the test `"keeps every packet lane off every door pad"`:

```ts
  it("starts the packet spine east of the directory wall, so no lane runs under it", () => {
    const [spine] = layout.lanes;
    expect(spine[0]).toEqual([LABS.board.x + LABS.board.w / 2 + 1, 0]);
    expect(spine[1][0]).toBe(layout.east.center.x - LABS.east / 2 - 1);
  });
```

- [x] **Step 3: Run the tests to verify they fail**

Run: `rtk bunx vitest run tests/unit/labs-arrival.test.ts tests/unit/labs-layout.test.ts`
Expected: FAIL. `labs-arrival` fails with off-screen panels (for example `software arrival 1440x900: expected -1104 to be greater than or equal to 40`) and wrong zones; the wall test fails with `expected 9.5 to be close to 0`; the overview test fails on `inPlaza` and the hint distance; the spine test fails with `expected [ 10, 0 ] to deeply equal [ 18.3, 0 ]`.

- [x] **Step 4: Replace `src/experience/floors/labs/layout.ts` with the final layout**

```ts
import type { RoomId, Wing } from "@/content/schema";
import { comparePods } from "@/content/selectors";
import { ROAD, type Plaza, type Road, type RoadNetwork, type Spur } from "../../nav/road";
import type { ViewZone } from "../../camera/orbit";
import type { DoorTrigger, FloorLayout, LabPod, Rect, Vec2 } from "../../types";

/**
 * L3 Project Roads (walkable floors plan, part 2; consolidated in round 5, owner request 2026-10-13).
 * The global elevator shaft stays at x = -28, so a short lead road runs from its door into a round hub
 * plaza. The `software` wing road (north, z < 0) and the `ai` wing road (south, z > 0) leave the hub
 * and run east; each turns `tail` past its last pod into the east plaza, so the floor is one loop
 * without dead ends or empty road ends. Where the wing roads fork stands the wing directory wall: two
 * panels facing the arrival camera. Hero and featured pods dock on both sides of their wing road in
 * site order (`comparePods`: gallery pods nearest the hub), one `slot` each, so both wings stay mirror
 * images whatever their tiers; each pod has a forecourt and a spur to its door, at least 6 u apart.
 * Listed pods stay on the directory. L3 paints no road chevrons (`RoadNetwork.chevrons`).
 * Pure module (no React or three): Vitest runs it in node.
 */
export const LABS = {
  door: { x: -24, z: 0 } as Vec2,
  approach: { x: -21, z: 0 } as Vec2,
  slabMinX: -24,
  accent: "#a78bfa",
  road: ROAD.minWidth,
  hub: { x: -4, z: 0, size: 26 },
  /** |z| of the wing roads. */
  wingZ: 24,
  /** x where the wing roads turn east after leaving the hub. */
  wingStartX: 10,
  /** First pod edge on the outer and inner side of each wing road (inner pods sit between the roads). */
  outerStart: 14,
  /** Half a pitch after the outer row, so the rows alternate and the first inner pod stays 6 u clear of the directory wall. */
  innerStart: 24,
  /** Clear floor between two pods on the same side of a road (at least 6 u). */
  gap: 7,
  /** Road edge to pod front: the forecourt. */
  forecourt: 3,
  hero: { w: 12, d: 9 },
  featured: { w: 8, d: 7 },
  /** Length of row each docked pod reserves (the hero width): slot i sits at the same x in both wings. */
  slot: 12,
  /** Pods docked per wing; the rest go to the wing directory. */
  maxPerWing: 12,
  /** Pod front wall to door pad center (the rover fits on the pad). */
  padInset: 1.1,
  spurWidth: 4,
  /** Road past the far edge of a wing's last pod before it turns into the east plaza: half the road plus a forecourt. */
  tail: 7,
  /** Diameter of the east plaza where the wing roads meet. */
  east: 18,
  /**
   * Wing directory wall where the wing roads fork: two touching double-sided panels (software north),
   * thin along x, their west faces toward the arrival camera. `z` is each panel's |z| center, `d` its width along z.
   */
  board: { x: 17, z: 3.75, w: 0.6, d: 7.5, h: 9.5 },
  /** Distance from a panel's west face to the stop in front of it (the rover then hides none of the list). */
  boardStop: 3,
  /** Camera zoom at a board stop: the whole panel fits under the HUD top bar. */
  boardZoom: 0.9,
  /** Entries a board shows in large type; the full list opens in the palette. */
  boardEntries: 5,
  /** Deep links (and the roll after an elevator ride) park here: on the hub's east rim facing the wall, beyond the hint radius of both board stops. */
  overview: { x: 8.5, z: 0 } as Vec2,
  /** Overview camera zoom: both wall panels whole in the middle of the frame, the camera still east of the shaft. */
  overviewZoom: 1.3,
  margin: 6,
  /** Hologram stage disc inside hero pods (6 u diameter). */
  stageRadius: 3,
  wallHeight: 2.6,
} as const;

/** -1 = north (`software` wing), +1 = south (`ai` wing); display names come from messages (`common.wing`). */
export const WING_SIDE: Record<Wing, -1 | 1> = { software: -1, ai: 1 };
export const WING_TINT: Record<Wing, string> = { software: "#22d3ee", ai: "#a78bfa" };

export interface PlacedPod {
  pod: LabPod;
  room: RoomId;
  rect: Rect;
  center: Vec2;
  /** Center of the door trigger, between the pod front and its wing road. */
  door: Vec2;
  /** Direction (along z) the pod front faces: toward its wing road. */
  facing: -1 | 1;
  /** Outer (away from the other wing) or inner (between the two wing roads). */
  row: "outer" | "inner";
  width: number;
  depth: number;
  /** Floor between the road edge and the pod front. */
  forecourt: Rect;
}

/** Half depth (along z) of the camera zone around each pod's door pad. */
const VIEW_ZONE_DEPTH = 2;
/** Follow camera yaw that puts the camera west of the rover, looking east along the floor. */
const LOOK_EAST = (-3 * Math.PI) / 4;

export interface DirectoryBoard extends Rect {
  center: Vec2;
  /** Where the rover stops to read the panel (`directoryStop`): in front of its west face. */
  stop: Vec2;
}

export interface LabsLayout {
  floor: FloorLayout;
  placed: PlacedPod[];
  /** Pods that only appear on the wing directory (listed tier, or overflow beyond `maxPerWing`). */
  directory: Record<Wing, LabPod[]>;
  boards: Record<Wing, DirectoryBoard>;
  network: RoadNetwork;
  hub: Plaza;
  east: Plaza;
  /** Where each wing road leaves the hub, its heading, and where the floating wing sign stands (5 u further along the road). */
  signs: Record<Wing, { at: Vec2; heading: Vec2; float: Vec2 }>;
  /** Packet lanes: the data spine between the inner rows and a branch into each inner pod. */
  lanes: [number, number][][];
}

const rect = (c: Vec2, w: number, d: number): Rect => ({ minX: c.x - w / 2, maxX: c.x + w / 2, minZ: c.z - d / 2, maxZ: c.z + d / 2 });
const bare = ({ minX, maxX, minZ, maxZ }: Rect): Rect => ({ minX, maxX, minZ, maxZ });

export function roomOf(pod: Pick<LabPod, "slug">): RoomId {
  return `L3:${pod.slug}`;
}

/** A panel of the wing directory wall where the wing roads fork (fixed: it does not depend on the pods). */
export function directoryBoard(wing: Wing): DirectoryBoard {
  const { board } = LABS;
  const center = { x: board.x, z: WING_SIDE[wing] * board.z };
  return { ...rect(center, board.w, board.d), center, stop: { x: board.x - board.w / 2 - LABS.boardStop, z: center.z } };
}

/** Where `drive` stops for a listed item, and the tour's "More projects here" stop: in front of its wing's panel. */
export function directoryStop(wing: Wing): Vec2 {
  return directoryBoard(wing).stop;
}

/** Width and height of a hologram board for an architecture with `layers` columns and `rows` rows. */
export const BOARD = { colGap: 2.5, rowGap: 1.25, nodeW: 2, nodeH: 0.85, maxWidth: 9, y: 3.4 } as const;

export function boardSize(layers: number, rows: number): { width: number; height: number; scale: number } {
  const width = (Math.max(1, layers) - 1) * BOARD.colGap + BOARD.nodeW;
  const height = (Math.max(1, rows) - 1) * BOARD.rowGap + BOARD.nodeH;
  const scale = Math.min(1, BOARD.maxWidth / width);
  return { width: width * scale, height: height * scale, scale };
}

/** Hero and featured pods in site order (`comparePods`: gallery first): the docking order along a wing road and the tour order. */
export function tourOrder(pods: readonly LabPod[]): LabPod[] {
  return pods.filter((p) => p.tier !== "listed").sort(comparePods);
}

/**
 * Places pods from data (`ExperienceData.labs.pods`). Per wing, hero and featured pods dock in
 * `tourOrder` along the wing road from the hub eastward, one slot each, alternating the outer and the
 * inner side; each wing road turns `tail` past its own last pod and both meet at one east plaza.
 */
export function buildLabsLayout(pods: readonly LabPod[]): LabsLayout {
  const L = LABS;
  const half = L.road / 2;
  const hubC: Vec2 = { x: L.hub.x, z: L.hub.z };
  const hub: Plaza = { id: "hub", center: hubC, w: L.hub.size, d: L.hub.size, round: true };
  const placed: PlacedPod[] = [];
  const directory: Record<Wing, LabPod[]> = { software: [], ai: [] };
  // Far edge (max x) of each wing's last docked pod.
  const lastEdge: Record<Wing, number> = { software: -Infinity, ai: -Infinity };

  for (const wing of ["software", "ai"] as const) {
    const zr = WING_SIDE[wing] * L.wingZ;
    const inWing = pods.filter((p) => p.wing === wing);
    const tour = tourOrder(inWing);
    const docked = tour.slice(0, L.maxPerWing);
    directory[wing] = [...tour.slice(L.maxPerWing), ...inWing.filter((p) => p.tier === "listed").sort(comparePods)];
    const cursor = { outer: L.outerStart as number, inner: L.innerStart as number };
    docked.forEach((pod, i) => {
      const row = i % 2 === 0 ? "outer" : "inner";
      // Side of the road the pod sits on: away from the other wing (outer) or toward it (inner).
      const side = (row === "outer" ? WING_SIDE[wing] : -WING_SIDE[wing]) as -1 | 1;
      const { w, d } = pod.tier === "hero" ? L.hero : L.featured;
      const x = cursor[row] + L.slot / 2;
      cursor[row] += L.slot + L.gap;
      const front = zr + side * (half + L.forecourt);
      const center = { x, z: front + (side * d) / 2 };
      const edge = zr + side * half;
      placed.push({
        pod,
        room: roomOf(pod),
        rect: rect(center, w, d),
        center,
        door: { x, z: front - side * L.padInset },
        facing: -side as -1 | 1,
        row,
        width: w,
        depth: d,
        forecourt: { minX: x - w / 2, maxX: x + w / 2, minZ: Math.min(edge, front), maxZ: Math.max(edge, front) },
      });
      lastEdge[wing] = Math.max(lastEdge[wing], x + w / 2);
    });
  }

  // Each wing road turns `tail` past its own last pod; the east plaza sits on the later turn, so a
  // shorter wing cuts across to it instead of running on empty. An empty wing still reaches a plaza
  // and a margin past the point where the wing roads start.
  const turnX = (wing: Wing) => Math.max(L.wingStartX + L.east + L.margin, lastEdge[wing] + L.tail);
  const loopEnd: Vec2 = { x: Math.max(turnX("software"), turnX("ai")), z: 0 };
  const wingRoad = (wing: Wing): Road => {
    const z = WING_SIDE[wing] * L.wingZ;
    return { id: wing, points: [hubC, { x: L.wingStartX, z }, { x: turnX(wing), z }, loopEnd], width: L.road };
  };
  const lead: Road = { id: "lead", points: [L.approach, hubC], width: L.road };
  const east: Plaza = { id: "east", center: loopEnd, w: L.east, d: L.east, round: true };
  const spurs: Spur[] = placed.map((p) => ({
    room: p.room,
    from: { x: p.door.x, z: WING_SIDE[p.pod.wing] * L.wingZ },
    to: p.door,
    width: L.spurWidth,
    color: WING_TINT[p.pod.wing],
  }));
  // No floor arrows on L3 (owner request 2026-10-13): the wing roads, signs and directory guide the way.
  const network: RoadNetwork = { roads: [lead, wingRoad("software"), wingRoad("ai")], plazas: [hub, east], spurs, chevrons: false };

  const boards = { software: directoryBoard("software"), ai: directoryBoard("ai") };
  const sign = (wing: Wing) => {
    const to = { x: L.wingStartX, z: WING_SIDE[wing] * L.wingZ };
    const len = Math.hypot(to.x - hubC.x, to.z - hubC.z);
    const heading = { x: (to.x - hubC.x) / len, z: (to.z - hubC.z) / len };
    // Just past the hub rim, on the wing road; the floating sign stands 5 u further along it.
    const r = L.hub.size / 2 + 3;
    const at = { x: hubC.x + heading.x * r, z: hubC.z + heading.z * r };
    return { at, heading, float: { x: at.x + heading.x * 5, z: at.z + heading.z * 5 } };
  };

  const doors: DoorTrigger[] = placed.map((p) => ({ room: p.room, at: p.door, facing: { x: 0, z: -p.facing } }));
  const viewZones: ViewZone[] = [
    // Board stops first (they lie just east of the overview zone): the camera stands west of the rover
    // and looks east at the panel, zoomed so the whole panel fits under the HUD top bar.
    ...(["software", "ai"] as const).map((wing) => {
      const b = boards[wing];
      return { id: `L3:directory:${wing}`, area: { minX: b.stop.x - 1, maxX: b.minX, minZ: b.minZ, maxZ: b.maxZ }, yaw: LOOK_EAST, zoom: L.boardZoom };
    }),
    // The arrival spot on the hub's east rim: the camera sits west of the rover, zoomed out, and looks
    // east, so the directory wall fills the middle of the frame with both wing roads beside it and the
    // shaft behind the camera. The zone lies between the wing roads, so driving them never triggers it.
    { id: "L3:overview", area: { minX: L.overview.x - 4, maxX: L.overview.x + 1, minZ: -4, maxZ: 4 }, yaw: LOOK_EAST, zoom: L.overviewZoom },
    // At a door the camera looks at the pod front at 45 degrees: from the south-east (the default) for
    // pods facing south, from the north-east for pods facing north, so a pod never sits between the
    // camera and the rover.
    ...placed.map((p) => ({
      id: p.room,
      area: { minX: p.rect.minX, maxX: p.rect.maxX, minZ: p.door.z - VIEW_ZONE_DEPTH, maxZ: p.door.z + VIEW_ZONE_DEPTH },
      yaw: p.facing > 0 ? 0 : Math.PI / 2,
    })),
  ];
  const obstacles: Rect[] = [...placed.map((p) => bare(p.rect)), bare(boards.software), bare(boards.ai)];
  const extentZ = Math.max(L.wingZ + half, ...placed.map((p) => Math.max(Math.abs(p.rect.minZ), Math.abs(p.rect.maxZ))));
  const bounds: Rect = { minX: L.slabMinX, maxX: loopEnd.x + L.east / 2 + L.margin, minZ: -(extentZ + L.margin), maxZ: extentZ + L.margin };

  // Data spine between the inner rows (just east of the directory wall to the east plaza rim) with a branch into each inner pod's back wall.
  const spineFrom = Math.max(hubC.x + L.hub.size / 2, L.board.x + L.board.w / 2) + 1;
  const spineTo = loopEnd.x - L.east / 2 - 1;
  const lanes: [number, number][][] =
    spineTo > spineFrom
      ? [
          [
            [spineFrom, 0],
            [spineTo, 0],
          ],
        ]
      : [];
  for (const p of placed) {
    if (p.row !== "inner") continue;
    const back = p.facing > 0 ? p.rect.minZ : p.rect.maxZ;
    lanes.push([
      [p.center.x, 0],
      [p.center.x, back],
    ]);
  }

  return {
    floor: {
      id: "L3",
      bounds,
      door: L.door,
      approach: L.approach,
      obstacles,
      spawn: L.overview,
      arrival: L.overview,
      accent: L.accent,
      doors,
      road: network,
      viewZones,
    },
    placed,
    directory,
    boards,
    network,
    hub,
    east,
    signs: { software: sign("software"), ai: sign("ai") },
    lanes,
  };
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `rtk bunx vitest run tests/unit/labs-arrival.test.ts tests/unit/labs-layout.test.ts tests/unit/facing.test.ts tests/unit/interact-registry.test.ts tests/unit/interact-pick.test.ts tests/unit/walk.test.ts tests/unit/pad-space.test.ts tests/unit/road.test.ts`
Expected: PASS. `labs-arrival` 6 tests; `interact-registry` still finds `L3:board:software|ai` with `at` equal to the new stops; the tour still ends at both directory stops.

- [x] **Step 6: Commit**

```bash
rtk bun run typecheck && rtk git add src/experience/floors/labs/layout.ts tests/unit/labs-layout.test.ts tests/unit/labs-arrival.test.ts && rtk git commit -m "feat(l3): directory wall where the wing roads fork, framed by the arrival view on every screen size"
```

At this commit the old `BoardFace` text (sized for a 7 u board) renders on the new 7.5 x 9.5 u panels; Task 6 replaces it. Do not push between Task 5 and Task 6.

### Task 6: Directory wall content and rendering (larger, brighter, 3 draw calls)

The wall's content becomes a pure module, rendered like the L1 Highlights Hall: both panels in one `MergedBoxes` mesh, neon rims and title underlines in one `LineBatch` (white x 1.6 on the full tier, so they bloom), and every text in one `BatchedLabels` (troika `BatchedText`). Before: 2 x (glass sides + rims + core + 8 texts). After: 3 calls for the whole wall. Each face: the wing name from `common.wing` in two lines (0.8 u mono, wing tint), "DIRECTORY · N PROJECTS", the top 5 projects pre-wrapped to two lines each (0.46 u), and "▸ OPEN THE FULL LIST".

**Files:**
- Create: `src/experience/floors/labs/directory.ts`
- Rewrite: `src/experience/floors/labs/Hub.tsx`
- Modify: `src/experience/floors/Labs.tsx`
- Test: `tests/unit/labs-directory.test.ts`, `tests/unit/labs-arrival.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `directoryBoard`, `LABS`, `tourOrder`, `WING_TINT` (layout.ts); `BatchedLabel` (`fx/labelProps.ts`); `Box` (`floors/roof/solids.ts`); `MergedBoxes` (`floors/roof/kit.tsx`); `LineBatch` (`floors/labs/lines.ts`); `yawTowards` (Task 4).
- Produces (directory.ts): `PANEL`, `TIER_MARK`, `interface DirectoryLabels { wings: Record<Wing, string>; directory: string; open: string; count: (count: number) => string }`, `interface DirectoryFonts { mono: string; monoBold: string; sansBold: string }`, `interface WallLine { seg: [number, number, number, number, number, number]; color: string }`, `textWidth(): number`, `listChars(): number`, `panelRows(): { titleTop; underline; subTop; listTop; listBottom; listLines }`, `wrapWords(text: string, first: number, rest?: number): string[]`, `fitTitle(name: string, width: number): { lines: string[]; size: number }`, `boardList(list: readonly LabPod[], maxLines: number): { text: string; entries: number; lines: number }`, `wallSolids(): Box[]`, `wallLines(): WallLine[]`, `wallLabels(pods: readonly LabPod[], labels: DirectoryLabels, fonts: DirectoryFonts): BatchedLabel[]`. Hub.tsx: `export type HubLabels = DirectoryLabels`.

- [x] **Step 1: Write the failing test `tests/unit/labs-directory.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import {
  boardList,
  fitTitle,
  listChars,
  PANEL,
  panelRows,
  textWidth,
  TIER_MARK,
  wallLabels,
  wallLines,
  wallSolids,
  wrapWords,
  type DirectoryLabels,
} from "@/experience/floors/labs/directory";
import { directoryBoard, LABS, tourOrder, WING_TINT } from "@/experience/floors/labs/layout";

const NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const FONTS = { mono: "/fonts/mono.woff", monoBold: "/fonts/mono-bold.woff", sansBold: "/fonts/sans-bold.woff" };
const WINGS = ["software", "ai"] as const;

function setup(locale: "en" | "id") {
  const data = buildExperienceData(locale, NAMES);
  const labels: DirectoryLabels = { wings: data.labs.wings, directory: "Directory", open: "Open the full list", count: (n) => `${n} projects` };
  return { pods: data.labs.pods, labels };
}

describe("L3 directory wall content (owner request 2026-10-13)", () => {
  it("fits five two-line entries between the title block and the footer", () => {
    const rows = panelRows();
    expect(rows.titleTop).toBeLessThan(LABS.board.h);
    expect(rows.listTop).toBeLessThan(rows.subTop - PANEL.sub.size);
    expect(rows.listBottom).toBeGreaterThan(PANEL.footer.y + PANEL.footer.size);
    expect(rows.listLines).toBeGreaterThanOrEqual(LABS.boardEntries * PANEL.list.perEntry);
  });

  it("wraps on word boundaries, the first line shorter to leave room for the tier mark", () => {
    expect(wrapWords("Serupa Ticket Hub: Event Ticketing Platform", 23, 25)).toEqual(["Serupa Ticket Hub:", "Event Ticketing Platform"]);
    expect(wrapWords("Supercalifragilistic", 5)).toEqual(["Supercalifragilistic"]);
    expect(wrapWords("  a  b ", 10)).toEqual(["a b"]);
  });

  it("gives both wing names the same two-line title, uppercase, from messages", () => {
    expect(fitTitle("Product Engineering", textWidth())).toEqual({ lines: ["PRODUCT", "ENGINEERING"], size: PANEL.title.size });
    expect(fitTitle("AI Engineering", textWidth())).toEqual({ lines: ["AI", "ENGINEERING"], size: PANEL.title.size });
    expect(fitTitle("Laboratorium", textWidth()).lines).toEqual(["LABORATORIUM"]);
  });

  for (const locale of ["en", "id"] as const) {
    it(`lists each wing's top five docked pods in docking order, two lines at most each (${locale})`, () => {
      const { pods } = setup(locale);
      for (const wing of WINGS) {
        const inWing = pods.filter((p) => p.wing === wing);
        const top = tourOrder(inWing).slice(0, LABS.boardEntries);
        const list = boardList(inWing, panelRows().listLines);
        expect(list.entries, wing).toBe(top.length);
        const lines = list.text.split("\n");
        expect(lines).toHaveLength(list.lines);
        expect(list.lines).toBeLessThanOrEqual(Math.min(panelRows().listLines, top.length * PANEL.list.perEntry));
        for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(listChars());
        const heads = lines.filter((l) => Object.values(TIER_MARK).some((mark) => l.startsWith(`${mark} `)));
        expect(heads).toHaveLength(top.length);
        heads.forEach((head, i) => expect(head.slice(2).split(" ")[0]).toBe(top[i].title.split(" ")[0]));
      }
    });
  }

  it("puts the same four texts on both faces of each panel; the west faces read left to right for the arrival camera", () => {
    const { pods, labels } = setup("en");
    const texts = wallLabels(pods, labels, FONTS);
    expect(texts).toHaveLength(WINGS.length * 2 * 4);
    for (const wing of WINGS) {
      const b = directoryBoard(wing);
      const mine = texts.filter((t) => Math.abs(t.position[2] - b.center.z) <= LABS.board.d / 2);
      const west = mine.filter((t) => t.yaw === -Math.PI / 2);
      const east = mine.filter((t) => t.yaw === Math.PI / 2);
      expect(west).toHaveLength(4);
      expect(east).toHaveLength(4);
      expect(west.map((t) => t.text)).toEqual(east.map((t) => t.text));
      expect(west[0].text).toBe(fitTitle(labels.wings[wing], textWidth()).lines.join("\n"));
      expect(west[0].color).toBe(WING_TINT[wing]);
      for (const t of west) {
        expect(t.position[0]).toBeLessThan(b.minX);
        // Yaw -PI/2 turns the text's front to -x (the camera west of the wall) and its reading direction
        // (cos yaw, -sin yaw) to +z, which is screen right for a camera looking east: never mirrored.
        expect(Math.cos(t.yaw!)).toBeCloseTo(0);
        expect(-Math.sin(t.yaw!)).toBeCloseTo(1);
      }
      for (const t of east) expect(t.position[0]).toBeGreaterThan(b.maxX);
    }
  });

  it("draws both panels as two solids, with rims and title underlines in the wing tints", () => {
    expect(wallSolids()).toEqual(
      WINGS.map((wing) => {
        const b = directoryBoard(wing);
        return { x: b.center.x, y: 0, z: b.center.z, w: LABS.board.w, h: LABS.board.h, d: LABS.board.d };
      }),
    );
    const lines = wallLines();
    expect(lines).toHaveLength(WINGS.length * (12 + 2));
    for (const wing of WINGS) expect(lines.filter((l) => l.color === WING_TINT[wing])).toHaveLength(14);
    const y = panelRows().underline;
    expect(lines.filter((l) => l.seg[1] === y && l.seg[4] === y)).toHaveLength(4);
  });
});
```

Append to `tests/unit/labs-arrival.test.ts` (add `import { PANEL } from "@/experience/floors/labs/directory";` to its imports):

```ts
describe("L3 directory wall legibility (owner request 2026-10-13)", () => {
  // Em size in px of a text of `size` u at height `y` on the panel's west face.
  const em = (w: number, h: number, at: Vec2, wing: (typeof WINGS)[number], y: number, size: number) =>
    westFace(settledCamera(w, h, at).camera, w, h, wing).scale(y) * size;
  // The lowest list line is the most foreshortened one.
  const LIST_Y = 1.5;
  const TITLE_Y = LABS.board.h - 2;

  it("reads the wing titles on arrival: at least 12 px on a phone and 20 px on a laptop", () => {
    for (const wing of WINGS) {
      expect(em(390, 844, LABS.overview, wing, TITLE_Y, PANEL.title.size), wing).toBeGreaterThanOrEqual(12);
      expect(em(1440, 900, LABS.overview, wing, TITLE_Y, PANEL.title.size), wing).toBeGreaterThanOrEqual(20);
    }
  });

  it("reads the top projects on arrival on a laptop and a big monitor, and from the panel's stop on a phone", () => {
    for (const wing of WINGS) {
      expect(em(1440, 900, LABS.overview, wing, LIST_Y, PANEL.list.size), wing).toBeGreaterThanOrEqual(11.5);
      expect(em(2560, 1440, LABS.overview, wing, LIST_Y, PANEL.list.size), wing).toBeGreaterThanOrEqual(18);
      expect(em(390, 844, directoryBoard(wing).stop, wing, LIST_Y, PANEL.list.size), wing).toBeGreaterThanOrEqual(10);
    }
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `rtk bunx vitest run tests/unit/labs-directory.test.ts tests/unit/labs-arrival.test.ts`
Expected: FAIL with `Failed to resolve import "@/experience/floors/labs/directory"`.

- [x] **Step 3: Create `src/experience/floors/labs/directory.ts`**

```ts
import type { Wing } from "@/content/schema";
import type { BatchedLabel } from "../../fx/labelProps";
import type { LabPod } from "../../types";
import type { Box } from "../roof/solids";
import { directoryBoard, LABS, tourOrder, WING_TINT } from "./layout";

/**
 * Pure content of the L3 wing directory wall (owner request 2026-10-13: noticeable on arrival). Both
 * panels are one merged mesh, their rims and title underlines one line batch, every text one troika
 * BatchedText (3 draw calls). Each panel shows the same text on its west face (the arrival camera and
 * the board stop) and its east face (rovers coming back from the wings). Text is pre-wrapped here, so
 * the line count is known and the list never runs into the footer. Vitest runs it in node.
 */

export interface DirectoryLabels {
  /** Wing display names (messages `common.wing`). */
  wings: Record<Wing, string>;
  /** "Directory", localized. */
  directory: string;
  /** Panel footer: the full list opens in the palette. */
  open: string;
  /** "{count} projects", localized. */
  count: (count: number) => string;
}

export interface DirectoryFonts {
  mono: string;
  monoBold: string;
  sansBold: string;
}

/** One line segment (floor-local x, y, z twice) in a wing tint. */
export interface WallLine {
  seg: [number, number, number, number, number, number];
  color: string;
}

const WINGS = ["software", "ai"] as const;
export const TIER_MARK: Record<LabPod["tier"], string> = { hero: "\u25C6", featured: "\u25C7", listed: "\u00B7" };

/** Panel text layout in u: heights from the floor, sizes as font em. */
export const PANEL = {
  /** Text inset from each side edge of a face. */
  inset: 0.3,
  /** Text and underlines stand this far off the face (no z-fighting). */
  out: 0.03,
  title: { top: 0.35, size: 0.8, lineHeight: 1, lines: 2 },
  /** Gap between the title block and its underline. */
  underline: 0.2,
  sub: { gap: 0.2, size: 0.3 },
  list: { gap: 0.3, size: 0.46, lineHeight: 1.1, perEntry: 2 },
  footer: { y: 0.75, size: 0.32, gap: 0.25 },
} as const;

/** Average advance per character in em: JetBrains Mono is 0.6; Inter ExtraBold measures 0.51 to 0.57 on the project titles. */
const MONO_EM = 0.6;
const SANS_EM = 0.58;
const INK = { sub: "#d4d4d8", list: "#f4f4f5" } as const;
/** West face: toward the arrival camera and the board stop, reads along +z. East face: reads along -z. */
const FACES = [
  { side: -1, yaw: -Math.PI / 2, along: 1 },
  { side: 1, yaw: Math.PI / 2, along: -1 },
] as const;

/** Text width on a face. */
export const textWidth = (): number => LABS.board.d - 2 * PANEL.inset;

/** Characters per list line at the list size (conservative average advance). */
export const listChars = (): number => Math.floor(textWidth() / (SANS_EM * PANEL.list.size));

/** Heights of the title top, underline, subtitle top and list block, and how many list lines fit. */
export function panelRows() {
  const titleTop = LABS.board.h - PANEL.title.top;
  const underline = titleTop - PANEL.title.size * PANEL.title.lineHeight * PANEL.title.lines - PANEL.underline;
  const subTop = underline - PANEL.sub.gap;
  const listTop = subTop - PANEL.sub.size - PANEL.list.gap;
  const listBottom = PANEL.footer.y + PANEL.footer.size + PANEL.footer.gap;
  const listLines = Math.floor((listTop - listBottom) / (PANEL.list.size * PANEL.list.lineHeight) + 1e-9);
  return { titleTop, underline, subTop, listTop, listBottom, listLines };
}

/** Greedy word wrap: at most `first` characters on the first line, `rest` on the others; a longer word gets a line of its own. */
export function wrapWords(text: string, first: number, rest: number = first): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (!line || next.length <= (lines.length ? rest : first)) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The wing name in capitals, split into two lines at the space nearest the middle whenever it has one,
 * so both wing titles share one layout (mirror images); the size shrinks only if the longest line would not fit.
 */
export function fitTitle(name: string, width: number): { lines: string[]; size: number } {
  const upper = name.toUpperCase();
  const spaces = [...upper].flatMap((c, i) => (c === " " ? [i] : []));
  let lines = [upper];
  if (spaces.length > 0) {
    const mid = upper.length / 2;
    const cut = spaces.reduce((best, i) => (Math.abs(i - mid) < Math.abs(best - mid) ? i : best));
    lines = [upper.slice(0, cut), upper.slice(cut + 1)];
  }
  const longest = Math.max(...lines.map((l) => l.length));
  return { lines, size: Math.min(PANEL.title.size, width / (MONO_EM * longest)) };
}

/** The top `LABS.boardEntries` docked pods (docking order, gallery first), each a tier mark and at most two lines, within `maxLines`. */
export function boardList(list: readonly LabPod[], maxLines: number): { text: string; entries: number; lines: number } {
  const chars = listChars();
  const out: string[] = [];
  let lines = 0;
  for (const pod of tourOrder(list).slice(0, LABS.boardEntries)) {
    let wrapped = wrapWords(pod.title, chars - 2, chars);
    if (wrapped.length > PANEL.list.perEntry) {
      wrapped = wrapped.slice(0, PANEL.list.perEntry);
      const last = wrapped.length - 1;
      wrapped[last] = `${wrapped[last].slice(0, chars - 3).trimEnd()}...`;
    }
    if (lines + wrapped.length > maxLines) break;
    lines += wrapped.length;
    out.push(`${TIER_MARK[pod.tier]} ${wrapped.join("\n")}`);
  }
  return { text: out.join("\n"), entries: out.length, lines };
}

/** Both panels as solids (one merged mesh). */
export function wallSolids(): Box[] {
  return WINGS.map((wing) => {
    const b = directoryBoard(wing);
    return { x: b.center.x, y: 0, z: b.center.z, w: LABS.board.w, h: LABS.board.h, d: LABS.board.d };
  });
}

/** Each panel's 12 rim edges and a title underline on both faces, in its wing tint (one line batch). */
export function wallLines(): WallLine[] {
  const out: WallLine[] = [];
  const { underline } = panelRows();
  const half = textWidth() / 2;
  for (const wing of WINGS) {
    const b = directoryBoard(wing);
    const color = WING_TINT[wing];
    const y1 = LABS.board.h;
    const c: [number, number, number][] = [
      [b.minX, 0, b.minZ],
      [b.maxX, 0, b.minZ],
      [b.maxX, 0, b.maxZ],
      [b.minX, 0, b.maxZ],
      [b.minX, y1, b.minZ],
      [b.maxX, y1, b.minZ],
      [b.maxX, y1, b.maxZ],
      [b.minX, y1, b.maxZ],
    ];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]] as const;
    for (const [a, e] of edges) out.push({ seg: [...c[a], ...c[e]], color });
    for (const face of FACES) {
      const x = b.center.x + face.side * (LABS.board.w / 2 + PANEL.out);
      out.push({ seg: [x, underline, b.center.z - half, x, underline, b.center.z + half], color });
    }
  }
  return out;
}

/** Every text of the wall, both faces of both panels (one BatchedText). Wing names come from `labels.wings`, never literals. */
export function wallLabels(pods: readonly LabPod[], labels: DirectoryLabels, fonts: DirectoryFonts): BatchedLabel[] {
  const rows = panelRows();
  const width = textWidth();
  const out: BatchedLabel[] = [];
  for (const wing of WINGS) {
    const b = directoryBoard(wing);
    const inWing = pods.filter((p) => p.wing === wing);
    const title = fitTitle(labels.wings[wing], width);
    const list = boardList(inWing, rows.listLines);
    const sub = `${labels.directory.toUpperCase()} \u00B7 ${labels.count(inWing.length).toUpperCase()}`;
    const footer = `\u25B8 ${labels.open.toUpperCase()}`;
    const color = WING_TINT[wing];
    for (const face of FACES) {
      const x = b.center.x + face.side * (LABS.board.w / 2 + PANEL.out);
      const at = (u: number, y: number): [number, number, number] => [x, y, b.center.z + face.along * u];
      out.push(
        { text: title.lines.join("\n"), position: at(0, rows.titleTop), yaw: face.yaw, font: fonts.monoBold, fontSize: title.size, color, anchorX: "center", anchorY: "top", textAlign: "center", lineHeight: PANEL.title.lineHeight },
        { text: sub, position: at(0, rows.subTop), yaw: face.yaw, font: fonts.mono, fontSize: PANEL.sub.size, color: INK.sub, anchorX: "center", anchorY: "top", textAlign: "center" },
        { text: list.text, position: at(-width / 2, rows.listTop), yaw: face.yaw, font: fonts.sansBold, fontSize: PANEL.list.size, color: INK.list, anchorX: "left", anchorY: "top", textAlign: "left", lineHeight: PANEL.list.lineHeight },
        { text: footer, position: at(0, PANEL.footer.y), yaw: face.yaw, font: fonts.monoBold, fontSize: PANEL.footer.size, color, anchorX: "center", anchorY: "bottom", textAlign: "center" },
      );
    }
  }
  return out.filter((l) => l.text.trim().length > 0);
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `rtk bunx vitest run tests/unit/labs-directory.test.ts tests/unit/labs-arrival.test.ts`
Expected: PASS (labs-directory 7 tests, labs-arrival 8 tests). Measured margins: titles 14.2 px (phone) and 25.6 px (laptop) on arrival, list 12.0 px (1440x900) and 19.2 px (2560x1440) on arrival, 10.1 px from the stop on a phone.

- [x] **Step 5: Rewrite `src/experience/floors/labs/Hub.tsx` with the wall**

Replace the whole file with:

```tsx
"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Vector3, type Group } from "three";
import { useHQStore } from "@/store/useHQStore";
import { BatchedLabels } from "../../fx/BatchedLabels";
import { yawTowards } from "../../fx/facing";
import { neonColor } from "../../fx/materials";
import type { LabPod, Vec2 } from "../../types";
import { FONTS } from "../../tower/primitives";
import { MergedBoxes } from "../roof/kit";
import { wallLabels, wallLines, wallSolids, type DirectoryLabels } from "./directory";
import { LABS, WING_TINT, type LabsLayout } from "./layout";
import { LineBatch } from "./lines";

export type HubLabels = DirectoryLabels;

const WINGS = ["software", "ai"] as const;
/** Height of the floating wing signs (bottom of the text). */
const SIGN_Y = 4.2;
const NO_RAYCAST = () => null;
/** troika's laid-out text block: [minX, minY, maxX, maxY] in local units. */
type TextSync = { textRenderInfo?: { blockBounds?: number[] } };

/**
 * A wing name floating above its wing road where it leaves the hub (owner request 2026-10-13: nothing
 * painted on the floor). It turns to the camera every frame (yaw only, so it stays upright) on a dark
 * backing, so it reads left to right from any camera yaw and never shows its mirrored back.
 */
function WingSign({ at, text, color }: { at: Vec2; text: string; color: string }) {
  const group = useRef<Group>(null);
  const world = useMemo(() => new Vector3(), []);
  const [box, setBox] = useState<number[] | null>(null);
  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    g.getWorldPosition(world);
    g.rotation.y = yawTowards({ x: world.x, z: world.z }, { x: camera.position.x, z: camera.position.z });
  });
  return (
    <group ref={group} position={[at.x, SIGN_Y, at.z]}>
      {box && (
        <mesh position={[(box[0] + box[2]) / 2, (box[1] + box[3]) / 2, -0.02]} raycast={NO_RAYCAST}>
          <planeGeometry args={[box[2] - box[0] + 0.8, box[3] - box[1] + 0.4]} />
          <meshBasicMaterial color="#05050c" transparent opacity={0.9} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <Text
        font={FONTS.monoBold}
        fontSize={1}
        color={color}
        anchorX="center"
        anchorY="bottom"
        whiteSpace="nowrap"
        renderOrder={1}
        material-toneMapped={false}
        onSync={(t: TextSync) => {
          const b = t.textRenderInfo?.blockBounds;
          if (b) setBox([b[0], b[1], b[2], b[3]]);
        }}
      >
        {text}
      </Text>
    </group>
  );
}

function WingSigns({ layout, labels }: { layout: LabsLayout; labels: HubLabels }) {
  return (
    <group>
      {WINGS.map((wing) => (
        <WingSign key={wing} at={layout.signs[wing].float} text={labels.wings[wing].toUpperCase()} color={WING_TINT[wing]} />
      ))}
    </group>
  );
}

/**
 * The wing directory wall where the wing roads fork (owner request 2026-10-13: noticeable on arrival):
 * both panels in one merged mesh, their neon rims and title underlines in one line batch (boosted on
 * the full tier so they bloom), every text in one BatchedText. Three draw calls in all. Clicks go
 * through point-and-go (`L3:board:<wing>` in interact/registry.ts), never handlers on these meshes.
 */
function DirectoryWall({ labels, pods }: { labels: HubLabels; pods: readonly LabPod[] }) {
  const tier = useHQStore((s) => s.tier);
  const solids = useMemo(() => wallSolids(), []);
  const texts = useMemo(() => wallLabels(pods, labels, FONTS), [pods, labels]);
  const lines = useMemo(() => {
    const batch = new LineBatch();
    for (const line of wallLines()) batch.segment(line.seg, line.color);
    return batch.build();
  }, []);
  useEffect(() => () => lines.dispose(), [lines]);
  const boost = useMemo(() => neonColor("#ffffff", 1.6, tier), [tier]);
  return (
    <group name="directory-wall">
      <MergedBoxes boxes={solids} color="#0b1020" emissive={LABS.accent} emissiveIntensity={0.06} />
      <lineSegments geometry={lines} raycast={NO_RAYCAST}>
        <lineBasicMaterial color={boost} vertexColors transparent opacity={0.95} toneMapped={false} />
      </lineSegments>
      <BatchedLabels labels={texts} name="directory-labels" />
    </group>
  );
}

/** The hub plaza in front of the elevator: the floating signs to each wing road, and the directory wall where the wing roads fork. */
export function Hub({ layout, labels, pods }: { layout: LabsLayout; labels: HubLabels; pods: readonly LabPod[] }) {
  return (
    <group name="labs-hub">
      <WingSigns layout={layout} labels={labels} />
      <DirectoryWall labels={labels} pods={pods} />
    </group>
  );
}
```

- [x] **Step 6: Memoize the hub labels in `src/experience/floors/Labs.tsx`**

Replace:

```tsx
  const layout = useMemo(() => buildLabsLayout(data.labs.pods), [data.labs.pods]);
  const reducedMotion = useHQStore((s) => s.reducedMotion);
```

with:

```tsx
  const layout = useMemo(() => buildLabsLayout(data.labs.pods), [data.labs.pods]);
  // Stable labels: the wall's BatchedText re-packs whenever its label list changes.
  const hubLabels = useMemo(() => ({ wings: data.labs.wings, directory: labels.directory, open: labels.open, count: labels.count }), [data.labs.wings, labels]);
  const reducedMotion = useHQStore((s) => s.reducedMotion);
```

and replace:

```tsx
        <Hub layout={layout} pods={data.labs.pods} labels={{ wings: data.labs.wings, directory: labels.directory, open: labels.open, count: labels.count }} />
```

with:

```tsx
        <Hub layout={layout} pods={data.labs.pods} labels={hubLabels} />
```

- [x] **Step 7: Verify the whole unit suite and the build**

Run: `rtk bun run verify:quick`
Expected: typecheck, lint, all unit tests (including the em-dash scan) and `next build` pass.

- [x] **Step 8: Commit**

```bash
rtk git add src/experience/floors/labs/directory.ts src/experience/floors/labs/Hub.tsx src/experience/floors/Labs.tsx tests/unit/labs-directory.test.ts tests/unit/labs-arrival.test.ts && rtk git commit -m "feat(l3): larger, brighter directory wall panels in three draw calls with pre-wrapped top projects"
```

### Task 7: End-to-end coverage for the wall, point-and-go and the draw-call caps

**Files:**
- Modify: `e2e/labs.spec.ts` (imports, append a describe block)

**Interfaces:**
- Consumes: `__hq.interact.screenAt(id, fx, fz, lift)` (CSS px of a point inside a target's pick volume), `hoverTarget`, `hoveredTarget`, `targetPoint`, `interactablesOf`, `snapshot`, `DESKTOP_SAFE`, `PHONE_SAFE`, `waitForSceneLive`, `waitForCameraSettle` from `e2e/hq.ts`; registry ids `L3:board:software|ai`; the palette dialog `en.hud.palette.title` ("Command palette").
- Produces: e2e proof that both panels are whole and unobstructed on arrival at 1440x900 and 390x844, and that click (desktop) and tap + Go (phone) drive to the panel and open the full project list.

- [x] **Step 1: Extend the `./hq` import of `e2e/labs.spec.ts`**

```ts
import {
  asReturningVisitor,
  collectErrors,
  DESKTOP_SAFE,
  expectRenderBudget,
  enterFloorRoute,
  enterHQ,
  hoveredTarget,
  hoverTarget,
  interactablesOf,
  PHONE_SAFE,
  snapshot,
  targetPoint,
  waitForCameraSettle,
  waitForFloor,
  waitForFrames,
  waitForHQ,
  waitForPhase,
  waitForSceneLive,
} from "./hq";
```

- [x] **Step 2: Append the wall tests to `e2e/labs.spec.ts`**

```ts
type PanelWindow = Window & { __hq: { interact: { screenAt: (id: string, fx: number, fz: number, lift: number) => { x: number; y: number } | null } } };

/** The L3 arrival as a returning visitor (walks off, so no prompt covers the floor), camera settled. */
async function openLabsArrival(page: Page) {
  await asReturningVisitor(page);
  await page.goto("/en/labs?tier=lite&walk=off");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  await waitForCameraSettle(page);
}

/** Screen box (CSS px) of a wing panel: the corners of its point-and-go pick volume. */
async function panelBox(page: Page, wing: "software" | "ai") {
  return page.evaluate((id) => {
    const { interact } = (window as unknown as PanelWindow).__hq;
    const points = [0, 1].flatMap((fx) => [0, 1].flatMap((fz) => [0.02, 0.98].map((lift) => interact.screenAt(id, fx, fz, lift))));
    if (points.some((p) => !p)) return null;
    const xs = points.map((p) => p!.x);
    const ys = points.map((p) => p!.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }, `L3:board:${wing}`);
}

test.describe("L3 directory wall (round 5 consolidation)", () => {
  for (const size of [
    { width: 1440, height: 900, safe: DESKTOP_SAFE, phone: false },
    { width: 390, height: 844, safe: PHONE_SAFE, phone: true },
  ] as const) {
    test(`both wing panels are whole and unobstructed on arrival @ ${size.width}x${size.height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, isMobile: size.phone, hasTouch: size.phone });
      const page = await context.newPage();
      await openLabsArrival(page);
      for (const wing of ["software", "ai"] as const) {
        const box = await panelBox(page, wing);
        expect(box, wing).not.toBeNull();
        expect(box!.minX, wing).toBeGreaterThanOrEqual(size.safe.side);
        expect(box!.maxX, wing).toBeLessThanOrEqual(size.width - size.safe.side);
        expect(box!.minY, wing).toBeGreaterThanOrEqual(size.safe.top);
        expect(box!.maxY, wing).toBeLessThanOrEqual(size.height - size.safe.bottom);
        const middle = { x: (box!.minX + box!.maxX) / 2, y: (box!.minY + box!.maxY) / 2 };
        expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, middle), `${wing}: HUD over the panel`).toBe("CANVAS");
      }
      await context.close();
    });
  }

  test("a click on a wing panel drives to its stop and opens the full project list", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openLabsArrival(page);
    const id = "L3:board:software";
    const stop = (await interactablesOf(page)).find((i) => i.id === id)!.at;
    await hoverTarget(page, id);
    const point = await targetPoint(page, id);
    await page.mouse.click(point.x, point.y);
    const palette = page.getByRole("dialog", { name: en.hud.palette.title });
    await expect(palette).toBeVisible({ timeout: 60_000 });
    await expect(palette.getByRole("option").first()).toBeVisible();
    const { rover } = await snapshot(page);
    expect(Math.hypot(rover.x - stop.x, rover.z - stop.z)).toBeLessThan(1.5);
  });

  test("on a phone a tap selects a wing panel and Go opens the full project list", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await openLabsArrival(page);
    const id = "L3:board:ai";
    const point = await targetPoint(page, id);
    await page.touchscreen.tap(point.x, point.y);
    await expect.poll(() => hoveredTarget(page)).toEqual({ id, via: "tap" });
    await page.getByTestId("interact-go").tap();
    await expect(page.getByRole("dialog", { name: en.hud.palette.title })).toBeVisible({ timeout: 60_000 });
    await context.close();
  });
});
```

- [x] **Step 3: Build and run the changed e2e specs**

```bash
rtk bun run verify:quick && E2E_PORT=4437 rtk bun run e2e:changed --dry && E2E_PORT=4437 rtk bun run e2e:changed
```

Expected: the dry run lists `labs`, `gallery`, `walk` (floors/labs), `experience`, `career`, `library-roof` (floors), `pads` (road kit) and the smoke specs (`.gitignore` is unmapped); the run passes, including the 4 new wall tests and the 2 caps (`L3 arrival draw calls (lite): <= 64`, `(full): <= 82`). Record the printed after-numbers.

`e2e-plan.ts` does not map these paths to `interact.spec.ts`, which drives point-and-go on `/en/labs` (the wall now sits in the middle of that frame), so run it explicitly:

```bash
E2E_PORT=4437 bunx playwright test e2e/interact.spec.ts
```

Expected: all pass. `visibleTarget` only returns targets the raycast hits first, so pods behind the wall are skipped; the projection check behind this plan shows more door pads in the desktop arrival frame than before (4 instead of 2).

If a cap fails: the wall adds 3 calls in view while the change removes the 2 floor texts and the chevron mesh, and the signs leave the arrival frame. Bisect in a local build by removing `<DirectoryWall />`, then `<WingSigns />`, from `Hub` and re-running the cap test to find the extra call; fix it in code (the wall must stay 3 meshes: `MergedBoxes`, the line batch and one `BatchedLabels`); do not raise the cap.

- [x] **Step 4: Commit**

```bash
rtk git add e2e/labs.spec.ts && rtk git commit -m "test(l3): directory wall framing, click and tap to the full list on arrival"
```

### Task 8: After captures, diff gate, L3 thumbnail, docs and PR

**Files:**
- Regenerate: `public/floors/L3.webp`
- Modify: `README.md`, `AGENTS.md`, `docs/superpowers/specs/agent-hq/01-world-and-layout.md`

**Interfaces:**
- Consumes: Task 1 harness and baselines.
- Produces: the PR with before/after captures, metrics and the diff-gate result.

- [x] **Step 1: Capture after-state and run the unchanged-floor diff gate**

```bash
rtk bun run build && rm -rf screenshots/r5-p8/after && E2E_PORT=4437 SCREENSHOTS=1 P8_PHASE=after bunx playwright test e2e/screenshots.spec.ts -g "r5-p8" --workers=1
```

Expected: 15 passed. The 12 `r5-p8 unchanged` tests compare L1, L2, L4 and RF at 1440x900, 2560x1440 (full) and 390x844 (lite) against the Task 1 baselines with `maxDiffPixelRatio: 0.01` (or the noise floor recorded in Task 1 Step 7) and pass, proving the chevron switch and the shared code left every other floor unchanged. On a failure, open the diff image Playwright writes under `test-results/`; a real difference on another floor is a bug in this branch (rollback: revert the Task 3 commit and re-run).

Then the top-down view (dev server as in Task 1 Step 8, port 4438):

```bash
bun scripts/capture-dev.ts --base http://localhost:4438 --out screenshots/r5-p8/after/top --ready "[data-testid='floors-prototype'][data-ready]" 'l3-top=/en/dev/floors?floor=L3&view=top&tier=full'
```

Expected: `screenshots/r5-p8/after/top/l3-top-*.png`; the road ends now meet the east plaza right after the last pods and the slab ends 17 u earlier.

- [x] **Step 2: Summarize the metrics for the PR body**

```bash
bun -e 'import { readFileSync, writeFileSync } from "node:fs"; const read = (p) => readFileSync(`screenshots/r5-p8/${p}/metrics.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l)); const before = read("before"); const rows = read("after").map((a) => { const b = before.find((x) => x.name === a.name && x.viewport === a.viewport); return `| ${a.name} | ${a.viewport} | ${a.tier} | ${b?.drawCalls ?? "n/a"} | ${a.drawCalls} | ${b?.triangles ?? "n/a"} | ${a.triangles} |`; }); writeFileSync("screenshots/r5-p8/metrics.md", ["| Pose | Viewport | Tier | Calls before | Calls after | Triangles before | Triangles after |", "|---|---|---|---|---|---|---|", ...rows].join("\n") + "\n"); console.log(rows.length, "rows");'
```

Expected: `24 rows` (3 viewports x (4 L3 poses + 4 unchanged floors)); fewer means a pose failed to record, re-run Step 1. Every unchanged floor shows equal calls before and after; the L3 arrival shows calls after <= before (the caps); the other L3 poses are reported as measured (the wing-end and board-stop views are new compositions, so they are compared against the 150-call budget, not the old pose).

- [x] **Step 3: Regenerate the L3 elevator picker thumbnail**

```bash
E2E_PORT=4437 SCREENSHOTS=1 bunx playwright test e2e/screenshots.spec.ts -g "floor thumbnail L3" --workers=1 && cwebp -quiet -noalpha -q 62 -m 6 -resize 320 180 -metadata none screenshots/floor-thumbs/L3.png -o public/floors/L3.webp && ls -l public/floors/L3.webp
```

Expected: 1 passed; `public/floors/L3.webp` rewritten (a few KB, same settings as `scripts/floor-thumbs.ts`), showing the directory wall at the fork. Other floors' thumbnails stay untouched.

- [x] **Step 4: Update `AGENTS.md`**

Replace the line

```
  experience/fx/RoadMarkings.tsx  road strip, chevrons, dashed edges and spur stubs (4 draw calls per floor)
```

with

```
  experience/fx/RoadMarkings.tsx  road strip, chevrons, dashed edges and spur stubs (4 draw calls per floor; 3 on L3, which turns chevrons off)
```

In the line starting `  experience/floors/labs/`, replace `pure layout.ts, board.ts, hologramParts.ts` with `pure layout.ts, directory.ts (directory wall content), board.ts, hologramParts.ts`.

In the "Road kit" bullet, replace

```
`spurs` (`room`, `from` on a road or plaza, `to` = the door pad `DoorTrigger.at`, optional `width` and stub `color`).
```

with

```
`spurs` (`room`, `from` on a road or plaza, `to` = the door pad `DoorTrigger.at`, optional `width` and stub `color`), plus optional `chevrons` (default true; `false` draws no chevrons: `chevronMarks` returns none, used by L3 since round 5).
```

Replace the whole bullet that starts with `- L3 Project Roads (` with:

```
- L3 Project Roads (`floors/labs/layout.ts`, walkable floors plan part 2; consolidated in round 5, owner request 2026-10-13): `buildLabsLayout(pods)` returns the floor (with `road`, `viewZones` and `arrival`), `placed` pods, `directory`, `boards`, `network`, `hub`, `east`, `signs` and packet `lanes`. A lead road runs from the elevator approach (-21, 0) into a round 26 u hub plaza at (-4, 0). The `software` wing road (z = -24) and the `ai` wing road (z = +24) leave the hub and run east; each turns `LABS.tail` (7 u) past the far edge of its own last docked pod and runs into the 18 u east plaza, which sits on the later turn at z = 0, so the floor is one loop with no dead ends and no empty road ends, and the slab ends one plaza radius and `LABS.margin` past it (x = 122 with today's 9 pods per wing; 139 before). Where the wing roads fork stands the wing directory wall (`LABS.board`): two touching double-sided panels (0.6 x 7.5 u, 9.5 u tall, Product Engineering north) at x = 17, west faces toward the arrival camera; `directoryBoard(wing)` is a panel and `directoryStop(wing)` the stop 3 u in front of its west face (listed items and the tour's "More projects here" stops end there). Each face shows the wing name in two lines, "Directory · N projects", the top `LABS.boardEntries` (docking order, gallery first) pre-wrapped to at most two lines each, and "Open the full list"; the content is pure (`floors/labs/directory.ts`: `wallSolids`, `wallLines`, `wallLabels`) and renders in 3 draw calls (`MergedBoxes`, one `LineBatch` boosted on the full tier, one `BatchedLabels`). Clicking a panel drives to its stop and opens the pods palette (the full list). Per wing, hero and featured pods in site order (`tourOrder`, which sorts with `comparePods`: gallery first; at most `LABS.maxPerWing`; the rest and every listed pod stay on the directory) dock along the road from the hub, one `LABS.slot` (12 u) each so both wings stay mirror images whatever their tiers, alternating the outer side (from x = 14) and the inner side (from x = 24, half a pitch later and 6 u clear of the wall), 7 u apart, each with a 3 u forecourt and a spur to its door. Deep links to `/labs` spawn, and elevator arrivals roll on (`FloorLayout.arrival`), to `LABS.overview` (8.5, 0) on the hub's east rim, more than `HINT.radius` from both board stops. `FloorLayout.viewZones` (checked in order: the two board stops, the overview, the doors) look east from the overview (camera west of the rover, zoom 1.3: both panels whole in the middle of the frame at 1440x900, 2560x1440 and 390x844, asserted in `tests/unit/labs-arrival.test.ts`; the shaft behind the camera), look east at a panel from its stop (zoom 0.9), and turn the follow camera at each door so the pod is in front of the rover. Pod labels are billboards. L3 paints no wing names and no chevrons on the floor (`RoadNetwork.chevrons: false`); the floating wing signs above each wing road (`signs[wing].float`) turn to the camera every frame (`yawTowards` in `fx/facing.ts`, yaw only) on a dark backing, so they never read mirrored from any camera yaw. Wing names on the wall and signs come from `ExperienceData.labs.wings` (messages `common.wing`), never literals. Packet lanes run on a data spine between the inner rows (from just east of the wall to the east plaza) with a branch into each inner pod. The layout test asserts the space rules with the real pods, a lopsided floor and an empty one.
```

In the `tests/unit/` line, replace `labs layout,` with `labs layout, arrival framing and directory wall, sign facing,`.

- [x] **Step 5: Update `README.md`**

Replace

```
On L3 (Labs) the floor is **Project Roads**: a hub plaza in front of the elevator with both wing directory boards, and two wing roads that run east and meet in a loop, with every key and featured project docked along them.
```

with

```
On L3 (Labs) the floor is **Project Roads**: a hub plaza in front of the elevator, a wing directory wall where the two wing roads fork (the first thing you see on arrival: each wing's name, project count and top projects; click a panel for the full list), and two wing roads that run east and meet in a loop right after their last pods, with every key and featured project docked along them.
```

- [x] **Step 6: Update appendix 01 section 4 (`docs/superpowers/specs/agent-hq/01-world-and-layout.md`)**

Replace the sentence `The footprint follows the content: with today's 18 docked pods it is about 163 × 92 u, from x = -24 to about 139 and z = -46 to 46.` with `The footprint follows the content: with today's 18 docked pods it is about 146 × 92 u, from x = -24 to 122 and z = -46 to 46 (round 5 consolidation, owner request 2026-10-13: the wing roads used to run on to x = 139 past their last pods).`

Replace the table rows `Hub plaza`, `Wing roads`, `East plaza`, `Docked pods (per wing)`, `Packet lanes`, `Arrival` and `Camera` with these rows, and add the `Directory wall` and `Wing signs` rows after `Hub plaza`:

```
| Hub plaza | Round, 26 u across, centered at (-4, 0): the lead road ends here and both wing roads start. |
| Directory wall | Where the wing roads fork, at x = 17: two touching double-sided panels (0.6 × 7.5 u each, 9.5 u tall; Product Engineering north of z = 0, AI Engineering south), their west faces toward the arrival camera. Each face: the wing name from `common.wing` in two lines (wing tint), "Directory · N projects", the top 5 projects (docking order, gallery first, at most two lines each) and "Open the full list", with neon rims and a title underline in the wing tint. Clicking a panel (point-and-go, or Open at the tour's "More projects here" stop) drives to its stop 3 u in front of the west face and opens the full project list in the palette. 3 draw calls for the whole wall. |
| Wing signs | The wing name floats 4.2 u above each wing road just past the hub rim, turned to the camera every frame (yaw only) on a dark backing, so it reads left to right from any camera angle. Nothing is painted on the L3 floor: no wing names, no arrows. |
| Wing roads | 8 u wide. The Product Engineering road leaves the hub to (10, -24) and runs east at z = -24; the AI Engineering road mirrors it at z = +24. Each turns 7 u past the far edge of its last pod and runs into the east plaza, so the floor is one loop with no dead ends and no empty road ends. No chevrons on L3 (owner decision 2026-10-13; other floors keep theirs). |
| East plaza | Round, 18 u across, at z = 0 on the later of the two wing road turns (x = 107 today). The slab ends 15 u past its center. |
| Docked pods (per wing) | Hero (12 × 9 u) and featured (8 × 7 u) pods in site order (owner decision 2026-10-12, `comparePods`: pods with a gallery first, then hero before featured, then `order`), one 12 u slot each so both wings stay mirror images whatever the tier in each slot, alternating the outer side (away from the other wing) and the inner side (between the wing roads), starting at x = 14 (outer) and x = 24 (inner, half a pitch later, 6 u clear of the directory wall), 7 u between slots along the road. Every pod has a 3 u forecourt between the road edge and its front and a 4 u spur to its door. At most 12 per wing; the rest fall back to the directory. |
| Packet lanes | A data spine at z = 0 between the inner rows (from just east of the directory wall to the east plaza) with a branch into the back of every inner pod. Packets at 2 u/s. |
| Arrival | Deep links to `/labs` spawn, and elevator rides roll on, to the overview spot (8.5, 0) on the hub's east rim, facing the directory wall. Its view zone puts the camera west of the rover, zoomed out to 1.3, looking east: both wall panels whole in the middle of the frame at 1440×900, 2560×1440 and 390×844, the wing roads beside them, the shaft behind the camera. |
| Camera | View zones turn the follow camera at each door so the pod is in front of the rover, and look east at a directory panel from its stop (zoom 0.9, the whole panel under the HUD). |
```

- [x] **Step 7: Verify docs and commit**

```bash
rtk bun run verify:quick && rtk git add public/floors/L3.webp README.md AGENTS.md docs/superpowers/specs/agent-hq/01-world-and-layout.md && rtk git commit -m "docs(l3): consolidated Project Roads, directory wall and camera-facing signs; new L3 thumbnail"
```

Expected: the em-dash scan and all checks pass.

- [x] **Step 8: Push and open the PR**

```bash
rtk git push -u origin r5/p8-l3-consolidation
```

Create the PR with `gh pr create --title "L3 consolidation: road ends at the last pod, no floor arrows or floor text, readable signs, directory wall on arrival" --body-file screenshots/r5-p8/pr-body.md` after writing `screenshots/r5-p8/pr-body.md` with exactly these sections:

1. **Owner request** (verbatim quote and the "reserved = reversed" note) and the decisions (chevrons off on L3 only).
2. **What changed**: road ends and slab (x 139 to 122), chevrons off on L3 via `RoadNetwork.chevrons`, floor wing names removed, signs facing the camera (`yawTowards`), directory wall at the fork with the arrival spot (8.5, 0), inner row from x = 24, 3-call wall.
3. **Measurements**: the table from `screenshots/r5-p8/metrics.md`, plus the L3 arrival caps printed by `labs.spec.ts` before (Task 1 Step 5) and after (Task 7 Step 3), and the projected text sizes from `labs-arrival.test.ts` (titles 14.2 px phone / 25.6 px laptop on arrival; list 12.0 px laptop, 19.2 px at 2560x1440, 10.1 px from a stop on a phone).
4. **Screenshots**: before/after pairs for `l3-arrival`, `l3-end-software`, `l3-end-ai`, `l3-board-software` at 1440x900, 2560x1440 and 390x844, and the top-down `l3-top` pair (attach the PNGs from `screenshots/r5-p8/`).
5. **Diff gate**: "r5-p8 unchanged: 12/12 passed, maxDiffPixelRatio 0.01 (or the recorded noise floor), threshold 0.2" for L1, L2, L4, RF.
6. **Rollback**: revert the PR; the layout is data-driven, no content or URL changed; `public/floors/L3.webp` reverts with it. Partial rollback: reverting only the Task 5 and Task 6 commits restores the hub-rim boards while keeping the shorter roads, no chevrons and the readable signs.
7. **Cross-workstream notes**: the rebase table from this plan (P7 camera, P2 batched labels, P3 Hub disposal, P4 draw-call method, P1 glyphs).

Expected: CI `Build, CV and e2e` and `Lighthouse CI` green (the change only touches the lazy 3D chunk; JS 240 KB, LCP 2000 ms, CLS 0.01, TBT 200 ms budgets unaffected). Do not merge without the owner.

## Open risks and owner decisions to confirm

1. **Phone legibility on arrival.** On a 390x844 phone the arrival frame is a narrow strip, so the wall's titles read at 14 px but the top-project lines at about 7 px; they read at 10 px from a panel's stop (one tap plus Go) and the palette shows the full list. If the owner wants the list legible at arrival on phones too, the options are a phone-only closer overview zoom (needs per-class zone zoom, coordinate with P7) or showing the top 3 instead of 5 at a larger size; both are small follow-ups on top of this plan.
2. **The wall hides the back corners of the first inner pods** from the arrival camera (their fronts face the wing roads and stay visible, holograms and titles float above the wall line). Check the before/after captures with the owner.
3. **P7 camera rework.** Free yaw, pitch and first person change how zones apply. The signs are camera-facing from any yaw and the wall is double-sided, but `labs-arrival.test.ts` models today's follow rig (`followPose` plus look-ahead); after P7 lands, re-check that entering the overview and board-stop zones still eases to `LOOK_EAST` and update `settledCamera` if the rig math changes. If P7 adds camera collision against obstacles, the wall (9.5 u tall) must be included.
4. **Screenshot noise.** The unchanged-floor gate relies on SwiftShader determinism under reduced motion; Task 1 Step 7 measures the noise floor before trusting it (never above 0.02).
5. **Hint bubble placement.** The arrival spot is kept beyond `HINT.radius` of both board stops so no "!" bubble covers the wall on arrival; driving toward a panel shows the usual bubble at its stop.

## Self-review

**Spec coverage** (task statement and plan.md item 7):
- (1) Baseline screenshots of current L3 (arrival, each wing end, top-down) at 1440x900, 2560x1440, 390x844: Task 1 Steps 4, 6, 8 (top-down via the dev prototype at 1440x900, 834x1112, 390x844; the prototype capture script has no 2560 size, the 2560 poses come from the live floor).
- (2) Roads end at the last docked pod, loop moved in, slab shrinks, space rules, 6 u clearances, deep links, tour order, packet lanes, elevator pad: Task 2 (roads, plaza, slab, lopsided and empty floors), Task 5 (wall clearance, lanes, zones), existing tests kept (`expectSpaceRules`, doors reachable, tour order, lanes off pads, registry, pad-space).
- (3) No L3 chevrons through a per-floor option, other floors unchanged, test: Task 3 (`RoadNetwork.chevrons`, unit tests for every floor) and Task 8 Step 1 (pixel diff gate on L1, L2, L4, RF).
- (4) Floor-painted wing names removed: Task 4 Step 6 (no floor `Text` left in `Hub.tsx`); verified in the after captures (Task 8 Step 1).
- (5) Floating signs readable, never mirrored, from both wing roads and any yaw, solid backing, unit test on facing vs camera: Task 4 (`yawTowards`, `facing.test.ts` including the old mirrored case).
- (6) Directory boards prominent at arrival: larger (7 x 7 to 7.5 x 9.5 u), brighter (neon rims and underline boosted on full, tinted titles), positioned in the arrival view zone, title from `common.wing`, top projects legible at 1440x900 and from the stop at 390x844, point-and-go hover and click open the full list: Tasks 5, 6, 7. Angle: the panels face the arrival camera squarely (west), which projects them whole; no extra tilt needed.
- (7) Render budget unchanged or lower: wall 3 calls (was up to 22), floor texts -2, chevrons -1, sign outline passes swapped for backings; capped by `L3_ARRIVAL_CALLS` (Tasks 1, 7) and reported per pose (Task 8 Step 2).
- (8) After screenshots, README, AGENTS, appendix 01 section 4, PR: Task 8.
- Coordination with P7 and P2 and every shared file: the rebase table above.

**Placeholder scan:** every code step has complete code; the only measured inputs (draw-call baselines, diff noise floor) have concrete defaults (64/82, 0.01) and a concrete rule for replacing them with the printed value.

**Type consistency:** `LABS.tail` (7), `LABS.board` (`x`, `z`, `w`, `d`, `h`), `LABS.boardStop`, `LABS.boardZoom`, `LABS.overview`, `LABS.innerStart`; `LabsLayout.signs[wing].float`; `RoadNetwork.chevrons`; `yawTowards(from, viewer)`; `DirectoryLabels`, `DirectoryFonts`, `WallLine`, `PANEL`, `TIER_MARK`, `textWidth`, `listChars`, `panelRows`, `wrapWords`, `fitTitle`, `boardList`, `wallSolids`, `wallLines`, `wallLabels`; `HubLabels = DirectoryLabels` (Labs.tsx's `LabsLabels = Pick<HubLabels, "directory" | "open" | "count">` stays valid). `LABS.loop` is removed in Task 2 and referenced nowhere else (checked: only `layout.ts` used it).

