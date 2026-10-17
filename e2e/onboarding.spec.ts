import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import en from "../messages/en.json";
import { stationOf } from "../src/experience/floors/lobby/hallLayout";
import { highlightRoom } from "../src/experience/floors/lobby/stations";
import {
  chooseMotion,
  asReturningVisitor,
  collectErrors,
  driveTo,
  enterHQ,
  expectRenderBudget,
  hoveredTarget,
  padsOf,
  PHONE_SAFE,
  snapshot,
  targetPoint,
  visibleTarget,
  waitForFloor,
  waitForHQ,
  waitForPhase,
  waitForRoom,
  waitForRoverMove,
  waitForSceneLive,
} from "./hq";

/**
 * Rover's dialog (src/hud/dialog): the first-session onboarding after the boot and intro, its
 * replay, the first-visit floor lines and the "!" hint bubbles.
 */
test.describe.configure({ timeout: 180_000 });

export const box = (page: Page) => page.getByTestId("dialog-box");
export const choices = (page: Page) => page.getByTestId("dialog-choices");

/** Opens the settings panel: the desktop gear, or the menu sheet on phones and tablets. */
async function openSettings(page: Page) {
  const gear = page.getByTestId("settings-open");
  if (await gear.count()) await gear.click();
  else await page.getByTestId("hud-menu").click();
  const panel = page.getByTestId("settings-panel");
  await expect(panel).toBeVisible();
  return panel;
}

/**
 * Taps the toast's text near its left edge. A tap on the box center lands a few pixels from the Skip
 * button on a phone, and Chromium's touch adjustment can move it onto Skip (as a real finger would).
 */
const tapText = (page: Page) => box(page).locator("p[aria-hidden='true']").first().tap({ position: { x: 12, y: 10 } });

/** Waits for Rover to show the line with this key. */
export async function expectLine(page: Page, key: string | RegExp, timeout = 30_000) {
  await expect(box(page)).toHaveAttribute("data-line", key, { timeout });
}

/**
 * Advances the current line once it has typed out (one press). Waiting first keeps it deterministic:
 * a press racing the last typed character could otherwise skip a line. The "first press completes"
 * rule is covered by the unit tests and by "pressing on does not skip a try-it step" below.
 */
export async function next(page: Page) {
  await expect(box(page)).toHaveAttribute("data-typing", "false", { timeout: 15_000 });
  await page.keyboard.press("Enter");
}

/** Ask the HQ enabled (the Ask AI pill shows), teaser already seen. */
export async function mockAsk(page: Page) {
  await page.route("**/api/ask", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, turnstileSiteKey: null, asOf: "2026-10-11", maxLength: 300 }) }),
  );
  await page.addInitScript(() => sessionStorage.setItem("hq:ask-teaser", "1"));
}

/** A first visit in a new session: the boot plays, Boot rover starts the intro. */
export async function freshVisit(page: Page, path = "/en") {
  await mockAsk(page);
  await page.goto(`${path}?tier=lite`);
  await waitForHQ(page);
  const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
  // Boot rover enables once the scene is ready; two SwiftShader boots at once can take longer than the default 5 s.
  await expect(start).not.toHaveAttribute("aria-disabled", "true", { timeout: 30_000 });
  await start.click();
  await waitForPhase(page, "intro");
}

test.describe("first-session onboarding", () => {
  test("Rover greets after the intro instead of the Rover menu, and Skip ends it for good", async ({ page }) => {
    const errors = collectErrors(page);
    await freshVisit(page);
    await waitForPhase(page, "explore", 30_000);
    await expect(box(page)).toHaveAttribute("data-dialog", "onboarding", { timeout: 15_000 });
    await expectLine(page, "welcome");
    await expect(box(page)).toContainText("Kurniadi");
    await expect(page.getByRole("dialog", { name: en.hud.terminal.title, exact: true })).toHaveCount(0);

    await choices(page).getByRole("button", { name: en.dialog.onboarding.skip }).click();
    await expectLine(page, "skipped");
    await next(page);
    await expect(box(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("hq:onboarded"))).toBe("skipped");

    await page.reload();
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    // Proving that nothing shows: the tour would start 600 ms after explore.
    await page.waitForTimeout(1500);
    await expect(box(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe("replay", () => {
  test("the settings panel and Cmd-K replay the tour for a returning visitor", async ({ page }) => {
    await enterHQ(page);
    const panel = await openSettings(page);
    await panel.getByTestId("setting-replay-tutorial").getByRole("button", { name: en.hud.settings.tutorial.label }).click();
    await expect(panel).toBeHidden();
    await expectLine(page, "welcome");
    await expect(box(page)).toHaveAttribute("data-dialog", "onboarding");
    await choices(page).getByRole("button", { name: en.dialog.onboarding.skip }).click();
    await expectLine(page, "skipped");
    await next(page);
    await expect(box(page)).toHaveCount(0);

    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await palette.getByRole("combobox").fill("tutorial");
    await page.keyboard.press("Enter");
    await expectLine(page, "welcome");
  });
});

test.describe("floor lines", () => {
  test("the first visit to L2 gets one Rover line without choices, and continuing remembers it", async ({ page }) => {
    await asReturningVisitor(page);
    await page.goto("/en/journey?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    await expect(box(page)).toHaveAttribute("data-dialog", "floor:L2", { timeout: 15_000 });
    await expect(box(page)).toContainText(en.dialog.floor.L2);
    // On CI's SwiftShader the neighbouring floors mount and compile while the line types (single 4 to 5 s
    // main-thread tasks), so `next` waits on the typing state with the line's own budget.
    await expect(box(page)).toHaveAttribute("data-typing", "false", { timeout: 15_000 });
    await expect(choices(page)).toHaveCount(0);
    await next(page);
    await expect(box(page)).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("hq:floor-intro") ?? "[]"))).toContain("L2");
  });

  test("an old ?walk=off link lands on L2 without errors and turns nothing off", async ({ page }) => {
    const errors = collectErrors(page);
    await asReturningVisitor(page);
    await page.goto("/en/journey?tier=lite&walk=off");
    await waitForHQ(page);
    await waitForSceneLive(page);
    await waitForFloor(page, "L2");
    await expect(box(page)).toHaveAttribute("data-dialog", "floor:L2", { timeout: 15_000 });
    expect(errors).toEqual([]);
  });
});

test.describe("hint bubbles", () => {
  test("near the elevator pad a ! bubble opens Rover's line, and Pick a floor drives there and opens the picker", async ({ page }) => {
    await asReturningVisitor(page);
    await page.addInitScript(() => localStorage.setItem("hq:hints", "on"));
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    const lift = (await padsOf(page, "L1")).find((p) => p.kind === "elevator")!;
    await driveTo(page, { x: lift.at.x + 4, z: lift.at.z });
    const bubble = page.getByTestId("hint-bubble");
    await expect(bubble).toBeVisible({ timeout: 15_000 });
    await expect(bubble).toHaveAttribute("data-hint", "L1:pad:elevator");
    await expect(bubble).toHaveAttribute("data-kind", "elevator-pad");
    expect(await hoveredTarget(page)).toBeNull();
    await page.keyboard.press("Enter");
    await expect(box(page)).toHaveAttribute("data-dialog", "hint:L1:pad:elevator");
    await expect(box(page)).toContainText(en.dialog.hints.kind["elevator-pad"]);
    await expect(bubble).toHaveCount(0);
    await choices(page).getByRole("button", { name: en.dialog.hints.go.pickFloor }).click();
    // Point-and-go's `interact`: a short drive onto the pad, then the floor picker.
    await expect(page.getByTestId("pad-picker")).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("pad-picker")).toHaveCount(0);

    // Hints off from the settings panel: the bubble goes away.
    const panel = await openSettings(page);
    const hints = panel.getByTestId("setting-hints").getByRole("switch", { name: en.hud.settings.hints.label });
    await expect(hints).toBeChecked();
    await hints.click();
    await expect(hints).not.toBeChecked();
    await page.keyboard.press("Escape");
    await expect(bubble).toHaveCount(0);
  });
});

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const rect = async (locator: Locator): Promise<Box> => (await locator.boundingBox())!;

/** Shows point-and-go's one-time "Click a glowing object" hint (InteractStatus) without clicking the world. */
async function showPointHint(page: Page) {
  await page.evaluate(() =>
    (window as unknown as { __hq: { store: { getState: () => { setPointHint: (on: boolean) => void } } } }).__hq.store.getState().setPointHint(true),
  );
  await expect(page.getByTestId("point-hint")).toBeVisible();
}

/** Drives forward until the try-it step notices (2 u). */
async function driveABit(page: Page) {
  const from = (await snapshot(page)).rover;
  await page.keyboard.down("w");
  await waitForRoverMove(page, from, 2.5);
  await page.keyboard.up("w");
}

test.describe("every step of the tour", () => {
  test("each try-it step waits for the visitor, rings its HUD control and advances", async ({ page }) => {
    const errors = collectErrors(page);
    await freshVisit(page);
    await waitForPhase(page, "explore", 30_000);
    await expectLine(page, "welcome");
    await choices(page).getByRole("button", { name: en.dialog.onboarding.start }).click();

    await expectLine(page, "move");
    await expect(box(page)).toContainText(en.dialog.onboarding.moveFine);
    await expect(page.getByTestId("dialog-skip")).toHaveText(en.dialog.onboarding.skip);
    // Point-and-go's one-time hint sits in the bottom band, below the box.
    await showPointHint(page);
    expect(overlaps(await rect(box(page)), await rect(page.getByTestId("point-hint")))).toBe(false);
    await next(page);

    await expectLine(page, "point-go");
    await expect(box(page)).toContainText(en.dialog.onboarding.pointGoFine);
    await expect(page.getByTestId("dialog-try")).toBeVisible();
    // Pressing on does not skip a try-it step.
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(box(page)).toHaveAttribute("data-line", "point-go");
    await driveABit(page);

    await expectLine(page, "moved");
    await next(page);
    await expectLine(page, "camera");
    await expect(page.getByTestId("onboard-spotlight")).toHaveAttribute("data-target", "view");
    await next(page);

    // The Highlights Hall on L1 east (its stations register once the hall mounts after the intro).
    await expectLine(page, "highlights");
    await choices(page).getByRole("button", { name: en.dialog.onboarding.later }).click();

    await expectLine(page, "elevator");
    await expect(page.getByTestId("onboard-spotlight")).toHaveAttribute("data-target", "elevator");
    await next(page);
    await expectLine(page, "rover-menu");
    await expect(page.getByTestId("onboard-spotlight")).toHaveAttribute("data-target", "rover-menu");
    await next(page);
    await expectLine(page, "ask-ai");
    await expect(page.getByTestId("onboard-spotlight")).toHaveAttribute("data-target", "ask-ai");
    await next(page);
    await expectLine(page, "closing");
    await next(page);

    await expect(box(page)).toHaveCount(0);
    await expect(page.getByTestId("onboard-spotlight")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("hq:onboarded"))).toBe("done");
    expect(errors).toEqual([]);
  });

  test("Take me there drives to the Highlights Hall's first station, then the tour goes on", async ({ page }) => {
    const errors = collectErrors(page);
    await freshVisit(page);
    await waitForPhase(page, "explore", 30_000);
    await expectLine(page, "welcome");
    await choices(page).getByRole("button", { name: en.dialog.onboarding.start }).click();
    await expectLine(page, "move");
    await next(page);
    await expectLine(page, "point-go");
    await driveABit(page);
    await expectLine(page, "moved");
    await next(page);
    await expectLine(page, "camera");
    await next(page);
    await expectLine(page, "highlights");
    await choices(page).getByRole("button", { name: en.dialog.onboarding.showMe }).click();
    // The drive ends on the first station's door pad, which opens its drawer; Rover waits behind it.
    await waitForRoom(page, highlightRoom("about"), 60_000);
    const hall = stationOf("about").pad;
    const { rover } = await snapshot(page);
    expect(Math.hypot(rover.x - hall.x, rover.z - hall.z)).toBeLessThan(1.5);
    await expect(box(page)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expectLine(page, "elevator");
    expect(errors).toEqual([]);
  });

  test("a deep link rides on first, then runs the short tour, then the floor line", async ({ page }) => {
    await freshVisit(page, "/en/library");
    await waitForFloor(page, "L4");
    await expect(box(page)).toHaveAttribute("data-dialog", "onboarding", { timeout: 30_000 });
    await expectLine(page, "welcome");
    await choices(page).getByRole("button", { name: en.dialog.onboarding.start }).click();
    await expectLine(page, "move");
    await next(page);
    await expectLine(page, "point-go");
    // The fallback: Continue appears after 12 s without driving.
    await choices(page).getByRole("button", { name: en.dialog.continue }).click({ timeout: 20_000 });
    await expectLine(page, "moved");
    await next(page);
    await expectLine(page, "camera");
    await next(page);
    await expectLine(page, "rover-menu");
    await next(page);
    await expectLine(page, "ask-ai");
    await next(page);
    await expectLine(page, "closing");
    await expect(box(page)).toContainText(en.dialog.onboarding.closingShort);
    await next(page);
    await expect(box(page)).toHaveAttribute("data-dialog", "floor:L4", { timeout: 15_000 });
    await expect(box(page)).toContainText(en.dialog.floor.L4);
    await expect(box(page)).toHaveAttribute("data-typing", "false", { timeout: 15_000 });
    await expect(choices(page)).toHaveCount(0);
  });

  test("the ! bubble adds no draw calls", async ({ page }) => {
    await asReturningVisitor(page);
    await page.addInitScript(() => localStorage.setItem("hq:hints", "on"));
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    const lift = (await padsOf(page, "L1")).find((p) => p.kind === "elevator")!;
    await driveTo(page, { x: lift.at.x + 4, z: lift.at.z });
    await expect(page.getByTestId("hint-bubble")).toBeVisible({ timeout: 15_000 });
    await expectRenderBudget(page);
  });
});

test.describe("reduced motion", () => {
  test("lines appear whole, one press advances, and nothing pulses", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    await chooseMotion(context, "system");
    const page = await context.newPage();
    await freshVisit(page);
    await waitForPhase(page, "explore", 30_000);
    await expectLine(page, "welcome");
    await expect(box(page)).toHaveAttribute("data-typing", "false");
    await expect(box(page)).toHaveAttribute("data-motion", "still");
    await choices(page).getByRole("button", { name: en.dialog.onboarding.start }).click();
    await expectLine(page, "move");
    await expect(box(page)).toHaveAttribute("data-typing", "false");
    await page.keyboard.press("Enter");
    await expectLine(page, "point-go");
    await driveABit(page);
    await expectLine(page, "moved");
    await page.keyboard.press("Enter");
    await expectLine(page, "camera");
    await page.keyboard.press("Enter");
    await expectLine(page, "highlights");
    await choices(page).getByRole("button", { name: en.dialog.onboarding.later }).click();
    await expectLine(page, "elevator");
    await expect(page.getByTestId("onboard-spotlight")).toHaveAttribute("data-motion", "still");
    await context.close();
  });
});

test.describe("phone layout", () => {
  test("390x844: the toast sits above the joystick, clears the Corners controls and the Go chip; tap, Go and taps advance", async ({ browser }: { browser: Browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await freshVisit(page);
    await waitForPhase(page, "explore", 30_000);
    await expectLine(page, "welcome");
    await expect(page.getByTestId("minimap")).toBeVisible();
    const dialog = await rect(box(page));
    expect(dialog.x).toBeGreaterThanOrEqual(0);
    expect(dialog.x + dialog.width).toBeLessThanOrEqual(390);
    expect(dialog.y + dialog.height).toBeLessThanOrEqual(844);
    for (const id of ["joystick", "view-controls", "floor-chip", "hud-menu", "minimap"]) {
      expect(overlaps(dialog, await rect(page.getByTestId(id))), id).toBe(false);
    }
    // The phone toast sits above the joystick.
    expect(dialog.y + dialog.height).toBeLessThanOrEqual((await rect(page.getByTestId("joystick"))).y);
    await showPointHint(page);
    expect(overlaps(dialog, await rect(page.getByTestId("point-hint")))).toBe(false);

    await choices(page).getByRole("button", { name: en.dialog.onboarding.start }).tap();
    await expectLine(page, "move");
    await expect(box(page)).toContainText(en.dialog.onboarding.moveCoarse);
    await expect(box(page)).toHaveAttribute("data-typing", "false", { timeout: 15_000 });
    // The phone toast clamps a long line to two rows: the first tap expands it, the next one moves on.
    await tapText(page);
    if ((await box(page).getAttribute("data-line")) === "move" && (await box(page).getAttribute("data-expanded")) === "true") await tapText(page);
    await expectLine(page, "point-go");
    await expect(box(page)).toContainText(en.dialog.onboarding.pointGoCoarse);

    // Point-and-go on touch, as the line teaches: the first tap selects (Go chip), the chip drives.
    const top = (await rect(box(page))).y;
    const target = await visibleTarget(page, { kinds: ["station", "kiosk", "elevator-pad"], safe: { ...PHONE_SAFE, bottom: 844 - top + 8 }, minDistance: 4 });
    const point = await targetPoint(page, target.id);
    await page.touchscreen.tap(point.x, point.y);
    const go = page.getByTestId("interact-go");
    await expect(go).toBeVisible();
    await expect(go).toHaveText(en.hud.interact.go.replace("{label}", target.label));
    expect(overlaps(await rect(box(page)), await rect(go))).toBe(false);
    await expect(page.getByTestId("hint-bubble")).toHaveCount(0);
    await expect(box(page)).toHaveAttribute("data-line", "point-go");
    const from = (await snapshot(page)).rover;
    await go.tap();
    await waitForRoverMove(page, from, 2.5);
    // Stop the drive before it arrives (arrival would open a drawer, a picker or the Rover menu and pause the line).
    await page.keyboard.press("Escape");
    await expectLine(page, "moved");

    await page.getByTestId("dialog-skip").tap();
    await expectLine(page, "skipped");
    await expect(box(page)).toHaveAttribute("data-typing", "false", { timeout: 15_000 });
    await tapText(page);
    // The first tap either dismisses the line or expands it; wait for whichever happened, then act on it.
    await expect.poll(async () => ((await box(page).count()) === 0 ? "gone" : await box(page).getAttribute("data-expanded"))).toMatch(/^(gone|true)$/);
    if ((await box(page).count()) > 0) await tapText(page);
    await expect(box(page)).toHaveCount(0);
    await context.close();
  });
});

test.describe("pauses behind modals", () => {
  test("Rover's line hides while the CV viewer (DialogHost) is open and comes back where it was", async ({ page }) => {
    await enterHQ(page);
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog", { name: "Command palette" }).getByRole("combobox").fill("tutorial");
    await page.keyboard.press("Enter");
    await expectLine(page, "welcome");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("hq:hud", { detail: { type: "cv" } })));
    await expect(page.getByTestId("cv-dialog")).toBeVisible({ timeout: 15_000 });
    await expect(box(page)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("cv-dialog")).toHaveCount(0);
    await expectLine(page, "welcome");
  });
});
