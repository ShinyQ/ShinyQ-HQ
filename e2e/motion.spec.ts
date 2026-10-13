import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import en from "../messages/en.json";
import id from "../messages/id.json";
import { enterHQ, openPage, waitForFloor, waitForFrames, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";

/**
 * Motion setting (owner decision, October 2026): System follows `prefers-reduced-motion`, Full and
 * Reduced override it, in 3D (`store.reducedMotion`: the elevator cut, the still intro) and on the
 * Classic site (`html[data-motion]` and the reduce CSS). A Windows PC with "Animation effects" off
 * reports reduce, so every ride used to be the 150 ms cut.
 */
test.describe.configure({ timeout: 240_000 });

type RideSummary = { distinctY: number; dollyFrames: number };
type MotionWindow = Window & {
  __hq: {
    store: { getState: () => { motion: string; reducedMotion: boolean; systemReducedMotion: boolean } };
    ridePrep?: { lastRide: RideSummary | null };
    camera: () => number[];
  };
};

const motionState = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as MotionWindow).__hq.store.getState();
    return { motion: s.motion, reduced: s.reducedMotion, system: s.systemReducedMotion, attr: document.documentElement.getAttribute("data-motion") };
  });

async function rideTo(page: Page, floor: string) {
  await page.getByRole("navigation", { name: "Elevator" }).locator(`[data-floor="${floor}"]`).click();
  await waitForFloor(page, floor, 180_000);
  return page.evaluate(() => (window as unknown as MotionWindow).__hq.ridePrep?.lastRide ?? null);
}

async function pickMotion(page: Page, label: string) {
  const trigger = page.getByTestId("hud").getByRole("button", { name: en.hud.motion.label, exact: true });
  await trigger.click();
  const group = page.getByRole("group", { name: en.hud.motion.label });
  // The radios are visually hidden; the visible segment is their label.
  await group.getByText(label, { exact: true }).click();
  return { trigger, group };
}

async function expectNoSeriousViolations(page: Page, selector: string) {
  const results = await new AxeBuilder({ page }).include(selector).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Like asReturningVisitor, but the motion hint flag is left to the app (so a reload can prove it persisted). */
async function enterWithHint(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("hq:terminal-seen", "1");
    localStorage.setItem("hq:onboarded", "done");
    localStorage.setItem("hq:hints", "off");
    sessionStorage.setItem("hq:intro", "seen");
  });
  await page.goto("/en?tier=lite");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

const dialogBox = (page: Page) => page.getByTestId("dialog-box");

test("System follows an OS that asks for reduced motion: the ride is the 150 ms cut", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterHQ(page);
  expect(await motionState(page)).toEqual({ motion: "system", reduced: true, system: true, attr: null });
  const ride = await rideTo(page, "L2");
  expect(ride).not.toBeNull();
  expect(ride!.distinctY).toBeLessThanOrEqual(2);
});

test("Full overrides the OS: rides animate, the page CSS follows, and the choice survives a reload", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterHQ(page);
  const { trigger, group } = await pickMotion(page, en.hud.motion.full);
  await expect(group.getByRole("radio", { name: en.hud.motion.full })).toBeChecked();
  expect(await motionState(page)).toEqual({ motion: "full", reduced: false, system: true, attr: "full" });
  await expectNoSeriousViolations(page, "[data-testid='motion-popover']");
  await page.keyboard.press("Escape");
  await expect(group).toBeHidden();
  await expect(trigger).toBeFocused();
  // The landing's Pause motion switch hides under reduced motion; Full brings it back.
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".hx-pause")!).display)).not.toBe("none");
  const ride = await rideTo(page, "L3");
  console.log(`ride L1 to L3 under Full with the OS reduce flag: ${JSON.stringify(ride)}`);
  expect(ride!.distinctY).toBeGreaterThanOrEqual(12);
  // Persisted in hq:v1 and on <html> from the head script, before hydration.
  await page.goto("/en?tier=lite");
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-motion"))).toBe("full");
  await waitForHQ(page);
  expect((await motionState(page)).motion).toBe("full");
});

test("Reduced without the OS flag gives the cut and the reduced page CSS", async ({ page }) => {
  await enterHQ(page);
  expect((await motionState(page)).reduced).toBe(false);
  await pickMotion(page, en.hud.motion.reduced);
  await page.keyboard.press("Escape");
  expect(await motionState(page)).toEqual({ motion: "reduced", reduced: true, system: false, attr: "reduced" });
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".hx-pause")!).display)).toBe("none");
  const ride = await rideTo(page, "L2");
  expect(ride!.distinctY).toBeLessThanOrEqual(2);
});

test("the intro animates under Full even when the OS asks for reduced motion", async ({ browser }: { browser: Browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("hq:terminal-seen", "1");
    localStorage.setItem("hq:onboarded", "done");
    localStorage.setItem("hq:motion-hint", "seen");
    if (!localStorage.getItem("hq:v1")) localStorage.setItem("hq:v1", JSON.stringify({ state: { visited: [], firstVisit: true, locale: "en", motion: "full" }, version: 2 }));
  });
  await page.goto("/en?tier=lite");
  await waitForHQ(page);
  const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
  await expect(start).not.toHaveAttribute("aria-disabled", "true");
  await start.click();
  await waitForPhase(page, "intro");
  expect(await motionState(page)).toMatchObject({ motion: "full", reduced: false, system: true });
  await waitForFrames(page, 3);
  const camera = () => page.evaluate(() => (window as unknown as MotionWindow).__hq.camera());
  const a = await camera();
  // The orbit moves the camera while the phase is still "intro" (reduced motion holds one still shot).
  await expect
    .poll(
      async () => {
        const b = await camera();
        const phase = await page.evaluate(() => (window as unknown as { __hq: { store: { getState: () => { phase: string } } } }).__hq.store.getState().phase);
        return phase === "intro" ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : -1;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(1);
  await context.close();
});

test.describe("one-time hint", () => {
  test("shows once when the OS reduces motion under System; Full motion fixes it and it never returns", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await enterWithHint(page);
    await expect(dialogBox(page)).toHaveAttribute("data-line", "motion-hint", { timeout: 30_000 });
    await expect(dialogBox(page)).toContainText(en.dialog.motion.ask);
    await page.getByTestId("dialog-choices").getByRole("button", { name: en.dialog.motion.full }).click();
    await expect(dialogBox(page)).toHaveAttribute("data-line", "motion-on");
    expect(await motionState(page)).toMatchObject({ motion: "full", reduced: false, attr: "full" });
    expect(await page.evaluate(() => localStorage.getItem("hq:motion-hint"))).toBe("seen");
    await page.reload();
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    // Proving that nothing shows: give the layer well past its start delay.
    await page.waitForTimeout(3000);
    await expect(dialogBox(page)).toHaveCount(0);
  });

  test("Esc keeps reduced motion and is remembered too", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await enterWithHint(page);
    await expect(dialogBox(page)).toHaveAttribute("data-line", "motion-hint", { timeout: 30_000 });
    await expect(dialogBox(page)).toHaveAttribute("data-typing", "false", { timeout: 15_000 });
    await page.keyboard.press("Escape");
    await expect(dialogBox(page)).toHaveAttribute("data-line", "motion-kept");
    expect(await motionState(page)).toMatchObject({ motion: "system", reduced: true });
    expect(await page.evaluate(() => localStorage.getItem("hq:motion-hint"))).toBe("seen");
  });

  test("never shows without the OS flag", async ({ page }) => {
    await enterWithHint(page);
    await page.waitForTimeout(3000);
    await expect(dialogBox(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("hq:motion-hint"))).toBeNull();
  });
});

test("phones: Motion sits in the menu next to language and sound (Indonesian labels, axe)", async ({ browser }: { browser: Browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await enterHQ(page, { path: "/id" });
  await page.getByTestId("hud").getByRole("button", { name: id.hud.menu }).click();
  const group = page.getByRole("group", { name: id.hud.motion.label });
  await expect(group.getByRole("radio")).toHaveCount(3);
  for (const label of [id.hud.motion.system, id.hud.motion.full, id.hud.motion.reduced]) await expect(group.getByText(label, { exact: true })).toBeVisible();
  const box = (await group.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await group.getByText(id.hud.motion.full, { exact: true }).click();
  expect((await motionState(page)).motion).toBe("full");
  await expectNoSeriousViolations(page, "[data-testid='motion-choices']");
  await context.close();
});

test("Classic site: Cmd-K sets the preference and the page CSS follows it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPage(page, "/en?tier=static");
  const pause = page.locator(".hx-pause");
  await expect(pause).toBeHidden();
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await page.keyboard.type("motion full");
  await expect(palette.getByRole("option").first()).toContainText(en.hud.actions.motionFull);
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
  await expect(pause).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: en.hud.actions.motionFull })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
  await expect(pause).toBeVisible();
});
