# Agent Office revamp C: day replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: planned (2026-10-20); starts after part B merges.

Seats (part A2, [plan](2026-10-21-agent-office-live-ten.md)): the office seats up to ten sessions from snapshot v3, so a
log event's `slot` is 0 to 9 (the v3 seats; -1 for a session past the ten) and a replayed snapshot carries up to ten
desks in the v4 shape (the v3 fields plus stage B's `pipeline`, part B's `OfficeSceneSnapshot` with the pipeline set); `parseOfficeHistory` bounds slots by `OFFICE_SEATS`.

**Goal:** Today, or any of the last 7 days, plays back in the office as a 30 to 60 s time-lapse with floor tiles lit per
merged PR, and an idle office loops the latest day (clearly labelled as a replay) so it never looks dead.

**Architecture:** The Durable Object writes one bounded, privacy-safe log row per WIB day beside its doc; a public
`GET /api/office/history` serves the index and a day with ETag and edge caching. A lazy replay chunk rebuilds each desk's
timeline with the live time rules and feeds synthetic snapshots into the same scene the live feed drives, so the crew
(A) and the pipeline (B) render replay with no extra render code.

**Tech Stack:** Cloudflare Workers and Durable Objects (SQLite storage API), Pages Functions, Next.js 16 static export, react-three-fiber, Vitest, Playwright, Bun.

Design: [`2026-10-20-agent-office-revamp-design.md`](../specs/2026-10-20-agent-office-revamp-design.md) sections 7 to 11.

## Global Constraints

- No em dashes (U+2014) anywhere. Bun only; `rtk` for git; conventional commits.
- Privacy (R3, office D3): log only agent, state, activity, slot and time, plus repo, branch and title for public
  allowlisted repositories; never prompts, code, paths, client names or session hashes in served output; titles cleaned
  again at read time; `privatized` scrubs every row.
- Storage bounds: 3,000 events, 200 PRs, 500 runs, 50 deploys and 120 KB serialized per day; at most 8 log rows (today
  plus 7); inside the free limits (100,000 rows written and 5,000,000 read per day, 5 GB).
- Endpoint: strict validation, canonical cache key, no reflected input, `nosniff`, ETag and 304.
- Office chunks total at most 40 KB gzip (`officeTotal`); the replay chunk loads only on the idle-loop condition or the
  drawer's replay control. No new shader program; L1 under 125 calls.
- Reduced motion: no auto loop; replay steps on demand; tiles show end states.
- Security review before merge.

## File structure

| File | Responsibility |
|---|---|
| `workers/office/src/history.ts` (new) | `DayLog`, `logBeat`, `logGithub`, `closeOpen`, caps, rollover, `scrubRepo`, `historyIndex`, `historyDay` (pure) |
| `workers/office/src/office.ts` | Loads and writes `log:` rows with the doc; prunes; `/history` |
| `workers/office/src/worker.ts` | `GET /history` forwarding the `day` only |
| `src/lib/office/protocol.ts` | `OfficeHistoryIndexV1`, `OfficeHistoryV1`, `parseOfficeHistoryIndex`, `parseOfficeHistory`, `OFFICE_HISTORY_PATH` |
| `functions/_lib/officeHistory.ts` (new), `functions/api/office/history.ts` (new) | The public endpoint |
| `src/experience/floors/lobby/office/replay.ts` (new) | Timeline rebuild, compression, `snapshotAt` (pure) |
| `src/experience/floors/lobby/office/replayFeed.ts` (new), `replayChunk.ts` (new) | Fetch, parse, playback clock, idle-loop arbitration |
| `src/experience/floors/lobby/office/chunk.ts` | `loadOfficeReplay()` (third `import()`) |
| `src/experience/floors/lobby/office/tiles.ts` (new), `OfficeScene.tsx` | Floor tiles (one stage mesh), the feed source switch |
| `officeWall.ts`, `OfficeChips.tsx`, `OfficeBody.tsx` | Replay label, chip tag, controls |
| tests | `tests/office/history.test.ts`, `tests/office/history-endpoint.test.ts`, `tests/office/worker.test.ts`, `tests/office/protocol.test.ts`, `tests/unit/office-replay.test.ts`, `office-replay-feed.test.ts`, `office-tiles.test.ts`, `office-wall.test.ts`, `tests/hud/OfficeBody.test.tsx`, `OfficeChips.test.tsx`, `e2e/office.spec.ts` |

---

### Task 1: The day log (pure)

**Files:**
- Create: `workers/office/src/history.ts`
- Test: `tests/office/history.test.ts`

**Interfaces:**
- Produces:

```ts
export const HISTORY = { days: 8, events: 3000, prs: 200, runs: 500, deploys: 50, maxBytes: 120 * 1024 } as const;
export type LogEvent = [t: number, n: number, slot: number, state: number, activity: number, until: number, helpers: number];
export interface DayLog {
  v: 1; day: string; keys: string[]; agents: OfficeAgent[];
  tasks: Record<string, { repo: string; branch?: string; title?: string }>;
  events: LogEvent[]; prs: [number, number, string, number, string][]; runs: [number, 0 | 1][]; deploys: [number, 0 | 1][];
  truncated: boolean;
}
export const logKey = (day: string) => `log:${day}`;
export function emptyLog(day: string): DayLog;
export function secondsOfDay(now: number): number;          // since the WIB midnight
export function logBeat(log: DayLog, prev: SessionRecord | undefined, next: SessionRecord, now: number): DayLog; // unchanged log when nothing loggable changed
export function logGithub(log: DayLog, before: OfficeDoc, after: OfficeDoc, now: number): DayLog; // merges, finished runs, deploy results
export function scrubRepo(log: DayLog, repo: string): DayLog;
```

- [ ] **Step 1: Tests first** `tests/office/history.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyLog, HISTORY, logBeat, logGithub, scrubRepo, secondsOfDay } from "../../workers/office/src/history";
import { applyGithub, emptyDoc, type SessionRecord } from "../../workers/office/src/state";

const DAY0 = Date.UTC(2026, 9, 19, 17, 0, 0); // 00:00 WIB on 20 Oct
const rec = (over: Partial<SessionRecord>): SessionRecord => ({ id: "a".repeat(64), agent: "copilot", slot: 1, firstSeen: DAY0, lastBeat: DAY0, state: "working", activity: "editing", since: DAY0, recent: [], ...over });

describe("day log", () => {
  it("logs a state change with an ordinal, never the hash, and closes the previous event", () => {
    let log = emptyLog("2026-10-20");
    log = logBeat(log, undefined, rec({}), DAY0 + 1_000);
    log = logBeat(log, rec({ lastBeat: DAY0 + 50_000 }), rec({ state: "ci", activity: "ci", lastBeat: DAY0 + 60_000 }), DAY0 + 60_000);
    expect(log.events).toEqual([[1, 0, 1, 0, 0, 50, 0], [60, 0, 1, 4, 6, 0, 0]]);
    expect(log.keys).toEqual(["a".repeat(64)]);
    expect(JSON.stringify(log.events)).not.toContain("aaaa");
  });
  it("logs a helper count change and carries the count", () => {
    const log = logBeat(emptyLog("2026-10-20"), rec({}), rec({ helpers: 3 }), DAY0 + 5_000);
    expect(log.events.at(-1)?.[6]).toBe(3);
  });
  it("ignores keepalives (same state and activity)", () => {
    const log = logBeat(emptyLog("2026-10-20"), rec({}), rec({ lastBeat: DAY0 + 15_000 }), DAY0 + 15_000);
    expect(log.events).toEqual([]);
  });
  it("keeps tasks only for sessions with a public repo", () => {
    const log = logBeat(emptyLog("2026-10-20"), undefined, rec({ repo: "ShinyQ/ShinyQ-HQ", branch: "feat/x", title: "Thing" }), DAY0);
    expect(log.tasks["0"]).toEqual({ repo: "ShinyQ/ShinyQ-HQ", branch: "feat/x", title: "Thing" });
    expect(logBeat(emptyLog("2026-10-20"), undefined, rec({}), DAY0).tasks).toEqual({});
  });
  it("caps events and marks the day truncated", () => {
    let log = emptyLog("2026-10-20");
    const states = ["working", "thinking"] as const;
    for (let i = 0; i < HISTORY.events + 10; i++) log = logBeat(log, rec({ state: states[i % 2] }), rec({ state: states[(i + 1) % 2] }), DAY0 + i * 1000);
    expect(log.events.length).toBe(HISTORY.events);
    expect(log.truncated).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(log)).length).toBeLessThanOrEqual(HISTORY.maxBytes);
  });
  it("logs merges, finished runs and deploys, and scrubs a privatized repo", () => {
    const before = emptyDoc(DAY0);
    const after = applyGithub(before, { repo: "ShinyQ/ShinyQ-HQ", changes: [{ type: "pr", number: 7, branch: "feat/x", title: "Thing", url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/7", action: "merged" }] }, "d", DAY0 + 5_000);
    let log = logGithub(emptyLog("2026-10-20"), before, after, DAY0 + 5_000);
    expect(log.prs).toEqual([[5, -1, "ShinyQ/ShinyQ-HQ", 7, "Thing"]]);
    log = scrubRepo(log, "ShinyQ/ShinyQ-HQ");
    expect(log.prs).toEqual([[5, -1, "", 7, ""]]);
  });
  it("counts seconds from the WIB midnight", () => {
    expect(secondsOfDay(DAY0 + 3_600_000)).toBe(3600);
  });
});
```

- [ ] **Step 2:** `bun run test tests/office/history.test.ts`; expect FAIL.
- [ ] **Step 3: Implement** `history.ts`:

```ts
import { OFFICE_ACTIVITIES, OFFICE_STATES, wibDay, type OfficeAgent } from "../../../src/lib/office/protocol";
import type { OfficeDoc, SessionRecord } from "./state";

/** The replay log (design 7.1): one row per WIB day beside the doc, bounded, with no session hash in served output. */
export const HISTORY = { days: 8, events: 3000, prs: 200, runs: 500, deploys: 50, maxBytes: 120 * 1024 } as const;
export type LogEvent = [t: number, n: number, slot: number, state: number, activity: number, until: number, helpers: number];
export interface DayLog {
  v: 1;
  day: string;
  keys: string[];
  agents: OfficeAgent[];
  tasks: Record<string, { repo: string; branch?: string; title?: string }>;
  events: LogEvent[];
  prs: [number, number, string, number, string][];
  runs: [number, 0 | 1][];
  deploys: [number, 0 | 1][];
  truncated: boolean;
}

export const logKey = (day: string) => `log:${day}`;
export const emptyLog = (day: string): DayLog => ({ v: 1, day, keys: [], agents: [], tasks: {}, events: [], prs: [], runs: [], deploys: [], truncated: false });
const WIB = 7 * 3_600_000;
export const secondsOfDay = (now: number) => Math.floor(((now + WIB) % 86_400_000) / 1000);
const size = (log: DayLog) => new TextEncoder().encode(JSON.stringify(log)).length;

function ordinal(log: DayLog, s: SessionRecord): { log: DayLog; n: number } {
  const n = log.keys.indexOf(s.id);
  if (n >= 0) return { log, n };
  return { log: { ...log, keys: [...log.keys, s.id], agents: [...log.agents, s.agent] }, n: log.keys.length };
}

/** A state, activity or slot change of one session; keepalives log nothing. The previous open event of that session gets its `until` from `prev.lastBeat`. */
export function logBeat(log: DayLog, prev: SessionRecord | undefined, next: SessionRecord, now: number): DayLog {
  if (prev && prev.state === next.state && prev.activity === next.activity && prev.slot === next.slot && (prev.helpers ?? 0) === (next.helpers ?? 0)) return log;
  if (log.truncated) return log;
  const o = ordinal(log, next);
  let out = o.log;
  const events = out.events.slice();
  if (prev) {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i][1] === o.n) {
        if (events[i][5] === 0) events[i] = [events[i][0], events[i][1], events[i][2], events[i][3], events[i][4], Math.max(events[i][0], secondsOfDay(prev.lastBeat)), events[i][6]];
        break;
      }
    }
  }
  events.push([secondsOfDay(now), o.n, next.slot ?? -1, OFFICE_STATES.indexOf(next.state), OFFICE_ACTIVITIES.indexOf(next.activity), 0, next.helpers ?? 0]);
  const tasks = next.repo ? { ...out.tasks, [o.n]: { repo: next.repo, ...(next.branch ? { branch: next.branch } : {}), ...(next.title ? { title: next.title } : {}) } } : out.tasks;
  out = { ...out, events, tasks };
  if (events.length > HISTORY.events || size(out) > HISTORY.maxBytes) return { ...log, truncated: true };
  return out;
}

const cap = <T>(list: T[], n: number) => (list.length > n ? list.slice(list.length - n) : list);

/** Merges (new `merged` feed items), finished runs (counted by `today.ciRuns`) and deploy results between two docs. */
export function logGithub(log: DayLog, before: OfficeDoc, after: OfficeDoc, now: number): DayLog {
  const t = secondsOfDay(now);
  const seen = new Set(before.feed.map((f) => `${f.key}:${f.status}`));
  const prs = log.prs.slice();
  const deploys = log.deploys.slice();
  for (const f of after.feed) {
    if (seen.has(`${f.key}:${f.status}`)) continue;
    if (f.kind === "pr" && f.status === "merged") {
      const pr = after.prs.find((p) => `pr:${p.repo}#${p.number}` === f.key);
      const slot = pr ? (after.sessions.find((s) => s.repo === pr.repo && s.branch === pr.branch)?.slot ?? -1) : -1;
      if (pr) prs.push([t, slot, pr.repo, pr.number, pr.title]);
    } else if (f.kind === "deploy" && (f.status === "success" || f.status === "failure")) {
      deploys.push([t, f.status === "success" ? 1 : 0]);
    }
  }
  const finished = after.today.ciRuns - (before.today.day === after.today.day ? before.today.ciRuns : 0);
  const green = after.today.ciGreen - (before.today.day === after.today.day ? before.today.ciGreen : 0);
  const runs = log.runs.slice();
  for (let i = 0; i < finished; i++) runs.push([t, i < green ? 1 : 0]);
  return { ...log, prs: cap(prs, HISTORY.prs), runs: cap(runs, HISTORY.runs), deploys: cap(deploys, HISTORY.deploys) };
}

/** A privatized repository leaves no name or title in the log. */
export function scrubRepo(log: DayLog, repo: string): DayLog {
  const tasks = Object.fromEntries(Object.entries(log.tasks).filter(([, v]) => v.repo !== repo));
  return { ...log, tasks, prs: log.prs.map((p) => (p[2] === repo ? [p[0], p[1], "", p[3], ""] : p)) };
}

export const dayOf = wibDay;
```

- [ ] **Step 4:** Run; expected PASS.
- [ ] **Step 5:** Commit `feat(office): the bounded day log for replay`.

### Task 2: The Durable Object writes, rolls over and prunes

**Files:**
- Modify: `workers/office/src/office.ts`, `workers/office/src/types.ts` (storage `list`, `delete`, multi-key `put`)
- Test: `tests/office/worker.test.ts`

- [ ] **Step 1: Tests first** (the in-memory storage stub in this file gains `list({ prefix })`, `delete(keys)` and a
  `put(record)` overload, and counts row writes):
  - a beat that changes state writes two rows (`doc`, `log:<today>`) in one `put`; a keepalive writes one (`doc`);
  - the first write on a new WIB day starts a new log row, and with rows for 9 days stored, rows older than 7 days are
    deleted (at most 8 `log:` keys remain);
  - a `repository privatized` delivery rewrites every log row with `scrubRepo`;
  - a webhook that merges a PR adds a `prs` entry to today's row.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** in `office.ts`: keep `this.log: DayLog | null`, loaded with the doc
  (`storage.get(logKey(wibDay(now)))`, else `emptyLog`). On `/beat`: compute `prev` (the session before) and `next`
  (after `applyBeat`), `const log = logBeat(this.log, prev, next, now)`; when the day rolled (`this.log.day !== wibDay(now)`)
  start from `emptyLog(wibDay(now))` and call `prune(now)` once. Save with
  `storage.put(log === this.log ? { doc } : { doc, [logKey(log.day)]: log })`. On `/github`: `logGithub(log, doc, next, now)`,
  and for a `privatized` change `scrubRepo` over every `log:` row (`storage.list({ prefix: "log:" })`, at most 8). `prune`:

```ts
  private async prune(now: number): Promise<void> {
    const keep = new Set(Array.from({ length: HISTORY.days }, (_, i) => logKey(wibDay(now - i * 86_400_000))));
    const rows = await this.ctx.storage.list({ prefix: "log:" });
    const stale = [...rows.keys()].filter((k) => !keep.has(k));
    if (stale.length) await this.ctx.storage.delete(stale);
  }
```

- [ ] **Step 4:** Run `bun run test tests/office/`; expected PASS.
- [ ] **Step 5:** Commit `feat(office): the Durable Object keeps 8 days of logs`.

### Task 3: History views and the contract

**Files:**
- Modify: `workers/office/src/history.ts` (views), `workers/office/src/office.ts` (`GET /history`), `workers/office/src/worker.ts` (`GET /history`), `src/lib/office/protocol.ts`
- Test: `tests/office/history.test.ts`, `tests/office/protocol.test.ts`, `tests/office/worker.test.ts`

**Interfaces:**
- Produces (protocol):

```ts
export const OFFICE_HISTORY_PATH = "/api/office/history";
export interface OfficeHistoryDay { day: string; events: number; prs: number; runs: number }
export interface OfficeHistoryIndexV1 { v: 1; days: OfficeHistoryDay[] }
export interface OfficeHistoryV1 {
  v: 1; day: string; start: number; agents: OfficeAgent[];
  tasks: Record<string, { repo: string; title?: string }>;
  events: [number, number, number, number, number, number, number][];
  prs: [number, number, string, number, string][];
  runs: [number, 0 | 1][]; deploys: [number, 0 | 1][];
  truncated: boolean;
}
export function parseOfficeHistoryIndex(raw: unknown): OfficeHistoryIndexV1 | null;
export function parseOfficeHistory(raw: unknown): OfficeHistoryV1 | null;
```

- (history.ts) `historyIndex(rows: Map<string, DayLog>, now): OfficeHistoryIndexV1`; `historyDay(log, doc, now, blocklist): OfficeHistoryV1`
  (no `keys`; open events take `until` from the doc's `lastBeat`; tasks and PR titles through `cleanTitle`, repositories
  kept only if in `doc.publicRepos`, else the task is dropped and the PR's repo and title emptied; branches never served).

- [ ] **Step 1: Tests first:** `historyDay` never contains a 64-hex string (`/[0-9a-f]{64}/`), drops a repo missing from
  `publicRepos`, replaces a blocked title (a term from the blocklist fixture) with nothing, fills the open `until`;
  `historyIndex` lists exactly 8 days, newest first, empty days with zeros; `parseOfficeHistory` rejects extra keys,
  events with a state index of 9 or more, a helper count over 9, a slot of 10 (or below -1), `t` over 86,400, a title with `<`, more than 3,000 events, and
  accepts `historyDay` output; the DO answers `GET /history` (index) and `GET /history?day=YYYY-MM-DD` (a day in the
  window), `404` for anything else; the Worker forwards only a valid `day`.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** the views and parsers (strict like v1: `onlyKeys`, tuple lengths, integer ranges,
  `isText` for titles, `REPO` for repos or `""`), and the routes:

```ts
// office.ts
if (pathname === "/history") {
  if (request.method !== "GET") return status(405);
  const day = new URL(request.url).searchParams.get("day");
  const now = this.now();
  const window = Array.from({ length: HISTORY.days }, (_, i) => wibDay(now - i * 86_400_000));
  if (day === null) return json(historyIndex(await this.logs(), now));
  if (!window.includes(day)) return status(404);
  const log = (await this.ctx.storage.get<DayLog>(logKey(day))) ?? emptyLog(day);
  return json(historyDay(log, await this.load(), now, this.blocklist));
}
```

(The DO gets the blocklist the same way the Worker does: pass it in the constructor from `index.ts`.)
- [ ] **Step 4:** Run; expected PASS.
- [ ] **Step 5:** Commit `feat(office): history views and the history contract`.

### Task 4: The public endpoint

**Files:**
- Create: `functions/_lib/officeHistory.ts`, `functions/api/office/history.ts`
- Test: `tests/office/history-endpoint.test.ts`

- [ ] **Step 1: Tests first:**

```ts
it("serves the index and a day with ETag and caching; junk is a 404 without echo", async () => {
  const h = createOfficeHistoryHandler({ cache: () => cache, now: () => NOW });
  const index = await h(ctx("https://x/api/office/history", env));
  expect(index.status).toBe(200);
  expect(index.headers.get("Cache-Control")).toBe("public, max-age=30, stale-while-revalidate=60");
  const today = await h(ctx(`https://x/api/office/history?day=${wibDay(NOW)}`, env));
  expect(today.headers.get("Cache-Control")).toBe("public, max-age=30, stale-while-revalidate=60");
  const past = await h(ctx(`https://x/api/office/history?day=${wibDay(NOW - 2 * 86_400_000)}`, env));
  expect(past.headers.get("Cache-Control")).toBe("public, max-age=3600, stale-while-revalidate=86400");
  const etag = past.headers.get("ETag")!;
  expect((await h(ctx(`https://x/api/office/history?day=${wibDay(NOW - 2 * 86_400_000)}`, env, { "If-None-Match": etag }))).status).toBe(304);
  for (const q of ["?day=2020-01-01", "?day=<script>", `?day=${wibDay(NOW)}&x=1`, "?foo=bar"]) {
    const r = await h(ctx(`https://x/api/office/history${q}`, env));
    expect(r.status).toBe(404);
    expect(await r.text()).toBe('{"v":1,"error":"day"}');
  }
  expect(cache.keys().every((k) => /\/api\/office\/history(\?day=\d{4}-\d{2}-\d{2})?$/.test(k))).toBe(true);
});
it("answers disabled when the office is off, and validates the Worker's body", async () => {
  expect(await (await h(ctx("https://x/api/office/history", { ...env, OFFICE_ENABLED: "false" }))).json()).toEqual({ v: 1, enabled: false });
  const bad = officeEnv({ history: () => ({ v: 1, day: "x" }) });
  expect((await h(ctx(`https://x/api/office/history?day=${wibDay(NOW)}`, bad))).status).toBe(503);
});
```

- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** `createOfficeHistoryHandler` (pattern of `createOfficeSnapshotHandler`: GET and HEAD only;
  `OFFICE_ENABLED`; the only allowed query is a single `day` matching `^\d{4}-\d{2}-\d{2}$` inside the 8-day window,
  else the fixed 404 body; the cache key is the canonical URL; the Worker body validated with
  `parseOfficeHistoryIndex` or `parseOfficeHistory`, a 503 with `no-store` when invalid or unreachable; `nosniff`;
  ETag from `etagOf`; today and the index `public, max-age=30, stale-while-revalidate=60`, past days
  `public, max-age=3600, stale-while-revalidate=86400`). `functions/api/office/history.ts` exports `onRequest` like
  `index.ts`. Check `public/_headers` and the CSP tests still pass (same origin, no change expected).
- [ ] **Step 4:** Run `bun run test tests/office/ tests/unit/csp.test.ts`; expected PASS.
- [ ] **Step 5:** Commit `feat(office): GET /api/office/history`.

### Task 5: The replay engine (pure)

**Files:**
- Create: `src/experience/floors/lobby/office/replay.ts`
- Test: `tests/unit/office-replay.test.ts`

**Interfaces:**
- Produces:

```ts
export const REPLAY = { minS: 30, maxS: 60, gapS: 600, gapPlayS: 1.5, restS: 6, idleS: 30 } as const;
export interface Span { from: number; to: number; play0: number; play1: number } // day seconds to playback seconds
export interface ReplayPlan { day: string; start: number; spans: Span[]; duration: number; prTimes: number[] }
export function planReplay(h: OfficeHistoryV1): ReplayPlan | null;         // null for a day without events or PRs
export function dayTime(plan: ReplayPlan, playS: number): number;           // playback seconds to day seconds
export function snapshotAt(h: OfficeHistoryV1, plan: ReplayPlan, playS: number): OfficeSnapshotV3 & { pipeline: OfficePipeline }; // the v4 shape
export function mergedBy(plan: ReplayPlan, playS: number): number;          // PRs merged so far (tiles lit)
```

- [ ] **Step 1: Tests first:**

```ts
describe("replay", () => {
  it("compresses quiet gaps and clamps to 30 to 60 s", () => {
    const busy = makeHistory({ sessions: 3, hours: 10, changesPerHour: 40 });
    const quiet = makeHistory({ sessions: 1, hours: 1, changesPerHour: 2 });
    for (const h of [busy, quiet]) {
      const p = planReplay(h)!;
      expect(p.duration).toBeGreaterThanOrEqual(REPLAY.minS);
      expect(p.duration).toBeLessThanOrEqual(REPLAY.maxS);
    }
    expect(planReplay(makeHistory({ sessions: 0, hours: 0, changesPerHour: 0 }))).toBeNull();
  });
  it("matches the live time rules (effective) at every sampled moment", () => {
    const h = makeHistory({ sessions: 2, hours: 3, changesPerHour: 30, quietGaps: true });
    const p = planReplay(h)!;
    for (let s = 0; s < p.duration; s += 0.25) {
      const snap = snapshotAt(h, p, s);
      const t = h.start + dayTime(p, s) * 1000;
      for (const d of snap.desks) expect(d.state).toBe(expectedState(h, d.slot, t)); // reference built with workers/office/src/state.ts effective()
    }
  });
  it("lights tiles in merge order and never shows a hash or a non-public title", () => {
    const h = makeHistory({ sessions: 1, hours: 2, changesPerHour: 10, prs: 5 });
    const p = planReplay(h)!;
    expect(mergedBy(p, 0)).toBe(0);
    expect(mergedBy(p, p.duration)).toBe(5);
    expect(JSON.stringify(snapshotAt(h, p, p.duration / 2))).not.toMatch(/[0-9a-f]{64}/);
  });
});
```

(`makeHistory` and `expectedState` live in `tests/helpers/office-history.ts`: a generator of valid `OfficeHistoryV1`
days with a seeded sequence, and a reference that replays the same events through `effective` from
`workers/office/src/state.ts`.)
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** `replay.ts`: active spans are the union of (event time to its `until` plus the asleep rule,
  3 min or 15 min for testing, ci and input) and each PR, run and deploy time plus 30 s; gaps over `gapS` play in
  `gapPlayS`; the rest maps linearly so that the total lands in `[minS, maxS]` (scale the active rate to fit, a shorter
  day stretched to 30 s, a longer one squeezed to 60 s). `snapshotAt` rebuilds each desk: the latest event at or before
  the day time for each ordinal with a slot (0 to 9, the front row 0 to 4 and the back row 5 to 9), then applies the rules of `effective` (thinking after 20 s past a working or
  reviewing event's `until`, asleep after 3 or 15 min, done for 20 s, removed after 30 min) using `until` as the last
  beat; the title is the ordinal's task title when present (else none: "Client project"), `helpers` the event's count while
  the desk is awake, the mode `live` while a desk is
  awake else `semi-live`; `pipeline.ships` lists the merges and deploys of the last 60 s of day time; `today` counts up to
  that moment.
- [ ] **Step 4:** Run; expected PASS.
- [ ] **Step 5:** Commit `feat(office): the replay engine`.

### Task 6: Replay chunk, feed and the idle loop

**Files:**
- Create: `src/experience/floors/lobby/office/replayFeed.ts`, `src/experience/floors/lobby/office/replayChunk.ts`
- Modify: `src/experience/floors/lobby/office/chunk.ts` (`loadOfficeReplay`), `OfficeScene.tsx` (the source switch), `tests/unit/office-chunk-graph.test.ts`
- Test: `tests/unit/office-replay-feed.test.ts`

**Interfaces:**
- Produces: `type ReplayState = { status: "off" | "loading" | "playing" | "resting" | "paused" | "unavailable"; day: string | null; playS: number; plan: ReplayPlan | null; auto: boolean }`;
  `createReplayFeed({ fetch, now })` with `index()`, `play(day, auto)`, `pause()`, `seek(playS)`, `stop()`, `step(dt, reduced)`,
  `state()`, `snapshot(): OfficeSceneSnapshot | null`, `subscribe(cb)`; `idleLoopWanted({ view, inView, reduced, quietFor }): boolean`;
  `loadOfficeReplay(): Promise<typeof import("./replayChunk")>`.

- [ ] **Step 1: Tests first:** `idleLoopWanted` is true only when the live view has no awake desk for 30 s, the office is
  in view and motion is not reduced; `play(day, true)` fetches the day once (an ETag-aware cache in the feed), reaches
  `playing`, loops with a 6 s `resting` between loops; `stop()` on an awake live snapshot; `unavailable` on a fetch
  failure or a body `parseOfficeHistory` rejects; the latest day with events is picked from the index (today, else the
  newest of the last 7); under reduced motion `step` never advances and `seek` jumps by whole hours.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement.** `replayChunk.ts` exports `createReplayFeed`, `idleLoopWanted`, `planReplay`, `snapshotAt` and
  the tiles writer (Task 7), loaded by `loadOfficeReplay` (`import("./replayChunk")`, the third and last office
  `import()` in `chunk.ts`; add it to the chunk-graph test's allowed dynamic imports). In `OfficeScene`, a `source` ref
  picks the feed: live by default; when `idleLoopWanted` holds (checked every 0.5 s with the in-view check), load the
  chunk and `play(latest, true)`; while replaying, the view is `officeView({ status: "ready", snapshot: replay.snapshot() })`
  plus `replay: { day, time }`, and the live poller keeps running (30 s while all asleep); any live snapshot with an
  awake desk stops the replay (the crew blends back, 0.4 s). The drawer's controls call the same feed (`auto: false`
  holds until "Back to live").
- [ ] **Step 4:** Run the feed tests and `office-chunk-graph`; expected PASS.
- [ ] **Step 5:** Commit `feat(office): replay feed and the idle loop`.

### Task 7: Floor tiles

**Files:**
- Create: `src/experience/floors/lobby/office/tiles.ts`
- Modify: `OfficeScene.tsx` (one `OfficeTiles` stage mesh)
- Test: `tests/unit/office-tiles.test.ts`

**Interfaces:**
- Produces: `TILES = { cols: 6, rows: 4, size: 1.6, gap: 0.4 }`; `tileCenters(w: OfficeWing): Vec2[]` (24, on the wing plaza
  between the lead road's end and the stop, clear of the stop's view zone area); `tileLevels(merged: number, out: Float32Array)`
  (first pass 0 to 24 lit at 0.7, a second pass brightens to 1); `OfficeTiles` (stage material, `STAGE_KIND.tile` on a
  flat unit plane, 24 instances, one draw call, alpha via `aStage2.w`).

- [ ] **Step 1: Tests first:** 24 centres inside the wing plaza rect, none inside `officeZone(w).area`, none on an obstacle;
  `tileLevels(0)` all 0.08 (the unlit floor glow), `tileLevels(5)` five at 0.7, `tileLevels(30)` six at 1 and 18 at 0.7.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement**; the tiles read `view.today.prsMerged` live, `mergedBy(plan, playS)` in a replay. Under reduced
  motion a newly lit tile appears at once (no fade). Mount the mesh on the full tier only after the composer exists
  (the precompile rule), inside `OfficeReady`.
- [ ] **Step 4:** Run; expected PASS.
- [ ] **Step 5:** Commit `feat(office): merged PR floor tiles`.

### Task 8: Replay label, chip tag and drawer controls

**Files:**
- Modify: `officeWall.ts` (banner), `OfficeChips.tsx` (tag), `OfficeBody.tsx` (controls), `messages/en.json`, `messages/id.json`
- Test: `tests/unit/office-wall.test.ts`, `tests/hud/OfficeChips.test.tsx`, `tests/hud/OfficeBody.test.tsx`

- [ ] **Step 1: Tests first:** the wall model shows the banner "Replay · Mon 19 Oct · 14:05" (ID "Putar ulang · Sen 19 Okt · 14:05")
  only while replaying; every chip carries a "Replay" tag then (and its accessible name includes it); the drawer shows
  8 day buttons (empty days disabled, `aria-pressed` on the playing one), play and pause (`aria-label` changes), a range
  with `aria-valuetext` "14:05 WIB", "Back to live", "Replay unavailable" and "Partial day" states; reduced motion turns
  play into "Next hour".
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** the strings under `office.3d.replay.*` (both locales) and the components; the drawer's
  controls drive the replay feed through the scene runtime (`officeRuntime.replay`), loading the chunk on first use.
- [ ] **Step 4:** Run the three files plus `messages` and `client-namespaces` tests; expected PASS.
- [ ] **Step 5:** Commit `feat(office): replay label, chip tag and drawer controls`.

### Task 9: E2E, budgets, captures, security review, docs, PR

- [ ] **Step 1:** `e2e/office.spec.ts`: with an all-asleep live fixture and a history fixture routed at
  `/api/office/history*`, the idle loop starts (`__hq.probes.office.replay.status === "playing"`), the wall and chips show
  the label, tiles light (`probes.office.tiles`), a live awake snapshot stops it; the drawer plays another day and seeks;
  reduced motion: no auto loop, "Next hour" steps; a 404 history leaves the live office as before.
- [ ] **Step 2:** Budgets: add `officeReplay` to `BYTES_3D_BUDGET` (measured plus 0.6 KB), measure `officeTotal` (scene +
  body + replay) under 40 KB, perf lane with the replay looping (calls under 125, programs at baseline, zero growth in the
  memory gate across three loops). Decision file for the caps.
- [ ] **Step 3:** Captures (`replay` and `tiles` shots) and a video of one loop at 1440x900, 820x1180 and 390x844, full and
  lite; send to the coordinator.
- [ ] **Step 4:** Security review with the `security-review` agent (storage bounds, privacy of the log and the endpoint,
  query validation, cache keys, parsing); fix findings; summarise in the PR.
- [ ] **Step 5:** Docs: `docs/agents/office.md` (history storage, endpoint, caching, free-tier numbers), `docs/agents/floor-l1-lobby.md`
  (replay, tiles, probes), `docs/features.md`, `workers/office/README.md`, `docs/deploy.md` if the deploy steps change
  (they should not); this plan's `Status: in review`; mark the design `implemented` with the three PRs.
- [ ] **Step 6:** `bun run verify:quick && bun run e2e:changed`, check CI in flight, push, open a ready-for-review PR
  `feat(office): day replay (revamp part C)`.

## Self-review notes

- Spec 7.1 to Tasks 1 and 2; 7.2 to Tasks 3 and 4; 7.3 to Task 5; 7.4 to Tasks 6 to 8; 7.5, 8, 9 and 13 to Task 9.
- Shared names: `DayLog`, `HISTORY`, `logKey`, `logBeat`, `logGithub`, `scrubRepo`, `historyIndex`, `historyDay`,
  `OfficeHistoryV1`, `parseOfficeHistory`, `planReplay`, `snapshotAt`, `mergedBy`, `createReplayFeed`, `idleLoopWanted`,
  `loadOfficeReplay`, `TILES`, `tileLevels`.
