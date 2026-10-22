import {
  OFFICE_BEAT_MAX_BYTES,
  parseOfficeResponse,
  parseOfficeResponseV2,
  parseOfficeResponseV3,
  wibDay,
  type OfficeResponseV1,
  type OfficeResponseV2,
  type OfficeResponseV3,
  type OfficeResponseV4,
  type OfficeSnapshotV1,
} from "../../src/lib/office/protocol";
import {
  historyWindow,
  OFFICE_HISTORY_PATH,
  parseOfficeHistory,
  parseOfficeHistoryIndex,
  type OfficeHistoryIndexResponse,
  type OfficeHistoryResponse,
} from "../../src/lib/office/protocolHistory";
import { parseOfficeResponseV4 } from "../../src/lib/office/protocolV4";
import { etagOf, readCapped } from "./security";
import type { EdgeCache, OfficeEnv, PagesContext } from "./types";

export const OFFICE_GITHUB_MAX_BYTES = 512 * 1024;
const WORKER = "https://hq-office";
const SNAPSHOT_CACHE = "public, max-age=5, stale-while-revalidate=30";
const DISABLED_CACHE = "public, max-age=60";

/** The snapshot when the Worker or the Durable Object cannot answer (spec section 8): every Rover rests. */
export function offSnapshot(now: number): OfficeSnapshotV1 {
  return { v: 1, enabled: true, mode: "off", updatedAt: now, desks: [], extra: 0, github: [], today: { day: wibDay(now), tasksDone: 0, prsMerged: 0, ciRuns: 0, ciGreen: 0 } };
}

const noStore = (code: number, extra: Record<string, string> = {}) => new Response(null, { status: code, headers: { "Cache-Control": "no-store", ...extra } });

function defaultCache(): EdgeCache | null {
  const store = (globalThis as { caches?: { default?: EdgeCache } }).caches;
  return store?.default ?? null;
}

async function jsonAnswer(value: OfficeResponseV1 | OfficeResponseV2 | OfficeResponseV3 | OfficeResponseV4 | OfficeHistoryIndexResponse | OfficeHistoryResponse, cacheControl: string): Promise<Response> {
  const body = JSON.stringify(value);
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": cacheControl, ETag: await etagOf(body) },
  });
}

/** Fits a GET-shaped 200 to the request: 304 when If-None-Match equals its ETag, no body for HEAD. */
function conditional(request: Request, res: Response): Response {
  const etag = res.headers.get("ETag");
  if (etag && request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers: res.headers });
  return request.method === "HEAD" ? new Response(null, { status: res.status, headers: res.headers }) : res;
}

/**
 * The snapshot versions: exactly `?v=2` is v2, exactly `?v=3` is v3, exactly `?v=4` is v4 (v4: the pipeline, the 3D
 * scene only), anything else (no query, `?v=5`, junk) the unchanged v1.
 */
const VERSIONS = {
  1: { key: "/api/office", worker: `${WORKER}/snapshot`, parse: parseOfficeResponse, off: offSnapshot },
  2: { key: "/api/office?v=2", worker: `${WORKER}/snapshot?v=2`, parse: parseOfficeResponseV2, off: (now: number) => ({ ...offSnapshot(now), v: 2 as const }) },
  3: { key: "/api/office?v=3", worker: `${WORKER}/snapshot?v=3`, parse: parseOfficeResponseV3, off: (now: number) => ({ ...offSnapshot(now), v: 3 as const }) },
  4: { key: "/api/office?v=4", worker: `${WORKER}/snapshot?v=4`, parse: parseOfficeResponseV4, off: (now: number) => ({ ...offSnapshot(now), v: 4 as const, pipeline: { runs: [], ships: [] } }) },
} as const;

const versionOf = (v: string | null): keyof typeof VERSIONS => (v === "2" ? 2 : v === "3" ? 3 : v === "4" ? 4 : 1);

/**
 * `GET /api/office` (v1), `GET /api/office?v=2` (v2: desk helpers), `GET /api/office?v=3` (v3: ten seats) and
 * `GET /api/office?v=4` (v4: the pipeline, the 3D scene only): the office snapshot from the hq-office Worker, validated
 * again, edge-cached for 5 s per data center and version (one Durable Object read per 5 s there). A rolled-back
 * Worker's older body is served in the asked version (its parser's fallback; v4 with an empty pipeline). Always 200 JSON with an ETag (304 on a matching If-None-Match), so clients need one code path.
 */
export function createOfficeSnapshotHandler(opts: { cache?: () => EdgeCache | null; now?: () => number } = {}) {
  const cacheOf = opts.cache ?? defaultCache;
  const now = opts.now ?? Date.now;
  return async function handle({ request, env, waitUntil }: PagesContext<OfficeEnv>): Promise<Response> {
    const method = request.method;
    if (method !== "GET" && method !== "HEAD") return noStore(405, { Allow: "GET, HEAD" });
    if (env.OFFICE_ENABLED !== "true") return conditional(request, await jsonAnswer({ v: 1, enabled: false }, DISABLED_CACHE));
    const version = VERSIONS[versionOf(new URL(request.url).searchParams.get("v"))];
    if (!env.OFFICE) return conditional(request, await jsonAnswer(version.off(now()), SNAPSHOT_CACHE));
    const cache = cacheOf();
    const key = new Request(new URL(version.key, request.url).toString(), { method: "GET" });
    const hit = await cache?.match(key);
    if (hit) return conditional(request, hit);
    let value: OfficeResponseV1 | OfficeResponseV2 | OfficeResponseV3 | OfficeResponseV4 | null = null;
    try {
      const res = await env.OFFICE.fetch(version.worker);
      value = res.ok ? version.parse(await res.json()) : null;
    } catch {
      value = null;
    }
    const out = await jsonAnswer(value ?? version.off(now()), SNAPSHOT_CACHE);
    if (cache) waitUntil(cache.put(key, out.clone()));
    return conditional(request, out);
  };
}

/** One history route, on the VERSIONS pattern: its canonical edge cache key, the Worker URL, the validator and its Cache-Control. */
export interface HistoryRoute {
  key: string;
  worker: string;
  parse: (raw: unknown) => OfficeHistoryIndexResponse | OfficeHistoryResponse | null;
  cache: string;
}

const HISTORY_RECENT = "public, max-age=30, stale-while-revalidate=60";
const HISTORY_PAST = "public, max-age=3600, stale-while-revalidate=300";
const HISTORY_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The history routes, like VERSIONS: no query is the index; exactly one `day` inside the 8-day WIB window is that day
 * (today cached like the index, past days for an hour: not immutable, a privatize can scrub them); anything else null.
 * The key is built from the validated values, never the raw URL, so junk queries cannot fill the cache.
 */
export function historyRoute(url: URL, now: number): HistoryRoute | null {
  const names = [...url.searchParams.keys()];
  if (names.length === 0) return { key: OFFICE_HISTORY_PATH, worker: `${WORKER}/history`, parse: parseOfficeHistoryIndex, cache: HISTORY_RECENT };
  const day = url.searchParams.get("day");
  if (names.length !== 1 || names[0] !== "day" || day === null || !HISTORY_DAY.test(day) || !historyWindow(now).includes(day)) return null;
  return { key: `${OFFICE_HISTORY_PATH}?day=${day}`, worker: `${WORKER}/history?day=${day}`, parse: parseOfficeHistory, cache: day === wibDay(now) ? HISTORY_RECENT : HISTORY_PAST };
}

const notFoundDay = () =>
  new Response('{"v":1,"error":"day"}', { status: 404, headers: { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" } });

/**
 * `GET /api/office/history` (the 8-day index) and `GET /api/office/history?day=YYYY-MM-DD` (one WIB day) from the
 * hq-office Worker, validated again, edge-cached per canonical key, with an ETag (304 on a matching If-None-Match).
 * A Worker 404 for a day (the window turned over between the edge and the Durable Object) is the fixed 404; any other
 * failure a 503 with no-store (the client shows "Replay unavailable").
 */
export function createOfficeHistoryHandler(opts: { cache?: () => EdgeCache | null; now?: () => number } = {}) {
  const cacheOf = opts.cache ?? defaultCache;
  const now = opts.now ?? Date.now;
  return async function handle({ request, env, waitUntil }: PagesContext<OfficeEnv>): Promise<Response> {
    const method = request.method;
    if (method !== "GET" && method !== "HEAD") return noStore(405, { Allow: "GET, HEAD" });
    if (env.OFFICE_ENABLED !== "true") return conditional(request, await jsonAnswer({ v: 1, enabled: false }, DISABLED_CACHE));
    const route = historyRoute(new URL(request.url), now());
    if (!route) return notFoundDay();
    if (!env.OFFICE) return noStore(503);
    const cache = cacheOf();
    const key = new Request(new URL(route.key, request.url).toString(), { method: "GET" });
    const hit = await cache?.match(key);
    if (hit) return conditional(request, hit);
    let value: ReturnType<HistoryRoute["parse"]> = null;
    try {
      const res = await env.OFFICE.fetch(route.worker);
      if (res.status === 404 && route.key !== OFFICE_HISTORY_PATH) return notFoundDay();
      value = res.ok ? route.parse(await res.json()) : null;
    } catch {
      value = null;
    }
    if (!value) return noStore(503);
    const out = await jsonAnswer(value, route.cache);
    if (cache) waitUntil(cache.put(key, out.clone()));
    return conditional(request, out);
  };
}

const FORWARDED: Record<"beat" | "github", readonly string[]> = {
  beat: ["Content-Type", "X-Office-Signature"],
  github: ["Content-Type", "X-Hub-Signature-256", "X-GitHub-Event", "X-GitHub-Delivery"],
};

/** `POST /api/office/beat` and `POST /api/office/github`: forward the raw body and signature headers; the Worker verifies. */
export function createOfficeForwardHandler(route: "beat" | "github") {
  const limit = route === "beat" ? OFFICE_BEAT_MAX_BYTES : OFFICE_GITHUB_MAX_BYTES;
  return async function handle({ request, env }: PagesContext<OfficeEnv>): Promise<Response> {
    if (request.method !== "POST") return noStore(405, { Allow: "POST" });
    if (env.OFFICE_ENABLED !== "true") return noStore(204);
    if (!env.OFFICE) return noStore(503);
    const body = await readCapped(request, limit);
    if (body === null) return noStore(413);
    const headers = new Headers();
    for (const name of FORWARDED[route]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    try {
      const res = await env.OFFICE.fetch(`${WORKER}/${route}`, { method: "POST", headers, body });
      return noStore(res.status);
    } catch {
      return noStore(502);
    }
  };
}
