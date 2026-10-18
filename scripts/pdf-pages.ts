/**
 * Shared PDF to page image helpers for the in-site document viewers: `scripts/cv-pages.ts` (the CV)
 * and `scripts/paper-pages.ts` (paper PDFs). Needs poppler (`pdftoppm`) and libwebp (`cwebp`) on the
 * PATH (macOS: `brew install poppler webp`). The output is committed, so CI and the build need neither.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/** Lossless keeps text crisp and is smaller than lossy for a text page (few colors, flat background). */
export const WEBP_LOSSLESS = ["-lossless", "-z", "9"];
/**
 * Near-lossless (the lossless bitstream after a light preprocessing of antialiased edge pixels, at most
 * 16 of 255 per channel): visually identical to lossless on a text page (SSIM >= 0.997) and about 25%
 * smaller. Lossy webp and AVIF need more bytes for the same SSIM on text.
 */
export const WEBP_NEAR_LOSSLESS = ["-near_lossless", "0", "-z", "9"];
/** Lossy fallback for scanned or rasterized pages, where lossless is several times larger. */
export const WEBP_LOSSY = ["-q", "72", "-m", "6", "-sharp_yuv"];

export function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw new Error(`${command} is not available (${result.error.message}). Install poppler and webp.`);
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr}`);
  return result.stdout;
}

export function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** Width and height of a PNG from its IHDR chunk. */
export function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Renders every page of `pdf` to `{outDir}/w{width}-{n}.png`, `width` px wide; returns the files in page order. */
export function renderPng(pdf: string, width: number, outDir: string): string[] {
  const prefix = path.join(outDir, `w${width}`);
  run("pdftoppm", ["-png", "-scale-to-x", String(width), "-scale-to-y", "-1", "-aa", "yes", "-aaVector", "yes", pdf, prefix]);
  return readdirSync(outDir)
    .filter((f) => f.startsWith(`w${width}-`) && f.endsWith(".png"))
    .sort((a, b) => Number(a.match(/-(\d+)\.png$/)![1]) - Number(b.match(/-(\d+)\.png$/)![1]))
    .map((f) => path.join(outDir, f));
}

/** Encodes one PNG to webp without metadata. */
export function toWebp(png: string, out: string, options: readonly string[] = WEBP_LOSSLESS): void {
  run("cwebp", ["-quiet", ...options, "-metadata", "none", png, "-o", out]);
}
