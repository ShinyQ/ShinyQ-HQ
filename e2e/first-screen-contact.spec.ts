import { expect, test, type Locator, type Page } from "@playwright/test";
import { openPage, waitForHQ } from "./hq";
import data from "../content/site-content.json";
import en from "../messages/en.json";

/**
 * Reaching him from the first screen (owner decision 2026-11-01): the landing hero carries the availability line and
 * the email, and the boot card offers View CV and Contact beside Boot rover and Classic site, on every screen shape.
 */
const email = data.floors.roof.contact.email;
const box = async (locator: Locator) => (await locator.boundingBox())!;

async function bootCard(page: Page, path = "/en") {
  await page.goto(`${path}?tier=lite`);
  await waitForHQ(page);
  const overlay = page.getByTestId("boot");
  await expect(overlay.locator(".hq-boot-card")).toBeVisible();
  return overlay;
}

test.describe("landing hero", () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`shows the availability line and the email in the first screen (${viewport.width}x${viewport.height})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openPage(page, "/en?tier=static");
      const line = page.getByTestId("hero-contact");
      await expect(line).toContainText(data.floors.roof.availability.en);
      const mail = line.getByRole("link", { name: email });
      await expect(mail).toHaveAttribute("href", `mailto:${email}`);
      const b = await box(mail);
      expect(b.y + b.height, "the email is in the first screen").toBeLessThanOrEqual(viewport.height);
    });
  }
});

test.describe("boot card", () => {
  test("the server cover carries View CV and Contact as real links (they work before any JS)", async ({ page }) => {
    const html = await (await page.request.get("/en")).text();
    const cover = html.slice(html.indexOf('id="hq-boot-cover"'));
    expect(cover).toContain('href="/en/cv?view=classic"');
    expect(cover).toContain('href="/en/contact?view=classic#availability"');
  });

  test.describe("portrait phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test("View CV and Contact sit in the docked card; View CV opens the CV reader over the boot", async ({ page }) => {
      const overlay = await bootCard(page);
      const card = overlay.locator(".hq-boot-card");
      const cv = overlay.getByRole("link", { name: en.common.viewCv });
      const contact = overlay.getByRole("link", { name: en.hud.bootContact });
      await expect(contact).toHaveAttribute("href", "/en/contact?view=classic#availability");
      const c = await box(card);
      expect(c.y, "the card stays in the lower half").toBeGreaterThanOrEqual(844 * 0.4);
      for (const link of [cv, contact]) {
        const b = await box(link);
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(b.y + b.height).toBeLessThanOrEqual(844);
      }
      await cv.click();
      await expect(page.getByRole("dialog", { name: "CV", exact: true })).toBeVisible();
      await expect(page).toHaveURL(/\/en\?tier=lite$/);
    });
  });

  test.describe("landscape phone", () => {
    test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

    test("the owner block is never clipped and every action is on screen", async ({ page }) => {
      const overlay = await bootCard(page);
      const who = await box(overlay.getByTestId("boot-who"));
      expect(who.y, "the name is not cut off at the top").toBeGreaterThanOrEqual(0);
      await expect(overlay.locator(".hq-boot-log")).toBeHidden();
      for (const name of ["Boot rover", "Classic site", en.common.viewCv, en.hud.bootContact]) {
        const action = overlay.getByRole(name === "Boot rover" ? "button" : "link", { name });
        const b = await box(action);
        expect(b.y + b.height, name).toBeLessThanOrEqual(390);
      }
    });
  });
});
