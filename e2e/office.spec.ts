import { expect, test, type Page } from "@playwright/test";
import content from "../content/site-content.json";
import en from "../messages/en.json";
import id from "../messages/id.json";
import { LOBBY } from "../src/experience/config";
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
  waitForCameraSettle,
  waitForFrames,
  waitForHQ,
  waitForPhase,
  waitForRoom,
  waitForSceneLive,
} from "./hq";
import { STATES_A, STATES_B, statesA, statesB } from "./office-fixtures";

/**
 * L1 Agent Office (docs/superpowers/plans/2026-10-19-agent-office-3d.md): the lazy chunk near the spawn, five
 * Rovers with their states and chips, the partial atlas uploads on a real GL context, the Rover, summary and
 * GitHub drawers, the Rover menu mission, the semi-live, off, disabled and offline modes, reduced motion,
 * Indonesian and the L1 budget at the office. `/api/office` is answered from fixtures (Playwright route); waits
 * are on state, never on time.
 */
test.describe.configure({ timeout: 180_000 });

type OfficeProbe = { loaded: boolean; desks: number; states: string[]; mode: string; wallFrames: number; chips: number; bob: number; inView: boolean; polling: boolean };
type OfficeHooks = { feed(): { status: string; fetchedAt: number }; poll(): void; advance(ms: number): void; settled(): number };
type OfficeWindow = Window & { __hq: { probes: { office: OfficeProbe }; office: { load(): Promise<void>; state(): string; asks(): number; test(): OfficeHooks | null } } };

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

/** Answers `/api/office` from a mutable reply, so a test can switch fixtures or fail the endpoint mid-run. */
async function serveOffice(page: Page) {
  const reply: { status: number; body: unknown } = { status: 200, body: OFFICE_FIXTURES.disabled };
  await page.route("**/api/office", (route) =>
    route.fulfill(reply.status === 200 ? { status: 200, contentType: "application/json", body: JSON.stringify(reply.body) } : { status: reply.status, body: "" }),
  );
  return {
    set(body: unknown, status = 200) {
      reply.body = body;
      reply.status = status;
    },
  };
}

/** Fetches now (the poller restarts) and waits for that response. */
async function pollNow(page: Page) {
  await Promise.all([page.waitForResponse("**/api/office"), page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.test()?.poll())]);
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
 * At the office stop the follow camera sits about 42 u from the chips, past their far band (`OFFICE_CHIP_FAR`), so
 * they show their first line only. From the stop, two zoom key steps (0.8 each, still third person) bring it to about
 * 27 u: the chips show their task lines (tests/unit/office-chip-placement.test.ts pins this pose on every class).
 */
async function nearChips(page: Page) {
  await driveTo(page, LOBBY.officeWing.stop);
  await waitForCameraSettle(page);
  for (let i = 0; i < 2; i++) await page.keyboard.press("=");
  await waitForCameraSettle(page);
  for (const slot of [0, 1, 2, 3]) await expect(chip(page, slot)).toHaveAttribute("data-far", "false");
}

async function show(page: Page, office: Awaited<ReturnType<typeof serveOffice>>, body: unknown, states: readonly string[]) {
  office.set(body);
  await pollNow(page);
  await expect.poll(async () => (await probe(page)).states, { timeout: 30_000 }).toEqual(states);
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
  test("loads near the spawn after the first frame and shows five Rovers with their states and chips", async ({ page }) => {
    const errors = collectErrors(page);
    const office = await serveOffice(page);
    await enterHQ(page);
    // The spawn is within OFFICE.loadRadius: the chunk loads on idle after the first frame, with no visit.
    await expect.poll(() => chunkState(page), { timeout: 60_000 }).toBe("ready");
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    expect((await probe(page)).desks).toBe(5);
    await nearChips(page);
    await expect(chip(page, 0)).toContainText(`${en.office.agent.copilot} · ${en.office.activity.editing}`);
    await expect(chip(page, 0)).toContainText("Agent office scene");
    await expect(chip(page, 1)).toContainText(en.office.clientProject);
    await expect.poll(async () => (await probe(page)).chips).toBeGreaterThanOrEqual(3);
    await expect.poll(async () => (await probe(page)).wallFrames).toBeGreaterThan(0);
    await show(page, office, statesB(Date.now()), STATES_B);
    await expect(chip(page, 4)).toContainText(en.office["3d"].offDuty);
    expect(errors).toEqual([]);
  });

  test("the speculative trigger loads the chunk on its first ask after the first frame went idle", async ({ page }) => {
    await serveOffice(page);
    await asReturningVisitor(page);
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    // Positive control for the ?prefetch=off test below: the first counted ask (the spawn is near the office) starts the load.
    await expect.poll(async () => (await trigger(page)).asks, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
    expect((await trigger(page)).state).not.toBe("idle");
    await expect.poll(() => chunkState(page), { timeout: 60_000 }).toBe("ready");
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
    await expect(drawer).toContainText(en.office.privacy);
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
    await expect(page.getByTestId("office-agent")).toHaveCount(5);
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
    expect((await probe(page)).states).toEqual(asleep);
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
    expect((await probe(page)).states).toEqual(STATES_A);
    office.set(null, 500);
    await Promise.all([page.waitForResponse("**/api/office"), page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.test()?.advance(61_000))]);
    await expect.poll(async () => (await feed(page))?.status).toBe("offline");
    await expect.poll(async () => (await probe(page)).mode).toBe("offline");
    expect((await probe(page)).states).toEqual(["asleep", "asleep", "asleep", "asleep", "asleep"]);
  });

  test("reduced motion holds every pose still", async ({ page }) => {
    await chooseMotion(page, "reduced");
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    for (let i = 0; i < 4; i++) {
      await waitForFrames(page, 6);
      expect((await probe(page)).bob).toBe(0);
    }
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
    await expect(chip(page, 1)).toContainText(id.office.clientProject);
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
