import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { ARRIVAL_HEADING } from "../src/experience/camera/arrival";
import { ENGINE, ENGINE_STATIONS } from "../src/experience/floors/engine/layout";
import { B1_QUERY, enterB1Route, rideTo } from "./b1";
import { FLOOR_SCENE_CAPS } from "./budgets";
import { STATS_FIXTURE } from "../src/lib/visits/contract";
import { OFFICE_API_V4, shipStep } from "./office-fixtures";
import {
  asReturningVisitor,
  collectErrors,
  enterHQ,
  expectRenderBudget,
  snapshot,
  targetPoint,
  visibleTarget,
  waitForCameraSettle,
  waitForFloor,
  waitForHQ,
  waitForPhase,
  waitForRoom,
  waitForSceneLive,
  fastAnimations,
} from "./hq";

// Rides, drives, camera eases and the intro at the test-only animation speed (render-peak windows measure at real speed).
test.beforeEach(({ context }) => fastAnimations(context));

/**
 * B1 Engine Room, PR 2: the floor exists only for sessions unlocked with the dev and test flag; rides from the
 * Lobby and the roof, the arrival, the drawers, the minimap and the render budget. A locked session never
 * requests anything of B1 and never lists it. Waits are on state.
 */
test.describe.configure({ timeout: 240_000 });

type Probe = Window & {
  __hq: {
    store: {
      getState: () => { floor: string; ride: unknown; b1Unlocked: boolean; goToFloor: (f: string) => void; openRoom: (r: string) => void; closeRoom: () => void; openPicker: (p: { kind: "floor" }) => void };
    };
    rover: { x: number; z: number; heading: number; cameraBehind: number };
    floorChunks: { state: (id: string) => string };
    sky: { underground: boolean };
    audio: () => { floor: string | null };
  };
};
/** One read of the live probes (the page's CSP forbids eval, so no serialized callbacks). */
const probe = (page: Page) =>
  page.evaluate(() => {
    const h = (window as unknown as Probe).__hq;
    const s = h.store.getState();
    return {
      floor: s.floor,
      ride: s.ride,
      unlocked: s.b1Unlocked,
      rover: { x: h.rover.x, z: h.rover.z, heading: h.rover.heading, behind: h.rover.cameraBehind },
      chunks: { L3: h.floorChunks.state("L3"), L4: h.floorChunks.state("L4"), RF: h.floorChunks.state("RF"), B1: h.floorChunks.state("B1") },
      underground: h.sky.underground,
      ambience: h.audio().floor,
    };
  });
/** `__hq.reactor()` (null until the B1 chunk loaded): whether the reactor polls and what its core shows. */
const reactor = (page: Page) =>
  page.evaluate(() => {
    const hook = (window as unknown as { __hq: { reactor: () => { started: () => boolean; state: () => { state: { lanes: string[]; live: boolean } | null; segments: number; sparks: number } } | null } }).__hq.reactor();
    if (!hook) return null;
    const s = hook.state();
    return { started: hook.started(), lanes: s.state?.lanes ?? null, live: s.state?.live ?? null, segments: s.segments, sparks: s.sparks };
  });
/** Idle prefetch has run once every public floor is ready (prefetchAll and the idle apply share one callback). */
const publicFloorsReady = (page: Page) =>
  expect
    .poll(async () => Object.values((await probe(page)).chunks).filter((s) => s === "ready").length, { timeout: 60_000 })
    .toBe(3);
/** The page issued its requests and none is in flight: absence assertions after this cannot be an early read. */
const settled = (page: Page) => page.waitForLoadState("networkidle");
const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const elevator = (page: Page) => page.getByRole("navigation", { name: "Elevator" });
/** A locked session lists the five public floors and B1 as a locked, aria-disabled row with the progress hint. */
async function expectLockedRow(page: Page) {
  await expect(elevator(page).locator("[data-floor]")).toHaveCount(6);
  const b1 = elevator(page).locator('[data-floor="B1"]');
  await expect(b1).toHaveAttribute("aria-disabled", "true");
  await expect(b1).toHaveAccessibleName(/^B1 Visit all 5 floors/);
}

/** Every URL the page requests from now on. */
function recordRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  return urls;
}

/** The built script chunks that carry the B1 scenery and drawer body (found by their content, so a renamed hash cannot hide a leak). */
function b1ChunkFiles(): string[] {
  const dir = path.join(process.cwd(), process.env.E2E_DIR ?? "out", "_next", "static", "chunks");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".js") && readFileSync(path.join(dir, name), "utf8").includes("data-engine-station"))
    .map((name) => `/_next/static/chunks/${name}`);
}

const b1Data = (urls: string[]) => urls.filter((u) => /\/data\/rooms\/b1-[a-z]+\.json/.test(u));
const b1Scripts = (urls: string[]) => urls.filter((u) => b1ChunkFiles().some((c) => u.includes(c)));
const b1Requests = (urls: string[]) => [...b1Data(urls), ...b1Scripts(urls)];

async function openPhone(browser: Browser, query: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await asReturningVisitor(page);
  await page.goto(`/en?tier=lite${query}`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  return { context, page };
}

test.describe("the unlock flag", () => {
  test("without the flag nothing of B1 shows, loads or rides", async ({ page }) => {
    const errors = collectErrors(page);
    const requests = recordRequests(page);
    await enterHQ(page);
    await expectLockedRow(page);
    // Idle prefetch has run once every public floor is ready; B1 must still be untouched.
    await publicFloorsReady(page);
    const p = await probe(page);
    expect(p.unlocked).toBe(false);
    expect(p.chunks.B1).toBe("idle");
    await page.evaluate(() => (window as unknown as Probe).__hq.store.getState().goToFloor("B1"));
    expect((await probe(page)).ride).toBeNull();
    await settled(page);
    expect((await probe(page)).chunks.B1).toBe("idle");
    expect(b1ChunkFiles().length, "the B1 chunk is found in the build").toBeGreaterThan(0);
    expect(b1Requests(requests)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("?unlock=b1 without debug is ignored in a production build", async ({ page }) => {
    const requests = recordRequests(page);
    await asReturningVisitor(page);
    await page.goto("/en?tier=lite&unlock=b1");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    await expectLockedRow(page);
    await publicFloorsReady(page);
    await settled(page);
    const p = await probe(page);
    expect(p.unlocked).toBe(false);
    expect(p.chunks.B1).toBe("idle");
    expect(b1Requests(requests)).toEqual([]);
  });

  test("?unlock=b1&debug=1 unlocks B1 for the session: its row shows below the Lobby and its chunk loads", async ({ page }) => {
    const requests = recordRequests(page);
    await enterB1Route(page);
    expect((await probe(page)).unlocked).toBe(true);
    await expect(elevator(page).locator("[data-floor]")).toHaveCount(6);
    await expect(elevator(page).locator("[data-floor]").last()).toHaveAttribute("data-floor", "B1");
    await expect.poll(async () => (await probe(page)).chunks.B1, { timeout: 60_000 }).toBe("ready");
    await expect.poll(() => b1Data(requests).length, { timeout: 60_000 }).toBeGreaterThan(0);
    expect(b1Scripts(requests).length, "an unlocked session fetches the B1 chunk").toBeGreaterThan(0);
  });

  test("a language switch on B1 resumes there with the flag, and a stale B1 resume is dropped without it", async ({ page }) => {
    await enterB1Route(page);
    await rideTo(page, "B1");
    await page.getByRole("group", { name: "Language" }).getByRole("button", { name: "ID" }).click();
    await expect(page).toHaveURL(new RegExp(`/id\\?tier=lite&${B1_QUERY}$`));
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await expect.poll(async () => (await probe(page)).floor, { timeout: 60_000 }).toBe("B1");
    await expect.poll(async () => (await probe(page)).chunks.B1, { timeout: 60_000 }).toBe("ready");
    await expect(page.locator("html")).toHaveAttribute("lang", "id");

    // Without the flag the same resume record is ignored: the rover starts in the Lobby, never on B1.
    const locked = await page.context().newPage();
    await asReturningVisitor(locked);
    await locked.addInitScript(() => sessionStorage.setItem("hq:resume", JSON.stringify({ floor: "B1", x: -8, z: 0, at: Date.now() })));
    await locked.goto("/en?tier=lite");
    await waitForHQ(locked);
    await waitForPhase(locked, "explore");
    await waitForSceneLive(locked);
    const p = await probe(locked);
    await locked.close();
    expect(p.floor).toBe("L1");
    expect(p.unlocked).toBe(false);
  });
});

test.describe("a locked session", () => {
  test("never requests the B1 chunk or its room data, through prefetch, hover, a ride and a picker", async ({ page }) => {
    const requests = recordRequests(page);
    await enterHQ(page);
    await publicFloorsReady(page);
    for (const floor of ["RF", "L1"]) {
      await elevator(page).locator(`[data-floor="${floor}"]`).hover();
      await rideTo(page, floor);
    }
    await page.evaluate(() => (window as unknown as Probe).__hq.store.getState().openPicker({ kind: "floor" }));
    await expect(page.getByTestId("pad-picker")).toBeVisible();
    await settled(page);
    expect((await probe(page)).chunks.B1).toBe("idle");
    expect(b1ChunkFiles().length, "the B1 chunk is found in the build").toBeGreaterThan(0);
    expect(b1Requests(requests)).toEqual([]);
  });

  test("shows B1 only as a locked row in the elevator rail and the floor picker, and the command palette action only explains it", async ({ page }) => {
    await enterHQ(page);
    await expectLockedRow(page);
    await page.evaluate(() => (window as unknown as Probe).__hq.store.getState().openPicker({ kind: "floor" }));
    const picker = page.getByTestId("pad-picker");
    await expect(picker).toBeVisible();
    await expect(picker.locator("[data-option]")).toHaveCount(6);
    await expect(picker.locator('[data-option="B1"]')).toHaveAttribute("aria-disabled", "true");
    await expect(picker.locator('[data-option="B1"]')).toHaveAccessibleName(/^B1 /);
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);

    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await palette.getByRole("combobox").fill("Engine Room");
    await expect(palette.getByRole("option").first()).toBeVisible();
    // The action exists while locked; running it says the locked line (e2e/b1-unlock.spec.ts) and never rides.
    await expect(palette.getByRole("option").filter({ hasText: "Go to B1 Engine Room" })).toHaveCount(1);
  });

  test("phones: the floor sheet lists B1 locked, and lit once unlocked", async ({ browser }) => {
    const locked = await openPhone(browser, "");
    await locked.page.getByTestId("floor-chip").tap();
    await expect(locked.page.getByTestId("floor-sheet").locator("[data-floor]")).toHaveCount(6);
    await expect(locked.page.getByTestId("floor-sheet").locator('[data-floor="B1"]')).toHaveAttribute("aria-disabled", "true");
    await expect(locked.page.getByTestId("floor-sheet").locator('[data-floor="B1"]')).toHaveAccessibleName(/^B1 /);
    await locked.context.close();

    const open = await openPhone(browser, `&${B1_QUERY}`);
    await open.page.getByTestId("floor-chip").tap();
    const rows = open.page.getByTestId("floor-sheet").locator("[data-floor]");
    await expect(rows).toHaveCount(6);
    await expect(rows.last()).toHaveAttribute("data-floor", "B1");
    await open.context.close();
  });
});

test("an unlocked floor picker lists B1 last", async ({ page }) => {
  await enterB1Route(page);
  await page.evaluate(() => (window as unknown as Probe).__hq.store.getState().openPicker({ kind: "floor" }));
  const options = page.getByTestId("pad-picker").locator("[data-option]");
  await expect(options).toHaveCount(6);
  await expect(options.last()).toHaveAttribute("data-option", "B1");
});

test.describe("the floor", () => {
  test("rides from the Lobby to B1: the rover glides out facing the workbench, underground, with the hum, on the Lobby URL", async ({ page }) => {
    const errors = collectErrors(page);
    await enterB1Route(page);
    await expect(elevator(page).locator("[data-floor]").last()).toHaveAttribute("data-floor", "B1");
    await elevator(page).locator('[data-floor="B1"]').click();
    await waitForFloor(page, "B1", 90_000);
    await expect
      .poll(
        async () => {
          const { rover } = await probe(page);
          return Math.hypot(rover.x - ENGINE.arrival.x, rover.z - ENGINE.arrival.z);
        },
        { timeout: 60_000 },
      )
      .toBeLessThan(1.5);
    await waitForCameraSettle(page);
    const p = await probe(page);
    expect(angleGap(p.rover.heading, ARRIVAL_HEADING)).toBeLessThan(0.1);
    expect(angleGap(p.rover.behind, ARRIVAL_HEADING)).toBeLessThan(0.1);
    expect(p.underground).toBe(true);
    expect(p.ambience).toBe("B1");
    expect(p.chunks.B1).toBe("ready");
    await expect(page).toHaveURL(new RegExp(`/en\\?tier=lite&${B1_QUERY}$`));
    await expect(page.getByTestId("minimap")).toHaveAttribute("data-floor", "B1");
    expect(errors).toEqual([]);
  });

  test("settled on B1 the frame stays under its scene cap", async ({ page }) => {
    await enterB1Route(page);
    await rideTo(page, "B1");
    await waitForCameraSettle(page);
    const peaks = await expectRenderBudget(page);
    expect(peaks.sceneCalls).toBeLessThanOrEqual(FLOOR_SCENE_CAPS.B1);
  });

  test("every station opens its drawer with its body and a Classic link to its /build section; a click on a station drives there", async ({ page }) => {
    await enterB1Route(page);
    await rideTo(page, "B1");
    for (const id of ENGINE_STATIONS) {
      await page.evaluate((r) => (window as unknown as Probe).__hq.store.getState().openRoom(r), `B1:${id}`);
      await waitForRoom(page, `B1:${id}`);
      const drawer = page.getByTestId("room-drawer");
      await expect(drawer.locator(`[data-engine-station="${id}"]`)).toBeVisible();
      await expect(drawer.locator(`a[href*="/build?view=classic#${id}"]`).first()).toBeAttached();
      await page.evaluate(() => (window as unknown as Probe).__hq.store.getState().closeRoom());
    }
    await waitForCameraSettle(page);
    const target = await visibleTarget(page, { kinds: ["station"], minDistance: 2 });
    const point = await targetPoint(page, target.id);
    await page.mouse.click(point.x, point.y);
    await waitForRoom(page, `B1:${target.id.split(":").at(-1)}`);
  });

  test("browser Back closes an open station drawer on B1, as it does on a public floor", async ({ page }) => {
    const open = (room: string) => page.evaluate((r) => (window as unknown as Probe).__hq.store.getState().openRoom(r), room);
    const closed = () =>
      page.waitForFunction(
        () => {
          const s = (window as unknown as Probe).__hq.store.getState() as unknown as { activeRoom: string | null; phase: string };
          return s.activeRoom === null && s.phase === "explore";
        },
        undefined,
        { timeout: 30_000 },
      );
    await enterB1Route(page);
    // Control: the Lobby station closes on Back and the page stays on /en.
    await open("L1:skills");
    await waitForRoom(page, "L1:skills");
    await page.goBack();
    await closed();
    expect(new URL(page.url()).pathname).toBe("/en");
    await rideTo(page, "B1");
    await open("B1:timeline");
    await waitForRoom(page, "B1:timeline");
    expect(new URL(page.url()).pathname).toBe("/en");
    await page.goBack();
    await closed();
    expect((await snapshot(page)).floor).toBe("B1");
    expect(new URL(page.url()).pathname).toBe("/en");
    await expect(page.getByTestId("room-drawer")).toHaveCount(0);
  });

  test("the reactor core lights a segment run per job of the newest CI run and polls only while on B1", async ({ page }) => {
    await page.route(OFFICE_API_V4, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(shipStep(Date.now(), "base")) }));
    await enterB1Route(page);
    expect((await reactor(page))?.started ?? false).toBe(false);
    await rideTo(page, "B1");
    // Lite: 4 rings of 6 segments, no sparks; the lanes are run 4101's jobs in order.
    await expect.poll(() => reactor(page), { timeout: 30_000 }).toEqual({ started: true, lanes: ["done", "running", "queued", "queued"], live: true, segments: 24, sparks: 0 });
    await rideTo(page, "L1");
    await expect.poll(async () => (await reactor(page))?.started ?? false).toBe(false);
  });

  test("the reactor drawer explains the core and shows its live numbers, with no Classic link", async ({ page }) => {
    const now = Date.now();
    await page.route(OFFICE_API_V4, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(shipStep(Date.now(), "base", now - 3 * 60_000)) }));
    await page.route("**/api/stats", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...STATS_FIXTURE, updatedAt: new Date(now - 3_600_000).toISOString() }) }));
    await enterB1Route(page);
    await rideTo(page, "B1");
    await expect.poll(async () => (await reactor(page))?.live ?? false, { timeout: 30_000 }).toBe(true);
    await page.evaluate(() => (window as unknown as Probe).__hq.store.getState().openRoom("B1:reactor"));
    await waitForRoom(page, "B1:reactor");
    const drawer = page.getByTestId("room-drawer");
    await expect(drawer.getByRole("heading", { name: "The Reactor" }).first()).toBeVisible();
    const live = drawer.locator('[data-engine-station="reactor"] [data-reactor-live="true"]');
    await expect(live).toBeVisible();
    const tile = (label: string) => live.getByTestId("metric").filter({ hasText: label }).locator("p").first();
    await expect(tile("Jobs running")).toHaveText("1");
    await expect(tile("Jobs done")).toHaveText("1");
    await expect(tile("Agents awake")).toHaveText("6");
    await expect(tile("Since the last production deploy")).toHaveText(/^\d+ min$/);
    await expect(tile("Visits, last 30 days")).toHaveText("340");
    await expect(tile("Ask questions, last 30 days")).toHaveText("64");
    await expect(drawer.getByRole("heading", { name: "How it reads" })).toBeVisible();
    await expect(drawer.locator('a[href*="/build"]')).toHaveCount(0);
  });

  test("rides from the roof down to B1 and back up to the Lobby", async ({ page }) => {
    const errors = collectErrors(page);
    await enterB1Route(page);
    await rideTo(page, "RF");
    await rideTo(page, "B1");
    expect((await snapshot(page)).floor).toBe("B1");
    await rideTo(page, "L1");
    expect((await snapshot(page)).floor).toBe("L1");
    expect(errors).toEqual([]);
  });
});
