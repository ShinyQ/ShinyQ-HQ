import {
  wibDay,
  type OfficeDesk,
  type OfficeDeskV2,
  type OfficeGithubItem,
  type OfficeJobStatus,
  type OfficePipeline,
  type OfficePipelineJob,
  type OfficePipelineRun,
  type OfficeResponseV1,
  type OfficeResponseV2,
  type OfficeResponseV3,
  type OfficeResponseV4,
  type OfficeSnapshotV1,
  type OfficeSnapshotV2,
  type OfficeSnapshotV3,
  type OfficeSnapshotV4,
} from "./protocol";
import { dayStart, historyWindow, type OfficeHistoryEvent, type OfficeHistoryIndexV1, type OfficeHistoryV1 } from "./protocolHistory";

/** Fixed clock of the fixtures: 2026-10-18 15:00 WIB. */
export const OFFICE_FIXTURE_NOW = Date.UTC(2026, 9, 18, 8, 0, 0);

const ago = (minutes: number) => OFFICE_FIXTURE_NOW - Math.round(minutes * 60_000);
const HQ = "ShinyQ/ShinyQ-HQ";
const RUNS = "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs";

function desk(d: Omit<OfficeDesk, "recent">, recent: OfficeDesk["recent"] = [{ state: d.state, activity: d.activity, at: d.since }]): OfficeDesk {
  return { ...d, recent };
}

const BUSY_DESKS: OfficeDesk[] = [
  desk({ slot: 0, agent: "copilot", state: "working", activity: "editing", since: ago(14), repo: HQ, title: "Narrower 3D perf selection" }, [
    { state: "working", activity: "editing", at: ago(14) },
    { state: "testing", activity: "testing", at: ago(16) },
    { state: "thinking", activity: "planning", at: ago(18) },
  ]),
  desk({ slot: 1, agent: "claude", state: "thinking", activity: "planning", since: ago(3) }),
  desk({ slot: 2, agent: "copilot", state: "ci", activity: "ci", since: ago(9), repo: HQ, title: "Intro orbit reveal", progress: { done: 7, total: 12 } }),
  desk({ slot: 3, agent: "codex", state: "input", activity: "asking", since: ago(2), repo: HQ, title: "Glass shader NaN" }),
  desk({ slot: 4, agent: "claude", state: "done", activity: "finished", since: ago(0.1) }),
];

const BUSY_GITHUB: OfficeGithubItem[] = [
  { kind: "run", status: "running", repo: HQ, title: "CI · feat/intro-orbit-reveal", at: ago(6), url: `${RUNS}/1001`, progress: { done: 7, total: 12 } },
  { kind: "deploy", status: "success", repo: HQ, title: "Deploy · production", at: ago(118), url: `${RUNS}/999` },
  { kind: "run", status: "success", repo: HQ, title: "CI · main", at: ago(120), url: `${RUNS}/998` },
  { kind: "pr", status: "merged", repo: HQ, title: "#227 Rover wakes up, then a reveal orbit", at: ago(125), url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/227" },
];

const TODAY = { day: wibDay(OFFICE_FIXTURE_NOW), tasksDone: 9, prsMerged: 7, ciRuns: 14, ciGreen: 13 };

const busy: OfficeSnapshotV1 = { v: 1, enabled: true, mode: "live", updatedAt: OFFICE_FIXTURE_NOW, desks: BUSY_DESKS, extra: 1, github: BUSY_GITHUB, today: TODAY };

const rough: OfficeSnapshotV1 = {
  ...busy,
  desks: BUSY_DESKS.map((d) => {
    if (d.slot === 1) return desk({ slot: 1, agent: "claude", state: "reviewing", activity: "reading", since: ago(1) });
    if (d.slot === 2) return desk({ slot: 2, agent: "copilot", state: "failed", activity: "failed", since: ago(1), repo: HQ, title: "Intro orbit reveal", job: "E2E shard 3/8" });
    if (d.slot === 4) return desk({ slot: 4, agent: "claude", state: "testing", activity: "testing", since: ago(2) });
    return d;
  }),
  github: [{ kind: "run", status: "failure", repo: HQ, title: "CI · feat/intro-orbit-reveal", at: ago(1), url: `${RUNS}/1001` }, ...BUSY_GITHUB.slice(1)],
};

const quiet: OfficeSnapshotV1 = {
  ...busy,
  extra: 0,
  // No run in flight: the branch's CI finished green (the CI tower stays dark).
  github: [{ kind: "run", status: "success", repo: HQ, title: "CI · feat/intro-orbit-reveal", at: ago(6), url: `${RUNS}/1001` }, ...BUSY_GITHUB.slice(1)],
  desks: BUSY_DESKS.map((d) =>
    d.slot === 1 ? desk({ slot: 1, agent: "claude", state: "reviewing", activity: "reading", since: ago(4) }) : desk({ slot: d.slot, agent: d.agent, state: "asleep", activity: "resting", since: ago(60 + d.slot) }),
  ),
};

const semiLive: OfficeSnapshotV1 = { ...busy, mode: "semi-live", desks: [], extra: 0, github: BUSY_GITHUB.slice(1) };

const off: OfficeSnapshotV1 = { v: 1, enabled: true, mode: "off", updatedAt: OFFICE_FIXTURE_NOW, desks: [], extra: 0, github: [], today: { ...TODAY, tasksDone: 0, prsMerged: 0, ciRuns: 0, ciGreen: 0 } };

/** Snapshots for unit tests, e2e mocks of GET /api/office and the owner's captures. */
export const OFFICE_FIXTURES: Record<"busy" | "rough" | "quiet" | "semiLive" | "off" | "disabled", OfficeResponseV1> = {
  busy,
  rough,
  quiet,
  semiLive,
  off,
  disabled: { v: 1, enabled: false },
};

const v2 = (snap: OfficeSnapshotV1): OfficeSnapshotV2 => ({ ...snap, v: 2 });
const BUSY_DESKS_V2: OfficeDeskV2[] = BUSY_DESKS.map((d) => (d.slot === 0 ? { ...d, helpers: 3 } : d.slot === 2 ? { ...d, helpers: 6 } : d));

/** The same snapshots as GET /api/office?v=2: busy has helpers at two awake desks (3 at slot 0, 6 at slot 2). */
export const OFFICE_FIXTURES_V2: Record<keyof typeof OFFICE_FIXTURES, OfficeResponseV2> = {
  busy: { ...v2(busy), desks: BUSY_DESKS_V2 },
  rough: v2(rough),
  quiet: v2(quiet),
  semiLive: v2(semiLive),
  off: v2(off),
  disabled: { v: 1, enabled: false },
};

/** The back row of the ten-seat busy office (slots 5 to 9): reviewing with 2 helpers, testing, asking, asleep, working with 4 helpers. */
const BACK_ROW: OfficeDeskV2[] = [
  { ...desk({ slot: 5, agent: "codex", state: "reviewing", activity: "reading", since: ago(4), repo: HQ, title: "Second console row" }), helpers: 2 },
  desk({ slot: 6, agent: "copilot", state: "testing", activity: "testing", since: ago(1) }),
  desk({ slot: 7, agent: "claude", state: "input", activity: "asking", since: ago(1), repo: HQ, title: "Ten Rovers in the live scene" }),
  desk({ slot: 8, agent: "codex", state: "asleep", activity: "resting", since: ago(40) }),
  { ...desk({ slot: 9, agent: "copilot", state: "working", activity: "editing", since: ago(6), repo: HQ, title: "Chips for ten" }), helpers: 4 },
];

const v3 = (snap: OfficeSnapshotV1): OfficeSnapshotV3 => ({ ...snap, v: 3 });

/**
 * The same snapshots as GET /api/office?v=3: busy seats ten (the v2 busy front row, then `BACK_ROW`: helpers 3, 6, 2
 * and 4 at slots 0, 2, 5 and 9, askers at slots 3 and 7) with one more session in `extra`; the others as in v2.
 */
export const OFFICE_FIXTURES_V3: Record<keyof typeof OFFICE_FIXTURES, OfficeResponseV3> = {
  busy: { ...v3(busy), desks: [...BUSY_DESKS_V2, ...BACK_ROW] },
  rough: v3(rough),
  quiet: v3(quiet),
  semiLive: v3(semiLive),
  off: v3(off),
  disabled: { v: 1, enabled: false },
};

const v4 = (snap: OfficeSnapshotV3, pipeline: OfficePipeline): OfficeSnapshotV4 => ({ ...snap, v: 4, pipeline });

/** The real CI's twelve jobs (the full PR run), named as GitHub names them. */
const CI_JOBS = ["Typecheck, lint, unit tests", ...Array.from({ length: 8 }, (_, i) => `Build, CV and e2e (${i + 1}/8)`), "Lighthouse CI", "3D perf gates 1/2", "3D perf gates 2/2"];
const jobs = (statuses: readonly OfficeJobStatus[]): OfficePipelineJob[] => statuses.map((status, i) => ({ name: CI_JOBS[i], status }));
/** Run 1001 on desk 3 (slot 2): 7 of 12 finished (6 done, 1 failed), 2 running, 3 queued, as that desk's `progress`. */
const RUN_1001: OfficePipelineRun = { id: 1001, repo: HQ, title: "CI · feat/intro-orbit-reveal", url: `${RUNS}/1001`, status: "running", slot: 2, at: ago(6), jobs: jobs(["done", "done", "done", "done", "done", "failed", "done", "running", "running", "queued", "queued", "queued"]) };
const BUSY_PIPELINE: OfficePipeline = {
  runs: [
    // The newest run is back-row desk 6's (slot 5, reviewing on the public repo): its packet starts from the riser.
    { id: 1002, repo: HQ, title: "CI · feat/second-console-row", url: `${RUNS}/1002`, status: "running", slot: 5, at: ago(1), jobs: jobs(["running", "queued", "queued"]) },
    RUN_1001,
    { id: 998, repo: HQ, title: "CI · main", url: `${RUNS}/998`, status: "success", at: ago(121), jobs: jobs(Array(12).fill("done")) },
  ],
  ships: [
    { key: "deploy:999", kind: "deploy", status: "success", at: ago(118) },
    { key: `pr:${HQ}#227`, kind: "merge", status: "merged", at: ago(125) },
  ],
};
const EMPTY: OfficePipeline = { runs: [], ships: [] };

/** The same snapshots as GET /api/office?v=4: busy adds `BUSY_PIPELINE`, rough the same with run 1001 failed, the others an empty pipeline. */
export const OFFICE_FIXTURES_V4: Record<keyof typeof OFFICE_FIXTURES, OfficeResponseV4> = {
  busy: v4(OFFICE_FIXTURES_V3.busy as OfficeSnapshotV3, BUSY_PIPELINE),
  rough: v4(OFFICE_FIXTURES_V3.rough as OfficeSnapshotV3, { ...BUSY_PIPELINE, runs: BUSY_PIPELINE.runs.map((r) => (r.id === 1001 ? { ...r, status: "failure" as const, jobs: r.jobs.map((j) => (j.status === "failed" ? j : { ...j, status: "done" as const })) } : r)) }),
  quiet: v4(OFFICE_FIXTURES_V3.quiet as OfficeSnapshotV3, EMPTY),
  semiLive: v4(OFFICE_FIXTURES_V3.semiLive as OfficeSnapshotV3, EMPTY),
  off: v4(OFFICE_FIXTURES_V3.off as OfficeSnapshotV3, EMPTY),
  disabled: { v: 1, enabled: false },
};

/** Seconds since the WIB midnight at `h`:`m`. */
const hm = (h: number, m: number) => h * 3600 + m * 60;
/** One session's day: [hour, minute, state, activity, helpers] by OFFICE_STATES and OFFICE_ACTIVITIES index; a sixth number sets `until` (else 20 s before its next event, or 10 min after its last). */
type Step = [h: number, m: number, state: number, activity: number, helpers: number, until?: number];
function track(n: number, seat: number, steps: Step[]): OfficeHistoryEvent[] {
  return steps.map(([h, m, state, activity, helpers, until], i) => {
    const next = steps[i + 1];
    return [hm(h, m), n, seat, state, activity, until ?? (next ? hm(next[0], next[1]) - 20 : hm(h, m) + 600), helpers];
  });
}
const HISTORY_DAY = wibDay(OFFICE_FIXTURE_NOW);
const HISTORY_EVENTS: OfficeHistoryEvent[] = [
  // Copilot on seat 0, on the public repo with up to 3 helpers; its 14:00 CI fails.
  ...track(0, 0, [
    [9, 0, 0, 0, 0], [9, 12, 1, 1, 0], [9, 15, 0, 0, 3], [9, 40, 3, 3, 3], [9, 48, 0, 0, 3], [10, 20, 4, 6, 0], [10, 32, 0, 0, 0], [11, 5, 2, 2, 0], [11, 30, 4, 6, 0],
    [11, 50, 6, 9, 0], [12, 25, 0, 0, 0], [13, 0, 1, 1, 0], [13, 5, 0, 0, 2], [13, 45, 3, 3, 0], [14, 0, 4, 6, 0], [14, 20, 7, 10, 0], [14, 30, 0, 0, 0],
  ]),
  // Claude on back-row seat 6, on a repository that is not public (a "Client project").
  ...track(1, 6, [
    [9, 5, 1, 1, 0], [9, 8, 0, 0, 0], [9, 30, 2, 2, 0], [10, 0, 0, 5, 0], [10, 40, 5, 8, 0], [10, 50, 0, 0, 0], [11, 20, 3, 3, 0], [11, 40, 7, 10, 0],
    [11, 55, 0, 0, 0], [12, 30, 0, 4, 0], [13, 10, 2, 2, 0], [13, 40, 6, 9, 0], [14, 10, 0, 0, 0], [14, 45, 6, 9, 0],
  ]),
  // Codex on seat 2: quiet for 25 min from 10:05 and from 11:20, so the time rules put it to sleep; gone from 11:50 to 13:20.
  ...track(2, 2, [
    [9, 20, 0, 0, 0], [9, 50, 1, 1, 0], [10, 0, 0, 7, 0, hm(10, 5)], [10, 30, 0, 0, 0], [11, 0, 5, 8, 0], [11, 10, 0, 0, 0, hm(11, 20)], [11, 45, 6, 9, 0, hm(11, 50)],
    [13, 20, 0, 0, 0], [13, 50, 3, 3, 0], [14, 15, 6, 9, 0],
  ]),
].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

/** A replayable day (2026-10-18 WIB, 09:00 to 15:00): three sessions, no event from 11:55 to 12:25, three merges (one private), a green and a failed run, one production deploy. */
const historyDay: OfficeHistoryV1 = {
  v: 1,
  day: HISTORY_DAY,
  start: dayStart(HISTORY_DAY),
  agents: ["copilot", "claude", "codex"],
  tasks: { "0": { repo: HQ, title: "Replay the day in the office" } },
  events: HISTORY_EVENTS,
  prs: [
    [hm(11, 52), 0, HQ, 241, "Replay the day in the office"],
    [hm(13, 42), 6, "", 58, ""],
    [hm(14, 32), 0, HQ, 243, "Floor tiles per merged PR"],
  ],
  runs: [
    [hm(11, 30), hm(11, 48), 0, 1, 3],
    [hm(14, 0), hm(14, 19), 0, 0, 12],
  ],
  deploys: [[hm(11, 58), 1]],
  truncated: false,
};

const historyIndex: OfficeHistoryIndexV1 = {
  v: 1,
  days: historyWindow(OFFICE_FIXTURE_NOW).map((day, i) =>
    i === 0 ? { day, events: historyDay.events.length, prs: historyDay.prs.length, runs: historyDay.runs.length, deploys: historyDay.deploys.length } : { day, events: 0, prs: 0, runs: 0, deploys: 0 },
  ),
};

/** GET /api/office/history (`index`: the fixture day first, then seven empty days) and GET /api/office/history?day= for the fixture day (`day`). */
export const OFFICE_HISTORY_FIXTURES = { index: historyIndex, day: historyDay } as const;
