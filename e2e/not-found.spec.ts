import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import en from "../messages/en.json";

test("404: Rover took a wrong turn, three ways out, CV first", async ({ page }) => {
  const response = await page.goto("/en/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(en.notFound.title);
  await expect(page.getByTestId("not-found-cv")).toHaveAttribute("href", "/en/cv");
  await expect(page.getByTestId("not-found-work")).toHaveAttribute("href", "/en/labs");
  await expect(page.getByRole("link", { name: /English/ })).toHaveAttribute("href", "/en");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});

test("404: suggests the closest page for a mistyped project URL", async ({ page }) => {
  await page.goto("/en/labs/voice-ai-contact-centre");
  const suggestion = page.getByTestId("did-you-mean");
  await expect(suggestion).toBeVisible();
  await expect(suggestion.getByRole("link")).toHaveAttribute("href", "/en/labs/voice-ai-contact-center");
});

test("404: no suggestion for a far-off path, and the page works without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/en/totally-unrelated-thing");
  await expect(page.getByTestId("not-found-cv")).toBeVisible();
  await expect(page.getByTestId("did-you-mean")).toHaveCount(0);
  await context.close();
});
