import { expect, test, type Page } from "@playwright/test";
import content from "../content/site-content.json";
import en from "../messages/en.json";
import id from "../messages/id.json";
import { OFFICE } from "../src/experience/floors/lobby/officeLayout";
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
type OfficeHooks = { feed(): { status: string; fetchedAt: number }; poll(): void; advance(ms: number): void };
type OfficeWindow = Window & { __hq: { probes: { office: OfficeProbe }; office: { load(): Promise<void>; state(): string; test(): OfficeHooks | null } } };

const probe = (page: Page) => page.evaluate(() => (window as unknown as OfficeWindow).__hq.probes.office);
const chunkState = (page: Page) => page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.state());
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
  await driveTo(page, { x: OFFICE.stop.x + 1.5, z: OFFICE.stop.z - 1 });
  await waitForCameraSettle(page);
  await expect.poll(async () => (await probe(page)).polling, { timeout: 30_000 }).toBe(true);
}

/**
 * The default follow camera sits about 35 u from the Rovers, past the chips' far band (`OFFICE_CHIP_FAR`), so
 * they show their first line only. Two zoom key steps (0.8 each, still third person) bring it to about 22 u.
 */
async function nearChips(page: Page) {
  for (let i = 0; i < 2; i++) await page.keyboard.press("=");
  await waitForCameraSettle(page);
  await expect(chip(page, 0)).toHaveAttribute("data-far", "false");
}

async function show(page: Page, office: Awaited<ReturnType<typeof serveOffice>>, body: unknown, states: readonly string[]) {
  office.set(body);
  await pollNow(page);
  await expect.poll(async () => (await probe(page)).states, { timeout: 30_000 }).toEqual(states);
}

type GlWindow = Window & { __hq: { render: { gl: { getContext(): WebGLRenderingContext; copyTextureToTexture: (...args: unknown[]) => unknown } | null } }; __officeCopies?: number };

/** Counts the renderer's partial texture uploads (the office atlas cells) from now on. */
async function countCopies(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as GlWindow;
    const gl = w.__hq.render.gl!;
    const copy = gl.copyTextureToTexture;
    w.__officeCopies = 0;
    gl.copyTextureToTexture = function (this: unknown, ...args: unknown[]) {
      w.__officeCopies! += 1;
      return copy.apply(this, args);
    };
  });
  return () => page.evaluate(() => (window as unknown as GlWindow).__officeCopies ?? 0);
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

  test("never loads on its own with ?prefetch=off; an office drawer loads the body and starts the scene", async ({ page }) => {
    await serveOffice(page);
    await asReturningVisitor(page);
    // The stats fetch starts on the same `afterFirstFrameIdle` signal as the office's speculative trigger.
    const idle = page.waitForRequest("**/api/stats");
    await page.goto("/en?tier=lite&prefetch=off");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    await idle;
    // The trigger asks every 0.5 s of scene clock: 120 rendered frames after the idle signal give it several asks.
    await waitForFrames(page, 120);
    expect(await chunkState(page)).toBe("idle");
    await page.evaluate(() => (window as unknown as { __hq: { store: { getState: () => { openRoom: (r: string) => void } } } }).__hq.store.getState().openRoom("L1:office"));
    await expect(page.getByTestId("office-body")).toHaveAttribute("data-panel", "summary", { timeout: 60_000 });
    await expect.poll(() => chunkState(page), { timeout: 60_000 }).toBe("ready");
  });

  test("a state change repaints only the changed atlas cells on the GPU, without GL errors", async ({ page }) => {
    const errors = collectErrors(page);
    const gl: string[] = [];
    page.on("console", (msg) => {
      if (/GL_INVALID_|INVALID_(ENUM|VALUE|OPERATION|FRAMEBUFFER_OPERATION)/.test(msg.text())) gl.push(msg.text());
    });
    // Reduced motion holds every face and screen still, so a cell is repainted only when its state changes.
    await chooseMotion(page, "reduced");
    const office = await serveOffice(page);
    await enterHQ(page);
    await atOffice(page);
    await show(page, office, statesA(Date.now()), STATES_A);
    const copies = await countCopies(page);
    await glErrors(page);
    await show(page, office, statesB(Date.now()), STATES_B);
    await expect.poll(copies, { timeout: 30_000 }).toBeGreaterThan(0);
    await waitForFrames(page, 4);
    expect(await glErrors(page)).toEqual([]);
    expect(gl).toEqual([]);
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
    const before = (await feed(page))!.fetchedAt;
    office.set(null, 204);
    await pollNow(page);
    await waitForFrames(page, 4);
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
    await driveTo(page, OFFICE.stop);
    await waitForCameraSettle(page);
    const peaks = await expectRenderBudget(page);
    expect(peaks.sceneCalls).toBeLessThanOrEqual(FLOOR_SCENE_CAPS.L1);
  });
});
