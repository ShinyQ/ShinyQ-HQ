# R5 P6: Elevator Ride Smoothness, Page View Icon and Owner Photo Implementation Plan

Status: shipped in #74 (7a2afea), 2026-10-13. Later replaced in #88: the neon portrait frame on the About me station, by the hologram disc

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The elevator dolly always animates (no skipped rides on slow-compiling GPUs such as Windows Brave at 2560x1440), the 3D "Page view" button gets a document icon on its left, and the owner's photo appears as the round HUD profile badge and in a neon frame on the L1 Highlights Hall "About me" station.

**Architecture:** Three changes to the ride, all look-preserving. (1) The ride clock adds at most `rideCap(typical frame)` of ride time per frame (1/30 s at 60 fps, up to 1/20 s on devices that are steadily slow), so a long frame pauses the ride instead of eating the 0.8 s dolly in 2 to 4 frames; the camera spring uses the same cap during rides. (2) Every floor precompiles its shader programs when its content commits (`compileAsync` into the scene pass's own render target), troika typesetting is counted per floor, and `advanceRide` holds the car at closed doors until the destination is ready (at most 1.5 s); a floor below the car that is still compiling stays hidden until the car moves, exactly like explore already hides it. (3) The Director measures every ride (`window.__hq.ridePrep.lastRide`, console line with `?perf=1`) and a 6x CPU-throttled e2e proves the dolly renders at least 12 car heights. The Page view icon is an inline SVG in the shared `ViewActions` (desktop, tablet own row and phone row). The photo ships as `public/brand/kurniadi-photo-{160,320,640}.webp` (same names as P1); the HUD badge is an `<img>` with `srcset`, the hall draws the 320 px file into the existing lazy screenshot atlas, so it costs no extra draw call.

**Tech Stack:** Next.js 16 static export, React 19, three 0.186.1, @react-three/fiber 9.8, drei 10.7, troika-three-text 0.52.5 (main-thread typesetting), postprocessing 6.39 (full tier composer), zustand 5, Vitest 5, Playwright 1.64 (SwiftShader), Bun 1.4, Tailwind 4, `cwebp` (or `sharp` from `node_modules`) for the webp renditions.

## Global Constraints

- Owner reports (verbatim): "so in my laptop i can see animation elevator up and down but why in big monitor desktop its somehow not just like skipping the animation its should be fix" (big monitor = Windows PC, Brave, 2560x1440; laptop = Mac); "also can you make Page View button have icon on the left"; "also here is my photo that you can add" (P6 part: "3D profile card KAW badge becomes a round photo and the Highlights Hall "About me" station shows it in a neon frame").
- **The aesthetic must not change**: any task that can change pixels needs a before/after screenshot-diff step (desktop full 1440x900 and 2560x1440, phone lite 390x844, the same camera poses) with an explicit threshold, and a rollback note. Intentional changes (icon, photo) get before/after screenshots for owner review.
- Never remove the rover, neon look, bloom, holograms, missions or the intro.
- Measure before and after with the same method; record numbers in the PR body.
- Keep Lighthouse CI budgets green (LCP 2000 ms, CLS 0.01, TBT 200 ms, JS 240 KB, CSS 20 KB, fonts 60 KB, HTML 80 KB) and render budgets (< 150 draw calls, < 30k triangles; L1 cap 140, RF cap 80).
- **No em dashes** (U+2014) anywhere: code, comments, copy, docs, commits, PR text (a unit test scans the repo). Use commas, colons, parentheses or "to".
- Every user-facing string is EN and ID (`messages/en.json` and `messages/id.json` with identical keys). This plan adds no new strings: the Page view label stays `hud.pageView` ("Page view" / "Tampilan halaman"); the badge photo is decorative (`alt=""`, the name is next to it).
- Public repo: only the owner's portrait may be committed (C5 revised by the owner on 2026-10-13); the 800x800 source PNG is never committed, only the three webp renditions.
- Pure modules (config, elevator, rigs, movement, faces, navgrid, collision, intents, url-sync, gpu-tier, viewport, and the new `ridePrep`, `rideStats`, `textSync`, `near`) stay free of React and three side effects so Vitest runs them in node.
- 3D tests wait on state, never on time (`e2e/hq.ts` helpers); `page.waitForTimeout` only to prove that nothing happens or to let screenshots settle in opt-in screenshot specs. Pass `?tier=lite` unless the test is about the full tier. No blanket retries.
- Verification per push: `bun run verify:quick`, then `E2E_PORT=4435 bun run e2e:changed`. Port **4435** for every local e2e and screenshot run in this workstream. Never run two e2e suites at once.
- Commits: conventional messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), prefer the `rtk` git wrapper. One PR for P6; do not merge without the owner.
- REPORT ids addressed: SP9 (peaks and first-visit floor jank), F5.6 (no shader precompile), F5.7 (floor mount work on the main thread at ride start), Area 5 "No shader precompile; floor mount on main thread", spec gap 19 (ride timing omits the door stages), spec gap 26 (spec silent on shader precompile).

## Diagnosis (verified against main @ f61fbba)

- `src/experience/scene/Director.tsx:198` clamps the frame delta at `MAX_FRAME_DT = 0.25` (`src/experience/rover/controller.ts:21`) and `Director.tsx:304` feeds it straight into `advanceRide`. `src/experience/tower/elevator.ts:22-25` gives the dolly 0.8 s (+0.15 s per extra floor). Four 0.25 s frames end a one-floor dolly: the car shows 4 heights, a jump of up to 79% of the trip per frame (easeInOutCubic slope 3).
- `src/experience/camera/CameraDirector.tsx:85` uses the same 0.25 s clamp, so on a stall the camera spring catches up in one frame too.
- `src/experience/tower/Tower.tsx:66-69` mounts the ride target and its neighbours (`nearFloors`, `tower/near.ts:9-15`) when the ride is created (`toDoor`). Nothing precompiles (no `compile*` call in `src/`). In three 0.186 `WebGLRenderer.compile` gathers materials with `scene.traverse` (all objects, visible or not, `node_modules/three/src/renderers/WebGLRenderer.js:1458-1488`), so hidden floor content can be precompiled; program keys depend on the bound render target (`WebGLPrograms.js:121,177-213`: tone mapping and output color space), so full-tier compiles must bind the composer's input buffer. REPORT F5.6's "visible only" note applies to lights only in this three version.
- `src/experience/tower/FloorLevel.tsx:40-48`: going up, the target content is a hidden ghost until the car is within 0.5 u of it (end of the dolly); going down, content below the car is drawn for the whole ride (`!ride`), so it compiles on the first frame after mount. With `KHR_parallel_shader_compile` a draw before the link finishes still blocks (`getProgramParameter`), so async compile only helps if the floor is not drawn until ready.
- `src/experience/text-config.ts:12` runs troika typesetting on the main thread (CSP blocks the worker). drei `Text` calls `sync()` in a layout effect at mount; `BatchedLabels` (`fx/BatchedLabels.tsx:22-36`) syncs members (not in the scene graph) in an effect. Both land in the frames right after the ride starts.
- On the Mac (Metal) the compile and typeset cost stays under a frame or two; on Windows Chromium compiles through ANGLE/Direct3D, often 50 to 150 ms per program, so the 0.65 s of `boarding` + `closing` is not enough and the stall lands in the dolly.

## Cross-workstream conflicts and rebase notes

| File | Also touched by | Rebase note |
|---|---|---|
| `src/experience/scene/precompile.ts` | P2 (owner of the utility, boot and intro precompile, SP9) | If P2 merged first, keep P2's file and add only the optional 4th parameter `root: Object3D = scene` (pass `root` as `compileAsync`'s first argument and `scene` as `targetScene`) and `sceneTargetKnown()` if missing; keep P2's render-target handling if it already binds the composer input. If P2 already precompiles on floor mount, keep its call and wrap it with `beginFloorPrep`/`finishFloorPrep`. |
| `src/experience/tower/FloorLevel.tsx`, `tower/Tower.tsx`, `tower/near.ts` | P2 (F5.4: L2 out of the exterior set, hide below content until near) | Merge visibility rules into `floorContentVisible` (one pure function); P2's extra conditions become more parameters. |
| `src/experience/scene/Director.tsx`, `src/store/useHQStore.ts` | P3 (store churn: `setRide` per frame may move to a runtime object), P7 (first-person driving) | Keep `advanceRide` call sites identical in shape; if P3 moves `ride.t` to a runtime object, move `held` with it and read it from the same place in `rideStats`. |
| `src/experience/camera/CameraDirector.tsx` | P7 (free rotation, zoom, first person: heavy rewrite) | Re-apply the 2-line `dt` change at P7's single `useFrame` entry. |
| `src/experience/text-config.ts` | P1 (troika font subset and caching, SP10: `defaultFontURL`) | Keep both: P1's `configureTextBuilder` arguments, then the `trackTextSync` line. |
| `src/experience/Experience.tsx` (`window.__hq`) | P4 (`?perf=1` overlay may add `perf`) | Keep both keys. If P4's overlay exposes a row API, add a "Last ride" row from `ridePrep.lastRide` (console line stays). |
| `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts` | P4, P7, P8 (new specs) | Union of `ALL_SPECS` and rules; keep rule order (specific before parent). |
| `src/hud/Controls.tsx`, `src/hud/ProfileCard.tsx` | P1 (boot card Page view link, not these files), P10-style colored stripe removal (owner item 10, may touch HUD panels) | Trivial textual merge. |
| `public/brand/kurniadi-photo-{160,320,640}.webp`, `src/lib/brand-photo.ts`, AGENTS.md hard rule, appendix 07 C5, `tests/content/safety.test.ts` | P1 (landing hero photo), P9 (share image) | If P1 merged first, drop P6's webp copies (`git checkout origin/main -- public/brand/`), reuse P1's helper if it has one (delete `src/lib/brand-photo.ts` and import P1's), and keep P1's C5 and AGENTS wording. |
| `src/experience/floors/lobby/HighlightsHall.tsx`, `hallContent.ts` | P3 (texture disposal), P5 (profile headline text) | Keep P3's disposal calls inside `useHallAtlas`; the headline line-count unit test guards P5's new headline. |
| `e2e/screenshots.spec.ts`, `e2e/hud.spec.ts`, `e2e/highlights.spec.ts` | P2 (screenshot-diff gate), P8 (L3) | Additive test blocks; no shared helpers changed. |
| `docs/superpowers/specs/agent-hq/02,03,04,07,08`, `README.md`, `AGENTS.md` | everyone | Additive sentences; resolve by keeping both. |

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `src/experience/tower/elevator.ts` | Modify | `RIDE_CAP`, `rideCap`, `trackFrameDt`, `TYPICAL_FRAME_DT`, `PREPARE_TIMEOUT`, `Ride.held`, capped and gated `advanceRide` |
| `src/experience/tower/ridePrep.ts` | Create | Per-floor compile state and text-sync counts, `destinationReady`, `lastRide` (pure module state) |
| `src/experience/tower/rideStats.ts` | Create | Per-ride measurements (`RideStats`, `RideSummary`, `formatRideSummary`) |
| `src/experience/tower/textSync.ts` | Create | `trackTextSync`: wraps troika `Text.prototype.sync` (and tags `BatchedText` members) to count syncs per floor |
| `src/experience/tower/near.ts` | Modify | `floorContentVisible` (pure visibility rule, including "compiling below the car stays hidden until moving") |
| `src/experience/scene/precompile.ts` | Create (or extend P2's) | `trackSceneTarget`, `sceneTargetKnown`, `precompileScene(gl, scene, camera, root?)` |
| `src/experience/tower/Tower.tsx` | Modify | `FloorPrep` marker inside each floor's Suspense boundary |
| `src/experience/tower/FloorLevel.tsx` | Modify | Uses `floorContentVisible` with `floorReady` |
| `src/experience/scene/Director.tsx` | Modify | Typical frame tracking, capped and gated ride, ride stats, `?perf=1` console line |
| `src/experience/camera/CameraDirector.tsx` | Modify | Ride-time camera `dt` cap |
| `src/experience/text-config.ts` | Modify | Installs `trackTextSync` |
| `src/experience/Experience.tsx` | Modify | `window.__hq.ridePrep` |
| `src/hud/Controls.tsx` | Modify | `PageIcon` left of "Page view" (one `ViewActions` serves desktop, tablet own row and phone) |
| `src/lib/brand-photo.ts` | Create | Photo file names and `srcset` |
| `public/brand/kurniadi-photo-{160,320,640}.webp` | Create (unless P1 merged) | Owner portrait renditions |
| `src/hud/ProfileCard.tsx` | Modify | `ProfilePhoto` badge replaces `Monogram` (card 44 px, phone pill 36 px) |
| `src/experience/floors/lobby/hallContent.ts` | Modify | `PHOTO`, `PHOTO_SRC`, `hallAtlas`, `hallPhoto`, frame solid, About text block re-layout, `shotQuadBuffers(quads, cells)` |
| `src/experience/floors/lobby/HighlightsHall.tsx` | Modify | `useHallAtlas` (cells with brightness), portrait quad in the same mesh |
| `scripts/e2e-plan.ts` | Modify | `ride` spec and rules |
| `e2e/ride.spec.ts` | Create | Throttled dolly, reduced-motion cut, gate and precompile checks |
| `e2e/screenshots.spec.ts` | Modify | "P6 review poses" (opt-in, `SHOT_DIR`) |
| `e2e/hud.spec.ts`, `e2e/highlights.spec.ts` | Modify | Icon placement, ID width at 1024, photo badge, hall portrait and budget |
| `tests/unit/elevator.test.ts` | Modify | Stall, cap and gate tests |
| `tests/unit/ride-prep.test.ts`, `ride-stats.test.ts`, `text-sync.test.ts`, `precompile.test.ts`, `floor-visibility.test.ts` | Create | Unit tests for the new pure modules |
| `tests/unit/hall-content.test.ts`, `tests/unit/e2e-plan.test.ts`, `tests/hud/Controls.test.tsx`, `tests/hud/ProfileCard.test.tsx`, `tests/content/assets.test.ts` | Modify | Updated and new expectations |
| `AGENTS.md`, `README.md`, `docs/superpowers/specs/agent-hq/02,03,04,07,08` | Modify | Conventions, owner check, spec amendments |

---

### Task 1: Baseline: throttled ride e2e (red on main), review poses and before captures

Records the "before" numbers and images with the exact method used after the fix (REPORT SP9: no long task during `moving`; spec gap 26). The throttled test is expected to FAIL on unchanged code: that is the reproduction of the owner's report.

**Files:**
- Create: `e2e/ride.spec.ts`
- Modify: `scripts/e2e-plan.ts:11-32` (`ALL_SPECS`), `scripts/e2e-plan.ts:100` (rules before the camera rule)
- Modify: `tests/unit/e2e-plan.test.ts` (new mapping test)
- Modify: `e2e/screenshots.spec.ts` (imports at line 2, new block at the end)

**Interfaces:**
- Consumes: `enterHQ`, `waitForFloor`, `waitForCameraSettle`, `driveTo` from `e2e/hq.ts`; `stationOf` from `src/experience/floors/lobby/hallLayout.ts`; `window.__hq.store`, `window.__hq.rover.y`.
- Produces: spec name `ride` in `ALL_SPECS`; helper functions `sampleCar(page)` and `analyse(samples)` local to `e2e/ride.spec.ts` (later tasks append tests to this file); env `SHOT_DIR` for the P6 screenshot block, output `${SHOT_DIR}/p6/{topbar,profile,l1-plaza,l1-about,l3-arrival}-WxH.png`.

- [x] **Step 1: Create the branch and build main as is**

```bash
cd ~/code/ShinyQ-HQ   # your working clone, not the read-only hq-local reference
rtk git fetch origin && rtk git switch -c r5-p6-elevator-ride-pageview-icon origin/main
bun install --frozen-lockfile
bun run build
```
Expected: `next build` ends with the static export summary and no error.

- [x] **Step 2: Write `e2e/ride.spec.ts`**

```ts
import { expect, test, type Page } from "@playwright/test";
import { enterHQ, waitForFloor } from "./hq";

/**
 * Elevator ride smoothness (R5 P6, owner report from a Windows PC): long frames pause the ride
 * instead of skipping the dolly. Samples the car height on every rendered frame through `window.__hq`
 * (the sampler's rAF callback runs after R3F's, so each sample is one rendered frame).
 */
test.describe.configure({ timeout: 300_000 });

type Sample = { stage: string | null; y: number; t: number };
export type RideSummaryLike = { held: number; timedOut: boolean; programs: number; distinctY: number; dollyFrames: number; maxStep: number };
type RideWindow = Window & {
  __hq: {
    store: { getState: () => { ride: { stage: string } | null } };
    rover: { y: number };
    ridePrep?: { lastRide: RideSummaryLike | null };
  };
  __rideSamples: Sample[];
};

async function sampleCar(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as RideWindow;
    w.__rideSamples = [];
    const tick = () => {
      const ride = w.__hq.store.getState().ride;
      w.__rideSamples.push({ stage: ride?.stage ?? null, y: w.__hq.rover.y, t: performance.now() });
      if (w.__rideSamples.length < 50_000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return () => page.evaluate(() => (window as unknown as RideWindow).__rideSamples);
}

/** Car heights while the dolly runs, the biggest jump between two of them, and the ride's wall time. */
function analyse(samples: Sample[]) {
  const moving = samples.filter((s) => s.stage === "moving").map((s) => s.y);
  const steps = moving.slice(1).map((y, i) => Math.abs(y - moving[i]));
  const ridden = samples.filter((s) => s.stage !== null && s.stage !== "toDoor");
  return {
    stages: [...new Set(samples.map((s) => s.stage).filter((s): s is string => s !== null))],
    movingFrames: moving.length,
    distinctY: new Set(moving.map((y) => y.toFixed(3))).size,
    maxStep: steps.length ? Math.max(...steps) : 0,
    rideMs: ridden.length ? ridden[ridden.length - 1].t - ridden[0].t : 0,
  };
}

async function rideTo(page: Page, floor: string, timeout: number) {
  await page.getByRole("navigation", { name: "Elevator" }).locator(`[data-floor="${floor}"]`).click();
  await waitForFloor(page, floor, timeout);
}

const lastRide = (page: Page) => page.evaluate(() => (window as unknown as RideWindow).__hq.ridePrep?.lastRide ?? null);

test("the first ride to an unvisited floor animates the dolly under a 6x CPU throttle", async ({ page }) => {
  test.slow();
  await enterHQ(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  const samples = await sampleCar(page);
  try {
    await rideTo(page, "L3", 240_000);
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await cdp.detach();
  }
  const ride = analyse(await samples());
  console.log(`ride L1 to L3 at 6x: ${JSON.stringify(ride)} last=${JSON.stringify(await lastRide(page))}`);
  // L1 to L3 is 28 u. Skipping 0.25 s frames shows 4 to 9 heights; the capped clock shows at least 16.
  expect(ride.distinctY).toBeGreaterThanOrEqual(12);
  expect(ride.maxStep).toBeLessThanOrEqual(0.25 * 28);
  // Never faster than the nominal 2.25 s of stages (the clock only slows down), never stuck.
  expect(ride.rideMs).toBeGreaterThanOrEqual(2100);
  expect(ride.rideMs).toBeLessThan(60_000);
});

test("reduced motion keeps the 150 ms cut", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterHQ(page);
  const samples = await sampleCar(page);
  await rideTo(page, "L2", 60_000);
  const ride = analyse(await samples());
  expect(ride.stages).toEqual(["toDoor", "moving"]);
  expect(ride.distinctY).toBeLessThanOrEqual(2);
});
```

- [x] **Step 3: Register the spec**

In `scripts/e2e-plan.ts`, add `"ride",` to `ALL_SPECS` between `"pageview",` and `"roof",`. Then replace

```ts
  { test: /^src\/experience\/camera\//, specs: ["experience", "career"] },
```

with

```ts
  // Elevator ride smoothness (R5 P6): the ride clock, floor preparation, precompile and troika sync tracking.
  { test: /^src\/experience\/(tower\/|scene\/(Director\.tsx|precompile\.ts)$|text-config\.ts$)/, specs: ["ride", "experience"] },
  { test: /^src\/experience\/camera\//, specs: ["experience", "career", "ride"] },
```

In `tests/unit/e2e-plan.test.ts`, add inside `describe("specsForChanges", ...)`:

```ts
  it("maps the elevator ride code to the ride spec", () => {
    expect(specsForChanges(["src/experience/tower/elevator.ts"]).specs).toEqual(["experience", "ride"]);
    expect(specsForChanges(["src/experience/scene/Director.tsx"]).specs).toEqual(["experience", "ride"]);
    expect(specsForChanges(["src/experience/text-config.ts"]).specs).toEqual(["experience", "ride"]);
    expect(specsForChanges(["src/experience/camera/CameraDirector.tsx"]).specs).toEqual(["career", "experience", "ride"]);
    expect(specsForChanges(["e2e/ride.spec.ts"]).specs).toEqual(["ride"]);
  });
```

Run: `bunx vitest run tests/unit/e2e-plan.test.ts`
Expected: PASS (all tests, including "knows every spec in e2e/").

- [x] **Step 4: Add the P6 review poses to `e2e/screenshots.spec.ts`**

Change the `./hq` import on line 2 to also import `waitForCameraSettle` and `waitForFloor`:

```ts
import { asReturningVisitor, driveTo, emptyFloorPoint, hoverTarget, interactablesOf, padsOf, PHONE_SAFE, targetPoint, visibleTarget, waitForCameraSettle, waitForFloor, waitForHQ, waitForPhase, waitForRoom } from "./hq";
```

Append at the end of the file:

```ts
/**
 * R5 P6 review poses at the round 5 sizes, for before/after captures:
 * `SHOT_DIR=screenshots/before` on main, `SHOT_DIR=screenshots/after` on the branch.
 * l1-plaza and l3-arrival are diff-gated (must not change); topbar, profile and l1-about are the
 * intended changes (icon, photo badge, hall portrait) for owner review.
 */
const P6_VIEWPORTS: readonly Viewport[] = [VIEWPORTS[0], { name: "desktop-qhd", width: 2560, height: 1440, tier: "full", touch: false }, VIEWPORTS[2]];
const p6Shot = (name: string, v: Viewport) => `${process.env.SHOT_DIR ?? "screenshots"}/p6/${name}-${v.width}x${v.height}.png`;
const HIDE_HUD = "[data-testid='hud'], [data-testid^='ask-'] { display: none !important; }";

for (const viewport of P6_VIEWPORTS) {
  test(`P6 review poses @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    test.setTimeout(420_000);
    const { context, page } = await open3D(browser, viewport);
    await waitForCameraSettle(page);
    await page.getByTestId("hud-topbar").screenshot({ path: p6Shot("topbar", viewport) });
    const profile =
      viewport.name === "mobile" ? page.getByRole("button", { name: new RegExp(`^${en.hud.profile}:`) }) : page.getByRole("region", { name: en.hud.profile });
    await profile.screenshot({ path: p6Shot("profile", viewport) });
    const hide = await page.addStyleTag({ content: HIDE_HUD });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: p6Shot("l1-plaza", viewport) });
    const about = stationOf("about");
    await driveTo(page, { x: about.pad.x - about.facing.x * 2.5, z: about.pad.z - about.facing.z * 2.5 });
    await waitForCameraSettle(page);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: p6Shot("l1-about", viewport) });
    await hide.evaluate((el) => el.remove());
    await page.getByRole("navigation", { name: "Elevator" }).locator('[data-floor="L3"]').click();
    await waitForFloor(page, "L3", 120_000);
    await waitForCameraSettle(page);
    await page.addStyleTag({ content: HIDE_HUD });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: p6Shot("l3-arrival", viewport) });
    await context.close();
  });
}
```

- [x] **Step 5: Run the baseline ride spec on unchanged code (expect the throttled test to fail)**

Run: `E2E_PORT=4435 bunx playwright test e2e/ride.spec.ts --reporter=list`
Expected: "reduced motion keeps the 150 ms cut" PASSES; "the first ride ... under a 6x CPU throttle" FAILS with `expect(received).toBeGreaterThanOrEqual(expected) Expected: >= 12` (or the `maxStep` assertion). Copy the printed line `ride L1 to L3 at 6x: {...}` into `docs/superpowers/plans/2026-10-13-r5-p6-measurements.md` under "Before (main f61fbba)". If it unexpectedly passes on this machine, raise the throttle to 10x in a local run only and record both numbers; keep 6x in the committed test.

- [x] **Step 6: Capture the before screenshots twice (A/A noise floor)**

```bash
SCREENSHOTS=1 E2E_PORT=4435 SHOT_DIR=screenshots/before bunx playwright test e2e/screenshots.spec.ts -g "P6 review poses" --workers=1
SCREENSHOTS=1 E2E_PORT=4435 SHOT_DIR=screenshots/before2 bunx playwright test e2e/screenshots.spec.ts -g "P6 review poses" --workers=1
ls screenshots/before/p6 screenshots/before2/p6
```
Expected: 3 tests pass per run; each folder holds 15 PNGs (5 names x 3 sizes). `screenshots/` is gitignored.

- [x] **Step 7: Commit**

```bash
rtk git add e2e/ride.spec.ts e2e/screenshots.spec.ts scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts docs/superpowers/plans/2026-10-13-r5-p6-measurements.md
rtk git commit -m "test: reproduce the skipped elevator dolly under a 6x CPU throttle and add P6 review poses"
```

(The measurements file starts as:)

```markdown
# R5 P6 measurements

Method: `E2E_PORT=4435 bunx playwright test e2e/ride.spec.ts` (lite tier, SwiftShader, ride L1 to L3 at 6x CPU throttle, car height sampled every rendered frame).

## Before (main f61fbba)

- ride L1 to L3 at 6x: (paste the printed JSON line)

## After

- (filled in Task 9)
```

### Task 2: Ride clock with a per-frame cap (stalls pause, never skip)

Fixes the owner's report at its root (REPORT Area 5, SP9). Pure change in `elevator.ts`, wired into the Director and the camera. No pixel changes in settled views; ride frames only differ when a frame is longer than the cap.

**Files:**
- Modify: `src/experience/tower/elevator.ts:1-52`
- Modify: `src/experience/scene/Director.tsx:20,26,66-86,197-199,304`
- Modify: `src/experience/camera/CameraDirector.tsx:11,82-88`
- Test: `tests/unit/elevator.test.ts`

**Interfaces:**
- Consumes: `Ride`, `RideStage`, `stageDuration`, `dollyDuration`, `carY` (existing).
- Produces (exported from `src/experience/tower/elevator.ts`):
  - `RIDE_CAP: { readonly min: number; readonly max: number }` (1/30, 1/20)
  - `TYPICAL_FRAME_DT: number` (1/60)
  - `rideCap(typicalDt: number): number`
  - `trackFrameDt(typical: number, frameDt: number): number`
  - `interface RideOptions { atDoor: boolean; reduced: boolean; ready?: boolean; cap?: number }` (`ready` is added in Task 3; this task adds `cap`)
  - `advanceRide(ride: Ride, frameDt: number, options: RideOptions): Ride | null`

- [x] **Step 1: Write the failing stall test**

Add to `tests/unit/elevator.test.ts` inside `describe("elevator ride", ...)`:

```ts
  it("pauses the dolly on long frames instead of skipping it (owner report, Windows PC)", () => {
    let r: Ride | null = ride({ stage: "moving", t: 0 });
    const ys: number[] = [];
    let frames = 0;
    while (r?.stage === "moving" && frames < 200) {
      ys.push(carY(r, false));
      r = advanceRide(r, 0.25, { atDoor: true, reduced: false });
      frames += 1;
    }
    // 0.8 s of dolly at no more than 1/30 s of ride time per frame.
    expect(frames).toBeGreaterThanOrEqual(24);
    expect(new Set(ys.map((y) => y.toFixed(3))).size).toBeGreaterThanOrEqual(12);
    const steps = ys.slice(1).map((y, i) => Math.abs(y - ys[i]));
    expect(Math.max(...steps)).toBeLessThanOrEqual(0.25 * 14);
  });
```

- [x] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/elevator.test.ts -t "pauses the dolly"`
Expected: FAIL with `AssertionError: expected 4 to be greater than or equal to 24`.

- [x] **Step 3: Write the cap tests**

Add to the imports of `tests/unit/elevator.test.ts`: `RIDE_CAP, rideCap, trackFrameDt, TYPICAL_FRAME_DT,`. Change the `run` helper's default step from `dt = 0.05` to `dt = 1 / 60` (the stage-time assertions describe a 60 fps device). Add:

```ts
describe("ride clock", () => {
  it("lets one frame add at most 1/30 s at 60 fps", () => {
    expect(rideCap(TYPICAL_FRAME_DT)).toBeCloseTo(1 / 30);
  });

  it("keeps steadily slow devices in real time up to 20 fps", () => {
    let typical = TYPICAL_FRAME_DT;
    for (let i = 0; i < 100; i++) typical = trackFrameDt(typical, 1 / 20);
    expect(rideCap(typical)).toBeCloseTo(RIDE_CAP.max);
    typical = TYPICAL_FRAME_DT;
    for (let i = 0; i < 100; i++) typical = trackFrameDt(typical, 1 / 30);
    expect(rideCap(typical)).toBeGreaterThanOrEqual(1 / 30);
  });

  it("is not fooled by a few stalls", () => {
    let typical = TYPICAL_FRAME_DT;
    for (let i = 0; i < 60; i++) typical = trackFrameDt(typical, i % 20 === 0 ? 0.25 : 1 / 60);
    expect(rideCap(typical)).toBeLessThan(RIDE_CAP.max);
    expect(rideCap(0.2)).toBe(RIDE_CAP.max);
    expect(trackFrameDt(TYPICAL_FRAME_DT, 5)).toBeLessThanOrEqual(TYPICAL_FRAME_DT + RIDE_CAP.max * 0.1);
  });

  it("uses the frame time in toDoor, where the rover drives in real time", () => {
    expect(advanceRide(ride(), 0.5, { atDoor: false, reduced: false })).toMatchObject({ stage: "toDoor", t: 0.5 });
  });

  it("honours an explicit cap", () => {
    const next = advanceRide(ride({ stage: "moving", t: 0 }), 0.25, { atDoor: true, reduced: false, cap: RIDE_CAP.max });
    expect(next?.t).toBeCloseTo(RIDE_CAP.max);
  });
});
```

- [x] **Step 4: Implement the capped clock in `src/experience/tower/elevator.ts`**

Replace lines 14 to 52 (from `/** Fixed stage lengths` through the end of `advanceRide`) with:

```ts
/** Fixed stage lengths in seconds. The dolly length depends on the distance. */
export const STAGE_TIME = { boarding: 0.45, closing: 0.2, opening: 0.2, exiting: 0.45 } as const;
/** Reduced motion: a 150 ms fade cut instead of the ride (appendix 02 section 2). */
export const REDUCED_CUT = 0.15;
/**
 * Most ride time one frame may add (R5 P6). A long frame (a shader compile, a floor mounting) pauses
 * the ride instead of skipping it: at 60 fps a stall adds at most 1/30 s, so the 0.8 s dolly shows at
 * least 16 car heights however long the stall. Devices that are steadily slower keep riding in real
 * time down to 20 fps (`rideCap`).
 */
export const RIDE_CAP = { min: 1 / 30, max: 1 / 20 } as const;
/** Starting estimate of a typical frame (60 fps) for `trackFrameDt`. */
export const TYPICAL_FRAME_DT = 1 / 60;

/** Ride time one frame may add: twice the typical frame, within RIDE_CAP. */
export function rideCap(typicalDt: number): number {
  return Math.min(RIDE_CAP.max, Math.max(RIDE_CAP.min, 2 * typicalDt));
}

/** Moving average of recent frame times; one stall moves it by at most a tenth of RIDE_CAP.max. */
export function trackFrameDt(typical: number, frameDt: number): number {
  return typical + (Math.min(Math.max(frameDt, 0), RIDE_CAP.max) - typical) * 0.1;
}

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** 0.8 s for one floor (appendix 03), slightly longer for longer trips. */
export function dollyDuration(from: FloorId, to: FloorId): number {
  const floors = Math.abs(floorIndex(to) - floorIndex(from));
  return 0.8 + 0.15 * Math.max(0, floors - 1);
}

export function stageDuration(ride: Ride, reduced: boolean): number {
  if (ride.stage === "toDoor") return Infinity;
  if (ride.stage === "moving") return reduced ? REDUCED_CUT : dollyDuration(ride.from, ride.to);
  return STAGE_TIME[ride.stage];
}

const NEXT: Record<RideStage, RideStage | null> = {
  toDoor: "boarding",
  boarding: "closing",
  closing: "moving",
  moving: "opening",
  opening: "exiting",
  exiting: null,
};

export interface RideOptions {
  /** The rover reached the shaft door (`toDoor` only). */
  atDoor: boolean;
  reduced: boolean;
  /** Most ride time this frame may add (`rideCap`); defaults to RIDE_CAP.min. */
  cap?: number;
}

/**
 * Advances the ride by one frame of `frameDt` seconds. Returns null when the rover has left the car on
 * the new floor. `toDoor` runs on the frame time (the rover drives in real time); every other stage
 * adds at most `cap`.
 */
export function advanceRide(ride: Ride, frameDt: number, { atDoor, reduced, cap = RIDE_CAP.min }: RideOptions): Ride | null {
  if (ride.stage === "toDoor") {
    if (!atDoor) return { ...ride, t: ride.t + frameDt };
    return { ...ride, stage: reduced ? "moving" : "boarding", t: 0 };
  }
  const t = ride.t + Math.min(frameDt, cap);
  if (t < stageDuration(ride, reduced)) return { ...ride, t };
  const next = reduced && ride.stage === "moving" ? null : NEXT[ride.stage];
  return next ? { ...ride, stage: next, t: 0 } : null;
}
```

(Keep `/** Fixed stage lengths ... */` only once: the block above includes it.)

- [x] **Step 5: Run the unit tests**

Run: `bunx vitest run tests/unit/elevator.test.ts`
Expected: PASS (stall test, ride clock tests and the existing tests, including "runs every stage in order and then finishes" at 1/60 s frames: elapsed between 2 and 2.4 s).

- [x] **Step 6: Wire the typical frame and the cap into the Director**

In `src/experience/scene/Director.tsx`:

Line 26, replace the elevator import with:

```ts
import { advanceRide, carY, rideCap, rideDirection, stageProgress, trackFrameDt, TYPICAL_FRAME_DT } from "../tower/elevator";
```

In the `useRef({ ... })` state object, after `now: 0,` add:

```ts
    /** Moving average of recent frame times: sets how much ride time one frame may add (`rideCap`). */
    typicalDt: TYPICAL_FRAME_DT,
```

Replace

```ts
    const dt = Math.min(rawDt, MAX_FRAME_DT);
    const local = state.current;
```

with

```ts
    const dt = Math.min(rawDt, MAX_FRAME_DT);
    const local = state.current;
    local.typicalDt = trackFrameDt(local.typicalDt, rawDt);
```

Replace

```ts
        const next = advanceRide(ride, dt, { atDoor, reduced: s.reducedMotion });
```

with

```ts
        const next = advanceRide(ride, dt, { atDoor, reduced: s.reducedMotion, cap: rideCap(local.typicalDt) });
```

- [x] **Step 7: Cap the camera spring during rides**

In `src/experience/camera/CameraDirector.tsx`, add `import { RIDE_CAP } from "../tower/elevator";` after the `MAX_FRAME_DT` import, and replace

```ts
    const dt = Math.min(rawDt, MAX_FRAME_DT);
    const l = local.current;
    l.now += dt;
    const s = getHQStore().getState();
```

with

```ts
    const s = getHQStore().getState();
    // During a ride the camera eases with the car's per-frame cap, so a long frame pauses both instead
    // of the camera catching up in one jump (R5 P6).
    const dt = Math.min(rawDt, s.ride && s.ride.stage !== "toDoor" ? RIDE_CAP.max : MAX_FRAME_DT);
    const l = local.current;
    l.now += dt;
```

- [x] **Step 8: Typecheck, lint, build and run the ride spec**

```bash
bun run verify:quick
E2E_PORT=4435 bunx playwright test e2e/ride.spec.ts --reporter=list
```
Expected: `verify:quick` passes; both ride tests PASS. The printed line shows `distinctY` >= 16 and `maxStep` well under 7. Note the numbers in the measurements file under "After Task 2".

- [x] **Step 9: Run the affected e2e and commit**

Run: `E2E_PORT=4435 bun run e2e:changed`
Expected: `experience`, `career` and `ride` specs pass.

```bash
rtk git add src/experience/tower/elevator.ts src/experience/scene/Director.tsx src/experience/camera/CameraDirector.tsx tests/unit/elevator.test.ts docs/superpowers/plans/2026-10-13-r5-p6-measurements.md
rtk git commit -m "fix: cap ride time per frame so a long frame pauses the elevator instead of skipping the dolly"
```

Rollback: revert this commit; the ride returns to 0.25 s frame steps (owner's skip comes back).

### Task 3: Destination gate, preparation state and ride stats (pure modules)

The car waits at closed doors until the destination floor is built, compiled and typeset (REPORT F5.6, F5.7), at most `PREPARE_TIMEOUT`. Everything here is pure and unit tested; Task 4 feeds the state, Task 5 wires it in.

**Files:**
- Modify: `src/experience/tower/elevator.ts` (`Ride.held`, `PREPARE_TIMEOUT`, `RideOptions.ready`, `advanceRide`)
- Create: `src/experience/tower/ridePrep.ts`
- Create: `src/experience/tower/rideStats.ts`
- Modify: `src/experience/tower/near.ts` (add `floorContentVisible`)
- Test: `tests/unit/elevator.test.ts`, `tests/unit/ride-prep.test.ts`, `tests/unit/ride-stats.test.ts`, `tests/unit/floor-visibility.test.ts`

**Interfaces:**
- Consumes: Task 2's `advanceRide`, `RideOptions`, `RIDE_CAP`.
- Produces:
  - `elevator.ts`: `PREPARE_TIMEOUT = 1.5`; `Ride.held?: number`; `RideOptions.ready?: boolean` (default `true`).
  - `ridePrep.ts`: `ridePrep: { floors: Map<FloorId, { state: "compiling" | "ready"; token: number }>; texts: Map<FloorId, number>; lastRide: RideSummary | null }`, `beginFloorPrep(floor): number`, `finishFloorPrep(floor, token): void`, `endFloorPrep(floor, token): void`, `floorReady(floor): boolean`, `textStarted(floor): void`, `textDone(floor): void`, `destinationReady(to): boolean`, `resetRidePrep(): void`.
  - `rideStats.ts`: `interface RideSummary { from; to; frames; dollyFrames; distinctY; maxStep; longestFrameMs; held; timedOut; programs; elapsedMs }`, `interface RideStats`, `startRideStats(from, to, span): RideStats`, `stepRideStats(stats, sample: { stage: RideStage; y: number; frameDt: number; held: number; programs: number }): void`, `finishRideStats(stats, programs): RideSummary`, `formatRideSummary(summary): string`.
  - `near.ts`: `floorContentVisible(o: { floorY: number; roverY: number; exterior: boolean; ride: { stage: RideStage } | null; ready: boolean }): boolean`.

- [x] **Step 1: Write the failing gate tests**

Add `PREPARE_TIMEOUT, STAGE_TIME,` to the imports of `tests/unit/elevator.test.ts` and append:

```ts
describe("destination gate", () => {
  const closing = ride({ stage: "closing", t: STAGE_TIME.closing - 0.01 });
  const opts = (ready: boolean) => ({ atDoor: true, reduced: false, ready });

  it("holds the car at closed doors until the destination is ready", () => {
    let r = advanceRide(closing, 0.02, opts(false))!;
    expect(r).toMatchObject({ stage: "closing", t: STAGE_TIME.closing });
    expect(r.held).toBeCloseTo(0.02);
    expect(doorsOpen(r, "L1", false)).toBe(0);
    expect(carY(r, false)).toBe(0);
    r = advanceRide(r, 0.02, opts(false))!;
    expect(r.held).toBeCloseTo(0.04);
    r = advanceRide(r, 0.02, opts(true))!;
    expect(r).toMatchObject({ stage: "moving", t: 0 });
    expect(r.held).toBeCloseTo(0.04);
  });

  it("gives up after PREPARE_TIMEOUT of real frame time", () => {
    let r: Ride | null = closing;
    let frames = 0;
    while (r?.stage === "closing" && frames < 100) {
      r = advanceRide(r, 0.25, opts(false));
      frames += 1;
    }
    expect(r?.stage).toBe("moving");
    expect(r?.held).toBeGreaterThanOrEqual(PREPARE_TIMEOUT - 1e-9);
    // 0.25 s frames: six frames of waiting, then the car moves (the wait is not capped like ride time).
    expect(frames).toBeLessThanOrEqual(8);
  });

  it("holds reduced motion at the door, before the cut", () => {
    let r = advanceRide(ride(), 0.02, { atDoor: true, reduced: true, ready: false })!;
    expect(r.stage).toBe("toDoor");
    expect(r.held).toBeCloseTo(0.02);
    r = advanceRide(r, 0.02, { atDoor: true, reduced: true, ready: true })!;
    expect(r.stage).toBe("moving");
  });

  it("never holds when the destination is ready (the default)", () => {
    expect(advanceRide(closing, 0.02, { atDoor: true, reduced: false })).toMatchObject({ stage: "moving", t: 0, held: 0 });
  });
});
```

Run: `bunx vitest run tests/unit/elevator.test.ts -t "destination gate"`
Expected: FAIL (`PREPARE_TIMEOUT` is undefined and the first test sees `stage: "moving"`).

- [x] **Step 2: Implement the gate in `src/experience/tower/elevator.ts`**

Replace the `Ride` interface (lines 6 to 12) with:

```ts
export interface Ride {
  from: FloorId;
  to: FloorId;
  stage: RideStage;
  /** Ride time spent in the current stage, in seconds (at most RIDE_CAP per frame). */
  t: number;
  /** Seconds the car waited at closed doors for the destination floor (see PREPARE_TIMEOUT). */
  held?: number;
}
```

After `TYPICAL_FRAME_DT` add:

```ts
/** Longest wait at closed doors for the destination floor to be built, compiled and typeset (R5 P6). */
export const PREPARE_TIMEOUT = 1.5;
```

Replace `RideOptions` and `advanceRide` with:

```ts
export interface RideOptions {
  /** The rover reached the shaft door (`toDoor` only). */
  atDoor: boolean;
  reduced: boolean;
  /** The destination floor is ready (`destinationReady` in ridePrep.ts); the car waits at closed doors until then. */
  ready?: boolean;
  /** Most ride time this frame may add (`rideCap`); defaults to RIDE_CAP.min. */
  cap?: number;
}

/**
 * Enters `moving` once the destination is ready or the wait hit PREPARE_TIMEOUT; until then returns
 * `waiting` (doors closed) with the wait grown by the frame time, not the capped ride time.
 */
function enterMoving(ride: Ride, frameDt: number, ready: boolean, waiting: Ride): Ride {
  const held = ride.held ?? 0;
  if (ready || held >= PREPARE_TIMEOUT) return { ...ride, stage: "moving", t: 0, held };
  return { ...waiting, held: held + frameDt };
}

/**
 * Advances the ride by one frame of `frameDt` seconds. Returns null when the rover has left the car on
 * the new floor. `toDoor` runs on the frame time (the rover drives in real time); every other stage
 * adds at most `cap`. The car only starts moving once `ready` (or after PREPARE_TIMEOUT): at the end of
 * `closing`, or at the door under reduced motion.
 */
export function advanceRide(ride: Ride, frameDt: number, { atDoor, reduced, ready = true, cap = RIDE_CAP.min }: RideOptions): Ride | null {
  if (ride.stage === "toDoor") {
    if (!atDoor) return { ...ride, t: ride.t + frameDt };
    return reduced ? enterMoving(ride, frameDt, ready, ride) : { ...ride, stage: "boarding", t: 0 };
  }
  const duration = stageDuration(ride, reduced);
  const t = ride.t + Math.min(frameDt, cap);
  if (t < duration) return { ...ride, t };
  const next = reduced && ride.stage === "moving" ? null : NEXT[ride.stage];
  if (next === "moving") return enterMoving(ride, frameDt, ready, { ...ride, t: duration });
  return next ? { ...ride, stage: next, t: 0 } : null;
}
```

Run: `bunx vitest run tests/unit/elevator.test.ts`
Expected: PASS (all describes).

- [x] **Step 3: Write `tests/unit/ride-prep.test.ts`**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  beginFloorPrep,
  destinationReady,
  endFloorPrep,
  finishFloorPrep,
  floorReady,
  resetRidePrep,
  ridePrep,
  textDone,
  textStarted,
} from "@/experience/tower/ridePrep";

beforeEach(resetRidePrep);

describe("ride preparation", () => {
  it("marks a floor ready once its programs compiled, never before it mounts", () => {
    expect(floorReady("L3")).toBe(false);
    const token = beginFloorPrep("L3");
    expect(floorReady("L3")).toBe(false);
    finishFloorPrep("L3", token);
    expect(floorReady("L3")).toBe(true);
    endFloorPrep("L3", token);
    expect(floorReady("L3")).toBe(false);
  });

  it("ignores a compile that finishes after its mount was replaced", () => {
    const first = beginFloorPrep("L3");
    endFloorPrep("L3", first);
    const second = beginFloorPrep("L3");
    finishFloorPrep("L3", first);
    expect(floorReady("L3")).toBe(false);
    endFloorPrep("L3", first);
    expect(ridePrep.floors.has("L3")).toBe(true);
    finishFloorPrep("L3", second);
    expect(floorReady("L3")).toBe(true);
  });

  it("waits for every compiling floor and for the destination's texts", () => {
    finishFloorPrep("L3", beginFloorPrep("L3"));
    const l4 = beginFloorPrep("L4");
    expect(destinationReady("L3")).toBe(false);
    finishFloorPrep("L4", l4);
    expect(destinationReady("L3")).toBe(true);
    textStarted("L3");
    textStarted("L4");
    expect(destinationReady("L3")).toBe(false);
    textDone("L3");
    expect(destinationReady("L3")).toBe(true);
  });

  it("never counts texts below zero", () => {
    textDone("L2");
    expect(ridePrep.texts.get("L2")).toBe(0);
  });
});
```

Run: `bunx vitest run tests/unit/ride-prep.test.ts`
Expected: FAIL with `Failed to resolve import "@/experience/tower/ridePrep"`.

- [x] **Step 4: Create `src/experience/tower/ridePrep.ts`**

```ts
import type { FloorId } from "@/content/schema";
import type { RideSummary } from "./rideStats";

/**
 * Elevator ride preparation (R5 P6): which mounted floors have their shader programs compiled
 * (`FloorPrep` in Tower.tsx) and how many troika texts each still typesets (`textSync.ts`).
 * `advanceRide` holds the car at closed doors until `destinationReady(to)`. Plain module state mutated
 * outside React, like `roverRuntime`; exposed to Playwright as `window.__hq.ridePrep`.
 */
interface FloorPrepState {
  state: "compiling" | "ready";
  /** The mount that started this compile; a late finish from an earlier mount is ignored. */
  token: number;
}

export const ridePrep = {
  floors: new Map<FloorId, FloorPrepState>(),
  texts: new Map<FloorId, number>(),
  /** The last finished ride, measured by the Director (`rideStats.ts`). */
  lastRide: null as RideSummary | null,
};

let tokens = 0;

/** A floor's content committed: its programs start compiling. Returns this mount's token. */
export function beginFloorPrep(floor: FloorId): number {
  tokens += 1;
  ridePrep.floors.set(floor, { state: "compiling", token: tokens });
  return tokens;
}

export function finishFloorPrep(floor: FloorId, token: number): void {
  const prep = ridePrep.floors.get(floor);
  if (prep?.token === token) prep.state = "ready";
}

/** The floor's content unmounted. */
export function endFloorPrep(floor: FloorId, token: number): void {
  if (ridePrep.floors.get(floor)?.token !== token) return;
  ridePrep.floors.delete(floor);
  ridePrep.texts.delete(floor);
}

export function floorReady(floor: FloorId): boolean {
  return ridePrep.floors.get(floor)?.state === "ready";
}

export function textStarted(floor: FloorId): void {
  ridePrep.texts.set(floor, (ridePrep.texts.get(floor) ?? 0) + 1);
}

export function textDone(floor: FloorId): void {
  ridePrep.texts.set(floor, Math.max(0, (ridePrep.texts.get(floor) ?? 0) - 1));
}

/** The destination is built and typeset, and no mounted floor is still compiling (the car may move). */
export function destinationReady(to: FloorId): boolean {
  if (!floorReady(to) || (ridePrep.texts.get(to) ?? 0) > 0) return false;
  for (const prep of ridePrep.floors.values()) if (prep.state === "compiling") return false;
  return true;
}

/** Tests only. */
export function resetRidePrep(): void {
  ridePrep.floors.clear();
  ridePrep.texts.clear();
  ridePrep.lastRide = null;
}
```

- [x] **Step 5: Write `tests/unit/ride-stats.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { PREPARE_TIMEOUT } from "@/experience/tower/elevator";
import { finishRideStats, formatRideSummary, startRideStats, stepRideStats } from "@/experience/tower/rideStats";

function sampleRide(held: number) {
  const stats = startRideStats("L1", "L3", 28);
  stepRideStats(stats, { stage: "boarding", y: 0, frameDt: 0.016, held: 0, programs: 40 });
  stepRideStats(stats, { stage: "closing", y: 0, frameDt: 0.3, held, programs: 52 });
  [0, 1, 4, 10, 18, 24, 27].forEach((y, i) => stepRideStats(stats, { stage: "moving", y, frameDt: 0.016, held, programs: i >= 3 ? 53 : 52 }));
  stepRideStats(stats, { stage: "opening", y: 28, frameDt: 0.016, held, programs: 53 });
  return finishRideStats(stats, 53);
}

describe("ride stats", () => {
  it("counts dolly frames, car heights, the biggest jump and the shaders linked while moving", () => {
    const s = sampleRide(0.3);
    expect(s).toMatchObject({ from: "L1", to: "L3", frames: 10, dollyFrames: 7, distinctY: 7, timedOut: false, programs: 1 });
    expect(s.held).toBeCloseTo(0.3);
    expect(s.maxStep).toBeCloseTo(8 / 28);
    expect(s.longestFrameMs).toBeCloseTo(300);
    expect(s.elapsedMs).toBeCloseTo(9 * 16 + 300);
  });

  it("flags a wait that hit the timeout", () => {
    expect(sampleRide(PREPARE_TIMEOUT).timedOut).toBe(true);
  });

  it("prints one console line", () => {
    expect(formatRideSummary(sampleRide(0.3))).toBe(
      "[hq ride] L1 to L3: 7 dolly frames, 7 car heights, biggest jump 29% of the trip, longest frame 300 ms, waited 0.30 s, 1 shaders compiled while moving, 0.44 s in total",
    );
  });
});
```

Run: `bunx vitest run tests/unit/ride-stats.test.ts`
Expected: FAIL with `Failed to resolve import "@/experience/tower/rideStats"`.

- [x] **Step 6: Create `src/experience/tower/rideStats.ts`**

```ts
import type { FloorId } from "@/content/schema";
import { PREPARE_TIMEOUT, type RideStage } from "./elevator";

/** One finished ride, as measured on the visitor's device (`window.__hq.ridePrep.lastRide`, `?perf=1`). */
export interface RideSummary {
  from: FloorId;
  to: FloorId;
  /** Frames from boarding (or the reduced-motion cut) to the arrival. */
  frames: number;
  /** Frames while the car moved, and how many different car heights they showed. */
  dollyFrames: number;
  distinctY: number;
  /** Largest car jump between two moving frames, as a share of the trip height (0 to 1). */
  maxStep: number;
  longestFrameMs: number;
  /** Seconds the car waited at closed doors for the destination, and whether it gave up. */
  held: number;
  timedOut: boolean;
  /** Shader programs linked between the start of the dolly and the arrival (0 when precompile worked). */
  programs: number;
  /** Wall time from boarding to the arrival. */
  elapsedMs: number;
}

export interface RideStats {
  summary: RideSummary;
  seen: Set<string>;
  lastY: number | null;
  programsAtMove: number | null;
  /** Trip height in world units. */
  span: number;
}

export function startRideStats(from: FloorId, to: FloorId, span: number): RideStats {
  return {
    summary: { from, to, frames: 0, dollyFrames: 0, distinctY: 0, maxStep: 0, longestFrameMs: 0, held: 0, timedOut: false, programs: 0, elapsedMs: 0 },
    seen: new Set(),
    lastY: null,
    programsAtMove: null,
    span,
  };
}

/** Records one frame of a ride past `toDoor`: its stage, the car height drawn and the raw frame time. */
export function stepRideStats(stats: RideStats, sample: { stage: RideStage; y: number; frameDt: number; held: number; programs: number }): void {
  const s = stats.summary;
  s.frames += 1;
  s.elapsedMs += sample.frameDt * 1000;
  s.longestFrameMs = Math.max(s.longestFrameMs, sample.frameDt * 1000);
  s.held = Math.max(s.held, sample.held);
  if (sample.stage !== "moving") return;
  stats.programsAtMove ??= sample.programs;
  s.dollyFrames += 1;
  stats.seen.add(sample.y.toFixed(3));
  s.distinctY = stats.seen.size;
  if (stats.lastY !== null && stats.span > 0) s.maxStep = Math.max(s.maxStep, Math.abs(sample.y - stats.lastY) / stats.span);
  stats.lastY = sample.y;
}

export function finishRideStats(stats: RideStats, programs: number): RideSummary {
  const s = stats.summary;
  return {
    ...s,
    timedOut: s.held >= PREPARE_TIMEOUT,
    programs: stats.programsAtMove === null ? 0 : Math.max(0, programs - stats.programsAtMove),
  };
}

export function formatRideSummary(s: RideSummary): string {
  const waited = `waited ${s.held.toFixed(2)} s${s.timedOut ? " (gave up)" : ""}`;
  return `[hq ride] ${s.from} to ${s.to}: ${s.dollyFrames} dolly frames, ${s.distinctY} car heights, biggest jump ${Math.round(s.maxStep * 100)}% of the trip, longest frame ${Math.round(s.longestFrameMs)} ms, ${waited}, ${s.programs} shaders compiled while moving, ${(s.elapsedMs / 1000).toFixed(2)} s in total`;
}
```

Run: `bunx vitest run tests/unit/ride-stats.test.ts tests/unit/ride-prep.test.ts`
Expected: PASS.

- [x] **Step 7: Write `tests/unit/floor-visibility.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { floorContentVisible } from "@/experience/tower/near";

const at = (over: Partial<Parameters<typeof floorContentVisible>[0]>) =>
  floorContentVisible({ floorY: 14, roverY: 14, exterior: false, ride: null, ready: true, ...over });

describe("floor content visibility", () => {
  it("draws the rover's floor and hides ghost floors above it", () => {
    expect(at({})).toBe(true);
    expect(at({ floorY: 28 })).toBe(false);
  });

  it("hides content under the slab while exploring and shows it during a ride", () => {
    expect(at({ floorY: 0 })).toBe(false);
    expect(at({ floorY: 0, ride: { stage: "boarding" } })).toBe(true);
    expect(at({ floorY: 0, ride: { stage: "moving" } })).toBe(true);
  });

  it("keeps a floor below that is still compiling hidden until the car moves", () => {
    for (const stage of ["toDoor", "boarding", "closing"] as const) expect(at({ floorY: 0, ready: false, ride: { stage } })).toBe(false);
    for (const stage of ["moving", "opening", "exiting"] as const) expect(at({ floorY: 0, ready: false, ride: { stage } })).toBe(true);
  });

  it("draws everything in the exterior boot and intro", () => {
    expect(at({ floorY: 28, exterior: true })).toBe(true);
    expect(at({ floorY: 0, exterior: true, ready: false })).toBe(true);
  });
});
```

Run: `bunx vitest run tests/unit/floor-visibility.test.ts`
Expected: FAIL with `floorContentVisible is not a function` (or not exported).

- [x] **Step 8: Add `floorContentVisible` to `src/experience/tower/near.ts`**

Add after the existing imports:

```ts
import type { RideStage } from "./elevator";

const BEFORE_MOVING: ReadonlySet<RideStage> = new Set(["toDoor", "boarding", "closing"]);

/**
 * Whether a floor's content draws this frame. Floors above the rover are ghosts; content under the
 * current slab is hidden by it, so it only draws while a ride runs. A floor below whose shader programs
 * are still compiling stays hidden until the car moves (R5 P6): drawing it would force a blocking
 * compile while the doors close, and explore hides it the same way, so nothing new shows.
 */
export function floorContentVisible({
  floorY,
  roverY,
  exterior,
  ride,
  ready,
}: {
  floorY: number;
  roverY: number;
  exterior: boolean;
  ride: { stage: RideStage } | null;
  ready: boolean;
}): boolean {
  if (exterior) return true;
  if (floorY > roverY + 0.5) return false;
  if (floorY >= roverY - 0.5) return true;
  if (!ride) return false;
  return ready || !BEFORE_MOVING.has(ride.stage);
}
```

Run: `bunx vitest run tests/unit/floor-visibility.test.ts tests/unit/elevator.test.ts tests/unit/ride-prep.test.ts tests/unit/ride-stats.test.ts`
Expected: PASS.

- [x] **Step 9: Commit**

```bash
bun run typecheck && bun run lint
rtk git add src/experience/tower/elevator.ts src/experience/tower/ridePrep.ts src/experience/tower/rideStats.ts src/experience/tower/near.ts tests/unit/elevator.test.ts tests/unit/ride-prep.test.ts tests/unit/ride-stats.test.ts tests/unit/floor-visibility.test.ts
rtk git commit -m "feat: hold the elevator at closed doors until the destination floor is ready, with ride stats"
```

Note: nothing calls `destinationReady` yet, so `ready` stays at its default `true` and rides behave as after Task 2.

### Task 4: Precompile each floor on mount and count troika typesetting per floor

Feeds `ridePrep` from the scene (REPORT SP9, F5.6, F5.7). No pixel change: compiling and counting draw nothing.

**Files:**
- Create: `src/experience/scene/precompile.ts` (or extend P2's, see the rebase note)
- Create: `src/experience/tower/textSync.ts`
- Modify: `src/experience/text-config.ts:1,12`
- Modify: `src/experience/tower/Tower.tsx:1-17,78-91`
- Test: `tests/unit/precompile.test.ts`, `tests/unit/text-sync.test.ts`

**Interfaces:**
- Consumes: `beginFloorPrep`, `finishFloorPrep`, `endFloorPrep`, `textStarted`, `textDone` (Task 3); troika `Text`, `BatchedText` (`src/types/troika-three-text.d.ts`: `sync(callback?: () => void): void`, `addText(text: Text): void`).
- Produces:
  - `precompile.ts`: `trackSceneTarget(scene: Scene): void`, `sceneTargetKnown(): boolean`, `precompileScene(gl: WebGLRenderer, scene: Scene, camera: Camera, root?: Object3D): Promise<void>`, `resetSceneTarget(): void` (tests).
  - `textSync.ts`: `floorOfObject(object: Object3D | null): FloorId | null`, `trackTextSync(textProto: SyncProto, batchProto?: BatchProto): void`, types `SyncProto`, `BatchProto`.
  - `Tower.tsx`: `FloorPrep` (local component) inside every near floor's Suspense boundary.

- [x] **Step 1: Write `tests/unit/precompile.test.ts`**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { Group, PerspectiveCamera, Scene, WebGLRenderTarget, type WebGLRenderer } from "three";
import { precompileScene, resetSceneTarget, sceneTargetKnown, trackSceneTarget } from "@/experience/scene/precompile";

function fakeRenderer() {
  const log: string[] = [];
  let target: WebGLRenderTarget | null = null;
  const gl = {
    getRenderTarget: () => target,
    setRenderTarget: (t: WebGLRenderTarget | null) => {
      target = t;
    },
    compileAsync: (root: Group, _camera: unknown, scene: Scene) => {
      log.push(`root=${root.name} scene=${scene.name} target=${target ? target.texture.name : "screen"}`);
      return Promise.resolve(root);
    },
  };
  return { gl: gl as unknown as WebGLRenderer, log, bound: () => target };
}

function world() {
  const scene = new Scene();
  scene.name = "world";
  const floor = new Group();
  floor.name = "floor-L3";
  scene.add(floor);
  return { scene, floor, camera: new PerspectiveCamera() };
}

/** What WebGLRenderer.render does for a Scene: `scene.onBeforeRender(renderer, scene, camera, renderTarget)`. */
const renderInto = (scene: Scene, gl: WebGLRenderer, camera: PerspectiveCamera, target: WebGLRenderTarget | null) =>
  scene.onBeforeRender(gl, scene, camera, target as never, undefined as never, undefined as never);

beforeEach(resetSceneTarget);

describe("precompileScene", () => {
  it("compiles a floor against the whole scene, into the target the scene pass renders to (full tier composer)", async () => {
    const { scene, floor, camera } = world();
    const { gl, log, bound } = fakeRenderer();
    trackSceneTarget(scene);
    expect(sceneTargetKnown()).toBe(false);
    const composer = new WebGLRenderTarget(4, 4);
    composer.texture.name = "composer";
    renderInto(scene, gl, camera, composer);
    expect(sceneTargetKnown()).toBe(true);
    await precompileScene(gl, scene, camera, floor);
    expect(log).toEqual(["root=floor-L3 scene=world target=composer"]);
    expect(bound()).toBeNull();
  });

  it("compiles for the screen on the lite tier and keeps an existing scene hook", async () => {
    const { scene, camera } = world();
    const { gl, log } = fakeRenderer();
    let calls = 0;
    scene.onBeforeRender = () => {
      calls += 1;
    };
    trackSceneTarget(scene);
    trackSceneTarget(scene);
    renderInto(scene, gl, camera, null);
    expect(calls).toBe(1);
    await precompileScene(gl, scene, camera);
    expect(log).toEqual(["root=world scene=world target=screen"]);
  });
});
```

Run: `bunx vitest run tests/unit/precompile.test.ts`
Expected: FAIL with `Failed to resolve import "@/experience/scene/precompile"`.

- [x] **Step 2: Create `src/experience/scene/precompile.ts`**

```ts
import type { Camera, Object3D, Scene, WebGLRenderer, WebGLRenderTarget } from "three";

/**
 * Shader precompile (REPORT SP9, F5.6). three keys programs on the render target they draw into
 * (tone mapping and output color space), and the full tier draws the scene into the composer's input
 * buffer, so a compile must bind the same target or it builds programs nobody uses. The scene hook
 * below records that target on every real render (null on the lite tier: the screen).
 */
let sceneTarget: WebGLRenderTarget | null = null;
let known = false;
const tracked = new WeakSet<Scene>();

export function trackSceneTarget(scene: Scene): void {
  if (tracked.has(scene)) return;
  tracked.add(scene);
  const previous = scene.onBeforeRender;
  scene.onBeforeRender = function (this: Scene, ...args: Parameters<Scene["onBeforeRender"]>) {
    // For a Scene, WebGLRenderer.render passes the bound render target as the fourth argument.
    sceneTarget = (args[3] as unknown as WebGLRenderTarget | null) ?? null;
    known = true;
    previous.apply(this, args);
  };
}

/** False until the scene has rendered once (before that a compile could pick the wrong target). */
export function sceneTargetKnown(): boolean {
  return known;
}

/**
 * Compiles every material under `root` (visible or not: three's compile traverses all objects) with
 * the lights and fog of `scene`, without drawing. Resolves when the programs are linked
 * (`KHR_parallel_shader_compile` where available, so the main thread keeps rendering meanwhile).
 */
export async function precompileScene(gl: WebGLRenderer, scene: Scene, camera: Camera, root: Object3D = scene): Promise<void> {
  const previous = gl.getRenderTarget();
  gl.setRenderTarget(sceneTarget);
  let pending: Promise<unknown>;
  try {
    pending = gl.compileAsync(root, camera, scene);
  } finally {
    gl.setRenderTarget(previous);
  }
  await pending;
}

/** Tests only. */
export function resetSceneTarget(): void {
  sceneTarget = null;
  known = false;
}
```

Run: `bunx vitest run tests/unit/precompile.test.ts`
Expected: PASS.

- [x] **Step 3: Write `tests/unit/text-sync.test.ts`**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { Group, Object3D } from "three";
import { floorOfObject, trackTextSync } from "@/experience/tower/textSync";
import { resetRidePrep, ridePrep } from "@/experience/tower/ridePrep";

/** Mimics troika's sync contract: one typeset at a time, `_needsSync` cleared on start. */
class FakeText extends Object3D {
  _needsSync = true;
  _isSyncing = false;
  private pending: (() => void)[] = [];
  sync(callback?: () => void) {
    if (!this._needsSync) return;
    this._needsSync = false;
    this._isSyncing = true;
    this.pending.push(() => {
      this._isSyncing = false;
      callback?.();
    });
  }
  finish() {
    this.pending.shift()?.();
  }
}

/** troika keeps BatchedText members out of the scene graph. */
class FakeBatch extends FakeText {
  addText(text: Object3D) {
    void text;
  }
}

trackTextSync(FakeText.prototype, FakeBatch.prototype);
trackTextSync(FakeText.prototype, FakeBatch.prototype);

function floorGroup(id: string) {
  const g = new Group();
  g.name = `floor-${id}`;
  const content = new Group();
  g.add(content);
  return { g, content };
}

beforeEach(resetRidePrep);

describe("troika sync tracking", () => {
  it("counts a typeset on the text's floor until it completes", () => {
    const { content } = floorGroup("L3");
    const text = new FakeText();
    content.add(text);
    text.sync();
    expect(ridePrep.texts.get("L3")).toBe(1);
    text.sync();
    expect(ridePrep.texts.get("L3")).toBe(1);
    text.finish();
    expect(ridePrep.texts.get("L3")).toBe(0);
  });

  it("ignores texts outside a floor (the shaft indicators) and texts with nothing to typeset", () => {
    const loose = new FakeText();
    loose.sync();
    expect(ridePrep.texts.size).toBe(0);
    const { content } = floorGroup("L1");
    const done = new FakeText();
    done._needsSync = false;
    content.add(done);
    done.sync();
    expect(ridePrep.texts.size).toBe(0);
  });

  it("attributes BatchedText members to the batch's floor", () => {
    const { content } = floorGroup("L2");
    const batch = new FakeBatch();
    batch._needsSync = false;
    content.add(batch);
    const member = new FakeText();
    batch.addText(member);
    expect(floorOfObject(member)).toBe("L2");
    member.sync();
    expect(ridePrep.texts.get("L2")).toBe(1);
    member.finish();
    expect(ridePrep.texts.get("L2")).toBe(0);
  });
});
```

Run: `bunx vitest run tests/unit/text-sync.test.ts`
Expected: FAIL with `Failed to resolve import "@/experience/tower/textSync"`.

- [x] **Step 4: Create `src/experience/tower/textSync.ts`**

```ts
import type { Object3D } from "three";
import type { FloorId } from "@/content/schema";
import { textDone, textStarted } from "./ridePrep";

/**
 * Counts troika typesetting per floor (R5 P6, REPORT F5.7): typesetting runs on the main thread (the
 * CSP blocks troika's worker, text-config.ts), so the elevator waits for the destination's texts with
 * the doors closed instead of typesetting them during the dolly. Floors are the `floor-<id>` groups of
 * `FloorLevel`; BatchedText members are not in the scene graph, so `addText` tags them with their batch.
 */
const FLOOR_GROUP = /^floor-(L1|L2|L3|L4|RF)$/;
const BATCH = Symbol.for("hq.textSync.batch");
const WRAPPED = Symbol.for("hq.textSync.wrapped");

type Tagged = Object3D & { [BATCH]?: Object3D };
type Syncing = Object3D & { _needsSync?: boolean; _isSyncing?: boolean };
export type SyncProto = { sync(callback?: () => void): void };
export type BatchProto = { addText(text: Object3D): void };

export function floorOfObject(object: Object3D | null): FloorId | null {
  for (let o: Object3D | null = object; o; o = o.parent ?? (o as Tagged)[BATCH] ?? null) {
    const match = FLOOR_GROUP.exec(o.name);
    if (match) return match[1] as FloorId;
  }
  return null;
}

export function trackTextSync(textProto: SyncProto, batchProto?: BatchProto): void {
  const marked = textProto as SyncProto & { [WRAPPED]?: true };
  if (marked[WRAPPED]) return;
  marked[WRAPPED] = true;
  const sync = textProto.sync;
  textProto.sync = function (this: Syncing, callback?: () => void) {
    const floor = this._needsSync && !this._isSyncing ? floorOfObject(this) : null;
    if (!floor) return sync.call(this, callback);
    textStarted(floor);
    let done = false;
    return sync.call(this, () => {
      if (!done) {
        done = true;
        textDone(floor);
      }
      callback?.();
    });
  };
  if (!batchProto) return;
  const addText = batchProto.addText;
  batchProto.addText = function (this: Object3D, text: Object3D) {
    (text as Tagged)[BATCH] = this;
    return addText.call(this, text);
  };
}
```

Run: `bunx vitest run tests/unit/text-sync.test.ts`
Expected: PASS.

- [x] **Step 5: Install the tracker in `src/experience/text-config.ts`**

Replace line 1 with:

```ts
import { BatchedText, configureTextBuilder, GlyphsGeometry, Text } from "troika-three-text";
import { trackTextSync } from "./tower/textSync";
```

After the `configureTextBuilder(...)` line (line 12) add:

```ts

/** Count typesetting per floor so the elevator waits for it with the doors closed (tower/textSync.ts, R5 P6). */
trackTextSync(Text.prototype, BatchedText.prototype);
```

- [x] **Step 6: Add the `FloorPrep` marker to `src/experience/tower/Tower.tsx`**

Replace the React import on line 3 with:

```ts
import { useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useState } from "react";
```

After `import { BoxEdges } from "./primitives";` add:

```ts
import { precompileScene, sceneTargetKnown, trackSceneTarget } from "../scene/precompile";
import { beginFloorPrep, endFloorPrep, finishFloorPrep } from "./ridePrep";
```

Before `/** Outline around the shaft ...` add:

```tsx
/**
 * Precompiles a floor's shader programs as soon as its content commits (it sits inside the floor's
 * Suspense boundary, after the floor), so the elevator can wait for them with the doors closed instead
 * of compiling mid-dolly (R5 P6). Before the first frame the scene pass's target is unknown and the
 * first render compiles anyway, so the floor counts as ready at once.
 */
function FloorPrep({ floor }: { floor: FloorId }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    trackSceneTarget(scene);
    const token = beginFloorPrep(floor);
    const root = scene.getObjectByName(`floor-${floor}`);
    if (!root || !sceneTargetKnown()) finishFloorPrep(floor, token);
    else
      void precompileScene(gl, scene, camera, root)
        .catch(() => undefined)
        .finally(() => finishFloorPrep(floor, token));
    return () => endFloorPrep(floor, token);
  }, [floor, gl, scene, camera]);
  return null;
}
```

In the JSX, change the Suspense body so the marker follows the floor:

```tsx
              <Suspense fallback={null}>
                {id === "L1" ? (
                  <Lobby data={data} labels={labels.lobby} tier={tier} />
                ) : id === "L3" ? (
                  <Labs data={data} labels={labels.labs} tier={tier} />
                ) : id === "L2" ? (
                  <CareerArchive career={data.career} labs={layouts.L3.bounds} labels={labels.career} />
                ) : id === "L4" ? (
                  <Library data={data} labels={labels.library} tier={tier} />
                ) : (
                  <Roof data={data} labels={labels.roof} tier={tier} />
                )}
                <FloorPrep floor={id} />
              </Suspense>
```

- [x] **Step 7: Verify and commit**

```bash
bun run verify:quick
E2E_PORT=4435 bun run e2e:changed
```
Expected: all pass (`experience`, `ride`). Rendering is unchanged; `ridePrep.floors` now fills (checked in Task 5).

```bash
rtk git add src/experience/scene/precompile.ts src/experience/tower/textSync.ts src/experience/text-config.ts src/experience/tower/Tower.tsx tests/unit/precompile.test.ts tests/unit/text-sync.test.ts
rtk git commit -m "feat: precompile each floor on mount and count troika typesetting per floor"
```

Rollback: revert this commit together with Task 5 (Task 5's gate reads this state; without it every first ride would wait the full `PREPARE_TIMEOUT`).

### Task 5: Wire the gate, hide compiling floors below the car, measure every ride

Connects Tasks 3 and 4 in the Director and `FloorLevel`, exposes the measurements, extends the ride spec, runs the look gate and updates the docs for the ride (spec gaps 19 and 26).

**Files:**
- Modify: `src/experience/scene/Director.tsx` (imports, state, frame start, ride block, arrival)
- Modify: `src/experience/tower/FloorLevel.tsx:1-49`
- Modify: `src/experience/Experience.tsx:26,107`
- Modify: `e2e/ride.spec.ts` (new test)
- Modify: `AGENTS.md` (3D experience section, Fast verification), `docs/superpowers/specs/agent-hq/02-interaction-and-states.md:43`, `03-rover-camera-input.md:58`, `08-quality-acceptance.md` (section 2 table)

**Interfaces:**
- Consumes: `advanceRide(..., { ready, cap })`, `rideCap`, `trackFrameDt` (Tasks 2 and 3); `destinationReady`, `floorReady`, `ridePrep` (Task 3); `startRideStats`, `stepRideStats`, `finishRideStats`, `formatRideSummary`, `RideStats` (Task 3); `floorContentVisible` (Task 3).
- Produces: `window.__hq.ridePrep` (the `ridePrep` object; `lastRide: RideSummary | null`); console line `[hq ride] ...` when the URL has `?perf=1`.

- [x] **Step 1: Write the failing e2e for the gate and the precompile**

Append to `e2e/ride.spec.ts`:

```ts
test("the car waits for the new floor with the doors closed, then compiles nothing while it moves", async ({ page }) => {
  await enterHQ(page);
  await rideTo(page, "L3", 90_000);
  const last = await lastRide(page);
  console.log(`ride L1 to L3: ${JSON.stringify(last)}`);
  expect(last).not.toBeNull();
  expect(last!.timedOut).toBe(false);
  expect(last!.programs).toBe(0);
  expect(last!.distinctY).toBeGreaterThanOrEqual(12);
});
```

Run: `bun run build && E2E_PORT=4435 bunx playwright test e2e/ride.spec.ts -g "waits for the new floor" --reporter=list`
Expected: FAIL with `expect(received).not.toBeNull()` (`window.__hq.ridePrep` does not exist yet).

- [x] **Step 2: Wire the Director**

In `src/experience/scene/Director.tsx`:

Add to the imports (after the `../tower/elevator` import):

```ts
import type { WebGLRenderer } from "three";
import { destinationReady, ridePrep } from "../tower/ridePrep";
import { finishRideStats, formatRideSummary, startRideStats, stepRideStats, type RideStats } from "../tower/rideStats";
```

After `const lerp2 = ...` add:

```ts
/** Shader programs three has linked so far (grows when a material needs a new program). */
const programCount = (gl: WebGLRenderer) => gl.info.programs?.length ?? 0;
```

In the state object, after `typicalDt: TYPICAL_FRAME_DT,` add:

```ts
    /** Measurements of the running ride (`window.__hq.ridePrep.lastRide` once it ends). */
    rideStats: null as RideStats | null,
    /** `?perf=1`: log every ride's summary to the console (owner check on real devices). */
    perf: typeof window !== "undefined" && new URLSearchParams(window.location.search).get("perf") === "1",
```

After `const s = store.getState();` (the first one inside `useFrame`) add:

```ts
    if (!s.ride) local.rideStats = null;
```

Replace

```ts
      y = carY(ride, s.reducedMotion);

      if (store.getState().ride) {
        const next = advanceRide(ride, dt, { atDoor, reduced: s.reducedMotion, cap: rideCap(local.typicalDt) });
```

with

```ts
      y = carY(ride, s.reducedMotion);
      if (ride.stage !== "toDoor") {
        local.rideStats ??= startRideStats(ride.from, ride.to, Math.abs(floorY(ride.to) - floorY(ride.from)));
        stepRideStats(local.rideStats, { stage: ride.stage, y, frameDt: rawDt, held: ride.held ?? 0, programs: programCount(three.gl) });
      }

      if (store.getState().ride) {
        const next = advanceRide(ride, dt, {
          atDoor,
          reduced: s.reducedMotion,
          ready: destinationReady(ride.to),
          cap: rideCap(local.typicalDt),
        });
```

In the arrival branch, right after `audio.play("ding");` add:

```ts
          if (local.rideStats) {
            const summary = finishRideStats(local.rideStats, programCount(three.gl));
            ridePrep.lastRide = summary;
            if (local.perf) console.info(formatRideSummary(summary));
            local.rideStats = null;
          }
```

- [x] **Step 3: Use `floorContentVisible` in `src/experience/tower/FloorLevel.tsx`**

Add imports:

```ts
import { floorContentVisible } from "./near";
import { floorReady } from "./ridePrep";
```

Replace the `useFrame` body (lines 37 to 49) with:

```ts
  useFrame(() => {
    const { phase, ride } = getHQStore().getState();
    const exterior = phase === "boot" || phase === "intro";
    const above = !exterior && y > roverRuntime.y + 0.5;
    if (fill.current) {
      fill.current.opacity = above ? GHOST : SOLID;
      fill.current.depthWrite = !above;
    }
    if (edge.current) edge.current.opacity = above ? 0.16 : 0.95;
    // Ghosts above, hidden under the current slab unless the elevator runs, and a floor below that is
    // still compiling waits for the car to move (tower/near.ts).
    if (content.current) content.current.visible = floorContentVisible({ floorY: y, roverY: roverRuntime.y, exterior, ride, ready: floorReady(layout.id) });
  });
```

- [x] **Step 4: Expose `ridePrep` to Playwright in `src/experience/Experience.tsx`**

Add `import { ridePrep } from "./tower/ridePrep";` after the `interactRuntime` import, and change line 107 to:

```ts
  (window as unknown as { __hq?: unknown }).__hq = { store, rover: roverRuntime, camera: () => [...roverRuntime.cameraPosition], layouts, interact: interactRuntime, ridePrep };
```

- [x] **Step 5: Run the unit tests, build and the ride spec**

```bash
bun run verify:quick
E2E_PORT=4435 bunx playwright test e2e/ride.spec.ts --reporter=list
```
Expected: all three ride tests PASS. The gate test prints `ride L1 to L3: {"from":"L1","to":"L3",...,"timedOut":false,"programs":0,...}`. If `programs` is not 0, find the material: temporarily add `console.info(three.gl.info.programs?.slice(-3).map((p) => p.name))` next to the arrival `console.info` and run with `?perf=1`; the usual cause is a material created after mount (lazy texture swap or a `key` remount). Precompile that object too (call `precompileScene` again from the component that creates it) rather than relaxing the assertion.

- [x] **Step 6: Check render budgets and the experience suite**

Run: `E2E_PORT=4435 bun run e2e:changed`
Expected: `experience`, `ride` (and `career` if the camera changed in this branch) pass, including every `expectRenderBudget` call (precompile adds no draw call).

- [x] **Step 7: Look gate (settled poses must not change)**

```bash
SCREENSHOTS=1 E2E_PORT=4435 SHOT_DIR=screenshots/after bunx playwright test e2e/screenshots.spec.ts -g "P6 review poses" --workers=1
for name in l1-plaza l3-arrival; do
  for size in 1440x900 2560x1440 390x844; do
    f="$name-$size.png"
    aa=$(magick compare -metric AE -fuzz 6% "screenshots/before/p6/$f" "screenshots/before2/p6/$f" null: 2>&1 | cut -d' ' -f1)
    ab=$(magick compare -metric AE -fuzz 6% "screenshots/before/p6/$f" "screenshots/after/p6/$f" null: 2>&1 | cut -d' ' -f1)
    echo "$f A/A=$aa A/B=$ab"
  done
done
```
Threshold: for each file `A/B <= max(1.5 x A/A, 0.1% of the pixels)` (1,296 px at 1440x900, 3,686 px at 2560x1440, 329 px at 390x844). Expected: every line within the threshold (the ride code does not touch settled frames; animated content is the A/A noise). If a file fails, open both images side by side; a real difference is a regression: revert Step 3 (keep `!ride` logic) and re-run. Record the six A/A and A/B numbers in the measurements file.

Ride frames themselves differ only on purpose: during `toDoor`, `boarding` and `closing` of a descent, a floor below the car that is still compiling is hidden, which is exactly how explore shows that floor one frame before the ride starts. Rollback note: replace the `floorContentVisible` call with the old two-line rule (`above`/`below`) to restore main's ride frames; the dolly still never skips (Task 2), only the first descent may pause in `boarding` while it compiles.

- [x] **Step 8: Update the ride docs**

`docs/superpowers/specs/agent-hq/02-interaction-and-states.md` line 43, replace the row with:

```markdown
| explore → elevator → explore | Rover drives to the door, doors close, the car waits with closed doors until the destination floor is built, compiled and typeset (at most 1.5 s, first visits only), camera dollies vertically, doors open. A long frame pauses the ride (each frame adds at most 1/30 s of ride time at 60 fps, 1/20 s on steadily slow devices) instead of skipping it | Drive time + 1.3 s of door stages + 0.8 s dolly (+ up to 1.5 s wait on a first visit) | 150 ms fade cut (the same wait happens at the door) |
```

`docs/superpowers/specs/agent-hq/03-rover-camera-input.md` line 58, replace the row with:

```markdown
| Elevator dolly | Floor change | Tweens the rig's y by `FLOOR_GAP` per floor, easeInOutCubic, 0.8 s of ride time; each frame adds at most `rideCap` (1/30 s at 60 fps, up to 1/20 s on steadily slow devices), so stalls pause the dolly and the camera spring uses the same cap during rides | Same | Same |
```

`docs/superpowers/specs/agent-hq/08-quality-acceptance.md`, add after the `| Draw calls per floor | ...` row:

```markdown
| Elevator dolly | At least 12 distinct car heights and no jump above 25% of the trip, even under a 6x CPU throttle; no shader compiled while the car moves | `e2e/ride.spec.ts` (car height sampled every frame, `window.__hq.ridePrep.lastRide`); on real devices `?perf=1` logs one line per ride |
```

`AGENTS.md`, in "## 3D experience (Phases 1 to 5a)", add this bullet right after the "- Data flow: ..." bullet:

```markdown
- Elevator smoothness (R5 P6): the ride clock adds at most `rideCap(typical frame)` per frame (`RIDE_CAP` 1/30 s at 60 fps up to 1/20 s on steadily slow devices, `tower/elevator.ts`), so a long frame pauses a ride instead of skipping the dolly; `CameraDirector` caps its spring at `RIDE_CAP.max` during rides. Every floor precompiles its programs when its content commits (`FloorPrep` in `tower/Tower.tsx`, `precompileScene` in `scene/precompile.ts`, compiled into the render target the scene pass uses so full-tier programs match the composer), and troika syncs are counted per floor (`tower/textSync.ts`, installed by `text-config.ts`). `advanceRide` holds the car at closed doors (end of `closing`, or at the door under reduced motion) until `destinationReady(to)` (`tower/ridePrep.ts`) or `PREPARE_TIMEOUT` (1.5 s); a floor below the car that is still compiling stays hidden until the car moves (`floorContentVisible`, `tower/near.ts`). The Director measures each ride (`tower/rideStats.ts`): `window.__hq.ridePrep.lastRide`, and with `?perf=1` one `[hq ride]` console line per ride. Tests: `e2e/ride.spec.ts` (6x CPU throttle, reduced-motion cut, no compile while moving).
```

In "## Fast verification", after "`src/experience/interact/**` to `interact`, `experience`, `pads` and `career`," insert "`src/experience/tower/**`, `scene/Director.tsx`, `scene/precompile.ts` and `text-config.ts` to `ride` and `experience`,".

- [x] **Step 9: Commit**

```bash
rtk git add src/experience/scene/Director.tsx src/experience/tower/FloorLevel.tsx src/experience/Experience.tsx e2e/ride.spec.ts AGENTS.md docs/superpowers/specs/agent-hq/02-interaction-and-states.md docs/superpowers/specs/agent-hq/03-rover-camera-input.md docs/superpowers/specs/agent-hq/08-quality-acceptance.md docs/superpowers/plans/2026-10-13-r5-p6-measurements.md
rtk git commit -m "feat: wait for the destination floor before the dolly and measure every elevator ride"
```

### Task 6: Page view icon on the left (desktop, tablet own row, phone row)

Owner: "also can you make Page View button have icon on the left". One `ViewActions` component renders the button for `TopBar` (desktop one row from 1024 px, tablet own row below it) and `MobileMenu` (phone second row), so one change covers all three. The label, its EN/ID strings and the accessible name do not change.

**Files:**
- Modify: `src/hud/Controls.tsx:54-70`
- Test: `tests/hud/Controls.test.tsx`
- Modify: `e2e/hud.spec.ts` (3D top bar describe)
- Modify: `docs/superpowers/specs/agent-hq/04-hud-responsive-i18n.md:21`

**Interfaces:**
- Consumes: `hud.pageView`, `hud.pageViewHint` (`messages/*.json`), `data-testid="page-view"`.
- Produces: `PageIcon` (local to `Controls.tsx`): `<svg data-testid="page-view-icon" aria-hidden="true">` as the first child of the Page view button.

- [x] **Step 1: Write the failing unit test**

In `tests/hud/Controls.test.tsx`, inside the first test after `expect(pageView.className).toContain("bg-cyan");` add:

```ts
    // Owner request: a document icon on the left; the accessible name stays the label.
    const icon = pageView.firstElementChild!;
    expect(icon.tagName.toLowerCase()).toBe("svg");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveAttribute("data-testid", "page-view-icon");
    expect(pageView).toHaveAccessibleName(en.hud.pageView);
    expect(pageView.className).toContain("gap-2");
```

and in the phone test after the first `expect(...)` add:

```ts
    expect(screen.getByTestId("page-view").firstElementChild).toBe(screen.getByTestId("page-view-icon"));
```

Run: `bunx vitest run tests/hud/Controls.test.tsx`
Expected: FAIL (`expected 'button' ...` / first child is not an svg).

- [x] **Step 2: Implement the icon**

In `src/hud/Controls.tsx`, replace lines 54 to 70 (from `const launcher = ...` through the end of `ViewActions`) with:

```tsx
const launcher = "glass glass-solid inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-sm text-ink-2 transition hover:text-ink";
/** Page view is the one primary control of the 3D HUD (solid cyan, like Back to 3D in the Page View). */
const primary =
  "inline-flex min-h-11 items-center gap-2 rounded-full bg-cyan px-4 text-sm font-semibold text-void shadow-[0_0_24px_-6px_var(--color-cyan)] transition hover:bg-cyan/85 focus-visible:outline-offset-4";

/** Document glyph left of "Page view" (owner request): the portfolio as a page. Same stroke style as the HUD icons. */
function PageIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
      data-testid="page-view-icon"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

/** Page view (highlighted, document icon on the left) with Ask AI on its right, the far right of the HUD. Quick view lives only in the Page View. */
function ViewActions({ onExit }: { onExit: () => void }) {
  const t = useTranslations("hud");
  return (
    <div className="flex items-center gap-2" data-testid="hud-view-actions">
      <button type="button" onClick={onExit} title={t("pageViewHint")} className={primary} data-testid="page-view">
        <PageIcon />
        {t("pageView")}
      </button>
      <AskPill />
    </div>
  );
}
```

Run: `bunx vitest run tests/hud/Controls.test.tsx`
Expected: PASS.

- [x] **Step 3: Extend the e2e layout checks**

In `e2e/hud.spec.ts`, inside the `3D top bar` loop test, after `const a = await box(ask);` add:

```ts
      // The icon sits at the left of the label, inside the button.
      const icon = await box(pageView.getByTestId("page-view-icon"));
      expect(icon.x).toBeGreaterThanOrEqual(p.x);
      expect(icon.x + icon.width).toBeLessThan(p.x + p.width / 2);
      await expect(pageView).toHaveAccessibleName(en.hud.pageView);
      await page.getByTestId("hud-topbar").screenshot({ path: test.info().outputPath(`topbar-${vp.name}.png`) });
```

After that describe block add:

```ts
test("Indonesian at 1024 px: the wider Page view keeps the one-row bar clear of the profile card", async ({ browser }) => {
  const { context, page } = await newPage(browser, { width: 1024, height: 768, touch: false });
  await enterHQ(page, { path: "/id" });
  const hud = page.getByTestId("hud");
  await expect(hud.getByTestId("page-view")).toHaveAccessibleName(id.hud.pageView);
  const bar = await box(hud.getByTestId("hud-topbar"));
  const card = await box(hud.getByRole("region", { name: id.hud.profile }));
  expect(overlaps(bar, card)).toBe(false);
  expect(bar.x + bar.width).toBeLessThanOrEqual(1024);
  await context.close();
});
```

and add `import id from "../messages/id.json";` under the `en` import.

Run: `bun run build && E2E_PORT=4435 bunx playwright test e2e/hud.spec.ts -g "top bar|1024 px" --reporter=list`
Expected: 4 tests PASS. If the 1024 ID test fails, the bar wraps: change `TopBar`'s breakpoint class from `lg:flex-row` to `xl:flex-row` (tablet-style own row up to 1279 px) and update appendix 04's "one row from 1024 px" accordingly; re-run.

- [x] **Step 4: Screenshots at the three sizes**

Run: `SCREENSHOTS=1 E2E_PORT=4435 SHOT_DIR=screenshots/after bunx playwright test e2e/screenshots.spec.ts -g "P6 review poses" --workers=1`
Expected: `screenshots/after/p6/topbar-{1440x900,2560x1440,390x844}.png` show the icon left of "Page view"; compare with `screenshots/before/p6/topbar-*.png` (only the button grows by the icon width and gap, about 26 px). Attach both sets to the PR.

- [x] **Step 5: Update appendix 04**

`docs/superpowers/specs/agent-hq/04-hud-responsive-i18n.md` line 21, replace with:

```markdown
| Page view and Ask AI | Top-right, last in the bar: Page view (primary, solid cyan, a document icon left of the label), then Ask AI at the far right | Own row under the bar, same order | Second row under the menu row, same order |
```

- [x] **Step 6: Commit**

```bash
E2E_PORT=4435 bun run e2e:changed
rtk git add src/hud/Controls.tsx tests/hud/Controls.test.tsx e2e/hud.spec.ts docs/superpowers/specs/agent-hq/04-hud-responsive-i18n.md
rtk git commit -m "feat: document icon left of the Page view button in the 3D top bar"
```

Rollback: revert; the button returns to text only.

### Task 7: Owner photo renditions and the round HUD profile badge

Owner decision 12 (plan.md): "3D profile card KAW badge becomes a round photo". The badge is decorative (`alt=""`: the name is right next to it; on the phone pill the button's `aria-label` already names the owner). Fixed width and height, so no layout shift. Only the 3D HUD loads it (the Page View never mounts the HUD), so Lighthouse budgets are untouched.

**Files:**
- Create (unless P1 already merged them): `public/brand/kurniadi-photo-160.webp`, `public/brand/kurniadi-photo-320.webp`, `public/brand/kurniadi-photo-640.webp`
- Create: `src/lib/brand-photo.ts`
- Modify: `src/hud/ProfileCard.tsx:1-66`
- Test: `tests/hud/ProfileCard.test.tsx`, `tests/content/assets.test.ts`
- Modify: `e2e/hud.spec.ts`
- Modify: `AGENTS.md:14` (hard rule), `docs/superpowers/specs/agent-hq/07-content-map.md:101` (C5), `docs/superpowers/specs/agent-hq/04-hud-responsive-i18n.md:19` (profile card row)

**Interfaces:**
- Consumes: source photo `/Users/shinyq/.copilot/session-state/d439b68f-b2e6-4b77-9feb-f9099e8cd824/files/owner-photo/kurniadi-photo.png` (800x800, never committed).
- Produces (`src/lib/brand-photo.ts`): `BRAND_PHOTO_WIDTHS: readonly [160, 320, 640]`, `type BrandPhotoWidth`, `brandPhotoSrc(width: BrandPhotoWidth): string` (`/brand/kurniadi-photo-${width}.webp`), `brandPhotoSrcSet(): string`. `ProfilePhoto` (local to `ProfileCard.tsx`, `data-testid="profile-photo"`).

- [x] **Step 1: Generate the renditions (skip if `origin/main` already has them from P1)**

```bash
rtk git ls-tree --name-only origin/main public/brand/
```
If the listing already contains `kurniadi-photo-160.webp`, `kurniadi-photo-320.webp` and `kurniadi-photo-640.webp`, skip to Step 2. Otherwise:

```bash
SRC=/Users/shinyq/.copilot/session-state/d439b68f-b2e6-4b77-9feb-f9099e8cd824/files/owner-photo/kurniadi-photo.png
for w in 160 320 640; do cwebp -quiet -q 80 -m 6 -noalpha -resize $w $w "$SRC" -o public/brand/kurniadi-photo-$w.webp; done
ls -l public/brand/
```
Expected: three files, roughly 5 to 9 KB (160), 14 to 25 KB (320), 40 to 70 KB (640). Without `cwebp`, use the `sharp` that ships in `node_modules`:

```bash
bun -e 'import sharp from "sharp"; const src = process.argv[1]; for (const w of [160, 320, 640]) await sharp(src).resize(w, w).flatten({ background: "#ffffff" }).webp({ quality: 80, effort: 6 }).toFile(`public/brand/kurniadi-photo-${w}.webp`);' "$SRC"
```

- [x] **Step 2: Write the failing tests**

Append to `tests/content/assets.test.ts` inside `describe("assets", ...)`:

```ts
  it("ships the owner's portrait in three square webp sizes (C5 revised 2026-10-13)", () => {
    for (const w of [160, 320, 640]) {
      const file = path.join(root, "public", "brand", `kurniadi-photo-${w}.webp`);
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size).toBeLessThan(80 * 1024);
    }
  });
```

In `tests/hud/ProfileCard.test.tsx`, add `import { brandPhotoSrc } from "@/lib/brand-photo";` and append inside the describe:

```ts
  it("shows the owner's round photo instead of the KAW monogram, decorative and with a fixed size", () => {
    getHQStore().setState({ floor: "L3" });
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ProfileCard data={data} mobile={false} />
      </NextIntlClientProvider>,
    );
    const badge = screen.getByTestId("profile-photo");
    const img = badge.querySelector("img")!;
    expect(img).toHaveAttribute("src", brandPhotoSrc(160));
    expect(img.getAttribute("srcset")).toContain(`${brandPhotoSrc(320)} 320w`);
    expect(img).toHaveAttribute("sizes", "44px");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("width", "40");
    expect(img).toHaveAttribute("height", "40");
    expect(screen.getByRole("region", { name: en.hud.profile }).querySelector("svg text")).toBeNull();
  });

  it("uses the same photo in the collapsed phone pill", () => {
    getHQStore().setState({ floor: "L1" });
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ProfileCard data={data} mobile />
      </NextIntlClientProvider>,
    );
    const pill = screen.getByRole("button", { name: new RegExp(`^${en.hud.profile}: ${data.profile.name}`) });
    expect(pill.querySelector("[data-testid='profile-photo'] img")).toHaveAttribute("sizes", "36px");
  });
```

Run: `bunx vitest run tests/hud/ProfileCard.test.tsx tests/content/assets.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/brand-photo"`; the assets test passes once Step 1 ran).

- [x] **Step 3: Create `src/lib/brand-photo.ts`**

```ts
/**
 * The owner's portrait (owner decision 2026-10-13, C5 revised): square webp renditions in
 * public/brand/, shared with the Page View (P1) and the share images (P9).
 */
export const BRAND_PHOTO_WIDTHS = [160, 320, 640] as const;
export type BrandPhotoWidth = (typeof BRAND_PHOTO_WIDTHS)[number];

export function brandPhotoSrc(width: BrandPhotoWidth): string {
  return `/brand/kurniadi-photo-${width}.webp`;
}

export function brandPhotoSrcSet(): string {
  return BRAND_PHOTO_WIDTHS.map((w) => `${brandPhotoSrc(w)} ${w}w`).join(", ");
}
```

- [x] **Step 4: Replace the monogram badge in `src/hud/ProfileCard.tsx`**

Replace `import { Monogram } from "@/components/Monogram";` with `import { brandPhotoSrc, brandPhotoSrcSet } from "@/lib/brand-photo";`. Before `export function ProfileCard` add:

```tsx
/** Round photo badge (owner request): a 2 px cyan to violet ring like the old KAW monogram's edge. Decorative: the name is next to it. */
function ProfilePhoto({ size }: { size: number }) {
  return (
    <span
      className="block shrink-0 rounded-full bg-[linear-gradient(135deg,var(--color-cyan),var(--color-violet))] p-[2px] shadow-[0_0_14px_-4px_var(--color-cyan)]"
      style={{ width: size, height: size }}
      data-testid="profile-photo"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={brandPhotoSrc(160)}
        srcSet={brandPhotoSrcSet()}
        sizes={`${size}px`}
        width={size - 4}
        height={size - 4}
        alt=""
        decoding="async"
        className="block size-full rounded-full bg-void object-cover"
      />
    </span>
  );
}
```

Replace `<Monogram text={data.profile.monogram} size={36} />` with `<ProfilePhoto size={36} />` and `<Monogram text={data.profile.monogram} size={44} />` with `<ProfilePhoto size={44} />`. Leave `src/components/Monogram.tsx` in place (the Lobby hologram keeps the KAW monogram; P1 decides the Page View's use).

Run: `bunx vitest run tests/hud/ProfileCard.test.tsx tests/content/assets.test.ts`
Expected: PASS (including the existing test, whose `[aria-hidden='true'].rounded-full` probe still finds nothing: the badge has no `aria-hidden`).

- [x] **Step 5: e2e: the badge loads at every HUD size**

Append to `e2e/hud.spec.ts` (after the top bar tests):

```ts
test.describe("profile photo badge", () => {
  for (const vp of TOP_BAR) {
    test(`${vp.name}: the profile card shows the owner's round photo`, async ({ browser }) => {
      const { context, page } = await newPage(browser, vp);
      await enterHQ(page);
      const img = page.getByTestId("hud").getByTestId("profile-photo").locator("img");
      await expect(img).toBeVisible();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      const b = await box(img);
      expect(Math.abs(b.width - b.height)).toBeLessThan(1);
      expect(await img.evaluate((el) => getComputedStyle(el).borderRadius)).not.toBe("0px");
      await context.close();
    });
  }
});
```

Run: `bun run build && E2E_PORT=4435 bunx playwright test e2e/hud.spec.ts -g "profile photo" --reporter=list`
Expected: 3 tests PASS.

- [x] **Step 6: Amend the photo rule (skip any part P1 already merged)**

`AGENTS.md` line 14, replace the end of the sentence "the Master's degree, 2026 hackathon entries or any photo." with "the Master's degree, 2026 hackathon entries or any photo other than the owner's portrait (`public/brand/kurniadi-photo-{160,320,640}.webp`, owner decision 2026-10-13, C5 revised)."

`docs/superpowers/specs/agent-hq/07-content-map.md` line 101, replace the C5 row with:

```markdown
| C5 | Photo | Revised 2026-10-13 (owner): the owner's portrait (`public/brand/kurniadi-photo-{160,320,640}.webp`) appears on the Page View landing and About (P1), as the 3D profile card badge and on the Highlights Hall "About me" station (P6), and in the home share image (P9). The "KAW" monogram hologram stays in the Lobby. No other photos. |
```

`docs/superpowers/specs/agent-hq/04-hud-responsive-i18n.md` line 19, replace with:

```markdown
| Profile card | Top-left, 280 px, round photo badge, name, title, floor | Same, 240 px | Collapsed pill: photo badge plus floor; tap to expand |
```

`tests/content/safety.test.ts` keeps "publishes no photo (C5)" (it checks `content.profile.photo` and the word "portrait" in the dataset, which P6 does not touch); if P1 renamed or changed it, keep P1's version.

- [x] **Step 7: Commit**

```bash
bun run verify:quick
E2E_PORT=4435 bun run e2e:changed
rtk git add public/brand/kurniadi-photo-160.webp public/brand/kurniadi-photo-320.webp public/brand/kurniadi-photo-640.webp src/lib/brand-photo.ts src/hud/ProfileCard.tsx tests/hud/ProfileCard.test.tsx tests/content/assets.test.ts e2e/hud.spec.ts AGENTS.md docs/superpowers/specs/agent-hq/07-content-map.md docs/superpowers/specs/agent-hq/04-hud-responsive-i18n.md
rtk git commit -m "feat: owner photo as the round 3D profile card badge (C5 revised)"
```

Rollback: revert; the KAW monogram badge returns (the webp files can stay for P1 and P9).

### Task 8: The portrait in a neon frame on the Highlights Hall "About me" station

Owner decision 12: "the Highlights Hall "About me" station shows it in a neon frame". The portrait (320 px file) is drawn into the hall's existing lazy screenshot atlas, which loads when the rover heads for the hall (`shouldLoadShots`, x > 18 on L1) and is disposed on unmount; its quad joins the screenshot mesh, and its frame joins the merged solids, whose edges are the hall's neon lines. Result: zero extra draw calls (L1 cap 140), one slightly wider texture (full 1740x300, lite 1160x200). The About face is re-laid out: portrait on the left, eyebrow, name and headline left-aligned to its right, stat tiles and subheadline unchanged.

**Files:**
- Modify: `src/experience/floors/lobby/hallContent.ts:1-196`
- Modify: `src/experience/floors/lobby/HighlightsHall.tsx:1-115`
- Test: `tests/unit/hall-content.test.ts`
- Modify: `e2e/highlights.spec.ts:276-291` (budget spots) and a new test

**Interfaces:**
- Consumes: `brandPhotoSrc(320)` (Task 7), `stationOf`, `HALL`, `coverCrop`, `SHOT_CELL`, `hallShots`, `onPanel` (existing).
- Produces (`hallContent.ts`): `PHOTO = { u: -3.45, y: 4.85, size: 1.8 }`, `PHOTO_SRC: string`, `PHOTO_BRIGHTNESS = 0.85`, `interface AtlasCell { src: string; x: number; w: number; h: number; brightness: number }`, `interface HallAtlas { cells: AtlasCell[]; width: number; height: number }`, `hallAtlas(thumbs: readonly string[], cell: { w: number; h: number }): HallAtlas`, `hallPhoto(index: number): ShotQuad`, `shotQuadBuffers(quads: readonly ShotQuad[], cells: readonly AtlasCell[])` (signature change: cells instead of a count). `HighlightsHall.tsx`: `useHallAtlas(atlas: HallAtlas, enabled: boolean): CanvasTexture | null`.

- [x] **Step 1: Before captures exist**

Confirm `screenshots/before/p6/l1-about-{1440x900,2560x1440,390x844}.png` from Task 1 Step 6. Also record the L1 budget numbers on the unchanged hall: `E2E_PORT=4435 bunx playwright test e2e/highlights.spec.ts -g "headroom" --reporter=list` prints `L1 lite at ...: N calls` and `L1 full at ...` lines; copy them into the measurements file under "Hall before".

- [x] **Step 2: Write the failing unit tests**

In `tests/unit/hall-content.test.ts`, extend the import from `hallContent` with `hallAtlas, hallPhoto, PHOTO, PHOTO_SRC, SHOT_CELL,` and add `import { brandPhotoSrc } from "@/lib/brand-photo";`. Replace the test "builds plinths, panels, stat tiles and screenshot frames ..." expectation `expect(solids).toHaveLength(4 + 4 + 4 + 3);` with:

```ts
    // Plinths, panels, stat tiles, the portrait frame, screenshot frames.
    expect(solids).toHaveLength(4 + 4 + 4 + 1 + 3);
```

Replace the test "puts the screenshots on the projects panel, facing the plaza, one atlas cell each" with:

```ts
  it("puts the screenshots on the projects panel and the portrait on the about panel, one atlas cell each", () => {
    const quads = [...hallShots(3), hallPhoto(3)];
    expect(quads.map((q) => q.index)).toEqual([0, 1, 2, 3]);
    const atlas = hallAtlas(["a", "b", "c"], SHOT_CELL.full);
    expect(atlas).toMatchObject({ width: 3 * 480 + 300, height: 300 });
    const { positions, uvs, indices } = shotQuadBuffers(quads, atlas.cells);
    expect(positions).toHaveLength(48);
    // Float32 buffers: compare against the same values rounded to float32.
    expect(Array.from(uvs.slice(0, 8))).toEqual(Array.from(new Float32Array([0, 0, 480 / 1740, 0, 480 / 1740, 1, 0, 1])));
    expect(Array.from(uvs.slice(24, 32))).toEqual(Array.from(new Float32Array([1440 / 1740, 0, 1, 0, 1, 1, 1440 / 1740, 1])));
    expect(Array.from(indices.slice(0, 6))).toEqual([0, 1, 2, 0, 2, 3]);
    // Counter-clockwise as seen from the plaza: (b - a) x (c - a) points out of the panel.
    for (const [quad, station] of [[0, "projects"], [3, "about"]] as const) {
      const v = (i: number) => [positions[(quad * 4 + i) * 3], positions[(quad * 4 + i) * 3 + 1], positions[(quad * 4 + i) * 3 + 2]];
      const [a, b, c] = [v(0), v(1), v(2)];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const s = stationOf(station);
      expect(n[0] * -s.facing.x + n[2] * -s.facing.z).toBeGreaterThan(0);
    }
    const projects = stationOf("projects");
    expect(onPanel(projects, 0, 1, 0)).toEqual([projects.front.x, 1, projects.front.z]);
  });

  it("frames the portrait on the About me panel, above the stat tiles and left of the text block", () => {
    const about = stationOf("about");
    const quad = hallPhoto(3);
    const at = faceCoords(quad.center);
    expect(at?.s).toBe(about);
    expect(at!.u - PHOTO.size / 2).toBeGreaterThanOrEqual(-about.width / 2);
    // Stat tiles end at 3.8 (TILE.y 2.9 + half of 1.8); the frame is 0.1 wider than the photo on each side.
    expect(quad.center[1] - PHOTO.size / 2 - 0.1).toBeGreaterThan(3.8);
    expect(quad.center[1] + PHOTO.size / 2 + 0.1).toBeLessThan(HALL.panel.h);
    for (const t of texts.filter((t) => faceCoords(t.position)?.s === about && t.position[1] > 3.8)) {
      expect(faceCoords(t.position)!.u, t.text).toBeGreaterThanOrEqual(PHOTO.u + PHOTO.size / 2 + 0.2);
    }
    expect(PHOTO_SRC).toBe(brandPhotoSrc(320));
    expect(hallAtlas(["a"], SHOT_CELL.lite).cells.at(-1)).toMatchObject({ src: PHOTO_SRC, x: 320, w: 200, h: 200 });
  });

  it("fits the headline in two lines beside the portrait (EN and ID)", () => {
    for (const locale of ["en", "id"] as const) {
      const d = buildExperienceData(locale, { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });
      const headline = hallLabels(d, labels, fonts).find((t) => t.text === d.profile.headline)!;
      // Rough advance of the sans face: 0.55 em per character.
      expect(Math.ceil((headline.text.length * headline.fontSize * 0.55) / headline.maxWidth!), locale).toBeLessThanOrEqual(2);
    }
  });
```

Run: `bunx vitest run tests/unit/hall-content.test.ts`
Expected: FAIL (`hallAtlas is not a function`, length 15 instead of 16).

- [x] **Step 3: Implement in `src/experience/floors/lobby/hallContent.ts`**

Add the import `import { brandPhotoSrc } from "@/lib/brand-photo";` under the existing imports. After `export const SHOT_CELL = ...;` add:

```ts
/** The owner's portrait on the About me panel (owner decision 2026-10-13): `u` along the face, center height, square side. */
export const PHOTO = { u: -3.45, y: 4.85, size: 1.8 } as const;
export const PHOTO_SRC = brandPhotoSrc(320);
/** The light studio backdrop would bloom on the full tier; drawn slightly darker it reads like the screenshots. */
export const PHOTO_BRIGHTNESS = 0.85;
/** Left edge of the About text block (eyebrow, name, headline), right of the portrait frame. */
const ABOUT_TEXT_U = -2.2;
```

In `hallSolids`, replace

```ts
  const about = stationOf("about");
  for (const u of STAT_U) out.push(faceBox(about, u, TILE.y, TILE.w, TILE.h));
```

with

```ts
  const about = stationOf("about");
  for (const u of STAT_U) out.push(faceBox(about, u, TILE.y, TILE.w, TILE.h));
  // The portrait's frame: its edges are the hall's neon lines (MergedEdges), like the stat tiles.
  out.push(faceBox(about, PHOTO.u, PHOTO.y, PHOTO.size + 0.2, PHOTO.size + 0.2));
```

and change its doc comment to `/** Plinths, panels, the four stat tiles, the portrait frame and one frame per screenshot. */`.

In `hallLabels`, replace

```ts
  const about = stationOf("about");
  eyebrow(about, 1, labels.about);
  add(about, 0, 4.9, input.profile.name, fonts.sansBold, 0.6, INK.title, { maxWidth: about.width - 0.6 });
  add(about, 0, 4.25, input.profile.headline, fonts.sans, 0.3, INK.cyan, { maxWidth: about.width - 0.6 });
```

with

```ts
  const about = stationOf("about");
  // Portrait on the left (PHOTO), the text block left-aligned beside it.
  const block = { anchorX: "left" as const, textAlign: "left" as const, maxWidth: about.width / 2 - ABOUT_TEXT_U - 0.3 };
  add(about, ABOUT_TEXT_U, 5.55, `01 · ${labels.about.toUpperCase()}`, fonts.mono, 0.2, HALL.tone.about, { letterSpacing: 0.12, ...block });
  add(about, ABOUT_TEXT_U, 4.95, input.profile.name, fonts.sansBold, 0.52, INK.title, block);
  add(about, ABOUT_TEXT_U, 4.55, input.profile.headline, fonts.sans, 0.28, INK.cyan, { ...block, anchorY: "top", lineHeight: 1.2 });
```

Replace `hallShots`'s neighbours: after `hallShots` add:

```ts
/** The portrait quad on the About me panel; `index` is its atlas cell (after the screenshots). */
export function hallPhoto(index: number): ShotQuad {
  const s = stationOf("about");
  return { index, center: onPanel(s, PHOTO.u, PHOTO.y, OUT.shot), right: s.right, w: PHOTO.size, h: PHOTO.size };
}

/** One cell of the hall atlas: an image drawn with cover fit at `x` (px), over the full atlas height. */
export interface AtlasCell {
  src: string;
  x: number;
  w: number;
  h: number;
  /** Canvas brightness filter for this cell (1 keeps the image as is). */
  brightness: number;
}

export interface HallAtlas {
  cells: AtlasCell[];
  width: number;
  height: number;
}

/** The project screenshots (16:10 cells) and then the portrait (a square cell) in one row: one texture, one draw call. */
export function hallAtlas(thumbs: readonly string[], cell: { w: number; h: number }): HallAtlas {
  const cells: AtlasCell[] = thumbs.map((src, i) => ({ src, x: i * cell.w, w: cell.w, h: cell.h, brightness: 1 }));
  cells.push({ src: PHOTO_SRC, x: thumbs.length * cell.w, w: cell.h, h: cell.h, brightness: PHOTO_BRIGHTNESS });
  return { cells, width: thumbs.length * cell.w + cell.h, height: cell.h };
}
```

Replace `shotQuadBuffers` with:

```ts
/** Positions, uvs and indices for the screenshot and portrait quads over a one-row atlas (one draw call). */
export function shotQuadBuffers(quads: readonly ShotQuad[], cells: readonly AtlasCell[]) {
  const width = Math.max(1, ...cells.map((c) => c.x + c.w));
  const positions = new Float32Array(quads.length * 12);
  const uvs = new Float32Array(quads.length * 8);
  const indices = new Uint16Array(quads.length * 6);
  quads.forEach((q, i) => {
    const hx = (q.right.x * q.w) / 2;
    const hz = (q.right.z * q.w) / 2;
    const hy = q.h / 2;
    const [x, y, z] = q.center;
    positions.set([x - hx, y - hy, z - hz, x + hx, y - hy, z + hz, x + hx, y + hy, z + hz, x - hx, y + hy, z - hz], i * 12);
    const cell = cells[q.index];
    const u0 = cell.x / width;
    const u1 = (cell.x + cell.w) / width;
    uvs.set([u0, 0, u1, 0, u1, 1, u0, 1], i * 8);
    const b = i * 4;
    indices.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6);
  });
  return { positions, uvs, indices };
}
```

Update the file's top doc comment: "the three screenshots and the owner's portrait in one atlas quad mesh".

Run: `bunx vitest run tests/unit/hall-content.test.ts`
Expected: PASS (the existing "keeps every station label on its own panel" passes: the block spans u -2.2 to 4.7 on a 10 u panel).

- [x] **Step 4: Draw the portrait in `src/experience/floors/lobby/HighlightsHall.tsx`**

Change the `hallContent` import to:

```ts
import { coverCrop, hallAtlas, hallLabels, hallPhoto, hallShots, hallSolids, SHOT_CELL, shotQuadBuffers, type HallAtlas, type HallLabels } from "./hallContent";
```

Replace `useShotAtlas` (lines 18 to 63) with:

```tsx
/** Draws the atlas cells into one canvas row (cover fit, per-cell brightness); a failed image leaves its cell dark. */
function useHallAtlas(atlas: HallAtlas, enabled: boolean) {
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  const key = `${atlas.width}x${atlas.height}|${atlas.cells.map((c) => c.src).join("|")}`;
  useEffect(() => {
    if (!enabled || atlas.cells.length === 0) return;
    let cancelled = false;
    let built: CanvasTexture | null = null;
    const canvas = document.createElement("canvas");
    canvas.width = atlas.width;
    canvas.height = atlas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    Promise.all(
      atlas.cells.map(
        (cell) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.decoding = "async";
            img.onload = () => {
              const { sx, sy, sw, sh } = coverCrop(img.naturalWidth, img.naturalHeight, cell.w, cell.h);
              ctx.filter = cell.brightness === 1 ? "none" : `brightness(${cell.brightness})`;
              ctx.drawImage(img, sx, sy, sw, sh, cell.x, 0, cell.w, cell.h);
              ctx.filter = "none";
              resolve();
            };
            img.onerror = () => resolve();
            img.src = cell.src;
          }),
      ),
    ).then(() => {
      if (cancelled) return;
      built = new CanvasTexture(canvas);
      built.colorSpace = SRGBColorSpace;
      built.anisotropy = 4;
      setTexture(built);
    });
    return () => {
      cancelled = true;
      built?.dispose();
    };
    // `key` captures the atlas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return texture;
}
```

Replace `ShotWall` (lines 65 to 88) with:

```tsx
/** The three project screenshots and the owner's portrait as one mesh over a canvas atlas, loaded once the rover heads for the hall. */
function ShotWall({ thumbs, tier }: { thumbs: readonly string[]; tier: GpuTier }) {
  const [load, setLoad] = useState(false);
  useFrame(() => {
    if (!load && shouldLoadShots(getHQStore().getState().floor, roverRuntime.x)) setLoad(true);
  });
  const atlas = useMemo(() => hallAtlas(thumbs, SHOT_CELL[tier === "full" ? "full" : "lite"]), [thumbs, tier]);
  const texture = useHallAtlas(atlas, load);
  const geometry = useMemo(() => {
    const { positions, uvs, indices } = shotQuadBuffers([...hallShots(thumbs.length), hallPhoto(thumbs.length)], atlas.cells);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("uv", new BufferAttribute(uvs, 2));
    g.setIndex(new BufferAttribute(indices, 1));
    g.computeBoundingSphere();
    return g;
  }, [atlas, thumbs.length]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (!texture) return null;
  return (
    <mesh geometry={geometry} raycast={() => null}>
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}
```

Update the `HighlightsHall` doc comment: "the screenshots and the owner's portrait in one lazy atlas mesh".

Run: `bun run typecheck && bunx vitest run tests/unit/hall-content.test.ts`
Expected: PASS.

- [x] **Step 5: e2e: the portrait loads with the hall and the budget holds**

In `e2e/highlights.spec.ts`, in the headroom test change

```ts
      const spots = [null, { x: 20, z: 15 }, { x: 34, z: 13 }, stationOf("projects").pad, stationOf("experience").pad];
```

to

```ts
      const spots = [null, { x: 20, z: 15 }, { x: 34, z: 13 }, stationOf("about").pad, stationOf("projects").pad, stationOf("experience").pad];
```

and add after that test loop:

```ts
  test("the About me station shows the owner's portrait in its neon frame, loaded with the hall", async ({ page }) => {
    await enterHQ(page);
    const request = page.waitForRequest((r) => r.url().endsWith("/brand/kurniadi-photo-320.webp"), { timeout: 90_000 });
    await faceStation(page, "about");
    const response = await (await request).response();
    expect(response?.status()).toBe(200);
    await waitForCameraSettle(page);
    await expectRenderBudget(page);
    expect((await snapshot(page)).drawCalls).toBeLessThanOrEqual(L1_MAX_DRAW_CALLS);
  });
```

Run: `bun run build && E2E_PORT=4435 bunx playwright test e2e/highlights.spec.ts -g "headroom|portrait" --reporter=list`
Expected: 3 tests PASS. The printed `L1 lite/full at ...` call counts at the existing spots equal the "Hall before" numbers (the portrait shares the screenshot mesh and the merged solids); record them under "Hall after".

- [x] **Step 6: Screenshots before/after**

Run: `SCREENSHOTS=1 E2E_PORT=4435 SHOT_DIR=screenshots/after bunx playwright test e2e/screenshots.spec.ts -g "P6 review poses" --workers=1`
Expected: `screenshots/after/p6/l1-about-*.png` show the portrait in a green neon frame left of the name, headline in at most two lines, tiles and subheadline unchanged; `profile-*.png` show the round badge. Check the full-tier 1440x900 and 2560x1440 shots: the backdrop must not bloom into a white block. If it does, lower `PHOTO_BRIGHTNESS` in 0.05 steps (unit tests do not pin the value) and re-capture. Re-run the Task 5 Step 7 diff loop for `l1-plaza` and `l3-arrival`; both stay within the threshold (the About face is not in those poses; if `l1-plaza` shows the hall at a size, the diff is limited to that panel: confirm by eye and note it in the PR). Attach before/after `l1-about` and `profile` sets to the PR.

- [x] **Step 7: Commit**

```bash
bun run verify:quick
E2E_PORT=4435 bun run e2e:changed
rtk git add src/experience/floors/lobby/hallContent.ts src/experience/floors/lobby/HighlightsHall.tsx tests/unit/hall-content.test.ts e2e/highlights.spec.ts docs/superpowers/plans/2026-10-13-r5-p6-measurements.md
rtk git commit -m "feat: owner portrait in a neon frame on the Highlights Hall About me station"
```

Rollback: revert; the About face returns to the centered name and headline, and the atlas to three cells.

### Task 9: README, owner check on the Windows PC, final verification and PR

**Files:**
- Modify: `README.md` ("## Performance" section)
- Create: `docs/superpowers/plans/2026-10-13-r5-p6-elevator-ride-pageview-icon.md` (a copy of this plan, per AGENTS "Write one before starting a phase")
- Modify: `docs/superpowers/plans/2026-10-13-r5-p6-measurements.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the PR.

- [x] **Step 1: README: how to check the elevator on any device**

Append to the "## Performance" section of `README.md`:

```markdown
The elevator never skips its ride: each frame adds at most 1/30 s of ride time (1/20 s on steadily slow devices), and on a first visit the car waits with closed doors (at most 1.5 s) until the new floor's shaders are compiled and its text is set. To check a device, open any 3D route with `?perf=1` (for example `/en?perf=1`), open the browser console (F12) and ride: every ride prints one `[hq ride]` line with the dolly frames, car heights, biggest jump, longest frame, wait and shaders compiled while moving. Good: at least 12 car heights, biggest jump at most 25% of the trip, "0 shaders compiled while moving".
```

- [x] **Step 2: Copy the plan into the repo**

```bash
cp /Users/shinyq/.copilot/session-state/d439b68f-b2e6-4b77-9feb-f9099e8cd824/files/plans/r5-p6-elevator-ride-pageview-icon.md docs/superpowers/plans/2026-10-13-r5-p6-elevator-ride-pageview-icon.md
grep -c "$(printf '\342\200\224')" docs/superpowers/plans/2026-10-13-r5-p6-elevator-ride-pageview-icon.md README.md AGENTS.md || true
```
Expected: every count is `0` (no em dashes).

- [x] **Step 3: Full local verification**

```bash
rm -rf .next
bun run verify:quick
E2E_PORT=4435 bun run e2e:changed
E2E_PORT=4435 bunx playwright test e2e/ride.spec.ts --reporter=list
```
Expected: `verify:quick` green (typecheck, lint, every unit test, build); `e2e:changed` runs at least `experience`, `ride`, `career`, `hud`, `highlights`, `missions`, `drawer-solid`, `walk` and passes; the ride spec prints the "after" lines. Copy them into the measurements file under "After" next to the Task 1 "Before" line, plus the Task 5 and Task 8 A/A, A/B and draw-call numbers.

- [x] **Step 4: Lighthouse budgets unchanged**

Nothing here runs on the Page View path (HUD, 3D chunk and lazy hall atlas only). Confirm on the PR's `Lighthouse CI` job (LCP 2000 ms, CLS 0.01, TBT 200 ms, JS 240 KB, CSS 20 KB, fonts 60 KB, HTML 80 KB): all green. The 3D path gains about 6 KB (badge, 160 px webp) at HUD mount and about 20 KB (320 px webp) when the rover heads for the hall; note both in the PR for P4's 3D bytes gate.

- [x] **Step 5: Push and open the PR**

```bash
rtk git add README.md docs/superpowers/plans/2026-10-13-r5-p6-elevator-ride-pageview-icon.md docs/superpowers/plans/2026-10-13-r5-p6-measurements.md
rtk git commit -m "docs: elevator ride check with ?perf=1 and the P6 plan"
rtk git push -u origin r5-p6-elevator-ride-pageview-icon
gh pr create --title "R5 P6: smooth elevator rides, Page view icon, owner photo in 3D" --body-file docs/superpowers/plans/2026-10-13-r5-p6-measurements.md
```

Then edit the PR body (web UI or `gh pr edit --body-file`) so it contains, in this order:
1. Owner reports quoted verbatim (elevator, Page view icon, photo).
2. Root cause in three bullets (0.25 s frame clamp versus a 0.8 s dolly; floor mount, compile and typeset at ride start; ANGLE/Direct3D compile cost on Windows).
3. Before/after table from the measurements file: 6x throttled ride L1 to L3 (`distinctY`, `maxStep`, `rideMs`, `movingFrames`), unthrottled `lastRide` (`held`, `programs`), L1 draw calls at every hall spot (lite, full).
4. Look gate: the six A/A and A/B numbers for `l1-plaza` and `l3-arrival` with the threshold rule.
5. Screenshots: before/after `topbar` (3 sizes), `profile` (3 sizes), `l1-about` (3 sizes).
6. "Owner check on the Windows PC" (Step 6 text).
7. Cross-workstream notes (copy the table from this plan).

- [x] **Step 6: Owner check on the Windows PC (put in the PR and in the hand-off message)**

1. After the deploy, on the Windows PC (Brave, 2560x1440), open `https://kurniadi.pages.dev/en?perf=1` in a fresh window.
2. Press F12 and open the Console tab.
3. Press Boot rover and let the intro play.
4. On the elevator panel click L3 Work, then RF About, then L1 Home. Watch the car: it should glide up and down, never jump.
5. Each ride prints a line such as `[hq ride] L1 to L3: 19 dolly frames, 19 car heights, biggest jump 14% of the trip, longest frame 120 ms, waited 0.40 s, 0 shaders compiled while moving, 3.10 s in total`.
6. Good: at least 12 car heights and a biggest jump of at most 25% on every line; the first ride to a floor may say "waited" up to 1.50 s, later rides about 0. Send a screenshot of the console if any line says "(gave up)" or shows fewer than 12 car heights.

- [x] **Step 7: Clean up**

```bash
rm -rf screenshots/before screenshots/before2 screenshots/after
```
(Attach the images to the PR first; `screenshots/` is gitignored, nothing to commit.)

---

## Self-review

**1. Spec coverage**

| Requirement | Task |
|---|---|
| Failing unit test reproducing the skip, then a ride clock with a small per-frame cap (about 1/30 s) | Task 2 Steps 1 to 5 (`RIDE_CAP.min` 1/30; adaptive up to 1/20 only for steadily slow devices so CI and slow phones keep real-time rides) |
| Same cap for camera springs during rides | Task 2 Step 7 |
| Prepare the destination during `boarding`/`closing` (mount + precompile via P2's utility, fallback if P2 has not merged), hold `moving` until ready or 1.5 s | Tasks 3 and 4 (`precompileScene(gl, scene, camera, root?)` compatible with P2's assumed 3-argument signature; rebase note), Task 5 wiring |
| Troika typesetting of the destination completes before `moving` | Task 4 (`trackTextSync`, BatchedText members included) and `destinationReady` (Task 3) |
| e2e under 6x CPU throttle: >= 12 distinct car Y values, total ride time within bounds; reduced motion keeps its 150 ms cut | Task 1 (red on main), Task 2 (green), Task 5 (gate and precompile check) |
| `?perf=1` instructions for the Windows PC | Task 5 (console line), Task 9 Steps 1 and 6 |
| Page view icon left of the label, desktop, tablet own row and phone, matching icon style, aria-hidden, label and EN/ID unchanged, screenshots at 3 sizes | Task 6 (one `ViewActions` serves all three layouts; 1024 px ID check) |
| Photo: round HUD badge from `public/brand/kurniadi-photo-{160,320,640}.webp` (generate if P1 has not) | Task 7 |
| Photo: Highlights Hall About me station in a neon frame, lazy texture, sized for budgets, disposed on unmount, within L1 cap 140, screenshots before/after | Task 8 (same atlas and merged solids: 0 extra draw calls; disposal through the existing atlas hook) |
| Aesthetic gate with thresholds at 1440x900 full, 2560x1440 full, 390x844 lite; rollback notes | Task 1 Step 6 (A/A), Task 5 Step 7 (gate and rollback), Tasks 6 to 8 (intended changes, before/after) |
| Measure before and after, numbers in the PR body | Task 1 Step 5, Task 5 Step 5, Task 8 Steps 1 and 5, Task 9 Steps 3 and 5 |
| Budgets (Lighthouse, draw calls) | Task 5 Step 6, Task 8 Step 5, Task 9 Step 4 |
| README, AGENTS.md, spec appendices | Task 5 Step 8 (02, 03, 08, AGENTS), Task 6 Step 5 (04), Task 7 Step 6 (AGENTS, 04, 07), Task 9 Step 1 (README) |
| Port 4435, cross-workstream conflicts and rebase notes | Global Constraints, conflict table |

**2. Placeholder scan:** no "TBD", "TODO" or "similar to Task N"; every code step has the code; the measurements file is filled from command output by design (its "(paste ...)" line is an instruction for a recorded number, not missing code).

**3. Type consistency:** `advanceRide(ride, frameDt, { atDoor, reduced, ready?, cap? })` is the same in Tasks 2, 3 and 5; `RIDE_CAP`, `rideCap`, `trackFrameDt`, `TYPICAL_FRAME_DT`, `PREPARE_TIMEOUT` are defined in `elevator.ts` and used with those names in the Director, CameraDirector, `rideStats.ts` and the tests; `beginFloorPrep`/`finishFloorPrep`/`endFloorPrep`/`floorReady`/`destinationReady`/`textStarted`/`textDone`/`ridePrep.lastRide` match between `ridePrep.ts`, `Tower.tsx`, `textSync.ts`, `FloorLevel.tsx`, the Director and `e2e/ride.spec.ts`; `RideSummary` fields (`distinctY`, `programs`, `timedOut`, `held`) match `RideSummaryLike` in the spec; `shotQuadBuffers(quads, cells)` changed in one place (Task 8) with its only caller (`ShotWall`) and its test; `brandPhotoSrc(320)` is the one source for `PHOTO_SRC`, and the badge uses `brandPhotoSrc(160)`.

## Open risks

- **SwiftShader under 6x throttle in CI** can be slow enough to approach the 300 s test timeout (two workers per shard). Mitigation: `test.slow()`, one ride only, a 60 s upper bound on the ride itself. If CI shards still time out, do not skip the test (no conditional skips for slowness): lower the CI throttle to 4x (`const RATE = process.env.CI ? 4 : 6`) and keep 6x locally, and record both numbers in the PR.
- **`programs === 0`** may fail if a floor creates a material after mount (lazy textures, key remounts). Task 5 Step 5 gives the diagnosis path; the fix is to precompile that object too, not to relax the test.
- **Troika sync counts** can stay above zero if a font fails to load; the gate then waits the full 1.5 s on that floor's rides. Acceptable (no skip, bounded); visible in the `[hq ride]` line as "(gave up)".
- **Wait time on first visits** adds up to 1.5 s to the first ride to each floor on slow GPUs (missions and walks included). Trade-off chosen by the owner's report (smoothness over speed); later rides do not wait.
- **Full-tier bloom on the portrait backdrop** may glow more than the screenshots; `PHOTO_BRIGHTNESS` is the knob (Task 8 Step 6). `ctx.filter` is unsupported on older Safari; there the portrait draws at full brightness (lite tier on phones has no bloom, so the visible effect is limited to desktop Safari full tier).
- **Headline length** after P5's CV refresh may exceed two lines beside the portrait; the unit test fails loudly, and the fix is a smaller `fontSize` for the headline (0.26), not moving the portrait.
- **Rebase order with P2 and P7**: P2 owns `precompile.ts` and floor visibility rules; P7 rewrites `CameraDirector`. Follow the conflict table; re-run `bunx vitest run tests/unit/elevator.test.ts tests/unit/floor-visibility.test.ts tests/unit/precompile.test.ts` and `e2e/ride.spec.ts` after every rebase.
