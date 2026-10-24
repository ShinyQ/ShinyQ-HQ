/**
 * Build-time embeddings of the Ask knowledge pack (owner decision 2026-10-24). The vectors live in a committed cache,
 * `content/generated/ask-embeddings.json`, keyed by a hash of the model and the embedded text, so a build needs no
 * network and only changed chunks are re-embedded (`bun scripts/ask-embed.ts`). Node only (never import it into a
 * client component or the Function).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { EMBED_DIMS, EMBED_MODEL, encodeRows, ROUTER_LABELS, type RouterLabel, type StoredVectors } from "../../functions/_lib/vectors";
import type { KnowledgeChunk, KnowledgePack } from "../../functions/_lib/types";

export const EMBEDDINGS_PATH = path.join(process.cwd(), "content", "generated", "ask-embeddings.json");
export const EXEMPLARS_PATH = path.join(process.cwd(), "content", "ask", "router-exemplars.json");

/** The committed cache: base64 int8 rows (`EMBED_DIMS` values) by `embedKey`. */
export interface EmbeddingCache {
  model: string;
  dims: number;
  vectors: Record<string, string>;
}

/** Text a chunk is embedded from: its title and English text (bge-m3 places Indonesian questions in the same space). */
export function embedText(chunk: Pick<KnowledgeChunk, "title" | "text_en">): string {
  return `${chunk.title}\n${chunk.text_en}`.slice(0, 4000);
}

export function embedKey(text: string, model = EMBED_MODEL): string {
  return createHash("sha256").update(`${model}\n${text}`).digest("hex").slice(0, 16);
}

export function readEmbeddingCache(file = EMBEDDINGS_PATH): EmbeddingCache {
  if (!existsSync(file)) return { model: EMBED_MODEL, dims: EMBED_DIMS, vectors: {} };
  const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<EmbeddingCache>;
  if (raw.model !== EMBED_MODEL || raw.dims !== EMBED_DIMS || !raw.vectors || typeof raw.vectors !== "object") return { model: EMBED_MODEL, dims: EMBED_DIMS, vectors: {} };
  return { model: EMBED_MODEL, dims: EMBED_DIMS, vectors: raw.vectors };
}

/** Sorted keys, one entry per line, so a content change touches only its own lines. */
export function writeEmbeddingCache(cache: EmbeddingCache, file = EMBEDDINGS_PATH): void {
  const keys = Object.keys(cache.vectors).sort();
  const body = keys.map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(cache.vectors[k])}`).join(",\n");
  writeFileSync(file, `{\n  "model": ${JSON.stringify(cache.model)},\n  "dims": ${cache.dims},\n  "vectors": {\n${body}\n  }\n}\n`);
}

export type RouterExemplars = Record<RouterLabel, string[]>;

export function readExemplars(file = EXEMPLARS_PATH): RouterExemplars {
  const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  return Object.fromEntries(ROUTER_LABELS.map((label) => [label, Array.isArray(raw[label]) ? (raw[label] as unknown[]).filter((q): q is string => typeof q === "string") : []])) as RouterExemplars;
}

/** Every text the pack and the router need a vector for, by key. */
export function wantedTexts(pack: KnowledgePack, exemplars: RouterExemplars): Map<string, string> {
  const out = new Map<string, string>();
  for (const chunk of pack.chunks) {
    const text = embedText(chunk);
    out.set(embedKey(text), text);
  }
  for (const label of ROUTER_LABELS) for (const q of exemplars[label]) out.set(embedKey(q), q);
  return out;
}

const decode = (base64: string) => Int8Array.from(Buffer.from(base64, "base64"), (b) => (b << 24) >> 24);

/**
 * The pack's stored vectors from the cache: one row per chunk in pack order (zeros for a chunk the cache lacks), and
 * the router exemplar rows. `missing` lists the chunk ids without a vector (they rank by BM25 only).
 */
export function buildStoredVectors(pack: KnowledgePack, cache: EmbeddingCache, exemplars: RouterExemplars): { vectors?: StoredVectors; missing: string[] } {
  const missing: string[] = [];
  const rows = new Int8Array(pack.chunks.length * EMBED_DIMS);
  let found = 0;
  pack.chunks.forEach((chunk, i) => {
    const hit = cache.vectors[embedKey(embedText(chunk))];
    const row = hit ? decode(hit) : null;
    if (row && row.length === EMBED_DIMS) {
      rows.set(row, i * EMBED_DIMS);
      found++;
    } else missing.push(chunk.id);
  });
  if (!found) return { missing };
  const router: Partial<Record<RouterLabel, string>> = {};
  for (const label of ROUTER_LABELS) {
    const list = exemplars[label].map((q) => cache.vectors[embedKey(q)]).filter((v): v is string => typeof v === "string").map(decode).filter((r) => r.length === EMBED_DIMS);
    if (!list.length) continue;
    const all = new Int8Array(list.length * EMBED_DIMS);
    list.forEach((r, i) => all.set(r, i * EMBED_DIMS));
    router[label] = encodeRows(all);
  }
  return { vectors: { model: EMBED_MODEL, dims: EMBED_DIMS, chunks: encodeRows(rows), router }, missing };
}
