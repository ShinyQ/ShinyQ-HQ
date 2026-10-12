import { expect, test, type Page } from "@playwright/test";
import { stationOf } from "../src/experience/floors/lobby/hallLayout";
import { asReturningVisitor, collectErrors, driveTo, enterHQ, expectRenderBudget, snapshot, waitForHQ, waitForPhase, waitForRoom } from "./hq";

/**
 * L1 Highlights Hall (docs/superpowers/plans/2026-10-12-highlights-hall.md). The probe below prints
 * the Lobby's draw calls at the spawn and on the passage south of the certification wall, so every
 * later task can compare against today's numbers (the Lobby is the busiest floor).
 */
test.describe.configure({ timeout: 180_000 });

test("L1 draw calls: plaza and passage", async ({ page }) => {
  for (const tier of ["lite", "full"] as const) {
    await enterHQ(page, { tier });
    await page.waitForTimeout(1500);
    const spawn = await snapshot(page);
    await driveTo(page, { x: 20, z: 15 });
    await page.waitForTimeout(1500);
    const passage = await snapshot(page);
    console.log(`L1 ${tier}: spawn ${spawn.drawCalls} calls, ${spawn.triangles} triangles; passage ${passage.drawCalls} calls, ${passage.triangles} triangles`);
    await expectRenderBudget(page);
  }
});

async function expectRoverNear(page: Page, point: { x: number; z: number }, tolerance = 1.5) {
  const { rover } = await snapshot(page);
  expect(Math.hypot(rover.x - point.x, rover.z - point.z)).toBeLessThan(tolerance);
}

test("a #highlights-<station> link on the landing opens that station at its door", async ({ page }) => {
  const errors = collectErrors(page);
  await asReturningVisitor(page);
  await page.goto("/en?tier=lite#highlights-contact");
  await waitForHQ(page);
  await waitForRoom(page, "L1:highlights-contact");
  await expectRoverNear(page, stationOf("contact").pad);
  await page.keyboard.press("Escape");
  await waitForPhase(page, "explore");
  await expect(page).toHaveURL(/\/en\?tier=lite/);
  expect(errors).toEqual([]);
});
