import { expect, test, type Page } from "@playwright/test";
import data from "../content/site-content.json";
import en from "../messages/en.json";
import {
  chooseMotion,
  asReturningVisitor,
  collectErrors,
  driveTo,
  expectRenderBudget,
  targetPoint,
  waitForCameraSettle,
  waitForFrames,
  waitForHQ,
  waitForPhase,
  waitForRoom,
  waitForSceneLive,
} from "./hq";

/**
 * L2 Workshop (F3): the forecourt with the time console, the gateway, one bench per side project (none for
 * projects that have a full L3 pod) and the public repo skyline at the end of the Career Road. Starts on the newest career room (its deep link
 * spawns the rover on the last year plaza, a short drive from the forecourt) instead of driving 380 u.
 */
test.describe.configure({ timeout: 240_000 });

type Point = { x: number; z: number };
type Item = { id: string; at: Point; action: { type: string; room?: string } };
type WorkshopWindow = Window & {
  __hq: {
    layouts: Record<string, { pads?: { id: string; at: Point; year?: number }[]; stops?: Record<string, Point>; scrubStops?: number[] }>;
    interact: { items: Item[] };
    rover: { x: number; z: number; heading: number };
    store: { getState: () => { picker: { kind: string } | null; beam: unknown; openPicker: (p: { kind: "console" }) => void; activeRoom: string | null } };
    probes: { spectacle: Record<string, number> };
  };
};

const newest = [...data.floors.careerArchive.entries].sort((a, b) => b.start.localeCompare(a.start))[0].slug;
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const topRepo = [...data.publicRepos].sort((a, b) => b.stars - a.stars)[0];
const firstProject = data.sideProjects[0];

async function openWorkshop(page: Page) {
  await asReturningVisitor(page);
  await page.goto(`/en/journey/${newest}?tier=lite&walk=off`);
  await waitForHQ(page);
  await waitForRoom(page, `L2:${newest}`);
  await page.keyboard.press("Escape");
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

const item = (page: Page, id: string) => page.evaluate((i) => (window as unknown as WorkshopWindow).__hq.interact.items.find((x) => x.id === i) ?? null, id);
const roverAt = (page: Page) =>
  page.evaluate(() => {
    const r = (window as unknown as WorkshopWindow).__hq.rover;
    return { x: r.x, z: r.z };
  });
const state = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as WorkshopWindow).__hq.store.getState();
    return { picker: s.picker, beam: s.beam, activeRoom: s.activeRoom };
  });
const stops = (page: Page) => page.evaluate(() => (window as unknown as WorkshopWindow).__hq.layouts.L2.scrubStops ?? []);
const near = (a: Point, b: Point, d: number) => Math.hypot(a.x - b.x, a.z - b.z) <= d;

/** Drives to the forecourt (the second to last scrub stop) and waits for the rail camera. */
async function toForecourt(page: Page) {
  const s = await stops(page);
  await driveTo(page, { x: s.at(-2)!, z: 0 });
  await waitForCameraSettle(page);
}

test.describe("L2 Workshop", () => {
  test("the forecourt has clear routes to the console, the gateway, a bench, a skyline bar and back west", async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkshop(page);
    const s = await stops(page);
    const consoleItem = (await item(page, "L2:station:time-console"))!;
    const gateway = (await item(page, "L2:station:workshop"))!;
    const bench = (await item(page, `L2:station:bench-${firstProject.id}`))!;
    const bar = (await item(page, `L2:station:repo-${slug(topRepo.name)}`))!;
    for (const target of [consoleItem.at, gateway.at, bench.at, bar.at, consoleItem.at, { x: s.at(-3)!, z: 0 }]) {
      await driveTo(page, target);
      expect(near(await roverAt(page), target, 1.2), JSON.stringify(target)).toBe(true);
    }
    // Side projects that moved to full L3 Data and ML pods have no bench any more.
    const benchIds = await page.evaluate(() => (window as unknown as WorkshopWindow).__hq.interact.items.filter((i) => i.id.startsWith("L2:station:bench-")).map((i) => i.id));
    expect(benchIds).toEqual(data.sideProjects.map((p) => `L2:station:bench-${p.id}`));
    for (const retired of ["sentiboard", "ewallet-sentiment", "sp500-portfolio-optimizer"]) expect(benchIds).not.toContain(`L2:station:bench-${retired}`);
    // None of these stops is a pad or a door: nothing opened on the way.
    expect((await state(page)).picker).toBeNull();
    expect(errors).toEqual([]);
  });

  test("a click on the time console drives there and lists every year; a pick beams to that year's teleporter", async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkshop(page);
    await toForecourt(page);
    const point = await targetPoint(page, "L2:station:time-console");
    await page.mouse.click(point.x, point.y);
    const dialog = page.getByRole("dialog", { name: en.hud.pads.consoleTitle });
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    const consoleItem = (await item(page, "L2:station:time-console"))!;
    expect(near(await roverAt(page), consoleItem.at, 1.2)).toBe(true);
    const years = (await page.evaluate(() => (window as unknown as WorkshopWindow).__hq.layouts.L2.pads ?? [])).filter((p) => p.year !== undefined);
    await expect(dialog.locator("[data-option]")).toHaveCount(years.length + 1);
    await expect(dialog.locator("[data-option]").first()).toContainText(en.hud.pads.back);
    await expect(dialog.locator('[aria-current="true"]')).toHaveCount(0);

    const target = years[2];
    await dialog.locator(`[data-option="${target.year}"]`).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(async () => (await state(page)).beam).toBeNull();
    expect(near(await roverAt(page), target.at, 0.5)).toBe(true);
    await expect(page.getByTestId("year-chip")).toHaveAttribute("data-place", String(target.year));
    await waitForFrames(page, 30);
    expect((await state(page)).picker).toBeNull();
    expect(errors).toEqual([]);
  });

  test("Back to elevator on the console beams to the elevator call pad, facing the car, without opening the floor picker", async ({ page }) => {
    await openWorkshop(page);
    await toForecourt(page);
    await page.evaluate(() => (window as unknown as WorkshopWindow).__hq.store.getState().openPicker({ kind: "console" }));
    const dialog = page.getByRole("dialog", { name: en.hud.pads.consoleTitle });
    await dialog.locator('[data-option="elevator"]').click();
    await expect.poll(async () => (await state(page)).beam).toBeNull();
    const lift = (await page.evaluate(() => (window as unknown as WorkshopWindow).__hq.layouts.L2.pads ?? [])).find((p) => p.id === "elevator:L2")!;
    expect(near(await roverAt(page), lift.at, 0.5)).toBe(true);
    // Facing the car (west): heading -PI/2.
    const heading = await page.evaluate(() => (window as unknown as WorkshopWindow).__hq.rover.heading);
    expect(Math.cos(heading + Math.PI / 2)).toBeGreaterThan(0.99);
    await waitForFrames(page, 30);
    expect((await state(page)).picker).toBeNull();
  });

  test("a bench opens its side project drawer and a skyline bar its repo drawer, with external links in a new tab", async ({ page }) => {
    const errors = collectErrors(page);
    await openWorkshop(page);
    await toForecourt(page);
    const s = await stops(page);
    await driveTo(page, { x: s.at(-1)!, z: 0 });
    await waitForCameraSettle(page);

    // The bench nearest the middle of the Workshop (the end benches can sit outside a 1280 x 720 view).
    const benches = await page.evaluate(() => (window as unknown as WorkshopWindow).__hq.interact.items.filter((i) => i.id.startsWith("L2:station:bench-")));
    const middle = benches.reduce((best, b) => (Math.abs(b.at.x - s.at(-1)!) < Math.abs(best.at.x - s.at(-1)!) ? b : best));
    const project = data.sideProjects.find((p) => middle.id === `L2:station:bench-${p.id}`)!;
    const benchPoint = await targetPoint(page, middle.id);
    await page.mouse.click(benchPoint.x, benchPoint.y);
    await waitForRoom(page, `L2:side-${project.id}`);
    const drawer = page.getByTestId("room-drawer");
    await expect(drawer.getByRole("heading", { name: project.title })).toBeVisible();
    await page.keyboard.press("Escape");
    await waitForPhase(page, "explore");
    await waitForCameraSettle(page);

    const barPoint = await targetPoint(page, `L2:station:repo-${slug(topRepo.name)}`);
    await page.mouse.click(barPoint.x, barPoint.y);
    await waitForRoom(page, `L2:repo-${slug(topRepo.name)}`);
    const link = page.getByTestId("drawer-footer").getByRole("link", { name: new RegExp(en.drawer.rooms.viewRepo) });
    await expect(link).toHaveAttribute("href", topRepo.url);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    // The Workshop rooms keep the floor URL (no /journey/<slug> page).
    expect(new URL(page.url()).pathname).toBe("/en/journey");
    expect(errors).toEqual([]);
  });

  test("the Workshop stays within the render budget on lite", async ({ page }) => {
    await openWorkshop(page);
    await toForecourt(page);
    await expectRenderBudget(page);
    const s = await stops(page);
    await driveTo(page, { x: s.at(-1)!, z: 0 });
    await waitForCameraSettle(page);
    await expectRenderBudget(page);
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });
    test.beforeEach(({ page }) => chooseMotion(page, "system"));

    test("the Workshop holds still and the console's jump is the fade cut", async ({ page }) => {
      await openWorkshop(page);
      await toForecourt(page);
      const clock = () => page.evaluate(() => (window as unknown as WorkshopWindow).__hq.probes.spectacle["horizon.time"] ?? 0);
      const before = await clock();
      await waitForFrames(page, 30);
      expect(await clock()).toBe(before);

      await page.evaluate(() => (window as unknown as WorkshopWindow).__hq.store.getState().openPicker({ kind: "console" }));
      const dialog = page.getByRole("dialog", { name: en.hud.pads.consoleTitle });
      const years = (await page.evaluate(() => (window as unknown as WorkshopWindow).__hq.layouts.L2.pads ?? [])).filter((p) => p.year !== undefined);
      await dialog.locator(`[data-option="${years[0].year}"]`).click();
      await expect.poll(async () => (await state(page)).beam).toBeNull();
      expect(near(await roverAt(page), years[0].at, 0.5)).toBe(true);
      await expect(page.getByTestId("beam-fade")).toHaveClass(/opacity-0/);
    });
  });
});
