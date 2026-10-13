/**
 * Token checks for the public visit stats (run in CI before the hq-stats Worker deploy). Never prints a
 * token, a response body or a header: only which check passed and what permission is missing.
 *
 *   bun scripts/stats-token-check.ts analytics   STATS_ANALYTICS_TOKEN (CF_EVAL_TOKEN) can read Web
 *                                                Analytics (settings probe of rumPageloadEventsAdaptiveGroups)
 *                                                and Analytics Engine (SQL API)
 *   bun scripts/stats-token-check.ts deploy      CLOUDFLARE_API_TOKEN can see Workers scripts and the
 *                                                STATS_KV namespace (read-only proxies for the Edit rights
 *                                                that `wrangler deploy` needs)
 *
 * Both need CLOUDFLARE_ACCOUNT_ID. Exit code 1 with a GitHub `::error::` line on failure.
 */

const API = "https://api.cloudflare.com/client/v4";
export const STATS_KV_ID = "88fb27f910f44e6393b8fd495d6a2c4f";

export const SETTINGS_PROBE = `query Probe($accountTag: string!) {
  viewer { accounts(filter: { accountTag: $accountTag }) {
    settings { rumPageloadEventsAdaptiveGroups { enabled maxDuration maxPageSize notOlderThan } }
  } }
}`;

export interface CheckResult {
  ok: boolean;
  message: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads the settings probe answer: enabled with the limits the Worker relies on (93-day windows, 10k rows). */
export function readSettingsProbe(status: number, body: unknown): CheckResult {
  const fail = (why: string): CheckResult => ({
    ok: false,
    message: `CF_EVAL_TOKEN cannot read Web Analytics (rumPageloadEventsAdaptiveGroups): ${why}. Give the token Account > Account Analytics > Read on this account, then rerun.`,
  });
  if (status !== 200) return fail(`HTTP ${status}`);
  if (!isRecord(body)) return fail("no JSON body");
  if (Array.isArray(body.errors) && body.errors.length > 0) return fail("the API answered with errors");
  const accounts = isRecord(body.data) && isRecord(body.data.viewer) && Array.isArray(body.data.viewer.accounts) ? body.data.viewer.accounts : [];
  const settings = isRecord(accounts[0]) && isRecord(accounts[0].settings) ? accounts[0].settings.rumPageloadEventsAdaptiveGroups : undefined;
  const dataset = Array.isArray(settings) ? settings[0] : settings;
  if (!isRecord(dataset)) return fail("no settings for the dataset (wrong account, or no access)");
  if (dataset.enabled !== true) return fail("the dataset is not enabled for this token");
  const maxDuration = Number(dataset.maxDuration);
  const maxPageSize = Number(dataset.maxPageSize);
  if (!(maxDuration >= 90 * 86_400) || !(maxPageSize >= 10_000)) return fail(`limits too small (maxDuration ${maxDuration} s, maxPageSize ${maxPageSize})`);
  return { ok: true, message: `Web Analytics readable: maxDuration ${Math.round(maxDuration / 86_400)} days, maxPageSize ${maxPageSize}, history ${Math.round(Number(dataset.notOlderThan) / 86_400)} days.` };
}

/** Reads an Analytics Engine SQL answer (`SHOW TABLES`). */
export function readSqlProbe(status: number): CheckResult {
  return status === 200
    ? { ok: true, message: "Analytics Engine SQL readable." }
    : { ok: false, message: `CF_EVAL_TOKEN cannot query Analytics Engine (HTTP ${status}). Give it Account > Account Analytics > Read.` };
}

/** Reads a Cloudflare REST answer (`{ success }`) for one deploy permission. */
export function readRestProbe(status: number, body: unknown, permission: string): CheckResult {
  const ok = status === 200 && isRecord(body) && body.success === true;
  return ok
    ? { ok, message: `CLOUDFLARE_API_TOKEN: ${permission} visible.` }
    : {
        ok,
        message: `CLOUDFLARE_API_TOKEN lacks ${permission} (HTTP ${status}). Add Account > ${permission.split(" (")[0]} Edit to the deploy token, or deploy workers/stats once by hand (workers/stats/README.md) and set the repository variable STATS_WORKER_DEPLOY to "false".`,
      };
}

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function analytics(token: string, account: string): Promise<CheckResult[]> {
  const probe = await fetch(`${API}/graphql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: SETTINGS_PROBE, variables: { accountTag: account } }),
  });
  const settings = readSettingsProbe(probe.status, await json(probe));
  const sql = await fetch(`${API}/accounts/${account}/analytics_engine/sql`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: "SHOW TABLES" });
  await sql.body?.cancel();
  return [settings, readSqlProbe(sql.status)];
}

async function deploy(token: string, account: string): Promise<CheckResult[]> {
  const get = async (path: string, permission: string) => {
    const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return readRestProbe(response.status, await json(response), permission);
  };
  return [await get(`/accounts/${account}/workers/scripts`, "Workers Scripts (read)"), await get(`/accounts/${account}/storage/kv/namespaces/${STATS_KV_ID}`, "Workers KV Storage (read)")];
}

async function main() {
  const mode = process.argv[2];
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
  if (!/^[0-9a-f]{32}$/.test(account)) {
    console.log("::error::CLOUDFLARE_ACCOUNT_ID is missing or malformed.");
    process.exit(1);
  }
  let results: CheckResult[];
  if (mode === "analytics") {
    const token = process.env.STATS_ANALYTICS_TOKEN?.trim();
    if (!token) {
      console.log("::error::STATS_ANALYTICS_TOKEN (the CF_EVAL_TOKEN secret) is not set.");
      process.exit(1);
    }
    results = await analytics(token, account);
  } else if (mode === "deploy") {
    const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
    if (!token) {
      console.log("::error::CLOUDFLARE_API_TOKEN is not set.");
      process.exit(1);
    }
    results = await deploy(token, account);
  } else {
    console.log("Usage: bun scripts/stats-token-check.ts analytics|deploy");
    process.exit(2);
  }
  for (const r of results) console.log(r.ok ? r.message : `::error::${r.message}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

if (import.meta.main) {
  main().catch(() => {
    console.log("::error::The token check could not reach the Cloudflare API.");
    process.exit(1);
  });
}
