/**
 * Builds the Ask the HQ knowledge pack and safety lists into functions/_generated/ (gitignored;
 * the safety list can hold private blocklist terms). Runs in `bun run build` and `bun run typecheck`.
 * Fails when the pack holds a blocklisted term (client names, C3), is over 200 KB, or lacks the
 * profile, now and contact chunks (spec section 4).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildRepoPack } from "@/ask/repo-pack";

const OUT_DIR = path.join(process.cwd(), "functions", "_generated");
const { pack, safety, errors } = buildRepoPack();
if (errors.length) {
  console.error(`Knowledge pack failed its checks:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(path.join(OUT_DIR, "knowledge.json"), JSON.stringify(pack));
writeFileSync(path.join(OUT_DIR, "safety.json"), JSON.stringify(safety));
const kb = (Buffer.byteLength(JSON.stringify(pack)) / 1024).toFixed(1);
console.log(`Knowledge pack ${pack.packVersion}: ${pack.chunks.length} chunks, ${kb} KB, as of ${pack.packDate}.`);
