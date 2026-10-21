import { describe, expect, it } from "vitest";
import { deployRunning, diffPipeline, lanesOf, PIPE, PipeQueue, runningDeployAt } from "@/experience/floors/lobby/office/pipeline";
import { PIPE_FX } from "@/experience/floors/lobby/office/pipelineFx";
import { OFFICE_FIXTURE_NOW, OFFICE_FIXTURES_V4 } from "@/lib/office/fixtures";
import type { OfficePipeline, OfficeSnapshotV4 } from "@/lib/office/protocol";

const P = (OFFICE_FIXTURES_V4.busy as OfficeSnapshotV4).pipeline;
const now = OFFICE_FIXTURE_NOW;
const withJob = (p: OfficePipeline, run: number, lane: number, status: "done" | "failed"): OfficePipeline => ({ ...p, runs: p.runs.map((r) => (r.id === run ? { ...r, jobs: r.jobs.map((j, k) => (k === lane ? { ...j, status } : j)) } : r)) });

describe("office pipeline events", () => {
  it("orders lanes: running runs first (newest first), then the others, at most 24 in all", () => {
    const lanes = lanesOf(P);
    expect(lanes).toHaveLength(PIPE.lanes);
    expect(lanes.slice(0, 3).every((l) => l.run === 1002)).toBe(true);
    expect(lanes[3]).toEqual({ run: 1001, name: "Typecheck, lint, unit tests", status: "done" });
    expect(lanesOf(null)).toEqual([]);
  });

  it("sets a silent baseline on the first snapshot", () => {
    expect(diffPipeline(null, P, now)).toEqual([]);
  });

  it("bursts on a job finishing (on its lane), crowns a finished run, packets a new run from its desk or the wall", () => {
    const k = P.runs[1].jobs.findIndex((j) => j.status === "running");
    expect(diffPipeline(P, withJob(P, 1001, k, "failed"), now)).toEqual([{ kind: "burst", lane: 3 + k, ok: false, at: now }]);
    const fin = { ...P, runs: P.runs.map((r) => (r.id === 1001 ? { ...r, status: "success" as const } : r)) };
    expect(diffPipeline(P, fin, now)).toContainEqual({ kind: "crown", ok: true, at: now });
    const fresh = { ...P.runs[0], id: 1003, slot: 7, at: now - 1_000, jobs: [] };
    expect(diffPipeline(P, { ...P, runs: [fresh, P.runs[0], P.runs[1]] }, now)).toContainEqual({ kind: "packet", from: 7, at: now - 1_000 });
    const main = { ...fresh, id: 1004, slot: undefined };
    expect(diffPipeline(P, { ...P, runs: [main, P.runs[0], P.runs[1]] }, now)).toContainEqual({ kind: "packet", from: "wall", at: now - 1_000 });
  });

  it("packages a new merge from its desk or the tower, pulses the dock on a failed deploy, and drops stale changes", () => {
    const merge = { key: "pr:x#9", kind: "merge" as const, status: "merged" as const, at: now, slot: 1 };
    expect(diffPipeline(P, { ...P, ships: [merge, ...P.ships] }, now)).toEqual([{ kind: "package", from: 1, key: "pr:x#9", at: now }]);
    expect(diffPipeline(P, { ...P, ships: [{ ...merge, slot: undefined }, ...P.ships] }, now)).toEqual([{ kind: "package", from: "tower", key: "pr:x#9", at: now }]);
    const failed = { key: "deploy:1000", kind: "deploy" as const, status: "failure" as const, at: now };
    expect(diffPipeline(P, { ...P, ships: [failed, ...P.ships] }, now)).toEqual([{ kind: "deployFailed", at: now }]);
    expect(diffPipeline(P, { ...P, ships: [{ ...merge, at: now - PIPE.staleMs - 1 }, ...P.ships] }, now)).toEqual([]);
  });

  it("reads a running deploy as the dock's shimmer, for at most 15 minutes", () => {
    const running = { ...P, ships: [{ key: "deploy:1000", kind: "deploy" as const, status: "running" as const, at: now }, ...P.ships] };
    expect(runningDeployAt(running)).toBe(now);
    expect(deployRunning(runningDeployAt(running), now)).toBe(true);
    expect(deployRunning(runningDeployAt(running), now + PIPE.deployRunMs)).toBe(false);
    expect(runningDeployAt(P)).toBeNull();
    expect(runningDeployAt(null)).toBeNull();
    expect(deployRunning(null, now)).toBe(false);
  });

  it("staggers bursts and packages, drops stale events and caps the queue", () => {
    const q = new PipeQueue();
    q.push(Array.from({ length: 50 }, (_, i) => ({ kind: "burst" as const, lane: i % 24, ok: true, at: now })));
    expect(q.size()).toBe(PIPE.maxQueue);
    expect(q.due(0, now)).toHaveLength(1);
    expect(q.due(0.1, now)).toHaveLength(0);
    expect(q.due(0.16, now)).toHaveLength(1);
    expect(q.due(0.4, now + PIPE.staleMs + 1)).toEqual([]);
    expect(q.size()).toBe(0);
  });

  it("plays no burst for a job past the tower's 24 lanes", () => {
    expect(lanesOf(P).some((l) => l.run === 998 && l.name === P.runs[2].jobs[10].name)).toBe(false);
    expect(diffPipeline(P, withJob(P, 998, 10, "failed"), now)).toEqual([]);
  });

  it("bursts on the lane of the new snapshot when the finished run drops below the running ones", () => {
    const fin = { ...P, runs: P.runs.map((r) => (r.id === 1002 ? { ...r, status: "success" as const, jobs: r.jobs.map((j, k) => (k === 0 ? { ...j, status: "done" as const } : j)) } : r)) };
    expect(diffPipeline(P, fin, now)).toEqual([
      { kind: "burst", lane: 12, ok: true, at: now },
      { kind: "crown", ok: true, at: now },
    ]);
  });

  it("diffs each snapshot against the last, but a last one over a minute old (the office was out of view) is a silent baseline", () => {
    const k = P.runs[1].jobs.findIndex((j) => j.status === "running");
    const near = new PipeQueue();
    near.see(P, now);
    near.see(withJob(P, 1001, k, "done"), now + 10_000);
    expect(near.size()).toBe(1);
    const back = new PipeQueue();
    back.see(P, now);
    back.see(withJob(P, 1001, k, "done"), now + PIPE.staleMs + 1);
    expect(back.size()).toBe(0);
    back.see(withJob(P, 1001, k, "failed"), now + PIPE.staleMs + 2_000);
    expect(back.size()).toBe(1);
    const off = new PipeQueue();
    off.see(P, now);
    off.see(null, now + 1_000);
    off.see(withJob(P, 1001, k, "done"), now + 2_000);
    expect(off.size()).toBe(0);
  });

  it("never lets a second package cut off the first in flight", () => {
    expect(PIPE.packageGap).toBeGreaterThanOrEqual(PIPE_FX.package.s);
    const q = new PipeQueue();
    const pkg = (key: string) => ({ kind: "package" as const, from: 1, key, at: now });
    q.push([pkg("a"), pkg("b")]);
    expect(q.due(0, now).map((e) => e.kind === "package" && e.key)).toEqual(["a"]);
    for (let t = 0.1; t < PIPE_FX.package.s; t += 0.1) expect(q.due(t, now)).toHaveLength(0);
    expect(q.due(PIPE.packageGap, now).map((e) => e.kind === "package" && e.key)).toEqual(["b"]);
  });

  it("reuses its buffers: the list `due` returns is the same array each step", () => {
    const q = new PipeQueue();
    const a = q.due(0, now);
    q.push([{ kind: "crown", ok: true, at: now }]);
    const b = q.due(0, now);
    expect(b).toHaveLength(1);
    expect(b).toBe(a);
    expect(q.due(1, now)).toBe(a);
    expect(a).toHaveLength(0);
  });
});
