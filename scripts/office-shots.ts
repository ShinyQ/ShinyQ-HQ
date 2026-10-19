#!/usr/bin/env bun
/**
 * Agent Office captures for the owner's review (part 3 of the office): the spawn view (the ghost outline of the floors
 * above, kept there), the nine Rover states over two fixtures
 * (the first one also zoomed in to the near pose: the chips show their task lines, compact on a phone), the summary,
 * GitHub and Rover drawers, and the semi-live and off modes, at 1440x900, 1280x720, 820x1180 (touch tablet), 390x844
 * and 844x390 (phones) on the full and lite tiers,
 * on a served export with `/api/office` answered from fixtures. SwiftShader WebGL. Never committed; the waits
 * follow e2e/office.spec.ts (state, never time).
 *
 *   bun run build && bun scripts/serve-static.ts --port 4481 --dir out &
 *   bun scripts/office-shots.ts --base http://127.0.0.1:4481 --out screenshots/office
 *
 * `--only full-1440x900,lite-390x844` limits the run to those tier and viewport combos (while iterating).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { asReturningVisitor, driveTo, skipFloorLines, waitForCameraSettle, waitForFrames, waitForHQ, waitForPhase, waitForRoom, waitForSceneLive } from "../e2e/hq";
import { STATES_A, STATES_B, statesA, statesB } from "../e2e/office-fixtures";
import { LOBBY } from "../src/experience/config";
import { OFFICE } from "../src/experience/floors/lobby/officeLayout";
import { OFFICE_FIXTURES } from "../src/lib/office/fixtures";

const VIEWPORTS = [
  { width: 1440, height: 900, touch: false, mobile: false },
  { width: 1280, height: 720, touch: false, mobile: false },
  { width: 820, height: 1180, touch: true, mobile: false },
  { width: 390, height: 844, touch: true, mobile: true },
  { width: 844, height: 390, touch: true, mobile: true },
] as const;
const TIERS = ["full", "lite"] as const;

type OfficeProbe = { loaded: boolean; states: string[]; mode: string; polling: boolean };
type OfficeWindow = Window & {
  __hq: {
    store: { getState: () => { phase: string; openRoom: (r: string) => void; closeRoom: () => void } };
    camera: () => [number, number, number];
    probes: { office: OfficeProbe };
    office: { load(): Promise<void>; test(): { poll(): void } | null };
  };
};

let base = "http://127.0.0.1:4481";
let out = "screenshots/office";
let only: string[] | null = null;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--base") base = argv[++i];
  else if (argv[i] === "--out") out = argv[++i];
  else if (argv[i] === "--only") only = argv[++i].split(",");
}
mkdirSync(out, { recursive: true });

const SLOW = 120_000;
const probe = (page: Page) => page.evaluate(() => (window as unknown as OfficeWindow).__hq.probes.office);
const camera = (page: Page) => page.evaluate(() => (window as unknown as OfficeWindow).__hq.camera());
const chip = (page: Page, slot: number) => page.locator(`[data-testid="office-chip"][data-slot="${slot}"]`);

async function waitFor(what: string, check: () => Promise<boolean>, timeout = SLOW) {
  const end = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > end) throw new Error(`office shots: timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** Fetches now (the poller restarts), waits for that response and until the office shows `mode` and `states`. */
async function show(page: Page, reply: { body: unknown }, body: unknown, mode: string, states: readonly string[]) {
  reply.body = body;
  await Promise.all([page.waitForResponse("**/api/office"), page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.test()?.poll())]);
  await waitFor(`${mode} ${states.join(",")}`, async () => {
    const o = await probe(page);
    return o.mode === mode && JSON.stringify(o.states) === JSON.stringify(states);
  });
  await page.evaluate(() => document.fonts.ready);
  await waitForFrames(page, 30);
}

/** The rover parked and the follow camera still. */
const settle = (page: Page) => waitForCameraSettle(page, { timeout: SLOW });

const asleep = ["asleep", "asleep", "asleep", "asleep", "asleep"];
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  for (const vp of VIEWPORTS) {
    for (const tier of TIERS) {
      if (only && !only.includes(`${tier}-${vp.width}x${vp.height}`)) continue;
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.touch, isMobile: vp.mobile });
      const page = await context.newPage();
      await asReturningVisitor(page);
      await skipFloorLines(page);
      const reply: { body: unknown } = { body: statesA(Date.now()) };
      await page.route("**/api/office", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reply.body) }));
      await page.goto(`${base}/en?tier=${tier}`);
      await waitForHQ(page);
      await waitForPhase(page, "explore", SLOW);
      await waitForSceneLive(page, SLOW);
      const name = (shot: string) => join(out, `${shot}-${tier}-${vp.width}x${vp.height}.png`);
      // The spawn view: the floors above keep their ghost outline here (it hides only in the office wing).
      await settle(page);
      await page.screenshot({ path: name("spawn") });
      await page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.load());
      await waitFor("the office chunk", async () => (await probe(page)).loaded);
      await driveTo(page, LOBBY.officeWing.stop, SLOW);
      await settle(page);
      await waitFor("office polling", async () => (await probe(page)).polling);
      const home = await camera(page);

      await show(page, reply, statesA(Date.now()), "live", STATES_A);
      await page.screenshot({ path: name("states-a") });

      // As tests/unit/office-chip-placement.test.ts, from the stop: zoom key steps until the middle three leave their far
      // band and show the task line. A phone keeps its chips compact at any distance: the near pose of its camera class
      // (two steps on a portrait screen, one on a landscape one) instead.
      const near = async () => (await Promise.all([1, 2, 3].map((slot) => chip(page, slot).getAttribute("data-far")))).every((far) => far === "false");
      if ((await chip(page, 2).getAttribute("data-compact")) === "true") {
        for (let i = 0; i < (vp.height > vp.width ? 2 : 1); i++) await page.keyboard.press("=");
        await settle(page);
      } else {
        for (let i = 0; i < 8 && !(await near()); i++) {
          await page.keyboard.press("=");
          await settle(page);
        }
        if (!(await near())) throw new Error("office shots: the chips never came near");
      }
      await waitForFrames(page, 20);
      await page.screenshot({ path: name("states-a-near") });
      // A hand zoom suppresses the office view zone until the rover leaves it: reset, step out and come back.
      await page.keyboard.press("0");
      const { stop } = LOBBY.officeWing;
      await driveTo(page, { x: stop.x, z: stop.z - 2 * OFFICE.view.half.z - 2 }, SLOW);
      await driveTo(page, stop, SLOW);
      await settle(page);
      const back = await camera(page);
      if (Math.hypot(back[0] - home[0], back[1] - home[1], back[2] - home[2]) > 0.5) console.warn(`office shots: the office view did not come back (${home} to ${back})`);

      for (const [room, panel, shot] of [
        ["L1:office", "summary", "drawer-summary"],
        ["L1:office-github", "github", "drawer-github"],
        ["L1:office-desk-1", "desk", "drawer-desk"],
      ] as const) {
        await page.evaluate((r) => (window as unknown as OfficeWindow).__hq.store.getState().openRoom(r), room);
        await waitForRoom(page, room);
        await page.getByTestId("office-body").and(page.locator(`[data-panel="${panel}"]`)).waitFor({ timeout: SLOW });
        await page.evaluate(() => document.fonts.ready);
        await waitForFrames(page, 20);
        await page.screenshot({ path: name(shot) });
        await page.evaluate(() => (window as unknown as OfficeWindow).__hq.store.getState().closeRoom());
        await waitForPhase(page, "explore", SLOW);
        await settle(page);
      }

      await show(page, reply, statesB(Date.now()), "live", STATES_B);
      await page.screenshot({ path: name("states-b") });
      await show(page, reply, OFFICE_FIXTURES.semiLive, "semi-live", asleep);
      await page.screenshot({ path: name("semi-live") });
      await show(page, reply, OFFICE_FIXTURES.off, "off", asleep);
      await page.screenshot({ path: name("off") });
      await context.close();
      console.log(`office shots: ${tier} ${vp.width}x${vp.height} done`);
    }
  }
} finally {
  await browser.close();
}
