import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { NAV_TIMEOUT, chooseMotion, openPage } from "./hq";
import { heroPod } from "./routes";
import rawData from "../content/site-content.json";
import { SiteContentSchema } from "../src/content/schema";
import en from "../messages/en.json";

const data = SiteContentSchema.parse(rawData);
const mission = (id: string) => data.missions.find((entry) => entry.id === id)!;

/** Marks the Rover Terminal as seen so it does not auto-open. */
async function seenTerminal(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("hq:terminal-seen", "1");
    localStorage.setItem("hq:onboarded", "done");
  });
}

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.describe("command palette", () => {
  test.beforeEach(async ({ page }) => seenTerminal(page));

  test("Ctrl+K to a pod", async ({ page }) => {
    // Waits for hydration, so the shortcut listener is attached.
    await openPage(page, "/en/library");
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await page.keyboard.type("voice");
    await expect(palette.getByRole("option").first()).toContainText(data.floors.labs.pods.find((pod) => pod.slug === "voice-ai-contact-center")!.title.en);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/en\/labs\/voice-ai-contact-center$/, { timeout: NAV_TIMEOUT });
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(palette).toBeHidden();
  });

  test("search button and / open it; Esc returns focus", async ({ page }) => {
    await openPage(page, "/en/labs");
    const button = page.getByRole("button", { name: /open search/i });
    await button.click();
    await expect(page.getByRole("dialog", { name: "Command palette" }).getByRole("combobox")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(button).toBeFocused();
    await page.locator("main").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("/");
    await expect(page.getByRole("dialog", { name: "Command palette" }).getByRole("combobox")).toBeFocused();
  });

  test("searches in Indonesian", async ({ page }) => {
    await openPage(page, "/id/labs", { waitUntil: "networkidle" });
    await page.keyboard.press("Control+k");
    await page.keyboard.type("lihat cv");
    const palette = page.getByRole("dialog", { name: "Palet perintah" });
    await expect(palette.getByRole("option").first()).toContainText("Lihat CV");
    // The "View CV" command opens the CV viewer modal, same PDF in every language.
    await palette.getByRole("group", { name: "Perintah" }).getByRole("option", { name: /Lihat CV/ }).click();
    const viewer = page.getByRole("dialog", { name: "CV", exact: true });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole("link", { name: "Unduh PDF" })).toHaveAttribute("href", `/cv/${data.floors.roof.cv.fileName}.pdf`);
  });

  test("is a full-screen sheet on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPage(page, "/en?tier=static");
    await page.getByRole("button", { name: /open search/i }).click();
    const box = await page.getByRole("dialog", { name: "Command palette" }).boundingBox();
    expect(box?.width).toBe(390);
    expect(box?.height).toBe(844);
  });
});

test.describe("missions on static pages", () => {
  test.beforeEach(async ({ page }) => seenTerminal(page));

  test("terminal runs hire with its number key", async ({ page }) => {
    await openPage(page, `/en/labs/${heroPod.slug}`);
    await page.getByRole("button", { name: en.hud.launcher.askRover, exact: true }).click();
    const terminal = page.getByRole("dialog", { name: en.hud.terminal.title });
    await expect(terminal).toContainText(en.hud.terminal.prompt);
    await expect(terminal.getByRole("option").nth(5)).toContainText(mission("hire").label.en);
    await page.keyboard.press("6");
    await expect(page).toHaveURL(/\/en\/contact$/, { timeout: NAV_TIMEOUT });
    await expect(terminal).toBeHidden();
  });

  test("journey opens the journey page", async ({ page }) => {
    await openPage(page, "/en?tier=static");
    await page.getByRole("button", { name: en.hud.launcher.askRover, exact: true }).click();
    await page.getByRole("option", { name: mission("journey").label.en }).click();
    await expect(page).toHaveURL(/\/en\/journey$/, { timeout: NAV_TIMEOUT });
  });

  test("all projects opens the palette filtered to pods", async ({ page }) => {
    await openPage(page, "/en?tier=static");
    await page.getByRole("button", { name: en.hud.launcher.askRover, exact: true }).click();
    await page.getByRole("option", { name: mission("projects").label.en }).click();
    await expect(page).toHaveURL(/\/en\/labs$/, { timeout: NAV_TIMEOUT });
    const palette = page.getByRole("dialog", { name: en.hud.palette.title });
    await expect(palette.getByRole("button", { name: en.hud.palette.clearFilter })).toBeVisible();
    await palette.getByRole("option").first().click();
    await expect(page).toHaveURL(/\/en\/labs\/[a-z0-9-]+$/, { timeout: NAV_TIMEOUT });
  });

  test("Esc means drive myself", async ({ page }) => {
    await openPage(page, "/en/journey");
    await page.getByRole("button", { name: en.hud.launcher.askRover, exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page).toHaveURL(/\/en\/journey$/);
  });
});

test("the Page View Lobby never opens the Rover Terminal on its own; the header button does", async ({ page }) => {
  // First visit: hq:terminal-seen is not set.
  await openPage(page, "/en?tier=static");
  await page.waitForTimeout(2500);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
  await page.getByRole("button", { name: en.hud.launcher.askRover, exact: true }).click();
  await expect(page.getByRole("dialog", { name: en.hud.terminal.title })).toBeVisible();
});

test.describe("accessibility (axe)", () => {
  test.beforeEach(async ({ page }) => seenTerminal(page));

  test("Lobby with the terminal open", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await chooseMotion(page, "system");
    await openPage(page, "/en?tier=static");
    await page.getByRole("button", { name: "Ask Rover", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Ask Rover" })).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test("pod page with the palette open and a query", async ({ page }) => {
    await openPage(page, `/en/labs/${heroPod.slug}`, { waitUntil: "networkidle" });
    await page.keyboard.press("Control+k");
    await page.keyboard.type("fastapi");
    await expect(page.getByRole("option").first()).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test("Indonesian Lobby without overlays", async ({ page }) => {
    await openPage(page, "/id");
    await expectNoSeriousViolations(page);
  });
});
