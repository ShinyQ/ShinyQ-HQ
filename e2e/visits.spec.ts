import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import en from "../messages/en.json";
import id from "../messages/id.json";
import { ROOF_STOPS } from "../src/experience/floors/roof/layout";
import { STATS_FIXTURE, type StatsSnapshotV1 } from "../src/lib/visits/contract";
import { FLOOR_SCENE_CAPS } from "./budgets";
import { chooseMotion, asReturningVisitor, collectErrors, enterHQ, expectRenderBudget, openPage, snapshot, targetPoint, waitForFrames, waitForHQ, waitForPhase, waitForRoom, waitForSceneLive } from "./hq";

/**
 * Public visit stats (owner plan "Public visit stats, Layer 1", S2): the Classic Contact section and
 * home ticker item, the footer opt-out, and the RF Visitor Observatory (station, drawer filters, deep
 * link, Cmd-K, reduced motion, budget) plus the L1 ring tile. `/api/stats` is mocked with the fixture.
 */
test.describe.configure({ timeout: 150_000 });

const HOUR = 3_600_000;
const aged = (hours: number): StatsSnapshotV1 => ({ ...STATS_FIXTURE, updatedAt: new Date(Date.now() - hours * HOUR).toISOString() });

async function mockStats(page: Page, body: StatsSnapshotV1 | 204 = aged(2)) {
  await page.route("**/api/stats", (route) =>
    body === 204 ? route.fulfill({ status: 204 }) : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }),
  );
}

type ProbeWindow = { __hq: { probes: { spectacle: Record<string, number> }; store: { getState: () => { activeRoom: string | null } } } };
const spectacle = (page: Page, key: string) => page.evaluate((k) => (window as unknown as ProbeWindow).__hq.probes.spectacle[k], key);

async function openRoof(page: Page, hash = "") {
  await asReturningVisitor(page);
  await page.goto(`/en/contact?tier=lite&walk=off${hash}`);
  await waitForHQ(page);
  // A `#visits` deep link starts in the room; everything else in explore.
  if (!hash) await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

test.describe("Visits on the Classic site", () => {
  test("Contact shows the section: scope line, radios with a live status, the map and the table", async ({ page }) => {
    const errors = collectErrors(page);
    await mockStats(page);
    await openPage(page, "/en/contact?tier=static#visits");
    const section = page.locator("#visits");
    const panel = section.getByTestId("visits-panel");
    await expect(panel).toBeVisible();
    await expect(section.getByTestId("visits-scope")).toContainText(`${en.stats.window.d30}`);
    await expect(section.getByTestId("visits-scope")).toContainText(en.stats.source);
    await expect(section.getByTestId("visits-scope")).toContainText(en.stats.updated);
    const status = section.getByTestId("visits-status");
    await expect(status).toContainText("topic All: 340 visits from 9 countries");
    await section.getByRole("group", { name: en.stats.topicLegend }).getByText("AI", { exact: true }).click();
    await expect(status).toContainText("topic AI:");
    await expect(panel).toHaveAttribute("data-topic", "ai");
    await section.getByRole("group", { name: en.stats.periodLegend }).getByText(en.stats.periods.all).click();
    await expect(status).toContainText("Since launch, topic AI: 520 visits from 10 countries");
    await expect(section.getByTestId("visits-map").locator("[data-country]")).toHaveCount(10);
    await section.getByText(en.stats.table.open).click();
    await expect(section.getByTestId("visits-table").locator("tbody tr")).toHaveCount(10);
    const axe = await new AxeBuilder({ page }).include("#visits").analyze();
    expect(axe.violations).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("a delayed snapshot shows the note; a stale one, a 204 or a bad body hides every surface", async ({ page, context }) => {
    await mockStats(page, aged(72));
    await openPage(page, "/en/contact?tier=static#visits");
    await expect(page.getByTestId("visits-delayed")).toBeVisible();
    for (const body of [aged(24 * 8), 204 as const, { ...STATS_FIXTURE, v: 2 } as unknown as StatsSnapshotV1]) {
      const fresh = await context.newPage();
      await mockStats(fresh, body);
      await openPage(fresh, "/en/contact?tier=static#visits");
      await expect(fresh.getByTestId("visits-section")).toHaveAttribute("data-status", "hidden");
      await expect(fresh.locator("#visits")).toBeHidden();
      await fresh.close();
    }
  });

  test("the home ticker gets a visits item linking to the section; Indonesian copy", async ({ page }) => {
    await mockStats(page);
    await openPage(page, "/id?tier=static");
    const item = page.locator('#stats .hx-tick-track:not([aria-hidden]) [data-stat="visits"]');
    await expect(item).toContainText("340");
    await expect(item).toContainText(id.stats.tile);
    await expect(item.getByRole("link")).toHaveAttribute("href", "/id/contact#visits");
  });

  test("the footer switch stores the opt-out and survives a reload", async ({ page }) => {
    await openPage(page, "/en/labs?tier=static");
    const sw = page.locator("footer").getByRole("switch", { name: en.stats.optOut });
    await expect(sw).not.toBeChecked();
    await sw.check();
    expect(await page.evaluate(() => localStorage.getItem("hq:stats-optout"))).toBe("1");
    await page.reload();
    await expect(page.locator("footer").getByRole("switch", { name: en.stats.optOut })).toBeChecked();
    await page.locator("footer").getByRole("switch", { name: en.stats.optOut }).uncheck();
    expect(await page.evaluate(() => localStorage.getItem("hq:stats-optout"))).toBeNull();
  });
});

test.describe("RF Visitor Observatory", () => {
  test("point-and-go opens RF:visits; the drawer filters, keeps the opt-out and the globe shows the countries", async ({ page }) => {
    const errors = collectErrors(page);
    await mockStats(page);
    await openRoof(page);
    await expect.poll(() => spectacle(page, "observatoryCountries"), { timeout: 20_000 }).toBe(9);
    const point = await targetPoint(page, "RF:station:visits");
    await page.mouse.click(point.x, point.y);
    await waitForRoom(page, "RF:visits");
    const { rover } = await snapshot(page);
    expect(Math.hypot(rover.x - ROOF_STOPS.visits.x, rover.z - ROOF_STOPS.visits.z)).toBeLessThan(1.5);
    const drawer = page.getByTestId("room-drawer");
    await expect(drawer).toContainText(en.hud.rooms.visits);
    const status = drawer.getByTestId("visits-status");
    await expect(status).toContainText("Last 30 days, topic All");
    await drawer.getByRole("group", { name: en.stats.periodLegend }).getByText(en.stats.periods.all).click();
    await expect(status).toContainText("Since launch, topic All");
    await drawer.getByRole("group", { name: en.stats.topicLegend }).getByText("Career", { exact: true }).click();
    await expect(drawer.getByTestId("visits-chips").locator("[data-chip]")).toHaveCount(1);
    await expect(drawer.getByRole("switch", { name: en.stats.optOut })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("/en/contact#visits deep links into the observatory and Cmd-K finds it", async ({ page }) => {
    await mockStats(page);
    await openRoof(page, "#visits");
    await waitForRoom(page, "RF:visits");
    await page.keyboard.press("Escape");
    await expect.poll(() => page.evaluate(() => (window as unknown as ProbeWindow).__hq.store.getState().activeRoom)).toBeNull();
    await page.keyboard.press("Control+k");
    await page.keyboard.type(en.hud.rooms.visits);
    await page.keyboard.press("Enter");
    await waitForRoom(page, "RF:visits");
  });

  test("hidden stats: the station shows the land only and the drawer says offline", async ({ page }) => {
    await mockStats(page, 204);
    await openRoof(page, "#visits");
    await waitForRoom(page, "RF:visits");
    await expect(page.getByTestId("visits-offline")).toHaveText(en.stats.offline);
    expect(await spectacle(page, "observatoryCountries")).toBe(0);
  });

  test("reduced motion holds the globe still; RF stays inside its budget with the station", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await chooseMotion(page, "system");
    await mockStats(page);
    await openRoof(page);
    await expect.poll(() => spectacle(page, "observatoryCountries"), { timeout: 20_000 }).toBe(9);
    const before = await spectacle(page, "observatory");
    await waitForFrames(page, 30, 500);
    expect(await spectacle(page, "observatory")).toBe(before);
    expect(before).toBe(0);
    const peaks = await expectRenderBudget(page);
    expect(peaks.sceneCalls).toBeLessThanOrEqual(FLOOR_SCENE_CAPS.RF);
  });

  test("the globe turns with full motion", async ({ page }) => {
    await mockStats(page);
    await openRoof(page);
    await expect.poll(() => spectacle(page, "observatory"), { timeout: 20_000 }).toBeGreaterThan(0);
  });
});

test.describe("L1 stats ring", () => {
  test("adds the live visits tile once the snapshot arrives, and not when it is hidden", async ({ page }) => {
    await mockStats(page);
    await enterHQ(page);
    await expect.poll(() => spectacle(page, "ringTiles"), { timeout: 20_000 }).toBe(7);
  });

  test("keeps six tiles without stats", async ({ page }) => {
    await mockStats(page, 204);
    await enterHQ(page);
    await waitForFrames(page, 30, 2500);
    expect(await spectacle(page, "ringTiles")).toBe(6);
  });
});
