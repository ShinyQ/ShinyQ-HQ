import { parseStatsSnapshot, STATS_KEY } from "../../src/lib/stats/protocol";
import { etagOf } from "./security";
import type { PagesContext, StatsEnv } from "./types";

/** Seconds a KV read stays cached at the reading location. */
export const STATS_KV_CACHE_TTL = 300;
const OK_CACHE = "public, max-age=600, stale-while-revalidate=3600";
const EMPTY_CACHE = "public, max-age=300";

const empty = () => new Response(null, { status: 204, headers: { "Cache-Control": EMPTY_CACHE } });

/**
 * `GET /api/stats`: the public visit stats snapshot (`StatsSnapshotV1`, src/lib/stats/protocol.ts) that
 * the hq-stats Cron Worker writes to KV every 4 hours. No parameters. Validated again here, so a broken
 * value never reaches a page; 204 (no body) when the kill switch is off or nothing valid is stored.
 */
export function createStatsHandler() {
  return async function handle({ request, env }: PagesContext<StatsEnv>): Promise<Response> {
    const method = request.method;
    if (method !== "GET" && method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
    if (env.STATS_ENABLED !== "true" || !env.STATS_KV) return empty();
    let snapshot: ReturnType<typeof parseStatsSnapshot> = null;
    try {
      const raw = await env.STATS_KV.get(STATS_KEY, { cacheTtl: STATS_KV_CACHE_TTL });
      snapshot = raw ? parseStatsSnapshot(JSON.parse(raw)) : null;
    } catch {
      snapshot = null;
    }
    if (!snapshot) return empty();
    const body = JSON.stringify(snapshot);
    const etag = await etagOf(body);
    const headers = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": OK_CACHE, ETag: etag };
    if (request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers });
    return new Response(method === "HEAD" ? null : body, { status: 200, headers });
  };
}
