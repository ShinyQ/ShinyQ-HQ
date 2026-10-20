import type { OfficeActivity, OfficeAgent, OfficeDesk, OfficeSnapshotV1, OfficeState } from "../src/lib/office/protocol";

/**
 * Deterministic Agent Office snapshots: the nine states over two snapshots, one private desk (no title) and one
 * off-duty slot. The only repository named is this site's own public one. Times are relative to `now`.
 */
export const OFFICE_REPO = "ShinyQ/ShinyQ-HQ";

/** Playwright URL patterns: both snapshot versions (the beacon's watch asks v1, the 3D office's poller `?v=2`), and v2 alone. */
export const OFFICE_API = /\/api\/office(\?v=2)?$/;
export const OFFICE_API_V2 = /\/api\/office\?v=2$/;

export function officeDesk(slot: number, agent: OfficeAgent, state: OfficeState, activity: OfficeActivity, now: number, extra: Partial<OfficeDesk> = {}): OfficeDesk {
  return { slot, agent, state, activity, since: now - 14 * 60_000, recent: [], ...extra };
}

export function officeSnapshot(desks: OfficeDesk[], now: number, extra = 0): OfficeSnapshotV1 {
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
