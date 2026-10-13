# Public Visit Stats, Layer 1: Data Pipeline (S1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect, roll up and serve anonymous public site activity (visits, countries, top floor, 3D vs Classic split, questions asked by topic and chip) as one daily `StatsSnapshotV1` at `GET /api/stats`, for the S2 display.

**Architecture:** A daily Cron Worker `hq-stats` (`workers/stats/`, no fetch handler, no route) reads Cloudflare Web Analytics (GraphQL) and Analytics Engine (`ask_events`, `visit_events`, SQL API), appends one rollup per finalized UTC day to a single KV ledger (never recomputing a stored day), and writes the public snapshot `stats:v1` to KV `STATS_KV`. Pages Functions add `POST /api/visit` (first-party 3D or Classic beacon) and `GET /api/stats` (reads KV). The Ask Function appends topic and chip blobs to its events. One protocol module in `src/lib/stats/` is shared by the Worker, the Functions and the clients.

**Tech Stack:** TypeScript, Cloudflare Workers (cron, KV), Pages Functions, Analytics Engine, Web Analytics GraphQL, Vitest, Playwright, GitHub Actions (`cloudflare/wrangler-action` pinned by SHA), Bun.

Source plan: the coordinator's "CURRENT: Public visit stats, Layer 1" (owner decisions 2026-10-13/14). Research: `analytics-research.md`, `cf-webanalytics.md`, `cf-platform.md`, `repo-integration.md`, `privacy-security.md`.

## Global Constraints

- No em dashes (U+2014) anywhere.
- Snapshot contract `StatsSnapshotV1` exactly as specified (fields, types, period keys `d30` and `all`); S2 builds against it.
- No public thresholds. Countries: ISO alpha-2 only, exclude `XX` and `T1`, dots only (no per-country numbers in the snapshot).
- Label "visits" (EN) / "kunjungan" (ID).
- Daily cron `0 1 * * *`; finalize complete UTC days only; never recompute a finalized day.
- Opt-out key `localStorage["hq:stats-optout"] === "1"` (S2 writes `"1"` or removes it and dispatches window event `hq:stats-optout`). It disables the first-party visit beacon and the Cloudflare Web Analytics beacon (the CF beacon is injected behind the check). CSP unchanged.
- Visit beacon de-duplication in memory only (no storage); never under DNT, GPC, automation (unless `?visit=1`) or the opt-out.
- Reuse GitHub secret `CF_EVAL_TOKEN` as the Worker's analytics token; the deploy workflow probes `rumPageloadEventsAdaptiveGroups` settings first and fails loudly; never print or log a token.
- Cloudflare account id stays out of the repo (Worker secret `WA_ACCOUNT_ID`, GitHub secret `CLOUDFLARE_ACCOUNT_ID`). KV ids and the Web Analytics siteTag may be committed.
- Bilingual user-facing copy (EN and ID); this PR owns the footer privacy text only.
- Budgets: Classic site JS within 240 KB (about 203 today); 3D JS within 450 KB.
- No new runtime dependencies (T12): hand-written Cloudflare types and validators, no zod on the client.
- Local e2e port 4448.

## Live facts (probed 2026-10-14 with the owner's Wrangler login, read-only)

- GraphQL: `rumPageloadEventsAdaptiveGroups` with `dimensions { date }`, `{ requestHost_in: [...] }`, `{ bot: 0 }`, `count`, `sum { visits }` works; numbers are already sample-adjusted (steps of 10). Production data starts 2026-10-11. `127.0.0.1` rows share the siteTag.
- Analytics Engine SQL: `toDate(timestamp)` works; `SUM(_sample_interval)` comes back as a string under `FORMAT JSONEachRow`; a dataset that was never written (`visit_events`) returns zero rows, not an error. `ask_events` has rows from 2026-10-10.

## File map

| File | Responsibility |
|---|---|
| `src/lib/stats/protocol.ts` | `StatsSnapshotV1`, constants, `parseStatsSnapshot`, `isCountryCode` |
| `src/lib/stats/fixtures.ts` | `STATS_FIXTURE`, `STATS_FIXTURE_EMPTY` (S2 and tests) |
| `src/lib/stats/visit.ts` | visit beacon wire contract: `parseVisitPayload`, `visitDataPoint` |
| `src/lib/stats/floors.ts` | `floorOfPath` (Web Analytics path to floor, via `parseHQUrl`) |
| `src/lib/stats/optout.ts` | `STATS_OPTOUT_KEY`, `STATS_OPTOUT_EVENT`, `isStatsOptedOut` |
| `src/lib/stats/visitClient.ts` | client beacon: `visitAllowed`, `visitMode`, `startVisitBeacon` |
| `src/components/VisitBeacon.tsx` | client island that starts the beacon once |
| `src/components/Analytics.tsx` | CF beacon injected by an inline guard (opt-out aware) |
| `functions/_lib/askStats.ts` | `topicOfTags`, `chipFor` (Ask event blobs 8 and 9) |
| `functions/_lib/visit.ts`, `functions/api/visit.ts` | `POST /api/visit` |
| `functions/_lib/stats.ts`, `functions/api/stats.ts` | `GET /api/stats` |
| `workers/stats/wrangler.toml`, `workers/stats/src/*.ts` | Cron Worker: `types`, `rollup` (pure), `sources` (GraphQL and SQL), `run` (orchestration), `index` |
| `scripts/stats-token-check.ts` | token probes for CI (analytics settings probe; deploy token read check) |
| `scripts/stats-dry-run.ts` | runs the Worker pipeline locally against production data into an in-memory KV, prints the snapshot |
| `.github/workflows/stats-worker.yml` | PR check (token probes, `wrangler deploy --dry-run`) |
| `.github/workflows/deploy.yml` | probe, then deploy `hq-stats` with wrangler-action and set its secrets |

---

### Task 1: Snapshot protocol, validator and fixtures

**Files:**
- Create: `src/lib/stats/protocol.ts`, `src/lib/stats/fixtures.ts`
- Test: `tests/stats/protocol.test.ts`

**Interfaces:**
- Produces: `StatsPeriod`, `StatsTopic`, `StatsFloor`, `StatsSnapshotV1`, `STATS_PERIODS`, `STATS_TOPICS`, `STATS_FLOORS`, `STATS_KEY = "stats:v1"`, `isCountryCode(v): v is string`, `parseStatsSnapshot(v): StatsSnapshotV1 | null`, `STATS_FIXTURE`, `STATS_FIXTURE_EMPTY`.

- [ ] **Step 1: Failing test** (`tests/stats/protocol.test.ts`): fixtures parse; `STATS_TOPICS` equals `ASK_TOPICS`; rejects wrong `v`, extra keys, negative or fractional counts, `XX`, `T1`, lowercase codes, duplicate countries, unknown floors, unknown topic keys, chips with unknown topic, non-ISO dates.
- [ ] **Step 2: Run** `bunx vitest run tests/stats/protocol.test.ts` (FAIL: module missing).
- [ ] **Step 3: Implement**

```ts
export const STATS_PERIODS = ["d30", "all"] as const;
export const STATS_TOPICS = ["work", "ai", "career", "contact", "perspectives"] as const;
export const STATS_FLOORS = ["L1", "L2", "L3", "L4", "RF"] as const;
export const STATS_KEY = "stats:v1";
export type StatsPeriod = (typeof STATS_PERIODS)[number];
export type StatsTopic = (typeof STATS_TOPICS)[number];
export type StatsFloor = (typeof STATS_FLOORS)[number];
export interface StatsAsks { total: number; topics: Record<StatsTopic, number>; chips: { id: string; topic: StatsTopic; n: number }[] }
export interface StatsSnapshotV1 {
  v: 1; updatedAt: string; since: string; sampled: true;
  visits: Record<StatsPeriod, number>; pageViews: Record<StatsPeriod, number>;
  countries: Record<StatsPeriod, string[]>; topFloor: Record<StatsPeriod, StatsFloor | null>;
  mode: Record<StatsPeriod, { threeD: number; classic: number }>; asks: Record<StatsPeriod, StatsAsks>;
}
```
`parseStatsSnapshot` checks exact key sets at every level, counts as non-negative safe integers, `updatedAt` matches `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$`, `since` matches `^\d{4}-\d{2}-\d{2}$`, countries unique and `isCountryCode` (`/^[A-Z]{2}$/` and not `XX`), chip ids match `^[a-z0-9]+(?:-[a-z0-9]+)*$` (at most 64 chars, at most 100 chips), and returns a fresh object (never the input).
- [ ] **Step 4: Run** the test (PASS).
- [ ] **Step 5: Commit** `feat(stats): snapshot protocol, validator and fixtures`.

### Task 2: Shared helpers: path to floor, opt-out, visit wire contract

**Files:**
- Create: `src/lib/stats/floors.ts`, `src/lib/stats/optout.ts`, `src/lib/stats/visit.ts`
- Test: `tests/stats/floors.test.ts`, `tests/stats/visit-protocol.test.ts`

**Interfaces:**
- Produces: `floorOfPath(path: string): StatsFloor | null` (uses `parseHQUrl` from `src/lib/url-sync.ts`; `/en` L1, `/id/journey/x` L2, `/en/labs` L3, `/en/blog/x` and `/en/library` L4, `/en/contact` RF, `/en/quick`, `/en/cv`, `/` null); `STATS_OPTOUT_KEY = "hq:stats-optout"`, `STATS_OPTOUT_EVENT = "hq:stats-optout"`, `isStatsOptedOut(storage?: Pick<Storage, "getItem"> | null): boolean`; `VISIT_VERSION = 1`, `VISIT_MODES = ["3d", "classic", "both"]`, `VisitMode`, `VisitPayload { v: 1; mode: VisitMode }`, `VISIT_MAX_BYTES = 128`, `parseVisitPayload(v): VisitPayload | null` (exact keys), `visitDataPoint(p)` returns `{ blobs: ["1", mode], doubles: [1], indexes: ["visit"] }`.

- [ ] **Step 1: Failing tests** for each mapping row, the opt-out value `"1"` only (`"0"`, `"true"`, missing and a throwing storage give false), and the payload parser (extra keys, wrong mode, wrong version rejected).
- [ ] **Step 2: Run** (FAIL).
- [ ] **Step 3: Implement** (`floorOfPath` imports `parseHQUrl` relatively: `../url-sync`; that module imports only `@/content/locales`, so check that the Worker bundle resolves `@/` through the root tsconfig paths in Task 7; if not, switch the import there to a relative path).
- [ ] **Step 4: Run** (PASS).
- [ ] **Step 5: Commit** `feat(stats): path to floor mapping, opt-out key and visit beacon contract`.

### Task 3: Ask events carry topic (blob8) and chip id (blob9)

**Files:**
- Create: `functions/_lib/askStats.ts`
- Modify: `src/ask/protocol.ts` (`AskRequest.chip?: string`), `src/ask/client.ts` (`AskOptions.chip`, sent in the body), `src/hud/ask/useAskThread.ts` (pass `curated`), `functions/_lib/handler.ts` (`parseBody` reads `chip`; `EventData.topic`, `EventData.chip`; blobs append `[topic, chip]`), `wrangler.toml` comment
- Test: `tests/ask/ask-stats.test.ts`, extend `tests/ask/handler.test.ts`, extend the client test that checks the request body

**Interfaces:**
- Produces: `topicOfTags(tags: readonly AskTag[]): StatsTopic | ""` and `chipFor(question: string, chip: unknown): Suggestion | undefined`.

Rules (deterministic): each tag maps to one topic (`perspectives` to perspectives; `contact` to contact; `ai, voice, fraud, documents, agents, rag, data, research` to ai; `career, now, education, certifications, awards, skills` to career; `work, software, github, security, writing, talks, stats` to work); the topic with the most tags wins; ties go to the first in `perspectives, contact, ai, career, work`; no tags give `""`. A chip counts only when its id is in `content/ask/suggestions.json` and `matchSuggestion(question)` returns the same id (stops poisoned ids); then the event topic is the chip's topic. Blob order stays `[outcome, locale, source, gap, packVersion, reason, entry, topic, chip]`.

- [ ] **Step 1: Failing tests**: mapping table, ties, empty tags; `chipFor` with a valid id and matching text (EN and ID), a valid id with other text, an unknown id, a non-string; handler test: a pill question writes `blobs[7] = "work"` and `blobs[8] = "work-best"`, a typed question writes the tag topic and `""`, a turnstile reject writes `""`, `""`; the client body includes `chip` only when given.
- [ ] **Step 2: Run** `bunx vitest run tests/ask` (FAIL).
- [ ] **Step 3: Implement**; `parseBody`: `chip` must be absent or a string of at most 64 characters, else 400.
- [ ] **Step 4: Run** (PASS) plus `bun run typecheck`.
- [ ] **Step 5: Commit** `feat(ask): record question topic and curated chip in ask events`.

### Task 4: `POST /api/visit` Function

**Files:**
- Create: `functions/_lib/visit.ts`, `functions/api/visit.ts`
- Modify: `functions/_lib/types.ts` (`VisitEnv`, `StatsEnv`, `KvNamespace.get` gains optional `{ cacheTtl?: number }`), `wrangler.toml` (`VISIT_EVENTS` dataset `visit_events`, `STATS_KV`, `STATS_ENABLED = "true"`)
- Test: `tests/stats/visit-endpoint.test.ts`

Clone of `createRumHandler`: POST only (405, `Allow: POST`), `STATS_ENABLED !== "true"` gives 204, `originAllowed` else 403, Content-Length and text length over `VISIT_MAX_BYTES` 413, bad JSON or payload 400, per-isolate cap `VISIT_ISOLATE_CAP = 600` per minute 429, `writeDataPoint` in try/catch, 204, `Cache-Control: no-store`. No other header read.

- [ ] **Step 1: Failing test** (cases above, plus "never stores IP or user agent").
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4: Run** (PASS).
- [ ] **Step 5: Commit** `feat(stats): POST /api/visit beacon Function`.

### Task 5: `GET /api/stats` Function

**Files:**
- Create: `functions/_lib/stats.ts`, `functions/api/stats.ts`
- Test: `tests/stats/stats-endpoint.test.ts`

GET and HEAD only (else 405 `Allow: GET, HEAD`). `STATS_ENABLED !== "true"` or missing KV or missing key or invalid JSON or `parseStatsSnapshot` null: 204 with `Cache-Control: public, max-age=300`. Else 200, body `JSON.stringify(parsed)`, `Content-Type: application/json; charset=utf-8`, `X-Content-Type-Options: nosniff`, `Cache-Control: public, max-age=600, stale-while-revalidate=86400`, `ETag: "<first 32 hex of sha256(body)>"`; `If-None-Match` equal to it gives 304 with the same ETag and cache headers. KV read `get(STATS_KEY, { cacheTtl: 300 })`; a KV error gives 204.

- [ ] Steps 1 to 5 as above; commit `feat(stats): GET /api/stats Function`.

### Task 6: Worker rollup math (pure)

**Files:**
- Create: `workers/stats/src/types.ts`, `workers/stats/src/rollup.ts`
- Test: `tests/stats/rollup.test.ts`

**Interfaces:**
- Produces:
```ts
export interface DayRollup {
  date: string; visits: number; pageViews: number; countries: string[];
  floors: Partial<Record<StatsFloor, number>>; mode: { threeD: number; classic: number; frozen?: true };
  asks: { total: number; topics: Partial<Record<StatsTopic, number>>; chips: Record<string, number> };
}
export interface Ledger { v: 1; days: DayRollup[] }
export interface WaRows { days: { date: string; count: number; visits: number }[]; countries: { date: string; country: string; count: number; visits: number }[]; paths: { date: string; path: string; count: number }[] }
export interface AeRows { asks: { day: string; topic: string; chip: string; n: number }[]; visits: { day: string; mode: string; n: number }[] }
export function dayRange(from: string, to: string): string[];
export function buildRollups(dates: string[], wa: WaRows, ae: AeRows, chipTopics: ReadonlyMap<string, StatsTopic>): DayRollup[];
export function trimLeadingEmpty(days: DayRollup[]): DayRollup[];
export function buildSnapshot(days: DayRollup[], lastDay: string, chipTopics: ReadonlyMap<string, StatsTopic>): StatsSnapshotV1 | null;
export const MODE_FREEZE = { factor: 3, floor: 30 };
```
Rules: counts are non-negative integers (`Math.round`, negatives and NaN to 0); countries pass `isCountryCode`, presence when `count > 0 || visits > 0`, sorted alphabetically; floors sum page views by `floorOfPath`; mode `3d` adds to threeD, `classic` to classic, `both` to both; a day whose beacon total exceeds `max(MODE_FREEZE.floor, MODE_FREEZE.factor * pageViews)` keeps zeros and `frozen: true` (abuse cross-check); asks: unknown topics count only in `total`, chips only when known (`chipTopics`). Snapshot: `d30` sums the days in `(lastDay - 30 days, lastDay]`, `all` every day; `topFloor` is the floor with the most page views (ties in `STATS_FLOORS` order, none gives null); `chips` sorted by n desc then id; `since` is the first ledger day; `updatedAt` is `lastDay + 1` at `00:00:00.000Z`; returns null for an empty ledger; the result passes `parseStatsSnapshot`.

- [ ] Steps 1 to 5 (tests: sampling-adjusted inputs in steps of 10, a 31-day window, path mapping, freeze, unknown chip and topic, alphabetical countries, XX and T1 dropped, empty input); commit `feat(stats): daily rollup and snapshot math`.

### Task 7: Worker sources, run and entry

**Files:**
- Create: `workers/stats/src/sources.ts`, `workers/stats/src/run.ts`, `workers/stats/src/index.ts`, `workers/stats/wrangler.toml`, `workers/stats/README.md`
- Test: `tests/stats/worker-run.test.ts`

**Interfaces:**
- Produces: `fetchWebAnalytics(cfg, start, end, fetcher): Promise<WaRows>` (one aliased GraphQL request; `limit: 10000`; throws on `errors[]`, non-200, or a group at the limit); `fetchAnalyticsEngine(cfg, start, end, fetcher): Promise<AeRows>` (two SQL requests, `FORMAT JSONEachRow`, fixed SQL built only from validated dates); `runStats(env: StatsWorkerEnv, now: number, fetcher?): Promise<RunResult>`; `RunResult { added: string[]; days: number; snapshot: boolean }`.
- Env: `STATS_KV`, `WA_TOKEN` (secret), `WA_ACCOUNT_ID` (secret), `WA_SITE_TAG`, `WA_HOSTS` (comma list).

Run: last complete day = yesterday (UTC) of `now`; read ledger `stats:days:v1`; first missing day = ledger's last day + 1, or (empty ledger) `today - 183 days` (inside `notOlderThan`); nothing missing: return. Fetch Web Analytics in windows of at most 90 days, Analytics Engine once for the whole range; build rollups; on an empty ledger trim leading empty days; append; snapshot; validate with `parseStatsSnapshot` (throw when invalid, writing nothing); write the ledger first, then `stats:v1`. Subrequests per backfill: at most 2 GraphQL, 2 SQL, 1 get, 2 puts. Logs only counts and dates.

wrangler.toml: `name = "hq-stats"`, `main = "src/index.ts"`, `compatibility_date = "2026-10-01"`, `workers_dev = false`, `preview_urls = false`, `[triggers] crons = ["0 1 * * *"]`, `[[kv_namespaces]] binding = "STATS_KV" id = "88fb27f910f44e6393b8fd495d6a2c4f"`, `[vars] WA_SITE_TAG = "4134db56168b4eb58d19fc1ead78b131"`, `WA_HOSTS = "kurniadi.pages.dev,kurniadi.dev"`.

- [ ] **Step 1: Failing test** with a fake fetcher (asserts the GraphQL body has the siteTag, `bot: 0` and the hosts; SQL bodies exclude `rejected`; the Authorization header is used but never appears in logs or the KV values) and an in-memory KV: backfill on empty KV, a second run the same day adds nothing, a next-day run adds one day and never rewrites earlier ones (existing ledger day kept byte for byte even if the source now returns other numbers), a GraphQL `errors[]` response writes nothing.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4: Run** (PASS); `cd workers/stats && bunx wrangler@4 deploy --dry-run --outdir /tmp/hq-stats-dry` bundles.
- [ ] **Step 5: Commit** `feat(stats): hq-stats cron Worker`.

### Task 8: Client visit beacon and the opt-out aware Web Analytics beacon

**Files:**
- Create: `src/lib/stats/visitClient.ts`, `src/components/VisitBeacon.tsx`
- Modify: `src/components/Analytics.tsx`, `src/app/[locale]/layout.tsx` (mount `<VisitBeacon />` next to `<Analytics />`), `tests/unit/seo.test.ts`
- Test: `tests/stats/visit-client.test.ts`, `tests/stats/analytics-guard.test.ts`, `e2e/visit.spec.ts`, `scripts/e2e-plan.ts` rule

**Interfaces:**
- Produces: `visitAllowed({ privacySignal, webdriver, search, optedOut }): boolean` (DNT and GPC and opt-out always win, `?visit=1` forces under automation, `?visit=0` off, automation off); `visitMode({ threeD, classic }): VisitMode | null`; `startVisitBeacon(win = window): () => void` watches `html` attributes (`data-hq` set: 3D seen; neither `data-hq` nor `data-hq-boot` and the page visible: Classic seen), sends one `navigator.sendBeacon("/api/visit", JSON)` on the first `visibilitychange` to hidden or `pagehide`, re-checks the opt-out at send time, stops on the `hq:stats-optout` event when opted out; one point per page lifetime (module flag, no storage).
- Analytics: renders `<script id="hq-cf-beacon">` whose inline code returns when `localStorage["hq:stats-optout"] === "1"`, else appends `script[defer][src=https://static.cloudflareinsights.com/beacon.min.js][data-cf-beacon={token, spa: true}]` to `document.body`. Token stays alphanumeric (`resolveBeaconToken`), so no escaping issue.

- [ ] Steps 1 to 5; e2e (`?visit=1`): Classic page hidden sends `{"v":1,"mode":"classic"}`; 3D (`?tier=lite&visit=1`) sends `3d`; opt-out set sends nothing; DNT sends nothing. Commit `feat(stats): first-party visit beacon and opt-out aware Web Analytics beacon`.

### Task 9: CI and deploy

**Files:**
- Create: `scripts/stats-token-check.ts`, `scripts/stats-dry-run.ts`, `.github/workflows/stats-worker.yml`
- Modify: `.github/workflows/deploy.yml` (job `stats-worker` after `deploy`), `scripts/deploy-smoke.ts` (`/api/stats` 200 valid or 204; `/api/visit` GET 405), `tests/unit/deploy-smoke.test.ts`
- Test: `tests/stats/token-check.test.ts` (pure result interpretation, message never contains the token)

`stats-token-check.ts analytics`: POSTs the settings probe with `STATS_ANALYTICS_TOKEN`, passes when `settings.rumPageloadEventsAdaptiveGroups[0].enabled` is true, else prints `::error::CF_EVAL_TOKEN cannot read Web Analytics (rumPageloadEventsAdaptiveGroups). Give it Account > Account Analytics > Read on this account.` and exits 1. `deploy`: read-only probes with `CLOUDFLARE_API_TOKEN` (`GET /accounts/{id}/workers/scripts`, `GET /accounts/{id}/storage/kv/namespaces/{STATS_KV id}`), reporting which permission is missing. Deploy job: checkout, setup, probe, then `cloudflare/wrangler-action@953926a2e2182532811c01a25e53647d93bf07c0` (v4.1.3) with `workingDirectory: workers/stats`, `secrets: WA_TOKEN WA_ACCOUNT_ID` from `CF_EVAL_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

- [ ] Steps 1 to 5; commit `ci(stats): probe the analytics token and deploy hq-stats`.

### Task 10: Docs and privacy text

**Files:** `messages/en.json`, `messages/id.json` (`footer.privacy`), `docs/superpowers/specs/agent-hq/06-data-contracts.md` (section 4), `AGENTS.md`, `README.md`, `docs/deploy.md`.

Footer EN: "Privacy: no cookies and no tracking IDs. Visits are counted anonymously with Cloudflare (country, pages, 3D or Classic view, and the topic of questions to the AI) to show public totals, and a sample of 3D visits sends performance ranges. Your IP address and browser details are never stored. Do Not Track, Global Privacy Control or \"Don't count my visits\" turn counting off." ID equivalent with "kunjungan" and "Jangan hitung kunjungan saya".

- [ ] Commit `docs(stats): data contract, runbook and privacy note`.

### Task 11: Verification, backfill and PR

- [ ] `bun run verify:quick`; `E2E_PORT=4448 bun run e2e:changed`.
- [ ] `WA_TOKEN=... bun scripts/stats-dry-run.ts` with the owner's Wrangler OAuth token (from `wrangler auth token`, held in a shell variable, never printed) and record the snapshot.
- [ ] Security review of the diff; open the PR; get "Typecheck, lint, unit tests", "Build, CV and e2e", "Lighthouse CI", "3D perf gates" green.
