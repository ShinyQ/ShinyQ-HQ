# P2 GPU and Rendering (look-preserving) Implementation Plan

Status: shipped in #75 (bef59b7), 2026-10-13

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 3D tower cheaper on the GPU (Retina laptops, big monitors, weak iGPUs, phones) and remove first-visit shader stalls, without changing a single visible design decision: same rover, neon, bloom, holograms, missions and intro.

**Architecture:** A pure pixel budget (`renderBudget`) picks DPR, composer MSAA and bloom levels per screen; an in-house frame monitor with hysteresis steps a quality ladder (pixels first, MSAA, bloom last) only on sustained drops; the densest unbatched text (L1 stats ring, L2 room labels and signposts) moves into the existing `BatchedLabels` (troika `BatchedText`); a pure content-visibility rule keeps intro and ride peaks under 150 calls; a general precompile utility (`compile` + `KHR_parallel_shader_compile` polling) plus program pins warms every floor's shader programs during boot and keeps them alive across floor unmounts. Every pixel-affecting step is gated by a deterministic screenshot diff against the previous commit and, at the end, against `origin/main`.

**Tech Stack:** Next.js 16 static export, React 19, three r186, @react-three/fiber 9, @react-three/drei 10, @react-three/postprocessing 3 / postprocessing 6.39, troika-three-text 0.52, zustand 5, Vitest 5 (node), Playwright 1.64 on SwiftShader, Bun 1.4.

## Global Constraints

- The aesthetic must not change: every task that can change pixels has a before/after screenshot-diff step (desktop full 1440x900@2 and 2560x1440@1, phone lite 390x844, the same camera poses) with an explicit threshold, and a rollback note.
- Never remove the rover, neon look, bloom, holograms, missions or the intro.
- Allowed invisible quality tricks only (owner decision): no composer MSAA when DPR >= 1.5, bloom sized by pixel count, a runtime safety net that only acts on sustained frame drops, with hysteresis (<= 2 flips per 60 s).
- Measure before and after with the same method; record numbers in the PR body.
- Lighthouse CI budgets stay green: LCP 2000 ms, CLS 0.01, TBT 200 ms, JS 240 KB, CSS 20 KB, fonts 60 KB, HTML 80 KB.
- Render budgets: < 150 draw calls, < 30k triangles; L1 cap 140, RF cap 80. This plan adds: intro and ride peaks < 150.
- No new runtime dependency (in-house rAF monitor; drei `PerformanceMonitor` is not imported anywhere today, so it is not "already bundled" and is not used).
- No em dashes anywhere (code, comments, commits, docs); EN/ID strings; update README, AGENTS.md and the relevant spec appendices (05 section 2, 08 sections 1 and 2).
- Pure modules (config, budgets, ladder, monitor, visibility, layouts) stay free of React and three side effects so Vitest runs them in node (AGENTS.md "Pure modules").
- E2E port for this workstream: `E2E_PORT=4431`. Before every push: `bun run verify:quick`, then `E2E_PORT=4431 bun run e2e:changed`.
- Commits: conventional messages through the `rtk` git wrapper (`rtk git add`, `rtk git commit`). One PR for P2; do not merge without the owner.
- Workstream id: P2. REPORT ids cited: SP4, SP5, SP9, F5.1, F5.2, F5.4, F5.6, F5.7, F5.9, F7.4, Area 5, Area 8, spec gaps 8, 13, 15.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `e2e/vclock.ts` | Create | Virtual frame clock for deterministic captures (rAF, `performance.now`, `Date.now`, `requestIdleCallback`, seeded `Math.random`) |
| `e2e/visual-gate.spec.ts` | Create | The screenshot-diff gate: 3 devices x 8 poses, threshold profiles; skipped unless `VISUAL_GATE=1` |
| `scripts/visual-gate.ts` | Create | Builds a base ref in a sibling worktree, captures baselines from it, then compares the working tree build |
| `scripts/perf-gpu.ts` | Create | Local real-GPU measurements: SP4 (GPU ms, frame p95 per variant) and SP9 (peaks, programs, long tasks per ride stage) |
| `e2e/gpu.spec.ts` | Create | CI gates: pixel budget applied, safety net behaviour, intro and ride peaks < 150, programs after warm-up, batched text structure |
| `src/experience/scene/renderProbe.ts` | Create | Read-only renderer handle: `gl`, `scene`, `camera`, per-frame peak calls, program list, applied graphics |
| `src/experience/scene/postHandle.ts` | Create | Registry for the full-tier composer and bloom effect; `sceneTarget()` for precompile |
| `src/experience/scene/settings.ts` | Modify | `renderBudget(tier, coarse, screen)` with pixel budget, MSAA rule, bloom levels; `?gfx=` debug override |
| `src/experience/scene/quality.ts` | Create | Pure quality ladder: `qualityLadder`, `qualityAt`, `bloomLevelsFor` |
| `src/experience/scene/frameMonitor.ts` | Create | Pure sustained-drop detector with hysteresis and a flip cap |
| `src/experience/scene/qualityStore.ts` | Create | Tiny external store for the quality level (sessionStorage `hq:gfx`), applied state, test hook |
| `src/experience/scene/QualityController.tsx` | Create | In-canvas: runs the monitor, publishes applied DPR, sets composer MSAA and bloom levels imperatively |
| `src/experience/scene/Effects.tsx` | Modify | Refs to composer and bloom, `levels` prop, fixed stale comment (spec gap 15) |
| `src/experience/scene/Scene.tsx` | Modify | Takes `budget` and `gfx`, memoized, mounts `QualityController` and `ProgramWarmup` |
| `src/experience/scene/Director.tsx` | Modify | One line: `renderProbe.record(...)` per frame |
| `src/experience/Experience.tsx` | Modify | Budget from the screen, applied DPR on `Canvas`, `renderProbe` binding, `__hq.render` and `__hq.quality`, cleanup |
| `src/types/troika-three-text.d.ts` | Modify | Outline and opacity fields used by batched labels |
| `src/experience/fx/labelProps.ts` | Modify | `outlineWidth`, `outlineColor`, `fillOpacity` on `BatchedLabel` |
| `src/experience/fx/BatchedLabels.tsx` | Modify | `toneMapped` prop and a `ref` handle (`batch`, `members`) for per-frame member updates |
| `src/experience/floors/lobby/statsRingLayout.ts` | Create | Pure tile math for the batched stats ring |
| `src/experience/floors/lobby/StatsRing.tsx` | Modify | 30 calls to 5: instanced plates and glows, one edge line set, two text batches |
| `src/experience/floors/career/labels.ts` | Create | Pure builders for the batched room labels and signposts |
| `src/experience/floors/career/CareerRooms.tsx` | Modify | Room labels in one `BatchedLabels`; `useMemberFade` |
| `src/experience/floors/career/YearGates.tsx` | Modify | Signposts in one `BatchedLabels` |
| `src/experience/floors/CareerArchive.tsx` | Modify | Also mounts while the floor is being warmed |
| `src/experience/tower/visibility.ts` | Create | Pure `contentVisible` rule: exterior set, floors above, floors below during rides |
| `src/experience/tower/floorRegistry.ts` | Create | `registerFloorContent`, `getFloorContent`, `FLOOR_ROOT` |
| `src/experience/tower/FloorLevel.tsx` | Modify | Uses `contentVisible`, registers its content group, precompiles neighbours on mount |
| `src/experience/tower/near.ts` | Modify | Optional `warm` floor in the mount set |
| `src/experience/tower/Tower.tsx` | Modify | Passes the warming floor to `nearFloors` |
| `src/experience/scene/programPins.ts` | Create | Keeps compiled programs alive after a floor unmounts (tiny never-rendered pins) |
| `src/experience/scene/precompile.ts` | Create | `precompileObject`, `precompileFloor`, `precompileScene` (the API P6 consumes) |
| `src/experience/scene/warmState.ts` | Create | `isFloorWarm`, `markWarm`, the warming-floor store, `warmQueue` |
| `src/experience/scene/ProgramWarmup.tsx` | Create | Boot and intro warm-up: whole-scene compile after the first frame, staged hidden warm of the other floors during boot |
| `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts` | Modify | Rules for `gpu`, `visual-gate`, `vclock`, the new scripts |
| `tests/unit/*.test.ts` | Create/Modify | `scene-settings`, `render-probe`, `quality-ladder`, `frame-monitor`, `quality-store`, `label-props`, `stats-ring-layout`, `career-labels`, `tower-visibility`, `tower-near`, `program-pins`, `precompile`, `warm-state` |
| `.gitignore` | Modify | `e2e/visual-gate.spec.ts-snapshots/` |
| `docs/perf/r5-gpu.md` | Create | SP4 and SP9 before/after tables (script output) |
| `README.md`, `AGENTS.md`, `docs/superpowers/specs/agent-hq/05-visual-audio-tokens.md`, `08-quality-acceptance.md` | Modify | Rules and budgets |

### Cross-workstream conflicts and rebase notes

| File | Other workstream | What they change | Rebase note |
|---|---|---|---|
| `src/experience/Experience.tsx` | P3 (frameloop pause, 60 fps cap, context-loss error boundary), P4 (`__hq` gl exposure, `?perf=1`), P6 | `Canvas` props, `onCreated`, `__hq` | Keep both: P2 adds `dpr={appliedDpr ?? budget.dpr}`, three `renderProbe` assignments in `onCreated`, `render`/`quality` keys on `__hq`, one cleanup effect. If P4 landed its own gl handle on `__hq`, point it at `renderProbe.gl` instead of adding a second one |
| `src/experience/scene/Director.tsx` | P3 (store mirror only on change), P4 (scene vs post-pass split), P6 (ride clock cap) | `useFrame` body | P2 adds exactly one line after `info.reset()`. If P4 split `frameCalls` into scene and pass counts, record both: `renderProbe.record(sceneCalls + passCalls, triangles)` and keep P4's fields |
| `src/experience/tower/FloorLevel.tsx`, `tower/Tower.tsx`, `tower/near.ts` | P6 (destination floor prepared before `moving`) | mount set, visibility | P6 must call `precompileFloor` (Task 10) instead of compiling itself; `nearFloors` gains a 5th optional param `warm` (Task 11), keep P6's params after it if P6 adds any |
| `src/experience/floors/career/CareerRooms.tsx`, `YearGates.tsx` | P3 (dispose `useMemo` geometries, F7.1) | `Pads` geometries, `arches` geometry | Disjoint hunks: P3 adds `useEffect(() => () => g.dispose(), [g])` lines; P2 replaces the label `Text` blocks |
| `src/experience/floors/lobby/StatsRing.tsx` | P3 (none listed), P7 (camera) | billboarding | Tiles still face the camera every frame through `facing`; P7's free yaw/pitch needs no change here |
| `src/experience/fx/BatchedLabels.tsx` | P7 (labels face camera on L2 with 360 yaw) | label orientation | P7 can turn batched members per frame through the `BatchedLabelsHandle` from Task 6 (`members[i].rotation.y = ...`, members keep `matrixAutoUpdate`) |
| `e2e/hq.ts` | P4 (`expectRenderBudget` split) | budgets | P2 does not touch `e2e/hq.ts`; its gates live in `e2e/gpu.spec.ts` |
| `docs/superpowers/specs/agent-hq/08-quality-acceptance.md` section 2 | P4 (budgets authoritative, scene vs passes) | table rows | P2 edits only the "Frame rate", "Draw calls per floor" rows and section 1 row `full`; merge row by row |
| `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts` | P1, P3, P4, P6 (new specs) | `ALL_SPECS`, rules | Additive; keep alphabetical `ALL_SPECS` |
| `AGENTS.md`, `README.md` | all | bullets | Additive bullets; re-run the em dash grep after rebase |

### Interfaces handed to other workstreams

P6 (ride prepare step, owns the ride-specific hold of `moving`):

```ts
// src/experience/scene/precompile.ts
export interface PrecompileReport { materials: number; programsBefore: number; programsAfter: number; pinned: number; ms: number; parallel: boolean; timedOut: boolean }
export interface FloorPrecompileReport extends PrecompileReport { floor: FloorId; contentMounted: boolean }
/** Compiles every program the floor's mounted content needs, for the target it is drawn into (composer input on full, canvas on lite), pins them, and marks the floor warm when its main content was mounted. Resolves null when the renderer or the floor content is not there. Never draws. */
export function precompileFloor(id: FloorId, options?: { timeoutMs?: number; pin?: boolean }): Promise<FloorPrecompileReport | null>;
// src/experience/scene/warmState.ts
export function isFloorWarm(id: FloorId): boolean;
// src/experience/tower/floorRegistry.ts
export function getFloorContent(id: FloorId): Group | null;
```

P6 usage contract: during `boarding`/`closing`, `if (!isFloorWarm(ride.to)) await precompileFloor(ride.to, { timeoutMs: 1500 })` together with its own troika-sync wait, then release `moving`. P6 must not add a second boot or intro precompile (Task 11 owns it).

P4 (`?perf=1` overlay, RUM beacon): `window.__hq.render` (`peakCalls`, `programs()`, `graphics()`) and `window.__hq.quality.snapshot()` (`level`, `locked`, `flips`, `applied`).

---

## Task 1: Deterministic screenshot-diff gate

Turns the global rule "every visual change is gated by a screenshot diff" into one command. Captures run with a virtual frame clock so SwiftShader speed never changes what is drawn.

**Files:**
- Create: `e2e/vclock.ts`
- Create: `e2e/visual-gate.spec.ts`
- Create: `scripts/visual-gate.ts`
- Modify: `scripts/e2e-plan.ts` (rules near line 51)
- Modify: `tests/unit/e2e-plan.test.ts:76-82`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `asReturningVisitor`, `waitForHQ`, `waitForPhase`, `waitForSceneLive` from `e2e/hq.ts`; `bun scripts/serve-static.ts --port <n> --dir <dir>`.
- Produces: `bun scripts/visual-gate.ts --base <ref> --profile <strict|msaa|batching|release> [--self] [--grep <text>]` (exit 0 = within thresholds). Device names `full-1440x900@2`, `full-2560x1440@1`, `lite-390x844@3`; pose names `l1-spawn`, `l2-journey`, `l3-labs`, `l4-library`, `rf-contact`, `intro-still`, `ride-up-l1-l2`, `ride-down-rf-l1`. Later tasks run it with the profile named in their gate step.

- [x] **Step 1: Write the failing unit test for the e2e plan rules**

In `tests/unit/e2e-plan.test.ts`, change the on-disk filter in "knows every spec in e2e/" and add a test:

```ts
  it("knows every spec in e2e/", () => {
    const onDisk = readdirSync("e2e")
      .filter((f) => f.endsWith(".spec.ts") && f !== "screenshots.spec.ts" && f !== "pageview-visual.spec.ts" && f !== "visual-gate.spec.ts")
      .map((f) => f.replace(/\.spec\.ts$/, ""))
      .sort();
    expect(onDisk).toEqual([...ALL_SPECS].sort());
  });

  it("never runs the visual gate or the perf scripts as part of e2e:changed", () => {
    expect(specsForChanges(["e2e/visual-gate.spec.ts"]).specs).toEqual([]);
    expect(specsForChanges(["e2e/vclock.ts"]).specs).toEqual([]);
    expect(specsForChanges(["scripts/visual-gate.ts"]).specs).toEqual([]);
    expect(specsForChanges(["scripts/perf-gpu.ts"]).specs).toEqual([]);
  });
```

- [x] **Step 2: Run it to verify it fails**

Run: `bun run test tests/unit/e2e-plan.test.ts`
Expected: FAIL in "never runs the visual gate..." (`e2e/vclock.ts` and the scripts fall back to the smoke specs, so `specs` is not `[]`).

- [x] **Step 3: Add the rules**

In `scripts/e2e-plan.ts`, replace the two lines after `{ test: /^e2e\/(hq|routes)\.ts$/, specs: "all" },`:

```ts
  { test: /^e2e\/screenshots\.spec\.ts$|^e2e\/pageview-visual\.spec\.ts$|^e2e\/visual-gate\.spec\.ts$|^e2e\/vclock\.ts$/, specs: [] },
  // Not part of the site or the e2e suite.
  { test: /^(docs|tests|\.github)\/|\.md$|^scripts\/(e2e-|validate-|floor-thumbs|visual-gate|perf-gpu)|^lighthouserc\.json$|^eslint\.config\.mjs$|^vitest\.config\.mts$/, specs: [] },
```

Append to `.gitignore`:

```
# Visual gate baselines (built from a base ref by scripts/visual-gate.ts, never committed)
e2e/visual-gate.spec.ts-snapshots/
```

- [x] **Step 4: Run it to verify it passes**

Run: `bun run test tests/unit/e2e-plan.test.ts`
Expected: PASS (the on-disk check still passes because `visual-gate.spec.ts` is excluded and does not exist yet).

- [x] **Step 5: Write the virtual clock**

Create `e2e/vclock.ts`:

```ts
import type { Page } from "@playwright/test";

type VClock = { step: (n: number) => number; frames: () => number; run: () => void; pause: () => void };
type VClockWindow = { __vclock: VClock };

/**
 * Deterministic frames for the visual gate. Before any app code runs it replaces requestAnimationFrame,
 * performance.now, Date.now, requestIdleCallback and Math.random (seeded). Each frame advances the
 * virtual clock by exactly 1000/60 ms, so three's Clock, R3F deltas and shader uTime depend only on
 * the number of frames, never on how fast SwiftShader renders. `autorun` steps one frame every 4 ms of
 * real time until `pauseClock`; without it nothing animates until `stepFrames`.
 */
export async function installVirtualClock(page: Page, { autorun = true, seed = 7 }: { autorun?: boolean; seed?: number } = {}) {
  await page.addInitScript(
    ({ autorun, seed }) => {
      const FRAME = 1000 / 60;
      let now = 0;
      let frames = 0;
      let nextId = 1;
      const raf = new Map<number, FrameRequestCallback>();
      const idle = new Map<number, IdleRequestCallback>();
      let state = seed >>> 0;
      Math.random = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const epoch = Date.UTC(2026, 9, 13, 12);
      performance.now = () => now;
      Date.now = () => epoch + Math.round(now);
      window.requestAnimationFrame = (cb: FrameRequestCallback) => {
        const id = nextId++;
        raf.set(id, cb);
        return id;
      };
      window.cancelAnimationFrame = (id: number) => {
        raf.delete(id);
      };
      window.requestIdleCallback = (cb: IdleRequestCallback) => {
        const id = nextId++;
        idle.set(id, cb);
        return id;
      };
      window.cancelIdleCallback = (id: number) => {
        idle.delete(id);
      };
      const step = (n: number) => {
        for (let i = 0; i < n; i++) {
          now += FRAME;
          frames += 1;
          const due = [...raf.values()];
          raf.clear();
          for (const cb of due) cb(now);
          const idles = [...idle.values()];
          idle.clear();
          for (const cb of idles) cb({ didTimeout: false, timeRemaining: () => 8 });
        }
        return frames;
      };
      let pump: number | null = null;
      const clock: VClock = {
        step,
        frames: () => frames,
        run: () => {
          if (pump === null) pump = window.setInterval(() => step(1), 4);
        },
        pause: () => {
          if (pump !== null) window.clearInterval(pump);
          pump = null;
        },
      };
      (window as unknown as VClockWindow).__vclock = clock;
      if (autorun) clock.run();
    },
    { autorun, seed },
  );
}

export async function pauseClock(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as VClockWindow).__vclock.pause());
}

/** Renders exactly `n` frames (synchronously, inside the page) and returns the total frame count. */
export async function stepFrames(page: Page, n: number): Promise<number> {
  return page.evaluate((n) => (window as unknown as VClockWindow).__vclock.step(n), n);
}

export async function frameCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as VClockWindow).__vclock.frames());
}

/** Waits in real time until fonts are loaded and no new resource started for `quietMs`. */
export async function waitForQuiet(page: Page, quietMs = 300, timeout = 60_000): Promise<void> {
  await page.waitForFunction(() => document.fonts.status === "loaded", null, { polling: 50, timeout });
  const end = Date.now() + timeout;
  let last = -1;
  while (Date.now() < end) {
    const count = await page.evaluate(() => performance.getEntriesByType("resource").length);
    if (count === last) return;
    last = count;
    await page.waitForTimeout(quietMs);
  }
  throw new Error("the page never went quiet");
}

/** Steps frames in batches until `check` is true in the page; fails after `maxFrames`. */
export async function driveUntil(page: Page, check: () => boolean, { maxFrames, batch = 10 }: { maxFrames: number; batch?: number }): Promise<number> {
  for (let done = 0; done < maxFrames; done += batch) {
    await stepFrames(page, batch);
    if (await page.evaluate(check)) return frameCount(page);
    if (done % 120 === 0) await waitForQuiet(page, 150);
  }
  throw new Error(`state not reached within ${maxFrames} frames`);
}
```

- [x] **Step 6: Write the gate spec**

Create `e2e/visual-gate.spec.ts`:

```ts
import { mkdirSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { asReturningVisitor, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";
import { driveUntil, frameCount, installVirtualClock, pauseClock, stepFrames, waitForQuiet } from "./vclock";

/**
 * Screenshot-diff gate for look-preserving GPU work (round 5, P2). Run it only through
 * `bun scripts/visual-gate.ts`, which captures baselines from a base build and then compares.
 */
test.skip(!process.env.VISUAL_GATE, "Run through `bun scripts/visual-gate.ts`");
test.describe.configure({ mode: "serial", timeout: 300_000 });

type Device = { name: string; width: number; height: number; dpr: number; tier: "full" | "lite"; touch: boolean; info?: boolean };
type Pose = { name: string; kind: "settled" | "intro" | "ride"; path: string; to?: string };
type Limits = { threshold: number; maxDiffPixelRatio: number };

const DEVICES: readonly Device[] = [
  { name: "full-1440x900@2", width: 1440, height: 900, dpr: 2, tier: "full", touch: false },
  { name: "full-2560x1440@1", width: 2560, height: 1440, dpr: 1, tier: "full", touch: false },
  { name: "lite-390x844@3", width: 390, height: 844, dpr: 3, tier: "lite", touch: true },
  // Windows at 150%: not gated (no baseline rule covers it), captured for an owner eyeball check.
  { name: "full-1920x1080@1.5", width: 1920, height: 1080, dpr: 1.5, tier: "full", touch: false, info: true },
];

const POSES: readonly Pose[] = [
  { name: "l1-spawn", kind: "settled", path: "/en" },
  { name: "l2-journey", kind: "settled", path: "/en/journey" },
  { name: "l3-labs", kind: "settled", path: "/en/labs" },
  { name: "l4-library", kind: "settled", path: "/en/library" },
  { name: "rf-contact", kind: "settled", path: "/en/contact" },
  { name: "intro-still", kind: "intro", path: "/en" },
  { name: "ride-up-l1-l2", kind: "ride", path: "/en", to: "L2" },
  { name: "ride-down-rf-l1", kind: "ride", path: "/en/contact", to: "L1" },
];

const STRICT: Limits = { threshold: 0.1, maxDiffPixelRatio: 0.001 };
const BLENDED: Limits = { threshold: 0.1, maxDiffPixelRatio: 0.002 };
const RETINA_AA: Limits = { threshold: 0.2, maxDiffPixelRatio: 0.004 };
const RETINA_RELEASE: Limits = { threshold: 0.2, maxDiffPixelRatio: 0.005 };
const retina = (d: Device) => d.tier === "full" && d.dpr >= 1.5;
const textHeavy = (p: Pose) => /^(l1|l2|intro|ride)/.test(p.name);

/** Threshold profiles: each task names the one that matches what it may change. */
const PROFILES: Record<string, (d: Device, p: Pose) => Limits> = {
  strict: () => STRICT,
  msaa: (d) => (retina(d) ? RETINA_AA : STRICT),
  batching: (_d, p) => (textHeavy(p) ? BLENDED : STRICT),
  release: (d, p) => (retina(d) ? RETINA_RELEASE : textHeavy(p) ? BLENDED : STRICT),
};
const profile = PROFILES[process.env.VISUAL_GATE_PROFILE ?? "strict"] ?? PROFILES.strict;
const RIDE_START_FRAME = 1200;

type HQ = { __hq: { store: { getState(): { phase: string; floor: string; ride: { stage: string } | null; goToFloor(f: string): void } }; rover: { drawCalls: number } } };

async function open(browser: Browser, device: Device, pose: Pose) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.dpr,
    hasTouch: device.touch,
    isMobile: device.touch,
    reducedMotion: pose.kind === "ride" ? "no-preference" : "reduce",
  });
  const page = await context.newPage();
  await page.route("**/api/ask", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, turnstileSiteKey: null, asOf: "2026-10-11", maxLength: 300 }) }),
  );
  await installVirtualClock(page, { autorun: pose.kind !== "ride" });
  if (pose.kind === "intro") {
    await page.addInitScript(() => {
      localStorage.setItem("hq:terminal-seen", "1");
      localStorage.setItem("hq:onboarded", "done");
      localStorage.setItem("hq:hints", "off");
      sessionStorage.setItem("hq:ask-teaser", "1");
    });
  } else {
    await asReturningVisitor(page);
  }
  await page.goto(`${pose.path}?tier=${device.tier}`);
  return { context, page };
}

async function settle(page: Page, pose: Pose) {
  if (pose.kind === "settled") {
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    await pauseClock(page);
    await waitForQuiet(page);
    await stepFrames(page, 120);
  } else if (pose.kind === "intro") {
    await waitForHQ(page);
    const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
    await expect(start).not.toHaveAttribute("aria-disabled", "true", { timeout: 60_000 });
    await start.click();
    await waitForPhase(page, "intro");
    await pauseClock(page);
    await waitForQuiet(page);
    await stepFrames(page, 30);
  } else {
    await driveUntil(page, () => {
      const w = window as unknown as Partial<HQ>;
      const s = w.__hq?.store.getState();
      return Boolean(s && s.phase === "explore" && (w.__hq?.rover.drawCalls ?? 0) > 0 && !document.documentElement.hasAttribute("data-hq-boot"));
    }, { maxFrames: RIDE_START_FRAME, batch: 30 });
    const frames = await frameCount(page);
    if (frames < RIDE_START_FRAME) await stepFrames(page, RIDE_START_FRAME - frames);
    await page.evaluate((to) => (window as unknown as HQ).__hq.store.getState().goToFloor(to), pose.to!);
    // The target floor mounts now: give fonts, chunks and troika real time before the dolly.
    await page.waitForTimeout(1000);
    await waitForQuiet(page);
    await driveUntil(page, () => (window as unknown as HQ).__hq.store.getState().ride?.stage === "moving", { maxFrames: 1200, batch: 1 });
    await stepFrames(page, 24);
  }
  await waitForQuiet(page);
  await stepFrames(page, 2);
}

for (const device of DEVICES) {
  for (const pose of POSES) {
    test(`${device.name} ${pose.name}`, async ({ browser }) => {
      const { context, page } = await open(browser, device, pose);
      try {
        await settle(page, pose);
        const name = `${device.name}-${pose.name}.png`;
        if (device.info) {
          const dir = `test-results/visual-gate-info/${process.env.VISUAL_GATE_LABEL ?? "run"}`;
          mkdirSync(dir, { recursive: true });
          await page.screenshot({ path: `${dir}/${name}`, animations: "disabled", caret: "hide", scale: "device" });
          return;
        }
        await expect(page).toHaveScreenshot(name, { ...profile(device, pose), animations: "disabled", caret: "hide", scale: "device", timeout: 60_000 });
      } finally {
        await context.close();
      }
    });
  }
}
```

- [x] **Step 7: Write the orchestrating script**

Create `scripts/visual-gate.ts`:

```ts
/**
 * Look-preserving gate (round 5, P2): captures e2e/visual-gate.spec.ts baselines from a base ref and
 * compares the working tree against them. Local only (unset CI so Playwright reuses this server).
 * Usage: bun scripts/visual-gate.ts [--base origin/main] [--profile strict|msaa|batching|release] [--self] [--grep <text>] [--no-build]
 *   --base     ref to compare against (each task uses HEAD, the release check uses origin/main)
 *   --self     compares the base with itself (noise floor of the harness)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const PORT = Number(process.env.E2E_PORT ?? 4431);
const base = opt("base", "origin/main");
const profile = opt("profile", "strict");
const grep = opt("grep", "");
const root = process.cwd();
const run = (cmd: string[], cwd = root, env: Record<string, string> = {}) => {
  const r = Bun.spawnSync(cmd, { cwd, env: { ...process.env, ...env }, stdout: "inherit", stderr: "inherit" });
  return r.exitCode ?? 1;
};
const must = (cmd: string[], cwd = root) => {
  if (run(cmd, cwd) !== 0) throw new Error(`failed: ${cmd.join(" ")} (in ${cwd})`);
};

const sha = Bun.spawnSync(["git", "rev-parse", base]).stdout.toString().trim();
if (!sha) throw new Error(`unknown ref ${base}`);
const baseDir = path.resolve(root, "..", `${path.basename(root)}-visual-base`);
const marker = path.join(baseDir, "out", ".visual-gate-sha");

if (!existsSync(marker) || readFileSync(marker, "utf8").trim() !== sha) {
  if (!existsSync(baseDir)) must(["git", "worktree", "add", "--detach", baseDir, sha]);
  else must(["git", "checkout", "--detach", sha], baseDir);
  must(["bun", "install", "--frozen-lockfile"], baseDir);
  must(["bun", "run", "build"], baseDir);
  writeFileSync(marker, sha);
}
if (!flag("no-build") && !flag("self")) must(["bun", "run", "build"]);

async function serve(dir: string) {
  const server = Bun.spawn(["bun", "scripts/serve-static.ts", "--port", String(PORT), "--dir", dir], { cwd: root, stdout: "ignore", stderr: "inherit" });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/en`)).ok) return server;
    } catch {
      // not listening yet
    }
    await Bun.sleep(100);
  }
  server.kill();
  throw new Error(`server on ${PORT} did not start`);
}

function capture(label: string, update: boolean) {
  const cmd = ["bunx", "playwright", "test", "e2e/visual-gate.spec.ts", "--workers=1", "--reporter=list"];
  if (update) cmd.push("--update-snapshots");
  if (grep) cmd.push("-g", grep);
  return run(cmd, root, { VISUAL_GATE: "1", VISUAL_GATE_PROFILE: profile, VISUAL_GATE_LABEL: label, E2E_PORT: String(PORT), CI: "" });
}

const baseServer = await serve(path.join(baseDir, "out"));
const updated = capture("base", true);
baseServer.kill();
if (updated !== 0) throw new Error("baseline capture failed");

const headServer = await serve(flag("self") ? path.join(baseDir, "out") : path.join(root, "out"));
const code = capture(flag("self") ? "base-again" : "head", false);
headServer.kill();
console.log(code === 0 ? `visual gate: PASS (profile ${profile}, base ${base} ${sha.slice(0, 8)})` : `visual gate: FAIL (profile ${profile}); diffs in test-results/`);
process.exit(code);
```

- [x] **Step 8: Measure the harness noise floor**

Run: `E2E_PORT=4431 bun scripts/visual-gate.ts --base HEAD --self --profile strict`
Expected: `visual gate: PASS (profile strict, ...)` with 32 tests (24 compared, 8 info captures). If a pose fails against itself, raise its settle frames in `settle()` (`stepFrames(page, 120)` to `240`, or the ride `stepFrames(page, 24)` stays and the pre-ride `waitForTimeout(1000)` goes to `2000`) and rerun until the self-diff passes. Record the slowest pose time and the total run time in the PR body.

- [x] **Step 9: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: no errors.

- [x] **Step 10: Commit**

```bash
rtk git add e2e/vclock.ts e2e/visual-gate.spec.ts scripts/visual-gate.ts scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts .gitignore
rtk git commit -m "test: deterministic screenshot-diff gate for look-preserving GPU work"
```

---
## Task 2: Render probe, `?gfx=` override and the SP4/SP9 baseline (measurement)

Spikes SP4 (full tier at DPR 2) and SP9 (intro and ride peaks, first-visit compile hitches) become measurement tasks: a probe in the app, a local real-GPU script, and a CI spec that records the deterministic counters. Nothing visual changes.

**Files:**
- Create: `src/experience/scene/renderProbe.ts`
- Create: `tests/unit/render-probe.test.ts`
- Modify: `src/experience/scene/settings.ts:34-51`
- Modify: `tests/unit/scene-settings.test.ts`
- Modify: `src/experience/scene/Director.tsx:204-209`
- Modify: `src/experience/scene/Scene.tsx:21,64-65,81-85`
- Modify: `src/experience/scene/Effects.tsx`
- Modify: `src/experience/Experience.tsx:29,107,142-143,340-356`
- Create: `scripts/perf-gpu.ts`
- Create: `e2e/gpu.spec.ts`
- Modify: `scripts/e2e-plan.ts` (`ALL_SPECS`, a rule for `scene/` and `tower/`)
- Create: `docs/perf/r5-gpu.md`

**Interfaces:**
- Produces: `renderProbe` (`gl`, `scene`, `camera`, `peakCalls`, `peakTriangles`, `frames`, `record(calls, triangles)`, `resetPeak()`, `programs()`, `programNames()`), exposed as `window.__hq.render`.
- Produces: `RenderBudget { dpr: [number, number]; multisampling: number; bloomLevels: number }`, `BLOOM_LEVELS = 8`, `GfxOverride { dprMax?: number; multisampling?: number; bloomLevels?: number; monitor?: boolean }`, `parseGfxOverride(search: string): GfxOverride`, `withOverride(budget: RenderBudget, o: GfxOverride): RenderBudget`.
- Produces: `Effects({ multisampling, levels })`; `Scene` prop `budget: RenderBudget`.
- Produces: `bun scripts/perf-gpu.ts sp4|sp9 [...]` and `e2e/gpu.spec.ts` (spec name `gpu`).

- [x] **Step 1: Write the failing tests**

Create `tests/unit/render-probe.test.ts`:

```ts
import { afterEach, expect, it } from "vitest";
import { renderProbe } from "@/experience/scene/renderProbe";

afterEach(() => {
  renderProbe.gl = null;
  renderProbe.resetPeak();
});

it("keeps the highest whole-frame counts until reset", () => {
  renderProbe.resetPeak();
  renderProbe.record(90, 8000);
  renderProbe.record(140, 7000);
  renderProbe.record(120, 9000);
  expect(renderProbe).toMatchObject({ peakCalls: 140, peakTriangles: 9000, frames: 3 });
  renderProbe.resetPeak();
  expect(renderProbe).toMatchObject({ peakCalls: 0, peakTriangles: 0, frames: 0 });
});

it("lists programs by material name and a short key hash, sorted", () => {
  renderProbe.gl = { info: { programs: [{ name: "MeshBasicMaterial", cacheKey: "b" }, { name: "LineBasicMaterial", cacheKey: "a" }] } } as never;
  expect(renderProbe.programs()).toBe(2);
  const names = renderProbe.programNames();
  expect(names).toHaveLength(2);
  expect(names[0]).toMatch(/^LineBasicMaterial#[0-9a-z]+$/);
  expect(names[1]).toMatch(/^MeshBasicMaterial#[0-9a-z]+$/);
});

it("reports zero programs without a renderer", () => {
  expect(renderProbe.programs()).toBe(0);
  expect(renderProbe.programNames()).toEqual([]);
});
```

Append to `tests/unit/scene-settings.test.ts` (and add `parseGfxOverride, withOverride` to its import from `@/experience/scene/settings`):

```ts
it("parses the ?gfx= debug override and ignores junk", () => {
  expect(parseGfxOverride("?gfx=msaa0,dpr1.5,bloom5,monitor-off")).toEqual({ multisampling: 0, dprMax: 1.5, bloomLevels: 5, monitor: false });
  expect(parseGfxOverride("?gfx=monitor-on")).toEqual({ monitor: true });
  expect(parseGfxOverride("?gfx=msaa3,dpr9,bloom0,hello")).toEqual({});
  expect(parseGfxOverride("?tier=full")).toEqual({});
});

it("applies an override on top of a budget", () => {
  const base = { dpr: [1, 2] as [number, number], multisampling: 4, bloomLevels: 8 };
  expect(withOverride(base, {})).toEqual(base);
  expect(withOverride(base, { dprMax: 1.5, multisampling: 0, bloomLevels: 5 })).toEqual({ dpr: [1, 1.5], multisampling: 0, bloomLevels: 5 });
  expect(withOverride(base, { dprMax: 0.75 })).toEqual({ dpr: [0.75, 0.75], multisampling: 4, bloomLevels: 8 });
});
```

In the same file, update the three `renderBudget` expectations to include `bloomLevels: 8`:

```ts
it("keeps the desktop look and renders fewer pixels on touch devices", () => {
  expect(renderBudget("full", false)).toEqual({ dpr: [1, 2], multisampling: 4, bloomLevels: 8 });
  expect(renderBudget("lite", false)).toEqual({ dpr: [1, 1.5], multisampling: 0, bloomLevels: 8 });
  // Phones and tablets: the composer's MSAA and DPR 2 cost 4 to 7x the lite frame.
  expect(renderBudget("full", true)).toEqual({ dpr: [1, 1.5], multisampling: 0, bloomLevels: 8 });
  expect(renderBudget("lite", true).dpr[1]).toBeLessThanOrEqual(1.25);
});
```

- [x] **Step 2: Run them to verify they fail**

Run: `bun run test tests/unit/render-probe.test.ts tests/unit/scene-settings.test.ts`
Expected: FAIL: cannot resolve `@/experience/scene/renderProbe`; `parseGfxOverride is not a function`; `bloomLevels` missing.

- [x] **Step 3: Implement the probe and the override**

Create `src/experience/scene/renderProbe.ts`:

```ts
import type { Camera, Scene, WebGLRenderer } from "three";

function shortHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Read-only renderer handle for tests (`window.__hq.render`), the perf script, the quality safety net
 * and precompile. The Director records every frame's totals (all render passes), so peaks in the
 * intro and during rides are visible, not just the 10 Hz `drawCalls` mirror.
 */
export const renderProbe = {
  gl: null as WebGLRenderer | null,
  scene: null as Scene | null,
  camera: null as Camera | null,
  /** Highest whole-frame draw call count since `resetPeak` (every render pass, like `drawCalls`). */
  peakCalls: 0,
  peakTriangles: 0,
  /** Frames recorded since `resetPeak`. */
  frames: 0,
  record(calls: number, triangles: number): void {
    this.frames += 1;
    if (calls > this.peakCalls) this.peakCalls = calls;
    if (triangles > this.peakTriangles) this.peakTriangles = triangles;
  },
  resetPeak(): void {
    this.peakCalls = 0;
    this.peakTriangles = 0;
    this.frames = 0;
  },
  /** Shader programs three holds right now (`renderer.info.programs`). */
  programs(): number {
    return this.gl?.info.programs?.length ?? 0;
  },
  /** `Material#hash` per program, sorted (cache keys hold whole shader sources, so they are hashed). */
  programNames(): string[] {
    return (this.gl?.info.programs ?? []).map((p) => `${(p as { name?: string }).name ?? "program"}#${shortHash(p.cacheKey)}`).sort();
  },
};
```

In `src/experience/scene/settings.ts`, replace everything from `export interface RenderBudget {` to the end of the file with:

```ts
export interface RenderBudget {
  /** Device pixel ratio range for the canvas (R3F clamps window.devicePixelRatio into it). */
  dpr: [number, number];
  /** MSAA samples of the full-tier EffectComposer (the canvas itself never multisamples). */
  multisampling: number;
  /** MIP levels of the full tier's mipmap bloom (postprocessing's default, the look the owner signed off). */
  bloomLevels: number;
}

export const BLOOM_LEVELS = 8;

/**
 * Pixel budget per tier and device. Fill rate is the main cost on phones and weak GPUs (measured:
 * the full-tier composer at 4x MSAA and DPR 2 costs 4 to 7x the lite frame), so touch devices
 * (`coarse` pointer) render fewer pixels and skip composer MSAA; desktops keep the full look.
 * The canvas never multisamples: on full the composer renders into its own targets, and lite has
 * always run without antialiasing.
 */
export function renderBudget(tier: GpuTier, coarse: boolean): RenderBudget {
  if (tier === "full") return coarse ? { dpr: [1, 1.5], multisampling: 0, bloomLevels: BLOOM_LEVELS } : { dpr: [1, 2], multisampling: 4, bloomLevels: BLOOM_LEVELS };
  return { dpr: coarse ? [1, 1.25] : [1, 1.5], multisampling: 0, bloomLevels: BLOOM_LEVELS };
}

/** `?gfx=` debug override (perf measurements and tests): `dpr1.5`, `msaa0|2|4|8`, `bloom1..8`, `monitor-on|off`. */
export interface GfxOverride {
  dprMax?: number;
  multisampling?: number;
  bloomLevels?: number;
  monitor?: boolean;
}

export function parseGfxOverride(search: string): GfxOverride {
  const raw = new URLSearchParams(search).get("gfx");
  const out: GfxOverride = {};
  if (!raw) return out;
  for (const part of raw.split(",").map((p) => p.trim())) {
    if (part === "monitor-off") out.monitor = false;
    else if (part === "monitor-on") out.monitor = true;
    const m = /^(dpr|msaa|bloom)(\d+(?:\.\d+)?)$/.exec(part);
    if (!m) continue;
    const v = Number(m[2]);
    if (m[1] === "dpr" && v >= 0.5 && v <= 3) out.dprMax = v;
    if (m[1] === "msaa" && [0, 2, 4, 8].includes(v)) out.multisampling = v;
    if (m[1] === "bloom" && Number.isInteger(v) && v >= 1 && v <= 8) out.bloomLevels = v;
  }
  return out;
}

export function withOverride(budget: RenderBudget, o: GfxOverride): RenderBudget {
  return {
    dpr: o.dprMax === undefined ? budget.dpr : [Math.min(1, o.dprMax), o.dprMax],
    multisampling: o.multisampling ?? budget.multisampling,
    bloomLevels: o.bloomLevels ?? budget.bloomLevels,
  };
}
```

- [x] **Step 4: Run them to verify they pass**

Run: `bun run test tests/unit/render-probe.test.ts tests/unit/scene-settings.test.ts`
Expected: PASS (3 + 5 tests).

- [x] **Step 5: Wire the probe, the override and the bloom levels**

In `src/experience/scene/Director.tsx`, add the import `import { renderProbe } from "./renderProbe";` and, right after `info.reset();` inside `useFrame`:

```ts
    renderProbe.record(local.frameCalls, local.frameTriangles);
```

Replace `src/experience/scene/Effects.tsx` with:

```tsx
"use client";

import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { sceneSettings } from "./settings";

const BLOOM = sceneSettings("full").bloom!;

/**
 * Full tier only: mipmap bloom (threshold 0.6, intensity 0.9, radius 0.45) on HDR neon, then ACES. The
 * composer turns off renderer tone mapping, so ACES runs as the last effect here. `multisampling` and
 * `levels` come from `renderBudget`.
 */
export default function Effects({ multisampling, levels }: { multisampling: number; levels: number }) {
  return (
    <EffectComposer multisampling={multisampling}>
      <Bloom mipmapBlur levels={levels} luminanceThreshold={BLOOM.threshold} intensity={BLOOM.intensity} radius={BLOOM.radius} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
```

In `src/experience/scene/Scene.tsx`: change the import to `import { sceneSettings, type RenderBudget } from "./settings";`, add `budget: RenderBudget;` to the props type and `budget,` to the destructuring, delete `const coarse = useHQStore((s) => s.device.coarse);`, and replace the effects block:

```tsx
      {tier === "full" && (
        <Suspense fallback={null}>
          <Effects multisampling={budget.multisampling} levels={budget.bloomLevels} />
        </Suspense>
      )}
```

In `src/experience/Experience.tsx`:
1. Change the settings import to `import { parseGfxOverride, renderBudget, sceneSettings, withOverride } from "./scene/settings";` and add `import { renderProbe } from "./scene/renderProbe";`.
2. Replace `const budget = renderBudget(tier, coarse);` with:

```tsx
  const gfx = useMemo(() => parseGfxOverride(window.location.search), []);
  const budget = useMemo(() => withOverride(renderBudget(tier, coarse), gfx), [tier, coarse, gfx]);
  useEffect(
    () => () => {
      renderProbe.gl = null;
      renderProbe.scene = null;
      renderProbe.camera = null;
    },
    [],
  );
```

3. In `startSession`, extend the test handle:

```tsx
  (window as unknown as { __hq?: unknown }).__hq = { store, rover: roverRuntime, camera: () => [...roverRuntime.cameraPosition], layouts, interact: interactRuntime, render: renderProbe };
```

4. In `onCreated`, destructure the scene and camera and bind the probe first:

```tsx
          onCreated={({ gl, scene, camera }) => {
            renderProbe.gl = gl;
            renderProbe.scene = scene;
            renderProbe.camera = camera;
            gl.toneMapping = ACESFilmicToneMapping;
```

5. Pass the budget to the scene: `<Scene data={data} tier={tier} labels={labels} held={held} onToggleLang={toggleLang} budget={budget} />`.

- [x] **Step 6: Typecheck, lint and unit tests**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: no type or lint errors; all unit tests PASS.

- [x] **Step 7: Add the `gpu` spec to the e2e plan**

In `scripts/e2e-plan.ts`, add `"gpu",` to `ALL_SPECS` between `"gallery",` and `"highlights",`, and insert before `{ test: /^src\/experience\//, specs: ["experience"] },`:

```ts
  // Render budget, quality safety net, precompile, content visibility and the tower's mount set.
  { test: /^src\/experience\/(scene|tower)\//, specs: ["experience", "gpu"] },
```

Append to the describe block in `tests/unit/e2e-plan.test.ts`:

```ts
  it("maps the render pipeline and the tower to the gpu spec", () => {
    expect(specsForChanges(["src/experience/scene/settings.ts"]).specs).toEqual(["experience", "gpu"]);
    expect(specsForChanges(["src/experience/tower/FloorLevel.tsx"]).specs).toEqual(["experience", "gpu"]);
  });
```

- [x] **Step 8: Write the CI measurement spec**

Create `e2e/gpu.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { waitForFloor, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";

/**
 * GPU and rendering gates (round 5, P2). Counters are deterministic on SwiftShader (draw calls,
 * programs, applied DPR and MSAA); time-based numbers come from scripts/perf-gpu.ts on real GPUs.
 */
type Graphics = { pixelRatio: number; multisampling: number | null; bloomLevels: number | null };
type RenderHandle = { resetPeak(): void; peakCalls: number; peakTriangles: number; programs(): number; programNames(): string[]; graphics?(): Graphics };
type GpuWindow = { __hq: { store: { getState(): { goToFloor(f: string): void } }; render: RenderHandle } };

test.describe.configure({ timeout: 240_000 });
test.use({ viewport: { width: 1440, height: 900 } });

async function firstSession(page: Page, tier = "full") {
  await page.route("**/api/ask", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, turnstileSiteKey: null, asOf: "2026-10-11", maxLength: 300 }) }),
  );
  await page.addInitScript(() => {
    localStorage.setItem("hq:terminal-seen", "1");
    localStorage.setItem("hq:onboarded", "done");
    localStorage.setItem("hq:hints", "off");
    sessionStorage.setItem("hq:ask-teaser", "1");
  });
  await page.goto(`/en?tier=${tier}`);
  await waitForHQ(page);
}

/** Clicks Boot rover with the peak counter reset, so the peak covers the intro and the handover. */
async function bootRover(page: Page) {
  const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
  await expect(start).not.toHaveAttribute("aria-disabled", "true", { timeout: 60_000 });
  await page.evaluate(() => (window as unknown as GpuWindow).__hq.render.resetPeak());
  await start.click();
  await waitForPhase(page, "intro");
}

async function counters(page: Page) {
  return page.evaluate(() => {
    const r = (window as unknown as GpuWindow).__hq.render;
    return { peakCalls: r.peakCalls, peakTriangles: r.peakTriangles, programs: r.programs(), names: r.programNames() };
  });
}

async function ride(page: Page, to: string) {
  await page.evaluate(() => (window as unknown as GpuWindow).__hq.render.resetPeak());
  await page.evaluate((f) => (window as unknown as GpuWindow).__hq.store.getState().goToFloor(f), to);
  await waitForFloor(page, to, 90_000);
  await waitForSceneLive(page);
  return counters(page);
}

function report(name: string, value: unknown) {
  test.info().annotations.push({ type: name, description: JSON.stringify(value) });
  console.log(`[gpu] ${name} ${JSON.stringify(value)}`);
}

test("intro and ride draw-call peaks (full tier)", async ({ page }) => {
  await firstSession(page);
  await bootRover(page);
  await waitForPhase(page, "explore", 60_000);
  await waitForSceneLive(page);
  const intro = await counters(page);
  const rides = {
    "L1-L2": await ride(page, "L2"),
    "L2-L1": await ride(page, "L1"),
    "L1-RF": await ride(page, "RF"),
    "RF-L1": await ride(page, "L1"),
  };
  const peaks = { intro: intro.peakCalls, ...Object.fromEntries(Object.entries(rides).map(([k, v]) => [k, v.peakCalls])) };
  report("peaks", peaks);
  for (const value of Object.values(peaks)) expect(Number.isFinite(value) && value > 10).toBe(true);
});

test("programs added on the first arrival at each floor (full tier)", async ({ page }) => {
  await firstSession(page);
  await bootRover(page);
  await waitForPhase(page, "explore", 60_000);
  await waitForSceneLive(page);
  const seen = new Set((await counters(page)).names);
  const added: Record<string, string[]> = {};
  for (const floor of ["L2", "L3", "L4", "RF"]) {
    const { names } = await ride(page, floor);
    added[floor] = names.filter((n) => !seen.has(n));
    for (const n of names) seen.add(n);
  }
  report("programs-added", Object.fromEntries(Object.entries(added).map(([k, v]) => [k, v.length])));
  report("programs-added-names", added);
  expect(Object.keys(added)).toHaveLength(4);
});
```

- [x] **Step 9: Build and run the spec (baseline numbers)**

Run: `bun run build && E2E_PORT=4431 bunx playwright test e2e/gpu.spec.ts --reporter=list`
Expected: 2 passed. Copy the `[gpu] peaks` and `[gpu] programs-added` lines into `docs/perf/r5-gpu.md` (Step 11) as the "before" SwiftShader counters. If the intro or any ride peak is >= 150, that confirms SP9's risk; Task 9 fixes it.

- [x] **Step 10: Write the local real-GPU script**

Create `scripts/perf-gpu.ts`:

```ts
/**
 * Real-GPU measurements for round 5 (P2 spikes SP4 and SP9). Headed Chrome on the machine you run it on.
 * Serve a build first: bun scripts/serve-static.ts --port 4431
 *   bun scripts/perf-gpu.ts sp4 [--size 1440x900] [--dpr 2] [--variants current,msaa0,dpr1.5,bloom5] [--channel chrome]
 *   bun scripts/perf-gpu.ts sp9 [--tier full|lite] [--cpu 4] [--size 1440x900] [--dpr 1]
 * Prints a markdown table and writes JSON to test-results/perf-gpu/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";

const args = process.argv.slice(2);
const mode = args[0];
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = opt("url", `http://127.0.0.1:${process.env.E2E_PORT ?? 4431}`);
const [W, H] = opt("size", "1440x900").split("x").map(Number);
const DPR = Number(opt("dpr", mode === "sp9" ? "1" : "2"));
const CHANNEL = opt("channel", "chrome");
const ROUTES: [string, string][] = [["L1", "/en"], ["L2", "/en/journey"], ["L3", "/en/labs"], ["L4", "/en/library"], ["RF", "/en/contact"]];
const VARIANT_GFX: Record<string, string> = { current: "", msaa0: "msaa0", "dpr1.5": "dpr1.5", bloom5: "bloom5" };

type Sample = { t: number; ms: number };
type PerfRead = { frames: number[]; gpu: Sample[]; longTasks: { start: number; duration: number }[]; stages: { t: number; stage: string }[] };

/** Init script: GPU timer queries around every rAF callback of the tower canvas, frame deltas, long tasks, ride stages. */
function probe() {
  const contexts: WebGL2RenderingContext[] = [];
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, attrs?: unknown) {
    const ctx = (getContext as unknown as (this: HTMLCanvasElement, t: string, a?: unknown) => unknown).call(this, type, attrs);
    if (type === "webgl2" && ctx) contexts.push(ctx as WebGL2RenderingContext);
    return ctx;
  } as typeof getContext;
  const frames: number[] = [];
  const gpu: { t: number; ms: number }[] = [];
  const longTasks: { start: number; duration: number }[] = [];
  const stages: { t: number; stage: string }[] = [];
  const pending: { q: WebGLQuery; t: number }[] = [];
  let main: WebGL2RenderingContext | null = null;
  let ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null;
  let last = 0;
  let active = false;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb: FrameRequestCallback) =>
    raf((t) => {
      if (t !== last) {
        if (last) frames.push(t - last);
        last = t;
        const s = (window as unknown as { __hq?: { store: { getState(): { phase: string; ride: { stage: string } | null } } } }).__hq?.store.getState();
        stages.push({ t, stage: s ? (s.ride ? `ride:${s.ride.stage}` : s.phase) : "loading" });
      }
      main ??= contexts.find((c) => (c.canvas as HTMLCanvasElement).closest?.('[data-testid="hq-world"]')) ?? null;
      if (main && !ext) ext = main.getExtension("EXT_disjoint_timer_query_webgl2");
      let q: WebGLQuery | null = null;
      if (main && ext && !active) {
        q = main.createQuery();
        if (q) {
          main.beginQuery(ext.TIME_ELAPSED_EXT, q);
          active = true;
        }
      }
      try {
        cb(t);
      } finally {
        if (q && main && ext) {
          main.endQuery(ext.TIME_ELAPSED_EXT);
          active = false;
          pending.push({ q, t });
        }
        while (main && ext && pending.length && main.getQueryParameter(pending[0].q, main.QUERY_RESULT_AVAILABLE)) {
          const done = pending.shift()!;
          if (!main.getParameter(ext.GPU_DISJOINT_EXT)) gpu.push({ t: done.t, ms: main.getQueryParameter(done.q, main.QUERY_RESULT) / 1e6 });
          main.deleteQuery(done.q);
        }
      }
    });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) longTasks.push({ start: e.startTime, duration: e.duration });
  }).observe({ type: "longtask", buffered: true });
  (window as unknown as { __perf: unknown }).__perf = {
    reset() {
      frames.length = 0;
      gpu.length = 0;
      longTasks.length = 0;
      stages.length = 0;
    },
    read: () => ({ frames: [...frames], gpu: [...gpu], longTasks: [...longTasks], stages: [...stages] }),
  };
}

const pct = (values: number[], p: number) => {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] * 10) / 10;
};
const perFrame = (gpu: Sample[]) => [...gpu.reduce((m, g) => m.set(g.t, (m.get(g.t) ?? 0) + g.ms), new Map<number, number>()).values()];
/** Render-target estimate (REPORT F7.4): MSAA 4 HalfFloat input about 48 B/px, resolve color + depth 12 B/px, canvas 8 B/px. */
const estimateMB = (px: number, msaa: number | null) => Math.round((px * ((msaa ? 48 : 0) + 12 + 8)) / 1e6);

const QUIET = () => {
  localStorage.setItem("hq:terminal-seen", "1");
  localStorage.setItem("hq:onboarded", "done");
  localStorage.setItem("hq:hints", "off");
  sessionStorage.setItem("hq:ask-teaser", "1");
};
const RETURNING = () => {
  QUIET();
  sessionStorage.setItem("hq:intro", "seen");
  if (!localStorage.getItem("hq:v1")) localStorage.setItem("hq:v1", JSON.stringify({ state: { firstVisit: false, visited: [], locale: "en", sound: false }, version: 1 }));
};

async function live(page: Page) {
  await page.waitForFunction(() => ((window as unknown as { __hq?: { rover: { drawCalls: number } } }).__hq?.rover.drawCalls ?? 0) > 0 && !document.documentElement.hasAttribute("data-hq-boot"), null, { timeout: 120_000 });
}
const read = (page: Page) => page.evaluate(() => (window as unknown as { __perf: { read(): PerfRead } }).__perf.read());
const reset = (page: Page) => page.evaluate(() => (window as unknown as { __perf: { reset(): void } }).__perf.reset());

async function sp4() {
  const variants = opt("variants", "current,msaa0,dpr1.5,bloom5").split(",");
  const browser = await chromium.launch({ headless: false, channel: CHANNEL });
  const rows: Record<string, unknown>[] = [];
  for (const variant of variants) {
    for (const [floor, route] of ROUTES) {
      const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
      const page = await context.newPage();
      await page.addInitScript(probe);
      await page.addInitScript(RETURNING);
      const gfx = ["monitor-off", VARIANT_GFX[variant] ?? variant].filter(Boolean).join(",");
      await page.goto(`${BASE}${route}?tier=full&gfx=${gfx}`);
      await live(page);
      await page.waitForTimeout(3000);
      await reset(page);
      await page.waitForTimeout(5000);
      const r = await read(page);
      const g = await page.evaluate(() => {
        const render = (window as unknown as { __hq: { render: { gl: { getPixelRatio(): number; domElement: HTMLCanvasElement } | null; graphics?: () => { multisampling: number | null; bloomLevels: number | null } } } }).__hq.render;
        return { pixelRatio: render.gl?.getPixelRatio() ?? 0, px: (render.gl?.domElement.width ?? 0) * (render.gl?.domElement.height ?? 0), ...(render.graphics?.() ?? { multisampling: null, bloomLevels: null }) };
      });
      const gpuFrames = perFrame(r.gpu);
      rows.push({ variant, floor, frameP50: pct(r.frames, 0.5), frameP95: pct(r.frames, 0.95), gpuP50: pct(gpuFrames, 0.5), gpuP95: pct(gpuFrames, 0.95), pixelRatio: g.pixelRatio, msaa: g.multisampling, bloom: g.bloomLevels, estMB: estimateMB(g.px, g.multisampling), pass: pct(r.frames, 0.95) <= 18 });
      await context.close();
    }
  }
  await browser.close();
  return rows;
}

async function sp9() {
  const tier = opt("tier", "full");
  const cpu = Number(opt("cpu", "4"));
  const browser = await chromium.launch({ headless: false, channel: CHANNEL });
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  const page = await context.newPage();
  await page.addInitScript(probe);
  await page.addInitScript(QUIET);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  await page.goto(`${BASE}/en?tier=${tier}`);
  const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
  await start.waitFor({ timeout: 120_000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="boot"] button[aria-disabled="true"]') === null, null, { timeout: 120_000 });
  const boot = await read(page);
  await reset(page);
  await page.evaluate(() => (window as unknown as { __hq: { render: { resetPeak(): void } } }).__hq.render.resetPeak());
  await start.click();
  await live(page);
  await page.waitForFunction(() => (window as unknown as { __hq: { store: { getState(): { phase: string } } } }).__hq.store.getState().phase === "explore", null, { timeout: 120_000 });
  const introRead = await read(page);
  const counters = () => page.evaluate(() => {
    const r = (window as unknown as { __hq: { render: { peakCalls: number; programs(): number; programNames(): string[] } } }).__hq.render;
    return { peak: r.peakCalls, programs: r.programs(), names: r.programNames() };
  });
  const intro = await counters();
  const seen = new Set(intro.names);
  const rows: Record<string, unknown>[] = [
    { step: "boot", peakCalls: "", newPrograms: "", maxLongTask: pct(boot.longTasks.map((l) => l.duration), 1), longTasksOver50: boot.longTasks.filter((l) => l.duration > 50).length, movingLongTasks: "" },
    { step: "intro", peakCalls: intro.peak, newPrograms: "", maxLongTask: pct(introRead.longTasks.map((l) => l.duration), 1), longTasksOver50: introRead.longTasks.filter((l) => l.duration > 50).length, movingLongTasks: "" },
  ];
  for (const to of ["L2", "L3", "L4", "RF", "L1"]) {
    await reset(page);
    await page.evaluate(() => (window as unknown as { __hq: { render: { resetPeak(): void } } }).__hq.render.resetPeak());
    await page.evaluate((f) => (window as unknown as { __hq: { store: { getState(): { goToFloor(f: string): void } } } }).__hq.store.getState().goToFloor(f), to);
    await page.waitForFunction((f) => {
      const s = (window as unknown as { __hq: { store: { getState(): { floor: string; ride: unknown; phase: string } } } }).__hq.store.getState();
      return s.floor === f && s.ride === null && s.phase === "explore";
    }, to, { timeout: 120_000 });
    await page.waitForTimeout(1500);
    const r = await read(page);
    const c = await counters();
    const stageAt = (time: number) => [...r.stages].reverse().find((s) => s.t <= time)?.stage ?? "loading";
    const moving = r.longTasks.filter((l) => stageAt(l.start) === "ride:moving");
    rows.push({ step: `ride to ${to}`, peakCalls: c.peak, newPrograms: c.names.filter((n) => !seen.has(n)).length, maxLongTask: pct(r.longTasks.map((l) => l.duration), 1), longTasksOver50: r.longTasks.filter((l) => l.duration > 50).length, movingLongTasks: moving.length });
    for (const n of c.names) seen.add(n);
  }
  await browser.close();
  return rows;
}

if (mode !== "sp4" && mode !== "sp9") {
  console.error("usage: bun scripts/perf-gpu.ts sp4|sp9 [options]");
  process.exit(2);
}
const rows = mode === "sp4" ? await sp4() : await sp9();
mkdirSync("test-results/perf-gpu", { recursive: true });
const file = `test-results/perf-gpu/${mode}-${W}x${H}@${DPR}-${Date.now()}.json`;
writeFileSync(file, JSON.stringify(rows, null, 2));
const cols = Object.keys(rows[0] ?? {});
console.log(`| ${cols.join(" | ")} |\n|${cols.map(() => "---").join("|")}|\n${rows.map((r) => `| ${cols.map((c) => String(r[c])).join(" | ")} |`).join("\n")}`);
console.log(`\nJSON: ${file}`);
```

- [x] **Step 11: Record the baseline on real hardware**

With the build from Step 9 served (`bun scripts/serve-static.ts --port 4431`), run on the M-series Mac, and, when the owner can, on the Windows PC in Chrome (`--channel chrome`). Brave cannot be driven by this script; on Brave use P4's `?perf=1` overlay by hand on the same routes and note its fps next to the Chrome rows:

```bash
bun scripts/perf-gpu.ts sp4 --size 1440x900 --dpr 2
bun scripts/perf-gpu.ts sp4 --size 2560x1440 --dpr 1
bun scripts/perf-gpu.ts sp9 --tier full --cpu 4
bun scripts/perf-gpu.ts sp9 --tier lite --cpu 4 --size 390x844 --dpr 3
```

Expected: four markdown tables. Create `docs/perf/r5-gpu.md`:

```markdown
# Round 5 P2: GPU and rendering measurements

Method: `scripts/perf-gpu.ts` (headed Chrome, real GPU, `?gfx=monitor-off`), `e2e/gpu.spec.ts` (SwiftShader, deterministic counters). Same commands before and after; machine and browser version in each heading.

## Before (main @ <sha>)

### SP4 full tier, 1440x900@2, <machine>, Chrome <version>
(paste the sp4 table)

### SP4 full tier, 2560x1440@1, <machine>, Chrome <version>
(paste the sp4 table)

### SP9 full tier, 4x CPU, <machine>
(paste the sp9 table)

### SP9 lite tier, 390x844@3, 4x CPU, <machine>
(paste the sp9 table)

### CI counters (SwiftShader, e2e/gpu.spec.ts)
(paste the `[gpu] peaks` and `[gpu] programs-added` lines)

## After (this PR)
(Task 12 fills this with the same five blocks)
```

Replace each `(paste ...)` line with the printed table and each `<...>` with the real sha, machine and version before committing (they are measurement data, not prose). SP4 pass rule: `frameP95 <= 18` on every floor; SP9 pass rule: scene peak < 150, no long task > 50 ms while `ride:moving`.

- [x] **Step 12: Commit**

```bash
rtk git add src/experience/scene/renderProbe.ts src/experience/scene/settings.ts src/experience/scene/Director.tsx src/experience/scene/Scene.tsx src/experience/scene/Effects.tsx src/experience/Experience.tsx tests/unit/render-probe.test.ts tests/unit/scene-settings.test.ts scripts/perf-gpu.ts scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts e2e/gpu.spec.ts docs/perf/r5-gpu.md
rtk git commit -m "test: render probe, gfx override and SP4/SP9 baseline measurements"
```

---

## Task 3: Pixel budget, MSAA 0 at DPR >= 1.5, bloom levels by pixel count

F5.1 and F7.4: composer MSAA 4 HalfFloat at DPR 2 is the dominant GPU and memory cost. Retina screens are already sharp, so the composer drops MSAA there; very large canvases get a DPR cap from a total pixel budget that keeps every MacBook at DPR 2 and a 2560x1440 monitor at DPR 1 untouched.

**Files:**
- Modify: `src/experience/scene/settings.ts` (`renderBudget`)
- Modify: `tests/unit/scene-settings.test.ts`
- Create: `src/experience/scene/postHandle.ts`
- Modify: `src/experience/scene/renderProbe.ts` (`graphics()`)
- Modify: `src/experience/scene/Effects.tsx`
- Modify: `src/experience/Experience.tsx`
- Modify: `e2e/gpu.spec.ts`

**Interfaces:**
- Consumes: `RenderBudget`, `BLOOM_LEVELS`, `withOverride` (Task 2).
- Produces: `ScreenSize { width: number; height: number; dpr: number }`, `PIXEL_BUDGET = 8_300_000`, `RETINA_DPR = 1.5`, `budgetDpr(cssWidth: number, cssHeight: number, max: number): number`, `renderBudget(tier: GpuTier, coarse: boolean, screen: ScreenSize): RenderBudget`.
- Produces: `postHandle.get(): PostHandle | null`, `postHandle.set(h: PostHandle | null)`, `PostHandle { composer: () => EffectComposer | null; bloom: () => BloomEffect | null }`, `sceneTarget(): WebGLRenderTarget | null`, `renderProbe.graphics(): { pixelRatio: number; multisampling: number | null; bloomLevels: number | null }`.

- [x] **Step 1: Write the failing tests**

In `tests/unit/scene-settings.test.ts`, replace the test "keeps the desktop look and renders fewer pixels on touch devices" with (and import `PIXEL_BUDGET, budgetDpr` too):

```ts
const MAC = { width: 1440, height: 900, dpr: 2 };

it("keeps DPR 2 on Retina laptops and drops composer MSAA there (DPR already antialiases)", () => {
  expect(renderBudget("full", false, MAC)).toEqual({ dpr: [1, 2], multisampling: 0, bloomLevels: 8 });
  expect(renderBudget("full", false, { width: 1728, height: 1117, dpr: 2 })).toEqual({ dpr: [1, 2], multisampling: 0, bloomLevels: 8 });
});

it("keeps 4x MSAA on DPR 1 desktops, including the 2560x1440 monitor", () => {
  expect(renderBudget("full", false, { width: 2560, height: 1440, dpr: 1 })).toEqual({ dpr: [1, 1.5], multisampling: 4, bloomLevels: 8 });
  expect(renderBudget("full", false, { width: 1920, height: 1080, dpr: 1.25 })).toEqual({ dpr: [1, 2], multisampling: 4, bloomLevels: 8 });
});

it("drops MSAA from DPR 1.5 up (Windows at 150%)", () => {
  expect(renderBudget("full", false, { width: 1707, height: 960, dpr: 1.5 }).multisampling).toBe(0);
});

it("caps DPR by total pixels on very large canvases", () => {
  // 5K display: 2560x1440 CSS at DPR 2 would be 14.7 MP; the budget allows 8.3 MP, so DPR 1.5.
  expect(renderBudget("full", false, { width: 2560, height: 1440, dpr: 2 })).toEqual({ dpr: [1, 1.5], multisampling: 0, bloomLevels: 8 });
  // 4K at DPR 1 fits exactly; larger canvases never go below DPR 1.
  expect(renderBudget("full", false, { width: 3840, height: 2160, dpr: 1 }).dpr).toEqual([1, 1]);
  expect(renderBudget("full", false, { width: 5120, height: 2160, dpr: 1 }).dpr).toEqual([1, 1]);
  expect(budgetDpr(2560, 1440, 2)).toBe(1.5);
  expect(budgetDpr(1440, 900, 2)).toBe(2);
  expect(2560 * 1440 * 1.5 * 1.5).toBeLessThanOrEqual(PIXEL_BUDGET);
});

it("keeps the touch and lite budgets", () => {
  expect(renderBudget("full", true, { width: 1024, height: 1366, dpr: 2 })).toEqual({ dpr: [1, 1.5], multisampling: 0, bloomLevels: 8 });
  expect(renderBudget("lite", true, { width: 390, height: 844, dpr: 3 })).toEqual({ dpr: [1, 1.25], multisampling: 0, bloomLevels: 8 });
  expect(renderBudget("lite", false, MAC)).toEqual({ dpr: [1, 1.5], multisampling: 0, bloomLevels: 8 });
});
```

- [x] **Step 2: Run them to verify they fail**

Run: `bun run test tests/unit/scene-settings.test.ts`
Expected: FAIL: `budgetDpr` / `PIXEL_BUDGET` not exported; Retina case returns `multisampling: 4`.

- [x] **Step 3: Implement the budget**

In `src/experience/scene/settings.ts`, replace the `renderBudget` doc comment and function with:

```ts
/** CSS viewport and the device pixel ratio the browser reports. */
export interface ScreenSize {
  width: number;
  height: number;
  dpr: number;
}

/**
 * Most pixels one frame may render (canvas and composer targets). 8.3 MP (4K UHD) keeps every MacBook
 * (up to 1728x1117 at DPR 2 = 7.7 MP) and a 2560x1440 monitor at DPR 1 unchanged; only larger canvases
 * (5K, 4K at DPR 2) get a lower DPR.
 */
export const PIXEL_BUDGET = 8_300_000;
/** From this DPR on the screen itself antialiases, so the composer skips MSAA (owner decision, round 5). */
export const RETINA_DPR = 1.5;

/** Highest DPR the pixel budget allows for this CSS size (never below 1, never above `max`). */
export function budgetDpr(cssWidth: number, cssHeight: number, max: number): number {
  const cap = Math.floor(Math.sqrt(PIXEL_BUDGET / Math.max(1, cssWidth * cssHeight)) * 100) / 100;
  return Math.max(1, Math.min(max, cap));
}

/**
 * Pixel budget per tier, device and screen. Fill rate is the main cost on phones and weak GPUs (the
 * full-tier composer at 4x MSAA HalfFloat and DPR 2 costs 4 to 7x the lite frame, REPORT F5.1), so:
 * touch devices render fewer pixels and skip composer MSAA; desktops keep DPR up to 2 but skip MSAA from
 * DPR 1.5 up; very large canvases get a DPR cap from `PIXEL_BUDGET`. Bloom keeps 8 MIP levels (the
 * safety net in quality.ts lowers them only together with the DPR, so the glow keeps its on-screen size).
 * The canvas never multisamples.
 */
export function renderBudget(tier: GpuTier, coarse: boolean, screen: ScreenSize): RenderBudget {
  const tierMax = tier === "full" ? (coarse ? 1.5 : 2) : coarse ? 1.25 : 1.5;
  const max = budgetDpr(screen.width, screen.height, tierMax);
  const multisampling = tier === "full" && !coarse && screen.dpr < RETINA_DPR ? 4 : 0;
  return { dpr: [1, max], multisampling, bloomLevels: BLOOM_LEVELS };
}
```

- [x] **Step 4: Run them to verify they pass**

Run: `bun run test tests/unit/scene-settings.test.ts`
Expected: PASS (9 tests).

- [x] **Step 5: Composer handle and graphics probe**

Create `src/experience/scene/postHandle.ts`:

```ts
import type { BloomEffect, EffectComposer } from "postprocessing";
import type { WebGLRenderTarget } from "three";

export interface PostHandle {
  composer: () => EffectComposer | null;
  bloom: () => BloomEffect | null;
}

let current: PostHandle | null = null;

/** The full tier's composer and bloom (lazily loaded `Effects`); null on lite. Type-only imports keep postprocessing out of the lite chunk. */
export const postHandle = {
  get: (): PostHandle | null => current,
  set(handle: PostHandle | null): void {
    current = handle;
  },
};

/** Render target the scene pass draws into: the composer's input buffer on full, the canvas (null) on lite. */
export function sceneTarget(): WebGLRenderTarget | null {
  return current?.composer()?.inputBuffer ?? null;
}
```

In `src/experience/scene/renderProbe.ts`, add `import { postHandle } from "./postHandle";` and this method after `programNames()`:

```ts
  /** What the frame really uses now: canvas DPR, composer MSAA and bloom MIP levels (null on lite). */
  graphics(): { pixelRatio: number; multisampling: number | null; bloomLevels: number | null } {
    const post = postHandle.get();
    return {
      pixelRatio: this.gl?.getPixelRatio() ?? 0,
      multisampling: post?.composer()?.multisampling ?? null,
      bloomLevels: post?.bloom()?.mipmapBlurPass.levels ?? null,
    };
  },
```

Replace `src/experience/scene/Effects.tsx` with:

```tsx
"use client";

import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode, type BloomEffect, type EffectComposer as Composer } from "postprocessing";
import { useEffect, useRef } from "react";
import { postHandle } from "./postHandle";
import { sceneSettings } from "./settings";

const BLOOM = sceneSettings("full").bloom!;

/**
 * Full tier only: mipmap bloom (threshold 0.6, intensity 0.9, radius 0.45) on HDR neon, then ACES. The
 * composer turns off renderer tone mapping, so ACES runs as the last effect here. `multisampling` and
 * `levels` are the starting values from `renderBudget`; later changes go through `postHandle`
 * (QualityController), which never rebuilds the composer or recompiles the effect pass.
 */
export default function Effects({ multisampling, levels }: { multisampling: number; levels: number }) {
  const composer = useRef<Composer>(null);
  const bloom = useRef<BloomEffect>(null);
  useEffect(() => {
    postHandle.set({ composer: () => composer.current, bloom: () => bloom.current });
    return () => postHandle.set(null);
  }, []);
  return (
    <EffectComposer ref={composer} multisampling={multisampling}>
      <Bloom ref={bloom} mipmapBlur levels={levels} luminanceThreshold={BLOOM.threshold} intensity={BLOOM.intensity} radius={BLOOM.radius} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
```

In `src/experience/Experience.tsx`, add a module-level helper under `readDevice()`:

```tsx
function readScreen() {
  return { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 };
}
```

and change the budget line to:

```tsx
  const budget = useMemo(() => withOverride(renderBudget(tier, coarse, readScreen()), gfx), [tier, coarse, gfx]);
```

- [x] **Step 6: Write the e2e budget gate**

Append to `e2e/gpu.spec.ts` (add `asReturningVisitor` to the `./hq` import):

```ts
const BUDGET_CASES = [
  { name: "Retina laptop", width: 1440, height: 900, dpr: 2, tier: "full", touch: false, pixelRatio: 2, msaa: 0 },
  { name: "DPR 1 desktop", width: 1440, height: 900, dpr: 1, tier: "full", touch: false, pixelRatio: 1, msaa: 4 },
  { name: "5K display", width: 2560, height: 1440, dpr: 2, tier: "full", touch: false, pixelRatio: 1.5, msaa: 0 },
  { name: "phone", width: 390, height: 844, dpr: 3, tier: "lite", touch: true, pixelRatio: 1.25, msaa: null },
] as const;

for (const c of BUDGET_CASES) {
  test(`pixel budget and MSAA rule: ${c.name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: c.width, height: c.height }, deviceScaleFactor: c.dpr, hasTouch: c.touch, isMobile: c.touch });
    const page = await context.newPage();
    await asReturningVisitor(page);
    await page.goto(`/en?tier=${c.tier}`);
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    const graphics = () => page.evaluate(() => (window as unknown as GpuWindow).__hq.render.graphics!());
    await expect.poll(async () => (await graphics()).multisampling, { timeout: 30_000 }).toBe(c.msaa);
    const g = await graphics();
    expect(g.pixelRatio).toBeCloseTo(c.pixelRatio, 2);
    if (c.tier === "full") expect(g.bloomLevels).toBe(8);
    await context.close();
  });
}
```

- [x] **Step 7: Build and run the gate**

Run: `bun run build && E2E_PORT=4431 bunx playwright test e2e/gpu.spec.ts -g "pixel budget" --reporter=list`
Expected: 4 passed.

- [x] **Step 8: Screenshot-diff gate (profile `msaa`)**

Run: `E2E_PORT=4431 bun scripts/visual-gate.ts --base HEAD --profile msaa`
Expected: `visual gate: PASS (profile msaa ...)`. Thresholds: `full-1440x900@2` poses threshold 0.2, maxDiffPixelRatio 0.004 (only line and edge antialiasing may differ); `full-2560x1440@1` and `lite-390x844@3` poses strict (threshold 0.1, maxDiffPixelRatio 0.001: nothing may change there). Open `test-results/**/*-diff.png` for any Retina pose and confirm differences sit only on thin lines. Compare `test-results/visual-gate-info/base` and `.../head` `full-1920x1080@1.5-*` side by side at 100% and note in the PR body whether the 150% Windows captures look identical to the eye.
Rollback: if a Retina pose fails or line edges look visibly jagged at 100% zoom, change `RETINA_DPR` to `2` (MSAA then drops only at true 2x screens), rerun the gate; if that still fails, set `multisampling` back to `tier === "full" && !coarse ? 4 : 0` and keep only the pixel budget.

- [x] **Step 9: Measure**

Run: `bun scripts/perf-gpu.ts sp4 --size 1440x900 --dpr 2 --variants current` against the new build.
Expected: `msaa` column 0 and lower `gpuP95` and `estMB` than the Task 2 `current` rows (REPORT est.: GPU ms about 3x lower, render-target memory about 400 MB to about 100 MB at 1440x900@2). Paste into the PR body.

- [x] **Step 10: Commit**

```bash
rtk git add src/experience/scene/settings.ts src/experience/scene/postHandle.ts src/experience/scene/renderProbe.ts src/experience/scene/Effects.tsx src/experience/Experience.tsx tests/unit/scene-settings.test.ts e2e/gpu.spec.ts
rtk git commit -m "perf: pixel budget and no composer MSAA from DPR 1.5 (look-preserving)"
```

---
## Task 4: Quality ladder and sustained-drop monitor (pure)

SP5 and Area 8: there is no runtime adaptation today. This task builds the two pure halves: the ladder of look-preserving steps for a device (pixels first, MSAA next, bloom last) and a monitor that only acts on sustained drops, with hysteresis and at most 2 level changes in any 60 s.

**Files:**
- Create: `src/experience/scene/quality.ts`
- Create: `src/experience/scene/frameMonitor.ts`
- Create: `tests/unit/quality-ladder.test.ts`
- Create: `tests/unit/frame-monitor.test.ts`

**Interfaces:**
- Consumes: `RenderBudget`, `BLOOM_LEVELS`, `renderBudget` (Task 3).
- Produces (quality.ts): `type QualityStep = "dpr-85" | "dpr-70" | "msaa-off" | "bloom-lite"`; `interface QualityState { level: number; dpr: number; multisampling: number; bloomLevels: number }`; `startDpr(base: RenderBudget, deviceDpr: number): number`; `bloomLevelsFor(scale: number, levels?: number): number`; `qualityLadder(base: RenderBudget, tier: GpuTier, deviceDpr: number): QualityStep[]`; `qualityAt(base: RenderBudget, tier: GpuTier, deviceDpr: number, level: number): QualityState`.
- Produces (frameMonitor.ts): `interface MonitorConfig`; `MONITOR_FULL`, `MONITOR_LITE`; `type MonitorAction = "down" | "up"`; `interface FrameMonitor { readonly level: number; readonly locked: boolean; readonly flipTimes: readonly number[]; push(dtMs: number, nowMs: number): MonitorAction | null; hold(nowMs: number): void }`; `percentile(sorted: readonly number[], p: number): number`; `createMonitor(config: MonitorConfig, maxLevel: number, start?: { level: number; locked: boolean }): FrameMonitor`.

- [x] **Step 1: Write the failing ladder tests**

Create `tests/unit/quality-ladder.test.ts`:

```ts
import { expect, it } from "vitest";
import { bloomLevelsFor, qualityAt, qualityLadder, startDpr } from "@/experience/scene/quality";
import { renderBudget } from "@/experience/scene/settings";

const retina = renderBudget("full", false, { width: 1440, height: 900, dpr: 2 });
const desktop = renderBudget("full", false, { width: 2560, height: 1440, dpr: 1 });
const phone = renderBudget("lite", true, { width: 390, height: 844, dpr: 3 });

it("starts where R3F would: the device DPR clamped into the budget", () => {
  expect(startDpr(retina, 2)).toBe(2);
  expect(startDpr(desktop, 1)).toBe(1);
  expect(startDpr(phone, 3)).toBe(1.25);
  expect(startDpr(desktop, 0.9)).toBe(1);
});

it("keeps the glow's on-screen size when the canvas shrinks", () => {
  expect(bloomLevelsFor(1)).toBe(8);
  expect(bloomLevelsFor(0.85)).toBe(8);
  expect(bloomLevelsFor(0.7)).toBe(7);
  expect(bloomLevelsFor(0.3)).toBe(6);
  expect(bloomLevelsFor(0.01)).toBe(5);
});

it("orders steps pixels first, MSAA next, bloom last, and skips steps that change nothing", () => {
  expect(qualityLadder(retina, "full", 2)).toEqual(["dpr-85", "dpr-70", "bloom-lite"]);
  expect(qualityLadder(desktop, "full", 1)).toEqual(["msaa-off", "bloom-lite"]);
  expect(qualityLadder(phone, "lite", 3)).toEqual(["dpr-85", "dpr-70"]);
  expect(qualityLadder(renderBudget("lite", false, { width: 1440, height: 900, dpr: 1 }), "lite", 1)).toEqual([]);
});

it("level 0 is exactly the budget, so nothing changes until the monitor acts", () => {
  expect(qualityAt(retina, "full", 2, 0)).toEqual({ level: 0, dpr: 2, multisampling: 0, bloomLevels: 8 });
  expect(qualityAt(desktop, "full", 1, 0)).toEqual({ level: 0, dpr: 1, multisampling: 4, bloomLevels: 8 });
});

it("walks the Retina ladder", () => {
  expect(qualityAt(retina, "full", 2, 1)).toEqual({ level: 1, dpr: 1.7, multisampling: 0, bloomLevels: 8 });
  expect(qualityAt(retina, "full", 2, 2)).toEqual({ level: 2, dpr: 1.4, multisampling: 0, bloomLevels: 7 });
  expect(qualityAt(retina, "full", 2, 3)).toEqual({ level: 3, dpr: 1.4, multisampling: 0, bloomLevels: 5 });
  expect(qualityAt(retina, "full", 2, 9).level).toBe(3);
});

it("walks the DPR 1 desktop ladder: MSAA first, bloom last", () => {
  expect(qualityAt(desktop, "full", 1, 1)).toEqual({ level: 1, dpr: 1, multisampling: 0, bloomLevels: 8 });
  expect(qualityAt(desktop, "full", 1, 2)).toEqual({ level: 2, dpr: 1, multisampling: 0, bloomLevels: 6 });
});

it("walks the phone ladder down to DPR 1", () => {
  expect(qualityAt(phone, "lite", 3, 1).dpr).toBe(1.06);
  expect(qualityAt(phone, "lite", 3, 2).dpr).toBe(1);
});
```

- [x] **Step 2: Write the failing monitor tests**

Create `tests/unit/frame-monitor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createMonitor, MONITOR_FULL, MONITOR_LITE, percentile, type FrameMonitor } from "@/experience/scene/frameMonitor";

/** Feeds frames of `dt(t)` ms from `from` to `to` (ms); returns [time, action] pairs. */
function feed(m: FrameMonitor, from: number, to: number, dt: (t: number) => number): [number, string][] {
  const out: [number, string][] = [];
  for (let t = from; t < to; ) {
    const d = dt(t);
    t += d;
    const a = m.push(d, t);
    if (a) out.push([Math.round(t), a]);
  }
  return out;
}

const maxFlipsInAnyMinute = (times: readonly number[]) => Math.max(0, ...times.map((t) => times.filter((u) => u >= t && u - t < 60_000).length));

describe("percentile", () => {
  it("picks nearest-rank values", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe("createMonitor (full tier)", () => {
  it("never acts at a steady 60 fps", () => {
    expect(feed(createMonitor(MONITOR_FULL, 3), 0, 120_000, () => 16.7)).toEqual([]);
  });

  it("steps down after 3 s settle plus two slow 2 s windows", () => {
    const m = createMonitor(MONITOR_FULL, 3);
    const actions = feed(m, 0, 7_200, () => 30);
    expect(actions).toHaveLength(1);
    expect(actions[0][1]).toBe("down");
    expect(actions[0][0]).toBeGreaterThanOrEqual(7_000);
    expect(m.level).toBe(1);
  });

  it("never changes level more than twice in any 60 s", () => {
    const m = createMonitor(MONITOR_FULL, 4);
    feed(m, 0, 300_000, () => 45);
    expect(m.level).toBe(4);
    expect(maxFlipsInAnyMinute(m.flipTimes)).toBeLessThanOrEqual(2);
  });

  it("ignores a single long hitch and pauses longer than 1 s", () => {
    const m = createMonitor(MONITOR_FULL, 3);
    expect(feed(m, 0, 60_000, (t) => (Math.floor(t / 10_000) !== Math.floor((t + 16.7) / 10_000) ? 500 : 16.7))).toEqual([]);
    expect(m.push(5_000, 70_000)).toBeNull();
    expect(m.level).toBe(0);
  });

  it("steps back up after 20 s of smooth frames", () => {
    const m = createMonitor(MONITOR_FULL, 3, { level: 1, locked: false });
    const actions = feed(m, 0, 30_000, () => 16.7);
    expect(actions).toHaveLength(1);
    expect(actions[0][1]).toBe("up");
    expect(actions[0][0]).toBeGreaterThanOrEqual(23_000);
    expect(m.level).toBe(0);
  });

  it("locks the level when a step up relapses within 30 s", () => {
    const m = createMonitor(MONITOR_FULL, 3, { level: 1, locked: false });
    feed(m, 0, 24_000, () => 16.7);
    expect(m.level).toBe(0);
    feed(m, 24_000, 32_000, () => 30);
    expect(m.level).toBe(1);
    expect(m.locked).toBe(true);
    expect(feed(m, 32_000, 150_000, () => 16.7)).toEqual([]);
    expect(m.level).toBe(1);
  });

  it("restarts its windows on hold (boot, intro, rides)", () => {
    const m = createMonitor(MONITOR_FULL, 3);
    feed(m, 0, 6_000, () => 30);
    m.hold(6_000);
    expect(feed(m, 6_000, 12_000, () => 30)).toEqual([]);
    expect(feed(m, 12_000, 14_000, () => 30)).toHaveLength(1);
  });
});

describe("createMonitor (lite tier)", () => {
  it("accepts 30 fps (iOS Low Power Mode) and acts below about 28 fps", () => {
    expect(feed(createMonitor(MONITOR_LITE, 2), 0, 120_000, () => 33.3)).toEqual([]);
    expect(feed(createMonitor(MONITOR_LITE, 2), 0, 8_000, () => 40)).toHaveLength(1);
  });

  it("never acts when the ladder is empty", () => {
    expect(feed(createMonitor(MONITOR_LITE, 0), 0, 60_000, () => 80)).toEqual([]);
  });
});
```

- [x] **Step 3: Run them to verify they fail**

Run: `bun run test tests/unit/quality-ladder.test.ts tests/unit/frame-monitor.test.ts`
Expected: FAIL: cannot resolve `@/experience/scene/quality` and `@/experience/scene/frameMonitor`.

- [x] **Step 4: Implement the ladder**

Create `src/experience/scene/quality.ts`:

```ts
import type { GpuTier } from "../types";
import { BLOOM_LEVELS, type RenderBudget } from "./settings";

/** Look-preserving steps of the safety net, cheapest visual change first. */
export type QualityStep = "dpr-85" | "dpr-70" | "msaa-off" | "bloom-lite";

export interface QualityState {
  /** Steps taken (0 = the plain budget). */
  level: number;
  /** Exact canvas DPR. */
  dpr: number;
  multisampling: number;
  bloomLevels: number;
}

const MIN_BLOOM_LEVELS = 5;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Canvas DPR at level 0: what R3F picks from the budget's range on this screen. */
export function startDpr(base: RenderBudget, deviceDpr: number): number {
  return round2(Math.min(base.dpr[1], Math.max(base.dpr[0], deviceDpr)));
}

/**
 * Bloom MIP levels that keep the glow's on-screen size when the canvas renders `scale` times fewer
 * pixels per side (each level halves the size, so one level less per halving).
 */
export function bloomLevelsFor(scale: number, levels = BLOOM_LEVELS): number {
  const clamped = Math.min(1, Math.max(0.01, scale));
  return Math.max(MIN_BLOOM_LEVELS, Math.min(levels, levels + Math.round(Math.log2(clamped))));
}

/** Steps for this device: DPR 85% and 70% (not below 1), composer MSAA off, then bloom 2 levels lighter. Steps that would change nothing are left out. */
export function qualityLadder(base: RenderBudget, tier: GpuTier, deviceDpr: number): QualityStep[] {
  const d0 = startDpr(base, deviceDpr);
  const d85 = Math.max(1, round2(d0 * 0.85));
  const d70 = Math.max(1, round2(d0 * 0.7));
  const steps: QualityStep[] = [];
  if (d85 < d0) steps.push("dpr-85");
  if (d70 < d85) steps.push("dpr-70");
  if (base.multisampling > 0) steps.push("msaa-off");
  if (tier === "full") steps.push("bloom-lite");
  return steps;
}

export function qualityAt(base: RenderBudget, tier: GpuTier, deviceDpr: number, level: number): QualityState {
  const ladder = qualityLadder(base, tier, deviceDpr);
  const taken = new Set(ladder.slice(0, Math.max(0, Math.min(level, ladder.length))));
  const d0 = startDpr(base, deviceDpr);
  const dpr = taken.has("dpr-70") ? Math.max(1, round2(d0 * 0.7)) : taken.has("dpr-85") ? Math.max(1, round2(d0 * 0.85)) : d0;
  const tracked = bloomLevelsFor(dpr / d0, base.bloomLevels);
  return {
    level: taken.size,
    dpr,
    multisampling: taken.has("msaa-off") ? 0 : base.multisampling,
    bloomLevels: taken.has("bloom-lite") ? Math.max(MIN_BLOOM_LEVELS, tracked - 2) : tracked,
  };
}
```

- [x] **Step 5: Implement the monitor**

Create `src/experience/scene/frameMonitor.ts`:

```ts
/**
 * Sustained frame-drop detector (REPORT SP5). Frame deltas are grouped into windows; a window is slow
 * when its median is above `slowMs` and smooth when its 90th percentile is at most `smoothMs` (a
 * 60 Hz display that keeps up). It steps down after `slowWindows` slow windows in a row and back up
 * after `smoothWindows` smooth ones, never more than `maxFlips` times in `flipWindowMs`; a step down
 * soon after a step up locks the level for the session. Pure: no React, no three.
 */
export interface MonitorConfig {
  windowMs: number;
  slowMs: number;
  smoothMs: number;
  slowWindows: number;
  smoothWindows: number;
  maxFlips: number;
  flipWindowMs: number;
  /** No decision for this long after the first frame, a hold or a level change. */
  settleMs: number;
  /** Deltas above this are pauses (hidden tab, debugger), not frames. */
  pauseMs: number;
  relapseMs: number;
}

/** Full tier: the budget is >= 55 fps; act below 50 fps sustained. */
export const MONITOR_FULL: MonitorConfig = { windowMs: 2000, slowMs: 20, smoothMs: 17.5, slowWindows: 2, smoothWindows: 10, maxFlips: 2, flipWindowMs: 60_000, settleMs: 3000, pauseMs: 1000, relapseMs: 30_000 };
/** Lite tier: the budget is >= 30 fps; iOS Low Power Mode caps at 30, so act only below about 28 fps. */
export const MONITOR_LITE: MonitorConfig = { ...MONITOR_FULL, slowMs: 36, smoothMs: 20 };

export type MonitorAction = "down" | "up";

export interface FrameMonitor {
  readonly level: number;
  readonly locked: boolean;
  readonly flipTimes: readonly number[];
  push(dtMs: number, nowMs: number): MonitorAction | null;
  hold(nowMs: number): void;
}

/** Nearest-rank percentile of an ascending list (0 for an empty list). */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

export function createMonitor(config: MonitorConfig, maxLevel: number, start: { level: number; locked: boolean } = { level: 0, locked: false }): FrameMonitor {
  let level = Math.min(Math.max(0, start.level), maxLevel);
  let locked = start.locked;
  const flips: number[] = [];
  let samples: number[] = [];
  let windowStart: number | null = null;
  let settleUntil: number | null = null;
  let slow = 0;
  let smooth = 0;
  let lastUp = -Infinity;

  const restart = (now: number) => {
    settleUntil = now + config.settleMs;
    windowStart = null;
    samples = [];
    slow = 0;
    smooth = 0;
  };
  const canFlip = (now: number) => flips.filter((t) => now - t < config.flipWindowMs).length < config.maxFlips;

  return {
    get level() {
      return level;
    },
    get locked() {
      return locked;
    },
    get flipTimes() {
      return flips;
    },
    hold(now: number) {
      restart(now);
    },
    push(dt: number, now: number): MonitorAction | null {
      if (settleUntil === null) settleUntil = now + config.settleMs;
      if (!(dt > 0) || dt > config.pauseMs || now < settleUntil) return null;
      if (windowStart === null) windowStart = now;
      samples.push(dt);
      if (now - windowStart < config.windowMs) return null;
      const sorted = [...samples].sort((a, b) => a - b);
      samples = [];
      windowStart = now;
      if (percentile(sorted, 0.5) > config.slowMs) {
        slow += 1;
        smooth = 0;
      } else if (percentile(sorted, 0.9) <= config.smoothMs) {
        smooth += 1;
        slow = 0;
      } else {
        slow = 0;
        smooth = 0;
      }
      if (slow >= config.slowWindows && level < maxLevel && canFlip(now)) {
        level += 1;
        if (now - lastUp < config.relapseMs) locked = true;
        flips.push(now);
        restart(now);
        return "down";
      }
      if (smooth >= config.smoothWindows && level > 0 && !locked && canFlip(now)) {
        level -= 1;
        lastUp = now;
        flips.push(now);
        restart(now);
        return "up";
      }
      return null;
    },
  };
}
```

- [x] **Step 6: Run them to verify they pass**

Run: `bun run test tests/unit/quality-ladder.test.ts tests/unit/frame-monitor.test.ts`
Expected: PASS (7 + 10 tests). If "steps back up after 20 s" lands a few hundred ms before 23,000 because of float accumulation, keep the assertion and check the settle start: the first `push` sets `settleUntil = now + 3000`, so the earliest up is 3,000 + 10 x 2,000 = 23,000 ms.

- [x] **Step 7: Commit**

```bash
rtk git add src/experience/scene/quality.ts src/experience/scene/frameMonitor.ts tests/unit/quality-ladder.test.ts tests/unit/frame-monitor.test.ts
rtk git commit -m "feat: look-preserving quality ladder and sustained frame-drop monitor"
```

---

## Task 5: Runtime safety net in the canvas

Wires Task 4 into the scene: the monitor runs only in explore, room and hologram phases (never during boot, intro, rides or the L2 beam), publishes the applied DPR to the `Canvas`, and changes composer MSAA and bloom levels imperatively, so a flip never rebuilds the composer or recompiles the effect pass. Off under automation (`navigator.webdriver`) unless `?gfx=monitor-on`, so CI and Lighthouse never see it act.

**Files:**
- Create: `src/experience/scene/qualityStore.ts`
- Create: `tests/unit/quality-store.test.ts`
- Create: `src/experience/scene/QualityController.tsx`
- Modify: `src/experience/scene/Scene.tsx`
- Modify: `src/experience/Experience.tsx`
- Modify: `e2e/gpu.spec.ts`

**Interfaces:**
- Consumes: `qualityLadder`, `qualityAt`, `QualityState` (Task 4); `createMonitor`, `MONITOR_FULL`, `MONITOR_LITE`, `FrameMonitor` (Task 4); `postHandle` (Task 3); `renderBudget`, `withOverride`, `GfxOverride` (Tasks 2-3).
- Produces: `QualitySnapshot { level: number; locked: boolean; flips: number; last: MonitorAction | null }`; `qualityStore.get()`, `.set(next)`, `.subscribe(listener)`, `.setApplied(q: QualityState | null)`, `.applied()`, `.reset()`; `qualityDebug.simulateFrameMs`; `qualityHandle` exposed as `window.__hq.quality` with `snapshot()` and `simulate(ms: number | null)`; `QualityController({ tier, coarse, gfx })`; `Scene` is `memo`ized and takes `gfx`.
- sessionStorage key: `hq:gfx` (`{"level":n,"locked":bool}`).

- [x] **Step 1: Write the failing store test**

Create `tests/unit/quality-store.test.ts`:

```ts
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { qualityStore } from "@/experience/scene/qualityStore";

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal("window", {});
  vi.stubGlobal("sessionStorage", { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) });
  qualityStore.reset();
});
afterEach(() => vi.unstubAllGlobals());

it("starts at level 0 and remembers the level for the session", () => {
  expect(qualityStore.get()).toEqual({ level: 0, locked: false, flips: 0, last: null });
  qualityStore.set({ level: 2, locked: true, flips: 2, last: "down" });
  expect(JSON.parse(storage.get("hq:gfx")!)).toEqual({ level: 2, locked: true });
  qualityStore.reset();
  expect(qualityStore.get()).toEqual({ level: 2, locked: true, flips: 0, last: null });
});

it("ignores a corrupt stored value", () => {
  storage.set("hq:gfx", "{nope");
  expect(qualityStore.get().level).toBe(0);
  storage.set("hq:gfx", JSON.stringify({ level: 99 }));
  qualityStore.reset();
  expect(qualityStore.get().level).toBe(0);
});

it("notifies subscribers on level and applied-DPR changes only", () => {
  const listener = vi.fn();
  const off = qualityStore.subscribe(listener);
  qualityStore.set({ level: 1, locked: false, flips: 1, last: "down" });
  qualityStore.setApplied({ level: 1, dpr: 1.7, multisampling: 0, bloomLevels: 8 });
  qualityStore.setApplied({ level: 1, dpr: 1.7, multisampling: 0, bloomLevels: 8 });
  expect(listener).toHaveBeenCalledTimes(2);
  expect(qualityStore.applied()?.dpr).toBe(1.7);
  off();
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `bun run test tests/unit/quality-store.test.ts`
Expected: FAIL: cannot resolve `@/experience/scene/qualityStore`.

- [x] **Step 3: Implement the store**

Create `src/experience/scene/qualityStore.ts`:

```ts
import type { MonitorAction } from "./frameMonitor";
import type { QualityState } from "./quality";

export interface QualitySnapshot {
  level: number;
  locked: boolean;
  /** Level changes in this page load. */
  flips: number;
  last: MonitorAction | null;
}

const KEY = "hq:gfx";
const START: QualitySnapshot = { level: 0, locked: false, flips: 0, last: null };

function load(): QualitySnapshot {
  if (typeof window === "undefined") return START;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return START;
    const v = JSON.parse(raw) as { level?: unknown; locked?: unknown };
    if (typeof v.level === "number" && Number.isInteger(v.level) && v.level >= 0 && v.level <= 8) return { level: v.level, locked: v.locked === true, flips: 0, last: null };
  } catch {
    // corrupt or blocked storage: start from the plain budget
  }
  return START;
}

let snapshot: QualitySnapshot | null = null;
let applied: QualityState | null = null;
const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};

/** Quality level of the safety net (session-scoped) and what is applied now. Not in the HQ store: it changes outside React and must not re-render the HUD. */
export const qualityStore = {
  get(): QualitySnapshot {
    snapshot ??= load();
    return snapshot;
  },
  set(next: QualitySnapshot): void {
    snapshot = next;
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ level: next.level, locked: next.locked }));
    } catch {
      // storage blocked: the level still applies to this page load
    }
    notify();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setApplied(next: QualityState | null): void {
    const changed = next?.dpr !== applied?.dpr || next?.multisampling !== applied?.multisampling || next?.bloomLevels !== applied?.bloomLevels;
    applied = next;
    if (changed) notify();
  },
  applied(): QualityState | null {
    return applied;
  },
  /** Forgets the in-memory state (tests, and a fresh `Experience` mount re-reads the session). */
  reset(): void {
    snapshot = null;
    applied = null;
  },
};

/** Test hook: the monitor sees this frame time (ms) instead of the real one while set. */
export const qualityDebug = { simulateFrameMs: null as number | null };

/** `window.__hq.quality`: tests, the perf script and the P4 overlay read it. */
export const qualityHandle = {
  snapshot: () => ({ ...qualityStore.get(), applied: qualityStore.applied() }),
  simulate(ms: number | null): void {
    qualityDebug.simulateFrameMs = ms;
  },
};
```

- [x] **Step 4: Run it to verify it passes**

Run: `bun run test tests/unit/quality-store.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Write the controller**

Create `src/experience/scene/QualityController.tsx`:

```tsx
"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { getHQStore } from "@/store/useHQStore";
import type { GpuTier } from "../types";
import { createMonitor, MONITOR_FULL, MONITOR_LITE, type FrameMonitor } from "./frameMonitor";
import { postHandle } from "./postHandle";
import { qualityAt, qualityLadder } from "./quality";
import { qualityDebug, qualityStore } from "./qualityStore";
import { renderBudget, withOverride, type GfxOverride } from "./settings";

/**
 * Runtime safety net (REPORT SP5, Area 8). Recomputes the pixel budget when the canvas resizes, runs
 * the frame monitor in explore, room and hologram phases, and applies the level: the DPR through the
 * store (Experience passes it to `Canvas`), composer MSAA and bloom levels directly on the existing
 * objects. Off under automation unless `?gfx=monitor-on`.
 */
export function QualityController({ tier, coarse, gfx }: { tier: GpuTier; coarse: boolean; gfx: GfxOverride }) {
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const snapshot = useSyncExternalStore(qualityStore.subscribe, qualityStore.get, qualityStore.get);
  const deviceDpr = window.devicePixelRatio || 1;
  const base = useMemo(() => withOverride(renderBudget(tier, coarse, { width, height, dpr: deviceDpr }), gfx), [tier, coarse, width, height, deviceDpr, gfx]);
  const ladder = useMemo(() => qualityLadder(base, tier, deviceDpr), [base, tier, deviceDpr]);
  const level = Math.min(snapshot.level, ladder.length);
  const enabled = gfx.monitor ?? !navigator.webdriver;
  const monitor = useRef<FrameMonitor | null>(null);

  useEffect(() => {
    qualityStore.setApplied(qualityAt(base, tier, deviceDpr, level));
  }, [base, tier, deviceDpr, level]);

  useEffect(() => {
    const saved = qualityStore.get();
    monitor.current = enabled ? createMonitor(tier === "full" ? MONITOR_FULL : MONITOR_LITE, ladder.length, { level: Math.min(saved.level, ladder.length), locked: saved.locked }) : null;
  }, [enabled, tier, ladder.length]);

  useEffect(() => () => qualityStore.setApplied(null), []);

  useFrame((_, rawDt) => {
    // Keep the composer in step with the level (it may load after the first apply).
    const q = qualityStore.applied();
    const post = postHandle.get();
    const composer = post?.composer();
    if (q && composer && composer.multisampling !== q.multisampling) composer.multisampling = q.multisampling;
    const bloom = post?.bloom();
    if (q && bloom && bloom.mipmapBlurPass.levels !== q.bloomLevels) bloom.mipmapBlurPass.levels = q.bloomLevels;

    const m = monitor.current;
    if (!m) return;
    const now = performance.now();
    const s = getHQStore().getState();
    if (document.hidden || s.phase === "boot" || s.phase === "intro" || s.ride || s.beam) {
      m.hold(now);
      return;
    }
    const action = m.push(qualityDebug.simulateFrameMs ?? rawDt * 1000, now);
    if (action) qualityStore.set({ level: m.level, locked: m.locked, flips: qualityStore.get().flips + 1, last: action });
  });

  return null;
}
```

- [x] **Step 6: Mount it and feed the Canvas DPR**

In `src/experience/scene/Scene.tsx`:
1. Change the React import to `import { lazy, memo, Suspense, useMemo, type RefObject } from "react";` and the settings import to `import { sceneSettings, type GfxOverride, type RenderBudget } from "./settings";`; add `import { QualityController } from "./QualityController";`.
2. Change `export function Scene({` to `export const Scene = memo(function Scene({`, add `gfx,` to the destructuring and `gfx: GfxOverride;` to the props type, and close the component with `});` instead of `}`.
3. Inside the returned fragment, after `<GlassClock />`, add:

```tsx
      <QualityController tier={tier} coarse={coarse} gfx={gfx} />
```

and restore the coarse read at the top of the component body (Task 2 removed it):

```tsx
  const coarse = useHQStore((s) => s.device.coarse);
```

In `src/experience/Experience.tsx`:
1. Change the React import to include `useSyncExternalStore`; add `import { qualityHandle, qualityStore } from "./scene/qualityStore";`.
2. After the `budget` line, add:

```tsx
  // The safety net (QualityController) publishes the exact DPR; R3F resets the canvas to this prop on re-render, so it must follow.
  const appliedDpr = useSyncExternalStore(qualityStore.subscribe, () => qualityStore.applied()?.dpr ?? null, () => null);
```

3. On the `Canvas`, replace `dpr={budget.dpr}` with `dpr={appliedDpr ?? budget.dpr}`.
4. Pass `gfx={gfx}` to `<Scene ... />`.
5. Extend the test handle in `startSession`: `render: renderProbe, quality: qualityHandle`.

- [x] **Step 7: Typecheck, lint, unit tests**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: all PASS. If lint flags `window.devicePixelRatio` during render in `QualityController`, keep it: the component only renders inside the client-only canvas (ssr false), same as `Experience`'s `readScreen()`.

- [x] **Step 8: Write the e2e safety-net gate**

Append to `e2e/gpu.spec.ts`:

```ts
type QualityWindow = { __hq: { quality: { snapshot(): { level: number; locked: boolean; flips: number; applied: { dpr: number; multisampling: number; bloomLevels: number } | null }; simulate(ms: number | null): void } } };
const quality = (page: Page) => page.evaluate(() => (window as unknown as QualityWindow).__hq.quality.snapshot());

test("the safety net is off under automation by default", async ({ page }) => {
  await asReturningVisitor(page);
  await page.goto("/en?tier=full");
  await waitForHQ(page);
  await waitForSceneLive(page);
  await page.evaluate(() => (window as unknown as QualityWindow).__hq.quality.simulate(60));
  await page.waitForTimeout(9_000);
  expect((await quality(page)).level).toBe(0);
});

test("the safety net steps down on sustained slow frames, at most twice a minute, MSAA before bloom", async ({ page }) => {
  test.setTimeout(150_000);
  await asReturningVisitor(page);
  await page.goto("/en?tier=full&gfx=monitor-on");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  // DPR 1 desktop: the ladder is [msaa-off, bloom-lite].
  await page.evaluate(() => (window as unknown as QualityWindow).__hq.quality.simulate(40));
  await expect.poll(async () => (await quality(page)).level, { timeout: 30_000 }).toBe(1);
  await expect.poll(async () => (await page.evaluate(() => (window as unknown as GpuWindow).__hq.render.graphics!())).multisampling, { timeout: 10_000 }).toBe(0);
  expect((await page.evaluate(() => (window as unknown as GpuWindow).__hq.render.graphics!())).bloomLevels).toBe(8);
  await expect.poll(async () => (await quality(page)).level, { timeout: 30_000 }).toBe(2);
  expect((await page.evaluate(() => (window as unknown as GpuWindow).__hq.render.graphics!())).bloomLevels).toBe(6);
  const snap = await quality(page);
  expect(snap.flips).toBeLessThanOrEqual(2);
  await page.evaluate(() => (window as unknown as QualityWindow).__hq.quality.simulate(null));
  expect(await page.evaluate(() => sessionStorage.getItem("hq:gfx"))).toBe(JSON.stringify({ level: 2, locked: false }));
});
```

- [x] **Step 9: Build and run**

Run: `bun run build && E2E_PORT=4431 bunx playwright test e2e/gpu.spec.ts -g "safety net|pixel budget" --reporter=list`
Expected: 6 passed.

- [x] **Step 10: Screenshot-diff gate (profile `strict`)**

Run: `E2E_PORT=4431 bun scripts/visual-gate.ts --base HEAD --profile strict`
Expected: PASS: under automation the monitor is off, so nothing may change (threshold 0.1, maxDiffPixelRatio 0.001 on every pose). Rollback: if anything differs, the controller is changing state at level 0; revert `Scene.tsx` and `Experience.tsx` hunks of this task and investigate `qualityAt(..., 0)` against the Task 3 budget.

- [x] **Step 11: Manual check on real hardware (hysteresis)**

On the Mac with the served build, open `/en?tier=full&gfx=monitor-on` in Chrome, open DevTools > Performance > CPU 6x slowdown for 20 s, then turn it off for 60 s. In the console: `__hq.quality.snapshot()`.
Expected: `level` rose by at most 2 within the minute, `flips <= 2`, and the scene shows no visible pop other than slightly softer edges. Record the snapshot in the PR body.

- [x] **Step 12: Commit**

```bash
rtk git add src/experience/scene/qualityStore.ts src/experience/scene/QualityController.tsx src/experience/scene/Scene.tsx src/experience/Experience.tsx tests/unit/quality-store.test.ts e2e/gpu.spec.ts
rtk git commit -m "feat: runtime quality safety net with hysteresis (pixels first, bloom last)"
```

---
## Task 6: `BatchedLabels` handle, tone mapping and outlines

The stats ring and the L2 labels need three things the current `BatchedLabels` lacks: members whose transform or opacity changes per frame, outlines, and the default tone mapping some of today's labels use. All additions default to today's behaviour, so the RF, L1 skills/cert/Hall and L4 batches are unchanged.

**Files:**
- Modify: `src/types/troika-three-text.d.ts`
- Modify: `src/experience/fx/labelProps.ts`
- Modify: `tests/unit/label-props.test.ts`
- Modify: `src/experience/fx/BatchedLabels.tsx`

**Interfaces:**
- Produces: `BatchedLabel` gains `outlineWidth?: number`, `outlineColor?: string`, `fillOpacity?: number`; `LabelTarget` gains `outlineWidth`, `outlineColor`, `fillOpacity`, `outlineOpacity`.
- Produces: `interface BatchedLabelsHandle { readonly batch: BatchedText; readonly members: readonly Text[] }`; `BatchedLabels({ labels, name?, renderOrder?, toneMapped?: boolean, ref?: Ref<BatchedLabelsHandle> })`. `members[i]` matches `labels[i]`. Callers may set `members[i].matrixAutoUpdate = false` and write `matrix`, or change `fillOpacity`/`outlineOpacity`, or set `text` and call `sync()`.

- [x] **Step 1: Write the failing test**

In `tests/unit/label-props.test.ts`, extend `target()` with the new fields and add a test:

```ts
function target(): LabelTarget {
  return Object.assign(new Object3D(), {
    text: "",
    font: null as string | null,
    fontSize: 0.1,
    color: null as string | number | null,
    anchorX: "left" as LabelTarget["anchorX"],
    anchorY: "top" as LabelTarget["anchorY"],
    textAlign: "left" as LabelTarget["textAlign"],
    maxWidth: Infinity,
    lineHeight: "normal" as LabelTarget["lineHeight"],
    letterSpacing: 0,
    outlineWidth: 0.5 as LabelTarget["outlineWidth"],
    outlineColor: "#fff" as LabelTarget["outlineColor"],
    fillOpacity: 0.2,
    outlineOpacity: 0.2,
  });
}
```

```ts
  it("writes troika's outline and opacity defaults unless the label sets them", () => {
    const t = target();
    applyLabel(t, { text: "x", position: [0, 0, 0], font: "f", fontSize: 1, color: "#000" });
    expect(t).toMatchObject({ outlineWidth: 0, outlineColor: 0x000000, fillOpacity: 1, outlineOpacity: 1 });
    applyLabel(t, { text: "x", position: [0, 0, 0], font: "f", fontSize: 1, color: "#000", outlineWidth: 0.03, outlineColor: "#05050c", fillOpacity: 0.3 });
    expect(t).toMatchObject({ outlineWidth: 0.03, outlineColor: "#05050c", fillOpacity: 0.3, outlineOpacity: 1 });
  });
```

- [x] **Step 2: Run it to verify it fails**

Run: `bun run test tests/unit/label-props.test.ts`
Expected: FAIL (type errors on the new fields, then `outlineWidth` stays 0.5).

- [x] **Step 3: Implement**

In `src/types/troika-three-text.d.ts`, add to `class Text` after `letterSpacing: number;`:

```ts
    outlineWidth: number | string;
    outlineColor: string | number;
    fillOpacity: number;
    outlineOpacity: number;
```

In `src/experience/fx/labelProps.ts`, add to `BatchedLabel` after `letterSpacing?: number;`:

```ts
  /** Troika outline (world units); 0 draws none. A batch with any outline costs 2 draw calls. */
  outlineWidth?: number;
  outlineColor?: string;
  /** Starting fill opacity; callers may change it per frame through the BatchedLabels handle. */
  fillOpacity?: number;
```

add to `LabelTarget` after `letterSpacing: number;`:

```ts
  outlineWidth: number | string;
  outlineColor: string | number;
  fillOpacity: number;
  outlineOpacity: number;
```

and at the end of `applyLabel` (before the position line):

```ts
  t.outlineWidth = l.outlineWidth ?? 0;
  t.outlineColor = l.outlineColor ?? 0x000000;
  t.fillOpacity = l.fillOpacity ?? 1;
  t.outlineOpacity = 1;
```

Replace `src/experience/fx/BatchedLabels.tsx` with:

```tsx
"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import { MeshBasicMaterial } from "three";
import { BatchedText, Text } from "troika-three-text";
import { applyLabel, type BatchedLabel } from "./labelProps";

/** Live access to a batch: `members[i]` is the troika Text for `labels[i]` (empty until the first commit). */
export interface BatchedLabelsHandle {
  readonly batch: BatchedText;
  readonly members: readonly Text[];
}

/**
 * All labels of a floor in one draw call (two with outlines): a troika `BatchedText` packs every member's
 * glyphs, font, color, opacity and transform (relative to this group) into one mesh. Members cannot
 * billboard on their own, so give each label a fixed `yaw`, or move members per frame through the `ref`
 * handle (set `matrixAutoUpdate = false` and write `matrix`). `toneMapped` matches the labels it replaces
 * (drei Text defaults to tone mapped). Not raycast: make clickable signs point-and-go targets (interact/registry.ts).
 */
export function BatchedLabels({
  labels,
  name = "labels",
  renderOrder,
  toneMapped = false,
  ref,
}: {
  labels: readonly BatchedLabel[];
  name?: string;
  renderOrder?: number;
  toneMapped?: boolean;
  ref?: Ref<BatchedLabelsHandle>;
}) {
  const { batch, base } = useMemo(() => {
    const base = new MeshBasicMaterial({ toneMapped, transparent: true, depthWrite: false });
    const batch = new BatchedText();
    batch.material = base;
    batch.raycast = () => undefined;
    return { batch, base };
  }, [toneMapped]);
  const members = useRef<Text[]>([]);

  useImperativeHandle(ref, () => ({ batch, get members() { return members.current; } }), [batch]);

  useEffect(() => {
    const created = labels.map((label) => {
      const text = new Text();
      applyLabel(text, label);
      batch.addText(text);
      return text;
    });
    members.current = created;
    batch.sync();
    return () => {
      members.current = [];
      for (const text of created) {
        batch.removeText(text);
        text.dispose();
      }
    };
  }, [batch, labels]);

  useEffect(
    () => () => {
      batch.dispose();
      base.dispose();
    },
    [batch, base],
  );

  return <primitive object={batch} name={name} renderOrder={renderOrder ?? 0} />;
}
```

- [x] **Step 4: Run tests, typecheck, lint**

Run: `bun run test tests/unit/label-props.test.ts && bun run typecheck && bun run lint`
Expected: PASS (3 tests); no type or lint errors.

- [x] **Step 5: Screenshot-diff gate (profile `strict`)**

Run: `bun run build && E2E_PORT=4431 bun scripts/visual-gate.ts --base HEAD --profile strict --no-build`
Expected: PASS on every pose (existing batches keep outline 0, fill 1, toneMapped false: nothing may change). Rollback: revert this task's `BatchedLabels.tsx` and `labelProps.ts`.

- [x] **Step 6: Commit**

```bash
rtk git add src/types/troika-three-text.d.ts src/experience/fx/labelProps.ts src/experience/fx/BatchedLabels.tsx tests/unit/label-props.test.ts
rtk git commit -m "feat: BatchedLabels handle, outlines and tone mapping option"
```

---

## Task 7: Batch the L1 stats ring (about 30 calls to 5)

F5.2: the stats ring is 6 billboard tiles x (plate, edges, glow strip, value Text, label Text) = 30 draw calls, the largest single item on L1 (134 of 150 on full, test cap 140). The tiles still face the camera, lift over the rover, shrink away when they would hide it, and count up once; F5.9's per-frame retypeset of the values drops to at most 30 Hz while counting.

**Files:**
- Create: `src/experience/floors/lobby/statsRingLayout.ts`
- Create: `tests/unit/stats-ring-layout.test.ts`
- Modify: `src/experience/floors/lobby/StatsRing.tsx` (whole file)
- Modify: `e2e/gpu.spec.ts`

**Interfaces:**
- Consumes: `BatchedLabels`, `BatchedLabelsHandle`, `BatchedLabel` (Task 6); `LOBBY.statsTile`, `LOBBY.statsRadius` from `config.ts`.
- Produces: `TILE_W`, `TILE_H`, `TILE_Y`, `TILE_STAGGER`, `VALUE_OFFSET`, `LABEL_OFFSET`, `GLOW_OFFSET` (`Matrix4`), `GLOW_SIZE: [number, number]`, `tileAngle(i, n)`, `tileBase(i, n): [number, number, number]`, `boxEdgeVertices(w, h, d): Float32Array`, `TILE_EDGES`, `writeEdges(out, i, m)`, `backToFront(distances): number[]`, `composeTile(out, x, y, z, facing, scale): Matrix4`. The ring's outer group is named `stats-ring`.

- [x] **Step 1: Write the failing test**

Create `tests/unit/stats-ring-layout.test.ts`:

```ts
import { Matrix4, Quaternion, Vector3 } from "three";
import { expect, it } from "vitest";
import { LOBBY } from "@/experience/config";
import { backToFront, boxEdgeVertices, composeTile, TILE_EDGES, TILE_H, TILE_STAGGER, TILE_W, TILE_Y, tileBase, writeEdges } from "@/experience/floors/lobby/statsRingLayout";

it("places tiles on the ring like the old billboards (first at 45 degrees, odd tiles staggered up)", () => {
  const [x, y, z] = tileBase(0, 6);
  expect(x).toBeCloseTo(Math.sin(Math.PI / 4) * LOBBY.statsRadius);
  expect(z).toBeCloseTo(Math.cos(Math.PI / 4) * LOBBY.statsRadius);
  expect(y).toBe(TILE_Y);
  expect(tileBase(1, 6)[1]).toBe(TILE_Y + TILE_STAGGER);
});

it("draws the 12 edges of the tile box", () => {
  const v = boxEdgeVertices(2, 1, 0.01);
  expect(v).toHaveLength(72);
  for (let i = 0; i < v.length; i += 3) {
    expect(Math.abs(v[i])).toBeCloseTo(1);
    expect(Math.abs(v[i + 1])).toBeCloseTo(0.5);
    expect(Math.abs(v[i + 2])).toBeCloseTo(0.005);
  }
  expect(TILE_EDGES).toHaveLength(72);
});

it("writes each tile's edges through its matrix", () => {
  const out = new Float32Array(2 * 72);
  writeEdges(out, 1, new Matrix4().makeTranslation(10, 0, 0));
  expect(out[72]).toBeCloseTo(TILE_EDGES[0] + 10);
  expect(out[73]).toBeCloseTo(TILE_EDGES[1]);
  expect(out[0]).toBe(0);
});

it("sorts tiles far to near for blending", () => {
  expect(backToFront([3, 9, 1, 5])).toEqual([1, 3, 0, 2]);
});

it("collapses a tile that has shrunk away (the old `visible = scale > 0.01`)", () => {
  const m = new Matrix4();
  const s = new Vector3();
  composeTile(m, 1, 2, 3, new Quaternion(), 0.005).decompose(new Vector3(), new Quaternion(), s);
  expect(s.x).toBe(0);
  composeTile(m, 1, 2, 3, new Quaternion(), 0.5).decompose(new Vector3(), new Quaternion(), s);
  expect(s.x).toBeCloseTo(0.5);
  expect(TILE_W).toBe(LOBBY.statsTile.w);
  expect(TILE_H).toBe(LOBBY.statsTile.h);
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `bun run test tests/unit/stats-ring-layout.test.ts`
Expected: FAIL: cannot resolve `@/experience/floors/lobby/statsRingLayout`.

- [x] **Step 3: Implement the layout module**

Create `src/experience/floors/lobby/statsRingLayout.ts`:

```ts
import { Matrix4, Quaternion, Vector3 } from "three";
import { LOBBY } from "../../config";

export const { w: TILE_W, h: TILE_H, y: TILE_Y, stagger: TILE_STAGGER } = LOBBY.statsTile;

/** Offsets inside a tile (x right, y up, z toward the viewer), as the old per-tile meshes had them. */
export const VALUE_OFFSET = new Matrix4().makeTranslation(-TILE_W / 2 + 0.2, TILE_H / 2 - 0.45, 0.02);
export const LABEL_OFFSET = new Matrix4().makeTranslation(-TILE_W / 2 + 0.2, TILE_H / 2 - 0.9, 0.02);
export const GLOW_OFFSET = new Matrix4().makeTranslation(0, TILE_H / 2 - 0.04, 0.012);
export const GLOW_SIZE: [number, number] = [TILE_W - 0.1, 0.06];

export function tileAngle(i: number, n: number): number {
  return (i / n) * Math.PI * 2 + Math.PI / 4;
}

/** Rest position of tile `i` in ring space (before the lift over the rover). */
export function tileBase(i: number, n: number): [number, number, number] {
  const a = tileAngle(i, n);
  return [Math.sin(a) * LOBBY.statsRadius, TILE_Y + (i % 2) * TILE_STAGGER, Math.cos(a) * LOBBY.statsRadius];
}

/** The 12 edges of a w x h x d box as 24 vertices (what `EdgesGeometry(BoxGeometry)` draws for `BoxEdges`). */
export function boxEdgeVertices(w: number, h: number, d: number): Float32Array {
  const [x, y, z] = [w / 2, h / 2, d / 2];
  const c = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
  const pairs = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const out = new Float32Array(72);
  pairs.forEach(([a, b], k) => {
    out.set(c[a], k * 6);
    out.set(c[b], k * 6 + 3);
  });
  return out;
}

export const TILE_EDGES = boxEdgeVertices(TILE_W, TILE_H, 0.01);

const v = new Vector3();
/** Writes tile `i`'s 24 edge vertices, transformed by `m`, into `out` (72 floats per tile). */
export function writeEdges(out: Float32Array, i: number, m: Matrix4): void {
  for (let k = 0; k < 72; k += 3) {
    v.set(TILE_EDGES[k], TILE_EDGES[k + 1], TILE_EDGES[k + 2]).applyMatrix4(m);
    out[i * 72 + k] = v.x;
    out[i * 72 + k + 1] = v.y;
    out[i * 72 + k + 2] = v.z;
  }
}

/** Tile indices far to near, so blended plates draw like separately sorted objects did. */
export function backToFront(distances: readonly number[]): number[] {
  return distances.map((_, i) => i).sort((a, b) => distances[b] - distances[a]);
}

const position = new Vector3();
const size = new Vector3();
/** Ring-space matrix of a tile facing `facing`; scales under 0.01 collapse to nothing (hidden). */
export function composeTile(out: Matrix4, x: number, y: number, z: number, facing: Quaternion, scale: number): Matrix4 {
  return out.compose(position.set(x, y, z), facing, size.setScalar(scale < 0.01 ? 0 : scale));
}
```

- [x] **Step 4: Run it to verify it passes**

Run: `bun run test tests/unit/stats-ring-layout.test.ts`
Expected: PASS (5 tests).

- [x] **Step 5: Rewrite the component**

Replace `src/experience/floors/lobby/StatsRing.tsx` with:

```tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Matrix4, Quaternion, Vector3, type Group, type InstancedMesh, type PerspectiveCamera } from "three";
import type { Text } from "troika-three-text";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { BatchedLabels, type BatchedLabelsHandle } from "../../fx/BatchedLabels";
import { countUp } from "../../fx/countUp";
import type { BatchedLabel } from "../../fx/labelProps";
import { neonColor } from "../../fx/materials";
import { roverRuntime } from "../../rover/runtime";
import { COLORS } from "../../config";
import type { ExperienceData } from "../../types";
import { FONTS } from "../../tower/primitives";
import { backToFront, composeTile, GLOW_OFFSET, GLOW_SIZE, LABEL_OFFSET, TILE_H, TILE_W, TILE_Y, tileBase, VALUE_OFFSET, writeEdges } from "./statsRingLayout";
import { LOBBY } from "../../config";

const ACCENTS = [COLORS.green, COLORS.cyan, COLORS.violet, COLORS.amber, COLORS.pink, "#60a5fa"];
const COUNT_SECONDS = 0.9;
/** Each count-up step retypesets the values; 30 Hz reads the same as every frame and costs half. */
const COUNT_INTERVAL = 1 / 30;
const LIFT = 0.15;
const LIFT_RADIUS = 4;
/** Clock time when the count-up started (once per page load, on the first view of the Lobby). */
let countStart: number | null = null;

function place(text: Text, tile: Matrix4, offset: Matrix4) {
  text.matrixAutoUpdate = false;
  text.matrix.multiplyMatrices(tile, offset);
}

/**
 * Headline stats as floating tiles on a ring around the hologram (appendix 01 section 2). Tiles face
 * the camera, float above the rover and shrink away when they would hide it. Drawn in 5 calls (REPORT
 * F5.2): plates and glow strips are instanced, edges are one line set rewritten per frame, values and
 * labels are two text batches whose members follow the tiles. Plates draw before the hologram
 * (`renderOrder` -3 to -1) and far to near, like the separately sorted tiles did.
 */
export function StatsRing({ stats }: { stats: ExperienceData["stats"] }) {
  const n = stats.length;
  const ring = useRef<Group>(null);
  const plates = useRef<InstancedMesh>(null);
  const glows = useRef<InstancedMesh>(null);
  const values = useRef<BatchedLabelsHandle>(null);
  const labels = useRef<BatchedLabelsHandle>(null);
  const tier = useHQStore((st) => st.tier);
  const frame = useRef({ ys: stats.map((_, i) => tileBase(i, n)[1]), scales: stats.map(() => 1), shown: [] as string[], lastCount: -Infinity, done: false });
  const scratch = useMemo(
    () => ({ ringQ: new Quaternion(), camQ: new Quaternion(), facing: new Quaternion(), part: new Matrix4(), tp: new Vector3(), rp: new Vector3(), dist: new Array<number>(n).fill(0), mats: Array.from({ length: n }, () => new Matrix4()) }),
    [n],
  );

  const valueLabels = useMemo<BatchedLabel[]>(
    () => stats.map((s, i) => ({ text: countStart === null ? countUp(s.value, 0) : s.value, position: [0, 0, 0], font: FONTS.sansBold, fontSize: 0.62, color: ACCENTS[i % ACCENTS.length], anchorX: "left", anchorY: "middle" })),
    [stats],
  );
  const labelLabels = useMemo<BatchedLabel[]>(
    () => stats.map((s) => ({ text: s.label, position: [0, 0, 0], font: FONTS.sans, fontSize: 0.17, color: "#d4d4d8", anchorX: "left", anchorY: "top", lineHeight: 1.35, maxWidth: TILE_W - 0.4 })),
    [stats],
  );

  const edges = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(n * 72), 3).setUsage(DynamicDrawUsage));
    const colors = new Float32Array(n * 72);
    const c = new Color();
    for (let i = 0; i < n; i++) {
      c.copy(neonColor(ACCENTS[i % ACCENTS.length], 1.4, tier));
      for (let k = 0; k < 24; k++) colors.set([c.r, c.g, c.b], i * 72 + k * 3);
    }
    g.setAttribute("color", new BufferAttribute(colors, 3));
    return g;
  }, [n, tier]);
  useEffect(() => () => edges.dispose(), [edges]);

  useLayoutEffect(() => {
    frame.current.shown = valueLabels.map((l) => l.text);
    frame.current.done = false;
  }, [valueLabels]);

  useLayoutEffect(() => {
    const g = glows.current;
    if (!g) return;
    for (let i = 0; i < n; i++) g.setColorAt(i, neonColor(ACCENTS[i % ACCENTS.length], 2, tier));
    if (g.instanceColor) g.instanceColor.needsUpdate = true;
  }, [n, tier]);

  useFrame((state, rawDt) => {
    const r = ring.current;
    const p = plates.current;
    const g = glows.current;
    if (!r || !p || !g) return;
    const dt = Math.min(rawDt, 0.1);
    const s = getHQStore().getState();
    const reduced = s.reducedMotion;
    if (!reduced) {
      r.rotation.y += dt * 0.06;
      r.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.15;
    }
    r.updateWorldMatrix(true, false);

    // Billboard: every tile turns to the camera (drei Billboard: inverse ring rotation times camera rotation).
    const camera = state.camera as PerspectiveCamera;
    const { ringQ, camQ, facing, part, tp, rp, dist, mats } = scratch;
    r.getWorldQuaternion(ringQ);
    camera.getWorldQuaternion(camQ);
    facing.copy(ringQ).invert().multiply(camQ);

    // A tile between the camera and the rover on screen shrinks away, so the rover is never hidden.
    rp.set(roverRuntime.x, roverRuntime.y + 1.4, roverRuntime.z);
    const roverDistance = rp.distanceTo(camera.position);
    rp.project(camera);
    const tanHalf = Math.tan(((camera.fov / 2) * Math.PI) / 180);
    const k = reduced ? 1 : 1 - Math.exp(-dt * 12);
    const f = frame.current;
    for (let i = 0; i < n; i++) {
      const [bx, by, bz] = tileBase(i, n);
      tp.set(bx, f.ys[i], bz).applyMatrix4(r.matrixWorld);
      // Tiles lift a little when the rover drives under them.
      const near = Math.hypot(tp.x - roverRuntime.x, tp.z - roverRuntime.z) < LIFT_RADIUS && Math.abs(tp.y - TILE_Y - roverRuntime.y) < 3;
      f.ys[i] += (by + (near ? LIFT : 0) - f.ys[i]) * k;
      const distance = tp.distanceTo(camera.position);
      dist[i] = distance;
      tp.project(camera);
      // Tile half-size plus the rover's half-size (about 1 u wide, 1.6 u tall), in screen units.
      const halfY = (TILE_H / 2 + 1.6) / (distance * tanHalf);
      const halfX = (TILE_W / 2 + 1.0) / (distance * tanHalf * camera.aspect);
      const covers = distance < roverDistance && Math.abs(tp.x - rp.x) < halfX && Math.abs(tp.y - rp.y) < halfY;
      f.scales[i] += ((covers ? 0.001 : 1) - f.scales[i]) * k;
      composeTile(mats[i], bx, f.ys[i], bz, facing, f.scales[i]);
    }

    backToFront(dist).forEach((i, slot) => p.setMatrixAt(slot, mats[i]));
    p.instanceMatrix.needsUpdate = true;
    const positions = edges.getAttribute("position") as BufferAttribute;
    for (let i = 0; i < n; i++) {
      g.setMatrixAt(i, part.multiplyMatrices(mats[i], GLOW_OFFSET));
      writeEdges(positions.array as Float32Array, i, mats[i]);
    }
    g.instanceMatrix.needsUpdate = true;
    positions.needsUpdate = true;

    const vm = values.current?.members;
    const lm = labels.current?.members;
    if (vm?.length === n && lm?.length === n) {
      for (let i = 0; i < n; i++) {
        place(vm[i], mats[i], VALUE_OFFSET);
        place(lm[i], mats[i], LABEL_OFFSET);
      }
    }

    // Count up from zero the first time the Lobby is explored (instant under reduced motion).
    if (countStart === null && s.floor === "L1" && s.phase === "explore") countStart = state.clock.elapsedTime;
    if (countStart === null || f.done || vm?.length !== n) return;
    const t = state.clock.elapsedTime;
    const progress = reduced ? 1 : Math.min(1, (t - countStart) / COUNT_SECONDS);
    if (progress < 1 && t - f.lastCount < COUNT_INTERVAL) return;
    f.lastCount = t;
    const eased = 1 - Math.pow(1 - progress, 3);
    stats.forEach((stat, i) => {
      const next = countUp(stat.value, eased);
      if (next === f.shown[i]) return;
      f.shown[i] = next;
      vm[i].text = next;
      vm[i].sync();
    });
    if (progress >= 1) f.done = true;
  });

  return (
    <group position={[LOBBY.hologram.x, 0, LOBBY.hologram.z]} name="stats-ring">
      <group ref={ring}>
        <instancedMesh ref={plates} args={[undefined, undefined, n]} frustumCulled={false} renderOrder={-3}>
          <planeGeometry args={[TILE_W, TILE_H]} />
          <meshBasicMaterial color="#0f0f19" transparent opacity={0.86} />
        </instancedMesh>
        <lineSegments geometry={edges} frustumCulled={false} renderOrder={-2}>
          <lineBasicMaterial vertexColors transparent opacity={0.9} toneMapped={false} />
        </lineSegments>
        {/* Accent glow line along the top edge of each tile. */}
        <instancedMesh ref={glows} args={[undefined, undefined, n]} frustumCulled={false}>
          <planeGeometry args={GLOW_SIZE} />
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
        <BatchedLabels ref={values} labels={valueLabels} name="stats-values" renderOrder={-1} />
        <BatchedLabels ref={labels} labels={labelLabels} name="stats-labels" renderOrder={-1} toneMapped />
      </group>
    </group>
  );
}
```

Merge the two `../../config` imports into one line: `import { COLORS, LOBBY } from "../../config";`.

- [x] **Step 6: Write the structure gate**

Append to `e2e/gpu.spec.ts`:

```ts
type SceneWindow = { __hq: { render: { scene: { getObjectByName(name: string): { traverse(cb: (o: { isMesh?: boolean; isLine?: boolean; isPoints?: boolean; visible: boolean }) => void) } | undefined } | null } } };

/** Renderable objects (one draw call each, two for an outlined text batch) under a named group. */
async function renderables(page: Page, name: string) {
  return page.evaluate((name) => {
    let count = 0;
    (window as unknown as SceneWindow).__hq.render.scene?.getObjectByName(name)?.traverse((o) => {
      if (o.visible && (o.isMesh || o.isLine || o.isPoints)) count += 1;
    });
    return count;
  }, name);
}

test("the L1 stats ring draws in 5 objects (full tier)", async ({ page }) => {
  await asReturningVisitor(page);
  await page.goto("/en?tier=full");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  expect(await renderables(page, "stats-ring")).toBe(5);
});
```

- [x] **Step 7: Build and run the L1 specs**

Run: `bun run build && E2E_PORT=4431 bunx playwright test e2e/gpu.spec.ts e2e/highlights.spec.ts e2e/experience.spec.ts --reporter=list`
Expected: all pass; the highlights L1 budget log shows L1 about 25 calls lower than Task 2's numbers (REPORT est. 134 to about 109 full, 115 to about 90 lite). Record both in the PR body.

- [x] **Step 8: Screenshot-diff gate (profile `batching`)**

Run: `E2E_PORT=4431 bun scripts/visual-gate.ts --base HEAD --profile batching --no-build`
Expected: PASS. Thresholds: `l1-spawn` (and `intro-still`, which shows the Lobby) threshold 0.1, maxDiffPixelRatio 0.002 on all three devices (allows sorting differences where two tiles overlap); every other pose strict. Also open `test-results/**/l1-spawn*-diff.png` and confirm any red pixels sit on tile overlaps or text edges only.
Rollback: if the diff shows the tiles over the profile hologram, set the three `renderOrder` values back to `0` and rerun; if counting or lifting looks different on the Mac by eye (`/en?tier=full`, first explore of the session), revert `StatsRing.tsx` to main and keep only `statsRingLayout.ts`.

- [x] **Step 9: Commit**

```bash
rtk git add src/experience/floors/lobby/statsRingLayout.ts src/experience/floors/lobby/StatsRing.tsx tests/unit/stats-ring-layout.test.ts e2e/gpu.spec.ts
rtk git commit -m "perf: L1 stats ring in 5 draw calls instead of 30 (look-preserving)"
```

---

## Task 8: Batch the L2 room labels and signposts

F5.7: L2 typesets about 60 to 165 troika texts on the main thread and draws each outlined label in 2 calls. Room labels (one per career room) and year signposts move into two outlined, tone-mapped batches (4 calls in total); the distance fade keeps working per member. Year digits, floor digits, the prologue line and award placings stay as they are (few, animated or toneMapped false).

**Files:**
- Create: `src/experience/floors/career/labels.ts`
- Create: `tests/unit/career-labels.test.ts`
- Modify: `src/experience/floors/career/CareerRooms.tsx:165-252`
- Modify: `src/experience/floors/career/YearGates.tsx:91-135`
- Modify: `e2e/gpu.spec.ts`

**Interfaces:**
- Consumes: `BatchedLabels`, `BatchedLabelsHandle`, `BatchedLabel` (Task 6); `labelFade`, `CareerRoom`, `CareerRoadLayout`, `CAREER_ROAD` from `career/layout.ts`.
- Produces: `interface LabelSet { labels: BatchedLabel[]; xs: number[] }`; `roomLabelSet(rooms: readonly CareerRoom[], entries: ReadonlyMap<string, CareerEntryView>): LabelSet`; `signpostSet(years: CareerRoadLayout["years"], roomsLabel: (count: number) => string): LabelSet`; `ROOM_LABEL_Y = 4.7`; `useMemberFade(handle: RefObject<BatchedLabelsHandle | null>, xs: readonly number[]): void` (exported from `CareerRooms.tsx`). Group names: `career-room-labels`, `career-signposts`.

- [x] **Step 1: Write the failing test**

Create `tests/unit/career-labels.test.ts`:

```ts
import { expect, it } from "vitest";
import { COLORS } from "@/experience/config";
import { roomLabelSet, ROOM_LABEL_Y, signpostSet } from "@/experience/floors/career/labels";
import { CAREER_ROAD, type CareerRoadLayout, type CareerRoom } from "@/experience/floors/career/layout";
import type { CareerEntryView } from "@/experience/types";

const room = (slug: string, x: number): CareerRoom => ({ id: `L2:${slug}`, slug, type: "job", year: 2024, index: 0, side: 1, center: { x, z: 6 }, w: 7, d: 6 }) as unknown as CareerRoom;
const entry = (slug: string): CareerEntryView => ({ slug, type: "job", role: "Engineer", org: "Acme", period: "2024", prologue: false });

it("builds one outlined, tilted label per room that has an entry, in room order", () => {
  const set = roomLabelSet([room("a", 10), room("b", 30), room("c", 50)], new Map([["a", entry("a")], ["c", entry("c")]]));
  expect(set.xs).toEqual([10, 50]);
  expect(set.labels).toHaveLength(2);
  expect(set.labels[0]).toMatchObject({
    text: "Engineer\nAcme \u00B7 2024",
    position: [10, ROOM_LABEL_Y, 6],
    tilt: 0.55,
    fontSize: 0.4,
    lineHeight: 1.25,
    maxWidth: 7.6,
    outlineWidth: 0.03,
    outlineColor: COLORS.void,
    textAlign: "center",
    color: "#f4f4f5",
    anchorX: "center",
    anchorY: "bottom",
  });
});

it("builds one signpost per year gate, in front of the arch", () => {
  const years = [{ year: 2021, rooms: [1, 2, 3], arch: { center: { x: 5, z: 0 } } }] as unknown as CareerRoadLayout["years"];
  const set = signpostSet(years, (n) => `${n} rooms`);
  expect(set.xs).toEqual([5]);
  expect(set.labels[0]).toMatchObject({
    text: "2021 \u00B7 3 rooms \u2192",
    position: [5, CAREER_ROAD.archHeight - 0.2, CAREER_ROAD.width / 2 + 1.4],
    fontSize: 0.42,
    letterSpacing: 0.06,
    color: COLORS.white,
    outlineWidth: 0.03,
    anchorX: "center",
    anchorY: "top",
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `bun run test tests/unit/career-labels.test.ts`
Expected: FAIL: cannot resolve `@/experience/floors/career/labels`.

- [x] **Step 3: Implement the builders**

Create `src/experience/floors/career/labels.ts`:

```ts
import { COLORS } from "../../config";
import type { BatchedLabel } from "../../fx/labelProps";
import { FONTS } from "../../tower/primitives";
import type { CareerEntryView } from "../../types";
import { CAREER_ROAD, type CareerRoadLayout, type CareerRoom } from "./layout";

/** Labels for one `BatchedLabels` plus the road x of each, for the distance fade. */
export interface LabelSet {
  labels: BatchedLabel[];
  xs: number[];
}

export const ROOM_LABEL_Y = 4.7;

/** One label per career room with an entry: role, then org and period; leans back 0.55 rad toward the rail camera. */
export function roomLabelSet(rooms: readonly CareerRoom[], entries: ReadonlyMap<string, CareerEntryView>): LabelSet {
  const labels: BatchedLabel[] = [];
  const xs: number[] = [];
  for (const room of rooms) {
    const entry = entries.get(room.slug);
    if (!entry) continue;
    xs.push(room.center.x);
    labels.push({
      text: `${entry.role}\n${entry.org} \u00B7 ${entry.period}`,
      position: [room.center.x, ROOM_LABEL_Y, room.center.z],
      tilt: 0.55,
      font: FONTS.sansBold,
      fontSize: 0.4,
      lineHeight: 1.25,
      maxWidth: room.w + 0.6,
      outlineWidth: 0.03,
      outlineColor: COLORS.void,
      textAlign: "center",
      color: "#f4f4f5",
      anchorX: "center",
      anchorY: "bottom",
    });
  }
  return { labels, xs };
}

/** The signpost under each year arch ("2021 · 8 rooms →"). */
export function signpostSet(years: CareerRoadLayout["years"], roomsLabel: (count: number) => string): LabelSet {
  return {
    xs: years.map((y) => y.arch.center.x),
    labels: years.map((y) => ({
      text: `${y.year} \u00B7 ${roomsLabel(y.rooms.length)} \u2192`,
      position: [y.arch.center.x, CAREER_ROAD.archHeight - 0.2, y.arch.center.z + CAREER_ROAD.width / 2 + 1.4],
      font: FONTS.mono,
      fontSize: 0.42,
      letterSpacing: 0.06,
      color: COLORS.white,
      outlineWidth: 0.03,
      outlineColor: COLORS.void,
      anchorX: "center",
      anchorY: "top",
    })),
  };
}
```

- [x] **Step 4: Run it to verify it passes**

Run: `bun run test tests/unit/career-labels.test.ts`
Expected: PASS (2 tests).

- [x] **Step 5: Use the batches**

In `src/experience/floors/career/CareerRooms.tsx`:
1. Change the React import to `import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";` and add:

```tsx
import { BatchedLabels, type BatchedLabelsHandle } from "../../fx/BatchedLabels";
import { roomLabelSet } from "./labels";
```

2. Delete the now unused `const LABEL_Y = 4.7;`.
3. Add after `useLabelFade`:

```tsx
/** The distance fade for members of a `BatchedLabels` (the batch packs each member's opacities every frame). */
export function useMemberFade(handle: RefObject<BatchedLabelsHandle | null>, xs: readonly number[]) {
  useFrame(() => {
    const members = handle.current?.members;
    if (!members || members.length !== xs.length) return;
    xs.forEach((x, i) => {
      const k = labelFade(x - roverRuntime.x);
      const opacity = k > 0.01 ? k : 0;
      members[i].fillOpacity = opacity;
      members[i].outlineOpacity = opacity;
    });
  });
}
```

4. In `CareerRooms`, replace `const xs = useMemo(() => rooms.map((r) => r.center.x), [rooms]);` and `const label = useLabelFade(xs);` with:

```tsx
  const roomLabels = useMemo(() => roomLabelSet(rooms, entries), [rooms, entries]);
  const labelBatch = useRef<BatchedLabelsHandle>(null);
  useMemberFade(labelBatch, roomLabels.xs);
```

5. Replace the whole `{rooms.map((room, i) => { ... <Text ...> ... })}` block with:

```tsx
      <BatchedLabels ref={labelBatch} labels={roomLabels.labels} name="career-room-labels" toneMapped />
```

In `src/experience/floors/career/YearGates.tsx`:
1. Add imports:

```tsx
import { BatchedLabels, type BatchedLabelsHandle } from "../../fx/BatchedLabels";
import { signpostSet } from "./labels";
```

and change `import { useLabelFade } from "./CareerRooms";` to `import { useLabelFade, useMemberFade } from "./CareerRooms";`.
2. Replace the fade setup (`const xs = ...`, `const base = ...`, `const fade = useLabelFade(xs, base);`) with:

```tsx
  // Signposts and floor digits fade with distance like the room labels (the floor runs about 390 u).
  const signposts = useMemo(() => signpostSet(years, roomsLabel), [years, roomsLabel]);
  const signpostBatch = useRef<BatchedLabelsHandle>(null);
  useMemberFade(signpostBatch, signposts.xs);
  const floorXs = useMemo(() => years.map((y) => y.plaza.center.x), [years]);
  const floorBase = useMemo(() => years.map(() => FLOOR_DIGITS_OPACITY), [years]);
  const fade = useLabelFade(floorXs, floorBase);
```

3. Inside the per-year `<group>`, delete the second `<Text ref={fade(2 * i)} ...>{`${y.year} \u00B7 ${roomsLabel(y.rooms.length)} \u2192`}</Text>` block (keep the year digits `Text`).
4. In the floor-digit `Text`, change `ref={fade(2 * i + 1)}` to `ref={fade(i)}`.
5. After the per-year groups, add:

```tsx
      <BatchedLabels ref={signpostBatch} labels={signposts.labels} name="career-signposts" toneMapped />
```

- [x] **Step 6: Write the structure gate**

Append to `e2e/gpu.spec.ts`:

```ts
test("L2 room labels and signposts are batched (full tier)", async ({ page }) => {
  await asReturningVisitor(page);
  await page.goto("/en/journey?tier=full");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  const plainTexts = await page.evaluate(() => {
    let count = 0;
    (window as unknown as SceneWindow).__hq.render.scene?.getObjectByName("career-rooms")?.traverse((o) => {
      const t = o as unknown as { text?: unknown; addText?: unknown };
      if (typeof t.text === "string" && typeof t.addText !== "function") count += 1;
    });
    return count;
  });
  // Only award placings stay plain Text (a handful); every room label is in the batch.
  expect(plainTexts).toBeLessThan(10);
  expect(await renderables(page, "career-room-labels")).toBe(1);
  expect(await renderables(page, "career-signposts")).toBe(1);
});
```

- [x] **Step 7: Build and run the L2 specs**

Run: `bun run build && E2E_PORT=4431 bunx playwright test e2e/gpu.spec.ts e2e/career.spec.ts e2e/pads.spec.ts --reporter=list`
Expected: all pass; career's render budget log shows lower calls on L2 (REPORT: up to 99 full before); the triangle count stays < 30k (the batch draws every glyph quad, about 2 triangles x 2 passes per glyph; expected under 12k extra). Record calls and triangles in the PR body.

- [x] **Step 8: Screenshot-diff gate (profile `batching`)**

Run: `E2E_PORT=4431 bun scripts/visual-gate.ts --base HEAD --profile batching --no-build`
Expected: PASS. Thresholds: `l2-journey` and `ride-up-l1-l2` threshold 0.1, maxDiffPixelRatio 0.002 on all three devices (sorting of the batch against glass and icons); every other pose strict.
Rollback: if labels appear behind glass or icons they used to cover, add `renderOrder={1}` to both career `BatchedLabels` and rerun; if a label's fade differs by eye while driving the road on the Mac, revert `CareerRooms.tsx` and `YearGates.tsx` hunks and keep `labels.ts` for a later attempt.

- [x] **Step 9: Commit**

```bash
rtk git add src/experience/floors/career/labels.ts src/experience/floors/career/CareerRooms.tsx src/experience/floors/career/YearGates.tsx tests/unit/career-labels.test.ts e2e/gpu.spec.ts
rtk git commit -m "perf: batch L2 room labels and year signposts (look-preserving)"
```

---
## Task 9: Intro and ride peaks under 150 (content-visibility rule)

F5.4 and SP9: the e2e budget samples only settled spots, while the intro shows every mounted floor's content (exterior) and a ride shows every floor below the car. One pure rule decides content visibility: during boot and intro only the Lobby shows detail (other floors keep their slab and edges, as silhouettes do today); during a ride a floor below the car shows content only if it is the ride's target or within `RIDE_BELOW_REACH` of the car. The rule is then gated in CI (peaks < 150) and by the screenshot diff on the intro and ride poses.

**Files:**
- Create: `src/experience/tower/visibility.ts`
- Create: `tests/unit/tower-visibility.test.ts`
- Modify: `src/experience/tower/FloorLevel.tsx:37-49`
- Modify: `e2e/gpu.spec.ts` (tighten the Task 2 peak test)

**Interfaces:**
- Consumes: `FLOOR_GAP` from `config.ts`; `renderProbe.peakCalls` (Task 2).
- Produces: `interface VisibilityInput { id: FloorId; floorY: number; roverY: number; exterior: boolean; rideTo: FloorId | null }`; `RIDE_BELOW_REACH: number`; `contentVisible(input: VisibilityInput): boolean`.

- [x] **Step 1: Write the failing test**

Create `tests/unit/tower-visibility.test.ts`:

```ts
import { expect, it } from "vitest";
import { FLOOR_GAP, floorY } from "@/experience/config";
import { contentVisible, RIDE_BELOW_REACH } from "@/experience/tower/visibility";

const at = (id: "L1" | "L2" | "L3" | "L4" | "RF", roverY: number, extra: { exterior?: boolean; rideTo?: "L1" | "L2" | "L3" | "L4" | "RF" | null } = {}) =>
  contentVisible({ id, floorY: floorY(id), roverY, exterior: extra.exterior ?? false, rideTo: extra.rideTo ?? null });

it("shows only the Lobby's detail in the boot and intro exterior (other floors keep slab and edges)", () => {
  expect(at("L1", 0, { exterior: true })).toBe(true);
  expect(at("L2", 0, { exterior: true })).toBe(false);
  expect(at("RF", 0, { exterior: true })).toBe(false);
});

it("explore: the rover's floor shows, floors above and below do not (unchanged)", () => {
  expect(at("L2", floorY("L2"))).toBe(true);
  expect(at("L3", floorY("L2"))).toBe(false);
  expect(at("L1", floorY("L2"))).toBe(false);
});

it("ride: the target floor below always shows", () => {
  expect(at("L1", floorY("RF"), { rideTo: "L1" })).toBe(true);
});

it("ride: a passing floor below shows only within reach of the car", () => {
  expect(at("L2", floorY("RF"), { rideTo: "L1" })).toBe(false);
  expect(at("L2", floorY("L2") + RIDE_BELOW_REACH - 0.1, { rideTo: "L1" })).toBe(true);
  expect(at("L4", floorY("RF"), { rideTo: "L1" })).toBe(RIDE_BELOW_REACH >= FLOOR_GAP);
});

it("ride: floors above the car stay hidden until the car reaches them", () => {
  expect(at("L2", floorY("L1") + 3, { rideTo: "L2" })).toBe(false);
  expect(at("L2", floorY("L2") - 0.4, { rideTo: "L2" })).toBe(true);
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `bun run test tests/unit/tower-visibility.test.ts`
Expected: FAIL: cannot resolve `@/experience/tower/visibility`.

- [x] **Step 3: Implement the rule**

Create `src/experience/tower/visibility.ts`:

```ts
import type { FloorId } from "@/content/schema";
import { FLOOR_GAP } from "../config";

export interface VisibilityInput {
  id: FloorId;
  floorY: number;
  roverY: number;
  /** Boot and intro: the exterior orbit around the tower. */
  exterior: boolean;
  /** Target floor of the running ride, if any. */
  rideTo: FloorId | null;
}

/** How far below the car a passing floor still shows its content during a ride. */
export const RIDE_BELOW_REACH = FLOOR_GAP;

/**
 * Whether a floor's content group draws this frame (its slab and edges always do). Keeps intro and
 * ride peaks under the 150-call budget (REPORT F5.4): the exterior shows the Lobby's detail only,
 * a ride shows its target and the floors right under the car, and floors above the rover are ghosts.
 */
export function contentVisible({ id, floorY, roverY, exterior, rideTo }: VisibilityInput): boolean {
  if (exterior) return id === "L1";
  if (floorY > roverY + 0.5) return false;
  if (floorY < roverY - 0.5) {
    if (!rideTo) return false;
    return id === rideTo || roverY - floorY <= RIDE_BELOW_REACH;
  }
  return true;
}
```

- [x] **Step 4: Run it to verify it passes**

Run: `bun run test tests/unit/tower-visibility.test.ts`
Expected: PASS (5 tests).

- [x] **Step 5: Use it in FloorLevel**

In `src/experience/tower/FloorLevel.tsx`, add `import { contentVisible } from "./visibility";` and replace the `useFrame` body with:

```tsx
  useFrame(() => {
    const { phase, ride } = getHQStore().getState();
    const exterior = phase === "boot" || phase === "intro";
    const above = !exterior && y > roverRuntime.y + 0.5;
    if (fill.current) {
      fill.current.opacity = above ? GHOST : SOLID;
      fill.current.depthWrite = !above;
    }
    if (edge.current) edge.current.opacity = above ? 0.16 : 0.95;
    if (content.current) content.current.visible = contentVisible({ id: layout.id, floorY: y, roverY: roverRuntime.y, exterior, rideTo: ride?.to ?? null });
  });
```

- [x] **Step 6: Turn the peak measurement into a gate**

In `e2e/gpu.spec.ts`, in the test "intro and ride draw-call peaks (full tier)", replace the final loop with:

```ts
  for (const [name, value] of Object.entries(peaks)) expect(value, `${name} peak (all render passes)`).toBeLessThan(150);
```

- [x] **Step 7: Build and run**

Run: `bun run build && E2E_PORT=4431 bunx playwright test e2e/gpu.spec.ts -g "peaks" --reporter=list`
Expected: PASS with every peak < 150. If a one-floor ascent (`L1-L2` or `L2-L1`) is still >= 150, set `RIDE_BELOW_REACH = FLOOR_GAP / 2` in `visibility.ts` (the source floor stops drawing once the car is halfway up; the unit tests are written against the constant, so they still pass), rebuild and rerun. If the intro is >= 150, the Lobby alone is too dense in the exterior: the stats ring from Task 7 is the lever already pulled, so record the number and open an issue instead of hiding Lobby content (the intro look is fixed).

- [x] **Step 8: Screenshot-diff gate (profile `batching`)**

Run: `E2E_PORT=4431 bun scripts/visual-gate.ts --base HEAD --profile batching --no-build`
Expected: PASS. Thresholds: `intro-still`, `ride-up-l1-l2`, `ride-down-rf-l1` threshold 0.1, maxDiffPixelRatio 0.002 (the L2 shell's grid and pad glows fade out of the far exterior; a passing floor 42 u below the car sits deep in fog); settled poses strict (the rule does not change explore).
Rollback: if `intro-still` fails, change the exterior line to `if (exterior) return id === "L1" || id === "L2";` (keeps the L2 shell, which is only 3 to 5 calls) and rerun; if a ride pose fails, set `RIDE_BELOW_REACH = Infinity` (today's behaviour) and record the measured peak instead.

- [x] **Step 9: Commit**

```bash
rtk git add src/experience/tower/visibility.ts src/experience/tower/FloorLevel.tsx tests/unit/tower-visibility.test.ts e2e/gpu.spec.ts
rtk git commit -m "perf: keep intro and ride draw-call peaks under 150"
```

---

## Task 10: General precompile utility and program pins (the API for P6)

F5.6 and SP9: nothing precompiles, and three releases a program as soon as the last material using it is disposed, so every floor unmount throws away its unique programs and the next visit recompiles them (slow under ANGLE/Direct3D on Windows). This task adds the general utility P6 calls during the ride's `boarding`/`closing`: compile a subtree for the target it is drawn into (composer input on full, canvas on lite), wait without blocking where `KHR_parallel_shader_compile` exists, and pin every new program with a tiny never-rendered clone so it survives unmounts.

Note for three r186: `WebGLRenderer.compile` walks every child (`scene.traverse`, hidden ones too) and only gathers lights from visible objects, so hidden neighbour content compiles without toggling `visible`.

**Files:**
- Create: `src/experience/scene/programPins.ts`
- Create: `src/experience/scene/precompile.ts`
- Create: `src/experience/scene/warmState.ts`
- Create: `src/experience/tower/floorRegistry.ts`
- Create: `tests/helpers/fake-renderer.ts`
- Create: `tests/unit/program-pins.test.ts`
- Create: `tests/unit/precompile.test.ts`
- Modify: `src/experience/tower/FloorLevel.tsx` (register the content group)
- Modify: `src/experience/Experience.tsx` (clear pins and warm state on unmount)

**Interfaces:**
- Consumes: `renderProbe.gl/scene/camera` (Task 2), `sceneTarget()` (Task 3).
- Produces: `pinGeometry(src: BufferGeometry): BufferGeometry | null`, `pinMaterial(src: Material): Material | null`, `pinObject(src: Object3D, material: Material): Object3D | null`, `programPins { group: Group; keys: Set<string>; misses: number; pinFrom(gl, root, camera, scene, target): number; clear(): void }`.
- Produces: `PrecompileOptions { target?: WebGLRenderTarget | null; timeoutMs?: number; pin?: boolean }`, `PrecompileReport`, `FloorPrecompileReport`, `precompileObject(gl, object, camera, scene, options?)`, `precompileFloor(id, options?)`, `precompileScene(options?)` (signatures in "Interfaces handed to other workstreams").
- Produces: `isFloorWarm(id)`, `markWarm(id)`, `resetWarm()`; `registerFloorContent(id, group | null)`, `getFloorContent(id)`, `FLOOR_ROOT: Record<FloorId, string>`.

- [x] **Step 1: Write the failing tests**

Create `tests/helpers/fake-renderer.ts` (helpers are not collected as tests, `vitest.config.mts` includes only `*.test.ts`):

```ts
import type { InstancedMesh, Material, Mesh, Object3D } from "three";

/** Stand-in renderer: a program key from material type, side, instancing and the bound target, like three's cache key in spirit. */
export function fakeRenderer({ ready = true }: { ready?: boolean } = {}) {
  const props = new WeakMap<object, { currentProgram?: { cacheKey: string; isReady: () => boolean } }>();
  let target: unknown = null;
  const targets: unknown[] = [];
  const gl = {
    properties: {
      get(m: object) {
        let p = props.get(m);
        if (!p) props.set(m, (p = {}));
        return p;
      },
    },
    getRenderTarget: () => target,
    setRenderTarget(t: unknown) {
      target = t;
      targets.push(t);
    },
    compile(root: Object3D) {
      const set = new Set<Material>();
      root.traverse((o) => {
        const m = (o as Mesh).material as Material | undefined;
        if (!m || Array.isArray(m)) return;
        gl.properties.get(m).currentProgram = { cacheKey: `${m.type}:${(o as InstancedMesh).isInstancedMesh ? "i" : "m"}:${m.side}:${String(target)}`, isReady: () => ready };
        set.add(m);
      });
      return set;
    },
    info: { programs: [] as unknown[] },
    extensions: { has: () => ready },
    targets,
  };
  return gl;
}
```

Create `tests/unit/program-pins.test.ts`:

```ts
import { BoxGeometry, BufferAttribute, BufferGeometry, DoubleSide, Group, InstancedBufferAttribute, InstancedMesh, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Points, PointsMaterial, ShaderMaterial, Texture, type WebGLRenderer } from "three";
import { afterEach, describe, expect, it } from "vitest";
import { pinGeometry, pinMaterial, pinObject, programPins } from "@/experience/scene/programPins";
import { fakeRenderer } from "../helpers/fake-renderer";

afterEach(() => programPins.clear());

describe("pin parts", () => {
  it("keeps only the attributes that shape a program", () => {
    const src = new BoxGeometry();
    src.setAttribute("color", new BufferAttribute(new Float32Array(src.attributes.position.count * 4), 4));
    const g = pinGeometry(src)!;
    expect(Object.keys(g.attributes).sort()).toEqual(["color", "normal", "position", "uv"]);
    expect(g.getAttribute("color").itemSize).toBe(4);
    const morph = new BufferGeometry();
    morph.morphAttributes.position = [new BufferAttribute(new Float32Array(3), 3)];
    expect(pinGeometry(morph)).toBeNull();
  });

  it("clones materials without holding their textures", () => {
    const map = new Texture();
    map.channel = 1;
    const basic = pinMaterial(new MeshBasicMaterial({ map, transparent: true, side: DoubleSide, toneMapped: false }))! as MeshBasicMaterial;
    expect(basic.map).not.toBe(map);
    expect(basic.map?.channel).toBe(1);
    expect(basic).toMatchObject({ transparent: true, side: DoubleSide, toneMapped: false });
    const shader = pinMaterial(new ShaderMaterial({ uniforms: { uMap: { value: map }, uTime: { value: 2 } }, vertexShader: "void main(){}", fragmentShader: "void main(){}" }))! as ShaderMaterial;
    expect(shader.uniforms.uMap.value).toBeNull();
    expect(shader.uniforms.uTime.value).toBe(2);
  });

  it("mirrors the object kind, including instance colors", () => {
    const inst = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 4);
    inst.instanceColor = new InstancedBufferAttribute(new Float32Array(12), 3);
    const pin = pinObject(inst, new MeshBasicMaterial()) as InstancedMesh;
    expect(pin.isInstancedMesh).toBe(true);
    expect(pin.count).toBe(1);
    expect(pin.instanceColor).not.toBeNull();
    expect((pinObject(new LineSegments(new BufferGeometry().setAttribute("position", new BufferAttribute(new Float32Array(6), 3)), new LineBasicMaterial()), new LineBasicMaterial()) as LineSegments).isLineSegments).toBe(true);
    expect((pinObject(new Points(new BoxGeometry(), new PointsMaterial()), new PointsMaterial()) as Points).isPoints).toBe(true);
  });
});

describe("programPins.pinFrom", () => {
  it("pins each new program once and keeps it after the source is gone", () => {
    const gl = fakeRenderer();
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()), new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
    gl.compile(root);
    const pinned = programPins.pinFrom(gl as unknown as WebGLRenderer, root, {} as never, {} as never, null);
    expect(pinned).toBe(1);
    expect(programPins.group.children).toHaveLength(1);
    expect(programPins.pinFrom(gl as unknown as WebGLRenderer, root, {} as never, {} as never, null)).toBe(0);
  });

  it("binds the target while compiling pins and restores the previous one", () => {
    const gl = fakeRenderer();
    const root = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    gl.setRenderTarget("composer");
    gl.compile(root);
    gl.setRenderTarget(null);
    programPins.pinFrom(gl as unknown as WebGLRenderer, root, {} as never, {} as never, "composer" as never);
    expect(gl.getRenderTarget()).toBeNull();
    expect(programPins.keys.size).toBe(1);
  });
});
```

Create `tests/unit/precompile.test.ts`:

```ts
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, type WebGLRenderer } from "three";
import { afterEach, expect, it } from "vitest";
import { precompileFloor, precompileObject } from "@/experience/scene/precompile";
import { programPins } from "@/experience/scene/programPins";
import { renderProbe } from "@/experience/scene/renderProbe";
import { isFloorWarm, resetWarm } from "@/experience/scene/warmState";
import { FLOOR_ROOT, registerFloorContent } from "@/experience/tower/floorRegistry";
import { fakeRenderer } from "../helpers/fake-renderer";

afterEach(() => {
  programPins.clear();
  resetWarm();
  registerFloorContent("L3", null);
  renderProbe.gl = null;
  renderProbe.scene = null;
  renderProbe.camera = null;
});

it("compiles for the given target, restores the previous one and pins", async () => {
  const gl = fakeRenderer();
  gl.setRenderTarget("canvas-before");
  const root = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  const report = await precompileObject(gl as unknown as WebGLRenderer, root, {} as never, {} as never, { target: "composer" as never });
  expect(gl.targets).toContain("composer");
  expect(gl.getRenderTarget()).toBe("canvas-before");
  expect(report).toMatchObject({ materials: 1, pinned: 1, parallel: true, timedOut: false });
});

it("gives up waiting after the timeout (programs keep compiling in the driver)", async () => {
  const gl = fakeRenderer({ ready: false });
  const report = await precompileObject(gl as unknown as WebGLRenderer, new Mesh(new BoxGeometry(), new MeshBasicMaterial()), {} as never, {} as never, { target: null, timeoutMs: 30, pin: false });
  expect(report.timedOut).toBe(true);
  expect(report.pinned).toBe(0);
});

it("marks a floor warm only when its main content was mounted", async () => {
  const gl = fakeRenderer();
  renderProbe.gl = gl as unknown as WebGLRenderer;
  renderProbe.scene = {} as never;
  renderProbe.camera = {} as never;
  expect(await precompileFloor("L3")).toBeNull();
  const content = new Group();
  content.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
  registerFloorContent("L3", content);
  const shell = await precompileFloor("L3");
  expect(shell).toMatchObject({ floor: "L3", contentMounted: false });
  expect(isFloorWarm("L3")).toBe(false);
  const labs = new Group();
  labs.name = FLOOR_ROOT.L3;
  labs.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial({ transparent: true })));
  content.add(labs);
  expect(await precompileFloor("L3")).toMatchObject({ contentMounted: true });
  expect(isFloorWarm("L3")).toBe(true);
});
```

- [x] **Step 2: Run them to verify they fail**

Run: `bun run test tests/unit/program-pins.test.ts tests/unit/precompile.test.ts`
Expected: FAIL: cannot resolve `@/experience/scene/programPins`, `precompile`, `warmState`, `@/experience/tower/floorRegistry`.

- [x] **Step 3: Implement the registry and warm state**

Create `src/experience/tower/floorRegistry.ts`:

```ts
import type { Group } from "three";
import type { FloorId } from "@/content/schema";

/** Name of each floor component's root group (Lobby, CareerArchive, Labs, Library, Roof). */
export const FLOOR_ROOT: Record<FloorId, string> = { L1: "lobby", L2: "career-archive", L3: "labs", L4: "library", RF: "roof" };

const groups = new Map<FloorId, Group>();

/** FloorLevel registers its content group (always present; children only while the floor is near). */
export function registerFloorContent(id: FloorId, group: Group | null): void {
  if (group) groups.set(id, group);
  else groups.delete(id);
}

export function getFloorContent(id: FloorId): Group | null {
  return groups.get(id) ?? null;
}
```

Create `src/experience/scene/warmState.ts`:

```ts
import type { FloorId } from "@/content/schema";

const warm = new Set<FloorId>();

/** True once every program of the floor's main content was compiled and pinned this session. */
export function isFloorWarm(id: FloorId): boolean {
  return warm.has(id);
}

export function markWarm(id: FloorId): void {
  warm.add(id);
}

export function resetWarm(): void {
  warm.clear();
}
```

- [x] **Step 4: Implement the pins**

Create `src/experience/scene/programPins.ts`:

```ts
import { BufferAttribute, BufferGeometry, Group, InstancedBufferAttribute, InstancedMesh, Line, LineLoop, LineSegments, Mesh, Points, Sprite, Texture, type Camera, type Material, type Object3D, type Scene, type SpriteMaterial, type WebGLRenderer, type WebGLRenderTarget } from "three";

const TEXTURE_SLOTS = ["map", "alphaMap", "aoMap", "lightMap", "bumpMap", "normalMap", "displacementMap", "emissiveMap", "specularMap", "roughnessMap", "metalnessMap", "gradientMap", "matcap"] as const;
/** Geometry attributes whose presence or size changes a program (vertex alphas, extra UV channels, tangents). */
const PROGRAM_ATTRIBUTES = ["normal", "uv", "uv1", "uv2", "uv3", "color", "tangent"] as const;

type Renderable = Object3D & {
  material?: Material | Material[];
  geometry?: BufferGeometry;
  instanceColor?: InstancedBufferAttribute | null;
  isMesh?: boolean;
  isInstancedMesh?: boolean;
  isBatchedMesh?: boolean;
  isSkinnedMesh?: boolean;
  isPoints?: boolean;
  isLine?: boolean;
  isLineSegments?: boolean;
  isLineLoop?: boolean;
  isSprite?: boolean;
};

/** A one-vertex geometry with the same program-shaping attributes; null for morphed geometry (not used here). */
export function pinGeometry(src: BufferGeometry): BufferGeometry | null {
  if (Object.keys(src.morphAttributes).length > 0) return null;
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(3), 3));
  for (const name of PROGRAM_ATTRIBUTES) {
    const a = src.getAttribute(name);
    if (a) g.setAttribute(name, new BufferAttribute(new Float32Array(a.itemSize), a.itemSize));
  }
  return g;
}

function placeholder(src: Texture): Texture {
  const t = new Texture();
  t.channel = src.channel;
  t.colorSpace = src.colorSpace;
  t.mapping = src.mapping;
  return t;
}

/** A clone with the same program parameters that holds no texture images (so unmounted floors free their canvases). */
export function pinMaterial(src: Material): Material | null {
  if ((src as { envMap?: Texture | null }).envMap) return null;
  const m = src.clone();
  const slots = m as unknown as Record<string, unknown>;
  for (const key of TEXTURE_SLOTS) {
    const t = slots[key];
    if (t instanceof Texture) slots[key] = placeholder(t);
  }
  const uniforms = (m as { uniforms?: Record<string, { value: unknown }> }).uniforms;
  if (uniforms) {
    for (const u of Object.values(uniforms)) {
      try {
        if (u.value instanceof Texture) u.value = null;
      } catch {
        // read-only uniform (derived materials): the verification in pinFrom drops it if it matters
      }
    }
  }
  return m;
}

/** An object of the same kind as `src` (instancing and instance colors change the program). */
export function pinObject(src: Object3D, material: Material): Object3D | null {
  const s = src as Renderable;
  if (s.isBatchedMesh || s.isSkinnedMesh) return null;
  if (s.isSprite) return new Sprite(material as SpriteMaterial);
  const geometry = s.geometry ? pinGeometry(s.geometry) : null;
  if (!geometry) return null;
  if (s.isInstancedMesh) {
    const pin = new InstancedMesh(geometry, material, 1);
    if (s.instanceColor) pin.instanceColor = new InstancedBufferAttribute(new Float32Array(3), 3);
    return pin;
  }
  if (s.isPoints) return new Points(geometry, material);
  if (s.isLineSegments) return new LineSegments(geometry, material);
  if (s.isLineLoop) return new LineLoop(geometry, material);
  if (s.isLine) return new Line(geometry, material);
  if (s.isMesh) return new Mesh(geometry, material);
  return null;
}

const keyOf = (gl: WebGLRenderer, m: Material): string | null => (gl.properties.get(m) as { currentProgram?: { cacheKey: string } }).currentProgram?.cacheKey ?? null;

function disposePin(pin: Object3D) {
  const p = pin as Renderable;
  if (!p.isSprite) p.geometry?.dispose();
  for (const m of Array.isArray(p.material) ? p.material : p.material ? [p.material] : []) m.dispose();
}

/**
 * Keeps shader programs alive after the floor that needed them unmounts: three deletes a program when
 * its last material is disposed, so a revisit would compile again. Each pin is a tiny clone that is
 * compiled once and never rendered or uploaded (no geometry or texture memory); a pin is kept only if
 * its program key matches the source's exactly.
 */
export const programPins = {
  group: new Group(),
  keys: new Set<string>(),
  misses: 0,
  pinFrom(gl: WebGLRenderer, root: Object3D, camera: Camera, scene: Scene, target: WebGLRenderTarget | null): number {
    const fresh: { pin: Object3D; key: string }[] = [];
    root.traverse((object) => {
      const o = object as Renderable;
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.material) return;
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
        const key = keyOf(gl, material);
        if (!key || this.keys.has(key) || fresh.some((f) => f.key === key)) continue;
        const clone = pinMaterial(material);
        const pin = clone ? pinObject(o, clone) : null;
        if (!pin) {
          clone?.dispose();
          this.misses += 1;
          continue;
        }
        fresh.push({ pin, key });
      }
    });
    if (fresh.length === 0) return 0;
    const batch = new Group();
    for (const f of fresh) batch.add(f.pin);
    const previous = gl.getRenderTarget();
    gl.setRenderTarget(target);
    try {
      gl.compile(batch, camera, scene);
    } finally {
      gl.setRenderTarget(previous);
    }
    let pinned = 0;
    for (const { pin, key } of fresh) {
      if (keyOf(gl, (pin as Renderable).material as Material) === key) {
        this.keys.add(key);
        this.group.add(pin);
        pinned += 1;
      } else {
        batch.remove(pin);
        disposePin(pin);
        this.misses += 1;
      }
    }
    return pinned;
  },
  clear(): void {
    for (const pin of [...this.group.children]) {
      this.group.remove(pin);
      disposePin(pin);
    }
    this.keys.clear();
    this.misses = 0;
  },
};
```

- [x] **Step 5: Implement the precompile API**

Create `src/experience/scene/precompile.ts`:

```ts
import type { Camera, Material, Object3D, Scene, WebGLRenderer, WebGLRenderTarget } from "three";
import type { FloorId } from "@/content/schema";
import { FLOOR_ROOT, getFloorContent } from "../tower/floorRegistry";
import { sceneTarget } from "./postHandle";
import { programPins } from "./programPins";
import { renderProbe } from "./renderProbe";
import { markWarm } from "./warmState";

export interface PrecompileOptions {
  /** Target the object is drawn into; defaults to `sceneTarget()` (composer input on full, canvas on lite). */
  target?: WebGLRenderTarget | null;
  /** Stop waiting after this long (ms, default 2000); programs keep compiling in the driver. */
  timeoutMs?: number;
  /** Pin new programs so they survive unmounts (default true). */
  pin?: boolean;
}

export interface PrecompileReport {
  materials: number;
  programsBefore: number;
  programsAfter: number;
  pinned: number;
  ms: number;
  /** `KHR_parallel_shader_compile` present: waiting did not block the main thread. */
  parallel: boolean;
  timedOut: boolean;
}

export interface FloorPrecompileReport extends PrecompileReport {
  floor: FloorId;
  /** The floor's main component (FLOOR_ROOT) was mounted, so the floor is now warm. */
  contentMounted: boolean;
}

type ProgramLike = { isReady?: () => boolean };

function waitReady(gl: WebGLRenderer, materials: Set<Material>, timeoutMs: number): Promise<boolean> {
  const pending = new Set(materials);
  const deadline = performance.now() + timeoutMs;
  return new Promise((resolve) => {
    const check = () => {
      for (const m of pending) {
        const program = (gl.properties.get(m) as { currentProgram?: ProgramLike }).currentProgram;
        if (!program?.isReady || program.isReady()) pending.delete(m);
      }
      if (pending.size === 0) return resolve(true);
      if (performance.now() >= deadline) return resolve(false);
      setTimeout(check, 10);
    };
    check();
  });
}

/**
 * Compiles every program `object` needs (hidden children too) for the target it will be drawn into,
 * then waits until the driver reports them linked (non-blocking with KHR_parallel_shader_compile) and
 * pins them. Never draws. The general utility behind boot warm-up (ProgramWarmup) and P6's ride prepare.
 */
export async function precompileObject(gl: WebGLRenderer, object: Object3D, camera: Camera, scene: Scene, options: PrecompileOptions = {}): Promise<PrecompileReport> {
  const start = performance.now();
  const programsBefore = gl.info.programs?.length ?? 0;
  const target = options.target === undefined ? sceneTarget() : options.target;
  const previous = gl.getRenderTarget();
  let materials: Set<Material>;
  gl.setRenderTarget(target);
  try {
    materials = gl.compile(object, camera, scene);
  } finally {
    gl.setRenderTarget(previous);
  }
  const parallel = gl.extensions.has("KHR_parallel_shader_compile");
  const ready = await waitReady(gl, materials, options.timeoutMs ?? 2000);
  const pinned = options.pin === false ? 0 : programPins.pinFrom(gl, object, camera, scene, target);
  return { materials: materials.size, programsBefore, programsAfter: gl.info.programs?.length ?? 0, pinned, ms: Math.round(performance.now() - start), parallel, timedOut: !ready };
}

/** Precompiles a floor's mounted content (see the P6 contract in the P2 plan). Null without a renderer or content. */
export async function precompileFloor(id: FloorId, options: Omit<PrecompileOptions, "target"> = {}): Promise<FloorPrecompileReport | null> {
  const { gl, camera, scene } = renderProbe;
  const content = getFloorContent(id);
  if (!gl || !camera || !scene || !content) return null;
  const contentMounted = Boolean(content.getObjectByName(FLOOR_ROOT[id]));
  const report = await precompileObject(gl, content, camera, scene, options);
  if (contentMounted && !report.timedOut) markWarm(id);
  return { ...report, floor: id, contentMounted };
}

/** Precompiles everything mounted now (boot: the Lobby, hidden neighbours, rover, HUD-in-world). */
export async function precompileScene(options: Omit<PrecompileOptions, "target"> = {}): Promise<PrecompileReport | null> {
  const { gl, camera, scene } = renderProbe;
  if (!gl || !camera || !scene) return null;
  return precompileObject(gl, scene, camera, scene, options);
}
```

- [x] **Step 6: Run the tests to verify they pass**

Run: `bun run test tests/unit/program-pins.test.ts tests/unit/precompile.test.ts`
Expected: PASS (5 + 3 tests).

- [x] **Step 7: Register floor content and clean up**

In `src/experience/tower/FloorLevel.tsx`, change the React import to `import { useEffect, useMemo, useRef, type ReactNode } from "react";`, add `import { registerFloorContent } from "./floorRegistry";`, and after the `useFrame` block:

```tsx
  useEffect(() => {
    registerFloorContent(layout.id, content.current);
    return () => registerFloorContent(layout.id, null);
  }, [layout.id]);
```

In `src/experience/Experience.tsx`, add imports `import { programPins } from "./scene/programPins";` and `import { resetWarm } from "./scene/warmState";`, and extend the cleanup effect from Task 2:

```tsx
  useEffect(
    () => () => {
      renderProbe.gl = null;
      renderProbe.scene = null;
      renderProbe.camera = null;
      // A new canvas is a new WebGL context: pins and warm floors belong to the old one.
      programPins.clear();
      resetWarm();
    },
    [],
  );
```

- [x] **Step 8: Typecheck, lint, all unit tests**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: PASS (the new helper in `tests/helpers/` is not collected as a test file).

- [x] **Step 9: Commit**

```bash
rtk git add src/experience/scene/programPins.ts src/experience/scene/precompile.ts src/experience/scene/warmState.ts src/experience/tower/floorRegistry.ts src/experience/tower/FloorLevel.tsx src/experience/Experience.tsx tests/unit/program-pins.test.ts tests/unit/precompile.test.ts tests/helpers/fake-renderer.ts
rtk git commit -m "feat: general shader precompile utility with program pins (API for the ride prepare step)"
```

---
## Task 11: Precompile during boot and the 2.5 s intro

plan.md's ride diagnosis: first visits to a floor compile its programs (and typeset its text) on the ride's critical frames. This task warms programs before the visitor can ride: one whole-scene compile right after the first frame (the Lobby, hidden neighbours, rover), neighbour content compiled on idle as soon as it mounts, and during the boot phase (the camera is still, the visitor reads the boot card) each other floor is mounted hidden, compiled and pinned, then unmounted again. Nothing new mounts during the intro orbit. Returning sessions skip boot, so P6's ride prepare covers them with the same `precompileFloor`.

**Files:**
- Modify: `src/experience/scene/warmState.ts`
- Create: `tests/unit/warm-state.test.ts`
- Modify: `src/experience/tower/near.ts`
- Modify: `tests/unit/tower-near.test.ts`
- Modify: `src/experience/tower/Tower.tsx:65-69`
- Modify: `src/experience/floors/CareerArchive.tsx:20`
- Modify: `src/experience/tower/FloorLevel.tsx` (precompile neighbours on mount)
- Create: `src/experience/scene/ProgramWarmup.tsx`
- Modify: `src/experience/scene/Scene.tsx`
- Modify: `src/experience/scene/renderProbe.ts` (`warmFloors()`)
- Modify: `e2e/gpu.spec.ts`

**Interfaces:**
- Consumes: `precompileFloor`, `precompileScene` (Task 10); `isFloorWarm`, `markWarm` (Task 10); `contentVisible` (Task 9, which already hides every non-Lobby floor in the exterior).
- Produces: `warmingFloor { get(): FloorId | null; set(id: FloorId | null): void; subscribe(l): () => void }`, `useWarmingFloor(): FloorId | null`, `warmQueue(current: FloorId): FloorId[]`, `listWarm(): FloorId[]`; `nearFloors(floor, target, exterior, reach = 1, warm: FloorId | null = null)`; `ProgramWarmup({ tier })`, `STAGED_WARM_TIERS`; `renderProbe.warmFloors(): string[]`.

- [x] **Step 1: Write the failing tests**

Create `tests/unit/warm-state.test.ts`:

```ts
import { afterEach, expect, it, vi } from "vitest";
import { listWarm, markWarm, resetWarm, warmingFloor, warmQueue } from "@/experience/scene/warmState";

afterEach(() => {
  resetWarm();
  warmingFloor.set(null);
});

it("warms the other floors in likely visiting order, skipping warm ones", () => {
  expect(warmQueue("L1")).toEqual(["L3", "L2", "RF", "L4"]);
  markWarm("L3");
  expect(warmQueue("L1")).toEqual(["L2", "RF", "L4"]);
  expect(listWarm()).toEqual(["L3"]);
});

it("notifies only on a change of the warming floor", () => {
  const listener = vi.fn();
  const off = warmingFloor.subscribe(listener);
  warmingFloor.set("L2");
  warmingFloor.set("L2");
  warmingFloor.set(null);
  expect(listener).toHaveBeenCalledTimes(2);
  off();
});
```

Append to `tests/unit/tower-near.test.ts`:

```ts
it("adds the floor being warmed during boot", () => {
  expect(nearFloors("L1", null, true, 1, "RF")).toEqual(["L1", "L2", "RF"]);
  expect(nearFloors("L1", null, true, 0, "L4")).toEqual(["L1", "L4"]);
  expect(nearFloors("L1", null, true, 1, null)).toEqual(["L1", "L2"]);
});
```

- [x] **Step 2: Run them to verify they fail**

Run: `bun run test tests/unit/warm-state.test.ts tests/unit/tower-near.test.ts`
Expected: FAIL: `warmQueue`, `listWarm`, `warmingFloor` not exported; `nearFloors` ignores the 5th argument.

- [x] **Step 3: Implement**

Append to `src/experience/scene/warmState.ts` (and add `import { useSyncExternalStore } from "react";` at the top):

```ts
export function listWarm(): FloorId[] {
  return [...warm];
}

/** Boot warm-up order: the most visited floors first (Work, Journey, About, Writing). */
const WARM_ORDER: readonly FloorId[] = ["L3", "L2", "RF", "L4", "L1"];

export function warmQueue(current: FloorId): FloorId[] {
  return WARM_ORDER.filter((id) => id !== current && !warm.has(id));
}

let warming: FloorId | null = null;
const listeners = new Set<() => void>();

/** The floor mounted hidden right now to warm its programs (boot only). */
export const warmingFloor = {
  get: (): FloorId | null => warming,
  set(id: FloorId | null): void {
    if (id === warming) return;
    warming = id;
    for (const l of listeners) l();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useWarmingFloor(): FloorId | null {
  return useSyncExternalStore(warmingFloor.subscribe, warmingFloor.get, () => null);
}
```

In `src/experience/tower/near.ts`, replace the function with:

```ts
/**
 * Floors render full detail only next to the current floor or the ride target (`reach` 1); the rest
 * are silhouettes. Until the first frames are done `reach` is 0, so a deep link builds one floor's
 * text and meshes, not three (about 100 ms less main-thread work on a throttled phone). `warm` is the
 * floor the boot warm-up mounts hidden to compile its programs (scene/ProgramWarmup.tsx).
 */
export function nearFloors(floor: FloorId, target: FloorId | null, exterior: boolean, reach = 1, warm: FloorId | null = null): FloorId[] {
  return FLOOR_IDS.filter((id) => {
    if (id === warm) return true;
    if (exterior && id === "L1") return true;
    const d = Math.abs(floorIndex(id) - floorIndex(floor));
    const dt = target ? Math.abs(floorIndex(id) - floorIndex(target)) : Infinity;
    return Math.min(d, dt) <= reach;
  });
}
```

- [x] **Step 4: Run them to verify they pass**

Run: `bun run test tests/unit/warm-state.test.ts tests/unit/tower-near.test.ts`
Expected: PASS (2 + 3 tests).

- [x] **Step 5: Mount the warming floor, precompile neighbours, orchestrate boot**

In `src/experience/tower/Tower.tsx`, add `import { useWarmingFloor } from "../scene/warmState";` and replace the `near` line:

```tsx
  const warming = useWarmingFloor();
  const near = nearFloors(floor, target, exterior, neighbours ? 1 : 0, warming);
```

In `src/experience/floors/CareerArchive.tsx`, add `import { useWarmingFloor } from "../scene/warmState";` and replace the `active` line:

```tsx
  // About 60 labels are typeset on the main thread, so build the road only once the rover is on L2 or
  // heading there (the drive to the elevator door covers the cost), or while the boot warms its programs.
  const warming = useWarmingFloor();
  const active = useHQStore((s) => s.floor === "L2" || s.ride?.to === "L2") || warming === "L2";
```

In `src/experience/tower/FloorLevel.tsx`, add `import { precompileFloor } from "../scene/precompile";` and after the registry effect from Task 10:

```tsx
  // Hidden neighbours compile their programs on idle, before a ride makes them visible (REPORT F5.6).
  useEffect(() => {
    if (!near) return;
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => void precompileFloor(layout.id), { timeout: 1000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = window.setTimeout(() => void precompileFloor(layout.id), 200);
    return () => window.clearTimeout(timer);
  }, [near, layout.id]);
```

Create `src/experience/scene/ProgramWarmup.tsx`:

```tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import type { GpuTier } from "../types";
import { precompileFloor, precompileScene } from "./precompile";
import { warmingFloor, warmQueue } from "./warmState";

/** Tiers that mount the other floors hidden during boot (Task 11 Step 8 may narrow this to full after SP9 on phones). */
export const STAGED_WARM_TIERS: readonly GpuTier[] = ["full", "lite"];

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Shader warm-up (REPORT F5.6, SP9; owner request 4): compiles everything mounted right after the first
 * frame, then, only while the boot card is up (still camera), mounts each other floor hidden, compiles
 * and pins its programs, and unmounts it. The floor in flight finishes when the intro starts; nothing
 * new mounts after that. Never draws: the exterior shows the Lobby's detail only (tower/visibility.ts).
 */
export function ProgramWarmup({ tier }: { tier: GpuTier }) {
  const phase = useHQStore((s) => s.phase);
  const frames = useRef(0);

  useFrame(() => {
    if (frames.current > 2) return;
    frames.current += 1;
    if (frames.current === 3) void precompileScene();
  });

  useEffect(() => {
    if (phase !== "boot" || !STAGED_WARM_TIERS.includes(tier)) return;
    let cancelled = false;
    void (async () => {
      for (const id of warmQueue(getHQStore().getState().floor)) {
        if (cancelled || getHQStore().getState().phase !== "boot") break;
        warmingFloor.set(id);
        // Let React commit the floor (and its Suspense children) before compiling.
        for (let i = 0; i < 3; i++) await nextFrame();
        await precompileFloor(id, { timeoutMs: 3000 });
      }
      warmingFloor.set(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, tier]);

  return null;
}
```

In `src/experience/scene/Scene.tsx`, add `import { ProgramWarmup } from "./ProgramWarmup";` and, after `<QualityController ... />`:

```tsx
      <ProgramWarmup tier={tier} />
```

In `src/experience/scene/renderProbe.ts`, add `import { listWarm } from "./warmState";` and a method after `graphics()`:

```ts
  /** Floors whose programs are compiled and pinned (boot warm-up, neighbours, ride prepare). */
  warmFloors(): string[] {
    return listWarm();
  },
```

- [x] **Step 6: Tighten the programs gate**

In `e2e/gpu.spec.ts`, add `warmFloors(): string[];` to `RenderHandle` and replace the test "programs added on the first arrival at each floor (full tier)" with:

```ts
test("boot warms every floor: first arrivals add at most 2 programs each (full tier)", async ({ page }) => {
  await firstSession(page);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as GpuWindow).__hq.render.warmFloors().sort()), { timeout: 120_000 })
    .toEqual(["L2", "L3", "L4", "RF"]);
  await bootRover(page);
  await waitForPhase(page, "explore", 60_000);
  await waitForSceneLive(page);
  // Warm floors were unmounted again: RF is not a neighbour of L1.
  expect(await page.evaluate(() => Boolean((window as unknown as SceneWindow).__hq.render.scene?.getObjectByName("roof")))).toBe(false);
  const seen = new Set((await counters(page)).names);
  const added: Record<string, string[]> = {};
  for (const floor of ["L2", "L3", "L4", "RF"]) {
    const { names } = await ride(page, floor);
    added[floor] = names.filter((n) => !seen.has(n));
    for (const n of names) seen.add(n);
  }
  report("programs-added", Object.fromEntries(Object.entries(added).map(([k, v]) => [k, v.length])));
  report("programs-added-names", added);
  for (const [floor, names] of Object.entries(added)) expect(names.length, `${floor}: ${names.join(", ")}`).toBeLessThanOrEqual(2);
});
```

- [x] **Step 7: Build and run**

Run: `bun run build && E2E_PORT=4431 bunx playwright test e2e/gpu.spec.ts e2e/onboarding.spec.ts e2e/boot-first.spec.ts e2e/experience.spec.ts --reporter=list`
Expected: all pass. If a floor adds more than 2 programs, the assertion message lists them (`Material#hash`): a name present only after arrival means that object mounts only on that floor in explore (for example the hover label or a hologram stage). Mount it in warm mode too if it is cheap, or raise that floor's allowance in the test with a comment naming the program and why; never raise it above 4.

- [x] **Step 8: Measure SP9 after, decide the staged tiers**

With the build served on 4431, run:

```bash
bun scripts/perf-gpu.ts sp9 --tier full --cpu 4
bun scripts/perf-gpu.ts sp9 --tier lite --cpu 4 --size 390x844 --dpr 3
```

Expected: `newPrograms` 0 to 2 per ride; `movingLongTasks` lower than the Task 2 baseline. Decision rule: if the lite `boot` row shows `maxLongTask` above 200 ms (a visible stall of the boot card's typing on phones), set `STAGED_WARM_TIERS = ["full"]` in `ProgramWarmup.tsx`, rebuild and rerun both commands; the lite tier then relies on neighbour precompile and P6's prepare. Paste both tables into `docs/perf/r5-gpu.md` under "After".

- [x] **Step 9: Screenshot-diff gate (profile `strict`)**

Run: `E2E_PORT=4431 bun scripts/visual-gate.ts --base HEAD --profile strict --no-build`
Expected: PASS on every pose (compiling and hidden mounts never draw). Rollback: if `intro-still` differs, a warm floor drew in the exterior: check that `FloorLevel` uses `contentVisible` (Task 9) and that `RoadMarkings`, `PadGlow` or other floor-level children are inside the `content` group; if it cannot be found quickly, set `STAGED_WARM_TIERS = []` and keep the scene and neighbour precompile.

- [x] **Step 10: Commit**

```bash
rtk git add src/experience/scene/warmState.ts src/experience/scene/ProgramWarmup.tsx src/experience/scene/Scene.tsx src/experience/scene/renderProbe.ts src/experience/tower/near.ts src/experience/tower/Tower.tsx src/experience/tower/FloorLevel.tsx src/experience/floors/CareerArchive.tsx tests/unit/warm-state.test.ts tests/unit/tower-near.test.ts e2e/gpu.spec.ts docs/perf/r5-gpu.md
rtk git commit -m "perf: warm every floor's shader programs during boot, neighbours on mount"
```

---

## Task 12: Release gate, after-measurements and documentation

**Files:**
- Modify: `docs/perf/r5-gpu.md`
- Modify: `AGENTS.md` (3D experience bullets around lines 175 and 196, Fast verification)
- Modify: `README.md:159`
- Modify: `docs/superpowers/specs/agent-hq/05-visual-audio-tokens.md:32-44`
- Modify: `docs/superpowers/specs/agent-hq/08-quality-acceptance.md:9,24-25`

**Interfaces:**
- Consumes: everything above; no new code.

- [x] **Step 1: Full verification**

Run: `bun run verify:quick && E2E_PORT=4431 bun run e2e:changed`
Expected: typecheck, lint, unit tests and build pass; `e2e:changed` runs `experience`, `gpu`, `highlights`, `career`, `pads` (and whatever the plan maps) with 0 failures.

- [x] **Step 2: Release screenshot gate against main**

Run: `E2E_PORT=4431 bun scripts/visual-gate.ts --base origin/main --profile release --no-build`
Expected: PASS. Thresholds: `full-1440x900@2` poses threshold 0.2, maxDiffPixelRatio 0.005 (MSAA-only edges plus batching); `l1-*`, `l2-*`, `intro-*`, `ride-*` on the other devices threshold 0.1, maxDiffPixelRatio 0.002; `l3-labs`, `l4-library`, `rf-contact` on `full-2560x1440@1` and `lite-390x844@3` strict (0.1, 0.001). Attach the three worst diff images (by pixel count) and the `full-1920x1080@1.5` base/head info captures to the PR.
Rollback: a failing pose names the task to revert through its own rollback note (Retina poses: Task 3; L1: Task 7; L2: Task 8; intro or ride: Task 9; any pose after warm-up: Task 11).

- [x] **Step 3: After-measurements with the same method**

Run the four commands from Task 2 Step 11 and `E2E_PORT=4431 bunx playwright test e2e/gpu.spec.ts --reporter=list` on the same machines and browser versions. Fill "After" in `docs/perf/r5-gpu.md` with the same five blocks and add a summary table:

```markdown
## Summary (before -> after)

| Metric | Before | After | Budget |
|---|---|---|---|
| L1 full scene draw calls at spawn (e2e) | from Task 2 | from this run | < 140 (L1 cap) |
| Intro peak calls, full (e2e) | from Task 2 | from this run | < 150 |
| Worst ride peak calls, full (e2e) | from Task 2 | from this run | < 150 |
| New programs on first arrival, worst floor (e2e) | from Task 2 | from this run | <= 2 |
| 1440x900@2 full, frame p95 ms, worst floor (sp4) | from Task 2 | from this run | <= 18 |
| 1440x900@2 full, est. render-target MB (sp4) | from Task 2 | from this run | < 512 |
| 2560x1440@1 full, frame p95 ms, worst floor (sp4) | from Task 2 | from this run | <= 18 |
| Long tasks > 50 ms during `ride:moving`, full 4x (sp9) | from Task 2 | from this run | 0 |
```

Write the real numbers into every "from ..." cell before committing (copy them from the tables above in the same file). The same table goes into the PR body.

- [x] **Step 4: Update AGENTS.md**

In the "Floors above the rover render as ghosts" bullet, replace the sentence starting `Pixel budget per tier and device:` up to `the canvas never multisamples).` with:

```markdown
Pixel budget per tier, device and screen: `renderBudget(tier, coarse, screen)` in `scene/settings.ts` (desktop full DPR up to 2 within an 8.3 MP total-pixel budget, so 5K and 4K-at-2x canvases get a lower DPR; composer MSAA 4 only below DPR 1.5, because Retina screens antialias on their own; touch devices DPR 1.5 on full and 1.25 on lite without MSAA; bloom keeps 8 MIP levels; the canvas never multisamples). `?gfx=dpr1.5,msaa0,bloom5,monitor-on|off` overrides it for measurements. Content visibility is one pure rule (`tower/visibility.ts`): the boot and intro exterior shows the Lobby's detail only, a ride shows its target floor and floors within one floor gap under the car, so intro and ride peaks stay under 150 calls (`e2e/gpu.spec.ts`).
```

After that bullet, add:

```markdown
- Quality safety net (round 5): `scene/QualityController.tsx` runs a pure frame monitor (`scene/frameMonitor.ts`: 2 s windows, steps down after 2 slow windows with median above 20 ms on full or 36 ms on lite, back up after 10 smooth windows, at most 2 changes per 60 s, a relapse within 30 s locks the level) over a look-preserving ladder (`scene/quality.ts`: DPR 85%, DPR 70%, composer MSAA off, bloom 2 levels lighter; bloom levels follow the DPR so the glow keeps its on-screen size). It holds during boot, intro, rides and the L2 beam, is off under `navigator.webdriver` (CI, Lighthouse) unless `?gfx=monitor-on`, applies MSAA and bloom levels on the existing composer (no rebuild) and publishes the DPR to the `Canvas`. Level per session: `sessionStorage["hq:gfx"]`. Test handle: `__hq.quality` (`snapshot()`, `simulate(ms)`).
- Shader precompile (round 5): `precompileObject`, `precompileFloor`, `precompileScene` in `scene/precompile.ts` compile a subtree for the target it is drawn into (composer input on full, canvas on lite), wait without blocking where `KHR_parallel_shader_compile` exists, and pin new programs (`scene/programPins.ts`: never-rendered clones, so three keeps the program after the floor unmounts). `ProgramWarmup` compiles the scene after the first frame and, during boot only, mounts each other floor hidden (`warmingFloor`, `nearFloors(..., warm)`), compiles and unmounts it; `FloorLevel` compiles neighbours on idle as they mount. The elevator ride's prepare step calls `precompileFloor(ride.to)` when `!isFloorWarm(ride.to)`. `__hq.render` exposes `peakCalls` (reset with `resetPeak()`), `programs()`, `programNames()`, `graphics()` and `warmFloors()`.
- Batched text with live members: `BatchedLabels` takes `toneMapped` (match the labels it replaces: drei `Text` is tone mapped unless `material-toneMapped={false}`), outlines (`outlineWidth`, `outlineColor`; an outlined batch is 2 calls) and a `ref` handle (`batch`, `members`) for per-frame member matrices, opacities or text. The L1 stats ring (5 calls: instanced plates and glows, one edge set, two text batches) and the L2 room labels and signposts (`floors/career/labels.ts`, `useMemberFade`) use it.
```

In the sessionStorage keys list (line 175 bullet), add `hq:gfx` (the quality safety net's level for this session, `scene/qualityStore.ts`).

In "Fast verification", after the Screenshots bullet, add:

```markdown
- Look-preserving changes (render budget, batching, visibility, anything that may move pixels): `E2E_PORT=<port> bun scripts/visual-gate.ts --base HEAD --profile strict|msaa|batching|release` builds the base ref in a sibling worktree, captures 3 devices (full 1440x900@2, full 2560x1440@1, lite 390x844) x 8 poses with a virtual frame clock (`e2e/vclock.ts`) and compares the working tree build within the profile's thresholds (strict: per-pixel 0.1, at most 0.1% of pixels). About 20 to 30 minutes; one run at a time. `--self` measures the harness noise. GPU timings on a real GPU: `bun scripts/perf-gpu.ts sp4|sp9` (results in `docs/perf/r5-gpu.md`).
```

- [x] **Step 5: Update README.md**

Replace line 159 with:

```markdown
In 3D every floor stays under 150 draw calls and 30k triangles (`expectRenderBudget` in the e2e suite), and so do the intro and elevator rides at their peaks (`e2e/gpu.spec.ts`). The pixel budget (`renderBudget` in `src/experience/scene/settings.ts`) keeps desktops at DPR up to 2 within 8.3 MP and skips composer MSAA from DPR 1.5 up; touch devices render fewer pixels (DPR 1.5 on full, 1.25 on lite). A runtime safety net lowers DPR, then MSAA, then bloom only on sustained frame drops, at most twice a minute. Every floor's shader programs compile during the boot, neighbouring floors mount on idle after the first frames, and the nav grids build in about a millisecond. Measurements: [`docs/perf/r5-gpu.md`](docs/perf/r5-gpu.md).
```

- [x] **Step 6: Update the spec appendices**

In `05-visual-audio-tokens.md` section 2, replace the table rows from `| Room walls |` to `| Fog |` with (spec gap 15: the implementation is cheaper than the old text):

```markdown
| Room walls | Glass `ShaderMaterial` (fresnel, top band, scanline), accent color, `transparent`, `depthWrite: false`, `DoubleSide`, shared per color and opacity; full-tier fills scaled x0.4 (linear composer blending) |
| Room floors | Accent color, opacity 0.08 |
| Holograms | `MeshBasicMaterial`, `toneMapped: false`, neon colors pushed above 1.0 on the full tier so bloom picks them up |
| Lights | 1 hemisphere light, 1 directional (no shadows), 1 rover point light on the full tier |
| Shadows | Blob decals only, no shadow maps |
| Bloom (full tier) | threshold 0.6, intensity 0.9, radius 0.45, mipmap blur with 8 levels; the runtime safety net lowers levels only together with the DPR (same on-screen glow), and by 2 more only as its last step |
| Anti-aliasing | The canvas never multisamples. Full tier: composer MSAA 4 below DPR 1.5, none from DPR 1.5 up (the screen antialiases). Lite: none |
| Fog | Linear, color `bg.void`, per camera rig: follow 38 to 80, rail 40 to 95, intro 90 to 200 |
```

In `08-quality-acceptance.md` section 1, replace the `full` row with:

```markdown
| `full` | WebGL2, fine pointer, not a low-memory or low-core device (local heuristic, `src/lib/gpu-tier.ts`) | Everything, including bloom; DPR up to 2 within an 8.3 MP pixel budget, composer MSAA 4 below DPR 1.5; a runtime safety net steps DPR, then MSAA, then bloom on sustained drops (at most 2 changes per minute) |
```

In section 2, replace the "Frame rate" and "Draw calls per floor" rows with:

```markdown
| Frame rate | ≥ 55 fps desktop (full), ≥ 30 fps mid-range phone (lite) | `scripts/perf-gpu.ts sp4` on real GPUs (frame p95 ≤ 18 ms), the runtime safety net in the field |
| Draw calls per floor | < 150, all render passes counted, at settled spots and at the intro and elevator ride peaks | `expectRenderBudget` (e2e) and `e2e/gpu.spec.ts` (peaks) |
```

- [x] **Step 7: No em dashes, no stray placeholders**

Run: `grep -rn "$(printf '\342\200\224')" AGENTS.md README.md docs/perf docs/superpowers/specs/agent-hq/05-visual-audio-tokens.md docs/superpowers/specs/agent-hq/08-quality-acceptance.md src/experience e2e/gpu.spec.ts e2e/visual-gate.spec.ts e2e/vclock.ts scripts/visual-gate.ts scripts/perf-gpu.ts; grep -n "from Task 2\|from this run\|(paste" docs/perf/r5-gpu.md` (the `printf` builds the em dash character, U+2014)
Expected: no output from either grep.

- [x] **Step 8: Lighthouse budgets**

Run: `bunx lhci autorun` (the repo's `lighthouserc.json`, same as CI)
Expected: all assertions pass (P2 adds code only to the lazily loaded 3D chunk; the Page View JS stays at its Task 2 size). If the CI JS line moves, compare `out/_next/static/chunks` sizes before and after; nothing in this plan imports from `src/experience` into page code.

- [x] **Step 9: Commit and open the PR**

```bash
rtk git add AGENTS.md README.md docs/perf/r5-gpu.md docs/superpowers/specs/agent-hq/05-visual-audio-tokens.md docs/superpowers/specs/agent-hq/08-quality-acceptance.md
rtk git commit -m "docs: render budget, quality safety net, precompile and P2 measurements"
rtk git push -u origin HEAD
gh pr create --title "P2: GPU and rendering, look-preserving (round 5)" --body-file docs/perf/r5-gpu.md
```

Then edit the PR body to add: the summary table, the release visual-gate result with the three worst diff images, the 150% Windows captures, the hysteresis snapshot from Task 5 Step 11, the `STAGED_WARM_TIERS` decision from Task 11 Step 8, and the rebase notes for P3, P4, P6 and P7 from this plan. Do not merge without the owner.

---

## Self-review

**Spec coverage (task scope and plan.md P2 row):**
- Composer MSAA 0 at DPR >= 1.5: Task 3 (`RETINA_DPR`, unit tests, e2e budget cases, `msaa` visual profile).
- Pixel budget, DPR scaled down on very large canvases, in `renderBudget` and the composer setup: Task 3 (`PIXEL_BUDGET`, `budgetDpr`, `Effects` refs, `postHandle`); resize handling in Task 5 (`QualityController` recomputes from the canvas size).
- Bloom resolution/levels sized by pixel count: Task 4 (`bloomLevelsFor` follows the DPR scale, so the glow keeps its on-screen size), applied in Task 5 without rebuilding the effect; mipmap bloom already works at full resolution, so levels are the lever (no `resolutionScale` change, which would soften the look).
- Runtime safety net, in-house rAF monitor, sustained drops only, hysteresis <= 2 flips per 60 s, pixel budget first and bloom last: Tasks 4 and 5 (unit tests prove the flip cap and relapse lock; e2e proves MSAA before bloom and persistence); drei `PerformanceMonitor` is not bundled today, so it is not used.
- Batch the L1 stats ring (about 30 calls) and L2 labels with `BatchedLabels`: Tasks 6, 7, 8 (structure gates in `gpu.spec.ts`).
- Intro and ride peak draw calls < 150 (exterior set without L2 detail, hide floors below): Task 9 (pure rule, peak gate, fallbacks).
- Precompile during boot and the 2.5 s intro with `compile` + `KHR_parallel_shader_compile`, coordinated with P6: Tasks 10 and 11; P6's exact signatures are in "Interfaces handed to other workstreams".
- Screenshot diffs at full 1440x900@2, 2560x1440@1 and lite 390x844 with thresholds: Task 1 harness; gates in Tasks 3, 5, 6, 7, 8, 9, 11 and the release gate in Task 12, each with a rollback note.
- SP4 and SP9 as measurement tasks: Task 2 (baseline), Task 3 Step 9, Task 11 Step 8, Task 12 Step 3 (after), same method.
- Port 4431: every e2e and gate command.
- Docs: README, AGENTS.md, spec 05 section 2, spec 08 sections 1 and 2 (Task 12).

**Placeholder scan:** the only fill-in markers are measurement cells in `docs/perf/r5-gpu.md`, which Task 2 Step 11 and Task 12 Step 3 fill from script output, and Task 12 Step 7 greps for any that remain.

**Type consistency:** `RenderBudget { dpr, multisampling, bloomLevels }` (Task 2) is used by `renderBudget` (Task 3), `qualityLadder`/`qualityAt` (Task 4) and `QualityController` (Task 5); `QualityState { level, dpr, multisampling, bloomLevels }` flows from `qualityAt` into `qualityStore.setApplied` and `Experience`'s `appliedDpr`; `renderProbe` methods `record`, `resetPeak`, `programs`, `programNames` (Task 2), `graphics` (Task 3), `warmFloors` (Task 11) match `RenderHandle` in `gpu.spec.ts`; `BatchedLabelsHandle { batch, members }` (Task 6) is used in Tasks 7 and 8; `contentVisible({ id, floorY, roverY, exterior, rideTo })` (Task 9) matches `FloorLevel`; `precompileFloor(id, { timeoutMs })` and `FloorPrecompileReport` (Task 10) match `ProgramWarmup` (Task 11) and the P6 contract; `nearFloors(floor, target, exterior, reach, warm)` matches `Tower`.

**Open risks (also in the PR body):**
1. SwiftShader determinism: the virtual clock fixes frame timing, but async typesetting and chunk arrival still race the first frames; Task 1 Step 8 measures the noise and raises settle frames per pose.
2. Batched transparent sorting: a batch sorts as one object, so overlaps with glass, icons or the hologram can change; render orders and fallbacks are in Tasks 7 and 8, the gate catches it.
3. Program pins rely on three's `cacheKey` equality; clones that do not match are dropped and counted (`programPins.misses`), so the risk is fewer pins, never a wrong draw. Troika derived materials are the most likely misses.
4. `KHR_parallel_shader_compile` is missing in some browsers (notably Safari); there `precompile` still moves the compile out of the ride but blocks while it runs, which the boot card hides.
5. Staged boot mounts typeset text on the main thread; on phones this may stall the boot card's typing (Task 11 Step 8 decision rule). Until P3 fixes the F7.1 geometry leaks, each warm mount and unmount also leaks those geometries once per session.
6. The safety net cannot measure GPU time, only frame time; a CPU-bound drop also lowers pixels. Hysteresis and the relapse lock keep it from oscillating; the e2e and manual checks in Task 5 confirm.

## Execution handoff

Recommended: superpowers:subagent-driven-development, one fresh subagent per task in order (Task 1 first: every later visual gate depends on it; Tasks 4 to 5 and 6 to 8 can run as two parallel tracks after Task 3 if two machines are available, never two e2e suites on one machine). Alternative: superpowers:executing-plans inline with a checkpoint after Tasks 3, 5, 8 and 11.
