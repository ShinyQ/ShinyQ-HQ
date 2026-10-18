import { expect, test, type Page } from "@playwright/test";
import en from "../messages/en.json";
import {
  chooseMotion,
  asReturningVisitor,
  skipFloorLines,
  collectErrors,
  emptyFloorPoint,
  expectRenderBudget,
  highlightOf,
  hoveredTarget,
  hoverTarget,
  PHONE_SAFE,
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
  fastAnimations,
} from "./hq";

// Rides, drives, camera eases and the intro at the test-only animation speed (render-peak windows measure at real speed).
test.beforeEach(({ context }) => fastAnimations(context));

test.describe.configure({ timeout: 180_000 });

/** A floor route as a returning visitor without the first-visit floor line (it would cover the floor). */
async function openFloor(page: Page, path: string) {
  await asReturningVisitor(page);
  await skipFloorLines(page);
  await page.goto(`${path}?tier=lite`);
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
    const empty = await emptyFloorPoint(page);
    await page.mouse.move(empty.x, empty.y, { steps: 4 });
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

test.describe("point and go feedback", () => {
  test("the hovered target is announced for screen readers", async ({ page }) => {
    await openFloor(page, "/en/labs");
    const pod = await visibleTarget(page, { kinds: ["door"] });
    await hoverTarget(page, pod.id);
    await expect(page.getByTestId("interact-live")).toHaveText(en.hud.interact.live.replace("{label}", pod.label));
  });

  test("a click on empty floor does not move the rover and shows the hint once", async ({ page }) => {
    await openFloor(page, "/en/labs");
    const start = await roverAt(page);
    const empty = await emptyFloorPoint(page);
    await page.mouse.click(empty.x, empty.y);
    const hint = page.getByTestId("point-hint");
    await expect(hint).toHaveText(en.hud.interact.hintFine);
    await waitForFrames(page, 20);
    const still = await roverAt(page);
    expect(Math.hypot(still.x - start.x, still.z - start.z)).toBeLessThan(0.05);
    await expect(hint).toHaveCount(0, { timeout: 10_000 });
    await page.mouse.click(empty.x, empty.y);
    await waitForFrames(page, 20);
    await expect(hint).toHaveCount(0);
  });
});

test.describe("point and go on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

  test("a first tap selects a target and offers Go; Go drives there and opens it", async ({ page }) => {
    const errors = collectErrors(page);
    await openFloor(page, "/en/labs");
    const pod = await visibleTarget(page, { kinds: ["door"], safe: PHONE_SAFE });
    const start = await roverAt(page);
    const point = await targetPoint(page, pod.id);
    await page.touchscreen.tap(point.x, point.y);
    await expect.poll(() => hoveredTarget(page)).toEqual({ id: pod.id, via: "tap" });
    const go = page.getByTestId("interact-go");
    await expect(go).toBeVisible();
    await expect(go).toContainText(pod.label);
    await waitForFrames(page, 20);
    const still = await roverAt(page);
    expect(Math.hypot(still.x - start.x, still.z - start.z)).toBeLessThan(0.05);
    await go.tap();
    await waitForRoom(page, pod.action.room!);
    expect(errors).toEqual([]);
  });

  test("a second tap on the same target drives there; a tap on empty floor clears the selection", async ({ page }) => {
    await openFloor(page, "/en/labs");
    const pod = await visibleTarget(page, { kinds: ["door"], safe: PHONE_SAFE });
    const point = await targetPoint(page, pod.id);
    const go = page.getByTestId("interact-go");
    await page.touchscreen.tap(point.x, point.y);
    await expect(go).toBeVisible();
    const empty = await emptyFloorPoint(page);
    await page.touchscreen.tap(empty.x, empty.y);
    await expect(go).toHaveCount(0);
    await page.touchscreen.tap(point.x, point.y);
    await expect(go).toBeVisible();
    await page.touchscreen.tap(point.x, point.y);
    await waitForRoom(page, pod.action.room!);
  });
});

test.describe("point and go with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test.beforeEach(({ page }) => chooseMotion(page, "system"));

  test("the highlight holds still", async ({ page }) => {
    await openFloor(page, "/en/labs");
    const pod = await visibleTarget(page, { kinds: ["door", "board", "elevator-pad"] });
    await hoverTarget(page, pod.id);
    await waitForFrames(page, 5);
    expect(await highlightOf(page)).toBeCloseTo(0.9, 5);
    await waitForFrames(page, 20);
    expect(await highlightOf(page)).toBeCloseTo(0.9, 5);
  });
});

test.describe("L3 directory boards", () => {
  test("sweeping the pointer across each board hovers it once and never toggles while inside", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFloor(page, "/en/labs");
    type HoverLog = { __hover: string[]; __hq: { store: { getState: () => { hover: { item: { id: string } } | null }; subscribe: (f: (s: { hover: { item: { id: string } } | null }, p: { hover: { item: { id: string } } | null }) => void) => void } } };
    await page.evaluate(() => {
      const w = window as unknown as HoverLog;
      w.__hover = [];
      w.__hq.store.subscribe((s, p) => {
        const a = s.hover?.item.id ?? null;
        const b = p.hover?.item.id ?? null;
        if (a !== b) w.__hover.push(`${b}->${a}`);
      });
    });
    let swept = 0;
    for (const wing of ["software", "data", "ai"]) {
      const id = `L3:board:${wing}`;
      // Twenty points along the board face, at mid height, kept to points where the click raycast hits this board.
      const points = await page.evaluate((id) => {
        const it = (window as unknown as { __hq: { interact: { screenAt: (id: string, fx: number, fz: number, lift: number) => { x: number; y: number } | null; hitAt: (x: number, y: number) => string | null } } }).__hq.interact;
        const out: { x: number; y: number }[] = [];
        for (let i = 0; i < 20; i++) {
          const p = it.screenAt(id, 0.5, 0.05 + (0.9 * i) / 19, 0.6);
          if (p && p.x > 320 && p.x < innerWidth - 160 && p.y > 160 && p.y < innerHeight - 120 && document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS" && it.hitAt(p.x, p.y) === id) out.push(p);
        }
        return out;
      }, id);
      if (points.length < 5) continue;
      swept += 1;
      await page.mouse.move(points[0].x, points[0].y);
      await expect.poll(() => hoveredTarget(page)).toEqual({ id, via: "pointer" });
      await page.evaluate(() => {
        (window as unknown as HoverLog).__hover = [];
      });
      for (const p of points.slice(1)) {
        await page.mouse.move(p.x, p.y, { steps: 3 });
        await waitForFrames(page, 3);
        expect(await hoveredTarget(page)).toEqual({ id, via: "pointer" });
      }
      // Not a single hover change while the pointer stayed on the board.
      expect(await page.evaluate(() => (window as unknown as HoverLog).__hover)).toEqual([]);
    }
    expect(swept).toBeGreaterThanOrEqual(2);
  });
});
