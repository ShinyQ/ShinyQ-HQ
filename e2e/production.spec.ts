import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import content from "../content/site-content.json";
import en from "../messages/en.json";
import id from "../messages/id.json";
import { STATS_FIXTURE, STATS_FIXTURE_PERF, type StatsSnapshotV1 } from "../src/lib/visits/contract";
import { chooseMotion, asReturningVisitor, collectErrors, driveTo, expectRenderBudget, openPage, targetPoint, waitForFrames, waitForHQ, waitForPhase, waitForRoom, waitForSceneLive } from "./hq";

/**
 * "How I run AI in production" (owner approved 2026-10-14): the About section on the Classic site, the
 * Cmd-K room row, and the L3 Ops Control Room (point-and-go, drawer, live telemetry panel, deep link,
 * reduced motion, budget). `/api/stats` is mocked.
 */
test.describe.configure({ timeout: 150_000 });

const production = content.production;
const fresh = (s: StatsSnapshotV1): StatsSnapshotV1 => ({ ...s, updatedAt: new Date(Date.now() - 2 * 3_600_000).toISOString() });

async function mockStats(page: Page, body: StatsSnapshotV1 | 204 = fresh(STATS_FIXTURE_PERF)) {
  await page.route("**/api/stats", (route) =>
    body === 204 ? route.fulfill({ status: 204 }) : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }),
  );
}

type ProbeWindow = {
  __hq: {
    probes: { ops: { mounted: boolean; live: boolean; rows: string[] } };
    layouts: Record<string, { doors?: { room: string; at: { x: number; z: number } }[]; road?: { roads: { id: string; points: { x: number; z: number }[] }[] } }>;
  };
};
const opsProbe = (page: Page) => page.evaluate(() => (window as unknown as ProbeWindow).__hq.probes.ops);

async function openLabs(page: Page, hash = "") {
  await asReturningVisitor(page);
  await page.goto(`/en/labs?tier=lite&walk=off${hash}`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

async function rideToOps(page: Page) {
  await page.keyboard.press("Control+k");
  await page.keyboard.type(en.hud.rooms.ops);
  await page.keyboard.press("Enter");
  await waitForRoom(page, "L3:ops");
}

test.describe("How I run AI in production on the Classic site", () => {
  test("About shows the section after How I work: points, proof tiles, dashboard, alert rule and the case studies", async ({ page }) => {
    const errors = collectErrors(page);
    await openPage(page, "/en/contact?tier=static#production");
    const section = page.locator("#production");
    await expect(section.getByRole("heading", { level: 2 })).toHaveText(production.title.en);
    const order = await page.evaluate(() => [...document.querySelectorAll("main section[id]")].map((s) => s.id));
    expect(order.indexOf("production")).toBe(order.indexOf("how") + 1);
    await expect(section.getByTestId("production-points").locator("li")).toHaveCount(production.points.length);
    await expect(section.getByTestId("production-tiles").locator("li")).toHaveCount(production.tiles.length);
    for (const tile of production.tiles) await expect(section.getByTestId("production-tiles")).toContainText(tile.value.en);
    await expect(section.getByTestId("production-dashboard").locator("img")).toHaveAttribute("alt", production.dashboard.alt.en);
    await expect(section.getByTestId("alert-excerpt")).toContainText("Microsoft.Insights/metricAlerts");
    const links = section.getByTestId("production-cases").locator("a");
    await expect(links).toHaveCount(production.caseStudies.length);
    for (const [i, slug] of production.caseStudies.entries()) await expect(links.nth(i)).toHaveAttribute("href", `/en/labs/${slug}`);
    const axe = await new AxeBuilder({ page }).include("#production").analyze();
    expect(axe.violations).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("Indonesian copy, and Cmd-K finds the Ops Control Room and lands on the section", async ({ page }) => {
    await openPage(page, "/id/contact?tier=static");
    await expect(page.locator("#production").getByRole("heading", { level: 2 })).toHaveText(production.title.id);
    await expect(page.locator("#production")).toContainText(id.production.cases);
    await openPage(page, "/en/journey?tier=static");
    await page.keyboard.press("Control+k");
    await page.keyboard.type(en.hud.rooms.ops);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/en\/contact(\?tier=static)?#production$/);
    await expect(page.locator("#production")).toBeInViewport();
  });
});

test.describe("L3 Ops Control Room", () => {
  test("point-and-go opens the room; the drawer shows the section, live telemetry and the case studies", async ({ page }) => {
    const errors = collectErrors(page);
    await mockStats(page);
    await openLabs(page);
    const { door, roadZ } = await page.evaluate(() => {
      const l3 = (window as unknown as ProbeWindow).__hq.layouts.L3;
      // The AI wing road's straight run, which the room faces, lies at the z of its turn (the second to last point).
      return { door: l3.doors!.find((d) => d.room === "L3:ops")!.at, roadZ: l3.road!.roads.find((r) => r.id === "ai")!.points.at(-2)!.z };
    });
    await driveTo(page, { x: door.x - 6, z: roadZ });
    const point = await targetPoint(page, "L3:door:ops");
    await page.mouse.click(point.x, point.y);
    await waitForRoom(page, "L3:ops");
    const drawer = page.getByTestId("room-drawer");
    await expect(drawer).toContainText(production.title.en);
    const body = drawer.getByTestId("ops-body");
    await expect(body).toContainText(production.points[1].lead.en);
    await expect(body.getByTestId("ops-case")).toHaveCount(production.caseStudies.length);
    await expect(body.getByTestId("ops-live")).toContainText(en.production.live.fps);
    await expect(body.getByTestId("ops-live")).toContainText(en.production.live.nightly);
    await expect.poll(async () => (await opsProbe(page)).live).toBe(true);
    expect((await opsProbe(page)).rows).toHaveLength(4);
    await body.getByTestId("ops-case").first().click();
    await waitForRoom(page, `L3:${production.caseStudies[0]}`);
    expect(errors).toEqual([]);
  });

  test("/en/contact#production rides to the room in 3D", async ({ page }) => {
    await mockStats(page);
    await asReturningVisitor(page);
    await page.goto("/en/contact?tier=lite&walk=off#production");
    await waitForHQ(page);
    await waitForRoom(page, "L3:ops");
    expect(await page.evaluate(() => (window as unknown as { __hq: { store: { getState: () => { floor: string } } } }).__hq.store.getState().floor)).toBe("L3");
  });

  test("hidden stats hide the live panel; the room and drawer stay", async ({ page }) => {
    await mockStats(page, 204);
    await openLabs(page);
    await rideToOps(page);
    await expect(page.getByTestId("ops-body")).toBeVisible();
    await expect(page.getByTestId("ops-live")).toHaveCount(0);
    const probe = await opsProbe(page);
    expect(probe.mounted).toBe(true);
    expect(probe.live).toBe(false);
  });

  test("a snapshot without perf shows visits and the nightly line only", async ({ page }) => {
    await mockStats(page, fresh(STATS_FIXTURE));
    await openLabs(page);
    await rideToOps(page);
    await expect.poll(async () => (await opsProbe(page)).rows.length).toBe(2);
  });

  test("reduced motion: the room opens and L3 stays inside its render budget", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await chooseMotion(page, "system");
    await mockStats(page);
    await openLabs(page);
    await rideToOps(page);
    await page.keyboard.press("Escape");
    await waitForFrames(page, 20, 300);
    await expect.poll(async () => (await opsProbe(page)).live).toBe(true);
    await expectRenderBudget(page);
  });
});
