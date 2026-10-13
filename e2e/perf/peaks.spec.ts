import { expect, test, type Page } from "@playwright/test";
import {
  enterFloorRoute,
  enterHQ,
  expectPeaksWithinBudget,
  hoverTarget,
  readRenderPeaks,
  resetRenderPeaks,
  visibleTarget,
  waitForCameraSettle,
  waitForFloor,
  waitForFrames,
  waitForHQ,
  waitForPhase,
} from "../hq";
import { writePerfEntry } from "./helpers";

/**
 * Peak draw calls outside settled spots (appendix 08 section 2, REPORT F5.4 and SP9): boot plus the
 * intro, every elevator ride, and hovering a target. Every rendered frame of the window counts. Rides
 * use the elevator panel (the wheel zooms the camera since round 5).
 */
test.describe.configure({ timeout: 180_000 });

type Tier = "lite" | "full";

/**
 * Scenarios measured over budget on main. Each id turns its test into an expected failure (`test.fail`),
 * so the gate holds everything else now and becomes a hard pass by itself: once a fix brings a peak
 * under budget, Playwright reports "expected to fail, but passed" and the id must be removed here. Add
 * only ids measured over budget, with their numbers in the PR.
 */
// Empty: the two rides P4 recorded here (lite ride-L3-L2 at 31306 triangles, full ride-L2-L1 at 34045)
// are under budget since the ride cull (tower/rideCull.ts) skips meshes hidden under a solid slab.
const KNOWN_OVER = new Set<string>([]);

function ratchet(id: string) {
  test.fail(KNOWN_OVER.has(id), `${id} is over budget on main (see KNOWN_OVER); remove it from KNOWN_OVER when this passes`);
}

/** Resets the peaks, runs the window, then checks and records every frame's worst. */
async function measure(page: Page, tier: Tier, scenario: string, window: () => Promise<void>) {
  await resetRenderPeaks(page);
  await window();
  await waitForFrames(page, 5);
  const peaks = await readRenderPeaks(page);
  writePerfEntry({ kind: "peak", tier, scenario, sceneCalls: peaks.sceneCalls, postCalls: peaks.postCalls, triangles: peaks.triangles, frames: peaks.frames });
  console.log(`${tier} ${scenario}: ${peaks.sceneCalls} scene + ${peaks.postCalls} post, ${peaks.triangles} tris over ${peaks.frames} frames`);
  expectPeaksWithinBudget(peaks, `${tier} ${scenario}`);
}

for (const tier of ["lite", "full"] as const) {
  test(`boot and intro stay under the scene budget (${tier})`, async ({ page }) => {
    ratchet(`${tier} intro`);
    // A first session: the boot and the intro play; the tour and hint bubbles stay out of the way.
    await page.addInitScript(() => {
      localStorage.setItem("hq:terminal-seen", "1");
      localStorage.setItem("hq:onboarded", "done");
      localStorage.setItem("hq:hints", "off");
    });
    await page.goto(`/en?tier=${tier}`);
    await waitForHQ(page);
    await measure(page, tier, "intro", async () => {
      const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
      await expect(start).not.toHaveAttribute("aria-disabled", "true", { timeout: 60_000 });
      await start.click();
      await waitForPhase(page, "intro");
      await waitForPhase(page, "explore", 60_000);
    });
  });

  test(`hovering a target stays under the scene budget (${tier})`, async ({ page }) => {
    ratchet(`${tier} hover`);
    await enterHQ(page, { tier });
    await waitForCameraSettle(page);
    const target = await visibleTarget(page, { kinds: ["elevator-pad", "station", "kiosk"], minDistance: 3 });
    await measure(page, tier, "hover", async () => {
      await hoverTarget(page, target.id);
      await waitForFrames(page, 20, 600);
    });
  });
}

for (const tier of ["lite", "full"] as const) {
  test(`boosting stays under the scene budget (${tier})`, async ({ page }) => {
    ratchet(`${tier} boost`);
    await enterHQ(page, { tier });
    await waitForCameraSettle(page);
    // The busiest floor at its busiest spot, plus the boost effects (trail, streaks, sparks: 3 calls).
    await measure(page, tier, "boost", async () => {
      await page.keyboard.down("Shift");
      await page.keyboard.down("s");
      await expect
        .poll(() => page.evaluate(() => (window as unknown as { __hq: { rover: { boostFx: number } } }).__hq.rover.boostFx), { timeout: 30_000 })
        .toBe(3);
      await waitForFrames(page, 20, 600);
      await page.keyboard.up("s");
      await page.keyboard.up("Shift");
    });
  });
}

const ROUTE: Record<string, string> = { L1: "/en", L2: "/en/journey", L3: "/en/labs", L4: "/en/library", RF: "/en/contact" };

/** Up one, up several, the longest descent and a descent onto L2 (its road mounts on arrival). */
const RIDES: { tier: Tier; from: string; to: string }[] = [
  { tier: "lite", from: "L1", to: "L2" },
  { tier: "lite", from: "L1", to: "L3" },
  { tier: "lite", from: "L1", to: "L4" },
  { tier: "lite", from: "L1", to: "RF" },
  { tier: "lite", from: "RF", to: "L1" },
  { tier: "lite", from: "L3", to: "L2" },
  { tier: "full", from: "L1", to: "L2" },
  { tier: "full", from: "L2", to: "L1" },
];

for (const { tier, from, to } of RIDES) {
  test(`the ride ${from} to ${to} stays under the scene budget (${tier})`, async ({ page }) => {
    const scenario = `ride-${from}-${to}`;
    ratchet(`${tier} ${scenario}`);
    await enterFloorRoute(page, ROUTE[from], { tier });
    await waitForCameraSettle(page);
    await measure(page, tier, scenario, async () => {
      await page.getByRole("navigation", { name: "Elevator" }).locator(`[data-floor="${to}"]`).click();
      await waitForFloor(page, to);
    });
  });
}
