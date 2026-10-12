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

/**
 * Marks the visitor as returning in this browser session: the boot and the intro already played
 * (`hq:intro`), so any route opens straight in. Nothing can skip them any more.
 */
export async function asReturningVisitor(page: Page) {
  await page.addInitScript(() => {
    // The Rover Terminal auto-opens once per browser; tests open it explicitly.
    localStorage.setItem("hq:terminal-seen", "1");
    sessionStorage.setItem("hq:intro", "seen");
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

/**
 * The target of `kinds` nearest to the rover whose pick volume shows on the bare canvas inside `safe`,
 * at least 100 px from the rover on screen (a click on the rover opens Ask Rover). Fails when none shows.
 */
export async function visibleTarget(page: Page, { kinds, safe = DESKTOP_SAFE, minDistance = 0 }: TargetQuery): Promise<InteractSnapshot> {
  const found = await page.evaluate(
    ({ kinds, safe, minDistance, grid }) => {
      const { interact, rover } = (window as unknown as InteractWindow).__hq;
      if (!interact.project || !interact.hitAt) return null;
      const self = interact.project({ x: rover.x, y: rover.y + 1, z: rover.z });
      const w = window.innerWidth;
      const h = window.innerHeight;
      // A sample counts when it is inside the safe box, the bare canvas is under it, the raycast hits this very
      // target (no other volume in front) and it is 100 px or more from the rover (a click on the rover opens Ask Rover).
      const clickable = (id: string, s: { fx: number; fz: number; lift: number }) => {
        const p = interact.screenAt(id, s.fx, s.fz, s.lift);
        if (!p || p.x < safe.side || p.x > w - safe.side || p.y < safe.top || p.y > h - safe.bottom) return false;
        if (document.elementFromPoint(p.x, p.y)?.tagName !== "CANVAS") return false;
        if (self && Math.hypot(p.x - self.x, p.y - self.y) <= 100) return false;
        return interact.hitAt!(p.x, p.y) === id;
      };
      const hits = interact.items
        .filter((i) => kinds.includes(i.kind) && Math.hypot(i.at.x - rover.x, i.at.z - rover.z) >= minDistance)
        .map((i) => ({ i, d: Math.hypot(i.at.x - rover.x, i.at.z - rover.z), s: grid.find((s) => clickable(i.id, s)) }))
        .filter(({ s }) => s !== undefined)
        .sort((a, b) => a.d - b.d);
      const hit = hits[0];
      return hit ? { item: { id: hit.i.id, kind: hit.i.kind, label: hit.i.label, at: hit.i.at, bounds: hit.i.bounds, action: hit.i.action }, sample: hit.s! } : null;
    },
    { kinds, safe, minDistance, grid: SAMPLES },
  );
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
