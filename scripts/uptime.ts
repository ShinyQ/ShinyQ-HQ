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
