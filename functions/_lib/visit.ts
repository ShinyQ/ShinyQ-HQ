import { isVisitPing, parseVisitPayload, visitDataPoint, VISIT_MAX_BYTES } from "../../src/lib/stats/visit";
import { originAllowed, readCapped, visitorHash } from "./security";
import type { PagesContext, VisitEnv } from "./types";

/** Points written per isolate and minute at most: a cheap ceiling for a spammed endpoint (AE free plan: 100k points a day, shared). */
export const VISIT_ISOLATE_CAP = 600;

/**
 * Points per visitor and hour at most (per isolate), by kind: the visit ping is sent once per tab session,
 * the mode ping once per page lifetime, so real use stays far below (a shared office or family IP included).
 * Over the cap the answer is still 204, with no point: a forged flood cannot tell it was dropped.
 */
export const VISIT_IP_CAP = { visit: 20, mode: 60 } as const;
/** Visitor keys held per isolate at most; the map starts over above it (and every hour). */
export const VISIT_IP_KEYS = 5000;

const visitWindow = { minute: -1, count: 0 };
const perVisitor = { hour: -1, counts: new Map<string, number>() };

/** Tests only: fresh per-minute and per-visitor windows. */
export function resetVisitWindow(): void {
  visitWindow.minute = -1;
  visitWindow.count = 0;
  perVisitor.hour = -1;
  perVisitor.counts.clear();
}

/** Whether this visitor (salted, daily-rotating IP hash, memory only) is still under its hourly cap for `kind`. */
async function underVisitorCap(request: Request, seed: string | undefined, kind: keyof typeof VISIT_IP_CAP, now: number): Promise<boolean> {
  const hour = Math.floor(now / 3_600_000);
  if (perVisitor.hour !== hour || perVisitor.counts.size >= VISIT_IP_KEYS) {
    perVisitor.hour = hour;
    perVisitor.counts.clear();
  }
  const key = `${kind}|${await visitorHash(request.headers.get("CF-Connecting-IP") ?? "", seed, now)}`;
  const n = (perVisitor.counts.get(key) ?? 0) + 1;
  perVisitor.counts.set(key, n);
  return n <= VISIT_IP_CAP[kind];
}

const empty = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers: { "Cache-Control": "no-store", ...headers } });

/**
 * `POST /api/visit` (appendix 06 section 4): one point into Analytics Engine `visit_events` per visit ping
 * (once per tab session: the public visit count) or mode ping (once per page lifetime: 3D, Classic or both).
 * Same origin only, at most VISIT_MAX_BYTES, exactly the protocol object. The IP address is read only to
 * key an in-memory hourly cap per visitor (a salted, daily-rotating hash, never stored or written); the IP
 * and the user agent never reach the point. Forged pings are also bounded by the hq-stats Worker, which
 * falls back to Web Analytics for a day whose pings outrun its page views (`VISIT_FREEZE`, `MODE_FREEZE`).
 */
export function createVisitHandler({ now = () => Date.now() }: { now?: () => number } = {}) {
  return async function handle({ request, env }: PagesContext<VisitEnv>): Promise<Response> {
    if (request.method !== "POST") return empty(405, { Allow: "POST" });
    if (env.STATS_ENABLED !== "true") return empty(204);
    if (!originAllowed(request, env.ASK_ALLOWED_ORIGINS)) return empty(403);
    // Streams at most VISIT_MAX_BYTES bytes, with or without Content-Length (S7).
    const text = await readCapped(request, VISIT_MAX_BYTES);
    if (text === null) return empty(413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return empty(400);
    }
    const payload = parseVisitPayload(body);
    if (!payload) return empty(400);
    const minute = Math.floor(now() / 60_000);
    if (visitWindow.minute !== minute) {
      visitWindow.minute = minute;
      visitWindow.count = 0;
    }
    visitWindow.count += 1;
    if (visitWindow.count > VISIT_ISOLATE_CAP) return empty(429);
    if (!(await underVisitorCap(request, env.ASK_IP_SALT_SEED, isVisitPing(payload) ? "visit" : "mode", now()))) return empty(204);
    try {
      env.VISIT_EVENTS?.writeDataPoint(visitDataPoint(payload));
    } catch {
      // Analytics must never fail the beacon.
    }
    return empty(204);
  };
}
