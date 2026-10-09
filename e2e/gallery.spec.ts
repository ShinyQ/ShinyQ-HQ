import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { asReturningVisitor, waitForHQ } from "./hq";
import type { Pod } from "../src/content/schema";
import { content } from "./routes";

const pod = content.floors.labs.pods.find((p) => p.slug === "voice-ai-contact-center") as unknown as Pod;

test.describe("project galleries and tech logos (static pages)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("hq:terminal-seen", "1"));
  });

  test("pod page gallery opens a lightbox with keyboard navigation and focus restore", async ({ page }) => {
    await page.goto(`/en/labs/${pod.slug}?tier=static`);
    const gallery = page.getByTestId("gallery");
    await expect(gallery.getByRole("button")).toHaveCount(pod.assets.length);
    const second = gallery.getByRole("button").nth(1);
    await second.click();
    const dialog = page.getByTestId("lightbox");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close image viewer" })).toBeFocused();
    await expect(dialog.getByRole("img")).toHaveAttribute("src", pod.assets[1].src);
    const loaded = await dialog.getByRole("img").evaluate((img: HTMLImageElement) => img.decode().then(() => img.naturalWidth));
    expect(loaded).toBe(pod.assets[1].width);
    await page.keyboard.press("ArrowRight");
    await expect(dialog.getByRole("img")).toHaveAttribute("src", pod.assets[2].src);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(dialog.getByRole("img")).toHaveAttribute("src", pod.assets[0].src);
    const axe = await new AxeBuilder({ page }).include("[data-testid='lightbox']").analyze();
    expect(axe.violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(second).toBeFocused();
  });

  test("stack chips, pod cards and journey entries show logos", async ({ page }) => {
    await page.goto(`/en/labs/${pod.slug}?tier=static`);
    await expect(page.locator("#stack img[src^='/tech/']").first()).toBeVisible();
    await page.goto("/en/labs?tier=static");
    const card = page.locator("article", { has: page.getByRole("link", { name: pod.title.en, exact: true }) });
    await expect(card.locator(`img[src='${pod.assets[0].src.replace(".webp", ".thumb.webp")}']`)).toBeVisible();
    await page.goto("/en/journey/jenius-2024?tier=static");
    await expect(page.getByRole("img", { name: "Jenius logo" })).toBeVisible();
  });
});

test.describe("galleries in the Glass Drawer", () => {
  test.describe.configure({ timeout: 150_000 });

  test("a pod drawer shows logo chips and opens the lightbox over the drawer", async ({ page }) => {
    await asReturningVisitor(page);
    await page.goto(`/en/labs/${pod.slug}?tier=lite`);
    await waitForHQ(page);
    const drawer = page.getByTestId("room-drawer");
    await expect(drawer).toBeVisible({ timeout: 90_000 });
    await drawer.getByRole("tab", { name: "Stack" }).click();
    await expect(drawer.locator("img[src='/tech/azure-openai.svg']")).toBeVisible();
    await drawer.getByRole("tab", { name: "Overview" }).click();
    await drawer.getByTestId("gallery").getByRole("button").first().click();
    const lightbox = page.getByTestId("lightbox");
    await expect(lightbox).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(lightbox).toBeHidden();
    await expect(drawer).toBeVisible();
  });
});
