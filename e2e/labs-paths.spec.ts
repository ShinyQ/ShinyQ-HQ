import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import en from "../messages/en.json";
import { asReturningVisitor, driveTo, expectRenderBudget, snapshot, waitForCameraSettle, waitForHQ, waitForPhase, waitForSceneLive, type RenderPeaks } from "./hq";

/**
 * L3 three paths (Round 7 G): Product Engineering north, the Data and ML spine straight east and AI
 * Engineering south, all three from the hub fork to the Tech Reactor plaza. On a desktop (full tier) and
 * a phone (lite tier): the arrival view (the `L3:overview` zone, one floating sign per road), a point 18 u
 * into each road and the reactor stop, each within the L3 render budget.
 *
 * Captures: with `LABS_SHOTS=<dir>` every pose is saved as `<dir>/<size>-<pose>.png`. The poses only read
 * `__hq.layouts`, so the same spec captures a main build too (`E2E_DIR=out-main`); geometry checks are soft
 * then, so a before capture runs through every pose.
 */
const SHOTS = process.env.LABS_SHOTS;
// A main build's data road starts past the reactor, so its entrance is a much longer drive.
test.describe.configure({ timeout: SHOTS ? 600_000 : 300_000 });

const check = SHOTS ? expect.soft : expect;

/** The `L3:overview` zone looks east at the wall: the camera stands west of the rover. */
const LOOK_EAST = (-3 * Math.PI) / 4;
const ROADS = ["software", "data", "ai"] as const;
const ENTRANCE = 18;

type Pt = { x: number; z: number };
type LW = Window & {
  __hq: {
    layouts: Record<string, { road?: { roads: { id: string; points: Pt[] }[] }; stops?: Record<string, Pt>; arrival?: Pt }>;
    probes: { signs: Record<string, { text: string; facing: number }[]> };
    rover: { cameraYaw: number; cameraZoom: number };
  };
};

const SIZES = [
  { name: "1440x900", width: 1440, height: 900, tier: "full", phone: false, zoom: 1.3 },
  { name: "390x844", width: 390, height: 844, tier: "lite", phone: true, zoom: 1.9 },
] as const;

/** The point `distance` along road `id` from its first point (walks the polyline), or null without that road. */
function pointAlong(page: Page, id: string, distance: number) {
  return page.evaluate(
    ({ id, distance }) => {
      const road = (window as unknown as LW).__hq.layouts.L3.road?.roads.find((r) => r.id === id);
      if (!road) return null;
      let left = distance;
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1];
        const b = road.points[i];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (left <= len) return { x: a.x + ((b.x - a.x) * left) / len, z: a.z + ((b.z - a.z) * left) / len };
        left -= len;
      }
      return road.points.at(-1)!;
    },
    { id, distance },
  );
}

async function openArrival(browser: Browser, size: (typeof SIZES)[number]) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, isMobile: size.phone, hasTouch: size.phone });
  const page = await context.newPage();
  await asReturningVisitor(page);
  // Walks off: no first-visit floor line covers the view.
  await page.goto(`/en/labs?tier=${size.tier}&walk=off`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  return { context, page };
}

/** Settles the camera, checks the L3 budget, logs the numbers and saves the capture when asked. */
async function pose(page: Page, size: (typeof SIZES)[number], name: string): Promise<RenderPeaks> {
  await waitForCameraSettle(page);
  const peaks = await expectRenderBudget(page);
  const { drawCalls, triangles } = await snapshot(page);
  const line = `L3 ${size.name} ${size.tier} ${name}: scene calls peak ${peaks.sceneCalls} (min ${peaks.minSceneCalls}), post ${peaks.postCalls}, triangles peak ${peaks.triangles}; frame ${drawCalls} calls, ${triangles} triangles`;
  console.log(line);
  test.info().annotations.push({ type: "render", description: line });
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: join(SHOTS, `${size.name}-${name}.png`) });
  }
  return peaks;
}

/** The point each pose drives to from the arrival spot (null when this build has no such road or stop). */
async function poseTarget(page: Page, name: string): Promise<Pt | null> {
  if (name === "reactor") return page.evaluate(() => (window as unknown as LW).__hq.layouts.L3.stops?.["L3:reactor"] ?? null);
  return pointAlong(page, name.slice("entrance-".length), ENTRANCE);
}

for (const size of SIZES) {
  test.describe(`L3 three paths @ ${size.name} ${size.tier}`, () => {
    test("arrival: the overview zone looks east at the wall, one sign per road, within the budget", async ({ browser }) => {
      const { context, page } = await openArrival(browser, size);
      const arrival = await page.evaluate(() => (window as unknown as LW).__hq.layouts.L3.arrival!);
      const { rover } = await snapshot(page);
      check(Math.hypot(rover.x - arrival.x, rover.z - arrival.z), "rover on the arrival spot").toBeLessThan(0.5);
      await waitForCameraSettle(page);
      const view = await page.evaluate(() => {
        const r = (window as unknown as LW).__hq.rover;
        return { yaw: r.cameraYaw, zoom: r.cameraZoom };
      });
      check(Math.abs(Math.sin((view.yaw - LOOK_EAST) / 2)), `camera yaw ${view.yaw} looks east (L3:overview)`).toBeLessThan(0.02);
      check(view.zoom, "L3:overview zoom").toBeCloseTo(size.zoom, 2);
      const signs = await page.evaluate(() => ((window as unknown as LW).__hq.probes.signs["labs-wing-signs"] ?? []).map((s) => s.text.replace(/\s+/g, " ")));
      check(signs.sort()).toEqual([en.common.wing.software, en.common.wing.data, en.common.wing.ai].map((w) => w.toUpperCase()).sort());
      await pose(page, size, "arrival");
      await context.close();
    });

    // Road entrances (18 u into each road from the hub centre), then the reactor plaza where the three roads meet.
    for (const name of [...ROADS.map((r) => `entrance-${r}`), "reactor"]) {
      test(`${name}: the rover drives there along the road and the view stays within the budget`, async ({ browser }) => {
        const { context, page } = await openArrival(browser, size);
        const at = await poseTarget(page, name);
        check(at, name).not.toBeNull();
        if (at) {
          await driveTo(page, at, 240_000);
          const { rover } = await snapshot(page);
          check(Math.hypot(rover.x - at.x, rover.z - at.z), `rover at ${name}`).toBeLessThan(name === "reactor" ? 2 : 1.5);
          await pose(page, size, name);
        }
        await context.close();
      });
    }
  });
}
