# Free Camera Rotation, Wheel Zoom and First-Person View Implementation Plan (Round 5, P7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visitors turn the camera all the way around the rover on every floor (L2 included), tilt it from just above the floor to near top-down, zoom with the mouse wheel, trackpad scroll and pinch instead of changing floors, and zoom all the way in to drive in a first-person view through the rover's eyes, while every third-person pose that exists today renders the same pixels.

**Architecture:** All math lives in pure modules that Vitest runs in node: `camera/rigs.ts` (orbit offsets, pitch limits, the 360 degree L2 rig, forwards, scrub sign), `camera/collision.ts` (pull a low camera in along the view ray), `camera/firstPerson.ts` (eye pose, eased blend, body opacity, when to hold third person) and `camera/orbit.ts` (yaw, pitch, zoom, the zoom "push" that flips into first person, the 0 to 1 `blend`). `CameraDirector` keeps smoothing the third-person pose exactly as today and then mixes that smoothed pose toward the eye pose by `blend`, so both glides are continuous and `blend = 0` is byte-for-byte today's camera. The Director publishes `roverRuntime.driving` so the camera holds third person during autopilot; the rover body fades with hashed alpha (`alphaHash`, set once at mount: no recompiles, no sorting change, no extra draw calls).

**Tech Stack:** Next.js 16 static export, React 19.3, three 0.186, @react-three/fiber 9, @react-three/drei 10, zustand 5, Vitest 5 (node environment), Playwright 1.64 on SwiftShader, Bun 1.4.

## Global Constraints

- No em dashes (U+2014) anywhere: code, comments, copy, docs, commits, PR text (a unit test scans the repo). Use commas, colons, parentheses or "to".
- The aesthetic must not change. Every third-person pose that exists before this work must match after it: desktop full 1440x900, desktop full 2560x1440 and phone lite 390x844, same poses, threshold **at most 0.5% of pixels differ by more than 24/255 on any channel** (`e2e/camera-visual.spec.ts`, Task 1 and Task 11). Rollback: revert the PR; the only shared-look touch points are `alphaHash` on the rover body (Task 7) and the camera near/far/fog switch (Task 8), both gated on `blend > 0`.
- Never remove the rover, the neon look, bloom, holograms, missions or the intro. The intro, the hologram view and view zones behave as today.
- Render budgets: under 150 draw calls and under 30k triangles per floor; L1 cap 140, RF cap 80; first person included (no extra draw calls: the hidden body draws fewer).
- Lighthouse CI budgets stay green: LCP 2000 ms, CLS 0.01, TBT 200 ms, JS 240 KB, CSS 20 KB, fonts 60 KB, HTML 80 KB. All code here is in the lazy 3D chunk; only a few message strings grow.
- Measure before and after with the same method (`e2e/camera-visual.spec.ts` metrics JSON) and record the numbers in the PR body.
- Every user-facing string is EN and ID with identical keys in `messages/en.json` and `messages/id.json`; spoken dialog lines are at most 110 characters (`tests/unit/dialog-copy.test.ts`).
- Pure modules (`rigs`, `orbit`, `collision`, `firstPerson`, `intents`, `fade`) stay free of React; `fade.ts` only touches the three objects it is given.
- No physics dependency and no new npm dependency.
- The wheel never changes floors. Floors change with PageUp/PageDown, the elevator panel, the call pads and (unchanged) the fast vertical one-finger swipe on touch.
- Reduced motion: an instant cut between third and first person.
- E2E port for this workstream: `E2E_PORT=4436`. Never run two e2e suites at once on one machine; 2 workers locally.
- Work in a fresh worktree of `ShinyQ/ShinyQ-HQ` from `origin/main` (main was `f61fbba` when this plan was written). The folder `files/hq-local` is a read-only reference: never modify it.
- One PR for P7, conventional commits, do not merge without the owner. Update `README.md`, `AGENTS.md` and spec appendices 02 and 03.

## Owner's requests (verbatim) and decisions

- "lots of also asking the camera view can be rotated all user want without limitation but i suggest there should still limit like looking from down"
- "Can you make when zoom in its not goes to elevator? instead make it zoom in and out when the user go zoom in and more it will end up goes 1st person view"

Confirmed decisions (owner): full 360 degree yaw on every floor including L2 (today `RAIL_MAX_YAW` 35 degrees in `src/experience/camera/orbit.ts:37`; the L2 rail becomes an orbit around the rover that opens on today's side view); pitch from just above the floor (never under it) to near top-down (today `PITCH_RANGE` +-0.16 rad, `orbit.ts:35`); zoom clamped and the camera kept above the floor, on the slab when low and out of obstacles (pull-in along the view ray, no physics); drag, Q/E, keys and two-finger touch rotate; pinch zooms; the reset button restores the default view; the mouse wheel, trackpad scroll and pinch zoom instead of changing floors; zooming in past the closest third-person distance glides into first person, the body fades out, drag and keys look around with pitch limited, WASD drives where you look (`rover/movement.ts` `cameraRelative`), zooming out returns; point-and-go, "!" hints and the dialog work in first person; autopilot drives and elevator rides pull back to third person and restore first person afterwards; reduced motion cuts; touch pinches in and out; no extra draw calls; near plane and fog tuned for first person only.

Coordinator defaults taken by this plan (reversible, listed in the PR body): `R`/`F` tilt the view and `+`/`-` zoom (keyboard path into first person); the fast vertical one-finger swipe on touch still rides the elevator (only the wheel was in scope); on touch, tilting stays on the two-finger vertical drag; rooms (drawer open), the hologram, teleport beams and missions also hold third person (the drawer layout frames the rover); first person far plane 72 u and fog 14 to 64 u (third person keeps 0.5 / 600 and its fog ranges).

REPORT.md references: draw-call budget row and F5.2 (L1 is closest to the cap and its count depends on the view, so first person gets its own budget check on every floor), F5.4 and spec gap 8 (counts are only measured at settled spots; first person is a new spot and gets gated), F5.6 (no shader precompile: the rover's hashed-alpha programs therefore compile once at rover mount during the boot, never at fade time; P2's precompile picks them up because they are in the scene), measurement plan row "Shader programs per floor" (P4 gate: see conflicts below).

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/experience/camera/rigs.ts` | Modify | `orbitOffset` (shared spherical offset), `PITCH_LIMITS` widened to [0.06, 1.45], `baseElevation`, `pitchRange`, `followForward`, `railForward`, `scrubSign`, 360 degree `railPose` with pitch, `RigKind` gains `"first"` (fog key) |
| `src/experience/camera/collision.ts` | Create | `CAMERA_CLEARANCE`, `cameraBlocked`, `clampCamera`: cheap camera collision against floor height, slab bounds and obstacle rects |
| `src/experience/camera/firstPerson.ts` | Create | `FIRST_PERSON` constants, `FIRST_PERSON_FOV`, `CAMERA_NEAR`, `CAMERA_FAR`, `firstPersonPose`, `easeBlend`, `blendPoses`, `roverOpacity`, `viewSuspended` |
| `src/experience/camera/orbit.ts` | Modify (full rewrite) | Orbit state: unbounded yaw and rail yaw, per-rig pitch range, zoom push into and out of first person, look pitch, eased `blend`, reset leaves first person, no auto-face in first person |
| `src/experience/camera/CameraDirector.tsx` | Modify (full rewrite) | Per-frame composition: keys (Q/E yaw, R/F tilt), collision clamp, first-person blend, near/far/FOV/fog, probes |
| `src/experience/scene/settings.ts` | Modify | `FOG_RANGE.first` |
| `src/experience/input/intents.ts` | Modify | Wheel classifies to zoom or rotate (no elevator), `wheelZoomFactor`, `+`/`-` zoom keys, `R`/`F` pitch keys; `createWheelGate` removed |
| `src/experience/input/useInputSources.ts` | Modify | Wheel emits zoom; R/F held keys |
| `src/experience/rover/fade.ts` | Create | `prepareFade`, `setFadeOpacity` (hashed-alpha body fade) |
| `src/experience/rover/Rover.tsx` | Modify | Fade and hide the body by `roverOpacity(cameraBlend)`; clicks and hovers pass through in first person |
| `src/experience/rover/runtime.ts` | Modify | Probes `cameraMode`, `cameraBlend`, `cameraZoom`, `cameraLook`, `cameraElevation`; `driving` |
| `src/experience/scene/Director.tsx` | Modify | Publish `roverRuntime.driving`; L2 scrub direction follows the view (`scrubSign`) |
| `src/hud/ViewControls.tsx` | Modify | `data-onboard="view"` for the tutorial spotlight |
| `src/hud/dialog/onboarding.ts`, `src/hud/dialog/OnboardingLayer.tsx` | Modify | New "camera" tutorial line (look around, zoom, first person) |
| `messages/en.json`, `messages/id.json` | Modify | `hud.hintFine`, `hud.hintCoarse`, `hud.canvasDescription`, `dialog.onboarding.cameraFine`, `dialog.onboarding.cameraCoarse` |
| `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts` | Modify | New `camera` spec, mapping rules, visual harness rule |
| `e2e/camera-visual.spec.ts` | Create | Opt-in look gate: third-person baseline and compare, first-person captures, metrics JSON |
| `e2e/camera.spec.ts` | Create | Wheel zoom, first person, pitch limits, reduced motion, autopilot and ride pull-back, point-and-go and hints in first person, L2 360, render budget, touch pinch |
| `e2e/experience.spec.ts`, `e2e/onboarding.spec.ts`, `e2e/screenshots.spec.ts` | Modify | Wheel test, L2 test, the new tutorial line |
| `tests/unit/rigs.test.ts`, `orbit.test.ts`, `intents.test.ts`, `gestures.test.ts`, `onboarding.test.ts` | Modify | Updated and new unit tests |
| `tests/unit/camera-collision.test.ts`, `first-person.test.ts`, `rover-fade.test.ts` | Create | New unit tests |
| `README.md`, `AGENTS.md`, `docs/superpowers/specs/agent-hq/03-rover-camera-input.md`, `02-interaction-and-states.md` | Modify | Docs |
| `docs/superpowers/plans/2026-10-13-camera-freedom-first-person.md` | Create | Copy of this plan (AGENTS.md: plans live in the repo) |

## Cross-workstream conflicts and rebase notes

| Other workstream | Shared files | What to do |
|---|---|---|
| P6 elevator ride smoothness + Page view icon | `src/experience/scene/Director.tsx` (ride clock cap, destination prep) | P7 changes two isolated lines: the scrub `dx` (search `scrubTarget(controller.pose.x`) and one line after `roverRuntime.tilt = pose.tilt;`. On rebase keep both sides. P7 holds third person for the whole `s.ride !== null` window, so P6's longer `boarding`/`closing` hold needs nothing from P7. The ride pull-back e2e (`camera.spec.ts`) waits on state, not time. |
| P3 CPU, lifecycle, memory (input and palette) | `src/experience/input/useInputSources.ts`, `scene/Director.tsx` (store mirror only on change, near the `driving` line) | P7 rewrites only `onWheel`, the held-key condition and the imports. If P3 lands first, re-apply those three hunks on top. If P3 pauses rendering while the palette covers the canvas, first person simply freezes with it (the palette phase does not hold third person). |
| P2 GPU (look-preserving) | `src/experience/scene/settings.ts` (P2: `renderBudget`, bloom), `rover/Rover.tsx` only if P2 touches the rover | P7 only adds `first` to `FOG_RANGE`. If P2 builds its own screenshot-diff tool, keep `e2e/camera-visual.spec.ts` anyway (it owns the camera poses) or port its compare step onto P2's tool with the same threshold. If P2 lands first, take the Task 1 baseline from the new main. P2's `compileAsync` precompile includes the rover's hashed-alpha programs automatically. |
| P4 measurement and CI gates | `scripts/e2e-plan.ts` (`ALL_SPECS`, `RULES`), `tests/unit/e2e-plan.test.ts`, `e2e/hq.ts` (`expectRenderBudget` split) | Merge the array entries by hand. P7 adds up to 4 shader programs (the rover's basic, basic+map, standard and instanced standard materials with `ALPHA_HASH`); if P4's "programs per floor, baseline + 0" gate is already on main, raise its baseline in the P7 PR with this justification. If P4 changes `drawCalls` to scene-only counts, the first-person caps in `camera.spec.ts` still apply (they are upper bounds). |
| P1 Page View and delivery, P5 CV refresh | `messages/en.json`, `messages/id.json`, `README.md`, `AGENTS.md` | Different keys and sections; resolve JSON conflicts by keeping both sides. |

---

### Task 1: Third-person look baseline harness

**Files:**
- Create: `e2e/camera-visual.spec.ts`
- Create: `docs/superpowers/plans/2026-10-13-camera-freedom-first-person.md` (copy of this file)
- Modify: `scripts/e2e-plan.ts` (the screenshot rule near the top of `RULES`)
- Modify: `tests/unit/e2e-plan.test.ts` (the "knows every spec" filter, one new assertion)

**Interfaces:**
- Consumes: `asReturningVisitor`, `waitForCameraSettle`, `waitForFrames`, `waitForHQ`, `waitForPhase`, `waitForSceneLive` from `e2e/hq.ts`; `window.__hq.rover.drawCalls/triangles`; after Task 8 also `window.__hq.rover.cameraBlend`.
- Produces: `CAMERA_SHOTS=baseline|compare` captures in `screenshots/camera/<mode>/` (`<floor>-<pose>-<w>x<h>.png`, `metrics-<floor>-<w>x<h>.json`, compare mode also `fp-<floor>-<w>x<h>.png` and `metrics-fp-<w>x<h>.json`). `screenshots/` is already gitignored.

- [ ] **Step 1: Create the worktree and copy the plan**

```bash
# Your normal clone of ShinyQ/ShinyQ-HQ (never files/hq-local); clone it first if it does not exist.
[ -d ~/code/ShinyQ-HQ ] || git clone https://github.com/ShinyQ/ShinyQ-HQ.git ~/code/ShinyQ-HQ
cd ~/code/ShinyQ-HQ
rtk git fetch origin
rtk git worktree add ../hq-p7 -b feat/camera-first-person origin/main
cd ../hq-p7
bun install
mkdir -p docs/superpowers/plans
cp /Users/shinyq/.copilot/session-state/d439b68f-b2e6-4b77-9feb-f9099e8cd824/files/plans/r5-p7-camera-freedom-first-person.md docs/superpowers/plans/2026-10-13-camera-freedom-first-person.md
```

Expected: `Preparing worktree (new branch 'feat/camera-first-person')`, then `bun install` ends with `packages installed` or `no changes`.

- [ ] **Step 2: Write the failing unit test**

In `tests/unit/e2e-plan.test.ts`, change the filter in "knows every spec in e2e/" and add a test after it:

```ts
  it("knows every spec in e2e/", () => {
    const onDisk = readdirSync("e2e")
      .filter((f) => f.endsWith(".spec.ts") && f !== "screenshots.spec.ts" && f !== "pageview-visual.spec.ts" && f !== "camera-visual.spec.ts")
      .map((f) => f.replace(/\.spec\.ts$/, ""))
      .sort();
    expect(onDisk).toEqual([...ALL_SPECS].sort());
  });

  it("never runs the opt-in camera look gate from e2e:changed", () => {
    expect(specsForChanges(["e2e/camera-visual.spec.ts"]).specs).toEqual([]);
  });
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bunx vitest run tests/unit/e2e-plan.test.ts`
Expected: FAIL in "never runs the opt-in camera look gate" (the path is unmatched, so the plan falls back to the smoke specs: `expected [ 'boot-first', 'deploy', ... ] to deeply equal []`).

- [ ] **Step 4: Add the rule and the harness**

In `scripts/e2e-plan.ts` replace the screenshot rule:

```ts
  { test: /^e2e\/screenshots\.spec\.ts$|^e2e\/pageview-visual\.spec\.ts$|^e2e\/camera-visual\.spec\.ts$/, specs: [] },
```

Create `e2e/camera-visual.spec.ts`:

```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { asReturningVisitor, waitForCameraSettle, waitForFrames, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";
import en from "../messages/en.json";

/**
 * Opt-in look gate for the round 5 camera work (P7). `CAMERA_SHOTS=baseline` captures third-person
 * poses that exist before and after the change; `CAMERA_SHOTS=compare` captures them again and fails
 * when more than MAX_SHARE of the pixels differ by more than DELTA on any channel. Compare mode also
 * saves first-person captures for review. HUD hidden, reduced motion on (no bob, pulses or motes),
 * returning visitor, a fresh context per pose. Metrics (draw calls, triangles) go next to the images.
 */
const MODE = process.env.CAMERA_SHOTS as "baseline" | "compare" | undefined;
test.skip(!MODE, "Set CAMERA_SHOTS=baseline or CAMERA_SHOTS=compare");
test.describe.configure({ timeout: 300_000 });

const DIR = "screenshots/camera";
const MAX_SHARE = 0.005;
const DELTA = 24;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, tier: "full", touch: false },
  { name: "wide", width: 2560, height: 1440, tier: "full", touch: false },
  { name: "phone", width: 390, height: 844, tier: "lite", touch: true },
] as const;
type Viewport = (typeof VIEWPORTS)[number];

const FLOORS = [
  { floor: "L1", path: "/en" },
  { floor: "L2", path: "/en/journey" },
  { floor: "L3", path: "/en/labs" },
  { floor: "L4", path: "/en/library" },
  { floor: "RF", path: "/en/contact" },
] as const;

type Pose = "default" | "rotated" | "zoomed";
/** L2's rotate step changes on purpose (35 degree clamp before, 360 degrees after), so L2 keeps only its default and zoomed poses. */
const posesFor = (floor: string): Pose[] => (floor === "L2" ? ["default", "zoomed"] : ["default", "rotated", "zoomed"]);

type Metrics = { drawCalls: number; triangles: number; diffShare?: number };

async function open(browser: Browser, v: Viewport, path: string) {
  const context = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 1,
    hasTouch: v.touch,
    isMobile: v.name === "phone",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=${v.tier}`);
  await waitForHQ(page);
  await waitForPhase(page, "explore", 60_000);
  await waitForSceneLive(page);
  return { context, page };
}

async function apply(page: Page, pose: Pose, v: Viewport) {
  if (pose === "rotated") {
    await page.getByRole("button", { name: en.hud.view.rotateRight }).click();
  } else if (pose === "zoomed") {
    // Ctrl+wheel is the trackpad pinch path, which zooms both before and after P7 (factor exp(-0.224) = 0.8).
    await page.mouse.move(v.width / 2 + 120, v.height / 2);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -112);
    await page.keyboard.up("Control");
  }
}

async function capture(page: Page): Promise<{ png: Buffer; metrics: Metrics }> {
  await waitForCameraSettle(page);
  await page.evaluate(() => document.fonts.ready);
  await waitForFrames(page, 20);
  await page.addStyleTag({ content: "[data-testid='hud']{visibility:hidden!important}" });
  await waitForFrames(page, 5);
  const metrics = await page.evaluate(() => {
    const r = (window as unknown as { __hq: { rover: { drawCalls: number; triangles: number } } }).__hq.rover;
    return { drawCalls: r.drawCalls, triangles: r.triangles };
  });
  return { png: await page.screenshot(), metrics };
}

/** Share of pixels that differ by more than DELTA on any channel, decoded in a blank page (no site CSP). */
async function diffShare(browser: Browser, a: Buffer, b: Buffer): Promise<number> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    return await page.evaluate(
      async ({ a, b, delta }) => {
        const decode = async (b64: string) => {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(bitmap, 0, 0);
          return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        };
        const [x, y] = await Promise.all([decode(a), decode(b)]);
        if (x.width !== y.width || x.height !== y.height) return 1;
        let off = 0;
        for (let i = 0; i < x.data.length; i += 4) {
          if (Math.abs(x.data[i] - y.data[i]) > delta || Math.abs(x.data[i + 1] - y.data[i + 1]) > delta || Math.abs(x.data[i + 2] - y.data[i + 2]) > delta) off++;
        }
        return off / (x.width * x.height);
      },
      { a: a.toString("base64"), b: b.toString("base64"), delta: DELTA },
    );
  } finally {
    await context.close();
  }
}

for (const v of VIEWPORTS) {
  for (const { floor, path } of FLOORS) {
    test(`third-person poses on ${floor} at ${v.width}x${v.height} (${v.tier})`, async ({ browser }) => {
      const out = `${DIR}/${MODE}`;
      mkdirSync(out, { recursive: true });
      const all: Record<string, Metrics> = {};
      for (const pose of posesFor(floor)) {
        const { context, page } = await open(browser, v, path);
        await apply(page, pose, v);
        const { png, metrics } = await capture(page);
        await context.close();
        const name = `${floor}-${pose}-${v.width}x${v.height}`;
        writeFileSync(`${out}/${name}.png`, png);
        all[name] = metrics;
        if (MODE === "compare") {
          const share = await diffShare(browser, readFileSync(`${DIR}/baseline/${name}.png`), png);
          all[name] = { ...metrics, diffShare: share };
          expect(share, `${name}: share of changed pixels`).toBeLessThanOrEqual(MAX_SHARE);
        }
      }
      writeFileSync(`${out}/metrics-${floor}-${v.width}x${v.height}.json`, JSON.stringify(all, null, 2));
    });
  }
}

for (const v of VIEWPORTS) {
  test(`first-person captures for review at ${v.width}x${v.height} (${v.tier})`, async ({ browser }) => {
    test.skip(MODE !== "compare", "first person exists only after P7");
    const out = `${DIR}/compare`;
    mkdirSync(out, { recursive: true });
    const all: Record<string, Metrics> = {};
    for (const { floor, path } of FLOORS) {
      const { context, page } = await open(browser, v, path);
      await page.mouse.move(v.width / 2, v.height / 2);
      // From the default zoom the third notch enters first person; later notches are ignored there.
      for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -120);
      await page.waitForFunction(() => (window as unknown as { __hq: { rover: { cameraBlend: number } } }).__hq.rover.cameraBlend === 1, null, { timeout: 30_000 });
      const { png, metrics } = await capture(page);
      await context.close();
      const name = `fp-${floor}-${v.width}x${v.height}`;
      writeFileSync(`${out}/${name}.png`, png);
      all[name] = metrics;
    }
    writeFileSync(`${out}/metrics-fp-${v.width}x${v.height}.json`, JSON.stringify(all, null, 2));
  });
}
```

- [ ] **Step 5: Run the unit test to verify it passes**

Run: `bunx vitest run tests/unit/e2e-plan.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 6: Capture the baseline (before any camera change)**

Run:

```bash
bun run build
E2E_PORT=4436 CAMERA_SHOTS=baseline bunx playwright test e2e/camera-visual.spec.ts --workers=1
ls screenshots/camera/baseline | wc -l
E2E_PORT=4436 bunx playwright test e2e/camera-visual.spec.ts --workers=1
```

Expected: the capture run ends with `15 passed` and `3 skipped`; `ls ... | wc -l` prints `57` (14 PNG and 5 JSON per viewport); the run without `CAMERA_SHOTS` reports `18 skipped`. Keep `screenshots/camera/baseline/` until Task 11 (it is gitignored). Copy the three `metrics-L1-*.json` numbers into a scratch note for the PR body.

- [ ] **Step 7: Commit**

```bash
rtk git add e2e/camera-visual.spec.ts scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts docs/superpowers/plans/2026-10-13-camera-freedom-first-person.md
rtk git commit -m "test: add the opt-in camera look gate and the P7 plan"
```

---

### Task 2: Rig math (360 degree L2 orbit, wide pitch limits, forwards, first-person fog)

**Files:**
- Modify: `src/experience/camera/rigs.ts` (`RigKind`, `PITCH_LIMITS`, `followPose`, `railPose`; new exports)
- Modify: `src/experience/scene/settings.ts` (`FOG_RANGE`)
- Test: `tests/unit/rigs.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (all in `camera/rigs.ts`):
  - `type RigKind = "intro" | "follow" | "rail" | "focus" | "first"` (`"first"` is only a fog key; `selectRig` never returns it)
  - `PITCH_LIMITS = [0.06, 1.45] as const`
  - `orbitOffset(offset: Vec3, yaw: number, pitch: number): Vec3`
  - `baseElevation(cls: ViewportClass, rig: "follow" | "rail"): number`
  - `pitchRange(cls: ViewportClass, rig: "follow" | "rail"): [number, number]`
  - `followForward(cls: ViewportClass, yaw: number): Vec2`
  - `railForward(yaw: number): Vec2`
  - `scrubSign(railYaw: number): 1 | -1`
  - `railPose(cls, roverX, floorY, zoom = 1, roverZ = 0, yaw = 0, axisZ = 0, pitch = 0): CameraPose`
  - `sceneSettings(tier, "first").fog` is `{ near: 14, far: 64 }`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/rigs.test.ts` replace the import block with:

```ts
import { describe, expect, it } from "vitest";
import {
  baseElevation,
  followForward,
  followPose,
  forwardOf,
  INTRO_DURATION,
  INTRO_ORBIT,
  INTRO_SWEEP,
  introAngle,
  introPose,
  orbitOffset,
  PITCH_LIMITS,
  pitchRange,
  RAIL,
  railForward,
  railPose,
  railShift,
  reducedIntroPose,
  scrubSign,
  selectRig,
  springFactor,
} from "@/experience/camera/rigs";
import { sceneSettings } from "@/experience/scene/settings";
```

Replace the test "swings the rail camera around the rover" with:

```ts
  it("orbits the rail camera all the way around the rover, look-ahead included", () => {
    const pose = railPose("desktop", 10, 14, 1, 0, Math.PI / 6);
    expect(pose.position[0]).toBeCloseTo(10 + 15);
    expect(pose.position[2]).toBeCloseTo(30 * Math.cos(Math.PI / 6));
    expect(pose.target[0]).toBeCloseTo(10 + 4 * Math.cos(Math.PI / 6));
    expect(pose.target[2]).toBeCloseTo(-4 * Math.sin(Math.PI / 6));
    const behind = railPose("desktop", 10, 14, 1, 0, Math.PI);
    expect(behind.position[2]).toBeCloseTo(-30);
    expect(behind.target[0]).toBeCloseTo(6);
  });

  it("tilts the rail camera within the pitch limits and keeps the side view at pitch 0", () => {
    const radius = Math.hypot(RAIL.desktop.y, RAIL.desktop.z);
    const low = railPose("desktop", 0, 0, 1, 0, 0, 0, -5);
    expect(Math.asin(low.position[1] / radius)).toBeCloseTo(PITCH_LIMITS[0]);
    const high = railPose("desktop", 0, 0, 1, 0, 0, 0, 5);
    expect(Math.asin(high.position[1] / radius)).toBeCloseTo(PITCH_LIMITS[1]);
    expect(railPose("desktop", 10, 14, 1, 0, 0, 0, 0)).toEqual(railPose("desktop", 10, 14));
  });
```

Append a new `describe` at the end of the file:

```ts
describe("round 5 orbit limits", () => {
  it("keeps the default offsets exactly", () => {
    expect(orbitOffset([16, 18, 16], 0, 0)).toEqual([16, 18, 16]);
    expect(orbitOffset([0, 22, 30], 0, 0)).toEqual([0, 22, 30]);
  });

  it("tilts from just above the floor to near top-down on every rig and class", () => {
    expect(PITCH_LIMITS[0]).toBeGreaterThan(0);
    expect(PITCH_LIMITS[0]).toBeLessThan(0.1);
    expect(PITCH_LIMITS[1]).toBeGreaterThan(1.4);
    expect(PITCH_LIMITS[1]).toBeLessThan(Math.PI / 2);
    for (const cls of ["desktop", "tablet", "mobile"] as const) {
      for (const rig of ["follow", "rail"] as const) {
        const [lo, hi] = pitchRange(cls, rig);
        expect(baseElevation(cls, rig) + lo).toBeCloseTo(PITCH_LIMITS[0]);
        expect(baseElevation(cls, rig) + hi).toBeCloseTo(PITCH_LIMITS[1]);
        expect(lo).toBeLessThan(0);
        expect(hi).toBeGreaterThan(0);
      }
    }
  });

  it("gives the follow forward of a yaw without building a pose", () => {
    for (const yaw of [0, 0.7, Math.PI / 4, Math.PI, -2]) {
      const f = followForward("desktop", yaw);
      const g = forwardOf(followPose("desktop", [0, 0, 0], yaw));
      expect(f.x).toBeCloseTo(g.x);
      expect(f.z).toBeCloseTo(g.z);
    }
    // A quarter-turn step to the right looks west (-x).
    expect(followForward("desktop", Math.PI / 4).x).toBeCloseTo(-1);
  });

  it("steers the rail along the view and flips scrubs when the view is turned around", () => {
    expect(railForward(0).x).toBeCloseTo(0);
    expect(railForward(0).z).toBeCloseTo(-1);
    expect(railForward(Math.PI).z).toBeCloseTo(1);
    expect(scrubSign(0)).toBe(1);
    expect(scrubSign(0.5)).toBe(1);
    expect(scrubSign(Math.PI)).toBe(-1);
    expect(scrubSign(2 * Math.PI + 0.2)).toBe(1);
  });

  it("adds a first-person fog without changing the third-person ranges", () => {
    expect(sceneSettings("lite", "follow").fog).toMatchObject({ near: 38, far: 80 });
    expect(sceneSettings("lite", "rail").fog).toMatchObject({ near: 40, far: 95 });
    expect(sceneSettings("lite", "first").fog).toMatchObject({ near: 14, far: 64 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run tests/unit/rigs.test.ts`
Expected: FAIL with `SyntaxError`/`TypeError` style messages such as `orbitOffset is not a function` (the new exports do not exist yet).

- [ ] **Step 3: Implement the rig math**

In `src/experience/camera/rigs.ts`:

1. Change the rig kind:

```ts
/** `first` is only a fog key (first person); `selectRig` never returns it. */
export type RigKind = "intro" | "follow" | "rail" | "focus" | "first";
```

2. Replace the `PITCH_LIMITS` declaration and its comment:

```ts
/**
 * Absolute elevation limits for third-person cameras (owner request, round 5): from just above the
 * floor (about 3 degrees) to near top-down (about 83 degrees). Never under the floor.
 */
export const PITCH_LIMITS = [0.06, 1.45] as const;
```

3. Replace `followPose` (doc comment included) with:

```ts
/**
 * Spherical orbit offset: `yaw` (unbounded) turns `offset` around the vertical axis; `pitch` raises or
 * lowers it from its own elevation, clamped to PITCH_LIMITS. Exactly `offset` at yaw 0 and pitch 0.
 */
export function orbitOffset(offset: Vec3, yaw: number, pitch: number): Vec3 {
  const [ox, oy, oz] = offset;
  const ground = Math.hypot(ox, oz);
  const base = Math.atan2(oy, ground);
  const elevation = Math.max(PITCH_LIMITS[0], Math.min(PITCH_LIMITS[1], base + pitch));
  const radius = Math.hypot(ground, oy);
  // Exact default offset when the pitch is unchanged.
  const horizontal = elevation === base ? 1 : (radius * Math.cos(elevation)) / ground;
  const vertical = elevation === base ? oy : radius * Math.sin(elevation);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [(ox * c + oz * s) * horizontal, vertical, (-ox * s + oz * c) * horizontal];
}

/** Follow camera orbiting `target` (see `orbitOffset`). */
export function followPose(cls: ViewportClass, target: Vec3, yaw = 0, zoom = 1, pitch = 0): CameraPose {
  const { fov, offset } = FOLLOW[cls];
  const [rx, ry, rz] = orbitOffset(offset, yaw, pitch);
  return {
    position: [target[0] + rx * zoom, target[1] + ry * zoom, target[2] + rz * zoom],
    target,
    fov,
  };
}

/** Default elevation of a rig's camera above its target, radians. */
export function baseElevation(cls: ViewportClass, rig: "follow" | "rail"): number {
  if (rig === "rail") return Math.atan2(RAIL[cls].y, RAIL[cls].z);
  const [ox, oy, oz] = FOLLOW[cls].offset;
  return Math.atan2(oy, Math.hypot(ox, oz));
}

/** Pitch offsets (from the rig's default elevation) that keep its camera inside PITCH_LIMITS. */
export function pitchRange(cls: ViewportClass, rig: "follow" | "rail"): [number, number] {
  const base = baseElevation(cls, rig);
  return [PITCH_LIMITS[0] - base, PITCH_LIMITS[1] - base];
}

/** Horizontal forward of the follow camera at `yaw` (the same as `forwardOf(followPose(...))`). */
export function followForward(cls: ViewportClass, yaw: number): Vec2 {
  const [ox, , oz] = FOLLOW[cls].offset;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const x = -(ox * c + oz * s);
  const z = -(-ox * s + oz * c);
  const len = Math.hypot(x, z) || 1;
  return { x: x / len, z: z / len };
}
```

4. Replace `railPose` (doc comment included) and add the two helpers after it:

```ts
/**
 * L2 camera (round 5: a full orbit). At yaw 0 and pitch 0 it is the spec's side view, looking at
 * (roverX + 4, floor, road). `yaw` (unbounded) swings the camera and its look-ahead around the rover;
 * `pitch` tilts it within PITCH_LIMITS. `axisZ` is the road's z at the rover (the Career Road
 * meanders), so the camera follows the road's curves.
 */
export function railPose(cls: ViewportClass, roverX: number, floorY: number, zoom = 1, roverZ = 0, yaw = 0, axisZ = 0, pitch = 0): CameraPose {
  const { fov, y, z } = RAIL[cls];
  const shift = axisZ + railShift(roverZ - axisZ);
  const [ox, oy, oz] = orbitOffset([0, y, z], yaw, pitch);
  return {
    position: [roverX + ox * zoom, floorY + oy * zoom, shift + oz * zoom],
    target: [roverX + RAIL_LOOK_AHEAD * Math.cos(yaw), floorY, shift - RAIL_LOOK_AHEAD * Math.sin(yaw)],
    fov,
  };
}

/** Steering forward on L2: straight away from the camera, so W drives into the view and D along the road at yaw 0. */
export function railForward(yaw: number): Vec2 {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** A horizontal swipe on L2 moves toward the side of the screen it pulls from; turned around, the road runs the other way. */
export function scrubSign(railYaw: number): 1 | -1 {
  return Math.cos(railYaw) < 0 ? -1 : 1;
}
```

In `src/experience/scene/settings.ts` replace `FOG_RANGE` and its comment:

```ts
/**
 * Linear fog range per camera rig: the prototype's 38 to 80 on follow, tighter on the L2 rail, far for
 * the exterior intro. First person (round 5) keeps about the same visible distance around the rover as
 * the follow camera, measured from the rover's eyes instead of 29 u behind it.
 */
const FOG_RANGE: Record<RigKind, [number, number]> = {
  follow: [38, 80],
  focus: [38, 80],
  rail: [40, 95],
  intro: [90, 200],
  first: [14, 64],
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run tests/unit/rigs.test.ts tests/unit/lobby-title.test.ts tests/unit/labs-layout.test.ts tests/unit/roof-layout.test.ts tests/unit/highlights-layout.test.ts`
Expected: PASS (the layout tests call `followPose`, whose numbers must not change).

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: exit 0, no errors (`railPose` only gained an optional parameter).

- [ ] **Step 6: Commit**

```bash
rtk git add src/experience/camera/rigs.ts src/experience/scene/settings.ts tests/unit/rigs.test.ts
rtk git commit -m "feat(camera): 360 degree L2 orbit, wide pitch limits and first-person fog in the rig math"
```

---

### Task 3: Camera collision (above the floor, on the slab when low, out of obstacles)

**Files:**
- Create: `src/experience/camera/collision.ts`
- Test: `tests/unit/camera-collision.test.ts`

**Interfaces:**
- Consumes: `Vec3` from `camera/rigs.ts`, `Rect` from `experience/types.ts`, `buildFloorLayouts` (test only).
- Produces:
  - `CAMERA_CLEARANCE = { ground: 0.6, obstacle: 3.2, edge: 2.5, radius: 0.35 }`
  - `interface CameraWorld { obstacles: readonly Rect[]; bounds: Rect; floorY: number }`
  - `cameraBlocked(p: Vec3, w: CameraWorld): boolean`
  - `clampCamera(target: Vec3, camera: Vec3, w: CameraWorld, from: Vec3 = target): Vec3` (returns the same `camera` array when nothing blocks it)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/camera-collision.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CAMERA_CLEARANCE, cameraBlocked, clampCamera, type CameraWorld } from "@/experience/camera/collision";
import { followPose, railPose, type Vec3 } from "@/experience/camera/rigs";
import { buildFloorLayouts } from "@/experience/config";

const world: CameraWorld = {
  floorY: 0,
  bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
  obstacles: [{ minX: 4, maxX: 8, minZ: -2, maxZ: 2 }],
};

describe("camera collision", () => {
  it("never touches a camera above obstacle height (so the default poses never move)", () => {
    const cam: Vec3 = [16, 19, 16];
    expect(clampCamera([0, 1, 0], cam, world)).toBe(cam);
  });

  it("blocks under the floor, low outside the slab and inside obstacles up to their height", () => {
    expect(cameraBlocked([0, 0.2, 0], world)).toBe(true);
    expect(cameraBlocked([30, 1.5, 0], world)).toBe(true);
    expect(cameraBlocked([30, CAMERA_CLEARANCE.edge + 0.1, 0], world)).toBe(false);
    expect(cameraBlocked([6, 2, 0], world)).toBe(true);
    expect(cameraBlocked([4 - CAMERA_CLEARANCE.radius / 2, 2, 0], world)).toBe(true);
    expect(cameraBlocked([0, 2, 0], world)).toBe(false);
  });

  it("pulls a low camera in along the view ray, in front of the first obstacle", () => {
    const out = clampCamera([-2, 1, 0], [12, 2, 0], world, [0, 1, 0]);
    expect(cameraBlocked(out, world)).toBe(false);
    expect(out[0]).toBeLessThanOrEqual(4 - CAMERA_CLEARANCE.radius + 1e-6);
    expect(out[0]).toBeGreaterThan(3.4);
    expect(out[2]).toBeCloseTo(0);
    // Same line as before: the view direction does not change.
    expect((out[1] - 1) / (out[0] + 2)).toBeCloseTo((2 - 1) / 14);
  });

  it("keeps a low camera on the slab", () => {
    const out = clampCamera([14, 1, 0], [40, 2, 0], world);
    expect(out[0]).toBeLessThanOrEqual(20 + 1e-6);
    expect(out[0]).toBeGreaterThan(19);
  });

  it("keeps the wanted camera when the ray starts blocked", () => {
    const cam: Vec3 = [6, 1.5, 3];
    expect(clampCamera([6, 1, 0], cam, world)).toBe(cam);
  });

  it("leaves the default follow and L2 cameras alone on every floor", () => {
    const layouts = buildFloorLayouts(8);
    for (const layout of Object.values(layouts)) {
      const w: CameraWorld = { floorY: 0, bounds: layout.bounds, obstacles: layout.obstacles };
      for (const p of [layout.spawn, layout.approach]) {
        const follow = followPose("desktop", [p.x, 1, p.z]);
        expect(clampCamera(follow.target, follow.position, w)).toBe(follow.position);
        const rail = railPose("desktop", p.x, 0, 1, p.z);
        expect(clampCamera(rail.target, rail.position, w)).toBe(rail.position);
      }
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/camera-collision.test.ts`
Expected: FAIL with `Failed to resolve import "@/experience/camera/collision"`.

- [ ] **Step 3: Implement the module**

Create `src/experience/camera/collision.ts`:

```ts
import type { Rect } from "../types";
import type { Vec3 } from "./rigs";

/**
 * Cheap camera collision (owner request, round 5): no physics, just the floor height, the slab bounds
 * and the floor's obstacle rects as columns. Only cameras below `obstacle` height can be blocked, so
 * the default third-person poses (18 u and more above the rover) never move.
 */
export const CAMERA_CLEARANCE = {
  /** Lowest camera height above the floor (u). */
  ground: 0.6,
  /** Obstacles (walls, boards, pedestals) block the camera up to this height above the floor. */
  obstacle: 3.2,
  /** Outside the slab the camera stays above this height, so it never looks at the slab edge from below. */
  edge: 2.5,
  /** Distance kept from obstacle faces (u). */
  radius: 0.35,
} as const;

export interface CameraWorld {
  obstacles: readonly Rect[];
  bounds: Rect;
  floorY: number;
}

export function cameraBlocked(p: Vec3, w: CameraWorld): boolean {
  const h = p[1] - w.floorY;
  if (h < CAMERA_CLEARANCE.ground) return true;
  if (h >= CAMERA_CLEARANCE.obstacle) return false;
  const [x, , z] = p;
  const b = w.bounds;
  if (h < CAMERA_CLEARANCE.edge && (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ)) return true;
  const r = CAMERA_CLEARANCE.radius;
  return w.obstacles.some((o) => x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r);
}

const STEPS = 32;
const REFINE = 6;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Where along target to camera (0 to 1) the point nearest `from` (the rover) sits, in plan view. */
function startParam(target: Vec3, camera: Vec3, from: Vec3): number {
  const dx = camera[0] - target[0];
  const dz = camera[2] - target[2];
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-9) return 0;
  const t = ((from[0] - target[0]) * dx + (from[2] - target[2]) * dz) / len2;
  return Math.max(0, Math.min(1, t));
}

/**
 * Pulls a low camera in along its view ray (from `target` toward `camera`) to just before the first
 * blocked point, marching outward from the point next to the rover (`from`), so a wall between the
 * rover and a low camera brings the camera in front of it. Returns `camera` itself when it is high
 * enough, when nothing blocks the ray, or when the ray already starts blocked.
 */
export function clampCamera(target: Vec3, camera: Vec3, w: CameraWorld, from: Vec3 = target): Vec3 {
  if (camera[1] - w.floorY >= CAMERA_CLEARANCE.obstacle) return camera;
  const t0 = startParam(target, camera, from);
  if (cameraBlocked(lerp3(target, camera, t0), w)) return camera;
  let free = t0;
  for (let i = 1; i <= STEPS; i++) {
    const t = t0 + ((1 - t0) * i) / STEPS;
    if (!cameraBlocked(lerp3(target, camera, t), w)) {
      free = t;
      continue;
    }
    let blocked = t;
    for (let k = 0; k < REFINE; k++) {
      const mid = (free + blocked) / 2;
      if (cameraBlocked(lerp3(target, camera, mid), w)) blocked = mid;
      else free = mid;
    }
    return lerp3(target, camera, free);
  }
  return camera;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bunx vitest run tests/unit/camera-collision.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
rtk git add src/experience/camera/collision.ts tests/unit/camera-collision.test.ts
rtk git commit -m "feat(camera): cheap camera collision with the floor, slab edge and obstacles"
```

---

### Task 4: First-person pose, blend, body opacity and hold rules

**Files:**
- Create: `src/experience/camera/firstPerson.ts`
- Test: `tests/unit/first-person.test.ts`

**Interfaces:**
- Consumes: `CameraPose`, `Vec3` (types) from `camera/rigs.ts`; `Vec2`, `ViewportClass` from `experience/types.ts`.
- Produces:
  - `FIRST_PERSON = { eyeHeight: 1.55, enterPush: 0.85, exitPush: 1 / 0.85, pushIdle: 0.6, glide: 0.45, pitch: [-1.05, 0.55], look: -0.12, near: 0.1, far: 72, lookDistance: 10, fadeFrom: 0.5, fadeTo: 0.9 }`
  - `FIRST_PERSON_FOV: Record<ViewportClass, number>` (65, 70, 80)
  - `CAMERA_NEAR = 0.5`, `CAMERA_FAR = 600` (the Canvas camera in `Experience.tsx`)
  - `firstPersonPose(cls, rover: Vec3, forward: Vec2, look: number): CameraPose` (`rover` is x, floor y, z)
  - `easeBlend(t: number): number`, `blendPoses(from: CameraPose, to: CameraPose, blend: number): CameraPose`
  - `roverOpacity(blend: number): number`
  - `interface ViewHold { phase: string; ride: boolean; beam: boolean; mission: boolean; driving: boolean }`, `viewSuspended(i: ViewHold): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/first-person.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  blendPoses,
  CAMERA_NEAR,
  easeBlend,
  FIRST_PERSON,
  FIRST_PERSON_FOV,
  firstPersonPose,
  roverOpacity,
  viewSuspended,
} from "@/experience/camera/firstPerson";
import type { CameraPose } from "@/experience/camera/rigs";

describe("first-person pose", () => {
  it("puts the eye at the rover's face and looks along the forward", () => {
    const pose = firstPersonPose("desktop", [2, 14, 3], { x: 0, z: -2 }, 0);
    expect(pose.position).toEqual([2, 14 + FIRST_PERSON.eyeHeight, 3]);
    expect(pose.target[0]).toBeCloseTo(2);
    expect(pose.target[1]).toBeCloseTo(14 + FIRST_PERSON.eyeHeight);
    expect(pose.target[2]).toBeCloseTo(3 - FIRST_PERSON.lookDistance);
    expect(pose.fov).toBe(FIRST_PERSON_FOV.desktop);
  });

  it("looks down and up within the limits; the eye never leaves the rover's height", () => {
    const down = firstPersonPose("mobile", [0, 0, 0], { x: 1, z: 0 }, FIRST_PERSON.pitch[0]);
    expect(down.target[1]).toBeLessThan(down.position[1]);
    expect(down.position[1]).toBe(FIRST_PERSON.eyeHeight);
    const up = firstPersonPose("mobile", [0, 0, 0], { x: 1, z: 0 }, FIRST_PERSON.pitch[1]);
    expect(up.target[1]).toBeGreaterThan(up.position[1]);
    expect(FIRST_PERSON.pitch[0]).toBeGreaterThan(-Math.PI / 2);
    expect(FIRST_PERSON.near).toBeLessThan(CAMERA_NEAR);
  });
});

describe("glide", () => {
  const a: CameraPose = { position: [0, 10, 0], target: [0, 0, 0], fov: 40 };
  const b: CameraPose = { position: [10, 0, 0], target: [20, 0, 0], fov: 60 };

  it("eases with a soft start and landing", () => {
    expect(easeBlend(0)).toBe(0);
    expect(easeBlend(1)).toBe(1);
    expect(easeBlend(-1)).toBe(0);
    expect(easeBlend(2)).toBe(1);
    expect(easeBlend(0.5)).toBeCloseTo(0.5);
    expect(easeBlend(0.1)).toBeLessThan(0.1);
  });

  it("is the third-person pose at 0 and the eye at 1", () => {
    expect(blendPoses(a, b, 0)).toEqual(a);
    expect(blendPoses(a, b, 1)).toEqual(b);
    expect(blendPoses(a, b, 0.5).fov).toBeCloseTo(50);
  });

  it("fades the rover body only in the last part of the glide", () => {
    expect(roverOpacity(0)).toBe(1);
    expect(roverOpacity(FIRST_PERSON.fadeFrom)).toBe(1);
    expect(roverOpacity(FIRST_PERSON.fadeTo)).toBe(0);
    expect(roverOpacity(1)).toBe(0);
    for (let t = 0; t < 1; t += 0.05) expect(roverOpacity(t + 0.05)).toBeLessThanOrEqual(roverOpacity(t));
  });
});

describe("holding third person", () => {
  const idle = { phase: "explore", ride: false, beam: false, mission: false, driving: false };

  it("keeps first person while exploring and under Ask Rover or the palette", () => {
    expect(viewSuspended(idle)).toBe(false);
    expect(viewSuspended({ ...idle, phase: "terminal" })).toBe(false);
    expect(viewSuspended({ ...idle, phase: "palette" })).toBe(false);
  });

  it("holds third person for rides, beams, missions, autopilot, rooms, the hologram and the intro", () => {
    for (const phase of ["boot", "intro", "room", "hologram", "elevator", "autopilot", "static"]) expect(viewSuspended({ ...idle, phase })).toBe(true);
    expect(viewSuspended({ ...idle, ride: true })).toBe(true);
    expect(viewSuspended({ ...idle, beam: true })).toBe(true);
    expect(viewSuspended({ ...idle, mission: true })).toBe(true);
    expect(viewSuspended({ ...idle, driving: true })).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/first-person.test.ts`
Expected: FAIL with `Failed to resolve import "@/experience/camera/firstPerson"`.

- [ ] **Step 3: Implement the module**

Create `src/experience/camera/firstPerson.ts`:

```ts
import type { Vec2, ViewportClass } from "../types";
import type { CameraPose, Vec3 } from "./rigs";

/**
 * First person (owner request, round 5): zooming in past the closest third-person distance glides the
 * camera into the rover's eyes. Pure values and math; CameraDirector applies them.
 */
export const FIRST_PERSON = {
  /** Eye height above the floor (u); the rover's face screen is centered at 1.52. */
  eyeHeight: 1.55,
  /** Zooming in past the closest third-person distance by this factor enters first person. */
  enterPush: 0.85,
  /** Zooming out by this factor in first person returns to third person. */
  exitPush: 1 / 0.85,
  /** A pause (s) between zoom inputs forgets the push, so a stopped zoom never flips the view later. */
  pushIdle: 0.6,
  /** Glide length (s) between third and first person; reduced motion cuts. */
  glide: 0.45,
  /** Look elevation limits (radians): about 60 degrees down to 31 degrees up. */
  pitch: [-1.05, 0.55] as const,
  /** Look elevation on entering: slightly down, so the floor ahead reads. */
  look: -0.12,
  /** Near and far planes in first person (third person keeps CAMERA_NEAR and CAMERA_FAR). Far is past the fog's end, so nothing visible is cut. */
  near: 0.1,
  far: 72,
  /** Distance (u) of the look target in front of the eye. */
  lookDistance: 10,
  /** The body is solid until this blend and gone at `fadeTo`, before the camera is near its surface. */
  fadeFrom: 0.5,
  fadeTo: 0.9,
} as const;

/** Vertical FOV in first person, per camera class (wider than the follow rig, like a driver's view). */
export const FIRST_PERSON_FOV: Record<ViewportClass, number> = { desktop: 65, tablet: 70, mobile: 80 };

/** The Canvas camera's planes (`Experience.tsx`), restored whenever first person is off. Keep in sync. */
export const CAMERA_NEAR = 0.5;
export const CAMERA_FAR = 600;

/** Eye pose at the rover (`rover` is x, floor y, z) looking along `forward` (horizontal) tilted by `look`. */
export function firstPersonPose(cls: ViewportClass, rover: Vec3, forward: Vec2, look: number): CameraPose {
  const eye: Vec3 = [rover[0], rover[1] + FIRST_PERSON.eyeHeight, rover[2]];
  const len = Math.hypot(forward.x, forward.z) || 1;
  const across = (Math.cos(look) * FIRST_PERSON.lookDistance) / len;
  return {
    position: eye,
    target: [eye[0] + forward.x * across, eye[1] + Math.sin(look) * FIRST_PERSON.lookDistance, eye[2] + forward.z * across],
    fov: FIRST_PERSON_FOV[cls],
  };
}

/** Smoothstep of the 0 to 1 blend, clamped, so the glide starts and lands softly. */
export function easeBlend(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Pose between `from` (third person) and `to` (the eye) at the eased `blend`. */
export function blendPoses(from: CameraPose, to: CameraPose, blend: number): CameraPose {
  const e = easeBlend(blend);
  return {
    position: [lerp(from.position[0], to.position[0], e), lerp(from.position[1], to.position[1], e), lerp(from.position[2], to.position[2], e)],
    target: [lerp(from.target[0], to.target[0], e), lerp(from.target[1], to.target[1], e), lerp(from.target[2], to.target[2], e)],
    fov: lerp(from.fov, to.fov, e),
  };
}

/** Rover body opacity for a blend: solid until `fadeFrom`, gone at `fadeTo`. */
export function roverOpacity(blend: number): number {
  return 1 - easeBlend((blend - FIRST_PERSON.fadeFrom) / (FIRST_PERSON.fadeTo - FIRST_PERSON.fadeFrom));
}

export interface ViewHold {
  phase: string;
  ride: boolean;
  beam: boolean;
  mission: boolean;
  /** The rover follows a path (autopilot, scrub, mission leg, elevator approach, arrival roll-on). */
  driving: boolean;
}

/** Phases in which a chosen first-person view stays on. */
const FIRST_PERSON_PHASES = new Set(["explore", "terminal", "palette"]);

/**
 * True while the view must stay in third person: autopilot drives, rides, beams, missions, rooms (the
 * drawer frames the rover), the hologram, the boot and the intro. First person comes back afterwards.
 */
export function viewSuspended(i: ViewHold): boolean {
  return !FIRST_PERSON_PHASES.has(i.phase) || i.ride || i.beam || i.mission || i.driving;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bunx vitest run tests/unit/first-person.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
rtk git add src/experience/camera/firstPerson.ts tests/unit/first-person.test.ts
rtk git commit -m "feat(camera): first-person pose, eased glide, body fade and hold rules"
```

---

### Task 5: Orbit state (unbounded L2 yaw, per-rig pitch range, zoom push into first person)

**Files:**
- Modify: `src/experience/camera/orbit.ts` (full rewrite below)
- Test: `tests/unit/orbit.test.ts` (full rewrite below)

**Interfaces:**
- Consumes: `FIRST_PERSON` (Task 4), `pitchRange`, `springFactor` (Task 2).
- Produces (all in `camera/orbit.ts`):
  - `OrbitState` gains `pitchMin`, `pitchMax`, `firstPerson`, `look`, `blend`, `push`, `pushIdle`; `railYaw` is unbounded.
  - `ZOOM_RANGE = [0.6, 1.5]`, `KEY_ROTATE_SPEED = 1.7`, `KEY_PITCH_SPEED = 0.9`, `ROTATE_STEP = PI / 4` (`PITCH_RANGE` and `RAIL_MAX_YAW` are removed).
  - `setPitchRange(s, range: readonly [number, number]): void`
  - `rotate(s, dyaw, dpitch = 0, rail = false)`: in first person `dpitch` moves `look` (the opposite sign: a downward drag looks down).
  - `rotateStep(s, direction, rail = false)`, `resetView(s)` (also leaves first person), `zoomBy(s, factor, allowFirst = true)`, `stepOrbit(s, dt, reduced, hold = false)`, `updateZone`, `zoneAt`, `VIEW_ZONES`, `ViewZone`, `wrapPi`, `nearestAngle` (unchanged signatures).

- [ ] **Step 1: Write the failing tests**

Replace `tests/unit/orbit.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { FIRST_PERSON } from "@/experience/camera/firstPerson";
import {
  createOrbitState,
  nearestAngle,
  resetView,
  rotate,
  rotateStep,
  ROTATE_STEP,
  setPitchRange,
  stepOrbit,
  updateZone,
  VIEW_ZONES,
  zoneAt,
  zoomBy,
  ZOOM_RANGE,
  type OrbitState,
} from "@/experience/camera/orbit";
import { pitchRange } from "@/experience/camera/rigs";

const settle = (s: OrbitState, reduced = false) => {
  for (let i = 0; i < 240; i++) stepOrbit(s, 1 / 60, reduced);
};
/** Zooms to the closest third-person distance without entering first person. */
const toClosest = (s: OrbitState) => {
  while (s.zoom > ZOOM_RANGE[0]) zoomBy(s, 0.9, false);
};
/** Closest distance, then one strong zoom-in step past it: first person. */
const intoFirstPerson = (s: OrbitState) => {
  toClosest(s);
  zoomBy(s, 0.5);
};

const cert = VIEW_ZONES.L1!.find((z) => z.id === "L1:certifications")!;

describe("free orbit", () => {
  it("rotates without a yaw limit and keeps the view (no spring back)", () => {
    const s = createOrbitState();
    for (let i = 0; i < 10; i++) rotate(s, 1);
    expect(s.yaw).toBeCloseTo(10);
    settle(s);
    expect(s.yaw).toBeCloseTo(10);
  });

  it("clamps the pitch to the active rig's range and the zoom to ZOOM_RANGE", () => {
    const s = createOrbitState();
    const [lo, hi] = pitchRange("desktop", "follow");
    rotate(s, 0, 10);
    expect(s.pitch).toBe(hi);
    rotate(s, 0, -10);
    expect(s.pitch).toBe(lo);
    rotate(s, 0, 10);
    setPitchRange(s, pitchRange("mobile", "follow"));
    expect(s.pitch).toBe(pitchRange("mobile", "follow")[1]);
    zoomBy(s, 10);
    expect(s.zoom).toBe(ZOOM_RANGE[1]);
    zoomBy(s, 0.01, false);
    expect(s.zoom).toBe(ZOOM_RANGE[0]);
    expect(s.firstPerson).toBe(false);
  });

  it("eases button steps and accumulates quick presses", () => {
    const s = createOrbitState();
    rotateStep(s, 1);
    rotateStep(s, 1);
    expect(s.yaw).toBe(0);
    settle(s);
    expect(s.yaw).toBeCloseTo(2 * ROTATE_STEP);
  });

  it("resets to the nearest full turn, pitch and zoom", () => {
    const s = createOrbitState();
    rotate(s, 2 * Math.PI + 0.5, 0.3);
    zoomBy(s, 1.3);
    resetView(s);
    settle(s);
    expect(s.yaw).toBeCloseTo(2 * Math.PI);
    expect(s.pitch).toBeCloseTo(0);
    expect(s.zoom).toBeCloseTo(1);
  });

  it("snaps instead of easing under reduced motion", () => {
    const s = createOrbitState();
    rotateStep(s, -1);
    stepOrbit(s, 1 / 60, true);
    expect(s.yaw).toBeCloseTo(-ROTATE_STEP);
    expect(s.easing).toBe(false);
  });

  it("turns the L2 camera all the way around too, on its own yaw", () => {
    const s = createOrbitState();
    rotate(s, 5, 0, true);
    expect(s.railYaw).toBe(5);
    expect(s.yaw).toBe(0);
    rotateStep(s, 1, true);
    settle(s);
    expect(s.railYaw).toBeCloseTo(5 + ROTATE_STEP);
    resetView(s);
    settle(s);
    expect(Math.abs(Math.sin(s.railYaw / 2))).toBeLessThan(1e-6);
  });

  it("picks the nearest equivalent angle", () => {
    expect(nearestAngle(-Math.PI / 2, 2 * Math.PI)).toBeCloseTo(1.5 * Math.PI);
    expect(nearestAngle(0, 0.1)).toBeCloseTo(0);
  });
});

describe("first person", () => {
  it("enters only after zooming in past the closest third-person distance", () => {
    const s = createOrbitState();
    toClosest(s);
    expect(s.firstPerson).toBe(false);
    zoomBy(s, 0.9);
    expect(s.firstPerson).toBe(false);
    zoomBy(s, 0.9);
    expect(s.firstPerson).toBe(true);
    expect(s.look).toBe(FIRST_PERSON.look);
    expect(s.zoom).toBe(ZOOM_RANGE[0]);
  });

  it("forgets a push after a pause between zoom inputs", () => {
    const s = createOrbitState();
    toClosest(s);
    zoomBy(s, 0.9);
    stepOrbit(s, FIRST_PERSON.pushIdle + 0.1, false);
    zoomBy(s, 0.9);
    expect(s.firstPerson).toBe(false);
  });

  it("does not enter while the view is held in third person", () => {
    const s = createOrbitState();
    toClosest(s);
    zoomBy(s, 0.5, false);
    expect(s.firstPerson).toBe(false);
  });

  it("returns to third person at the closest distance when zooming out", () => {
    const s = createOrbitState();
    intoFirstPerson(s);
    expect(s.firstPerson).toBe(true);
    zoomBy(s, 1.1);
    expect(s.firstPerson).toBe(true);
    zoomBy(s, 1.1);
    expect(s.firstPerson).toBe(false);
    expect(s.zoom).toBe(ZOOM_RANGE[0]);
  });

  it("looks around with the pitch limited and leaves the third-person tilt alone", () => {
    const s = createOrbitState();
    intoFirstPerson(s);
    const pitch = s.pitch;
    rotate(s, 0.3, 10);
    expect(s.look).toBe(FIRST_PERSON.pitch[0]);
    rotate(s, 0, -10);
    expect(s.look).toBe(FIRST_PERSON.pitch[1]);
    expect(s.pitch).toBe(pitch);
    expect(s.yaw).toBeCloseTo(0.3);
  });

  it("glides in over FIRST_PERSON.glide and cuts under reduced motion", () => {
    const s = createOrbitState();
    intoFirstPerson(s);
    stepOrbit(s, FIRST_PERSON.glide / 2, false);
    expect(s.blend).toBeCloseTo(0.5);
    stepOrbit(s, FIRST_PERSON.glide, false);
    expect(s.blend).toBe(1);
    zoomBy(s, 2);
    stepOrbit(s, 1 / 60, true);
    expect(s.blend).toBe(0);
  });

  it("pulls back while held and comes back afterwards", () => {
    const s = createOrbitState();
    intoFirstPerson(s);
    stepOrbit(s, 1, false);
    expect(s.blend).toBe(1);
    stepOrbit(s, 1, false, true);
    expect(s.blend).toBe(0);
    expect(s.firstPerson).toBe(true);
    stepOrbit(s, 1, false);
    expect(s.blend).toBe(1);
  });

  it("leaves first person on reset", () => {
    const s = createOrbitState();
    intoFirstPerson(s);
    resetView(s);
    expect(s.firstPerson).toBe(false);
    settle(s);
    expect(s.zoom).toBeCloseTo(1);
    expect(s.blend).toBe(0);
  });

  it("does not auto-face walls in first person", () => {
    const s = createOrbitState();
    intoFirstPerson(s);
    updateZone(s, cert, false);
    settle(s);
    expect(s.yaw).toBe(0);
  });
});

describe("wall auto-face", () => {
  const inside = { x: (cert.area.minX + cert.area.maxX) / 2, z: (cert.area.minZ + cert.area.maxZ) / 2 };

  it("finds Lobby zones", () => {
    expect(zoneAt("L1", inside)?.id).toBe("L1:certifications");
    expect(zoneAt("L1", { x: 14, z: 6 })).toBeNull();
    expect(zoneAt("L4", inside)).toBeNull();
  });

  it("eases to face the wall when the rover walks in", () => {
    const s = createOrbitState();
    updateZone(s, cert, false);
    settle(s);
    expect(s.yaw).toBeCloseTo(cert.yaw);
  });

  it("is cancelled by user rotation until the rover leaves", () => {
    const s = createOrbitState();
    updateZone(s, cert, false);
    rotate(s, 0.4);
    settle(s);
    expect(s.yaw).toBeCloseTo(0.4);
    updateZone(s, cert, false);
    settle(s);
    expect(s.yaw).toBeCloseTo(0.4);
    updateZone(s, null, false);
    updateZone(s, cert, false);
    settle(s);
    expect(s.yaw).toBeCloseTo(cert.yaw);
  });

  it("zooms out for a wide wall and restores the zoom on exit", () => {
    const skills = VIEW_ZONES.L1!.find((z) => z.id === "L1:skills")!;
    const s = createOrbitState();
    updateZone(s, skills, false);
    settle(s);
    expect(s.zoom).toBeCloseTo(skills.zoom!);
    updateZone(s, null, false);
    settle(s);
    expect(s.zoom).toBeCloseTo(1);
  });

  it("keeps a manual zoom when leaving a zone", () => {
    const skills = VIEW_ZONES.L1!.find((z) => z.id === "L1:skills")!;
    const s = createOrbitState();
    updateZone(s, skills, false);
    settle(s);
    zoomBy(s, 0.8);
    const manual = s.zoom;
    updateZone(s, null, false);
    settle(s);
    expect(s.zoom).toBeCloseTo(manual);
  });

  it("stays off under reduced motion", () => {
    const s = createOrbitState();
    updateZone(s, cert, true);
    settle(s, true);
    expect(s.yaw).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/unit/orbit.test.ts`
Expected: FAIL: `setPitchRange is not a function` and assertions on `firstPerson`/`blend` (undefined).

- [ ] **Step 3: Rewrite the orbit module**

Replace `src/experience/camera/orbit.ts` with:

```ts
import type { FloorId } from "@/content/schema";
import { LOBBY } from "../config";
import type { Rect, Vec2 } from "../types";
import { FIRST_PERSON } from "./firstPerson";
import { pitchRange, springFactor } from "./rigs";

/**
 * Orbit state for the cameras (appendix 03 section 2; owner request, round 5): unbounded yaw around the
 * rover on every floor (L2 keeps its own yaw, so it opens on its side view), pitch from just above the
 * floor to near top-down (the active rig's `pitchRange`), clamped zoom, eased steps and reset, a gentle
 * auto-face toward walls that user rotation cancels, and first person after zooming in past the closest
 * distance. Pure TypeScript so it can be unit tested.
 */
export interface OrbitState {
  /** Yaw offset from the default follow angle, radians, unbounded. */
  yaw: number;
  yawTarget: number;
  /** Pitch offset from the rig's default elevation, radians, within [pitchMin, pitchMax]. */
  pitch: number;
  pitchTarget: number;
  zoom: number;
  zoomTarget: number;
  /** L2 yaw offset from the side view, radians, unbounded. */
  railYaw: number;
  railYawTarget: number;
  /** Pitch offsets the active rig allows (`pitchRange`), set by CameraDirector every frame. */
  pitchMin: number;
  pitchMax: number;
  /** The view the visitor chose: true after zooming in past the closest third-person distance. */
  firstPerson: boolean;
  /** First-person look elevation, radians (0 level, negative looks down), within FIRST_PERSON.pitch. */
  look: number;
  /** 0 third person to 1 first person, as drawn; eases toward the chosen view unless it is held. */
  blend: number;
  /** Zoom pushed against a limit (product of factors); crossing enterPush or exitPush switches the view. */
  push: number;
  /** Seconds since the last zoom input; the push resets after FIRST_PERSON.pushIdle. */
  pushIdle: number;
  /** True while easing toward the targets (steps, reset, auto-face). */
  easing: boolean;
  /** View zone the rover is in, if any. */
  zone: string | null;
  /** Zone in which the visitor rotated by hand; no auto-face there until the rover leaves it. */
  suppressedZone: string | null;
  /** Zoom set by a view zone; restored to 1 on exit unless the visitor zoomed by hand meanwhile. */
  zoneZoom: number | null;
}

export const ZOOM_RANGE = [0.6, 1.5] as const;
/** Q/E rotation speed (Shift doubles it), radians per second. */
export const KEY_ROTATE_SPEED = 1.7;
/** R/F tilt speed (Shift doubles it), radians per second. */
export const KEY_PITCH_SPEED = 0.9;
/** One press of an on-screen rotate button. */
export const ROTATE_STEP = Math.PI / 4;
const EASE_HALF_LIFE = 0.14;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** The angle equivalent to `target` (mod 2 PI) that is closest to `current`. */
export const nearestAngle = (target: number, current: number) => current + wrapPi(target - current);

export function createOrbitState(): OrbitState {
  const [pitchMin, pitchMax] = pitchRange("desktop", "follow");
  return {
    yaw: 0,
    yawTarget: 0,
    pitch: 0,
    pitchTarget: 0,
    zoom: 1,
    zoomTarget: 1,
    railYaw: 0,
    railYawTarget: 0,
    pitchMin,
    pitchMax,
    firstPerson: false,
    look: FIRST_PERSON.look,
    blend: 0,
    push: 1,
    pushIdle: 0,
    easing: false,
    zone: null,
    suppressedZone: null,
    zoneZoom: null,
  };
}

/** Sets the active rig's pitch range (CameraDirector, every frame) and keeps the pitch inside it. */
export function setPitchRange(s: OrbitState, [lo, hi]: readonly [number, number]): void {
  if (s.pitchMin === lo && s.pitchMax === hi) return;
  s.pitchMin = lo;
  s.pitchMax = hi;
  s.pitch = clamp(s.pitch, lo, hi);
  s.pitchTarget = clamp(s.pitchTarget, lo, hi);
}

/**
 * Direct manipulation (drag, twist, trackpad, held keys): applies immediately and cancels easing. In
 * first person `dpitch` moves the look instead (a downward drag looks down, like it tilts the
 * third-person view down).
 */
export function rotate(s: OrbitState, dyaw: number, dpitch = 0, rail = false): void {
  if (rail) {
    s.railYaw += dyaw;
    s.railYawTarget = s.railYaw;
  } else {
    s.yaw += dyaw;
    s.yawTarget = s.yaw;
  }
  if (s.firstPerson) {
    s.look = clamp(s.look - dpitch, FIRST_PERSON.pitch[0], FIRST_PERSON.pitch[1]);
  } else {
    s.pitch = clamp(s.pitch + dpitch, s.pitchMin, s.pitchMax);
    s.pitchTarget = s.pitch;
  }
  s.zoomTarget = s.zoom;
  s.easing = false;
  if (s.zone) s.suppressedZone = s.zone;
}

/** Eased step (on-screen buttons). */
export function rotateStep(s: OrbitState, direction: number, rail = false): void {
  if (rail) {
    s.railYawTarget = (s.easing ? s.railYawTarget : s.railYaw) + direction * ROTATE_STEP;
  } else {
    s.yawTarget = (s.easing ? s.yawTarget : s.yaw) + direction * ROTATE_STEP;
  }
  s.easing = true;
  if (s.zone) s.suppressedZone = s.zone;
}

/** Eases back to the default angle, pitch and zoom (the nearest full turn, never a long spin) and leaves first person. */
export function resetView(s: OrbitState): void {
  s.yawTarget = s.yaw - wrapPi(s.yaw);
  s.pitchTarget = 0;
  s.zoomTarget = 1;
  s.railYawTarget = s.railYaw - wrapPi(s.railYaw);
  s.zoneZoom = null;
  s.firstPerson = false;
  s.push = 1;
  s.easing = true;
  if (s.zone) s.suppressedZone = s.zone;
}

/**
 * Zoom input. In third person it scales the zoom within ZOOM_RANGE; zooming further in at the closest
 * distance pushes, and a push of FIRST_PERSON.enterPush enters first person (only when `allowFirst`).
 * In first person zooming in does nothing, and zooming out by FIRST_PERSON.exitPush returns to third
 * person at the closest distance.
 */
export function zoomBy(s: OrbitState, factor: number, allowFirst = true): void {
  s.pushIdle = 0;
  if (s.firstPerson) {
    s.push = factor > 1 ? Math.max(1, s.push) * factor : 1;
    if (s.push >= FIRST_PERSON.exitPush) {
      s.firstPerson = false;
      s.push = 1;
    }
    return;
  }
  const want = s.zoom * factor;
  s.zoom = clamp(want, ZOOM_RANGE[0], ZOOM_RANGE[1]);
  s.zoomTarget = s.zoom;
  s.zoneZoom = null;
  if (allowFirst && want < ZOOM_RANGE[0]) {
    s.push = Math.min(1, s.push) * (want / ZOOM_RANGE[0]);
    if (s.push <= FIRST_PERSON.enterPush) {
      s.firstPerson = true;
      s.push = 1;
      s.look = FIRST_PERSON.look;
    }
  } else {
    s.push = 1;
  }
}

/** A floor area where the camera turns to face something (a wall) when the rover walks in. */
export interface ViewZone {
  id: string;
  area: Rect;
  /** Follow yaw (offset from the default angle) that faces the feature head on. */
  yaw: number;
  /** Optional zoom so a wide feature fits the view. */
  zoom?: number;
}

/**
 * Lobby view zones. The default camera looks along (-1, -1); a yaw of -PI/4 looks north at the
 * skills wall, -PI/2 looks east at the louvered certification badges.
 */
export const VIEW_ZONES: Partial<Record<FloorId, ViewZone[]>> = {
  L1: [
    {
      id: "L1:certifications",
      area: { minX: LOBBY.certWall.x - 7, maxX: LOBBY.certWall.x, minZ: LOBBY.certWall.z - 10, maxZ: LOBBY.certWall.z + 10 },
      yaw: -Math.PI / 2,
    },
    {
      id: "L1:skills",
      area: {
        minX: LOBBY.skillsWall.x - LOBBY.skillsWall.w / 2,
        maxX: LOBBY.skillsWall.x + LOBBY.skillsWall.w / 2,
        minZ: LOBBY.skillsWall.z,
        maxZ: LOBBY.skillsWall.z + 6,
      },
      yaw: -Math.PI / 4,
      // The 40 u by 8.5 u wall needs a wider view than the default follow distance.
      zoom: 1.7,
    },
  ],
};

/** The zone the rover is in: static `VIEW_ZONES` first, then the floor layout's own (`FloorLayout.viewZones`). */
export function zoneAt(floor: FloorId, p: Vec2, extra: readonly ViewZone[] = []): ViewZone | null {
  const inside = (z: ViewZone) => p.x >= z.area.minX && p.x <= z.area.maxX && p.z >= z.area.minZ && p.z <= z.area.maxZ;
  return VIEW_ZONES[floor]?.find(inside) ?? extra.find(inside) ?? null;
}

/**
 * Tracks the zone the rover is in. Entering a zone eases the camera to face its feature, unless
 * reduced motion is on, the visitor is in first person, or they already rotated by hand inside it.
 * Leaving clears the block.
 */
export function updateZone(s: OrbitState, zone: ViewZone | null, reduced: boolean): void {
  const id = zone?.id ?? null;
  if (id === s.zone) return;
  s.zone = id;
  if (!zone) {
    s.suppressedZone = null;
    if (s.zoneZoom !== null) {
      s.zoomTarget = 1;
      s.zoneZoom = null;
      s.easing = true;
    }
    return;
  }
  if (reduced || s.firstPerson || s.suppressedZone === zone.id) return;
  s.yawTarget = nearestAngle(zone.yaw, s.yaw);
  s.pitchTarget = 0;
  if (zone.zoom) {
    s.zoomTarget = zone.zoom;
    s.zoneZoom = zone.zoom;
  }
  s.easing = true;
}

/**
 * Advances the first-person blend (toward the chosen view, or toward third person while `hold`; a cut
 * under reduced motion), forgets an idle zoom push, and advances easing (reduced motion jumps).
 */
export function stepOrbit(s: OrbitState, dt: number, reduced: boolean, hold = false): void {
  s.pushIdle += dt;
  if (s.pushIdle > FIRST_PERSON.pushIdle) s.push = 1;
  const goal = s.firstPerson && !hold ? 1 : 0;
  if (s.blend !== goal) {
    const step = reduced ? 1 : dt / FIRST_PERSON.glide;
    s.blend = goal > s.blend ? Math.min(goal, s.blend + step) : Math.max(goal, s.blend - step);
  }
  if (!s.easing) return;
  const k = reduced ? 1 : springFactor(dt, EASE_HALF_LIFE);
  s.yaw += (s.yawTarget - s.yaw) * k;
  s.pitch += (s.pitchTarget - s.pitch) * k;
  s.zoom += (s.zoomTarget - s.zoom) * k;
  s.railYaw += (s.railYawTarget - s.railYaw) * k;
  const done =
    Math.abs(s.yawTarget - s.yaw) < 1e-3 &&
    Math.abs(s.pitchTarget - s.pitch) < 1e-3 &&
    Math.abs(s.zoomTarget - s.zoom) < 1e-3 &&
    Math.abs(s.railYawTarget - s.railYaw) < 1e-3;
  if (done) {
    s.yaw = s.yawTarget;
    s.pitch = s.pitchTarget;
    s.zoom = s.zoomTarget;
    s.railYaw = s.railYawTarget;
    s.easing = false;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run tests/unit/orbit.test.ts tests/unit/highlights-layout.test.ts tests/unit/labs-layout.test.ts tests/unit/roof-layout.test.ts`
Expected: PASS. (The layout tests import `ViewZone` and zone yaws from `orbit.ts`.)

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: exit 0. `CameraDirector.tsx` still compiles: it only uses `createOrbitState`, `KEY_ROTATE_SPEED`, `resetView`, `rotate`, `rotateStep`, `stepOrbit`, `updateZone`, `zoneAt` and `zoomBy`, whose old call shapes are still valid. If the comment in `rover/runtime.ts` mentions `RAIL_MAX_YAW`, it is only a comment (fixed in Task 7).

- [ ] **Step 6: Commit**

```bash
rtk git add src/experience/camera/orbit.ts tests/unit/orbit.test.ts
rtk git commit -m "feat(camera): orbit state with 360 degree L2 yaw, wide pitch and the zoom push into first person"
```

---

### Task 6: Input: the wheel zooms, +/- zoom, R/F tilt

**Files:**
- Modify: `src/experience/input/intents.ts` (`keyToIntent`, wheel section, new pitch-key helpers; `createWheelGate` removed)
- Modify: `src/experience/input/useInputSources.ts` (imports, held keys, `onWheel`)
- Test: `tests/unit/gestures.test.ts`, `tests/unit/intents.test.ts`
- Modify: `e2e/experience.spec.ts` (test "wheel and PageUp/PageDown move one floor at a time")

**Interfaces:**
- Consumes: nothing new.
- Produces (in `input/intents.ts`):
  - `type WheelKind = "zoom" | "rotate" | null`; `classifyWheel({ dx, dy, ctrl })` never returns `"elevator"`.
  - `WHEEL_ZOOM = 0.002`, `wheelZoomFactor(deltaY: number, deltaMode = 0): number`
  - `KEY_ZOOM_IN = 0.8`; `keyToIntent("+" | "=")` is `{ type: "zoom", factor: KEY_ZOOM_IN }`, `keyToIntent("-" | "_")` is `{ type: "zoom", factor: 1 / KEY_ZOOM_IN }`
  - `isPitchKey(key: string): boolean`, `pitchAxisFromKeys(held: Iterable<string>): number` (R = -1, F = +1, Shift doubles)

- [ ] **Step 1: Write the failing tests**

In `tests/unit/gestures.test.ts` replace the import block with:

```ts
import { describe, expect, it } from "vitest";
import {
  classifySwipe,
  classifyWheel,
  DRAG_THRESHOLD,
  exceedsDragThreshold,
  isPitchKey,
  isRotateKey,
  KEY_ZOOM_IN,
  keyToIntent,
  pinchFactor,
  pitchAxisFromKeys,
  rotateAxisFromKeys,
  twistDelta,
  wheelZoomFactor,
} from "@/experience/input/intents";
```

Replace the whole `describe("wheel and trackpad", ...)` block with:

```ts
describe("wheel and trackpad", () => {
  it("zooms on vertical scrolling instead of changing floors", () => {
    expect(classifyWheel({ dx: 0, dy: 120, ctrl: false })).toBe("zoom");
    expect(classifyWheel({ dx: 3, dy: -40, ctrl: false })).toBe("zoom");
  });

  it("routes horizontal two-finger swipes (deltaX) to rotation", () => {
    expect(classifyWheel({ dx: 40, dy: 5, ctrl: false })).toBe("rotate");
    expect(classifyWheel({ dx: -12, dy: 0, ctrl: false })).toBe("rotate");
  });

  it("treats ctrl+wheel (trackpad pinch) as zoom", () => {
    expect(classifyWheel({ dx: 0, dy: -8, ctrl: true })).toBe("zoom");
    expect(classifyWheel({ dx: 30, dy: 0, ctrl: true })).toBeNull();
    expect(classifyWheel({ dx: 0, dy: 0, ctrl: false })).toBeNull();
  });

  it("turns wheel deltas into zoom factors: down zooms out, flicks are capped, lines and pages scale", () => {
    expect(wheelZoomFactor(100)).toBeCloseTo(Math.exp(0.2));
    expect(wheelZoomFactor(-100)).toBeCloseTo(Math.exp(-0.2));
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(5000)).toBeCloseTo(wheelZoomFactor(240));
    expect(wheelZoomFactor(-5000)).toBeCloseTo(wheelZoomFactor(-240));
    expect(wheelZoomFactor(3, 1)).toBeCloseTo(wheelZoomFactor(99));
    expect(wheelZoomFactor(1, 2)).toBeCloseTo(wheelZoomFactor(240));
  });
});
```

Inside the `describe` that holds "maps 0 and Home to a view reset", add after that test:

```ts
  it("maps + and - to zoom steps, never in text fields", () => {
    expect(keyToIntent("+")).toEqual({ type: "zoom", factor: KEY_ZOOM_IN });
    expect(keyToIntent("=")).toEqual({ type: "zoom", factor: KEY_ZOOM_IN });
    expect(keyToIntent("-")).toEqual({ type: "zoom", factor: 1 / KEY_ZOOM_IN });
    expect(keyToIntent("_")).toEqual({ type: "zoom", factor: 1 / KEY_ZOOM_IN });
    expect(keyToIntent("-", { inText: true })).toBeNull();
    expect(keyToIntent("=", { meta: true })).toBeNull();
  });

  it("reads held R and F as a tilt axis (R up, F down, Shift doubles)", () => {
    expect(isPitchKey("R")).toBe(true);
    expect(isPitchKey("q")).toBe(false);
    expect(pitchAxisFromKeys(["r"])).toBe(-1);
    expect(pitchAxisFromKeys(["f"])).toBe(1);
    expect(pitchAxisFromKeys(["f", "shift"])).toBe(2);
    expect(pitchAxisFromKeys(["r", "f"])).toBe(0);
    expect(pitchAxisFromKeys(["w"])).toBe(0);
  });
```

In `tests/unit/intents.test.ts` remove `createWheelGate,` from the import list and delete the whole `describe("wheel gate", ...)` block (three tests).

- [ ] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/unit/gestures.test.ts tests/unit/intents.test.ts`
Expected: FAIL: `wheelZoomFactor is not a function`, `expected 'elevator' to be 'zoom'`.

- [ ] **Step 3: Implement the intents**

In `src/experience/input/intents.ts`:

1. Add above `keyToIntent`:

```ts
/** One `+` press zooms in by this factor; `-` zooms out by its inverse. */
export const KEY_ZOOM_IN = 0.8;
```

2. In `keyToIntent`, add these cases before `case "0":`:

```ts
    case "+":
    case "=":
      return { type: "zoom", factor: KEY_ZOOM_IN };
    case "-":
    case "_":
      return { type: "zoom", factor: 1 / KEY_ZOOM_IN };
```

3. Delete the `createWheelGate` function and its doc comment.

4. Replace the `WheelKind` type and `classifyWheel` (with its doc comment) with:

```ts
export type WheelKind = "zoom" | "rotate" | null;

/**
 * Splits wheel input (owner request, round 5): vertical scrolling and a trackpad pinch (ctrl+wheel)
 * zoom the camera; a horizontal two-finger swipe (or shift+wheel) rotates. The wheel never changes
 * floors (PageUp/PageDown, the elevator panel and the call pads do).
 */
export function classifyWheel({ dx, dy, ctrl }: { dx: number; dy: number; ctrl: boolean }): WheelKind {
  if (ctrl) return dy !== 0 ? "zoom" : null;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax === 0 && ay === 0) return null;
  return ax > ay ? "rotate" : "zoom";
}

/** Zoom speed per wheel pixel (the old pinch rate), and the largest step one event may take. */
export const WHEEL_ZOOM = 0.002;
const WHEEL_MAX_PX = 240;
/** Pixels per line and per page for `WheelEvent.deltaMode` 1 and 2 (Firefox mouse wheels). */
const WHEEL_LINE_PX = 33;
const WHEEL_PAGE_PX = 800;

/** Zoom factor for one wheel event: scrolling down (positive deltaY) zooms out (factor above 1). */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const px = deltaMode === 1 ? deltaY * WHEEL_LINE_PX : deltaMode === 2 ? deltaY * WHEEL_PAGE_PX : deltaY;
  return Math.exp(Math.max(-WHEEL_MAX_PX, Math.min(WHEEL_MAX_PX, px)) * WHEEL_ZOOM);
}
```

5. After `rotateAxisFromKeys`, add:

```ts
const PITCH_KEYS: Record<string, number> = { r: -1, f: 1 };

export function isPitchKey(key: string): boolean {
  return key.toLowerCase() in PITCH_KEYS;
}

/**
 * Held R/F as a tilt axis with the sign of a vertical drag: R tilts the view up (-1), F down (+1).
 * Shift doubles the speed.
 */
export function pitchAxisFromKeys(held: Iterable<string>): number {
  let axis = 0;
  let fast = false;
  for (const key of held) {
    const k = key.toLowerCase();
    axis += PITCH_KEYS[k] ?? 0;
    if (k === "shift") fast = true;
  }
  return Math.sign(axis) * (fast ? 2 : 1);
}
```

In `src/experience/input/useInputSources.ts`:

1. Replace the import block from `./intents` with:

```ts
import {
  classifySwipe,
  classifyWheel,
  exceedsDragThreshold,
  intents,
  isMoveKey,
  isPitchKey,
  isRotateKey,
  keyToIntent,
  pinchFactor,
  twistDelta,
  wheelZoomFactor,
} from "./intents";
```

2. Update the hook's doc comment line "keys (WASD, arrows, Q/E, Shift)" to "keys (WASD, arrows, Q/E, R/F, Shift)", and in `onKeyDown` change the held-key condition to:

```ts
      if (!inText && !e.metaKey && !e.ctrlKey && !e.altKey && (isMoveKey(key) || isRotateKey(key) || isPitchKey(key))) {
```

3. Delete `const gate = createWheelGate();` and replace `onWheel` with:

```ts
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const kind = classifyWheel({ dx: e.deltaX, dy: e.deltaY, ctrl: e.ctrlKey });
      // Owner request (round 5): scrolling and pinching zoom (all the way in is first person); floors stay on PageUp/PageDown and the elevator.
      if (kind === "zoom") intents.emit({ type: "zoom", factor: wheelZoomFactor(e.deltaY, e.deltaMode) });
      else if (kind === "rotate") intents.emit({ type: "orbit", dyaw: -e.deltaX * WHEEL_YAW, source: "wheel" });
    };
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `bunx vitest run tests/unit/gestures.test.ts tests/unit/intents.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the floor e2e test**

In `e2e/experience.spec.ts` replace the test "wheel and PageUp/PageDown move one floor at a time" with:

```ts
  test("PageUp/PageDown move one floor at a time; the wheel zooms and never changes floors", async ({ page }) => {
    await enterHQ(page);
    await page.mouse.move(720, 450);
    await page.mouse.wheel(0, -120);
    await page.mouse.wheel(0, 120);
    await page.mouse.wheel(0, 120);
    await waitForFrames(page, 10);
    const after = await snapshot(page);
    expect(after.floor).toBe("L1");
    expect(after.ride).toBeNull();
    await page.keyboard.press("PageUp");
    await waitForFloor(page, "L2");
    await page.keyboard.press("PageUp");
    await waitForFloor(page, "L3");
    await page.keyboard.press("PageDown");
    await waitForFloor(page, "L2");
  });
```

- [ ] **Step 6: Typecheck, build and run the e2e test**

Run:

```bash
bun run typecheck
bun run build
E2E_PORT=4436 bunx playwright test e2e/experience.spec.ts -g "PageUp/PageDown|trackpad deltaX"
```

Expected: typecheck exit 0; build ends with the static export summary; Playwright `2 passed`.

- [ ] **Step 7: Commit**

```bash
rtk git add src/experience/input/intents.ts src/experience/input/useInputSources.ts tests/unit/gestures.test.ts tests/unit/intents.test.ts e2e/experience.spec.ts
rtk git commit -m "feat(input): the wheel zooms instead of changing floors; +/- zoom and R/F tilt keys"
```

---

### Task 7: Rover body fade and first-person probes

**Files:**
- Create: `src/experience/rover/fade.ts`
- Modify: `src/experience/rover/Rover.tsx` (imports, a ref, a layout effect, three lines in `useFrame`, the click and hover handlers)
- Modify: `src/experience/rover/runtime.ts` (camera probes, `driving`)
- Test: `tests/unit/rover-fade.test.ts`

**Interfaces:**
- Consumes: `roverOpacity` (Task 4).
- Produces:
  - `prepareFade(root: Object3D): Material[]`, `setFadeOpacity(materials: readonly Material[], opacity: number): void`
  - `roverRuntime.cameraMode: "third" | "first"`, `cameraBlend: number`, `cameraZoom: number`, `cameraLook: number`, `cameraElevation: number`, `driving: boolean` (written by CameraDirector and the Director in Task 8; read by Rover here and by e2e as `window.__hq.rover.*`)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/rover-fade.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { prepareFade, setFadeOpacity } from "@/experience/rover/fade";

describe("rover body fade", () => {
  it("turns on hashed alpha once on every body material and keeps them opaque", () => {
    const root = new Group();
    const shared = new MeshStandardMaterial();
    root.add(new Mesh(new BoxGeometry(), shared), new Mesh(new BoxGeometry(), shared));
    const inner = new Group();
    const basic = new MeshBasicMaterial();
    inner.add(new InstancedMesh(new BoxGeometry(), basic, 6));
    root.add(inner);
    const materials = prepareFade(root);
    expect(materials).toHaveLength(2);
    for (const m of materials) {
      expect(m.alphaHash).toBe(true);
      expect(m.transparent).toBe(false);
      expect(m.opacity).toBe(1);
    }
    const version = shared.version;
    prepareFade(root);
    expect(shared.version).toBe(version);
  });

  it("changes the opacity without recompiling", () => {
    const m = new MeshStandardMaterial();
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(), m));
    const materials = prepareFade(root);
    const version = m.version;
    setFadeOpacity(materials, 0.4);
    expect(m.opacity).toBe(0.4);
    expect(m.version).toBe(version);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/rover-fade.test.ts`
Expected: FAIL with `Failed to resolve import "@/experience/rover/fade"`.

- [ ] **Step 3: Implement the fade helper**

Create `src/experience/rover/fade.ts`:

```ts
import type { Material, Object3D } from "three";

/**
 * First person (round 5): the rover body fades with hashed alpha. `alphaHash` keeps the materials
 * opaque (same render order, depth writes and draw calls) and discards nothing at opacity 1, so the
 * third-person look is unchanged. It is set once at mount, before the first compile, so fading only
 * changes a uniform and never recompiles a shader.
 */
export function prepareFade(root: Object3D): Material[] {
  const out = new Set<Material>();
  root.traverse((o) => {
    const m = (o as { material?: Material | Material[] }).material;
    if (!m) return;
    for (const material of Array.isArray(m) ? m : [m]) {
      if (!material.alphaHash) {
        material.alphaHash = true;
        material.needsUpdate = true;
      }
      out.add(material);
    }
  });
  return [...out];
}

export function setFadeOpacity(materials: readonly Material[], opacity: number): void {
  for (const m of materials) if (m.opacity !== opacity) m.opacity = opacity;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bunx vitest run tests/unit/rover-fade.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the runtime probes**

In `src/experience/rover/runtime.ts` replace the `cameraRailYaw` field (with its comment) by:

```ts
  /** L2 yaw offset from the side view, radians, unbounded (round 5). */
  cameraRailYaw: 0,
  /** The view the visitor chose: "first" after zooming in past the closest third-person distance. */
  cameraMode: "third" as "third" | "first",
  /** Drawn blend from third (0) to first person (1); 0 while autopilot, rides, rooms or the hologram hold third person. */
  cameraBlend: 0,
  /** Third-person zoom, 0.6 to 1.5 (test probe). */
  cameraZoom: 1,
  /** First-person look elevation, radians (test probe). */
  cameraLook: 0,
  /** Elevation of the drawn camera above its look target, radians (test probe). */
  cameraElevation: 0,
  /** The rover follows a path (autopilot, scrub, mission leg, elevator approach); set by the Director. */
  driving: false,
```

- [ ] **Step 6: Fade and hide the body in `Rover.tsx`**

1. Imports: change the React import to `import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";`, add `type Material,` to the `three` import list, and add:

```ts
import { roverOpacity } from "../camera/firstPerson";
import { prepareFade, setFadeOpacity } from "./fade";
```

2. After `const trail = useRef<Mesh>(null);` add:

```ts
  const fadeMaterials = useRef<Material[]>([]);
```

3. After the existing `useEffect` that reads the mono font, add:

```ts
  // Hashed alpha goes on before the first compile, so the first-person fade never recompiles a shader.
  useLayoutEffect(() => {
    if (body.current) fadeMaterials.current = prepareFade(body.current);
  }, [tier]);
```

4. In `useFrame`, right after `root.current.visible = getHQStore().getState().phase !== "hologram";`, add:

```ts
    // First person (round 5): the body fades out as the camera glides into its eyes, then hides (fewer draw calls).
    const opacity = roverOpacity(r.cameraBlend);
    body.current.visible = opacity > 0.01;
    setFadeOpacity(fadeMaterials.current, opacity);
```

5. Replace `onClick` and `stopHover` with:

```ts
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    // In first person the camera sits inside the rover: clicks go to the targets in front of it.
    if (roverRuntime.cameraBlend > 0.5) return;
    e.stopPropagation();
    intents.emit({ type: "terminal" });
  };
  // A click on the rover opens Ask Rover, so a target behind it must not light up. The over handler makes
  // the rover hover-tracked, which lets its stopPropagation clear the hover of objects behind it.
  const stopHover = (e: ThreeEvent<PointerEvent>) => {
    if (roverRuntime.cameraBlend > 0.5) return;
    e.stopPropagation();
  };
```

- [ ] **Step 7: Typecheck, build and check that third person is untouched**

Run:

```bash
bun run typecheck
bun run build
E2E_PORT=4436 bunx playwright test e2e/experience.spec.ts -g "mouse drag rotates the view"
```

Expected: typecheck exit 0; Playwright `1 passed` (dragging still rotates, and a click still drives; `cameraBlend` stays 0 until Task 8, so the body is fully opaque and clickable).

- [ ] **Step 8: Commit**

```bash
rtk git add src/experience/rover/fade.ts src/experience/rover/Rover.tsx src/experience/rover/runtime.ts tests/unit/rover-fade.test.ts
rtk git commit -m "feat(rover): hashed-alpha body fade for first person and camera probes"
```

---

### Task 8: CameraDirector and Director integration, camera e2e

**Files:**
- Modify: `src/experience/camera/CameraDirector.tsx` (full rewrite below)
- Modify: `src/experience/scene/Director.tsx:115` (scrub direction) and after `roverRuntime.tilt = pose.tilt;` (about line 394)
- Create: `e2e/camera.spec.ts`
- Modify: `e2e/experience.spec.ts` (test "the L2 rail keeps its side view with limited yaw")
- Modify: `scripts/e2e-plan.ts` (`ALL_SPECS`, the camera rule, one new rule), `tests/unit/e2e-plan.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2 to 7: `orbitOffset`-based `followPose`/`railPose`, `pitchRange`, `followForward`, `railForward`, `scrubSign`, `clampCamera`, `CameraWorld`, `FIRST_PERSON`, `CAMERA_NEAR`, `CAMERA_FAR`, `firstPersonPose`, `blendPoses`, `easeBlend`, `viewSuspended`, the orbit API, `pitchAxisFromKeys`, the runtime probes.
- Produces: the visible behaviour; `roverRuntime.driving` (Director) and every camera probe (CameraDirector) each frame; the `camera` e2e spec.

- [ ] **Step 1: Map the new spec in the e2e plan (failing unit test first)**

In `tests/unit/e2e-plan.test.ts` add:

```ts
  it("maps the camera, its input, the rover fade and the view buttons to the camera spec", () => {
    expect(specsForChanges(["src/experience/camera/orbit.ts"]).specs).toEqual(["camera", "career", "experience"]);
    expect(specsForChanges(["src/experience/input/useInputSources.ts"]).specs).toEqual(["camera", "experience"]);
    expect(specsForChanges(["src/experience/rover/fade.ts"]).specs).toEqual(["camera", "experience"]);
    expect(specsForChanges(["src/hud/ViewControls.tsx"]).specs).toEqual(["camera", "experience"]);
    expect(specsForChanges(["e2e/camera.spec.ts"]).specs).toEqual(["camera"]);
  });
```

Run: `bunx vitest run tests/unit/e2e-plan.test.ts`
Expected: FAIL (`"camera"` is not a known spec yet).

- [ ] **Step 2: Write the camera e2e spec**

Create `e2e/camera.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import {
  asReturningVisitor,
  driveTo,
  enterFloorRoute,
  enterHQ,
  hoverTarget,
  padsOf,
  snapshot,
  targetPoint,
  visibleTarget,
  waitForCameraSettle,
  waitForFloor,
  waitForFrames,
  waitForHQ,
  waitForPhase,
  waitForRoverMove,
  waitForSceneLive,
} from "./hq";
import en from "../messages/en.json";
import { FIRST_PERSON } from "../src/experience/camera/firstPerson";
import { PITCH_LIMITS } from "../src/experience/camera/rigs";

/**
 * Round 5 camera work (P7): 360 degree orbit everywhere, pitch from just above the floor to near
 * top-down, the wheel and pinch zoom instead of changing floors, and first person after zooming all
 * the way in. Probes: `window.__hq.rover.camera*` and `driving` (src/experience/rover/runtime.ts).
 */
test.describe.configure({ timeout: 150_000 });

interface CameraProbe {
  mode: "third" | "first";
  blend: number;
  zoom: number;
  look: number;
  elevation: number;
  yaw: number;
  railYaw: number;
  driving: boolean;
  position: [number, number, number];
  forward: { x: number; z: number };
  rover: { x: number; y: number; z: number };
}

type CameraWindow = {
  __hq: {
    rover: {
      x: number;
      y: number;
      z: number;
      cameraMode: "third" | "first";
      cameraBlend: number;
      cameraZoom: number;
      cameraLook: number;
      cameraElevation: number;
      cameraYaw: number;
      cameraRailYaw: number;
      driving: boolean;
      cameraPosition: [number, number, number];
      cameraForward: { x: number; z: number };
    };
  };
  __blend: { min: number; values: number[] };
};

const probe = (page: Page): Promise<CameraProbe> =>
  page.evaluate(() => {
    const r = (window as unknown as CameraWindow).__hq.rover;
    return {
      mode: r.cameraMode,
      blend: r.cameraBlend,
      zoom: r.cameraZoom,
      look: r.cameraLook,
      elevation: r.cameraElevation,
      yaw: r.cameraYaw,
      railYaw: r.cameraRailYaw,
      driving: r.driving,
      position: [r.cameraPosition[0], r.cameraPosition[1], r.cameraPosition[2]],
      forward: { x: r.cameraForward.x, z: r.cameraForward.z },
      rover: { x: r.x, y: r.y, z: r.z },
    };
  });

/** Records every drawn blend from now on (one sample per animation frame). */
async function trackBlend(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as CameraWindow;
    w.__blend = { min: Infinity, values: [] };
    const tick = () => {
      const b = w.__hq.rover.cameraBlend;
      w.__blend.min = Math.min(w.__blend.min, b);
      w.__blend.values.push(b);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const blendLog = (page: Page) => page.evaluate(() => (window as unknown as CameraWindow).__blend);
const resetBlendLog = (page: Page) =>
  page.evaluate(() => {
    const log = (window as unknown as CameraWindow).__blend;
    log.min = Infinity;
    log.values = [];
  });

/** Wheel notches in over the canvas: from zoom 1 the third enters first person (from 1.5 the fifth); extra notches are ignored there. */
async function enterFirstPerson(page: Page) {
  const size = page.viewportSize()!;
  await page.mouse.move(size.width / 2, size.height / 2);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -120);
  await expect.poll(async () => (await probe(page)).blend, { timeout: 30_000 }).toBe(1);
}

/** A vertical left-button drag on open floor right of the rover, inside the HUD-free band (positive dy drags down). */
async function verticalDrag(page: Page, dy: number) {
  const y0 = dy > 0 ? 180 : 780;
  await page.mouse.move(1000, y0);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(1000 + i, y0 + (dy * i) / 12);
  await page.mouse.up();
}

/** Two-finger pinch through CDP: the distance between the fingers goes from `from` to `to` px. */
async function pinch(page: Page, from: number, to: number, y = 500) {
  const cdp = await page.context().newCDPSession(page);
  const at = (d: number) => [
    { x: 195 - d / 2, y, id: 1 },
    { x: 195 + d / 2, y, id: 2 },
  ];
  let timestamp = Date.now() / 1000;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(from), timestamp });
  for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(from + ((to - from) * i) / 10), timestamp: (timestamp += 0.04) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: (timestamp += 0.04) });
  await cdp.detach();
}

test.describe("wheel zoom and first person", () => {
  test("the wheel zooms and never changes floors; all the way in looks through Rover's eyes and WASD drives where you look", async ({ page }) => {
    await enterHQ(page);
    await waitForCameraSettle(page);
    expect((await probe(page)).mode).toBe("third");
    await page.mouse.move(720, 450);
    await page.mouse.wheel(0, -120);
    await expect.poll(async () => (await probe(page)).zoom).toBeLessThan(0.9);
    await page.mouse.wheel(0, 240);
    await expect.poll(async () => (await probe(page)).zoom).toBeGreaterThan(1.1);
    expect((await snapshot(page)).floor).toBe("L1");

    await enterFirstPerson(page);
    const fp = await probe(page);
    expect(fp.mode).toBe("first");
    expect(fp.position[1]).toBeCloseTo(fp.rover.y + FIRST_PERSON.eyeHeight, 1);
    expect(Math.hypot(fp.position[0] - fp.rover.x, fp.position[2] - fp.rover.z)).toBeLessThan(0.05);
    const inside = await snapshot(page);
    expect(inside.floor).toBe("L1");
    expect(inside.ride).toBeNull();
    expect(inside.drawCalls).toBeLessThan(140);

    const before = inside.rover;
    const look = fp.forward;
    await page.keyboard.down("w");
    await waitForRoverMove(page, before, 3);
    await page.keyboard.up("w");
    const after = (await snapshot(page)).rover;
    const moved = { x: after.x - before.x, z: after.z - before.z };
    expect((moved.x * look.x + moved.z * look.z) / Math.hypot(moved.x, moved.z)).toBeGreaterThan(0.7);
    expect((await probe(page)).blend).toBe(1);

    await page.mouse.wheel(0, 120);
    await expect.poll(async () => (await probe(page)).blend, { timeout: 30_000 }).toBe(0);
    expect((await probe(page)).mode).toBe("third");
    expect((await snapshot(page)).floor).toBe("L1");
  });

  test("the view tilts from just above the floor to near top-down, never under it, also in first person", async ({ page }) => {
    await enterHQ(page);
    await waitForCameraSettle(page);
    // Drag up: the camera sinks to just above the floor (L1 is at y 0).
    await verticalDrag(page, -600);
    await waitForCameraSettle(page);
    let p = await probe(page);
    expect(p.elevation).toBeLessThan(0.2);
    expect(p.elevation).toBeGreaterThanOrEqual(PITCH_LIMITS[0] - 0.02);
    expect(p.position[1]).toBeGreaterThan(0.5);
    // Drag down: near top-down, never past it.
    await verticalDrag(page, 600);
    await waitForCameraSettle(page);
    p = await probe(page);
    expect(p.elevation).toBeGreaterThan(1.3);
    expect(p.elevation).toBeLessThanOrEqual(PITCH_LIMITS[1] + 0.02);
    // R tilts the view back up.
    await page.keyboard.down("r");
    await expect.poll(async () => (await probe(page)).elevation, { timeout: 30_000 }).toBeLessThan(1.2);
    await page.keyboard.up("r");

    await page.keyboard.press("0");
    await enterFirstPerson(page);
    await verticalDrag(page, 600);
    p = await probe(page);
    expect(p.look).toBeCloseTo(FIRST_PERSON.pitch[0], 5);
    expect(p.position[1]).toBeCloseTo(FIRST_PERSON.eyeHeight, 1);
    await verticalDrag(page, -600);
    expect((await probe(page)).look).toBeCloseTo(FIRST_PERSON.pitch[1], 5);
  });

  test("reduced motion cuts straight between third and first person", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await enterHQ(page);
    await trackBlend(page);
    await enterFirstPerson(page);
    await page.mouse.wheel(0, 120);
    await expect.poll(async () => (await probe(page)).blend, { timeout: 30_000 }).toBe(0);
    const { values } = await blendLog(page);
    expect(values).toContain(1);
    expect(values.filter((b) => b > 0 && b < 1)).toEqual([]);
  });

  test("autopilot drives and elevator rides pull back to third person and come back to first person", async ({ page }) => {
    await enterHQ(page);
    await enterFirstPerson(page);
    await trackBlend(page);
    const lift = (await padsOf(page, "L1")).find((p) => p.kind === "elevator")!;
    await driveTo(page, { x: lift.at.x + 8, z: lift.at.z });
    expect((await blendLog(page)).min).toBeLessThan(0.05);
    await expect.poll(async () => (await probe(page)).blend, { timeout: 30_000 }).toBe(1);

    await resetBlendLog(page);
    await page.keyboard.press("PageUp");
    await waitForFloor(page, "L2");
    expect((await blendLog(page)).min).toBe(0);
    await expect.poll(async () => (await probe(page)).blend, { timeout: 60_000 }).toBe(1);
    expect((await probe(page)).mode).toBe("first");
  });

  test("point-and-go works from Rover's eyes and the drive pulls back to third person", async ({ page }) => {
    await enterHQ(page);
    const lift = (await padsOf(page, "L1")).find((p) => p.kind === "elevator")!;
    await driveTo(page, { x: lift.at.x + 10, z: lift.at.z });
    await enterFirstPerson(page);
    // One rotate step right looks west (-x), straight at the pad.
    await page.getByRole("button", { name: en.hud.view.rotateRight }).click();
    await expect.poll(async () => (await probe(page)).forward.x, { timeout: 15_000 }).toBeLessThan(-0.99);
    const pad = await visibleTarget(page, { kinds: ["elevator-pad"] });
    await hoverTarget(page, pad.id);
    const point = await targetPoint(page, pad.id);
    await trackBlend(page);
    await page.mouse.click(point.x, point.y);
    await expect(page.getByTestId("pad-picker")).toBeVisible({ timeout: 30_000 });
    expect((await blendLog(page)).min).toBeLessThan(0.2);
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await probe(page)).blend, { timeout: 30_000 }).toBe(1);
  });

  test("the ! hints and Rover's dialog show in first person", async ({ page }) => {
    await asReturningVisitor(page);
    await page.addInitScript(() => localStorage.setItem("hq:hints", "on"));
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    const lift = (await padsOf(page, "L1")).find((p) => p.kind === "elevator")!;
    await driveTo(page, { x: lift.at.x + 4, z: lift.at.z });
    await enterFirstPerson(page);
    await page.getByRole("button", { name: en.hud.view.rotateRight }).click();
    await expect.poll(async () => (await probe(page)).forward.x, { timeout: 15_000 }).toBeLessThan(-0.99);
    // Off the canvas, so nothing is hovered (a hovered target hides the bubble).
    await page.mouse.move(1, 1);
    const bubble = page.getByTestId("hint-bubble");
    await expect(bubble).toBeVisible({ timeout: 15_000 });
    await expect(bubble).toHaveAttribute("data-hint", "L1:pad:elevator");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("dialog-box")).toHaveAttribute("data-dialog", "hint:L1:pad:elevator");
    expect((await probe(page)).blend).toBe(1);
  });

  test("L2 turns all the way around the rover and resets to its side view", async ({ page }) => {
    await enterFloorRoute(page, "/en/journey");
    const right = page.getByRole("button", { name: en.hud.view.rotateRight });
    for (let i = 0; i < 4; i++) await right.click();
    await expect.poll(async () => (await probe(page)).railYaw, { timeout: 30_000 }).toBeGreaterThan(Math.PI - 0.01);
    await waitForCameraSettle(page);
    const p = await probe(page);
    expect(p.position[2]).toBeLessThan(p.rover.z - 10);
    expect(p.yaw).toBe(0);
    await page.keyboard.press("0");
    await expect.poll(async () => Math.abs(Math.sin((await probe(page)).railYaw / 2)), { timeout: 15_000 }).toBeLessThan(0.01);
  });
});

const BUDGET_FLOORS = [
  { floor: "L1", path: "/en", cap: 140 },
  { floor: "L2", path: "/en/journey", cap: 150 },
  { floor: "L3", path: "/en/labs", cap: 150 },
  { floor: "L4", path: "/en/library", cap: 150 },
  { floor: "RF", path: "/en/contact", cap: 80 },
] as const;

test.describe("first person render budget", () => {
  for (const { floor, path, cap } of BUDGET_FLOORS) {
    test(`first person on ${floor} stays under ${cap} draw calls and 30k triangles all the way around`, async ({ page }) => {
      await enterFloorRoute(page, path);
      await expect.poll(async () => (await probe(page)).driving, { timeout: 30_000 }).toBe(false);
      await enterFirstPerson(page);
      const right = page.getByRole("button", { name: en.hud.view.rotateRight });
      const key = floor === "L2" ? "railYaw" : "yaw";
      for (let quarter = 0; quarter < 4; quarter++) {
        await waitForFrames(page, 12);
        const { drawCalls, triangles } = await snapshot(page);
        expect(drawCalls, `${floor} quarter ${quarter}`).toBeGreaterThan(10);
        expect(drawCalls, `${floor} quarter ${quarter}`).toBeLessThan(cap);
        expect(triangles, `${floor} quarter ${quarter}`).toBeLessThan(30_000);
        const before = (await probe(page))[key];
        await right.click();
        await right.click();
        await expect.poll(async () => (await probe(page))[key] - before, { timeout: 15_000 }).toBeGreaterThan(Math.PI / 2 - 0.01);
      }
    });
  }
});

test.describe("touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

  test("pinch zooms, all the way into first person and back out, and never changes floors", async ({ page }) => {
    await enterHQ(page);
    await waitForCameraSettle(page);
    await pinch(page, 120, 160);
    await expect.poll(async () => (await probe(page)).zoom).toBeLessThan(0.95);
    expect((await probe(page)).mode).toBe("third");
    await pinch(page, 80, 300);
    await expect.poll(async () => (await probe(page)).blend, { timeout: 30_000 }).toBe(1);
    await pinch(page, 300, 120);
    await expect.poll(async () => (await probe(page)).blend, { timeout: 30_000 }).toBe(0);
    expect((await snapshot(page)).floor).toBe("L1");
  });
});
```

In `e2e/experience.spec.ts` replace the test "the L2 rail keeps its side view with limited yaw" with:

```ts
  test("the L2 camera turns all the way around the rover too", async ({ page }) => {
    await asReturningVisitor(page);
    await page.goto("/en/journey?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore", 60_000);
    await page.keyboard.down("e");
    await expect.poll(async () => (await yaws(page)).rail, { timeout: 60_000 }).toBeGreaterThan(Math.PI + 0.3);
    await page.keyboard.up("e");
    const { rail, yaw } = await yaws(page);
    expect(rail).toBeGreaterThan((35 * Math.PI) / 180);
    expect(yaw).toBe(0);
  });
```

- [ ] **Step 3: Register the spec and its rules**

In `scripts/e2e-plan.ts` add `"camera",` to `ALL_SPECS` between `"boot-first",` and `"career",`. Replace the camera rule and add one rule right after it:

```ts
  { test: /^src\/experience\/camera\//, specs: ["camera", "experience", "career"] },
  // Round 5 camera work: input, the rover body fade and the view buttons.
  { test: /^src\/experience\/input\/|^src\/experience\/rover\/(Rover\.tsx|fade\.ts|runtime\.ts)$|^src\/hud\/ViewControls\.tsx$/, specs: ["camera", "experience"] },
```

Run: `bunx vitest run tests/unit/e2e-plan.test.ts`
Expected: PASS.

- [ ] **Step 4: Build and run the new spec to see it fail**

Run:

```bash
bun run build
E2E_PORT=4436 bunx playwright test e2e/camera.spec.ts -g "the wheel zooms"
```

Expected: FAIL at `expect.poll(... blend).toBe(1)` in `enterFirstPerson` (`Received: 0`): the orbit state enters first person, but the camera does not draw it yet.

- [ ] **Step 5: Rewrite `CameraDirector.tsx`**

Replace `src/experience/camera/CameraDirector.tsx` with:

```tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { Fog, PerspectiveCamera, Vector3 } from "three";
import type { FloorId } from "@/content/schema";
import { cameraShift, drawerLayout } from "@/hud/drawer/layout";
import { getHQStore, type HQState } from "@/store/useHQStore";
import { floorY } from "../config";
import { roadZAt } from "../floors/career/layout";
import { intents, pitchAxisFromKeys, rotateAxisFromKeys } from "../input/intents";
import { MAX_FRAME_DT } from "../rover/controller";
import { roverRuntime } from "../rover/runtime";
import { sceneSettings } from "../scene/settings";
import type { FloorLayout, Vec2 } from "../types";
import { clampCamera, type CameraWorld } from "./collision";
import { blendPoses, CAMERA_FAR, CAMERA_NEAR, easeBlend, FIRST_PERSON, firstPersonPose, viewSuspended } from "./firstPerson";
import { cameraFocus } from "./focus";
import { followEase, followOffsetScale } from "./offset";
import { createOrbitState, KEY_PITCH_SPEED, KEY_ROTATE_SPEED, resetView, rotate, rotateStep, setPitchRange, stepOrbit, updateZone, zoneAt, zoomBy } from "./orbit";
import {
  FOLLOW_LOOK_AHEAD,
  followForward,
  followPose,
  forwardOf,
  hologramShift,
  INTRO_DURATION,
  introPose,
  pitchRange,
  railForward,
  railPose,
  reducedIntroPose,
  selectRig,
  springFactor,
  type CameraPose,
  type Vec3,
} from "./rigs";

/** First person waits while the rover drives itself, rides, beams, or a room, the hologram or the intro holds the view. */
function holdThirdPerson(s: HQState): boolean {
  return viewSuspended({ phase: s.phase, ride: s.ride !== null, beam: s.beam !== null, mission: s.mission?.status === "running", driving: roverRuntime.driving });
}

const toVec3 = (v: Vector3): Vec3 => [v.x, v.y, v.z];

/**
 * Applies the active camera rig every frame with critically damped smoothing. The camera turns all the
 * way around the rover on every floor (drag, twist, trackpad, Q/E, buttons) and tilts from just above
 * the floor to near top-down (drag, R/F, two-finger drag); low cameras are pulled in out of walls.
 * Zooming in past the closest distance glides into first person: the smoothed third-person pose is
 * mixed toward the rover's eyes by the orbit blend, so `blend = 0` is exactly the third-person camera.
 */
export function CameraDirector({
  held,
  railAxis = [],
  layouts,
}: {
  held: RefObject<Set<string>>;
  railAxis?: readonly Vec2[];
  layouts?: Record<FloorId, FloorLayout>;
}) {
  const local = useRef({
    orbit: createOrbitState(),
    now: 0,
    introStart: null as number | null,
    ready: false,
    pos: new Vector3(),
    target: new Vector3(),
    desiredPos: new Vector3(),
    desiredTarget: new Vector3(),
    /** Drawn camera after the first-person mix (equal to pos and target while the blend is 0). */
    outPos: new Vector3(),
    outTarget: new Vector3(),
    shift: { x: 0, y: 0 },
    /** Reduced motion: cut (no glide) from the still intro shot to the follow camera on the next frame. */
    cut: false,
  });

  useEffect(
    () =>
      intents.on((intent) => {
        const { orbit } = local.current;
        const s = getHQStore().getState();
        const rail = selectRig(s.phase, s.floor) === "rail";
        if (intent.type === "orbit") {
          // On L2 a one-finger swipe scrubs through the years; it does not turn the view.
          if (rail && intent.source === "touch") return;
          if (intent.smooth) rotateStep(orbit, Math.sign(intent.dyaw), rail);
          else rotate(orbit, intent.dyaw, intent.dpitch ?? 0, rail);
        } else if (intent.type === "zoom") {
          // Past the closest distance this enters first person, but not while the view is held in third person.
          zoomBy(orbit, intent.factor, !holdThirdPerson(s));
        } else if (intent.type === "view") {
          resetView(orbit);
        }
      }),
    [],
  );

  useFrame((three, rawDt) => {
    const camera = three.camera as PerspectiveCamera;
    const scene = three.scene;
    const dt = Math.min(rawDt, MAX_FRAME_DT);
    const l = local.current;
    l.now += dt;
    const s = getHQStore().getState();
    const cls = s.device.camera;
    const rig = selectRig(s.phase, s.floor);
    const rail = rig === "rail";
    const roverTarget: Vec3 = [roverRuntime.x, roverRuntime.y + 1, roverRuntime.z];

    const { orbit } = l;
    setPitchRange(orbit, pitchRange(cls, rail ? "rail" : "follow"));
    const exploring = s.phase === "explore" || s.phase === "elevator";
    const keys = held.current ?? [];
    const axis = exploring ? rotateAxisFromKeys(keys) : 0;
    const tilt = exploring ? pitchAxisFromKeys(keys) : 0;
    if (axis || tilt) rotate(orbit, axis * KEY_ROTATE_SPEED * dt, tilt * KEY_PITCH_SPEED * dt, rail);
    if (exploring && !s.ride) updateZone(orbit, zoneAt(s.floor, roverRuntime, layouts?.[s.floor].viewZones), s.reducedMotion);
    stepOrbit(orbit, dt, s.reducedMotion, rig === "intro" || holdThirdPerson(s));
    roverRuntime.cameraYaw = orbit.yaw;
    roverRuntime.cameraRailYaw = orbit.railYaw;
    roverRuntime.cameraMode = orbit.firstPerson ? "first" : "third";
    roverRuntime.cameraBlend = orbit.blend;
    roverRuntime.cameraZoom = orbit.zoom;
    roverRuntime.cameraLook = orbit.look;

    // Camera collision works against the current floor; rides cross floors, so it rests during them.
    const layout = layouts && !s.ride ? layouts[s.floor] : undefined;
    const world: CameraWorld | null = layout ? { obstacles: layout.obstacles, bounds: layout.bounds, floorY: floorY(s.floor) } : null;

    let desired: CameraPose;
    let snap = false;
    const focus = s.phase === "hologram" ? cameraFocus.pose : null;
    if (focus) {
      desired = focus;
      snap = s.reducedMotion;
    } else if (rig === "intro") {
      const end = followPose(cls, roverTarget);
      snap = true;
      if (s.phase === "boot") {
        l.introStart = null;
        desired = introPose(cls, 0, end);
      } else {
        // The intro always runs its full length; reduced motion holds a still exterior shot instead of the orbit.
        l.introStart ??= l.now;
        const t = l.now - l.introStart;
        desired = s.reducedMotion ? reducedIntroPose(cls, end) : introPose(cls, t, end);
        if (t >= INTRO_DURATION) {
          s.finishIntro();
          l.cut = s.reducedMotion;
        }
      }
    } else if (rail) {
      desired = railPose(cls, roverRuntime.x, roverRuntime.y, orbit.zoom, roverRuntime.z, orbit.railYaw, roadZAt(railAxis, roverRuntime.x), orbit.pitch);
    } else {
      // Look slightly ahead of the rover so more of the floor in front is visible.
      const ahead = FOLLOW_LOOK_AHEAD[cls];
      const f = roverRuntime.cameraForward;
      const scale = followOffsetScale(cls, three.size.width / Math.max(1, three.size.height));
      desired = followPose(cls, [roverTarget[0] + f.x * ahead, roverTarget[1], roverTarget[2] + f.z * ahead], orbit.yaw, orbit.zoom * scale, orbit.pitch);
    }
    // A low third-person camera stays above the floor, on the slab and out of obstacles: pulled in along its view ray. High poses never move.
    if (world && !focus && rig !== "intro") desired = { ...desired, position: clampCamera(desired.target, desired.position, world, roverTarget) };

    // A teleport moved the rover far along the road: cut to it instead of gliding across the floor.
    if (roverRuntime.cameraSnap) {
      roverRuntime.cameraSnap = false;
      if (!focus) snap = true;
    }
    if (l.cut && rig !== "intro") {
      snap = true;
      l.cut = false;
    }

    l.desiredPos.set(...desired.position);
    l.desiredTarget.set(...desired.target);
    if (!l.ready || snap) {
      l.pos.copy(l.desiredPos);
      l.target.copy(l.desiredTarget);
      l.ready = true;
    } else {
      const k = followEase(dt, s.reducedMotion);
      l.pos.lerp(l.desiredPos, k);
      l.target.lerp(l.desiredTarget, k);
    }

    // First person: mix the smoothed third-person camera toward the rover's eyes by the eased blend.
    const fp = orbit.blend > 0 && rig !== "intro";
    let fov = desired.fov;
    let forward: Vec2 = rail ? railForward(orbit.railYaw) : forwardOf(desired);
    l.outPos.copy(l.pos);
    l.outTarget.copy(l.target);
    if (fp) {
      const look = rail ? railForward(orbit.railYaw) : followForward(cls, orbit.yaw);
      const eye = firstPersonPose(cls, [roverRuntime.x, roverRuntime.y, roverRuntime.z], look, orbit.look);
      const mixed = blendPoses({ position: toVec3(l.pos), target: toVec3(l.target), fov: desired.fov }, eye, orbit.blend);
      const position = world ? clampCamera(eye.position, mixed.position, world) : mixed.position;
      l.outPos.set(...position);
      l.outTarget.set(...mixed.target);
      fov = mixed.fov;
      if (easeBlend(orbit.blend) >= 0.5) forward = look;
    }
    camera.position.copy(l.outPos);
    camera.lookAt(l.outTarget);
    const near = fp ? FIRST_PERSON.near : CAMERA_NEAR;
    const far = fp && orbit.blend >= 1 ? FIRST_PERSON.far : CAMERA_FAR;
    let projection = false;
    if (camera.near !== near || camera.far !== far) {
      camera.near = near;
      camera.far = far;
      projection = true;
    }
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = snap || fp ? fov : camera.fov + (fov - camera.fov) * springFactor(dt);
      projection = true;
    }
    if (projection) camera.updateProjectionMatrix();
    // Keep the rover (or the hologram) clear of HUD panels by shifting the view window (appendix 04).
    const { width, height } = three.size;
    const want =
      s.phase === "hologram" && focus
        ? hologramShift(width / Math.max(1, height))
        : s.phase === "room" && s.activeRoom
          ? cameraShift(drawerLayout(width, height), width)
          : { x: 0, y: 0 };
    const ks = s.reducedMotion ? 1 : springFactor(dt);
    l.shift.x += (want.x - l.shift.x) * ks;
    l.shift.y += (want.y - l.shift.y) * ks;
    if (Math.abs(l.shift.x) > 1e-3 || Math.abs(l.shift.y) > 1e-3) camera.setViewOffset(width, height, l.shift.x * width, l.shift.y * height, width, height);
    else if (camera.view?.enabled) camera.clearViewOffset();

    // Steering is camera-relative: on L2 straight away from the camera, in first person where the eyes look.
    if (!focus) roverRuntime.cameraForward = forward;
    roverRuntime.cameraPosition = toVec3(l.outPos);
    roverRuntime.cameraElevation = Math.atan2(l.outPos.y - l.outTarget.y, Math.hypot(l.outPos.x - l.outTarget.x, l.outPos.z - l.outTarget.z));
    if (scene.fog instanceof Fog) {
      // Ease the linear fog range between rigs so the intro fly-in and the first-person glide do not pop.
      const { near: fogNear, far: fogFar } = sceneSettings(s.tier, focus ? "focus" : fp && orbit.blend >= 0.5 ? "first" : rig).fog;
      const kf = snap ? 1 : springFactor(dt);
      scene.fog.near += (fogNear - scene.fog.near) * kf;
      scene.fog.far += (fogFar - scene.fog.far) * kf;
    }
  });

  return null;
}
```

- [ ] **Step 6: Publish `driving` and flip L2 scrubs in the Director**

In `src/experience/scene/Director.tsx`:

1. Add `import { scrubSign } from "../camera/rigs";` as the first `../` import (right before `import { CAR, floorY, ROVER } from "../config";`).
2. Replace the scrub target line (about line 115) with:

```ts
          // Turned around (the camera orbits 360 degrees), a swipe still moves toward the side it pulls from.
          const x = scrubTarget(controller.pose.x, intent.dx * scrubSign(roverRuntime.cameraRailYaw), window.innerWidth, stops);
```

3. After `roverRuntime.tilt = pose.tilt;` add:

```ts
    // The camera holds third person while the rover follows a path (autopilot, scrub, mission leg, elevator approach).
    roverRuntime.driving = controller.following;
```

- [ ] **Step 7: Typecheck, lint, build and run the camera e2e**

Run:

```bash
bun run typecheck
bun run lint
bun run build
E2E_PORT=4436 bunx playwright test e2e/camera.spec.ts
```

Expected: typecheck and lint exit 0; Playwright `13 passed`. If "first person on L1 stays under 140" fails, read the reported count: lower `FIRST_PERSON.far` to 64 (the fog end, still invisible) and rerun before touching anything else.

- [ ] **Step 8: Run the existing camera, career and interact specs**

Run: `E2E_PORT=4436 bunx playwright test e2e/experience.spec.ts e2e/career.spec.ts e2e/interact.spec.ts`
Expected: all pass (third-person defaults, the L2 scrub at yaw 0 and point-and-go are unchanged; the L2 test now checks 360 degrees).

- [ ] **Step 9: Commit**

```bash
rtk git add src/experience/camera/CameraDirector.tsx src/experience/scene/Director.tsx e2e/camera.spec.ts e2e/experience.spec.ts scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts
rtk git commit -m "feat(camera): free 360 degree orbit with camera collision, wheel zoom into first person"
```

---

### Task 9: Controls hint, canvas description and the tutorial's camera line (EN/ID)

**Files:**
- Modify: `messages/en.json`, `messages/id.json` (`hud.canvasDescription`, `hud.hintFine`, `hud.hintCoarse`, `dialog.onboarding.cameraFine`, `dialog.onboarding.cameraCoarse`)
- Modify: `src/hud/dialog/onboarding.ts` (`OnboardingCopy`, step 2 lines)
- Modify: `src/hud/dialog/OnboardingLayer.tsx` (copy object)
- Modify: `src/hud/ViewControls.tsx` (`data-onboard="view"`)
- Test: `tests/unit/onboarding.test.ts`, `tests/hud/OnboardingLayer.test.tsx`, `e2e/onboarding.spec.ts`, `e2e/screenshots.spec.ts`

**Interfaces:**
- Consumes: the spotlight convention (`data-onboard` name, `Spotlight.tsx`), `say()` lines.
- Produces: `OnboardingCopy.cameraFine`, `OnboardingCopy.cameraCoarse`; a `camera` line (key `camera`, spotlight `view`) right after `moved` in both the full and the short tour.

- [ ] **Step 1: Write the failing unit tests**

In `tests/unit/onboarding.test.ts`:

1. In `const copy: OnboardingCopy = {...}` add after `moved: "moved",`:

```ts
  cameraFine: "cameraFine",
  cameraCoarse: "cameraCoarse",
```

2. In "walks the full tour in order and offers Skip after the first line" replace the keys assertion and add two lines after the spotlight assertions:

```ts
    expect(fake.keys()).toEqual(["welcome", "move", "point-go", "moved", "camera", "highlights", "elevator", "ask-rover", "ask-ai", "closing"]);
```

```ts
    expect(fake.line("camera").spotlight).toBe("view");
    expect(fake.line("camera").text).toBe("cameraFine");
```

3. In "speaks touch controls on coarse pointers" add `expect(fake.line("camera").text).toBe("cameraCoarse");`.
4. In "stops when the skip button is pressed mid-tour" use `["welcome", "move", "point-go", "moved", "camera", "skipped"]`.
5. In "runs the short tour after a deep link" use `["welcome", "move", "point-go", "moved", "camera", "ask-rover", "ask-ai", "closing"]`.

In `tests/hud/OnboardingLayer.test.tsx`, in the test that advances past `"moved"`, replace

```ts
    await vi.waitFor(() => expect(dialog.view.line?.key).toBe("moved"));
    await act(async () => {
      dialog.advance();
      dialog.advance();
    });
    await vi.waitFor(() => expect(dialog.view.line?.key).toBe("ask-rover"));
```

with

```ts
    await vi.waitFor(() => expect(dialog.view.line?.key).toBe("moved"));
    await act(async () => {
      dialog.advance();
      dialog.advance();
    });
    await vi.waitFor(() => expect(dialog.view.line?.key).toBe("camera"));
    await act(async () => {
      dialog.advance();
      dialog.advance();
    });
    await vi.waitFor(() => expect(dialog.view.line?.key).toBe("ask-rover"));
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/unit/onboarding.test.ts tests/hud/OnboardingLayer.test.tsx`
Expected: FAIL (the keys lists lack `camera`; TypeScript-level extra keys in `copy` are accepted by Vitest at runtime).

- [ ] **Step 3: Add the line, the copy and the spotlight target**

In `src/hud/dialog/onboarding.ts` add to `OnboardingCopy` after `moved: string;`:

```ts
  cameraFine: string;
  cameraCoarse: string;
```

Replace the step 2 comment and `say` call with:

```ts
  // 2. Moving: keys or joystick and boost, then point-and-go (there is no click-the-floor driving any
  // more: desktop points and clicks a glowing object, touch taps it twice or uses its Go chip); waits
  // until the rover moves, whichever way. Then the camera (round 5): look around, zoom, first person.
  result = await d.say(
    [
      { key: "move", text: d.coarse ? copy.moveCoarse : copy.moveFine },
      { key: "point-go", text: d.coarse ? copy.pointGoCoarse : copy.pointGoFine, until: d.waitForMove, fallbackMs: d.tryItMs ?? TRY_IT_MS },
      { key: "moved", text: copy.moved, face: "arrived" },
      { key: "camera", text: d.coarse ? copy.cameraCoarse : copy.cameraFine, spotlight: "view" },
    ],
    tour,
  );
```

In `src/hud/dialog/OnboardingLayer.tsx`, in the `copy` object add after `moved: t("moved"),`:

```ts
        cameraFine: t("cameraFine"),
        cameraCoarse: t("cameraCoarse"),
```

In `src/hud/ViewControls.tsx` add `data-onboard="view"` to the group `div` (after `data-testid="view-controls"`).

In `messages/en.json`:

- replace the value of `hud.hintFine` with `"Drive: WASD or arrows · Boost: hold Shift · Go: click a glowing object · Rotate: drag or Q/E · Zoom: scroll · Floors: PgUp/PgDn"`
- replace the value of `hud.hintCoarse` with `"Drive: joystick · Boost: hold the boost button · Go: tap a glowing object twice · Rotate: drag · Zoom: pinch · Floors: swipe up or down"`
- replace the value of `hud.canvasDescription` with `"Explore five floors with the Screen Rover. Use WASD or arrow keys to drive (hold Shift to boost). Hover a glowing object (a door, the elevator pad, a board) to see its name and click it to drive there. Drag, use Q and E or the rotate buttons to turn the view all the way around, and R and F to tilt it; press 0 to reset it. Scroll, pinch or press + and - to zoom; zoom all the way in to see through the rover's eyes, where WASD drives where you look, and zoom out to return. The view turns toward displays as you approach. Rotate it yourself to override. Use the elevator, its call pads or PageUp and PageDown to change floors. Page view shows the portfolio as a page."`
- after `"moved": "Nice driving!",` add:

```json
      "cameraFine": "Drag or use Q and E to look around. Scroll to zoom, all the way in to see through my eyes!",
      "cameraCoarse": "Drag or twist two fingers to look around. Pinch to zoom, all the way in to see through my eyes!",
```

In `messages/id.json`:

- `hud.hintFine`: `"Kemudi: WASD atau panah · Turbo: tahan Shift · Tuju: klik objek yang menyala · Putar: seret atau Q/E · Zoom: scroll · Lantai: PgUp/PgDn"`
- `hud.hintCoarse`: `"Kemudi: joystick · Turbo: tahan tombol turbo · Tuju: ketuk dua kali objek yang menyala · Putar: seret · Zoom: cubit · Lantai: geser ke atas atau bawah"`
- `hud.canvasDescription`: `"Jelajahi lima lantai bersama Screen Rover. Gunakan WASD atau tombol panah untuk menyetir (tahan Shift untuk turbo). Arahkan kursor ke objek yang menyala (pintu, pad lift, papan) untuk melihat namanya, lalu klik untuk menuju ke sana. Seret, gunakan Q dan E, atau tombol putar untuk memutar tampilan sepenuhnya, serta R dan F untuk memiringkannya; tekan 0 untuk mengatur ulang. Scroll, cubit, atau tekan + dan - untuk zoom; zoom sampai paling dekat untuk melihat lewat mata rover, dengan WASD menyetir ke arah pandangan, lalu zoom keluar untuk kembali. Tampilan otomatis menghadap panel saat rover mendekat. Putar sendiri untuk mengganti arahnya. Pindah lantai lewat lift, pad panggilnya, atau PageUp dan PageDown. Tampilan halaman menampilkan portofolio sebagai halaman."`
- after `"moved": "Mantap, kemudinya lancar!",` add:

```json
      "cameraFine": "Seret atau pakai Q dan E untuk melihat sekeliling. Scroll untuk zoom; zoom terus untuk lihat dari mata saya!",
      "cameraCoarse": "Seret atau putar dua jari untuk melihat sekeliling. Cubit untuk zoom; zoom terus untuk lihat dari mata saya!",
```

(Lengths: 90, 95, 108 and 108 characters, under the 110 limit.)

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `bun run test`
Expected: all Vitest files pass, including `tests/unit/dialog-copy.test.ts` (line length), `tests/unit/ui-copy.test.ts` (EN/ID key parity), the em-dash scan and the onboarding tests.

- [ ] **Step 5: Walk the new line in the onboarding e2e**

In `e2e/onboarding.spec.ts`, after each of the four places where the tour leaves `"moved"`, insert the camera line:

1. In the full tour test (the block followed by `// The Highlights Hall on L1 east ...`), turn

```ts
    await expectLine(page, "moved");
    await next(page);

    // The Highlights Hall on L1 east (its stations register once the hall mounts after the intro).
```

into

```ts
    await expectLine(page, "moved");
    await next(page);
    await expectLine(page, "camera");
    await expect(page.getByTestId("onboard-spotlight")).toHaveAttribute("data-target", "view");
    await next(page);

    // The Highlights Hall on L1 east (its stations register once the hall mounts after the intro).
```

2. In the "Take me there" test and 3. in the Continue-fallback test, after `await expectLine(page, "moved");` and its `await next(page);` add:

```ts
    await expectLine(page, "camera");
    await next(page);
```

4. In the test that presses Enter right after `"moved"` (`await expectLine(page, "moved"); await page.keyboard.press("Enter");`), add after that Enter:

```ts
    await expectLine(page, "camera");
    await page.keyboard.press("Enter");
```

In `e2e/screenshots.spec.ts` (opt-in), after `await expect(box).toHaveAttribute("data-line", "moved");` and its `await advance();` add:

```ts
      await expect(box).toHaveAttribute("data-line", "camera");
      await advance();
```

- [ ] **Step 6: Build and run the onboarding e2e**

Run:

```bash
bun run build
E2E_PORT=4436 bunx playwright test e2e/onboarding.spec.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
rtk git add messages/en.json messages/id.json src/hud/dialog/onboarding.ts src/hud/dialog/OnboardingLayer.tsx src/hud/ViewControls.tsx tests/unit/onboarding.test.ts tests/hud/OnboardingLayer.test.tsx e2e/onboarding.spec.ts e2e/screenshots.spec.ts
rtk git commit -m "feat(hud): camera controls in the hint, the canvas description and the tutorial (EN/ID)"
```

---

### Task 10: Docs (README, AGENTS.md, spec appendices 02 and 03)

**Files:**
- Modify: `README.md` (the "Try it" paragraph, the `bun run test` row)
- Modify: `AGENTS.md` ("3D experience": the Camera bullet, the Pure modules bullet, a new bullet; "Rover dialog, onboarding and hints": the Onboarding bullet; "Fast verification": the e2e:changed mapping)
- Modify: `docs/superpowers/specs/agent-hq/03-rover-camera-input.md` (section 2 table and bullets, controls table, section 3 intents)
- Modify: `docs/superpowers/specs/agent-hq/02-interaction-and-states.md` (state diagram edge)

**Interfaces:**
- Consumes: the names and numbers from Tasks 2 to 9.
- Produces: documentation only.

- [ ] **Step 1: README**

In the "Try it" paragraph replace `change floors with the elevator panel (every button is named after its page: L1 Home, L2 Journey, L3 Work, L4 Writing, RF About), the mouse wheel or PageUp/PageDown.` with:

`change floors with the elevator panel (every button is named after its page: L1 Home, L2 Journey, L3 Work, L4 Writing, RF About) or PageUp/PageDown. Drag, Q/E or the rotate buttons turn the view all the way around on every floor and R/F tilt it (from just above the floor to almost straight down); scroll, pinch or +/- zoom, and zooming all the way in switches to a first-person view through Rover's eyes (WASD drives where you look; zoom out, 0 or the reset button return; autopilot drives and elevator rides show the rover from behind meanwhile).`

In the same paragraph replace `driving and boost, point-and-go, the Highlights Hall` with `driving and boost, point-and-go, the camera (look around, zoom, first person), the Highlights Hall`.

In the scripts table replace `camera rigs, URL sync, GPU tier |` with `camera rigs, orbit, collision and first person, URL sync, GPU tier |`.

- [ ] **Step 2: AGENTS.md**

Replace the bullet starting `- Camera: \`camera/orbit.ts\` holds the orbit state` with:

```markdown
- Camera: `camera/orbit.ts` holds the orbit state (owner request, round 5: unbounded yaw on every floor, L2's own yaw so it opens on its side view; pitch from just above the floor to near top-down, `PITCH_LIMITS` [0.06, 1.45] rad in `camera/rigs.ts` applied per rig through `pitchRange(cls, rig)`; zoom 0.6 to 1.5; eased steps, reset, wall auto-face via `VIEW_ZONES`). Add a floor's view zones there. `orbit` intents carry a `source`, so a floor can filter (for example L2 scrubbing on one-finger drags; `scrubSign` flips a scrub when the L2 view faces the other way). A low third-person camera stays above the floor, on the slab and out of obstacle columns: `clampCamera` (`camera/collision.ts`) pulls it in along the view ray; cameras above `CAMERA_CLEARANCE.obstacle` (3.2 u) are never touched, so the default views do not change. Controls per device are in appendix 03 section 2.
- Wheel zoom and first person (owner request, round 5): the mouse wheel, trackpad scroll and pinch, a two-finger pinch and `+`/`-` emit `zoom` (`classifyWheel`, `wheelZoomFactor` in `input/intents.ts`); the wheel never changes floors (PageUp/PageDown, the elevator panel, call pads and the vertical touch swipe do). Zooming in past the closest distance (`FIRST_PERSON.enterPush`) glides into the rover's eyes in 0.45 s (`camera/firstPerson.ts`: eye 1.55 u, FOV 65/70/80, look -60 to +31 degrees, near 0.1, far 72, fog 14 to 64 u; a cut under reduced motion); zooming out (`exitPush`), `0`/Home or the reset button return. `CameraDirector` keeps smoothing the third-person pose and mixes it toward the eye by `orbit.blend`, so blend 0 is exactly today's camera. The body fades with hashed alpha (`rover/fade.ts`: `alphaHash` set at mount, so no recompiles, no sorting change, about 4 extra shader programs once) and hides; rover clicks pass through to targets in front. `viewSuspended` holds third person during autopilot drives (`roverRuntime.driving` from the Director: missions, walks, point-and-go, scrubs, arrival roll-ons), rides, beams, missions, rooms, the hologram, the boot and the intro; first person returns afterwards. R/F tilt. Probes: `__hq.rover.cameraMode`, `cameraBlend`, `cameraZoom`, `cameraLook`, `cameraElevation`, `cameraRailYaw`, `driving`. E2E: `e2e/camera.spec.ts`; the opt-in `e2e/camera-visual.spec.ts` (`CAMERA_SHOTS=baseline|compare`) proves third-person poses still match (at most 0.5% of pixels off by more than 24/255).
```

Replace the bullet starting `- Pure modules (config, elevator, rigs,` with:

```markdown
- Pure modules (config, elevator, rigs, orbit, camera collision, first person, movement, faces, navgrid, collision, intents, url-sync, gpu-tier, viewport) must stay free of React and three side effects so Vitest can run them in node (`rover/fade.ts` only touches the three objects it is given).
```

In the Onboarding bullet replace `there is no click-the-floor driving), the Highlights Hall` with `there is no click-the-floor driving), the camera (look around, zoom, first person; spotlight on the view controls, \`data-onboard="view"\`), the Highlights Hall`.

In "Fast verification" replace `` `src/hud/dialog/**` and `src/experience/hints/**` to `onboarding`, `experience` and `walk`). `` with `` `src/hud/dialog/**` and `src/experience/hints/**` to `onboarding`, `experience` and `walk`, `src/experience/camera/**` to `camera`, `experience` and `career`, `src/experience/input/**`, the rover mesh, fade and runtime and `src/hud/ViewControls.tsx` to `camera` and `experience`). ``

- [ ] **Step 3: Spec appendix 03**

In section 2's rig table replace the Rail row and add a First person row after it:

```markdown
| Rail (side view) | L2 | FOV 40°, camera at (roverX, 22, 30), looking at (roverX + 4, 0, road z); orbits all the way around the rover (the look-ahead turns with it) and tilts like the follow rig | FOV 45°, (roverX, 24, 34) | FOV 55°, (roverX, 26, 38) |
| First person | Any floor, after zooming all the way in | Eye 1.55 u above the floor at the rover, FOV 65°, look 60° down to 31° up, near plane 0.1, far 72, fog 14 to 64 u | FOV 70° | FOV 80° |
```

Replace the bullets "Horizontal orbit", "Reset view", "Rail" and the wheel bullet ("The mouse wheel's vertical axis is reserved for the elevator ...") with:

```markdown
- **Orbit (every floor, L2 included; owner request, round 5).** The camera turns all the way around the rover (unrestricted yaw; L2 keeps its own yaw, so it opens on its side view). It tilts from just above the floor (about 3° elevation) to near top-down (about 83°), never under the floor. Zoom stays within 0.6× to 1.5× of the offset. A low camera stays above the floor, on the slab and out of obstacles: it is pulled in along its view ray (`camera/collision.ts`); cameras above 3.2 u never move. The chosen view persists while driving (keyboard steering stays camera-relative) and never springs back on its own.
- **Reset view.** The HUD reset button, `0` or `Home` ease back to the default angle, pitch and zoom and leave first person (nearest full turn, about 0.5 s; instant under reduced motion).
- **L2.** The same orbit around the rover; steering follows the view, and a one-finger swipe scrubs toward the side it pulls from (reversed when the view faces the other way). One-finger drags never rotate on L2; a two-finger twist does.
- **Wheel and zoom.** The mouse wheel, trackpad two-finger scrolling, Ctrl+wheel (trackpad pinch), a two-finger pinch and `+`/`-` zoom. The wheel never changes floors. Horizontal wheel (trackpad two-finger swipe, Shift+wheel) rotates.
- **First person.** Zooming in past the closest distance (a further 15%) glides into the rover's eyes in 0.45 s (a cut under reduced motion); the body fades out and hides. Drag and Q/E look around, R/F or a vertical drag tilt the look (60° down to 31° up), WASD drives where you look, and zooming out (about 18%), `0`, `Home` or the reset button return to third person at the closest distance. Point-and-go, the "!" hints and the dialog work as usual. Autopilot drives (missions, walks, point-and-go, scrubs, arrival roll-ons), elevator rides, teleport beams, open rooms and the hologram hold third person; first person returns afterwards.
```

In "Controls per device" replace the Tilt and Zoom rows and add a First person row after Zoom:

```markdown
| Tilt (just above the floor to near top-down) | Vertical part of a mouse drag | Vertical part of a drag | `R` / `F` (hold `Shift` for 2× speed) | Two-finger vertical drag (one-finger vertical swipes stay the elevator) |
| Zoom | Mouse wheel or Ctrl+wheel | Two-finger scroll or pinch | `+` / `-` | Pinch |
| First person | Zoom all the way in; zoom out to leave | Same | `+` until it switches, `-` to leave | Pinch out all the way; pinch in to leave |
```

In section 3's intent table replace the `elevator`, `orbit` and `zoom` rows with:

```markdown
| `elevator` | `up`, `down` or `FloorId` | PageUp/PageDown, vertical swipe (> 60 px, < 400 ms), elevator panel, call pads |
| `orbit` | Δyaw, optional Δpitch, `smooth` for eased steps, `source` (`mouse`, `touch`, `twist`, `wheel`, `keys`, `button`) | Drag (mouse, one finger), two-finger twist, trackpad deltaX, HUD rotate buttons. Held `Q`/`E` (yaw) and `R`/`F` (tilt) are polled each frame by the camera. |
| `zoom` | factor | Mouse wheel, trackpad scroll and pinch, two-finger pinch, `+`/`-`; past the closest distance it enters first person |
```

- [ ] **Step 4: Spec appendix 02**

In the state diagram replace `  explore --> elevator: elevator panel / wheel / swipe` with `  explore --> elevator: elevator panel / call pad / PgUp PgDn / swipe`.

- [ ] **Step 5: Check the docs for em dashes and stale wheel wording**

Run:

```bash
bun run test
grep -n "mouse wheel or PageUp\|reserved for the elevator\|limited to ±35" README.md AGENTS.md docs/superpowers/specs/agent-hq/*.md
```

Expected: every Vitest file passes (the repo-wide em-dash scan and `tests/content/safety.test.ts` included); the `grep` prints nothing.

- [ ] **Step 6: Commit**

```bash
rtk git add README.md AGENTS.md docs/superpowers/specs/agent-hq/03-rover-camera-input.md docs/superpowers/specs/agent-hq/02-interaction-and-states.md
rtk git commit -m "docs: free camera, wheel zoom and first person in README, AGENTS.md and specs 02 and 03"
```

---

### Task 11: Verification, look gate, numbers and PR

**Files:**
- No source changes (fixes go back to the task that owns the file).

**Interfaces:**
- Consumes: everything above; `screenshots/camera/baseline/` from Task 1.
- Produces: the PR with numbers, captures and notes.

- [ ] **Step 1: Fast verification**

Run:

```bash
rm -rf .next
bun run verify:quick
E2E_PORT=4436 bun run e2e:changed --dry
E2E_PORT=4436 bun run e2e:changed
```

Expected: `verify:quick` passes (typecheck, lint, unit tests, `next build`); the dry run lists `camera`, `career`, `experience`, `onboarding`, `pageview`, `seo`, `static-routes`, `walk` (plus `hud`, `missions` or `drawer-solid` if the plan maps `src/hud/**` there); the real run ends with all tests passed.

- [ ] **Step 2: Third-person look gate (same method as the baseline)**

Run:

```bash
E2E_PORT=4436 CAMERA_SHOTS=compare bunx playwright test e2e/camera-visual.spec.ts --workers=1
```

Expected: `18 passed` (15 third-person comparisons, each at most 0.5% of pixels changed by more than 24/255, and three first-person capture runs). If a pose fails, open `screenshots/camera/baseline/<name>.png` and `screenshots/camera/compare/<name>.png` side by side. Never raise the threshold. Rollback order: (1) comment out the `prepareFade` call in `Rover.tsx` and rerun (hashed alpha); (2) skip `clampCamera` for third person and rerun (collision); (3) revert the near/far/fog switch in `CameraDirector.tsx`. Fix the cause in its task, recommit, rerun.

- [ ] **Step 3: Before and after numbers**

Run:

```bash
bun -e '
const fs = require("node:fs");
const read = (m, fp = false) => Object.assign({}, ...fs.readdirSync(`screenshots/camera/${m}`).filter((f) => f.startsWith(fp ? "metrics-fp-" : "metrics-") && (fp || !f.startsWith("metrics-fp-"))).map((f) => JSON.parse(fs.readFileSync(`screenshots/camera/${m}/${f}`, "utf8"))));
const before = read("baseline");
const after = read("compare");
console.log("| pose | calls before | calls after | triangles before | triangles after | changed pixels |");
console.log("|---|---|---|---|---|---|");
for (const k of Object.keys(before)) console.log(`| ${k} | ${before[k].drawCalls} | ${after[k]?.drawCalls} | ${before[k].triangles} | ${after[k]?.triangles} | ${((after[k]?.diffShare ?? 0) * 100).toFixed(3)}% |`);
const fp = read("compare", true);
for (const [k, v] of Object.entries(fp)) console.log(`| ${k} | n/a | ${v.drawCalls} | n/a | ${v.triangles} | n/a |`);
' > screenshots/camera/numbers.md
cat screenshots/camera/numbers.md
```

Expected: a Markdown table; third-person draw calls and triangles identical before and after; every first-person row under its floor cap (L1 140, RF 80, others 150) and under 30k triangles.

- [ ] **Step 4: Manual check on real hardware (owner machines)**

With `bun run serve` (or the PR preview): on the MacBook (trackpad) and the Windows PC (Brave, 2560x1440, mouse wheel) check: wheel notches zoom and about four notches enter first person; one notch out leaves; trackpad scroll and pinch zoom smoothly; dragging up stops just above the floor, never below; L2 turns all the way around and reset returns to the side view; WASD in first person drives where you look; a point-and-go click in first person pulls back during the drive and returns; an elevator ride pulls back and returns; `?perf=1` (if P4 has landed) shows no extra draw calls in first person. On a phone (390x844 class): pinch in to first person and out again. Note anything odd in the PR.

- [ ] **Step 5: Push and open the PR**

```bash
rtk git push -u origin feat/camera-first-person
gh pr create --title "Free camera rotation, wheel zoom and first-person view (round 5, P7)" --body-file screenshots/camera/pr-body.md
```

Write `screenshots/camera/pr-body.md` first with: the owner's two requests (verbatim); the confirmed decisions and the coordinator defaults (R/F tilt, +/- zoom, touch vertical swipe still rides the elevator, rooms/hologram/beams/missions hold third person, first-person far 72 and fog 14 to 64); the numbers table from Step 3; the look-gate result (15 of 15 poses under 0.5%); the first-person captures `screenshots/camera/compare/fp-*.png` attached for review (desktop full, 2560x1440, phone lite); the cross-workstream notes (P6 Director lines, P3 input hunks, P2 fog key and precompile, P4 programs baseline +4 and `e2e-plan` arrays, P1/P5 message keys); the rollback note from Step 2; "Do not merge without the owner". No em dashes.

Expected: `gh` prints the PR URL. CI must be green: `Build, CV and e2e` (all shards) and the blocking `Lighthouse CI` job (LCP 2000 ms, CLS 0.01, TBT 200 ms, JS 240 KB, CSS 20 KB, fonts 60 KB, HTML 80 KB; this PR only changes the lazy 3D chunk and a few message strings).

---

## Self-review

**Spec coverage** (owner requests and confirmed decisions, each with its task):

- 360 degree yaw on every floor, L2 included, orbit around the rover with a readable default and sensible scrubs: Task 2 (`railPose` orbit, `railForward`, `scrubSign`), Task 5 (unbounded `railYaw`), Task 8 (CameraDirector, Director scrub, e2e "L2 turns all the way around", experience L2 test). Default L2 pose unchanged: Task 2 tests, Task 11 look gate.
- Pitch from just above the floor to near top-down, never under: Task 2 (`PITCH_LIMITS`, `pitchRange`), Task 5 (`setPitchRange`), Task 8 (e2e tilt test), Task 3 (ground clearance).
- Zoom clamped, camera above the floor, on the slab and outside walls (pull-in along the view ray, no physics): Task 3, Task 8.
- Drag, Q/E, keys and two-finger touch rotate; pinch zoom; reset restores the default: existing input plus Task 6 (R/F, +/-), Task 5 (`resetView` leaves first person), Task 8 e2e.
- Wheel, trackpad scroll and pinch zoom instead of changing floors; PgUp/PgDn, the panel and call pads still change floors; hint EN/ID and tutorial copy updated: Task 6, Task 8 e2e, Task 9.
- First person: glide in past the closest distance, body fades (no flicker, no near-plane clipping), look with limited pitch, WASD drives where you look, zoom out returns: Tasks 4, 5, 7, 8 (fade at blend 0.5 to 0.9, near 0.1 only in first person, e2e WASD).
- Point-and-go hover and click from the camera, "!" hints and the dialog in first person: Task 7 (rover click passthrough), Task 8 e2e.
- Autopilot, walks, missions, elevator rides pull back to third person and restore: Task 4 (`viewSuspended`), Task 8 (`driving`, e2e).
- Hologram view, view zones and the intro unaffected: Task 4 (held phases), Task 5 (no auto-face in first person only), Task 8 (focus path unchanged, intro excluded), Task 11 look gate.
- Reduced motion cuts: Task 5 (`stepOrbit`), Task 8 e2e.
- Touch pinch at 390x844: Task 8 e2e.
- No extra draw calls; near plane and fog tuned for first person only; third-person screenshot diffs match: Task 7 (hidden body), Task 8 (budget e2e on every floor, far 72), Task 1 and Task 11 (look gate and numbers).
- Unit tests for orbit limits, collision clamp and mode transitions: Tasks 2, 3, 4, 5, 6, 7. E2E for wheel, PgUp, first person in and out, pitch, L2 360, pinch: Tasks 6 and 8.
- Coordination with P6 and P3, and the other workstreams: "Cross-workstream conflicts and rebase notes".
- Docs: Task 10. Port 4436: every e2e command.

**Placeholder scan:** every code step shows the code; every command has an expected result; no "TBD", "TODO" or "similar to Task N".

**Type consistency:** `orbitOffset`, `pitchRange(cls, "follow" | "rail")`, `followForward(cls, yaw)`, `railForward(yaw)`, `scrubSign(railYaw)` (Task 2) are used with those shapes in Tasks 3, 5 and 8. `clampCamera(target, camera, world, from?)` and `CameraWorld` (Task 3) match Task 8. `FIRST_PERSON` fields used later (`eyeHeight`, `enterPush`, `exitPush`, `pushIdle`, `glide`, `pitch`, `look`, `near`, `far`, `lookDistance`, `fadeFrom`, `fadeTo`), `CAMERA_NEAR`, `CAMERA_FAR`, `firstPersonPose`, `blendPoses`, `easeBlend`, `roverOpacity`, `viewSuspended` (Task 4) match Tasks 5, 7 and 8. `zoomBy(s, factor, allowFirst)`, `stepOrbit(s, dt, reduced, hold)`, `setPitchRange`, `KEY_PITCH_SPEED` (Task 5) match Task 8. `pitchAxisFromKeys`, `isPitchKey`, `wheelZoomFactor`, `KEY_ZOOM_IN` (Task 6) match Task 8 and the tests. Runtime probes (Task 7) match the e2e `CameraWindow` type (Task 8) and the visual harness (Task 1).

**Execution:** subagent-driven (recommended: one fresh subagent per task, review between tasks) or inline with superpowers:executing-plans. Tasks 2, 3 and 4 are independent of each other; Task 5 needs 2 and 4; Task 6 is independent; Task 7 needs 4; Task 8 needs 2 to 7; Task 9 needs 8 for its e2e only; Task 10 needs 9; Task 11 needs all. Task 1 must run first (baseline before any change).
