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
 * `ring-south` (always-live office, design 5.9): the rover on the Lobby lane ring's south point (the hologram's centre plus
 * `LOBBY.laneRadius` toward the wing), the view turned to look south at the wing, once the office is in view, far
 * (past `OFFICE_LOD.farDistance`) and polling: the live Rovers from afar, the scene chunk loaded on its own at idle;
 * on desktop sizes (where the default zoom puts the wing under the HUD's top bar, kept as `ring-south-default`) the view
 * then tilts up by a mouse drag; `ring-south-out` (with `ring-south`) the same view one zoom key step out. `spawn-wing`: the spawn view turned the same
 * way toward the wing (a wheel rotate, as a visitor would), the live office far off past the Lobby.
 *
 * `approach`: the rover on the wing's lead road at the Lobby plaza edge (x 3, S - 6), the view turned (a shift-wheel
 * rotate, as a visitor would) to look south into the wing. `overview` (full tier, 1440x900 only): a top-down still of
 * the whole L1 slab, the south wing included, taken with the rover at the office stop; `window.__hq` has no camera
 * control, so it pins the drawn camera (`__hq.render.camera`) over the slab after the Director's own pose, lifts the
 * fog, hides the floor groups other than L1 (the ghost slabs above would cover it) and the HTML HUD.
 *
 * The living crew (v2 snapshots, `e2e/office-fixtures.ts`, read as v3 or v4; the card and the beacon's watch ask `?v=3`, the scene `?v=4`):
 * `crew-a` and `crew-b` at the office stop (far chips) once each Rover holds its state's pose and the helper drones
 * are drawn; `crew-a-near` (desktop sizes only) one zoom key step in, the near chips with "· 3 helpers" and the "+2"
 * pill (an activity that does not fit ends in an ellipsis, a head that still does not fit drops the word "helpers", never the pill); `beacon-spawn` at the
 * primed spawn with one desk asking (`CREW_A`), the beacon column and the minimap cue lit; `beacon-stop` at the stop with
 * that desk asking (the column hidden, faint bands at the asking Rover); `asleep` every desk asleep (docked Rovers,
 * dimmed desks, charge pads). `crew-ten` ten sessions on both rows (`crewTen`: mixed states, drones on both rows, public
 * titles) at the stop, the ten chips in one row (dots on a phone, in two rows); `crew-ten-near` the near pose.
 *
 * The ship-it pipeline (v4 snapshots, `shipOffice`: ten desks, nobody asks, public run and PR titles from this site's own
 * repository; the effects are short, so the page's animation clock is frozen (`freezeOn`) once the probes show the
 * effect and the scene clock has run the given seconds into it, and the shot is taken on that held frame):
 * `ship-spawn` at the spawn (default view) a production deploy the beacon's watch sees, the deploy beam over the wing
 * with no Rover asking (`ship-spawn-wing`: the next deploy with the view turned toward the wing, as `spawn-wing`);
 * `pipeline` at the office stop the busy pipeline (24 tower lanes lit, one per job) as two jobs finish (bursts on their
 * lanes) and back-row desk 6 starts a run (a packet from the riser); `ship` at the stop a merge from desk 1 flying its
 * package to the dock stack while the production deploy beam fires.
 *
 * `--video <dir>` records 1440x900 full-tier takes (Playwright `recordVideo`) into `<dir>/<take>.webm` (and `<take>.mp4`
 * when `ffmpeg` is on the PATH, both trimmed to start at the take's first held view); `--take crew-states,ship-it`
 * picks them (default both). `crew-states`: the beacon from the Lobby, the drive to the office stop, then `CREW_A`,
 * `CREW_B` and every desk asleep, each held about 6 s of recording once the crew probe shows its poses, and `CREW_A`
 * again one zoom step in (near chips and drones). `ship-it` (about 40 s, at the office stop): a quiet tower, a run
 * starting at desk 5 (a packet, its 12 lanes), the jobs finishing (bursts), "3D perf gates 1/2" failing (a red burst,
 * then the run's red crown), a run from back-row desk 6, a merge from desk 1 flying its package to the dock, a
 * production deploy running (the dock shimmers), then succeeding (the deploy beam). Alone `--video` records only the
 * takes; with `--only` or `--shots` the shots run first.
 *
 *   bun scripts/office-shots.ts --base http://127.0.0.1:4481 --video screenshots/office --take ship-it
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "@playwright/test";
import { asReturningVisitor, chooseMotion, driveTo, skipFloorLines, turnCameraTo, waitForCameraSettle, waitForFrames, waitForHQ, waitForPhase, waitForRoom, waitForSceneLive } from "../e2e/hq";
import {
  asV1,
  asV3,
  CREW_A_STATES,
  CREW_B_STATES,
  CREW_SLOT,
  crewA,
  crewB,
  deployed,
  OFFICE_API,
  OFFICE_API_V3,
  OFFICE_API_V4,
  OFFICE_REPO,
  officeDesk,
  officeSnapshot,
  STATES_A,
  STATES_B,
  statesA,
  statesB,
} from "../e2e/office-fixtures";
import type { OfficeGithubItem, OfficeJobStatus, OfficePipelineRun, OfficeShip, OfficeSnapshotV2, OfficeSnapshotV3, OfficeSnapshotV4 } from "../src/lib/office/protocol";
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
type PipeProbe = { packets: number; bursts: number; crowns: number; packages: number; deployFailed: number; stack: number };
type OfficeProbe = {
  loaded: boolean;
  states: string[];
  mode: string;
  inView: boolean;
  far: boolean;
  polling: boolean;
  beacon: boolean;
  crew: CrewProbe[];
  drones: number[];
  lanes: number;
  pipe: PipeProbe;
  beam: boolean;
};
type OfficeWindow = Window & {
  __hq: {
    store: { getState: () => { phase: string; openRoom: (r: string) => void; closeRoom: () => void } };
    camera: () => [number, number, number];
    clock: () => number;
    rover: { cameraYaw: number; heading: number; cameraView: string | null; cameraHeld: boolean };
    probes: { office: OfficeProbe };
    office: { load(): Promise<void>; test(): { poll(): void } | null; watchNow(): Promise<void>; loadBeacon(): Promise<unknown> };
  };
};

let base = "http://127.0.0.1:4481";
let out = "screenshots/office";
let only: string[] | null = null;
let shots: string[] | null = null;
let video: string | null = null;
const TAKES = ["crew-states", "ship-it"] as const;
let takes: readonly string[] = TAKES;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--base") base = argv[++i];
  else if (argv[i] === "--out") out = argv[++i];
  else if (argv[i] === "--only") only = argv[++i].split(",");
  else if (argv[i] === "--shots") shots = argv[++i].split(",");
  else if (argv[i] === "--video") video = argv[++i];
  else if (argv[i] === "--take") takes = argv[++i].split(",");
}
for (const take of takes) if (!(TAKES as readonly string[]).includes(take)) throw new Error(`office shots: no take "${take}" (${TAKES.join(", ")})`);
const wants = (shot: string) => !shots || shots.includes(shot);
const runShots = !video || only !== null || shots !== null;
if (runShots) mkdirSync(out, { recursive: true });

const SLOW = 120_000;
/** The ring-south shot's tilt on desktop sizes (px of upward drag, about 0.3 rad): frames the office under the HUD bar. */
const RING_TILT = -75;
const probe = (page: Page) => page.evaluate(() => (window as unknown as OfficeWindow).__hq.probes.office);
const camera = (page: Page) => page.evaluate(() => (window as unknown as OfficeWindow).__hq.camera());

async function waitFor(what: string, check: () => Promise<boolean>, timeout = SLOW) {
  const end = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > end) throw new Error(`office shots: timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** Ten seats: a five-desk lineup's back row stays off duty, asleep. */
const SEATS = 10;
const ten = <T,>(front: readonly T[], rest: T): T[] => [...front, ...Array.from({ length: SEATS - front.length }, () => rest)];

/** Fetches now (the poller restarts), waits for that response and until the office shows `mode` and `states` (padded to ten seats). */
async function show(page: Page, reply: { body: unknown }, body: unknown, mode: string, front: readonly string[], frames = 30) {
  const states = ten(front, "asleep");
  reply.body = body;
  await Promise.all([page.waitForResponse(OFFICE_API_V4), page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.test()?.poll())]);
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

/**
 * Ten sessions on both rows (`crew-ten`, v3): the front row as `CREW_A` (3 and 6 helpers, CI 7 of 12, asking, done), the
 * back row reviewing with 2 helpers, testing, failed, asleep and working with 4 helpers; public titles from this site's
 * own repository.
 */
function crewTen(now: number): OfficeSnapshotV3 {
  const back = [
    officeDesk(5, "codex", "reviewing", "reading", now, { repo: OFFICE_REPO, title: "Classic Card for Ten Desks", helpers: 2 }),
    officeDesk(6, "claude", "testing", "testing", now, { repo: OFFICE_REPO, title: "Snapshot v3 With Ten Seats" }),
    officeDesk(7, "copilot", "failed", "failed", now, { repo: OFFICE_REPO, title: "A Second, Raised Console Row", job: "3D perf gates 1/2" }),
    officeDesk(8, "codex", "asleep", "resting", now),
    officeDesk(9, "claude", "working", "editing", now, { repo: OFFICE_REPO, title: "Chips for Ten Desks", helpers: 4 }),
  ];
  const front = crewA(now);
  return { ...front, v: 3, desks: [...front.desks, ...back] };
}
const CREW_TEN_STATES = [...CREW_A_STATES, "reviewing", "testing", "failed", "asleep", "working"] as const;

/** Each lineup's settled pose, read off the crew probe (refreshed every 0.5 s of scene clock) and the drawn drones (both rows). */
const CREWS = {
  a: { body: crewA, states: CREW_A_STATES, drones: ten([3, 4, 0, 0, 0], 0), posed: (c: CrewProbe[]) => c[CREW_SLOT.input].flag === 1 && Math.abs(c[CREW_SLOT.ci].yaw) > 0.2 },
  b: { body: crewB, states: CREW_B_STATES, drones: ten([0, 0, 4, 3, 0], 0), posed: (c: CrewProbe[]) => c.every((x) => x.flag === 0) && c.slice(0, 5).map((x) => x.z < 0).join() === "false,true,false,false,true" },
  asleep: { body: allAsleep, states: ASLEEP, drones: ten([], 0), posed: (c: CrewProbe[]) => c.every((x) => x.flag === 0 && x.z < 0) },
  ten: { body: crewTen, states: CREW_TEN_STATES, drones: [3, 4, 0, 0, 0, 2, 0, 0, 0, 4], posed: (c: CrewProbe[]) => c[CREW_SLOT.input].flag === 1 && Math.abs(c[CREW_SLOT.ci].yaw) > 0.2 && c[8].z < 0 },
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
    return o.crew.map((c) => c.state).join() === ten(states, "asleep").join() && o.drones.join() === drones.join() && posed(o.crew);
  });
  if (frames) await waitForFrames(page, frames);
}

/** Answers `/api/office` from `reply`: `?v=4` (the poller) as is, `?v=3` (the beacon watch) a v4 body as the Worker's v3 (`asV3`), the v1 path (no client asks it) `asV1`. */
async function serveOffice(page: Page, reply: { body: unknown }) {
  await page.route(OFFICE_API, (route) => {
    const url = route.request().url();
    const body = OFFICE_API_V4.test(url) ? reply.body : OFFICE_API_V3.test(url) ? asV3(reply.body) : asV1(reply.body);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

/** The real CI's twelve jobs (the full PR run), named as GitHub names them. */
const CI_JOBS = ["Typecheck, lint, unit tests", ...Array.from({ length: 8 }, (_, i) => `Build, CV and e2e (${i + 1}/8)`), "Lighthouse CI", "3D perf gates 1/2", "3D perf gates 2/2"];
const MIN = 60_000;
const runUrl = (id: number) => `https://github.com/${OFFICE_REPO}/actions/runs/${id}`;
/** Twelve job statuses: `done` done, then `running` running, the rest queued; `failed` lists the failed job indexes. */
function ciJobs(done: number, running: number, failed: readonly number[] = []): OfficeJobStatus[] {
  return CI_JOBS.map((_, i) => (failed.includes(i) ? "failed" : i < done ? "done" : i < done + running ? "running" : "queued"));
}

/**
 * One ship-it step at `now` (v4): `statesA`'s front row (nobody asks; desk 5, slot 4, waits on its run) and a public back
 * row, run 4101 "CI · feat/ship-it-pipeline" on desk 5 with `jobs` (first seen at `runAt`, none without `jobs`), run 4102
 * from back-row desk 6 (slot 5) first seen at `second`, the push to main's green run 4098 (`main`), and the ships: an old
 * merge and an old deploy, a merge of PR #301 from desk 1 (slot 0) at `merge`, and a production `deploy` (its GitHub deployment id). Today's merges
 * count the new one, so the dock stack follows.
 */
type ShipStep = {
  jobs?: readonly OfficeJobStatus[];
  runAt?: number;
  status?: OfficePipelineRun["status"];
  second?: number;
  main?: boolean;
  merge?: number;
  deploy?: { id: number; at: number; status: "running" | "success" };
};
function shipOffice(now: number, s: ShipStep): OfficeSnapshotV4 {
  const front = statesA(now, 0);
  const finished = s.jobs?.filter((j) => j === "done" || j === "failed").length ?? 0;
  const failedJob = s.jobs ? CI_JOBS[s.jobs.indexOf("failed")] : undefined;
  const desks = front.desks.map((d) => {
    if (d.slot !== 4) return d;
    if (!s.jobs) return officeDesk(4, d.agent, "working", "editing", now, { repo: OFFICE_REPO, title: "Ship-It Pipeline Tower" });
    if (s.status === "failure") return officeDesk(4, d.agent, "failed", "failed", now, { repo: OFFICE_REPO, title: "Ship-It Pipeline Tower", job: failedJob });
    return { ...d, title: "Ship-It Pipeline Tower", progress: { done: finished, total: CI_JOBS.length } };
  });
  const back = [
    officeDesk(5, "codex", "working", "editing", now, { repo: OFFICE_REPO, title: "Second Console Row", helpers: 2 }),
    officeDesk(6, "claude", "thinking", "planning", now),
    officeDesk(7, "copilot", "reviewing", "reading", now, { repo: OFFICE_REPO, title: "CI Drawer for the Tower" }),
    officeDesk(8, "codex", "asleep", "resting", now),
    officeDesk(9, "claude", "testing", "testing", now, { repo: OFFICE_REPO, title: "Deploy Beam Over the Dock" }),
  ];
  const runs: OfficePipelineRun[] = [];
  if (s.second !== undefined) runs.push({ id: 4102, repo: OFFICE_REPO, title: "CI · feat/second-console-row", url: runUrl(4102), status: "running", slot: 5, at: s.second, jobs: ciJobs(0, 1).slice(0, 3).map((status, i) => ({ name: CI_JOBS[i], status })) });
  if (s.jobs) runs.push({ id: 4101, repo: OFFICE_REPO, title: "CI · feat/ship-it-pipeline", url: runUrl(4101), status: s.status ?? "running", slot: 4, at: s.runAt ?? now - 6 * MIN, jobs: s.jobs.map((status, i) => ({ name: CI_JOBS[i], status })) });
  if (s.main) runs.push({ id: 4098, repo: OFFICE_REPO, title: "CI · main", url: runUrl(4098), status: "success", at: now - 40 * MIN, jobs: ciJobs(12, 0).map((status, i) => ({ name: CI_JOBS[i], status })) });
  const ships: OfficeShip[] = [];
  if (s.deploy) ships.push({ key: `deploy:${s.deploy.id}`, kind: "deploy", status: s.deploy.status, at: s.deploy.at });
  if (s.merge !== undefined) ships.push({ key: `pr:${OFFICE_REPO}#301`, kind: "merge", status: "merged", at: s.merge, slot: 0 });
  ships.push({ key: "deploy:3214466810", kind: "deploy", status: "success", at: now - 36 * MIN }, { key: `pr:${OFFICE_REPO}#300`, kind: "merge", status: "merged", at: now - 38 * MIN });
  // The GitHub feed as the Worker writes it from the same events: the runs (a running one with its progress), the merged
  // PRs and the production deploys, newest first.
  const pr = (n: number, title: string, at: number): OfficeGithubItem => ({ kind: "pr", status: "merged", repo: OFFICE_REPO, title, at, url: `https://github.com/${OFFICE_REPO}/pull/${n}` });
  const deploy = (status: OfficeGithubItem["status"], at: number): OfficeGithubItem => ({ kind: "deploy", status, repo: OFFICE_REPO, title: "Deploy · production", at, url: `https://github.com/${OFFICE_REPO}/deployments` });
  const github: OfficeGithubItem[] = [
    ...runs.map((r): OfficeGithubItem => {
      const done = r.jobs.filter((j) => j.status === "done" || j.status === "failed").length;
      return { kind: "run", status: r.status, repo: OFFICE_REPO, title: r.title, at: r.at, url: r.url, ...(r.status === "running" ? { progress: { done, total: r.jobs.length } } : {}) };
    }),
    ...(s.merge !== undefined ? [pr(301, "feat: agent office scene", s.merge)] : []),
    ...(s.deploy ? [deploy(s.deploy.status, s.deploy.at)] : []),
    pr(300, "feat: agent office", now - 38 * MIN),
    deploy("success", now - 36 * MIN),
  ].sort((x, y) => y.at - x.at);
  return { ...front, v: 4, desks: [...desks, ...back], github, today: { ...front.today, prsMerged: s.merge !== undefined ? 3 : 2 }, pipeline: { runs, ships } };
}

/** Serves a ship-it step and waits until the office shows its desks and the tower its lanes (one per job, at most 24). */
async function showShip(page: Page, reply: { body: unknown }, body: OfficeSnapshotV4, frames = 30) {
  await show(page, reply, body, "live", body.desks.map((d) => d.state), frames);
  const lanes = Math.min(24, body.pipeline.runs.reduce((n, r) => n + r.jobs.length, 0));
  await waitFor(`${lanes} tower lanes`, async () => (await probe(page)).lanes === lanes);
}

/** The pipeline effects played so far and the dock stack (`__hq.probes.office.pipe`). */
const pipe = async (page: Page) => (await probe(page)).pipe;

type ShotClockWindow = Window & { __shotClock: { frozenAt: number | null; last: number; raf: typeof requestAnimationFrame } };
/**
 * A pausable animation clock: every `requestAnimationFrame` callback gets the frame's timestamp, or `frozenAt` while the
 * shot holds a frame, so the frame pacer renders nothing new and the canvas keeps the frame on screen. The first frame
 * after a hold sees the held time as one long frame (as after a stalled tab).
 */
async function pausableClock(page: Page) {
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    const c: ShotClockWindow["__shotClock"] = { frozenAt: null, last: 0, raf };
    (window as unknown as ShotClockWindow).__shotClock = c;
    window.requestAnimationFrame = (cb) =>
      raf((ts) => {
        c.last = ts;
        cb(c.frozenAt ?? ts);
      });
  });
}

/**
 * Holds the frame once the office probes show `when` (the pipe counts reached, the deploy beam lit) and the scene clock
 * (`__hq.clock()`) has run `after` seconds since, checked on every animation frame after the scene's own.
 */
async function freezeOn(page: Page, what: string, when: { pipe?: Partial<PipeProbe>; beam?: boolean }, after: number) {
  const outcome = await page.evaluate(
    ({ when, after }) =>
      new Promise<string>((resolve) => {
        const w = window as unknown as OfficeWindow & ShotClockWindow;
        const c = w.__shotClock;
        const end = performance.now() + 60_000;
        let t0: number | null = null;
        const tick = () => {
          const o = w.__hq.probes.office;
          const counts = Object.entries(when.pipe ?? {}).every(([k, n]) => o.pipe[k as keyof PipeProbe] >= (n as number));
          if (t0 === null && counts && (!when.beam || o.beam)) t0 = w.__hq.clock();
          if (t0 !== null && w.__hq.clock() - t0 >= after && (!when.beam || o.beam)) {
            c.frozenAt = c.last;
            return resolve(`held ${(w.__hq.clock() - t0).toFixed(2)} s in`);
          }
          if (performance.now() > end) return resolve(`timeout ${JSON.stringify({ pipe: o.pipe, beam: o.beam, t0 })}`);
          c.raf(tick);
        };
        c.raf(tick);
      }),
    { when, after },
  );
  if (outcome.startsWith("timeout")) throw new Error(`office shots: ${what} never showed (${outcome})`);
  console.log(`office shots: ${what} ${outcome}`);
}
const unfreeze = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as ShotClockWindow).__shotClock.frozenAt = null;
  });

/** Takes `path` on the held frame, then lets the clock run again. */
async function heldShot(page: Page, path: string) {
  await page.screenshot({ path });
  await unfreeze(page);
}

/** Polls `body` now with the hold armed first (an effect is over in a second): resolves on the held frame. */
async function playAndHold(page: Page, reply: { body: unknown }, body: unknown, what: string, when: Parameters<typeof freezeOn>[2], after: number) {
  const held = freezeOn(page, what, when, after);
  reply.body = body;
  await Promise.all([page.waitForResponse(OFFICE_API_V4), page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.test()?.poll())]);
  await held;
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

/** Turns the follow camera to `yaw` (`yawLooking`, from the default angle) with wheel rotates over the canvas centre (`turnCameraTo`). */
const turnTo = (page: Page, yaw: number) => turnCameraTo(page, yaw, SLOW);

/**
 * Tilts the follow camera by a vertical mouse drag of `dy` px over the canvas centre (a visitor's tilt; negative tilts the
 * view up), then waits until it settles.
 */
async function tiltBy(page: Page, dy: number) {
  const vp = page.viewportSize()!;
  const x = vp.width / 2;
  const y = vp.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps: 12 });
  await page.mouse.up();
  await waitForCameraSettle(page, { timeout: SLOW });
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
  if (video) {
    if (takes.includes("crew-states")) await recordStates(browser, video);
    if (takes.includes("ship-it")) await recordShipIt(browser, video);
  }
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
      await pausableClock(page);
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
      if (wants("ship-spawn")) {
        // A production deploy 2 s old and nobody asking: the watch's next tick loads the beacon chunk and fires the deploy
        // beam over the wing; held 1.5 s in (risen in full), then nobody deploys again.
        reply.body = deployed(Date.now(), Date.now() - 2_000);
        const held = freezeOn(page, "the deploy beam from the spawn", { beam: true }, 1.5);
        await watchNow(page);
        await held;
        await heldShot(page, name("ship-spawn"));
        reply.body = statesA(Date.now());
        await waitFor("the deploy beam off", async () => !(await probe(page)).beam);
        // The default spawn view leaves the wing out on portrait screens: the next deploy with the view turned toward the
        // wing (a wheel rotate, as for spawn-wing), then back.
        await turnTo(page, yawLooking({ x: 0, z: 1 }));
        reply.body = deployed(Date.now(), Date.now() - 2_000);
        const turned = freezeOn(page, "the deploy beam from the spawn, turned to the wing", { beam: true }, 1.5);
        await watchNow(page);
        await turned;
        await heldShot(page, name("ship-spawn-wing"));
        reply.body = statesA(Date.now());
        await waitFor("the deploy beam off", async () => !(await probe(page)).beam);
        await turnTo(page, 0);
      }
      // The scene chunk loads on its own at idle on L1 (always live); the load here only waits for it.
      await page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.load());
      await waitFor("the office chunk", async () => (await probe(page)).loaded);
      if (wants("spawn-wing")) {
        // The spawn view turned toward the wing (south), as a visitor would: the live office from afar.
        await turnTo(page, yawLooking({ x: 0, z: 1 }));
        await waitFor("the office in view, far and polling", async () => {
          const o = await probe(page);
          return o.inView && o.far && o.polling;
        });
        await show(page, reply, statesA(Date.now()), "live", STATES_A);
        await page.screenshot({ path: name("spawn-wing") });
        await turnTo(page, 0);
      }
      if (wants("ring-south")) {
        await driveTo(page, { x: LOBBY.hologram.x, z: LOBBY.hologram.z + LOBBY.laneRadius }, SLOW);
        await settle(page);
        await turnTo(page, yawLooking({ x: 0, z: 1 }));
        await waitFor("the office in view, far and polling", async () => {
          const o = await probe(page);
          return o.inView && o.far && o.polling;
        });
        await show(page, reply, statesA(Date.now()), "live", STATES_A);
        if (!vp.mobile) {
          // At the default desktop zoom the wing sits under the HUD's top bar: keep that view as ring-south-default, then
          // tilt the view up (a visitor's drag) so the wall, the sign and the Rovers show clear of the bar.
          await page.screenshot({ path: name("ring-south-default") });
          await tiltBy(page, RING_TILT);
          await waitForFrames(page, 20);
        }
        await page.screenshot({ path: name("ring-south") });
        // One zoom key step out (a visitor's next move from here): the camera rises and the wing fills more of the frame.
        if (wants("ring-south-out")) {
          await page.keyboard.press("-");
          await settle(page);
          await waitForFrames(page, 20);
          await page.screenshot({ path: name("ring-south-out") });
        }
        await page.keyboard.press("0");
        await settle(page);
      }
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

      if (wants("pipeline") || wants("ship")) {
        // The silent baseline (the first pipeline seen): run 4101 on desk 5 at 7 of 12 with three jobs running, main's green
        // run, 24 lanes lit; today's 2 merges on the dock stack.
        await showShip(page, reply, shipOffice(Date.now(), { jobs: ciJobs(7, 3), main: true }));
        await officeHeld(page);
        // Jobs 8 and 9 finish (green bursts on their lanes, 0.15 s apart) as back-row desk 6 starts run 4102 (a packet from
        // the riser to the tower): held 0.2 s in, the first burst a third grown and the packet just off the desk.
        const busy: ShipStep = { jobs: ciJobs(9, 1), main: true, second: Date.now() };
        const was = await pipe(page);
        if (wants("pipeline")) {
          await playAndHold(page, reply, shipOffice(Date.now(), busy), "the burst and the packet", { pipe: { bursts: was.bursts + 1, packets: was.packets + 1 } }, 0.2);
          await heldShot(page, name("pipeline"));
        }
        await showShip(page, reply, shipOffice(Date.now(), busy));
        if (wants("ship")) {
          // PR #301 merges from desk 1 (its package flies to the dock stack, now 3) and production deploys (the beam over
          // the dock, wall high at the stop): held 2 s into the package's 2.5 s flight, the beam risen.
          await page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.loadBeacon());
          const at = await pipe(page);
          const now = Date.now();
          await playAndHold(page, reply, shipOffice(now, { ...busy, merge: now, deploy: { id: 3214470152, at: now, status: "success" } }), "the package and the beam", { pipe: { packages: at.packages + 1 }, beam: true }, 2);
          await heldShot(page, name("ship"));
          await waitFor("the dock stack of 3", async () => (await pipe(page)).stack === 3);
          await waitFor("the deploy beam off", async () => !(await probe(page)).beam);
        }
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
        // the whole name and the helpers total and the "+2" pill for the drones not drawn.
        if (wants("crew-a-near") && !vp.touch) {
          await page.keyboard.press("=");
          await settle(page);
          const six = page.locator(`[data-testid="office-chip"][data-slot="${CREW_SLOT.six}"]`);
          await six.and(page.locator('[data-far="false"]')).waitFor({ timeout: SLOW });
          await six.getByTestId("office-chip-more").waitFor({ timeout: SLOW });
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
      if (wants("crew-ten") || wants("crew-ten-near")) {
        await showCrew(page, reply, "ten");
        await officeHeld(page);
        if (wants("crew-ten")) await page.screenshot({ path: name("crew-ten") });
        // The near pose (one zoom key step on a landscape screen, two on a portrait one): ten sessions keep one line.
        if (wants("crew-ten-near")) {
          for (let i = 0; i < (vp.height > vp.width ? 2 : 1); i++) await page.keyboard.press("=");
          await settle(page);
          await waitForFrames(page, 20);
          await page.screenshot({ path: name("crew-ten-near") });
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
  const size = { width: 1440, height: 900 };
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, recordVideo: { dir: join(dir, "crew-states.raw"), size } });
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
  // CREW_A one zoom step in: the near chips ("· 3 helpers", "+2") and the drones orbiting their Rovers.
  await page.keyboard.press("=");
  await settle(page);
  await page.locator(`[data-testid="office-chip"][data-slot="${CREW_SLOT.six}"]`).getByTestId("office-chip-more").waitFor({ timeout: SLOW });
  await hold(6000);
  await saveTake(page, dir, "crew-states", from);
}

/** Closes the take's context and writes `<dir>/<take>.webm` and `.mp4`, trimmed to start at `from` s into the recording. */
async function saveTake(page: Page, dir: string, take: string, from: number) {
  const recording = page.video()!;
  await page.context().close();
  const webm = join(dir, `${take}.webm`);
  const mp4 = join(dir, `${take}.mp4`);
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
  rmSync(join(dir, `${take}.raw`), { recursive: true, force: true });
  console.log(`office shots: video ${webm}`);
}

/**
 * The ship-it video: one 1440x900 full-tier take at the office stop, trimmed to start there. Each step is served, then
 * waited on (the desks and the lanes, the effect counts, the beam), then held for its recording length.
 */
async function recordShipIt(browser: Browser, dir: string) {
  mkdirSync(dir, { recursive: true });
  const size = { width: 1440, height: 900 };
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, recordVideo: { dir: join(dir, "ship-it.raw"), size } });
  const started = Date.now();
  const page = await context.newPage();
  const hold = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await asReturningVisitor(page);
  await skipFloorLines(page);
  await chooseMotion(page, "full");
  // A quiet pipeline: no run, today's 2 merges on the dock stack.
  const reply: { body: unknown } = { body: shipOffice(Date.now(), {}) };
  await serveOffice(page, reply);
  await page.goto(`${base}/en?tier=full`);
  await waitForHQ(page);
  await waitForPhase(page, "explore", SLOW);
  await waitForSceneLive(page, SLOW);
  await settle(page);
  await page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.load());
  await waitFor("the office chunk", async () => (await probe(page)).loaded);
  await page.evaluate(() => (window as unknown as OfficeWindow).__hq.office.loadBeacon());
  const { lead, stop } = LOBBY.officeWing;
  await driveTo(page, { x: lead.x, z: lead.from - 4 }, SLOW);
  await driveTo(page, stop, SLOW);
  await settle(page);
  await waitFor("office polling", async () => (await probe(page)).polling);
  await showShip(page, reply, shipOffice(Date.now(), {}), 0);
  await officeHeld(page);
  await waitFor("the dock stack of 2", async () => (await pipe(page)).stack === 2);
  const from = (Date.now() - started) / 1000;
  await hold(3000);
  const runAt = Date.now();
  const step = async (s: ShipStep, what: string, done: (p: PipeProbe, o: OfficeProbe) => boolean, ms: number) => {
    await showShip(page, reply, shipOffice(Date.now(), { runAt, ...s }), 0);
    await waitFor(what, async () => {
      const o = await probe(page);
      return done(o.pipe, o);
    });
    await hold(ms);
  };
  const p0 = await pipe(page);
  // Desk 5 pushes: run 4101 starts (a packet to the tower) and its 12 lanes light, the first job running.
  await step({ jobs: ciJobs(0, 1) }, "the run's packet", (p) => p.packets >= p0.packets + 1, 3000);
  // The lanes fill: the jobs finish in waves (green bursts).
  await step({ jobs: ciJobs(1, 4) }, "the first burst", (p) => p.bursts >= p0.bursts + 1, 2500);
  await step({ jobs: ciJobs(5, 4) }, "the second wave", (p) => p.bursts >= p0.bursts + 5, 2500);
  await step({ jobs: ciJobs(10, 2) }, "the third wave", (p) => p.bursts >= p0.bursts + 10, 2500);
  // "3D perf gates 1/2" fails (a red burst), then the last job finishes and the run fails (a red crown, desk 5 failed).
  await step({ jobs: ciJobs(10, 2, [10]) }, "the failed job's burst", (p) => p.bursts >= p0.bursts + 11, 3000);
  await step({ jobs: ciJobs(12, 0, [10]), status: "failure" }, "the run's red crown", (p) => p.crowns >= p0.crowns + 1, 3000);
  const failed: ShipStep = { jobs: ciJobs(12, 0, [10]), status: "failure" };
  // Back-row desk 6 pushes: run 4102 sends its packet from the riser.
  const second = Date.now();
  await step({ ...failed, second }, "the back-row packet", (p) => p.packets >= p0.packets + 2, 3000);
  // PR #301 merges from desk 1: its package flies to the dock and the stack grows to 3.
  const merge = Date.now();
  await step({ ...failed, second, merge }, "the merge's package", (p) => p.packages >= p0.packages + 1 && p.stack === 3, 3500);
  // Production deploys: the dock shimmers while it runs, then the deploy beam fires over the dock.
  const deploy = Date.now();
  await step({ ...failed, second, merge, deploy: { id: 3214471093, at: deploy, status: "running" } }, "the deploy running", () => true, 3000);
  await step({ ...failed, second, merge, deploy: { id: 3214471093, at: Date.now(), status: "success" } }, "the deploy beam", (_, o) => o.beam, 0);
  await waitFor("the deploy beam off", async () => !(await probe(page)).beam);
  await hold(1000);
  await saveTake(page, dir, "ship-it", from);
}
