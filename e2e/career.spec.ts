import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { chooseMotion, asReturningVisitor, collectErrors, expectRenderBudget, enterHQ, skipFloorLines, snapshot, targetPoint, waitForCameraSettle, waitForFloor, waitForFrames, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";
import en from "../messages/en.json";
import content from "../content/site-content.json";

const journey = content.missions.find((m) => m.id === "journey")!;

test.describe.configure({ timeout: 180_000 });

type HQWindow = Window & {
  __hq: { store: { getState: () => { activeRoom: string | null; phase: string; floor: string; rover: { x: number; z: number }; mission: { status: string } | null } } };
};

/** Opens an L2 route in 3D as a returning visitor; floor routes skip boot and intro. */
async function openJourney(page: Page, path = "/en/journey") {
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=lite`);
  await waitForHQ(page);
}

/** Waits until the rover's `axis` is above (`>`) or below (`<`) `value`. */
const roverWhere = (page: Page, axis: "x" | "z", op: ">" | "<", value: number, timeout = 60_000) =>
  page.waitForFunction(
    ({ axis, op, value }) => {
      const v = (window as unknown as HQWindow).__hq.store.getState().rover[axis];
      return op === ">" ? v > value : v < value;
    },
    { axis, op, value },
    { timeout },
  );

const activeRoom = (page: Page) => page.evaluate(() => (window as unknown as HQWindow).__hq.store.getState().activeRoom);

/** Real touch input through CDP with explicit timestamps (see experience.spec.ts). */
async function swipe(page: Page, points: { x: number; y: number }[]) {
  const cdp = await page.context().newCDPSession(page);
  const [first, ...rest] = points;
  let timestamp = Date.now() / 1000;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [first], timestamp });
  for (const p of rest) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [p], timestamp: (timestamp += 0.04) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: (timestamp += 0.04) });
  await cdp.detach();
}

test.describe("Career Road (L2)", () => {
  test("/journey starts on L2 once the intro played this session, and D drives forward through the years", async ({ page }) => {
    const errors = collectErrors(page);
    await openJourney(page);
    await waitForPhase(page, "explore");
    const start = await snapshot(page);
    expect(start.floor).toBe("L2");
    expect(start.rover.x).toBeLessThan(-18);
    await expect(page.getByTestId("floor-announcer")).toContainText("L2");
    expect(new URL(page.url()).pathname).toBe("/en/journey");

    await expect(page.getByTestId("year-chip")).toHaveAttribute("data-place", "2019");

    await page.keyboard.down("d");
    // Under the 2019 arch at x = -16 and into its plaza, staying on the road's center line.
    await roverWhere(page, "x", ">", -4);
    await page.keyboard.up("d");
    const { rover } = await snapshot(page);
    expect(Math.abs(rover.z)).toBeLessThan(1);
    expect(errors).toEqual([]);
  });

  test("the L2 road stays under the draw call budget", async ({ page }) => {
    await openJourney(page);
    await waitForPhase(page, "explore");
    await page.waitForFunction(() => (window as unknown as { __hq: { rover: { drawCalls: number } } }).__hq.rover.drawCalls > 10);
    await page.waitForTimeout(1500);
    await expectRenderBudget(page);
  });

  test("a deep link opens the room's drawer, Esc closes it and driving into a door opens it", async ({ page }) => {
    const errors = collectErrors(page);
    await openJourney(page, "/en/journey/jenius-2024");
    await waitForPhase(page, "room");
    const drawer = page.getByTestId("room-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("heading", { level: 2 })).toHaveText("Software Engineer");
    await expect(drawer).toContainText("Jenius");
    await expect(page.getByTestId("boot")).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/en/journey/jenius-2024");
    expect((await snapshot(page)).floor).toBe("L2");

    await page.keyboard.press("Escape");
    await waitForPhase(page, "explore");
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(/\/en\/journey\?tier=lite$/);
    await expect(page.getByTestId("year-chip")).toHaveAttribute("data-place", "2024");

    // Rooms dock in one row on both plaza edges. Open the 2024 room on the north edge, back off its
    // pad into the plaza (S drives toward the camera), then click the room itself (point-and-go): the
    // rover drives back to the door pad and the room opens.
    await openJourney(page, "/en/journey/crypto-tracker-2024");
    await waitForPhase(page, "room");
    await page.keyboard.press("Escape");
    await waitForPhase(page, "explore");
    const pad = (await snapshot(page)).rover;
    await page.keyboard.down("s");
    await roverWhere(page, "z", ">", pad.z + 4);
    await page.keyboard.up("s");
    await page.waitForFunction(() => (window as unknown as { __hq: { store: { getState: () => { rover: { speed: number } } } } }).__hq.store.getState().rover.speed === 0);
    await waitForCameraSettle(page);
    const room = await targetPoint(page, "L2:door:crypto-tracker-2024");
    await page.mouse.click(room.x, room.y);
    await waitForPhase(page, "room", 60_000);
    expect(await activeRoom(page)).toBe("L2:crypto-tracker-2024");
    await expect(drawer).toBeVisible();
    await expect(page).toHaveURL(/\/en\/journey\/crypto-tracker-2024\?tier=lite$/);
    expect(errors).toEqual([]);
  });

  test("Follow my career rides from the Lobby to L2 and drives to the first room without opening it", async ({ page }) => {
    const errors = collectErrors(page);
    await skipFloorLines(page);
    await enterHQ(page);
    const label = journey.label.en;
    const first = journey.steps.flatMap((step) => (step.kind === "drive" && "to" in step ? [String(step.to)] : []))[0];
    await page.keyboard.press("Control+k");
    await page.keyboard.type(label);
    await page.getByRole("dialog", { name: "Command palette" }).getByRole("option", { name: new RegExp(label) }).first().click();
    await waitForFloor(page, "L2", 90_000);
    // The mission ends once the rover reaches the first room's door: no drawer opens.
    await page.waitForFunction(
      () => {
        const s = (window as unknown as HQWindow).__hq.store.getState();
        return s.mission?.status === "done" && s.phase === "explore";
      },
      undefined,
      { timeout: 120_000 },
    );
    const door = await page.evaluate(
      (room) => (window as unknown as { __hq: { layouts: Record<string, { doors?: { room: string; at: { x: number; z: number } }[] }> } }).__hq.layouts.L2.doors?.find((d) => d.room === room)?.at ?? null,
      first,
    );
    expect(door).not.toBeNull();
    const { rover } = await snapshot(page);
    expect(Math.hypot(rover.x - door!.x, rover.z - door!.z)).toBeLessThan(1.5);
    // A few more frames, so a door pad or a late step that would open the room has had its chance.
    await waitForFrames(page, 20);
    expect(await activeRoom(page)).toBeNull();
    await expect(page.getByTestId("room-drawer")).toHaveCount(0);
    await expect(page).toHaveURL(/\/en\/journey\?tier=lite$/);
    expect(errors).toEqual([]);
  });

  test("search drives from the Lobby to a career room and opens it", async ({ page }) => {
    const errors = collectErrors(page);
    await enterHQ(page);
    await page.keyboard.press("Control+k");
    await page.keyboard.type("Jenius");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await palette.getByRole("option", { name: /Software Engineer.*Jenius/ }).first().click();
    await waitForFloor(page, "L2", 60_000).catch(() => undefined);
    await waitForPhase(page, "room", 120_000);
    expect(await activeRoom(page)).toBe("L2:jenius-2024");
    await expect(page.getByTestId("room-drawer")).toBeVisible();
    await expect(page).toHaveURL(/\/en\/journey\/jenius-2024\?tier=lite$/);
    expect(errors).toEqual([]);
  });

  test("trophy cases list the placings of their year", async ({ page }) => {
    await openJourney(page, "/en/journey/trophy-case-2022");
    await waitForPhase(page, "room");
    const drawer = page.getByTestId("room-drawer");
    await expect(drawer.getByRole("heading", { name: en.drawer.rooms.placings })).toBeVisible();
  });

  test("See the case study on L3 rides up to the pod and opens its drawer", async ({ page }) => {
    await openJourney(page, "/en/journey/jenius-2024");
    await waitForPhase(page, "room");
    await page.getByTestId("room-drawer").getByRole("button", { name: en.drawer.seeOnL3 }).click();
    await waitForFloor(page, "L3", 90_000).catch(() => undefined);
    await page.waitForFunction(
      () => {
        const s = (window as unknown as HQWindow).__hq.store.getState();
        return s.floor === "L3" && s.activeRoom === "L3:digital-banking-integrations" && s.phase === "room";
      },
      null,
      { timeout: 120_000 },
    );
    await expect(page).toHaveURL(/\/en\/labs\/digital-banking-integrations\?tier=lite$/);
  });

  test("the career drawer has no serious accessibility violations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await chooseMotion(page, "system");
    await openJourney(page, "/en/journey/jenius-2024");
    await waitForPhase(page, "room");
    await expect(page.getByTestId("room-drawer")).toBeVisible();
    const results = await new AxeBuilder({ page }).include("[data-testid='room-drawer']").analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });

  test("?tier=static keeps the plain journey page", async ({ page }) => {
    await page.goto("/en/journey/jenius-2024?tier=static");
    await expect(page.locator("h1")).toHaveText("Software Engineer");
    await page.waitForTimeout(500);
    await expect(page.getByTestId("hq")).toHaveCount(0);
  });
});

test.describe("Career Archive on touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

  test("a horizontal swipe scrubs forward and back through the years", async ({ page }) => {
    const errors = collectErrors(page);
    // Rover's L2 floor line would cover the swipe's start point on a phone.
    await skipFloorLines(page);
    await openJourney(page);
    await waitForPhase(page, "explore");
    // Deep links reach "explore" before the first frame: a swipe before it lands on the SSR boot
    // cover or is dropped before the Director runs.
    await waitForSceneLive(page);
    // Left swipe of ~60% of the width: two plaza stops forward (2019, then the 2020 plaza at x = 53).
    await swipe(page, [{ x: 320, y: 480 }, { x: 220, y: 482 }, { x: 80, y: 484 }]);
    await roverWhere(page, "x", ">", 40);
    await page.waitForFunction(() => (window as unknown as { __hq: { store: { getState: () => { rover: { speed: number } } } } }).__hq.store.getState().rover.speed === 0);
    // Right swipe goes back in time.
    const before = (await snapshot(page)).rover.x;
    await swipe(page, [{ x: 80, y: 480 }, { x: 180, y: 482 }, { x: 240, y: 484 }]);
    await roverWhere(page, "x", "<", before - 5);
    expect((await snapshot(page)).floor).toBe("L2");
    expect(errors).toEqual([]);
  });
});
