/**
 * Hourly production uptime check (.github/workflows/uptime.yml, Round 7 E; owner decision: every hour).
 *
 *   bun scripts/uptime.ts [--site https://kurniadi.pages.dev] [--repo owner/name] [--force-fail] [--dry]
 *
 * Checks / and /en (200 with og tags, no Cloudflare-injected analytics beacon), GET /api/ask (status only: no model call, no AI quota),
 * GET /api/stats (a valid snapshot at most 6 h old) and the newest deploy.yml result on main. A failing
 * check is retried once after 60 s. Then one issue labelled `uptime` is opened or updated, and closed
 * with a recovery comment once every check passes (GitHub emails the owner). Uses fetch and GH_TOKEN
 * only (issues: write, actions: read); no dependencies, so the workflow skips `bun install`.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { parseStatsSnapshot } from "../src/lib/stats/protocol";
import { injectedAnalytics } from "./injected-analytics";
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
export const STATS_MAX_AGE_MS = 6 * 3_600_000;
export const DEPLOY_WORKFLOW = "deploy.yml";
const FETCH_TIMEOUT_MS = 20_000;
/** The deploy check ignores cancelled, skipped, neutral and stale runs: they say nothing about production (as in scripts/ci-status.ts). */
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
  if (missing.length) return result(id, false, `HTTP 200 but missing ${missing.join(", ")}`);
  const injected = injectedAnalytics(obs.html);
  return injected ? result(id, false, `HTTP 200 but carries ${injected}`) : result(id, true, "HTTP 200 with og tags");
}

/** The committed kill switch: production's `enabled()` is also false for a missing AI binding or Turnstile secret. */
export function askExpectedEnabled(wranglerToml: string): boolean {
  return /^\s*ASK_ENABLED\s*=\s*"true"\s*$/m.test(wranglerToml);
}

export function askCheck(obs: JsonObs, expectEnabled: boolean): CheckResult {
  if ("error" in obs) return result("ask", false, `no response (${obs.error})`);
  const body = (obs.body ?? {}) as { enabled?: unknown; asOf?: unknown };
  if (obs.code === 200 && body.enabled === true) return result("ask", true, `enabled, knowledge pack ${String(body.asOf ?? "unknown")}`);
  if (obs.code === 503 && body.enabled === false) {
    return expectEnabled
      ? result("ask", false, 'answered but disabled while wrangler.toml sets ASK_ENABLED = "true" (missing AI binding or Turnstile secret?)')
      : result("ask", true, "answered, switched off (kill switch in wrangler.toml)");
  }
  return result("ask", false, `HTTP ${obs.code} without a status body`);
}

export function statsCheck(obs: JsonObs, now: number): CheckResult {
  if ("error" in obs) return result("stats", false, `no response (${obs.error})`);
  if (obs.code === 204) return result("stats", false, "HTTP 204: no snapshot (the hq-stats Worker has not written one)");
  if (obs.code !== 200) return result("stats", false, `HTTP ${obs.code}, expected 200`);
  const snapshot = parseStatsSnapshot(obs.body);
  if (!snapshot) return result("stats", false, "HTTP 200 but the snapshot fails the contract");
  const ageMs = now - Date.parse(snapshot.updatedAt);
  if (!(ageMs <= STATS_MAX_AGE_MS)) return result("stats", false, `snapshot is ${Math.round(ageMs / 3_600_000)} h old (updatedAt ${snapshot.updatedAt}), limit 6 h`);
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
  /** Whether wrangler.toml sets ASK_ENABLED = "true" (default true: a disabled Ask then fails). */
  askEnabled?: boolean;
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
  ask: async (deps) => askCheck(await observeJson(deps, "/api/ask"), deps.askEnabled ?? true),
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
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
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
      if (action.comment) await must(gh, "POST", `/repos/${repo}/issues/${action.number}/comments`, { body: action.comment });
      await must(gh, "PATCH", `/repos/${repo}/issues/${action.number}`, { body: action.body });
      return `Updated issue #${action.number}${action.comment ? " with a comment" : ""}.`;
    case "close":
      await must(gh, "POST", `/repos/${repo}/issues/${action.number}/comments`, { body: action.comment });
      await must(gh, "PATCH", `/repos/${repo}/issues/${action.number}`, { state: "closed", state_reason: "completed" });
      return `Closed issue #${action.number} (recovered).`;
  }
}

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
  const dryFlag = args.includes("--dry");
  if (process.env.GITHUB_ACTIONS === "true" && !token && !dryFlag) throw new Error("GH_TOKEN is missing in GitHub Actions: refusing to skip the uptime issue");
  const dry = dryFlag || !token;
  let askEnabled = true;
  try {
    askEnabled = askExpectedEnabled(readFileSync("wrangler.toml", "utf8"));
  } catch {
    // No wrangler.toml in the working directory: expect Ask enabled.
  }
  const deps: UptimeDeps = { fetch, site, repo, token, now: Date.now, askEnabled };
  const results = await checkWithRetry(deps, { forceFail, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
  const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const runUrl = process.env.GITHUB_RUN_ID ? `${server}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}` : `${server}/${repo}/actions/workflows/uptime.yml`;
  const ctx: IssueContext = { site, runUrl, checkedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z") };
  for (const r of results) console.log(`${r.ok ? "pass" : "FAIL"}  ${CHECK_LABELS[r.id]}: ${r.detail}`);
  const writeSummary = (outcome: string) => {
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown(results, outcome));
  };
  let outcome: string;
  if (dry) {
    outcome = `Dry run (${token ? "--dry" : "no GH_TOKEN"}): issue left alone.`;
  } else {
    try {
      const gh = githubClient(fetch, token!);
      outcome = await applyIssueAction(gh, repo, issueAction(results, await findOpenIssue(gh, repo), ctx));
    } catch (error) {
      writeSummary(`Issue handling failed: ${message(error)}`);
      throw error;
    }
  }
  console.log(outcome);
  writeSummary(outcome);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
