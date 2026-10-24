import { LIVE_PATH, parseStatsLive, STATS_LIVE_KEY } from "../../src/lib/stats/live";
import { parseStatsSnapshot, STATS_KEY, type StatsSnapshotV1 } from "../../src/lib/stats/protocol";
import { etagOf } from "./security";
import type { PagesContext, StatsEnv } from "./types";

/** Seconds a KV read stays cached at the reading location (KV's minimum): the hourly snapshot and its live tail. */
export const STATS_KV_CACHE_TTL = 60;
/** How long one isolate reuses a live count before asking the hq-stats Worker again. */
export const LIVE_MEMO_MS = 30_000;
/** The live count waits at most this long; then the snapshot is served as it is. */
export const LIVE_TIMEOUT_MS = 1500;
/**
 * More new visit pings than this since the last hourly run are not added live (a flood of forged pings, or a
 * Worker that stopped running): the snapshot is served as it is, and the next run applies `VISIT_FREEZE`.
 */
export const LIVE_MAX_DELTA = 300;
const OK_CACHE = "public, max-age=30, stale-while-revalidate=30";
const EMPTY_CACHE = "public, max-age=60";

const empty = () => new Response(null, { status: 204, headers: { "Cache-Control": EMPTY_CACHE } });

const liveMemo = new Map<string, { at: number; n: number }>();

/** Tests only: forget memoized live counts. */
export function resetLiveCounts(): void {
  liveMemo.clear();
}

async function readJson(env: StatsEnv, key: string): Promise<unknown> {
  try {
    const raw = await env.STATS_KV?.get(key, { cacheTtl: STATS_KV_CACHE_TTL });
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Visit pings since `from` from the hq-stats Worker (service binding), memoized per isolate; null on any failure. */
async function liveCount(env: StatsEnv, from: string, now: number): Promise<number | null> {
  const hit = liveMemo.get(from);
  if (hit && now - hit.at < LIVE_MEMO_MS) return hit.n;
  if (!env.STATS) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), LIVE_TIMEOUT_MS);
    });
    const ask = (async () => {
      const res = await (env.STATS as NonNullable<StatsEnv["STATS"]>).fetch(`https://hq-stats${LIVE_PATH}?from=${encodeURIComponent(from)}`);
      if (!res.ok) return null;
      const body = (await res.json()) as { n?: unknown };
      return typeof body?.n === "number" && Number.isSafeInteger(body.n) && body.n >= 0 ? body.n : null;
    })();
    const n = await Promise.race([ask, timeout]);
    if (n === null) return null;
    if (liveMemo.size > 50) liveMemo.clear();
    liveMemo.set(from, { at: now, n });
    return n;
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Adds the visit pings that arrived since the hourly run (owner decision 2026-10-24): the live tail written
 * with the snapshot (same `updatedAt`, so a stale pair never merges) says where the snapshot's first-party
 * count starts and how many pings it already holds. Anything missing, failing, slow, negative or above
 * LIVE_MAX_DELTA leaves the snapshot as it is.
 */
async function withLiveVisits(env: StatsEnv, snapshot: StatsSnapshotV1, now: number): Promise<StatsSnapshotV1> {
  const live = parseStatsLive(await readJson(env, STATS_LIVE_KEY));
  if (!live || live.from === null || live.updatedAt !== snapshot.updatedAt) return snapshot;
  const n = await liveCount(env, live.from, now);
  if (n === null) return snapshot;
  const delta = n - live.visits;
  if (delta <= 0 || delta > LIVE_MAX_DELTA) return snapshot;
  return { ...snapshot, visits: { d30: snapshot.visits.d30 + delta, all: snapshot.visits.all + delta } };
}

/**
 * `GET /api/stats`: the public visit stats snapshot (`StatsSnapshotV1`, src/lib/stats/protocol.ts) that the
 * hq-stats Cron Worker writes to KV every hour, with today's visit pings since that run added live through the
 * Worker's `GET /live` (so a visit shows within about a minute). No parameters. Validated again here, so a
 * broken value never reaches a page; 204 (no body) when the kill switch is off or nothing valid is stored.
 */
export function createStatsHandler({ now = () => Date.now() }: { now?: () => number } = {}) {
  return async function handle({ request, env }: PagesContext<StatsEnv>): Promise<Response> {
    const method = request.method;
    if (method !== "GET" && method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
    if (env.STATS_ENABLED !== "true" || !env.STATS_KV) return empty();
    const stored = parseStatsSnapshot(await readJson(env, STATS_KEY));
    if (!stored) return empty();
    const snapshot = await withLiveVisits(env, stored, now());
    const body = JSON.stringify(snapshot);
    const etag = await etagOf(body);
    const headers = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": OK_CACHE, ETag: etag };
    if (request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers });
    return new Response(method === "HEAD" ? null : body, { status: 200, headers });
  };
}
