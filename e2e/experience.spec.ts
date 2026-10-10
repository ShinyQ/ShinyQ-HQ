import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { asHumanBrowser, asReturningVisitor, collectErrors, enterHQ, snapshot, waitForCameraSettle, waitForFloor, waitForHQ, waitForPhase, waitForRoverMove } from "./hq";
import en from "../messages/en.json";
import data from "../content/site-content.json";

test.describe.configure({ timeout: 150_000 });

/**
 * Real touch input through CDP. Explicit timestamps (40 ms apart) keep the
 * gesture fast even when SwiftShader frames delay the renderer's acks.
 */
async function touch(page: Page, points: { x: number; y: number }[], holdMs = 0) {
  const cdp = await page.context().newCDPSession(page);
  const [first, ...rest] = points;
  let timestamp = Date.now() / 1000;
  const next = () => (timestamp += 0.04);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [first], timestamp });
  for (const p of rest) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [p], timestamp: next() });
  if (holdMs) {
    await page.waitForTimeout(holdMs);
    timestamp = Date.now() / 1000;
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: next() });
  await cdp.detach();
}

test.describe("boot and intro", () => {
  test("first visit shows the boot overlay, then the intro, then explore", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    const boot = page.getByTestId("boot");
    await expect(boot).toBeVisible();
    await expect(boot.getByRole("button", { name: "Boot rover" })).toBeFocused();
    await boot.getByRole("button", { name: "Boot rover" }).click();
    await waitForPhase(page, "intro");
    await expect(page.getByRole("button", { name: /Skip intro/ })).toBeVisible();
    await waitForPhase(page, "explore", 30_000);
    expect((await snapshot(page)).firstVisit).toBe(false);

    // Return visit: no boot overlay, the intro plays and Escape skips it.
    await page.reload();
    await waitForHQ(page);
    await waitForPhase(page, "intro");
    await expect(page.getByTestId("boot")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await waitForPhase(page, "explore");
    expect(errors).toEqual([]);
  });

  test("reduced motion skips the orbit", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await page.getByRole("button", { name: "Boot rover" }).click();
    await waitForPhase(page, "explore", 5_000);
    await context.close();
  });

  test("covers the page while open and keeps the HTML content", async ({ page }) => {
    await enterHQ(page);
    await expect(page.locator("#site-shell")).toHaveAttribute("inert", "");
    await expect(page.locator("h1")).toHaveText(/Kurniadi Ahmad Wijaya/);
    await expect(page.getByRole("img", { name: /explorable 3D tower/ })).toBeVisible();
  });
});

test.describe("elevator", () => {
  test("the panel reaches every floor", async ({ page }) => {
    const errors = collectErrors(page);
    await enterHQ(page);
    const panel = page.getByRole("navigation", { name: "Elevator" });
    for (const floor of ["L3", "RF", "L2", "L4", "L1"]) {
      await panel.locator(`[data-floor="${floor}"]`).click();
      await waitForFloor(page, floor);
      await expect(panel.locator(`[data-floor="${floor}"]`)).toHaveAttribute("aria-current", "true");
      await expect(page.getByTestId("floor-announcer")).toContainText(floor);
    }
    expect(errors).toEqual([]);
  });

  test("wheel and PageUp/PageDown move one floor at a time", async ({ page }) => {
    await enterHQ(page);
    await page.mouse.move(720, 450);
    await page.mouse.wheel(0, -120);
    await waitForFloor(page, "L2");
    await page.keyboard.press("PageUp");
    await waitForFloor(page, "L3");
    await page.keyboard.press("PageDown");
    await waitForFloor(page, "L2");
    await page.mouse.wheel(0, 120);
    await waitForFloor(page, "L1");
  });

  test("built floors sync their route", async ({ page }) => {
    await enterHQ(page);
    await page.keyboard.press("PageUp");
    await waitForFloor(page, "L2");
    await expect(page).toHaveURL(/\/en\/journey\?tier=lite$/);
    await expect(page.getByRole("link", { name: en.hud.openFloorPage.replace("{name}", en.floors.L2) })).toHaveCount(0);
  });
});

test.describe("rover on desktop", () => {
  test("WASD drives the rover and walls keep it inside the Lobby", async ({ page }) => {
    await enterHQ(page);
    const start = (await snapshot(page)).rover;
    await page.keyboard.down("w");
    await waitForRoverMove(page, start, 3);
    await page.waitForTimeout(4000);
    await page.keyboard.up("w");
    const { rover } = await snapshot(page);
    // Lobby slab x -24 to 28, z -24 to 18, minus the rover radius.
    expect(rover.x).toBeGreaterThan(-23.01);
    expect(rover.x).toBeLessThan(27.01);
    expect(rover.z).toBeGreaterThan(-23.01);
    expect(rover.z).toBeLessThan(17.01);
    // Never inside the hologram pedestal at (6, -4).
    expect(Math.abs(rover.x - 6) > 3.9 || Math.abs(rover.z + 4) > 3.9).toBe(true);
  });

  test("click to move drives to the clicked point", async ({ page }) => {
    await enterHQ(page);
    await waitForCameraSettle(page);
    const start = (await snapshot(page)).rover;
    // Below and left of the rover, which sits near the screen center.
    await page.mouse.click(500, 580);
    await waitForRoverMove(page, start, 2);
    await page.waitForFunction(() => {
      const r = (window as unknown as { __hq: { store: { getState: () => { rover: { speed: number } } } } }).__hq.store.getState().rover;
      return r.speed === 0;
    });
  });

  test("the Lobby stays under the draw call budget", async ({ page }) => {
    await enterHQ(page);
    await page.waitForTimeout(1500);
    const { drawCalls } = await snapshot(page);
    expect(drawCalls).toBeGreaterThan(10);
    expect(drawCalls).toBeLessThan(150);
  });
});

test.describe("rover on touch devices", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

  test("tap to move, joystick and vertical swipe", async ({ page }) => {
    const errors = collectErrors(page);
    await enterHQ(page);

    await waitForCameraSettle(page);
    const start = (await snapshot(page)).rover;
    await page.touchscreen.tap(140, 600);
    await waitForRoverMove(page, start, 2);
    await page.waitForTimeout(1500);

    const joystick = page.getByTestId("joystick");
    await expect(joystick).toBeVisible();
    const box = (await joystick.boundingBox())!;
    const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const before = (await snapshot(page)).rover;
    await touch(page, [c, { x: c.x, y: c.y - 30 }, { x: c.x, y: c.y - 55 }], 1200);
    await waitForRoverMove(page, before, 2);

    await touch(page, [{ x: 200, y: 560 }, { x: 200, y: 500 }, { x: 200, y: 420 }]);
    await waitForFloor(page, "L2");
    expect(errors).toEqual([]);
  });
});

test.describe("tiers and views", () => {
  test("?tier=static keeps the plain HTML page", async ({ page }) => {
    await page.goto("/en?tier=static");
    await expect(page.locator("h1")).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("hq")).toHaveCount(0);
    await expect(page.locator("#site-shell")).not.toHaveAttribute("inert", "");
  });

  test("software WebGL (no GPU) is treated as static without an override", async ({ page }) => {
    // Playwright renders WebGL on SwiftShader, a software rasterizer.
    await asHumanBrowser(page);
    await page.goto("/en");
    await expect(page.locator("h1")).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("hq")).toHaveCount(0);
  });

  test("browsers without WebGL fall back to static", async ({ page }) => {
    await asHumanBrowser(page);
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type.startsWith("webgl")) return null;
        return (original as (...a: unknown[]) => unknown).call(this, type, ...args);
      } as typeof original;
    });
    await page.goto("/en");
    await expect(page.locator("h1")).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("hq")).toHaveCount(0);
  });

  test("page view shows a prominent Back to 3D button right away", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await enterHQ(page);
    await page.getByRole("button", { name: "Page view" }).click();
    await expect(page.getByTestId("hq")).toHaveCount(0);
    await expect(page.locator("#site-shell")).not.toHaveAttribute("inert", "");
    const back = page.getByRole("button", { name: "Back to 3D" });
    // Visible right away (same render as the switch), without scrolling, and focus lands on the
    // page content. The timeout only covers slow SwiftShader frames unmounting the canvas.
    await expect(back).toBeInViewport({ ratio: 1, timeout: 20_000 });
    await expect(page.locator("#main")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(back).toBeFocused();
    // Still there after scrolling and across reloads in the same session.
    await page.mouse.wheel(0, 2000);
    await expect(back).toBeInViewport({ ratio: 1 });
    await page.reload();
    await expect(back).toBeInViewport({ ratio: 1 });
    await back.click();
    await waitForHQ(page);
  });

  test("the 3 key returns from page view", async ({ page }) => {
    await enterHQ(page);
    await page.getByRole("button", { name: "Page view" }).click();
    await expect(page.getByRole("button", { name: "Back to 3D" })).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press("3");
    await waitForHQ(page);
  });

  test("a real WebGL context loss falls back to the static page", async ({ page }) => {
    await enterHQ(page);
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("[data-testid=hq] canvas");
      canvas?.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
    });
    await expect(page.getByRole("status").filter({ hasText: en.hud.staticNotice })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("hq")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Back to 3D" })).toHaveCount(0);
  });

  test("static tier shows no Back to 3D button", async ({ page }) => {
    await page.goto("/en?tier=static");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to 3D" })).toHaveCount(0);
  });

  test("the language toggle resumes on the same floor", async ({ page }) => {
    await enterHQ(page);
    await page.keyboard.press("PageUp");
    await waitForFloor(page, "L2");
    await page.getByRole("group", { name: "Language" }).getByRole("button", { name: "ID" }).click();
    await expect(page).toHaveURL(/\/id\/journey\?tier=lite$/);
    await waitForHQ(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "id");
    const s = await snapshot(page);
    expect(s.phase).toBe("explore");
    expect(s.floor).toBe("L2");
    await expect(page.getByRole("navigation", { name: "Lift" })).toBeVisible();
  });

  test("sound is on by default, starts on the first gesture and a mute persists", async ({ page }) => {
    await enterHQ(page);
    const sound = page.getByRole("button", { name: "Sound" });
    // Never chose: on, nothing stored yet.
    await expect(sound).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => localStorage.getItem("hq:sound"))).toBeNull();
    await sound.click();
    await expect(sound).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => localStorage.getItem("hq:sound"))).toBe("off");
    expect((await page.evaluate(() => (window as unknown as { __hq: { store: { getState: () => { sound: boolean } } } }).__hq.store.getState().sound))).toBe(false);
    // A stored mute survives a reload.
    await page.reload();
    await expect(page.getByRole("button", { name: "Sound" })).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("m");
    await expect(page.getByRole("button", { name: "Sound" })).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => localStorage.getItem("hq:sound"))).toBe("on");
  });
});

test.describe("missions in 3D", () => {
  test("the HUD Missions button runs hire through the tower", async ({ page }) => {
    const errors = collectErrors(page);
    await enterHQ(page);
    await page.getByTestId("hud").getByRole("button", { name: "Missions" }).click();
    const terminal = page.getByRole("dialog", { name: "Rover Terminal" });
    await expect(terminal).toBeVisible();
    await page.keyboard.press("5");
    await expect(terminal).toBeHidden();
    // The rover drives to the elevator, rides to the Roof and opens the comms terminals in the drawer.
    await page.waitForFunction(() => (window as unknown as { __hq: { store: { getState: () => { ride: unknown } } } }).__hq.store.getState().ride !== null);
    await expect(page.getByTestId("room-drawer")).toHaveAttribute("data-room", "RF:contact", { timeout: 60_000 });
    await expect(page).toHaveURL(/\/en\/contact\?tier=lite$/);
    expect(errors).toEqual([]);
  });

  test("manual input cancels a running mission", async ({ page }) => {
    await enterHQ(page);
    await page.getByTestId("hud").getByRole("button", { name: "Missions" }).click();
    await page.getByRole("option", { name: data.missions.find((mission) => mission.id === "journey")!.label.en }).click();
    await page.waitForFunction(() => (window as unknown as { __hq: { store: { getState: () => { mission: { status: string } | null } } } }).__hq.store.getState().mission?.status === "running");
    await page.keyboard.down("s");
    await page.waitForFunction(() => (window as unknown as { __hq: { store: { getState: () => { mission: { status: string } | null } } } }).__hq.store.getState().mission?.status === "cancelled");
    await page.keyboard.up("s");
    expect((await snapshot(page)).floor).toBe("L1");
  });

  test("the terminal opens after the intro on the first visit", async ({ page }) => {
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await page.waitForTimeout(1200);
    await expect(page.getByRole("dialog", { name: "Rover Terminal" })).toHaveCount(0);
    await page.getByRole("button", { name: "Skip intro" }).click();
    await expect(page.getByRole("dialog", { name: "Rover Terminal" })).toBeVisible({ timeout: 15_000 });
  });

  test("the 3D HUD has no serious accessibility violations", async ({ page }) => {
    await enterHQ(page);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});

const cameraYaw = (page: Page) =>
  page.evaluate(() => (window as unknown as { __hq: { rover: { cameraYaw: number } } }).__hq.rover.cameraYaw);

/**
 * The camera publishes its yaw once per frame. Under SwiftShader a frame can take longer than the
 * input that changed the view, so wait for two frames before reading an "instant" value.
 */
const currentYaw = async (page: Page) => {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  return cameraYaw(page);
};

/** Holds a rotation key until `check` passes on the published yaw (frame-rate independent), then releases it. */
async function holdUntil(page: Page, key: string, check: (yaw: number) => boolean) {
  await page.keyboard.down(key);
  try {
    await expect.poll(async () => check(await cameraYaw(page)), { timeout: 30_000 }).toBe(true);
  } finally {
    await page.keyboard.up(key);
  }
}

test.describe("free orbit camera", () => {
  test("mouse drag rotates the view; a click without drag still moves the rover", async ({ page }) => {
    await enterHQ(page);
    await waitForCameraSettle(page);
    const before = await snapshot(page);
    // Drag on empty floor, left of the rover, with the left button.
    await page.mouse.move(300, 600);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(300 + i * 30, 600);
    await page.mouse.up();
    const yaw = await currentYaw(page);
    expect(yaw).toBeLessThan(-1);
    // Dragging rotated only: the rover did not drive off.
    const after = await snapshot(page);
    expect(Math.hypot(after.rover.x - before.rover.x, after.rover.z - before.rover.z)).toBeLessThan(0.5);

    // Right-button drag rotates too.
    await page.mouse.move(400, 600);
    await page.mouse.down({ button: "right" });
    for (let i = 1; i <= 5; i++) await page.mouse.move(400 - i * 30, 600);
    await page.mouse.up({ button: "right" });
    expect(await currentYaw(page)).toBeGreaterThan(yaw + 0.5);

    // The view persists (no spring-back) and a plain click still drives.
    await page.waitForTimeout(2500);
    expect(Math.abs((await currentYaw(page)) - yaw)).toBeGreaterThan(0.5);
    await waitForCameraSettle(page);
    const start = (await snapshot(page)).rover;
    await page.mouse.click(560, 520);
    await waitForRoverMove(page, start, 1.5);
  });

  test("trackpad deltaX, Q/E and the reset button", async ({ page }) => {
    await enterHQ(page);
    await page.mouse.move(640, 400);
    await page.mouse.wheel(300, 0);
    await expect.poll(() => cameraYaw(page)).toBeLessThan(-0.5);
    expect((await snapshot(page)).floor).toBe("L1");

    // Holding E turns right; holding Q turns left. Each key is held until the camera has turned,
    // so a slow frame cannot swallow a fixed-length press.
    const beforeKey = await currentYaw(page);
    await holdUntil(page, "e", (yaw) => yaw > beforeKey + 0.3);
    const afterE = await currentYaw(page);
    expect(afterE).toBeGreaterThan(beforeKey + 0.3);
    // Released: the view stays where it is (no drift, no spring-back).
    await page.waitForTimeout(1000);
    expect(Math.abs((await currentYaw(page)) - afterE)).toBeLessThan(1e-3);
    await holdUntil(page, "q", (yaw) => yaw < afterE - 0.3);
    expect(await currentYaw(page)).toBeLessThan(afterE - 0.3);

    await page.getByRole("button", { name: en.hud.view.rotateRight }).click();
    await page.getByRole("button", { name: "Reset view (0)" }).click();
    await expect.poll(async () => Math.abs(Math.sin((await cameraYaw(page)) / 2)), { timeout: 15_000 }).toBeLessThan(0.01);

    await page.keyboard.press("q");
    await page.keyboard.press("0");
    await expect.poll(async () => Math.abs(Math.sin((await cameraYaw(page)) / 2)), { timeout: 15_000 }).toBeLessThan(0.01);
  });
});

test.describe("free orbit on touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

  test("one-finger drag rotates, a tap still moves", async ({ page }) => {
    await enterHQ(page);
    await waitForCameraSettle(page);
    await expect(page.getByRole("group", { name: en.hud.view.label })).toBeVisible();
    const before = await snapshot(page);
    // A slow horizontal drag across empty floor (not a swipe).
    const points = Array.from({ length: 12 }, (_, i) => ({ x: 80 + i * 20, y: 560 }));
    const cdp = await page.context().newCDPSession(page);
    let timestamp = Date.now() / 1000;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [points[0]], timestamp });
    for (const p of points.slice(1)) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [p], timestamp: (timestamp += 0.05) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: (timestamp += 0.05) });
    await cdp.detach();
    expect(await currentYaw(page)).toBeLessThan(-0.8);
    const after = await snapshot(page);
    expect(after.floor).toBe("L1");
    expect(Math.hypot(after.rover.x - before.rover.x, after.rover.z - before.rover.z)).toBeLessThan(0.5);

    await waitForCameraSettle(page);
    await page.touchscreen.tap(150, 600);
    await waitForRoverMove(page, after.rover, 1.5);

    await page.getByRole("button", { name: en.hud.view.rotateLeft }).click();
    await expect.poll(() => cameraYaw(page)).toBeLessThan(-1.2);
  });
});

test.describe("orbit on every floor", () => {
  const yaws = (page: Page) =>
    page.evaluate(() => {
      const r = (window as unknown as { __hq: { rover: { cameraYaw: number; cameraRailYaw: number } } }).__hq.rover;
      return { yaw: r.cameraYaw, rail: r.cameraRailYaw };
    });

  for (const { path, floor } of [
    { path: "/en/library", floor: "L4" },
    { path: "/en/contact", floor: "RF" },
  ]) {
    test(`Q/E turn the follow camera freely on ${floor}`, async ({ page }) => {
      await asReturningVisitor(page);
      await page.goto(`${path}?tier=lite`);
      await waitForHQ(page);
      await waitForPhase(page, "explore", 60_000);
      expect((await snapshot(page)).floor).toBe(floor);
      await page.keyboard.down("e");
      await expect.poll(async () => (await yaws(page)).yaw, { timeout: 30_000 }).toBeGreaterThan(0.6);
      await page.keyboard.up("e");
    });
  }

  test("the L2 rail keeps its side view with limited yaw", async ({ page }) => {
    await asReturningVisitor(page);
    await page.goto("/en/journey?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore", 60_000);
    await page.keyboard.down("e");
    await expect.poll(async () => (await yaws(page)).rail, { timeout: 30_000 }).toBeGreaterThan(0.55);
    await page.waitForTimeout(1500);
    await page.keyboard.up("e");
    const { rail, yaw } = await yaws(page);
    expect(rail).toBeLessThanOrEqual((35 * Math.PI) / 180 + 1e-6);
    expect(yaw).toBe(0);
  });
});

test("the click marker appears where the floor is clicked and fades", async ({ page }) => {
  await enterHQ(page);
  const viewport = page.viewportSize()!;
  // Lower middle of the view is open floor in front of the rover at the Lobby spawn.
  await page.getByTestId("hq-world").click({ position: { x: viewport.width / 2 + 160, y: viewport.height - 140 } });
  type M = { __hq: { marker: { visible: boolean; opacity: number } } };
  await expect.poll(() => page.evaluate(() => (window as unknown as M).__hq.marker.visible)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as M).__hq.marker.opacity), { timeout: 5_000 }).toBeLessThan(0.05);
});
