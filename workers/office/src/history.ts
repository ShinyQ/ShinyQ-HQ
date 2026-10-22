import { OFFICE_ACTIVITIES, OFFICE_STATES, type OfficeAgent } from "../../../src/lib/office/protocol";
import { dayStart, OFFICE_HISTORY, type OfficeHistoryDeploy, type OfficeHistoryEvent, type OfficeHistoryIndexV1, type OfficeHistoryPr, type OfficeHistoryRun, type OfficeHistoryV1 } from "../../../src/lib/office/protocolHistory";
import { cleanTitle, repoAllowed } from "./ingest";
import { effective, isProductionDeploy, laneOrder, seatFor, seatOf, TIMING, type OfficeDoc, type SessionRecord } from "./state";

/**
 * The replay log (design 7.1): one row per WIB day beside the doc, bounded. Built by diffing the doc before and after
 * every accepted beat or webhook, so a seat that moves because another session left is logged too. `keys` (the session
 * hashes) never leave the Durable Object; branches are never stored.
 */
/** `headroom`: a change must leave this much under `maxBytes`, so the byte-cap fallback's closes (null to at most "86400" or "-1800", one per open event) always fit. */
export const HISTORY = { ...OFFICE_HISTORY, maxBytes: 120 * 1024, headroom: 4 * 1024 } as const;

/** Stored events: `until` is null while the event is open (its session has not changed since). */
export type LogEvent = [t: number, n: number, seat: number, state: number, activity: number, until: number | null, helpers: number];
export interface DayLog {
  v: 1;
  day: string;
  /** Private: the session hash per ordinal, never served. */
  keys: string[];
  agents: OfficeAgent[];
  tasks: Record<string, { repo: string; title?: string }>;
  events: LogEvent[];
  prs: OfficeHistoryPr[];
  runs: OfficeHistoryRun[];
  deploys: OfficeHistoryDeploy[];
  truncated: boolean;
}
type Task = DayLog["tasks"][string];

export const logKey = (day: string) => `log:${day}`;
export const emptyLog = (day: string): DayLog => ({ v: 1, day, keys: [], agents: [], tasks: {}, events: [], prs: [], runs: [], deploys: [], truncated: false });
/** Seconds since `day`'s WIB midnight, clamped to -1800 (a carry-in's last beat) to 86,400. */
export const secondsOf = (day: string, ms: number) => Math.max(-HISTORY.carryS, Math.min(HISTORY.daySeconds, Math.floor((ms - dayStart(day)) / 1000)));
const fits = (log: DayLog) => new TextEncoder().encode(JSON.stringify(log)).length <= HISTORY.maxBytes - HISTORY.headroom;
const seatNo = (s: SessionRecord) => seatOf(s) ?? -1;
const same = (a: SessionRecord, b: SessionRecord) => a.state === b.state && a.activity === b.activity && seatNo(a) === seatNo(b) && (a.helpers ?? 0) === (b.helpers ?? 0);
const taskOf = (s: SessionRecord): Task | null => (s.repo ? { repo: s.repo, ...(s.title ? { title: s.title } : {}) } : null);
const sameTask = (a: Task | undefined, b: Task) => a !== undefined && a.repo === b.repo && a.title === b.title;
/**
 * `p` went quiet long enough that live saw it change without a beat: removed, asleep, or its helpers decayed. Thinking
 * after 20 s is left out (it would log most pauses); the replay derives it only after an event's `until`.
 */
function quietGap(p: SessionRecord, now: number): boolean {
  const e = effective(p, now);
  if (!e) return true;
  if (e.state === "asleep" && p.state !== "asleep" && p.state !== "done") return true;
  return (p.helpers ?? 0) > 0 && now - p.lastBeat >= TIMING.helpersTtl;
}
/** The latest time already logged, so a backwards clock step never writes an earlier one. */
const lastLogged = (log: DayLog) => Math.max(0, log.events.at(-1)?.[0] ?? 0, log.prs.at(-1)?.[0] ?? 0, log.runs.at(-1)?.[1] ?? 0, log.deploys.at(-1)?.[0] ?? 0);
const eventOf = (t: number, n: number, s: SessionRecord): LogEvent => [t, n, seatNo(s), OFFICE_STATES.indexOf(s.state), OFFICE_ACTIVITIES.indexOf(s.activity), null, s.helpers ?? 0];

/** Closes ordinal `n`'s open event (if any) at `until`, in the caller's copy. */
function close(events: LogEvent[], n: number, until: number): void {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e[1] !== n) continue;
    if (e[5] === null) events[i] = [e[0], e[1], e[2], e[3], e[4], until, e[6]];
    return;
  }
}

/** The log after one accepted beat or webhook took the doc from `before` to `after`; the same object when nothing loggable changed. */
export function logDoc(log: DayLog, before: OfficeDoc, after: OfficeDoc, now: number): DayLog {
  const t = Math.max(lastLogged(log), secondsOf(log.day, now));
  const events = log.events.slice();
  let { keys, agents, tasks, truncated } = log;
  let changed = false;
  const gone = new Map(before.sessions.map((s) => [s.id, s]));
  const added: LogEvent[] = [];
  for (const s of after.sessions) {
    const p = gone.get(s.id);
    gone.delete(s.id);
    let n = keys.indexOf(s.id);
    const task = taskOf(s);
    if (n >= 0 && task && !sameTask(tasks[n], task)) {
      tasks = { ...tasks, [n]: task };
      changed = true;
    }
    // A session missing from the row (started after its midnight carry-in) or back from a quiet gap logs even unchanged.
    if (p && n >= 0 && same(p, s) && !(s.lastBeat !== p.lastBeat && quietGap(p, now))) continue;
    if (n < 0) {
      if (keys.length >= HISTORY.sessions) {
        if (!truncated) changed = true;
        truncated = true;
        continue;
      }
      n = keys.length;
      keys = [...keys, s.id];
      agents = [...agents, s.agent];
      if (task) tasks = { ...tasks, [n]: task };
    }
    if (p) close(events, n, secondsOf(log.day, p.lastBeat));
    added.push(eventOf(t, n, s));
    changed = true;
  }
  for (const [sid, p] of gone) {
    const n = keys.indexOf(sid);
    if (n < 0) continue;
    close(events, n, secondsOf(log.day, p.lastBeat));
    changed = true;
  }
  const room = Math.max(0, HISTORY.events - events.length);
  if (added.length > room) truncated = true;
  events.push(...added.slice(0, room));
  const g = logGithub(log, before, after, now, t);
  if (g.changed) changed = true;
  if (!changed) return log;
  const out: DayLog = { ...log, keys, agents, tasks, events, prs: g.prs, runs: g.runs, deploys: g.deploys, truncated: truncated || g.truncated };
  if (fits(out)) return out;
  // Over the byte cap (less the headroom): keep the closes (a few bytes each, inside the headroom), drop what this change added.
  return { ...log, events: log.events.map((e, i) => events[i] ?? e), truncated: true };
}

/** Merges (new `merged` feed items), finished runs (left running, or a new finished attempt) and production deploy results. */
function logGithub(log: DayLog, before: OfficeDoc, after: OfficeDoc, now: number, t: number) {
  const seen = new Set(before.feed.map((f) => `${f.key}:${f.status}`));
  const prs = log.prs.slice();
  const runs = log.runs.slice();
  const deploys = log.deploys.slice();
  let truncated = false;
  const push = <T>(list: T[], max: number, item: T) => {
    if (list.length < max) list.push(item);
    else truncated = true;
  };
  for (const f of after.feed) {
    if (seen.has(`${f.key}:${f.status}`)) continue;
    if (f.kind === "pr" && f.status === "merged") {
      const pr = after.prs.find((p) => f.key === `pr:${p.repo}#${p.number}`);
      if (pr) push<OfficeHistoryPr>(prs, HISTORY.prs, [t, seatFor(after, pr.repo, pr.branch, now) ?? -1, pr.repo, pr.number, pr.title]);
    } else if (isProductionDeploy(f) && (f.status === "success" || f.status === "failure")) push<OfficeHistoryDeploy>(deploys, HISTORY.deploys, [t, f.status === "success" ? 1 : 0]);
  }
  for (const r of after.runs) {
    if (r.status === "running") continue;
    const b = before.runs.find((x) => x.id === r.id);
    if (b && b.status !== "running" && b.attempt === r.attempt) continue;
    const start = Math.min(t, Math.max(0, secondsOf(log.day, r.started ?? r.updated)));
    push<OfficeHistoryRun>(runs, HISTORY.runs, [start, t, seatFor(after, r.repo, r.branch, now) ?? -1, r.status === "success" ? 1 : 0, Math.min(HISTORY.jobs, laneOrder(r).length)]);
  }
  const changed = prs.length !== log.prs.length || runs.length !== log.runs.length || deploys.length !== log.deploys.length || truncated;
  return { prs, runs, deploys, truncated, changed };
}

/** A new day's row: one carry-in event at t 0 for each session still live at the WIB midnight (its open `until` closes from its last beat, down to -1800). */
export function startLog(day: string, doc: OfficeDoc): DayLog {
  const midnight = dayStart(day);
  const live = doc.sessions.filter((s) => effective(s, midnight) !== null).slice(0, HISTORY.sessions);
  const tasks: DayLog["tasks"] = {};
  live.forEach((s, n) => {
    const task = taskOf(s);
    if (task) tasks[n] = task;
  });
  return { ...emptyLog(day), keys: live.map((s) => s.id), agents: live.map((s) => s.agent), tasks, events: live.map((s, n) => eventOf(0, n, s)) };
}

/** Every open event closed from its session's `lastBeat` in `doc`, else at its own start. The same row when none is open. */
export function closeLog(log: DayLog, doc: OfficeDoc): DayLog {
  if (!log.events.some((e) => e[5] === null)) return log;
  const beats = new Map(doc.sessions.map((s) => [s.id, s.lastBeat]));
  return {
    ...log,
    events: log.events.map((e): LogEvent => {
      if (e[5] !== null) return e;
      const last = beats.get(log.keys[e[1]]);
      return [e[0], e[1], e[2], e[3], e[4], last === undefined ? e[0] : secondsOf(log.day, last), e[6]];
    }),
  };
}

/** A privatized repository: its tasks go, its merges keep only time, desk and number. */
export function scrubRepo(log: DayLog, repo: string): DayLog {
  const tasks = Object.fromEntries(Object.entries(log.tasks).filter(([, v]) => v.repo !== repo));
  return { ...log, tasks, prs: log.prs.map((p): OfficeHistoryPr => (p[2] === repo ? [p[0], p[1], "", p[3], ""] : p)) };
}

/** The 8-day index over `window` (newest first): a day without a row counts zeros. */
export function historyIndex(window: readonly string[], rows: ReadonlyMap<string, DayLog>): OfficeHistoryIndexV1 {
  return {
    v: 1,
    days: window.map((day) => {
      const r = rows.get(logKey(day));
      return { day, events: r?.events.length ?? 0, prs: r?.prs.length ?? 0, runs: r?.runs.length ?? 0, deploys: r?.deploys.length ?? 0 };
    }),
  };
}

/** The served day: no `keys`, open events closed, tasks and merges only for repositories still in `doc.publicRepos`. */
export function historyDay(log: DayLog, doc: OfficeDoc): OfficeHistoryV1 {
  const c = closeLog(log, doc);
  const pub = new Set(doc.publicRepos);
  return {
    v: 1,
    day: c.day,
    start: dayStart(c.day),
    agents: c.agents,
    tasks: Object.fromEntries(Object.entries(c.tasks).filter(([, v]) => pub.has(v.repo))),
    events: c.events as OfficeHistoryEvent[],
    prs: c.prs.map((p): OfficeHistoryPr => (pub.has(p[2]) ? p : [p[0], p[1], "", p[3], ""])),
    runs: c.runs,
    deploys: c.deploys,
    truncated: c.truncated,
  };
}

/** The Worker's read-time pass: the allowlist on every repository and `cleanTitle` (the current blocklist) on every title. */
export function cleanHistory(h: OfficeHistoryV1, allow: readonly string[], blocklist: readonly string[]): OfficeHistoryV1 {
  const ok = (repo: string) => repo !== "" && repoAllowed(repo, allow);
  const tasks = Object.fromEntries(
    Object.entries(h.tasks).flatMap(([n, v]): [string, Task][] => {
      if (!ok(v.repo)) return [];
      const title = v.title ? cleanTitle(v.title, blocklist) : null;
      return [[n, title ? { repo: v.repo, title } : { repo: v.repo }]];
    }),
  );
  const prs = h.prs.map((p): OfficeHistoryPr => {
    const title = ok(p[2]) ? cleanTitle(p[4], blocklist) : null;
    return title ? [p[0], p[1], p[2], p[3], title] : [p[0], p[1], "", p[3], ""];
  });
  return { ...h, tasks, prs };
}
