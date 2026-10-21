import type { OfficeActivity, OfficeAgent, OfficeDeskV2, OfficeSnapshotV1, OfficeSnapshotV2, OfficeSnapshotV3, OfficeState } from "../src/lib/office/protocol";

/**
 * Deterministic Agent Office snapshots: the nine states over two snapshots, one private desk (no title) and one
 * off-duty slot. The only repository named is this site's own public one. Times are relative to `now`.
 */
export const OFFICE_REPO = "ShinyQ/ShinyQ-HQ";

/**
 * Playwright URL patterns: every snapshot version (v1, `?v=2`, `?v=3`; the 3D office's poller, the beacon's watch and
 * the Classic card all ask `?v=3`), and v3 alone.
 */
export const OFFICE_API = /\/api\/office(\?v=[23])?$/;
export const OFFICE_API_V3 = /\/api\/office\?v=3$/;

export function officeDesk(slot: number, agent: OfficeAgent, state: OfficeState, activity: OfficeActivity, now: number, extra: Partial<OfficeDeskV2> = {}): OfficeDeskV2 {
  return { slot, agent, state, activity, since: now - 14 * 60_000, recent: [], ...extra };
}

export function officeSnapshot(desks: OfficeDeskV2[], now: number, extra = 0): OfficeSnapshotV1 {
  return {
    v: 1,
    enabled: true,
    mode: "live",
    updatedAt: now,
    desks,
    extra,
    github: [
      { kind: "run", status: "running", repo: OFFICE_REPO, title: "CI", at: now - 30_000, url: `https://github.com/${OFFICE_REPO}/actions`, progress: { done: 7, total: 12 } },
      { kind: "pr", status: "merged", repo: OFFICE_REPO, title: "feat: agent office", at: now - 10 * 60_000, url: `https://github.com/${OFFICE_REPO}/pulls` },
    ],
    today: { day: "2026-10-19", tasksDone: 3, prsMerged: 2, ciRuns: 6, ciGreen: 5 },
  };
}

/** Five of the nine states: working (public title), thinking (private), reviewing, testing, waiting on CI 7 of 12 (public); 2 more sessions. */
export function statesA(now: number, extra = 2): OfficeSnapshotV1 {
  return officeSnapshot(
    [
      officeDesk(0, "copilot", "working", "editing", now, {
        repo: OFFICE_REPO,
        title: "Agent office scene",
        recent: [
          { state: "testing", activity: "testing", at: now - 2 * 60_000 },
          { state: "thinking", activity: "planning", at: now - 4 * 60_000 },
        ],
      }),
      officeDesk(1, "claude", "thinking", "planning", now),
      officeDesk(2, "codex", "reviewing", "reading", now),
      officeDesk(3, "copilot", "testing", "testing", now),
      officeDesk(4, "claude", "ci", "ci", now, { repo: OFFICE_REPO, title: "Office chips", progress: { done: 7, total: 12 } }),
    ],
    now,
    extra,
  );
}

/** The other four: needs Kurniadi, done, CI failed with its job, asleep; slot 4 has no session (an off-duty Rover). */
export function statesB(now: number): OfficeSnapshotV1 {
  return officeSnapshot(
    [
      officeDesk(0, "codex", "input", "asking", now),
      officeDesk(1, "copilot", "done", "finished", now, { repo: OFFICE_REPO, title: "Office drawers" }),
      officeDesk(2, "claude", "failed", "failed", now, { repo: OFFICE_REPO, title: "Office wall", job: "Build, CV and e2e" }),
      officeDesk(3, "codex", "asleep", "resting", now),
    ],
    now,
  );
}

export const STATES_A: readonly OfficeState[] = ["working", "thinking", "reviewing", "testing", "ci"];
export const STATES_B: readonly OfficeState[] = ["input", "done", "failed", "asleep", "asleep"];

/**
 * The living crew's lineups (v2, `?v=2`): `CREW_A` working, thinking, waiting on CI 7 of 12, asking (needs Kurniadi),
 * done; `CREW_B` failed, asleep, working, thinking, asleep. Each has one desk with 3 helpers (3 drones) and one with 6
 * (4 drones drawn, "+2" on its near chip); `CREW_B`'s last sleeping desk keeps a stale count of 2 that draws nothing. Titles are public ones from this site's own repository.
 */
export function crewA(now: number): OfficeSnapshotV2 {
  return {
    ...officeSnapshot(
      [
        officeDesk(0, "copilot", "working", "editing", now, { repo: OFFICE_REPO, title: "Agent Office Revamp: Living Crew", helpers: 3 }),
        officeDesk(1, "claude", "thinking", "planning", now, { repo: OFFICE_REPO, title: "Helper Drones Orbit Their Rover", helpers: 6 }),
        officeDesk(2, "codex", "ci", "ci", now, { repo: OFFICE_REPO, title: "Ship-It Pipeline Tower", progress: { done: 7, total: 12 } }),
        officeDesk(3, "copilot", "input", "asking", now, { repo: OFFICE_REPO, title: "Needs Kurniadi Beacon" }),
        officeDesk(4, "claude", "done", "finished", now, { repo: OFFICE_REPO, title: "Office Chips Under the Top Bar" }),
      ],
      now,
    ),
    v: 2,
  };
}

export function crewB(now: number): OfficeSnapshotV2 {
  return {
    ...officeSnapshot(
      [
        officeDesk(0, "codex", "failed", "failed", now, { repo: OFFICE_REPO, title: "Ship-It Pipeline Tower", job: "Build, CV and e2e" }),
        officeDesk(1, "copilot", "asleep", "resting", now),
        officeDesk(2, "claude", "working", "editing", now, { repo: OFFICE_REPO, title: "Agent Office Revamp: Living Crew", helpers: 6 }),
        officeDesk(3, "copilot", "thinking", "planning", now, { repo: OFFICE_REPO, title: "Helper Drones Orbit Their Rover", helpers: 3 }),
        // A stale count on a sleeping desk: the scene draws no drones and the chip shows no helpers for it.
        officeDesk(4, "codex", "asleep", "resting", now, { helpers: 2 }),
      ],
      now,
    ),
    v: 2,
  };
}

/**
 * A ten-seat v3 snapshot (`?v=3`) whose only asker sits on the back row (slot 7): `statesA`'s front row (nobody asks),
 * then slots 5 to 9 working, thinking, asking, asleep, reviewing; one more session in `extra`.
 */
export function backRowAsker(now: number): OfficeSnapshotV3 {
  const front = statesA(now, 1);
  const back: [OfficeAgent, OfficeState, OfficeActivity][] = [
    ["copilot", "working", "editing"],
    ["claude", "thinking", "planning"],
    ["codex", "input", "asking"],
    ["copilot", "asleep", "resting"],
    ["claude", "reviewing", "reading"],
  ];
  return { ...front, v: 3, desks: [...front.desks, ...back.map(([agent, state, activity], i) => officeDesk(5 + i, agent, state, activity, now))] };
}

export const CREW_A = crewA(Date.now());
export const CREW_B = crewB(Date.now());
export const CREW_A_STATES: readonly OfficeState[] = ["working", "thinking", "ci", "input", "done"];
export const CREW_B_STATES: readonly OfficeState[] = ["failed", "asleep", "working", "thinking", "asleep"];
/** `CREW_A`'s desk slots: 3 helpers, 6 helpers (4 drones drawn), waiting on CI, asking. */
export const CREW_SLOT = { three: 0, six: 1, ci: 2, input: 3 } as const;

/** The v1 body of GET /api/office (no client asks it since snapshot v3): a v2 snapshot without `helpers`, `v: 1`; any other body as is. */
export function asV1(body: unknown): unknown {
  const snap = body as Partial<OfficeSnapshotV2> | null;
  if (snap?.v !== 2 || !Array.isArray(snap.desks)) return body;
  return { ...snap, v: 1, desks: snap.desks.map((desk) => Object.fromEntries(Object.entries(desk).filter(([key]) => key !== "helpers"))) };
}
