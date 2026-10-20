import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";
import en from "../messages/en.json";
import id from "../messages/id.json";
import { OFFICE_FIXTURE_NOW, OFFICE_FIXTURES } from "../src/lib/office/fixtures";
import { collectErrors, openPage } from "./hq";

/**
 * Live Agent Office on the Classic home page (`#office`, part 4 of the office): the lazy card after the intro, its
 * states, the hidden section when the office is switched off, and no request before the card nears the viewport.
 * `/api/office` is answered from `OFFICE_FIXTURES`. Set `OFFICE_SHOTS=<dir>` to write the owner's review captures.
 */

type Reply = unknown | number;

/** Answers `/api/office` from a mutable reply (a status number fails the request); returns the call count and a setter. */
async function mockOffice(page: Page, first: Reply) {
  let reply = first;
  let calls = 0;
  await page.route("**/api/office", (route: Route) => {
    calls += 1;
    return typeof reply === "number"
      ? route.fulfill({ status: reply })
      : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reply) });
  });
  return { calls: () => calls, set: (next: Reply) => (reply = next) };
}

const home = (locale: "en" | "id" = "en") => `/${locale}?tier=static`;

async function open(page: Page, path = home()) {
  await openPage(page, path);
  await page.locator("#office").scrollIntoViewIfNeeded();
}

const section = (page: Page) => page.getByTestId("office-section");

test.describe("Classic: Live Agent Office", () => {
  test("sits after the intro and shows the busy office, with Client project for private work", async ({ page }) => {
    const errors = collectErrors(page);
    await mockOffice(page, OFFICE_FIXTURES.busy);
    await open(page);
    const ids = await page.locator("main section[id]").evaluateAll((els) => els.map((e) => e.id));
    expect(ids.indexOf("office")).toBe(ids.indexOf("intro") + 1);
    await expect(section(page)).toHaveAttribute("data-status", "ready");
    await expect(page.locator("#office-title")).toHaveText(en.office.classic.title);
    await expect(page.getByTestId("office-desk")).toHaveCount(5);
    await expect(page.getByTestId("office-desk").nth(1)).toContainText(en.office.clientProject);
    await expect(page.getByTestId("office-github")).toHaveCount(4);
    await expect(page.getByTestId("office-github").first()).toContainText("CI");
    await expect(page.getByTestId("office-github").first().locator("a")).toHaveAttribute("href", /^https:\/\/github\.com\//);
    await expect(page.getByTestId("office-count-active")).toContainText("2");
    await expect(page.getByTestId("office-privacy")).toBeVisible();
    const axe = await new AxeBuilder({ page }).include("#office").analyze();
    expect(axe.violations).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("hides the section when the office is disabled", async ({ page }) => {
    await mockOffice(page, OFFICE_FIXTURES.disabled);
    await open(page);
    await expect(section(page)).toHaveAttribute("data-status", "disabled");
    await expect(page.locator("#office")).toBeHidden();
    await expect(page.locator("#journey")).toBeVisible();
  });

  test("shows Offline when the first request fails, without promising activity it does not have", async ({ page }) => {
    await mockOffice(page, 500);
    await open(page);
    await expect(section(page)).toHaveAttribute("data-status", "offline");
    await expect(page.getByTestId("office-live")).toHaveText(en.office.classic.offlineEmpty);
    await expect(page.getByTestId("office-desk")).toHaveCount(0);
    await expect(page.getByTestId("office-github")).toHaveCount(0);
  });

  test("offline after a good snapshot keeps only the last GitHub events, not the desks", async ({ page }) => {
    await page.clock.setFixedTime(OFFICE_FIXTURE_NOW);
    const office = await mockOffice(page, OFFICE_FIXTURES.busy);
    await open(page);
    await expect(section(page)).toHaveAttribute("data-status", "ready");
    await expect(page.getByTestId("office-desk")).toHaveCount(5);
    // Failures more than 60 s after the last good fetch: the next poll reports offline.
    office.set(500);
    await page.clock.setFixedTime(OFFICE_FIXTURE_NOW + 2 * 60_000);
    await expect(section(page)).toHaveAttribute("data-status", "offline", { timeout: 20_000 });
    await expect(page.getByTestId("office-live")).toHaveText(en.office.classic.offline);
    await expect(page.getByTestId("office-desk")).toHaveCount(0);
    await expect(page.getByTestId("office-count-active")).toHaveCount(0);
    await expect(page.getByTestId("office-today")).toHaveCount(0);
    await expect(page.getByTestId("office-github")).toHaveCount(4);
    const axe = await new AxeBuilder({ page }).include("#office").analyze();
    expect(axe.violations).toEqual([]);
  });

  test("does not load or fetch before the section nears the viewport", async ({ page }) => {
    const office = await mockOffice(page, OFFICE_FIXTURES.busy);
    await openPage(page, home());
    // Two frames after hydration: the lazy trigger has seen its first intersection report.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(section(page)).toHaveAttribute("data-status", "idle");
    await expect(page.locator("#office").getByText(en.office.classic.loading)).toBeAttached();
    expect(office.calls()).toBe(0);
    await page.locator("#office").scrollIntoViewIfNeeded();
    await expect.poll(office.calls).toBeGreaterThan(0);
    await expect(section(page)).toHaveAttribute("data-status", "ready");
  });

  for (const size of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`the first busy snapshot does not push the next section down at ${size.width}px`, async ({ page }) => {
      await page.setViewportSize(size);
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route("**/api/office", async (route) => {
        await held;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(OFFICE_FIXTURES.busy) });
      });
      await openPage(page, home("id"));
      await page.locator("#office").scrollIntoViewIfNeeded();
      await expect(section(page)).toHaveAttribute("data-status", "loading");
      const top = () => page.locator("#journey").evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      const before = await top();
      release();
      await expect(page.getByTestId("office-desk")).toHaveCount(5);
      // The reserve is the busy card's height (rounded up): the snapshot may settle a fraction of a pixel up, never down.
      expect(await top()).toBeLessThanOrEqual(before);
      expect(await top()).toBeGreaterThan(before - 1);
    });
  }

  test("Indonesian copy", async ({ page }) => {
    await mockOffice(page, OFFICE_FIXTURES.quiet);
    await open(page, home("id"));
    await expect(page.locator("#office-title")).toHaveText(id.office.classic.title);
    await expect(page.getByTestId("office-count-asleep")).toContainText(id.office.classic.counts.asleep);
    // Only the reviewing desk carries a task line; the sleeping desks work on nothing.
    await expect(page.getByTestId("office-desk")).toHaveCount(5);
    await expect(page.getByTestId("office-task")).toHaveText([id.office.clientProject]);
    await expect(page.getByTestId("office-privacy")).toHaveText(id.office.privacy);
  });

  test("captures for the owner", async ({ page }) => {
    const dir = process.env.OFFICE_SHOTS;
    test.skip(!dir, "set OFFICE_SHOTS=<dir> to write the review captures");
    test.setTimeout(240_000);
    // The fixtures' clock (15:02 WIB), so the times read like the live card.
    await page.clock.setFixedTime(OFFICE_FIXTURE_NOW + 2 * 60_000);
    // Full-page clips in page coordinates: an element shot scrolls the page, and the sticky header covers the card.
    const pageBox = (selector: string) =>
      page.locator(selector).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
      });
    const clip = async (name: string, top: number, bottom: number) => {
      // From the top of the page, so the sticky header stays in its own place, above the clip.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${dir}/classic-${name}.png`, fullPage: true, clip: { x: 0, y: top, width: page.viewportSize()!.width, height: bottom - top } });
    };
    const shoot = async (name: string) => {
      const box = await pageBox("#office");
      await clip(name, box.top, box.bottom);
    };
    for (const size of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size);
      for (const name of ["busy", "rough", "quiet", "semiLive", "off"] as const) {
        await page.unrouteAll();
        await mockOffice(page, OFFICE_FIXTURES[name]);
        await open(page);
        await expect(section(page)).toHaveAttribute("data-status", "ready");
        await shoot(`${name}-${size.width}`);
      }
      // Disabled: the area between the intro and the journey, to show the section is gone.
      await page.unrouteAll();
      await mockOffice(page, OFFICE_FIXTURES.disabled);
      await open(page, home());
      await expect(section(page)).toHaveAttribute("data-status", "disabled");
      const intro = await pageBox("#intro");
      const journey = await pageBox("#journey");
      await clip(`disabled-${size.width}`, intro.bottom - 240, journey.top + 240);
      // Offline before any snapshot.
      await page.unrouteAll();
      await mockOffice(page, 500);
      await open(page);
      await expect(section(page)).toHaveAttribute("data-status", "offline");
      await shoot(`offline-${size.width}`);
      // Keep-last, then offline: a good snapshot, then failures more than 60 s later (the next poll, 10 s on).
      await page.unrouteAll();
      const office = await mockOffice(page, OFFICE_FIXTURES.busy);
      await open(page);
      await expect(section(page)).toHaveAttribute("data-status", "ready");
      office.set(500);
      await page.clock.setFixedTime(OFFICE_FIXTURE_NOW + 4 * 60_000);
      await expect(section(page)).toHaveAttribute("data-status", "offline", { timeout: 20_000 });
      await shoot(`offline-kept-${size.width}`);
      await page.clock.setFixedTime(OFFICE_FIXTURE_NOW + 2 * 60_000);
    }
    await page.unrouteAll();
    await mockOffice(page, OFFICE_FIXTURES.busy);
    await open(page, home("id"));
    await expect(section(page)).toHaveAttribute("data-status", "ready");
    await shoot("busy-390-id");
  });
});
