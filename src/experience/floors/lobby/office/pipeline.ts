import type { OfficeJobStatus, OfficePipeline, OfficePipelineRun } from "@/lib/office/protocol";

/**
 * Agent Office pipeline events (design 6.4; office scene chunk, pure): snapshots arrive by polling, so events come from
 * comparing two of them. `staleMs`: older events never play (and an older last snapshot is no diff base); `deployRunMs`:
 * how long a deploy may read as running; bursts play `burstGap` s apart and packages `packageGap` s apart (over the
 * package's 2.5 s flight, `PIPE_FX.package.s`, so one never cuts off the last in its one flying slot; a test pins it);
 * at most `maxQueue` wait. Every time here is the server's clock (the scene adds the skew it reads from `updatedAt`).
 */
export const PIPE = { staleMs: 60_000, deployRunMs: 15 * 60_000, burstGap: 0.15, packageGap: 2.6, maxQueue: 40, lanes: 24 } as const;

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

/** When the newest deploy started if it is running, else null: read once per snapshot. */
export function runningDeployAt(p: OfficePipeline | null): number | null {
  const d = p?.ships.find((s) => s.kind === "deploy");
  return d?.status === "running" ? d.at : null;
}

/** Whether a deploy running since `at` (`runningDeployAt`) still reads as running at `now`: the dock ring's shimmer. */
export const deployRunning = (at: number | null, now: number): boolean => at !== null && now - at < PIPE.deployRunMs;

/**
 * Plays events staggered in scene time `t` (bursts `burstGap` apart, packages `packageGap` apart, the rest at once),
 * dropping any whose time `at` is over `staleMs` old at `wall` (the office was out of view), at most `maxQueue` waiting.
 * No allocation per step: `due` swaps two member buffers and returns a third, valid until the next call.
 */
export class PipeQueue {
  private items: PipeEvent[] = [];
  private rest: PipeEvent[] = [];
  private out: PipeEvent[] = [];
  private nextBurst = 0;
  private nextPackage = 0;
  private prev: OfficePipeline | null = null;
  private prevAt = 0;

  /**
   * Queues the events since the last snapshot (`diffPipeline`) for `next`, seen at `now`: a last snapshot over `staleMs`
   * old (the poller stopped while the office was out of view, or failed) is a silent baseline, so nothing replays.
   */
  see(next: OfficePipeline | null, now: number): void {
    if (next) this.push(diffPipeline(now - this.prevAt <= PIPE.staleMs ? this.prev : null, next, now));
    this.prev = next;
    this.prevAt = now;
  }

  push(events: readonly PipeEvent[]): void {
    this.items.push(...events);
    if (this.items.length > PIPE.maxQueue) this.items.splice(0, this.items.length - PIPE.maxQueue);
  }

  due(t: number, wall: number): readonly PipeEvent[] {
    const out = this.out;
    out.length = 0;
    if (this.items.length === 0) return out;
    const rest = this.rest;
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
    this.items.length = 0;
    this.rest = this.items;
    this.items = rest;
    return out;
  }

  size(): number {
    return this.items.length;
  }
}
