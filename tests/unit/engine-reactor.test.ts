import { describe, expect, it } from "vitest";
import { flashLevel, REACTOR, REACTOR_STALE_MS, reactorState } from "@/experience/floors/engine/reactor";
import { POLL, type OfficeFeed, type OfficeFeedSnapshot } from "@/lib/office/poll";
import type { OfficeDesk, OfficeJobStatus, OfficePipeline, OfficeShip } from "@/lib/office/protocol";
import type { StatsSnapshotV1 } from "@/lib/stats/protocol";
import type { StatsState } from "@/lib/visits/store";

const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
const motion = { reducedMotion: false, now: NOW };

const desk = (slot: number, state: OfficeDesk["state"]): OfficeDesk => ({ slot, agent: "copilot", state, activity: "editing", since: NOW - 1_000, recent: [] });

const run = (id: number, statuses: OfficeJobStatus[]) => ({
  id,
  repo: "ShinyQ/ShinyQ-HQ",
  title: "CI",
  url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/1",
  status: "running" as const,
  at: NOW - 5_000,
  jobs: statuses.map((status, k) => ({ name: `job ${k}`, status })),
});

const ship = (key: string, kind: OfficeShip["kind"], status: OfficeShip["status"], at: number): OfficeShip => ({ key, kind, status, at });

function snapshot(desks: OfficeDesk[] = [], pipeline?: OfficePipeline): OfficeFeedSnapshot {
  return {
    v: 4,
    enabled: true,
    mode: "live",
    updatedAt: NOW,
    desks,
    extra: 0,
    github: [],
    today: { day: "2026-10-22", tasksDone: 0, prsMerged: 0, ciRuns: 0, ciGreen: 0 },
    ...(pipeline ? { pipeline } : {}),
  } as OfficeFeedSnapshot;
}

const feed = (snap: OfficeFeedSnapshot | null, over: Partial<OfficeFeed> = {}): OfficeFeed => ({ status: "ready", snapshot: snap, fetchedAt: NOW - 1_000, ...over });

function stats(visits: number, asks: number): StatsState {
  const snap = { v: 1, visits: { d30: visits, all: visits * 3 }, asks: { d30: { total: asks, topics: {}, chips: [] }, all: { total: asks * 3, topics: {}, chips: [] } } } as unknown as StatsSnapshotV1;
  return { status: "ready", snapshot: snap, freshness: "fresh" };
}

const busy = feed(
  snapshot([desk(0, "working"), desk(1, "asleep"), desk(2, "ci"), desk(3, "failed")], {
    runs: [run(2, ["done", "running", "queued", "failed"]), run(1, ["done", "done"])],
    ships: [ship("deploy:2", "deploy", "running", NOW - 100), ship("deploy:1", "deploy", "success", NOW - 2_000), ship("pr:a#1", "merge", "merged", NOW - 50), ship("deploy:0", "deploy", "success", NOW - 9_000), ship("deploy:3", "deploy", "failure", NOW - 10)],
  }),
);

const IDLE = { live: false, lanes: [], sparks: 0, deployAt: null, visits: null, asks: null, pulseHz: REACTOR.pulse.idle };

describe("engine reactor constants", () => {
  it("exports the brief's numbers", () => {
    expect(REACTOR).toEqual({ lanes: 24, sparks: 10, flashMs: 1500, pulse: { idle: 0.25, min: 0.3, max: 1.2 } });
  });

  it("calls a feed stale after twice the poller's keep-last window", () => {
    expect(REACTOR_STALE_MS).toBe(POLL.keepLastMs * 2);
  });
});

describe("reactorState: idle", () => {
  it("is idle for no feed and no stats", () => {
    expect(reactorState(null, null, motion)).toEqual(IDLE);
  });

  it("is idle for offline, disabled, loading and idle feeds", () => {
    for (const status of ["offline", "disabled", "loading", "idle"] as const) {
      expect(reactorState({ ...busy, status }, null, motion)).toEqual(IDLE);
    }
  });

  it("is idle for a ready feed without a snapshot", () => {
    expect(reactorState(feed(null), null, motion)).toEqual(IDLE);
  });

  it("is idle for a stale feed, live up to the stale edge", () => {
    expect(reactorState({ ...busy, fetchedAt: NOW - REACTOR_STALE_MS }, null, motion).live).toBe(true);
    expect(reactorState({ ...busy, fetchedAt: NOW - REACTOR_STALE_MS - 1 }, null, motion)).toEqual(IDLE);
  });
});

describe("reactorState: live", () => {
  it("maps the runs' jobs to lanes in the office tower's order: running runs first, newest first", () => {
    expect(reactorState(busy, null, motion).lanes).toEqual(["done", "running", "queued", "failed", "done", "done"]);
    const at = (r: ReturnType<typeof run>, ago: number, status: "running" | "success" | "failure") => ({ ...r, at: NOW - ago, status });
    const runs = [at(run(3, ["done"]), 1_000, "success"), at(run(2, ["running", "queued"]), 9_000, "running"), at(run(1, ["failed", "running"]), 5_000, "running")];
    expect(reactorState(feed(snapshot([], { runs, ships: [] })), null, motion).lanes).toEqual(["failed", "running", "running", "queued", "done"]);
  });

  it("caps lanes at REACTOR.lanes", () => {
    const many = Array.from({ length: 30 }, (_, k): OfficeJobStatus => (k % 2 ? "done" : "running"));
    const s = reactorState(feed(snapshot([], { runs: [run(9, many)], ships: [] })), null, motion);
    expect(s.lanes).toHaveLength(REACTOR.lanes);
    expect(s.lanes).toEqual(many.slice(0, REACTOR.lanes));
  });

  it("has no lanes without a pipeline or a run", () => {
    expect(reactorState(feed(snapshot([desk(0, "working")])), null, motion).lanes).toEqual([]);
    expect(reactorState(feed(snapshot([], { runs: [], ships: [] })), null, motion).lanes).toEqual([]);
  });

  it("counts awake desks as sparks, capped at REACTOR.sparks", () => {
    expect(reactorState(busy, null, motion).sparks).toBe(3);
    const crowd = Array.from({ length: 12 }, (_, k) => desk(k, "working"));
    expect(reactorState(feed(snapshot(crowd)), null, motion).sparks).toBe(REACTOR.sparks);
    expect(reactorState(feed(snapshot([desk(0, "asleep")])), null, motion).sparks).toBe(0);
  });

  it("takes the newest successful deploy only, never a merge, a running or a failed deploy", () => {
    expect(reactorState(busy, null, motion).deployAt).toBe(NOW - 2_000);
    const none = feed(snapshot([], { runs: [], ships: [ship("pr:a#1", "merge", "merged", NOW), ship("deploy:1", "deploy", "failure", NOW), ship("deploy:2", "deploy", "running", NOW)] }));
    expect(reactorState(none, null, motion).deployAt).toBeNull();
    expect(reactorState(feed(snapshot()), null, motion).deployAt).toBeNull();
  });
});

describe("reactorState: numbers and pulse", () => {
  it("shows stats numbers whether live or not, null unless ready", () => {
    expect(reactorState(null, stats(1200, 40), motion)).toMatchObject({ live: false, visits: 1200, asks: 40, pulseHz: REACTOR.pulse.idle });
    expect(reactorState(busy, stats(1200, 40), motion)).toMatchObject({ live: true, visits: 1200, asks: 40 });
    for (const status of ["idle", "loading", "hidden"] as const) {
      expect(reactorState(busy, { status, snapshot: null, freshness: "hidden" }, motion)).toMatchObject({ visits: null, asks: null });
    }
    expect(reactorState(busy, { ...stats(5, 5), status: "loading" }, motion)).toMatchObject({ visits: null, asks: null });
  });

  it("pulses at min with no numbers and is monotonic in visits plus asks, clamped to max", () => {
    expect(reactorState(busy, null, motion).pulseHz).toBeCloseTo(REACTOR.pulse.min);
    const totals = [0, 1, 9, 99, 999, 9_999, 99_999, 1_000_000];
    const hz = totals.map((t) => reactorState(busy, stats(t, 0), motion).pulseHz);
    for (let k = 1; k < hz.length; k++) expect(hz[k]).toBeGreaterThanOrEqual(hz[k - 1]);
    expect(hz[0]).toBeCloseTo(REACTOR.pulse.min);
    expect(hz.at(-1)).toBeCloseTo(REACTOR.pulse.max);
    expect(reactorState(busy, stats(9_999, 0), motion).pulseHz).toBeCloseTo(REACTOR.pulse.max);
    expect(reactorState(busy, stats(99, 0), motion).pulseHz).toBeCloseTo((REACTOR.pulse.min + REACTOR.pulse.max) / 2);
    expect(reactorState(busy, stats(60, 39), motion).pulseHz).toBeCloseTo(reactorState(busy, stats(99, 0), motion).pulseHz);
    for (const h of hz) expect(h).toBeLessThanOrEqual(REACTOR.pulse.max);
  });

  it("reduced motion forces the idle pulse and clears live data but keeps the numbers", () => {
    const s = reactorState(busy, stats(1200, 40), { reducedMotion: true, now: NOW });
    expect(s).toEqual({ ...IDLE, visits: 1200, asks: 40 });
  });
});

describe("flashLevel", () => {
  it("is 1 at the deploy, falls linearly to 0 at flashMs, 0 before and for null", () => {
    const at = NOW;
    expect(flashLevel(at, at)).toBe(1);
    expect(flashLevel(at, at + REACTOR.flashMs / 2)).toBeCloseTo(0.5);
    expect(flashLevel(at, at + REACTOR.flashMs)).toBe(0);
    expect(flashLevel(at, at + REACTOR.flashMs * 4)).toBe(0);
    expect(flashLevel(at, at - 1)).toBe(0);
    expect(flashLevel(null, at)).toBe(0);
  });
});
