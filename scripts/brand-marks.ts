#!/usr/bin/env bun
/**
 * Writes every rendering of the rover brand mark from `src/lib/brand-mark.ts`:
 *
 *   public/brand/rover-mark.svg         app tile (dark rounded square)
 *   public/brand/rover-mark-glyph.svg   the mark alone, transparent background
 *   public/brand/rover-mark-mono.svg    one color (currentColor; black where nothing sets it)
 *   public/brand/rover-lockup.svg       mark plus the "ShinyQ HQ" wordmark, for dark backgrounds
 *   public/brand/rover-lockup-light.svg the same, for light backgrounds
 *   src/app/icon.svg                    favicon (Next.js metadata icon)
 *   src/app/apple-icon.png              180 px home screen icon (full bleed: iOS rounds it)
 *   src/app/favicon.ico                 16, 32 and 48 px PNGs for browsers without SVG favicons
 *
 * The lockup outlines the wordmark with fonttools (scripts/brand-wordmark.py), so it needs python3 with
 * fonttools and brotli. tests/unit/brand-mark.test.tsx keeps the SVG marks equal to the module.
 *
 *   bun scripts/brand-marks.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { BRAND_COLORS, MARK, MARK_FILES, MARK_LABEL, roverMarkBody, roverMarkSvg } from "../src/lib/brand-mark";

const root = path.resolve(import.meta.dir, "..");
const out = (p: string) => path.join(root, p);


const LOCKUP_LABEL = "ShinyQ HQ";

interface Wordmark {
  words: { d: string; x0: number; advance: number }[];
  unitsPerEm: number;
  capHeight: number;
  width: number;
}

function wordmark(): Wordmark {
  const run = Bun.spawnSync(["python3", "scripts/brand-wordmark.py", "ShinyQ", "HQ"], { cwd: root });
  if (run.exitCode !== 0) throw new Error(`brand-wordmark.py failed (needs python3 with fonttools and brotli):\n${run.stderr.toString()}`);
  return JSON.parse(run.stdout.toString()) as Wordmark;
}

function lockup(w: Wordmark, ink: string): string {
  const cap = 44;
  const scale = cap / w.capHeight;
  const x = 140;
  const baseline = MARK.size / 2 + cap / 2;
  const width = Math.ceil(x + w.width * scale + 6);
  const [name, hq] = w.words;
  // userSpaceOnUse resolves in the referencing path's space, which is the scaled font space.
  const hqX0 = hq.x0;
  const hqX1 = hq.x0 + hq.advance;
  const C = BRAND_COLORS;
  const tf = `translate(${x} ${baseline}) scale(${scale.toFixed(5)})`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${MARK.size}" viewBox="0 0 ${width} ${MARK.size}" role="img" aria-label="${LOCKUP_LABEL}">` +
    `<title>${LOCKUP_LABEL}</title>` +
    `<defs><linearGradient id="lk-hq" gradientUnits="userSpaceOnUse" x1="${Math.round(hqX0)}" y1="0" x2="${Math.round(hqX1)}" y2="0">` +
    `<stop offset="0" stop-color="${C.cyan}"/><stop offset=".55" stop-color="${C.indigo}"/><stop offset="1" stop-color="${C.lilac}"/></linearGradient></defs>` +
    `<g>${roverMarkBody("glyph", "lk")}</g>` +
    `<path transform="${tf}" fill="${ink}" d="${name.d}"/>` +
    `<path transform="${tf}" fill="url(#lk-hq)" d="${hq.d}"/>` +
    `</svg>\n`
  );
}

async function png(svg: string, size: number): Promise<Buffer> {
  return sharp(Buffer.from(svg), { density: (72 * size * 4) / MARK.size })
    .resize(size, size)
    .png()
    .toBuffer();
}

/** An ICO file holding PNG images (supported by every browser that reads .ico). */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

if (import.meta.main) {
  for (const [file, make] of Object.entries(MARK_FILES)) writeFileSync(out(file), make());
  const w = wordmark();
  writeFileSync(out("public/brand/rover-lockup.svg"), lockup(w, "#F4F4F5"));
  writeFileSync(out("public/brand/rover-lockup-light.svg"), lockup(w, "#0A0A12"));
  writeFileSync(out("src/app/apple-icon.png"), await png(roverMarkSvg("tile", { tileRadius: 0 }), 180));
  const sizes = [16, 32, 48];
  const tile = roverMarkSvg("tile");
  writeFileSync(out("src/app/favicon.ico"), ico(await Promise.all(sizes.map(async (size) => ({ size, data: await png(tile, size) })))));
  console.log(`wrote ${Object.keys(MARK_FILES).length + 4} files (${MARK_LABEL})`);
}
