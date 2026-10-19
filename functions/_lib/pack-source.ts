import { hydratePack, indexPack, PACK_SCHEMA } from "./pack-index";
import { sha256Hex } from "./security";
import type { AskEnv, KnowledgePack, KvNamespace, StoredPack } from "./types";

/**
 * Where the Ask Function gets its knowledge pack (spec 2026-10-19 section 4.4): per-isolate memory, then Workers KV
 * (`pack:current` pointer, then the immutable `pack:v1:<version>` value, checked by SHA-256, schema and shape), then
 * the bundle's own pinned version, then the small bundled fallback pack. Never throws: a KV outage serves the fallback.
 */

/** Which tier served a request (Analytics Engine blob12). `pin` and `fallback` stay visible while reused from memory. */
export type PackTier = "memory" | "kv" | "pin" | "fallback";

export interface LoadedPack {
  pack: KnowledgePack;
  vocabulary: ReadonlySet<string>;
  tier: PackTier;
}

/** `pack:current`: written by `scripts/ask-pack.ts` (flip, pin, rollback) only after the value validated. */
export interface PackPointer {
  schema: number;
  version: string;
  packDate: string;
  sha256: string;
  bytes: number;
  commit?: string;
  publishedAt?: string;
}

/** The bundle's pin (`functions/_generated/pack-meta.json`): the version this build was published with. */
export interface PackPin {
  schema: number;
  version: string;
  packDate: string;
  sha256: string;
}

export interface PackSourceOptions {
  /** Bundled fallback text pack (`functions/_generated/fallback.json`), indexed only when first served. */
  fallback: KnowledgePack;
  pin: PackPin;
  now?: () => number;
}

export const POINTER_KEY = "pack:current";
export const packKey = (version: string) => `pack:v${PACK_SCHEMA}:${version}`;
/** The pointer is re-read at most this often per isolate. */
export const POINTER_TTL_MS = 60_000;
/** KV location cache of the pointer (seconds; KV's minimum is 30). */
export const POINTER_CACHE_TTL = 60;
/** KV location cache of a value: values are immutable, so a day. */
export const VALUE_CACHE_TTL = 86_400;
/** After a failed KV read the isolate waits this long before reading again (an outage costs one read per 10 s, not one per request). */
export const NEGATIVE_TTL_MS = 10_000;
/** Chunks every served pack must hold (`REQUIRED_CHUNKS` in src/ask/pack.ts). */
export const SERVED_REQUIRED_CHUNKS = ["profile", "now", "contact"] as const;

const VERSION = /^[0-9a-f]{16}$/;
const SHA = /^[0-9a-f]{64}$/;

export function parsePointer(raw: string | null): PackPointer | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<PackPointer> | null;
    if (!p || typeof p !== "object" || typeof p.schema !== "number" || typeof p.version !== "string" || !VERSION.test(p.version) || typeof p.sha256 !== "string" || !SHA.test(p.sha256)) return null;
    return { schema: p.schema, version: p.version, packDate: typeof p.packDate === "string" ? p.packDate : "", sha256: p.sha256, bytes: Number(p.bytes) || 0, ...(p.commit ? { commit: String(p.commit) } : {}), ...(p.publishedAt ? { publishedAt: String(p.publishedAt) } : {}) };
  } catch {
    return null;
  }
}

/** Cheap shape checks of a parsed value (the build ran the full ones; the hash guards the bytes). */
export function isServableStoredPack(value: unknown, version: string): value is StoredPack {
  const stored = value as StoredPack | null;
  if (!stored || typeof stored !== "object" || stored.schema !== PACK_SCHEMA) return false;
  const { pack, index } = stored;
  if (!pack || typeof pack !== "object" || pack.packVersion !== version || typeof pack.packDate !== "string" || !Array.isArray(pack.chunks)) return false;
  if (!Array.isArray(pack.entities) || !Array.isArray(pack.orgs) || !pack.contact) return false;
  if (!SERVED_REQUIRED_CHUNKS.every((id) => pack.chunks.some((c) => c?.id === id))) return false;
  if (!index || !Array.isArray(index.terms) || !Array.isArray(index.postings) || index.terms.length !== index.postings.length) return false;
  return Array.isArray(index.len) && index.len.length === pack.chunks.length && typeof index.vocabulary === "string";
}

/** Reads, verifies and hydrates one value. Null for a missing or invalid value; throws when KV itself fails. */
async function readValue(kv: KvNamespace, version: string, sha256: string): Promise<KnowledgePack | null> {
  const text = await kv.get(packKey(version), { cacheTtl: VALUE_CACHE_TTL });
  if (text === null) return null;
  if ((await sha256Hex(text)) !== sha256) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return isServableStoredPack(parsed, version) ? hydratePack(parsed).pack : null;
}

interface Current {
  pack: KnowledgePack;
  /** Tier that produced it: `kv` is reported as `memory` when reused. */
  source: Exclude<PackTier, "memory">;
}

export function createPackSource(options: PackSourceOptions) {
  const { fallback, pin } = options;
  const now = options.now ?? (() => Date.now());

  let pointer: PackPointer | null = null;
  let pointerAt = Number.NEGATIVE_INFINITY;
  let current: Current | null = null;
  let resolvedAt = Number.NEGATIVE_INFINITY;
  let failedAt = Number.NEGATIVE_INFINITY;
  let inflight: Promise<LoadedPack> | null = null;
  /** `version:sha256` pairs that failed their checks: not read again by this isolate. */
  const rejected = new Set<string>();

  const loaded = (pack: KnowledgePack, tier: PackTier): LoadedPack => ({ pack, vocabulary: indexPack(pack).vocabulary, tier });
  const serveFallback = () => loaded(fallback, "fallback");
  const serveCurrent = (fresh: boolean): LoadedPack => (current ? loaded(current.pack, current.source === "kv" && !fresh ? "memory" : current.source) : serveFallback());

  async function tryValue(kv: KvNamespace, version: string, sha256: string): Promise<KnowledgePack | null> {
    const key = `${version}:${sha256}`;
    if (rejected.has(key)) return null;
    if (current && current.pack.packVersion === version && current.source !== "fallback") return current.pack;
    const pack = await readValue(kv, version, sha256);
    if (!pack) rejected.add(key);
    return pack;
  }

  async function readPointer(kv: KvNamespace, t: number): Promise<PackPointer | null> {
    pointer = parsePointer(await kv.get(POINTER_KEY, { cacheTtl: POINTER_CACHE_TTL }));
    pointerAt = t;
    return pointer;
  }

  async function resolve(kv: KvNamespace, t: number): Promise<LoadedPack> {
    try {
      const p = await readPointer(kv, t);
      let next: Current | null = null;
      if (p && p.schema === PACK_SCHEMA) {
        const pack = await tryValue(kv, p.version, p.sha256);
        if (pack) next = { pack, source: "kv" };
      }
      if (!next && pin.schema === PACK_SCHEMA) {
        const pack = await tryValue(kv, pin.version, pin.sha256);
        if (pack) next = { pack, source: "pin" };
      }
      const reused = Boolean(next && current && next.pack === current.pack && next.source === "kv");
      current = next ?? { pack: fallback, source: "fallback" };
      resolvedAt = t;
      return serveCurrent(!reused);
    } catch {
      // KV failed: keep serving what this isolate has (or the fallback) and stay off KV for NEGATIVE_TTL_MS.
      failedAt = t;
      return serveCurrent(false);
    }
  }

  function load(env: AskEnv): Promise<LoadedPack> {
    const kv = env.ASK_KV;
    if (env.ASK_PACK_SOURCE === "bundle" || !kv) return Promise.resolve(serveFallback());
    const t = now();
    if (current && t - resolvedAt < POINTER_TTL_MS) return Promise.resolve(serveCurrent(false));
    if (t - failedAt < NEGATIVE_TTL_MS) return Promise.resolve(serveCurrent(false));
    if (!inflight) inflight = resolve(kv, t).finally(() => (inflight = null));
    return inflight;
  }

  /** The status endpoint's `asOf`: the pointer's date (memory or KV), else the served pack's, the pin's or the fallback's. */
  async function packDate(env: AskEnv): Promise<string> {
    const kv = env.ASK_KV;
    if (env.ASK_PACK_SOURCE === "bundle" || !kv) return fallback.packDate;
    const t = now();
    const known = () => (pointer?.schema === PACK_SCHEMA && pointer.packDate) || current?.pack.packDate || pin.packDate || fallback.packDate;
    if (t - pointerAt < POINTER_TTL_MS || t - failedAt < NEGATIVE_TTL_MS) return known();
    try {
      await readPointer(kv, t);
    } catch {
      failedAt = t;
    }
    return known();
  }

  return { load, packDate };
}

export type PackSource = ReturnType<typeof createPackSource>;

/** A source that always serves one in-memory pack (tests, `scripts/ask-eval.ts`): tier `memory`, no KV reads. */
export function staticPackSource(pack: KnowledgePack): PackSource {
  const loaded: LoadedPack = { pack, vocabulary: indexPack(pack).vocabulary, tier: "memory" };
  return { load: async () => loaded, packDate: async () => pack.packDate };
}
