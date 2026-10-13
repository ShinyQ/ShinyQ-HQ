import { expect, test, type Page } from "@playwright/test";
import { asReturningVisitor, waitForFloor, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";

/**
 * GPU and rendering gates (round 5, P2). Counters are deterministic on SwiftShader (draw calls,
 * programs, applied DPR and MSAA); time-based numbers come from scripts/perf-gpu.ts on real GPUs.
 */
type Graphics = { pixelRatio: number; multisampling: number | null; bloomLevels: number | null };
type RenderHandle = { resetPeak(): void; peakCalls: number; peakTriangles: number; programs(): number; programNames(): string[]; graphics?(): Graphics; warmFloors(): string[] };
type GpuWindow = { __hq: { store: { getState(): { goToFloor(f: string): void } }; render: RenderHandle } };

// Four elevator rides on SwiftShader at 1440x900 take minutes on a busy runner.
test.describe.configure({ timeout: 600_000 });
test.use({ viewport: { width: 1440, height: 900 } });

async function firstSession(page: Page, tier = "full") {
  await page.route("**/api/ask", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, turnstileSiteKey: null, asOf: "2026-10-11", maxLength: 300 }) }),
  );
  await page.addInitScript(() => {
    localStorage.setItem("hq:terminal-seen", "1");
    localStorage.setItem("hq:onboarded", "done");
    localStorage.setItem("hq:hints", "off");
    sessionStorage.setItem("hq:ask-teaser", "1");
  });
  await page.goto(`/en?tier=${tier}`);
  await waitForHQ(page);
}

/** Clicks Boot rover with the peak counter reset, so the peak covers the intro and the handover. */
async function bootRover(page: Page) {
  const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
  await expect(start).not.toHaveAttribute("aria-disabled", "true", { timeout: 60_000 });
  await page.evaluate(() => (window as unknown as GpuWindow).__hq.render.resetPeak());
  await start.click();
  await waitForPhase(page, "intro");
}

async function counters(page: Page) {
  return page.evaluate(() => {
    const r = (window as unknown as GpuWindow).__hq.render;
    return { peakCalls: r.peakCalls, peakTriangles: r.peakTriangles, programs: r.programs(), names: r.programNames() };
  });
}

async function ride(page: Page, to: string) {
  await page.evaluate(() => (window as unknown as GpuWindow).__hq.render.resetPeak());
  await page.evaluate((f) => (window as unknown as GpuWindow).__hq.store.getState().goToFloor(f), to);
  await waitForFloor(page, to, 90_000);
  await waitForSceneLive(page);
  return counters(page);
}

function report(name: string, value: unknown) {
  test.info().annotations.push({ type: name, description: JSON.stringify(value) });
  console.log(`[gpu] ${name} ${JSON.stringify(value)}`);
}

test("intro and ride draw-call peaks (full tier)", async ({ page }) => {
  await firstSession(page);
  await bootRover(page);
  await waitForPhase(page, "explore", 60_000);
  await waitForSceneLive(page);
  const intro = await counters(page);
  const rides = {
    "L1-L2": await ride(page, "L2"),
    "L2-L1": await ride(page, "L1"),
    "L1-RF": await ride(page, "RF"),
    "RF-L1": await ride(page, "L1"),
  };
  const peaks = { intro: intro.peakCalls, ...Object.fromEntries(Object.entries(rides).map(([k, v]) => [k, v.peakCalls])) };
  report("peaks", peaks);
  for (const [name, value] of Object.entries(peaks)) expect(value, `${name} peak (all render passes)`).toBeLessThan(150);
});

test("boot warms every floor: first arrivals add at most 2 programs each (full tier)", async ({ page }) => {
  await firstSession(page);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as GpuWindow).__hq.render.warmFloors().sort()), { timeout: 120_000 })
    .toEqual(["L2", "L3", "L4", "RF"]);
  await bootRover(page);
  await waitForPhase(page, "explore", 60_000);
  await waitForSceneLive(page);
  // Warm floors were unmounted again: RF is not a neighbour of L1.
  expect(await page.evaluate(() => Boolean((window as unknown as SceneWindow).__hq.render.scene?.getObjectByName("roof")))).toBe(false);
  const seen = new Set((await counters(page)).names);
  const added: Record<string, string[]> = {};
  for (const floor of ["L2", "L3", "L4", "RF"]) {
    const { names } = await ride(page, floor);
    added[floor] = names.filter((n) => !seen.has(n));
    for (const n of names) seen.add(n);
  }
  report("programs-added", Object.fromEntries(Object.entries(added).map(([k, v]) => [k, v.length])));
  report("programs-added-names", added);
  for (const [floor, names] of Object.entries(added)) expect(names.length, `${floor}: ${names.join(", ")}`).toBeLessThanOrEqual(2);
});

const BUDGET_CASES = [
  { name: "Retina laptop", width: 1440, height: 900, dpr: 2, tier: "full", touch: false, pixelRatio: 2, msaa: 0 },
  { name: "DPR 1 desktop", width: 1440, height: 900, dpr: 1, tier: "full", touch: false, pixelRatio: 1, msaa: 4 },
  { name: "5K display", width: 2560, height: 1440, dpr: 2, tier: "full", touch: false, pixelRatio: 1.5, msaa: 0 },
  { name: "phone", width: 390, height: 844, dpr: 3, tier: "lite", touch: true, pixelRatio: 1.25, msaa: null },
] as const;

for (const c of BUDGET_CASES) {
  test(`pixel budget and MSAA rule: ${c.name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: c.width, height: c.height }, deviceScaleFactor: c.dpr, hasTouch: c.touch, isMobile: c.touch });
    const page = await context.newPage();
    await asReturningVisitor(page);
    await page.goto(`/en?tier=${c.tier}`);
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    const graphics = () => page.evaluate(() => (window as unknown as GpuWindow).__hq.render.graphics!());
    await expect.poll(async () => (await graphics()).multisampling, { timeout: 30_000 }).toBe(c.msaa);
    const g = await graphics();
    expect(g.pixelRatio).toBeCloseTo(c.pixelRatio, 2);
    if (c.tier === "full") expect(g.bloomLevels).toBe(8);
    await context.close();
  });
}

type QualityWindow = { __hq: { quality: { snapshot(): { level: number; locked: boolean; flips: number; applied: { dpr: number; multisampling: number; bloomLevels: number } | null }; simulate(ms: number | null): void } } };
const quality = (page: Page) => page.evaluate(() => (window as unknown as QualityWindow).__hq.quality.snapshot());

test("the safety net is off under automation by default", async ({ page }) => {
  await asReturningVisitor(page);
  await page.goto("/en?tier=full");
  await waitForHQ(page);
  await waitForSceneLive(page);
  await page.evaluate(() => (window as unknown as QualityWindow).__hq.quality.simulate(60));
  await page.waitForTimeout(9_000);
  expect((await quality(page)).level).toBe(0);
});

test("the safety net steps down on sustained slow frames, at most twice a minute, MSAA before bloom", async ({ page }) => {
  test.setTimeout(150_000);
  await asReturningVisitor(page);
  await page.goto("/en?tier=full&gfx=monitor-on");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  // DPR 1 desktop: the ladder is [msaa-off, bloom-lite].
  await page.evaluate(() => (window as unknown as QualityWindow).__hq.quality.simulate(40));
  await expect.poll(async () => (await quality(page)).level, { timeout: 30_000 }).toBe(1);
  await expect.poll(async () => (await page.evaluate(() => (window as unknown as GpuWindow).__hq.render.graphics!())).multisampling, { timeout: 10_000 }).toBe(0);
  expect((await page.evaluate(() => (window as unknown as GpuWindow).__hq.render.graphics!())).bloomLevels).toBe(8);
  await expect.poll(async () => (await quality(page)).level, { timeout: 30_000 }).toBe(2);
  // The controller applies a new level on its next frame.
  await expect.poll(async () => (await page.evaluate(() => (window as unknown as GpuWindow).__hq.render.graphics!())).bloomLevels, { timeout: 10_000 }).toBe(6);
  const snap = await quality(page);
  expect(snap.flips).toBeLessThanOrEqual(2);
  await page.evaluate(() => (window as unknown as QualityWindow).__hq.quality.simulate(null));
  expect(await page.evaluate(() => sessionStorage.getItem("hq:gfx"))).toBe(JSON.stringify({ level: 2, locked: false }));
});

type SceneWindow = { __hq: { render: { scene: { getObjectByName(name: string): { traverse(cb: (o: { isMesh?: boolean; isLine?: boolean; isPoints?: boolean; visible: boolean }) => void): void } | undefined } | null } } };

/** Renderable objects (one draw call each, two for an outlined text batch) under a named group. */
async function renderables(page: Page, name: string) {
  return page.evaluate((name) => {
    let count = 0;
    (window as unknown as SceneWindow).__hq.render.scene?.getObjectByName(name)?.traverse((o) => {
      if (o.visible && (o.isMesh || o.isLine || o.isPoints)) count += 1;
    });
    return count;
  }, name);
}

test("the L1 stats ring draws in 5 objects (full tier)", async ({ page }) => {
  await asReturningVisitor(page);
  await page.goto("/en?tier=full");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  expect(await renderables(page, "stats-ring")).toBe(5);
});

test("L2 room labels and signposts are batched (full tier)", async ({ page }) => {
  await asReturningVisitor(page);
  await page.goto("/en/journey?tier=full");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  const plainTexts = await page.evaluate(() => {
    let count = 0;
    (window as unknown as SceneWindow).__hq.render.scene?.getObjectByName("career-rooms")?.traverse((o) => {
      const t = o as unknown as { text?: unknown; addText?: unknown };
      if (typeof t.text === "string" && typeof t.addText !== "function") count += 1;
    });
    return count;
  });
  // Only award placings stay plain Text (a handful); every room label is in the batch.
  expect(plainTexts).toBeLessThan(10);
  expect(await renderables(page, "career-room-labels")).toBe(1);
  expect(await renderables(page, "career-signposts")).toBe(1);
});
