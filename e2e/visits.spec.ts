import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import en from "../messages/en.json";
import id from "../messages/id.json";
import { STATS_FIXTURE, type StatsSnapshotV1 } from "../src/lib/visits/contract";
import { TOP_CHIPS } from "../src/lib/visits/model";
import { FLOOR_SCENE_CAPS } from "./budgets";
import { chooseMotion, asReturningVisitor, skipFloorLines, clickablePoint, collectErrors, enterFloorRoute, enterHQ, expectRenderBudget, openPage, snapshot, waitForCameraSettle, waitForFloor, waitForFrames, waitForHQ, waitForPhase, waitForRoom, waitForSceneLive, fastAnimations } from "./hq";

// Rides, drives, camera eases and the intro at the test-only animation speed (render-peak windows measure at real speed).
test.beforeEach(({ context }) => fastAnimations(context));

/**
 * Public visit stats (owner plan "Public visit stats, Layer 1", S2): the Classic Contact section and
 * home stats ledger item, and the Visitor Observatory in the Lobby's south-west corner
 * (owner decision 2026-10-14: reached from the elevator arrival, drawer filters, deep links including the
 * old roof ones, Cmd-K, reduced motion, budget) plus the L1 ring tile. The 2026-10-17 arrival (owner, L3-style
 * arrivals) supersedes the arrival view toward the observatory: the camera now looks east at the hologram, so the
 * elevator test turns the view to the station first. `/api/stats` is mocked with the fixture.
 */
test.describe.configure({ timeout: 150_000 });

const HOUR = 3_600_000;
const aged = (hours: number): StatsSnapshotV1 => ({ ...STATS_FIXTURE, updatedAt: new Date(Date.now() - hours * HOUR).toISOString() });

/** The fixture with eight suggested questions since launch (the default period), so the drawer shows its top 5 cap. */
const manyChips = (): StatsSnapshotV1 => {
  const base = aged(2);
  const extra = [
    { id: "work-vendor", topic: "work" as const, n: 4 },
    { id: "ai-voice", topic: "ai" as const, n: 3 },
    { id: "career-certs", topic: "career" as const, n: 1 },
  ];
  return { ...base, asks: { ...base.asks, all: { ...base.asks.all, chips: [...base.asks.all.chips, ...extra] } } };
};

async function mockStats(page: Page, body: StatsSnapshotV1 | 204 = aged(2)) {
  await page.route("**/api/stats", (route) =>
    body === 204 ? route.fulfill({ status: 204 }) : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }),
  );
}

type ProbeWindow = {
  __hq: {
    probes: { spectacle: Record<string, number> };
    store: { getState: () => { activeRoom: string | null; floor: string; openRoom: (room: string) => void } };
    layouts: Record<string, { doors?: { room: string; at: { x: number; z: number } }[] }>;
  };
};

const spectacle = (page: Page, key: string) => page.evaluate((k) => (window as unknown as ProbeWindow).__hq.probes.spectacle[k], key);

/** Opens `path` in 3D as a returning visitor; a `#visits` deep link starts in the room, everything else in explore. */
async function open3D(page: Page, path: string) {
  await asReturningVisitor(page);
  const [route, hash = ""] = path.split("#");
  await skipFloorLines(page);
  await page.goto(`${route}?tier=lite${hash ? `#${hash}` : ""}`);
  await waitForHQ(page);
  if (!hash) await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

const activeRoom = (page: Page) => page.evaluate(() => (window as unknown as ProbeWindow).__hq.store.getState().activeRoom);
const visitsDoor = (page: Page) => page.evaluate(() => (window as unknown as ProbeWindow).__hq.layouts.L1.doors!.find((d) => d.room === "L1:visits")!.at);

test.describe("Visits on the Classic site", () => {
  test("Contact shows the section: scope line, radios with a live status, the map and the table", async ({ page }) => {
    const errors = collectErrors(page);
    await mockStats(page);
    await openPage(page, "/en/contact?tier=static#visits");
    const section = page.locator("#visits");
    const panel = section.getByTestId("visits-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-period", "all");
    await expect(section.getByTestId("visits-scope")).toContainText("Since Oct 11, 2026");
    await expect(section.getByTestId("visits-scope")).toContainText(en.stats.source);
    await expect(section.getByTestId("visits-scope")).toContainText(en.stats.updated);
    const status = section.getByTestId("visits-status");
    await expect(status).toContainText("Since launch, topic All: 520 visits from 10 countries");
    await expect(section.getByTestId("visits-map").locator("[data-country]")).toHaveCount(10);
    await section.getByRole("group", { name: en.stats.topicLegend }).getByText("AI", { exact: true }).click();
    await expect(status).toContainText("Since launch, topic AI:");
    await expect(panel).toHaveAttribute("data-topic", "ai");
    await section.getByRole("group", { name: en.stats.periodLegend }).getByText(en.stats.periods.d30).click();
    await expect(status).toContainText("Last 30 days, topic AI: 340 visits from 9 countries");
    await expect(section.getByTestId("visits-scope")).toContainText(en.stats.window.d30);
    await expect(section.getByTestId("visits-map").locator("[data-country]")).toHaveCount(9);
    await section.getByText(en.stats.table.open).click();
    await expect(section.getByTestId("visits-table").locator("tbody tr")).toHaveCount(9);
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

  test("the home stats ledger gets a visits item linking to the section; Indonesian copy", async ({ page }) => {
    await mockStats(page);
    await openPage(page, "/id?tier=static");
    const item = page.locator('#stats [data-stat="visits"]');
    await expect(item).toContainText("520");
    await expect(item).toContainText(id.stats.tile);
    await expect(item).toHaveAttribute("title", new RegExp(`^${id.stats.periods.all} · `));
    await expect(item.getByRole("link")).toHaveAttribute("href", "/id/contact#visits");
  });

  test("the Classic site footer carries no opt-out switch, privacy line or source link (owner request 2026-10-15)", async ({ page }) => {
    await openPage(page, "/en/labs?tier=static");
    const footer = page.locator("footer");
    await expect(footer.getByRole("link", { name: "LinkedIn" })).toBeVisible();
    await expect(footer.getByRole("switch")).toHaveCount(0);
    await expect(footer).not.toContainText(/tracking cookies|validated dataset|View source/);
  });
});

test.describe("Visitor Observatory in the Lobby", () => {
  test("reached right after the elevator: point-and-go opens L1:visits; the drawer filters, lists the top 5 suggested questions without an opt-out switch and the globe shows the countries", async ({ page }) => {
    const errors = collectErrors(page);
    await mockStats(page, manyChips());
    await enterFloorRoute(page, "/en/journey");
    await page.getByRole("navigation", { name: "Elevator" }).locator('[data-floor="L1"]').click();
    await waitForFloor(page, "L1");
    // The 2026-10-17 arrival (owner, L3-style arrivals) supersedes the 2026-10-14 view toward the observatory: it
    // looks east at the hologram with the south-west corner behind the camera, so turn the view in 45 degree steps (the HUD's Rotate right) until the station is on screen.
    await waitForCameraSettle(page);
    await expect.poll(() => spectacle(page, "observatoryCountries"), { timeout: 20_000 }).toBe(10);
    let point = await clickablePoint(page, "L1:station:visits");
    for (let turn = 0; !point && turn < 8; turn++) {
      await page.getByRole("button", { name: en.hud.view.rotateRight }).click();
      await waitForCameraSettle(page);
      point = await clickablePoint(page, "L1:station:visits");
    }
    if (!point) throw new Error("L1:station:visits never came on screen");
    await page.mouse.click(point.x, point.y);
    await waitForRoom(page, "L1:visits");
    const { rover, floor } = await snapshot(page);
    expect(floor).toBe("L1");
    const door = await visitsDoor(page);
    expect(Math.hypot(rover.x - door.x, rover.z - door.z)).toBeLessThan(1.5);
    const drawer = page.getByTestId("room-drawer");
    await expect(drawer).toContainText(en.hud.rooms.visits);
    const status = drawer.getByTestId("visits-status");
    await expect(status).toContainText("Since launch, topic All");
    // Eight suggested questions picked, the top 5 listed, most picked first (owner decision 2026-10-23).
    const chips = drawer.getByTestId("visits-chips").locator("[data-chip]");
    await expect(chips).toHaveCount(TOP_CHIPS);
    await expect(chips.first()).toHaveAttribute("data-chip", "work-best");
    await expect(chips.last()).toHaveAttribute("data-chip", "ai-voice");
    await drawer.getByRole("group", { name: en.stats.periodLegend }).getByText(en.stats.periods.d30).click();
    await expect(status).toContainText("Last 30 days, topic All");
    await drawer.getByRole("group", { name: en.stats.topicLegend }).getByText("Career", { exact: true }).click();
    await expect(drawer.getByTestId("visits-chips").locator("[data-chip]")).toHaveCount(1);
    // The "Don't count my visits" switch is gone (owner decision 2026-10-23).
    await expect(drawer.getByRole("switch")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("/en#visits and the old /en/contact#visits deep link open it in the Lobby; Cmd-K finds it", async ({ page }) => {
    await mockStats(page);
    await open3D(page, "/en/contact#visits");
    await waitForRoom(page, "L1:visits");
    expect((await snapshot(page)).floor).toBe("L1");
    await page.keyboard.press("Escape");
    await expect.poll(() => activeRoom(page)).toBeNull();
    await page.keyboard.press("Control+k");
    await page.keyboard.type(en.hud.rooms.visits);
    await page.keyboard.press("Enter");
    await waitForRoom(page, "L1:visits");
  });

  test("/en#visits opens it too", async ({ page }) => {
    await mockStats(page);
    await open3D(page, "/en#visits");
    await waitForRoom(page, "L1:visits");
  });

  test("old RF:visits ids (a drawer link, a history entry) open the Lobby room", async ({ page }) => {
    await mockStats(page);
    await open3D(page, "/en");
    await page.evaluate(() => (window as unknown as ProbeWindow).__hq.store.getState().openRoom("RF:visits"));
    await waitForRoom(page, "L1:visits");
    await page.keyboard.press("Escape");
    await expect.poll(() => activeRoom(page)).toBeNull();
    // A history entry written before the move remembers the room under its old id.
    await page.evaluate(() => {
      history.replaceState({ ...(history.state ?? {}), hqRoom: "RF:visits" }, "", location.href);
      history.pushState({ ...(history.state ?? {}), hqRoom: null }, "", location.href);
      history.back();
    });
    await waitForRoom(page, "L1:visits");
  });

  test("hidden stats: the station shows the land only and the drawer says offline", async ({ page }) => {
    await mockStats(page, 204);
    await open3D(page, "/en#visits");
    await waitForRoom(page, "L1:visits");
    await expect(page.getByTestId("visits-offline")).toHaveText(en.stats.offline);
    // The station writes this probe from its frame loop, so it is undefined until the globe has rendered once.
    await expect.poll(() => spectacle(page, "observatoryCountries"), { timeout: 20_000 }).toBe(0);
  });

  test("reduced motion holds the globe still; L1 stays inside its budget at the station", async ({ page }) => {
    await chooseMotion(page, "system");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockStats(page);
    await open3D(page, "/en");
    await expect.poll(() => spectacle(page, "observatoryCountries"), { timeout: 20_000 }).toBe(10);
    const before = await spectacle(page, "observatory");
    await waitForFrames(page, 30, 500);
    expect(await spectacle(page, "observatory")).toBe(before);
    expect(before).toBe(0);
    const peaks = await expectRenderBudget(page);
    expect(peaks.sceneCalls).toBeLessThanOrEqual(FLOOR_SCENE_CAPS.L1);
  });

  test("the globe turns with full motion", async ({ page }) => {
    await mockStats(page);
    await open3D(page, "/en");
    await expect.poll(() => spectacle(page, "observatory"), { timeout: 20_000 }).toBeGreaterThan(0);
  });
});

test.describe("L1 stats ring", () => {
  test("adds the live visits tile once the snapshot arrives, and not when it is hidden", async ({ page }) => {
    await mockStats(page);
    await enterHQ(page);
    await expect.poll(() => spectacle(page, "ringTiles"), { timeout: 20_000 }).toBe(7);
  });

  test("the stats room links the tile to the observatory in the Lobby", async ({ page }) => {
    await mockStats(page);
    await enterHQ(page);
    await page.evaluate(() => (window as unknown as ProbeWindow).__hq.store.getState().openRoom("L1:stats"));
    await waitForRoom(page, "L1:stats");
    const link = page.getByTestId("room-drawer").getByTestId("drawer-cross-link");
    await expect(link).toContainText(en.stats.openObservatory);
    await link.click();
    await waitForRoom(page, "L1:visits");
  });

  test("keeps six tiles without stats", async ({ page }) => {
    await mockStats(page, 204);
    await enterHQ(page);
    await waitForFrames(page, 30, 2500);
    expect(await spectacle(page, "ringTiles")).toBe(6);
  });
});
