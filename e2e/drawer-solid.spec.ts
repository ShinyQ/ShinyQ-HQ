import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { asReturningVisitor, waitForHQ, waitForPhase } from "./hq";

test.describe.configure({ timeout: 120_000 });

type HQ = { __hq: { store: { getState: () => { openRoom: (room: string) => void } } } };

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "portrait tablet", width: 1024, height: 1366, mobile: false },
  { name: "phone", width: 390, height: 844, mobile: true },
] as const;

/** Alpha of a computed `rgb()`/`rgba()` background colour (1 when opaque). */
function alphaOf(color: string): number {
  const parts = color.match(/[\d.]+/g)?.map(Number) ?? [];
  return parts.length >= 4 ? parts[3] : 1;
}

async function openModelsShelf(page: Page) {
  await asReturningVisitor(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en/library?tier=lite");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await page.evaluate(() => (window as unknown as HQ).__hq.store.getState().openRoom("L4:publications"));
  const drawer = page.getByTestId("room-drawer");
  await expect(drawer).toBeVisible();
  // Let the slide-in settle before measuring.
  await page.waitForTimeout(600);
  return drawer;
}

for (const vp of VIEWPORTS) {
  test(`${vp.name}: the drawer is near-opaque, clears the HUD top bar and passes contrast`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile });
    const page = await context.newPage();
    const drawer = await openModelsShelf(page);

    const background = await drawer.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(alphaOf(background)).toBeGreaterThanOrEqual(0.9);

    // No visible top-bar control (Quick view, language, sound, Page view, menu) may sit under the drawer.
    const box = (await drawer.boundingBox())!;
    const controls = await page.locator("[data-testid='hud'] :is(a, button):visible").evaluateAll((els) =>
      els
        .filter((el) => !el.closest("[data-testid='room-drawer']"))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { label: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "", x: r.x, y: r.y, w: r.width, h: r.height };
        })
        .filter((r) => r.y < 90 && r.w > 0),
    );
    expect(controls.length).toBeGreaterThan(0);
    for (const c of controls) {
      const overlaps = c.x < box.x + box.width && c.x + c.w > box.x && c.y < box.y + box.height && c.y + c.h > box.y;
      expect(overlaps, `drawer covers "${c.label}"`).toBe(false);
    }

    const results = await new AxeBuilder({ page }).include("[data-testid='room-drawer']").withRules(["color-contrast"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    await context.close();
  });
}

test("HUD pills over the world are near-opaque", async ({ page }) => {
  await asReturningVisitor(page);
  await page.goto("/en?tier=lite");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  const pill = page.getByRole("link", { name: "Quick view" });
  await expect(pill).toBeVisible();
  expect(alphaOf(await pill.evaluate((el) => getComputedStyle(el).backgroundColor))).toBeGreaterThanOrEqual(0.9);
});
