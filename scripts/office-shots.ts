#!/usr/bin/env bun
/**
 * Agent Office captures for the owner's review (part 3 of the office): the spawn view (the ghost outline of the floors
 * above, kept there), the nine Rover states over two fixtures
 * (the first one also zoomed in to the near pose: the chips add the activity, compact on a phone), the summary,
 * GitHub and Rover drawers, and the semi-live and off modes, at 1440x900, 1280x720, 820x1180 (touch tablet), 390x844
 * and 844x390 (phones) on the full and lite tiers,
 * on a served export with `/api/office` answered from fixtures. SwiftShader WebGL. Never committed; the waits
 * follow e2e/office.spec.ts (state, never time).
 *
 *   bun run build && bun scripts/serve-static.ts --port 4481 --dir out &
 *   bun scripts/office-shots.ts --base http://127.0.0.1:4481 --out screenshots/office
 *
 * `--only full-1440x900,lite-390x844` limits the run to those tier and viewport combos (while iterating), and
 * `--shots spawn,approach,states-a` to those shots (the drives between them still run).
 *
 * `approach`: the rover on the wing's lead road at the Lobby plaza edge (x 3, S - 6), the view turned (a shift-wheel
 * rotate, as a visitor would) to look south into the wing. `overview` (full tier, 1440x900 only): a top-down still of
 * the whole L1 slab, the south wing included, taken with the rover at the office stop; `window.__hq` has no camera
 * control, so it pins the drawn camera (`__hq.render.camera`) over the slab after the Director's own pose, lifts the
 * fog, hides the floor groups other than L1 (the ghost slabs above would cover it) and the HTML HUD.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { asReturningVisitor, driveTo, skipFloorLines, waitForCameraSettle, waitForFrames, waitForHQ, waitForPhase, waitForRoom, waitForSceneLive } from "../e2e/hq";
import { OFFICE_API, OFFICE_API_V2, STATES_A, STATES_B, statesA, statesB } from "../e2e/office-fixtures";
import { yawLooking } from "../src/experience/camera/look";
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
    rover: { cameraYaw: number; heading: number; cameraView: string | null; cameraHeld: boolean };
    probes: { office: OfficeProbe };
    office: { load(): Promise<void>; test(): { poll(): void } | null };
  };
};

let base = "http://127.0.0.1:4481";
let out = "screenshots/office";
let only: string[] | null = null;
let shots: string[] | null = null;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--base") base = argv[++i];
  else if (argv[i] === "--out") out = argv[++i];
  else if (argv[i] === "--only") only = argv[++i].split(",");
  else if (argv[i] === "--shots") shots = argv[++i].split(",");
}
const wants = (shot: string) => !shots || shots.includes(shot);
mkdirSync(out, { recursive: true });

const SLOW = 120_000;
const probe = (page: Page) => page.evaluate(() => (window as unknown as OfficeWindow).__hq.probes.office);
const camera = (page: Page) => page.evaluate(() => (window as unknown as OfficeWindow).__hq.camera());

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
  await Promise.all([page.waitForResponse(OFFICE_API_V2), page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.test()?.poll())]);
  await waitFor(`${mode} ${states.join(",")}`, async () => {
    const o = await probe(page);
    return o.mode === mode && JSON.stringify(o.states) === JSON.stringify(states);
  });
  await page.evaluate(() => document.fonts.ready);
  await waitForFrames(page, 30);
}

/** The rover parked and the follow camera still. */
const settle = (page: Page) => waitForCameraSettle(page, { timeout: SLOW });
/** The camera holds the office view (`roverRuntime.cameraHeld`), so the chips show in full, then a few frames for them to land. */
async function officeHeld(page: Page) {
  await waitFor("the office view", () => page.evaluate(() => (window as unknown as OfficeWindow).__hq.rover.cameraView === "L1:office" && (window as unknown as OfficeWindow).__hq.rover.cameraHeld));
  await waitForFrames(page, 10);
}

/** Waits until the drawer's view shift (the camera's view offset, eased by the Director) stops moving. */
async function viewShiftSettled(page: Page) {
  const offset = () =>
    page.evaluate(() => {
      const cam = (window as unknown as { __hq: { render: { camera: { view: { offsetX: number; offsetY: number } | null } } } }).__hq.render.camera;
      return cam.view ? [cam.view.offsetX, cam.view.offsetY] : [0, 0];
    });
  let last = await offset();
  let still = 0;
  await waitFor("the drawer view shift", async () => {
    await waitForFrames(page, 6);
    const now = await offset();
    still = Math.hypot(now[0] - last[0], now[1] - last[1]) < 0.25 ? still + 1 : 0;
    last = now;
    return still >= 3;
  });
  await waitForFrames(page, 10);
}

/** Turns the follow camera to `yaw` (`yawLooking`, from the default angle) with shift-wheel rotates over the canvas centre. */
async function turnTo(page: Page, yaw: number) {
  const vp = page.viewportSize()!;
  await page.mouse.move(vp.width / 2, vp.height / 2);
  for (let i = 0; i < 4; i++) {
    const now = await page.evaluate(() => (window as unknown as OfficeWindow).__hq.rover.cameraYaw);
    const left = Math.atan2(Math.sin(yaw - now), Math.cos(yaw - now));
    if (Math.abs(left) < 0.01) break;
    // useInputSources: a horizontal wheel turns the view by -deltaX * 0.004 rad.
    await page.mouse.wheel(-left / 0.004, 0);
    await waitForFrames(page, 4);
  }
  await settle(page);
}

/**
 * Pins the drawn camera straight over the L1 slab (the Lobby, the hall and the south wing), north up: replaces the
 * camera's `position.copy` and `lookAt` (the Director's per-frame pose) and fixes `fov`, `far` and the fog range.
 */
async function pinOverview(page: Page, rect: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  await page.evaluate((r) => {
    type V = { x: number; y: number; z: number; set(x: number, y: number, z: number): V; copy(v: V): V };
    type Cam = { position: V; up: V; fov: number; far: number; aspect: number; lookAt(x: number, y: number, z: number): void; updateProjectionMatrix(): void };
    type Obj = { name: string; visible: boolean; children: Obj[]; fog?: { near: number; far: number } | null };
    const hq = (window as unknown as { __hq: { render: { camera: Cam; scene: Obj } } }).__hq;
    const cam = hq.render.camera;
    const scene = hq.render.scene;
    const fov = 30;
    const margin = 1.1;
    const halfW = ((r.maxX - r.minX) / 2) * margin;
    const halfD = ((r.maxZ - r.minZ) / 2) * margin;
    const t = Math.tan(((fov / 2) * Math.PI) / 180);
    const height = Math.max(halfD / t, halfW / (t * cam.aspect));
    const cx = (r.minX + r.maxX) / 2;
    const cz = (r.minZ + r.maxZ) / 2;
    const look = cam.lookAt.bind(cam);
    cam.up.set(0, 0, -1);
    cam.position.set(cx, height, cz);
    look(cx, 0, cz);
    cam.position.copy = function () {
      return this;
    };
    cam.lookAt = () => {};
    Object.defineProperty(cam, "fov", { get: () => fov, set: () => {}, configurable: true });
    Object.defineProperty(cam, "far", { get: () => height + 200, set: () => {}, configurable: true });
    cam.updateProjectionMatrix();
    if (scene.fog) {
      Object.defineProperty(scene.fog, "near", { get: () => height + 100, set: () => {}, configurable: true });
      Object.defineProperty(scene.fog, "far", { get: () => height + 400, set: () => {}, configurable: true });
    }
    const hide = (o: Obj) => {
      if (o.name.startsWith("floor-") && o.name !== "floor-L1") o.visible = false;
      else o.children.forEach(hide);
    };
    hide(scene);
    // The HUD and the HTML labels would cover the plan: only the canvas shows.
    const style = document.createElement("style");
    style.textContent = "body * { visibility: hidden !important; } canvas { visibility: visible !important; }";
    document.head.append(style);
  }, rect);
  await page.evaluate(() => document.fonts.ready);
  await waitForFrames(page, 30);
}

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
      await page.route(OFFICE_API, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reply.body) }));
      await page.goto(`${base}/en?tier=${tier}`);
      await waitForHQ(page);
      await waitForPhase(page, "explore", SLOW);
      await waitForSceneLive(page, SLOW);
      const name = (shot: string) => join(out, `${shot}-${tier}-${vp.width}x${vp.height}.png`);
      // The spawn view: the floors above keep their ghost outline here (it hides only in the office wing).
      await settle(page);
      if (wants("spawn")) await page.screenshot({ path: name("spawn") });
      await page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.load());
      await waitFor("the office chunk", async () => (await probe(page)).loaded);
      const { lead } = LOBBY.officeWing;
      if (wants("approach")) {
        // On the lead road at the Lobby plaza edge, come in heading south (+z), the view turned to look into the wing.
        await driveTo(page, { x: lead.x, z: lead.from - 4 }, SLOW);
        await driveTo(page, { x: lead.x, z: LOBBY.bounds.maxZ - 6 }, SLOW);
        await settle(page);
        await turnTo(page, yawLooking({ x: 0, z: 1 }));
        await page.evaluate(() => document.fonts.ready);
        await waitForFrames(page, 20);
        await page.screenshot({ path: name("approach") });
        await page.keyboard.press("0");
        await settle(page);
      }
      await driveTo(page, LOBBY.officeWing.stop, SLOW);
      await settle(page);
      await waitFor("office polling", async () => (await probe(page)).polling);
      const home = await camera(page);

      await show(page, reply, statesA(Date.now()), "live", STATES_A);
      if (wants("states-a")) {
        await officeHeld(page);
        await page.screenshot({ path: name("states-a") });
      }

      // As tests/unit/office-chip-placement.test.ts, from the stop: the near pose of the camera class (two zoom key steps on
      // a portrait screen, one on a landscape one), where a desktop's chips add the activity. A phone keeps its chips
      // compact, and a row narrower than five full chips (960 x 640, a portrait tablet) one line, at any distance.
      if (wants("states-a-near")) {
        for (let i = 0; i < (vp.height > vp.width ? 2 : 1); i++) await page.keyboard.press("=");
        await settle(page);
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
      }

      for (const [room, panel, shot] of [
        ["L1:office", "summary", "drawer-summary"],
        ["L1:office-github", "github", "drawer-github"],
        ["L1:office-desk-1", "desk", "drawer-desk"],
      ] as const) {
        if (!wants(shot)) continue;
        await page.evaluate((r) => (window as unknown as OfficeWindow).__hq.store.getState().openRoom(r), room);
        await waitForRoom(page, room);
        await page.getByTestId("office-body").and(page.locator(`[data-panel="${panel}"]`)).waitFor({ timeout: SLOW });
        await page.evaluate(() => document.fonts.ready);
        await viewShiftSettled(page);
        await page.screenshot({ path: name(shot) });
        await page.evaluate(() => (window as unknown as OfficeWindow).__hq.store.getState().closeRoom());
        await waitForPhase(page, "explore", SLOW);
        await settle(page);
      }

      await show(page, reply, statesB(Date.now()), "live", STATES_B);
      if (wants("states-b")) {
        await officeHeld(page);
        await page.screenshot({ path: name("states-b") });
      }
      if (wants("semi-live")) {
        await show(page, reply, OFFICE_FIXTURES.semiLive, "semi-live", asleep);
        await page.screenshot({ path: name("semi-live") });
      }
      if (wants("off")) {
        await show(page, reply, OFFICE_FIXTURES.off, "off", asleep);
        await page.screenshot({ path: name("off") });
      }
      if (wants("overview") && tier === "full" && vp.width === 1440 && vp.height === 900) {
        await show(page, reply, statesA(Date.now()), "live", STATES_A);
        const { bounds, officeWing } = LOBBY;
        await pinOverview(page, { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: officeWing.rect.maxZ });
        await page.screenshot({ path: join(out, "overview-l1-full-1440x900.png") });
      }
      await context.close();
      console.log(`office shots: ${tier} ${vp.width}x${vp.height} done`);
    }
  }
} finally {
  await browser.close();
}
