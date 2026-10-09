import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { heroPod } from "./routes";
import rawData from "../content/site-content.json";
import { SiteContentSchema } from "../src/content/schema";

const data = SiteContentSchema.parse(rawData);
const mission = (id: string) => data.missions.find((entry) => entry.id === id)!;

/** Marks the Rover Terminal as seen so it does not auto-open. */
async function seenTerminal(page: Page) {
  await page.addInitScript(() => localStorage.setItem("hq:terminal-seen", "1"));
}

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.describe("command palette", () => {
  test.beforeEach(async ({ page }) => seenTerminal(page));

  test("Ctrl+K to a pod", async ({ page }) => {
    // Wait for hydration so the shortcut listener is attached.
    await page.goto("/en/library", { waitUntil: "networkidle" });
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await page.keyboard.type("voice");
    await expect(palette.getByRole("option").first()).toContainText(data.floors.labs.pods.find((pod) => pod.slug === "voice-ai-contact-center")!.title.en);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/en\/labs\/voice-ai-contact-center$/);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(palette).toBeHidden();
  });

  test("search button and / open it; Esc returns focus", async ({ page }) => {
    await page.goto("/en/labs");
    const button = page.getByRole("button", { name: /Open search/ });
    await button.click();
    await expect(page.getByRole("combobox")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(button).toBeFocused();
    await page.locator("main").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("/");
    await expect(page.getByRole("combobox")).toBeFocused();
  });

  test("searches in Indonesian", async ({ page }) => {
    await page.goto("/id/labs", { waitUntil: "networkidle" });
    await page.keyboard.press("Control+k");
    await page.keyboard.type("unduh");
    await expect(page.getByRole("dialog", { name: "Palet perintah" }).getByRole("option").first()).toContainText("Unduh CV");
  });

  test("is a full-screen sheet on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en?tier=static");
    await page.getByRole("button", { name: /Open search/ }).click();
    const box = await page.getByRole("dialog", { name: "Command palette" }).boundingBox();
    expect(box?.width).toBe(390);
    expect(box?.height).toBe(844);
  });
});

test.describe("missions on static pages", () => {
  test.beforeEach(async ({ page }) => seenTerminal(page));

  test("terminal runs hire with its number key", async ({ page }) => {
    await page.goto(`/en/labs/${heroPod.slug}`);
    await page.getByRole("button", { name: "Missions" }).click();
    const terminal = page.getByRole("dialog", { name: "Rover Terminal" });
    await expect(terminal).toContainText("rover@hq:~$ ./missions");
    await expect(terminal.getByRole("option").nth(4)).toContainText(mission("hire").label.en);
    await page.keyboard.press("5");
    await expect(page).toHaveURL(/\/en\/contact$/);
    await expect(terminal).toBeHidden();
  });

  test("journey drives to 2019 and the rover speaks", async ({ page }) => {
    await page.goto("/en?tier=static");
    await page.getByRole("button", { name: "Missions" }).click();
    await page.getByRole("option", { name: mission("journey").label.en }).click();
    await expect(page).toHaveURL(/\/en\/journey#y2019$/);
    await expect(page.getByRole("status").filter({ hasText: mission("journey").steps.find((step) => step.kind === "say")!.text.en })).toBeVisible();
  });

  test("all projects opens the palette filtered to pods", async ({ page }) => {
    await page.goto("/en?tier=static");
    await page.getByRole("button", { name: "Missions" }).click();
    await page.getByRole("option", { name: mission("projects").label.en }).click();
    await expect(page).toHaveURL(/\/en\/labs$/);
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette.getByRole("button", { name: "Clear filter" })).toBeVisible();
    await palette.getByRole("option").first().click();
    await expect(page).toHaveURL(/\/en\/labs\/[a-z0-9-]+$/);
  });

  test("Esc means drive myself", async ({ page }) => {
    await page.goto("/en/journey");
    await page.getByRole("button", { name: "Missions" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page).toHaveURL(/\/en\/journey$/);
  });
});

test("Rover Terminal auto-opens once on the first Lobby visit", async ({ page }) => {
  await page.goto("/en?tier=static");
  await expect(page.getByRole("dialog", { name: "Rover Terminal" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.waitForTimeout(1000);
  await expect(page.getByRole("dialog")).toBeHidden();
});

test.describe("accessibility (axe)", () => {
  test.beforeEach(async ({ page }) => seenTerminal(page));

  test("Lobby with the terminal open", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/en?tier=static");
    await page.getByRole("button", { name: "Missions" }).click();
    await expect(page.getByRole("dialog", { name: "Rover Terminal" })).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test("pod page with the palette open and a query", async ({ page }) => {
    await page.goto(`/en/labs/${heroPod.slug}`, { waitUntil: "networkidle" });
    await page.keyboard.press("Control+k");
    await page.keyboard.type("fastapi");
    await expect(page.getByRole("option").first()).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test("Indonesian Lobby without overlays", async ({ page }) => {
    await page.goto("/id");
    await expectNoSeriousViolations(page);
  });
});
