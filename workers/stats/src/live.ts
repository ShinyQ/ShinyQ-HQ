import { ISO_SECOND_RE, LIVE_MAX_AGE_MS, LIVE_PATH } from "../../../src/lib/stats/live";
import { config } from "./run";
import { fetchLiveVisits } from "./sources";
import type { DurableObjectStateLike, Fetcher, StatsWorkerEnv } from "./types";

/**
 * The live visit count behind `GET /api/stats` (owner decision 2026-10-24), with a hard cost cap: at most one
 * Analytics Engine query per LIVE_QUERY_EVERY_MS across every instance (about 1,440 a day, whatever the traffic).
 *
 * 1. `GET /live?from=` (the Worker's fetch handler, reached only through the Pages `STATS` service binding)
 *    validates `from`, then answers from the Cache API (`caches.default`, per data center, 60 s) when it can.
 * 2. On a miss it asks the one `LiveGate` Durable Object (`idFromName("live")`, a single global instance). The
 *    gate keeps the last count and the time of the last query in its storage: a fresh count for the same `from`
 *    is served as it is, and a new query runs only when the last one is at least LIVE_QUERY_EVERY_MS old
 *    (concurrent callers share one query). A different `from` inside the window answers 503, failures use the
 *    slot too, so retries never add queries. Any non-200 makes `/api/stats` serve the hourly snapshot as it is.
 */
export const LIVE_QUERY_EVERY_MS = 60_000;
/** Cache API lifetime of a `/live` answer (seconds). */
export const LIVE_CACHE_SECONDS = 60;
/** Name of the single gate instance. */
export const LIVE_GATE_NAME = "live";

const json = (status: number, body: unknown, cache = "no-store") => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": cache } });

export interface EdgeCacheLike {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
}

const defaultCache = (): EdgeCacheLike | undefined => (globalThis as { caches?: { default?: EdgeCacheLike } }).caches?.default;
const cacheKey = (from: string) => `https://hq-stats.internal${LIVE_PATH}?from=${encodeURIComponent(from)}`;

/** `GET /live?from=<ISO seconds>`: `{ "n": 12 }`, visit pings since `from`; 400 for a bad `from`, 404 and 405 elsewhere. */
export async function handleLive(request: Request, env: StatsWorkerEnv, now: number, cache: EdgeCacheLike | undefined = defaultCache()): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== LIVE_PATH) return json(404, { error: "not_found" });
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
  const from = url.searchParams.get("from") ?? "";
  const at = Date.parse(from);
  if (!ISO_SECOND_RE.test(from) || !Number.isFinite(at) || at > now || now - at > LIVE_MAX_AGE_MS) return json(400, { error: "bad_from" });
  const key = cacheKey(from);
  try {
    const hit = await cache?.match(key);
    if (hit) return hit;
  } catch {
    // A broken cache only costs a gate call.
  }
  if (!env.LIVE_GATE) return json(503, { error: "unavailable" });
  let answer: Response;
  try {
    answer = await env.LIVE_GATE.get(env.LIVE_GATE.idFromName(LIVE_GATE_NAME)).fetch(`https://live-gate${LIVE_PATH}?from=${encodeURIComponent(from)}`);
  } catch {
    return json(502, { error: "unavailable" });
  }
  if (answer.status !== 200) return json(answer.status === 503 ? 503 : 502, { error: "unavailable" });
  const body = (await answer.json()) as { n?: unknown };
  if (typeof body?.n !== "number" || !Number.isSafeInteger(body.n) || body.n < 0) return json(502, { error: "unavailable" });
  const response = json(200, { n: body.n }, `public, max-age=${LIVE_CACHE_SECONDS}`);
  try {
    await cache?.put(key, response.clone());
  } catch {
    // Not cached: the gate still caps the queries.
  }
  return response;
}

interface GateRecord {
  from: string;
  n: number | null;
  /** Time of the last query (also after a failure, so a retry waits for the next slot). */
  at: number;
}

/**
 * The single global gate in front of the live Analytics Engine query (a SQLite-backed Durable Object, so it is
 * on the free plan): one query per LIVE_QUERY_EVERY_MS at most, for every caller in every data center.
 */
export class LiveGate {
  private record: GateRecord | null | undefined;
  private pending: { from: string; answer: Promise<Response> } | null = null;

  constructor(
    private readonly state: DurableObjectStateLike,
    private readonly env: StatsWorkerEnv,
    private readonly fetcher: Fetcher = (input, init) => fetch(input, init),
    private readonly clock: () => number = () => Date.now(),
  ) {}

  async fetch(request: Request): Promise<Response> {
    const from = new URL(request.url).searchParams.get("from") ?? "";
    if (!ISO_SECOND_RE.test(from)) return json(400, { error: "bad_from" });
    if (this.pending) return this.pending.from === from ? (await this.pending.answer).clone() : json(503, { error: "busy" });
    const pending = { from, answer: this.answer(from) };
    this.pending = pending;
    try {
      return (await pending.answer).clone();
    } finally {
      if (this.pending === pending) this.pending = null;
    }
  }

  private async answer(from: string): Promise<Response> {
    if (this.record === undefined) this.record = (await this.state.storage.get<GateRecord>("last")) ?? null;
    const now = this.clock();
    const last = this.record;
    const fresh = last !== null && now - last.at < LIVE_QUERY_EVERY_MS;
    if (fresh && last.from === from) return last.n === null ? json(502, { error: "unavailable" }) : json(200, { n: last.n });
    if (fresh) return json(503, { error: "busy" });
    const record: GateRecord = { from, n: null, at: now };
    this.record = record;
    await this.state.storage.put("last", record);
    try {
      record.n = await fetchLiveVisits(config(this.env), from, this.fetcher);
    } catch {
      return json(502, { error: "unavailable" });
    }
    await this.state.storage.put("last", record);
    return json(200, { n: record.n });
  }
}
