import { wibDay, type OfficeDesk, type OfficeGithubItem, type OfficeResponseV1, type OfficeResponseV2, type OfficeSnapshotV1, type OfficeSnapshotV2 } from "./protocol";

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

/** The same snapshots as GET /api/office?v=2: busy has helpers at two awake desks (3 at slot 0, 6 at slot 2). */
export const OFFICE_FIXTURES_V2: Record<keyof typeof OFFICE_FIXTURES, OfficeResponseV2> = {
  busy: { ...v2(busy), desks: BUSY_DESKS.map((d) => (d.slot === 0 ? { ...d, helpers: 3 } : d.slot === 2 ? { ...d, helpers: 6 } : d)) },
  rough: v2(rough),
  quiet: v2(quiet),
  semiLive: v2(semiLive),
  off: v2(off),
  disabled: { v: 1, enabled: false },
};
