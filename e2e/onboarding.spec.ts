import { expect, test, type Page } from "@playwright/test";
import en from "../messages/en.json";
import { asReturningVisitor, collectErrors, driveTo, enterHQ, hoveredTarget, padsOf, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";

/**
 * Rover's dialog (src/hud/dialog): the first-session onboarding after the boot and intro, its
 * replay, the floor lines with the walk choice and the "!" hint bubbles.
 */
test.describe.configure({ timeout: 180_000 });

export const box = (page: Page) => page.getByTestId("dialog-box");
export const choices = (page: Page) => page.getByTestId("dialog-choices");

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
  await expect(start).not.toHaveAttribute("aria-disabled", "true");
  await start.click();
  await waitForPhase(page, "intro");
}

test.describe("first-session onboarding", () => {
  test("Rover greets after the intro instead of the Ask Rover terminal, and Skip ends it for good", async ({ page }) => {
    const errors = collectErrors(page);
    await freshVisit(page);
    await waitForPhase(page, "explore", 30_000);
    await expect(box(page)).toHaveAttribute("data-dialog", "onboarding", { timeout: 15_000 });
    await expectLine(page, "welcome");
    await expect(box(page)).toContainText("Kurniadi");
    await expect(page.getByRole("dialog", { name: "Ask Rover" })).toHaveCount(0);

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
  test("Ask Rover and Cmd-K replay the tour for a returning visitor", async ({ page }) => {
    await enterHQ(page);
    await page.getByRole("button", { name: "Ask Rover", exact: true }).click();
    const terminal = page.getByRole("dialog", { name: "Ask Rover" });
    await terminal.getByRole("option", { name: new RegExp(en.dialog.menu.replay) }).click();
    await expect(terminal).toBeHidden();
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
  test("the first visit to L2 gets one Rover line that ends with the walk choice", async ({ page }) => {
    await asReturningVisitor(page);
    await page.goto("/en/journey?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    await expect(box(page)).toHaveAttribute("data-dialog", "floor:L2", { timeout: 15_000 });
    await expect(box(page)).toContainText(en.dialog.floor.L2);
    await expect(choices(page).getByRole("button", { name: en.walk.journey.start })).toBeVisible();
    await expect(page.getByTestId("walk-prompt")).toHaveCount(0);
    await choices(page).getByRole("button", { name: en.walk.explore }).click();
    await expect(box(page)).toHaveCount(0);
    await expect(page.getByTestId("walk-launcher")).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("hq:walk-prompt") ?? "[]"))).toContain("L2");
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

    // Hints off from Ask Rover: the bubble goes away.
    await page.getByRole("button", { name: "Ask Rover", exact: true }).click();
    await page.getByRole("dialog", { name: "Ask Rover" }).getByRole("option", { name: new RegExp(en.dialog.menu.hintsOn) }).click();
    await page.keyboard.press("Escape");
    await expect(bubble).toHaveCount(0);
  });
});
