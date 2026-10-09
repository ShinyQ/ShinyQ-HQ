import type { Page } from "@playwright/test";

export interface HQSnapshot {
  phase: string;
  floor: string;
  tier: string;
  ride: { from: string; to: string; stage: string } | null;
  rover: { x: number; z: number; heading: number; speed: number; face: string };
  firstVisit: boolean;
  drawCalls: number;
}

type HQWindow = Window & {
  __hq: {
    store: { getState: () => Omit<HQSnapshot, "drawCalls"> };
    rover: { drawCalls: number };
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
 * Collects page errors and any request to another origin. The local server does not apply the
 * production CSP from public/_headers, so a runtime CDN fetch only fails on Cloudflare.
 */
export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") errors.push(`cross-origin request: ${url.href}`);
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
    };
  });
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

/** Waits until the follow camera has settled after the intro (the spring is slow on SwiftShader). */
export async function waitForCameraSettle(page: Page) {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const w = window as unknown as { __hq: { camera?: () => [number, number, number] } };
        const read = () => w.__hq.camera?.() ?? [0, 0, 0];
        const a = read();
        setTimeout(() => {
          const b = read();
          resolve(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.05);
        }, 300);
      }),
    null,
    { timeout: 20_000, polling: 100 },
  );
}

/** Opens a floor route (deep link) as a returning visitor and waits for explore: no boot, no intro. */
export async function enterFloorRoute(page: Page, path: string, { tier = "lite" }: { tier?: string } = {}) {
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=${tier}`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
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
