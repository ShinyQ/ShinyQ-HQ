import { ISO_SECOND_RE, LIVE_MAX_AGE_MS, LIVE_PATH } from "../../../src/lib/stats/live";
import { config } from "./run";
import { fetchLiveVisits } from "./sources";
import type { Fetcher, StatsWorkerEnv } from "./types";

/** Seconds an answer is reused per isolate and `from`: one SQL query per isolate and window at most. */
export const LIVE_MEMO_MS = 20_000;

const memo = new Map<string, { at: number; n: number }>();

/** Tests only: forget memoized answers. */
export function resetLiveMemo(): void {
  memo.clear();
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/**
 * `GET /live?from=<ISO seconds>`: visit pings since `from` (`{ "n": 12 }`), for the live today count of
 * `GET /api/stats` (owner decision 2026-10-24). The Worker has no route and no workers.dev URL, so only the
 * Pages project's `STATS` service binding reaches it. `from` must be ISO seconds, not in the future and at
 * most LIVE_MAX_AGE_MS old; the query is fixed, only that validated time is filled in. Errors answer 502
 * with no detail and never log the token.
 */
export async function handleLive(request: Request, env: StatsWorkerEnv, now: number, fetcher: Fetcher = (input, init) => fetch(input, init)): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== LIVE_PATH) return json(404, { error: "not_found" });
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
  const from = url.searchParams.get("from") ?? "";
  const at = Date.parse(from);
  if (!ISO_SECOND_RE.test(from) || !Number.isFinite(at) || at > now || now - at > LIVE_MAX_AGE_MS) return json(400, { error: "bad_from" });
  const hit = memo.get(from);
  if (hit && now - hit.at < LIVE_MEMO_MS) return json(200, { n: hit.n });
  try {
    const n = await fetchLiveVisits(config(env), from, fetcher);
    if (memo.size > 50) memo.clear();
    memo.set(from, { at: now, n });
    return json(200, { n });
  } catch {
    return json(502, { error: "unavailable" });
  }
}
