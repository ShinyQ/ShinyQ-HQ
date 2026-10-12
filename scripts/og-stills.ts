#!/usr/bin/env bun
/**
 * `og:stills` step 2: converts the "og still" captures (e2e/screenshots.spec.ts, 2400x1260 PNGs in
 * screenshots/og-stills/, one per floor) into the committed OG backgrounds public/og-assets/floor-{id}.jpg (1200x630,
 * JPEG q86, no metadata) and, with --photo <png>, writes the owner's photo as
 * public/og-assets/kurniadi-photo.png (400x400). The build reads only these files, so it never
 * needs WebGL. Run after `bun run build`: `E2E_PORT=4438 bun run og:stills [--photo path/to/photo.png]`.
 */
import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { OG_PHOTO_PATH, OG_STILLS, ogStillPath } from "../src/lib/og-layout";

const SOURCE = path.join("screenshots", "og-stills");
const toPublic = (publicPath: string) => path.join("public", publicPath.replace(/^\//, ""));

mkdirSync(path.join("public", "og-assets"), { recursive: true });
for (const still of OG_STILLS) {
  const png = path.join(SOURCE, `${still}.png`);
  if (!existsSync(png)) throw new Error(`missing ${png}: run the "og still" captures first (bun run og:stills)`);
  const { channels } = await sharp(png).stats();
  const luma = 0.2126 * channels[0].mean + 0.7152 * channels[1].mean + 0.0722 * channels[2].mean;
  if (luma < 6) throw new Error(`${png} looks blank (mean luma ${luma.toFixed(1)}): the scene did not render`);
  const out = toPublic(ogStillPath(still));
  await sharp(png).resize(1200, 630, { fit: "cover", kernel: "lanczos3" }).jpeg({ quality: 86, mozjpeg: true, chromaSubsampling: "4:4:4" }).toFile(out);
  console.log(`${out} ${(statSync(out).size / 1024).toFixed(1)} KB (mean luma ${luma.toFixed(1)})`);
}

const photoArg = process.argv.indexOf("--photo");
if (photoArg > 0) {
  const out = toPublic(OG_PHOTO_PATH);
  await sharp(process.argv[photoArg + 1]).resize(400, 400, { fit: "cover" }).png({ compressionLevel: 9 }).toFile(out);
  console.log(`${out} ${(statSync(out).size / 1024).toFixed(1)} KB`);
}
if (!existsSync(toPublic(OG_PHOTO_PATH))) throw new Error(`missing public${OG_PHOTO_PATH}: pass --photo <png> once`);
