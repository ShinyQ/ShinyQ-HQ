/**
 * Pure helpers for the Highlights Hall interiors (owner decision 2026-11-04), client safe (no loader, no zod): the results
 * bars and the wins tokens. `highlights.ts` re-exports them for build-time callers.
 */
import type { WinTier } from "./highlights";

/** Units a result side may carry, with the dimension it measures and its factor to the dimension's base unit. */
const RESULT_UNIT: Record<string, { dim: string; factor: number }> = {
  "%": { dim: "pct", factor: 1 },
  ms: { dim: "time", factor: 0.001 },
  s: { dim: "time", factor: 1 },
  B: { dim: "size", factor: 0.001 },
  KB: { dim: "size", factor: 1 },
  MB: { dim: "size", factor: 1000 },
};

function resultSide(raw: string): { value: number; dim: string } | null {
  const m = raw.trim().match(/^[~<>]?\s*([\d.,]+)\s*(%|ms|s|B|KB|MB)?$/);
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const unit = RESULT_UNIT[m[2] ?? ""] ?? { dim: "count", factor: 1 };
  return { value: value * unit.factor, dim: unit.dim };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * A result's before and after as two comparable numbers (the hall's results bars, owner decision 2026-11-04), in the
 * dimension's base unit; `log` when one side is over 20 times the other. Null when the value does not split into two
 * sides of the same dimension, or both are zero: the station shows that result as text only.
 */
export type ResultBar = { before: number; after: number; scale: "linear" | "log" } | null;

export function resultBars(value: string): ResultBar {
  const parts = value.split(/\s*(?:→|\bto\b)\s*/);
  if (parts.length !== 2) return null;
  const [a, b] = parts.map(resultSide);
  if (!a || !b || a.dim !== b.dim || Math.max(a.value, b.value) <= 0) return null;
  const low = Math.min(a.value, b.value);
  const ratio = low > 0 ? Math.max(a.value, b.value) / low : 1;
  return { before: round3(a.value), after: round3(b.value), scale: ratio > 20 ? "log" : "linear" };
}

/** One orbiting token of the wins station: gold in the inner ring and larger, silver and bronze in the middle, honors outside and small. */
export type WinToken = { tier: WinTier; ring: 0 | 1 | 2; angle: number; size: number };

const TOKEN_RING: Record<WinTier, { ring: 0 | 1 | 2; size: number }> = {
  gold: { ring: 0, size: 1.4 },
  silver: { ring: 1, size: 1 },
  bronze: { ring: 1, size: 1 },
  honor: { ring: 2, size: 0.6 },
};

/** One token per award and honor (`winTiers` counts), spread evenly around its ring; tiers sharing a ring interleave by angle offset. */
export function winTokens(tiers: readonly { tier: WinTier; count: number }[]): WinToken[] {
  const perRing = [0, 0, 0];
  for (const t of tiers) perRing[TOKEN_RING[t.tier].ring] += t.count;
  const placed = [0, 0, 0];
  return tiers.flatMap((t) =>
    Array.from({ length: t.count }, () => {
      const { ring, size } = TOKEN_RING[t.tier];
      const angle = (placed[ring]++ / Math.max(perRing[ring], 1)) * Math.PI * 2 + ring * 0.4;
      return { tier: t.tier, ring, angle, size };
    }),
  );
}

/** The number in a result side, its prefix ("~", "<") and its suffix (the unit), for re-formatting. */
function sideParts(raw: string): { pre: string; num: string; unit: string } | null {
  const m = raw.trim().match(/^([~<>]?\s*)([\d.,]+)\s*(%|ms|s|B|KB|MB)?$/);
  return m ? { pre: m[1], num: m[2], unit: m[3] ?? "" } : null;
}

/**
 * The frames of a result's morph on wake (owner, 2026-11-04: "each verified number morphs from before to after"): `steps`
 * texts from the before value to the after value, written in the after side's unit and decimals, ending on the result's
 * own text. A value `resultBars` cannot read stays as it is (one frame).
 */
export function morphFrames(value: string, steps = 9): string[] {
  const bars = resultBars(value);
  const parts = value.split(/\s*(?:→|\bto\b)\s*/);
  const after = parts.length === 2 ? sideParts(parts[1]) : null;
  if (!bars || !after) return [value];
  const factor = RESULT_UNIT[after.unit]?.factor ?? 1;
  const decimals = after.num.split(".")[1]?.length ?? 0;
  const space = /\s/.test(parts[1].trim().replace(/^[~<>]\s*/, "").replace(/^[\d.,]+/, "").slice(0, 1)) ? " " : "";
  const frames: string[] = [];
  for (let k = 0; k < steps - 1; k++) {
    const t = k / (steps - 1);
    const v = (bars.before + (bars.after - bars.before) * t * t * (3 - 2 * t)) / factor;
    const text = v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(decimals);
    frames.push(`${after.pre}${text}${space}${after.unit}`);
  }
  frames.push(value);
  return frames;
}

/** Typing frames for a terminal line: the text growing a few characters per frame behind a cursor, ending on the text itself. */
export function typeFrames(text: string, steps = 14): string[] {
  const frames: string[] = [];
  for (let k = 1; k < steps; k++) frames.push(`${text.slice(0, Math.ceil((text.length * k) / steps))}_`);
  frames.push(text);
  return frames;
}
