import { expect, test, type Locator, type Page } from "@playwright/test";
import en from "../messages/en.json";
import { asReturningVisitor, enterHQ, fastAnimations, hoveredTarget, PHONE_SAFE, skipFloorLines, snapshot, targetPoint, visibleTarget, waitForCameraSettle, waitForFloor, waitForHQ, waitForPhase, waitForRoverMove, waitForSceneLive } from "./hq";

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
/** A toast clamps a long line to four rows: the first tap may only expand it, so tap again while the same line stays up. */
async function tapThrough(page: Page, from: string) {
  await tapText(page);
  await expect
    .poll(async () => (await dialog(page).getAttribute("data-line")) !== from || (await dialog(page).getAttribute("data-expanded")) === "true")
    .toBe(true);
  if ((await dialog(page).getAttribute("data-line")) === from) await tapText(page);
}

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
    // The newest line fades in (0.2 s) as Boot rover enables: wait for it to finish, never read it mid-fade.
    await expect.poll(() => overlay.locator(".hq-boot-log li[data-last]").evaluate((li) => getComputedStyle(li).opacity)).toBe("1");
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

  test("the welcome docks and the band steps aside; point-go gives it back; choiceless lines are toasts at the top", async ({ page }) => {
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

  test("the phone tour: point-go, moved, the floor chip, the Rover menu, Ask AI, closing; choiceless lines stay toasts at the top", async ({ page }) => {
    await freshVisit(page);
    const box = dialog(page);
    await box.getByRole("button", { name: en.dialog.onboarding.start }).tap();
    await expectLine(page, "point-go");

    // The try-it step waits for the rover to move (the joystick is on screen; the keyboard drives it just the same).
    const from = (await snapshot(page)).rover;
    await page.keyboard.down("w");
    try {
      await waitForRoverMove(page, from, 2.5);
    } finally {
      await page.keyboard.up("w");
    }
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
    for (const id of ["view-controls", "floor-chip", "hud-menu", "minimap", "boost"]) expect(overlaps(toast, await rect(page.getByTestId(id))), id).toBe(false);

    await tapThrough(page, "moved");
    await expectLine(page, "floor-chip");
    await expect(box).toContainText(en.dialog.onboarding.floorChip);
    await expect(box).not.toHaveAttribute("data-docked", "true");
    await expect(page.getByTestId("onboard-spotlight")).toBeVisible();
    await expect(box).toHaveAttribute("data-typing", "false", { timeout: 15_000 });
    const chip = await rect(box);
    expect(chip.y + chip.height).toBeLessThanOrEqual((await rect(page.getByTestId("joystick"))).y);
    for (const id of ["view-controls", "floor-chip", "hud-menu", "minimap"]) expect(overlaps(chip, await rect(page.getByTestId(id))), id).toBe(false);

    // The remaining lines go on with taps: the Rover menu, Ask AI (the pill shows), then the closing.
    let line = "floor-chip";
    for (const key of ["rover-menu", "ask-ai", "closing"]) {
      await tapThrough(page, line);
      await expectLine(page, key);
      await expect(box).toHaveAttribute("data-typing", "false", { timeout: 15_000 });
      line = key;
    }
    expect(await page.evaluate(() => localStorage.getItem("hq:onboarded"))).not.toBe("done");
  });
});

/** Tablets keep the centered boot card, the raised dialog and the full tour (a move line first). */
const tabletBoot = async (page: Page) => {
  await page.goto("/en?tier=lite");
  await waitForHQ(page);
  const overlay = page.getByTestId("boot");
  const start = overlay.getByRole("button", { name: "Boot rover" });
  await expect(start).not.toHaveAttribute("aria-disabled", "true", { timeout: 30_000 });
  return { overlay, card: await rect(overlay.locator(".hq-boot-card")) };
};

async function expectCenteredBootLog(overlay: Locator) {
  const lines = await overlay.locator(".hq-boot-log li").evaluateAll((lis) => ({
    visible: lis.filter((li) => li.hasAttribute("data-shown") && getComputedStyle(li).opacity !== "0").length,
    shown: lis.filter((li) => li.hasAttribute("data-shown")).length,
  }));
  expect(lines.visible, "every shown log line stays visible").toBe(lines.shown);
}

async function expectTabletWelcomeAndTour(page: Page) {
  await freshVisit(page);
  await expectLine(page, "welcome");
  await expect(dialog(page)).not.toHaveAttribute("data-docked", "true");
  await expect(band(page)).not.toHaveAttribute("data-aside", "true");
  await dialog(page).getByRole("button", { name: en.dialog.onboarding.start }).tap();
  await expectLine(page, "move");
}

test.describe("tablet landscape (1194x834)", () => {
  test.use({ viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

  test("keeps the centered boot card with every shown log line visible", async ({ page }) => {
    const { overlay, card } = await tabletBoot(page);
    expect(card.y + card.height / 2, "centered, not docked").toBeLessThan(834 * 0.65);
    await expectCenteredBootLog(overlay);
  });

  test("keeps the raised welcome and the full tour (a move line first)", async ({ page }) => {
    await expectTabletWelcomeAndTour(page);
  });

  test("has no phone landing zoom (the tablet camera class)", async ({ page }) => {
    await asReturningVisitor(page);
    await skipFloorLines(page);
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    const zoom = await page.evaluate(() => (window as unknown as { __hq: { rover: { cameraZoom: number } } }).__hq.rover.cameraZoom);
    expect(zoom, "the landscape tablet camera class has no phone landing zoom").toBeLessThan(2);
  });
});

// Portrait tablets keep the viewport class `tablet` (the card CSS only applies to portrait phones up to 639px), so they
// stay centered and raised; their camera class is `mobile`, so the zoom is deliberately not asserted here.
test.describe("tablet portrait (834x1194)", () => {
  test.use({ viewport: { width: 834, height: 1194 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

  test("keeps the centered boot card, not docked", async ({ page }) => {
    const { overlay, card } = await tabletBoot(page);
    expect(card.y + card.height / 2, "centered, not docked").toBeLessThan(1194 * 0.65);
    expect(card.y + card.height, "not pinned to the bottom edge").toBeLessThan(1194 - 40);
    await expectCenteredBootLog(overlay);
  });

  test("keeps the raised welcome and the full tour (a move line first)", async ({ page }) => {
    await expectTabletWelcomeAndTour(page);
  });
});

/**
 * Phone-first part 2 (docs/superpowers/specs/2026-10-28-phone-first-3d-part-2-design.md): a floor's first-visit line is a
 * top toast that covers neither the rover nor a control and shows whole, on portrait and landscape phones; the phone
 * menu loads its sheet on the first tap and names no keys.
 */
type PartTwoWindow = {
  __hq: {
    store: { getState: () => { goToFloor: (f: string) => void } };
    rover: { x: number; y: number; z: number };
    interact: { project: ((p: { x: number; y: number; z: number }) => { x: number; y: number } | null) | null };
  };
};

/** The rover's projected box: its footprint corners from its floor (`rover.y`) to its antenna. */
async function roverBox(page: Page): Promise<Box> {
  const points = await page.evaluate(() => {
    const hq = (window as unknown as PartTwoWindow).__hq;
    const out: { x: number; y: number }[] = [];
    for (const dx of [-0.6, 0.6]) for (const dz of [-0.6, 0.6]) for (const y of [0, 1.5]) {
      const p = hq.interact.project?.({ x: hq.rover.x + dx, y: hq.rover.y + y, z: hq.rover.z + dz });
      if (p) out.push(p);
    }
    return out;
  });
  // Corners off screen project to null; the box spans the ones on screen.
  expect(points.length).toBeGreaterThan(0);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

const CONTROLS = ["joystick", "boost", "view-reset", "floor-chip", "hud-menu", "hud-minimap"];

for (const viewport of [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
  { width: 844, height: 390 },
]) {
  test.describe(`phone part 2 (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

    test("each floor's first-visit line is a whole top toast clear of the rover and every control", async ({ page }) => {
      test.setTimeout(300_000);
      await mockAsk(page);
      // B1 already unlocked, so its offer on the fifth floor never takes the line's place.
      await page.addInitScript(() =>
        localStorage.setItem("hq:v1", JSON.stringify({ state: { firstVisit: false, visited: [], locale: "en", sound: false, floorsSeen: ["L1", "L2", "L3", "L4", "RF"], b1Unlocked: true }, version: 3 })),
      );
      await asReturningVisitor(page);
      await page.goto("/en?tier=lite");
      await waitForHQ(page);
      await waitForPhase(page, "explore");
      await waitForSceneLive(page);
      for (const floor of ["L2", "L3", "L4", "RF"]) {
        await page.evaluate((f) => (window as unknown as PartTwoWindow).__hq.store.getState().goToFloor(f), floor);
        await waitForFloor(page, floor);
        const box = dialog(page);
        await expectLine(page, "floor");
        await expect(box).toHaveAttribute("data-typing", "false", { timeout: 15_000 });
        await expect(box).not.toHaveAttribute("data-docked", "true");
        const toast = await rect(box);
        expect(toast.x, floor).toBeGreaterThanOrEqual(0);
        expect(toast.x + toast.width, floor).toBeLessThanOrEqual(viewport.width);
        for (const id of [...CONTROLS, "ask-pill"]) {
          const control = page.getByTestId(id);
          if (!(await control.isVisible())) continue;
          expect(overlaps(toast, await rect(control)), `${floor} ${id}`).toBe(false);
        }
        expect(overlaps(toast, await roverBox(page)), `${floor} rover`).toBe(false);
        // Whole: the floor line fits the four rows, so the clamp never cuts it.
        const clamped = await box.locator("p[aria-hidden='true']").first().evaluate((el) => el.scrollHeight > el.clientHeight);
        expect(clamped, `${floor} line clamped`).toBe(false);
        await tapText(page);
        await expect(box).toHaveCount(0, { timeout: 15_000 });
      }
    });
  });
}

test.describe("phone menu (390x844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

  test("the first tap loads the sheet; rotate names no key, and the pad picker hint is a touch hint", async ({ page }) => {
    await asReturningVisitor(page);
    await skipFloorLines(page);
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await page.getByTestId("hud-menu").tap();
    const sheet = page.getByTestId("menu-sheet");
    const rotate = sheet.getByRole("button", { name: en.hud.view.rotateLeft });
    await expect(rotate).toBeVisible({ timeout: 15_000 });
    await expect(rotate).toHaveAttribute("aria-keyshortcuts", "Q");
    await expect(rotate.locator("kbd")).toBeHidden();
    await expect(sheet).not.toContainText("(Q)");
    await expect(sheet.getByTestId("setting-sound")).toContainText(en.hud.settings.sound.hint);
    await expect(sheet.getByTestId("setting-sound").locator("kbd")).toBeHidden();
  });
});

test.describe("desktop keys (1440x900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("keeps the key hints: the view controls' tooltips and the sound key cap", async ({ page }) => {
    await asReturningVisitor(page);
    await skipFloorLines(page);
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    const controls = page.getByTestId("view-controls");
    await expect(controls.getByRole("button", { name: en.hud.view.rotateLeft })).toHaveAttribute("title", `${en.hud.view.rotateLeft} (Q)`);
    await expect(controls.getByRole("button", { name: en.hud.view.rotateLeft })).toHaveAttribute("aria-keyshortcuts", "Q");
    await page.keyboard.press(",");
    const sound = page.getByTestId("setting-sound");
    await expect(sound.locator("kbd")).toBeVisible({ timeout: 15_000 });
    await expect(sound.locator("kbd")).toHaveText("M");
  });
});

/**
 * Phone-first part 3 (docs/superpowers/specs/2026-10-29-phone-first-3d-part-3-design.md): the floating stick on phones
 * (a drag in the lower-left drive zone drives, a still tap there stays point-and-go's, the rest of the screen looks),
 * Boost above Reset view, and the one-time tilt hint after the tour's closing line on portrait touch screens.
 */
type Point = { x: number; y: number };

/** A real touch drag through CDP that stays down until `end()` (40 ms between moves, as `touch` in experience.spec.ts). */
async function press(page: Page, points: Point[]) {
  const cdp = await page.context().newCDPSession(page);
  const [first, ...rest] = points;
  let timestamp = Date.now() / 1000;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [first], timestamp });
  for (const p of rest) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [p], timestamp: (timestamp += 0.04) });
  return async () => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: Date.now() / 1000 });
    await cdp.detach();
  };
}

/** Two still taps 120 ms apart at one point, with their own input times (see `doubleTapJoystick` in touch.ts). */
async function doubleTap(page: Page, p: Point) {
  const cdp = await page.context().newCDPSession(page);
  const t = Date.now() / 1000;
  await Promise.all([
    cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p], timestamp: t }),
    cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: t + 0.05 }),
    cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p], timestamp: t + 0.17 }),
    cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: t + 0.22 }),
  ]);
  await cdp.detach();
}

/** A landscape phone's HUD-free box for `visibleTarget` (under the chip row, clear of the right column). */
const LANDSCAPE_SAFE = { top: 80, bottom: 40, side: 110 };
const camera = (page: Page) => page.evaluate(() => (window as unknown as { __hq: { camera: () => number[] } }).__hq.camera());
/** The world (the canvas) is what a touch at `p` lands on: no HUD control or dialog over it. */
const onWorld = (page: Page, p: Point) => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === "CANVAS", p);

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  const landscape = viewport.width > viewport.height;
  /** A point well inside the drive zone (portrait: the left half of the bottom 40%; landscape: the left 40% under the chip row). */
  const inZone: Point = landscape ? { x: 0.2 * viewport.width, y: 0.62 * viewport.height } : { x: 0.25 * viewport.width, y: 0.78 * viewport.height };
  /** A point outside it, on the look side. */
  const outside: Point = landscape ? { x: 0.62 * viewport.width, y: 0.55 * viewport.height } : { x: 0.7 * viewport.width, y: 0.72 * viewport.height };

  test.describe(`phone part 3 (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

    test("a drag in the drive zone drives with the stick under the thumb; a drag outside it looks; Boost sits above Reset view", async ({ page }) => {
      await enterHQ(page);
      await waitForCameraSettle(page);
      const ring = page.getByTestId("joystick");
      await expect(ring).toHaveAttribute("data-floating", "rest");
      expect(await onWorld(page, inZone), "the drive zone point is open world").toBe(true);

      // Boost: bottom right, above Reset view, clear of the ring.
      const boost = await rect(page.getByTestId("boost"));
      const reset = await rect(page.getByTestId("view-reset"));
      expect(boost.x).toBeGreaterThan(viewport.width / 2);
      expect(boost.y + boost.height).toBeLessThanOrEqual(reset.y);
      expect(overlaps(boost, await rect(ring))).toBe(false);

      // Drive: the stick appears where the thumb came down and the rover moves.
      const from = (await snapshot(page)).rover;
      const end = await press(page, [inZone, { x: inZone.x, y: inZone.y - 30 }, { x: inZone.x, y: inZone.y - 55 }]);
      const live = page.getByTestId("joystick-live");
      await expect(live).toBeVisible();
      const stick = await rect(live);
      expect(Math.abs(stick.x + stick.width / 2 - inZone.x)).toBeLessThan(2);
      expect(Math.abs(stick.y + stick.height / 2 - inZone.y)).toBeLessThan(2);
      await expect(ring).toHaveAttribute("data-floating", "live");
      await waitForRoverMove(page, from, 2);
      await end();
      await expect(live).toBeHidden();
      await expect(ring).toHaveAttribute("data-floating", "rest");

      // Look: a drag outside the zone turns the view and never drives.
      await waitForCameraSettle(page);
      const parked = (await snapshot(page)).rover;
      const before = await camera(page);
      const look = await press(page, [outside, { x: outside.x - 40, y: outside.y }, { x: outside.x - 90, y: outside.y }]);
      await look();
      await waitForCameraSettle(page);
      const after = await camera(page);
      expect(Math.hypot(after[0] - before[0], after[2] - before[2]), "the view turned").toBeGreaterThan(0.5);
      const still = (await snapshot(page)).rover;
      expect(Math.hypot(still.x - parked.x, still.z - parked.z)).toBeLessThan(0.05);
      await expect(live).toBeHidden();
    });

    test("a still tap in the drive zone stays point-and-go's; a double tap there on open floor toggles Boost", async ({ page }) => {
      await enterHQ(page);
      await waitForCameraSettle(page);
      // Select a target with one tap, then a still tap on open world in the zone reaches the scene and clears it.
      const target = await visibleTarget(page, { kinds: ["door", "kiosk", "station", "board", "elevator-pad"], safe: landscape ? LANDSCAPE_SAFE : PHONE_SAFE });
      const point = await targetPoint(page, target.id);
      await page.touchscreen.tap(point.x, point.y);
      await expect.poll(() => hoveredTarget(page)).toMatchObject({ via: "tap" });
      const selected = await hoveredTarget(page);
      const rover = (await snapshot(page)).rover;
      await page.touchscreen.tap(inZone.x, inZone.y);
      await expect.poll(async () => JSON.stringify(await hoveredTarget(page))).not.toBe(JSON.stringify(selected));
      expect(Math.hypot((await snapshot(page)).rover.x - rover.x, (await snapshot(page)).rover.z - rover.z)).toBeLessThan(0.05);
      await expect(page.getByTestId("joystick-live")).toBeHidden();

      // With nothing selected, a double tap in the zone toggles Boost (the same state as the button).
      if (await hoveredTarget(page)) await page.touchscreen.tap(inZone.x, inZone.y);
      await expect.poll(() => hoveredTarget(page)).toBeNull();
      const button = page.getByTestId("boost");
      await expect(button).toHaveAttribute("aria-pressed", "false");
      await page.waitForTimeout(400);
      await doubleTap(page, inZone);
      await expect(button).toHaveAttribute("aria-pressed", "true");
    });
  });
}

test.describe("phone part 3: the drive zone steps aside (390x844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

  test("a docked line turns the drive zone off", async ({ page }) => {
    await freshVisit(page);
    await expectLine(page, "welcome");
    await expect(dialog(page)).toHaveAttribute("data-docked", "true");
    await expect(band(page)).toHaveAttribute("data-aside", "true");
    const docked = await rect(dialog(page));
    // A zone point above the docked card: the world gets the touch, but the stick is off.
    const p = { x: 90, y: Math.max(0.6 * 844 + 8, docked.y - 30) };
    test.skip(p.y >= docked.y, "the docked card covers the whole drive zone");
    expect(await onWorld(page, p)).toBe(true);
    const from = (await snapshot(page)).rover;
    const end = await press(page, [p, { x: p.x, y: p.y - 30 }, { x: p.x, y: p.y - 55 }]);
    await page.waitForTimeout(600);
    await end();
    await expect(page.getByTestId("joystick-live")).toHaveCount(0);
    const now = (await snapshot(page)).rover;
    expect(Math.hypot(now.x - from.x, now.z - from.z)).toBeLessThan(0.05);
  });
});

/** Plays a fresh session's tour to its closing line: Show me around, drive for the try-it step, tap through the rest. */
async function tourToClosing(page: Page) {
  await freshVisit(page);
  await expectLine(page, "welcome");
  await dialog(page).getByRole("button", { name: en.dialog.onboarding.start }).tap();
  for (let i = 0; i < 12; i++) {
    await expect(dialog(page)).toHaveAttribute("data-typing", "false", { timeout: 15_000 });
    const line = (await dialog(page).getAttribute("data-line"))!;
    if (line === "closing") return;
    if (line === "point-go") {
      const from = (await snapshot(page)).rover;
      await page.keyboard.down("w");
      try {
        await waitForRoverMove(page, from, 2.5);
      } finally {
        await page.keyboard.up("w");
      }
      await expect.poll(async () => dialog(page).getAttribute("data-line")).not.toBe("point-go");
      continue;
    }
    await tapThrough(page, line);
    await expect.poll(async () => dialog(page).getAttribute("data-line"), { timeout: 30_000 }).not.toBe(line);
  }
  throw new Error("the tour never reached its closing line");
}

const TILT_TEXT = en.dialog.onboarding.tilt;

test.describe("tilt hint on a portrait phone (390x844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

  test("follows the closing line once as a top toast; a tap clears it; Replay tutorial never shows it again", async ({ page }) => {
    await tourToClosing(page);
    // The closing line fits its toast, so it moves on by itself (a tap here could land on the next line).
    await expectLine(page, "tilt");
    const box = dialog(page);
    await expect(box).toContainText(TILT_TEXT);
    await expect(box).not.toHaveAttribute("data-docked", "true");
    expect((await rect(box)).y, "a top toast").toBeLessThan(844 / 3);
    expect(await page.evaluate(() => localStorage.getItem("hq:tilt-hint"))).toBe("1");
    await box.locator("p[aria-hidden='true']").first().tap({ position: { x: 12, y: 10 } });
    await expect(box).toBeHidden({ timeout: 15_000 });
    await expect.poll(() => page.evaluate(() => localStorage.getItem("hq:onboarded"))).toBe("done");
  });

  test("ends when the phone turns sideways", async ({ page }) => {
    await tourToClosing(page);
    // The closing line fits its toast, so it moves on by itself (a tap here could land on the next line).
    await expectLine(page, "tilt");
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(dialog(page)).toBeHidden({ timeout: 15_000 });
  });
});

test.describe("tilt hint on a portrait tablet (834x1194)", () => {
  test.use({ viewport: { width: 834, height: 1194 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

  test("follows the full tour's closing line", async ({ page }) => {
    await tourToClosing(page);
    // A tablet's raised line waits for a tap (only a phone's toast moves on by itself).
    await tapThrough(page, "closing");
    await expectLine(page, "tilt");
    await expect(dialog(page)).toContainText(TILT_TEXT);
  });
});

test.describe("no tilt hint in landscape (844x390)", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

  test("the tour ends on its closing line", async ({ page }) => {
    await tourToClosing(page);
    await expect(dialog(page)).toBeHidden({ timeout: 30_000 });
    expect(await page.evaluate(() => localStorage.getItem("hq:tilt-hint"))).toBeNull();
  });
});

/** The boot overlay of a new visit, once its card shows (View CV and Contact sit beside Boot rover and Classic site). */
async function quickBootCard(page: Page, path = "/en") {
  await page.goto(`${path}?tier=lite`);
  await waitForHQ(page);
  const overlay = page.getByTestId("boot");
  await expect(overlay.locator(".hq-boot-card")).toBeVisible();
  return overlay;
}

test.describe("boot card: View CV and Contact (owner decision 2026-11-01)", () => {
  test("the server cover carries View CV and Contact as real links (they work before any JS)", async ({ page }) => {
    const html = await (await page.request.get("/en")).text();
    const cover = html.slice(html.indexOf('id="hq-boot-cover"'));
    expect(cover).toContain('href="/en/cv?view=classic"');
    expect(cover).toContain('href="/en/contact?view=classic#availability"');
  });

  test.describe("portrait phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test("View CV and Contact sit in the docked card; View CV opens the CV reader over the boot", async ({ page }) => {
      const overlay = await quickBootCard(page);
      const card = overlay.locator(".hq-boot-card");
      const cv = overlay.getByRole("link", { name: en.common.viewCv });
      const contact = overlay.getByRole("link", { name: en.hud.bootContact });
      await expect(contact).toHaveAttribute("href", "/en/contact?view=classic#availability");
      const c = await rect(card);
      expect(c.y, "the card stays in the lower half").toBeGreaterThanOrEqual(844 * 0.4);
      for (const link of [cv, contact]) {
        const b = await rect(link);
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(b.y + b.height).toBeLessThanOrEqual(844);
      }
      await cv.click();
      await expect(page.getByRole("dialog", { name: "CV", exact: true })).toBeVisible();
      await expect(page).toHaveURL(/\/en\?tier=lite$/);
    });
  });

  test.describe("landscape phone", () => {
    test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

    test("the owner block is never clipped and every action is on screen", async ({ page }) => {
      const overlay = await quickBootCard(page);
      const who = await rect(overlay.getByTestId("boot-who"));
      expect(who.y, "the name is not cut off at the top").toBeGreaterThanOrEqual(0);
      await expect(overlay.locator(".hq-boot-log")).toBeHidden();
      for (const name of ["Boot rover", "Classic site", en.common.viewCv, en.hud.bootContact]) {
        const action = overlay.getByRole(name === "Boot rover" ? "button" : "link", { name });
        const b = await rect(action);
        expect(b.y + b.height, name).toBeLessThanOrEqual(390);
      }
    });
  });
});
