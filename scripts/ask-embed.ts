/**
 * Fills the Ask embedding cache (`content/generated/ask-embeddings.json`, owner decision 2026-10-24): embeds every
 * knowledge chunk and router exemplar the cache lacks with Workers AI `@cf/baai/bge-m3`, int8-quantized, and drops
 * entries no chunk uses any more. Run it after a content change (CI warns while chunks lack vectors; they rank by
 * BM25 only until then); commit the cache.
 *
 *   bun scripts/ask-embed.ts --cli        # through the logged-in `cf` CLI
 *   CF_EVAL_TOKEN=... CF_ACCOUNT_ID=... bun scripts/ask-embed.ts
 *   bun scripts/ask-embed.ts --check      # no network: exit 1 when a chunk or exemplar lacks a vector
 *   bun scripts/ask-embed.ts --dry        # print what would be embedded and the neuron estimate
 *   bun scripts/ask-embed.ts --deploy     # deploy.yml: embed what is missing with CF_EVAL_TOKEN, keep stale entries,
 *                                         # and never fail (a missing vector only means BM25 for that chunk)
 *
 * Cost: about 1,075 neurons per million input tokens; the whole pack (about 70,000 tokens) is about 75 neurons, a
 * changed chunk a fraction of one.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { readEmbeddingCache, readExemplars, wantedTexts, writeEmbeddingCache } from "@/ask/embeddings";
import { buildRepoPack } from "@/ask/repo-pack";
import { EMBED_DIMS, EMBED_MODEL, encodeRows, quantize } from "../functions/_lib/vectors";

const run = promisify(execFile);
/** Texts per Workers AI request. */
export const EMBED_BATCH = 32;
/** Neurons per input token of bge-m3 (Workers AI pricing, October 2026). */
export const NEURONS_PER_TOKEN = 1075 / 1_000_000;

type Embed = (texts: string[]) => Promise<number[][]>;

const rows = (json: unknown): number[][] => {
  const data = (json as { data?: unknown; result?: { data?: unknown } }).data ?? (json as { result?: { data?: unknown } }).result?.data;
  if (!Array.isArray(data) || !data.every((r) => Array.isArray(r) && r.length === EMBED_DIMS)) throw new Error("Workers AI: unexpected embedding response");
  return data as number[][];
};

function restEmbed(token: string, account: string): Embed {
  return async (texts) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${EMBED_MODEL}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: texts }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Workers AI ${response.status}`);
    return rows(await response.json());
  };
}

function cliEmbed(): Embed {
  return async (texts) => {
    const dir = mkdtempSync(path.join(tmpdir(), "ask-embed-"));
    try {
      const file = path.join(dir, "body.json");
      writeFileSync(file, JSON.stringify({ text: texts }));
      const { stdout } = await run("cf", ["ai", "run", EMBED_MODEL, "--body", `@${file}`], { maxBuffer: 64 * 1024 * 1024 });
      return rows(JSON.parse(stdout));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

async function main() {
  const args = process.argv.slice(2);
  const { pack, errors } = buildRepoPack();
  if (errors.length) throw new Error(`Knowledge pack failed its checks: ${errors.join("; ")}`);
  const cache = readEmbeddingCache();
  const wanted = wantedTexts(pack, readExemplars());
  const missing = [...wanted].filter(([key]) => !cache.vectors[key]);
  const stale = Object.keys(cache.vectors).filter((key) => !wanted.has(key));
  const tokens = Math.round(missing.reduce((sum, [, text]) => sum + text.length, 0) / 4);
  console.log(`Ask embeddings: ${wanted.size} wanted, ${missing.length} missing (about ${tokens} tokens, ${(tokens * NEURONS_PER_TOKEN).toFixed(1)} neurons), ${stale.length} stale.`);
  if (args.includes("--check")) {
    if (missing.length) {
      console.log(`::warning::${missing.length} Ask chunk(s) or router exemplar(s) have no embedding and rank by BM25 only: run bun scripts/ask-embed.ts --cli and commit content/generated/ask-embeddings.json.`);
      process.exit(1);
    }
    return;
  }
  if (args.includes("--dry")) return;
  const deploy = args.includes("--deploy");
  if (deploy && missing.length && !(process.env.CF_EVAL_TOKEN && (process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID))) {
    console.log("::notice::CF_EVAL_TOKEN or the account id is not set; the new chunks rank by BM25 only.");
    return;
  }
  if (missing.length) {
    const token = process.env.CF_EVAL_TOKEN;
    const account = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
    const embed = args.includes("--cli") ? cliEmbed() : token && account ? restEmbed(token, account) : null;
    if (!embed) {
      console.error("Set CF_EVAL_TOKEN and CF_ACCOUNT_ID, or pass --cli to use the logged-in cf CLI.");
      process.exit(2);
    }
    for (let i = 0; i < missing.length; i += EMBED_BATCH) {
      const batch = missing.slice(i, i + EMBED_BATCH);
      const vectors = await embed(batch.map(([, text]) => text));
      batch.forEach(([key], j) => {
        cache.vectors[key] = encodeRows(quantize(vectors[j]));
      });
      console.log(`embedded ${Math.min(i + EMBED_BATCH, missing.length)}/${missing.length}`);
    }
  }
  if (!deploy) for (const key of stale) delete cache.vectors[key];
  writeEmbeddingCache(cache);
  console.log(`Wrote ${Object.keys(cache.vectors).length} vectors.`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error((error as Error).message);
    process.exit(process.argv.includes("--deploy") ? 0 : 1);
  });
}
