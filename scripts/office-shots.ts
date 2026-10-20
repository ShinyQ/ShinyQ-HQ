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
 *
 * The living crew (v2 snapshots, `e2e/office-fixtures.ts`; the beacon's watch reads the v1 path, answered `asV1`):
 * `crew-a` and `crew-b` at the office stop (far chips) once each Rover holds its state's pose and the helper drones
 * are drawn; `crew-a-near` (desktop sizes only) one zoom key step in, the near chips with "· 3 helpers" (a head that
 * does not fit drops its activity, then the "+2" pill); `beacon-spawn` at the primed spawn with one desk asking (`CREW_A`), the beacon column and the minimap cue lit;
 * `beacon-stop` at the stop with that desk asking (the column hidden, faint bands at the asking Rover); `asleep` every desk asleep (docked Rovers,
 * dimmed desks, charge pads).
 *
 * `--video <dir>` records one 1440x900 full-tier take (Playwright `recordVideo`) into `<dir>/crew-states.webm` (and
 * `crew-states.mp4` when `ffmpeg` is on the PATH, both trimmed to start at the spawn): the beacon from the Lobby,
 * the drive to the office stop, then `CREW_A`, `CREW_B` and every desk asleep, each held about 6 s of recording once
 * the crew probe shows its poses, and `CREW_A` again one zoom step in (near chips and drones). Alone it records only
 * the video; with `--only` or `--shots` the shots run first.
 *
 *   bun scripts/office-shots.ts --base http://127.0.0.1:4481 --video screenshots/office
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "@playwright/test";
import { asReturningVisitor, chooseMotion, driveTo, skipFloorLines, waitForCameraSettle, waitForFrames, waitForHQ, waitForPhase, waitForRoom, waitForSceneLive } from "../e2e/hq";
import {
  asV1,
  CREW_A_STATES,
  CREW_B_STATES,
  CREW_SLOT,
  crewA,
  crewB,
  OFFICE_API,
  OFFICE_API_V2,
  officeDesk,
  officeSnapshot,
  STATES_A,
  STATES_B,
  statesA,
  statesB,
} from "../e2e/office-fixtures";
import type { OfficeSnapshotV2 } from "../src/lib/office/protocol";
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

type CrewProbe = { state: string; yaw: number; flag: number; z: number };
type OfficeProbe = { loaded: boolean; states: string[]; mode: string; polling: boolean; beacon: boolean; crew: CrewProbe[]; drones: number[] };
type OfficeWindow = Window & {
  __hq: {
    store: { getState: () => { phase: string; openRoom: (r: string) => void; closeRoom: () => void } };
    camera: () => [number, number, number];
    rover: { cameraYaw: number; heading: number; cameraView: string | null; cameraHeld: boolean };
    probes: { office: OfficeProbe };
    office: { load(): Promise<void>; test(): { poll(): void } | null; watchNow(): Promise<void> };
  };
};

let base = "http://127.0.0.1:4481";
let out = "screenshots/office";
let only: string[] | null = null;
let shots: string[] | null = null;
let video: string | null = null;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--base") base = argv[++i];
  else if (argv[i] === "--out") out = argv[++i];
  else if (argv[i] === "--only") only = argv[++i].split(",");
  else if (argv[i] === "--shots") shots = argv[++i].split(",");
  else if (argv[i] === "--video") video = argv[++i];
}
const wants = (shot: string) => !shots || shots.includes(shot);
const runShots = !video || only !== null || shots !== null;
if (runShots) mkdirSync(out, { recursive: true });

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
async function show(page: Page, reply: { body: unknown }, body: unknown, mode: string, states: readonly string[], frames = 30) {
  reply.body = body;
  await Promise.all([page.waitForResponse(OFFICE_API_V2), page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.test()?.poll())]);
  await waitFor(`${mode} ${states.join(",")}`, async () => {
    const o = await probe(page);
    return o.mode === mode && JSON.stringify(o.states) === JSON.stringify(states);
  });
  await page.evaluate(() => document.fonts.ready);
  await waitForFrames(page, frames);
}

/** The beacon from anywhere on L1, the minimap cue drawn with it. */
async function beaconLit(page: Page) {
  await waitFor("the beacon", async () => (await probe(page)).beacon);
  await page.locator('[data-map="office-cue"]').first().waitFor({ state: "visible", timeout: SLOW });
}

/** One tick of the beacon's running watch now (`__hq.office.watchNow()`), bounded. */
async function watchNow(page: Page) {
  const outcome = await page.evaluate(() =>
    Promise.race([
      (window as unknown as OfficeWindow).__hq.office.watchNow().then(() => "ticked"),
      new Promise<string>((resolve) => setTimeout(() => resolve("none"), 60_000)),
    ]),
  );
  if (outcome !== "ticked") throw new Error("office shots: the office watch never ran a tick");
}

/** Every desk asleep in a live snapshot (the agents on their shift, resting): docked Rovers, dimmed desks, charge pads. */
function allAsleep(now: number): OfficeSnapshotV2 {
  const agents = ["copilot", "claude", "codex", "copilot", "claude"] as const;
  return { ...officeSnapshot(agents.map((agent, slot) => officeDesk(slot, agent, "asleep", "resting", now)), now), v: 2 };
}
const ASLEEP = ["asleep", "asleep", "asleep", "asleep", "asleep"] as const;

/** Each lineup's settled pose, read off the crew probe (refreshed every 0.5 s of scene clock) and the drawn drones. */
const CREWS = {
  a: { body: crewA, states: CREW_A_STATES, drones: [3, 4, 0, 0, 0], posed: (c: CrewProbe[]) => c[CREW_SLOT.input].flag === 1 && Math.abs(c[CREW_SLOT.ci].yaw) > 0.2 },
  b: { body: crewB, states: CREW_B_STATES, drones: [0, 0, 4, 3, 0], posed: (c: CrewProbe[]) => c.every((x) => x.flag === 0) && c.map((x) => x.z < 0).join() === "false,true,false,false,true" },
  asleep: { body: allAsleep, states: ASLEEP, drones: [0, 0, 0, 0, 0], posed: (c: CrewProbe[]) => c.every((x) => x.flag === 0 && x.z < 0) },
} as const;

/**
 * Feeds a crew lineup (fresh times) and waits until the office shows it and every Rover holds its state's pose, then
 * `frames` more (the video passes 0: on SwiftShader at 1440 x 900 every frame waited lengthens the take).
 */
async function showCrew(page: Page, reply: { body: unknown }, crew: keyof typeof CREWS, frames = 20) {
  const { body, states, drones, posed } = CREWS[crew];
  await show(page, reply, body(Date.now()), "live", states, frames);
  await waitFor(`the ${crew} crew's poses`, async () => {
    const o = await probe(page);
    return o.crew.map((c) => c.state).join() === states.join() && o.drones.join() === drones.join() && posed(o.crew);
  });
  if (frames) await waitForFrames(page, frames);
}

/** Answers `/api/office` from `reply`: the poller's `?v=2` as is, the beacon watch's v1 path `asV1`. */
async function serveOffice(page: Page, reply: { body: unknown }) {
  await page.route(OFFICE_API, (route) => {
    const body = OFFICE_API_V2.test(route.request().url()) ? reply.body : asV1(reply.body);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
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
  if (runShots) await captureShots(browser);
  if (video) await recordStates(browser, video);
} finally {
  await browser.close();
}

async function captureShots(browser: Browser) {
  for (const vp of VIEWPORTS) {
    for (const tier of TIERS) {
      if (only && !only.includes(`${tier}-${vp.width}x${vp.height}`)) continue;
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.touch, isMobile: vp.mobile });
      const page = await context.newPage();
      await asReturningVisitor(page);
      await skipFloorLines(page);
      const reply: { body: unknown } = { body: statesA(Date.now()) };
      await serveOffice(page, reply);
      await page.goto(`${base}/en?tier=${tier}`);
      await waitForHQ(page);
      await waitForPhase(page, "explore", SLOW);
      await waitForSceneLive(page, SLOW);
      const name = (shot: string) => join(out, `${shot}-${tier}-${vp.width}x${vp.height}.png`);
      // The spawn view: the floors above keep their ghost outline here (it hides only in the office wing).
      await settle(page);
      if (wants("spawn")) await page.screenshot({ path: name("spawn") });
      if (wants("beacon-spawn")) {
        // A desk asks: the watch's next tick lights the beacon over the wing (its chunk loads on the first ask) and the
        // minimap cue; then nobody asks again, so the shots after it stay as they were.
        reply.body = crewA(Date.now());
        await watchNow(page);
        await beaconLit(page);
        await page.evaluate(() => document.fonts.ready);
        await waitForFrames(page, 30);
        await page.screenshot({ path: name("beacon-spawn") });
        reply.body = statesA(Date.now());
        await watchNow(page);
        await waitFor("the beacon off", async () => !(await probe(page)).beacon);
      }
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
      if (wants("crew-a") || wants("beacon-stop") || wants("crew-a-near")) {
        await showCrew(page, reply, "a");
        await officeHeld(page);
        if (wants("crew-a")) await page.screenshot({ path: name("crew-a") });
        if (wants("beacon-stop")) {
          // The asking desk lights the beacon; at the stop only faint bands stay (the flag carries the signal here).
          await beaconLit(page);
          await page.screenshot({ path: name("beacon-stop") });
        }
        // Desktop sizes only (a phone keeps its chips compact): one zoom key step brings the chips near, the head with
        // the whole name and the helpers total (and the "+2" pill for the drones not drawn where it fits).
        if (wants("crew-a-near") && !vp.touch) {
          await page.keyboard.press("=");
          await settle(page);
          const six = page.locator(`[data-testid="office-chip"][data-slot="${CREW_SLOT.six}"]`);
          await six.and(page.locator('[data-far="false"]')).waitFor({ timeout: SLOW });
          await six.getByTestId("office-chip-head").filter({ hasText: "6 helpers" }).waitFor({ timeout: SLOW });
          await waitForFrames(page, 20);
          await page.screenshot({ path: name("crew-a-near") });
          // A hand zoom suppresses the office view zone until the rover leaves it: reset, step out and come back.
          await page.keyboard.press("0");
          const { stop } = LOBBY.officeWing;
          await driveTo(page, { x: stop.x, z: stop.z - 2 * OFFICE.view.half.z - 2 }, SLOW);
          await driveTo(page, stop, SLOW);
          await settle(page);
        }
      }
      if (wants("crew-b")) {
        await showCrew(page, reply, "b");
        await officeHeld(page);
        await page.screenshot({ path: name("crew-b") });
      }
      if (wants("asleep")) {
        await showCrew(page, reply, "asleep");
        await officeHeld(page);
        await page.screenshot({ path: name("asleep") });
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
}

/**
 * The states video: one 1440x900 full-tier take. Each hold is recording length (the take shows the state for that long),
 * after the waits on state; the take is trimmed to start at the lit spawn view.
 */
async function recordStates(browser: Browser, dir: string) {
  mkdirSync(dir, { recursive: true });
  const raw = join(dir, "crew-states.raw");
  const size = { width: 1440, height: 900 };
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, recordVideo: { dir: raw, size } });
  const started = Date.now();
  const page = await context.newPage();
  const hold = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await asReturningVisitor(page);
  await skipFloorLines(page);
  await chooseMotion(page, "full");
  const reply: { body: unknown } = { body: crewA(Date.now()) };
  await serveOffice(page, reply);
  await page.goto(`${base}/en?tier=full`);
  await waitForHQ(page);
  await waitForPhase(page, "explore", SLOW);
  await waitForSceneLive(page, SLOW);
  await settle(page);
  // From the Lobby: a desk asks, the beacon stands over the wing and the minimap shows the cue.
  await beaconLit(page);
  await page.evaluate(() => document.fonts.ready);
  await waitForFrames(page, 30);
  const from = (Date.now() - started) / 1000;
  await hold(4000);
  await page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.load());
  await waitFor("the office chunk", async () => (await probe(page)).loaded);
  const { lead, stop } = LOBBY.officeWing;
  await driveTo(page, { x: lead.x, z: lead.from - 4 }, SLOW);
  await driveTo(page, stop, SLOW);
  await settle(page);
  await waitFor("office polling", async () => (await probe(page)).polling);
  await officeHeld(page);
  for (const crew of ["a", "b", "asleep", "a"] as const) {
    await showCrew(page, reply, crew, 0);
    await hold(6000);
  }
  // CREW_A one zoom step in: the near chips ("· 3 helpers") and the drones orbiting their Rovers.
  await page.keyboard.press("=");
  await settle(page);
  await page.locator(`[data-testid="office-chip"][data-slot="${CREW_SLOT.six}"]`).getByTestId("office-chip-head").filter({ hasText: "6 helpers" }).waitFor({ timeout: SLOW });
  await hold(6000);
  const recording = page.video()!;
  await context.close();
  const webm = join(dir, "crew-states.webm");
  const mp4 = join(dir, "crew-states.mp4");
  const source = await recording.path();
  if (spawnSync("which", ["ffmpeg"]).status === 0) {
    const start = Math.max(0, from - 0.5).toFixed(2);
    const ffmpeg = (args: string[]) => {
      const run = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", start, "-i", source, ...args], { stdio: "inherit" });
      if (run.status !== 0) throw new Error(`office shots: ffmpeg failed (${args.at(-1)})`);
    };
    ffmpeg(["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", "-row-mt", "1", "-an", webm]);
    ffmpeg(["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", "-an", mp4]);
  } else {
    renameSync(source, webm);
    console.warn("office shots: no ffmpeg, the webm is untrimmed and there is no mp4");
  }
  rmSync(raw, { recursive: true, force: true });
  console.log(`office shots: video ${webm}`);
}
