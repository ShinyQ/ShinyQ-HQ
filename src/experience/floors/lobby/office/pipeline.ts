import type { OfficeJobStatus, OfficePipeline, OfficePipelineRun } from "@/lib/office/protocol";

/**
 * Agent Office pipeline events (design 6.4; office scene chunk, pure): snapshots arrive by polling, so events come from
 * comparing two of them. `staleMs`: older events never play; `deployRunMs`: how long a deploy may read as running;
 * bursts play `burstGap` s apart and packages `packageGap` s apart; at most `maxQueue` wait.
 */
export const PIPE = { staleMs: 60_000, deployRunMs: 15 * 60_000, burstGap: 0.15, packageGap: 1, maxQueue: 40, lanes: 24 } as const;

export type PipeEvent =
  | { kind: "packet"; from: number | "wall"; at: number }
  | { kind: "burst"; lane: number; ok: boolean; at: number }
  | { kind: "crown"; ok: boolean; at: number }
  | { kind: "package"; from: number | "tower"; key: string; at: number }
  | { kind: "deployFailed"; at: number };

export interface Lane {
  run: number;
  name: string;
  status: OfficeJobStatus;
}

const byRunning = (a: OfficePipelineRun, b: OfficePipelineRun) => Number(b.status === "running") - Number(a.status === "running") || b.at - a.at;

/** The tower's lanes bottom to top: running runs first (newest first), then the others, at most `PIPE.lanes` in all. */
export function lanesOf(p: OfficePipeline | null): Lane[] {
  const out: Lane[] = [];
  if (!p) return out;
  for (const r of [...p.runs].sort(byRunning)) for (const j of r.jobs) if (out.length < PIPE.lanes) out.push({ run: r.id, name: j.name, status: j.status });
  return out;
}

const laneIndex = (lanes: readonly Lane[], run: number, k: number): number => {
  let seen = 0;
  for (let i = 0; i < lanes.length; i++) if (lanes[i].run === run && seen++ === k) return i;
  return -1;
};

/** Events between two snapshots: the first (`prev` null, also after offline or off) is a silent baseline. */
export function diffPipeline(prev: OfficePipeline | null, next: OfficePipeline, now: number): PipeEvent[] {
  if (!prev) return [];
  const fresh = (at: number) => now - at <= PIPE.staleMs;
  const out: PipeEvent[] = [];
  const lanes = lanesOf(next);
  const before = new Map(prev.runs.map((r) => [r.id, r]));
  for (const r of next.runs) {
    const old = before.get(r.id);
    if (!old) {
      if (fresh(r.at)) out.push({ kind: "packet", from: r.slot ?? "wall", at: r.at });
      continue;
    }
    r.jobs.forEach((j, k) => {
      if ((j.status === "done" || j.status === "failed") && old.jobs[k]?.status !== j.status) {
        const lane = laneIndex(lanes, r.id, k);
        if (lane >= 0) out.push({ kind: "burst", lane, ok: j.status === "done", at: now });
      }
    });
    if (old.status === "running" && r.status !== "running") out.push({ kind: "crown", ok: r.status === "success", at: now });
  }
  const seen = new Set(prev.ships.map((s) => `${s.key}:${s.status}`));
  for (const s of next.ships) {
    if (seen.has(`${s.key}:${s.status}`) || !fresh(s.at)) continue;
    if (s.kind === "merge") out.push({ kind: "package", from: s.slot ?? "tower", key: s.key, at: s.at });
    else if (s.status === "failure") out.push({ kind: "deployFailed", at: s.at });
  }
  return out;
}

/** Whether the newest deploy is running (and started under `PIPE.deployRunMs` ago): the dock ring's shimmer. */
export function deployRunning(p: OfficePipeline | null, now: number): boolean {
  const d = p?.ships.find((s) => s.kind === "deploy");
  return d !== undefined && d.status === "running" && now - d.at < PIPE.deployRunMs;
}

/** What `due` returns with nothing queued: one shared empty list, so a still office allocates nothing per frame. */
const NONE: readonly PipeEvent[] = [];

/**
 * Plays events staggered in scene time `t` (bursts `burstGap` apart, packages `packageGap` apart, the rest at once),
 * dropping any whose wall time `at` is over `staleMs` old at `wall` (the office was out of view), at most `maxQueue` waiting.
 */
export class PipeQueue {
  private items: PipeEvent[] = [];
  private nextBurst = 0;
  private nextPackage = 0;

  push(events: readonly PipeEvent[]): void {
    this.items.push(...events);
    if (this.items.length > PIPE.maxQueue) this.items.splice(0, this.items.length - PIPE.maxQueue);
  }

  due(t: number, wall: number): readonly PipeEvent[] {
    if (this.items.length === 0) return NONE;
    const out: PipeEvent[] = [];
    const rest: PipeEvent[] = [];
    for (const e of this.items) {
      if (wall - e.at > PIPE.staleMs) continue;
      if (e.kind === "burst" && t < this.nextBurst) rest.push(e);
      else if (e.kind === "package" && t < this.nextPackage) rest.push(e);
      else {
        out.push(e);
        if (e.kind === "burst") this.nextBurst = t + PIPE.burstGap;
        if (e.kind === "package") this.nextPackage = t + PIPE.packageGap;
      }
    }
    this.items = rest;
    return out;
  }

  size(): number {
    return this.items.length;
  }
}
