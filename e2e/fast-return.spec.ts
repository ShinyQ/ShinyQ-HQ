import { expect, test, type Page } from "@playwright/test";
import en from "../messages/en.json";
import { asReturningVisitor, collectErrors, driveTo, padsOf, targetPoint, visibleTarget, waitForCameraSettle, waitForFloor, waitForFrames, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";

/**
 * Fast return (F1, owner decision 2026-10-14: "Beam when far"). Express Return pads beam the rover to
 * its floor's elevator call pad, and a floor change requested more than 25 u from that pad beams the
 * rover into the car before the ride (`src/experience/nav/fastReturn.ts`). Closer, it drives as before.
 */
test.describe.configure({ timeout: 240_000 });

type Pose = { x: number; z: number; heading: number; autopilot: unknown };
type Beam = { pad: string; to: { x: number; z: number } } | null;
type FastWindow = Window & {
  __hq: {
    store: {
      getState: () => {
        floor: string;
        beam: Beam;
        ride: { stage: string } | null;
        picker: unknown;
        setBeam: (beam: unknown) => void;
      };
      subscribe: (fn: (s: { beam: Beam; ride: { stage: string } | null }) => void) => () => void;
    };
    rover: Pose;
    layouts: Record<string, { approach: { x: number; z: number } }>;
    ridePrep?: { lastRide: { timedOut: boolean; programs: number; distinctY: number } | null };
  };
  __beams: { pad: string; stage: string | null }[];
  __toDoorX: number[];
  __fadeSeen: boolean;
};

async function openFloor(page: Page, path: string) {
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=lite&walk=off`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

const rover = (page: Page) =>
  page.evaluate(() => {
    const r = (window as unknown as FastWindow).__hq.rover;
    return { x: r.x, z: r.z, heading: r.heading };
  });
const approach = (page: Page, floor: string) => page.evaluate((f) => (window as unknown as FastWindow).__hq.layouts[f].approach, floor);
/** Beams wait on rendered frames; a 300 u jump mounts new L2 plazas, which takes a few seconds on SwiftShader under load. */
const beam = (page: Page) => page.evaluate(() => (window as unknown as FastWindow).__hq.store.getState().beam);

/** Puts the rover at `to` with a test beam (the way pads.spec.ts teleports), then waits for the beam to end. */
async function placeRover(page: Page, to: { x: number; z: number }) {
  await page.evaluate((p) => {
    const w = window as unknown as FastWindow;
    w.__hq.store.getState().setBeam({ pad: "teleport:test", from: { x: w.__hq.rover.x, z: w.__hq.rover.z }, to: p, heading: Math.PI / 2, t: 0, jumped: false });
  }, to);
  await expect.poll(() => beam(page), { timeout: 30_000 }).toBeNull();
  await waitForFrames(page, 5);
}

/** Records every beam the store sees (with the ride stage at the time) and the rover's x on every frame of the drive to the door. */
async function recordRide(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as FastWindow;
    w.__beams = [];
    w.__toDoorX = [];
    w.__fadeSeen = false;
    w.__hq.store.subscribe((s) => {
      if (s.beam) w.__beams.push({ pad: s.beam.pad, stage: s.ride?.stage ?? null });
    });
    const fade = document.querySelector("[data-testid='beam-fade']");
    if (fade) new MutationObserver(() => (w.__fadeSeen ||= fade.classList.contains("opacity-100"))).observe(fade, { attributes: true, attributeFilter: ["class"] });
    const tick = () => {
      if (w.__hq.store.getState().ride?.stage === "toDoor") w.__toDoorX.push(w.__hq.rover.x);
      if (w.__toDoorX.length < 20_000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return () =>
    page.evaluate(() => {
      const w = window as unknown as FastWindow;
      return { beams: w.__beams, toDoorX: w.__toDoorX, fadeSeen: w.__fadeSeen };
    });
}

async function rideTo(page: Page, floor: string) {
  await page.getByRole("navigation", { name: "Elevator" }).locator(`[data-floor="${floor}"]`).click();
  await waitForFloor(page, floor, 180_000);
}

test.describe("fast return on the Career Road (L2)", () => {
  test("the Express Return pad at the annex beams the rover onto the elevator call pad, facing the car", async ({ page }) => {
    const errors = collectErrors(page);
    await openFloor(page, "/en/journey");
    const back = (await padsOf(page, "L2")).find((p) => p.id === "return:L2")!;
    expect(back).toBeTruthy();
    const teleport2026 = (await padsOf(page, "L2")).filter((p) => p.kind === "teleport").at(-1)!;
    await placeRover(page, teleport2026.at);
    const record = await recordRide(page);

    await driveTo(page, back.at);
    await expect.poll(() => beam(page), { timeout: 30_000 }).toBeNull();
    const { beams } = await record();
    expect(beams.some((b) => b.pad === "elevator:L2" && b.stage === null)).toBe(true);
    const lift = await approach(page, "L2");
    const at = await rover(page);
    expect(Math.hypot(at.x - lift.x, at.z - lift.z)).toBeLessThan(0.5);
    expect(Math.abs(at.heading + Math.PI / 2)).toBeLessThan(0.05);
    // Landing on the call pad does not ask for a floor.
    await waitForFrames(page, 30);
    expect(await page.evaluate(() => (window as unknown as FastWindow).__hq.store.getState().picker)).toBeNull();
    expect(errors).toEqual([]);
  });

  test("a floor change from the annex beams into the car, then rides as before", async ({ page }) => {
    await openFloor(page, "/en/journey");
    await placeRover(page, { x: 352, z: 0 });
    const record = await recordRide(page);
    await rideTo(page, "L3");
    const { beams, toDoorX } = await record();
    expect(beams.some((b) => b.pad === "elevator:L2" && b.stage === "toDoor")).toBe(true);
    // No drive along the road: every toDoor frame is at the annex or at the call pad.
    expect(toDoorX.every((x) => x > 340 || x < -20)).toBe(true);
    const last = await page.evaluate(() => (window as unknown as FastWindow).__hq.ridePrep?.lastRide ?? null);
    expect(last).not.toBeNull();
    expect(last!.timedOut).toBe(false);
    expect(last!.programs).toBe(0);
    expect(last!.distinctY).toBeGreaterThanOrEqual(12);
  });

  test("within 25 u of the elevator the rover still drives to the door", async ({ page }) => {
    await openFloor(page, "/en/journey");
    const lift = await approach(page, "L2");
    await driveTo(page, { x: lift.x + 12, z: lift.z });
    const record = await recordRide(page);
    await rideTo(page, "L3");
    const { beams, toDoorX } = await record();
    expect(beams).toEqual([]);
    expect(toDoorX.some((x) => x > lift.x + 2 && x < lift.x + 10)).toBe(true);
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("the beam into the car is a fade cut, then the ride's own cut", async ({ page }) => {
      await openFloor(page, "/en/journey");
      await placeRover(page, { x: 352, z: 0 });
      const record = await recordRide(page);
      await rideTo(page, "L3");
      const { beams, fadeSeen } = await record();
      expect(beams.some((b) => b.pad === "elevator:L2" && b.stage === "toDoor")).toBe(true);
      expect(fadeSeen).toBe(true);
      await expect(page.getByTestId("beam-fade")).toHaveClass(/opacity-0/);
    });
  });
});

test.describe("fast return on Project Roads (L3)", () => {
  test("a click on the Return pad by the reactor drives onto it and beams to the elevator", async ({ page }) => {
    const errors = collectErrors(page);
    await openFloor(page, "/en/labs");
    const back = (await padsOf(page, "L3")).find((p) => p.id === "return:L3")!;
    expect(back).toBeTruthy();
    await placeRover(page, { x: back.at.x - 8, z: back.at.z + 4 });
    await waitForCameraSettle(page);
    const record = await recordRide(page);
    const item = await visibleTarget(page, { kinds: ["return-pad"] });
    expect(item).toMatchObject({ id: "L3:pad:return", label: en.hud.interact.returnPad, action: { type: "return-beam" } });
    const point = await targetPoint(page, item.id);
    await page.mouse.click(point.x, point.y);
    await expect.poll(async () => (await record()).beams.some((b) => b.pad === "elevator:L3"), { timeout: 60_000 }).toBe(true);
    await expect.poll(() => beam(page), { timeout: 30_000 }).toBeNull();
    const lift = await approach(page, "L3");
    const at = await rover(page);
    expect(Math.hypot(at.x - lift.x, at.z - lift.z)).toBeLessThan(0.5);
    expect(errors).toEqual([]);
  });
});
