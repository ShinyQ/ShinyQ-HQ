import { test } from "@playwright/test";
import { driveTo, enterHQ, expectRenderBudget, snapshot } from "./hq";

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
