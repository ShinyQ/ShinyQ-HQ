import { expect, test, type Page } from "@playwright/test";
import en from "../messages/en.json";
import { chooseMotion, collectErrors, enterHQ, skipFloorLines, waitForCameraSettle, waitForFloor, waitForFrames } from "./hq";

/**
 * L3-style arrivals on every floor (Round 8 J, owner 2026-10-17): after an elevator ride the rover rolls on east
 * to `FloorLayout.arrival` and the camera glides out of the car to stand behind it, looking east. Reduced motion
 * cuts to the same view with the rover already on the arrival point. Reads the probes on `window.__hq.rover`
 * (`arrivalGlide`, `cameraBehind`, `heading`); every wait is on state, never on time. The desktop tour rides through
 * the elevator panel, so it also covers the panel reaching every floor and each built floor writing its route.
 * There is no phone tour: the arrival point, heading and glide have no viewport input (`camera/arrival.ts`), the
 * phone camera classes are unit tested (`tests/unit/arrivals.test.ts`) and phone rides run in `pads` and `hud-corners`.
 */
test.describe.configure({ timeout: 600_000 });

const EAST = Math.PI / 2;
const RIDE_TIMEOUT = 180_000;
const TOUR = ["L2", "L3", "L4", "RF", "L1"] as const;

type Point = { x: number; z: number };
type ArrivalWindow = Window & {
  __hq: {
    store: { getState: () => { floor: string; phase: string; ride: { stage: string } | null; goToFloor: (f: string) => void } };
    rover: {
      x: number;
      z: number;
      heading: number;
      driving: boolean;
      autopilot: { state: string } | null;
      arrivalGlide: number;
      cameraBehind: number;
      cameraYaw: number;
    };
    layouts: Record<string, { arrival?: Point }>;
  };
  __glides?: number[];
  __glidesStop?: boolean;
  __glideCancel?: { fired: boolean; yaw0: number; after: { glide: number; yaw: number }[]; done: boolean };
};

/** Absolute difference of two angles, wrapped to [0, PI]. */
const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

async function goToFloor(page: Page, floor: string) {
  await page.evaluate((f) => (window as unknown as ArrivalWindow).__hq.store.getState().goToFloor(f), floor);
}

/** Waits until the ride delivered the rover to `floor` and it parked on the floor's arrival point (within `tolerance`). */
async function waitForArrival(page: Page, floor: string, tolerance = 1) {
  await waitForFloor(page, floor, RIDE_TIMEOUT);
  await page.waitForFunction(
    ({ f, tolerance }) => {
      const hq = (window as unknown as ArrivalWindow).__hq;
      const s = hq.store.getState();
      const r = hq.rover;
      const a = hq.layouts[f]?.arrival;
      if (!a || s.floor !== f || s.ride !== null || s.phase !== "explore" || r.driving) return false;
      if (r.autopilot && r.autopilot.state !== "done") return false;
      return r.arrivalGlide === -1 && Math.hypot(r.x - a.x, r.z - a.z) < tolerance;
    },
    { f: floor, tolerance },
    { timeout: RIDE_TIMEOUT },
  );
}

/** Rover pose, its arrival point and the camera probes, read once. */
async function arrivalPose(page: Page, floor: string) {
  return page.evaluate((f) => {
    const hq = (window as unknown as ArrivalWindow).__hq;
    const r = hq.rover;
    return { x: r.x, z: r.z, heading: r.heading, cameraBehind: r.cameraBehind, arrival: hq.layouts[f].arrival! };
  }, floor);
}

/** The camera stands behind the rover (the camera-to-rover heading is east) and the rover heads east. */
async function expectBehindLookingEast(page: Page, floor: string) {
  await waitForCameraSettle(page);
  const pose = await arrivalPose(page, floor);
  expect(angleGap(pose.cameraBehind, EAST), `${floor} cameraBehind ${pose.cameraBehind}`).toBeLessThan(0.1);
  expect(angleGap(pose.heading, EAST), `${floor} heading ${pose.heading}`).toBeLessThan(0.1);
  return pose;
}

/**
 * Records `arrivalGlide` on every rendered frame (the rAF callback runs after R3F's: one sample per drawn frame).
 * `read` returns the samples, `reset` empties the buffer, `stop` ends the sampler.
 */
async function sampleGlide(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as ArrivalWindow;
    w.__glides = [];
    w.__glidesStop = false;
    const tick = () => {
      if (w.__glidesStop) return;
      w.__glides!.push(w.__hq.rover.arrivalGlide);
      if (w.__glides!.length < 50_000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return {
    read: () => page.evaluate(() => (window as unknown as ArrivalWindow).__glides ?? []),
    reset: () => page.evaluate(() => void ((window as unknown as ArrivalWindow).__glides = [])),
    stop: () => page.evaluate(() => void ((window as unknown as ArrivalWindow).__glidesStop = true)),
  };
}

async function openLobby(page: Page, motion: "full" | "reduced" = "full") {
  await chooseMotion(page, motion);
  await skipFloorLines(page);
  await enterHQ(page);
}

/** The route each built floor writes when the rover arrives (`Experience.tsx`). */
const ROUTE = { L1: /\/en\?tier=lite$/, L2: /\/en\/journey\?tier=lite$/, L3: /\/en\/labs\?tier=lite$/, L4: /\/en\/library\?tier=lite$/, RF: /\/en\/contact\?tier=lite$/ } as const;

test.describe("elevator arrivals on every floor (desktop 1440x900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("each ride through the panel parks the rover on the arrival point heading east with the camera behind it, and writes the floor's route", async ({ page }) => {
    const errors = collectErrors(page);
    await openLobby(page);
    const panel = page.getByRole("navigation", { name: "Elevator" });
    const glides = await sampleGlide(page);
    for (const floor of TOUR) {
      await glides.reset();
      await panel.locator(`[data-floor="${floor}"]`).click();
      await waitForArrival(page, floor);
      await expect(panel.locator(`[data-floor="${floor}"]`)).toHaveAttribute("aria-current", "true");
      await expect(page.getByTestId("floor-announcer")).toContainText(floor);
      await expect(page).toHaveURL(ROUTE[floor]);
      // Built floors link no "open the floor's page" notice.
      await expect(page.getByRole("link", { name: en.hud.openFloorPage.replace("{name}", en.floors[floor]) })).toHaveCount(0);
      await expectBehindLookingEast(page, floor);
      // The camera glides out of the car on every floor: some drawn frame of this ride sits strictly inside the glide.
      const seen = await glides.read();
      expect(seen.some((p) => p > 0 && p < 1), `${floor} glide frames ${seen.filter((p) => p >= 0).length}`).toBe(true);
    }
    await glides.stop();
    expect(errors).toEqual([]);
  });
});

test.describe("arrival glide and reduced motion (1440x900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("a held rotate key during the glide ends it at once and turns the camera", async ({ page }) => {
    await openLobby(page);
    // In the page, on the first frame inside the glide: hold Q (a synthetic keydown on window, where the input
    // listens), then record the glide probe and the camera yaw for 30 frames and let go.
    await page.evaluate(() => {
      const w = window as unknown as ArrivalWindow;
      const state = { fired: false, yaw0: 0, after: [] as { glide: number; yaw: number }[], done: false };
      w.__glideCancel = state;
      const tick = () => {
        const r = w.__hq.rover;
        if (!state.fired) {
          if (r.arrivalGlide > 0 && r.arrivalGlide < 1) {
            state.fired = true;
            state.yaw0 = r.cameraYaw;
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "q" }));
          }
        } else {
          state.after.push({ glide: r.arrivalGlide, yaw: r.cameraYaw });
          if (state.after.length >= 30) {
            window.dispatchEvent(new KeyboardEvent("keyup", { key: "q" }));
            state.done = true;
            return;
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await goToFloor(page, "L3");
    await page.waitForFunction(() => (window as unknown as ArrivalWindow).__glideCancel?.done === true, null, { timeout: RIDE_TIMEOUT });
    const { yaw0, after } = await page.evaluate(() => (window as unknown as ArrivalWindow).__glideCancel!);
    // The camera reads the held key on its next frame: within 3 drawn frames the glide is over, and it stays over.
    const firstOff = after.findIndex((s) => s.glide === -1);
    expect(firstOff, JSON.stringify(after.slice(0, 5))).toBeGreaterThanOrEqual(0);
    expect(firstOff).toBeLessThan(3);
    expect(after.slice(firstOff).every((s) => s.glide === -1)).toBe(true);
    // No longer forced into the arrival view: the held key turned the orbit.
    expect(angleGap(after[after.length - 1].yaw, yaw0)).toBeGreaterThan(0.05);
    await waitForFloor(page, "L3", RIDE_TIMEOUT);
  });

  test("reduced motion: no glide frame, the rover stands on the arrival point and the camera cuts behind it", async ({ page }) => {
    await openLobby(page, "reduced");
    const glides = await sampleGlide(page);
    for (const floor of ["L3", "L2"] as const) {
      await goToFloor(page, floor);
      await waitForArrival(page, floor, 0.5);
      await waitForFrames(page, 3);
      await expectBehindLookingEast(page, floor);
    }
    const seen = await glides.read();
    await glides.stop();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((p) => p === -1)).toBe(true);
  });

  test("a floor deep link (/en/library) opens on the L4 arrival view behind the rover, heading east", async ({ page }) => {
    await chooseMotion(page, "full");
    await skipFloorLines(page);
    await enterHQ(page, { path: "/en/library" });
    await waitForFloor(page, "L4");
    // The spawn on the arrival point faces east like an elevator arrival.
    const pose = await expectBehindLookingEast(page, "L4");
    expect(Math.hypot(pose.x - pose.arrival.x, pose.z - pose.arrival.z)).toBeLessThan(1);
  });
});
