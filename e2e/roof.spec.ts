import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import content from "../content/site-content.json";
import en from "../messages/en.json";
import { buildRoofLayout, ROOF_STOPS } from "../src/experience/floors/roof/layout";
import { asReturningVisitor, collectErrors, expectRenderBudget, snapshot, waitForHQ, waitForPhase, waitForRoom, waitForSceneLive } from "./hq";

/**
 * RF roof deck (RF revamp plan): deep link, contact actions, render budget and the "Meet me" walk.
 * Walks are off unless a test turns them on, so the first-visit prompt never races the palette.
 */
test.describe.configure({ timeout: 150_000 });

/** The whole RF frame on the lite tier. Today's roof measured 113 draw calls (Task 1I Step 4); the cap stays at least 30 below. */
const RF_MAX_DRAW_CALLS = 80;

const CHANNELS = { linkedin: "LinkedIn", github: "GitHub", huggingface: "Hugging Face", medium: "Medium", googleScholar: "Google Scholar", ieeeXplore: "IEEE Xplore" } as const;

async function openRoof(page: Page, { locale = "en", walk = "off" }: { locale?: "en" | "id"; walk?: "on" | "off" } = {}) {
  await asReturningVisitor(page);
  await page.goto(`/${locale}/contact?tier=lite&walk=${walk}`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

async function expectRoverNear(page: Page, point: { x: number; z: number }, tolerance = 1.5) {
  const { rover } = await snapshot(page);
  expect(Math.hypot(rover.x - point.x, rover.z - point.z)).toBeLessThan(tolerance);
}

async function openFromPalette(page: Page, query: string, room: string) {
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Command palette" }).getByRole("combobox")).toBeFocused();
  await page.keyboard.type(query);
  await page.keyboard.press("Enter");
  await waitForRoom(page, room);
}

test.describe("RF roof deck", () => {
  test("/en/contact deep links onto the deck in front of the plaza, the page stays underneath", async ({ page }) => {
    const errors = collectErrors(page);
    await openRoof(page);
    const s = await snapshot(page);
    expect(s).toMatchObject({ floor: "RF", phase: "explore", ride: null });
    const { spawn } = buildRoofLayout().floor;
    expect(Math.hypot(s.rover.x - spawn.x, s.rover.z - spawn.z)).toBeLessThan(1.5);
    await expect(page).toHaveURL(/\/en\/contact\?tier=lite/);
    await expect(page.locator("#site-shell")).toHaveAttribute("inert", "");
    await expect(page.locator("#cv")).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test("contact actions: location and timezone, Email me, Copy email, channels in new tabs, then the CV viewer", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openRoof(page);
    await openFromPalette(page, en.hud.rooms.contact, "RF:contact");
    await expectRoverNear(page, ROOF_STOPS.contact);
    const drawer = page.getByTestId("room-drawer");
    await expect(drawer).toContainText(content.floors.roof.availability.en);
    await expect(drawer).toContainText(`${content.profile.location.en} · ${content.profile.timezone}`);
    await expect(drawer.getByRole("link", { name: en.drawer.rooms.emailMe })).toHaveAttribute("href", `mailto:${content.floors.roof.contact.email}`);
    await drawer.getByRole("button", { name: en.drawer.rooms.copyEmail }).click();
    await expect(drawer.getByRole("status")).toHaveText(en.drawer.rooms.copied);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(content.floors.roof.contact.email);
    const contact = content.floors.roof.contact as Record<string, string | undefined>;
    for (const [id, name] of Object.entries(CHANNELS)) {
      if (!contact[id]) continue;
      const link = drawer.getByRole("link", { name: new RegExp(name) });
      await expect(link).toHaveAttribute("href", contact[id]!);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    const axe = await new AxeBuilder({ page }).include("[data-testid='room-drawer']").analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);

    await openFromPalette(page, en.hud.rooms.cv, "RF:cv");
    await expectRoverNear(page, ROOF_STOPS.cv);
    await drawer.getByRole("button", { name: en.drawer.rooms.cvView }).click();
    const viewer = page.getByRole("dialog", { name: "CV", exact: true });
    await expect(viewer.getByRole("button", { name: en.cv.close })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    await expect(drawer).toBeVisible();
  });

  test("RF stays under the floor budget and well under today's roof", async ({ page }) => {
    await openRoof(page);
    await page.waitForTimeout(1500);
    await expectRenderBudget(page);
    expect((await snapshot(page)).drawCalls).toBeLessThan(RF_MAX_DRAW_CALLS);
  });

  test("Meet me: the first visit offers the walk, which visits the about board, the availability, the CV and contact", async ({ page }) => {
    const errors = collectErrors(page);
    await openRoof(page, { walk: "on" });
    const prompt = page.getByTestId("dialog-choices");
    await expect(page.getByTestId("dialog-box")).toContainText(en.dialog.floor.RF.replace("{name}", content.profile.name.split(" ")[0]), { timeout: 15_000 });
    await prompt.getByRole("button", { name: en.walk.meet.start }).click();
    const bar = page.getByTestId("walk-bar");
    await expect(page.getByTestId("walk-counter")).toContainText("Stop 1 of 4");
    await expect(bar).toHaveAttribute("data-stop", "RF:about");
    await expect(bar).toHaveAttribute("data-status", "arrived", { timeout: 90_000 });
    await expectRoverNear(page, ROOF_STOPS.about);
    await page.keyboard.press("]");
    await expect(page.getByTestId("walk-counter")).toContainText("Stop 2 of 4");
    await expect(bar).toHaveAttribute("data-stop", "RF:availability");
    await expect(bar).toHaveAttribute("data-status", "arrived", { timeout: 90_000 });
    await expectRoverNear(page, ROOF_STOPS.availability);
    await page.keyboard.press("]");
    await waitForRoom(page, "RF:cv");
    await page.keyboard.press("]");
    await waitForRoom(page, "RF:contact");
    expect(errors).toEqual([]);
  });

  test("reduced motion: the roof renders still and inside the budget", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openRoof(page);
    expect(await page.evaluate(() => (window as unknown as { __hq: { store: { getState: () => { reducedMotion: boolean } } } }).__hq.store.getState().reducedMotion)).toBe(true);
    await page.waitForTimeout(1500);
    await expectRenderBudget(page);
    expect((await snapshot(page)).drawCalls).toBeLessThan(RF_MAX_DRAW_CALLS);
  });
});
