import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { asHumanBrowser, asReturningVisitor, collectErrors, expectRenderBudget, enterHQ, snapshot, waitForCameraSettle, waitForFloor, waitForFrames, waitForHQ, waitForHydration, waitForPhase, waitForRoom, waitForRoverMove, waitForSceneLive } from "./hq";
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

type Peaks = { speed: number; trail: number };

/** Records the highest rover speed and trail opacity over every rendered frame (the store only syncs every 0.1 s). */
async function trackPeaks(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __hq: { rover: Peaks }; __peaks: Peaks };
    w.__peaks = { speed: 0, trail: 0 };
    const tick = () => {
      w.__peaks.speed = Math.max(w.__peaks.speed, w.__hq.rover.speed);
      w.__peaks.trail = Math.max(w.__peaks.trail, w.__hq.rover.trail);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return () => page.evaluate(() => (window as unknown as { __peaks: Peaks }).__peaks);
}

test.describe("boot and intro", () => {
  test("the boot and the intro play in full once per session; nothing skips them", async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => localStorage.setItem("hq:terminal-seen", "1"));
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    const boot = page.getByTestId("boot");
    await expect(boot).toBeVisible();
    await expect(page.getByRole("button", { name: /skip/i })).toHaveCount(0);
    const start = boot.getByRole("button", { name: "Boot rover" });
    await expect(start).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(boot).toBeVisible();
    await expect(start).not.toHaveAttribute("aria-disabled", "true");
    await start.click();
    await waitForPhase(page, "intro");
    const introAt = Date.now();
    // Esc used to skip the intro; proving that it no longer does.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    expect((await snapshot(page)).phase).toBe("intro");
    await waitForPhase(page, "explore", 30_000);
    expect(Date.now() - introAt).toBeGreaterThanOrEqual(2000);
    expect(await page.evaluate(() => sessionStorage.getItem("hq:intro"))).toBe("seen");

    // Same session: straight into the Lobby, no boot and no intro.
    await page.reload();
    await waitForHQ(page);
    expect((await snapshot(page)).phase).toBe("explore");
    await expect(page.getByTestId("boot")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("a new session plays the boot again, even for a returning visitor", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem("hq:terminal-seen", "1");
      localStorage.setItem("hq:v1", JSON.stringify({ state: { firstVisit: false, visited: [], locale: "en", sound: false }, version: 1 }));
    });
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await expect(page.getByTestId("boot")).toBeVisible();
    expect((await snapshot(page)).phase).toBe("boot");
    await context.close();
  });

  test("a room deep link plays the boot and the intro first, then the rover rides on and opens the room", async ({ page }) => {
    const errors = collectErrors(page);
    const url = /\/en\/labs\/voice-ai-contact-center\?tier=lite$/;
    await page.goto("/en/labs/voice-ai-contact-center?tier=lite");
    await waitForHQ(page);
    const boot = page.getByTestId("boot");
    await expect(boot).toBeVisible();
    expect((await snapshot(page)).floor).toBe("L1");
    await expect(page).toHaveURL(url);
    const start = boot.getByRole("button", { name: "Boot rover" });
    await expect(start).not.toHaveAttribute("aria-disabled", "true");
    await start.click();
    await waitForPhase(page, "intro");
    await expect(page).toHaveURL(url);
    await waitForPhase(page, "explore", 30_000);
    await waitForRoom(page, "L3:voice-ai-contact-center");
    await expect(page).toHaveURL(url);
    // The first-visit terminal belongs to the Lobby; a deep link continues to its room instead.
    await expect(page.getByRole("dialog", { name: "Ask Rover" })).toHaveCount(0);

    // Same session: the deep link opens straight in.
    await page.reload();
    await waitForHQ(page);
    await waitForRoom(page, "L3:voice-ai-contact-center", 30_000);
    await expect(page.getByTestId("boot")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("a floor deep link plays the intro in the Lobby, then rides to its floor", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("hq:terminal-seen", "1"));
    await page.goto("/en/library?tier=lite");
    await waitForHQ(page);
    const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
    await expect(start).not.toHaveAttribute("aria-disabled", "true");
    await start.click();
    await waitForPhase(page, "intro");
    expect((await snapshot(page)).floor).toBe("L1");
    await waitForFloor(page, "L4");
    await expect(page).toHaveURL(/\/en\/library\?tier=lite$/);
  });

  test("reduced motion holds a still intro of the same length", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem("hq:terminal-seen", "1"));
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
    await expect(start).not.toHaveAttribute("aria-disabled", "true");
    await start.click();
    await waitForPhase(page, "intro");
    const introAt = Date.now();
    await waitForFrames(page, 3);
    const read = () =>
      page.evaluate(() => {
        const w = window as unknown as { __hq: { camera: () => number[]; store: { getState: () => { phase: string } } } };
        return { camera: w.__hq.camera(), phase: w.__hq.store.getState().phase };
      });
    const a = await read();
    await page.waitForTimeout(300);
    const b = await read();
    expect(b.phase).toBe("intro");
    expect(Math.hypot(a.camera[0] - b.camera[0], a.camera[1] - b.camera[1], a.camera[2] - b.camera[2])).toBeLessThan(0.01);
    await waitForPhase(page, "explore", 30_000);
    expect(Date.now() - introAt).toBeGreaterThanOrEqual(2000);
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

  test("every button names its floor with the page name", async ({ page }) => {
    await enterHQ(page);
    const panel = page.getByRole("navigation", { name: "Elevator" });
    const names = { RF: "About", L4: "Writing", L3: "Work", L2: "Journey", L1: "Home" };
    for (const [floor, name] of Object.entries(names)) {
      await expect(panel.locator(`[data-floor="${floor}"]`)).toContainText(name);
      await expect(panel.getByRole("button", { name: new RegExp(`^Go to ${floor}, ${name} \\(`) })).toBeVisible();
    }
  });

  test("phone buttons keep their short names inside the compact column", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    // Indonesian has the longest names (Perjalanan).
    await enterHQ(page, { path: "/id" });
    await page.evaluate(() => document.fonts.ready);
    const panel = page.getByTestId("elevator-panel");
    expect((await panel.boundingBox())!.width).toBeLessThanOrEqual(56);
    const clipped = await panel.locator("[data-testid='elevator-floor-label']").evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth).map((el) => el.textContent));
    expect(clipped).toEqual([]);
    await context.close();
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
    // Lobby slab x -24 to 28, z -21 to 21 (centered on the elevator axis), minus the rover radius.
    expect(rover.x).toBeGreaterThan(-23.01);
    expect(rover.x).toBeLessThan(27.01);
    expect(rover.z).toBeGreaterThan(-20.01);
    expect(rover.z).toBeLessThan(20.01);
    // Never inside the hologram pedestal at (6, 0).
    expect(Math.abs(rover.x - 6) > 3.9 || Math.abs(rover.z) > 3.9).toBe(true);
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
    await expectRenderBudget(page);
  });

  test("holding Shift boosts manual driving to about twice the speed, with a trail", async ({ page }) => {
    await enterHQ(page);
    await waitForCameraSettle(page);
    const peaks = await trackPeaks(page);
    // S drives toward the camera: open floor between the spawn and the south-east corner.
    await page.keyboard.down("Shift");
    await page.keyboard.down("s");
    await expect.poll(async () => (await peaks()).speed, { timeout: 20_000 }).toBeGreaterThan(12);
    await page.keyboard.up("s");
    await page.keyboard.up("Shift");
    const { speed, trail } = await peaks();
    expect(speed).toBeLessThanOrEqual(18.01);
    expect(trail).toBeGreaterThan(0);
  });

  test("without Shift the rover keeps its cruising speed and draws no trail", async ({ page }) => {
    await enterHQ(page);
    await waitForCameraSettle(page);
    const peaks = await trackPeaks(page);
    await page.keyboard.down("s");
    await expect.poll(async () => (await peaks()).speed, { timeout: 20_000 }).toBeGreaterThan(8);
    // Proving that nothing more happens: the speed stays at the 9 u/s cap.
    await page.waitForTimeout(500);
    await page.keyboard.up("s");
    const { speed, trail } = await peaks();
    expect(speed).toBeLessThanOrEqual(9.01);
    expect(trail).toBe(0);
  });

  test("reduced motion boosts without the trail", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    // Not enterHQ: it works the same before and after the intro changes of Task 4.
    await asReturningVisitor(page);
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore", 30_000);
    await waitForSceneLive(page);
    const peaks = await trackPeaks(page);
    await page.keyboard.down("Shift");
    await page.keyboard.down("s");
    await expect.poll(async () => (await peaks()).speed, { timeout: 20_000 }).toBeGreaterThan(12);
    await page.keyboard.up("s");
    await page.keyboard.up("Shift");
    expect((await peaks()).trail).toBe(0);
    await context.close();
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

  test("the landing's Enter the 3D HQ opens the tower from page view", async ({ page }) => {
    await enterHQ(page);
    await page.getByRole("button", { name: "Page view" }).click();
    await expect(page.getByTestId("hq")).toHaveCount(0, { timeout: 20_000 });
    const enter = page.getByRole("link", { name: en.home.hero.enter3d });
    await expect(enter).toBeVisible();
    // With the stats ticker in the bottom band, the floating Back to 3D button keeps clear of its contents.
    const back = page.getByTestId("back-to-3d");
    await expect(back).toBeVisible();
    const overlaps = await page.evaluate(() => {
      const ticker = document.querySelector<HTMLElement>("#stats")!;
      window.scrollBy(0, ticker.getBoundingClientRect().bottom - window.innerHeight + 8);
      const button = document.querySelector<HTMLElement>("[data-testid=back-to-3d]")!.getBoundingClientRect();
      return Array.from(ticker.querySelectorAll<HTMLElement>(".hx-tick-updated, .hx-pause, .hx-tick-view"))
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.left < button.right && r.right > button.left && r.top < button.bottom && r.bottom > button.top).length;
    });
    expect(overlaps).toBe(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await enter.click();
    await waitForHQ(page);
    expect(await page.evaluate(() => sessionStorage.getItem("hq:view"))).toBeNull();
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
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await expect(page.getByRole("button", { name: "Sound" })).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("m");
    await expect(page.getByRole("button", { name: "Sound" })).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => localStorage.getItem("hq:sound"))).toBe("on");
  });
});

test.describe("missions in 3D", () => {
  test("the HUD Ask Rover button runs hire through the tower", async ({ page }) => {
    const errors = collectErrors(page);
    await enterHQ(page);
    await page.getByTestId("hud").getByRole("button", { name: "Ask Rover", exact: true }).click();
    const terminal = page.getByRole("dialog", { name: "Ask Rover" });
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
    await page.getByTestId("hud").getByRole("button", { name: "Ask Rover", exact: true }).click();
    await page.getByRole("option", { name: data.missions.find((mission) => mission.id === "journey")!.label.en }).click();
    await page.waitForFunction(() => (window as unknown as { __hq: { store: { getState: () => { mission: { status: string } | null } } } }).__hq.store.getState().mission?.status === "running");
    await page.keyboard.down("s");
    await page.waitForFunction(() => (window as unknown as { __hq: { store: { getState: () => { mission: { status: string } | null } } } }).__hq.store.getState().mission?.status === "cancelled");
    await page.keyboard.up("s");
    expect((await snapshot(page)).floor).toBe("L1");
  });

  test("the certification preview opens over the tower and holds the world keys", async ({ page }) => {
    const errors = collectErrors(page);
    await enterHQ(page);
    await waitForHydration(page);
    const cert = data.certifications[0];
    // A 3D badge sends this command; DialogHost shows the card outside the inert shell.
    const view = { id: cert.id, code: cert.code ?? null, name: cert.name, short: cert.name, issuer: cert.issuer, logo: null, issued: cert.issued, issuedLabel: cert.issued, expires: null, expiresLabel: null, status: cert.status, url: cert.credentialUrl ?? null, credentialId: null, featured: false };
    await page.evaluate((c) => window.dispatchEvent(new CustomEvent("hq:hud", { detail: { type: "cert", cert: c } })), view);
    const dialog = page.getByRole("dialog", { name: cert.name });
    await expect(dialog).toBeVisible();
    const start = (await snapshot(page)).rover;
    await page.keyboard.down("w");
    await page.waitForTimeout(600);
    await page.keyboard.up("w");
    const now = (await snapshot(page)).rover;
    expect(Math.hypot(now.x - start.x, now.z - start.z)).toBeLessThan(0.05);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect((await snapshot(page)).phase).toBe("explore");
    expect(errors).toEqual([]);
  });

  test("the terminal opens after the intro on the first visit", async ({ page }) => {
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await page.waitForTimeout(1200);
    await expect(page.getByRole("dialog", { name: "Ask Rover" })).toHaveCount(0);
    const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
    await expect(start).not.toHaveAttribute("aria-disabled", "true");
    await start.click();
    await expect(page.getByRole("dialog", { name: "Ask Rover" })).toBeVisible({ timeout: 30_000 });
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
  // Input sent before the scene loop and camera are live is dropped (AGENTS.md, Fast verification).
  await waitForCameraSettle(page);
  type M = { __hq: { marker: { visible: boolean; opacity: number; x: number; z: number }; rover: { x: number; z: number } } };
  const before = await page.evaluate(() => ({ ...(window as unknown as M).__hq.marker }));
  const viewport = page.viewportSize()!;
  // Lower middle of the view is open floor in front of the rover at the Lobby spawn.
  await page.getByTestId("hq-world").click({ position: { x: viewport.width / 2 + 160, y: viewport.height - 140 } });
  // The ring lands where the floor was clicked (its position persists after the fade, so a slow frame cannot miss it)...
  await expect.poll(() => page.evaluate(() => (window as unknown as M).__hq.marker).then((m) => m.x !== before.x || m.z !== before.z)).toBe(true);
  // ...and fades out.
  await expect.poll(() => page.evaluate(() => (window as unknown as M).__hq.marker.opacity), { timeout: 10_000 }).toBeLessThan(0.05);
});
