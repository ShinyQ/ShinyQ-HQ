import { expect, test, type Page } from "@playwright/test";
import content from "../content/site-content.json";
import en from "../messages/en.json";
import id from "../messages/id.json";
import { yawLooking } from "../src/experience/camera/look";
import { LOBBY } from "../src/experience/config";
import { officeSlots } from "../src/experience/floors/lobby/officeLayout";
import { OFFICE_FIXTURES } from "../src/lib/office/fixtures";
import { FLOOR_SCENE_CAPS } from "./budgets";
import {
  asReturningVisitor,
  chooseMotion,
  clickablePoint,
  collectErrors,
  driveTo,
  enterHQ,
  expectRenderBudget,
  turnCameraTo,
  waitForCameraSettle,
  waitForFrames,
  waitForHQ,
  waitForPhase,
  waitForRoom,
  waitForSceneLive,
} from "./hq";
import { asV1, backRowAsker, CREW_A, CREW_A_STATES, CREW_B, CREW_B_STATES, CREW_SLOT, OFFICE_API, OFFICE_API_V3, STATES_A, STATES_B, statesA, statesB } from "./office-fixtures";

/**
 * L1 Agent Office (docs/superpowers/plans/2026-10-19-agent-office-3d.md): the lazy chunk at idle on every L1 visit
 * (the always-live office, design 2026-10-20 section 5.9), its far level of detail from the lane ring, ten
 * Rovers on two console rows with their states and the front row's chips, the partial atlas uploads on a real GL context, the Rover, summary and
 * GitHub drawers, the Rover menu mission, the semi-live, off, disabled and offline modes, reduced motion,
 * Indonesian and the L1 budget at the office; the living crew's states, the Needs Kurniadi beacon and minimap cue
 * (the lazy watch's v3 fetch from the spawn, a back-row asker included) and the helper drones. `/api/office` is answered from fixtures (Playwright route); waits
 * are on state, never on time.
 */
test.describe.configure({ timeout: 180_000 });

type CrewProbe = { state: string; yaw: number; flag: number; z: number };
type OfficeProbe = {
  loaded: boolean;
  desks: number;
  states: string[];
  mode: string;
  wallFrames: number;
  chips: number;
  bob: number;
  inView: boolean;
  far: boolean;
  steps: number;
  polling: boolean;
  beacon: boolean;
  crew: CrewProbe[];
  drones: number[];
};
type OfficeHooks = { feed(): { status: string; fetchedAt: number }; poll(): void; advance(ms: number): void; settled(): number; reasons(): string[] };
type OfficeWindow = Window & {
  __hq: { probes: { office: OfficeProbe }; office: { load(): Promise<void>; state(): string; asks(): number; test(): OfficeHooks | null; watchNow(): Promise<void> } };
};

const probe = (page: Page) => page.evaluate(() => (window as unknown as OfficeWindow).__hq.probes.office);
const chunkState = (page: Page) => page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.state());
/** The trigger's asks after the first frame went idle and the chunk state, read in one go (one frame's view). */
const trigger = (page: Page) =>
  page.evaluate(() => {
    const office = (window as unknown as OfficeWindow).__hq.office;
    return { asks: office.asks(), state: office.state() };
  });
const settled = (page: Page) => page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.test()?.settled() ?? 0);
const feed = (page: Page) => page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.test()?.feed() ?? null);
const chip = (page: Page, slot: number) => page.locator(`[data-testid="office-chip"][data-slot="${slot}"]`);
/** The zone view the camera shows and whether it holds it (`roverRuntime.cameraView`, `cameraHeld`). */
const cameraView = (page: Page) =>
  page.evaluate(() => {
    const rover = (window as unknown as { __hq: { rover: { cameraView: string | null; cameraHeld: boolean } } }).__hq.rover;
    return { view: rover.cameraView, held: rover.cameraHeld };
  });
/** The shown chips' boxes never overlap one another. */
async function expectChipsApart(page: Page) {
  const boxes = await page.locator('[data-testid="office-chip"]').evaluateAll((els) =>
    els.filter((el) => (el as HTMLElement).style.visibility === "visible").map((el) => el.getBoundingClientRect().toJSON() as { left: number; right: number; top: number; bottom: number }),
  );
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]];
      expect(a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5, `chips ${i} and ${j} overlap`).toBe(false);
    }
}
/**
 * The fewest chips shown (`__hq.probes.office.chips`) over the next `frames` animation frames, sampled while `act` runs:
 * a chip that blinks out for a frame shows up here.
 */
async function fewestChipsWhile(page: Page, frames: number, act: () => Promise<void>) {
  await page.evaluate((frames) => {
    const w = window as unknown as OfficeWindow & { __fewestChips?: number; __fewestDone?: boolean };
    w.__fewestChips = Infinity;
    w.__fewestDone = false;
    let seen = 0;
    const tick = () => {
      w.__fewestChips = Math.min(w.__fewestChips!, w.__hq.probes.office.chips);
      if (++seen < frames) requestAnimationFrame(tick);
      else w.__fewestDone = true;
    };
    requestAnimationFrame(tick);
  }, frames);
  await act();
  await page.waitForFunction(() => (window as unknown as { __fewestDone?: boolean }).__fewestDone === true, undefined, { timeout: 60_000 });
  return page.evaluate(() => (window as unknown as { __fewestChips: number }).__fewestChips);
}
type SceneNode = { name: string; type: string; visible: boolean; children: SceneNode[] };
/**
 * What the office view looks out past: the wing sign (shown plates, `__hq.probes.signs`), the tower frame and the ghost
 * outline of every floor above (each a line drawn only while `visible`).
 */
const lookOut = (page: Page) =>
  page.evaluate(() => {
    const hq = (window as unknown as { __hq: { probes: { signs: Record<string, unknown[]> }; render: { scene: SceneNode & { getObjectByName(n: string): SceneNode | undefined } } } }).__hq;
    const scene = hq.render.scene;
    const lines = (g: SceneNode | undefined) => (g?.children ?? []).filter((c) => c.type === "LineSegments");
    const outline = (id: string) => lines(scene.getObjectByName(`floor-${id}`)?.children[0]).some((l) => l.visible);
    return {
      sign: (hq.probes.signs["office-wing-sign"] ?? []).length,
      frame: lines(scene.getObjectByName("tower")).some((l) => l.visible),
      outlines: ["L2", "L3", "L4", "RF"].filter(outline),
    };
  });
/** The Lobby lane ring's south point: the hologram's centre plus `LOBBY.laneRadius` toward the office wing. */
const RING_SOUTH = { x: LOBBY.hologram.x, z: LOBBY.hologram.z + LOBBY.laneRadius };
/** The rover's position (the store's, refreshed every frame). */
const roverAt = (page: Page) => page.evaluate(() => (window as unknown as { __hq: { store: { getState: () => { rover: { x: number; z: number } } } } }).__hq.store.getState().rover);
/** The scene poller's reasons (`officeLive.reasons()`: "near", "far", "drawer"). */
const reasons = (page: Page) => page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.test()?.reasons() ?? []);

/**
 * Answers `/api/office` (`?v=3` for the watch and the poller; a v2 body reads as v3, as after a rollback) from a mutable
 * reply, so a test can switch fixtures or fail the endpoint mid-run. A v2 body answers the v1 path (no client asks it)
 * as v1 (`asV1`); `requests` lists the asked URLs' paths.
 */
async function serveOffice(page: Page) {
  const reply: { status: number; body: unknown } = { status: 200, body: OFFICE_FIXTURES.disabled };
  const requests: string[] = [];
  await page.route(OFFICE_API, (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    const body = OFFICE_API_V3.test(url.href) ? reply.body : asV1(reply.body);
    return route.fulfill(reply.status === 200 ? { status: 200, contentType: "application/json", body: JSON.stringify(body) } : { status: reply.status, body: "" });
  });
  return {
    set(body: unknown, status = 200) {
      reply.body = body;
      reply.status = status;
    },
    requests: () => [...requests],
  };
}

/**
 * One tick of the beacon's running watch now (`__hq.office.watchNow()`, which waits for a watch to start), bounded: a
 * watch that never runs fails here with a clear message instead of at the test timeout.
 */
async function watchNow(page: Page) {
  const outcome = await page.evaluate(() =>
    Promise.race([
      (window as unknown as OfficeWindow).__hq.office.watchNow().then(() => "ticked"),
      new Promise<string>((resolve) => setTimeout(() => resolve("no running watch"), 15_000)),
    ]),
  );
  expect(outcome, "__hq.office.watchNow(): the office watch never ran a tick within 15 s").toBe("ticked");
}

/**
 * `PARTS_PER_ROVER` and `DRONE_PART` of `officeRig.ts` (importing it would load three in the test runner); a change
 * there shows up as wrong drawn counts below.
 */
const RIG = { per: 10, first: 6 } as const;

/** Seats over both console rows: the scene draws ten Rovers, the back row (slots 5 to 9) off duty without a session. */
const SEATS = 10;
/** A five-desk lineup padded to the scene's ten Rovers with `rest` (the back row's off-duty value). */
const ten = <T,>(front: readonly T[], rest: T): T[] => [...front, ...Array.from({ length: SEATS - front.length }, () => rest)];
/** Five desks' states as the ten Rovers' states: the back row off duty, asleep. */
const tenStates = (front: readonly string[]) => ten(front, "asleep");

/** The crew probe's states (`__hq.probes.office.crew`, refreshed every 0.5 s of scene clock while the scene is mounted). */
const crewStates = async (page: Page) => (await probe(page)).crew.map((c) => c.state);

/**
 * Each slot's helper drone bodies in the `office-rover-parts` instances (parts `RIG.first` on of its `RIG.per`):
 * how many are drawn (a non-zero scale) and where (rounded to 1e-4 u), read from the instance matrices the GPU draws.
 */
const droneParts = (page: Page) =>
  page.evaluate(
    ({ per, first, seats }) => {
      type Parts = { instanceMatrix: { array: ArrayLike<number> } };
      const mesh = (window as unknown as { __hq: { render: { scene: { getObjectByName(n: string): Parts | undefined } } } }).__hq.render.scene.getObjectByName("office-rover-parts")!;
      const a = mesh.instanceMatrix.array;
      const r = (x: number) => Math.round(x * 1e4) / 1e4;
      return Array.from({ length: seats }, (_, slot) => {
        let drawn = 0;
        const at: number[] = [];
        for (let i = 0; i < 4; i++) {
          const o = (slot * per + first + i) * 16;
          if (Math.hypot(a[o], a[o + 1], a[o + 2]) > 1e-6) drawn++;
          at.push(r(a[o + 12]), r(a[o + 13]), r(a[o + 14]));
        }
        return { drawn, at };
      });
    },
    { ...RIG, seats: SEATS },
  );

/** Fetches now (the poller restarts) and waits for that response. */
async function pollNow(page: Page) {
  await Promise.all([page.waitForResponse(OFFICE_API_V3), page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.test()?.poll())]);
}

/** Parks inside the office view, off the stop (a click still drives), once the office is loaded, in view and polling. */
async function atOffice(page: Page) {
  await page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.load());
  await expect.poll(async () => (await probe(page)).loaded, { timeout: 60_000 }).toBe(true);
  await driveTo(page, { x: LOBBY.officeWing.stop.x + 1.5, z: LOBBY.officeWing.stop.z - 1 });
  await waitForCameraSettle(page);
  await expect.poll(async () => (await probe(page)).polling, { timeout: 30_000 }).toBe(true);
}

/**
 * At the office stop the follow camera sits about 36 u from the Rovers' heads (1280 x 720), past the chips' far band
 * (`OFFICE_CHIP_FAR`), so they show the agent's name only (a chip starts far and stays far there). One zoom key step
 * (0.8, still third person; the view keeps its aim) brings all five near (tests/unit/office-chip-placement.test.ts pins
 * that pose on every class), so after two desks 1 to 4 show their activity (desk 5's chip is not checked).
 */
async function nearChips(page: Page) {
  await driveTo(page, LOBBY.officeWing.stop);
  await waitForCameraSettle(page);
  for (const slot of [0, 1, 2, 3, 4]) await expect(chip(page, slot)).toHaveAttribute("data-far", "true");
  for (let i = 0; i < 2; i++) await page.keyboard.press("=");
  await waitForCameraSettle(page);
  for (const slot of [0, 1, 2, 3]) await expect(chip(page, slot)).toHaveAttribute("data-far", "false");
}

async function show(page: Page, office: Awaited<ReturnType<typeof serveOffice>>, body: unknown, states: readonly string[]) {
  office.set(body);
  await pollNow(page);
  await expect.poll(async () => (await probe(page)).states, { timeout: 30_000 }).toEqual(tenStates(states));
}

type AtlasTexture = { version: number; image: { width: number; height: number } };
type Copy = { toAtlas: boolean; whole: boolean; at: string };
type GlWindow = Window & {
  __hq: {
    clock(): number;
    render: {
      gl: { getContext(): WebGLRenderingContext; copyTextureToTexture: (...args: unknown[]) => unknown } | null;
      scene: { getObjectByName(name: string): { material: { map: AtlasTexture } } | undefined } | null;
    };
  };
  __officeCopies?: Copy[];
};

/** The office atlas texture (the `office-screens` quads' map): its version moves only on a whole upload. */
const atlasVersion = (page: Page) => page.evaluate(() => (window as unknown as GlWindow).__hq.render.scene!.getObjectByName("office-screens")!.material.map.version);

/** Records the renderer's partial texture uploads from now on: into the atlas or not, from a whole-atlas-sized source or not, and where. */
async function recordCopies(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as GlWindow;
    const gl = w.__hq.render.gl!;
    const atlas = w.__hq.render.scene!.getObjectByName("office-screens")!.material.map;
    const copy = gl.copyTextureToTexture;
    w.__officeCopies = [];
    gl.copyTextureToTexture = function (this: unknown, ...args: unknown[]) {
      const [src, dst, , at] = args as [AtlasTexture, AtlasTexture, unknown, { x: number; y: number } | null];
      const whole = src.image.width >= atlas.image.width && src.image.height >= atlas.image.height;
      w.__officeCopies!.push({ toAtlas: dst === atlas, whole, at: at ? `${at.x},${at.y}` : "" });
      return copy.apply(this, args);
    };
  });
  return () => page.evaluate(() => (window as unknown as GlWindow).__officeCopies ?? []);
}

/** The distinct atlas cells the recorded copies patched. */
const cellsOf = (copies: Copy[]) => [...new Set(copies.map((c) => c.at))].sort();

/** Waits until the scene clock (`__hq.clock()`) moved on by `seconds` from now. */
async function waitForSceneSeconds(page: Page, seconds: number) {
  const clock = () => page.evaluate(() => (window as unknown as GlWindow).__hq.clock());
  const from = await clock();
  await expect.poll(clock, { timeout: 30_000 }).toBeGreaterThan(from + seconds);
}

/** Drains the GL error flags; returns the ones raised since the last read (0 is GL_NO_ERROR). */
const glErrors = (page: Page) =>
  page.evaluate(() => {
    const ctx = (window as unknown as GlWindow).__hq.render.gl!.getContext();
    const out: number[] = [];
    for (let e = ctx.getError(); e !== ctx.NO_ERROR && out.length < 16; e = ctx.getError()) out.push(e);
    return out;
  });

test.describe("Agent Office (L1)", () => {
  test("loads at idle on L1 and shows ten Rovers with their states and the front row's chips at the office", async ({ page }) => {
    const errors = collectErrors(page);
    const office = await serveOffice(page);
    await enterHQ(page);
    // The chunk loads on its own once the first frame went idle on L1, with no drive and no drawer.
    await expect.poll(() => chunkState(page), { timeout: 60_000 }).toBe("ready");
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    expect((await probe(page)).desks).toBe(SEATS);
    await nearChips(page);
    await expect(chip(page, 0)).toContainText(`${en.office.agent.copilot} · ${en.office.activity.editing}`);
    // The task stays in the label (the drawer shows it): the row keeps one compact line per chip.
    await expect(chip(page, 0)).toHaveAttribute("aria-label", /, Agent office scene$/);
    await expect(chip(page, 1)).toHaveAttribute("aria-label", new RegExp(`, ${en.office.clientProject}$`));
    await expect.poll(async () => (await probe(page)).chips).toBeGreaterThanOrEqual(3);
    await expect.poll(async () => (await probe(page)).wallFrames).toBeGreaterThan(0);
    await show(page, office, statesB(Date.now()), STATES_B);
    await expect(chip(page, 4)).toContainText(en.office["3d"].offDuty);
    expect(errors).toEqual([]);
  });

  test("the live layer mounts at idle on L1 with the office out of view, without moving the rover", async ({ page }) => {
    await serveOffice(page);
    await asReturningVisitor(page);
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    // The spawn view frames the wing's bounds: turn away (north, a wheel turn; the rover stays) so the scene mounts out of view.
    await turnCameraTo(page, yawLooking({ x: 0, z: -1 }));
    const at = await roverAt(page);
    // Positive control for the ?prefetch=off test below: the first ask after the first frame went idle loads the chunk
    // (an accepted ask leaves "idle" and stops the count), and the scene compiles and shows (`loaded`) at the spawn.
    await expect.poll(async () => (await probe(page)).loaded, { timeout: 60_000 }).toBe(true);
    expect(await trigger(page)).toMatchObject({ state: "ready", asks: expect.any(Number) });
    expect((await trigger(page)).asks).toBeGreaterThanOrEqual(1);
    // Mounted while the office is out of view: past a watch tick (0.5 s) the view still misses the wing, nothing polls.
    await waitForFrames(page, 30, 1_200);
    expect(await probe(page)).toMatchObject({ loaded: true, inView: false, polling: false });
    expect(await reasons(page)).toEqual([]);
    const now = await roverAt(page);
    expect(Math.hypot(now.x - at.x, now.z - at.z), "the rover never moved").toBeLessThan(0.01);
  });

  test("from the lane ring's south point the office is in view and far: a 30 s poll, Rovers animating at the far rate", async ({ page }) => {
    await chooseMotion(page, "full");
    const office = await serveOffice(page);
    office.set(statesA(Date.now()));
    await enterHQ(page);
    await expect.poll(async () => (await probe(page)).loaded, { timeout: 60_000 }).toBe(true);
    // The rover on the ring's south point, the view turned south toward the wing (a wheel turn, as a visitor would).
    await driveTo(page, RING_SOUTH);
    await turnCameraTo(page, yawLooking({ x: 0, z: 1 }));
    await expect.poll(async () => {
      const o = await probe(page);
      return { inView: o.inView, far: o.far, polling: o.polling };
    }, { timeout: 30_000 }).toEqual({ inView: true, far: true, polling: true });
    expect(await reasons(page)).toEqual(["far"]);
    await expect.poll(async () => (await probe(page)).states, { timeout: 30_000 }).toEqual(tenStates(STATES_A));
    await expect.poll(async () => (await probe(page)).bob, { timeout: 30_000 }).toBeGreaterThan(0);
    // The crew steps about 4 times a second of scene clock (`OFFICE_LOD.farHz`), never every frame.
    const sample = () => page.evaluate(() => ({ steps: (window as unknown as OfficeWindow).__hq.probes.office.steps, t: (window as unknown as GlWindow).__hq.clock() }));
    const a = await sample();
    await waitForSceneSeconds(page, 3);
    const b = await sample();
    const rate = (b.steps - a.steps) / (b.t - a.t);
    expect(rate, `${b.steps - a.steps} crew steps in ${(b.t - a.t).toFixed(2)} s`).toBeGreaterThan(1);
    expect(rate).toBeLessThanOrEqual(4.5);
    expect((await probe(page)).far).toBe(true);
  });

  test("never loads on its own with ?prefetch=off; an office drawer loads the body and starts the scene", async ({ page }) => {
    await serveOffice(page);
    await asReturningVisitor(page);
    await page.goto("/en?tier=lite&prefetch=off");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    // `asks` counts the trigger's asks (every 0.5 s of scene clock) made after the first frame went idle, while the
    // chunk is idle: three of them declined (an accepted ask leaves "idle" and stops the count).
    await expect.poll(async () => (await trigger(page)).asks, { timeout: 60_000 }).toBeGreaterThanOrEqual(3);
    expect(await trigger(page)).toMatchObject({ state: "idle" });
    await page.evaluate(() => (window as unknown as { __hq: { store: { getState: () => { openRoom: (r: string) => void } } } }).__hq.store.getState().openRoom("L1:office"));
    await expect(page.getByTestId("office-body")).toHaveAttribute("data-panel", "summary", { timeout: 60_000 });
    await expect.poll(() => chunkState(page), { timeout: 60_000 }).toBe("ready");
  });

  test("a state change repaints only the changed atlas cells on the GPU, without GL errors", async ({ page }) => {
    const errors = collectErrors(page);
    // Every console error and GL warning, except a resource that failed to load (a 404 of an optional asset).
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (/GL_INVALID_|INVALID_(ENUM|VALUE|OPERATION|FRAMEBUFFER_OPERATION)/.test(text) || (msg.type() === "error" && !/^Failed to load resource\b.*\b404\b/.test(text))) consoleErrors.push(text);
    });
    // Reduced motion holds every face and screen still, so a cell is repainted only when its state changes.
    await chooseMotion(page, "reduced");
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    // Let the crossfade from the first states (every desk changed) run out before recording.
    await waitForSceneSeconds(page, 1.5);
    const version = await atlasVersion(page);
    const copies = await recordCopies(page);
    await glErrors(page);
    // Only desk 3 (slot 2) changes: its face and its screen, two cells.
    const now = Date.now();
    const one = statesA(now);
    one.desks[2] = statesB(now).desks[2];
    const states = STATES_A.map((s, i) => (i === 2 ? STATES_B[2] : s));
    await show(page, office, one, states);
    await expect.poll(async () => cellsOf(await copies()).length, { timeout: 30_000 }).toBe(2);
    // The crossfade (reduced motion: stepped) runs out well within a second of scene clock; nothing else repaints.
    await waitForSceneSeconds(page, 1.5);
    const all = await copies();
    expect(cellsOf(all)).toHaveLength(2);
    expect(all.every((c) => c.toAtlas && !c.whole)).toBe(true);
    // No whole atlas re-upload after priming.
    expect(await atlasVersion(page)).toBe(version);
    expect(await glErrors(page)).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("clicking a Rover drives to the office stop and opens its desk; a chip does too; a private task stays hidden", async ({ page }) => {
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    const point = await clickablePoint(page, "L1:station:office-desk-1");
    expect(point).not.toBeNull();
    await page.mouse.click(point!.x, point!.y);
    await waitForRoom(page, "L1:office-desk-1");
    const drawer = page.getByTestId("room-drawer");
    await expect(drawer.getByTestId("office-body")).toHaveAttribute("data-panel", "desk");
    await expect(drawer).toContainText(en.office["3d"].agentFull.copilot);
    await expect(drawer.getByTestId("office-repo")).toHaveAttribute("href", "https://github.com/ShinyQ/ShinyQ-HQ");
    await expect(drawer).toContainText(en.office["3d"].hooks);
    await page.keyboard.press("Escape");
    await waitForPhase(page, "explore");
    await chip(page, 1).click();
    await waitForRoom(page, "L1:office-desk-2");
    await expect(page.getByTestId("office-task")).toHaveText(en.office["3d"].clientPrivate);
    await expect(page.getByTestId("office-repo")).toHaveCount(0);
  });

  test("the wall halves open the summary (agents, today) and the GitHub board", async ({ page }) => {
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    const summary = await clickablePoint(page, "L1:station:office");
    expect(summary).not.toBeNull();
    await page.mouse.click(summary!.x, summary!.y);
    await waitForRoom(page, "L1:office");
    await expect(page.getByTestId("office-agent")).toHaveCount(SEATS);
    await expect(page.getByTestId("office-body")).toContainText(en.office["3d"].hooks);
    await page.getByTestId("office-agent").nth(2).click();
    await waitForRoom(page, "L1:office-desk-3");
    await page.keyboard.press("Escape");
    await waitForPhase(page, "explore");
    const github = await clickablePoint(page, "L1:station:office-github");
    expect(github).not.toBeNull();
    await page.mouse.click(github!.x, github!.y);
    await waitForRoom(page, "L1:office-github");
    await expect(page.getByTestId("office-feed-row")).toHaveCount(2);
    await expect(page.getByTestId("office-feed-row").first()).toHaveAttribute("data-status", "running");
    await expect(page.getByTestId("office-body")).toContainText("feat: agent office");
    await expect(page.getByTestId("office-body")).toContainText(en.office["3d"].githubNote);
  });

  test("the Rover menu's office mission drives to the office and opens the summary", async ({ page }) => {
    const mission = content.missions.find((m) => m.id === "office")!;
    await serveOffice(page);
    await enterHQ(page);
    await page.getByTestId("hud").getByRole("button", { name: en.hud.launcher.roverMenu, exact: true }).click();
    await page.getByRole("dialog", { name: en.hud.terminal.title, exact: true }).getByRole("option", { name: mission.label.en }).click();
    await waitForRoom(page, "L1:office");
    await expect(page.getByTestId("office-body")).toHaveAttribute("data-panel", "summary");
  });

  test("semi-live, off and disabled responses put every Rover to sleep", async ({ page }) => {
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    const asleep = ["asleep", "asleep", "asleep", "asleep", "asleep"];
    await show(page, office, statesA(Date.now()), STATES_A);
    await show(page, office, OFFICE_FIXTURES.semiLive, asleep);
    await expect.poll(async () => (await probe(page)).mode).toBe("semi-live");
    office.set(OFFICE_FIXTURES.off);
    await pollNow(page);
    await expect.poll(async () => (await probe(page)).mode).toBe("off");
    office.set(OFFICE_FIXTURES.disabled);
    await pollNow(page);
    await expect.poll(async () => (await feed(page))?.status).toBe("disabled");
    await expect.poll(async () => (await probe(page)).mode).toBe("off");
    expect((await probe(page)).states).toEqual(tenStates(asleep));
  });

  test("a 204 or a 500 keeps the last snapshot for a minute, then the office shows offline", async ({ page }) => {
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    // Read after the switch: any fetch from here on answers 204, so a background poll cannot move the stamp.
    office.set(null, 204);
    const before = (await feed(page))!.fetchedAt;
    const count = await settled(page);
    await pollNow(page);
    // The 204 settled (the feed listeners ran) and kept the last snapshot.
    await expect.poll(() => settled(page)).toBeGreaterThan(count);
    expect(await feed(page)).toMatchObject({ status: "ready", fetchedAt: before });
    expect((await probe(page)).states).toEqual(tenStates(STATES_A));
    office.set(null, 500);
    await Promise.all([page.waitForResponse(OFFICE_API_V3), page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.test()?.advance(61_000))]);
    await expect.poll(async () => (await feed(page))?.status).toBe("offline");
    await expect.poll(async () => (await probe(page)).mode).toBe("offline");
    expect((await probe(page)).states).toEqual(tenStates([]));
  });

  test("reduced motion holds every pose still; the office view does not apply there, so the chips show as compact dots", async ({ page }) => {
    await chooseMotion(page, "reduced");
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    for (let i = 0; i < 4; i++) {
      await waitForFrames(page, 6);
      expect((await probe(page)).bob).toBe(0);
    }
    // At the stop the camera stays in the plain follow view (no zone view applies under reduced motion): every chip a
    // compact dot in the row (those whose Rovers are in view show).
    await driveTo(page, LOBBY.officeWing.stop);
    await waitForCameraSettle(page);
    expect(await cameraView(page)).toEqual({ view: null, held: expect.any(Boolean) });
    for (const slot of [0, 1, 2, 3, 4]) {
      await expect(chip(page, slot)).toHaveAttribute("data-compact", "true");
      await expect(chip(page, slot)).toHaveAttribute("data-far", "true");
    }
    await expectChipsApart(page);
  });

  test("the crew acts out each state: the asking Rover raises its flag, the CI Rover turns toward the tower, a sleeping one docks", async ({ page }) => {
    const errors = collectErrors(page);
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, CREW_A, CREW_A_STATES);
    await expect.poll(() => crewStates(page), { timeout: 30_000 }).toEqual(tenStates(CREW_A_STATES));
    // The blend into each state's pose runs out on the scene clock: wait on the pose, not on time.
    await expect.poll(async () => (await probe(page)).crew[CREW_SLOT.input].flag, { timeout: 30_000 }).toBe(1);
    await expect.poll(async () => Math.abs((await probe(page)).crew[CREW_SLOT.ci].yaw), { timeout: 30_000 }).toBeGreaterThan(0.2);
    const crew = (await probe(page)).crew;
    for (const [slot, c] of crew.entries()) if (slot !== CREW_SLOT.input) expect(c.flag, `desk ${slot + 1} flag`).toBe(0);
    await show(page, office, CREW_B, CREW_B_STATES);
    await expect.poll(() => crewStates(page), { timeout: 30_000 }).toEqual(tenStates(CREW_B_STATES));
    // The flag comes down; the sleeping Rovers (slots 1 and 4) back into their docks.
    await expect.poll(async () => (await probe(page)).crew.map((c) => c.flag), { timeout: 30_000 }).toEqual(ten([0, 0, 0, 0, 0], 0));
    await expect.poll(async () => (await probe(page)).crew.map((c) => c.z < 0), { timeout: 30_000 }).toEqual(ten([false, true, false, false, true], true));
    expect(errors).toEqual([]);
  });

  test("the beacon shows from the spawn while a Rover asks, with the minimap cue, and goes dark after an answer with no ask", async ({ page }) => {
    const errors = collectErrors(page);
    const office = await serveOffice(page);
    office.set(CREW_A);
    await enterHQ(page);
    const cue = page.locator('[data-map="office-cue"]');
    // At the spawn the lazy watch's v3 fetch (or the scene's own poll once it loaded and the office is in view) feeds the
    // signal, which loads the beacon chunk on the first ask.
    await expect.poll(async () => (await probe(page)).beacon, { timeout: 60_000 }).toBe(true);
    await expect(cue).toBeVisible();
    expect(office.requests().length).toBeGreaterThan(0);
    // Out of view (the elevator arrival, the camera looking north away from the wing) the scene's poller stops and the
    // watch alone polls, v3.
    await expect.poll(async () => (await probe(page)).loaded, { timeout: 60_000 }).toBe(true);
    await driveTo(page, LOBBY.arrival);
    await turnCameraTo(page, yawLooking({ x: 0, z: -1 }));
    await expect.poll(async () => {
      const o = await probe(page);
      return { inView: o.inView, polling: o.polling };
    }, { timeout: 30_000 }).toEqual({ inView: false, polling: false });
    const before = office.requests().length;
    // Nobody asks any more: one watch tick now, and both go dark.
    office.set(statesA(Date.now()));
    await watchNow(page);
    await expect.poll(async () => (await probe(page)).beacon).toBe(false);
    await expect(cue).toHaveCount(0);
    // And back on the next ask.
    office.set(CREW_A);
    await watchNow(page);
    await expect.poll(async () => (await probe(page)).beacon).toBe(true);
    await expect(cue).toBeVisible();
    // A back-row asker (seat 7 of a ten-desk v3 snapshot, nobody asking in front) lights it too, through the watch.
    office.set(statesA(Date.now()));
    await watchNow(page);
    await expect.poll(async () => (await probe(page)).beacon).toBe(false);
    office.set(backRowAsker(Date.now()));
    await watchNow(page);
    await expect.poll(async () => (await probe(page)).beacon).toBe(true);
    await expect(cue).toBeVisible();
    expect(office.requests().slice(before).every((path) => path === "/api/office?v=3")).toBe(true);
    expect(errors).toEqual([]);
  });

  test("reduced motion holds the crew's poses and the helper drones still", async ({ page }) => {
    await chooseMotion(page, "reduced");
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, CREW_A, CREW_A_STATES);
    await expect.poll(() => crewStates(page), { timeout: 30_000 }).toEqual(tenStates(CREW_A_STATES));
    await expect.poll(async () => (await probe(page)).crew[CREW_SLOT.input].flag, { timeout: 30_000 }).toBe(1);
    await expect.poll(async () => (await droneParts(page)).map((d) => d.drawn), { timeout: 30_000 }).toEqual(ten([3, 4, 0, 0, 0], 0));
    // The stepped blends run out within a second of scene clock; from then on nothing moves (the probe refreshes every 0.5 s).
    await waitForSceneSeconds(page, 1.5);
    expect((await probe(page)).bob).toBe(0);
    const crew = (await probe(page)).crew;
    const drones = await droneParts(page);
    await waitForSceneSeconds(page, 1.5);
    await waitForFrames(page, 30);
    expect((await probe(page)).crew).toEqual(crew);
    expect(await droneParts(page)).toEqual(drones);
    expect((await probe(page)).bob).toBe(0);
  });

  test("Motion Full animates the working Rovers", async ({ page }) => {
    await chooseMotion(page, "full");
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    await expect.poll(async () => (await probe(page)).bob).toBeGreaterThan(0);
  });

  test("speaks Indonesian", async ({ page }) => {
    const office = await serveOffice(page);
    await enterHQ(page, { path: "/id" });
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    await nearChips(page);
    await expect(chip(page, 0)).toContainText(`${id.office.agent.copilot} · ${id.office.activity.editing}`);
    await expect(chip(page, 1)).toHaveAttribute("aria-label", new RegExp(`, ${id.office.clientProject}$`));
  });

  test("at the office stop the wing sign, the tower frame and the floors above's outlines leave the view; on the lead road they are back", async ({ page }) => {
    await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await driveTo(page, LOBBY.officeWing.stop);
    await waitForCameraSettle(page);
    // Faded over the ghost floors' fade (0.45 s), then out of the draw.
    await expect.poll(() => lookOut(page)).toEqual({ sign: 0, frame: false, outlines: [] });
    // The lead road in the Lobby: the sign reads ahead of the rover again, the frame and the outlines are back.
    await driveTo(page, { x: LOBBY.officeWing.lead.x, z: LOBBY.officeWing.rect.minZ - 6 });
    await waitForCameraSettle(page);
    await expect.poll(() => lookOut(page)).toEqual({ sign: 1, frame: true, outlines: ["L2", "L3", "L4", "RF"] });
  });

  test("L1 stays under its scene-call cap at the office (lite)", async ({ page }) => {
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    await driveTo(page, LOBBY.officeWing.stop);
    await waitForCameraSettle(page);
    const peaks = await expectRenderBudget(page);
    expect(peaks.sceneCalls).toBeLessThanOrEqual(FLOOR_SCENE_CAPS.L1);
  });
});

test.describe("Agent Office (L1) at 1440 x 900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("at the stop the chips wait for the camera, then all five show far; a hand zoom keeps them shown; a drag turns them into dots", async ({ page }) => {
    const errors = collectErrors(page);
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    await driveTo(page, LOBBY.officeWing.stop);
    await waitForCameraSettle(page);
    // Settled in the office view: all five on screen, one line (far, past the band's near edge from a far start), not dots.
    await expect.poll(() => cameraView(page)).toEqual({ view: "L1:office", held: true });
    await expect.poll(async () => (await probe(page)).chips).toBe(5);
    for (const slot of [0, 1, 2, 3, 4]) {
      await expect(chip(page, slot)).toBeVisible();
      await expect(chip(page, slot)).toHaveAttribute("data-far", "true");
      await expect(chip(page, slot)).toHaveAttribute("data-compact", "false");
    }
    await expectChipsApart(page);
    // One row pinned under the top bar (`OFFICE_CHIP_TOP.desktop`, 66 px), in desk order left to right, each with its leader
    // line drawn down to its Rover.
    const row = await page.locator('[data-testid="office-chip"]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as { left: number; top: number }));
    for (const box of row) expect(box.top).toBeCloseTo(66, 0);
    for (let i = 1; i < row.length; i++) expect(row[i].left).toBeGreaterThan(row[i - 1].left);
    const leads = await page.locator('[data-testid="office-chip-lead"]').evaluateAll((els) => els.map((el) => (el as HTMLElement).style.visibility));
    expect(leads).toEqual(["visible", "visible", "visible", "visible", "visible"]);
    // Until Task 6 retunes the view: the 32 u wing (4.5 u behind the back row) raises the wall's top over the chip row
    // here, so each line runs faded down to its Rover's head, without a tick (tests/unit/office-chip-placement.test.ts).
    const ends = await page.locator('[data-testid="office-chip-lead"]').evaluateAll((els) =>
      els.map((el) => {
        const tick = el.nextElementSibling as HTMLElement;
        return { tick: tick.dataset.testid === "office-chip-tick" && tick.style.visibility === "visible", faded: Number((el as HTMLElement).style.opacity) < 0.3 };
      }),
    );
    expect(ends).toEqual(Array.from({ length: 5 }, () => ({ tick: false, faded: true })));
    // Still far a moment later (the settle gate holds past the first settled frame).
    await waitForFrames(page, 30);
    for (const slot of [0, 1, 2, 3, 4]) await expect(chip(page, slot)).toHaveAttribute("data-far", "true");
    // One zoom key step: the camera eases in for about a second; the chips never blink out, and once it rests they add
    // the activity.
    expect(await fewestChipsWhile(page, 90, () => page.keyboard.press("=")), "chips shown on every frame of the zoom").toBe(5);
    await waitForCameraSettle(page);
    for (const slot of [1, 2, 3]) await expect(chip(page, slot)).toHaveAttribute("data-far", "false");
    await expectChipsApart(page);
    // A drag turns the camera by hand: the office view no longer applies, and every chip turns into a compact dot at once.
    const { width, height } = page.viewportSize()!;
    await page.mouse.move(Math.round(width * 0.78), Math.round(height * 0.6));
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(Math.round(width * 0.78) - i * 6, Math.round(height * 0.6));
    await page.mouse.up();
    await expect.poll(() => cameraView(page)).toEqual({ view: null, held: expect.any(Boolean) });
    for (const slot of [0, 1, 2, 3, 4]) await expect(chip(page, slot)).toHaveAttribute("data-compact", "true");
    await expect.poll(async () => (await probe(page)).chips).toBeGreaterThanOrEqual(3);
    await expectChipsApart(page);
    expect(errors).toEqual([]);
  });

  test("helper drones: 3 helpers draw 3, 6 draw 4 and the near chip adds +2; a sleeping Rover's helpers draw none", async ({ page }) => {
    const errors = collectErrors(page);
    await chooseMotion(page, "full");
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, CREW_A, CREW_A_STATES);
    await expect.poll(async () => (await probe(page)).drones, { timeout: 30_000 }).toEqual(ten([3, 4, 0, 0, 0], 0));
    await expect.poll(async () => (await droneParts(page)).map((d) => d.drawn), { timeout: 30_000 }).toEqual(ten([3, 4, 0, 0, 0], 0));
    // Fixed bounds: the parts and treads take the screen quads' office-wide sphere, the glow one that holds it, so orbiting
    // drones and confetti never pop at the screen edges.
    const bounds = await page.evaluate(() => {
      type S = { center: { x: number; y: number; z: number }; radius: number };
      type O = { boundingSphere: S | null; geometry: { boundingSphere: S | null } };
      const scene = (window as unknown as { __hq: { render: { scene: { getObjectByName(n: string): O | undefined } } } }).__hq.render.scene;
      const quads = scene.getObjectByName("office-screens")!.geometry.boundingSphere!;
      const of = (name: string) => scene.getObjectByName(name)!.boundingSphere!;
      const holds = (a: S, b: S) => Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y, a.center.z - b.center.z) + b.radius <= a.radius + 1e-4;
      const same = (a: S) => Math.abs(a.radius - quads.radius) < 1e-6 && holds(a, quads);
      return { parts: same(of("office-rover-parts")), treads: same(of("office-rover-treads")), glow: holds(of("office-glow"), quads) };
    });
    expect(bounds).toEqual({ parts: true, treads: true, glow: true });
    // In full motion the drones orbit: their positions move on.
    const before = await droneParts(page);
    await expect.poll(async () => (await droneParts(page))[CREW_SLOT.six].at, { timeout: 30_000 }).not.toEqual(before[CREW_SLOT.six].at);
    await driveTo(page, LOBBY.officeWing.stop);
    await waitForCameraSettle(page);
    await expect.poll(() => cameraView(page)).toEqual({ view: "L1:office", held: true });
    // Far: the name and the helpers total, no "+2".
    await expect(chip(page, CREW_SLOT.three).getByTestId("office-chip-helpers")).toHaveText("3");
    await expect(chip(page, CREW_SLOT.six).getByTestId("office-chip-helpers")).toHaveText("6");
    await expect(chip(page, CREW_SLOT.six).getByTestId("office-chip-more")).toHaveCount(0);
    // One zoom key step brings the chips near: the head keeps the whole name, the activity (cut by an ellipsis when space
    // runs out, never dropped) and the total, and the pill the two drones not drawn; a head that does not fit drops only
    // the word "helpers".
    await page.keyboard.press("=");
    await waitForCameraSettle(page);
    await expect(chip(page, CREW_SLOT.six)).toHaveAttribute("data-far", "false");
    const six = chip(page, CREW_SLOT.six).getByTestId("office-chip-head");
    await expect(six).toHaveText(/^Claude · .+ · 6( helpers)?$/);
    await expect(chip(page, CREW_SLOT.six).getByTestId("office-chip-more")).toHaveText("+2");
    await expect(page.getByTestId("office-chip-more")).toHaveCount(1);
    await expect(chip(page, CREW_SLOT.three).getByTestId("office-chip-head")).toHaveText(/^Copilot · Editing · 3( helpers)?$/);
    for (const el of await page.getByTestId("office-chip-head").all()) {
      const fit = await el.evaluate((h) => {
        const name = h.querySelector<HTMLElement>("[data-testid=office-chip-name]")!;
        const cut = h.querySelector<HTMLElement>("[data-testid=office-chip-activity]");
        return { head: h.scrollWidth <= h.clientWidth, name: name.scrollWidth <= name.clientWidth, ellipsis: !cut || getComputedStyle(cut).textOverflow === "ellipsis" };
      });
      expect(fit, await el.innerText()).toEqual({ head: true, name: true, ellipsis: true });
    }
    // CREW_B: the 6 and the 3 moved to slots 2 and 3; the sleeping Rovers draw none, desk 5's stale count of 2 included.
    await show(page, office, CREW_B, CREW_B_STATES);
    await expect.poll(async () => (await probe(page)).drones, { timeout: 30_000 }).toEqual(ten([0, 0, 4, 3, 0], 0));
    await expect.poll(async () => (await droneParts(page)).map((d) => d.drawn), { timeout: 30_000 }).toEqual(ten([0, 0, 4, 3, 0], 0));
    await expect(chip(page, 4)).not.toHaveAttribute("aria-label", /helper/);
    await expect(chip(page, 4).getByTestId("office-chip-helpers")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("ten desks: ten Rovers on two rows, the back-row asker raises its flag over the riser, a back-row Rover draws its drones", async ({ page }) => {
    const errors = collectErrors(page);
    await chooseMotion(page, "full");
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    // `backRowAsker`: the front row as `statesA` (nobody asks), the back row working, thinking, asking (slot 7), asleep,
    // reviewing; 3 helpers at slot 5 and 6 at slot 9 (4 drones drawn).
    const body = backRowAsker(Date.now());
    body.desks = body.desks.map((d) => (d.slot === 5 ? { ...d, helpers: 3 } : d.slot === 9 ? { ...d, helpers: 6 } : d));
    const states = body.desks.map((d) => d.state);
    expect(states).toHaveLength(SEATS);
    await show(page, office, body, states);
    const o = await probe(page);
    expect(o.desks).toBe(SEATS);
    await expect.poll(() => crewStates(page), { timeout: 30_000 }).toEqual(states);
    expect((await probe(page)).crew).toHaveLength(SEATS);
    await expect.poll(async () => (await probe(page)).crew[7].flag, { timeout: 30_000 }).toBe(1);
    await expect.poll(async () => (await probe(page)).crew[8].z < 0, { timeout: 30_000 }).toBe(true);
    for (const [slot, c] of (await probe(page)).crew.entries()) if (slot !== 7) expect(c.flag, `desk ${slot + 1} flag`).toBe(0);
    await expect.poll(async () => (await probe(page)).drones, { timeout: 30_000 }).toEqual([0, 0, 0, 0, 0, 3, 0, 0, 0, 4]);
    await expect.poll(async () => (await droneParts(page)).map((d) => d.drawn), { timeout: 30_000 }).toEqual([0, 0, 0, 0, 0, 3, 0, 0, 0, 4]);
    // The back row's drones orbit their Rovers over the riser.
    const lift = officeSlots(LOBBY.officeWing)[9].lift;
    expect(lift).toBeGreaterThan(0);
    const nine = (await droneParts(page))[9].at;
    for (let i = 0; i < 4; i++) expect(nine[i * 3 + 1]).toBeGreaterThan(lift + 1);
    // The scene's feed lights the beacon for the back-row asker; its column stands on the riser top behind that Rover.
    await expect.poll(async () => (await probe(page)).beacon, { timeout: 60_000 }).toBe(true);
    const column = await page.evaluate(() => {
      type M = { instanceMatrix: { array: ArrayLike<number> } };
      const mesh = (window as unknown as { __hq: { render: { scene: { getObjectByName(n: string): M | undefined } } } }).__hq.render.scene.getObjectByName("office-beacon")!;
      const a = mesh.instanceMatrix.array;
      return { x: a[12], y: a[13], z: a[14] };
    });
    const asker = officeSlots(LOBBY.officeWing)[7];
    expect(column.y).toBeCloseTo(asker.lift, 4);
    expect(Math.hypot(column.x - asker.rover.x, column.z - asker.rover.z)).toBeCloseTo(1.25, 3);
    // The summary drawer lists ten desks; a back-row desk's drawer shows its Rover.
    await page.evaluate(() => (window as unknown as { __hq: { store: { getState: () => { openRoom: (r: string) => void } } } }).__hq.store.getState().openRoom("L1:office-desk-8"));
    await expect(page.getByTestId("office-body")).toHaveAttribute("data-panel", "desk", { timeout: 60_000 });
    await expect(page.getByTestId("office-activity")).toHaveText(en.office.activity.asking);
    expect(errors).toEqual([]);
  });
});

test.describe("Agent Office (L1) on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

  const zoom = (page: Page) => page.evaluate(() => (window as unknown as { __hq: { rover: { cameraZoom: number } } }).__hq.rover.cameraZoom);

  test("hides the chips on the lead road and in the wing outside the stop zone with the office in view, and shows them at the stop", async ({ page }) => {
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    await driveTo(page, LOBBY.officeWing.stop);
    await waitForCameraSettle(page);
    await expect.poll(async () => (await probe(page)).chips).toBeGreaterThanOrEqual(3);
    // Back onto the lead road in the Lobby (the approach): leaving the office view turns back to its south-looking yaw,
    // so the wall stays in view, low and far, a backdrop the chips do not label (`officeChipsHere` lets them show only in
    // the stop's view zone area or with an office drawer open).
    await driveTo(page, { x: LOBBY.officeWing.lead.x, z: LOBBY.officeWing.rect.minZ - 6 });
    await waitForCameraSettle(page);
    await expect.poll(async () => (await probe(page)).inView).toBe(true);
    await expect.poll(async () => (await probe(page)).chips).toBe(0);
    for (const slot of [0, 1, 2, 3, 4]) await expect(chip(page, slot)).toBeHidden();
    // In the wing, on the plaza under the sign (S + 9.5): the office is ahead and in view, still no chips.
    await driveTo(page, LOBBY.officeWing.plaza.center);
    await waitForCameraSettle(page);
    await expect.poll(async () => (await probe(page)).inView).toBe(true);
    await expect.poll(async () => (await probe(page)).chips).toBe(0);
    for (const slot of [0, 1, 2, 3, 4]) await expect(chip(page, slot)).toBeHidden();
    await driveTo(page, LOBBY.officeWing.stop);
    await waitForCameraSettle(page);
    await expect.poll(async () => (await probe(page)).chips).toBeGreaterThanOrEqual(3);
    for (const slot of [0, 1, 2, 3, 4]) await expect(chip(page, slot)).toBeVisible();
  });

  test("keeps every chip a compact dot with no text at the stop and zoomed in two steps", async ({ page }) => {
    const errors = collectErrors(page);
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    await driveTo(page, LOBBY.officeWing.stop);
    await waitForCameraSettle(page);
    // At the stop, once the camera holds still, every chip shows as a compact dot.
    await expect.poll(async () => (await probe(page)).chips).toBe(5);
    for (const slot of [0, 1, 2, 3, 4]) await expect(chip(page, slot)).toHaveAttribute("data-compact", "true");
    // Two zoom key steps (0.8 each): the portrait camera's near pose, where a desktop's chips add the activity.
    const start = await zoom(page);
    for (let i = 0; i < 2; i++) await page.keyboard.press("=");
    await expect.poll(() => zoom(page)).toBeLessThan(start * 0.7);
    await waitForCameraSettle(page);
    await expect.poll(async () => (await probe(page)).chips).toBeGreaterThanOrEqual(3);
    for (const slot of [0, 1, 2, 3, 4]) {
      await expect(chip(page, slot)).toHaveAttribute("data-far", "true");
      await expect(chip(page, slot)).toHaveAttribute("data-compact", "true");
      await expect(chip(page, slot)).not.toHaveAttribute("aria-describedby");
    }
    // Desk 1 has a public task: the compact dot hides it (the desk's drawer shows it).
    await expect(chip(page, 0)).not.toContainText("Agent office scene");
    expect(errors).toEqual([]);
  });
});
