import { expect, test, type Page } from "@playwright/test";
import {
  asHumanBrowser,
  asReturningVisitor,
  chooseMotion,
  enterHQ,
  expectRenderBudget,
  readSettledGpuCounters,
  waitForHQ,
  waitForPhase,
  waitForSceneLive,
  type RenderPeaks,
} from "./hq";

/**
 * Day and night (Round 8 K): `?sky=` pins a phase or runs the 8 minute clock, automation holds night,
 * a stored choice and the Motion setting decide for a human visitor, and the sky costs no extra shader
 * program or scene draw calls (`SkyController` writes colors and lights, the dome and the orbs reuse
 * the shared holo program). `__hq.sky` is the sky as last applied (src/experience/sky/skyRuntime.ts).
 */
test.describe.configure({ timeout: 240_000 });

interface SkyRead {
  phase: number;
  day: number;
  stars: number;
  source: string;
}

type SkyWindow = Window & { __hq: { sky: SkyRead } };

const readSky = (page: Page): Promise<SkyRead> =>
  page.evaluate(() => {
    const { phase, day, stars, source } = (window as unknown as SkyWindow).__hq.sky;
    return { phase, day, stars, source };
  });

/** The sky is written from the first frames on: wait until the source reflects the resolved mode. */
async function waitForSource(page: Page, source: string) {
  await expect.poll(async () => (await readSky(page)).source, { timeout: 30_000 }).toBe(source);
}

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
  expect(await readSky(page)).toEqual({ phase: 0, day: 0, stars: 1, source: "held" });
});

test("?sky=night and ?sky=day pin the phase: day is bright and starless, night is dark with stars", async ({ page }) => {
  await asReturningVisitor(page);
  await openSky(page, "night");
  await waitForSource(page, "param");
  expect(await readSky(page)).toEqual({ phase: 0, day: 0, stars: 1, source: "param" });

  await openSky(page, "day");
  await waitForSource(page, "param");
  const day = await readSky(page);
  expect(day.phase).toBeCloseTo(0.5, 5);
  expect(day.day).toBe(1);
  expect(day.stars).toBe(0);

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
});

test("day costs the same shader programs and scene draw calls as night on L1", async ({ page }) => {
  await asReturningVisitor(page);
  const measure = async (sky: string) => {
    await openSky(page, sky);
    await waitForSource(page, "param");
    const programs = (await readSettledGpuCounters(page)).programs;
    const peaks: RenderPeaks = await expectRenderBudget(page);
    return { programs, peaks };
  };
  const night = await measure("night");
  const day = await measure("day");
  console.log(`night ${JSON.stringify(night)} | day ${JSON.stringify(day)}`);
  expect(day.programs, `programs night ${night.programs}, day ${day.programs}`).toBe(night.programs);
  expect(Math.abs(day.peaks.sceneCalls - night.peaks.sceneCalls), `scene calls night ${night.peaks.sceneCalls}, day ${day.peaks.sceneCalls}`).toBeLessThanOrEqual(4);
});

test("?sky=cycle follows the 8 minute wall clock", async ({ page }) => {
  await asReturningVisitor(page);
  await openSky(page, "cycle");
  await waitForSource(page, "clock");
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const cycle = 8 * 60 * 1000;
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
    expect(await readSky(page)).toEqual({ phase: 0, day: 0, stars: 1, source: "held" });
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
