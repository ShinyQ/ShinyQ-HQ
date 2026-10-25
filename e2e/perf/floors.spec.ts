import { expect, test, type Page } from "@playwright/test";
import { enterB1Route, rideTo } from "../b1";
import content from "../../content/site-content.json";
import en from "../../messages/en.json";
import { FLOOR_SCENE_CAPS, PROGRAM_HEADROOM } from "../budgets";
import { yawLooking } from "../../src/experience/camera/look";
import { LOBBY } from "../../src/experience/config";
import { driveTo, enterFloorRoute, expectRenderBudget, readGpuCounters, turnCameraTo, waitForCameraSettle, waitForPhase } from "../hq";
import { asleepAll, asV1, asV3, crewA, OFFICE_API, OFFICE_API_V3, OFFICE_API_V4, serveHistory, shipStep } from "../office-fixtures";
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

/** The L4 reader track with the most posts (the first on ties): its bay is the busiest shelf. */
const SHELF_TRACK = content.floors.library.tracks
  .map((t) => ({ slug: t.slug, posts: content.floors.library.posts.filter((p) => p.track === t.slug).length }))
  .reduce((a, b) => (b.posts > a.posts ? b : a)).slug;

type OfficeWindow = {
  __hq: {
    office?: { load(): Promise<void>; test(): { poll(): void; advance(ms: number): void } | null };
    probes: { office?: { loaded: boolean; beacon?: boolean; inView?: boolean; far?: boolean; beam?: boolean; pipe?: { bursts: number }; tiles?: number; replay?: { status: string; playS: number; seq: number; auto: boolean } } };
    frames(): number;
  };
};

/**
 * The Agent Office chunk loads at idle on every L1 visit (the always-live office); load it at once and wait until it shows, so L1 (and B1,
 * ridden from the Lobby) always measure the same programs. A build without the office (a main build) skips this.
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

/**
 * Answers `/api/office` from a mutable body (`?v=4` as is, `?v=3` as the Worker's v3, the v1 path as v1; null answers 500), starting with
 * the ship-it script's baseline (`shipStep` "base": lanes lit, the dock stack of 2).
 */
async function servePipeline(page: Page) {
  let body: unknown = shipStep(Date.now(), "base");
  await page.route(OFFICE_API, (route) => {
    const url = route.request().url();
    if (body === null) return route.fulfill({ status: 500, body: "" });
    const out = OFFICE_API_V4.test(url) ? body : OFFICE_API_V3.test(url) ? asV3(body) : asV1(body);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(out) });
  });
  return {
    set(next: unknown) {
      body = next;
    },
  };
}

/** One poll of the office scene now, answered. */
async function pollOffice(page: Page) {
  await Promise.all([page.waitForResponse(OFFICE_API_V4), page.evaluate(() => (window as unknown as OfficeWindow).__hq.office?.test()?.poll())]);
}

/**
 * The pipeline effects playing (the scene's poller runs, the office in view): the ship-it baseline, then a finished job
 * with a production deploy that just succeeded, so a burst plays on the tower and the deploy beam rises over the dock
 * (the beacon chunk's mesh, +1 call while it draws). Returns once both show.
 */
async function playEffects(page: Page, office: Awaited<ReturnType<typeof servePipeline>>) {
  office.set(shipStep(Date.now(), "base"));
  await pollOffice(page);
  const bursts = await page.evaluate(() => (window as unknown as OfficeWindow).__hq.probes.office?.pipe?.bursts ?? 0);
  office.set(shipStep(Date.now(), "burst", Date.now() - 2_000));
  await pollOffice(page);
  await page.waitForFunction(
    (b) => {
      const o = (window as unknown as OfficeWindow).__hq.probes.office;
      return o?.beam === true && (o.pipe?.bursts ?? 0) > b;
    },
    bursts,
    { timeout: 60_000 },
  );
}

/** Rendered frames per second over `ms` of wall time (`__hq.frames()`; the idle cadence is off in tests, so up to 60). */
async function fps(page: Page, ms = 3_000) {
  return page.evaluate(
    (ms) =>
      new Promise<number>((resolve) => {
        const hq = (window as unknown as OfficeWindow).__hq;
        const f0 = hq.frames();
        const t0 = performance.now();
        setTimeout(() => resolve(((hq.frames() - f0) * 1000) / (performance.now() - t0)), ms);
      }),
    ms,
  );
}

/**
 * Settles, then gates the floor's draw calls, triangles and programs. `pose` names a view other than the arrival
 * (the L4 Study Vault stop and track shelf bay, the L1 Agent Office stop): it is held to the same floor caps and program baseline, and reported as a settled peak
 * (`settled-<floor>-<pose>`), so the program baseline keeps one entry per floor. `before` runs after the programs
 * settled, right before the draw calls are read (the office's pipeline effects).
 */
async function measureFloor(page: Page, tier: "lite" | "full", floor: string, pose?: string, before?: () => Promise<void>): Promise<{ programs: number }> {
  await waitForCameraSettle(page);
  const programs = await waitForStablePrograms(page);
  await before?.();
  const peaks = await expectRenderBudget(page);
  const gpu = await readGpuCounters(page);
  if (pose) writePerfEntry({ kind: "peak", tier, scenario: `settled-${floor}-${pose}`, sceneCalls: peaks.sceneCalls, postCalls: peaks.postCalls, triangles: peaks.triangles, frames: peaks.frames });
  else writePerfEntry({ kind: "floor", tier, floor, sceneCalls: peaks.sceneCalls, postCalls: peaks.postCalls, triangles: peaks.triangles, programs, geometries: gpu.geometries, textures: gpu.textures });
  // Floors P2's precompile has warmed (programs pinned): explains a program count that differs between runs.
  const warm = await page.evaluate(() => (window as unknown as { __hq: { render?: { warmFloors(): string[] } } }).__hq.render?.warmFloors().sort().join(",") ?? "");
  console.log(`${floor}${pose ? ` ${pose}` : ""} ${tier}: ${peaks.sceneCalls} scene + ${peaks.postCalls} post, ${peaks.triangles} tris, ${programs} programs (warm: ${warm || "none"}), ${gpu.geometries} geometries, ${gpu.textures} textures`);

  if (tier === "lite") expect(peaks.postCalls, "lite has no composer").toBe(0);
  else expect(peaks.postCalls, "the full tier composer must render").toBeGreaterThan(0);
  const cap = FLOOR_SCENE_CAPS[floor];
  if (cap !== undefined) expect(peaks.sceneCalls).toBeLessThanOrEqual(cap);

  const base = PROGRAMS[tier]?.[floor];
  expect(base, `no shader program baseline for ${tier} ${floor}: run "bun scripts/perf-summary.ts baseline --head perf-report --write e2e/perf/baseline.json"`).toBeDefined();
  expect(programs, `${programs} programs vs baseline ${base} + ${PROGRAM_HEADROOM}`).toBeLessThanOrEqual(base! + PROGRAM_HEADROOM);
  return { programs };
}

const replayOf = (page: Page) => page.evaluate(() => (window as unknown as OfficeWindow).__hq.probes.office?.replay ?? null);

/**
 * Starts the idle loop's day replay on a quiet office (`office` answers every desk asleep): the poller's clock past the 30 s
 * quiet rule, again if the replay did not start (the office out of view restarts the quiet timer), until it plays or rests.
 */
async function startReplay(page: Page) {
  for (let i = 0; i < 6 && !["loading", "playing", "resting"].includes((await replayOf(page))?.status ?? "off"); i++) {
    await Promise.all([page.waitForResponse(OFFICE_API_V4), page.evaluate(() => (window as unknown as OfficeWindow).__hq.office?.test()?.advance(31_000))]);
    await page.waitForFunction(() => (window as unknown as OfficeWindow).__hq.probes.office?.replay?.status !== "off", null, { timeout: 20_000 }).catch(() => undefined);
  }
  await page.waitForFunction(() => ["playing", "resting"].includes((window as unknown as OfficeWindow).__hq.probes.office?.replay?.status ?? ""), null, { timeout: 90_000 });
}

/** Waits until the replay plays at `playS` or later: the busy part of the fixture day (every desk awake, merges, runs, the deploy). */
const playedTo = async (page: Page, playS: number): Promise<void> => {
  await page.waitForFunction(
    (s) => {
      const r = (window as unknown as OfficeWindow).__hq.probes.office?.replay;
      return r?.status === "playing" && r.playS >= s;
    },
    playS,
    { timeout: 180_000 },
  );
};

for (const tier of ["lite", "full"] as const) {
  for (const { floor, path } of FLOORS) {
    test(`${floor} ${tier}: settled draw calls and shader programs`, async ({ page }) => {
      await enterFloorRoute(page, path, { tier });
      if (floor === "L1") await settleOffice(page);
      await measureFloor(page, tier, floor);
    });
  }
  // The Study Vault's own view (owner request 2026-10-19): its books, covers, track and pools plus the spine signs,
  // which ride the end plaza sign group and draw only near the vault. Same caps and program baseline as L4.
  test(`L4 ${tier}: settled draw calls and shader programs at the Study Vault stop`, async ({ page }) => {
    test.setTimeout(540_000);
    await enterFloorRoute(page, "/en/library", { tier });
    const stop = await page.evaluate(() => (window as unknown as { __hq: { layouts: Record<string, { stops?: Record<string, { x: number; z: number }> }> } }).__hq.layouts.L4.stops?.["L4:vault"]);
    expect(stop, "no Study Vault stop on L4").toBeDefined();
    // At real speed (the perf lane): the drive down the timeline takes a while on SwiftShader.
    await driveTo(page, stop!, 240_000);
    await measureFloor(page, tier, "L4", "vault");
  });
  // A reader track bay's own view (L4 Writing revamp): the largest track's shelf (its lead, spines, rows and back panel, the
  // full tier's light pool) with the live spine pulled and its title, the track name and the lead title showing. The
  // door opens the track drawer on arrival: close it, so the floor renders as a visitor sees it at the bay. Same caps
  // and program baseline as L4; reported as the settled-L4-shelf peak.
  test(`L4 ${tier}: settled draw calls and shader programs at a track shelf bay`, async ({ page }) => {
    await enterFloorRoute(page, "/en/library", { tier });
    const bay = `L4:track:${SHELF_TRACK}`;
    const door = await page.evaluate((room) => (window as unknown as { __hq: { layouts: Record<string, { doors?: { room: string; at: { x: number; z: number } }[] }> } }).__hq.layouts.L4.doors?.find((d) => d.room === room)?.at, bay);
    expect(door, `no ${bay} door on L4`).toBeDefined();
    await driveTo(page, door!, 120_000);
    await page.evaluate(() => {
      const store = (window as unknown as { __hq: { store: { getState: () => { phase: string; closeRoom: () => void } } } }).__hq.store.getState();
      if (store.phase === "room") store.closeRoom();
    });
    await waitForPhase(page, "explore");
    await page.waitForFunction(() => (window as unknown as { __hq: { probes: { shelves: { pulled: string | null } } } }).__hq.probes.shelves.pulled !== null, null, { timeout: 60_000 });
    await measureFloor(page, tier, "L4", "shelf");
  });
  test(`B1 ${tier}: settled draw calls and shader programs`, async ({ page }) => {
    // B1 has no route: unlock it on the Lobby and ride down (its baseline includes the Lobby's programs).
    await enterB1Route(page, "/en", tier);
    await settleOffice(page);
    await rideTo(page, "B1");
    await measureFloor(page, tier, "B1");
  });
  // The Needs Kurniadi beacon lit from the spawn (a Rover asks): the beacon chunk plus the live crew of `crewA`, the
  // office scene loaded as at the spawn spot. Same cap and program baseline; reported as the settled-L1-beacon peak.
  test(`L1 ${tier}: settled draw calls and shader programs with the Needs Kurniadi beacon`, async ({ page }) => {
    await page.route(OFFICE_API, (route) => {
      const body = crewA(Date.now());
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(OFFICE_API_V3.test(route.request().url()) || OFFICE_API_V4.test(route.request().url()) ? body : asV1(body)) });
    });
    await enterFloorRoute(page, "/en", { tier });
    await settleOffice(page);
    await page.waitForFunction(() => (window as unknown as OfficeWindow).__hq.probes.office?.beacon === true, null, { timeout: 60_000 });
    await measureFloor(page, tier, "L1", "beacon");
  });
  // The always-live office from the Lobby (design 5.9): the spawn turned toward the wing, then the lane ring's south
  // point turned toward it, each with the office in view and in its far level of detail, the ship-it pipeline's lanes lit
  // and, while the draw calls are read, a burst playing and the deploy beam running (the spawn's +1 call). Same cap and
  // program baseline; reported as the settled-L1-spawn-wing and settled-L1-ring-south peaks.
  test(`L1 ${tier}: settled draw calls and shader programs with the office in view from the Lobby`, async ({ page }) => {
    const office = await servePipeline(page);
    await enterFloorRoute(page, "/en", { tier });
    await settleOffice(page);
    const south = yawLooking({ x: 0, z: 1 });
    const inViewFar = () =>
      page.waitForFunction(
        () => {
          const o = (window as unknown as OfficeWindow).__hq.probes.office;
          return !o || (o.inView === true && o.far === true);
        },
        null,
        { timeout: 60_000 },
      );
    await turnCameraTo(page, south);
    await inViewFar();
    // Once before the programs settle: the beacon chunk loads and its mesh compiles, so the count includes it.
    await playEffects(page, office);
    await measureFloor(page, tier, "L1", "spawn-wing", () => playEffects(page, office));
    await driveTo(page, { x: LOBBY.hologram.x, z: LOBBY.hologram.z + LOBBY.laneRadius }, 120_000);
    await turnCameraTo(page, south);
    await inViewFar();
    await measureFloor(page, tier, "L1", "ring-south", () => playEffects(page, office));
  });
  // At the stop: the same pipeline effects while the draw calls are read; then the frame rate with the effects playing
  // against the still office, and the GPU objects flat across live switches (the ship-it steps, a rollback's v3 body,
  // offline and back, each round with the effects playing).
  test(`L1 ${tier}: settled draw calls and shader programs at the Agent Office`, async ({ page }) => {
    const office = await servePipeline(page);
    await enterFloorRoute(page, "/en", { tier });
    await settleOffice(page);
    await driveTo(page, LOBBY.officeWing.stop);
    await waitForCameraSettle(page);
    await playEffects(page, office);
    // Same cap and program baseline as the L1 spawn; reported as the settled-L1-office peak (the spawn entry is the L1 baseline).
    await measureFloor(page, tier, "L1", "office", () => playEffects(page, office));
    await page.waitForFunction(() => (window as unknown as OfficeWindow).__hq.probes.office?.beam === false, null, { timeout: 60_000 });
    const still = await fps(page);
    await playEffects(page, office);
    const playing = await fps(page);
    console.log(`L1 office ${tier}: ${still.toFixed(1)} fps still, ${playing.toFixed(1)} fps with the burst and the beam`);
    if (tier === "lite") expect(playing, `${playing.toFixed(1)} fps with the effects vs ${still.toFixed(1)} still`).toBeGreaterThanOrEqual(still * 0.75);
    const gpu = await readGpuCounters(page);
    for (let i = 0; i < 3; i++) {
      for (const step of ["packet", "merge"] as const) {
        office.set(shipStep(Date.now(), step));
        await pollOffice(page);
      }
      office.set({ ...crewA(Date.now()), v: 3 });
      await pollOffice(page);
      // Failed answers past the keep-last minute: offline, then back.
      office.set(null);
      await Promise.all([page.waitForResponse(OFFICE_API_V4), page.evaluate(() => (window as unknown as OfficeWindow).__hq.office?.test()?.advance(61_000))]);
      await page.waitForFunction(() => (window as unknown as { __hq: { probes: { office?: { mode: string } } } }).__hq.probes.office?.mode === "offline", null, { timeout: 30_000 });
      await playEffects(page, office);
    }
    await page.waitForFunction(() => (window as unknown as OfficeWindow).__hq.probes.office?.beam === false, null, { timeout: 60_000 });
    const after = await readGpuCounters(page);
    console.log(`L1 office ${tier} live switches: geometries ${gpu.geometries} to ${after.geometries}, textures ${gpu.textures} to ${after.textures}, programs ${gpu.programs} to ${after.programs}`);
    expect(after).toEqual(gpu);
  });

  // The day replay looping (owner decision 2026-10-22; the idle loop on a quiet office, the fixture day: ten desks, helpers,
  // merges, runs, one deploy): at the office stop and at the lane ring's south point, in the busy part of the day and later in
  // it, the same L1 cap and the program baseline with no new program, the lite frame rate within the still office's band, and
  // the GPU objects flat across three replay loops and a seek.
  test(`L1 ${tier}: settled draw calls and shader programs with the day replay looping`, async ({ page }) => {
    test.setTimeout(900_000);
    const office = await servePipeline(page);
    await serveHistory(page);
    office.set(asleepAll(Date.now()));
    await enterFloorRoute(page, "/en", { tier });
    await settleOffice(page);
    await driveTo(page, LOBBY.officeWing.stop);
    await waitForCameraSettle(page);
    await pollOffice(page);
    const still = await fps(page);
    // The programs the still office settled at: the replay adds none (the count of a full-tier page is fixed by when its precompile resolved).
    const programs = await waitForStablePrograms(page);
    await startReplay(page);
    await playedTo(page, 4);
    const stop = await measureFloor(page, tier, "L1", "replay", () => playedTo(page, 4));
    expect(stop.programs, `the replay adds no program (${programs} before it)`).toBeLessThanOrEqual(programs);
    // Later in the day (runs, the deploy, the second merge) under the same cap.
    await playedTo(page, 17);
    expect((await expectRenderBudget(page)).sceneCalls).toBeLessThanOrEqual(FLOOR_SCENE_CAPS.L1);
    const playing = await fps(page);
    console.log(`L1 replay ${tier}: ${still.toFixed(1)} fps still, ${playing.toFixed(1)} fps with the replay looping`);
    if (tier === "lite") expect(playing, `${playing.toFixed(1)} fps with the replay vs ${still.toFixed(1)} still`).toBeGreaterThanOrEqual(still * 0.75);
    // The lane ring's south point: the replay goes on there (restarted if the office left the view on the way).
    const south = yawLooking({ x: 0, z: 1 });
    await driveTo(page, { x: LOBBY.hologram.x, z: LOBBY.hologram.z + LOBBY.laneRadius }, 120_000);
    await turnCameraTo(page, south);
    await page.waitForFunction(() => (window as unknown as OfficeWindow).__hq.probes.office?.inView === true, null, { timeout: 60_000 });
    await startReplay(page);
    const ring = await measureFloor(page, tier, "L1", "ring-south-replay", () => playedTo(page, 4));
    expect(ring.programs, `the replay adds no program (${programs} before it)`).toBeLessThanOrEqual(programs);
    // Three replay loops (the range's End ends one, the loop restarts) and a seek into the middle of the day, GPU objects flat.
    await page.evaluate(() => (window as unknown as { __hq: { store: { getState: () => { openRoom: (r: string) => void } } } }).__hq.store.getState().openRoom("L1:office"));
    await expect(page.getByTestId("office-body")).toHaveAttribute("data-panel", "summary", { timeout: 60_000 });
    await page.getByRole("button", { name: en.office["3d"].replay.open }).click();
    const range = page.getByRole("slider", { name: en.office["3d"].replay.time });
    await expect(range).toBeEnabled({ timeout: 30_000 });
    await playedTo(page, 1);
    await waitForStablePrograms(page);
    const gpu = await readGpuCounters(page);
    for (let i = 0; i < 3; i++) {
      const seq = (await replayOf(page))!.seq;
      await range.press("End");
      await page.waitForFunction((seq) => {
        const r = (window as unknown as OfficeWindow).__hq.probes.office?.replay;
        return r !== undefined && r.seq > seq && r.status === "playing";
      }, seq, { timeout: 180_000 });
    }
    await range.fill("12");
    await playedTo(page, 13);
    const after = await readGpuCounters(page);
    console.log(`L1 replay ${tier} loops and a seek: geometries ${gpu.geometries} to ${after.geometries}, textures ${gpu.textures} to ${after.textures}, programs ${gpu.programs} to ${after.programs}`);
    expect(after).toEqual(gpu);
    await page.keyboard.press("Escape");
    await waitForPhase(page, "explore");
  });
}
