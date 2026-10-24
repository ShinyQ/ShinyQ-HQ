/**
 * Builds the Ask the HQ knowledge pack into functions/_generated/ (gitignored). Runs in `bun run build` and
 * `bun run typecheck`. Outputs:
 * - `pack.json`: the stored pack (text, BM25 index and the bge-m3 vectors from `content/generated/ask-embeddings.json`), uploaded to Workers KV by `scripts/ask-pack.ts publish`, never bundled;
 * - `fallback.json`: the small fallback text pack bundled with the Function (`FALLBACK_CHUNKS`), indexed only when served;
 * - `pack-meta.json`: the bundle's pin (`{ schema, version, packDate, sha256, bytes }` of `pack.json`);
 * Fails when a pack is over its byte caps (`PACK_MAX_BYTES`,
 * `PACK_VALUE_MAX_BYTES`, `FALLBACK_MAX_BYTES`), or lacks a required chunk (spec section 4).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildPackArtifacts } from "@/ask/pack";
import { buildRepoPack } from "@/ask/repo-pack";
import { buildStoredVectors, readEmbeddingCache, readExemplars } from "@/ask/embeddings";

const OUT_DIR = path.join(process.cwd(), "functions", "_generated");
const { pack, errors } = buildRepoPack();
// Semantic search vectors (owner decision 2026-10-24): a chunk without one ranks by BM25 only until `bun scripts/ask-embed.ts` runs.
const { vectors, missing } = buildStoredVectors(pack, readEmbeddingCache(), readExemplars());
if (missing.length) console.log(`::warning::${missing.length} Ask chunk(s) have no embedding and rank by BM25 only (${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", ..." : ""}): run bun scripts/ask-embed.ts --cli and commit content/generated/ask-embeddings.json.`);
const artifacts = buildPackArtifacts(pack, vectors);
const failures = [...errors, ...artifacts.errors];
if (failures.length) {
  console.error(`Knowledge pack failed its checks:\n- ${[...new Set(failures)].join("\n- ")}`);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
// Outputs no longer built (the pack lives in KV; the safety list is gone): drop them so nothing imports one by mistake.
for (const old of ["knowledge.json", "safety.json"]) rmSync(path.join(OUT_DIR, old), { force: true });
writeFileSync(path.join(OUT_DIR, "pack.json"), artifacts.json);
writeFileSync(path.join(OUT_DIR, "fallback.json"), artifacts.fallbackJson);
writeFileSync(path.join(OUT_DIR, "pack-meta.json"), `${JSON.stringify(artifacts.meta, null, 2)}\n`);
const kb = (bytes: number) => (bytes / 1024).toFixed(1);
console.log(
  `Knowledge pack ${artifacts.meta.version}: ${pack.chunks.length} chunks, ${kb(Buffer.byteLength(JSON.stringify(pack)))} KB text, ${kb(artifacts.meta.bytes)} KB stored, fallback ${kb(Buffer.byteLength(artifacts.fallbackJson))} KB text, ${vectors ? `${pack.chunks.length - missing.length} vectors` : "no vectors"}, as of ${pack.packDate}.`,
);
