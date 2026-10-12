import { expect, test, type Page } from "@playwright/test";
import { asReturningVisitor, collectErrors, driveTo, expectRenderBudget, padsOf, waitForFrames, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";

test.describe.configure({ timeout: 180_000 });

type PadWindow = Window & {
  __hq: {
    store: {
      getState: () => {
        picker: { kind: string; from?: number } | null;
        beam: unknown;
        closePicker: () => void;
        setBeam: (beam: unknown) => void;
      };
    };
    rover: { x: number; z: number };
    camera: () => [number, number, number];
  };
};

/** L2 as a returning visitor without the first-visit walk prompt (it sits over the floor on phones). */
async function openJourney(page: Page) {
  await asReturningVisitor(page);
  await page.goto("/en/journey?tier=lite&walk=off");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

const picker = (page: Page) => page.evaluate(() => (window as unknown as PadWindow).__hq.store.getState().picker);
const beam = (page: Page) => page.evaluate(() => (window as unknown as PadWindow).__hq.store.getState().beam);
const roverAt = (page: Page) =>
  page.evaluate(() => {
    const r = (window as unknown as PadWindow).__hq.rover;
    return { x: r.x, z: r.z };
  });

test.describe("floor pads on the Career Road (L2)", () => {
  test("the elevator pad stays quiet under a deep link, then asks for a floor once the rover leaves and stops on it again", async ({ page }) => {
    const errors = collectErrors(page);
    await openJourney(page);
    const lift = (await padsOf(page, "L2")).find((p) => p.kind === "elevator")!;
    expect(lift.id).toBe("elevator:L2");
    await waitForFrames(page, 30);
    expect(await picker(page)).toBeNull();
    await expectRenderBudget(page);

    await driveTo(page, { x: lift.at.x + 10, z: lift.at.z });
    expect(await picker(page)).toBeNull();
    await driveTo(page, lift.at);
    await expect.poll(() => picker(page)).toEqual({ kind: "floor" });
    expect(errors).toEqual([]);
  });

  test("a year teleporter asks for a year, and a beam lands the rover on the target pad with the camera", async ({ page }) => {
    await openJourney(page);
    const teleports = (await padsOf(page, "L2")).filter((p) => p.kind === "teleport");
    expect(teleports.length).toBeGreaterThanOrEqual(5);
    const first = teleports[0];
    const target = teleports[4];
    await driveTo(page, first.at);
    await expect.poll(() => picker(page)).toEqual({ kind: "year", from: first.year });

    // What a year pick does: close the picker and let the Director run the beam to the target pad.
    await page.evaluate((t) => {
      const w = window as unknown as PadWindow;
      const s = w.__hq.store.getState();
      s.closePicker();
      s.setBeam({ pad: t.id, from: { x: w.__hq.rover.x, z: w.__hq.rover.z }, to: t.at, heading: Math.PI / 2, t: 0, jumped: false });
    }, target);
    await expect.poll(() => beam(page)).toBeNull();
    const at = await roverAt(page);
    expect(Math.hypot(at.x - target.at.x, at.z - target.at.z)).toBeLessThan(0.5);
    // The rail camera cut with the rover instead of gliding about 150 u along the road.
    await waitForFrames(page, 2);
    const [cx] = await page.evaluate(() => (window as unknown as PadWindow).__hq.camera());
    expect(Math.abs(cx - at.x)).toBeLessThan(2);
    await expect(page.getByTestId("year-chip")).toHaveAttribute("data-place", String(target.year));
    // Landing on the target pad does not open its picker.
    await waitForFrames(page, 30);
    expect(await picker(page)).toBeNull();
  });
});
