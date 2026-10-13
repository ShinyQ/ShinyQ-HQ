/**
 * Wire contract of the first-party visit beacon (`POST /api/visit`, appendix 06 section 4): one point
 * per page lifetime saying whether the visitor used the 3D view, the Classic site or both. Nothing
 * else: no IP, no user agent, no URL, no identifier. Shared by the client (src/lib/stats/visitClient.ts),
 * the Pages Function (functions/_lib/visit.ts) and the hq-stats Worker query.
 */
export const VISIT_VERSION = 1 as const;
export const VISIT_ENDPOINT = "/api/visit";
/** Largest accepted body; the largest valid payload is 26 bytes. */
export const VISIT_MAX_BYTES = 128;
export const VISIT_MODES = ["3d", "classic", "both"] as const;
export type VisitMode = (typeof VISIT_MODES)[number];

export interface VisitPayload {
  v: typeof VISIT_VERSION;
  mode: VisitMode;
}

/** The payload when `value` is exactly `{ v: 1, mode }`, else null. */
export function parseVisitPayload(value: unknown): VisitPayload | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== 2 || !keys.includes("v") || !keys.includes("mode")) return null;
  if (o.v !== VISIT_VERSION || typeof o.mode !== "string" || !(VISIT_MODES as readonly string[]).includes(o.mode)) return null;
  return { v: VISIT_VERSION, mode: o.mode as VisitMode };
}

/** One Analytics Engine point. Blobs: version, mode. Doubles: count. Index: the constant "visit" (never per visitor). */
export function visitDataPoint(p: VisitPayload): { blobs: string[]; doubles: number[]; indexes: string[] } {
  return { blobs: [String(p.v), p.mode], doubles: [1], indexes: ["visit"] };
}
