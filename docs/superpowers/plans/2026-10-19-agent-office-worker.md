# Agent Office, part 1: Worker, Durable Object and `/api/office` Implementation Plan

Status: shipped in #233 (5f22c78), 2026-10-19

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the backend of the Agent Office: the versioned snapshot contract, a new `hq-office` Worker with a SQLite-backed Durable Object that ingests signed beats and GitHub webhooks, and three Pages Functions (`GET /api/office`, `POST /api/office/beat`, `POST /api/office/github`), with tests, CI, deploy and a runbook. No UI.

**Architecture:** Pure modules do all the logic: `src/lib/office/protocol.ts` (contract and validation), `workers/office/src/state.ts` (a reducer over one JSON document plus time rules evaluated at read time), `workers/office/src/ingest.ts` (beat sanitizing, GitHub parsing). The Durable Object `Office` keeps the document in its storage API (SQLite backend, free plan); the Worker verifies HMAC signatures and routes to it; it has no public route. Pages Functions on the site origin forward to the Worker over a service binding and edge-cache the snapshot for 5 s.

**Tech Stack:** Cloudflare Workers and Durable Objects (free plan, `new_sqlite_classes`), Cloudflare Pages Functions, Web Crypto HMAC-SHA256, TypeScript, Vitest, wrangler 4.151.0 from the lockfile, Bun.

Spec: [`docs/superpowers/specs/2026-10-18-agent-office-design.md`](../specs/2026-10-18-agent-office-design.md) (sections 3, 6, 7, 8, 9, 12).

## Global Constraints

- No em dashes (U+2014) anywhere: code, comments, docs, commits, PR text. Escape sequences such as `"\u2014"` in code are allowed.
- Hand-written Cloudflare types only (rule T12 in `functions/_lib/types.ts`): never add `@cloudflare/workers-types`.
- Privacy (D3): a beat carries only `{v, agent, session, state, activity, repo?, branch?, title?, ts}`; `repo`, `branch` and `title` survive only for repositories that match `OFFICE_REPO_ALLOWLIST` (default `ShinyQ/*`) and that a webhook reported as public (`repository.private == false`); titles go through the public safety blocklist (`functions/_generated/safety.json`).
- Beat auth: `X-Office-Signature: sha256=<hex HMAC-SHA256(raw body, OFFICE_INGEST_KEY)>`, `ts` within 60 s, body at most 2,048 bytes.
- GitHub auth: `X-Hub-Signature-256: sha256=<hex HMAC-SHA256(raw body, GITHUB_WEBHOOK_SECRET)>`, constant-time compare, `X-GitHub-Delivery` deduped, body at most 512 KiB.
- Time rules: asleep after 3 min without a beat (15 min while `testing`, `ci` or `input`); removed after 30 min; `done` shows 20 s then asleep; `working` or `reviewing` shows `thinking` after 20 s without a beat; `failed` holds until the next beat. Counters reset at 00:00 WIB (UTC+7).
- Five desks, stable slots; a new awake session may take the slot of the longest-asleep session; others count in `extra`.
- Kill switch: `OFFICE_ENABLED` in the root `wrangler.toml` `[vars]`; anything but `"true"` makes `GET /api/office` answer `{"v":1,"enabled":false}` and the POST routes answer 204 without forwarding.
- Snapshot responses: an ETag (304 on a matching `If-None-Match`) and `Cache-Control: public, max-age=5, stale-while-revalidate=30` (the disabled answer `public, max-age=60`), stored in `caches.default` for 5 s.
- Free plan only: no alarms, no WebSockets; one storage row written per accepted beat or webhook.
- The Worker has `workers_dev = false`, `preview_urls = false` and no route; the public entry points are the Pages Functions.
- CI: at most 2 CI runs in flight; check `gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued` before pushing. This PR is pre-approved to merge when green.

## File Structure

| Path | Responsibility |
|---|---|
| `src/lib/office/protocol.ts` (new) | Contract v1: enums, types, limits, `wibDay`, `parseOfficeResponse`, `parseOfficeBeat` |
| `src/lib/office/fixtures.ts` (new) | `OFFICE_FIXTURE_NOW`, `OFFICE_FIXTURES` (busy, rough, quiet, semiLive, off, disabled) for tests, e2e and captures |
| `src/content/safety-match.ts` (new) | `findBlockedTerms` and `escapeRegExp` without Node APIs (moved from `safety.ts`, re-exported there) |
| `workers/office/src/state.ts` (new) | `OfficeDoc`, `emptyDoc`, `effective`, `assignSlots`, `applyBeat`, `applyGithub`, `view`, `isGithubMessage` |
| `workers/office/src/ingest.ts` (new) | `parseAllowlist`, `repoAllowed`, `cleanTitle`, `sanitizeBeat`, `parseGithubEvent` |
| `workers/office/src/crypto.ts` (new) | `hmacHex`, `signatureOk` |
| `workers/office/src/office.ts` (new) | Durable Object class `Office` |
| `workers/office/src/worker.ts` (new) | `createOfficeWorker`: routes `/snapshot`, `/beat`, `/github` |
| `workers/office/src/types.ts` (new) | Hand-written binding types |
| `workers/office/src/index.ts` (new) | Module entry: default export and `export { Office }` |
| `workers/office/wrangler.toml` (new) | `hq-office` config, DO binding and migration |
| `workers/office/README.md` (new) | Runbook |
| `functions/_lib/office.ts` (new) | `createOfficeSnapshotHandler`, `createOfficeForwardHandler`, `offSnapshot` |
| `functions/_lib/types.ts` | `ServiceBinding`, `EdgeCache`, `OfficeEnv` |
| `functions/api/office/index.ts`, `beat.ts`, `github.ts` (new) | Route entries |
| `wrangler.toml` | `[[services]] OFFICE`, `OFFICE_ENABLED` |
| `.github/workflows/office-worker.yml` (new), `.github/workflows/deploy.yml` | Bundle check on PRs; deploy before the Pages upload |
| `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts` | No e2e for the office backend |
| `tests/office/*.test.ts` (new) | Contract, state, ingest, Worker and DO, Functions |
| `docs/agents/office.md` (new), `AGENTS.md`, `docs/agents/folder-layout.md`, `docs/agents/ci-and-deploy.md`, `docs/deploy.md`, `docs/features.md` | Docs |

---

### Task 1: Snapshot and beat contract

**Files:**
- Create: `src/lib/office/protocol.ts`, `src/lib/office/fixtures.ts`
- Test: `tests/office/protocol.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by every later task and by PR2 to PR4): `OFFICE_AGENTS`, `OfficeAgent`, `OFFICE_STATES`, `OfficeState`, `OFFICE_ACTIVITIES`, `OfficeActivity`, `OFFICE_MODES`, `OfficeMode`, `OFFICE_DESKS = 5`, `OFFICE_RECENT = 5`, `OFFICE_FEED = 20`, `OFFICE_PATH = "/api/office"`, `OFFICE_BEAT_PATH = "/api/office/beat"`, `OFFICE_GITHUB_PATH = "/api/office/github"`, `OFFICE_BEAT_MAX_BYTES = 2048`, `OFFICE_TITLE_MAX = 80`, `OFFICE_FEED_TITLE_MAX = 120`, types `OfficeProgress`, `OfficeRecent`, `OfficeDesk`, `OfficeGithubKind`, `OfficeGithubStatus`, `OfficeGithubItem`, `OfficeToday`, `OfficeSnapshotV1`, `OfficeDisabledV1`, `OfficeResponseV1`, `OfficeBeatV1`; functions `wibDay(now: number): string`, `parseOfficeResponse(raw: unknown): OfficeResponseV1 | null`, `parseOfficeBeat(raw: unknown): OfficeBeatV1 | null`; fixtures `OFFICE_FIXTURE_NOW: number`, `OFFICE_FIXTURES: Record<"busy" | "rough" | "quiet" | "semiLive" | "off" | "disabled", OfficeResponseV1>`.

- [ ] **Step 1: Write the failing test**

Create `tests/office/protocol.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { OFFICE_FIXTURE_NOW, OFFICE_FIXTURES } from "@/lib/office/fixtures";
import { OFFICE_DESKS, parseOfficeBeat, parseOfficeResponse, wibDay } from "@/lib/office/protocol";

const SESSION = "a".repeat(64);
const beat = (extra: Record<string, unknown> = {}) => ({ v: 1, agent: "copilot", session: SESSION, state: "working", activity: "editing", ts: OFFICE_FIXTURE_NOW, ...extra });

describe("wibDay", () => {
  it("rolls over at 00:00 WIB (17:00 UTC)", () => {
    expect(wibDay(Date.UTC(2026, 9, 18, 16, 59))).toBe("2026-10-18");
    expect(wibDay(Date.UTC(2026, 9, 18, 17, 0))).toBe("2026-10-19");
  });
});

describe("parseOfficeResponse", () => {
  it("accepts every fixture unchanged", () => {
    for (const [name, value] of Object.entries(OFFICE_FIXTURES)) expect(parseOfficeResponse(JSON.parse(JSON.stringify(value))), name).toEqual(value);
  });

  it("rejects unknown keys, bad enums, duplicate slots and too many desks", () => {
    const busy = JSON.parse(JSON.stringify(OFFICE_FIXTURES.busy));
    expect(parseOfficeResponse({ ...busy, extraField: 1 })).toBeNull();
    expect(parseOfficeResponse({ ...busy, mode: "maybe" })).toBeNull();
    expect(parseOfficeResponse({ ...busy, desks: [{ ...busy.desks[0], state: "dancing" }] })).toBeNull();
    expect(parseOfficeResponse({ ...busy, desks: [busy.desks[0], { ...busy.desks[1], slot: busy.desks[0].slot }] })).toBeNull();
    expect(parseOfficeResponse({ ...busy, desks: Array.from({ length: OFFICE_DESKS + 1 }, (_, slot) => ({ ...busy.desks[0], slot })) })).toBeNull();
    expect(parseOfficeResponse({ ...busy, desks: [{ ...busy.desks[0], prompt: "hello" }] })).toBeNull();
    expect(parseOfficeResponse({ ...busy, github: [{ ...busy.github[0], url: "javascript:alert(1)" }] })).toBeNull();
    expect(parseOfficeResponse({ ...busy, github: [{ ...busy.github[0], title: "<script>" }] })).toBeNull();
    expect(parseOfficeResponse({ v: 1, enabled: false, mode: "live" })).toBeNull();
    expect(parseOfficeResponse({ v: 2, enabled: false })).toBeNull();
    expect(parseOfficeResponse(null)).toBeNull();
  });
});

describe("parseOfficeBeat", () => {
  it("accepts a minimal beat and one with an allowlisted repository", () => {
    expect(parseOfficeBeat(beat())).toEqual(beat());
    const full = beat({ repo: "ShinyQ/ShinyQ-HQ", branch: "feat/intro-orbit-reveal", title: "Intro orbit reveal" });
    expect(parseOfficeBeat(full)).toEqual(full);
  });

  it("rejects extra fields, bad enums, a raw session id and titles with markup", () => {
    expect(parseOfficeBeat(beat({ prompt: "fix the bug" }))).toBeNull();
    expect(parseOfficeBeat(beat({ cwd: "/Users/x" }))).toBeNull();
    expect(parseOfficeBeat(beat({ agent: "cursor" }))).toBeNull();
    expect(parseOfficeBeat(beat({ state: "idle" }))).toBeNull();
    expect(parseOfficeBeat(beat({ session: "session-123" }))).toBeNull();
    expect(parseOfficeBeat(beat({ repo: "ShinyQ/ShinyQ-HQ", title: "<b>x</b>" }))).toBeNull();
    expect(parseOfficeBeat(beat({ repo: "ShinyQ/ShinyQ-HQ", title: "x".repeat(81) }))).toBeNull();
    expect(parseOfficeBeat(beat({ title: "Orphan title" }))).toBeNull();
    expect(parseOfficeBeat(beat({ ts: 1.5 }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/office/protocol.test.ts`
Expected: FAIL with "Failed to resolve import "@/lib/office/fixtures"".

- [ ] **Step 3: Write the contract**

Create `src/lib/office/protocol.ts`:

```ts
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
  /** 0 to 4, west to east along the console arc. */
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
```

Create `src/lib/office/fixtures.ts`:

```ts
import { wibDay, type OfficeDesk, type OfficeGithubItem, type OfficeResponseV1, type OfficeSnapshotV1 } from "./protocol";

/** Fixed clock of the fixtures: 2026-10-18 15:00 WIB. */
export const OFFICE_FIXTURE_NOW = Date.UTC(2026, 9, 18, 8, 0, 0);

const ago = (minutes: number) => OFFICE_FIXTURE_NOW - Math.round(minutes * 60_000);
const HQ = "ShinyQ/ShinyQ-HQ";
const RUNS = "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs";

function desk(d: Omit<OfficeDesk, "recent">, recent: OfficeDesk["recent"] = [{ state: d.state, activity: d.activity, at: d.since }]): OfficeDesk {
  return { ...d, recent };
}

const BUSY_DESKS: OfficeDesk[] = [
  desk({ slot: 0, agent: "copilot", state: "working", activity: "editing", since: ago(14), repo: HQ, title: "Narrower 3D perf selection" }, [
    { state: "working", activity: "editing", at: ago(14) },
    { state: "testing", activity: "testing", at: ago(16) },
    { state: "thinking", activity: "planning", at: ago(18) },
  ]),
  desk({ slot: 1, agent: "claude", state: "thinking", activity: "planning", since: ago(3) }),
  desk({ slot: 2, agent: "copilot", state: "ci", activity: "ci", since: ago(9), repo: HQ, title: "Intro orbit reveal", progress: { done: 7, total: 12 } }),
  desk({ slot: 3, agent: "codex", state: "input", activity: "asking", since: ago(2), repo: HQ, title: "Glass shader NaN" }),
  desk({ slot: 4, agent: "claude", state: "done", activity: "finished", since: ago(0.1) }),
];

const BUSY_GITHUB: OfficeGithubItem[] = [
  { kind: "run", status: "running", repo: HQ, title: "CI · feat/intro-orbit-reveal", at: ago(6), url: `${RUNS}/1001`, progress: { done: 7, total: 12 } },
  { kind: "deploy", status: "success", repo: HQ, title: "Deploy · production", at: ago(118), url: `${RUNS}/999` },
  { kind: "run", status: "success", repo: HQ, title: "CI · main", at: ago(120), url: `${RUNS}/998` },
  { kind: "pr", status: "merged", repo: HQ, title: "#227 Rover wakes up, then a reveal orbit", at: ago(125), url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/227" },
];

const TODAY = { day: wibDay(OFFICE_FIXTURE_NOW), tasksDone: 9, prsMerged: 7, ciRuns: 14, ciGreen: 13 };

const busy: OfficeSnapshotV1 = { v: 1, enabled: true, mode: "live", updatedAt: OFFICE_FIXTURE_NOW, desks: BUSY_DESKS, extra: 1, github: BUSY_GITHUB, today: TODAY };

const rough: OfficeSnapshotV1 = {
  ...busy,
  desks: BUSY_DESKS.map((d) => {
    if (d.slot === 1) return desk({ slot: 1, agent: "claude", state: "reviewing", activity: "reading", since: ago(1) });
    if (d.slot === 2) return desk({ slot: 2, agent: "copilot", state: "failed", activity: "failed", since: ago(1), repo: HQ, title: "Intro orbit reveal", job: "E2E shard 3/8" });
    if (d.slot === 4) return desk({ slot: 4, agent: "claude", state: "testing", activity: "testing", since: ago(2) });
    return d;
  }),
  github: [{ kind: "run", status: "failure", repo: HQ, title: "CI · feat/intro-orbit-reveal", at: ago(1), url: `${RUNS}/1001` }, ...BUSY_GITHUB.slice(1)],
};

const quiet: OfficeSnapshotV1 = {
  ...busy,
  extra: 0,
  desks: BUSY_DESKS.map((d) =>
    d.slot === 1 ? desk({ slot: 1, agent: "claude", state: "reviewing", activity: "reading", since: ago(4) }) : desk({ slot: d.slot, agent: d.agent, state: "asleep", activity: "resting", since: ago(60 + d.slot) }),
  ),
};

const semiLive: OfficeSnapshotV1 = { ...busy, mode: "semi-live", desks: [], extra: 0, github: BUSY_GITHUB.slice(1) };

const off: OfficeSnapshotV1 = { v: 1, enabled: true, mode: "off", updatedAt: OFFICE_FIXTURE_NOW, desks: [], extra: 0, github: [], today: { ...TODAY, tasksDone: 0, prsMerged: 0, ciRuns: 0, ciGreen: 0 } };

/** Snapshots for unit tests, e2e mocks of GET /api/office and the owner's captures. */
export const OFFICE_FIXTURES: Record<"busy" | "rough" | "quiet" | "semiLive" | "off" | "disabled", OfficeResponseV1> = {
  busy,
  rough,
  quiet,
  semiLive,
  off,
  disabled: { v: 1, enabled: false },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run tests/office/protocol.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/office tests/office/protocol.test.ts
git commit -m "feat(office): snapshot and beat contract v1 with fixtures"
```

### Task 2: Blocklist matching without Node APIs

The Worker must run the public safety blocklist over titles, but `src/content/safety.ts` imports `node:fs`. Move the
pure matcher into its own module and re-export it, so existing imports keep working.

**Files:**
- Create: `src/content/safety-match.ts`
- Modify: `src/content/safety.ts:59-61` (remove `escapeRegExp`), `src/content/safety.ts:99-110` (remove `findBlockedTerms`), add the import and re-export at the top
- Test: `tests/unit/safety-match.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `findBlockedTerms(text: string, terms: readonly string[]): string[]` and `escapeRegExp(value: string): string` from `@/content/safety-match` (Task 4 imports it by relative path `../../../src/content/safety-match`); `@/content/safety` still exports `findBlockedTerms`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/safety-match.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findBlockedTerms as fromSafety } from "@/content/safety";
import { findBlockedTerms } from "@/content/safety-match";

describe("safety-match", () => {
  it("matches whole words case-insensitively and /regex/ terms case-sensitively", () => {
    expect(findBlockedTerms("Shipped for Acme Corp today", ["acme corp", "/^Shipped/", "/^shipped/"])).toEqual(["acme corp", "/^Shipped/"]);
    expect(findBlockedTerms("acmecorp", ["acme"])).toEqual([]);
  });

  it("is the function safety.ts exports", () => {
    expect(fromSafety).toBe(findBlockedTerms);
  });

  it("imports no Node module (the hq-office Worker bundles it)", () => {
    expect(readFileSync("src/content/safety-match.ts", "utf8")).not.toMatch(/from "node:|require\(/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/unit/safety-match.test.ts`
Expected: FAIL with "Failed to resolve import "@/content/safety-match"".

- [ ] **Step 3: Move the matcher**

Create `src/content/safety-match.ts`:

```ts
/**
 * Blocklist matching without Node APIs, shared by the content checks (src/content/safety.ts) and the hq-office Worker
 * (workers/office/src/ingest.ts), which bundles it.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Case-insensitive whole-word match. Terms wrapped in slashes (`/regex/`) are
 * treated as case-sensitive regular expressions.
 */
export function findBlockedTerms(text: string, terms: readonly string[]): string[] {
  return terms.filter((term) => {
    if (term.length > 2 && term.startsWith("/") && term.endsWith("/")) {
      return new RegExp(term.slice(1, -1)).test(text);
    }
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}($|[^\\p{L}\\p{N}])`, "iu").test(text);
  });
}
```

In `src/content/safety.ts`, delete the local `function escapeRegExp(...) { ... }` (lines 59 to 61) and the
`findBlockedTerms` doc comment and function (lines 99 to 110), then add under the existing imports (line 3):

```ts
import { escapeRegExp, findBlockedTerms } from "./safety-match";

export { findBlockedTerms };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run tests/unit/safety-match.test.ts tests/unit/safety.test.ts tests/unit/safety-redaction.test.ts tests/content/safety.test.ts`
Expected: PASS (the existing safety suites unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/content/safety-match.ts src/content/safety.ts tests/unit/safety-match.test.ts
git commit -m "refactor(safety): move the blocklist matcher into a module without Node APIs"
```

### Task 3: Office state reducer and time rules

**Files:**
- Create: `workers/office/src/state.ts`
- Test: `tests/office/state.test.ts`

**Interfaces:**
- Consumes: Task 1 (`OFFICE_DESKS`, `OFFICE_FEED`, `OFFICE_FEED_TITLE_MAX`, `OFFICE_RECENT`, `wibDay`, the types).
- Produces:
  - `TIMING` (`thinkingAfter 20_000`, `asleepAfter 180_000`, `longWaitAsleepAfter 900_000`, `removeAfter 1_800_000`, `doneFor 20_000`, `runStaleAfter 21_600_000`, `deliveriesKept 200`, `prsKept 50`, `runsKept 20`, `publicReposKept 50`)
  - types `SessionRecord`, `RunStatus`, `JobStatus`, `RunRecord`, `PrRecord`, `FeedRecord`, `OfficeDoc`, `GithubChange`, `GithubUpdate`, `GithubMessage`, `Effective`
  - `emptyDoc(now: number): OfficeDoc`, `effective(s: SessionRecord, now: number): Effective | null`, `assignSlots(sessions: SessionRecord[], now: number): SessionRecord[]`, `applyBeat(doc: OfficeDoc, beat: OfficeBeatV1, now: number): OfficeDoc`, `applyGithub(doc: OfficeDoc, update: GithubUpdate, delivery: string, now: number): OfficeDoc`, `view(doc: OfficeDoc, now: number): OfficeSnapshotV1`, `isGithubMessage(x: unknown): x is GithubMessage`

- [ ] **Step 1: Write the failing test**

Create `tests/office/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseOfficeResponse, type OfficeBeatV1 } from "@/lib/office/protocol";
import { applyBeat, applyGithub, assignSlots, emptyDoc, effective, TIMING, view, type OfficeDoc, type SessionRecord } from "../../workers/office/src/state";

const T0 = Date.UTC(2026, 9, 18, 8, 0, 0);
const HQ = "ShinyQ/ShinyQ-HQ";
const sid = (n: number) => n.toString(16).padStart(64, "0");
const beat = (n: number, extra: Partial<OfficeBeatV1> = {}): OfficeBeatV1 => ({ v: 1, agent: "copilot", session: sid(n), state: "working", activity: "editing", ts: T0, ...extra });
const publicDoc = (): OfficeDoc => applyGithub(emptyDoc(T0), { repo: HQ, changes: [] }, "ping-1", T0);

describe("time rules", () => {
  const rec = (extra: Partial<SessionRecord>): SessionRecord => ({ id: sid(1), agent: "claude", slot: 0, firstSeen: T0, lastBeat: T0, state: "working", activity: "editing", since: T0, recent: [], ...extra });

  it("shows thinking after a quiet 20 s while working or reviewing", () => {
    expect(effective(rec({}), T0 + TIMING.thinkingAfter - 1)?.state).toBe("working");
    expect(effective(rec({}), T0 + TIMING.thinkingAfter)).toEqual({ state: "thinking", activity: "planning", since: T0 + TIMING.thinkingAfter });
    expect(effective(rec({ state: "reviewing", activity: "reading" }), T0 + 30_000)?.state).toBe("thinking");
  });

  it("falls asleep after 3 min, or 15 min while testing, on CI or waiting for input", () => {
    expect(effective(rec({}), T0 + TIMING.asleepAfter)).toEqual({ state: "asleep", activity: "resting", since: T0 + TIMING.asleepAfter });
    expect(effective(rec({ state: "testing", activity: "testing" }), T0 + TIMING.asleepAfter)?.state).toBe("testing");
    expect(effective(rec({ state: "ci", activity: "ci" }), T0 + TIMING.longWaitAsleepAfter)?.state).toBe("asleep");
  });

  it("shows done for 20 s, holds failed, removes after 30 min", () => {
    expect(effective(rec({ state: "done", activity: "finished" }), T0 + 19_000)?.state).toBe("done");
    expect(effective(rec({ state: "done", activity: "finished" }), T0 + 20_000)?.state).toBe("asleep");
    expect(effective(rec({ state: "failed", activity: "failed" }), T0 + 10 * 60_000)?.state).toBe("failed");
    expect(effective(rec({}), T0 + TIMING.removeAfter)).toBeNull();
  });
});

describe("desks", () => {
  it("keeps slots stable and counts sessions beyond five as extra", () => {
    let doc = emptyDoc(T0);
    for (let n = 1; n <= 6; n++) doc = applyBeat(doc, beat(n), T0 + n);
    const snap = view(doc, T0 + 10);
    expect(snap.desks.map((d) => d.slot)).toEqual([0, 1, 2, 3, 4]);
    expect(snap.extra).toBe(1);
    doc = applyBeat(doc, beat(3, { state: "testing", activity: "testing" }), T0 + 20);
    expect(view(doc, T0 + 21).desks[2]).toMatchObject({ slot: 2, state: "testing" });
  });

  it("lets a waiting awake session take the longest-asleep desk", () => {
    const at = (lastBeat: number, slot: number | null, n: number, state: SessionRecord["state"]): SessionRecord => ({ id: sid(n), agent: "codex", slot, firstSeen: n, lastBeat, state, activity: state === "asleep" ? "resting" : "editing", since: lastBeat, recent: [] });
    const out = assignSlots([at(T0 - 5 * 60_000, 0, 1, "working"), at(T0 - 4 * 60_000, 1, 2, "working"), at(T0, 2, 3, "working"), at(T0, 3, 4, "working"), at(T0, 4, 5, "working"), at(T0, null, 6, "working")], T0);
    expect(out.find((s) => s.id === sid(6))?.slot).toBe(0);
    expect(out.find((s) => s.id === sid(1))?.slot).toBeNull();
  });
});

describe("applyBeat", () => {
  it("keeps repository and title only for repositories a webhook reported public", () => {
    const withRepo = beat(1, { repo: HQ, branch: "feat/x", title: "X" });
    expect(view(applyBeat(emptyDoc(T0), withRepo, T0), T0).desks[0]).not.toHaveProperty("repo");
    expect(view(applyBeat(publicDoc(), withRepo, T0), T0).desks[0]).toMatchObject({ repo: HQ, title: "X" });
  });

  it("records state changes in recent (newest first, five at most) and counts tasks done once", () => {
    let doc = emptyDoc(T0);
    const states: OfficeBeatV1["state"][] = ["thinking", "working", "testing", "working", "reviewing", "done", "done"];
    states.forEach((state, i) => (doc = applyBeat(doc, beat(1, { state }), T0 + i * 1000)));
    const desk = view(doc, T0 + 7000).desks[0];
    expect(desk.recent.map((r) => r.state)).toEqual(["done", "reviewing", "working", "testing", "working"]);
    expect(desk.since).toBe(T0 + 5000);
    expect(view(doc, T0 + 7000).today.tasksDone).toBe(1);
  });

  it("resets today at 00:00 WIB", () => {
    const doc = applyBeat(emptyDoc(T0), beat(1, { state: "done", activity: "finished" }), T0);
    const next = Date.UTC(2026, 9, 18, 17, 0, 0);
    expect(view(doc, next).today).toEqual({ day: "2026-10-19", tasksDone: 0, prsMerged: 0, ciRuns: 0, ciGreen: 0 });
  });
});

describe("applyGithub", () => {
  const run = (status: "running" | "success" | "failure" | "cancelled") => ({ type: "run" as const, id: 42, branch: "feat/x", title: "CI · feat/x", url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/42", status });

  it("tracks job progress for the desk on that branch and counts CI runs once", () => {
    let doc = applyBeat(publicDoc(), beat(1, { repo: HQ, branch: "feat/x", state: "ci", activity: "ci" }), T0);
    doc = applyGithub(doc, { repo: HQ, changes: [run("running")] }, "d1", T0);
    doc = applyGithub(doc, { repo: HQ, changes: [{ type: "job", runId: 42, jobId: "1", name: "Lint", status: "done" }, { type: "job", runId: 42, jobId: "2", name: "E2E", status: "running" }] }, "d2", T0);
    const snap = view(doc, T0);
    expect(snap.desks[0].progress).toEqual({ done: 1, total: 2 });
    expect(snap.github[0]).toMatchObject({ kind: "run", status: "running", progress: { done: 1, total: 2 } });
    doc = applyGithub(doc, { repo: HQ, changes: [run("success")] }, "d3", T0);
    doc = applyGithub(doc, { repo: HQ, changes: [run("success")] }, "d3", T0);
    expect(view(doc, T0).today).toMatchObject({ ciRuns: 1, ciGreen: 1 });
  });

  it("fails the waiting desk with the failed job's name", () => {
    let doc = applyBeat(publicDoc(), beat(1, { repo: HQ, branch: "feat/x", state: "ci", activity: "ci" }), T0);
    doc = applyGithub(doc, { repo: HQ, changes: [run("running"), { type: "job", runId: 42, jobId: "9", name: "E2E shard 3/8", status: "failed" }] }, "d1", T0);
    doc = applyGithub(doc, { repo: HQ, changes: [run("failure")] }, "d2", T0 + 1000);
    expect(view(doc, T0 + 2000).desks[0]).toMatchObject({ state: "failed", activity: "failed", job: "E2E shard 3/8" });
  });

  it("uses the PR title for the desk's branch, counts merges and drops cancelled runs", () => {
    let doc = applyBeat(publicDoc(), beat(1, { repo: HQ, branch: "feat/x", title: "X" }), T0);
    doc = applyGithub(doc, { repo: HQ, changes: [{ type: "pr", number: 7, branch: "feat/x", title: "feat: the real title", url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/7", action: "merged" }] }, "p1", T0);
    expect(view(doc, T0).desks[0].title).toBe("feat: the real title");
    expect(view(doc, T0).today.prsMerged).toBe(1);
    doc = applyGithub(doc, { repo: HQ, changes: [run("running")] }, "r1", T0);
    doc = applyGithub(doc, { repo: HQ, changes: [run("cancelled")] }, "r2", T0);
    expect(view(doc, T0).github.map((g) => g.kind)).toEqual(["pr"]);
  });

  it("returns the same document for a repeated delivery", () => {
    const doc = publicDoc();
    expect(applyGithub(doc, { repo: HQ, changes: [] }, "ping-1", T0 + 1)).toBe(doc);
  });
});

describe("view", () => {
  it("is valid under the public contract, live with sessions and semi-live without", () => {
    const empty = view(publicDoc(), T0);
    expect(empty.mode).toBe("semi-live");
    expect(parseOfficeResponse(JSON.parse(JSON.stringify(empty)))).not.toBeNull();
    const live = view(applyBeat(publicDoc(), beat(1, { repo: HQ, branch: "feat/x", title: "X" }), T0), T0);
    expect(live.mode).toBe("live");
    expect(parseOfficeResponse(JSON.parse(JSON.stringify(live)))).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/office/state.test.ts`
Expected: FAIL with "Failed to resolve import "../../workers/office/src/state"".

- [ ] **Step 3: Write the reducer**

Create `workers/office/src/state.ts`:

```ts
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
  | { type: "deploy"; id: number; title: string; url: string; status: "running" | "success" | "failure" };

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
  }
}

/** Applies one webhook delivery (deduped by its delivery id) for an allowlisted public repository. */
export function applyGithub(doc: OfficeDoc, update: GithubUpdate, delivery: string, now: number): OfficeDoc {
  if (delivery && doc.deliveries.includes(delivery)) return doc;
  let next: OfficeDoc = {
    ...doc,
    today: rollToday(doc.today, now),
    publicRepos: doc.publicRepos.includes(update.repo) ? doc.publicRepos : [...doc.publicRepos, update.repo].slice(-TIMING.publicReposKept),
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run tests/office/state.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add workers/office/src/state.ts tests/office/state.test.ts
git commit -m "feat(office): Durable Object state reducer with time rules and stable desks"
```

### Task 4: Signatures, beat sanitizing and GitHub parsing

**Files:**
- Create: `workers/office/src/crypto.ts`, `workers/office/src/ingest.ts`
- Test: `tests/office/ingest.test.ts`

**Interfaces:**
- Consumes: Task 1 (`OFFICE_FEED_TITLE_MAX`, `OfficeBeatV1`), Task 2 (`findBlockedTerms`), Task 3 (`GithubChange`, `GithubUpdate`, `JobStatus`, `RunStatus`), `timingSafeEqual` from `functions/_lib/security.ts`.
- Produces: `hmacHex(secret: string, message: string): Promise<string>`, `signatureOk(secret: string, body: string, header: string | null): Promise<boolean>`, `parseAllowlist(raw: string | undefined): string[]`, `repoAllowed(repo: string, allow: readonly string[]): boolean`, `cleanTitle(text: string, blocklist: readonly string[], max?: number): string | null`, `sanitizeBeat(beat: OfficeBeatV1, allow: readonly string[], blocklist: readonly string[]): OfficeBeatV1`, `parseGithubEvent(event: string, payload: unknown, allow: readonly string[], blocklist: readonly string[]): GithubUpdate | null`. PR2's relay signs with the same scheme (`sha256=` plus lowercase hex).

- [ ] **Step 1: Write the failing test**

Create `tests/office/ingest.test.ts`:

```ts
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { OfficeBeatV1 } from "@/lib/office/protocol";
import { hmacHex, signatureOk } from "../../workers/office/src/crypto";
import { cleanTitle, parseAllowlist, parseGithubEvent, repoAllowed, sanitizeBeat } from "../../workers/office/src/ingest";

const ALLOW = parseAllowlist(" ShinyQ/* , other/one ");
const BLOCK = ["acme bank"];
const repository = (extra: Record<string, unknown> = {}) => ({ full_name: "ShinyQ/ShinyQ-HQ", private: false, default_branch: "main", ...extra });

describe("signatures", () => {
  it("matches node's HMAC-SHA256 hex and checks the sha256= header", async () => {
    const body = '{"a":1}';
    const hex = createHmac("sha256", "k").update(body).digest("hex");
    expect(await hmacHex("k", body)).toBe(hex);
    expect(await signatureOk("k", body, `sha256=${hex}`)).toBe(true);
    expect(await signatureOk("k", body, hex)).toBe(false);
    expect(await signatureOk("k", `${body} `, `sha256=${hex}`)).toBe(false);
    expect(await signatureOk("k", body, null)).toBe(false);
  });
});

describe("allowlist and titles", () => {
  it("matches owner wildcards and exact names, case-insensitively", () => {
    expect(ALLOW).toEqual(["ShinyQ/*", "other/one"]);
    expect(repoAllowed("shinyq/ShinyQ-HQ", ALLOW)).toBe(true);
    expect(repoAllowed("other/one", ALLOW)).toBe(true);
    expect(repoAllowed("other/two", ALLOW)).toBe(false);
    expect(repoAllowed("ShinyQ-evil/x", ALLOW)).toBe(false);
  });

  it("drops blocked titles and cleans markup, control characters and em dashes", () => {
    expect(cleanTitle("Fix login for Acme Bank", BLOCK)).toBeNull();
    expect(cleanTitle("  Fix <b>login</b>\n now  ", BLOCK)).toBe("Fix b login /b now");
    expect(cleanTitle("Wake up \u2014 then orbit", BLOCK)).toBe("Wake up, then orbit");
    expect(cleanTitle("x".repeat(200), BLOCK)).toHaveLength(120);
  });

  it("sanitizes a beat: no repository data outside the allowlist, blocked titles removed", () => {
    const beat: OfficeBeatV1 = { v: 1, agent: "claude", session: "b".repeat(64), state: "working", activity: "editing", repo: "client/app", branch: "feat/x", title: "X", ts: 1 };
    expect(sanitizeBeat(beat, ALLOW, BLOCK)).toEqual({ v: 1, agent: "claude", session: "b".repeat(64), state: "working", activity: "editing", ts: 1 });
    expect(sanitizeBeat({ ...beat, repo: "ShinyQ/ShinyQ-HQ", title: "Acme Bank login" }, ALLOW, BLOCK)).toEqual({ ...beat, repo: "ShinyQ/ShinyQ-HQ", title: undefined });
    expect(sanitizeBeat({ ...beat, repo: "ShinyQ/ShinyQ-HQ" }, ALLOW, BLOCK)).toEqual({ ...beat, repo: "ShinyQ/ShinyQ-HQ" });
  });
});

describe("parseGithubEvent", () => {
  it("ignores private and non-allowlisted repositories", () => {
    expect(parseGithubEvent("ping", { repository: repository({ private: true }) }, ALLOW, BLOCK)).toBeNull();
    expect(parseGithubEvent("ping", { repository: repository({ full_name: "client/app" }) }, ALLOW, BLOCK)).toBeNull();
    expect(parseGithubEvent("ping", { repository: repository() }, ALLOW, BLOCK)).toEqual({ repo: "ShinyQ/ShinyQ-HQ", changes: [] });
  });

  it("maps workflow_run and workflow_job", () => {
    const run = (status: string, conclusion: string | null) => ({ repository: repository(), workflow_run: { id: 42, name: "CI", head_branch: "feat/x", status, conclusion, html_url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/42" } });
    expect(parseGithubEvent("workflow_run", run("in_progress", null), ALLOW, BLOCK)?.changes).toEqual([{ type: "run", id: 42, branch: "feat/x", title: "CI · feat/x", url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/42", status: "running" }]);
    expect(parseGithubEvent("workflow_run", run("completed", "success"), ALLOW, BLOCK)?.changes[0]).toMatchObject({ status: "success" });
    expect(parseGithubEvent("workflow_run", run("completed", "timed_out"), ALLOW, BLOCK)?.changes[0]).toMatchObject({ status: "failure" });
    expect(parseGithubEvent("workflow_run", run("completed", "cancelled"), ALLOW, BLOCK)?.changes[0]).toMatchObject({ status: "cancelled" });
    const job = { repository: repository(), workflow_job: { id: 7, run_id: 42, name: "E2E shard 3/8", status: "completed", conclusion: "failure" } };
    expect(parseGithubEvent("workflow_job", job, ALLOW, BLOCK)?.changes).toEqual([{ type: "job", runId: 42, jobId: "7", name: "E2E shard 3/8", status: "failed" }]);
  });

  it("maps pull requests, default-branch pushes and deployments", () => {
    const pr = (action: string, merged: boolean) => ({ action, number: 7, repository: repository(), pull_request: { number: 7, merged, title: "feat: office", html_url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/7", head: { ref: "feat/office" } } });
    expect(parseGithubEvent("pull_request", pr("opened", false), ALLOW, BLOCK)?.changes).toEqual([{ type: "pr", number: 7, branch: "feat/office", title: "feat: office", url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/7", action: "opened" }]);
    expect(parseGithubEvent("pull_request", pr("closed", true), ALLOW, BLOCK)?.changes[0]).toMatchObject({ action: "merged" });
    expect(parseGithubEvent("pull_request", pr("closed", false), ALLOW, BLOCK)?.changes).toEqual([]);
    const push = (ref: string) => ({ ref, repository: repository(), head_commit: { id: "abc1234def", message: "feat: office (#230)\n\nbody", url: "https://github.com/ShinyQ/ShinyQ-HQ/commit/abc1234def" } });
    expect(parseGithubEvent("push", push("refs/heads/main"), ALLOW, BLOCK)?.changes).toEqual([{ type: "push", sha: "abc1234def", title: "main · feat: office (#230)", url: "https://github.com/ShinyQ/ShinyQ-HQ/commit/abc1234def" }]);
    expect(parseGithubEvent("push", push("refs/heads/feat/x"), ALLOW, BLOCK)?.changes).toEqual([]);
    const deploy = { repository: repository(), deployment: { id: 9, environment: "production" }, deployment_status: { state: "success", environment: "production", target_url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/43" } };
    expect(parseGithubEvent("deployment_status", deploy, ALLOW, BLOCK)?.changes).toEqual([{ type: "deploy", id: 9, title: "Deploy · production", url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/43", status: "success" }]);
  });

  it("replaces a blocked title with a generic one and an unsafe URL with the repository URL", () => {
    const pr = { action: "opened", number: 8, repository: repository(), pull_request: { number: 8, merged: false, title: "Acme Bank fix", html_url: "javascript:alert(1)", head: { ref: "fix/y" } } };
    expect(parseGithubEvent("pull_request", pr, ALLOW, BLOCK)?.changes[0]).toMatchObject({ title: "Pull request #8", url: "https://github.com/ShinyQ/ShinyQ-HQ" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/office/ingest.test.ts`
Expected: FAIL with "Failed to resolve import "../../workers/office/src/crypto"".

- [ ] **Step 3: Write the modules**

Create `workers/office/src/crypto.ts`:

```ts
import { timingSafeEqual } from "../../../functions/_lib/security";

/** HMAC-SHA256 of `message` keyed with `secret`, lowercase hex (the GitHub and relay signature format). */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time check of a `sha256=<hex>` header (X-Office-Signature, X-Hub-Signature-256) over the raw body. */
export async function signatureOk(secret: string, body: string, header: string | null): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  return timingSafeEqual(header.slice("sha256=".length).toLowerCase(), await hmacHex(secret, body));
}
```

Create `workers/office/src/ingest.ts`:

```ts
import { findBlockedTerms } from "../../../src/content/safety-match";
import { OFFICE_FEED_TITLE_MAX, type OfficeBeatV1 } from "../../../src/lib/office/protocol";
import type { GithubChange, GithubUpdate, JobStatus, RunStatus } from "./state";

const REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,120}$/;
const SAFE_URL = /^https:\/\/[^\s"'<>\\]{1,300}$/;
const SHA = /^[0-9a-f]{7,40}$/;

/** `OFFICE_REPO_ALLOWLIST`: comma-separated `owner/*` or `owner/name` entries. */
export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function repoAllowed(repo: string, allow: readonly string[]): boolean {
  const name = repo.toLowerCase();
  return allow.some((entry) => {
    const e = entry.toLowerCase();
    return e.endsWith("/*") ? name.startsWith(e.slice(0, -1)) : name === e;
  });
}

/** One clean line of at most `max` characters, or null when empty or when it contains a blocklisted term. */
export function cleanTitle(text: string, blocklist: readonly string[], max = OFFICE_FEED_TITLE_MAX): string | null {
  const line = text
    .replace(/\s*\u2014\s*/g, ", ")
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
  if (!line || findBlockedTerms(line, blocklist).length > 0) return null;
  return line;
}

/** Server re-check of a parsed beat: repository data only for allowlisted names, titles through the blocklist. */
export function sanitizeBeat(beat: OfficeBeatV1, allow: readonly string[], blocklist: readonly string[]): OfficeBeatV1 {
  const base: OfficeBeatV1 = { v: 1, agent: beat.agent, session: beat.session, state: beat.state, activity: beat.activity, ts: beat.ts };
  if (!beat.repo || !repoAllowed(beat.repo, allow)) return base;
  const title = beat.title ? cleanTitle(beat.title, blocklist) : null;
  return { ...base, repo: beat.repo, ...(beat.branch ? { branch: beat.branch } : {}), ...(beat.title ? { title: title ?? undefined } : {}) };
}

type Json = Record<string, unknown>;
const obj = (x: unknown): Json | null => (typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Json) : null);
const text = (x: unknown): string => (typeof x === "string" ? x : "");
const int = (x: unknown): number | null => (typeof x === "number" && Number.isSafeInteger(x) ? x : null);

function runStatus(status: string, conclusion: string): RunStatus {
  if (status !== "completed") return "running";
  if (conclusion === "success") return "success";
  if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "startup_failure") return "failure";
  return "cancelled";
}

function jobStatus(status: string, conclusion: string): JobStatus {
  if (status === "completed") return conclusion === "failure" || conclusion === "timed_out" ? "failed" : "done";
  return status === "in_progress" ? "running" : "queued";
}

function deployStatus(state: string): "running" | "success" | "failure" | null {
  if (state === "success") return "success";
  if (state === "failure" || state === "error") return "failure";
  if (state === "pending" || state === "queued" || state === "in_progress") return "running";
  return null;
}

/**
 * One GitHub webhook delivery to office changes, for allowlisted public repositories only (null otherwise, which also
 * keeps private repositories out of the known-public list). Titles go through the blocklist; URLs must be https.
 */
export function parseGithubEvent(event: string, payload: unknown, allow: readonly string[], blocklist: readonly string[]): GithubUpdate | null {
  const body = obj(payload);
  const repository = obj(body?.repository);
  const repo = text(repository?.full_name);
  if (!body || !repository || repository.private !== false || !REPO.test(repo) || !repoAllowed(repo, allow)) return null;
  const home = `https://github.com/${repo}`;
  const url = (x: unknown) => (SAFE_URL.test(text(x)) ? text(x) : home);
  const title = (raw: string, fallback: string) => cleanTitle(raw, blocklist) ?? fallback;
  const changes: GithubChange[] = [];
  switch (event) {
    case "workflow_run": {
      const run = obj(body.workflow_run);
      const id = int(run?.id);
      const branch = text(run?.head_branch);
      if (!run || id === null || !BRANCH.test(branch)) break;
      changes.push({ type: "run", id, branch, title: title(`${text(run.name)} · ${branch}`, `Workflow run · ${branch}`), url: url(run.html_url), status: runStatus(text(run.status), text(run.conclusion)) });
      break;
    }
    case "workflow_job": {
      const job = obj(body.workflow_job);
      const runId = int(job?.run_id);
      const jobId = int(job?.id);
      if (!job || runId === null || jobId === null) break;
      changes.push({ type: "job", runId, jobId: String(jobId), name: title(text(job.name), "Job"), status: jobStatus(text(job.status), text(job.conclusion)) });
      break;
    }
    case "pull_request": {
      const pr = obj(body.pull_request);
      const number = int(pr?.number);
      const branch = text(obj(pr?.head)?.ref);
      const action = text(body.action);
      if (!pr || number === null || !BRANCH.test(branch)) break;
      const kind = action === "opened" || action === "reopened" || action === "ready_for_review" ? "opened" : action === "closed" && pr.merged === true ? "merged" : null;
      if (kind) changes.push({ type: "pr", number, branch, title: title(text(pr.title), `Pull request #${number}`), url: url(pr.html_url), action: kind });
      break;
    }
    case "push": {
      const main = text(repository.default_branch);
      const head = obj(body.head_commit);
      const sha = text(head?.id);
      if (!head || !main || text(body.ref) !== `refs/heads/${main}` || !SHA.test(sha)) break;
      const firstLine = text(head.message).split("\n")[0] ?? "";
      changes.push({ type: "push", sha, title: title(`${main} · ${firstLine}`, `Commit to ${main}`), url: url(head.url) });
      break;
    }
    case "deployment_status": {
      const status = obj(body.deployment_status);
      const deployment = obj(body.deployment);
      const id = int(deployment?.id);
      const state = deployStatus(text(status?.state));
      if (!status || id === null || !state) break;
      const environment = text(status.environment) || text(deployment?.environment) || "production";
      changes.push({ type: "deploy", id, title: title(`Deploy · ${environment}`, "Deploy"), url: url(status.target_url ?? status.log_url), status: state });
      break;
    }
    default:
      break;
  }
  return { repo, changes };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run tests/office/ingest.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add workers/office/src/crypto.ts workers/office/src/ingest.ts tests/office/ingest.test.ts
git commit -m "feat(office): HMAC signatures, beat sanitizing and GitHub webhook parsing"
```

### Task 5: Durable Object `Office`, Worker routes and `hq-office` config

**Files:**
- Create: `workers/office/src/types.ts`, `workers/office/src/office.ts`, `workers/office/src/worker.ts`, `workers/office/src/index.ts`, `workers/office/wrangler.toml`
- Test: `tests/office/worker.test.ts`

**Interfaces:**
- Consumes: Task 1 (`OFFICE_BEAT_MAX_BYTES`, `parseOfficeBeat`, `parseOfficeResponse`), Task 3 (`applyBeat`, `applyGithub`, `emptyDoc`, `isGithubMessage`, `view`, `OfficeDoc`), Task 4 (`signatureOk`, `parseAllowlist`, `parseGithubEvent`, `sanitizeBeat`), `readCapped` from `functions/_lib/security.ts`, `functions/_generated/safety.json` (built by `bun scripts/build-knowledge.ts`).
- Produces: `class Office { constructor(ctx: DurableObjectStateLike, env: OfficeWorkerEnv, now?: () => number); fetch(request: Request): Promise<Response> }`; `createOfficeWorker(deps: { blocklist: readonly string[]; now?: () => number }): { fetch(request: Request, env: OfficeWorkerEnv): Promise<Response> }`; constants `GITHUB_MAX_BYTES = 524288`, `REPLAY_WINDOW_MS = 60000`; Worker routes `GET /snapshot`, `POST /beat`, `POST /github` (called only through the Pages service binding, Task 6). Status codes: 204 accepted or ignored, 400 bad body, 401 bad signature or stale `ts`, 405, 404, 413 too large, 502 Durable Object failure, 503 secret missing.

- [ ] **Step 1: Write the failing test**

Create `tests/office/worker.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseOfficeResponse, type OfficeSnapshotV1 } from "@/lib/office/protocol";
import { hmacHex } from "../../workers/office/src/crypto";
import { Office } from "../../workers/office/src/office";
import type { DurableObjectStateLike, OfficeWorkerEnv } from "../../workers/office/src/types";
import { createOfficeWorker } from "../../workers/office/src/worker";

const T0 = Date.UTC(2026, 9, 18, 8, 0, 0);
const KEY = "ingest-key";
const HOOK = "webhook-secret";

function memoryStorage() {
  const map = new Map<string, unknown>();
  const storage: DurableObjectStateLike["storage"] = {
    async get<T>(key: string) {
      return map.get(key) as T | undefined;
    },
    async put<T>(key: string, value: T) {
      map.set(key, structuredClone(value));
    },
  };
  return { map, ctx: { storage } };
}

function setup(now = () => T0) {
  const { map, ctx } = memoryStorage();
  const office = new Office(ctx, {} as OfficeWorkerEnv, now);
  const env: OfficeWorkerEnv = {
    OFFICE_DO: { idFromName: () => "office", get: () => ({ fetch: (input: string, init?: RequestInit) => office.fetch(new Request(input, init)) }) },
    OFFICE_INGEST_KEY: KEY,
    GITHUB_WEBHOOK_SECRET: HOOK,
    OFFICE_REPO_ALLOWLIST: "ShinyQ/*",
  };
  const worker = createOfficeWorker({ blocklist: ["acme bank"], now });
  const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`https://hq-office${path}`, init), env);
  return { map, env, call };
}

async function signedBeat(extra: Record<string, unknown> = {}, key = KEY) {
  const body = JSON.stringify({ v: 1, agent: "copilot", session: "c".repeat(64), state: "working", activity: "editing", ts: T0, ...extra });
  return { method: "POST", body, headers: { "X-Office-Signature": `sha256=${await hmacHex(key, body)}` } };
}

async function signedHook(event: string, payload: unknown, delivery = "d-1") {
  const body = JSON.stringify(payload);
  return { method: "POST", body, headers: { "X-Hub-Signature-256": `sha256=${await hmacHex(HOOK, body)}`, "X-GitHub-Event": event, "X-GitHub-Delivery": delivery } };
}

const snapshot = async (call: ReturnType<typeof setup>["call"]) => parseOfficeResponse(await (await call("/snapshot")).json()) as OfficeSnapshotV1;
const repository = { full_name: "ShinyQ/ShinyQ-HQ", private: false, default_branch: "main" };

describe("hq-office Worker", () => {
  it("starts empty and semi-live", async () => {
    const { call } = setup();
    expect(await snapshot(call)).toMatchObject({ mode: "semi-live", desks: [], extra: 0 });
  });

  it("accepts a signed beat and stores one document", async () => {
    const { call, map } = setup();
    expect((await call("/beat", await signedBeat())).status).toBe(204);
    expect([...map.keys()]).toEqual(["doc"]);
    expect((await snapshot(call)).desks).toMatchObject([{ slot: 0, agent: "copilot", state: "working" }]);
  });

  it("rejects bad signatures, stale or future timestamps, bad bodies and big bodies", async () => {
    const { call } = setup();
    expect((await call("/beat", await signedBeat({}, "wrong"))).status).toBe(401);
    expect((await call("/beat", await signedBeat({ ts: T0 - 61_000 }))).status).toBe(401);
    expect((await call("/beat", await signedBeat({ ts: T0 + 61_000 }))).status).toBe(401);
    expect((await call("/beat", await signedBeat({ prompt: "secret" }))).status).toBe(400);
    expect((await call("/beat", await signedBeat({ title: "x".repeat(3000) }))).status).toBe(413);
    expect((await call("/beat", { method: "GET" })).status).toBe(405);
    expect((await snapshot(call)).desks).toEqual([]);
  });

  it("answers 503 without secrets and 404 elsewhere", async () => {
    const { call, env } = setup();
    delete env.OFFICE_INGEST_KEY;
    delete env.GITHUB_WEBHOOK_SECRET;
    expect((await call("/beat", await signedBeat())).status).toBe(503);
    expect((await call("/github", await signedHook("ping", { repository }))).status).toBe(503);
    expect((await call("/nope")).status).toBe(404);
  });

  it("verifies webhooks, learns public repositories and then keeps beat titles", async () => {
    const { call } = setup();
    const titled = { repo: "ShinyQ/ShinyQ-HQ", branch: "feat/x", title: "X" };
    await call("/beat", await signedBeat(titled));
    expect((await snapshot(call)).desks[0]).not.toHaveProperty("title");
    const bad = await signedHook("ping", { repository });
    expect((await call("/github", { ...bad, headers: { ...bad.headers, "X-Hub-Signature-256": "sha256=00" } })).status).toBe(401);
    expect((await call("/github", await signedHook("ping", { repository }))).status).toBe(204);
    await call("/beat", await signedBeat(titled));
    expect((await snapshot(call)).desks[0]).toMatchObject({ repo: "ShinyQ/ShinyQ-HQ", title: "X" });
  });

  it("drops private repositories and redacts blocked titles", async () => {
    const { call } = setup();
    expect((await call("/github", await signedHook("ping", { repository: { ...repository, private: true } }))).status).toBe(204);
    const pr = { action: "opened", repository, pull_request: { number: 3, merged: false, title: "Acme Bank login", html_url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/3", head: { ref: "fix/z" } } };
    await call("/github", await signedHook("pull_request", pr, "d-2"));
    expect((await snapshot(call)).github).toMatchObject([{ kind: "pr", title: "#3 Pull request #3" }]);
  });

  it("keeps the document across a new Durable Object instance (cold start)", async () => {
    const { map, ctx } = memoryStorage();
    const first = new Office(ctx, {} as OfficeWorkerEnv, () => T0);
    const body = JSON.stringify({ v: 1, agent: "codex", session: "d".repeat(64), state: "testing", activity: "testing", ts: T0 });
    expect((await first.fetch(new Request("https://office/beat", { method: "POST", body }))).status).toBe(204);
    const second = new Office({ storage: ctx.storage }, {} as OfficeWorkerEnv, () => T0 + 1000);
    const snap = (await (await second.fetch(new Request("https://office/snapshot"))).json()) as OfficeSnapshotV1;
    expect(snap.desks).toMatchObject([{ agent: "codex", state: "testing" }]);
    expect(map.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/office/worker.test.ts`
Expected: FAIL with "Failed to resolve import "../../workers/office/src/office"".

- [ ] **Step 3: Write the types, the Durable Object, the Worker and the entry**

Create `workers/office/src/types.ts`:

```ts
/**
 * Bindings and secrets of the hq-office Worker, hand-written like functions/_lib/types.ts (no Cloudflare type
 * packages on purpose, T12): only the members this Worker uses.
 */
export interface DurableObjectStubLike {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
}

/** The Durable Object's state: its storage API (backed by SQLite on the free plan). */
export interface DurableObjectStateLike {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
  };
}

export interface OfficeWorkerEnv {
  OFFICE_DO: DurableObjectNamespaceLike;
  /** Secret: HMAC key of relay beats (X-Office-Signature). */
  OFFICE_INGEST_KEY?: string;
  /** Secret: GitHub webhook secret (X-Hub-Signature-256). */
  GITHUB_WEBHOOK_SECRET?: string;
  /** Comma-separated `owner/*` or `owner/name` entries (wrangler.toml [vars]). */
  OFFICE_REPO_ALLOWLIST?: string;
}
```

Create `workers/office/src/office.ts`:

```ts
import { parseOfficeBeat } from "../../../src/lib/office/protocol";
import { applyBeat, applyGithub, emptyDoc, isGithubMessage, view, type OfficeDoc } from "./state";
import type { DurableObjectStateLike, OfficeWorkerEnv } from "./types";

const DOC_KEY = "doc";
const status = (code: number) => new Response(null, { status: code });

/**
 * The Agent Office Durable Object (one instance, `idFromName("office")`). Holds one JSON document in its storage
 * API: read once per cold start, written once per accepted beat or webhook. Time rules apply on read (no alarms).
 */
export class Office {
  private doc: OfficeDoc | null = null;
  private readonly ctx: DurableObjectStateLike;
  private readonly now: () => number;

  constructor(ctx: DurableObjectStateLike, _env: OfficeWorkerEnv, now: () => number = Date.now) {
    this.ctx = ctx;
    this.now = now;
  }

  private async load(): Promise<OfficeDoc> {
    if (!this.doc) this.doc = (await this.ctx.storage.get<OfficeDoc>(DOC_KEY)) ?? emptyDoc(this.now());
    return this.doc;
  }

  private async save(doc: OfficeDoc): Promise<void> {
    this.doc = doc;
    await this.ctx.storage.put(DOC_KEY, doc);
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/snapshot") {
      if (request.method !== "GET") return status(405);
      const body = JSON.stringify(view(await this.load(), this.now()));
      return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    if (pathname !== "/beat" && pathname !== "/github") return status(404);
    if (request.method !== "POST") return status(405);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return status(400);
    }
    const doc = await this.load();
    const now = this.now();
    if (pathname === "/beat") {
      const beat = parseOfficeBeat(body);
      if (!beat) return status(400);
      await this.save(applyBeat(doc, beat, now));
      return status(204);
    }
    if (!isGithubMessage(body)) return status(400);
    const next = applyGithub(doc, body.update, body.delivery, now);
    if (next !== doc) await this.save(next);
    return status(204);
  }
}
```

Create `workers/office/src/worker.ts`:

```ts
import { readCapped } from "../../../functions/_lib/security";
import { OFFICE_BEAT_MAX_BYTES, parseOfficeBeat } from "../../../src/lib/office/protocol";
import { signatureOk } from "./crypto";
import { parseAllowlist, parseGithubEvent, sanitizeBeat } from "./ingest";
import type { OfficeWorkerEnv } from "./types";

export const GITHUB_MAX_BYTES = 512 * 1024;
export const REPLAY_WINDOW_MS = 60_000;
const DO_NAME = "office";
const DO_BASE = "https://office";

const status = (code: number) => new Response(null, { status: code, headers: { "Cache-Control": "no-store" } });

/**
 * hq-office routes, reached only through the Pages service binding (no public route): GET /snapshot,
 * POST /beat (relay, X-Office-Signature) and POST /github (webhooks, X-Hub-Signature-256).
 */
export function createOfficeWorker(deps: { blocklist: readonly string[]; now?: () => number }) {
  const now = deps.now ?? Date.now;
  return {
    async fetch(request: Request, env: OfficeWorkerEnv): Promise<Response> {
      const { pathname } = new URL(request.url);
      const office = env.OFFICE_DO.get(env.OFFICE_DO.idFromName(DO_NAME));
      const post = async (path: string, value: unknown) => {
        const res = await office.fetch(`${DO_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
        return status(res.ok ? 204 : 502);
      };
      if (pathname === "/snapshot") return request.method === "GET" ? office.fetch(`${DO_BASE}/snapshot`) : status(405);
      if (pathname === "/beat") {
        if (request.method !== "POST") return status(405);
        if (!env.OFFICE_INGEST_KEY) return status(503);
        const body = await readCapped(request, OFFICE_BEAT_MAX_BYTES);
        if (body === null) return status(413);
        if (!(await signatureOk(env.OFFICE_INGEST_KEY, body, request.headers.get("X-Office-Signature")))) return status(401);
        let beat: ReturnType<typeof parseOfficeBeat> = null;
        try {
          beat = parseOfficeBeat(JSON.parse(body));
        } catch {
          beat = null;
        }
        if (!beat) return status(400);
        if (Math.abs(now() - beat.ts) > REPLAY_WINDOW_MS) return status(401);
        return post("/beat", sanitizeBeat(beat, parseAllowlist(env.OFFICE_REPO_ALLOWLIST), deps.blocklist));
      }
      if (pathname === "/github") {
        if (request.method !== "POST") return status(405);
        if (!env.GITHUB_WEBHOOK_SECRET) return status(503);
        const body = await readCapped(request, GITHUB_MAX_BYTES);
        if (body === null) return status(413);
        if (!(await signatureOk(env.GITHUB_WEBHOOK_SECRET, body, request.headers.get("X-Hub-Signature-256")))) return status(401);
        let payload: unknown;
        try {
          payload = JSON.parse(body);
        } catch {
          return status(400);
        }
        const update = parseGithubEvent(request.headers.get("X-GitHub-Event") ?? "", payload, parseAllowlist(env.OFFICE_REPO_ALLOWLIST), deps.blocklist);
        if (!update) return status(204);
        return post("/github", { delivery: (request.headers.get("X-GitHub-Delivery") ?? "").slice(0, 64), update });
      }
      return status(404);
    },
  };
}
```

Create `workers/office/src/index.ts`:

```ts
import safety from "../../../functions/_generated/safety.json";
import { createOfficeWorker } from "./worker";

export { Office } from "./office";

/** hq-office entry (docs/agents/office.md). The blocklist is compiled by scripts/build-knowledge.ts before a deploy. */
export default createOfficeWorker({ blocklist: safety.blocklist });
```

Create `workers/office/wrangler.toml`:

```toml
# hq-office: the Agent Office Worker and its Durable Object (runbook: workers/office/README.md).
#
# Deployed by .github/workflows/deploy.yml (job "hq-office Worker", before the Pages upload) from this folder; it has
# its own config, separate from the Pages project in the repo root. No route, no workers.dev or preview URL: the
# Pages Functions /api/office, /api/office/beat and /api/office/github reach it through the service binding OFFICE.
#
# Secrets never live here. deploy.yml sets them from production environment secrets on every deploy:
#   OFFICE_INGEST_KEY      HMAC key of relay beats (the owner's Keychain holds the same value)
#   GITHUB_WEBHOOK_SECRET  secret of the repository webhooks

name = "hq-office"
main = "src/index.ts"
compatibility_date = "2026-10-01"
workers_dev = false
preview_urls = false

# One Durable Object instance ("office") on the SQLite backend (the only backend on the free plan). The legacy
# migrations form on purpose: the newer `exports` form cannot be undone once deployed.
[[durable_objects.bindings]]
name = "OFFICE_DO"
class_name = "Office"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["Office"]

[vars]
# Repositories whose names, branches and titles may show (and only once a webhook reported them public).
OFFICE_REPO_ALLOWLIST = "ShinyQ/*"

[observability]
enabled = true
```

- [ ] **Step 4: Run the tests and bundle the Worker**

Run: `bunx vitest run tests/office/ && bun scripts/build-knowledge.ts && (cd workers/office && bunx wrangler deploy --dry-run --outdir "$TMPDIR/hq-office")`
Expected: vitest PASS (all `tests/office` files); wrangler prints "--dry-run: exiting now." and lists the `OFFICE_DO` Durable Object binding with no error.

- [ ] **Step 5: Commit**

```bash
git add workers/office tests/office/worker.test.ts
git commit -m "feat(office): hq-office Worker and Office Durable Object"
```

### Task 6: Pages Functions `/api/office`, `/api/office/beat`, `/api/office/github`

**Files:**
- Create: `functions/_lib/office.ts`, `functions/api/office/index.ts`, `functions/api/office/beat.ts`, `functions/api/office/github.ts`
- Modify: `functions/_lib/types.ts` (append the office types after `StatsEnv`), `wrangler.toml` (a `[[services]]` block before `[vars]`, and `OFFICE_ENABLED` at the end of `[vars]`), `scripts/e2e-plan.ts:99` (one rule after the RUM rule), `tests/unit/e2e-plan.test.ts:226` (one pin)
- Test: `tests/office/office-endpoint.test.ts`

**Interfaces:**
- Consumes: Task 1 (`OFFICE_BEAT_MAX_BYTES`, `parseOfficeResponse`, `wibDay`, `OfficeResponseV1`), `readCapped` and `PagesContext`.
- Produces: `ServiceBinding`, `EdgeCache`, `OfficeEnv` in `functions/_lib/types.ts`; `offSnapshot(now: number): OfficeSnapshotV1`, `createOfficeSnapshotHandler(opts?: { cache?: () => EdgeCache | null; now?: () => number })`, `createOfficeForwardHandler(route: "beat" | "github")`, `OFFICE_GITHUB_MAX_BYTES = 524288`; routes `GET|HEAD /api/office` (200 JSON always: the snapshot, `mode: "off"` on any failure, or `{"v":1,"enabled":false}` when the kill switch is off) and `POST /api/office/beat`, `POST /api/office/github` (the Worker's status passed through, `no-store`). PR3 and PR4 fetch `GET /api/office`; PR2's relay posts to `/api/office/beat`.

- [ ] **Step 1: Write the failing test**

Create `tests/office/office-endpoint.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { OFFICE_FIXTURES } from "@/lib/office/fixtures";
import { parseOfficeResponse } from "@/lib/office/protocol";
import { createOfficeForwardHandler, createOfficeSnapshotHandler, offSnapshot } from "../../functions/_lib/office";
import type { EdgeCache, OfficeEnv, ServiceBinding } from "../../functions/_lib/types";

const SITE = "https://kurniadi.pages.dev";
const T0 = Date.UTC(2026, 9, 18, 8, 0, 0);

function worker(reply: (path: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const binding: ServiceBinding = {
    async fetch(input, init) {
      const path = new URL(typeof input === "string" ? input : input.url).pathname;
      calls.push({ path, init });
      return reply(path, init);
    },
  };
  return { binding, calls };
}

function memoryCache() {
  const map = new Map<string, Response>();
  const cache: EdgeCache = {
    async match(request) {
      return map.get(request.url)?.clone();
    },
    async put(request, response) {
      map.set(request.url, response);
    },
  };
  return { map, cache };
}

async function get(env: OfficeEnv, cache: EdgeCache | null = null, method = "GET") {
  const pending: Promise<unknown>[] = [];
  const handle = createOfficeSnapshotHandler({ cache: () => cache, now: () => T0 });
  const res = await handle({ request: new Request(`${SITE}/api/office?x=1`, { method }), env, waitUntil: (p) => void pending.push(p) });
  await Promise.all(pending);
  return res;
}

describe("GET /api/office", () => {
  it("serves the Worker's snapshot with a 5 s cache and stores it in the edge cache", async () => {
    const { binding, calls } = worker(() => Response.json(OFFICE_FIXTURES.busy));
    const { cache, map } = memoryCache();
    const res = await get({ OFFICE_ENABLED: "true", OFFICE: binding }, cache);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=5");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await res.json()).toEqual(OFFICE_FIXTURES.busy);
    expect([...map.keys()]).toEqual([`${SITE}/api/office`]);
    expect(await (await get({ OFFICE_ENABLED: "true", OFFICE: binding }, cache)).json()).toEqual(OFFICE_FIXTURES.busy);
    expect(calls.map((c) => c.path)).toEqual(["/snapshot"]);
  });

  it("answers disabled when the kill switch is off, without calling the Worker", async () => {
    const { binding, calls } = worker(() => Response.json(OFFICE_FIXTURES.busy));
    expect(await (await get({ OFFICE_ENABLED: "false", OFFICE: binding })).json()).toEqual({ v: 1, enabled: false });
    expect(calls).toEqual([]);
  });

  it("answers mode off when unbound, failing, throwing or invalid", async () => {
    const off = offSnapshot(T0);
    expect(parseOfficeResponse(off)).toEqual(off);
    const cases: OfficeEnv[] = [
      { OFFICE_ENABLED: "true" },
      { OFFICE_ENABLED: "true", OFFICE: worker(() => new Response(null, { status: 500 })).binding },
      { OFFICE_ENABLED: "true", OFFICE: worker(() => Promise.reject(new Error("down"))).binding },
      { OFFICE_ENABLED: "true", OFFICE: worker(() => Response.json({ v: 1, enabled: true, mode: "live", desks: "nope" })).binding },
    ];
    for (const env of cases) expect(await (await get(env)).json()).toEqual(off);
  });

  it("answers HEAD without a body and other methods with 405", async () => {
    const { binding } = worker(() => Response.json(OFFICE_FIXTURES.busy));
    const head = await get({ OFFICE_ENABLED: "true", OFFICE: binding }, null, "HEAD");
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await get({ OFFICE_ENABLED: "true", OFFICE: binding }, null, "POST")).status).toBe(405);
  });
});

describe("POST /api/office/beat and /api/office/github", () => {
  const post = (route: "beat" | "github", env: OfficeEnv, body: string, headers: Record<string, string> = {}) =>
    createOfficeForwardHandler(route)({ request: new Request(`${SITE}/api/office/${route}`, { method: "POST", body, headers }), env, waitUntil: () => undefined });

  it("forwards the raw body and only the signature headers, and passes the Worker's status through", async () => {
    const { binding, calls } = worker(() => new Response(null, { status: 401 }));
    const res = await post("beat", { OFFICE_ENABLED: "true", OFFICE: binding }, '{"v":1}', { "X-Office-Signature": "sha256=ab", Cookie: "a=b" });
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(calls[0].path).toBe("/beat");
    expect(calls[0].init?.body).toBe('{"v":1}');
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("X-Office-Signature")).toBe("sha256=ab");
    expect(headers.get("Cookie")).toBeNull();
    await post("github", { OFFICE_ENABLED: "true", OFFICE: binding }, "{}", { "X-Hub-Signature-256": "sha256=cd", "X-GitHub-Event": "ping", "X-GitHub-Delivery": "id-1" });
    expect(new Headers(calls[1].init?.headers).get("X-GitHub-Event")).toBe("ping");
  });

  it("drops everything when off, answers 503 unbound, 413 too big, 405 for GET", async () => {
    const { binding, calls } = worker(() => new Response(null, { status: 204 }));
    expect((await post("beat", { OFFICE_ENABLED: "false", OFFICE: binding }, "{}")).status).toBe(204);
    expect(calls).toEqual([]);
    expect((await post("beat", { OFFICE_ENABLED: "true" }, "{}")).status).toBe(503);
    expect((await post("beat", { OFFICE_ENABLED: "true", OFFICE: binding }, "x".repeat(4096))).status).toBe(413);
    const getBeat = await createOfficeForwardHandler("beat")({ request: new Request(`${SITE}/api/office/beat`), env: { OFFICE_ENABLED: "true", OFFICE: binding }, waitUntil: () => undefined });
    expect(getBeat.status).toBe(405);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/office/office-endpoint.test.ts`
Expected: FAIL with "Failed to resolve import "../../functions/_lib/office"".

- [ ] **Step 3: Write the types, handlers and routes**

Append to `functions/_lib/types.ts`, after `StatsEnv`:

```ts
/** A service binding to another Worker (the Agent Office: hq-office). */
export interface ServiceBinding {
  fetch(input: string | Request, init?: RequestInit): Promise<Response>;
}

/** The Cache API's default cache as Pages Functions see it (`caches.default`, per data center). */
export interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

/** Agent Office routes (docs/agents/office.md). */
export interface OfficeEnv {
  /** Kill switch: anything but "true" answers `{v:1, enabled:false}` and drops beats and webhooks. */
  OFFICE_ENABLED?: string;
  /** Service binding to the hq-office Worker. */
  OFFICE?: ServiceBinding;
}
```

Create `functions/_lib/office.ts`:

```ts
import { OFFICE_BEAT_MAX_BYTES, parseOfficeResponse, wibDay, type OfficeResponseV1, type OfficeSnapshotV1 } from "../../src/lib/office/protocol";
import { readCapped } from "./security";
import type { EdgeCache, OfficeEnv, PagesContext } from "./types";

export const OFFICE_GITHUB_MAX_BYTES = 512 * 1024;
const WORKER = "https://hq-office";
const SNAPSHOT_CACHE = "public, max-age=5";
const DISABLED_CACHE = "public, max-age=60";

/** The snapshot when the Worker or the Durable Object cannot answer (spec section 8): every Rover rests. */
export function offSnapshot(now: number): OfficeSnapshotV1 {
  return { v: 1, enabled: true, mode: "off", updatedAt: now, desks: [], extra: 0, github: [], today: { day: wibDay(now), tasksDone: 0, prsMerged: 0, ciRuns: 0, ciGreen: 0 } };
}

const noStore = (code: number, extra: Record<string, string> = {}) => new Response(null, { status: code, headers: { "Cache-Control": "no-store", ...extra } });

function defaultCache(): EdgeCache | null {
  const store = (globalThis as { caches?: { default?: EdgeCache } }).caches;
  return store?.default ?? null;
}

/**
 * `GET /api/office`: the office snapshot from the hq-office Worker, validated again, edge-cached for 5 s per data
 * center (one Durable Object read per 5 s there). Always 200 JSON, so clients need one code path.
 */
export function createOfficeSnapshotHandler(opts: { cache?: () => EdgeCache | null; now?: () => number } = {}) {
  const cacheOf = opts.cache ?? defaultCache;
  const now = opts.now ?? Date.now;
  return async function handle({ request, env, waitUntil }: PagesContext<OfficeEnv>): Promise<Response> {
    const method = request.method;
    if (method !== "GET" && method !== "HEAD") return noStore(405, { Allow: "GET, HEAD" });
    const send = (value: OfficeResponseV1, cacheControl: string) =>
      new Response(method === "HEAD" ? null : JSON.stringify(value), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": cacheControl },
      });
    if (env.OFFICE_ENABLED !== "true") return send({ v: 1, enabled: false }, DISABLED_CACHE);
    if (!env.OFFICE) return send(offSnapshot(now()), SNAPSHOT_CACHE);
    const cache = cacheOf();
    const key = new Request(new URL("/api/office", request.url).toString(), { method: "GET" });
    const hit = await cache?.match(key);
    if (hit) return method === "HEAD" ? new Response(null, { status: hit.status, headers: hit.headers }) : hit;
    let value: OfficeResponseV1 | null = null;
    try {
      const res = await env.OFFICE.fetch(`${WORKER}/snapshot`);
      value = res.ok ? parseOfficeResponse(await res.json()) : null;
    } catch {
      value = null;
    }
    const out = send(value ?? offSnapshot(now()), SNAPSHOT_CACHE);
    if (cache && method === "GET") waitUntil(cache.put(key, out.clone()));
    return out;
  };
}

const FORWARDED: Record<"beat" | "github", readonly string[]> = {
  beat: ["Content-Type", "X-Office-Signature"],
  github: ["Content-Type", "X-Hub-Signature-256", "X-GitHub-Event", "X-GitHub-Delivery"],
};

/** `POST /api/office/beat` and `POST /api/office/github`: forward the raw body and signature headers; the Worker verifies. */
export function createOfficeForwardHandler(route: "beat" | "github") {
  const limit = route === "beat" ? OFFICE_BEAT_MAX_BYTES : OFFICE_GITHUB_MAX_BYTES;
  return async function handle({ request, env }: PagesContext<OfficeEnv>): Promise<Response> {
    if (request.method !== "POST") return noStore(405, { Allow: "POST" });
    if (env.OFFICE_ENABLED !== "true") return noStore(204);
    if (!env.OFFICE) return noStore(503);
    const body = await readCapped(request, limit);
    if (body === null) return noStore(413);
    const headers = new Headers();
    for (const name of FORWARDED[route]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    try {
      const res = await env.OFFICE.fetch(`${WORKER}/${route}`, { method: "POST", headers, body });
      return noStore(res.status);
    } catch {
      return noStore(502);
    }
  };
}
```

Create `functions/api/office/index.ts`:

```ts
import { createOfficeSnapshotHandler } from "../../_lib/office";
import type { OfficeEnv, PagesContext } from "../../_lib/types";

/** Agent Office: `GET /api/office` serves the office snapshot from the hq-office Worker (docs/agents/office.md). */
const handler = createOfficeSnapshotHandler();
export const onRequest = (context: PagesContext<OfficeEnv>) => handler(context);
```

Create `functions/api/office/beat.ts`:

```ts
import { createOfficeForwardHandler } from "../../_lib/office";
import type { OfficeEnv, PagesContext } from "../../_lib/types";

/** Agent Office: `POST /api/office/beat` forwards a signed relay beat to the hq-office Worker (docs/agents/office.md). */
const handler = createOfficeForwardHandler("beat");
export const onRequest = (context: PagesContext<OfficeEnv>) => handler(context);
```

Create `functions/api/office/github.ts`:

```ts
import { createOfficeForwardHandler } from "../../_lib/office";
import type { OfficeEnv, PagesContext } from "../../_lib/types";

/** Agent Office: `POST /api/office/github` forwards a signed GitHub webhook to the hq-office Worker (docs/agents/office.md). */
const handler = createOfficeForwardHandler("github");
export const onRequest = (context: PagesContext<OfficeEnv>) => handler(context);
```

In the root `wrangler.toml`, insert before `[vars]`:

```toml
# Agent Office (docs/agents/office.md, runbook workers/office/README.md): the hq-office Worker behind GET /api/office,
# POST /api/office/beat and POST /api/office/github. deploy.yml deploys the Worker before every Pages upload, so the
# binding never points at a missing service. Calls through a service binding add no request charge.
[[services]]
binding = "OFFICE"
service = "hq-office"
```

and append at the end of `[vars]`:

```toml
# Kill switch of the Agent Office. Anything but "true" makes GET /api/office answer {"v":1,"enabled":false} (the 3D
# office and the Classic card hide) and drops beats and webhooks (204). On since part 1 (owner pre-approval 2026-10-18).
OFFICE_ENABLED = "true"
```

In `scripts/e2e-plan.ts`, add after the RUM rule on line 99:

```ts
  // Agent Office backend (part 1): unit tested in tests/office; the 3D office and the Classic card add their specs.
  { test: /^functions\/(api\/office\/|_lib\/office\.ts$)|^src\/lib\/office\//, specs: [] },
```

In `tests/unit/e2e-plan.test.ts`, inside `it("runs no e2e for the RUM Function", ...)` after line 227, add:

```ts
    expect(specsForChanges(["functions/api/office/index.ts", "functions/_lib/office.ts", "src/lib/office/protocol.ts", "workers/office/src/state.ts"]).specs).toEqual([]);
```

- [ ] **Step 4: Run the tests**

Run: `bunx vitest run tests/office tests/unit/e2e-plan.test.ts tests/unit/provision-ask.test.ts tests/unit/rum-endpoint.test.ts && bun run e2e:changed --dry`
Expected: vitest PASS; the dry plan lists no e2e spec caused by `functions/` or `src/lib/office/` paths (only what other changed files, such as `src/content/safety.ts`, select).

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/office.ts functions/_lib/types.ts functions/api/office wrangler.toml scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts tests/office/office-endpoint.test.ts
git commit -m "feat(office): Pages Functions for the office snapshot, beats and webhooks"
```

### Task 7: CI bundle check and production deploy of `hq-office`

**Files:**
- Create: `.github/workflows/office-worker.yml`
- Modify: `.github/workflows/deploy.yml` (a new job `office-worker` before `deploy`; `deploy.needs` and `report.needs` gain `office-worker`)
- Final-review change: the job moved after `deploy` (`needs: [resolve, deploy]`, like `stats-worker`) so it passes the upload's gates, and `rollback.yml` redeploys hq-office with Pages.
- Test: `tests/unit/office-deploy.test.ts`

**Interfaces:**
- Consumes: Task 5 (`workers/office/wrangler.toml`), `scripts/build-knowledge.ts` (writes `functions/_generated/safety.json`).
- Produces: production secrets on the Worker (`OFFICE_INGEST_KEY`, `GITHUB_WEBHOOK_SECRET`) from the `production` environment's GitHub secrets of the same names; repository variable `OFFICE_WORKER_DEPLOY = "false"` skips the job.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/office-deploy.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const deploy = readFileSync(".github/workflows/deploy.yml", "utf8");
const check = readFileSync(".github/workflows/office-worker.yml", "utf8");

describe("hq-office deploy", () => {
  it("deploys the Worker before the Pages upload, and the upload does not depend on its result", () => {
    const office = deploy.indexOf("\n  office-worker:\n");
    const pages = deploy.indexOf("\n  deploy:\n");
    expect(office).toBeGreaterThan(0);
    expect(office).toBeLessThan(pages);
    expect(deploy).toMatch(/\n  deploy:\n[\s\S]*?needs: \[resolve, verify, site, e2e, office-worker\]/);
    expect(deploy).toMatch(/needs: \[resolve, verify, site, e2e, deploy, stats-worker, office-worker\]/);
  });

  it("builds the safety list first, deploys from workers/office and sets only the two secrets, in step env", () => {
    const section = deploy.slice(deploy.indexOf("\n  office-worker:\n"), deploy.indexOf("\n  deploy:\n"));
    expect(section).toContain("bun scripts/build-knowledge.ts");
    expect(section).toContain("working-directory: workers/office");
    expect(section).toContain("bunx wrangler deploy");
    expect(section).toContain("OFFICE_INGEST_KEY: ${{ secrets.OFFICE_INGEST_KEY }}");
    expect(section).toContain("GITHUB_WEBHOOK_SECRET: ${{ secrets.GITHUB_WEBHOOK_SECRET }}");
    expect(section).not.toMatch(/^\s{4}env:\n[\s\S]*?secrets\./m);
    expect(section).toContain("vars.OFFICE_WORKER_DEPLOY == 'false'");
  });

  it("checks the bundle on pull requests without any secret", () => {
    expect(check).toContain('"workers/office/**"');
    expect(check).toContain("bunx wrangler deploy --dry-run");
    expect(check).not.toContain("secrets.");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/unit/office-deploy.test.ts`
Expected: FAIL with "ENOENT: no such file or directory, open '.github/workflows/office-worker.yml'".

- [ ] **Step 3: Write the workflows**

Create `.github/workflows/office-worker.yml`:

```yaml
name: Office Worker check

# Pull request check for the Agent Office Worker (workers/office/, hq-office): bundles it with
# `wrangler deploy --dry-run` and nothing else. Pull request runs never receive a Cloudflare secret (security S3).
# Not a required check. Runbook: workers/office/README.md.

on:
  pull_request:
    paths:
      - "workers/office/**"
      - "src/lib/office/**"
      - "src/content/safety-match.ts"
      - ".github/workflows/office-worker.yml"
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: office-worker-${{ github.ref }}
  cancel-in-progress: true

jobs:
  bundle:
    name: hq-office bundle (dry run)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: ./.github/actions/setup
      - name: Build the safety list (public terms only)
        run: bun scripts/build-knowledge.ts
      - name: Bundle the Worker (dry run, no secrets)
        working-directory: workers/office
        # wrangler from the lockfile (devDependency, exact version; S4).
        run: bunx wrangler deploy --dry-run --outdir "$RUNNER_TEMP/hq-office"
```

In `.github/workflows/deploy.yml`, insert this job immediately before `  deploy:` (line 225):

```yaml
  office-worker:
    name: hq-office Worker
    runs-on: ubuntu-latest
    needs: [resolve, verify, site, e2e]
    # Before the Pages upload, so the Pages service binding OFFICE never points at a missing Worker. The upload does
    # not wait for its success (deploy's `if` ignores it). The repository variable OFFICE_WORKER_DEPLOY = "false"
    # skips it. Runbook: workers/office/README.md.
    if: ${{ !cancelled() && needs.site.result == 'success' && (needs.e2e.result == 'success' || needs.e2e.result == 'skipped') }}
    timeout-minutes: 10
    environment:
      name: production
      deployment: false
    permissions:
      contents: read
    steps:
      - name: Check configuration
        id: gate
        env:
          HAS: ${{ secrets.CLOUDFLARE_API_TOKEN != '' && secrets.CLOUDFLARE_ACCOUNT_ID != '' }}
          SKIP: ${{ vars.OFFICE_WORKER_DEPLOY == 'false' }}
        run: |
          if [ "$SKIP" = "true" ]; then
            echo "enabled=false" >> "$GITHUB_OUTPUT"
            echo "::notice::OFFICE_WORKER_DEPLOY is false; the hq-office Worker is not deployed by this run."
          elif [ "$HAS" = "true" ]; then
            echo "enabled=true" >> "$GITHUB_OUTPUT"
          else
            echo "enabled=false" >> "$GITHUB_OUTPUT"
            echo "::notice::CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID is not set; skipping the hq-office Worker."
          fi
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        if: steps.gate.outputs.enabled == 'true'
        with:
          persist-credentials: false
          ref: ${{ needs.resolve.outputs.sha }}
      - uses: ./.github/actions/setup
        if: steps.gate.outputs.enabled == 'true'
      - name: Build the safety list
        if: steps.gate.outputs.enabled == 'true'
        env:
          SAFETY_BLOCKLIST: ${{ secrets.SAFETY_BLOCKLIST }}
        run: bun scripts/build-knowledge.ts
      - name: Deploy hq-office and set its secrets
        if: steps.gate.outputs.enabled == 'true'
        working-directory: workers/office
        # The deploy token and the Worker secrets only in this step (S4, H1); a missing secret is skipped, so the
        # Worker answers 503 on that route until the owner adds it.
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          OFFICE_INGEST_KEY: ${{ secrets.OFFICE_INGEST_KEY }}
          GITHUB_WEBHOOK_SECRET: ${{ secrets.GITHUB_WEBHOOK_SECRET }}
        run: |
          bunx wrangler deploy
          if [ -n "$OFFICE_INGEST_KEY" ]; then
            printf '%s' "$OFFICE_INGEST_KEY" | bunx wrangler secret put OFFICE_INGEST_KEY > /dev/null
          else
            echo "::notice::OFFICE_INGEST_KEY is not set; POST /api/office/beat answers 503."
          fi
          if [ -n "$GITHUB_WEBHOOK_SECRET" ]; then
            printf '%s' "$GITHUB_WEBHOOK_SECRET" | bunx wrangler secret put GITHUB_WEBHOOK_SECRET > /dev/null
          else
            echo "::notice::GITHUB_WEBHOOK_SECRET is not set; POST /api/office/github answers 503."
          fi

```

Then change the `deploy` job's `needs: [resolve, verify, site, e2e]` to `needs: [resolve, verify, site, e2e, office-worker]`, and the
`report` job's `needs: [resolve, verify, site, e2e, deploy, stats-worker]` to `needs: [resolve, verify, site, e2e, deploy, stats-worker, office-worker]`.

- [ ] **Step 4: Run the tests and lint the workflows**

Run: `bunx vitest run tests/unit/office-deploy.test.ts && bunx vitest run tests/unit --reporter=dot`
Expected: PASS (the workflow tests in `tests/unit`, if any parse deploy.yml jobs, still pass).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/office-worker.yml .github/workflows/deploy.yml tests/unit/office-deploy.test.ts
git commit -m "ci(office): bundle check on PRs and deploy hq-office before the Pages upload"
```

### Task 8: Docs, runbook, verification and the PR

**Files:**
- Create: `workers/office/README.md`, `docs/agents/office.md`
- Modify: `AGENTS.md` (Detail docs table and Folder map `workers/` row), `docs/agents/folder-layout.md` (section `## functions/, wrangler.toml and workers/`), `docs/agents/ci-and-deploy.md` (jobs list near the hq-stats bullet, line 194), `docs/deploy.md` (new section 18), `docs/features.md` (Status table row), this plan's `Status:` line
- Test: `tests/unit/agents-md.test.ts`, `tests/unit/docs-index.test.ts`, `tests/content/safety.test.ts` (existing)

**Interfaces:**
- Consumes: everything above.
- Produces: `docs/agents/office.md` (later parts append their sections: "Relay" in part 2, "3D office" in part 3, "Classic card and Ask" in part 4).

- [ ] **Step 1: Write the runbook**

Create `workers/office/README.md`:

```markdown
# hq-office: the Agent Office Worker

The backend of the L1 Agent Office (spec `docs/superpowers/specs/2026-10-18-agent-office-design.md`, rules
`docs/agents/office.md`). A Worker with one SQLite-backed Durable Object (`Office`) behind three Pages Functions:

| Route (site origin) | Worker route | Who calls it |
|---|---|---|
| `GET /api/office` | `GET /snapshot` | the 3D office and the Classic card (edge-cached 5 s per data center) |
| `POST /api/office/beat` | `POST /beat` | `office-relay` on the owner's Mac (`X-Office-Signature`) |
| `POST /api/office/github` | `POST /github` | repository webhooks (`X-Hub-Signature-256`) |

The Worker has no route and no `workers.dev` URL; only the Pages service binding `OFFICE` reaches it.

## Configuration

- `wrangler.toml` here: the `OFFICE_DO` binding, the `v1` migration (`new_sqlite_classes`), `OFFICE_REPO_ALLOWLIST`.
- Secrets (set by `deploy.yml` from the `production` environment's GitHub secrets of the same name):
  - `OFFICE_INGEST_KEY`: HMAC key of relay beats; the owner's Keychain holds the same value.
  - `GITHUB_WEBHOOK_SECRET`: the secret of every repository webhook.
- Root `wrangler.toml` (Pages): `[[services]] OFFICE = hq-office` and the kill switch `OFFICE_ENABLED`.

## First setup (owner)

1. Generate two keys: `openssl rand -hex 32` twice.
2. GitHub, repository settings, Environments, `production`: add the secrets `OFFICE_INGEST_KEY` and
   `GITHUB_WEBHOOK_SECRET`. The next production deploy sets them on the Worker.
3. Keychain (Mac): `security add-generic-password -s hq-office-ingest -a office-relay -w <OFFICE_INGEST_KEY>`.
4. For each public repository to show (ShinyQ/ShinyQ-HQ first): Settings, Webhooks, Add webhook:
   - Payload URL `https://kurniadi.pages.dev/api/office/github`, content type `application/json`, secret
     `GITHUB_WEBHOOK_SECRET`, SSL verification on;
   - events: Workflow runs, Workflow jobs, Pull requests, Pushes, Deployment statuses.
   GitHub has no user-level webhooks; a GitHub App installed on all repositories (Actions read, Pull requests read,
   Contents read, Deployments read) is the alternative with one webhook.
5. Check: the webhook's Recent Deliveries shows `ping` with 204, and `curl -s https://kurniadi.pages.dev/api/office` shows
   `"mode":"semi-live"`.

## Operations

- Kill switch: set `OFFICE_ENABLED` to `"false"` in the root `wrangler.toml` and deploy; the site hides the office.
- Rotate a key: update the GitHub secret (and the Keychain item or the webhook secret), then redeploy (Actions,
  `deploy.yml`, Run workflow).
- Skip the Worker deploy: repository variable `OFFICE_WORKER_DEPLOY = "false"` (for example while deploying by hand:
  `cd workers/office && bun ../../scripts/build-knowledge.ts && bunx wrangler deploy`).
- Logs: Cloudflare dashboard, Workers, `hq-office`, Observability. The Worker logs no beat or webhook body.
- Free plan: Durable Object requests and Workers requests are 100,000 per day each; one row is written per accepted
  beat or webhook (100,000 per day). Spec section 7 has the estimates.
- Reset the office: none needed; sessions leave after 30 minutes without a beat and counters reset at 00:00 WIB.
```

- [ ] **Step 2: Write the agent doc and update the indexes**

Create `docs/agents/office.md`:

```markdown
# Agent Office

The L1 Agent Office: AI coding agents shown live as Rovers at desks, plus public GitHub activity. Spec:
[`2026-10-18-agent-office-design.md`](../superpowers/specs/2026-10-18-agent-office-design.md); decision
[`2026-10-18-agent-office.md`](../decisions/2026-10-18-agent-office.md).

Index: [AGENTS.md](../../AGENTS.md).

## Backend

### Contract

- `src/lib/office/protocol.ts` (v1): `OfficeBeatV1` (relay to Worker) and `OfficeResponseV1` (GET /api/office).
- Clients validate with `parseOfficeResponse` and hide on null; the Worker validates beats with `parseOfficeBeat`.
- Fixtures: `OFFICE_FIXTURES` in `src/lib/office/fixtures.ts` (busy, rough, quiet, semiLive, off, disabled).
- Change the contract only with a new version and every side in one PR.

### Privacy (owner decision D3)

- A beat carries only `{v, agent, session, state, activity, repo?, branch?, title?, ts}`; `session` is a salted hash.
- `repo`, `branch` and `title` survive only for repositories in `OFFICE_REPO_ALLOWLIST` that a webhook reported public.
- Titles (beats and GitHub items) go through the public safety blocklist (`cleanTitle`, `findBlockedTerms` from
  `src/content/safety-match.ts`); a blocked title is dropped or replaced by a generic one.
- Never add a field that carries prompt text, commands, paths, output or client names.

### Worker and Durable Object

- `workers/office/` (`hq-office`): `worker.ts` verifies signatures (`crypto.ts`) and routes; `ingest.ts` sanitizes
  beats and parses webhooks; `state.ts` is the pure reducer; `office.ts` is the Durable Object.
- One JSON document in the Durable Object's storage API (SQLite backend): one row written per accepted beat or webhook.
- Time rules run at read time (`effective`): thinking after 20 s quiet while working or reviewing, asleep after 3 min
  (15 min while testing, on CI or waiting for input), done for 20 s, failed until the next beat, removed after 30 min.
  No alarms.
- Desks: five stable slots (`assignSlots`); an awake newcomer may take the longest-asleep desk; others are `extra`.
- GitHub: `workflow_run`, `workflow_job` (job progress), `pull_request`, `push` (default branch), `deployment_status`;
  CI progress and PR titles join a desk by repository and branch.

### Pages Functions

- `functions/_lib/office.ts`: `GET /api/office` (always 200 JSON: the snapshot, `mode: "off"` on failure, or
  `{v:1, enabled:false}`), edge-cached 5 s in `caches.default`; `POST /api/office/beat` and `/github` forward the raw
  body and signature headers through the service binding `OFFICE`.
- Kill switch `OFFICE_ENABLED` (root `wrangler.toml`).

### Deploy and CI

- `deploy.yml` job `office-worker` deploys the Worker before the Pages upload and sets its secrets from the
  `production` environment; `office-worker.yml` bundles it on pull requests (no secrets).
- Runbook: `workers/office/README.md`; deploy notes: [`docs/deploy.md`](../deploy.md) section 18.

### Tests

- `tests/office/`: protocol, state, ingest, Worker and Durable Object, Functions; `tests/unit/office-deploy.test.ts`.
```

In `AGENTS.md`, add a row to the Detail docs table after the `stats.md` row:

```markdown
| [office.md](docs/agents/office.md) | Agent Office: contract, privacy, hq-office Worker and Durable Object, relay, 3D office, Classic card |
```

and change the Folder map row for `workers/` to:

```markdown
| `workers/` | `workers/stats`: the `hq-stats` Cron Worker; `workers/office`: the `hq-office` Agent Office Worker |
```

In `docs/agents/folder-layout.md`, section `## functions/, wrangler.toml and workers/`, add after the `functions/api/visit.ts` bullet:

```markdown
- `functions/api/office/` (`index.ts`, `beat.ts`, `github.ts`): Agent Office routes (GET /api/office, POST beats and
  webhooks) forwarding to the hq-office Worker through the service binding OFFICE (`functions/_lib/office.ts`).
```

and after the `workers/stats/` bullet:

```markdown
- `workers/office/`: hq-office Worker (own wrangler.toml, no route) and its Durable Object `Office`: the Agent Office
  state. See [office.md](office.md).
```

and in the `src/` part of the same file, next to `src/lib/stats/`:

```markdown
- `src/lib/office/`: the Agent Office contract (`protocol.ts`) and fixtures (`fixtures.ts`).
```

In `docs/agents/ci-and-deploy.md`, after the bullet on line 194 that starts "the hq-stats Worker", add:

```markdown
- `office-worker` (deploy.yml) deploys the hq-office Worker before the Pages upload (the upload does not wait for its
  success) and sets `OFFICE_INGEST_KEY` and `GITHUB_WEBHOOK_SECRET` from the `production` environment;
  `office-worker.yml` bundles it on pull requests that touch `workers/office/`, `src/lib/office/` or
  `src/content/safety-match.ts` (not a required check). `OFFICE_WORKER_DEPLOY = "false"` skips the deploy.
```

In `docs/deploy.md`, append a section after section 17:

```markdown
## 18. Agent Office (hq-office)

- The Worker `hq-office` (`workers/office/`) holds the office state in a SQLite-backed Durable Object; the Pages
  Functions `/api/office`, `/api/office/beat` and `/api/office/github` reach it through the service binding `OFFICE`.
- `deploy.yml` deploys it before the Pages upload (job "hq-office Worker") and sets `OFFICE_INGEST_KEY` and
  `GITHUB_WEBHOOK_SECRET` from the `production` environment secrets; a missing secret leaves its route at 503.
- First setup, webhooks, key rotation and the kill switch (`OFFICE_ENABLED`): `workers/office/README.md`.
```

In `docs/features.md`, add a row at the end of the Status table:

```markdown
| Agent Office, part 1 (backend) | 2026-10-19: the hq-office Worker and Durable Object, signed relay beats and GitHub webhooks, GET /api/office with a 5 s edge cache; no UI yet | In review |
```

- [ ] **Step 3: Run the docs tests and the full quick verification**

Run: `bunx vitest run tests/unit/agents-md.test.ts tests/unit/docs-index.test.ts tests/content/safety.test.ts && bun run verify:quick`
Expected: PASS; `verify:quick` ends with the `og:check` output and exit code 0.

- [ ] **Step 4: Commit**

```bash
git add workers/office/README.md docs/agents/office.md AGENTS.md docs/agents/folder-layout.md docs/agents/ci-and-deploy.md docs/deploy.md docs/features.md
git commit -m "docs(office): runbook, agent rules and deploy notes for the Agent Office backend"
```

- [ ] **Step 5: Push and open the PR**

Run: `gh run list -R ShinyQ/ShinyQ-HQ -s in_progress && gh run list -R ShinyQ/ShinyQ-HQ -s queued` and wait until at most one
pull request run is in flight and no `main` run is. Then `bun run e2e:changed` (expect only the specs the safety module change
selects), push, and open a ready-for-review PR titled `feat(office): Agent Office backend (Worker, Durable Object, /api/office)`
whose body lists: the spec link, the four plan links, the corrections table (spec section 12), the owner actions from
`workers/office/README.md` "First setup", and "No UI in this PR". Once the PR number is known, set this plan's line 3 to
`Status: in review in #<N>` and add `- PR: [#<N>](https://github.com/ShinyQ/ShinyQ-HQ/pull/<N>)` to
`docs/decisions/2026-10-18-agent-office.md` in a follow-up commit on the same branch.

## Self-review

- Spec coverage: 3.3 (routes, signatures, replay guard, schema, allowlist and public check, redaction, GitHub events,
  desks, time rules, today counters, snapshot, kill switch) in Tasks 3 to 6; 3.4 in Task 6; 6 (secrets, no logging) in
  Tasks 5, 7, 8; 7 (no alarms, one row per write) in Tasks 3 and 5; 8 (mode off, 503, 502) in Tasks 5 and 6; 9 (Worker
  tests) in Tasks 1 and 3 to 6; 10 (part 1 docs and runbook) in Task 8. Section 3.1 and 3.2 are part 2; 4 is parts 3 and 4.
- Placeholder scan: every code step has the full code; the only owner-supplied values are secrets, which never enter the repo.
- Type consistency: `OfficeBeatV1`, `OfficeSnapshotV1`, `GithubUpdate`, `GithubMessage`, `OfficeWorkerEnv`, `OfficeEnv`,
  `EdgeCache` and `ServiceBinding` are defined once and used with the same names in every task.

## Owner actions

1. Before merging: add the `production` environment secrets `OFFICE_INGEST_KEY` and `GITHUB_WEBHOOK_SECRET`
   (`openssl rand -hex 32` each). Without them the Worker still deploys and the routes answer 503.
2. After the deploy: add the ShinyQ/ShinyQ-HQ webhook (`workers/office/README.md`, First setup step 4) and check the ping.
3. Keep the ingest key for part 2 (`security add-generic-password -s hq-office-ingest -a office-relay -w <key>`).
