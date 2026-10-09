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
    if (!localStorage.getItem("hq:v1")) {
      localStorage.setItem("hq:v1", JSON.stringify({ state: { firstVisit: false, visited: [], locale: "en", sound: false }, version: 1 }));
    }
  });
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

export async function waitForPhase(page: Page, phase: string, timeout = 20_000) {
  await page.waitForFunction((p) => (window as unknown as HQWindow).__hq.store.getState().phase === p, phase, { timeout });
}

/** Waits until the elevator has delivered the rover to `floor`. */
export async function waitForFloor(page: Page, floor: string, timeout = 30_000) {
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
export async function waitForRoverMove(page: Page, from: { x: number; z: number }, distance: number, timeout = 15_000) {
  await page.waitForFunction(
    ({ from, distance }) => {
      const r = (window as unknown as HQWindow).__hq.store.getState().rover;
      return Math.hypot(r.x - from.x, r.z - from.z) >= distance;
    },
    { from, distance },
    { timeout },
  );
}
