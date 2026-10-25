import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import content from "../content/site-content.json";
import en from "../messages/en.json";
import { openPage } from "./hq";

const URL = "/en/journey?tier=static";
const stops = content.floors.careerArchive.timeTravel.stops;
const caption = (id: string) => stops.find((s) => s.id === id)!.caption.en;
const STEP_MS = 2500;

test.describe("Time Travel on /journey", () => {
  test("opens on now and scrubs with the keyboard", async ({ page }) => {
    await openPage(page, URL);
    const section = page.locator("#time-travel");
    await expect(section.getByText(caption("2026"))).toBeVisible();
    const slider = section.getByRole("slider", { name: en.timeTravel.slider });
    await expect(slider).toHaveAttribute("aria-valuetext", "2026");
    await slider.focus();
    await page.keyboard.press("Home");
    await expect(section.getByText(caption("pre-2019"))).toBeVisible();
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuetext", "2021");
    await expect(section.getByText(caption("2021"))).toBeVisible();
    await expect(section.getByText(caption("2026"))).toBeHidden();
    await expect(section.locator('[data-tt-stop="4"]')).toHaveAttribute("opacity", "0.15");
  });

  test("Play walks from the prologue to now", async ({ page }) => {
    await page.clock.install();
    await openPage(page, URL);
    // Without a pause the installed clock keeps ticking in real time; after this only runFor advances it.
    await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 100));
    const section = page.locator("#time-travel");
    await section.getByRole("button", { name: en.timeTravel.play }).click();
    await expect(section.getByText(caption("pre-2019"))).toBeVisible();
    await page.clock.runFor(STEP_MS);
    await expect(section.getByText(caption("2019"))).toBeVisible();
    await page.clock.runFor(STEP_MS * (stops.length - 2));
    await expect(section.getByText(caption("2026"))).toBeVisible();
    await expect(section.getByRole("button", { name: en.timeTravel.play })).toBeVisible();
  });

  test("a building selects its year and keeps the URL", async ({ page }) => {
    await openPage(page, URL);
    const section = page.locator("#time-travel");
    await section.getByRole("link", { name: /^2022:/ }).click();
    await expect(section.getByText(caption("2022"))).toBeVisible();
    expect(new globalThis.URL(page.url()).hash).toBe("");
  });

  test("has no accessibility violations", async ({ page }) => {
    await openPage(page, URL);
    const results = await new AxeBuilder({ page }).include("#time-travel").analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});

test.describe("Time Travel without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("shows now, no controls, and each building links to its year", async ({ page }) => {
    await page.goto(URL);
    const section = page.locator("#time-travel");
    await expect(section.getByText(caption("2026"))).toBeVisible();
    await expect(section.getByRole("slider")).toHaveCount(0);
    await section.getByRole("link", { name: /^2021:/ }).click();
    await expect(page).toHaveURL(/#y2021$/);
  });
});
