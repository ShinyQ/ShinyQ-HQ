import { expect, test, type Locator, type Page } from "@playwright/test";
import en from "../messages/en.json";
import { asReturningVisitor, fastAnimations, skipFloorLines, snapshot, waitForHQ, waitForPhase, waitForRoverMove, waitForSceneLive } from "./hq";

// Camera eases, rides and the intro at the test-only animation speed.
test.beforeEach(({ context }) => fastAnimations(context));

test.describe.configure({ timeout: 120_000 });

/**
 * The phone-first 3D design (docs/superpowers/specs/2026-10-25-phone-first-3d-design.md): the bottom boot card with one
 * rolling log line, the phone landing view on L1, the docked Rover line with the bottom band stepping aside, and the
 * short phone tour. A tablet keeps today's boot card and tour.
 */
type Box = { x: number; y: number; width: number; height: number };
const rect = async (locator: Locator): Promise<Box> => (await locator.boundingBox())!;
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const dialog = (page: Page) => page.getByTestId("dialog-box");
const band = (page: Page) => page.getByTestId("hud-bottom");
/** Taps the toast's text near its left edge (a tap on the center can land on Skip). */
const tapText = (page: Page) => dialog(page).locator("p[aria-hidden='true']").first().tap({ position: { x: 12, y: 10 } });
const expectLine = (page: Page, key: string) => expect(dialog(page)).toHaveAttribute("data-line", key, { timeout: 30_000 });

/** The Ask AI pill shows only when Ask the HQ is enabled; the teaser already seen. */
async function mockAsk(page: Page) {
  await page.route("**/api/ask", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, turnstileSiteKey: null, asOf: "2026-10-11", maxLength: 300 }) }),
  );
  await page.addInitScript(() => sessionStorage.setItem("hq:ask-teaser", "1"));
}

/** A first visit in a new session: the boot plays, Boot rover starts the intro, the tour greets once it ends. */
async function freshVisit(page: Page) {
  await mockAsk(page);
  await page.goto("/en?tier=lite");
  await waitForHQ(page);
  const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
  await expect(start).not.toHaveAttribute("aria-disabled", "true", { timeout: 30_000 });
  await start.click();
  await waitForPhase(page, "intro");
  await waitForPhase(page, "explore", 30_000);
}

test.describe("phone (390x844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

  test("the boot card docks at the bottom with one rolling log line and the Classic site link beside Boot rover", async ({ page }) => {
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    const overlay = page.getByTestId("boot");
    const card = overlay.locator(".hq-boot-card");
    await expect(card).toBeVisible();
    const start = overlay.getByRole("button", { name: "Boot rover" });
    await expect(start).not.toHaveAttribute("aria-disabled", "true", { timeout: 30_000 });

    const cardBox = await rect(card);
    expect(cardBox.y, "the card sits in the lower half").toBeGreaterThanOrEqual(844 * 0.4);
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(844);
    const startBox = await rect(start);
    expect(startBox.y).toBeGreaterThanOrEqual(844 * 0.6);
    // The Classic site link shares the row with Boot rover (same height band).
    const link = overlay.getByRole("link", { name: /classic site/i });
    const linkBox = await rect(link);
    expect(Math.abs(linkBox.y + linkBox.height / 2 - (startBox.y + startBox.height / 2))).toBeLessThan(startBox.height);
    expect(overlaps(startBox, linkBox)).toBe(false);

    // Every line stays in the DOM; only the newest one is visible.
    const lines = overlay.locator(".hq-boot-log li");
    await expect.poll(() => lines.count()).toBeGreaterThan(1);
    const opacities = await lines.evaluateAll((lis) => lis.map((li) => ({ last: li.hasAttribute("data-last"), opacity: getComputedStyle(li).opacity })));
    expect(opacities.filter((l) => l.last)).toHaveLength(1);
    for (const l of opacities) expect(l.opacity === "0", JSON.stringify(opacities)).toBe(!l.last);
  });

  test("a session start lands on the phone view of L1 (primed zone, zoomed out)", async ({ page }) => {
    await asReturningVisitor(page);
    await skipFloorLines(page);
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    const read = () =>
      page.evaluate(() => {
        const r = (window as unknown as { __hq: { rover: { cameraView: string | null; cameraHeld: boolean; cameraZoom: number; cameraSettled: boolean } } }).__hq.rover;
        return { view: r.cameraView, held: r.cameraHeld, zoom: r.cameraZoom, settled: r.cameraSettled };
      });
    await expect.poll(async () => (await read()).view, { timeout: 30_000 }).toBe("L1:kiosk");
    // The phone landing zoom (OBSERVATORY_VIEW.landingPhone.zoom 2.1), not the 1.85 a drive back to the spawn gives.
    await expect.poll(async () => (await read()).zoom, { timeout: 30_000 }).toBeGreaterThan(2);
    await expect.poll(async () => (await read()).held, { timeout: 30_000 }).toBe(true);
  });

  test("the welcome docks and the band steps aside; point-go gives it back; choiceless lines are toasts above the joystick", async ({ page }) => {
    await freshVisit(page);
    await expectLine(page, "welcome");
    const box = dialog(page);
    await expect(box).toHaveAttribute("data-docked", "true");
    await expect(band(page)).toHaveAttribute("data-aside", "true");
    await expect(band(page)).toHaveAttribute("inert", "");

    // Docked: full width at the bottom, clear of the floor chip, the menu and the minimap.
    const docked = await rect(box);
    expect(docked.x).toBeGreaterThanOrEqual(0);
    expect(docked.x + docked.width).toBeLessThanOrEqual(390);
    expect(docked.y + docked.height).toBeLessThanOrEqual(844 - 12 + 1);
    expect(docked.y + docked.height).toBeGreaterThanOrEqual(844 - 12 - 40);
    for (const id of ["floor-chip", "hud-menu", "minimap"]) expect(overlaps(docked, await rect(page.getByTestId(id))), id).toBe(false);

    await box.getByRole("button", { name: en.dialog.onboarding.start }).tap();
    await expectLine(page, "point-go");
    await expect(page.getByTestId("hud-bottom")).not.toHaveAttribute("data-aside", "true");
    await expect(box).not.toHaveAttribute("data-docked", "true");
    await expect(box).toContainText(en.dialog.onboarding.pointGoPhone);
  });

  test("the phone tour: point-go, moved, the floor chip, the Rover menu, Ask AI, closing; choiceless lines stay toasts above the joystick", async ({ page }) => {
    await freshVisit(page);
    const box = dialog(page);
    await box.getByRole("button", { name: en.dialog.onboarding.start }).tap();
    await expectLine(page, "point-go");

    // The try-it step waits for the rover to move (the joystick is on screen; the keyboard drives it just the same).
    const from = (await snapshot(page)).rover;
    await page.keyboard.down("w");
    await waitForRoverMove(page, from, 2.5);
    await page.keyboard.up("w");
    await expectLine(page, "moved");
    await expect(box).toContainText(en.dialog.onboarding.movedPhone);

    // A line without choices is the slim toast: not docked, the band stays, and it clears the controls.
    await expect(box).not.toHaveAttribute("data-docked", "true");
    await expect(band(page)).not.toHaveAttribute("data-aside", "true");
    await expect(box).toHaveAttribute("data-typing", "false", { timeout: 15_000 });
    const toast = await rect(box);
    expect(toast.x).toBeGreaterThanOrEqual(0);
    expect(toast.x + toast.width).toBeLessThanOrEqual(390);
    expect(toast.y + toast.height).toBeLessThanOrEqual((await rect(page.getByTestId("joystick"))).y);
    for (const id of ["view-controls", "floor-chip", "hud-menu", "minimap"]) expect(overlaps(toast, await rect(page.getByTestId(id))), id).toBe(false);

    await tapText(page);
    await expectLine(page, "floor-chip");
    await expect(box).toContainText(en.dialog.onboarding.floorChip);
    await expect(box).not.toHaveAttribute("data-docked", "true");
    await expect(page.getByTestId("onboard-spotlight")).toBeVisible();
    await expect(box).toHaveAttribute("data-typing", "false", { timeout: 15_000 });
    const chip = await rect(box);
    expect(chip.y + chip.height).toBeLessThanOrEqual((await rect(page.getByTestId("joystick"))).y);
    for (const id of ["view-controls", "floor-chip", "hud-menu", "minimap"]) expect(overlaps(chip, await rect(page.getByTestId(id))), id).toBe(false);

    // The remaining lines go on with taps: the Rover menu, Ask AI (the pill shows), then the closing.
    for (const key of ["rover-menu", "ask-ai", "closing"]) {
      await tapText(page);
      if ((await box.getAttribute("data-expanded")) === "true") await tapText(page);
      await expectLine(page, key);
      await expect(box).toHaveAttribute("data-typing", "false", { timeout: 15_000 });
    }
    expect(await page.evaluate(() => localStorage.getItem("hq:onboarded"))).not.toBe("done");
  });
});

test.describe("tablet landscape (1194x834)", () => {
  test.use({ viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

  test("keeps the centered boot card, no phone landing zoom and the full tour (a move line first)", async ({ page }) => {
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    const overlay = page.getByTestId("boot");
    const card = await rect(overlay.locator(".hq-boot-card"));
    expect(card.y + card.height / 2, "centered, not docked").toBeLessThan(834 * 0.65);
    await expect(overlay.getByRole("button", { name: "Boot rover" })).toBeVisible();
    const visible = await overlay.locator(".hq-boot-log li").evaluateAll((lis) => lis.filter((li) => li.hasAttribute("data-shown") && getComputedStyle(li).opacity !== "0").length);
    expect(visible, "every shown log line stays visible").toBe(await overlay.locator(".hq-boot-log li[data-shown]").count());

    await page.goto("/en?tier=lite");
    await freshVisit(page);
    await expectLine(page, "welcome");
    await expect(dialog(page)).not.toHaveAttribute("data-docked", "true");
    await expect(band(page)).not.toHaveAttribute("data-aside", "true");
    await dialog(page).getByRole("button", { name: en.dialog.onboarding.start }).tap();
    await expectLine(page, "move");
    const zoom = await page.evaluate(() => (window as unknown as { __hq: { rover: { cameraZoom: number } } }).__hq.rover.cameraZoom);
    expect(zoom, "the tablet camera class has no phone landing zoom").toBeLessThan(2);
  });
});
