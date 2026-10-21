import type { OfficeFeedSnapshot } from "@/lib/office/poll";
import { OFFICE_ACTIVITIES, OFFICE_FEED, OFFICE_FEED_TITLE_MAX, OFFICE_PIPELINE, OFFICE_SEATS, OFFICE_STATES, type OfficeDeskV2, type OfficeGithubItem, type OfficePipelineRun, type OfficeShip, type OfficeState } from "@/lib/office/protocol";
import type { OfficeHistoryEvent, OfficeHistoryRun, OfficeHistoryV1 } from "@/lib/office/protocolHistory";

/**
 * The day replay engine (design 7.3; replay chunk, pure): plans a WIB day as a 30 to 60 s time-lapse and builds the
 * v4-shaped snapshot the scene renders at any playback second. Each desk is rebuilt from the day's events with the
 * live time rules (`RULES`): thinking after an event's `until` (the log leaves thinking gaps out), asleep, done and
 * removed as in the Worker's `effective`, helpers as in its `effectiveHelpers`. A synthetic snapshot is never parsed,
 * cached or served.
 */
/** Playback (design 7.3). */
export const REPLAY = { minS: 30, maxS: 60, gapS: 600, gapPlayS: 1.5, activePerS: 600, tailS: 30, shipS: 120, deployRunS: 3, restS: 6, idleS: 30, tickS: 0.25, stepS: 3600, retryS: 300 } as const;
/** The live time rules in seconds, mirrored from TIMING in workers/office/src/state.ts (a test pins them equal). */
export const RULES = { thinkingAfter: 20, asleepAfter: 180, longWaitAsleepAfter: 900, removeAfter: 1800, doneFor: 20, helpersTtl: 600 } as const;
/** Day seconds `from` to `to` play from `play0` to `play1` playback seconds. */
export interface Span {
  from: number;
  to: number;
  play0: number;
  play1: number;
}
export interface ReplayPlan {
  day: string;
  spans: Span[];
  duration: number;
  /** Event indexes per ordinal, in time order. */
  byN: number[][];
  /** Day seconds a session became done (the "tasks done" counter, as the Worker counts it). */
  doneAt: number[];
}

const LONG: readonly OfficeState[] = ["testing", "ci", "input"];
const DAY_S = 86_400;
const sleepAfter = (state: OfficeState) => (LONG.includes(state) ? RULES.longWaitAsleepAfter : RULES.asleepAfter);
/** Whether event `e` keeps the state of `p` (the same session's previous event) with no removal between; `activity` also compares the activities. */
const goesOn = (p: OfficeHistoryEvent, e: OfficeHistoryEvent, activity = true) => p[3] === e[3] && (!activity || p[4] === e[4]) && p[5] + RULES.removeAfter > e[0];

/** Day seconds where something happens: an awake event until its session would sleep, a merge or deploy plus 30 s, a run from start to end plus 30 s. */
function busy(h: OfficeHistoryV1): [number, number][] {
  const out: [number, number][] = [];
  for (const [t, , , s, , until] of h.events) {
    const state = OFFICE_STATES[s];
    if (state !== "asleep") out.push([t, Math.max(t, until) + sleepAfter(state)]);
  }
  for (const [t] of h.prs) out.push([t, t + REPLAY.tailS]);
  for (const [t] of h.deploys) out.push([t, t + REPLAY.tailS]);
  for (const [t, end] of h.runs) out.push([t, end + REPLAY.tailS]);
  return out.sort((a, b) => a[0] - b[0]);
}

/** The day's playback plan, or null when nothing happened. */
export function planReplay(h: OfficeHistoryV1): ReplayPlan | null {
  const raw = busy(h);
  if (!raw.length) return null;
  // Active stretches: a quiet gap of at most gapS joins its neighbours; longer gaps play in gapPlayS each (less when there are many).
  const runs: [number, number][] = [];
  for (const [a, b] of raw) {
    const last = runs.at(-1);
    if (last && a - last[1] <= REPLAY.gapS) last[1] = Math.max(last[1], Math.min(b, DAY_S));
    else runs.push([a, Math.min(b, DAY_S)]);
  }
  const active = runs.reduce((s, [a, b]) => s + (b - a), 0);
  const gaps = runs.length - 1;
  const gapPlay = gaps ? Math.min(REPLAY.gapPlayS, REPLAY.maxS / 2 / gaps) : 0;
  const total = Math.min(REPLAY.maxS, Math.max(REPLAY.minS, gaps * gapPlay + active / REPLAY.activePerS));
  const rate = (total - gaps * gapPlay) / Math.max(1, active);
  const spans: Span[] = [];
  let p = 0;
  runs.forEach(([a, b], i) => {
    if (i > 0) spans.push({ from: runs[i - 1][1], to: a, play0: p, play1: (p += gapPlay) });
    spans.push({ from: a, to: b, play0: p, play1: (p += (b - a) * rate) });
  });
  const byN: number[][] = h.agents.map(() => []);
  const doneAt: number[] = [];
  h.events.forEach((e, i) => {
    const prev = byN[e[1]].at(-1);
    if (OFFICE_STATES[e[3]] === "done" && (prev === undefined || !goesOn(h.events[prev], e, false))) doneAt.push(e[0]);
    byN[e[1]].push(i);
  });
  return { day: h.day, spans, duration: p, byN, doneAt };
}

const lerp = (x: number, a: number, b: number, c: number, d: number) => (b === a ? c : c + ((x - a) * (d - c)) / (b - a));

/** Playback seconds to day seconds. */
export function dayTime(plan: ReplayPlan, playS: number): number {
  const s = plan.spans.find((x) => playS <= x.play1) ?? plan.spans.at(-1)!;
  return lerp(Math.max(s.play0, Math.min(s.play1, playS)), s.play0, s.play1, s.from, s.to);
}

/** Day seconds to playback seconds, clamped to the plan. */
export function playTime(plan: ReplayPlan, dayS: number): number {
  const s = plan.spans.find((x) => dayS <= x.to) ?? plan.spans.at(-1)!;
  return lerp(Math.max(s.from, Math.min(s.to, dayS)), s.from, s.to, s.play0, s.play1);
}

interface DeskAt {
  n: number;
  t: number;
  seat: number;
  state: OfficeState;
  activity: (typeof OFFICE_ACTIVITIES)[number];
  since: number;
  helpers: number;
}

/**
 * Ordinal `n` at day second `T` under the live rules (`effective`, `effectiveHelpers`) with `min(T, until)` as its last
 * beat; `since` is its first event of the same state and activity, back to a removal (a returning session starts
 * over). Null before its first event or once removed.
 */
function deskAt(h: OfficeHistoryV1, plan: ReplayPlan, n: number, T: number): DeskAt | null {
  const idx = plan.byN[n];
  const ev = (i: number) => h.events[idx[i]];
  let k = -1;
  while (k + 1 < idx.length && ev(k + 1)[0] <= T) k++;
  if (k < 0) return null;
  const e = ev(k);
  let first = k;
  while (first > 0 && goesOn(ev(first - 1), ev(first))) first--;
  const beat = Math.min(T, e[5]);
  const quiet = T - beat;
  if (quiet >= RULES.removeAfter) return null;
  let state = OFFICE_STATES[e[3]];
  let activity = OFFICE_ACTIVITIES[e[4]];
  let since = ev(first)[0];
  if (state === "done") {
    if (T - since >= RULES.doneFor) [state, activity, since] = ["asleep", "resting", since + RULES.doneFor];
  } else if (state !== "asleep" && state !== "failed") {
    const sleep = sleepAfter(state);
    if (quiet >= sleep) [state, activity, since] = ["asleep", "resting", beat + sleep];
    else if ((state === "working" || state === "reviewing") && quiet >= RULES.thinkingAfter) [state, activity, since] = ["thinking", "planning", beat + RULES.thinkingAfter];
  }
  const helpers = state !== "asleep" && quiet < RULES.helpersTtl ? e[6] : 0;
  return { n, t: e[0], seat: e[2], state, activity, since, helpers };
}

/** A finished or running run's lanes: done in order over its span, the last lane failed when it failed. */
function runAt(r: OfficeHistoryRun, i: number, T: number, at: (s: number) => number): OfficePipelineRun {
  const [t, end, seat, ok, jobs] = r;
  const n = Math.max(1, jobs);
  const running = T < end;
  const k = running ? Math.floor((n * (T - t)) / Math.max(1, end - t)) : n;
  return {
    id: -(i + 1),
    repo: "",
    title: "",
    url: "",
    status: running ? "running" : ok ? "success" : "failure",
    ...(seat >= 0 ? { slot: seat } : {}),
    at: at(t),
    jobs: Array.from({ length: n }, (_, j) => ({ name: "Job", status: j < k ? (!running && !ok && j === n - 1 ? "failed" : "done") : j === k ? "running" : "queued" })),
  };
}

/** The v4-shaped snapshot at `playS`, its times on a playback clock that started at epoch ms `epoch`. */
export function snapshotAt(h: OfficeHistoryV1, plan: ReplayPlan, playS: number, epoch: number): OfficeFeedSnapshot {
  const T = dayTime(plan, playS);
  const at = (dayS: number) => Math.round(epoch + playTime(plan, dayS) * 1000);
  const all = h.agents.map((_, n) => deskAt(h, plan, n, T)).filter((d): d is DeskAt => d !== null);
  // One desk per seat: the latest event wins (seats are unique in the live office; this guards a truncated day).
  const taken = new Set<number>();
  const desks: OfficeDeskV2[] = [];
  let extra = 0;
  for (const d of [...all].sort((a, b) => b.t - a.t)) {
    if (d.seat < 0 || d.seat >= OFFICE_SEATS || taken.has(d.seat)) {
      extra++;
      continue;
    }
    taken.add(d.seat);
    const task = h.tasks[d.n];
    desks.push({ slot: d.seat, agent: h.agents[d.n], state: d.state, activity: d.activity, since: at(d.since), ...(task ? { repo: task.repo, ...(task.title ? { title: task.title } : {}) } : {}), recent: [], ...(d.helpers ? { helpers: d.helpers } : {}) });
  }
  const merged = h.prs.filter((p) => p[0] <= T);
  const finished = h.runs.filter((r) => r[1] <= T);
  const github: OfficeGithubItem[] = merged
    .filter((p) => p[2] !== "")
    .slice(-OFFICE_FEED)
    .reverse()
    .map(([t, , repo, number, title]) => ({ kind: "pr", status: "merged", repo, title: `#${number} ${title}`.slice(0, OFFICE_FEED_TITLE_MAX), at: at(t), url: `https://github.com/${repo}/pull/${number}` }));
  const runs = h.runs
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r[0] <= T && T - r[1] <= REPLAY.shipS)
    .sort((a, b) => b.r[0] - a.r[0])
    .slice(0, OFFICE_PIPELINE.runs)
    .map(({ r, i }) => runAt(r, i, T, at));
  const ships: OfficeShip[] = [];
  h.prs.forEach((p, i) => {
    if (p[0] <= T && T - p[0] <= REPLAY.shipS) ships.push({ key: `pr:${i}`, kind: "merge", status: "merged", at: at(p[0]), ...(p[1] >= 0 ? { slot: p[1] } : {}) });
  });
  h.deploys.forEach((d, i) => {
    const lead = playTime(plan, d[0]) - playS;
    if (lead <= REPLAY.deployRunS && T - d[0] <= REPLAY.shipS) ships.push({ key: `deploy:${i}`, kind: "deploy", status: lead > 0 ? "running" : d[1] ? "success" : "failure", at: at(d[0]) });
  });
  ships.sort((a, b) => b.at - a.at);
  return {
    v: 4,
    enabled: true,
    mode: all.length ? "live" : "semi-live",
    updatedAt: Math.round(epoch + playS * 1000),
    desks: desks.sort((a, b) => a.slot - b.slot),
    extra,
    github,
    today: { day: h.day, tasksDone: plan.doneAt.filter((t) => t <= T).length, prsMerged: merged.length, ciRuns: finished.length, ciGreen: finished.filter((r) => r[3] === 1).length },
    pipeline: { runs, ships: ships.slice(0, OFFICE_PIPELINE.ships) },
  };
}
