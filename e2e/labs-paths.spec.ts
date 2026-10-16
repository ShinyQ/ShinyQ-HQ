import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import en from "../messages/en.json";
import { LABS } from "../src/experience/floors/labs/layout";
import { asReturningVisitor, skipFloorLines, driveTo, expectRenderBudget, snapshot, waitForCameraSettle, waitForHQ, waitForPhase, waitForSceneLive, type RenderPeaks } from "./hq";

/**
 * L3 three paths (Round 7 G): Product Engineering north, the Data and ML spine straight east and AI
 * Engineering south, all three from the hub fork to the Tech Reactor plaza. On a desktop (full tier) and
 * a phone (lite tier): the arrival view (the `L3:overview` zone; three separate directory boards are the
 * one name per road, no floating sign repeats a wing name), a point 18 u into each road, each board stop and
 * the reactor stop, each within the L3 render budget. The end is mirror-symmetric: both wing roads mirror
 * across the spine, the spine ends on z = 0 and the Return pad sits on the axis.
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
/** East face of the glass elevator shaft (`SHAFT_EAST_FACE` in src/experience/config.ts): the arrival camera stays east of it. */
const SHAFT_EAST_FACE = -25;
/** The full tier at 1440x900 renders a few frames a second on SwiftShader beside a second worker: give the camera spring longer. */
const SETTLE = { timeout: 120_000 };
const ENTRANCE = 18;

/** Minimum floor gap between two directory boards' bounds, so each reads as its own board. */
const BOARD_GAP = 1.5;

type Pt = { x: number; z: number };
type TallRect = { minX: number; maxX: number; minZ: number; maxZ: number; h: number };
type LW = Window & {
  __hq: {
    layouts: Record<
      string,
      {
        road?: { roads: { id: string; points: Pt[] }[] };
        stops?: Record<string, Pt>;
        directoryStops?: Record<string, Pt>;
        arrival?: Pt;
        tall?: TallRect[];
        pads?: { id: string; at: Pt }[];
      }
    >;
    probes: { signs: Record<string, { text: string; facing: number }[]> };
    interact: { screenOf: (id: string) => { x: number; y: number } | null };
    rover: { cameraYaw: number; cameraZoom: number; cameraElevation: number };
    camera?: () => [number, number, number];
  };
};

const SIZES = [
  { name: "1440x900", width: 1440, height: 900, tier: "full", phone: false, zoom: 1.3 },
  // Phones zoom out further, but only so far that the follow camera stays east of the elevator shaft (LABS.overviewZoomPhone).
  { name: "390x844", width: 390, height: 844, tier: "lite", phone: true, zoom: 1.45 },
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
  // No first-visit floor line covers the view.
  await skipFloorLines(page);
  await page.goto(`/en/labs?tier=${size.tier}`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  return { context, page };
}

/** Settles the camera, checks the L3 budget, logs the numbers and saves the capture when asked. */
async function pose(page: Page, size: (typeof SIZES)[number], name: string): Promise<RenderPeaks> {
  await waitForCameraSettle(page, SETTLE);
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
  if (name === "reactor" || name === "reactor-top") return page.evaluate(() => (window as unknown as LW).__hq.layouts.L3.stops?.["L3:reactor"] ?? null);
  if (name.startsWith("board-")) return page.evaluate((wing) => (window as unknown as LW).__hq.layouts.L3.directoryStops?.[wing] ?? null, name.slice("board-".length));
  if (name === "reactor-approach") {
    // On the spine 12 u before its ring entry, heading east: the camera looks along the spine at the plaza.
    const end = await page.evaluate(() => (window as unknown as LW).__hq.layouts.L3.road?.roads.find((r) => r.id === "data")?.points.at(-1) ?? null);
    return end ? { x: end.x - 12, z: 0 } : null;
  }
  return pointAlong(page, name.slice("entrance-".length), ENTRANCE);
}

/** Tilts the follow camera to its steepest pitch and zooms out, so the reactor plaza shows from above. */
async function lookFromAbove(page: Page) {
  const elevation = () => page.evaluate(() => (window as unknown as LW).__hq.rover.cameraElevation);
  const before = await elevation();
  // R and F tilt the view (intents.ts); hold whichever raises the camera.
  for (const key of ["f", "r"]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(2500);
    await page.keyboard.up(key);
    await waitForCameraSettle(page, SETTLE);
    if ((await elevation()) > before + 0.1) break;
  }
  for (let i = 0; i < 4; i++) await page.keyboard.press("-");
}

for (const size of SIZES) {
  test.describe(`L3 three paths @ ${size.name} ${size.tier}`, () => {
    test("arrival: the overview zone looks east at three separate boards, no sign repeats a wing name, the end mirrors, within the budget", async ({ browser }) => {
      const { context, page } = await openArrival(browser, size);
      const arrival = await page.evaluate(() => (window as unknown as LW).__hq.layouts.L3.arrival!);
      const { rover } = await snapshot(page);
      check(Math.hypot(rover.x - arrival.x, rover.z - arrival.z), "rover on the arrival spot").toBeLessThan(0.5);
      await waitForCameraSettle(page, SETTLE);
      const view = await page.evaluate(() => {
        const w = window as unknown as LW;
        return { yaw: w.__hq.rover.cameraYaw, zoom: w.__hq.rover.cameraZoom, camera: w.__hq.camera?.() ?? null };
      });
      check(Math.abs(Math.sin((view.yaw - LOOK_EAST) / 2)), `camera yaw ${view.yaw} looks east (L3:overview)`).toBeLessThan(0.02);
      check(view.zoom, "L3:overview zoom").toBeCloseTo(size.zoom, 2);
      // The follow camera stands west of the rover, but never behind the glass shaft, which would fill the frame.
      check(view.camera, "camera position probe").not.toBeNull();
      if (view.camera) {
        console.log(`L3 ${size.name} arrival camera at x ${view.camera[0].toFixed(2)}, z ${view.camera[2].toFixed(2)}`);
        check(view.camera[0], "camera east of the elevator shaft").toBeGreaterThan(SHAFT_EAST_FACE);
      }
      // One name per road: the boards carry the wing names, so no floating sign on L3 repeats one.
      const wingNames = ROADS.map((w) => en.common.wing[w].toUpperCase());
      const signTexts = await page.evaluate(() => Object.values((window as unknown as LW).__hq.probes.signs).flatMap((group) => group.map((s) => s.text.replace(/\s+/g, " ").trim())));
      check(signTexts.filter((t) => wingNames.includes(t.toUpperCase())), "floating signs that name a wing").toEqual([]);
      // Three separate boards: their bounds (the tall columns with the board height) stand apart on the floor.
      const boards = await page.evaluate((h) => ((window as unknown as LW).__hq.layouts.L3.tall ?? []).filter((t) => Math.abs(t.h - h) < 1e-6), LABS.board.h);
      check(boards, "three board columns").toHaveLength(3);
      for (let i = 0; i < boards.length; i++) {
        for (let j = i + 1; j < boards.length; j++) {
          const [a, b] = [boards[i], boards[j]];
          const gap = Math.hypot(Math.max(0, a.minX - b.maxX, b.minX - a.maxX), Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ));
          check(gap, `gap between boards ${i} and ${j}`).toBeGreaterThanOrEqual(BOARD_GAP);
        }
      }
      if (!size.phone) {
        // Looking east, north is on the left: Product, Data and ML, AI from left to right.
        const xs = await page.evaluate((wings) => wings.map((w) => (window as unknown as LW).__hq.interact.screenOf(`L3:board:${w}`)?.x ?? null), [...ROADS]);
        check(xs.every((x) => x !== null), `board screen centers ${xs.join(", ")}`).toBe(true);
        if (xs.every((x) => x !== null)) {
          check(xs[0]!, "Product board left of the Data and ML board").toBeLessThan(xs[1]!);
          check(xs[1]!, "Data and ML board left of the AI board").toBeLessThan(xs[2]!);
        }
      }
      // The end mirrors across the spine: the wing roads (mouth, turn and ring junction) are mirror images,
      // the spine ends on the axis and so does the Return pad.
      const end = await page.evaluate(() => {
        const l3 = (window as unknown as LW).__hq.layouts.L3;
        const road = (id: string) => l3.road?.roads.find((r) => r.id === id)?.points ?? [];
        return { software: road("software"), ai: road("ai"), spine: road("data"), pad: l3.pads?.find((p) => p.id === "return:L3")?.at ?? null };
      });
      check(end.software.length, "Product road has points").toBeGreaterThan(0);
      check(end.ai.length, "AI road has points").toBeGreaterThan(0);
      check(end.ai.length, "AI road points match the Product road").toBe(end.software.length);
      end.software.forEach((p, i) => {
        const q = end.ai[i];
        check(q ? Math.hypot(p.x - q.x, p.z + q.z) : Infinity, `road point ${i} mirrors (${p.x}, ${p.z}) vs (${q?.x}, ${q?.z})`).toBeLessThan(0.5);
      });
      check(end.spine.at(-1)?.z, "spine ends on z = 0").toBeCloseTo(0, 3);
      check(end.pad, "return:L3 pad").not.toBeNull();
      check(end.pad?.z, "return:L3 pad on z = 0").toBeCloseTo(0, 3);
      await pose(page, size, "arrival");
      await context.close();
    });

    // Road entrances (18 u into each road from the hub centre), then the reactor plaza where the three roads meet.
    for (const name of [...ROADS.map((r) => `entrance-${r}`), ...ROADS.map((r) => `board-${r}`), "reactor", "reactor-approach", "reactor-top"]) {
      test(`${name}: the rover drives there along the road and the view stays within the budget`, async ({ browser }) => {
        const { context, page } = await openArrival(browser, size);
        const at = await poseTarget(page, name);
        check(at, name).not.toBeNull();
        if (at) {
          await driveTo(page, at, 240_000);
          const { rover } = await snapshot(page);
          // The autopilot ends a leg within its arrival radius, not on the exact point.
          check(Math.hypot(rover.x - at.x, rover.z - at.z), `rover at ${name}`).toBeLessThan(2);
          if (name === "reactor-top") await lookFromAbove(page);
          await pose(page, size, name);
        }
        await context.close();
      });
    }
  });
}
