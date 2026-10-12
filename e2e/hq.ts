import { expect, type Page } from "@playwright/test";

export interface HQSnapshot {
  phase: string;
  floor: string;
  tier: string;
  ride: { from: string; to: string; stage: string } | null;
  rover: { x: number; z: number; heading: number; speed: number; face: string };
  firstVisit: boolean;
  drawCalls: number;
  triangles: number;
}

type HQWindow = Window & {
  __hq: {
    store: { getState: () => Omit<HQSnapshot, "drawCalls" | "triangles"> };
    rover: { drawCalls: number; triangles: number };
  };
};

/** Marks the visitor as returning, so the boot overlay is skipped and only the intro plays. */
export async function asReturningVisitor(page: Page) {
  await page.addInitScript(() => {
    // The Rover Terminal auto-opens once per browser; tests open it explicitly.
    localStorage.setItem("hq:terminal-seen", "1");
    if (!localStorage.getItem("hq:v1")) {
      localStorage.setItem("hq:v1", JSON.stringify({ state: { firstVisit: false, visited: [], locale: "en", sound: false }, version: 1 }));
    }
  });
}

/**
 * Playwright sets navigator.webdriver, which the gate treats as bot-like (page view, no 3D) unless the
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

/**
 * Collects page errors and any request to another origin. The local server does not apply the
 * production CSP from public/_headers, so a runtime CDN fetch only fails on Cloudflare.
 */
export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
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
    };
  });
}

/**
 * Per-floor render budget (appendix 08 draw calls; triangles measured at most 15.2k with the
 * neighbouring floors mounted, October 2026). Call after the scene settled.
 */
export const RENDER_BUDGET = { drawCalls: 150, triangles: 30_000 };
const BUDGET_SAMPLES = 5;

/**
 * Checks the worst of a few samples (the Director copies `renderer.info` every 0.1 s), so a
 * single frame cannot hide a spike. Counts must be finite: Infinity means a draw with an unbounded
 * instance count (see the troika patch in src/experience/text-config.ts).
 */
export async function expectRenderBudget(page: Page) {
  const samples: Pick<HQSnapshot, "drawCalls" | "triangles">[] = [];
  for (let i = 0; i < BUDGET_SAMPLES; i++) {
    if (i > 0) await page.waitForTimeout(300);
    const { drawCalls, triangles } = await snapshot(page);
    samples.push({ drawCalls, triangles });
  }
  for (const sample of samples) {
    expect(Number.isFinite(sample.drawCalls) && Number.isFinite(sample.triangles), JSON.stringify(samples)).toBe(true);
  }
  const drawCalls = Math.max(...samples.map((s) => s.drawCalls));
  const triangles = Math.max(...samples.map((s) => s.triangles));
  expect(Math.min(...samples.map((s) => s.drawCalls))).toBeGreaterThan(10);
  expect(drawCalls).toBeLessThan(RENDER_BUDGET.drawCalls);
  expect(triangles).toBeLessThan(RENDER_BUDGET.triangles);
}

export async function waitForHQ(page: Page) {
  await page.getByTestId("hq").waitFor();
  await page.waitForFunction(() => Boolean((window as unknown as Partial<HQWindow>).__hq));
}

export async function waitForPhase(page: Page, phase: string, timeout = 30_000) {
  await page.waitForFunction((p) => (window as unknown as HQWindow).__hq.store.getState().phase === p, phase, { timeout });
}

/** Waits until the elevator has delivered the rover to `floor`. */
export async function waitForFloor(page: Page, floor: string, timeout = 45_000) {
  await page.waitForFunction(
    (f) => {
      const s = (window as unknown as HQWindow).__hq.store.getState();
      return s.floor === f && s.ride === null && s.phase === "explore";
    },
    floor,
    { timeout },
  );
}

/** Opens /en (or `path`) as a returning visitor, skips the intro and waits for explore. */
export async function enterHQ(page: Page, { path = "/en", tier = "lite" }: { path?: string; tier?: string } = {}) {
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=${tier}`);
  await waitForHQ(page);
  await page.getByRole("button", { name: /Skip intro|Lewati intro/ }).click();
  await waitForPhase(page, "explore");
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

/** Resolves after `count` rendered animation frames (state that updates per frame, not per millisecond). */
export async function waitForFrames(page: Page, count = 10) {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const tick = () => (++seen >= count ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    count,
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
