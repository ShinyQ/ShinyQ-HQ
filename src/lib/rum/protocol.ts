/**
 * Wire contract of the anonymous performance beacon (`POST /api/rum`, appendix 06 section 4).
 * Coarse buckets only: no IP, no user agent, no renderer string, no URL, no free text. Imported by the
 * 3D chunk (src/experience/perf/) and the Pages Function (functions/_lib/rum.ts), so both agree.
 */
export const RUM_VERSION = 1 as const;
/** Largest accepted body; the largest valid payload is about 130 bytes. */
export const RUM_MAX_BYTES = 512;

export const RUM_TIERS = ["full", "lite"] as const;
/** How the 3D session started: the game-first boot cover, Enter the 3D HQ from the Page View, or a floor or room route. */
export const RUM_PATHS = ["cover", "enter", "deeplink"] as const;
export const RUM_FPS = ["na", "lt15", "15-24", "25-29", "30-44", "45-54", "55+"] as const;
export const RUM_TIMES = ["na", "lt3s", "3-5s", "5-8s", "8-12s", "12-20s", "20s+"] as const;

export type RumTier = (typeof RUM_TIERS)[number];
export type RumPath = (typeof RUM_PATHS)[number];
export type RumFps = (typeof RUM_FPS)[number];
export type RumTime = (typeof RUM_TIMES)[number];

export interface RumPayload {
  v: typeof RUM_VERSION;
  tier: RumTier;
  path: RumPath;
  /** Median and 10th percentile FPS over the session's window. */
  fps50: RumFps;
  fps10: RumFps;
  /** Navigation start to the first interactive phase. */
  explore: RumTime;
  /** 1 when the WebGL context was lost. */
  lost: 0 | 1;
  /** 1 when the 8 s boot timeout revealed the page. */
  timeout: 0 | 1;
}

const KEYS = ["v", "tier", "path", "fps50", "fps10", "explore", "lost", "timeout"] as const;

const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);
const bit = (value: unknown): value is 0 | 1 => value === 0 || value === 1;

/** The payload when `value` is exactly the allowlisted object (no extra keys, every value from its list), else null. */
export function parseRumPayload(value: unknown): RumPayload | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== KEYS.length || !KEYS.every((k) => keys.includes(k))) return null;
  if (o.v !== RUM_VERSION || !oneOf(RUM_TIERS, o.tier) || !oneOf(RUM_PATHS, o.path)) return null;
  if (!oneOf(RUM_FPS, o.fps50) || !oneOf(RUM_FPS, o.fps10) || !oneOf(RUM_TIMES, o.explore)) return null;
  if (!bit(o.lost) || !bit(o.timeout)) return null;
  return { v: RUM_VERSION, tier: o.tier, path: o.path, fps50: o.fps50, fps10: o.fps10, explore: o.explore, lost: o.lost, timeout: o.timeout };
}

export function fpsBucket(fps: number | null): RumFps {
  if (fps === null || !Number.isFinite(fps) || fps <= 0) return "na";
  if (fps < 15) return "lt15";
  if (fps < 25) return "15-24";
  if (fps < 30) return "25-29";
  if (fps < 45) return "30-44";
  if (fps < 55) return "45-54";
  return "55+";
}

export function timeBucket(ms: number | null): RumTime {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "na";
  if (ms < 3000) return "lt3s";
  if (ms < 5000) return "3-5s";
  if (ms < 8000) return "5-8s";
  if (ms < 12_000) return "8-12s";
  if (ms < 20_000) return "12-20s";
  return "20s+";
}

/** One Analytics Engine point. Blobs: version, tier, path, fps50, fps10, explore. Doubles: lost, timeout, count. Index: tier. */
export function rumDataPoint(p: RumPayload): { blobs: string[]; doubles: number[]; indexes: string[] } {
  return { blobs: [String(p.v), p.tier, p.path, p.fps50, p.fps10, p.explore], doubles: [p.lost, p.timeout, 1], indexes: [p.tier] };
}
