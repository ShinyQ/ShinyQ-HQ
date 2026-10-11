import { expect, test, type Page } from "@playwright/test";
import { asReturningVisitor, collectErrors, waitForHQ, waitForPhase, waitForRoom, waitForSceneLive } from "./hq";

/**
 * Guided walks (missions/walk.ts + hud/walk). Walks ship behind `WALK_FLOORS` (empty until the L2
 * and L3 roads land), so these tests turn them on with `?walk=on` on today's layouts.
 */
test.describe.configure({ timeout: 180_000 });

async function openWithWalks(page: Page, path: string) {
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=lite&walk=on`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

const stopOf = (page: Page) => page.getByTestId("walk-bar").getAttribute("data-stop");

async function waitForArrival(page: Page) {
  await expect(page.getByTestId("walk-bar")).toHaveAttribute("data-status", "arrived", { timeout: 90_000 });
  const stop = await stopOf(page);
  if (stop?.includes(":directory:")) return stop;
  await waitForRoom(page, stop!);
  return stop!;
}

test.describe("Guided walks", () => {
  test("L2: first-visit prompt, walk in date order, keys, manual pause and resume", async ({ page }) => {
    const errors = collectErrors(page);
    await openWithWalks(page, "/en/journey");

    const prompt = page.getByTestId("walk-prompt");
    await expect(prompt).toBeVisible();
    await expect(prompt.getByRole("heading")).toHaveText("Walk my journey?");
    await prompt.getByRole("button", { name: "Walk my journey" }).click();

    const bar = page.getByTestId("walk-bar");
    await expect(bar).toBeVisible();
    await expect(page.getByTestId("walk-counter")).toContainText(/Stop 1 of \d+/);
    const first = await waitForArrival(page);
    expect(first.startsWith("L2:")).toBe(true);

    // `]` steps forward, through the open drawer.
    await page.keyboard.press("]");
    await expect(page.getByTestId("walk-counter")).toContainText("Stop 2 of");
    const second = await waitForArrival(page);
    expect(second).not.toBe(first);

    // Driving by hand pauses the walk to the "Resume walk" pill.
    await page.keyboard.press("Escape");
    await waitForPhase(page, "explore");
    await page.keyboard.down("d");
    await expect(page.getByTestId("walk-pill")).toBeVisible();
    await page.keyboard.up("d");
    await page.getByTestId("walk-pill").getByRole("button", { name: /Resume walk/ }).click();
    expect(await waitForArrival(page)).toBe(second);

    // Progress is saved; ending the walk leaves a launcher and the prompt does not come back.
    await bar.getByRole("button", { name: "End walk" }).first().click();
    await expect(page.getByTestId("walk-launcher")).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hq:walk:journey") ?? "null"));
    expect(saved).toMatchObject({ stop: second, done: false });
    expect(saved.visited).toEqual(expect.arrayContaining([first, second]));

    // The room is still open, so the reload deep-links into it (phase "room").
    await page.reload();
    await waitForHQ(page);
    await waitForSceneLive(page);
    await expect(page.getByTestId("walk-launcher")).toBeVisible();
    await expect(page.getByTestId("walk-prompt")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("L3: the tour filters by wing and Prev steps back", async ({ page }) => {
    const errors = collectErrors(page);
    await openWithWalks(page, "/en/labs");
    await page.getByTestId("walk-prompt").getByRole("button", { name: "Tour my projects" }).click();
    await waitForArrival(page);
    await page.getByTestId("walk-filter").selectOption("ai");
    await expect(page.getByTestId("walk-counter")).toContainText("AI Wing");
    await page.getByTestId("walk-bar").getByRole("button", { name: /Next/ }).click();
    const ai2 = await waitForArrival(page);
    await page.getByTestId("walk-bar").getByRole("button", { name: /Previous/ }).click();
    const ai1 = await waitForArrival(page);
    expect(ai1).not.toBe(ai2);
    expect(errors).toEqual([]);
  });

  test("without the flag no walk is offered (WALK_FLOORS is empty until the roads ship)", async ({ page }) => {
    await asReturningVisitor(page);
    await page.goto("/en/journey?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    // Proving that nothing shows: the prompt would appear 700 ms after explore.
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("walk-prompt")).toHaveCount(0);
    await expect(page.getByTestId("walk-launcher")).toHaveCount(0);
  });
});

test.describe("Guided walks on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the Walk HUD sits under the top bar and a swipe steps forward", async ({ page }) => {
    await openWithWalks(page, "/en/journey");
    await page.getByTestId("walk-prompt").getByRole("button", { name: "Walk my journey" }).click();
    await waitForArrival(page);
    const bar = page.getByTestId("walk-bar");
    const box = (await bar.boundingBox())!;
    expect(box.y).toBeLessThan(200);

    const cdp = await page.context().newCDPSession(page);
    // Middle of the card (title and subtitle), away from the filter and the buttons.
    const y = box.y + box.height * 0.45;
    let timestamp = Date.now() / 1000;
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }], timestamp: (timestamp += 0.04) });
    await touch("touchStart", box.x + box.width * 0.7);
    for (const f of [0.6, 0.5, 0.4, 0.3]) await touch("touchMove", box.x + box.width * f);
    await touch("touchEnd", 0);
    await cdp.detach();
    await expect(page.getByTestId("walk-counter")).toContainText("Stop 2 of");
  });
});
