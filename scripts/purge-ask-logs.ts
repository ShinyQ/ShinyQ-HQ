/**
 * Deletes AI Gateway logs older than the retention window (default 7 days, owner decision 2).
 *
 *   CF_LOGS_TOKEN=... CF_ACCOUNT_ID=... bun scripts/purge-ask-logs.ts [--dry-run]
 *
 * Only for gateways on Legacy Logs (accounts whose first gateway predates 2026-09-24), which keep
 * logs until a count cap is hit. Gateways on the newer Workers Logs storage expire logs by age on
 * their own; the Legacy Logs API then has nothing to delete and the script exits 0.
 * Needs a token with Account / AI Gateway / Edit. Without CF_LOGS_TOKEN it prints a notice and
 * exits 0, so the nightly workflow stays green.
 */

export const DEFAULT_GATEWAY = "shinyq-hq";
export const DEFAULT_RETENTION_DAYS = 7;

export function purgeCutoff(now: Date, days: number): string {
  if (!Number.isFinite(days) || days < 1) throw new Error(`Retention must be at least 1 day, got ${days}`);
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

export function buildPurgeUrl(account: string, gateway: string, cutoff: string): string {
  const filters = JSON.stringify([{ key: "created_at", operator: "lt", value: [cutoff] }]);
  return `https://api.cloudflare.com/client/v4/accounts/${account}/ai-gateway/gateways/${encodeURIComponent(gateway)}/logs?filters=${encodeURIComponent(filters)}`;
}

async function main() {
  const token = process.env.CF_LOGS_TOKEN;
  const account = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
  const gateway = process.env.ASK_GATEWAY_ID || DEFAULT_GATEWAY;
  const days = Number(process.env.ASK_LOG_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);
  const dryRun = process.argv.includes("--dry-run");

  if (!token || !account) {
    console.log("::notice::CF_LOGS_TOKEN or CF_ACCOUNT_ID is not set; skipping the AI Gateway log purge.");
    return;
  }
  const cutoff = purgeCutoff(new Date(), days);
  const url = buildPurgeUrl(account, gateway, cutoff);
  if (dryRun) {
    console.log(`Would DELETE logs of gateway "${gateway}" created before ${cutoff}.`);
    return;
  }
  const response = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  const body = (await response.json().catch(() => ({}))) as { success?: boolean; errors?: { code?: number; message?: string }[] };
  if (response.status === 404) {
    console.log(`::notice::Gateway "${gateway}" has no Legacy Logs to purge (not found or on Workers Logs storage).`);
    return;
  }
  if (!response.ok || body.success === false) {
    const reason = body.errors?.map((e) => `${e.code ?? ""} ${e.message ?? ""}`.trim()).join("; ") || response.statusText;
    console.log(`::error::AI Gateway log purge failed (${response.status}): ${reason}`);
    process.exit(1);
  }
  console.log(`Deleted AI Gateway logs of "${gateway}" created before ${cutoff}.`);
}

if (import.meta.main) main().catch((error) => {
  console.log(`::error::${(error as Error).message}`);
  process.exit(1);
});
