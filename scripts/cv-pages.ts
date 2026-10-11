/**
 * Renders the owner's CV PDF (`public/cv/{fileName}.pdf`) into one webp per page for the in-site CV
 * viewer, so the site never ships a PDF renderer. Run it after replacing the PDF:
 *
 *   bun run cv:pages
 *
 * Writes `public/cv/pages/{fileName}-{n}.webp` (1600 px wide), `{fileName}-{n}-800.webp` (800 px wide)
 * and the manifest `content/generated/cv-pages.json` (page sizes plus the PDF's sha256, which
 * `tests/content/cv.test.ts` compares with the committed PDF). The output is committed, so CI and
 * the build need no PDF tooling. Needs poppler (`pdftoppm`) and libwebp (`cwebp`) on the PATH
 * (macOS: `brew install poppler webp`).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const CV_PAGE_WIDTHS = { large: 1600, small: 800 } as const;
// Lossless keeps text crisp and is smaller than lossy for a text page (few colors, flat background).
const WEBP = ["-lossless", "-z", "9"];

export interface CvPage {
  /** 1-based page number. */
  n: number;
  src: string;
  width: number;
  height: number;
  srcSmall: string;
  widthSmall: number;
  heightSmall: number;
}

export interface CvPagesManifest {
  fileName: string;
  sha256: string;
  pages: CvPage[];
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw new Error(`${command} is not available (${result.error.message}). Install poppler and webp.`);
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr}`);
}

/** Width and height of a PNG from its IHDR chunk. */
function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function render(pdf: string, width: number, outDir: string): string[] {
  const prefix = path.join(outDir, `w${width}`);
  run("pdftoppm", ["-png", "-scale-to-x", String(width), "-scale-to-y", "-1", "-aa", "yes", "-aaVector", "yes", pdf, prefix]);
  return readdirSync(outDir)
    .filter((f) => f.startsWith(`w${width}-`) && f.endsWith(".png"))
    .sort((a, b) => Number(a.match(/-(\d+)\.png$/)![1]) - Number(b.match(/-(\d+)\.png$/)![1]))
    .map((f) => path.join(outDir, f));
}

function main() {
  const root = process.cwd();
  const content = JSON.parse(readFileSync(path.join(root, "content", "site-content.json"), "utf8"));
  const fileName: string = content.floors.roof.cv.fileName;
  const pdf = path.join(root, "public", "cv", `${fileName}.pdf`);
  const sha256 = createHash("sha256").update(readFileSync(pdf)).digest("hex");

  const outDir = path.join(root, "public", "cv", "pages");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const tmp = mkdtempSync(path.join(tmpdir(), "cv-pages-"));

  try {
    const large = render(pdf, CV_PAGE_WIDTHS.large, tmp);
    const small = render(pdf, CV_PAGE_WIDTHS.small, tmp);
    if (large.length === 0 || large.length !== small.length) throw new Error("pdftoppm produced no pages");
    const pages: CvPage[] = large.map((png, i) => {
      const n = i + 1;
      const name = `${fileName}-${n}.webp`;
      const nameSmall = `${fileName}-${n}-${CV_PAGE_WIDTHS.small}.webp`;
      run("cwebp", ["-quiet", ...WEBP, "-metadata", "none", png, "-o", path.join(outDir, name)]);
      run("cwebp", ["-quiet", ...WEBP, "-metadata", "none", small[i], "-o", path.join(outDir, nameSmall)]);
      const big = pngSize(png);
      const little = pngSize(small[i]);
      return {
        n,
        src: `/cv/pages/${name}`,
        width: big.width,
        height: big.height,
        srcSmall: `/cv/pages/${nameSmall}`,
        widthSmall: little.width,
        heightSmall: little.height,
      };
    });
    const manifest: CvPagesManifest = { fileName, sha256, pages };
    writeFileSync(path.join(root, "content", "generated", "cv-pages.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`cv-pages: ${pages.length} pages from ${fileName}.pdf`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (import.meta.main) main();
