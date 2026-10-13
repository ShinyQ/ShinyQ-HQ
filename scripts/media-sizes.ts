/**
 * Writes the 1200 px "<name>.w1200.webp" rendition of every pod gallery image wider than 1200 px, so
 * cards and gallery tiles pick a sharp source on DPR 2 and 3 screens without loading the full file.
 * Idempotent (skips existing files unless --force). Needs cwebp. Usage: bun scripts/media-sizes.ts [--force]
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { getContent } from "@/content/load";
import { MID_WIDTH, midSrc } from "@/content/media";
import { run } from "./pdf-pages";

const force = process.argv.includes("--force");
let written = 0;
for (const pod of getContent().floors.labs.pods) {
  for (const asset of pod.assets.filter((a) => a.width > MID_WIDTH)) {
    const out = path.join(process.cwd(), "public", midSrc(asset.src));
    if (existsSync(out) && !force) continue;
    const input = path.join(process.cwd(), "public", asset.src);
    run("cwebp", ["-quiet", "-q", "85", "-m", "6", "-sharp_yuv", "-resize", String(MID_WIDTH), "0", "-metadata", "none", input, "-o", out]);
    written++;
  }
}
console.log(`media-sizes: ${written} renditions written`);
