import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import en from "../messages/en.json";
import id from "../messages/id.json";
import { asReturningVisitor, enterHQ, openPage, waitForFloor, waitForFrames, waitForHQ, waitForPhase } from "./hq";

/**
 * Motion setting: System follows `prefers-reduced-motion`, Full and Reduced override it, in 3D
 * (`store.reducedMotion`: the elevator cut, the still intro) and on the Classic site (`html[data-motion]`
 * and the reduce CSS). Owner decision 2026-10-14: Full is the default on every OS (a Windows PC with
 * "Animation effects" off reports reduce, so every ride used to be the 150 ms cut); the Motion menu
 * (System or Reduced) restores the OS preference.
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


const STORE = "hq:v1";
const storeWith = (motion: string, version: number) => JSON.stringify({ state: { visited: [], firstVisit: false, locale: "en", motion }, version });

test("Full is the default even when the OS asks for reduced motion: rides animate", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterHQ(page);
  expect(await motionState(page)).toEqual({ motion: "full", reduced: false, system: true, attr: "full" });
  const ride = await rideTo(page, "L2");
  console.log(`ride L1 to L2 by default with the OS reduce flag: ${JSON.stringify(ride)}`);
  expect(ride).not.toBeNull();
  expect(ride!.distinctY).toBeGreaterThanOrEqual(12);
  // No one-time "turn on full motion" line any more (it was retired with the new default).
  await expect(page.getByTestId("dialog-box")).toHaveCount(0);
});

test("System brings the OS preference back: the ride is the 150 ms cut, and the choice survives a reload", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterHQ(page);
  const { trigger, group } = await pickMotion(page, en.hud.motion.system);
  await expect(group.getByRole("radio", { name: en.hud.motion.system })).toBeChecked();
  expect(await motionState(page)).toEqual({ motion: "system", reduced: true, system: true, attr: null });
  await expectNoSeriousViolations(page, "[data-testid='motion-popover']");
  await page.keyboard.press("Escape");
  await expect(group).toBeHidden();
  await expect(trigger).toBeFocused();
  // The landing's marquee copy hides under reduced motion (the stats wrap, still).
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".hx-tick-track[aria-hidden='true']")!).display)).toBe("none");
  const ride = await rideTo(page, "L2");
  expect(ride).not.toBeNull();
  expect(ride!.distinctY).toBeLessThanOrEqual(2);
  // Persisted in hq:v1 (version 3): the head script leaves html[data-motion] unset before hydration.
  await page.goto("/en?tier=lite");
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-motion"))).toBeNull();
  await waitForHQ(page);
  expect(await motionState(page)).toMatchObject({ motion: "system", reduced: true });
});

test("Reduced without the OS flag gives the cut and the reduced page CSS", async ({ page }) => {
  await enterHQ(page);
  expect(await motionState(page)).toEqual({ motion: "full", reduced: false, system: false, attr: "full" });
  await pickMotion(page, en.hud.motion.reduced);
  await page.keyboard.press("Escape");
  expect(await motionState(page)).toEqual({ motion: "reduced", reduced: true, system: false, attr: "reduced" });
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".hx-tick-track[aria-hidden='true']")!).display)).toBe("none");
  const ride = await rideTo(page, "L2");
  expect(ride!.distinctY).toBeLessThanOrEqual(2);
});

test("a new visitor's intro animates even when the OS asks for reduced motion", async ({ browser }: { browser: Browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("hq:terminal-seen", "1");
    localStorage.setItem("hq:onboarded", "done");
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

test.describe("existing visitors (store version 2 to 3)", () => {
  /** A version 2 store before the first navigation only, then the HQ opens straight in (returning visitor). */
  async function openWithStored(page: Page, motion: string) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(
      ([key, value]) => {
        if (!sessionStorage.getItem("hq:seeded")) localStorage.setItem(key, value);
        sessionStorage.setItem("hq:seeded", "1");
      },
      [STORE, storeWith(motion, 2)] as const,
    );
    await asReturningVisitor(page);
    await page.goto("/en?tier=lite");
    // Set by the head script before first paint; hydration never touches it.
    const attr = await page.evaluate(() => document.documentElement.getAttribute("data-motion"));
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    const saved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}") as { version?: number; state?: { motion?: string } }, STORE);
    return { attr, saved };
  }

  test("a stored System (the old default) becomes Full", async ({ page }) => {
    const { attr, saved } = await openWithStored(page, "system");
    expect(attr).toBe("full");
    expect(await motionState(page)).toEqual({ motion: "full", reduced: false, system: true, attr: "full" });
    await expect.poll(saved).toMatchObject({ version: 3, state: { motion: "full" } });
  });

  test("a stored Reduced stays Reduced", async ({ page }) => {
    const { attr, saved } = await openWithStored(page, "reduced");
    expect(attr).toBe("reduced");
    expect(await motionState(page)).toEqual({ motion: "reduced", reduced: true, system: true, attr: "reduced" });
    await expect.poll(saved).toMatchObject({ version: 3, state: { motion: "reduced" } });
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
  await expect(group.getByRole("radio", { name: id.hud.motion.full })).toBeChecked();
  const box = (await group.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await group.getByText(id.hud.motion.reduced, { exact: true }).click();
  expect(await motionState(page)).toMatchObject({ motion: "reduced", reduced: true });
  await expectNoSeriousViolations(page, "[data-testid='motion-choices']");
  await context.close();
});

test("Classic site: Full by default under the OS flag; Cmd-K sets Reduced or System and the page CSS follows", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPage(page, "/en?tier=static");
  // The marquee's aria-hidden copy only shows while the stats scroll.
  const marqueeCopy = page.locator(".hx-tick-track[aria-hidden='true']");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
  await expect(marqueeCopy).toBeVisible();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  async function run(query: string, label: string) {
    await page.keyboard.press("Control+k");
    await expect(palette).toBeVisible();
    await page.keyboard.type(query);
    await expect(palette.getByRole("option").first()).toContainText(label);
    // The toast stays 2.4 s after it painted; a CI page can stall longer between two checks, so catch it on a frame.
    const toast = page.waitForFunction((text) => [...document.querySelectorAll("[role='status']")].some((s) => s.textContent?.includes(text) && s.checkVisibility()), label, { polling: "raf" });
    await page.keyboard.press("Enter");
    await toast;
  }
  await run("motion reduced", en.hud.actions.motionReduced);
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await expect(marqueeCopy).toBeHidden();
  await run("motion system", en.hud.actions.motionSystem);
  await expect(page.locator("html")).not.toHaveAttribute("data-motion");
  // System follows the OS flag, which asks for reduced motion here.
  await expect(marqueeCopy).toBeHidden();
  await page.reload();
  await expect(page.locator("html")).not.toHaveAttribute("data-motion");
  await expect(marqueeCopy).toBeHidden();
});
