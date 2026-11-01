/**
 * Wire contract of the first-party visit beacon (`POST /api/visit`, appendix 06 section 4). Three kinds of
 * point, nothing else (no IP, no user agent, no URL, no identifier):
 * - the visit ping `{ v: 1, kind: "visit" }`, sent once per browser tab session as soon as the page is shown:
 *   the public visit count (owner decision 2026-10-24); `src` adds the landing's allowlisted `?src=` channel tag
 *   (owner decision 2026-11-01), so a LinkedIn or CV link can be told from others;
 * - the mode ping `{ v: 1, mode }`, sent once per page lifetime when it is left: whether the visitor used the
 *   3D view, the Classic site or both (the 3D vs Classic split). It never counts as a visit;
 * - the intent ping `{ v: 1, intent }`, sent once per tab session and kind (owner decision 2026-11-01): the
 *   visitor opened the CV, wrote or copied the email, or followed the LinkedIn or GitHub link. Private: only the
 *   owner's report reads it (`scripts/intent-report.ts`), never the public stats.
 * Shared by the client (src/lib/stats/visitClient.ts), the Pages Function (functions/_lib/visit.ts) and the
 * hq-stats Worker queries.
 */
export const VISIT_VERSION = 1 as const;
export const VISIT_ENDPOINT = "/api/visit";
/** Largest accepted body; the largest valid payload is 35 bytes. */
export const VISIT_MAX_BYTES = 128;
export const VISIT_MODES = ["3d", "classic", "both"] as const;
export type VisitMode = (typeof VISIT_MODES)[number];
/** blob2 of a visit ping (mode pings carry their mode there). */
export const VISIT_KIND = "visit" as const;
/** blob2 of an intent ping (blob3: which intent). */
export const INTENT_KIND = "intent" as const;
/** What a visitor did to reach him: opened the CV, wrote or copied the email, followed LinkedIn or GitHub. */
export const VISIT_INTENTS = ["cv", "email", "linkedin", "github"] as const;
export type VisitIntent = (typeof VISIT_INTENTS)[number];
/**
 * Channel tags a link may carry as `?src=` (blob3 of the visit ping): LinkedIn, GitHub, the CV or an email
 * signature. Anything else is dropped, so no free text ever reaches a point.
 */
export const VISIT_SOURCES = ["li", "gh", "cv", "mail"] as const;
export type VisitSource = (typeof VISIT_SOURCES)[number];

export type VisitPayload =
  | { v: typeof VISIT_VERSION; mode: VisitMode }
  | { v: typeof VISIT_VERSION; kind: typeof VISIT_KIND; src?: VisitSource }
  | { v: typeof VISIT_VERSION; intent: VisitIntent };

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);

/** The allowlisted `?src=` tag of a query string, if any. */
export function visitSource(search: string): VisitSource | undefined {
  const m = /[?&]src=([^&#]*)/.exec(search);
  return m && isOneOf(VISIT_SOURCES, m[1]) ? m[1] : undefined;
}

const exactly = (o: Record<string, unknown>, keys: readonly string[]) => {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => own.includes(k));
};

/** The payload when `value` is exactly `{ v: 1, mode }`, `{ v: 1, kind: "visit" }` (optionally with an allowlisted `src`) or `{ v: 1, intent }`, else null. */
export function parseVisitPayload(value: unknown): VisitPayload | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (o.v !== VISIT_VERSION) return null;
  if (exactly(o, ["v", "kind"])) return o.kind === VISIT_KIND ? { v: VISIT_VERSION, kind: VISIT_KIND } : null;
  if (exactly(o, ["v", "kind", "src"])) return o.kind === VISIT_KIND && isOneOf(VISIT_SOURCES, o.src) ? { v: VISIT_VERSION, kind: VISIT_KIND, src: o.src } : null;
  if (exactly(o, ["v", "intent"])) return isOneOf(VISIT_INTENTS, o.intent) ? { v: VISIT_VERSION, intent: o.intent } : null;
  if (!exactly(o, ["v", "mode"]) || !isOneOf(VISIT_MODES, o.mode)) return null;
  return { v: VISIT_VERSION, mode: o.mode };
}

export const isVisitPing = (p: VisitPayload): p is { v: typeof VISIT_VERSION; kind: typeof VISIT_KIND; src?: VisitSource } => "kind" in p;
export const isIntentPing = (p: VisitPayload): p is { v: typeof VISIT_VERSION; intent: VisitIntent } => "intent" in p;

/**
 * One Analytics Engine point. Blobs: version, then the mode, "visit" (plus its `src` tag when it has one) or
 * "intent" plus which one. Doubles: count. Index: the constant "visit" (never per visitor).
 */
export function visitDataPoint(p: VisitPayload): { blobs: string[]; doubles: number[]; indexes: string[] } {
  const blobs = isVisitPing(p) ? [String(p.v), VISIT_KIND, ...(p.src ? [p.src] : [])] : isIntentPing(p) ? [String(p.v), INTENT_KIND, p.intent] : [String(p.v), p.mode];
  return { blobs, doubles: [1], indexes: ["visit"] };
}
