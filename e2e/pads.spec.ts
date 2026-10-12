import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import en from "../messages/en.json";
import {
  asReturningVisitor,
  collectErrors,
  driveTo,
  expectRenderBudget,
  padsOf,
  targetPoint,
  waitForCameraSettle,
  waitForFloor,
  waitForFrames,
  waitForHQ,
  waitForPhase,
  waitForRoverMove,
  waitForSceneLive,
} from "./hq";

test.describe.configure({ timeout: 180_000 });

type PadWindow = Window & {
  __hq: {
    store: {
      getState: () => {
        picker: { kind: string; from?: number } | null;
        beam: unknown;
        closePicker: () => void;
        setBeam: (beam: unknown) => void;
      };
    };
    rover: { x: number; z: number; autopilot: unknown; target: unknown };
    camera: () => [number, number, number];
  };
};

/** L2 as a returning visitor without the first-visit walk prompt (it sits over the floor on phones). */
async function openJourney(page: Page) {
  await asReturningVisitor(page);
  await page.goto("/en/journey?tier=lite&walk=off");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

const picker = (page: Page) => page.evaluate(() => (window as unknown as PadWindow).__hq.store.getState().picker);
const beam = (page: Page) => page.evaluate(() => (window as unknown as PadWindow).__hq.store.getState().beam);
const roverAt = (page: Page) =>
  page.evaluate(() => {
    const r = (window as unknown as PadWindow).__hq.rover;
    return { x: r.x, z: r.z };
  });

test.describe("floor pads on the Career Road (L2)", () => {
  test("the elevator pad stays quiet under a deep link, then asks for a floor once the rover leaves and stops on it again", async ({ page }) => {
    const errors = collectErrors(page);
    await openJourney(page);
    const lift = (await padsOf(page, "L2")).find((p) => p.kind === "elevator")!;
    expect(lift.id).toBe("elevator:L2");
    await waitForFrames(page, 30);
    expect(await picker(page)).toBeNull();
    await expectRenderBudget(page);

    await driveTo(page, { x: lift.at.x + 10, z: lift.at.z });
    expect(await picker(page)).toBeNull();
    await driveTo(page, lift.at);
    await expect.poll(() => picker(page)).toEqual({ kind: "floor" });
    expect(errors).toEqual([]);
  });

  test("a year teleporter asks for a year, and a beam lands the rover on the target pad with the camera", async ({ page }) => {
    await openJourney(page);
    const teleports = (await padsOf(page, "L2")).filter((p) => p.kind === "teleport");
    expect(teleports.length).toBeGreaterThanOrEqual(5);
    const first = teleports[0];
    const target = teleports[4];
    await driveTo(page, first.at);
    await expect.poll(() => picker(page)).toEqual({ kind: "year", from: first.year });

    // What a year pick does: close the picker and let the Director run the beam to the target pad.
    await page.evaluate((t) => {
      const w = window as unknown as PadWindow;
      const s = w.__hq.store.getState();
      s.closePicker();
      s.setBeam({ pad: t.id, from: { x: w.__hq.rover.x, z: w.__hq.rover.z }, to: t.at, heading: Math.PI / 2, t: 0, jumped: false });
    }, target);
    await expect.poll(() => beam(page)).toBeNull();
    const at = await roverAt(page);
    expect(Math.hypot(at.x - target.at.x, at.z - target.at.z)).toBeLessThan(0.5);
    // The rail camera cut with the rover instead of gliding about 150 u along the road.
    await waitForFrames(page, 2);
    const [cx] = await page.evaluate(() => (window as unknown as PadWindow).__hq.camera());
    expect(Math.abs(cx - at.x)).toBeLessThan(2);
    await expect(page.getByTestId("year-chip")).toHaveAttribute("data-place", String(target.year));
    // Landing on the target pad does not open its picker.
    await waitForFrames(page, 30);
    expect(await picker(page)).toBeNull();
  });
});

test.describe("pad pickers", () => {
  test("the elevator pad lists every floor, Esc closes it for good, and a pick rides the elevator", async ({ page }) => {
    const errors = collectErrors(page);
    await openJourney(page);
    const lift = (await padsOf(page, "L2")).find((p) => p.kind === "elevator")!;
    const dialog = page.getByRole("dialog", { name: en.hud.pads.floorTitle });
    await driveTo(page, { x: lift.at.x + 10, z: lift.at.z });
    await driveTo(page, lift.at);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-option]")).toHaveCount(5);
    await expect(dialog.locator('[data-option="L3"]')).toContainText(en.hud.floorLabel.L3);
    await expect(dialog.locator('[data-option="L2"]')).toHaveAttribute("aria-current", "true");
    await expect(dialog.locator('[data-option="L2"]')).toBeFocused();
    await expect.poll(() => dialog.locator('[data-option="L1"] img').evaluate((img: HTMLImageElement) => (img.complete ? img.naturalWidth : 0))).toBeGreaterThan(0);
    const axe = await new AxeBuilder({ page }).include("[data-testid='pad-picker']").analyze();
    expect(axe.violations).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // Still on the pad: it stays quiet until the rover leaves.
    await waitForFrames(page, 30);
    await expect(dialog).toHaveCount(0);

    await driveTo(page, { x: lift.at.x + 10, z: lift.at.z });
    await driveTo(page, lift.at);
    await expect(dialog).toBeVisible();
    await page.keyboard.press("ArrowUp");
    await expect(dialog.locator('[data-option="L3"]')).toBeFocused();
    await page.keyboard.press("Enter");
    await waitForFloor(page, "L3");
    await expect(page.getByTestId("elevator-panel").locator('[data-floor="L3"]')).toHaveAttribute("aria-current", "true");
    // Stepping out onto the L3 elevator pad does not ask again.
    await waitForFrames(page, 30);
    await expect(dialog).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("a click on a teleporter drives there and opens the year picker, and a pick beams the rover to that plaza", async ({ page }) => {
    const errors = collectErrors(page);
    await openJourney(page);
    await waitForCameraSettle(page);
    const teleports = (await padsOf(page, "L2")).filter((p) => p.kind === "teleport");
    const first = teleports[0];
    const target = teleports[4];
    const before = await roverAt(page);
    const pad = await targetPoint(page, `L2:teleporter:${first.year}`);
    await page.mouse.click(pad.x, pad.y);
    const dialog = page.getByRole("dialog", { name: en.hud.pads.yearTitle });
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    const parked = await roverAt(page);
    expect(Math.hypot(parked.x - before.x, parked.z - before.z)).toBeGreaterThan(1);
    expect(Math.hypot(parked.x - first.at.x, parked.z - first.at.z)).toBeLessThan(1.4);
    await expect(dialog.locator("[data-option]")).toHaveCount(teleports.length);
    await expect(dialog.locator(`[data-option="${first.year}"]`)).toHaveAttribute("aria-current", "true");
    await expect(dialog.locator(`[data-option="${first.year}"]`)).toContainText(en.hud.career.prologue);

    await dialog.locator(`[data-option="${target.year}"]`).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => beam(page)).toBeNull();
    const at = await roverAt(page);
    expect(Math.hypot(at.x - target.at.x, at.z - target.at.z)).toBeLessThan(0.5);
    await expect(page.getByTestId("year-chip")).toHaveAttribute("data-place", String(target.year));
    const drive = await page.evaluate(() => {
      const r = (window as unknown as PadWindow).__hq.rover;
      return { autopilot: r.autopilot, target: r.target };
    });
    expect(drive).toEqual({ autopilot: null, target: null });
    await waitForFrames(page, 30);
    expect(await picker(page)).toBeNull();

    // Driving works at once from the new plaza.
    await page.keyboard.down("d");
    await waitForRoverMove(page, target.at, 3);
    await page.keyboard.up("d");
    expect(errors).toEqual([]);
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("the teleport is a short fade cut that still lands on the target pad", async ({ page }) => {
      await openJourney(page);
      const teleports = (await padsOf(page, "L2")).filter((p) => p.kind === "teleport");
      const target = teleports[2];
      await driveTo(page, teleports[0].at);
      const dialog = page.getByRole("dialog", { name: en.hud.pads.yearTitle });
      await expect(dialog).toBeVisible();
      await dialog.locator(`[data-option="${target.year}"]`).click();
      await expect.poll(() => beam(page)).toBeNull();
      const at = await roverAt(page);
      expect(Math.hypot(at.x - target.at.x, at.z - target.at.z)).toBeLessThan(0.5);
      await expect(page.getByTestId("beam-fade")).toHaveClass(/opacity-0/);
    });
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test("the floor picker is a bottom sheet and a tap rides the elevator", async ({ page }) => {
      await openJourney(page);
      const lift = (await padsOf(page, "L2")).find((p) => p.kind === "elevator")!;
      await driveTo(page, { x: lift.at.x + 10, z: lift.at.z });
      await driveTo(page, lift.at);
      const dialog = page.getByRole("dialog", { name: en.hud.pads.floorTitle });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute("data-sheet", "bottom");
      const box = (await dialog.boundingBox())!;
      expect(Math.abs(box.y + box.height - 844)).toBeLessThanOrEqual(1);
      expect(box.height).toBeLessThan(844 * 0.9);
      await dialog.locator('[data-option="L1"]').tap();
      await waitForFloor(page, "L1");
      await waitForFrames(page, 30);
      await expect(dialog).toHaveCount(0);
    });
  });
});
