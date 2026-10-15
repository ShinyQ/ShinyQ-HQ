# Uptime and Error Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An hourly GitHub Actions check of production that opens, updates and closes one `uptime` issue.

**Architecture:** `scripts/uptime.ts` holds pure check evaluators (one per check), a retry runner with injected `fetch` and `sleep`, a pure issue decision (`issueAction`) and a thin GitHub REST client (fetch plus the job token, no dependencies). `.github/workflows/uptime.yml` only checks out, installs Bun (no `bun install`: the script imports only dependency-free modules) and runs the script. Vitest covers every check, the retry, the issue decisions, the REST calls and the workflow file.

**Tech Stack:** Bun 1.4 (runs the TypeScript script), Vitest, GitHub Actions, GitHub REST API.

## Global Constraints

- Round 7 design section 6 (binding): hourly cron (owner decision: "dont every 15 min i want it every hour") plus `workflow_dispatch`; checks `/` and `/en` return 200 and contain og tags, `/api/ask` status `GET` answers (no model call, no quota), `/api/stats` returns fresh JSON (updated within its expected window), the latest `deploy.yml` run on main succeeded; a failing check is retried once after 60 s; then open or update one issue labelled `uptime` with the failing checks, and close it with a recovery comment when all pass.
- Permissions: `issues: write`, `contents: read`, `actions: read`; no secrets.
- Pin every action by full commit SHA with a `# vX.Y.Z` comment (security S4, `tests/unit/workflows.test.ts`); checkout with `persist-credentials: false`.
- `force_fail` dispatch input proves the issue path (coordinator dispatches it once after merge).
- No em dashes (U+2014) anywhere (a unit test scans the repo). Docs: `docs/deploy.md` (new section 16), `docs/features.md` (CI list), AGENTS.md (folder layout and CI bullets), README nightly line.
- CI capacity is shared: check `gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued` before every push; one CI run at a time. Do not merge.

## Design decisions (locked)

- **Stats window:** fresh when `now - updatedAt <= 48 h` (`STATS_MAX_AGE_MS`), the same threshold as the site's "delayed" note (`DELAYED_AFTER_MS` in `src/lib/visits/model.ts`; a unit test keeps them equal). The Worker runs daily at 01:00 UTC and `updatedAt` is midnight of the run day, so a healthy snapshot is at most about 25 h old; a single missed run is not tolerated: the 00:17 UTC check two days later sees a snapshot just over 48 h old and fails until the Worker's 01:00 UTC catch-up run (about an hour, two emails, by design: the site shows "delayed" then too). 204 (no snapshot) fails.
- **Ask:** 200 with `enabled: true` passes. 503 with a JSON body `enabled: false` passes (note "switched off (kill switch in wrangler.toml)") only when the committed `wrangler.toml` does not set `ASK_ENABLED = "true"` (`askExpectedEnabled`), because production's `enabled()` is also false for a missing AI binding or Turnstile secret; while the file says "true", a disabled Ask fails. Anything else fails.
- **Pages:** fetched with `redirect: "manual"` (the URL itself must answer 200) and a cache-busting query; `og:title`, `og:image` and `og:url` must exist (`parseSocialMeta` from `scripts/og-meta.ts`).
- **Deploy:** the newest completed `deploy.yml` run on `main` whose conclusion is not `cancelled`, `skipped`, `neutral` or `stale` (same "no result" set as `scripts/ci-status.ts`) must be `success`.
- **Retry:** run all checks; if any fail, wait 60 s and rerun only those; a check fails when both attempts fail. The forced check is never retried.
- **Issue:** title `Uptime: production checks failing`, label `uptime` (created if missing, color `B60205`). Body carries a marker `<!-- uptime:failing=ask,stats -->`. While open, each failing run rewrites the body (no email); it adds a comment only when the failing set changes (email). Recovery: comment, then close with `state_reason: completed`.
- **Exit code:** 0 whenever the issue handling succeeded (failing checks are reported through the issue, not hourly red runs, which would also email hourly); 1 only when the script itself fails (GitHub API errors), so a broken alerter is visible.
- **Schedule:** `17 * * * *` (minute 17 avoids the top-of-hour Actions queue).

## File structure

- Create `scripts/uptime.ts`: constants, check evaluators, observers, retry runner, issue decision, GitHub client, `main`.
- Create `tests/unit/uptime.test.ts`: evaluators, retry, issue decision, client calls, workflow file.
- Create `.github/workflows/uptime.yml`.
- Modify `docs/deploy.md` (section 16), `docs/features.md` (CI list), `AGENTS.md`, `README.md` (one line).

---

### Task 1: Check evaluators and the retry runner

**Files:**
- Create: `scripts/uptime.ts`
- Test: `tests/unit/uptime.test.ts`

**Interfaces:**
- Produces:
  - `type CheckId = "home" | "en" | "ask" | "stats" | "deploy" | "forced"`
  - `interface CheckResult { id: CheckId; ok: boolean; detail: string }`
  - `CHECK_LABELS: Record<CheckId, string>`
  - `pageCheck(id: "home" | "en", obs: PageObs): CheckResult`, `askCheck(obs: JsonObs): CheckResult`, `statsCheck(obs: JsonObs, now: number): CheckResult`, `deployCheck(obs: RunsObs): CheckResult`
  - `interface UptimeDeps { fetch: typeof fetch; site: string; repo: string; token?: string; now: () => number }`
  - `runChecks(deps: UptimeDeps, ids?: readonly CheckId[]): Promise<CheckResult[]>`
  - `checkWithRetry(deps: UptimeDeps, opts: { forceFail: boolean; sleep: (ms: number) => Promise<void> }): Promise<CheckResult[]>`
  - constants `RETRY_DELAY_MS = 60_000`, `STATS_MAX_AGE_MS = 48 * 3_600_000`, `REQUIRED_OG`, `PAGE_PATHS`

- [ ] **Step 1: Write the failing tests** in `tests/unit/uptime.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import { DELAYED_AFTER_MS } from "@/lib/visits/model";
import { STATS_FIXTURE } from "@/lib/stats/fixtures";
import { askCheck, checkWithRetry, deployCheck, pageCheck, runChecks, statsCheck, STATS_MAX_AGE_MS, RETRY_DELAY_MS, type UptimeDeps } from "../../scripts/uptime";

const OG = '<html><head><link rel="canonical" href="https://x/en"><meta property="og:title" content="T"><meta property="og:image" content="https://x/og.jpg"><meta property="og:url" content="https://x/en"></head></html>';
const NOW = Date.parse("2026-10-15T10:00:00Z");

describe("pageCheck", () => {
  it("passes on 200 with og:title, og:image and og:url", () => expect(pageCheck("en", { code: 200, html: OG }).ok).toBe(true));
  it("fails on a non-200", () => expect(pageCheck("home", { code: 500, html: OG })).toMatchObject({ ok: false, detail: expect.stringContaining("HTTP 500") }));
  it("names missing og tags", () => expect(pageCheck("en", { code: 200, html: "<html></html>" }).detail).toContain("og:title"));
  it("fails on a network error", () => expect(pageCheck("en", { error: "timeout" })).toMatchObject({ ok: false, detail: expect.stringContaining("timeout") }));
});

describe("askCheck", () => {
  it("passes when enabled", () => expect(askCheck({ code: 200, body: { enabled: true, asOf: "2026-10-15" } })).toMatchObject({ ok: true, detail: expect.stringContaining("2026-10-15") }));
  it("passes with a note when the kill switch is off", () => expect(askCheck({ code: 503, body: { enabled: false } })).toMatchObject({ ok: true, detail: expect.stringContaining("kill switch") }));
  it("fails on a 503 without the status body", () => expect(askCheck({ code: 503 }).ok).toBe(false));
  it("fails on a 404", () => expect(askCheck({ code: 404 }).ok).toBe(false));
});

describe("statsCheck", () => {
  const fresh = { ...STATS_FIXTURE, updatedAt: "2026-10-15T00:00:00.000Z" };
  it("uses the site's delayed threshold", () => expect(STATS_MAX_AGE_MS).toBe(DELAYED_AFTER_MS));
  it("passes a fresh snapshot", () => expect(statsCheck({ code: 200, body: fresh }, NOW).ok).toBe(true));
  it("fails a stale snapshot", () => expect(statsCheck({ code: 200, body: { ...fresh, updatedAt: "2026-10-12T00:00:00.000Z" } }, NOW)).toMatchObject({ ok: false, detail: expect.stringContaining("old") }));
  it("fails on 204", () => expect(statsCheck({ code: 204 }, NOW).ok).toBe(false));
  it("fails on an invalid body", () => expect(statsCheck({ code: 200, body: { v: 9 } }, NOW).ok).toBe(false));
});

describe("deployCheck", () => {
  const run = (conclusion: string, url = "u") => ({ status: "completed", conclusion, html_url: url, created_at: "2026-10-15T09:00:00Z" });
  it("passes when the newest result is success", () => expect(deployCheck({ runs: [run("success")] }).ok).toBe(true));
  it("skips cancelled and skipped runs", () => expect(deployCheck({ runs: [run("cancelled"), run("skipped"), run("success")] }).ok).toBe(true));
  it("fails on a failed deploy and links it", () => expect(deployCheck({ runs: [run("failure", "https://run/1"), run("success")] })).toMatchObject({ ok: false, detail: expect.stringContaining("https://run/1") }));
  it("fails with no runs", () => expect(deployCheck({ runs: [] }).ok).toBe(false));
  it("fails when the API errors", () => expect(deployCheck({ error: "HTTP 403" }).ok).toBe(false));
});

function fakeFetch(routes: Record<string, () => Response>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`unexpected ${url}`);
    return routes[key]();
  }) as unknown as typeof fetch;
}
const healthy = () => ({
  "pages.dev/?": () => new Response(OG, { status: 200 }),
  "pages.dev/en?": () => new Response(OG, { status: 200 }),
  "/api/ask": () => Response.json({ enabled: true, asOf: "2026-10-15" }),
  "/api/stats": () => Response.json({ ...STATS_FIXTURE, updatedAt: "2026-10-15T00:00:00.000Z" }),
  "deploy.yml/runs": () => Response.json({ workflow_runs: [{ status: "completed", conclusion: "success", html_url: "u", created_at: "x" }] }),
});
const deps = (fetch: typeof fetch): UptimeDeps => ({ fetch, site: "https://kurniadi.pages.dev", repo: "o/r", token: "t", now: () => NOW });

describe("runChecks and checkWithRetry", () => {
  it("runs every check against production", async () => {
    const results = await runChecks(deps(fakeFetch(healthy())));
    expect(results.map((r) => [r.id, r.ok])).toEqual([["home", true], ["en", true], ["ask", true], ["stats", true], ["deploy", true]]);
  });

  it("retries only failing checks once after 60 s and keeps a recovered check green", async () => {
    let askCalls = 0;
    const routes = { ...healthy(), "/api/ask": () => (++askCalls === 1 ? new Response("down", { status: 502 }) : Response.json({ enabled: true, asOf: "d" })) };
    const sleep = vi.fn(async () => {});
    const results = await checkWithRetry(deps(fakeFetch(routes)), { forceFail: false, sleep });
    expect(sleep).toHaveBeenCalledWith(RETRY_DELAY_MS);
    expect(askCalls).toBe(2);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("does not wait when everything passes", async () => {
    const sleep = vi.fn(async () => {});
    await checkWithRetry(deps(fakeFetch(healthy())), { forceFail: false, sleep });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("adds the forced failure without retrying it", async () => {
    const sleep = vi.fn(async () => {});
    const results = await checkWithRetry(deps(fakeFetch(healthy())), { forceFail: true, sleep });
    expect(sleep).not.toHaveBeenCalled();
    expect(results.filter((r) => !r.ok).map((r) => r.id)).toEqual(["forced"]);
  });

  it("turns a thrown fetch into a failed check", async () => {
    const routes = { ...healthy(), "/api/stats": () => { throw new Error("ECONNRESET"); } };
    const results = await checkWithRetry(deps(fakeFetch(routes)), { forceFail: false, sleep: async () => {} });
    expect(results.find((r) => r.id === "stats")).toMatchObject({ ok: false, detail: expect.stringContaining("ECONNRESET") });
  });
});
```

(Check `@/lib/stats/fixtures` exports a valid snapshot constant; use its real name if it differs from `STATS_FIXTURE`.)

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run tests/unit/uptime.test.ts`
Expected: FAIL, cannot resolve `../../scripts/uptime`.

- [ ] **Step 3: Implement** the check half of `scripts/uptime.ts`

```ts
/**
 * Hourly production uptime check (.github/workflows/uptime.yml, Round 7 E; owner decision: every hour).
 *
 *   bun scripts/uptime.ts [--site https://kurniadi.pages.dev] [--repo owner/name] [--force-fail] [--dry]
 *
 * Checks / and /en (200 with og tags), GET /api/ask (status only: no model call, no AI quota),
 * GET /api/stats (a valid snapshot at most 48 h old) and the newest deploy.yml result on main. A failing
 * check is retried once after 60 s. Then one issue labelled `uptime` is opened or updated, and closed
 * with a recovery comment once every check passes (GitHub emails the owner). Uses fetch and GH_TOKEN
 * only (issues: write, actions: read); no dependencies, so the workflow skips `bun install`.
 */
import { appendFileSync } from "node:fs";
import { parseStatsSnapshot } from "../src/lib/stats/protocol";
import { parseSocialMeta } from "./og-meta";

export type CheckId = "home" | "en" | "ask" | "stats" | "deploy" | "forced";
export interface CheckResult {
  id: CheckId;
  ok: boolean;
  detail: string;
}

export const CHECK_LABELS: Record<CheckId, string> = {
  home: "Page /",
  en: "Page /en",
  ask: "GET /api/ask status",
  stats: "GET /api/stats freshness",
  deploy: "Latest deploy.yml run on main",
  forced: "Forced failure (force_fail input)",
};

export const PAGE_PATHS = { home: "/", en: "/en" } as const;
export const REQUIRED_OG = ["og:title", "og:image", "og:url"] as const;
export const RETRY_DELAY_MS = 60_000;
/** Same threshold as the site's "delayed" note (DELAYED_AFTER_MS in src/lib/visits/model.ts). */
export const STATS_MAX_AGE_MS = 48 * 3_600_000;
export const DEPLOY_WORKFLOW = "deploy.yml";
const FETCH_TIMEOUT_MS = 20_000;
/** Cancelled or skipped deploys say nothing about production (as in scripts/ci-status.ts). */
const NO_RESULT = new Set(["cancelled", "skipped", "neutral", "stale"]);

export type PageObs = { code: number; html: string } | { error: string };
export type JsonObs = { code: number; body?: unknown } | { error: string };
export interface DeployRun {
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
}
export type RunsObs = { runs: readonly DeployRun[] } | { error: string };

const result = (id: CheckId, ok: boolean, detail: string): CheckResult => ({ id, ok, detail });

export function pageCheck(id: "home" | "en", obs: PageObs): CheckResult {
  if ("error" in obs) return result(id, false, `no response (${obs.error})`);
  if (obs.code !== 200) return result(id, false, `HTTP ${obs.code}, expected 200`);
  const og = parseSocialMeta(obs.html).og;
  const missing = REQUIRED_OG.filter((tag) => !og[tag]);
  return missing.length ? result(id, false, `HTTP 200 but missing ${missing.join(", ")}`) : result(id, true, "HTTP 200 with og tags");
}

export function askCheck(obs: JsonObs): CheckResult {
  if ("error" in obs) return result("ask", false, `no response (${obs.error})`);
  const body = (obs.body ?? {}) as { enabled?: unknown; asOf?: unknown };
  if (obs.code === 200 && body.enabled === true) return result("ask", true, `enabled, knowledge pack ${String(body.asOf ?? "unknown")}`);
  if (obs.code === 503 && body.enabled === false) return result("ask", true, "answered, switched off (kill switch)");
  return result("ask", false, `HTTP ${obs.code} without a status body`);
}

export function statsCheck(obs: JsonObs, now: number): CheckResult {
  if ("error" in obs) return result("stats", false, `no response (${obs.error})`);
  if (obs.code === 204) return result("stats", false, "HTTP 204: no snapshot (the hq-stats Worker has not written one)");
  if (obs.code !== 200) return result("stats", false, `HTTP ${obs.code}, expected 200`);
  const snapshot = parseStatsSnapshot(obs.body);
  if (!snapshot) return result("stats", false, "HTTP 200 but the snapshot fails the contract");
  const ageMs = now - Date.parse(snapshot.updatedAt);
  if (!(ageMs <= STATS_MAX_AGE_MS)) return result("stats", false, `snapshot is ${Math.round(ageMs / 3_600_000)} h old (updatedAt ${snapshot.updatedAt}), limit 48 h`);
  return result("stats", true, `updatedAt ${snapshot.updatedAt}`);
}

export function deployCheck(obs: RunsObs): CheckResult {
  if ("error" in obs) return result("deploy", false, `could not read deploy runs (${obs.error})`);
  const latest = obs.runs.find((r) => r.status === "completed" && !NO_RESULT.has(r.conclusion ?? ""));
  if (!latest) return result("deploy", false, "no completed deploy.yml run on main");
  if (latest.conclusion !== "success") return result("deploy", false, `${latest.conclusion ?? "unknown"}: ${latest.html_url}`);
  return result("deploy", true, `success: ${latest.html_url}`);
}

export interface UptimeDeps {
  fetch: typeof fetch;
  site: string;
  repo: string;
  token?: string;
  now: () => number;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function readJson(r: Response): Promise<unknown> {
  if (!(r.headers.get("content-type") ?? "").includes("json")) return undefined;
  try {
    return await r.json();
  } catch {
    return undefined;
  }
}

async function observePage(deps: UptimeDeps, path: string): Promise<PageObs> {
  try {
    const r = await deps.fetch(`${deps.site}${path}?uptime=${deps.now()}`, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    return { code: r.status, html: await r.text() };
  } catch (error) {
    return { error: message(error) };
  }
}

async function observeJson(deps: UptimeDeps, path: string): Promise<JsonObs> {
  try {
    const r = await deps.fetch(`${deps.site}${path}`, { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    return { code: r.status, body: await readJson(r) };
  } catch (error) {
    return { error: message(error) };
  }
}

async function observeDeploys(deps: UptimeDeps): Promise<RunsObs> {
  try {
    const headers: Record<string, string> = { accept: "application/vnd.github+json" };
    if (deps.token) headers.authorization = `Bearer ${deps.token}`;
    const r = await deps.fetch(`https://api.github.com/repos/${deps.repo}/actions/workflows/${DEPLOY_WORKFLOW}/runs?branch=main&status=completed&per_page=10`, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    return { runs: ((await r.json()) as { workflow_runs?: DeployRun[] }).workflow_runs ?? [] };
  } catch (error) {
    return { error: message(error) };
  }
}

const CHECKS: Record<Exclude<CheckId, "forced">, (deps: UptimeDeps) => Promise<CheckResult>> = {
  home: async (deps) => pageCheck("home", await observePage(deps, PAGE_PATHS.home)),
  en: async (deps) => pageCheck("en", await observePage(deps, PAGE_PATHS.en)),
  ask: async (deps) => askCheck(await observeJson(deps, "/api/ask")),
  stats: async (deps) => statsCheck(await observeJson(deps, "/api/stats"), deps.now()),
  deploy: async (deps) => deployCheck(await observeDeploys(deps)),
};
const ALL = Object.keys(CHECKS) as Exclude<CheckId, "forced">[];

export async function runChecks(deps: UptimeDeps, ids: readonly CheckId[] = ALL): Promise<CheckResult[]> {
  const run = ALL.filter((id) => ids.includes(id));
  return Promise.all(run.map((id) => CHECKS[id](deps).catch((error) => result(id, false, `check crashed (${message(error)})`))));
}

export async function checkWithRetry(deps: UptimeDeps, opts: { forceFail: boolean; sleep: (ms: number) => Promise<void> }): Promise<CheckResult[]> {
  let results = await runChecks(deps);
  const failing = results.filter((r) => !r.ok).map((r) => r.id);
  if (failing.length) {
    await opts.sleep(RETRY_DELAY_MS);
    const retried = new Map((await runChecks(deps, failing)).map((r) => [r.id, r]));
    results = results.map((r) => retried.get(r.id) ?? r);
  }
  if (opts.forceFail) results.push(result("forced", false, "forced failure from the workflow_dispatch input force_fail"));
  return results;
}
```

Note: the fake fetch in the test keys `pages.dev/?` and `pages.dev/en?`; the page URL is `${site}${path}?uptime=...`, so `/` becomes `https://kurniadi.pages.dev/?uptime=...` and `/en` becomes `.../en?uptime=...`. `/api/ask` must not match `pages.dev/?`: it does not (no `?` directly after `pages.dev/`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/unit/uptime.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add scripts/uptime.ts tests/unit/uptime.test.ts
rtk git commit -m "feat(uptime): production checks with one retry"
```

### Task 2: Issue decision and the GitHub client

**Files:**
- Modify: `scripts/uptime.ts` (append)
- Modify: `tests/unit/uptime.test.ts` (append)

**Interfaces:**
- Consumes: `CheckResult`, `CheckId`, `CHECK_LABELS` from Task 1.
- Produces:
  - `UPTIME_LABEL = "uptime"`, `ISSUE_TITLE = "Uptime: production checks failing"`
  - `interface OpenIssue { number: number; body: string }`
  - `type IssueAction = { kind: "none" } | { kind: "open"; title: string; body: string } | { kind: "update"; number: number; body: string; comment?: string } | { kind: "close"; number: number; comment: string }`
  - `interface IssueContext { site: string; runUrl: string; checkedAt: string }`
  - `failingFromBody(body: string): CheckId[] | null`
  - `issueBody(results: readonly CheckResult[], ctx: IssueContext): string`
  - `issueAction(results: readonly CheckResult[], open: OpenIssue | null, ctx: IssueContext): IssueAction`
  - `type GitHubCall = (method: string, path: string, body?: unknown) => Promise<{ status: number; data: unknown }>`
  - `githubClient(fetchImpl: typeof fetch, token: string): GitHubCall`
  - `findOpenIssue(gh: GitHubCall, repo: string): Promise<OpenIssue | null>`
  - `applyIssueAction(gh: GitHubCall, repo: string, action: IssueAction): Promise<string>` (returns a one-line description for the summary)

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/uptime.test.ts`; add the new names to the import)

```ts
describe("issueAction", () => {
  const ctx = { site: "https://kurniadi.pages.dev", runUrl: "https://github.com/o/r/actions/runs/1", checkedAt: "2026-10-15T10:17:00Z" };
  const ok = (id: CheckId) => ({ id, ok: true, detail: "fine" });
  const bad = (id: CheckId, detail = "HTTP 502 | gateway") => ({ id, ok: false, detail });

  it("does nothing when all pass and no issue is open", () => expect(issueAction([ok("home"), ok("ask")], null, ctx)).toEqual({ kind: "none" }));

  it("opens one labelled issue listing only the failing checks", () => {
    const action = issueAction([ok("home"), bad("ask"), bad("stats", "stale")], null, ctx);
    expect(action).toMatchObject({ kind: "open", title: ISSUE_TITLE });
    const body = (action as { body: string }).body;
    expect(body).toContain("<!-- uptime:failing=ask,stats -->");
    expect(body).toContain("GET /api/ask status");
    expect(body).not.toContain("Page /");
    expect(body).toContain("HTTP 502 \\| gateway");
    expect(body).toContain(ctx.runUrl);
    expect(body).not.toMatch(/\u2014/);
  });

  it("updates the body silently while the same checks keep failing", () => {
    const open = { number: 7, body: "<!-- uptime:failing=ask -->\nold" };
    const action = issueAction([bad("ask")], open, ctx);
    expect(action).toMatchObject({ kind: "update", number: 7 });
    expect((action as { comment?: string }).comment).toBeUndefined();
  });

  it("comments when the failing set changes", () => {
    const open = { number: 7, body: "<!-- uptime:failing=ask -->" };
    const action = issueAction([bad("ask"), bad("deploy")], open, ctx) as { comment?: string };
    expect(action.comment).toContain("Latest deploy.yml run on main");
  });

  it("closes with a recovery comment when every check passes", () => {
    const action = issueAction([ok("home"), ok("en")], { number: 7, body: "" }, ctx);
    expect(action).toMatchObject({ kind: "close", number: 7, comment: expect.stringContaining("All production checks pass again") });
  });

  it("reads the failing set back from the marker", () => {
    expect(failingFromBody("x\n<!-- uptime:failing=ask,stats -->")).toEqual(["ask", "stats"]);
    expect(failingFromBody("no marker")).toBeNull();
  });
});

describe("applyIssueAction and findOpenIssue", () => {
  function fakeGh(responses: Record<string, { status: number; data: unknown }> = {}) {
    const calls: [string, string, unknown?][] = [];
    const gh: GitHubCall = async (method, path, body) => {
      calls.push(body === undefined ? [method, path] : [method, path, body]);
      return responses[`${method} ${path.split("?")[0]}`] ?? { status: 200, data: {} };
    };
    return { gh, calls };
  }

  it("finds the open uptime issue and ignores pull requests", async () => {
    const { gh, calls } = fakeGh({ "GET /repos/o/r/issues": { status: 200, data: [{ number: 3, body: "b", pull_request: {} }, { number: 5, body: "c" }] } });
    expect(await findOpenIssue(gh, "o/r")).toEqual({ number: 5, body: "c" });
    expect(calls[0][1]).toBe("/repos/o/r/issues?labels=uptime&state=open&per_page=20");
  });

  it("creates the label (an existing one is fine) and opens the issue", async () => {
    const { gh, calls } = fakeGh({ "POST /repos/o/r/labels": { status: 422, data: {} }, "POST /repos/o/r/issues": { status: 201, data: { html_url: "https://i/9" } } });
    await applyIssueAction(gh, "o/r", { kind: "open", title: ISSUE_TITLE, body: "B" });
    expect(calls.map((c) => `${c[0]} ${c[1]}`)).toEqual(["POST /repos/o/r/labels", "POST /repos/o/r/issues"]);
    expect(calls[1][2]).toEqual({ title: ISSUE_TITLE, body: "B", labels: ["uptime"] });
  });

  it("updates the body and comments only when asked", async () => {
    const { gh, calls } = fakeGh();
    await applyIssueAction(gh, "o/r", { kind: "update", number: 7, body: "B" });
    expect(calls).toEqual([["PATCH", "/repos/o/r/issues/7", { body: "B" }]]);
    const second = fakeGh();
    await applyIssueAction(second.gh, "o/r", { kind: "update", number: 7, body: "B", comment: "C" });
    expect(second.calls.map((c) => c[0])).toEqual(["PATCH", "POST"]);
  });

  it("comments, then closes as completed", async () => {
    const { gh, calls } = fakeGh();
    await applyIssueAction(gh, "o/r", { kind: "close", number: 7, comment: "R" });
    expect(calls).toEqual([
      ["POST", "/repos/o/r/issues/7/comments", { body: "R" }],
      ["PATCH", "/repos/o/r/issues/7", { state: "closed", state_reason: "completed" }],
    ]);
  });

  it("throws on a failed API call so the run turns red", async () => {
    const { gh } = fakeGh({ "POST /repos/o/r/issues": { status: 403, data: { message: "Resource not accessible" } } });
    await expect(applyIssueAction(gh, "o/r", { kind: "open", title: "t", body: "b" })).rejects.toThrow(/403/);
  });

  it("githubClient sends the token and JSON", async () => {
    const f = vi.fn(async () => Response.json({ ok: 1 }, { status: 201 })) as unknown as typeof fetch;
    const res = await githubClient(f, "tok")("POST", "/repos/o/r/issues", { a: 1 });
    expect(res).toEqual({ status: 201, data: { ok: 1 } });
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/o/r/issues");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(init.body).toBe('{"a":1}');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run tests/unit/uptime.test.ts`
Expected: FAIL, `issueAction` (and others) not exported.

- [ ] **Step 3: Implement** (append to `scripts/uptime.ts`)

```ts
export const UPTIME_LABEL = "uptime";
export const ISSUE_TITLE = "Uptime: production checks failing";
const LABEL_COLOR = "B60205";
const LABEL_DESCRIPTION = "Hourly production check failing (uptime.yml)";
const MARKER = /<!-- uptime:failing=([a-z,]*) -->/;

export interface OpenIssue {
  number: number;
  body: string;
}
export type IssueAction =
  | { kind: "none" }
  | { kind: "open"; title: string; body: string }
  | { kind: "update"; number: number; body: string; comment?: string }
  | { kind: "close"; number: number; comment: string };
export interface IssueContext {
  site: string;
  runUrl: string;
  checkedAt: string;
}

export function failingFromBody(body: string): CheckId[] | null {
  const m = MARKER.exec(body);
  return m ? (m[1].split(",").filter(Boolean) as CheckId[]) : null;
}

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function issueBody(results: readonly CheckResult[], ctx: IssueContext): string {
  const failing = results.filter((r) => !r.ok);
  return [
    `<!-- uptime:failing=${failing.map((r) => r.id).join(",")} -->`,
    `Production checks on ${ctx.site} failed after one retry (60 s apart).`,
    "",
    "| Check | Result |",
    "|---|---|",
    ...failing.map((r) => `| ${CHECK_LABELS[r.id]} | ${cell(r.detail)} |`),
    "",
    `Last checked ${ctx.checkedAt} ([run](${ctx.runUrl})). The hourly check updates this issue and closes it once every check passes. Runbook: docs/deploy.md section 16.`,
  ].join("\n");
}

export function issueAction(results: readonly CheckResult[], open: OpenIssue | null, ctx: IssueContext): IssueAction {
  const failing = results.filter((r) => !r.ok);
  if (failing.length === 0) {
    return open ? { kind: "close", number: open.number, comment: `All production checks pass again (${ctx.checkedAt}, [run](${ctx.runUrl})). Closing.` } : { kind: "none" };
  }
  const body = issueBody(results, ctx);
  if (!open) return { kind: "open", title: ISSUE_TITLE, body };
  const before = (failingFromBody(open.body) ?? []).slice().sort().join(",");
  const now = failing.map((r) => r.id).sort().join(",");
  if (before === now) return { kind: "update", number: open.number, body };
  const comment = `Failing checks changed (${ctx.checkedAt}, [run](${ctx.runUrl})): ${failing.map((r) => CHECK_LABELS[r.id]).join(", ")}.`;
  return { kind: "update", number: open.number, body, comment };
}

export type GitHubCall = (method: string, path: string, body?: unknown) => Promise<{ status: number; data: unknown }>;

export function githubClient(fetchImpl: typeof fetch, token: string): GitHubCall {
  return async (method, path, body) => {
    const r = await fetchImpl(`https://api.github.com${path}`, {
      method,
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "content-type": "application/json", "x-github-api-version": "2022-11-28" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const text = await r.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Keep the text.
    }
    return { status: r.status, data };
  };
}

async function must(gh: GitHubCall, method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await gh(method, path, body);
  if (res.status >= 300) throw new Error(`GitHub ${method} ${path} returned HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
  return res.data;
}

export async function findOpenIssue(gh: GitHubCall, repo: string): Promise<OpenIssue | null> {
  const data = (await must(gh, "GET", `/repos/${repo}/issues?labels=${UPTIME_LABEL}&state=open&per_page=20`)) as { number: number; body?: string | null; pull_request?: unknown }[];
  const issue = data.find((i) => !i.pull_request);
  return issue ? { number: issue.number, body: issue.body ?? "" } : null;
}

export async function applyIssueAction(gh: GitHubCall, repo: string, action: IssueAction): Promise<string> {
  switch (action.kind) {
    case "none":
      return "No open uptime issue; nothing to do.";
    case "open": {
      const label = await gh("POST", `/repos/${repo}/labels`, { name: UPTIME_LABEL, color: LABEL_COLOR, description: LABEL_DESCRIPTION });
      if (label.status >= 300 && label.status !== 422) throw new Error(`GitHub POST label returned HTTP ${label.status}`);
      const issue = (await must(gh, "POST", `/repos/${repo}/issues`, { title: action.title, body: action.body, labels: [UPTIME_LABEL] })) as { html_url?: string };
      return `Opened ${issue.html_url ?? "the uptime issue"}.`;
    }
    case "update":
      await must(gh, "PATCH", `/repos/${repo}/issues/${action.number}`, { body: action.body });
      if (action.comment) await must(gh, "POST", `/repos/${repo}/issues/${action.number}/comments`, { body: action.comment });
      return `Updated issue #${action.number}${action.comment ? " with a comment" : ""}.`;
    case "close":
      await must(gh, "POST", `/repos/${repo}/issues/${action.number}/comments`, { body: action.comment });
      await must(gh, "PATCH", `/repos/${repo}/issues/${action.number}`, { state: "closed", state_reason: "completed" });
      return `Closed issue #${action.number} (recovered).`;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/unit/uptime.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add scripts/uptime.ts tests/unit/uptime.test.ts
rtk git commit -m "feat(uptime): open, update and close one uptime issue"
```

### Task 3: CLI, workflow and docs

**Files:**
- Modify: `scripts/uptime.ts` (append `summary` and `main`)
- Create: `.github/workflows/uptime.yml`
- Modify: `tests/unit/uptime.test.ts` (append workflow and summary tests)
- Modify: `docs/deploy.md` (append section 16), `docs/features.md` (CI list near `content-gap.yml`), `AGENTS.md` (scripts list and CI bullet), `README.md` (nightly line)

**Interfaces:**
- Consumes: everything from Tasks 1 and 2.
- Produces: `summaryMarkdown(results: readonly CheckResult[], outcome: string): string`; the workflow `uptime.yml` with input `force_fail` and env `UPTIME_FORCE_FAIL`.

- [ ] **Step 1: Write the failing tests** (append)

```ts
// Move this import to the top of the file:
import { readFileSync } from "node:fs";

describe("summaryMarkdown", () => {
  it("lists every check with its state and the issue outcome", () => {
    const md = summaryMarkdown([{ id: "home", ok: true, detail: "HTTP 200 with og tags" }, { id: "ask", ok: false, detail: "HTTP 502" }], "Opened https://i/9.");
    expect(md).toContain("| Page / | pass | HTTP 200 with og tags |");
    expect(md).toContain("| GET /api/ask status | FAIL | HTTP 502 |");
    expect(md).toContain("Opened https://i/9.");
  });
});

describe("uptime.yml", () => {
  const yml = readFileSync(".github/workflows/uptime.yml", "utf8");
  it("runs hourly (owner decision) and on dispatch with force_fail", () => {
    expect(yml).toMatch(/cron: "17 \* \* \* \*"/);
    expect(yml).toMatch(/workflow_dispatch:\s*\n\s*inputs:\s*\n\s*force_fail:/);
    expect(yml).toContain("UPTIME_FORCE_FAIL: ${{ inputs.force_fail && 'true' || 'false' }}");
  });
  it("uses only issues write, contents read and actions read, and no secrets", () => {
    const job = yml.slice(yml.indexOf("jobs:"));
    expect(job).toMatch(/permissions:\s*\n\s*actions: read\s*\n\s*contents: read\s*\n\s*issues: write/);
    expect(yml).not.toMatch(/secrets\./);
  });
  it("runs the script without installing dependencies", () => {
    expect(yml).toContain("run: bun scripts/uptime.ts");
    expect(yml).not.toContain("bun install");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run tests/unit/uptime.test.ts`
Expected: FAIL (`summaryMarkdown` missing, workflow file missing).

- [ ] **Step 3: Implement `summaryMarkdown` and `main`** (append to `scripts/uptime.ts`)

```ts
export function summaryMarkdown(results: readonly CheckResult[], outcome: string): string {
  return ["## Uptime", "", "| Check | State | Detail |", "|---|---|---|", ...results.map((r) => `| ${CHECK_LABELS[r.id]} | ${r.ok ? "pass" : "FAIL"} | ${cell(r.detail)} |`), "", outcome, ""].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const site = (flag("--site") ?? process.env.SITE_URL ?? "https://kurniadi.pages.dev").replace(/\/+$/, "");
  const repo = flag("--repo") ?? process.env.GITHUB_REPOSITORY ?? "ShinyQ/ShinyQ-HQ";
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const forceFail = args.includes("--force-fail") || process.env.UPTIME_FORCE_FAIL === "true";
  const dry = args.includes("--dry") || !token;
  const deps: UptimeDeps = { fetch, site, repo, token, now: Date.now };
  const results = await checkWithRetry(deps, { forceFail, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
  const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const runUrl = process.env.GITHUB_RUN_ID ? `${server}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}` : `${server}/${repo}/actions/workflows/uptime.yml`;
  const ctx: IssueContext = { site, runUrl, checkedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z") };
  for (const r of results) console.log(`${r.ok ? "pass" : "FAIL"}  ${CHECK_LABELS[r.id]}: ${r.detail}`);
  let outcome: string;
  if (dry) {
    outcome = `Dry run (${token ? "--dry" : "no GH_TOKEN"}): issue left alone.`;
  } else {
    const gh = githubClient(fetch, token!);
    outcome = await applyIssueAction(gh, repo, issueAction(results, await findOpenIssue(gh, repo), ctx));
  }
  console.log(outcome);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown(results, outcome));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Create `.github/workflows/uptime.yml`**

```yaml
name: Uptime

# Hourly production check (Round 7 E; owner decision: every hour, not every 15 minutes).
# scripts/uptime.ts checks / and /en (200 with og tags), GET /api/ask status (no model call, no AI
# quota), GET /api/stats (a snapshot at most 48 h old) and the newest deploy.yml result on main.
# A failing check is retried once after 60 s; then one issue labelled `uptime` is opened or updated,
# and closed with a recovery comment once every check passes (GitHub emails the owner on both).
# No secrets: the job token reads Actions runs and writes issues. Runbook: docs/deploy.md section 16.

on:
  schedule:
    # Minute 17 of every hour (avoids the top-of-hour queue).
    - cron: "17 * * * *"
  workflow_dispatch:
    inputs:
      force_fail:
        description: Add a forced failing check to prove the issue path (the next green run closes the issue)
        type: boolean
        default: false

concurrency:
  group: uptime
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  check:
    name: Uptime check
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      actions: read
      contents: read
      issues: write
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      # No bun install: scripts/uptime.ts imports only dependency-free modules.
      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
        with:
          bun-version-file: package.json
      - name: Check production
        env:
          GH_TOKEN: ${{ github.token }}
          SITE_URL: ${{ vars.SITE_URL || 'https://kurniadi.pages.dev' }}
          UPTIME_FORCE_FAIL: ${{ inputs.force_fail && 'true' || 'false' }}
        run: bun scripts/uptime.ts
```

- [ ] **Step 5: Run tests and a live dry run**

Run: `bunx vitest run tests/unit/uptime.test.ts tests/unit/workflows.test.ts`
Expected: PASS.
Run: `bun scripts/uptime.ts --dry`
Expected: five `pass` lines against production and "Dry run (--dry): issue left alone."
Run: `bun scripts/uptime.ts --dry --force-fail`
Expected: the five passes plus `FAIL  Forced failure (force_fail input)`, no 60 s wait.

- [ ] **Step 6: Docs**

`docs/deploy.md`, append:

```markdown
## 16. Uptime alerts (uptime.yml)

`.github/workflows/uptime.yml` runs `bun scripts/uptime.ts` every hour at minute 17 (owner decision: hourly) and on demand. It checks:

| Check | Passes when |
|---|---|
| Page `/` and `/en` | HTTP 200 (no redirect) with `og:title`, `og:image` and `og:url` |
| `GET /api/ask` | 200 with `enabled: true`, or 503 with `enabled: false` (the kill switch: the Function answered). Status only: no model call, no AI quota |
| `GET /api/stats` | 200 with a valid snapshot whose `updatedAt` is at most 48 h old (the site's "delayed" threshold; the Worker writes daily at 01:00 UTC). 204 fails |
| Latest `deploy.yml` run on main | the newest completed run that is not cancelled or skipped succeeded |

A failing check is retried once after 60 s. Then the script opens one issue labelled `uptime` ("Uptime: production checks failing") listing the failing checks, rewrites its body on later failing runs (a comment, and so an email, only when the set of failing checks changes) and closes it with a recovery comment once every check passes. GitHub emails the owner on the new issue, on comments and on the close. The run stays green when checks fail (the issue is the alert, so there are no hourly failure emails); it turns red only when the script cannot talk to GitHub.

Permissions: `actions: read`, `contents: read`, `issues: write`; no secrets. `vars.SITE_URL` overrides the site.

Prove the issue path: `gh workflow run uptime.yml -R ShinyQ/ShinyQ-HQ -f force_fail=true` adds a forced failing check, so the issue opens; the next scheduled (or a plain `gh workflow run uptime.yml`) run closes it. Locally: `bun scripts/uptime.ts --dry` (add `--force-fail` to see the failing path; `--dry` never touches issues).

Pause it: Actions > Uptime > Disable workflow (or `gh workflow disable uptime.yml`).
```

`docs/features.md`: after the `content-gap.yml` bullet add
`- \`uptime.yml\` checks production every hour (pages, Ask status, stats freshness, the last deploy) and keeps one \`uptime\` issue open while something fails (docs/deploy.md section 16).`

`AGENTS.md`: in the folder layout under `scripts/`, after `deploy-smoke.ts`, add
`  uptime.ts                     hourly production check (uptime.yml): / and /en with og tags, /api/ask status, /api/stats freshness, last deploy.yml; one retry, then one \`uptime\` issue opened, updated or closed`
and in the "CI around it" bullet add `hourly \`uptime.yml\` (docs/deploy.md section 16)` next to the weekly workflows.

`README.md` line 236: change to `- **Nightly**: Ask evals against the real models, the game-first timeline trend and screenshots; weekly live facts and content-gap reports; an hourly uptime check.`

- [ ] **Step 7: Verify and commit**

Run: `bunx vitest run tests/unit` (includes the em dash scan and workflow pinning) and `bun run typecheck` and `bun run lint`.
Expected: PASS.

```bash
rtk git add scripts/uptime.ts tests/unit/uptime.test.ts .github/workflows/uptime.yml docs/deploy.md docs/features.md AGENTS.md README.md
rtk git commit -m "ci(uptime): hourly uptime workflow with force_fail and docs"
```

### After the tasks

- `bun run verify:quick`; `bun run e2e:changed --dry` (scripts and docs map to smoke at most).
- Before pushing: `gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued`; wait while another PR's CI runs. Push, open the PR, wait for green, message the coordinator with the PR link and test results. Do not merge.
