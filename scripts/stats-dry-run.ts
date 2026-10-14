/**
 * Runs the hq-stats Worker pipeline (workers/stats/src/run.ts) once against production data, into an
 * in-memory KV, and prints the ledger summary and the public snapshot. Writes nothing to Cloudflare.
 *
 *   WA_TOKEN="$(bunx wrangler auth token)" WA_ACCOUNT_ID=<account id> bun scripts/stats-dry-run.ts
 *
 * WA_TOKEN needs Account Analytics Read (a Wrangler OAuth token works). It is read from the environment
 * and never printed. WA_SITE_TAG and WA_HOSTS default to the values in workers/stats/wrangler.toml.
 * Pass `--at <ISO time>` to run as of another moment (default: now).
 */
import { readFileSync } from "node:fs";
import { STATS_KEY } from "../src/lib/stats/protocol";
import { LEDGER_KEY, runStats } from "../workers/stats/src/run";
import type { Ledger, StatsWorkerEnv } from "../workers/stats/src/types";

function tomlVar(name: string): string | undefined {
  const toml = readFileSync(new URL("../workers/stats/wrangler.toml", import.meta.url), "utf8");
  return new RegExp(`^${name}\\s*=\\s*"([^"]*)"`, "m").exec(toml)?.[1];
}

async function main() {
  const atFlag = process.argv.indexOf("--at");
  const now = atFlag > -1 ? Date.parse(process.argv[atFlag + 1] ?? "") : Date.now();
  if (!Number.isFinite(now)) throw new Error("--at needs an ISO time");
  const store = new Map<string, string>();
  const env: StatsWorkerEnv = {
    STATS_KV: { get: async (k) => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) },
    WA_TOKEN: process.env.WA_TOKEN?.trim(),
    WA_ACCOUNT_ID: process.env.WA_ACCOUNT_ID?.trim(),
    WA_SITE_TAG: process.env.WA_SITE_TAG ?? tomlVar("WA_SITE_TAG"),
    WA_HOSTS: process.env.WA_HOSTS ?? tomlVar("WA_HOSTS"),
  };
  const result = await runStats(env, now, undefined, (line) => console.error(line));
  const ledger = JSON.parse(store.get(LEDGER_KEY) ?? '{"v":1,"days":[]}') as Ledger;
  console.error(`Ledger: ${ledger.days.length} days, ${result.added[0] ?? "none"} to ${result.added.at(-1) ?? "none"}`);
  for (const d of ledger.days) console.error(`  ${d.date}  visits ${d.visits}  page views ${d.pageViews}  countries ${d.countries.length}  asks ${d.asks.total}  mode ${d.mode.threeD}/${d.mode.classic}${d.mode.frozen ? " (frozen)" : ""}`);
  console.log(store.get(STATS_KEY) ? JSON.stringify(JSON.parse(store.get(STATS_KEY) as string), null, 2) : "null");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "stats dry run failed");
  process.exit(1);
});
