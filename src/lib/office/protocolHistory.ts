import { OFFICE_ACTIVITIES, OFFICE_AGENTS, OFFICE_HELPERS_MAX, OFFICE_SEATS, OFFICE_STATES, REPO, isInt, isObj, isText, matches, oneOf, onlyKeys, optional, wibDay, type Obj, type OfficeAgent, type OfficeDisabledV1 } from "./protocol";

/**
 * The Agent Office history (design 7.2, stage C): GET /api/office/history (the 8-day index) and
 * GET /api/office/history?day=YYYY-MM-DD (one WIB day). Imported by the Pages Function, the hq-office Worker and the
 * replay chunk only; never re-exported from ./protocol.ts, so the Classic card, the watch, the scene chunk and the
 * drawer body never carry these validators (tests/unit/office-chunk-graph.test.ts).
 */
export const OFFICE_HISTORY_PATH = "/api/office/history";
export const OFFICE_HISTORY = { days: 8, sessions: 200, events: 3000, prs: 200, runs: 500, deploys: 50, jobs: 24, carryS: 1800, daySeconds: 86_400 } as const;

/** Seconds since the WIB midnight; `seat` -1 for a session past the ten seats; `state` and `activity` index OFFICE_STATES and OFFICE_ACTIVITIES; `until` the session's last beat before its next event (down to -1800 for a session carried over midnight). */
export type OfficeHistoryEvent = [t: number, n: number, seat: number, state: number, activity: number, until: number, helpers: number];
/** A merge: repo and title "" when not public (shown as "Client project"). */
export type OfficeHistoryPr = [t: number, seat: number, repo: string, number: number, title: string];
/** A finished run: start, end (when it finished), the desk, the result and its lane count (0 to 24). */
export type OfficeHistoryRun = [t: number, end: number, seat: number, ok: 0 | 1, jobs: number];
/** A production deploy result. */
export type OfficeHistoryDeploy = [t: number, ok: 0 | 1];
export interface OfficeHistoryDay {
  day: string;
  events: number;
  prs: number;
  runs: number;
  deploys: number;
}
export interface OfficeHistoryIndexV1 {
  v: 1;
  days: OfficeHistoryDay[];
}
export interface OfficeHistoryV1 {
  v: 1;
  day: string;
  start: number;
  agents: OfficeAgent[];
  tasks: Record<string, { repo: string; title?: string }>;
  events: OfficeHistoryEvent[];
  prs: OfficeHistoryPr[];
  runs: OfficeHistoryRun[];
  deploys: OfficeHistoryDeploy[];
  truncated: boolean;
}
export type OfficeHistoryIndexResponse = OfficeHistoryIndexV1 | OfficeDisabledV1;
export type OfficeHistoryResponse = OfficeHistoryV1 | OfficeDisabledV1;

const H = OFFICE_HISTORY;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A canonical ordinal key ("0" to "999", no leading zero), so two keys never name one session. */
const ORDINAL = /^(0|[1-9]\d{0,2})$/;

/** Epoch ms of the WIB (UTC+7) midnight that starts `day`. */
export const dayStart = (day: string): number => Date.parse(`${day}T00:00:00Z`) - 7 * 3_600_000;
/** Today (WIB) and the 7 days before, newest first. */
export const historyWindow = (now: number): string[] => Array.from({ length: H.days }, (_, i) => wibDay(now - i * 86_400_000));

const disabled = (raw: Obj) => raw.enabled === false && onlyKeys(raw, ["v", "enabled"]);
const tuple = (x: unknown, n: number): x is unknown[] => Array.isArray(x) && x.length === n;
const isT = (x: unknown) => isInt(x, 0, H.daySeconds);
const isSeat = (x: unknown) => isInt(x, -1, OFFICE_SEATS - 1);
const isOk = (x: unknown) => x === 0 || x === 1;
/** Bounded, every item valid, sorted by the time at `at` (events, merges and deploys by start, runs by end). */
const list = (x: unknown, max: number, ok: (e: unknown) => boolean, at = 0) =>
  Array.isArray(x) && x.length <= max && x.every(ok) && x.every((e: number[], i) => i === 0 || e[at] >= (x[i - 1] as number[])[at]);

export function parseOfficeHistoryIndex(raw: unknown): OfficeHistoryIndexResponse | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  if (raw.enabled === false) return disabled(raw) ? { v: 1, enabled: false } : null;
  const days = raw.days;
  if (!onlyKeys(raw, ["v", "days"]) || !Array.isArray(days) || days.length !== H.days) return null;
  const ok = days.every(
    (d: unknown, i) =>
      isObj(d) &&
      onlyKeys(d, ["day", "events", "prs", "runs", "deploys"]) &&
      matches(DAY)(d.day) &&
      (i === 0 || (d.day as string) < (days[i - 1] as OfficeHistoryDay).day) &&
      isInt(d.events, 0, H.events) &&
      isInt(d.prs, 0, H.prs) &&
      isInt(d.runs, 0, H.runs) &&
      isInt(d.deploys, 0, H.deploys),
  );
  return ok ? (raw as unknown as OfficeHistoryIndexV1) : null;
}

export function parseOfficeHistory(raw: unknown): OfficeHistoryResponse | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  if (raw.enabled === false) return disabled(raw) ? { v: 1, enabled: false } : null;
  if (!onlyKeys(raw, ["v", "day", "start", "agents", "tasks", "events", "prs", "runs", "deploys", "truncated"])) return null;
  if (!matches(DAY)(raw.day) || raw.start !== dayStart(raw.day as string) || typeof raw.truncated !== "boolean") return null;
  const agents = raw.agents;
  if (!Array.isArray(agents) || agents.length > H.sessions || !agents.every((a) => oneOf(OFFICE_AGENTS, a))) return null;
  const n = agents.length;
  const tasks = raw.tasks;
  const task = ([k, v]: [string, unknown]) => ORDINAL.test(k) && Number(k) < n && isObj(v) && onlyKeys(v, ["repo", "title"]) && matches(REPO)(v.repo) && optional(v, "title", isText);
  if (!isObj(tasks) || !Object.entries(tasks).every(task)) return null;
  const event = (e: unknown) =>
    tuple(e, 7) &&
    isT(e[0]) &&
    isInt(e[1], 0, n - 1) &&
    isSeat(e[2]) &&
    isInt(e[3], 0, OFFICE_STATES.length - 1) &&
    isInt(e[4], 0, OFFICE_ACTIVITIES.length - 1) &&
    isInt(e[5], -H.carryS, H.daySeconds) &&
    isInt(e[6], 0, OFFICE_HELPERS_MAX);
  const pr = (e: unknown) => tuple(e, 5) && isT(e[0]) && isSeat(e[1]) && isInt(e[3], 1, 1e9) && ((e[2] === "" && e[4] === "") || (matches(REPO)(e[2]) && isText(e[4])));
  const run = (e: unknown) => tuple(e, 5) && isT(e[0]) && isT(e[1]) && (e[0] as number) <= (e[1] as number) && isSeat(e[2]) && isOk(e[3]) && isInt(e[4], 0, H.jobs);
  const deploy = (e: unknown) => tuple(e, 2) && isT(e[0]) && isOk(e[1]);
  if (!list(raw.events, H.events, event) || !list(raw.prs, H.prs, pr) || !list(raw.runs, H.runs, run, 1) || !list(raw.deploys, H.deploys, deploy)) return null;
  return raw as unknown as OfficeHistoryV1;
}
