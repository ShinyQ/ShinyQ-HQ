import { parseRumPayload, rumDataPoint, RUM_MAX_BYTES } from "../../src/lib/rum/protocol";
import { originAllowed } from "./security";
import type { PagesContext, RumEnv } from "./types";

/** Points written per isolate and minute at most: a cheap ceiling for a spammed endpoint (AE free plan: 100k points a day). */
export const RUM_ISOLATE_CAP = 600;

const rumWindow = { minute: -1, count: 0 };

/** Tests only: a fresh per-minute window. */
export function resetRumWindow(): void {
  rumWindow.minute = -1;
  rumWindow.count = 0;
}

const empty = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers: { "Cache-Control": "no-store", ...headers } });

/**
 * `POST /api/rum` (appendix 06 section 4): one coarse point per sampled 3D session into Analytics
 * Engine `perf_events`. Same origin only, at most RUM_MAX_BYTES, exactly the protocol object. Reads no
 * other header: the IP address and the user agent never reach the point.
 */
export function createRumHandler({ now = () => Date.now() }: { now?: () => number } = {}) {
  return async function handle({ request, env }: PagesContext<RumEnv>): Promise<Response> {
    if (request.method !== "POST") return empty(405, { Allow: "POST" });
    if (env.RUM_ENABLED !== "true") return empty(204);
    if (!originAllowed(request, env.ASK_ALLOWED_ORIGINS)) return empty(403);
    if (Number(request.headers.get("Content-Length") ?? "0") > RUM_MAX_BYTES) return empty(413);
    const text = await request.text();
    if (text.length > RUM_MAX_BYTES) return empty(413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return empty(400);
    }
    const payload = parseRumPayload(body);
    if (!payload) return empty(400);
    const minute = Math.floor(now() / 60_000);
    if (rumWindow.minute !== minute) {
      rumWindow.minute = minute;
      rumWindow.count = 0;
    }
    rumWindow.count += 1;
    if (rumWindow.count > RUM_ISOLATE_CAP) return empty(429);
    try {
      env.PERF_EVENTS?.writeDataPoint(rumDataPoint(payload));
    } catch {
      // Analytics must never fail the beacon.
    }
    return empty(204);
  };
}
