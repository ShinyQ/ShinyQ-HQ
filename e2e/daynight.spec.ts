import { expect, test, type Page } from "@playwright/test";
import {
  asHumanBrowser,
  asReturningVisitor,
  chooseMotion,
  enterHQ,
  expectRenderBudget,
  waitForHQ,
  waitForPhase,
  waitForSceneLive,
  type RenderPeaks,
} from "./hq";
import { waitForStablePrograms } from "./perf/helpers";

/**
 * Day and night (Round 8 K): `?sky=` pins a phase or runs the 4 minute clock, automation holds a still night (no stars, moon or sun, and the sky is not drawn, so visual baselines keep today's look),
 * a stored choice and the Motion setting decide for a human visitor, and the sky costs no extra shader
 * program or scene draw calls (`SkyController` writes colors and lights, the dome and the orbs reuse
 * the shared holo program). `__hq.sky` is the sky as last applied (src/experience/sky/skyRuntime.ts).
 */
test.describe.configure({ timeout: 240_000 });

interface SkyRead {
  phase: number;
  day: number;
  stars: number;
  still: boolean;
  source: string;
  fog: number;
  applied: number;
  azimuth: number;
}

type SkyWindow = Window & { __hq: { sky: SkyRead } };
type RenderWindow = Window & { __hq: { render: { programNames(): string[] } } };

const readSky = (page: Page): Promise<SkyRead> =>
  page.evaluate(() => {
    const { phase, day, stars, still, source, fog, applied, azimuth } = (window as unknown as SkyWindow).__hq.sky;
    return { phase, day, stars, still, source, fog, applied, azimuth };
  });

/** Waits until the controller applied the sky at least once and the source reflects the resolved mode. */
async function waitForSource(page: Page, source: string) {
  await expect
    .poll(async () => {
      const sky = await readSky(page);
      return sky.applied >= 1 ? sky.source : "pending";
    }, { timeout: 30_000 })
    .toBe(source);
}

const NIGHT_FOG = 0x0a0a0f;

/** Navigates to L1 with `?sky=` (enterHQ appends its own query, so the URL is built here). Call `asReturningVisitor` once before. */
async function openSky(page: Page, sky: string) {
  await page.goto(`/en?tier=lite&sky=${sky}`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

test("automation holds night when no ?sky= is given", async ({ page }) => {
  await enterHQ(page);
  await waitForSource(page, "held");
  expect(await readSky(page)).toMatchObject({ phase: 0, day: 0, stars: 1, still: true, source: "held", fog: NIGHT_FOG });
});

test("the perf lane's sessionStorage opt-in draws the sky under automation (not still)", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("hq:sky", "night"));
  await enterHQ(page);
  await waitForSource(page, "param");
  expect(await readSky(page)).toMatchObject({ phase: 0, stars: 1, still: false, source: "param", fog: NIGHT_FOG });
});

test("?sky=night and ?sky=day pin the phase: day has a different fog color and no stars, night keeps the night fog and stars", async ({ page }) => {
  await asReturningVisitor(page);
  await openSky(page, "night");
  await waitForSource(page, "param");
  const night = await readSky(page);
  expect(night).toMatchObject({ phase: 0, day: 0, stars: 1, still: false, source: "param", fog: NIGHT_FOG });

  await openSky(page, "day");
  await waitForSource(page, "param");
  const day = await readSky(page);
  expect(day.phase).toBeCloseTo(0.5, 5);
  expect(day.day).toBe(1);
  expect(day.stars).toBe(0);
  expect(day.still).toBe(false);
  expect(day.fog, "the day fog color differs from night").not.toBe(night.fog);
  // The desktop project's camera class puts the sun and moon arc at `SKY.azimuth.desktop` (-0.2).
  expect(day.azimuth).toBe(-0.2);
});

test("?sky=dawn sits between night and day", async ({ page }) => {
  await asReturningVisitor(page);
  await openSky(page, "dawn");
  await waitForSource(page, "param");
  const dawn = await readSky(page);
  expect(dawn.phase).toBeCloseTo(0.25, 5);
  expect(dawn.day).toBeGreaterThan(0);
  expect(dawn.day).toBeLessThan(1);
  expect(dawn.stars).toBeLessThan(1);
  expect(dawn.still).toBe(false);
});

test("day costs the same shader programs and scene draw calls as night on L1 @nightly", async ({ page }) => {
  test.setTimeout(360_000);
  await asReturningVisitor(page);
  const measure = async (sky: string) => {
    await openSky(page, sky);
    await waitForSource(page, "param");
    const programs = await waitForStablePrograms(page);
    const names = await page.evaluate(() => (window as unknown as RenderWindow).__hq.render.programNames());
    const holo = names.filter((name) => name.startsWith("holo-fx"));
    const peaks: RenderPeaks = await expectRenderBudget(page);
    return { programs, holo, peaks };
  };
  const night = await measure("night");
  const day = await measure("day");
  expect(day.holo, `holo-fx programs night [${night.holo.join(", ")}], day [${day.holo.join(", ")}]`).toEqual(night.holo);
  // The per-floor program budget is gated by e2e/perf/floors.spec.ts; one program of warm-up jitter is normal between loads.
  expect(Math.abs(day.programs - night.programs), `programs night ${night.programs}, day ${day.programs}`).toBeLessThanOrEqual(1);
  expect(Math.abs(day.peaks.sceneCalls - night.peaks.sceneCalls), `scene calls night ${night.peaks.sceneCalls}, day ${day.peaks.sceneCalls}`).toBeLessThanOrEqual(2);
});

test("?sky=cycle follows the 4 minute wall clock", async ({ page }) => {
  await asReturningVisitor(page);
  await openSky(page, "cycle");
  await waitForSource(page, "clock");
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const cycle = 4 * 60 * 1000;
          const expected = (Date.now() % cycle) / cycle;
          const phase = (window as unknown as SkyWindow).__hq.sky.phase;
          const d = Math.abs(phase - expected);
          return Math.min(d, 1 - d);
        }),
      { timeout: 30_000 },
    )
    .toBeLessThan(0.01);
});

test.describe("a human visitor (webdriver hidden)", () => {
  test("a stored off holds night", async ({ page }) => {
    await asHumanBrowser(page);
    await page.addInitScript(() => localStorage.setItem("hq:day-night", "off"));
    await enterHQ(page);
    await waitForSource(page, "held");
    expect(await readSky(page)).toMatchObject({ phase: 0, day: 0, stars: 1, still: false, source: "held", fog: NIGHT_FOG });
  });

  test("no choice runs the clock under Full motion", async ({ page }) => {
    await asHumanBrowser(page);
    await enterHQ(page);
    await waitForSource(page, "clock");
  });

  test("no choice holds night under reduced motion", async ({ page }) => {
    await asHumanBrowser(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await chooseMotion(page, "system");
    await enterHQ(page);
    await waitForSource(page, "held");
    expect((await readSky(page)).still).toBe(false);
  });

  test("a stored on runs the clock even under reduced motion", async ({ page }) => {
    await asHumanBrowser(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await chooseMotion(page, "system");
    await page.addInitScript(() => localStorage.setItem("hq:day-night", "on"));
    await enterHQ(page);
    await waitForSource(page, "clock");
  });
});
