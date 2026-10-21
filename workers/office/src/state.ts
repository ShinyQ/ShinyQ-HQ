import { OFFICE_DESKS, OFFICE_FEED, OFFICE_FEED_TITLE_MAX, OFFICE_HELPERS_MAX, OFFICE_PIPELINE, OFFICE_RECENT, OFFICE_SEATS, wibDay } from "../../../src/lib/office/protocol";
import type {
  OfficeActivity,
  OfficeAgent,
  OfficeBeatV1,
  OfficeDesk,
  OfficeDeskV2,
  OfficeGithubItem,
  OfficePipeline,
  OfficePipelineJob,
  OfficePipelineRun,
  OfficeProgress,
  OfficeRecent,
  OfficeShip,
  OfficeSnapshotV1,
  OfficeSnapshotV2,
  OfficeSnapshotV3,
  OfficeSnapshotV4,
  OfficeState,
  OfficeToday,
} from "../../../src/lib/office/protocol";

/** Time rules and caps (spec section 3.3); every rule is applied from `now`, so the Durable Object needs no alarm. */
export const TIMING = {
  thinkingAfter: 20_000,
  asleepAfter: 3 * 60_000,
  longWaitAsleepAfter: 15 * 60_000,
  removeAfter: 30 * 60_000,
  doneFor: 20_000,
  /** Helpers show only while the session beat within this window (a lost stop event decays). */
  helpersTtl: 10 * 60_000,
  runStaleAfter: 6 * 3_600_000,
  deliveriesKept: 200,
  prsKept: 50,
  runsKept: 20,
  publicReposKept: 50,
} as const;

export interface SessionRecord {
  id: string;
  agent: OfficeAgent;
  /**
   * Front-row seat (0 to 4) or null. A Worker from before ten seats reads only this field, so it never holds a back-row
   * seat: after a rollback that Worker counts back-row sessions as waiting (`extra`) and its snapshots stay valid.
   */
  slot: number | null;
  /** Back-row seat (5 to 9), absent otherwise. The seat is `slot ?? seat` (`seatOf`); a set `slot` wins. */
  seat?: number;
  firstSeen: number;
  lastBeat: number;
  state: OfficeState;
  activity: OfficeActivity;
  since: number;
  repo?: string;
  branch?: string;
  title?: string;
  /** Active helpers (sub-agents) from the last beat that carried a count; absent at 0. */
  helpers?: number;
  recent: OfficeRecent[];
}

export type RunStatus = "running" | "success" | "failure" | "cancelled";
export type JobStatus = "queued" | "running" | "done" | "failed";

export interface RunRecord {
  id: number;
  /** GitHub's `run_attempt`: a re-run keeps the run id and raises it. */
  attempt: number;
  repo: string;
  branch: string;
  title: string;
  url: string;
  status: Exclude<RunStatus, "cancelled">;
  jobs: Record<string, JobStatus>;
  /** Laned job ids in first-seen order, at most OFFICE_PIPELINE.jobs (absent in runs stored before snapshot v4). */
  order?: string[];
  /** Laned job names, cut to OFFICE_PIPELINE.jobName (absent in runs stored before snapshot v4). */
  names?: Record<string, string>;
  failedJob?: string;
  /** First seen, this attempt (absent in runs stored before snapshot v4, which fall back to `updated`). */
  started?: number;
  updated: number;
}

export interface PrRecord {
  repo: string;
  branch: string;
  number: number;
  title: string;
  updated: number;
}

export interface FeedRecord extends OfficeGithubItem {
  key: string;
  /** A deploy to the `production` environment (deploys only; absent in items stored before snapshot v4). */
  production?: boolean;
}

/** The Durable Object's whole state: one JSON document, one storage row. */
export interface OfficeDoc {
  v: 1;
  sessions: SessionRecord[];
  runs: RunRecord[];
  prs: PrRecord[];
  feed: FeedRecord[];
  publicRepos: string[];
  deliveries: string[];
  /** Cancelled runs (newest first, `TIMING.runsKept` at most), so a late delivery of the same attempt cannot bring one back. Absent in older stored documents. */
  cancelled: { id: number; attempt: number }[];
  today: OfficeToday;
}

export type GithubChange =
  | { type: "run"; id: number; attempt: number; branch: string; title: string; url: string; status: RunStatus }
  | { type: "job"; runId: number; attempt: number; jobId: string; name: string; status: JobStatus }
  | { type: "pr"; number: number; branch: string; title: string; url: string; action: "opened" | "merged" }
  | { type: "push"; sha: string; title: string; url: string }
  | { type: "deploy"; id: number; title: string; url: string; status: "running" | "success" | "failure"; production?: boolean }
  | { type: "privatized" };

/** One webhook delivery for one allowlisted public repository. */
export interface GithubUpdate {
  repo: string;
  changes: GithubChange[];
}

/** What the Worker posts to the Durable Object's /github. */
export interface GithubMessage {
  delivery: string;
  update: GithubUpdate;
}

export interface Effective {
  state: OfficeState;
  activity: OfficeActivity;
  since: number;
}

const zeroToday = (now: number): OfficeToday => ({ day: wibDay(now), tasksDone: 0, prsMerged: 0, ciRuns: 0, ciGreen: 0 });
const rollToday = (today: OfficeToday, now: number): OfficeToday => (today.day === wibDay(now) ? today : zeroToday(now));

export function emptyDoc(now: number): OfficeDoc {
  return { v: 1, sessions: [], runs: [], prs: [], feed: [], publicRepos: [], deliveries: [], cancelled: [], today: zeroToday(now) };
}

const LONG_WAITS: readonly OfficeState[] = ["testing", "ci", "input"];

/** The state a session shows at `now`, or null once it is removed (30 min without a beat). */
export function effective(s: SessionRecord, now: number): Effective | null {
  const quiet = now - s.lastBeat;
  if (quiet >= TIMING.removeAfter) return null;
  const own: Effective = { state: s.state, activity: s.activity, since: s.since };
  if (s.state === "asleep" || s.state === "failed") return own;
  if (s.state === "done") return now - s.since >= TIMING.doneFor ? { state: "asleep", activity: "resting", since: s.since + TIMING.doneFor } : own;
  const sleepAfter = LONG_WAITS.includes(s.state) ? TIMING.longWaitAsleepAfter : TIMING.asleepAfter;
  if (quiet >= sleepAfter) return { state: "asleep", activity: "resting", since: s.lastBeat + sleepAfter };
  if ((s.state === "working" || s.state === "reviewing") && quiet >= TIMING.thinkingAfter) return { state: "thinking", activity: "planning", since: s.lastBeat + TIMING.thinkingAfter };
  return own;
}

const isAsleep = (s: SessionRecord, now: number) => effective(s, now)?.state === "asleep";

/** A session's seat (0 to 9) or null: `slot` (front row) wins over `seat` (back row). */
export const seatOf = (s: SessionRecord): number | null => s.slot ?? s.seat ?? null;

/** Stores seat `n` where a Worker from before ten seats can read it: 0 to 4 in `slot`, anything above in `seat`. */
function withSeat(s: SessionRecord, n: number | null): SessionRecord {
  const out: SessionRecord = { ...s, slot: n !== null && n >= OFFICE_DESKS ? null : n };
  if (n !== null && n >= OFFICE_DESKS) out.seat = n;
  else delete out.seat;
  return out;
}

/**
 * A stored document in the current seat layout: a slot of 5 or more (stored before back-row seats moved to `seat`)
 * becomes `seat`, and a `seat` next to a set `slot` (an older Worker seated that session in front) is cleared. Returns
 * the same document when nothing changes.
 */
export function migrateDoc(doc: OfficeDoc): OfficeDoc {
  const stale = (s: SessionRecord) => s.slot !== null && (s.slot >= OFFICE_DESKS || s.seat !== undefined);
  return doc.sessions.some(stale) ? { ...doc, sessions: doc.sessions.map((s) => (stale(s) ? withSeat(s, s.slot) : s)) } : doc;
}

/**
 * Stable seats over OFFICE_SEATS (ten): keep valid seats; a back-row session (seat 5 to 9) moves to a free front-row
 * seat (slots 0 to 4, oldest first), so the front row fills first; then free seats go to waiting sessions (oldest
 * first, lowest seat first). Only when all ten are taken may an awake one take the longest-asleep seat. For at most
 * five sessions, v1 and v2 (which show only the front row) see what they saw with five desks.
 */
export function assignSlots(sessions: SessionRecord[], now: number): SessionRecord[] {
  const out = sessions.map((s) => ({ s, n: seatOf(s) }));
  const taken = new Set<number>();
  for (const o of out) {
    if (o.n !== null && Number.isInteger(o.n) && o.n >= 0 && o.n < OFFICE_SEATS && !taken.has(o.n)) taken.add(o.n);
    else o.n = null;
  }
  type Seat = (typeof out)[number];
  const oldest = (a: Seat, b: Seat) => a.s.firstSeen - b.s.firstSeen || (a.s.id < b.s.id ? -1 : 1);
  const freeSeat = (seats: number) => Array.from({ length: seats }, (_, n) => n).find((n) => !taken.has(n));
  for (const o of out.filter((x) => x.n !== null && x.n >= OFFICE_DESKS).sort(oldest)) {
    const front = freeSeat(OFFICE_DESKS);
    if (front === undefined) break;
    taken.delete(o.n as number);
    o.n = front;
    taken.add(front);
  }
  const waiting = out.filter((o) => o.n === null).sort(oldest);
  for (const o of waiting) {
    const free = freeSeat(OFFICE_SEATS);
    if (free !== undefined) {
      o.n = free;
      taken.add(free);
      continue;
    }
    if (isAsleep(o.s, now)) continue;
    const sleeper = out.filter((x) => x.n !== null && isAsleep(x.s, now)).sort((a, b) => a.s.lastBeat - b.s.lastBeat)[0];
    if (sleeper) {
      o.n = sleeper.n;
      sleeper.n = null;
    }
  }
  return out.map(({ s, n }) => withSeat(s, n));
}

/** Applies one sanitized beat. `repo`, `branch` and `title` stay only for repositories a webhook reported public. */
export function applyBeat(doc: OfficeDoc, beat: OfficeBeatV1, now: number): OfficeDoc {
  const today = rollToday(doc.today, now);
  const prev = doc.sessions.find((s) => s.id === beat.session);
  const changed = !prev || prev.state !== beat.state || prev.activity !== beat.activity;
  const keep = beat.repo !== undefined && doc.publicRepos.includes(beat.repo);
  const helpers = beat.helpers ?? prev?.helpers;
  const record: SessionRecord = {
    id: beat.session,
    agent: beat.agent,
    slot: prev?.slot ?? null,
    ...(prev?.seat !== undefined ? { seat: prev.seat } : {}),
    firstSeen: prev?.firstSeen ?? now,
    lastBeat: now,
    state: beat.state,
    activity: beat.activity,
    since: !prev || changed ? now : prev.since,
    ...(keep ? { repo: beat.repo } : {}),
    ...(keep && beat.branch ? { branch: beat.branch } : {}),
    ...(keep && beat.title ? { title: beat.title } : {}),
    ...(helpers ? { helpers } : {}),
    recent: !prev || changed ? [{ state: beat.state, activity: beat.activity, at: now }, ...(prev?.recent ?? [])].slice(0, OFFICE_RECENT) : prev.recent,
  };
  const tasksDone = today.tasksDone + (beat.state === "done" && prev?.state !== "done" ? 1 : 0);
  const others = doc.sessions.filter((s) => s.id !== beat.session && effective(s, now) !== null);
  return { ...doc, sessions: assignSlots([...others, record], now), today: { ...today, tasksDone } };
}

function progressOf(run: RunRecord): OfficeProgress | undefined {
  const states = Object.values(run.jobs);
  if (states.length === 0) return undefined;
  return { done: states.filter((s) => s === "done" || s === "failed").length, total: states.length };
}

function upsertFeed(feed: FeedRecord[], item: FeedRecord): FeedRecord[] {
  return [{ ...item, title: item.title.slice(0, OFFICE_FEED_TITLE_MAX) }, ...feed.filter((f) => f.key !== item.key)].slice(0, OFFICE_FEED);
}

function failSession(s: SessionRecord, now: number): SessionRecord {
  return { ...s, state: "failed", activity: "failed", since: now, recent: [{ state: "failed" as const, activity: "failed" as const, at: now }, ...s.recent].slice(0, OFFICE_RECENT) };
}

function applyChange(doc: OfficeDoc, repo: string, c: GithubChange, now: number): OfficeDoc {
  switch (c.type) {
    case "run": {
      const key = `run:${c.id}`;
      const prev = doc.runs.find((r) => r.id === c.id);
      // GitHub does not order deliveries: an older attempt, or a late "running" of a completed attempt, changes nothing.
      if (prev && (c.attempt < prev.attempt || (c.attempt === prev.attempt && c.status === "running" && prev.status !== "running"))) return doc;
      // A cancelled run is removed, so its record is what stops a late delivery of that attempt from recreating it.
      if (!prev && doc.cancelled.some((x) => x.id === c.id && x.attempt >= c.attempt)) return doc;
      const others = doc.cancelled.filter((x) => x.id !== c.id);
      if (c.status === "cancelled") return { ...doc, runs: doc.runs.filter((r) => r.id !== c.id), feed: doc.feed.filter((f) => f.key !== key), cancelled: [{ id: c.id, attempt: c.attempt }, ...others].slice(0, TIMING.runsKept) };
      const restart = prev !== undefined && c.attempt > prev.attempt;
      const kept = restart ? undefined : prev;
      const run: RunRecord = {
        id: c.id,
        attempt: c.attempt,
        repo,
        branch: c.branch,
        title: c.title,
        url: c.url,
        status: c.status,
        jobs: kept?.jobs ?? {},
        ...(kept?.order ? { order: kept.order } : {}),
        ...(kept?.names ? { names: kept.names } : {}),
        ...(kept?.failedJob ? { failedJob: kept.failedJob } : {}),
        started: kept ? (kept.started ?? kept.updated) : now,
        updated: now,
      };
      const counted = c.status !== "running" && (!prev || prev.status === "running" || restart);
      const today = counted ? { ...doc.today, ciRuns: doc.today.ciRuns + 1, ciGreen: doc.today.ciGreen + (c.status === "success" ? 1 : 0) } : doc.today;
      const sessions = c.status === "failure" ? doc.sessions.map((s) => (s.state === "ci" && s.repo === repo && s.branch === c.branch ? failSession(s, now) : s)) : doc.sessions;
      const progress = c.status === "running" ? progressOf(run) : undefined;
      const feed = upsertFeed(doc.feed, { key, kind: "run", status: c.status, repo, title: c.title, at: now, url: c.url, ...(progress ? { progress } : {}) });
      return { ...doc, runs: [run, ...doc.runs.filter((r) => r.id !== c.id)], cancelled: others, today, sessions, feed };
    }
    case "job": {
      const run = doc.runs.find((r) => r.id === c.runId && r.repo === repo);
      if (!run || c.attempt < run.attempt) return doc;
      const order = laneOrder(run);
      const known = order.includes(c.jobId);
      const laned = known || order.length < OFFICE_PIPELINE.jobs;
      const updated: RunRecord = {
        ...run,
        jobs: { ...run.jobs, [c.jobId]: c.status },
        ...(laned ? { order: known ? order : [...order, c.jobId], names: { ...run.names, [c.jobId]: c.name.slice(0, OFFICE_PIPELINE.jobName).trim() } } : {}),
        ...(c.status === "failed" ? { failedJob: c.name } : {}),
        updated: now,
      };
      const progress = progressOf(updated);
      const feed = doc.feed.map((f) => (f.key === `run:${run.id}` && f.status === "running" && progress ? { ...f, progress } : f));
      return { ...doc, runs: doc.runs.map((r) => (r.id === run.id ? updated : r)), feed };
    }
    case "pr": {
      const prs = [{ repo, branch: c.branch, number: c.number, title: c.title, updated: now }, ...doc.prs.filter((p) => !(p.repo === repo && p.number === c.number))].slice(0, TIMING.prsKept);
      const today = c.action === "merged" ? { ...doc.today, prsMerged: doc.today.prsMerged + 1 } : doc.today;
      return { ...doc, prs, today, feed: upsertFeed(doc.feed, { key: `pr:${repo}#${c.number}`, kind: "pr", status: c.action, repo, title: `#${c.number} ${c.title}`, at: now, url: c.url }) };
    }
    case "push":
      return { ...doc, feed: upsertFeed(doc.feed, { key: `push:${c.sha}`, kind: "push", status: "pushed", repo, title: c.title, at: now, url: c.url }) };
    case "deploy":
      return { ...doc, feed: upsertFeed(doc.feed, { key: `deploy:${c.id}`, kind: "deploy", status: c.status, repo, title: c.title, at: now, url: c.url, ...(c.production !== undefined ? { production: c.production } : {}) }) };
    case "privatized":
      return {
        ...doc,
        publicRepos: doc.publicRepos.filter((r) => r !== repo),
        runs: doc.runs.filter((r) => r.repo !== repo),
        prs: doc.prs.filter((p) => p.repo !== repo),
        feed: doc.feed.filter((f) => f.repo !== repo),
        sessions: doc.sessions.map((s) => (s.repo === repo ? { id: s.id, agent: s.agent, slot: s.slot, ...(s.seat !== undefined ? { seat: s.seat } : {}), firstSeen: s.firstSeen, lastBeat: s.lastBeat, state: s.state, activity: s.activity, since: s.since, ...(s.helpers ? { helpers: s.helpers } : {}), recent: s.recent } : s)),
      };
  }
}

/** Applies one webhook delivery (deduped by its delivery id) for an allowlisted public repository; a privatized one is forgotten. */
export function applyGithub(doc: OfficeDoc, update: GithubUpdate, delivery: string, now: number): OfficeDoc {
  if (delivery && doc.deliveries.includes(delivery)) return doc;
  const privatized = update.changes.some((c) => c.type === "privatized");
  let next: OfficeDoc = {
    ...doc,
    today: rollToday(doc.today, now),
    cancelled: doc.cancelled ?? [],
    publicRepos: privatized || doc.publicRepos.includes(update.repo) ? doc.publicRepos : [...doc.publicRepos, update.repo].slice(-TIMING.publicReposKept),
    deliveries: delivery ? [...doc.deliveries, delivery].slice(-TIMING.deliveriesKept) : doc.deliveries,
  };
  for (const change of update.changes) next = applyChange(next, update.repo, change, now);
  return {
    ...next,
    runs: next.runs.filter((r) => now - r.updated < TIMING.runStaleAfter).slice(0, TIMING.runsKept),
    sessions: next.sessions.filter((s) => effective(s, now) !== null),
  };
}

function deskOf(doc: OfficeDoc, s: SessionRecord, e: Effective): OfficeDesk {
  const sameBranch = <T extends { repo: string; branch: string }>(r: T) => s.repo !== undefined && r.repo === s.repo && r.branch === s.branch;
  const run = s.branch ? doc.runs.find(sameBranch) : undefined;
  const pr = s.branch ? doc.prs.find(sameBranch) : undefined;
  const title = (pr?.title ?? s.title)?.slice(0, OFFICE_FEED_TITLE_MAX);
  const progress = e.state === "ci" && run?.status === "running" ? progressOf(run) : undefined;
  const job = e.state === "failed" ? run?.failedJob : undefined;
  return {
    slot: seatOf(s) ?? 0,
    agent: s.agent,
    state: e.state,
    activity: e.activity,
    since: e.since,
    ...(s.repo ? { repo: s.repo } : {}),
    ...(title ? { title } : {}),
    ...(progress ? { progress } : {}),
    ...(job ? { job } : {}),
    recent: s.recent,
  };
}

const feedItem = (f: FeedRecord): OfficeGithubItem => ({ kind: f.kind, status: f.status, repo: f.repo, title: f.title, at: f.at, url: f.url, ...(f.progress ? { progress: f.progress } : {}) });

/** Helpers show while the session is awake and beat within the last 10 min (a lost stop event decays). */
export function effectiveHelpers(s: SessionRecord, e: Effective, now: number): number {
  if (!s.helpers || e.state === "asleep" || now - s.lastBeat >= TIMING.helpersTtl) return 0;
  return Math.min(OFFICE_HELPERS_MAX, s.helpers);
}

/** A run's laned job ids: `order`, or (a run stored before B) its first job ids. */
const laneOrder = (r: RunRecord): string[] => r.order ?? Object.keys(r.jobs).slice(0, OFFICE_PIPELINE.jobs);

const JOB_RANK: Record<JobStatus, number> = { done: 0, queued: 1, running: 2, failed: 3 };

/** The served lanes: laned jobs in first-seen order; jobs past the cap fold into the last lane (failed over running over queued over done). */
function lanesOf(r: RunRecord): OfficePipelineJob[] {
  const order = laneOrder(r);
  const rest = Object.keys(r.jobs).filter((id) => !order.includes(id));
  return order.map((id, i) => {
    let status: JobStatus = r.jobs[id] ?? "queued";
    if (i === order.length - 1) for (const k of rest) if (JOB_RANK[r.jobs[k]] > JOB_RANK[status]) status = r.jobs[k];
    return { name: r.names?.[id] ?? "Job", status };
  });
}

/** The effective seat (0 to 9, `seatOf`) of the live session on `repo` and `branch` that beat last, if any. */
function seatFor(doc: OfficeDoc, repo: string, branch: string, now: number): number | undefined {
  let best: SessionRecord | undefined;
  for (const s of doc.sessions) if (s.repo === repo && s.branch === branch && seatOf(s) !== null && effective(s, now) !== null && (!best || s.lastBeat > best.lastBeat)) best = s;
  return best ? (seatOf(best) ?? undefined) : undefined;
}

/** Only production deploys ship (the dock's beam); an item stored before the `production` flag falls back to the ingest title. */
const isProductionDeploy = (f: FeedRecord) => f.kind === "deploy" && (f.production ?? f.title === "Deploy · production");

/** The v4 pipeline block (design 6.2): the newest runs with their lanes, and the latest merges and production deploys from the feed. */
export function pipelineOf(doc: OfficeDoc, now: number): OfficePipeline {
  const runs = [...doc.runs]
    .sort((a, b) => (b.started ?? b.updated) - (a.started ?? a.updated))
    .slice(0, OFFICE_PIPELINE.runs)
    .map((r): OfficePipelineRun => {
      const slot = seatFor(doc, r.repo, r.branch, now);
      return { id: r.id, repo: r.repo, title: r.title.slice(0, OFFICE_FEED_TITLE_MAX), url: r.url, status: r.status, ...(slot !== undefined ? { slot } : {}), at: r.started ?? r.updated, jobs: lanesOf(r) };
    });
  const ships = doc.feed
    .filter((f) => (f.kind === "pr" && f.status === "merged") || isProductionDeploy(f))
    .slice(0, OFFICE_PIPELINE.ships)
    .map((f): OfficeShip => {
      const pr = f.kind === "pr" ? doc.prs.find((p) => f.key === `pr:${p.repo}#${p.number}`) : undefined;
      const slot = pr ? seatFor(doc, pr.repo, pr.branch, now) : undefined;
      return { key: f.key, kind: f.kind === "pr" ? "merge" : "deploy", status: f.status as OfficeShip["status"], at: f.at, ...(slot !== undefined ? { slot } : {}) };
    });
  return { runs, ships };
}

/** The live sessions and those on seats below `count` (sorted by seat); the others count in `extra`. */
function seats(doc: OfficeDoc, now: number, count: number) {
  const live = doc.sessions.flatMap((s) => {
    const e = effective(s, now);
    return e ? [{ s, e, n: seatOf(s) }] : [];
  });
  const seated = live.filter(({ n }) => n !== null && n < count).sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
  return { live, seated };
}

/**
 * The public v1 snapshot at `now` (time rules applied, nothing written): the front row's five desks (slots 0 to 4),
 * sessions on other seats in `extra`. Never carries `helpers`: v1 never changes.
 */
export function view(doc: OfficeDoc, now: number): OfficeSnapshotV1 {
  const { live, seated } = seats(doc, now, OFFICE_DESKS);
  return {
    v: 1,
    enabled: true,
    mode: live.length > 0 ? "live" : "semi-live",
    updatedAt: now,
    desks: seated.map(({ s, e }) => deskOf(doc, s, e)),
    extra: live.length - seated.length,
    github: doc.feed.map(feedItem),
    today: rollToday(doc.today, now),
  };
}

/** The v1 view over `count` seats with `v` and desk `helpers` (1 to 9, absent at 0). */
function withHelpers<V extends 2 | 3>(doc: OfficeDoc, now: number, count: number, v: V): Omit<OfficeSnapshotV1, "v" | "desks"> & { v: V; desks: OfficeDeskV2[] } {
  const { live, seated } = seats(doc, now, count);
  return {
    ...view(doc, now),
    v,
    desks: seated.map(({ s, e }) => {
      const d = deskOf(doc, s, e);
      const h = effectiveHelpers(s, e, now);
      return h > 0 ? { ...d, helpers: h } : d;
    }),
    extra: live.length - seated.length,
  };
}

/** The public v2 snapshot at `now`: the v1 view (five desks, the rest in `extra`) with `v: 2` and desk `helpers`. */
export function viewV2(doc: OfficeDoc, now: number): OfficeSnapshotV2 {
  return withHelpers(doc, now, OFFICE_DESKS, 2);
}

/** The public v3 snapshot at `now`: the v2 view over all ten seats (slots 0 to 9), sessions past ten in `extra`. */
export function viewV3(doc: OfficeDoc, now: number): OfficeSnapshotV3 {
  return withHelpers(doc, now, OFFICE_SEATS, 3);
}

/** The public v4 snapshot at `now` (the 3D scene only): the v3 view (ten seats) with `v: 4` and the pipeline. */
export function viewV4(doc: OfficeDoc, now: number): OfficeSnapshotV4 {
  return { ...viewV3(doc, now), v: 4, pipeline: pipelineOf(doc, now) };
}

/** Shape check of the Worker's internal /github message (already parsed and sanitized by the Worker). */
export function isGithubMessage(x: unknown): x is GithubMessage {
  if (typeof x !== "object" || x === null) return false;
  const m = x as { delivery?: unknown; update?: { repo?: unknown; changes?: unknown } };
  return typeof m.delivery === "string" && typeof m.update === "object" && m.update !== null && typeof m.update.repo === "string" && Array.isArray(m.update.changes);
}
