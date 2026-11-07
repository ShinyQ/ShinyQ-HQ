import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import content from "../content/site-content.json";
import en from "../messages/en.json";
import id from "../messages/id.json";
import { pickFeaturedPods } from "../src/content/pageview";
import type { Pod } from "../src/content/schema";
import { orderPods, podLiveLink } from "../src/content/selectors";
import { gateOpening } from "../src/experience/floors/lobby/hallGallery";
import { HALL, hallPartitions, stationOf } from "../src/experience/floors/lobby/hallLayout";
import { LOBBY } from "../src/experience/config";
import { onPad } from "../src/experience/nav/doors";
import { HIGHLIGHT_STAT_COUNT, HIGHLIGHT_STATIONS, highlightRoom, type HighlightStation } from "../src/experience/floors/lobby/stations";
import {
  chooseMotion,
  asReturningVisitor,
  collectErrors,
  driveTo,
  enterFloorRoute,
  enterHQ,
  expectRenderBudget,
  openPage,
  skipFloorLines,
  snapshot,
  waitForCameraSettle,
  waitForFloor,
  waitForFrames,
  waitForHQ,
  waitForPhase,
  waitForRoom,
  waitForRoverMove,
  waitForSceneLive,
  fastAnimations,
} from "./hq";
import { FLOOR_SCENE_CAPS } from "./budgets";

// Rides, drives, camera eases and the intro at the test-only animation speed (render-peak windows measure at real speed).
test.beforeEach(({ context }) => fastAnimations(context));

/**
 * L1 Highlights Hall (docs/superpowers/plans/2026-10-12-highlights-hall.md; extended 2026-11-02): the passage past the
 * certification wall, the seven stations as point-and-go targets and their drawers, cards that ride to
 * L3 and L2, live links, the highlights mission (the Rover menu and Cmd-K), the #highlights deep link, the static
 * anchors and the render budget. Expectations come from the dataset, never from slugs or counts.
 */
test.describe.configure({ timeout: 180_000 });

const STATIONS: readonly HighlightStation[] = HIGHLIGHT_STATIONS;
const tour = content.missions.find((m) => m.id === "highlights")!;
const featured = pickFeaturedPods(orderPods(content.floors.labs.pods as unknown as Pod[]));
const roles = content.floors.careerArchive.entries.filter((e) => e.type === "job" || e.type === "freelance");
/** The new stations' data (owner decision 2026-11-02), straight from the dataset. */
const awards = content.awards;
const firsts = awards.filter((a) => a.placement.en === "1st place");
const running = roles.filter((e) => e.end === "present");
const verifiedBeforeAfter = orderPods(content.floors.labs.pods as unknown as Pod[]).flatMap((pod) =>
  pod.results.filter((r) => r.confidence === "verified" && /→|\sto\s/.test(r.value)).map((r) => ({ pod, r })),
);
/** Light curtain sweeps of the gateway arch since load (`__hq.probes.hallGate`). */
async function gateSweeps(page: Page): Promise<{ sweeps: number; active: boolean }> {
  return page.evaluate(() => (window as unknown as { __hq: { probes: { hallGate: { sweeps: number; active: boolean } } } }).__hq.probes.hallGate);
}

type HallWindow = Window & {
  __hq: {
    rover: { x: number; z: number };
    layouts: Record<string, { road?: { roads: { id: string }[] } }>;
    probes: { hallPremium: { state: string; mounted: boolean; wake: Record<string, number> } };
    hall: { loadPremium(): Promise<void> };
  };
  __trail?: { x: number; z: number }[];
};

/** Records the rover's position every frame until `stopTrail` (one point per frame, floor-local). */
async function startTrail(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as HallWindow & { __trailOn?: boolean };
    w.__trail = [];
    w.__trailOn = true;
    const tick = () => {
      if (!w.__trailOn) return;
      w.__trail!.push({ x: w.__hq.rover.x, z: w.__hq.rover.z });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stopTrail(page: Page): Promise<{ x: number; z: number }[]> {
  return page.evaluate(() => {
    const w = window as unknown as HallWindow & { __trailOn?: boolean };
    w.__trailOn = false;
    return w.__trail ?? [];
  });
}

/** The hall has one way in (owner decision 2026-11-04): a drive never enters a west partition and crosses the gate line inside the opening. */
function entersThroughGate(trail: { x: number; z: number }[]): boolean {
  const o = gateOpening();
  const walls = hallPartitions();
  let crossed = false;
  for (let i = 1; i < trail.length; i++) {
    const [a, b] = [trail[i - 1], trail[i]];
    if (walls.some((w) => b.x > w.minX && b.x < w.maxX && b.z > w.minZ && b.z < w.maxZ)) return false;
    if (a.x < o.x && b.x >= o.x) {
      const z = a.z + ((o.x - a.x) / (b.x - a.x || 1)) * (b.z - a.z);
      if (z < o.minZ || z > o.maxZ) return false;
      crossed = true;
    }
  }
  return crossed;
}

/** The hall interiors chunk is loaded and its mesh compiled and shown. */
async function interiorsReady(page: Page) {
  await page.waitForFunction(() => {
    const p = (window as unknown as HallWindow).__hq.probes.hallPremium;
    return p.state === "ready" && p.mounted;
  }, null, { timeout: 90_000 });
}

/** The station's point-and-go id (Task 11). */
const target = (station: HighlightStation) => `L1:station:highlights-${station}`;

type ScreenPoint = { x: number; y: number };
type InteractWindow = Window & {
  __hq: {
    interact: {
      project: ((p: { x: number; y: number; z: number }) => ScreenPoint | null) | null;
      screenAt: (id: string, fx: number, fz: number, lift: number) => ScreenPoint | null;
      hitAt: ((x: number, y: number) => string | null) | null;
    };
    rover: { x: number; y: number; z: number };
    store: { getState: () => { reducedMotion: boolean } };
  };
};

async function expectRoverNear(page: Page, point: { x: number; z: number }, tolerance = 1.5) {
  const { rover } = await snapshot(page);
  expect(Math.hypot(rover.x - point.x, rover.z - point.z)).toBeLessThan(tolerance);
}

/**
 * A point on the bare canvas where the click raycast hits this very target, clear of the HUD edges and
 * 100 px or more from the rover (a click on the rover opens the Rover menu).
 */
async function clickablePoint(page: Page, targetId: string): Promise<ScreenPoint> {
  const point = await page.evaluate((targetId) => {
    const { interact, rover } = (window as unknown as InteractWindow).__hq;
    if (!interact.project || !interact.hitAt) return null;
    const self = interact.project({ x: rover.x, y: rover.y + 1, z: rover.z });
    for (const lift of [0.5, 0.75, 0.3, 0.9]) {
      for (const fx of [0.5, 0.3, 0.7, 0.15, 0.85]) {
        for (const fz of [0.5, 0.3, 0.7]) {
          const p = interact.screenAt(targetId, fx, fz, lift);
          if (!p || p.x < 40 || p.x > window.innerWidth - 40 || p.y < 90 || p.y > window.innerHeight - 90) continue;
          if (document.elementFromPoint(p.x, p.y)?.tagName !== "CANVAS") continue;
          if (self && Math.hypot(p.x - self.x, p.y - self.y) <= 100) continue;
          if (interact.hitAt(p.x, p.y) === targetId) return p;
        }
      }
    }
    return null;
  }, targetId);
  if (!point) throw new Error(`${targetId} is not clickable on screen`);
  return point;
}

/**
 * The drawer shows `room` and the Director has rendered a frame since: it learns of opens once per frame
 * and ends any drive that is running then, so a drive requested before that frame (a setup drive)
 * would stop at once.
 */
async function roomOpen(page: Page, room: string) {
  await waitForRoom(page, room);
  await waitForFrames(page, 3);
}

async function closeDrawer(page: Page) {
  if (await page.getByTestId("room-drawer").count()) {
    await page.keyboard.press("Escape");
    await waitForPhase(page, "explore");
  }
}

/** Setup only: parks 2.5 u in front of a station's pad, inside its camera zone (the follow camera turns to face the panel). */
async function faceStation(page: Page, station: HighlightStation) {
  await closeDrawer(page);
  const s = stationOf(station);
  await driveTo(page, { x: s.pad.x - s.facing.x * 2.5, z: s.pad.z - s.facing.z * 2.5 });
  await waitForCameraSettle(page);
}

/** Point and go: click the glowing panel; the rover drives to the door pad along the road and the drawer opens. */
async function openStation(page: Page, station: HighlightStation) {
  await faceStation(page, station);
  const start = (await snapshot(page)).rover;
  const s = stationOf(station);
  // Off the door pad (the hall's door trigger, `onPad`): only the click can open the room. The road can end the setup
  // drive closer than asked (the experience spur) and the rover may still roll a little, so the check is the pad itself,
  // not a distance margin around it.
  expect(onPad({ room: s.room, at: s.pad, facing: s.facing }, start), `the setup drive ended on the ${station} pad at ${JSON.stringify(start)}`).toBe(false);
  await expect(page.getByTestId("room-drawer")).toHaveCount(0);
  const point = await clickablePoint(page, target(station));
  await page.mouse.click(point.x, point.y);
  await waitForRoverMove(page, start, 0.3);
  await roomOpen(page, highlightRoom(station));
  await expectRoverNear(page, s.pad);
  return page.getByTestId("room-drawer");
}

/** 6 u off each centrepiece on the spine, facing it (`centres()` in the interiors chunk: the middle of each plaza half). */
const SPLIT_Z = HALL.lead[0].z + 6;
const CENTREPIECE_SPOTS = [
  ["Impact Orbit", { x: HALL.plaza.x - 3, z: (HALL.plaza.z - HALL.plaza.d / 2 + SPLIT_Z) / 2 + 6 }],
  ["Signal Spire", { x: HALL.plaza.x - 3, z: (SPLIT_Z + HALL.plaza.z + HALL.plaza.d / 2) / 2 - 6 }],
] as const;

test.describe("Highlights Hall", () => {
  test("clicking each station drives there along the road and opens its drawer", async ({ page, context }) => {
    const errors = collectErrors(page);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await enterHQ(page);

    let drawer = await openStation(page, "about");
    await expect(drawer.getByTestId("metric")).toHaveCount(Math.min(HIGHLIGHT_STAT_COUNT, content.stats.length));
    await expect(drawer).toContainText(content.profile.name);

    drawer = await openStation(page, "projects");
    const cards = drawer.getByTestId("highlight-card");
    await expect(cards).toHaveCount(featured.length);
    expect(await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-room")))).toEqual(featured.map((p) => `L3:${p.slug}`));
    const live = featured.map((p) => podLiveLink(p)?.href).filter((href): href is string => Boolean(href));
    await expect(drawer.getByTestId("highlight-live")).toHaveCount(live.length);
    for (const [i, href] of live.entries()) {
      const link = drawer.getByTestId("highlight-live").nth(i);
      await expect(link).toHaveAttribute("href", href);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }

    drawer = await openStation(page, "experience");
    await expect(drawer.getByTestId("highlight-card")).toHaveCount(roles.length);
    if (roles.some((r) => r.type === "job")) await expect(drawer.getByRole("heading", { name: en.common.type.job })).toBeVisible();
    if (roles.some((r) => r.type === "freelance")) await expect(drawer.getByRole("heading", { name: en.common.type.freelance })).toBeVisible();

    drawer = await openStation(page, "contact");
    await drawer.getByRole("button", { name: en.drawer.rooms.copyEmail }).click();
    await expect(drawer.getByRole("status").filter({ hasText: en.drawer.rooms.copied })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(content.floors.roof.contact.email);
    await expect(drawer.getByTestId("cv-view")).toBeVisible();
    const axe = await new AxeBuilder({ page }).include("[data-testid='room-drawer']").analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("the wins, now and results stations open from their deep links with the dataset's numbers, and a result rides to its case study", async ({ page }) => {
    const errors = collectErrors(page);
    await asReturningVisitor(page);
    await page.goto("/en?tier=lite#highlights-wins");
    await waitForHQ(page);
    await roomOpen(page, highlightRoom("wins"));
    await expectRoverNear(page, stationOf("wins").pad);
    let drawer = page.getByTestId("room-drawer");
    // Every award, grouped by placement; the first places counted from the data.
    await expect(drawer.getByRole("heading", { name: `${en.hall.tier.gold} (${firsts.length})` })).toBeVisible();
    await expect(drawer.getByRole("listitem").filter({ hasText: awards[0].organizer })).not.toHaveCount(0);
    await expect(drawer).toContainText(en.hall.winsSub.replace("{placings}", String(awards.length)).replace("{firsts}", String(firsts.length)));

    await page.goto("/en?tier=lite&s=now#highlights-now");
    await waitForHQ(page);
    await roomOpen(page, highlightRoom("now"));
    drawer = page.getByTestId("room-drawer");
    await expect(drawer.getByTestId("highlight-card")).toHaveCount(running.length);
    expect(await drawer.getByTestId("highlight-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-room")).sort())).toEqual(running.map((e) => `L2:${e.slug}`).sort());

    await page.goto("/en?tier=lite&s=results#highlights-results");
    await waitForHQ(page);
    await roomOpen(page, highlightRoom("results"));
    drawer = page.getByTestId("room-drawer");
    await expect(drawer.getByTestId("highlight-card")).toHaveCount(verifiedBeforeAfter.length);
    for (const { r } of verifiedBeforeAfter.slice(0, 3)) await expect(drawer).toContainText(r.value);
    const card = drawer.getByTestId("highlight-card").first();
    expect(await card.getAttribute("data-room")).toBe(`L3:${verifiedBeforeAfter[0].pod.slug}`);
    await card.click();
    await waitForFloor(page, "L3", 90_000).catch(() => undefined);
    await waitForRoom(page, `L3:${verifiedBeforeAfter[0].pod.slug}`);
    expect(errors).toEqual([]);
  });

  test("a project card rides to L3 and opens its pod", async ({ page }) => {
    await enterHQ(page);
    const drawer = await openStation(page, "projects");
    await drawer.getByTestId("highlight-card").first().click();
    await waitForFloor(page, "L3", 90_000).catch(() => undefined);
    await waitForRoom(page, `L3:${featured[0].slug}`);
  });

  test("a role card rides to L2 and opens its career room", async ({ page }) => {
    await enterHQ(page);
    const drawer = await openStation(page, "experience");
    const card = drawer.getByTestId("highlight-card").first();
    const room = (await card.getAttribute("data-room"))!;
    expect(room.startsWith("L2:")).toBe(true);
    await card.click();
    await waitForFloor(page, "L2", 90_000).catch(() => undefined);
    await waitForRoom(page, room);
  });

  test("See the highlights from the Rover menu drives to the about station and opens it; L1 never shows a floor line", async ({ page }) => {
    const errors = collectErrors(page);
    await asReturningVisitor(page);
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    // Proving that nothing happens: other floors show Rover's first-visit floor line 700 ms after arrival.
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("dialog-box")).toHaveCount(0);

    await page.getByTestId("hud").getByRole("button", { name: en.hud.launcher.roverMenu, exact: true }).click();
    await page.getByRole("dialog", { name: en.hud.terminal.title, exact: true }).getByRole("option", { name: tour.label.en }).click();
    await roomOpen(page, highlightRoom(STATIONS[0]));
    await expectRoverNear(page, stationOf(STATIONS[0]).pad);
    expect(errors).toEqual([]);
  });

  test("Cmd-K finds the highlights mission, which rides to L1 and opens the about station", async ({ page }) => {
    await skipFloorLines(page);
    await enterFloorRoute(page, "/en/contact");
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Command palette" }).getByRole("combobox")).toBeFocused();
    await page.keyboard.type("highlights");
    // The mission's own row (the seven station rooms match "highlights" too, and a shorter title ranks first).
    const mission = page.getByRole("option", { name: new RegExp(tour.label.en) }).first();
    await expect(mission).toBeVisible();
    await mission.click();
    await waitForFloor(page, "L1", 90_000);
    await waitForRoom(page, highlightRoom(STATIONS[0]));
  });

  test("a #highlights-<station> link on the landing opens that station at its door", async ({ page }) => {
    const errors = collectErrors(page);
    await asReturningVisitor(page);
    await page.goto("/en?tier=lite#highlights-contact");
    await waitForHQ(page);
    await roomOpen(page, highlightRoom("contact"));
    await expectRoverNear(page, stationOf("contact").pad);
    await page.keyboard.press("Escape");
    await waitForPhase(page, "explore");
    await expect(page).toHaveURL(/\/en\?tier=lite/);
    expect(errors).toEqual([]);
  });

  test("speaks Indonesian", async ({ page }) => {
    await enterHQ(page, { path: "/id" });
    const drawer = await openStation(page, "experience");
    if (roles.some((r) => r.type === "job")) await expect(drawer.getByRole("heading", { name: id.common.type.job })).toBeVisible();
    await expect(drawer).toContainText(id.hall.openRole);
  });

  test("the static tier maps every station to a landing section", async ({ page }) => {
    await openPage(page, "/en?tier=static");
    for (const anchor of ["#intro", "#work", "#journey", "#contact"]) await expect(page.locator(anchor)).toHaveCount(1);
  });

  test("the static tier maps the new stations to their Classic sections", async ({ page }) => {
    await openPage(page, "/en/quick?tier=static");
    await expect(page.locator("#awards")).toHaveCount(1);
    await openPage(page, "/en/labs?tier=static");
    await expect(page.locator("#key-projects")).toHaveCount(1);
  });

  /**
   * The full tier only: it draws the lite scene plus its motes, 2 scene calls more at every spot (CI 2026-10-17:
   * spawn 86 and 84, gate 75 and 73, plaza 55 and 53). Lite L1 stays gated at the spawn (e2e/perf/floors.spec.ts),
   * the About me station and the gate (reduced motion, below). The station pads deeper in the hall measured 45.
   */
  test("one gate: from the Agent Office every station is reached through the gateway arch, and no road joins the office to the hall", async ({ page }) => {
    test.setTimeout(300_000);
    await enterHQ(page);
    const roads = await page.evaluate(() => (window as unknown as HallWindow).__hq.layouts.L1.road!.roads.map((r) => r.id));
    expect(roads).not.toContain("hall-office");
    for (const station of HIGHLIGHT_STATIONS) {
      await closeDrawer(page);
      await driveTo(page, LOBBY.officeWing.stop);
      await startTrail(page);
      await driveTo(page, stationOf(station).pad);
      const trail = await stopTrail(page);
      expect(entersThroughGate(trail), `${station}: the drive from the office entered the hall outside the gate`).toBe(true);
      await expectRoverNear(page, stationOf(station).pad);
    }
  });

  test("the hall interiors load at idle on L1, wake a station while the rover is on its pad, and keep L1 inside its budget", async ({ page }) => {
    test.setTimeout(300_000);
    await enterHQ(page);
    await interiorsReady(page);
    for (const station of ["about", "wins", "results", "contact"] as const) {
      await closeDrawer(page);
      await driveTo(page, stationOf(station).pad);
      await roomOpen(page, highlightRoom(station));
      await closeDrawer(page);
      await page.waitForFunction((s) => (window as unknown as HallWindow).__hq.probes.hallPremium.wake[s] > 0.99, station, { timeout: 30_000 });
      await waitForCameraSettle(page);
      const peaks = await expectRenderBudget(page);
      console.log(`L1 lite at ${station} (interiors awake): ${peaks.sceneCalls} scene calls, ${peaks.triangles} triangles`);
      expect(peaks.sceneCalls).toBeLessThanOrEqual(FLOOR_SCENE_CAPS.L1);
    }
    // Both centrepieces from the plaza, 6 u off each one on the spine (owner, 2026-11-04).
    for (const [name, spot] of CENTREPIECE_SPOTS) {
      await closeDrawer(page);
      await driveTo(page, spot);
      await waitForCameraSettle(page);
      const peaks = await expectRenderBudget(page);
      console.log(`L1 lite at the ${name}: ${peaks.sceneCalls} scene calls, ${peaks.triangles} triangles`);
      expect(peaks.sceneCalls).toBeLessThanOrEqual(FLOOR_SCENE_CAPS.L1);
    }
    // Off the pad the station settles back.
    await driveTo(page, { x: HALL.plaza.x, z: HALL.plaza.z });
    await page.waitForFunction(() => (window as unknown as HallWindow).__hq.probes.hallPremium.wake.contact < 0.05, null, { timeout: 30_000 });
  });

  test("a #highlights-<station> deep link loads the interiors at once", async ({ page }) => {
    await asReturningVisitor(page);
    await page.goto("/en?tier=lite&prefetch=off#highlights-results");
    await waitForHQ(page);
    await waitForRoom(page, highlightRoom("results"));
    await interiorsReady(page);
  });

  /**
   * L1 headroom on the full tier from the plaza to the hall: the spawn, the lead road, the gate spot (4 u west of the
   * gateway arch at x 36.8, on the west wall's line since 2026-11-04, clear of its pillars), every station pad and both
   * centrepieces, each with the interiors ready, a settled camera and a full budget window (every frame over at least
   * 20 frames). On a CI shard the full tier renders about 1 fps, so a spot costs about 45 s: four parts of three spots
   * each keep every test well inside its timeout (all twelve in one test ran past 6 min).
   */
  const hallHeadroom = async (page: Page, spots: readonly ({ x: number; z: number } | null)[]) => {
    test.setTimeout(360_000);
    await enterHQ(page, { tier: "full" });
    await interiorsReady(page);
    for (const spot of spots) {
      await closeDrawer(page);
      // The first drive of a hall part runs from the spawn through the gate: frame-bound, so give it room at about 1 fps.
      if (spot) await driveTo(page, spot, 120_000);
      await closeDrawer(page);
      await waitForCameraSettle(page);
      const peaks = await expectRenderBudget(page);
      console.log(`L1 full at ${spot ? `(${spot.x}, ${spot.z})` : "spawn"}: ${peaks.sceneCalls} scene calls + ${peaks.postCalls} post passes, ${peaks.triangles} triangles`);
      // Headroom under the 150 scene-call budget: the Lobby is the busiest floor.
      expect(peaks.sceneCalls).toBeLessThanOrEqual(FLOOR_SCENE_CAPS.L1);
    }
  };

  test("L1 keeps headroom under the floor budget from the plaza to the gate (full) @nightly", async ({ page }) => {
    await hallHeadroom(page, [null, { x: 20, z: 15 }, { x: gateOpening().x - 4, z: 13 }]);
  });

  test("L1 keeps headroom under the floor budget at the hall's north stations (full) @nightly", async ({ page }) => {
    await hallHeadroom(page, HIGHLIGHT_STATIONS.slice(0, 3).map((s) => stationOf(s).pad));
  });

  test("L1 keeps headroom under the floor budget at the hall's south stations (full) @nightly", async ({ page }) => {
    await hallHeadroom(page, HIGHLIGHT_STATIONS.slice(3, 6).map((s) => stationOf(s).pad));
  });

  test("L1 keeps headroom under the floor budget at the contact station and both centrepieces (full) @nightly", async ({ page }) => {
    // The centrepieces have no camera zone, so the follow camera faces the way the rover came: from the contact pad, as in
    // the one-test sweep, the views with the most scene calls.
    await hallHeadroom(page, [...HIGHLIGHT_STATIONS.slice(6).map((s) => stationOf(s).pad), ...CENTREPIECE_SPOTS.map(([, at]) => at)]);
  });

  test("the About me station shows the owner's portrait in its neon frame, loaded with the hall", async ({ page }) => {
    await enterHQ(page);
    const request = page.waitForRequest((r) => r.url().endsWith("/brand/kurniadi-photo-320.webp"), { timeout: 90_000 });
    await faceStation(page, "about");
    const response = await (await request).response();
    expect(response?.status()).toBe(200);
    await waitForCameraSettle(page);
    const peaks = await expectRenderBudget(page);
    console.log(`L1 lite at the About me station: ${peaks.sceneCalls} scene calls + ${peaks.postCalls} post passes, ${peaks.triangles} triangles`);
    expect(peaks.sceneCalls).toBeLessThanOrEqual(FLOOR_SCENE_CAPS.L1);
  });

  test("the rover drives under the gateway arch; its light curtain sweeps on the first pass of the session only", async ({ page }) => {
    await enterHQ(page);
    const gate = gateOpening();
    const z = (gate.minZ + gate.maxZ) / 2;
    expect((await gateSweeps(page)).sweeps).toBe(0);
    await driveTo(page, { x: gate.x - 7, z });
    expect((await gateSweeps(page)).sweeps).toBe(0);
    await driveTo(page, { x: gate.x + 8, z });
    await expectRoverNear(page, { x: gate.x + 8, z });
    await expect.poll(() => gateSweeps(page)).toEqual({ sweeps: 1, active: false });
    // The hall's name floats on the arch (FloatingSigns) and nothing lies on the floor.
    const probes = await page.evaluate(() => {
      const p = (window as unknown as { __hq: { probes: { flatText(): string[]; signs: Record<string, { text: string; facing: number }[]> } } }).__hq.probes;
      return { flat: p.flatText(), sign: p.signs["hall-gate-sign"] ?? [] };
    });
    expect(probes.flat).toEqual([]);
    expect(probes.sign.map((s) => s.text)).toEqual([en.hall.hall.toUpperCase()]);
    // Out and back in: the sweep belongs to the first pass of the browser session.
    await driveTo(page, { x: gate.x - 7, z });
    await driveTo(page, { x: gate.x + 8, z });
    await waitForFrames(page, 60);
    expect((await gateSweeps(page)).sweeps).toBe(1);
    expect(await page.evaluate(() => sessionStorage.getItem("hq:hall-gate"))).toBe("seen");
  });

  test("reduced motion: the hall renders still and inside the budget", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await chooseMotion(page, "system");
    await enterHQ(page);
    expect(await page.evaluate(() => (window as unknown as InteractWindow).__hq.store.getState().reducedMotion)).toBe(true);
    await driveTo(page, { x: gateOpening().x - 4, z: 13 });
    await waitForCameraSettle(page);
    const peaks = await expectRenderBudget(page);
    expect(peaks.sceneCalls).toBeLessThanOrEqual(FLOOR_SCENE_CAPS.L1);
    // The drive passed under the gateway arch: no light curtain under reduced motion.
    expect(await gateSweeps(page)).toEqual({ sweeps: 0, active: false });
  });
});
