import type { AiBinding, KnowledgePack, StoredPack } from "./types";

/**
 * Multilingual semantic search next to BM25 (owner decision 2026-10-24). Every chunk has a `@cf/baai/bge-m3` embedding
 * (1024 dimensions, EN and ID in one space) computed at build time and stored int8-quantized in the stored pack; a
 * question gets one embedding call per request. Retrieval fuses the BM25 and cosine rankings (reciprocal-rank
 * fusion, `functions/_lib/retrieve.ts`); an error, a timeout or no vectors keeps the BM25-only path.
 */

export const EMBED_MODEL = "@cf/baai/bge-m3";
export const EMBED_DIMS = 1024;
/** An embedding call slower than this is abandoned and the question is answered with BM25 alone. */
export const EMBED_TIMEOUT_MS = 300;

/** Router labels of the semantic assist (content/ask/router-exemplars.json). */
export const ROUTER_LABELS = ["civic", "mentoring", "offtopic", "private"] as const;
export type RouterLabel = (typeof ROUTER_LABELS)[number];

/**
 * Vectors as stored in the pack (`StoredPack.vectors`): base64 of int8 values, `dims` per row. `chunks` has one row
 * per pack chunk in pack order (all zeros: no vector, the chunk ranks by BM25 only); `router` has the exemplar rows
 * of each label.
 */
export interface StoredVectors {
  model: string;
  dims: number;
  chunks: string;
  router?: Partial<Record<RouterLabel, string>>;
}

/** Vectors ready to score: int8 rows and their norms (a zero norm means no vector). */
export interface PackVectors {
  dims: number;
  rows: Int8Array;
  norms: Float32Array;
  router: Partial<Record<RouterLabel, { rows: Int8Array; norms: Float32Array }>>;
}

/** int8 quantization of one embedding: each value scaled by 127 over the largest magnitude (cosine ignores the scale). */
export function quantize(vector: ArrayLike<number>): Int8Array {
  let max = 0;
  for (let i = 0; i < vector.length; i++) max = Math.max(max, Math.abs(vector[i]));
  const out = new Int8Array(vector.length);
  if (!max) return out;
  for (let i = 0; i < vector.length; i++) out[i] = Math.round((vector[i] / max) * 127);
  return out;
}

export function encodeRows(rows: Int8Array): string {
  const bytes = new Uint8Array(rows.buffer, rows.byteOffset, rows.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function decodeRows(base64: string): Int8Array {
  const binary = atob(base64);
  const out = new Int8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = (binary.charCodeAt(i) << 24) >> 24;
  return out;
}

function norms(rows: Int8Array, dims: number): Float32Array {
  const out = new Float32Array(rows.length / dims);
  for (let r = 0; r < out.length; r++) {
    let sum = 0;
    for (let i = r * dims; i < (r + 1) * dims; i++) sum += rows[i] * rows[i];
    out[r] = Math.sqrt(sum);
  }
  return out;
}

const hydrated = new WeakMap<KnowledgePack, PackVectors | null>();

/**
 * The vectors of a stored pack, decoded once per pack (isolate memory). Missing, malformed or wrong-sized vectors give
 * null, and retrieval stays BM25-only.
 */
export function hydrateVectors(stored: Pick<StoredPack, "pack" | "vectors">): PackVectors | null {
  const hit = hydrated.get(stored.pack);
  if (hit !== undefined) return hit;
  let out: PackVectors | null = null;
  try {
    const v = stored.vectors;
    if (v && v.model === EMBED_MODEL && v.dims > 0 && typeof v.chunks === "string") {
      const rows = decodeRows(v.chunks);
      if (rows.length === stored.pack.chunks.length * v.dims) {
        const router: PackVectors["router"] = {};
        for (const label of ROUTER_LABELS) {
          const raw = v.router?.[label];
          if (typeof raw !== "string") continue;
          const r = decodeRows(raw);
          if (r.length && r.length % v.dims === 0) router[label] = { rows: r, norms: norms(r, v.dims) };
        }
        out = { dims: v.dims, rows, norms: norms(rows, v.dims), router };
      }
    }
  } catch {
    out = null;
  }
  hydrated.set(stored.pack, out);
  return out;
}

/** The vectors registered for a pack (by `hydrateVectors`), or null. */
export function packVectors(pack: KnowledgePack): PackVectors | null {
  return hydrated.get(pack) ?? null;
}

/** Cosine of a question vector with every row (0 for a row without a vector). */
export function cosines(question: Float32Array, rows: Int8Array, rowNorms: Float32Array, dims: number): Float32Array {
  let qn = 0;
  for (let i = 0; i < dims; i++) qn += question[i] * question[i];
  qn = Math.sqrt(qn);
  const out = new Float32Array(rowNorms.length);
  if (!qn) return out;
  for (let r = 0; r < out.length; r++) {
    if (!rowNorms[r]) continue;
    let dot = 0;
    const base = r * dims;
    for (let i = 0; i < dims; i++) dot += question[i] * rows[base + i];
    out[r] = dot / (qn * rowNorms[r]);
  }
  return out;
}

/** Highest cosine of a question with each router label's exemplars. */
export function routerSignals(question: Float32Array, vectors: PackVectors): Partial<Record<RouterLabel, number>> {
  const out: Partial<Record<RouterLabel, number>> = {};
  for (const label of ROUTER_LABELS) {
    const set = vectors.router[label];
    if (set) out[label] = Math.max(...cosines(question, set.rows, set.norms, vectors.dims));
  }
  return out;
}

/** The first embedding of a Workers AI response (`{ shape, data: number[][] }`), or null. */
export function extractEmbedding(response: unknown): Float32Array | null {
  const data = (response as { data?: unknown } | null)?.data ?? (response as { result?: { data?: unknown } } | null)?.result?.data;
  const first = Array.isArray(data) ? data[0] : null;
  if (!Array.isArray(first) || first.length !== EMBED_DIMS || !first.every((x) => typeof x === "number" && Number.isFinite(x))) return null;
  return Float32Array.from(first);
}

/** Embeds one question; null on error or timeout (`EMBED_TIMEOUT_MS`), so the caller keeps BM25. */
export type Embedder = (text: string) => Promise<Float32Array | null>;

export function bindingEmbedder(ai: AiBinding, timeoutMs = EMBED_TIMEOUT_MS): Embedder {
  return async (text) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const call = ai.run(EMBED_MODEL, { text: [text.slice(0, 1000)] }).then(extractEmbedding);
      const late = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      });
      return await Promise.race([call.catch(() => null), late]);
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
