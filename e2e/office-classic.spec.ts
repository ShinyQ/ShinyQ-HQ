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

/** Answers `/api/office` with `reply` only after `release()`, so the test can measure the page while the card loads. */
async function heldOffice(page: Page, reply: Reply) {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/office", async (route) => {
    await held;
    await (typeof reply === "number" ? route.fulfill({ status: reply }) : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reply) }));
  });
  return { release: () => release() };
}

/** Sums the layout shifts (without recent input) from now on; the returned reader waits a frame for pending entries. */
async function watchShifts(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __officeShift: number; __officeShiftObserver?: PerformanceObserver };
    w.__officeShiftObserver?.disconnect();
    w.__officeShift = 0;
    w.__officeShiftObserver = new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__officeShift += e.value;
    });
    w.__officeShiftObserver.observe({ type: "layout-shift" });
  });
  return () =>
    page.evaluate(
      () =>
        new Promise<number>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve((window as unknown as { __officeShift: number }).__officeShift))),
        ),
    );
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
    await expect(page.getByTestId("office-privacy")).toHaveCount(0);
    const axe = await new AxeBuilder({ page }).include("#office").analyze();
    expect(axe.violations).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("a disabled office stays in place while on screen, then hides once scrolled away", async ({ page }) => {
    await mockOffice(page, OFFICE_FIXTURES.disabled);
    await open(page);
    await expect(page.getByTestId("office-panel")).toHaveAttribute("data-feed", "disabled");
    await expect(page.getByTestId("office-live")).toHaveText(en.office["3d"].drawer.disabled);
    await expect(section(page)).not.toHaveAttribute("data-status", "disabled");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(section(page)).toHaveAttribute("data-status", "disabled");
    await expect(page.locator("#office")).toBeHidden();
    await expect(page.locator("#journey")).toBeAttached();
  });

  test("a disabled office that answers while the card is below the screen hides at once, with no layout shift", async ({ page }) => {
    await mockOffice(page, OFFICE_FIXTURES.disabled);
    await openPage(page, home());
    const shifts = await watchShifts(page);
    // The card within a screen below the viewport: the panel loads and polls, but nothing of it is visible.
    await page.locator("#office").evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - window.innerHeight - 200));
    await expect(section(page)).toHaveAttribute("data-status", "disabled");
    await expect(page.locator("#office")).toBeHidden();
    expect(await shifts()).toBe(0);
  });

  test("shows Offline when the first request fails, over the off-duty desks, without promising activity", async ({ page }) => {
    await mockOffice(page, 500);
    await open(page);
    await expect(section(page)).toHaveAttribute("data-status", "offline");
    await expect(page.getByTestId("office-live")).toHaveText(en.office.classic.offlineEmpty);
    await expect(page.getByTestId("office-desk")).toHaveCount(5);
    await expect(page.locator('[data-testid=office-desk][data-state="off-duty"]')).toHaveCount(5);
    await expect(page.getByTestId("office-github")).toHaveCount(0);
    await expect(page.getByTestId("office-github-empty")).toHaveCount(0);
    const axe = await new AxeBuilder({ page }).include("#office").analyze();
    expect(axe.violations).toEqual([]);
  });

  test("offline after a good snapshot keeps the last known rows, dimmed, with their time", async ({ page }) => {
    await page.clock.setFixedTime(OFFICE_FIXTURE_NOW);
    const office = await mockOffice(page, OFFICE_FIXTURES.busy);
    await open(page);
    await expect(section(page)).toHaveAttribute("data-status", "ready");
    await expect(page.getByTestId("office-desk")).toHaveCount(5);
    // Failures more than 60 s after the last good fetch: the next poll reports offline.
    office.set(500);
    await page.clock.setFixedTime(OFFICE_FIXTURE_NOW + 2 * 60_000);
    await expect(section(page)).toHaveAttribute("data-status", "offline", { timeout: 20_000 });
    await expect(page.getByRole("status").filter({ hasText: en.office.classic.offline })).toBeVisible();
    await expect(page.getByTestId("office-time")).toHaveText(/as of \d{2}:\d{2}$/);
    await expect(page.getByTestId("office-body")).toHaveClass(/opacity-60/);
    await expect(page.locator('[data-testid=office-desk][data-state="working"]')).toHaveCount(1);
    await expect(page.getByTestId("office-count-active")).toContainText("2");
    await expect(page.getByTestId("office-today")).toContainText("9 tasks done");
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
    await expect(page.locator("#office").getByText(en.office.classic.loadingNote)).toBeAttached();
    expect(office.calls()).toBe(0);
    await page.locator("#office").scrollIntoViewIfNeeded();
    await expect.poll(office.calls).toBeGreaterThan(0);
    await expect(section(page)).toHaveAttribute("data-status", "ready");
  });

  // One card height in every state: the loading line holds it, and no answer or later change of state moves the next section.
  for (const [locale, size] of [
    ["en", { width: 1440, height: 900 }],
    ["en", { width: 390, height: 844 }],
    ["id", { width: 1440, height: 900 }],
    ["id", { width: 390, height: 844 }],
  ] as const) {
    test(`no state moves the next section (${locale}, ${size.width}px)`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(size);
      await page.clock.setFixedTime(OFFICE_FIXTURE_NOW);
      const journey = () => page.locator("#journey").evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      for (const [name, reply, status] of [
        ["busy", OFFICE_FIXTURES.busy, "ready"],
        ["semiLive", OFFICE_FIXTURES.semiLive, "ready"],
        ["quiet", OFFICE_FIXTURES.quiet, "ready"],
        ["off", OFFICE_FIXTURES.off, "ready"],
        ["offline", 500, "offline"],
      ] as const) {
        await page.unrouteAll();
        const office = await heldOffice(page, reply);
        await openPage(page, home(locale));
        // The static loading line (before the panel chunk) and the panel waiting on its first answer hold the same height.
        await expect(section(page)).toHaveAttribute("data-status", "idle");
        const placeholder = await journey();
        await page.locator("#office").scrollIntoViewIfNeeded();
        await expect(section(page)).toHaveAttribute("data-status", "loading");
        const before = await journey();
        expect(before, `${name} placeholder`).toBe(placeholder);
        const shifts = await watchShifts(page);
        office.release();
        await expect(section(page), name).toHaveAttribute("data-status", status);
        await expect(page.getByTestId("office-desk"), name).toHaveCount(5);
        expect(await journey(), name).toBe(before);
        expect(await shifts(), name).toBe(0);
      }
      // A good snapshot, then failures more than 60 s later: offline keeps the rows, so the card keeps its height.
      await page.unrouteAll();
      const office = await mockOffice(page, OFFICE_FIXTURES.busy);
      await openPage(page, home(locale));
      await page.locator("#office").scrollIntoViewIfNeeded();
      await expect(section(page)).toHaveAttribute("data-status", "ready");
      const before = await journey();
      const shifts = await watchShifts(page);
      office.set(500);
      await page.clock.setFixedTime(OFFICE_FIXTURE_NOW + 2 * 60_000);
      await expect(section(page)).toHaveAttribute("data-status", "offline", { timeout: 20_000 });
      expect(await journey(), "offline-kept").toBe(before);
      expect(await shifts(), "offline-kept").toBe(0);
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
    await expect(page.getByTestId("office-today")).toBeVisible();
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
      // Disabled on screen: held in place with the switched-off line.
      await page.unrouteAll();
      await mockOffice(page, OFFICE_FIXTURES.disabled);
      await open(page, home());
      await expect(page.getByTestId("office-panel")).toHaveAttribute("data-feed", "disabled");
      // A viewport shot: scrolling to the top for a page clip would let the section hide.
      await page.locator("#office").evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 80));
      await page.screenshot({ path: `${dir}/classic-disabled-held-${size.width}.png` });
      // Then scrolled away: the area between the intro and the journey, to show the section is gone.
      await page.evaluate(() => window.scrollTo(0, 0));
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
