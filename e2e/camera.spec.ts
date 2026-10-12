import { expect, test, type Page } from "@playwright/test";
import {
  asReturningVisitor,
  driveTo,
  enterFloorRoute,
  enterHQ,
  hoverTarget,
  padsOf,
  snapshot,
  targetPoint,
  visibleTarget,
  waitForCameraSettle,
  waitForFloor,
  waitForFrames,
  waitForHQ,
  waitForPhase,
  waitForRoverMove,
  waitForSceneLive,
} from "./hq";
import en from "../messages/en.json";
import { FIRST_PERSON } from "../src/experience/camera/firstPerson";
import { PITCH_LIMITS } from "../src/experience/camera/rigs";

/**
 * Round 5 camera work (P7): 360 degree orbit everywhere, pitch from just above the floor to near
 * top-down, the wheel and pinch zoom instead of changing floors, and first person after zooming all
 * the way in. Probes: `window.__hq.rover.camera*` and `driving` (src/experience/rover/runtime.ts).
 */
test.describe.configure({ timeout: 150_000 });

interface CameraProbe {
  mode: "third" | "first";
  blend: number;
  zoom: number;
  look: number;
  elevation: number;
  yaw: number;
  railYaw: number;
  driving: boolean;
  position: [number, number, number];
  forward: { x: number; z: number };
  rover: { x: number; y: number; z: number };
}

type CameraWindow = {
  __hq: {
    rover: {
      x: number;
      y: number;
      z: number;
      cameraMode: "third" | "first";
      cameraBlend: number;
      cameraZoom: number;
      cameraLook: number;
      cameraElevation: number;
      cameraYaw: number;
      cameraRailYaw: number;
      driving: boolean;
      cameraPosition: [number, number, number];
      cameraForward: { x: number; z: number };
    };
  };
  __blend: { min: number; values: number[] };
};

const probe = (page: Page): Promise<CameraProbe> =>
  page.evaluate(() => {
    const r = (window as unknown as CameraWindow).__hq.rover;
    return {
      mode: r.cameraMode,
      blend: r.cameraBlend,
      zoom: r.cameraZoom,
      look: r.cameraLook,
      elevation: r.cameraElevation,
      yaw: r.cameraYaw,
      railYaw: r.cameraRailYaw,
      driving: r.driving,
      position: [r.cameraPosition[0], r.cameraPosition[1], r.cameraPosition[2]],
      forward: { x: r.cameraForward.x, z: r.cameraForward.z },
      rover: { x: r.x, y: r.y, z: r.z },
    };
  });

/** Records every drawn blend from now on (one sample per animation frame). */
async function trackBlend(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as CameraWindow;
    w.__blend = { min: Infinity, values: [] };
    const tick = () => {
      const b = w.__hq.rover.cameraBlend;
      w.__blend.min = Math.min(w.__blend.min, b);
      w.__blend.values.push(b);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const blendLog = (page: Page) => page.evaluate(() => (window as unknown as CameraWindow).__blend);
const resetBlendLog = (page: Page) =>
  page.evaluate(() => {
    const log = (window as unknown as CameraWindow).__blend;
    log.min = Infinity;
    log.values = [];
  });

/** Wheel notches in over the canvas: from zoom 1 the third enters first person (from 1.5 the fifth); extra notches are ignored there. */
async function enterFirstPerson(page: Page) {
  const size = page.viewportSize()!;
  await page.mouse.move(size.width / 2, size.height / 2);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -120);
  await expect.poll(async () => (await probe(page)).blend, { timeout: 30_000 }).toBe(1);
}

/** A vertical left-button drag on open floor right of the rover, inside the HUD-free band (positive dy drags down). */
async function verticalDrag(page: Page, dy: number) {
  const y0 = dy > 0 ? 180 : 780;
  await page.mouse.move(1000, y0);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(1000 + i, y0 + (dy * i) / 12);
  await page.mouse.up();
}

/** Two-finger pinch through CDP: the distance between the fingers goes from `from` to `to` px. */
async function pinch(page: Page, from: number, to: number, y = 500) {
  const cdp = await page.context().newCDPSession(page);
  const at = (d: number) => [
    { x: 195 - d / 2, y, id: 1 },
    { x: 195 + d / 2, y, id: 2 },
  ];
  let timestamp = Date.now() / 1000;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(from), timestamp });
  for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(from + ((to - from) * i) / 10), timestamp: (timestamp += 0.04) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: (timestamp += 0.04) });
  await cdp.detach();
}

test.describe("wheel zoom and first person", () => {
  test("the wheel zooms and never changes floors; all the way in looks through Rover's eyes and WASD drives where you look", async ({ page }) => {
    await enterHQ(page);
    await waitForCameraSettle(page);
    expect((await probe(page)).mode).toBe("third");
    await page.mouse.move(720, 450);
    await page.mouse.wheel(0, -120);
    await expect.poll(async () => (await probe(page)).zoom).toBeLessThan(0.9);
    await page.mouse.wheel(0, 240);
    await expect.poll(async () => (await probe(page)).zoom).toBeGreaterThan(1.1);
    expect((await snapshot(page)).floor).toBe("L1");

    await enterFirstPerson(page);
    const fp = await probe(page);
    expect(fp.mode).toBe("first");
    expect(fp.position[1]).toBeCloseTo(fp.rover.y + FIRST_PERSON.eyeHeight, 1);
    expect(Math.hypot(fp.position[0] - fp.rover.x, fp.position[2] - fp.rover.z)).toBeLessThan(0.05);
    const inside = await snapshot(page);
    expect(inside.floor).toBe("L1");
    expect(inside.ride).toBeNull();
    expect(inside.drawCalls).toBeLessThan(140);

    const before = inside.rover;
    const look = fp.forward;
    await page.keyboard.down("w");
    await waitForRoverMove(page, before, 3);
    await page.keyboard.up("w");
    const after = (await snapshot(page)).rover;
    const moved = { x: after.x - before.x, z: after.z - before.z };
    expect((moved.x * look.x + moved.z * look.z) / Math.hypot(moved.x, moved.z)).toBeGreaterThan(0.7);
    expect((await probe(page)).blend).toBe(1);

    await page.mouse.wheel(0, 120);
    await expect.poll(async () => (await probe(page)).blend, { timeout: 30_000 }).toBe(0);
    expect((await probe(page)).mode).toBe("third");
    expect((await snapshot(page)).floor).toBe("L1");
  });

  test("the view tilts from just above the floor to near top-down, never under it, also in first person", async ({ page }) => {
    await enterHQ(page);
    await waitForCameraSettle(page);
    // Drag up: the camera sinks to just above the floor (L1 is at y 0).
    await verticalDrag(page, -600);
    await waitForCameraSettle(page);
    let p = await probe(page);
    expect(p.elevation).toBeLessThan(0.2);
    expect(p.elevation).toBeGreaterThanOrEqual(PITCH_LIMITS[0] - 0.02);
    expect(p.position[1]).toBeGreaterThan(0.5);
    // Drag down: near top-down, never past it.
    await verticalDrag(page, 600);
    await waitForCameraSettle(page);
    p = await probe(page);
    expect(p.elevation).toBeGreaterThan(1.3);
    expect(p.elevation).toBeLessThanOrEqual(PITCH_LIMITS[1] + 0.02);
    // R tilts the view back up.
    await page.keyboard.down("r");
    await expect.poll(async () => (await probe(page)).elevation, { timeout: 30_000 }).toBeLessThan(1.2);
    await page.keyboard.up("r");

    await page.keyboard.press("0");
    await enterFirstPerson(page);
    await verticalDrag(page, 600);
    p = await probe(page);
    expect(p.look).toBeCloseTo(FIRST_PERSON.pitch[0], 5);
    expect(p.position[1]).toBeCloseTo(FIRST_PERSON.eyeHeight, 1);
    await verticalDrag(page, -600);
    expect((await probe(page)).look).toBeCloseTo(FIRST_PERSON.pitch[1], 5);
  });

  test("reduced motion cuts straight between third and first person", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await enterHQ(page);
    await trackBlend(page);
    await enterFirstPerson(page);
    await page.mouse.wheel(0, 120);
    await expect.poll(async () => (await probe(page)).blend, { timeout: 30_000 }).toBe(0);
    const { values } = await blendLog(page);
    expect(values).toContain(1);
    expect(values.filter((b) => b > 0 && b < 1)).toEqual([]);
  });

  test("autopilot drives and elevator rides pull back to third person and come back to first person", async ({ page }) => {
    await enterHQ(page);
    await enterFirstPerson(page);
    await trackBlend(page);
    const lift = (await padsOf(page, "L1")).find((p) => p.kind === "elevator")!;
    await driveTo(page, { x: lift.at.x + 8, z: lift.at.z });
    expect((await blendLog(page)).min).toBeLessThan(0.05);
    await expect.poll(async () => (await probe(page)).blend, { timeout: 30_000 }).toBe(1);

    await resetBlendLog(page);
    await page.keyboard.press("PageUp");
    await waitForFloor(page, "L2");
    expect((await blendLog(page)).min).toBe(0);
    await expect.poll(async () => (await probe(page)).blend, { timeout: 60_000 }).toBe(1);
    expect((await probe(page)).mode).toBe("first");
  });

  test("point-and-go works from Rover's eyes and the drive pulls back to third person", async ({ page }) => {
    await enterHQ(page);
    const lift = (await padsOf(page, "L1")).find((p) => p.kind === "elevator")!;
    await driveTo(page, { x: lift.at.x + 10, z: lift.at.z });
    await enterFirstPerson(page);
    // One rotate step right looks west (-x), straight at the pad.
    await page.getByRole("button", { name: en.hud.view.rotateRight }).click();
    await expect.poll(async () => (await probe(page)).forward.x, { timeout: 15_000 }).toBeLessThan(-0.99);
    const pad = await visibleTarget(page, { kinds: ["elevator-pad"] });
    await hoverTarget(page, pad.id);
    const point = await targetPoint(page, pad.id);
    await trackBlend(page);
    await page.mouse.click(point.x, point.y);
    await expect(page.getByTestId("pad-picker")).toBeVisible({ timeout: 30_000 });
    expect((await blendLog(page)).min).toBeLessThan(0.2);
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await probe(page)).blend, { timeout: 30_000 }).toBe(1);
  });

  test("the ! hints and Rover's dialog show in first person", async ({ page }) => {
    await asReturningVisitor(page);
    await page.addInitScript(() => localStorage.setItem("hq:hints", "on"));
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    const lift = (await padsOf(page, "L1")).find((p) => p.kind === "elevator")!;
    await driveTo(page, { x: lift.at.x + 4, z: lift.at.z });
    await enterFirstPerson(page);
    await page.getByRole("button", { name: en.hud.view.rotateRight }).click();
    await expect.poll(async () => (await probe(page)).forward.x, { timeout: 15_000 }).toBeLessThan(-0.99);
    // Off the canvas, so nothing is hovered (a hovered target hides the bubble).
    await page.mouse.move(1, 1);
    const bubble = page.getByTestId("hint-bubble");
    await expect(bubble).toBeVisible({ timeout: 15_000 });
    await expect(bubble).toHaveAttribute("data-hint", "L1:pad:elevator");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("dialog-box")).toHaveAttribute("data-dialog", "hint:L1:pad:elevator");
    expect((await probe(page)).blend).toBe(1);
  });

  test("L2 turns all the way around the rover and resets to its side view", async ({ page }) => {
    await enterFloorRoute(page, "/en/journey");
    const right = page.getByRole("button", { name: en.hud.view.rotateRight });
    for (let i = 0; i < 4; i++) await right.click();
    await expect.poll(async () => (await probe(page)).railYaw, { timeout: 30_000 }).toBeGreaterThan(Math.PI - 0.01);
    await waitForCameraSettle(page);
    const p = await probe(page);
    expect(p.position[2]).toBeLessThan(p.rover.z - 10);
    expect(p.yaw).toBe(0);
    await page.keyboard.press("0");
    await expect.poll(async () => Math.abs(Math.sin((await probe(page)).railYaw / 2)), { timeout: 15_000 }).toBeLessThan(0.01);
  });
});

const BUDGET_FLOORS = [
  { floor: "L1", path: "/en", cap: 140 },
  { floor: "L2", path: "/en/journey", cap: 150 },
  { floor: "L3", path: "/en/labs", cap: 150 },
  { floor: "L4", path: "/en/library", cap: 150 },
  { floor: "RF", path: "/en/contact", cap: 80 },
] as const;

test.describe("first person render budget", () => {
  for (const { floor, path, cap } of BUDGET_FLOORS) {
    test(`first person on ${floor} stays under ${cap} draw calls and 30k triangles all the way around`, async ({ page }) => {
      await enterFloorRoute(page, path);
      await expect.poll(async () => (await probe(page)).driving, { timeout: 30_000 }).toBe(false);
      await enterFirstPerson(page);
      const right = page.getByRole("button", { name: en.hud.view.rotateRight });
      const key = floor === "L2" ? "railYaw" : "yaw";
      for (let quarter = 0; quarter < 4; quarter++) {
        await waitForFrames(page, 12);
        const { drawCalls, triangles } = await snapshot(page);
        expect(drawCalls, `${floor} quarter ${quarter}`).toBeGreaterThan(10);
        expect(drawCalls, `${floor} quarter ${quarter}`).toBeLessThan(cap);
        expect(triangles, `${floor} quarter ${quarter}`).toBeLessThan(30_000);
        const before = (await probe(page))[key];
        await right.click();
        await right.click();
        await expect.poll(async () => (await probe(page))[key] - before, { timeout: 15_000 }).toBeGreaterThan(Math.PI / 2 - 0.01);
      }
    });
  }
});

test.describe("touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

  test("pinch zooms, all the way into first person and back out, and never changes floors", async ({ page }) => {
    await enterHQ(page);
    await waitForCameraSettle(page);
    await pinch(page, 120, 160);
    await expect.poll(async () => (await probe(page)).zoom).toBeLessThan(0.95);
    expect((await probe(page)).mode).toBe("third");
    await pinch(page, 80, 300);
    await expect.poll(async () => (await probe(page)).blend, { timeout: 30_000 }).toBe(1);
    await pinch(page, 300, 120);
    await expect.poll(async () => (await probe(page)).blend, { timeout: 30_000 }).toBe(0);
    expect((await snapshot(page)).floor).toBe("L1");
  });
});
