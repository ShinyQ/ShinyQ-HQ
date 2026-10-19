/**
 * Agent Office contract, version 1 (docs/superpowers/specs/2026-10-18-agent-office-design.md, docs/agents/office.md).
 * The relay (tools/office-relay) sends `OfficeBeatV1`; the hq-office Worker serves `OfficeResponseV1` through
 * GET /api/office; the 3D office and the Classic card validate it with `parseOfficeResponse` and hide on null.
 * Change it only with a new version (`v: 2`) and every side in one PR.
 */
export const OFFICE_AGENTS = ["copilot", "claude", "codex"] as const;
export type OfficeAgent = (typeof OFFICE_AGENTS)[number];

export const OFFICE_STATES = ["working", "thinking", "reviewing", "testing", "ci", "input", "done", "failed", "asleep"] as const;
export type OfficeState = (typeof OFFICE_STATES)[number];

export const OFFICE_ACTIVITIES = ["editing", "planning", "reading", "testing", "building", "shell", "ci", "git", "asking", "finished", "failed", "resting"] as const;
export type OfficeActivity = (typeof OFFICE_ACTIVITIES)[number];

export const OFFICE_MODES = ["live", "semi-live", "off"] as const;
export type OfficeMode = (typeof OFFICE_MODES)[number];

export const OFFICE_DESKS = 5;
export const OFFICE_RECENT = 5;
export const OFFICE_FEED = 20;
export const OFFICE_PATH = "/api/office";
export const OFFICE_BEAT_PATH = "/api/office/beat";
export const OFFICE_GITHUB_PATH = "/api/office/github";
export const OFFICE_BEAT_MAX_BYTES = 2048;
export const OFFICE_TITLE_MAX = 80;
export const OFFICE_FEED_TITLE_MAX = 120;

export interface OfficeProgress {
  done: number;
  total: number;
}

export interface OfficeRecent {
  state: OfficeState;
  activity: OfficeActivity;
  at: number;
}

export interface OfficeDesk {
  /** 0 to 4, east to west along the console arc (left to right from the office stop). */
  slot: number;
  agent: OfficeAgent;
  state: OfficeState;
  activity: OfficeActivity;
  /** Epoch ms when the current state started. */
  since: number;
  /** "owner/name": allowlisted public repositories only. */
  repo?: string;
  /** Allowlisted public repositories only; absent means the page shows "Client project". */
  title?: string;
  /** CI jobs done of total while the state is "ci". */
  progress?: OfficeProgress;
  /** The failed job's name while the state is "failed" (public repositories only). */
  job?: string;
  /** Newest first, at most OFFICE_RECENT. */
  recent: OfficeRecent[];
}

export type OfficeGithubKind = "run" | "pr" | "push" | "deploy";
export type OfficeGithubStatus = "running" | "success" | "failure" | "merged" | "opened" | "pushed";

export interface OfficeGithubItem {
  kind: OfficeGithubKind;
  status: OfficeGithubStatus;
  repo: string;
  title: string;
  at: number;
  url: string;
  progress?: OfficeProgress;
}

export interface OfficeToday {
  /** The WIB day (UTC+7), YYYY-MM-DD. */
  day: string;
  tasksDone: number;
  prsMerged: number;
  ciRuns: number;
  ciGreen: number;
}

export interface OfficeSnapshotV1 {
  v: 1;
  enabled: true;
  mode: OfficeMode;
  updatedAt: number;
  /** Sessions that hold a desk (0 to 5), sorted by slot. */
  desks: OfficeDesk[];
  /** Sessions beyond the five desks (the "+N" chip). */
  extra: number;
  /** Newest first, at most OFFICE_FEED. */
  github: OfficeGithubItem[];
  today: OfficeToday;
}

export interface OfficeDisabledV1 {
  v: 1;
  enabled: false;
}

export type OfficeResponseV1 = OfficeSnapshotV1 | OfficeDisabledV1;

/** What the relay sends: enums and allowlisted public names only, never prompts, commands, paths or output. */
export interface OfficeBeatV1 {
  v: 1;
  agent: OfficeAgent;
  /** HMAC-SHA256 (hex) of the local session id with a local salt. */
  session: string;
  state: OfficeState;
  activity: OfficeActivity;
  repo?: string;
  branch?: string;
  title?: string;
  /** Epoch ms when the relay built the beat (replay guard). */
  ts: number;
}

/** The office's day (WIB, UTC+7) for the "today" counters. */
export function wibDay(now: number): string {
  return new Date(now + 7 * 3_600_000).toISOString().slice(0, 10);
}

type Obj = Record<string, unknown>;

const REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,120}$/;
const SESSION = /^[0-9a-f]{64}$/;
const BEAT_TITLE = /^[\p{L}\p{N} .,:;'()#&+/!?-]{1,80}$/u;
const URL_RE = /^https:\/\/[^\s"'<>\\]{1,300}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UNSAFE_TEXT = /[\u0000-\u001f\u007f<>]/;

const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const isInt = (x: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): x is number => typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;
const oneOf = <T extends string>(list: readonly T[], x: unknown): x is T => typeof x === "string" && (list as readonly string[]).includes(x);
const onlyKeys = (o: Obj, allowed: readonly string[]) => Object.keys(o).every((k) => allowed.includes(k));
const optional = (o: Obj, key: string, ok: (x: unknown) => boolean) => o[key] === undefined || ok(o[key]);
const matches = (re: RegExp) => (x: unknown) => typeof x === "string" && re.test(x);
const isText = (x: unknown) => typeof x === "string" && x.length >= 1 && x.length <= OFFICE_FEED_TITLE_MAX && !UNSAFE_TEXT.test(x);

function isProgress(x: unknown): boolean {
  return isObj(x) && onlyKeys(x, ["done", "total"]) && isInt(x.total, 1, 1000) && isInt(x.done, 0, 1000) && x.done <= x.total;
}

function isRecent(x: unknown): boolean {
  return isObj(x) && onlyKeys(x, ["state", "activity", "at"]) && oneOf(OFFICE_STATES, x.state) && oneOf(OFFICE_ACTIVITIES, x.activity) && isInt(x.at);
}

const DESK_KEYS = ["slot", "agent", "state", "activity", "since", "repo", "title", "progress", "job", "recent"];

function isDesk(x: unknown): x is OfficeDesk {
  return (
    isObj(x) &&
    onlyKeys(x, DESK_KEYS) &&
    isInt(x.slot, 0, OFFICE_DESKS - 1) &&
    oneOf(OFFICE_AGENTS, x.agent) &&
    oneOf(OFFICE_STATES, x.state) &&
    oneOf(OFFICE_ACTIVITIES, x.activity) &&
    isInt(x.since) &&
    optional(x, "repo", matches(REPO)) &&
    optional(x, "title", isText) &&
    optional(x, "progress", isProgress) &&
    optional(x, "job", isText) &&
    Array.isArray(x.recent) &&
    x.recent.length <= OFFICE_RECENT &&
    x.recent.every(isRecent)
  );
}

const GITHUB_KINDS: readonly OfficeGithubKind[] = ["run", "pr", "push", "deploy"];
const GITHUB_STATUSES: readonly OfficeGithubStatus[] = ["running", "success", "failure", "merged", "opened", "pushed"];

function isGithubItem(x: unknown): x is OfficeGithubItem {
  return (
    isObj(x) &&
    onlyKeys(x, ["kind", "status", "repo", "title", "at", "url", "progress"]) &&
    oneOf(GITHUB_KINDS, x.kind) &&
    oneOf(GITHUB_STATUSES, x.status) &&
    matches(REPO)(x.repo) &&
    isText(x.title) &&
    isInt(x.at) &&
    matches(URL_RE)(x.url) &&
    optional(x, "progress", isProgress)
  );
}

function isToday(x: unknown): x is OfficeToday {
  return (
    isObj(x) &&
    onlyKeys(x, ["day", "tasksDone", "prsMerged", "ciRuns", "ciGreen"]) &&
    matches(DAY)(x.day) &&
    isInt(x.tasksDone) &&
    isInt(x.prsMerged) &&
    isInt(x.ciRuns) &&
    isInt(x.ciGreen) &&
    x.ciGreen <= x.ciRuns
  );
}

/** Validates GET /api/office: null on anything unexpected, so a broken or tampered body never renders. */
export function parseOfficeResponse(raw: unknown): OfficeResponseV1 | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  if (raw.enabled === false) return onlyKeys(raw, ["v", "enabled"]) ? { v: 1, enabled: false } : null;
  if (raw.enabled !== true || !onlyKeys(raw, ["v", "enabled", "mode", "updatedAt", "desks", "extra", "github", "today"])) return null;
  if (!oneOf(OFFICE_MODES, raw.mode) || !isInt(raw.updatedAt) || !isInt(raw.extra, 0, 10_000)) return null;
  const desks = raw.desks;
  if (!Array.isArray(desks) || desks.length > OFFICE_DESKS || !desks.every(isDesk)) return null;
  if (new Set(desks.map((d) => d.slot)).size !== desks.length) return null;
  const github = raw.github;
  if (!Array.isArray(github) || github.length > OFFICE_FEED || !github.every(isGithubItem)) return null;
  if (!isToday(raw.today)) return null;
  return raw as unknown as OfficeSnapshotV1;
}

const BEAT_KEYS = ["v", "agent", "session", "state", "activity", "repo", "branch", "title", "ts"];

/** Validates a beat strictly: unknown keys, raw session ids or markup in titles reject the whole beat. */
export function parseOfficeBeat(raw: unknown): OfficeBeatV1 | null {
  if (!isObj(raw) || raw.v !== 1 || !onlyKeys(raw, BEAT_KEYS)) return null;
  if (!oneOf(OFFICE_AGENTS, raw.agent) || !matches(SESSION)(raw.session)) return null;
  if (!oneOf(OFFICE_STATES, raw.state) || !oneOf(OFFICE_ACTIVITIES, raw.activity) || !isInt(raw.ts)) return null;
  if (!optional(raw, "repo", matches(REPO)) || !optional(raw, "branch", matches(BRANCH)) || !optional(raw, "title", matches(BEAT_TITLE))) return null;
  if ((raw.branch !== undefined || raw.title !== undefined) && raw.repo === undefined) return null;
  return raw as unknown as OfficeBeatV1;
}
