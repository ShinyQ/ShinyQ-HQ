import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import guides from "../content/study-guides.json";
import { coverOpen } from "../src/experience/floors/library/decor/vault";
import { routeGuides } from "./fixtures/guide-pdf";
import {
  chooseMotion,
  clickablePoint,
  collectErrors,
  DESKTOP_SAFE,
  driveTo,
  enterFloorRoute,
  fastAnimations,
  hoveredTarget,
  interactablesOf,
  PHONE_SAFE,
  skipFloorLines,
  waitForCameraSettle,
  waitForFrames,
  waitForPhase,
  waitForRoverMove,
} from "./hq";

// Rides, drives, camera eases and the intro at the test-only animation speed.
test.beforeEach(({ context }) => fastAnimations(context));

/**
 * The L4 Study Vault (study guides PR 2): the certification study guides stand as holo books off the end plaza. At the
 * vault stop the covers stand open as far as the rover's distance says (`coverOpen`), and the pointed book opens
 * fully (snapped under reduced motion); clicking (or tapping, then Go) a book opens its guide in the in-site reader
 * over `/api/guides/*` (the PR 1 fixture PDF), in this tab; Esc closes it and the keyboard drives the rover again.
 * From the constellation stop a click on a book drives to the vault stop first. Lite tier, like the other L4 specs:
 * the full-tier vault budget is gated by `e2e/perf/floors.spec.ts`. Every wait is on state (probes, the reader's
 * data attributes, dialog visibility), never on time.
 */
test.describe.configure({ timeout: 240_000 });

const PAGES = 3;
const GH600 = guides.guides.find((g) => g.slug === "gh-600")!;
const BOOK = `L4:vault:${GH600.slug}`;

type Vec2 = { x: number; z: number };
type VW = Window & {
  __hq: {
    probes: { vault: { books: string[]; open: number[]; spines: number } };
    layouts: Record<string, { stops?: Record<string, Vec2> }>;
    rover: Vec2;
  };
};

const vaultProbe = (page: Page) => page.evaluate(() => (window as unknown as VW).__hq.probes.vault);
const roverAt = (page: Page) => page.evaluate(() => ({ x: (window as unknown as VW).__hq.rover.x, z: (window as unknown as VW).__hq.rover.z }));
const stopOf = (page: Page, room: string) => page.evaluate((r) => (window as unknown as VW).__hq.layouts.L4.stops![r], room);

/** Book centers by slug (the middle of each book target's pick volume, which is the book's footprint). */
async function bookCenters(page: Page): Promise<Map<string, Vec2>> {
  const items = (await interactablesOf(page)).filter((i) => i.id.startsWith("L4:vault:"));
  return new Map(items.map((i) => [i.id.slice("L4:vault:".length), { x: (i.bounds.minX + i.bounds.maxX) / 2, z: (i.bounds.minZ + i.bounds.maxZ) / 2 }]));
}

/** Largest gap between each cover and where the rover's distance puts it (`coverOpen`), plus the smallest cover. */
async function coverGap(page: Page, centers: Map<string, Vec2>) {
  const [probe, rover] = await Promise.all([vaultProbe(page), roverAt(page)]);
  let gap = 0;
  probe.books.forEach((slug, i) => {
    const c = centers.get(slug)!;
    gap = Math.max(gap, Math.abs(probe.open[i] - coverOpen(Math.hypot(rover.x - c.x, rover.z - c.z))));
  });
  return { gap, min: Math.min(...probe.open), books: probe.books.length };
}

const openOf = async (page: Page, slug: string) => {
  const p = await vaultProbe(page);
  return p.open[p.books.indexOf(slug)];
};

/** Counts tabs or windows the context opens from now on (the reader must stay in this page). */
function countPages(context: BrowserContext) {
  const opened = { count: 0 };
  context.on("page", () => opened.count++);
  return opened;
}

/** Waits until the guide dialog shows `title` with page 1 drawn (canvas plus text layer). */
async function expectReaderOpen(page: Page, title: string) {
  await expect(page.getByRole("dialog", { name: title })).toBeVisible({ timeout: 30_000 });
  const reader = page.getByTestId("guide-reader");
  await expect(reader).toHaveAttribute("data-page-count", String(PAGES), { timeout: 30_000 });
  await expect(page.locator('[data-testid="guide-page"][data-page="1"]')).toHaveAttribute("data-rendered", "true", { timeout: 30_000 });
}

/** Esc closes the reader, then a held key drives the rover again (3D input is back). */
async function closeAndDrive(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("guide-dialog")).toHaveCount(0);
  await waitForPhase(page, "explore");
  const before = await roverAt(page);
  await page.keyboard.down("s");
  try {
    await waitForRoverMove(page, before, 1);
  } finally {
    await page.keyboard.up("s");
  }
}

for (const device of [
  { id: "desktop", motion: "full", safe: DESKTOP_SAFE, use: { viewport: { width: 1440, height: 900 } } },
  { id: "phone", motion: "reduced", safe: PHONE_SAFE, use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } },
] as const) {
  test.describe(`Study Vault (${device.id}, ${device.motion} motion)`, () => {
    test.use(device.use);

    test("at the vault the covers open with the rover's distance, a book opens its study guide in this tab, and Esc gives the 3D view back", async ({ page, context }) => {
      const errors = collectErrors(page);
      const log = await routeGuides(page, PAGES);
      const opened = countPages(context);
      await skipFloorLines(page);
      await chooseMotion(page, device.motion);
      await enterFloorRoute(page, "/en/library");
      await expect.poll(async () => (await vaultProbe(page)).books).toEqual(guides.guides.map((g) => g.slug));
      const centers = await bookCenters(page);
      expect([...centers.keys()].sort()).toEqual(guides.guides.map((g) => g.slug).sort());
      // Far from the vault (the arrival) every cover is shut.
      expect((await vaultProbe(page)).open.every((o) => o === 0)).toBe(true);

      await driveTo(page, await stopOf(page, "L4:vault"));
      await waitForCameraSettle(page);
      // Every cover stands where the rover's distance puts it: half open or more from the stop.
      await expect
        .poll(async () => {
          const c = await coverGap(page, centers);
          return { ...c, settled: c.gap < 0.02 && c.min > 0.4 };
        }, { message: `${device.id}: covers at the stop` })
        .toMatchObject({ settled: true, books: guides.guides.length });
      expect((await vaultProbe(page)).spines, `${device.id}: spine signs`).toBe(guides.guides.length);

      // Point at the book: its cover swings fully open (at once under reduced motion).
      const point = await clickablePoint(page, BOOK, device.safe);
      expect(point, `${device.id}: ${BOOK} is clickable from the vault stop`).not.toBeNull();
      if (device.id === "phone") {
        await page.touchscreen.tap(point!.x, point!.y);
        await expect.poll(() => hoveredTarget(page)).toEqual({ id: BOOK, via: "tap" });
      } else {
        await page.mouse.move(point!.x, point!.y, { steps: 4 });
        await expect.poll(() => hoveredTarget(page)).toEqual({ id: BOOK, via: "pointer" });
      }
      if (device.motion === "reduced") {
        await waitForFrames(page, 2);
        expect(await openOf(page, GH600.slug), "reduced motion snaps the cover").toBe(1);
      } else {
        await expect.poll(() => openOf(page, GH600.slug), { message: "the pointed cover opens" }).toBeGreaterThan(0.9);
      }

      // The click (or Go after a tap) opens the reader on the guide, here.
      if (device.id === "phone") await page.getByTestId("interact-go").tap();
      else await page.mouse.click(point!.x, point!.y);
      await expectReaderOpen(page, GH600.title.en);
      expect(log.requests.some((r) => new URL(r.url).pathname === `/api/guides/${GH600.slug}`)).toBe(true);
      expect(opened.count, "no new tab or window").toBe(0);
      expect(context.pages()).toHaveLength(1);

      await closeAndDrive(page);
      expect(opened.count).toBe(0);
      expect(errors).toEqual([]);
    });
  });
}

test.describe("Study Vault point-and-go (desktop)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("a book clicked from the constellation stop drives to the vault stop and opens the reader", async ({ page, context }) => {
    const errors = collectErrors(page);
    await routeGuides(page, PAGES);
    const opened = countPages(context);
    await skipFloorLines(page);
    await enterFloorRoute(page, "/en/library");
    const [topics, vault] = [await stopOf(page, "L4:topics"), await stopOf(page, "L4:vault")];
    await driveTo(page, topics);
    await waitForCameraSettle(page);
    const start = await roverAt(page);
    expect(Math.hypot(start.x - vault.x, start.z - vault.z), "the rover starts away from the vault stop").toBeGreaterThan(6);

    // Any book on screen from the plaza (the nearest first); gh-600 when it shows.
    let id = BOOK;
    let point = await clickablePoint(page, BOOK);
    if (!point) {
      for (const g of guides.guides) {
        point = await clickablePoint(page, `L4:vault:${g.slug}`);
        if (point) {
          id = `L4:vault:${g.slug}`;
          break;
        }
      }
    }
    expect(point, "a Study Vault book is clickable from the constellation stop").not.toBeNull();
    const guide = guides.guides.find((g) => `L4:vault:${g.slug}` === id)!;
    await page.mouse.click(point!.x, point!.y);
    await waitForRoverMove(page, start, 1);
    await expectReaderOpen(page, guide.title.en);
    const end = await roverAt(page);
    expect(Math.hypot(end.x - vault.x, end.z - vault.z), "the reader opens at the vault stop").toBeLessThan(1.5);
    expect(opened.count, "no new tab or window").toBe(0);

    await closeAndDrive(page);
    expect(errors).toEqual([]);
  });
});
