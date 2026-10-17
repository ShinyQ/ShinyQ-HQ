import { expect, test, type Page } from "@playwright/test";
import {
  chooseMotion,
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

type ProbeWindow = { __hq: { probes: { flippedSigns: number; ghosts: Record<string, boolean> } } };
const sceneProbes = (page: Page) => page.evaluate(() => {
  const p = (window as unknown as ProbeWindow).__hq.probes;
  return { flippedSigns: p.flippedSigns, ghosts: Object.entries(p.ghosts).filter(([, on]) => on).map(([floor]) => floor) };
});

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

/** A vertical left-button drag on open floor right of the rover, between the HUD's top and bottom rows (positive dy drags down). */
async function verticalDrag(page: Page, dy: number) {
  const { width, height } = page.viewportSize()!;
  const x = Math.round(width * 0.78);
  const top = Math.round(height * 0.2);
  const bottom = Math.round(height * 0.8);
  const y0 = dy > 0 ? top : bottom;
  const y1 = dy > 0 ? Math.min(bottom, top + dy) : Math.max(top, bottom + dy);
  await page.mouse.move(x, y0);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x + i, y0 + ((y1 - y0) * i) / 12);
  await page.mouse.up();
}

/** Moves the mouse to a canvas point whose ray hits no target, so nothing stays hovered (a hovered target hides the "!" bubble). */
async function hoverNothing(page: Page) {
  // Point-and-go hovers on the pointer move itself, so confirm through state that nothing ended up hovered
  // (and pick again if the view still moved a target under the point).
  await expect
    .poll(
      async () => {
        const point = await page.evaluate(() => {
          const hit = (window as unknown as { __hq: { interact: { hitAt: ((x: number, y: number) => string | null) | null } } }).__hq.interact.hitAt;
          // Close up (first person), one target can fill the middle of the view: scan out to the edges.
          for (let fy = 0.2; fy <= 0.8; fy += 0.05) {
            for (let fx = 0.05; fx <= 0.95; fx += 0.05) {
              const x = Math.round(innerWidth * fx);
              const y = Math.round(innerHeight * fy);
              if (document.elementFromPoint(x, y)?.tagName === "CANVAS" && hit && hit(x, y) === null) return { x, y };
            }
          }
          return null;
        });
        if (!point) return "no canvas point without a target";
        await page.mouse.move(point.x, point.y);
        await waitForFrames(page, 5);
        return page.evaluate(() => (window as unknown as HoverWindow).__hq.store.getState().hover?.item.id ?? null);
      },
      { timeout: 15_000 },
    )
    .toBeNull();
}

type HoverWindow = { __hq: { store: { getState: () => { hover: { item: { id: string } } | null } } } };

/**
 * Waits until the view stops turning: a rotate step eases in, so `forward.x < -0.99` holds while the
 * camera still turns about 5 to 8 degrees, enough to move a target under a point picked as free.
 */
async function waitForViewStill(page: Page) {
  await expect
    .poll(
      async () => {
        const a = await probe(page);
        await waitForFrames(page, 12);
        const b = await probe(page);
        return (
          Math.hypot(a.forward.x - b.forward.x, a.forward.z - b.forward.z) < 1e-3 &&
          Math.abs(a.elevation - b.elevation) < 1e-3 &&
          Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1], a.position[2] - b.position[2]) < 1e-2
        );
      },
      { timeout: 30_000 },
    )
    .toBe(true);
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
    // The session starts on the kiosk spawn view (L1:kiosk, zoomed out): zoom steps are relative to it.
    const start = (await probe(page)).zoom;
    await page.mouse.move(720, 450);
    await page.mouse.wheel(0, -120);
    await expect.poll(async () => (await probe(page)).zoom).toBeLessThan(start * 0.9);
    await page.mouse.wheel(0, 240);
    await expect.poll(async () => (await probe(page)).zoom).toBeGreaterThan(1.1);
    expect((await snapshot(page)).floor).toBe("L1");

    // Third person looks down through the ghost floors above; first person has no ceiling.
    expect((await sceneProbes(page)).ghosts.length).toBeGreaterThan(0);
    await enterFirstPerson(page);
    const fp = await probe(page);
    expect(fp.mode).toBe("first");
    await expect.poll(async () => (await sceneProbes(page)).ghosts).toEqual([]);
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
    await chooseMotion(page, "system");
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
    // From the default look (the session starts on the kiosk spawn view).
    await page.keyboard.press("0");
    await expect.poll(async () => Math.abs(Math.sin((await probe(page)).yaw / 2)), { timeout: 15_000 }).toBeLessThan(0.01);
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
    // From the default look (the session starts on the kiosk spawn view).
    await page.keyboard.press("0");
    await expect.poll(async () => Math.abs(Math.sin((await probe(page)).yaw / 2)), { timeout: 15_000 }).toBeLessThan(0.01);
    await enterFirstPerson(page);
    await page.getByRole("button", { name: en.hud.view.rotateRight }).click();
    await expect.poll(async () => (await probe(page)).forward.x, { timeout: 15_000 }).toBeLessThan(-0.99);
    await waitForViewStill(page);
    await hoverNothing(page);
    // The rotate button keeps focus after the click, and Enter on a focused control is that control's.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
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
    // Seen from the other side, the year signs, room labels and floor digits turn around (never mirrored).
    await expect.poll(async () => (await sceneProbes(page)).flippedSigns, { timeout: 15_000 }).toBeGreaterThan(0);
    await page.keyboard.press("0");
    await expect.poll(async () => Math.abs(Math.sin((await probe(page)).railYaw / 2)), { timeout: 15_000 }).toBeLessThan(0.01);
    await expect.poll(async () => (await sceneProbes(page)).flippedSigns, { timeout: 15_000 }).toBe(0);
  });
});

const BUDGET_FLOORS = [
  { floor: "L1", path: "/en", cap: 140 },
  { floor: "L2", path: "/en/journey", cap: 150 },
  { floor: "L3", path: "/en/labs", cap: 150 },
  { floor: "L4", path: "/en/library", cap: 150 },
  { floor: "RF", path: "/en/contact", cap: 80 },
] as const;

/**
 * Round 9 M: a low camera never shows the void under the slab. Per settled view: the bottom-center ray of the drawn
 * camera lands on the slab (or the camera stands on it), and the bottom rows of the canvas are not a flat band of the
 * clear color (the void under the slab; the floor shows its grid). Lite tier: no bloom or tone mapping on the pixels.
 */
type LowView = { onSlab: boolean; offSlab: number; flatRows: number; rows: number; elevation: number; yaw: number };

/** Reads the drawn camera's view against the floor's slab and the canvas' bottom rows right after the next render. */
async function lowView(page: Page): Promise<LowView> {
  return page.evaluate(
    () =>
      new Promise<LowView>((resolve) => {
        type V3 = { x: number; y: number; z: number };
        type Gl = { render: (s: unknown, c: unknown) => void; getRenderTarget: () => unknown; getContext: () => WebGL2RenderingContext };
        type Cam = { position: V3; fov: number; matrixWorld: { elements: number[] } };
        const w = window as unknown as {
          __hq: {
            render: { gl: Gl };
            store: { getState: () => { floor: string } };
            layouts: Record<string, { bounds: { minX: number; maxX: number; minZ: number; maxZ: number } }>;
            rover: { y: number; cameraElevation: number; cameraYaw: number };
          };
        };
        const gl = w.__hq.render.gl;
        const original = gl.render;
        gl.render = function (scene, camera) {
          original.call(gl, scene, camera);
          if (gl.getRenderTarget() !== null) return;
          gl.render = original;
          const ctx = gl.getContext();
          const W = ctx.drawingBufferWidth;
          const H = ctx.drawingBufferHeight;
          // The bottom 8% of the canvas (readPixels rows count from the bottom), every pixel of every fourth row.
          const rows = Math.max(4, Math.round(H * 0.08));
          const px = new Uint8Array(W * 4);
          let flatRows = 0;
          let sampled = 0;
          for (let y = 0; y < rows; y += 4) {
            ctx.readPixels(0, y, W, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
            let lo = 255;
            let hi = 0;
            for (let i = 0; i < W * 4; i += 4) for (let c = 0; c < 3; c++) {
              lo = Math.min(lo, px[i + c]);
              hi = Math.max(hi, px[i + c]);
            }
            sampled += 1;
            // The void is the clear color everywhere (#0a0a0f); the floor has grid lines, lanes or objects.
            if (hi - lo <= 6 && hi <= 20) flatRows += 1;
          }
          const cam = camera as Cam;
          const e = cam.matrixWorld.elements;
          const forward = { x: -e[8], y: -e[9], z: -e[10] };
          const up = { x: e[4], y: e[5], z: e[6] };
          const half = (cam.fov * Math.PI) / 360;
          const dir = { x: forward.x * Math.cos(half) - up.x * Math.sin(half), y: forward.y * Math.cos(half) - up.y * Math.sin(half), z: forward.z * Math.cos(half) - up.z * Math.sin(half) };
          const s = w.__hq.store.getState();
          const b = w.__hq.layouts[s.floor].bounds;
          const p = cam.position;
          const inside = (x: number, z: number) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
          const t = dir.y < 0 ? (w.__hq.rover.y - p.y) / dir.y : Infinity;
          const onSlab = inside(p.x, p.z) || (Number.isFinite(t) && inside(p.x + dir.x * t, p.z + dir.z * t));
          const offSlab = Math.max(b.minX - p.x, p.x - b.maxX, b.minZ - p.z, p.z - b.maxZ, 0);
          resolve({ onSlab, offSlab, flatRows, rows: sampled, elevation: w.__hq.rover.cameraElevation, yaw: w.__hq.rover.cameraYaw });
        };
      }),
  );
}

test.describe("low camera", () => {
  for (const [floor, path] of [
    ["L1", "/en"],
    ["L3", "/en/labs"],
    ["L4", "/en/library"],
  ] as const) {
    test(`${floor}: at the lowest tilt the camera turns all the way around and never looks off the slab into the void`, async ({ page }) => {
      test.setTimeout(360_000);
      await enterFloorRoute(page, path);
      expect((await snapshot(page)).floor).toBe(floor);
      await waitForCameraSettle(page);
      await verticalDrag(page, -600);
      await waitForCameraSettle(page);
      expect((await probe(page)).elevation).toBeLessThan(0.12);
      const start = (await probe(page)).yaw;
      const views: LowView[] = [];
      // Sixteen short turns with Q (1.7 rad/s, about 25 to 50 degrees each on SwiftShader), each read once the camera settled.
      for (let i = 0; i < 16; i++) {
        await page.keyboard.down("q");
        await waitForFrames(page, 1, 230);
        await page.keyboard.up("q");
        await waitForCameraSettle(page);
        views.push(await lowView(page));
      }
      expect(Math.abs(views[views.length - 1].yaw - start)).toBeGreaterThan(2 * Math.PI);
      for (const v of views) {
        expect(v.elevation, JSON.stringify(v)).toBeLessThan(0.2);
        expect(v.onSlab, JSON.stringify(v)).toBe(true);
        expect(v.flatRows, JSON.stringify(v)).toBeLessThan(v.rows);
      }
    });
  }
});

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
    // The Corners HUD keeps the view controls group (one reset button) bottom right.
    await expect(page.getByRole("group", { name: en.hud.view.label })).toBeVisible();
    // The session starts on the kiosk spawn view (L1:kiosk, zoomed out): zoom steps are relative to it.
    const start = (await probe(page)).zoom;
    await pinch(page, 120, 160);
    await expect.poll(async () => (await probe(page)).zoom).toBeLessThan(start * 0.95);
    expect((await probe(page)).mode).toBe("third");
    // Fingers stay on the open floor at mid-height, clear of the HUD corners (a finger that lands on a control is not a pinch).
    await pinch(page, 60, 220);
    await expect.poll(async () => (await probe(page)).blend, { timeout: 30_000 }).toBe(1);
    await pinch(page, 220, 90);
    await expect.poll(async () => (await probe(page)).blend, { timeout: 30_000 }).toBe(0);
    expect((await snapshot(page)).floor).toBe("L1");
  });
});
