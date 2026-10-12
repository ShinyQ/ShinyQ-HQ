/**
 * `floor:thumbs` step 2: converts the "floor thumbnail" captures (e2e/screenshots.spec.ts, written to
 * screenshots/floor-thumbs/{id}.png) into the elevator picker thumbnails public/floors/{id}.webp:
 * 320 x 180, lossy, no alpha, no metadata. Needs libwebp (`cwebp`) on the PATH: `brew install webp`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

const FLOORS = ["L1", "L2", "L3", "L4", "RF"] as const;
const SOURCE = path.join("screenshots", "floor-thumbs");
const OUT = path.join("public", "floors");

mkdirSync(OUT, { recursive: true });
for (const id of FLOORS) {
  const png = path.join(SOURCE, `${id}.png`);
  if (!existsSync(png)) throw new Error(`missing ${png}: run the "floor thumbnail" captures first (bun run floor:thumbs)`);
  const out = path.join(OUT, `${id}.webp`);
  const result = spawnSync("cwebp", ["-quiet", "-noalpha", "-q", "62", "-m", "6", "-resize", "320", "180", "-metadata", "none", png, "-o", out], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`cwebp failed for ${id}: ${result.stderr || result.error?.message || "unknown error"}`);
  console.log(`${out} ${(statSync(out).size / 1024).toFixed(1)} KB`);
}
