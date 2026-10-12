import { expect, test, type Page } from "@playwright/test";
import {
  asReturningVisitor,
  collectErrors,
  expectRenderBudget,
  hoveredTarget,
  hoverTarget,
  snapshot,
  targetPoint,
  visibleTarget,
  waitForCameraSettle,
  waitForFrames,
  waitForHQ,
  waitForPhase,
  waitForRoom,
  waitForRoverMove,
  waitForSceneLive,
} from "./hq";

test.describe.configure({ timeout: 180_000 });

/** A floor route as a returning visitor with guided walks off (the first-visit prompt would cover the floor). */
async function openFloor(page: Page, path: string) {
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=lite&walk=off`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  await waitForCameraSettle(page);
}

type StoreWindow = Window & { __hq: { store: { getState: () => { mission: { status: string } | null; activeRoom: string | null } } } };
const roverAt = async (page: Page) => (await snapshot(page)).rover;
const missionStatus = (page: Page) => page.evaluate(() => (window as unknown as StoreWindow).__hq.store.getState().mission?.status ?? null);

test.describe("point and go with a mouse", () => {
  test("hovering a pod highlights it with its name, and a click drives to its door and opens the drawer", async ({ page }) => {
    const errors = collectErrors(page);
    await openFloor(page, "/en/labs");
    const pod = await visibleTarget(page, { kinds: ["door"] });
    expect(pod.action.type).toBe("open-room");
    await hoverTarget(page, pod.id);
    await expect.poll(() => page.evaluate(() => document.body.style.cursor)).toBe("pointer");
    // The outline, the destination ring and the floating label stay inside the floor budget.
    await waitForFrames(page, 10);
    await expectRenderBudget(page);
    const start = await roverAt(page);
    const point = await targetPoint(page, pod.id);
    await page.mouse.click(point.x, point.y);
    await waitForRoverMove(page, start, 2);
    await waitForRoom(page, pod.action.room!);
    const end = await roverAt(page);
    expect(Math.hypot(end.x - pod.at.x, end.z - pod.at.z)).toBeLessThan(1.5);
    expect(errors).toEqual([]);
  });

  test("moving off every target clears the highlight and the pointer cursor", async ({ page }) => {
    await openFloor(page, "/en/labs");
    const target = await visibleTarget(page, { kinds: ["door", "board"] });
    await hoverTarget(page, target.id);
    await page.mouse.move(4, 4, { steps: 4 });
    await expect.poll(() => hoveredTarget(page)).toBeNull();
    await expect.poll(() => page.evaluate(() => document.body.style.cursor)).toBe("");
  });

  test("manual driving cancels a point-and-go drive before it arrives", async ({ page }) => {
    await openFloor(page, "/en/labs");
    const pod = await visibleTarget(page, { kinds: ["door"], minDistance: 10 });
    const start = await roverAt(page);
    const point = await targetPoint(page, pod.id);
    await page.mouse.click(point.x, point.y);
    await waitForRoverMove(page, start, 1);
    await page.keyboard.down("s");
    await expect.poll(() => missionStatus(page)).toBe("cancelled");
    await page.keyboard.up("s");
    await waitForFrames(page, 30);
    const end = await roverAt(page);
    expect(Math.hypot(end.x - pod.at.x, end.z - pod.at.z)).toBeGreaterThan(1.5);
    expect(await page.evaluate(() => (window as unknown as StoreWindow).__hq.store.getState().activeRoom)).not.toBe(pod.action.room);
  });

  test("hovering on the Career Road stays inside the render budget", async ({ page }) => {
    await openFloor(page, "/en/journey");
    const target = await visibleTarget(page, { kinds: ["teleporter", "door"] });
    await hoverTarget(page, target.id);
    await waitForFrames(page, 10);
    await expectRenderBudget(page);
  });
});
