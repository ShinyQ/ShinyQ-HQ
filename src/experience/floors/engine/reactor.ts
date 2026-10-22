import type { OfficeFeed } from "@/lib/office/poll";
import type { StatsState } from "@/lib/visits/store";

/**
 * B1's reactor core, driven by live data: the Agent Office feed (lanes from the newest CI run, sparks from awake
 * desks, a flash on the newest production deploy) and the public stats (the 30-day visits and asks set the pulse).
 * Pure of React and three, and type-only imports, so the B1 chunk stays small.
 */
export type ReactorLane = "running" | "failed" | "done" | "queued";

export interface ReactorState {
  /** A ready, fresh office feed and motion allowed. */
  live: boolean;
  /** The newest run's jobs, at most REACTOR.lanes. */
  lanes: ReactorLane[];
  /** Awake desks, 0 to REACTOR.sparks. */
  sparks: number;
  /** The newest successful production deploy's `at`. */
  deployAt: number | null;
  /** Stats `visits.d30`. */
  visits: number | null;
  /** Stats `asks.d30.total`. */
  asks: number | null;
  /** REACTOR.pulse.idle when not live, else scaled by visits plus asks within min to max. */
  pulseHz: number;
}

export const REACTOR = { lanes: 24, sparks: 10, flashMs: 1500, pulse: { idle: 0.25, min: 0.3, max: 1.2 } } as const;

/** Twice the poller's keep-last window (`POLL.keepLastMs`, 60 s), copied so this chunk never imports the poller. */
export const REACTOR_STALE_MS = 120_000;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function reactorState(office: OfficeFeed | null, stats: StatsState | null, opts: { reducedMotion: boolean; now: number }): ReactorState {
  const numbers = stats?.status === "ready" ? stats.snapshot : null;
  const visits = numbers ? numbers.visits.d30 : null;
  const asks = numbers ? numbers.asks.d30.total : null;
  const snap = office?.status === "ready" && opts.now - office.fetchedAt <= REACTOR_STALE_MS ? office.snapshot : null;
  const live = snap !== null && !opts.reducedMotion;
  if (!live) return { live: false, lanes: [], sparks: 0, deployAt: null, visits, asks, pulseHz: REACTOR.pulse.idle };

  const run = snap.pipeline?.runs[0];
  const lanes = run ? run.jobs.slice(0, REACTOR.lanes).map((j) => j.status) : [];
  const sparks = Math.min(REACTOR.sparks, snap.desks.filter((d) => d.state !== "asleep").length);
  let deployAt: number | null = null;
  for (const s of snap.pipeline?.ships ?? []) {
    if (s.kind === "deploy" && s.status === "success" && (deployAt === null || s.at > deployAt)) deployAt = s.at;
  }
  const { min, max } = REACTOR.pulse;
  const pulseHz = min + (max - min) * clamp01(Math.log10(1 + (visits ?? 0) + (asks ?? 0)) / 4);
  return { live, lanes, sparks, deployAt, visits, asks, pulseHz };
}

/** 1 at the deploy, linearly down to 0 at REACTOR.flashMs after it; 0 before it or without one. */
export function flashLevel(deployAt: number | null, now: number): number {
  if (deployAt === null || now < deployAt) return 0;
  return clamp01(1 - (now - deployAt) / REACTOR.flashMs);
}
