/**
 * Builds the Ask the HQ knowledge pack and safety lists into functions/_generated/ (gitignored; the safety list can hold
 * private blocklist terms). Runs in `bun run build` and `bun run typecheck`. Outputs:
 * - `pack.json`: the stored pack (text plus BM25 index), uploaded to Workers KV by `scripts/ask-pack.ts publish`, never bundled;
 * - `fallback.json`: the small fallback text pack bundled with the Function (`FALLBACK_CHUNKS`), indexed only when served;
 * - `pack-meta.json`: the bundle's pin (`{ schema, version, packDate, sha256, bytes }` of `pack.json`);
 * - `safety.json`: the output blocklist (always bundled, never in KV).
 * Fails when a pack holds a blocklisted term (client names, C3), is over its byte caps (`PACK_MAX_BYTES`,
 * `PACK_VALUE_MAX_BYTES`, `FALLBACK_MAX_BYTES`), or lacks a required chunk (spec section 4).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildPackArtifacts } from "@/ask/pack";
import { buildRepoPack } from "@/ask/repo-pack";

const OUT_DIR = path.join(process.cwd(), "functions", "_generated");
const { pack, safety, errors } = buildRepoPack();
const artifacts = buildPackArtifacts(pack, safety.blocklist);
const failures = [...errors, ...artifacts.errors];
if (failures.length) {
  console.error(`Knowledge pack failed its checks:\n- ${[...new Set(failures)].join("\n- ")}`);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
// The pack is no longer bundled (it lives in KV); drop the old output so nothing imports it by mistake.
rmSync(path.join(OUT_DIR, "knowledge.json"), { force: true });
writeFileSync(path.join(OUT_DIR, "pack.json"), artifacts.json);
writeFileSync(path.join(OUT_DIR, "fallback.json"), artifacts.fallbackJson);
writeFileSync(path.join(OUT_DIR, "pack-meta.json"), `${JSON.stringify(artifacts.meta, null, 2)}\n`);
writeFileSync(path.join(OUT_DIR, "safety.json"), JSON.stringify(safety));
const kb = (bytes: number) => (bytes / 1024).toFixed(1);
console.log(
  `Knowledge pack ${pack.packVersion}: ${pack.chunks.length} chunks, ${kb(Buffer.byteLength(JSON.stringify(pack)))} KB text, ${kb(artifacts.meta.bytes)} KB stored, fallback ${kb(Buffer.byteLength(artifacts.fallbackJson))} KB text, as of ${pack.packDate}.`,
);
