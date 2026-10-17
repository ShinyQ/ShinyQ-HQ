import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { BUDGET_WINDOW, GPU_MEMORY_BUDGET, RENDER_BUDGET, type RenderBudget } from "./budgets";

export interface HQSnapshot {
  phase: string;
  floor: string;
  tier: string;
  ride: { from: string; to: string; stage: string } | null;
  rover: { x: number; z: number; heading: number; speed: number; face: string };
  firstVisit: boolean;
  /** Whole-frame draw calls (scene plus post passes) and triangles, mirrored every 0.1 s. */
  drawCalls: number;
  triangles: number;
  /** Last frame's scene draw calls and post-processing passes (`__hq.perf.stats`). */
  sceneCalls: number;
  postCalls: number;
}

/** `window.__hq.perf.stats` (src/experience/perf/renderStats.ts). */
interface PerfStatsProbe {
  sceneCalls: number;
  postCalls: number;
  triangles: number;
  peakSceneCalls: number;
  peakPostCalls: number;
  peakTriangles: number;
  minSceneCalls: number;
  peakFrames: number;
  programs: number;
  geometries: number;
  textures: number;
  frames: number;
}

type HQWindow = Window & {
  __hq: {
    store: { getState: () => Omit<HQSnapshot, "drawCalls" | "triangles" | "sceneCalls" | "postCalls"> };
    rover: { drawCalls: number; triangles: number };
    perf: { stats: PerfStatsProbe; resetPeaks: () => void };
    /** Live `renderer.info` counts of the current canvas, null while none exists (src/experience/scene/memoryProbe.ts). */
    memory: () => GpuCounters | null;
  };
};

/**
 * Marks the visitor as returning: the boot and the intro already played this session (`hq:intro`),
 * the first-session tour ran (`hq:onboarded`) and hint bubbles are off (`hq:hints`), so any route
 * opens straight in and nothing covers the world.
 */
export async function asReturningVisitor(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("hq:terminal-seen", "1");
    // The first-session tour already ran; "!" hint bubbles off so they never cover a click target.
    localStorage.setItem("hq:onboarded", "done");
    localStorage.setItem("hq:hints", "off");
    sessionStorage.setItem("hq:intro", "seen");
    if (!localStorage.getItem("hq:v1")) {
      localStorage.setItem("hq:v1", JSON.stringify({ state: { firstVisit: false, visited: [], locale: "en", sound: false }, version: 1 }));
    }
  });
}

/**
 * Marks every floor's first-visit Rover line as already spoken (`hq:floor-intro`), so no floor line
 * covers the floor or races a click. Call it before navigating.
 */
export async function skipFloorLines(page: Page) {
  await page.addInitScript(() => localStorage.setItem("hq:floor-intro", JSON.stringify(["L1", "L2", "L3", "L4", "RF"])));
}

/**
 * Picks the Motion setting before every navigation (merged into the persisted store `hq:v1`, version 3).
 * Full is the default on every OS (owner decision 2026-10-14), so a spec that emulates
 * `prefers-reduced-motion: reduce` to test reduced motion picks System (the OS flag decides, as before)
 * or Reduced first. Register it before any reload that must keep a choice made in the UI: it rewrites it.
 */
export async function chooseMotion(target: Page | BrowserContext, motion: "system" | "full" | "reduced") {
  await target.addInitScript((m) => {
    try {
      const raw = localStorage.getItem("hq:v1");
      const saved = raw ? JSON.parse(raw) : null;
      const state = saved && typeof saved.state === "object" && saved.state ? saved.state : {};
      localStorage.setItem("hq:v1", JSON.stringify({ state: { ...state, motion: m }, version: 3 }));
    } catch {
      // about:blank and opaque origins have no storage.
    }
  }, motion);
}

/**
 * Playwright sets navigator.webdriver, which the gate treats as bot-like (the classic site, no 3D) unless the
 * URL forces `?tier=lite|full`. Tests of real auto-detection (software renderer, no WebGL) hide it.
 */
export async function asHumanBrowser(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true }));
}

/**
 * The Next.js chunks are requested after the first contentful paint (scripts/defer-scripts.ts), so
 * the `load` event can fire before React hydrates. Wait for this before interacting with client
 * islands (filters, HUD buttons, gallery) right after a navigation.
 */
export async function waitForHydration(page: Page, timeout = 15_000) {
  await page.locator("html[data-hydrated]").waitFor({ state: "attached", timeout });
}

/**
 * Timeout for a URL assertion after a client-side navigation (`router.push`: the RSC payload plus the
 * page's JS chunk). The 5 s expect default suits UI state, not a navigation: a CI runner shared with
 * WebGL workers can stall the whole browser for 5 to 6 s mid-navigation (issue #152).
 */
export const NAV_TIMEOUT = 15_000;

/** `page.goto` plus `waitForHydration`, for static pages that a test interacts with. */
export async function openPage(page: Page, url: string, options?: Parameters<Page["goto"]>[1]) {
  const response = await page.goto(url, options);
  await waitForHydration(page);
  return response;
}

/**
 * The only other origin the site may contact: Cloudflare Turnstile for Ask the HQ, loaded lazily
 * when the ask UI opens. Exact hostname over https, nothing else (threat T13 in
 * docs/superpowers/specs/2026-10-11-ask-hq-design.md; the CSP in public/_headers matches).
 */
const ALLOWED_CROSS_ORIGIN_HOSTS: ReadonlySet<string> = new Set(["challenges.cloudflare.com"]);

/** Console text of a Content-Security-Policy violation (Chromium logs "Refused to ... Content Security Policy"). */
const CSP_CONSOLE = /Content Security Policy|Refused to (execute|load|create|evaluate)/i;

/**
 * Every CSP violation of the page and its frames, across navigations: a `securitypolicyviolation`
 * listener installed before any page script reports through an exposed binding.
 */
export async function collectCspViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  await page.exposeBinding("__hqCspViolation", (_source, text: string) => void violations.push(text));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      const report = (window as unknown as { __hqCspViolation?: (t: string) => void }).__hqCspViolation;
      report?.(`${e.violatedDirective} blocked ${e.blockedURI || "inline"} at ${e.sourceFile || location.pathname}:${e.lineNumber} (${e.sample || ""})`);
    });
  });
  page.on("console", (msg) => {
    if (msg.type() === "error" && CSP_CONSOLE.test(msg.text())) violations.push(msg.text());
  });
  return violations;
}

/**
 * Collects page errors, CSP violations reported on the console and any request to another origin.
 * The local server does not send the production headers from public/_headers, so a runtime CDN fetch
 * only fails on Cloudflare; the per-page script policy meta tag (scripts/csp-hashes.ts) does apply.
 */
export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" && CSP_CONSOLE.test(msg.text())) errors.push(`CSP: ${msg.text()}`);
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.protocol.startsWith("http") || url.hostname === "127.0.0.1" || url.hostname === "localhost") return;
    if (url.protocol === "https:" && ALLOWED_CROSS_ORIGIN_HOSTS.has(url.hostname)) return;
    errors.push(`cross-origin request: ${url.href}`);
  });
  return errors;
}

export async function snapshot(page: Page): Promise<HQSnapshot> {
  return page.evaluate(() => {
    const hq = (window as unknown as HQWindow).__hq;
    const s = hq.store.getState();
    return {
      phase: s.phase,
      floor: s.floor,
      tier: s.tier,
      ride: s.ride,
      rover: s.rover,
      firstVisit: s.firstVisit,
      drawCalls: hq.rover.drawCalls,
      triangles: hq.rover.triangles,
      sceneCalls: hq.perf.stats.sceneCalls,
      postCalls: hq.perf.stats.postCalls,
    };
  });
}

/** Worst frames since `resetRenderPeaks` (every rendered frame counts, not samples). */
export interface RenderPeaks {
  sceneCalls: number;
  postCalls: number;
  triangles: number;
  minSceneCalls: number;
  frames: number;
}

export async function resetRenderPeaks(page: Page) {
  await page.evaluate(() => (window as unknown as HQWindow).__hq.perf.resetPeaks());
}

export async function readRenderPeaks(page: Page): Promise<RenderPeaks> {
  return page.evaluate(() => {
    const s = (window as unknown as HQWindow).__hq.perf.stats;
    return { sceneCalls: s.peakSceneCalls, postCalls: s.peakPostCalls, triangles: s.peakTriangles, minSceneCalls: s.minSceneCalls, frames: s.peakFrames };
  });
}

/**
 * Asserts a peak window against the floor budget (appendix 08 section 2): scene calls and triangles
 * under the budget, post passes at most the budget, every count finite (Infinity means a draw with an
 * unbounded instance count, see the troika patch in src/experience/text-config.ts), and at least 3
 * rendered frames (a paused or stalled canvas must not pass on stale numbers).
 */
export function expectPeaksWithinBudget(peaks: RenderPeaks, label: string, budget: RenderBudget = RENDER_BUDGET) {
  const detail = `${label}: ${JSON.stringify(peaks)}`;
  expect(peaks.frames, `${detail} (no frames rendered in the window)`).toBeGreaterThanOrEqual(3);
  expect(Number.isFinite(peaks.sceneCalls) && Number.isFinite(peaks.postCalls) && Number.isFinite(peaks.triangles), detail).toBe(true);
  expect(peaks.sceneCalls, detail).toBeLessThan(budget.sceneCalls);
  expect(peaks.postCalls, detail).toBeLessThanOrEqual(budget.postCalls);
  expect(peaks.triangles, detail).toBeLessThan(budget.triangles);
}

/**
 * Per-floor render budget, called once the scene settled: the worst frame over at least
 * BUDGET_WINDOW.frames frames and BUDGET_WINDOW.ms. Returns the peaks for floor caps and logs.
 */
export async function expectRenderBudget(page: Page): Promise<RenderPeaks> {
  await resetRenderPeaks(page);
  await waitForFrames(page, BUDGET_WINDOW.frames, BUDGET_WINDOW.ms);
  const peaks = await readRenderPeaks(page);
  expectPeaksWithinBudget(peaks, "settled");
  expect(peaks.minSceneCalls, JSON.stringify(peaks)).toBeGreaterThan(RENDER_BUDGET.minSceneCalls);
  return peaks;
}

/** Live GPU objects (`renderer.info`): the memory gate's counters (three.js has no material count). */
export interface GpuCounters {
  geometries: number;
  textures: number;
  programs: number;
}

export async function readGpuCounters(page: Page): Promise<GpuCounters> {
  await waitForFrames(page, 2);
  return page.evaluate(() => {
    const s = (window as unknown as HQWindow).__hq.perf.stats;
    return { geometries: s.geometries, textures: s.textures, programs: s.programs };
  });
}

/**
 * GPU counters once the floor settled (the memory gate's reads): neighbours mount on idle and troika
 * typesets asynchronously, so it waits for two equal reads of `__hq.memory()` in a row.
 */
export async function readSettledGpuCounters(page: Page): Promise<GpuCounters> {
  let last = "";
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => new Promise<void>((resolve) => requestIdleCallback(() => resolve(), { timeout: 1000 })));
    await waitForFrames(page, 10);
    const now = await page.evaluate(() => (window as unknown as HQWindow).__hq.memory());
    const key = JSON.stringify(now);
    if (now && key === last) return now;
    last = key;
  }
  throw new Error(`renderer memory never settled, last read ${last}`);
}

/**
 * GPU objects back at their baseline: at most `budget` more of each (GPU_MEMORY_BUDGET allows 0), and
 * never fewer, since a drop below the baseline means the baseline read was not settled.
 */
export function expectNoGpuGrowth(before: GpuCounters, after: GpuCounters, budget: GpuCounters = GPU_MEMORY_BUDGET, context = "") {
  const detail = `${JSON.stringify({ before, after })}${context ? ` ${context}` : ""}`;
  for (const key of ["geometries", "textures", "programs"] as const) {
    expect(after[key] - before[key], `${key} growth ${detail}`).toBeLessThanOrEqual(budget[key]);
    expect(after[key] - before[key], `${key} below the baseline ${detail}`).toBeGreaterThanOrEqual(0);
  }
}

/** JS heap in use after a forced garbage collection (Chrome DevTools Protocol), in bytes. */
export async function readJsHeapAfterGc(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.collectGarbage");
  const { usedSize } = await cdp.send("Runtime.getHeapUsage");
  await cdp.detach();
  return usedSize;
}

export async function waitForHQ(page: Page) {
  await page.getByTestId("hq").waitFor();
  await page.waitForFunction(() => Boolean((window as unknown as Partial<HQWindow>).__hq));
}

export async function waitForPhase(page: Page, phase: string, timeout = 30_000) {
  await page.waitForFunction((p) => (window as unknown as HQWindow).__hq.store.getState().phase === p, phase, { timeout });
}

type RideProbeWindow = Window & {
  __hq: {
    store: { getState: () => { floor: string; phase: string; ride: unknown } };
    motion: () => { ride: { stage: string; t: number; held?: number; chunkHeld?: number } | null };
    rover: { x: number; z: number };
    frames: () => number;
  };
};

/**
 * Most frames one elevator trip may take before `waitForFloor` calls it stuck: 40 s of ride time at 60 fps,
 * several times the longest trip (door drive, the five stages, the closed-door wait, the arrival roll).
 */
export const RIDE_FRAME_BUDGET = 2400;

/**
 * Waits until the elevator has delivered the rover to `floor`.
 *
 * Rides are frame-bound by design: one frame adds at most 1/20 s of ride time (`RIDE_CAP`) and the rover's
 * drive at most 1/30 s (`MAX_PHYSICS_STEP`), so at 1 fps (a busy SwiftShader runner) a trip that takes 6 s
 * at 60 fps takes minutes of wall time. The wait therefore follows the ride, not the clock:
 * - it fails when the ride makes no progress (floor, phase, stage, ride time, closed-door waits, rover position) for `timeout` ms;
 * - it fails when the trip runs past `RIDE_FRAME_BUDGET` frames;
 * - wall time spent while the ride progresses extends the test's timeout, so a slow runner finishes the trip.
 */
export async function waitForFloor(page: Page, floor: string, timeout = 45_000) {
  // Live per-frame state: the store writes the ride once per stage, `__hq.motion()` and `__hq.rover` every frame.
  const progress = () =>
    page.evaluate((f) => {
      const hq = (window as unknown as RideProbeWindow).__hq;
      const s = hq.store.getState();
      const ride = hq.motion().ride;
      const done = s.floor === f && s.ride === null && s.phase === "explore";
      const mark = [s.floor, s.phase, ride?.stage, ride?.t.toFixed(3), ride?.held?.toFixed(3), ride?.chunkHeld?.toFixed(3), hq.rover.x.toFixed(2), hq.rover.z.toFixed(2)].join(" ");
      return { done, mark, frames: hq.frames() };
    }, floor);
  const info = test.info();
  const firstBase = info.timeout;
  const firstStarted = Date.now();
  info.setTimeout(firstBase + timeout);
  const first = await progress();
  // The ride started with the caller's request, so this read counts as ride time.
  info.setTimeout(firstBase + (Date.now() - firstStarted));
  if (first.done) return;
  let last = first;
  let lastProgress = Date.now();
  for (;;) {
    // Credit up front: one check may block for a long frame (a floor compiling on a slow runner). The test
    // keeps the time only when the ride moved; a stalled ride gives it back and fails below.
    const base = info.timeout;
    const started = Date.now();
    info.setTimeout(base + timeout);
    const arrived = await page
      .waitForFunction(
        (f) => {
          const s = (window as unknown as RideProbeWindow).__hq.store.getState();
          return s.floor === f && s.ride === null && s.phase === "explore";
        },
        floor,
        { timeout: 2_000 },
      )
      .then(
        () => true,
        (error: Error) => {
          if (error.name !== "TimeoutError") throw error;
          return false;
        },
      );
    const now = arrived ? null : await progress();
    const moved = arrived || now!.done || now!.mark !== last.mark;
    info.setTimeout(base + (moved ? Date.now() - started : 0));
    if (arrived || now!.done) return;
    if (moved) {
      lastProgress = Date.now();
      last = now!;
    }
    if (now!.frames - first.frames > RIDE_FRAME_BUDGET) throw new Error(`waitForFloor(${floor}): the trip ran past ${RIDE_FRAME_BUDGET} frames (${now!.mark})`);
    if (Date.now() - lastProgress > timeout) throw new Error(`waitForFloor(${floor}): no ride progress for ${timeout} ms (${now!.mark}, frame ${now!.frames})`);
  }
}

/** Opens /en (or `path`) as a returning visitor (intro already played this session) and waits until input is handled. */
export async function enterHQ(page: Page, { path = "/en", tier = "lite" }: { path?: string; tier?: string } = {}) {
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=${tier}`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

/** Waits until the rover has moved at least `distance` from `from`. */
export async function waitForRoverMove(page: Page, from: { x: number; z: number }, distance: number, timeout = 30_000) {
  await page.waitForFunction(
    ({ from, distance }) => {
      const r = (window as unknown as HQWindow).__hq.store.getState().rover;
      return Math.hypot(r.x - from.x, r.z - from.z) >= distance;
    },
    { from, distance },
    { timeout },
  );
}

/**
 * Waits until the follow camera has settled after the intro (the spring is slow on SwiftShader).
 * Counts animation frames, not wall time: under load the main thread can stall for seconds (shader
 * compiles), and a camera that did not move because no frame ran is not a settled camera.
 */
export async function waitForCameraSettle(page: Page, { frames = 12, minMs = 300, timeout = 60_000 } = {}) {
  await page.waitForFunction(
    ({ frames, minMs }) =>
      new Promise<boolean>((resolve) => {
        const w = window as unknown as { __hq: { camera?: () => [number, number, number] } };
        const read = () => w.__hq.camera?.() ?? [0, 0, 0];
        const a = read();
        const start = performance.now();
        let seen = 0;
        const tick = () => {
          seen += 1;
          if (seen < frames || performance.now() - start < minMs) {
            requestAnimationFrame(tick);
            return;
          }
          const b = read();
          resolve(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.05);
        };
        requestAnimationFrame(tick);
      }),
    { frames, minMs },
    { timeout, polling: 100 },
  );
}

/** Resolves after `count` rendered animation frames and at least `minMs` (state that updates per frame, not per millisecond). */
export async function waitForFrames(page: Page, count = 10, minMs = 0) {
  await page.evaluate(
    ({ count, minMs }) =>
      new Promise<void>((resolve) => {
        const start = performance.now();
        let seen = 0;
        const tick = () => (++seen >= count && performance.now() - start >= minMs ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    { count, minMs },
  );
}

/**
 * Waits until the scene loop runs: the Director has created the rover controller and rendered, and
 * the SSR boot cover is gone. Deep links set the phase to `explore` before the first frame, so
 * `explore` alone does not mean input is handled yet (an intent emitted before the first Director
 * frame is dropped, and a touch before the cover is released lands on the cover).
 */
export async function waitForSceneLive(page: Page, timeout = 60_000) {
  await page.waitForFunction(
    () => ((window as unknown as Partial<HQWindow>).__hq?.rover.drawCalls ?? 0) > 0 && !document.documentElement.hasAttribute("data-hq-boot"),
    null,
    { timeout },
  );
  await waitForFrames(page, 2);
}

/** Opens a floor route (deep link) as a returning visitor and waits for explore: no boot, no intro. */
export async function enterFloorRoute(page: Page, path: string, { tier = "lite" }: { tier?: string } = {}) {
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=${tier}`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

/** Waits until the Glass Drawer shows `room`. */
export async function waitForRoom(page: Page, room: string, timeout = 90_000) {
  await page.waitForFunction(
    (r) => {
      const s = (window as unknown as { __hq: { store: { getState: () => { activeRoom: string | null; phase: string } } } }).__hq.store.getState();
      return s.activeRoom === r && s.phase === "room";
    },
    room,
    { timeout },
  );
}

/** A floor pad as read from `window.__hq.layouts` (elevator call pad, L2 year teleporters). */
export interface PadSnapshot {
  id: string;
  kind: "elevator" | "teleport";
  at: { x: number; z: number };
  year?: number;
}

/** Floor pads of `floor` from the live layouts. */
export async function padsOf(page: Page, floor: string): Promise<PadSnapshot[]> {
  return page.evaluate((f) => (window as unknown as { __hq: { layouts: Record<string, { pads?: PadSnapshot[] }> } }).__hq.layouts[f].pads ?? [], floor);
}

/**
 * Drives the rover to `point` the way a mission leg does (an autopilot request, along the road on
 * walkable floors), then waits until the drive is over and the rover has nearly stopped.
 */
export async function driveTo(page: Page, point: { x: number; z: number }, timeout = 60_000) {
  await page.evaluate((p) => {
    (window as unknown as { __hq: { rover: { autopilot: unknown } } }).__hq.rover.autopilot = { point: p, state: "pending" };
  }, point);
  await page.waitForFunction(
    () => {
      const rover = (window as unknown as { __hq: { rover: { autopilot: { state: string } | null; speed: number } } }).__hq.rover;
      const state = rover.autopilot?.state;
      return state !== "pending" && state !== "driving" && rover.speed < 0.5;
    },
    null,
    { timeout },
  );
}

/** A point-and-go target as read from `window.__hq.interact` (current floor). */
export interface InteractSnapshot {
  id: string;
  kind: string;
  label: string;
  at: { x: number; z: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  action: { type: string; room?: string; year?: number; command?: string };
}

type ScreenPoint = { x: number; y: number };

type InteractWindow = Window & {
  __hq: {
    interact: {
      items: InteractSnapshot[];
      highlight: number;
      project: ((p: { x: number; y: number; z: number }) => ScreenPoint | null) | null;
      screenOf: (id: string, lift?: number) => ScreenPoint | null;
      screenAt: (id: string, fx: number, fz: number, lift: number) => ScreenPoint | null;
      hitAt: ((x: number, y: number) => string | null) | null;
    };
    rover: { x: number; y: number; z: number; cameraForward: { x: number; z: number } };
    store: { getState: () => { hover: { item: { id: string }; via: string } | null } };
  };
};

/** CSS px kept clear of the viewport edges on a desktop viewport (HUD panels are skipped through `elementFromPoint`). */
export const DESKTOP_SAFE = { top: 90, bottom: 90, side: 40 };
/** The same on a 390 x 844 phone (two top rows, the bottom band with the joystick). */
export const PHONE_SAFE = { top: 120, bottom: 140, side: 24 };

/** Where `visibleTarget` found each target clickable (fractions of its pick volume); `targetPoint` reuses it. */
type Sample = { fx: number; fz: number; lift: number };
const samples = new Map<string, Sample>();
const SAMPLES: Sample[] = [0.85, 0.5, 0.2].flatMap((lift) =>
  [0.5, 0.3, 0.7, 0.15, 0.85].flatMap((fx) => [0.5, 0.3, 0.7, 0.15, 0.85].map((fz) => ({ fx, fz, lift }))),
);

export interface TargetQuery {
  kinds: string[];
  safe?: { top: number; bottom: number; side: number };
  /** Skip targets whose approach point is closer than this to the rover (u). */
  minDistance?: number;
}

/** The current floor's targets. */
export async function interactablesOf(page: Page): Promise<InteractSnapshot[]> {
  return page.evaluate(() =>
    (window as unknown as InteractWindow).__hq.interact.items.map(({ id, kind, label, at, bounds, action }) => ({ id, kind, label, at, bounds, action })),
  );
}

type ClickableQuery = { kinds?: string[]; ids?: string[]; safe: { top: number; bottom: number; side: number }; minDistance: number; grid: Sample[] };
type ClickableHit = { item: InteractSnapshot; sample: Sample; point: ScreenPoint };

/**
 * Runs in the page (`page.evaluate(clickableHits, ...)`, so it is self-contained): the targets of `kinds` (or `ids`) at
 * least `minDistance` from the rover with the first `grid` sample where a click lands on them, nearest first. A sample
 * counts when it is inside the `safe` box, the bare canvas is under it, the raycast hits this very target (no other
 * volume in front) and it is 100 px or more from the rover (a click on the rover opens the Rover menu). Null before the
 * scene can pick.
 */
function clickableHits({ kinds, ids, safe, minDistance, grid }: ClickableQuery): ClickableHit[] | null {
  const { interact, rover } = (window as unknown as InteractWindow).__hq;
  const hitAt = interact.hitAt;
  if (!interact.project || !hitAt) return null;
  const self = interact.project({ x: rover.x, y: rover.y + 1, z: rover.z });
  const w = window.innerWidth;
  const h = window.innerHeight;
  const clickable = (id: string, s: Sample) => {
    const p = interact.screenAt(id, s.fx, s.fz, s.lift);
    if (!p || p.x < safe.side || p.x > w - safe.side || p.y < safe.top || p.y > h - safe.bottom) return null;
    if (document.elementFromPoint(p.x, p.y)?.tagName !== "CANVAS") return null;
    if (self && Math.hypot(p.x - self.x, p.y - self.y) <= 100) return null;
    return hitAt(p.x, p.y) === id ? p : null;
  };
  const out: (ClickableHit & { d: number })[] = [];
  for (const i of interact.items) {
    if ((kinds && !kinds.includes(i.kind)) || (ids && !ids.includes(i.id))) continue;
    const d = Math.hypot(i.at.x - rover.x, i.at.z - rover.z);
    if (d < minDistance) continue;
    for (const sample of grid) {
      const point = clickable(i.id, sample);
      if (!point) continue;
      const { id, kind, label, at, bounds, action } = i;
      out.push({ item: { id, kind, label, at, bounds, action }, sample, point, d });
      break;
    }
  }
  return out.sort((a, b) => a.d - b.d).map(({ item, sample, point }) => ({ item, sample, point }));
}

/** A screen point where a click lands on target `id` (same checks as `visibleTarget`), or null when none shows. */
export async function clickablePoint(page: Page, id: string, safe = DESKTOP_SAFE): Promise<ScreenPoint | null> {
  const hits = await page.evaluate(clickableHits, { ids: [id], safe, minDistance: 0, grid: SAMPLES });
  return hits?.[0]?.point ?? null;
}

/**
 * The target of `kinds` nearest to the rover whose pick volume shows on the bare canvas inside `safe`,
 * at least 100 px from the rover on screen (a click on the rover opens the Rover menu). Fails when none shows.
 */
export async function visibleTarget(page: Page, { kinds, safe = DESKTOP_SAFE, minDistance = 0 }: TargetQuery): Promise<InteractSnapshot> {
  const found = (await page.evaluate(clickableHits, { kinds, safe, minDistance, grid: SAMPLES }))?.[0];
  if (!found) throw new Error(`No ${kinds.join(" or ")} target on screen`);
  samples.set(found.item.id, found.sample);
  return found.item;
}

/**
 * Screen position (CSS px) of a target: where `visibleTarget` found it clickable, else near the top of its
 * pick volume (`lift`), so the rover in front of it never takes the click.
 */
export async function targetPoint(page: Page, id: string, lift?: number): Promise<ScreenPoint> {
  const sample = lift === undefined ? (samples.get(id) ?? { fx: 0.5, fz: 0.5, lift: 0.85 }) : { fx: 0.5, fz: 0.5, lift };
  const point = await page.evaluate(
    ({ id, sample }) => (window as unknown as InteractWindow).__hq.interact.screenAt(id, sample.fx, sample.fz, sample.lift),
    { id, sample },
  );
  if (!point) throw new Error(`${id} is not on screen`);
  return point;
}

/** The store's point-and-go target: `{ id, via }` or null. */
export async function hoveredTarget(page: Page): Promise<{ id: string; via: string } | null> {
  return page.evaluate(() => {
    const hover = (window as unknown as InteractWindow).__hq.store.getState().hover;
    return hover ? { id: hover.item.id, via: hover.via } : null;
  });
}

/** Moves the mouse onto a target and waits until it is the hovered one. */
export async function hoverTarget(page: Page, id: string): Promise<ScreenPoint> {
  const point = await targetPoint(page, id);
  await page.mouse.move(point.x, point.y, { steps: 4 });
  await expect.poll(() => hoveredTarget(page)).toEqual({ id, via: "pointer" });
  return point;
}

/** Screen position of open floor near the rover, toward the camera: no target covers it and no HUD sits over it. */
export async function emptyFloorPoint(page: Page): Promise<ScreenPoint> {
  const point = await page.evaluate(() => {
    const { interact, rover } = (window as unknown as InteractWindow).__hq;
    if (!interact.project) return null;
    const f = rover.cameraForward;
    const len = Math.hypot(f.x, f.z) || 1;
    const back = { x: -f.x / len, z: -f.z / len };
    const right = { x: -back.z, z: back.x };
    for (const d of [2.5, 4, 6]) {
      for (const side of [0, 2, -2]) {
        const x = rover.x + back.x * d + right.x * side;
        const z = rover.z + back.z * d + right.z * side;
        if (interact.items.some((i) => x >= i.bounds.minX && x <= i.bounds.maxX && z >= i.bounds.minZ && z <= i.bounds.maxZ)) continue;
        const p = interact.project({ x, y: rover.y, z });
        if (p && document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS") return p;
      }
    }
    return null;
  });
  if (!point) throw new Error("No open floor between the rover and the camera");
  return point;
}

/** Highlight opacity drawn this frame. */
export async function highlightOf(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as InteractWindow).__hq.interact.highlight);
}
