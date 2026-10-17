import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import content from "../content/site-content.json";
import en from "../messages/en.json";
import id from "../messages/id.json";
import { pickFeaturedPods } from "../src/content/pageview";
import type { Pod } from "../src/content/schema";
import { orderPods, podLiveLink } from "../src/content/selectors";
import { gateOpening } from "../src/experience/floors/lobby/hallGallery";
import { stationOf } from "../src/experience/floors/lobby/hallLayout";
import { HIGHLIGHT_STAT_COUNT, HIGHLIGHT_STATIONS, highlightRoom, type HighlightStation } from "../src/experience/floors/lobby/stations";
import {
  chooseMotion,
  asReturningVisitor,
  collectErrors,
  driveTo,
  enterFloorRoute,
  enterHQ,
  expectRenderBudget,
  hoveredTarget,
  interactablesOf,
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
} from "./hq";
import { FLOOR_SCENE_CAPS } from "./budgets";

/**
 * L1 Highlights Hall (docs/superpowers/plans/2026-10-12-highlights-hall.md): the passage past the
 * certification wall, the four stations as point-and-go targets and their drawers, cards that ride to
 * L3 and L2, live links, the highlights mission (the Rover menu and Cmd-K), the #highlights deep link, the static
 * anchors and the render budget. Expectations come from the dataset, never from slugs or counts.
 */
test.describe.configure({ timeout: 180_000 });

const STATIONS: readonly HighlightStation[] = HIGHLIGHT_STATIONS;
const tour = content.missions.find((m) => m.id === "highlights")!;
const featured = pickFeaturedPods(orderPods(content.floors.labs.pods as unknown as Pod[]));
const roles = content.floors.careerArchive.entries.filter((e) => e.type === "job" || e.type === "freelance");
const NAMES: Record<HighlightStation, string> = {
  about: en.hud.rooms.highlightsAbout,
  projects: en.hud.rooms.highlightsProjects,
  experience: en.hud.rooms.highlightsExperience,
  contact: en.hud.rooms.highlightsContact,
};
/** Light curtain sweeps of the gateway arch since load (`__hq.probes.hallGate`). */
async function gateSweeps(page: Page): Promise<{ sweeps: number; active: boolean }> {
  return page.evaluate(() => (window as unknown as { __hq: { probes: { hallGate: { sweeps: number; active: boolean } } } }).__hq.probes.hallGate);
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
  const pad = stationOf(station).pad;
  // Off the door pad (it is 1.6 u deep): only the click can open the room. The road can end the setup
  // drive closer than asked (the experience spur), so the click's drive may be short.
  expect(Math.hypot(start.x - pad.x, start.z - pad.z)).toBeGreaterThan(0.85);
  await expect(page.getByTestId("room-drawer")).toHaveCount(0);
  const point = await clickablePoint(page, target(station));
  await page.mouse.click(point.x, point.y);
  await waitForRoverMove(page, start, 0.3);
  await roomOpen(page, highlightRoom(station));
  await expectRoverNear(page, stationOf(station).pad);
  return page.getByTestId("room-drawer");
}

test.describe("Highlights Hall", () => {
  test("the four stations are point-and-go targets; pointing at one highlights it with its name", async ({ page }) => {
    await enterHQ(page);
    await faceStation(page, "about");
    const items = await interactablesOf(page);
    for (const station of STATIONS) {
      const item = items.find((i) => i.id === target(station));
      expect(item, station).toMatchObject({ kind: "station", label: NAMES[station], action: { type: "open-room", room: highlightRoom(station) } });
      expect(item!.at).toEqual(stationOf(station).pad);
    }
    const point = await clickablePoint(page, target("about"));
    await page.mouse.move(point.x, point.y, { steps: 4 });
    await expect.poll(() => hoveredTarget(page)).toEqual({ id: target("about"), via: "pointer" });
    await expect.poll(() => page.evaluate(() => document.body.style.cursor)).toBe("pointer");
  });

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
    await expect(page.getByRole("option", { name: new RegExp(tour.label.en) }).first()).toBeVisible();
    await page.keyboard.press("Enter");
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

  for (const tier of ["lite", "full"] as const) {
    test(`L1 keeps headroom under the floor budget from the plaza to the hall (${tier})`, async ({ page }) => {
      // Five spots, each with a full budget window (every frame over at least 20 frames): slow on the full tier in CI.
      test.setTimeout(360_000);
      await enterHQ(page, { tier });
      const spots = [null, { x: 20, z: 15 }, { x: 34, z: 13 }, stationOf("projects").pad, stationOf("experience").pad];
      for (const spot of spots) {
        if (spot) {
          await closeDrawer(page);
          await driveTo(page, spot);
        }
        await waitForCameraSettle(page);
        const peaks = await expectRenderBudget(page);
        console.log(`L1 ${tier} at ${spot ? `(${spot.x}, ${spot.z})` : "spawn"}: ${peaks.sceneCalls} scene calls + ${peaks.postCalls} post passes, ${peaks.triangles} triangles`);
        // Headroom under the 150 scene-call budget: the Lobby is the busiest floor.
        expect(peaks.sceneCalls).toBeLessThanOrEqual(FLOOR_SCENE_CAPS.L1);
      }
    });
  }

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
    await driveTo(page, { x: 34, z: 13 });
    await waitForCameraSettle(page);
    const peaks = await expectRenderBudget(page);
    expect(peaks.sceneCalls).toBeLessThanOrEqual(FLOOR_SCENE_CAPS.L1);
    // The drive passed under the gateway arch: no light curtain under reduced motion.
    expect(await gateSweeps(page)).toEqual({ sweeps: 0, active: false });
  });
});
