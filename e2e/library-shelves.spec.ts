import { expect, test, type Page } from "@playwright/test";
import content from "../content/site-content.json";
import en from "../messages/en.json";
import { yawLooking } from "../src/experience/camera/look";
import { buildTrackIndex } from "../src/content/track-index";
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
  NAV_TIMEOUT,
  PHONE_SAFE,
  skipFloorLines,
  snapshot,
  turnCameraTo,
  waitForCameraSettle,
  waitForPhase,
  waitForRoom,
  waitForRoverMove,
} from "./hq";

// Rides, drives, camera eases and the intro at the test-only animation speed.
test.beforeEach(({ context }) => fastAnimations(context));

/**
 * The L4 reader track shelves (L4 Writing revamp): one bay per track, its lead post as a tall book and the other posts as
 * spines. Near a bay the spine nearest the rover pulls (`__hq.probes.shelves.pulled`); the pointed (or tapped) spine
 * pulls instead and shows its title; a click (or Go after a tap) drives to the bay's door and opens the post; Esc
 * gives the floor back. The bay's door opens the track drawer, whose items open their posts, and a post opened in 3D
 * (Cmd-K) parks the rover at its bay. Lite tier, like the other L4 specs (the full-tier bay is gated by
 * `e2e/perf/floors.spec.ts`, `settled-L4-shelf`). Every wait is on state (probes, the store, the drawer), never on time.
 */
test.describe.configure({ timeout: 240_000 });

type Vec2 = { x: number; z: number };
type SW = Window & {
  __hq: {
    probes: { shelves: { bays: string[]; spines: number; pulled: string | null }; library?: { labels: { text: string; kind: string }[] } };
    layouts: Record<string, { doors?: { room: string; at: Vec2 }[]; stops?: Record<string, Vec2>; arrival?: Vec2; spawn: Vec2; road?: { spurs: { room: string; from: Vec2; to: Vec2 }[] } }>;
    store: { getState: () => { phase: string; closeRoom: () => void } };
  };
};

const library = content.floors.library;
/** Each track's posts, lead first (the 3D payload's order); tracks without posts have no bay. */
const TRACKS = buildTrackIndex(library as unknown as Parameters<typeof buildTrackIndex>[0]).filter((t) => t.posts.length);
const TITLE = new Map(library.posts.map((p) => [p.slug, p.title.en]));
/** The bay under test: the track with the most spines (the first on ties). */
const TRACK = TRACKS.reduce((a, b) => (b.posts.length > a.posts.length ? b : a));
const BAY = `L4:track:${TRACK.slug}`;
/** Its spines (every post but the lead): only these pull. */
const SPINES = TRACK.posts.slice(1);
const fold = (s: string) => s.replace(/\s+/g, " ");

const shelves = (page: Page) => page.evaluate(() => (window as unknown as SW).__hq.probes.shelves);
const pulled = async (page: Page) => (await shelves(page)).pulled;
const roverAt = async (page: Page) => (await snapshot(page)).rover;
const doorOf = (page: Page, room: string) => page.evaluate((r) => (window as unknown as SW).__hq.layouts.L4.doors!.find((d) => d.room === r)!.at, room);
const spurOf = (page: Page, room: string) => page.evaluate((r) => (window as unknown as SW).__hq.layouts.L4.road!.spurs.find((s) => s.room === r)!, room);
const shownSpines = (page: Page) => page.evaluate(() => ((window as unknown as SW).__hq.probes.library?.labels ?? []).filter((b) => b.kind === "spine").map((b) => b.text));

/** Spine centers by slug: the middle of each `L4:shelf:<slug>` pick volume (the slot's footprint). */
async function spineCenters(page: Page): Promise<Map<string, Vec2>> {
  const items = (await interactablesOf(page)).filter((i) => i.id.startsWith("L4:shelf:"));
  return new Map(items.map((i) => [i.id.slice("L4:shelf:".length), { x: (i.bounds.minX + i.bounds.maxX) / 2, z: (i.bounds.minZ + i.bounds.maxZ) / 2 }]));
}

/** The post room of the bay's spine nearest the rover now (what `pickSpine` pulls with no hover). */
async function nearestSpine(page: Page, centers: Map<string, Vec2>) {
  const r = await roverAt(page);
  const [slug] = SPINES.map((s) => [s, Math.hypot(centers.get(s)!.x - r.x, centers.get(s)!.z - r.z)] as const).sort((a, b) => a[1] - b[1])[0];
  return `L4:${slug}`;
}

/** Closes a drawer the door opened on arrival (the door does not reopen while the rover stays on it). */
async function closeDoorDrawer(page: Page) {
  await page.evaluate(() => {
    const store = (window as unknown as SW).__hq.store.getState();
    if (store.phase === "room") store.closeRoom();
  });
  await waitForPhase(page, "explore");
}

/** Drives to `at` with the drawer closed, the camera looking at the shelf (by hand under reduced motion: no view zone turns it). */
async function standAt(page: Page, at: Vec2, motion: "full" | "reduced", centers: Map<string, Vec2>) {
  await driveTo(page, at);
  await closeDoorDrawer(page);
  await waitForCameraSettle(page);
  if (motion === "reduced") {
    const mid = SPINES.map((s) => centers.get(s)!).reduce((a, c) => ({ x: a.x + c.x / SPINES.length, z: a.z + c.z / SPINES.length }), { x: 0, z: 0 });
    const r = await roverAt(page);
    await turnCameraTo(page, yawLooking({ x: mid.x - r.x, z: mid.z - r.z }));
  }
}

/** The first spine of the bay a click (or tap) lands on, with its screen point. */
async function clickableSpine(page: Page, safe: typeof DESKTOP_SAFE) {
  for (const slug of SPINES) {
    const point = await clickablePoint(page, `L4:shelf:${slug}`, safe);
    if (point) return { slug, id: `L4:shelf:${slug}`, point };
  }
  return null;
}

for (const device of [
  { id: "desktop", motion: "full", safe: DESKTOP_SAFE, use: { viewport: { width: 1440, height: 900 } } },
  { id: "phone", motion: "reduced", safe: PHONE_SAFE, use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } },
] as const) {
  test.describe(`L4 track shelves (${device.id}, ${device.motion} motion)`, () => {
    test.use(device.use);

    test("the nearest spine pulls at its bay, the pointed one pulls and shows its title, and opening it drives to the bay and opens the post", async ({ page }) => {
      const errors = collectErrors(page);
      await skipFloorLines(page);
      await chooseMotion(page, device.motion);
      await enterFloorRoute(page, "/en/library");
      // Away from the bays (the arrival) no spine pulls.
      await expect.poll(() => shelves(page)).toEqual({ bays: TRACKS.map((t) => t.slug), spines: library.posts.length - TRACKS.length, pulled: null });
      const centers = await spineCenters(page);
      expect([...centers.keys()].sort()).toEqual(library.posts.map((p) => p.slug).sort());
      const [door, spur] = [await doorOf(page, BAY), await spurOf(page, BAY)];

      // At the bay's door the spine nearest the rover pulls (it follows the rover) and its title shows.
      await standAt(page, door, device.motion, centers);
      const live = await nearestSpine(page, centers);
      await expect.poll(() => pulled(page), { message: `${device.id}: the nearest spine pulls at the door` }).toBe(live);
      await expect.poll(() => shownSpines(page), { message: `${device.id}: the live spine's title` }).toEqual([fold(TITLE.get(live.slice(3))!)]);

      // On the lane in front of the bay, outside its zone, none pulls until a spine is pointed at (or tapped): then that
      // one pulls and only its title shows.
      await standAt(page, spur.from, device.motion, centers);
      await expect.poll(() => pulled(page), { message: `${device.id}: no spine pulls on the lane` }).toBeNull();
      const spine = await clickableSpine(page, device.safe);
      expect(spine, `${device.id}: a spine of ${BAY} is clickable from the lane`).not.toBeNull();
      const { slug, id, point } = spine!;
      if (device.id === "phone") {
        await page.touchscreen.tap(point.x, point.y);
        await expect.poll(() => hoveredTarget(page)).toEqual({ id, via: "tap" });
        await expect(page.getByTestId("interact-go")).toContainText(TITLE.get(slug)!);
      } else {
        await page.mouse.move(point.x, point.y, { steps: 4 });
        await expect.poll(() => hoveredTarget(page)).toEqual({ id, via: "pointer" });
      }
      await expect.poll(() => pulled(page), { message: `${device.id}: the pointed spine pulls` }).toBe(`L4:${slug}`);
      await expect.poll(() => shownSpines(page), { message: `${device.id}: the pointed spine's title` }).toEqual([fold(TITLE.get(slug)!)]);

      // The click (or Go) drives to the bay's door and opens the post there.
      const start = await roverAt(page);
      if (device.id === "phone") await page.getByTestId("interact-go").tap();
      else await page.mouse.click(point.x, point.y);
      await waitForRoverMove(page, start, 1);
      await waitForRoom(page, `L4:${slug}`);
      await expect(page.getByTestId("room-drawer").getByRole("heading", { level: 2 })).toHaveText(TITLE.get(slug)!);
      await expect(page).toHaveURL(new RegExp(`/en/blog/${slug}\\?tier=lite$`), { timeout: NAV_TIMEOUT });
      const at = await roverAt(page);
      expect(Math.hypot(at.x - door.x, at.z - door.z), `${device.id}: the post opens at its bay's door`).toBeLessThan(1.5);

      // Esc gives the floor back.
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("room-drawer")).toHaveCount(0);
      await waitForPhase(page, "explore");
      await expect(page).toHaveURL(/\/en\/library\?tier=lite$/, { timeout: NAV_TIMEOUT });
      expect(errors).toEqual([]);
    });
  });
}

test.describe("L4 track drawer and post links (desktop)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the bay's door opens the track drawer, and an item opens its post there", async ({ page }) => {
    const errors = collectErrors(page);
    await skipFloorLines(page);
    await enterFloorRoute(page, "/en/library");
    const door = await doorOf(page, BAY);
    await driveTo(page, door);
    await waitForRoom(page, BAY);
    const drawer = page.getByTestId("room-drawer");
    await expect(drawer.getByRole("heading", { level: 2 })).toHaveText(library.tracks.find((t) => t.slug === TRACK.slug)!.title.en);
    // The track's posts, lead first.
    const items = drawer.getByTestId("room-item");
    await expect(items).toHaveCount(TRACK.posts.length);
    expect(await items.evaluateAll((els) => els.map((e) => e.getAttribute("data-room")))).toEqual(TRACK.posts.map((s) => `L4:${s}`));
    const slug = TRACK.posts[1];
    await items.nth(1).click();
    await waitForRoom(page, `L4:${slug}`);
    await expect(drawer.getByRole("heading", { level: 2 })).toHaveText(TITLE.get(slug)!);
    const at = await roverAt(page);
    expect(Math.hypot(at.x - door.x, at.z - door.z), "the post opens at its bay's door").toBeLessThan(1.5);
    expect(errors).toEqual([]);
  });

  test("a post opened in 3D (its /blog URL) parks the rover at its bay's door", async ({ page }) => {
    const errors = collectErrors(page);
    await skipFloorLines(page);
    await enterFloorRoute(page, "/en/library");
    // A post off the featured stage (the stage keeps the newest hosted post's own door).
    const slug = SPINES[SPINES.length - 1];
    const [stop, door] = await Promise.all([page.evaluate((r) => (window as unknown as SW).__hq.layouts.L4.stops![r], `L4:${slug}`), doorOf(page, BAY)]);
    expect(stop, `L4:${slug} stops at its bay's door`).toEqual(door);
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: en.hud.palette.title });
    await expect(palette.getByRole("combobox")).toBeFocused();
    await page.keyboard.type(TITLE.get(slug)!);
    await expect(palette.getByRole("option").first()).toContainText(TITLE.get(slug)!);
    await page.keyboard.press("Enter");
    await waitForRoom(page, `L4:${slug}`);
    await expect(page).toHaveURL(new RegExp(`/en/blog/${slug}\\?tier=lite$`), { timeout: NAV_TIMEOUT });
    const at = await roverAt(page);
    expect(Math.hypot(at.x - door.x, at.z - door.z), "the rover parks at its bay's door").toBeLessThan(1.5);
    expect(errors).toEqual([]);
  });
});
