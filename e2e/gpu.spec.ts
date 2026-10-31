import { expect, test, type Page } from "@playwright/test";
import { LOBBY } from "../src/experience/config";
import { asReturningVisitor, driveTo, waitForCameraSettle, waitForFloor, waitForFrames, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";
import { waitForStablePrograms } from "./perf/helpers";

/**
 * GPU and rendering gates (round 5, P2). Counters are deterministic on SwiftShader (draw calls,
 * programs, applied DPR and MSAA); time-based numbers come from scripts/perf-gpu.ts on real GPUs.
 */
type Graphics = { pixelRatio: number; multisampling: number | null; bloomLevels: number | null };
type RenderHandle = { resetPeak(): void; peakCalls: number; peakTriangles: number; programs(): number; programNames(): string[]; graphics?(): Graphics; warmFloors(): string[] };
type GpuWindow = { __hq: { store: { getState(): { goToFloor(f: string): void } }; render: RenderHandle } };

// Four elevator rides on SwiftShader at 1440x900 take minutes on a busy runner. The intro and ride
// draw-call peaks moved to e2e/perf/peaks.spec.ts (perf lane), with the whole-frame check kept there.
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

test("boot warms every floor: first arrivals add at most 3 programs each (full tier) @nightly", async ({ page }) => {
  await firstSession(page);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as GpuWindow).__hq.render.warmFloors().sort()), { timeout: 120_000 })
    // The Lobby is warm too once the tower's FloorPrep (R5 P6) compiled it; the boot warms the other four.
    .toEqual(expect.arrayContaining(["L2", "L3", "L4", "RF"]));
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
  // At most 3 (plan: never above 4): the composer's EffectMaterial gets a new variant when a ride starts
  // (postprocessing pass, not floor content; main adds it too), plus at most 2 floor programs.
  for (const [floor, names] of Object.entries(added)) expect(names.length, `${floor}: ${names.join(", ")}`).toBeLessThanOrEqual(3);
});

/**
 * The arrival flag mounts hidden, so no precompile sees it: its meshes must reuse programs the scene already has, or the first
 * arrival a frame lands on compiles one (the pennant's DoubleSide variant did, a flaky +1 in the L1 replay perf gate). Drives
 * until a frame drew the flag (a slow runner can miss its 1.4 s), then holds the programs to the settled set.
 */
test("an arrival flag adds no shader program (full tier)", async ({ page }) => {
  await asReturningVisitor(page);
  await page.goto("/en?tier=full");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  await waitForStablePrograms(page);
  const names = () => page.evaluate(() => (window as unknown as GpuWindow).__hq.render.programNames());
  const before = await names();
  await page.evaluate(() => {
    type Node = { visible: boolean; parent: Node | null; geometry?: { type: string; parameters?: { radialSegments?: number } } };
    const w = window as unknown as { flagDrawn?: boolean; __hq: { render: { scene: { traverse(cb: (o: Node) => void): void } | null } } };
    // The flag group holds the pennant, the only 3-segment cylinder in the scene.
    let flag: Node | null = null;
    w.__hq.render.scene?.traverse((o) => {
      if (o.geometry?.type === "CylinderGeometry" && o.geometry.parameters?.radialSegments === 3) flag = o.parent;
    });
    const watch = () => {
      if ((flag as Node | null)?.visible) w.flagDrawn = true;
      else requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  const drawn = () => page.evaluate(() => (window as unknown as { flagDrawn?: boolean }).flagDrawn === true);
  for (let i = 0; i < 4 && !(await drawn()); i++) {
    const at = await page.evaluate(() => (window as unknown as { __hq: { rover: { x: number; z: number } } }).__hq.rover);
    const d = i % 2 === 0 ? -3 : 3;
    await driveTo(page, { x: at.x + d, z: at.z + d });
  }
  expect(await drawn(), "a frame drew the arrival flag").toBe(true);
  await waitForStablePrograms(page);
  expect((await names()).filter((n) => !before.includes(n))).toEqual([]);
});

/**
 * The Lobby kiosk's Rover menu scrolls with the same glyphs at every offset, so troika updates its text in place. A new glyph
 * count made troika dispose the text geometry, which an unseen kiosk never uploaded again (the renderer's geometry count one
 * lower at random, a flaky L1 replay memory gate). From the office stop (the kiosk out of view) two scroll steps keep the
 * glyph attribute and the geometry count.
 */
test("the kiosk menu scrolls without reallocating its text geometry", async ({ page }) => {
  await asReturningVisitor(page);
  await page.goto("/en?tier=lite");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  await driveTo(page, LOBBY.officeWing.stop);
  await waitForCameraSettle(page);
  type KioskText = { text: string; geometry: { getAttribute(name: string): unknown } };
  type KioskWindow = { kiosk?: { mesh: KioskText; attr: unknown; geometries: number }; __hq: { perf: { stats: { geometries: number } }; render: { scene: { traverse(cb: (o: Partial<KioskText>) => void): void } | null } } };
  const start = await page.evaluate(() => {
    const w = window as unknown as KioskWindow;
    w.__hq.render.scene?.traverse((o) => {
      if (typeof o.text === "string" && o.text.includes("./rover-menu")) {
        const mesh = o as KioskText;
        w.kiosk = { mesh, attr: mesh.geometry.getAttribute("aTroikaGlyphBounds"), geometries: w.__hq.perf.stats.geometries };
      }
    });
    return w.kiosk?.mesh.text ?? null;
  });
  expect(start).not.toBeNull();
  const text = () => page.evaluate(() => (window as unknown as KioskWindow).kiosk!.mesh.text);
  const first = await expect.poll(text, { timeout: 60_000 }).not.toBe(start).then(text);
  await expect.poll(text, { timeout: 60_000 }).not.toBe(first);
  // Let the second step's typesetting land.
  await waitForFrames(page, 10);
  const kept = await page.evaluate(() => {
    const w = window as unknown as KioskWindow;
    return { attr: w.kiosk!.mesh.geometry.getAttribute("aTroikaGlyphBounds") === w.kiosk!.attr, geometries: w.__hq.perf.stats.geometries - w.kiosk!.geometries };
  });
  expect(kept).toEqual({ attr: true, geometries: 0 });
});

/**
 * The renderer applies the pixel budget: one desktop (full tier, MSAA on) and one phone (lite, touch). The rule's
 * other cases (Retina, DPR 1.5 and up, the 5K pixel cap) are unit tested in tests/unit/scene-settings.test.ts.
 */
const BUDGET_CASES = [
  { name: "DPR 1 desktop", width: 1440, height: 900, dpr: 1, tier: "full", touch: false, pixelRatio: 1, msaa: 4 },
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
  // Scene live means the first frames drew, not that every Lobby piece has mounted (its text can still be
  // loading on a busy CI runner): wait for the ring, and it must then be exactly 5 objects.
  await expect.poll(() => renderables(page, "stats-ring"), { timeout: 30_000 }).toBe(5);
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
