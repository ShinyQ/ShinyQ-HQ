/**
 * Agent Office contract (docs/superpowers/specs/2026-10-18-agent-office-design.md, docs/agents/office.md).
 * The relay (tools/office-relay) sends `OfficeBeatV1`; the hq-office Worker serves `OfficeResponseV1` through
 * GET /api/office (validated with `parseOfficeResponse`), `OfficeResponseV2` (v1 plus desk `helpers`) through
 * GET /api/office?v=2 (validated with `parseOfficeResponseV2`, which also takes a v1 body after a rollback) and
 * `OfficeResponseV3` (v2 with up to ten desks, slots 0 to 9) through GET /api/office?v=3 (`parseOfficeResponseV3`,
 * which also takes a v2 or v1 body after a rollback). v1 and v2 keep five desks (slots 0 to 4) plus `extra`. Clients
 * hide on null. v1 never changes: a new field means a new version, with every side in one PR.
 */
export const OFFICE_AGENTS = ["copilot", "claude", "codex"] as const;
export type OfficeAgent = (typeof OFFICE_AGENTS)[number];

export const OFFICE_STATES = ["working", "thinking", "reviewing", "testing", "ci", "input", "done", "failed", "asleep"] as const;
export type OfficeState = (typeof OFFICE_STATES)[number];

export const OFFICE_ACTIVITIES = ["editing", "planning", "reading", "testing", "building", "shell", "ci", "git", "asking", "finished", "failed", "resting"] as const;
export type OfficeActivity = (typeof OFFICE_ACTIVITIES)[number];

export const OFFICE_MODES = ["live", "semi-live", "off"] as const;
export type OfficeMode = (typeof OFFICE_MODES)[number];

/** Desks in snapshots v1 and v2 (slots 0 to 4: the front row); sessions on other seats count in `extra` there. */
export const OFFICE_DESKS = 5;
/** Seats (desks) in snapshot v3: two rows of five, slots 0 to 4 the front row (filled first), 5 to 9 the back row. */
export const OFFICE_SEATS = 10;
export const OFFICE_RECENT = 5;
export const OFFICE_FEED = 20;
export const OFFICE_PATH = "/api/office";
export const OFFICE_BEAT_PATH = "/api/office/beat";
export const OFFICE_GITHUB_PATH = "/api/office/github";
export const OFFICE_BEAT_MAX_BYTES = 2048;
export const OFFICE_TITLE_MAX = 80;
export const OFFICE_FEED_TITLE_MAX = 120;
/** The most helpers (sub-agents) a beat reports for one session. */
export const OFFICE_HELPERS_MAX = 9;

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
  /** 0 to 4 (v1, v2) or 0 to 9 (v3), east to west along each console arc (left to right from the office stop); 5 to 9 the back row. */
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

/** A v2 desk: a v1 desk plus its active helpers (sub-agents), 1 to OFFICE_HELPERS_MAX, absent at 0. */
export type OfficeDeskV2 = OfficeDesk & { helpers?: number };

/** GET /api/office?v=2: the v1 snapshot with `v: 2` and v2 desks. */
export interface OfficeSnapshotV2 extends Omit<OfficeSnapshotV1, "v" | "desks"> {
  v: 2;
  desks: OfficeDeskV2[];
}

/** The disabled answer is the same body in every version. */
export type OfficeResponseV2 = OfficeSnapshotV2 | OfficeDisabledV1;

/** GET /api/office?v=3: the v2 snapshot with `v: 3`, up to OFFICE_SEATS desks (slots 0 to 9) and `extra` past ten. */
export interface OfficeSnapshotV3 extends Omit<OfficeSnapshotV2, "v"> {
  v: 3;
}

export type OfficeResponseV3 = OfficeSnapshotV3 | OfficeDisabledV1;

/** What the clients hold: the newest snapshot version. */
export type OfficeSnapshot = OfficeSnapshotV3;
export type OfficeResponse = OfficeResponseV3;

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
  /**
   * Active helpers (sub-agents) of this session, 0 to OFFICE_HELPERS_MAX: a count only, never names, types or ids.
   * Absent when the session has had none since the last 0 was sent.
   */
  helpers?: number;
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
const DESK_KEYS_V2 = [...DESK_KEYS, "helpers"];

function isDesk(x: unknown): x is OfficeDesk {
  return isObj(x) && onlyKeys(x, DESK_KEYS) && isDeskFields(x, OFFICE_DESKS);
}

function isDeskV2(x: unknown, seats: number = OFFICE_DESKS): x is OfficeDeskV2 {
  return isObj(x) && onlyKeys(x, DESK_KEYS_V2) && optional(x, "helpers", (h) => isInt(h, 1, OFFICE_HELPERS_MAX)) && isDeskFields(x, seats);
}

const isDeskV3 = (x: unknown): x is OfficeDeskV2 => isDeskV2(x, OFFICE_SEATS);

function isDeskFields(x: Obj, seats: number): boolean {
  return (
    isInt(x.slot, 0, seats - 1) &&
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

const disabled = (): OfficeDisabledV1 => ({ v: 1, enabled: false });
const SNAPSHOT_KEYS = ["v", "enabled", "mode", "updatedAt", "desks", "extra", "github", "today"];

/** The checks every snapshot version shares, with that version's desk check and desk count. */
function isSnapshot(raw: Obj, desk: (x: unknown) => boolean, seats: number = OFFICE_DESKS): boolean {
  if (raw.enabled !== true || !onlyKeys(raw, SNAPSHOT_KEYS)) return false;
  if (!oneOf(OFFICE_MODES, raw.mode) || !isInt(raw.updatedAt) || !isInt(raw.extra, 0, 10_000)) return false;
  const desks = raw.desks;
  if (!Array.isArray(desks) || desks.length > seats || !desks.every((d) => desk(d))) return false;
  if (new Set(desks.map((d: OfficeDesk) => d.slot)).size !== desks.length) return false;
  const github = raw.github;
  if (!Array.isArray(github) || github.length > OFFICE_FEED || !github.every(isGithubItem)) return false;
  return isToday(raw.today);
}

const isDisabled = (raw: Obj) => raw.v === 1 && raw.enabled === false && onlyKeys(raw, ["v", "enabled"]);

/** Validates GET /api/office: null on anything unexpected, so a broken or tampered body never renders. */
export function parseOfficeResponse(raw: unknown): OfficeResponseV1 | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  if (raw.enabled === false) return isDisabled(raw) ? disabled() : null;
  return isSnapshot(raw, isDesk) ? (raw as unknown as OfficeSnapshotV1) : null;
}

/**
 * Validates GET /api/office?v=2 (strict keys, desk `helpers` 1 to OFFICE_HELPERS_MAX). A valid v1 body is accepted
 * too, as a v2 snapshot without helpers: a Worker or Pages deploy rolled back to before v2 answers v1.
 */
export function parseOfficeResponseV2(raw: unknown): OfficeResponseV2 | null {
  if (!isObj(raw)) return null;
  if (raw.enabled === false) return isDisabled(raw) ? disabled() : null;
  if (raw.v === 2) return isSnapshot(raw, isDeskV2) ? (raw as unknown as OfficeSnapshotV2) : null;
  const v1 = parseOfficeResponse(raw);
  return v1 && v1.enabled ? { ...v1, v: 2 } : null;
}

/** A v1 desk (no `helpers`) on any of the ten seats: only for a v1 body read as v3. */
const isDeskV1Wide = (x: unknown): x is OfficeDesk => isObj(x) && onlyKeys(x, DESK_KEYS) && isDeskFields(x, OFFICE_SEATS);

/**
 * Validates GET /api/office?v=3 (strict keys, up to OFFICE_SEATS desks with slots 0 to 9, desk `helpers` as in v2). A
 * v2 or v1 body is accepted too, returned as v3: a Worker or Pages deploy rolled back to before v3 answers v2 or v1.
 * Read here, such a body may carry up to ten desks with slots 0 to 9 (a rolled-back Worker reading a ten-seat
 * document); `parseOfficeResponse` and `parseOfficeResponseV2` stay strict at five.
 */
export function parseOfficeResponseV3(raw: unknown): OfficeResponseV3 | null {
  if (!isObj(raw)) return null;
  if (raw.enabled === false) return isDisabled(raw) ? disabled() : null;
  if (raw.v === 3) return isSnapshot(raw, isDeskV3, OFFICE_SEATS) ? (raw as unknown as OfficeSnapshotV3) : null;
  if (raw.v === 2) return isSnapshot(raw, isDeskV3, OFFICE_SEATS) ? { ...(raw as unknown as OfficeSnapshotV2), v: 3 } : null;
  if (raw.v === 1) return isSnapshot(raw, isDeskV1Wide, OFFICE_SEATS) ? { ...(raw as unknown as OfficeSnapshotV1), v: 3 } : null;
  return null;
}

const BEAT_KEYS = ["v", "agent", "session", "state", "activity", "repo", "branch", "title", "helpers", "ts"];

/** Validates a beat strictly: unknown keys, raw session ids or markup in titles reject the whole beat. */
export function parseOfficeBeat(raw: unknown): OfficeBeatV1 | null {
  if (!isObj(raw) || raw.v !== 1 || !onlyKeys(raw, BEAT_KEYS)) return null;
  if (!oneOf(OFFICE_AGENTS, raw.agent) || !matches(SESSION)(raw.session)) return null;
  if (!oneOf(OFFICE_STATES, raw.state) || !oneOf(OFFICE_ACTIVITIES, raw.activity) || !isInt(raw.ts)) return null;
  if (!optional(raw, "repo", matches(REPO)) || !optional(raw, "branch", matches(BRANCH)) || !optional(raw, "title", matches(BEAT_TITLE))) return null;
  if ((raw.branch !== undefined || raw.title !== undefined) && raw.repo === undefined) return null;
  if (!optional(raw, "helpers", (x) => isInt(x, 0, OFFICE_HELPERS_MAX))) return null;
  return raw as unknown as OfficeBeatV1;
}
