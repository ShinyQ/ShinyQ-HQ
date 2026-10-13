import { parseVisitPayload, visitDataPoint, VISIT_MAX_BYTES } from "../../src/lib/stats/visit";
import { originAllowed } from "./security";
import type { PagesContext, VisitEnv } from "./types";

/** Points written per isolate and minute at most: a cheap ceiling for a spammed endpoint (AE free plan: 100k points a day, shared). */
export const VISIT_ISOLATE_CAP = 600;

const visitWindow = { minute: -1, count: 0 };

/** Tests only: a fresh per-minute window. */
export function resetVisitWindow(): void {
  visitWindow.minute = -1;
  visitWindow.count = 0;
}

const empty = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers: { "Cache-Control": "no-store", ...headers } });

/**
 * `POST /api/visit` (appendix 06 section 4): one point per page lifetime into Analytics Engine
 * `visit_events`, saying whether the 3D view, the Classic site or both were used. Same origin only, at
 * most VISIT_MAX_BYTES, exactly the protocol object. Reads no other header: the IP address and the user
 * agent never reach the point. Public visit and country totals come from Web Analytics, so this beacon
 * can only move the 3D vs Classic split (and the hq-stats Worker freezes a day that looks inflated).
 */
export function createVisitHandler({ now = () => Date.now() }: { now?: () => number } = {}) {
  return async function handle({ request, env }: PagesContext<VisitEnv>): Promise<Response> {
    if (request.method !== "POST") return empty(405, { Allow: "POST" });
    if (env.STATS_ENABLED !== "true") return empty(204);
    if (!originAllowed(request, env.ASK_ALLOWED_ORIGINS)) return empty(403);
    if (Number(request.headers.get("Content-Length") ?? "0") > VISIT_MAX_BYTES) return empty(413);
    const text = await request.text();
    if (text.length > VISIT_MAX_BYTES) return empty(413);
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
    try {
      env.VISIT_EVENTS?.writeDataPoint(visitDataPoint(payload));
    } catch {
      // Analytics must never fail the beacon.
    }
    return empty(204);
  };
}
