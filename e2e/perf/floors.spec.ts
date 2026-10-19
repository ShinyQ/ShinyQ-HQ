import { expect, test, type Page } from "@playwright/test";
import { enterB1Route, rideTo } from "../b1";
import { FLOOR_SCENE_CAPS, PROGRAM_HEADROOM } from "../budgets";
import { LOBBY } from "../../src/experience/config";
import { driveTo, enterFloorRoute, expectRenderBudget, readGpuCounters, waitForCameraSettle } from "../hq";
import baseline from "./baseline.json";
import { waitForStablePrograms, writePerfEntry } from "./helpers";

/**
 * Settled render budget and shader programs on every floor and both tiers (appendix 08 section 2).
 * Programs must stay within the committed baseline plus PROGRAM_HEADROOM: a material created per
 * frame or per item shows up here long before it shows up as jank. After an intended material change
 * (or a precompile change), regenerate the baseline:
 *
 *   E2E_PORT=4433 bun run e2e:perf e2e/perf/floors.spec.ts
 *   bun scripts/perf-summary.ts baseline --head perf-report --write e2e/perf/baseline.json
 *
 * and say why in the PR. Lite counts repeat exactly. Full-tier counts can come in lower on some runs
 * (an async scene precompile, P2, may resolve after the reading), never higher: the baseline holds the
 * highest reading of several runs, and the gate catches growth (a material per frame or per item).
 */
// Full-tier floors take about 2.5 minutes on a CI runner (SwiftShader); the waits are on state, not time.
test.describe.configure({ timeout: 300_000 });
// The perf gates measure the sky as visitors see it at night (automation otherwise skips drawing it).
test.beforeEach(({ page }) =>
  page.addInitScript(() => {
    sessionStorage.setItem("hq:sky", "night");
    // Floor ambience off: synthesizing it on the CI CPU skews SwiftShader frame timing (unit tests and ambience.spec cover it).
    localStorage.setItem("hq:ambience", "off");
  }),
);

const FLOORS = [
  { floor: "L1", path: "/en" },
  { floor: "L2", path: "/en/journey" },
  { floor: "L3", path: "/en/labs" },
  { floor: "L4", path: "/en/library" },
  { floor: "RF", path: "/en/contact" },
] as const;

const PROGRAMS: Record<string, Record<string, number>> = baseline.programs;

type OfficeWindow = { __hq: { office?: { load(): Promise<void> }; probes: { office?: { loaded: boolean } } } };

/**
 * The Agent Office chunk loads near the spawn on idle; load it and wait until it shows, so L1 (and B1, ridden
 * from the Lobby) always measure the same programs. A build without the office (a main build) skips this.
 */
async function settleOffice(page: Page) {
  await page.evaluate(() => (window as unknown as OfficeWindow).__hq.office?.load());
  await page.waitForFunction(
    () => {
      const hq = (window as unknown as OfficeWindow).__hq;
      return !hq.office || hq.probes.office?.loaded === true;
    },
    null,
    { timeout: 60_000 },
  );
}

async function measureFloor(page: Page, tier: "lite" | "full", floor: string, { record = true }: { record?: boolean } = {}) {
  await waitForCameraSettle(page);
  const programs = await waitForStablePrograms(page);
  const peaks = await expectRenderBudget(page);
  const gpu = await readGpuCounters(page);
  if (record) writePerfEntry({ kind: "floor", tier, floor, sceneCalls: peaks.sceneCalls, postCalls: peaks.postCalls, triangles: peaks.triangles, programs, geometries: gpu.geometries, textures: gpu.textures });
  // Floors P2's precompile has warmed (programs pinned): explains a program count that differs between runs.
  const warm = await page.evaluate(() => (window as unknown as { __hq: { render?: { warmFloors(): string[] } } }).__hq.render?.warmFloors().sort().join(",") ?? "");
  console.log(`${floor} ${tier}: ${peaks.sceneCalls} scene + ${peaks.postCalls} post, ${peaks.triangles} tris, ${programs} programs (warm: ${warm || "none"}), ${gpu.geometries} geometries, ${gpu.textures} textures`);

  if (tier === "lite") expect(peaks.postCalls, "lite has no composer").toBe(0);
  else expect(peaks.postCalls, "the full tier composer must render").toBeGreaterThan(0);
  const cap = FLOOR_SCENE_CAPS[floor];
  if (cap !== undefined) expect(peaks.sceneCalls).toBeLessThanOrEqual(cap);

  const base = PROGRAMS[tier]?.[floor];
  expect(base, `no shader program baseline for ${tier} ${floor}: run "bun scripts/perf-summary.ts baseline --head perf-report --write e2e/perf/baseline.json"`).toBeDefined();
  expect(programs, `${programs} programs vs baseline ${base} + ${PROGRAM_HEADROOM}`).toBeLessThanOrEqual(base! + PROGRAM_HEADROOM);
}

for (const tier of ["lite", "full"] as const) {
  for (const { floor, path } of FLOORS) {
    test(`${floor} ${tier}: settled draw calls and shader programs`, async ({ page }) => {
      await enterFloorRoute(page, path, { tier });
      if (floor === "L1") await settleOffice(page);
      await measureFloor(page, tier, floor);
    });
  }
  test(`B1 ${tier}: settled draw calls and shader programs`, async ({ page }) => {
    // B1 has no route: unlock it on the Lobby and ride down (its baseline includes the Lobby's programs).
    await enterB1Route(page, "/en", tier);
    await settleOffice(page);
    await rideTo(page, "B1");
    await measureFloor(page, tier, "B1");
  });
  test(`L1 ${tier}: settled draw calls and shader programs at the Agent Office`, async ({ page }) => {
    await enterFloorRoute(page, "/en", { tier });
    await settleOffice(page);
    await driveTo(page, LOBBY.officeWing.stop);
    // Same cap and program baseline as the L1 spawn; not recorded (the spawn entry is the L1 baseline).
    await measureFloor(page, tier, "L1", { record: false });
  });
}
