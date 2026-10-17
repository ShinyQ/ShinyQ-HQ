import type { ModelBreaker } from "./model";
import type { KvNamespace, RateLimitBinding } from "./types";
import { utcDay } from "./security";

/**
 * Rate limits, global cap and circuit breaker (T8). KV is eventually consistent and the free plan
 * allows 1,000 writes a day, so the daily counters are approximate and fail soft; the AI Gateway
 * rate limit is the hard global backstop (docs/ask-runbook.md).
 */

export const PER_MINUTE = 8;
export const PER_DAY = 40;
export const DEFAULT_DAILY_CAP = 600;
const DAY_TTL = 2 * 24 * 60 * 60;

const minuteHits = new Map<string, number[]>();

/** Per-visitor 8 per minute: the rate limiting binding when bound, else a per-isolate sliding window. */
export async function minuteAllowed(key: string, now: number, binding?: RateLimitBinding): Promise<boolean> {
  if (binding) {
    try {
      return (await binding.limit({ key })).success;
    } catch {
      // Fall through to the in-memory window.
    }
  }
  const since = now - 60_000;
  const hits = (minuteHits.get(key) ?? []).filter((t) => t > since);
  if (minuteHits.size > 5000) {
    for (const [k, list] of minuteHits) if (!list.some((t) => t > since)) minuteHits.delete(k);
  }
  if (hits.length >= PER_MINUTE) {
    minuteHits.set(key, hits);
    return false;
  }
  hits.push(now);
  minuteHits.set(key, hits);
  return true;
}

export function resetMinuteWindow() {
  minuteHits.clear();
}

async function readCount(kv: KvNamespace | undefined, key: string): Promise<number> {
  if (!kv) return 0;
  try {
    return Number(await kv.get(key)) || 0;
  } catch {
    return 0;
  }
}

async function bump(kv: KvNamespace | undefined, key: string): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(key, String((await readCount(kv, key)) + 1), { expirationTtl: DAY_TTL });
  } catch {
    // KV write quota exhausted or a transient error: fail soft, the gateway limit still applies.
  }
}

export const visitorDayKey = (visitor: string, now: number) => `rl:v:${utcDay(now)}:${visitor}`;
export const globalDayKey = (now: number) => `rl:g:${utcDay(now)}`;

export async function visitorDayCount(kv: KvNamespace | undefined, visitor: string, now: number) {
  return readCount(kv, visitorDayKey(visitor, now));
}

export async function globalDayCount(kv: KvNamespace | undefined, now: number) {
  return readCount(kv, globalDayKey(now));
}

/** Counts one model call against the visitor's and the global daily budget. */
export async function countModelCall(kv: KvNamespace | undefined, visitor: string, now: number) {
  await Promise.all([bump(kv, visitorDayKey(visitor, now)), bump(kv, globalDayKey(now))]);
}

/** Seconds until the next UTC midnight (Retry-After for the daily limits). */
export function secondsToMidnight(now: number): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((next.getTime() - now) / 1000));
}

/**
 * Circuit breaker: when more than half of the last 5 minutes of model calls failed or produced
 * an output that the checks had to block (at least 10 samples), pause for 15 minutes. Plain
 * declines do not count, so a visitor cannot trip it with off-topic questions alone.
 */
export const BREAKER_WINDOW_MS = 5 * 60_000;
export const BREAKER_PAUSE_MS = 15 * 60_000;
export const BREAKER_MIN_SAMPLES = 10;
const BREAKER_KEY = "cb:until";

const samples: { at: number; bad: boolean }[] = [];
let pausedUntil = 0;

export function resetBreaker() {
  samples.length = 0;
  pausedUntil = 0;
}

export async function breakerOpen(kv: KvNamespace | undefined, now: number): Promise<boolean> {
  if (pausedUntil > now) return true;
  const until = await readCount(kv, BREAKER_KEY);
  if (until > now) {
    pausedUntil = until;
    return true;
  }
  return false;
}

/** Records one model call. Returns true when this sample tripped the breaker. */
export async function recordSample(kv: KvNamespace | undefined, bad: boolean, now: number): Promise<boolean> {
  samples.push({ at: now, bad });
  while (samples.length && samples[0].at < now - BREAKER_WINDOW_MS) samples.shift();
  const badCount = samples.filter((s) => s.bad).length;
  if (samples.length >= BREAKER_MIN_SAMPLES && badCount / samples.length > 0.5) {
    pausedUntil = now + BREAKER_PAUSE_MS;
    samples.length = 0;
    if (kv) {
      try {
        await kv.put(BREAKER_KEY, String(pausedUntil), { expirationTtl: Math.ceil(BREAKER_PAUSE_MS / 1000) + 60 });
      } catch {
        // The in-memory pause still holds for this isolate.
      }
    }
    return true;
  }
  return false;
}

/**
 * Per-model breaker: a tier that hit its quota, rate limit or an outage is skipped until `until`.
 * Memory is checked first, then KV (`mb:<key>`, the until timestamp in ms) so other isolates learn of it.
 * KV writes are scarce (1,000 a day), so only pauses of a minute or more are written, and KV errors fail soft.
 */
const modelPauses = new Map<string, number>();
const MODEL_BREAKER_MIN_KV_SECONDS = 60;

export function resetModelBreakers() {
  modelPauses.clear();
}

export function modelBreaker(kv: KvNamespace | undefined): ModelBreaker {
  return {
    async isOpen(key, now) {
      if ((modelPauses.get(key) ?? 0) > now) return true;
      const until = await readCount(kv, `mb:${key}`);
      if (until > now) {
        modelPauses.set(key, until);
        return true;
      }
      return false;
    },
    async trip(key, seconds, now) {
      modelPauses.set(key, now + seconds * 1000);
      if (!kv || seconds < MODEL_BREAKER_MIN_KV_SECONDS) return;
      try {
        await kv.put(`mb:${key}`, String(now + seconds * 1000), { expirationTtl: Math.ceil(seconds) + 60 });
      } catch {
        // The in-memory pause still holds for this isolate.
      }
    },
  };
}
