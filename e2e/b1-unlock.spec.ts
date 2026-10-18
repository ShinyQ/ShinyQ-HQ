import { expect, test, type Page } from "@playwright/test";
import { rideTo, seedFloors } from "./b1";
import { asReturningVisitor, chooseMotion, skipFloorLines, waitForFloor, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";

/**
 * B1 Engine Room, PR 3: the locked row and its progress, the unlock moment (reached for real, never through the
 * `?unlock=b1` flag, which is session only and has no moment), Later, persistence, deep links and Cmd-K. Waits are on state.
 */
test.describe.configure({ timeout: 300_000 });
test.use({ reducedMotion: "reduce" });
test.beforeEach(async ({ page }) => {
  await chooseMotion(page, "system");
  await skipFloorLines(page);
});

const chimes = (page: Page) =>
  page.evaluate(() => (window as unknown as { __hq: { audio: () => { played: { chime?: number } } } }).__hq.audio().played.chime ?? 0);

type Probe = Window & {
  __hq: { store: { getState: () => { floor: string; floorsSeen: string[]; b1Unlocked: boolean; b1Moment: boolean; unlockB1: () => void } }; floorChunks: { state: (id: string) => string } };
};
const state = (page: Page) =>
  page.evaluate(() => {
    const h = (window as unknown as Probe).__hq;
    const s = h.store.getState();
    return { floor: s.floor, seen: s.floorsSeen, unlocked: s.b1Unlocked, moment: s.b1Moment, b1Chunk: h.floorChunks.state("B1") };
  });
const row = (page: Page) => page.getByRole("navigation", { name: "Elevator" }).locator('[data-floor="B1"]');
const offer = (page: Page) => page.locator('[data-testid="dialog-box"][data-line="b1-unlock"]');

async function open(page: Page, path = "/en") {
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=lite`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

async function reload(page: Page) {
  await page.reload();
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

test("a new visitor sees B1 locked with 1/5, the Lobby counted, and pressing it rides nowhere", async ({ page }) => {
  await open(page);
  await expect(row(page)).toHaveAttribute("aria-disabled", "true");
  await expect(row(page)).toHaveAccessibleName("B1 Visit all 5 floors (1/5)");
  // The row is aria-disabled (Playwright would wait for it to enable); force proves the press itself does nothing.
  await row(page).click({ force: true });
  const s = await state(page);
  expect(s.floor).toBe("L1");
  expect(s.b1Chunk).toBe("idle");
  expect(s.unlocked).toBe(false);
});

test("progress counts each public floor once and survives a reload", async ({ page }) => {
  await open(page);
  await rideTo(page, "L2");
  await rideTo(page, "L3");
  await rideTo(page, "L2");
  await expect(row(page)).toHaveAccessibleName("B1 Visit all 5 floors (3/5)");
  await reload(page);
  expect([...(await state(page)).seen].sort()).toEqual(["L1", "L2", "L3"]);
  await expect(row(page)).toHaveAccessibleName("B1 Visit all 5 floors (3/5)");
});

test("the fifth floor unlocks B1 once: Rover offers the ride, the row lights up, Take me there rides down, and a reload stays lit", async ({ page }) => {
  await seedFloors(page, ["L1", "L2", "L3", "L4"]);
  await open(page);
  await expect(row(page)).toHaveAccessibleName("B1 Visit all 5 floors (4/5)");
  expect(await chimes(page)).toBe(0);
  await rideTo(page, "RF");
  await expect(offer(page)).toBeVisible({ timeout: 60_000 });
  await expect(offer(page)).toContainText("You found everything");
  await expect.poll(() => chimes(page)).toBe(1);
  await expect(row(page)).not.toHaveAttribute("aria-disabled");
  await expect(row(page)).toHaveAccessibleName(/^B1 Build: go to floor/);
  // Reduced motion: the same offer, no pulse on the row.
  await expect(row(page).locator(".animate-pulse")).toHaveCount(0);
  await expect.poll(async () => (await state(page)).b1Chunk, { timeout: 60_000 }).not.toBe("idle");
  await offer(page).getByRole("button", { name: "Take me there" }).click();
  await waitForFloor(page, "B1", 90_000);
  expect(await state(page)).toMatchObject({ unlocked: true, moment: false });
  // One chime per unlock: answering the offer and arriving on B1 never chime again.
  expect(await chimes(page)).toBe(1);

  await reload(page);
  expect(await state(page)).toMatchObject({ unlocked: true, moment: false });
  await expect(row(page)).not.toHaveAttribute("aria-disabled");
  await expect(row(page)).not.toHaveAttribute("data-locked");
  await expect(offer(page)).toHaveCount(0);
  // The engine restarts with the page: no chime again, as the unlock moment is over.
  expect(await chimes(page)).toBe(0);
});

test.describe("full motion", () => {
  test.use({ reducedMotion: "no-preference" });
  test("the B1 row pulses during the unlock moment", async ({ page }) => {
    await chooseMotion(page, "full");
    await seedFloors(page, ["L1", "L2", "L3", "L4"]);
    await open(page);
    await rideTo(page, "RF");
    await expect(offer(page)).toBeVisible({ timeout: 60_000 });
    await expect(row(page).locator(".animate-pulse")).toHaveCount(1);
    await offer(page).getByRole("button", { name: "Later" }).click();
    await expect(row(page).locator(".animate-pulse")).toHaveCount(0);
  });
});

test("Later keeps B1 open without a ride", async ({ page }) => {
  await seedFloors(page, ["L1", "L2", "L3", "L4"]);
  await open(page);
  await rideTo(page, "RF");
  await expect(offer(page)).toBeVisible({ timeout: 60_000 });
  await offer(page).getByRole("button", { name: "Later" }).click();
  await expect.poll(async () => (await state(page)).moment).toBe(false);
  const s = await state(page);
  expect(s.floor).toBe("RF");
  expect(s.unlocked).toBe(true);
  await expect(row(page)).not.toHaveAttribute("aria-disabled");
  await expect(offer(page)).toHaveCount(0);
});

test("an unlocked #B1 deep link starts on B1", async ({ page }) => {
  await seedFloors(page, ["L1", "L2", "L3", "L4", "RF"], true);
  await asReturningVisitor(page);
  await page.goto("/en?tier=lite#B1");
  await waitForHQ(page);
  await waitForFloor(page, "B1", 90_000);
  expect(await state(page)).toMatchObject({ floor: "B1", unlocked: true });
});

test("a locked #B1 deep link stays on the Lobby and Rover says how to unlock it", async ({ page }) => {
  await asReturningVisitor(page);
  await page.goto("/en?tier=lite#B1");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await expect(page.locator('[data-testid="dialog-box"][data-line="b1-locked"]')).toContainText("visit all 5 floors first (1/5)");
  const s = await state(page);
  expect(s.floor).toBe("L1");
  expect(s.b1Chunk).toBe("idle");
  await expect(page).toHaveURL(/\/en\?tier=lite$/);
});

test("Cmd-K has no B1 action while locked, and rides to B1 once unlocked", async ({ page }) => {
  await open(page);
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await page.keyboard.press("Control+k");
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox").fill("Engine Room");
  await expect(palette.getByRole("option").first()).toBeVisible();
  await expect(palette.getByRole("option").filter({ hasText: /Go to B1/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
  expect((await state(page)).floor).toBe("L1");

  // The session-only unlock registers the action like a real one (the moment is covered above).
  await page.evaluate(() => (window as unknown as Probe).__hq.store.getState().unlockB1());
  await page.keyboard.press("Control+k");
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox").fill("Engine Room");
  const action = palette.getByRole("option").filter({ hasText: "Go to B1 Engine Room" });
  await expect(action).toBeVisible();
  await page.keyboard.press("Enter");
  await waitForFloor(page, "B1", 90_000);
});
