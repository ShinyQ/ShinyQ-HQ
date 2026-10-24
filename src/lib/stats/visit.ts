/**
 * Wire contract of the first-party visit beacon (`POST /api/visit`, appendix 06 section 4). Two kinds of
 * point, nothing else (no IP, no user agent, no URL, no identifier):
 * - the visit ping `{ v: 1, kind: "visit" }`, sent once per browser tab session as soon as the page is shown:
 *   the public visit count (owner decision 2026-10-24);
 * - the mode ping `{ v: 1, mode }`, sent once per page lifetime when it is left: whether the visitor used the
 *   3D view, the Classic site or both (the 3D vs Classic split). It never counts as a visit.
 * Shared by the client (src/lib/stats/visitClient.ts), the Pages Function (functions/_lib/visit.ts) and the
 * hq-stats Worker queries.
 */
export const VISIT_VERSION = 1 as const;
export const VISIT_ENDPOINT = "/api/visit";
/** Largest accepted body; the largest valid payload is 26 bytes. */
export const VISIT_MAX_BYTES = 128;
export const VISIT_MODES = ["3d", "classic", "both"] as const;
export type VisitMode = (typeof VISIT_MODES)[number];
/** blob2 of a visit ping (mode pings carry their mode there). */
export const VISIT_KIND = "visit" as const;

export type VisitPayload = { v: typeof VISIT_VERSION; mode: VisitMode } | { v: typeof VISIT_VERSION; kind: typeof VISIT_KIND };

const exactly = (o: Record<string, unknown>, keys: readonly string[]) => {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => own.includes(k));
};

/** The payload when `value` is exactly `{ v: 1, mode }` or `{ v: 1, kind: "visit" }`, else null. */
export function parseVisitPayload(value: unknown): VisitPayload | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (o.v !== VISIT_VERSION) return null;
  if (exactly(o, ["v", "kind"])) return o.kind === VISIT_KIND ? { v: VISIT_VERSION, kind: VISIT_KIND } : null;
  if (!exactly(o, ["v", "mode"]) || typeof o.mode !== "string" || !(VISIT_MODES as readonly string[]).includes(o.mode)) return null;
  return { v: VISIT_VERSION, mode: o.mode as VisitMode };
}

export const isVisitPing = (p: VisitPayload): p is { v: typeof VISIT_VERSION; kind: typeof VISIT_KIND } => "kind" in p;

/** One Analytics Engine point. Blobs: version, mode or "visit". Doubles: count. Index: the constant "visit" (never per visitor). */
export function visitDataPoint(p: VisitPayload): { blobs: string[]; doubles: number[]; indexes: string[] } {
  return { blobs: [String(p.v), isVisitPing(p) ? VISIT_KIND : p.mode], doubles: [1], indexes: ["visit"] };
}
