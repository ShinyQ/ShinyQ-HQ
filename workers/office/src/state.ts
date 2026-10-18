import { OFFICE_DESKS, OFFICE_FEED, OFFICE_FEED_TITLE_MAX, OFFICE_RECENT, wibDay } from "../../../src/lib/office/protocol";
import type { OfficeActivity, OfficeAgent, OfficeBeatV1, OfficeDesk, OfficeGithubItem, OfficeProgress, OfficeRecent, OfficeSnapshotV1, OfficeState, OfficeToday } from "../../../src/lib/office/protocol";

/** Time rules and caps (spec section 3.3); every rule is applied from `now`, so the Durable Object needs no alarm. */
export const TIMING = {
  thinkingAfter: 20_000,
  asleepAfter: 3 * 60_000,
  longWaitAsleepAfter: 15 * 60_000,
  removeAfter: 30 * 60_000,
  doneFor: 20_000,
  runStaleAfter: 6 * 3_600_000,
  deliveriesKept: 200,
  prsKept: 50,
  runsKept: 20,
  publicReposKept: 50,
} as const;

export interface SessionRecord {
  id: string;
  agent: OfficeAgent;
  slot: number | null;
  firstSeen: number;
  lastBeat: number;
  state: OfficeState;
  activity: OfficeActivity;
  since: number;
  repo?: string;
  branch?: string;
  title?: string;
  recent: OfficeRecent[];
}

export type RunStatus = "running" | "success" | "failure" | "cancelled";
export type JobStatus = "queued" | "running" | "done" | "failed";

export interface RunRecord {
  id: number;
  repo: string;
  branch: string;
  title: string;
  url: string;
  status: Exclude<RunStatus, "cancelled">;
  jobs: Record<string, JobStatus>;
  failedJob?: string;
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
  today: OfficeToday;
}

export type GithubChange =
  | { type: "run"; id: number; branch: string; title: string; url: string; status: RunStatus }
  | { type: "job"; runId: number; jobId: string; name: string; status: JobStatus }
  | { type: "pr"; number: number; branch: string; title: string; url: string; action: "opened" | "merged" }
  | { type: "push"; sha: string; title: string; url: string }
  | { type: "deploy"; id: number; title: string; url: string; status: "running" | "success" | "failure" }
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
  return { v: 1, sessions: [], runs: [], prs: [], feed: [], publicRepos: [], deliveries: [], today: zeroToday(now) };
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

/** Stable desks: keep valid slots, give free ones to waiting sessions (oldest first); an awake one may take the longest-asleep desk. */
export function assignSlots(sessions: SessionRecord[], now: number): SessionRecord[] {
  const out = sessions.map((s) => ({ ...s }));
  const taken = new Set<number>();
  for (const s of out) {
    if (s.slot !== null && s.slot >= 0 && s.slot < OFFICE_DESKS && !taken.has(s.slot)) taken.add(s.slot);
    else s.slot = null;
  }
  const waiting = out.filter((s) => s.slot === null).sort((a, b) => a.firstSeen - b.firstSeen || (a.id < b.id ? -1 : 1));
  for (const s of waiting) {
    const free = Array.from({ length: OFFICE_DESKS }, (_, n) => n).find((n) => !taken.has(n));
    if (free !== undefined) {
      s.slot = free;
      taken.add(free);
      continue;
    }
    if (isAsleep(s, now)) continue;
    const sleeper = out.filter((o) => o.slot !== null && isAsleep(o, now)).sort((a, b) => a.lastBeat - b.lastBeat)[0];
    if (sleeper) {
      s.slot = sleeper.slot;
      sleeper.slot = null;
    }
  }
  return out;
}

/** Applies one sanitized beat. `repo`, `branch` and `title` stay only for repositories a webhook reported public. */
export function applyBeat(doc: OfficeDoc, beat: OfficeBeatV1, now: number): OfficeDoc {
  const today = rollToday(doc.today, now);
  const prev = doc.sessions.find((s) => s.id === beat.session);
  const changed = !prev || prev.state !== beat.state || prev.activity !== beat.activity;
  const keep = beat.repo !== undefined && doc.publicRepos.includes(beat.repo);
  const record: SessionRecord = {
    id: beat.session,
    agent: beat.agent,
    slot: prev?.slot ?? null,
    firstSeen: prev?.firstSeen ?? now,
    lastBeat: now,
    state: beat.state,
    activity: beat.activity,
    since: !prev || changed ? now : prev.since,
    ...(keep ? { repo: beat.repo } : {}),
    ...(keep && beat.branch ? { branch: beat.branch } : {}),
    ...(keep && beat.title ? { title: beat.title } : {}),
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
      if (c.status === "cancelled") return { ...doc, runs: doc.runs.filter((r) => r.id !== c.id), feed: doc.feed.filter((f) => f.key !== key) };
      const prev = doc.runs.find((r) => r.id === c.id);
      const restart = c.status === "running" && prev !== undefined && prev.status !== "running";
      const run: RunRecord = { id: c.id, repo, branch: c.branch, title: c.title, url: c.url, status: c.status, jobs: restart ? {} : (prev?.jobs ?? {}), ...(!restart && prev?.failedJob ? { failedJob: prev.failedJob } : {}), updated: now };
      const counted = c.status !== "running" && (!prev || prev.status === "running");
      const today = counted ? { ...doc.today, ciRuns: doc.today.ciRuns + 1, ciGreen: doc.today.ciGreen + (c.status === "success" ? 1 : 0) } : doc.today;
      const sessions = c.status === "failure" ? doc.sessions.map((s) => (s.state === "ci" && s.repo === repo && s.branch === c.branch ? failSession(s, now) : s)) : doc.sessions;
      const progress = c.status === "running" ? progressOf(run) : undefined;
      const feed = upsertFeed(doc.feed, { key, kind: "run", status: c.status, repo, title: c.title, at: now, url: c.url, ...(progress ? { progress } : {}) });
      return { ...doc, runs: [run, ...doc.runs.filter((r) => r.id !== c.id)], today, sessions, feed };
    }
    case "job": {
      const run = doc.runs.find((r) => r.id === c.runId && r.repo === repo);
      if (!run) return doc;
      const updated: RunRecord = { ...run, jobs: { ...run.jobs, [c.jobId]: c.status }, ...(c.status === "failed" ? { failedJob: c.name } : {}), updated: now };
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
      return { ...doc, feed: upsertFeed(doc.feed, { key: `deploy:${c.id}`, kind: "deploy", status: c.status, repo, title: c.title, at: now, url: c.url }) };
    case "privatized":
      return {
        ...doc,
        publicRepos: doc.publicRepos.filter((r) => r !== repo),
        runs: doc.runs.filter((r) => r.repo !== repo),
        prs: doc.prs.filter((p) => p.repo !== repo),
        feed: doc.feed.filter((f) => f.repo !== repo),
        sessions: doc.sessions.map((s) => (s.repo === repo ? { id: s.id, agent: s.agent, slot: s.slot, firstSeen: s.firstSeen, lastBeat: s.lastBeat, state: s.state, activity: s.activity, since: s.since, recent: s.recent } : s)),
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
    slot: s.slot ?? 0,
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

/** The public snapshot at `now` (time rules applied, nothing written). */
export function view(doc: OfficeDoc, now: number): OfficeSnapshotV1 {
  const live = doc.sessions.flatMap((s) => {
    const e = effective(s, now);
    return e ? [{ s, e }] : [];
  });
  const seated = live.filter(({ s }) => s.slot !== null).sort((a, b) => (a.s.slot ?? 0) - (b.s.slot ?? 0));
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

/** Shape check of the Worker's internal /github message (already parsed and sanitized by the Worker). */
export function isGithubMessage(x: unknown): x is GithubMessage {
  if (typeof x !== "object" || x === null) return false;
  const m = x as { delivery?: unknown; update?: { repo?: unknown; changes?: unknown } };
  return typeof m.delivery === "string" && typeof m.update === "object" && m.update !== null && typeof m.update.repo === "string" && Array.isArray(m.update.changes);
}
