/**
 * Renders the owner's CV PDF (`public/cv/{fileName}.pdf`) into one webp per page for the in-site CV
 * viewer, so the site never ships a PDF renderer. Run it after replacing the PDF:
 *
 *   bun run cv:pages
 *
 * Writes `public/cv/pages/{fileName}-{n}.webp` (1600 px wide), `{fileName}-{n}-1200.webp` (1200 px wide,
 * what a 390 px DPR 3 phone needs instead of the 1600 one), `{fileName}-{n}-800.webp` (800 px wide),
 * all near-lossless (`WEBP_NEAR_LOSSLESS`), and the manifest `content/generated/cv-pages.json` (page
 * sizes plus the PDF's sha256, which `tests/content/cv.test.ts` compares with the committed PDF).
 * The output is committed, so CI and the build need no PDF tooling. Needs poppler (`pdftoppm`) and
 * libwebp (`cwebp`) on the PATH (macOS: `brew install poppler webp`).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WEBP_NEAR_LOSSLESS, pngSize, renderPng, sha256 as fileSha256, toWebp } from "./pdf-pages";

export const CV_PAGE_WIDTHS = { large: 1600, medium: 1200, small: 800 } as const;

export interface CvPage {
  /** 1-based page number. */
  n: number;
  src: string;
  width: number;
  height: number;
  srcMedium: string;
  widthMedium: number;
  heightMedium: number;
  srcSmall: string;
  widthSmall: number;
  heightSmall: number;
}

export interface CvPagesManifest {
  fileName: string;
  sha256: string;
  pages: CvPage[];
}

function main() {
  const root = process.cwd();
  const content = JSON.parse(readFileSync(path.join(root, "content", "site-content.json"), "utf8"));
  const fileName: string = content.floors.roof.cv.fileName;
  const pdf = path.join(root, "public", "cv", `${fileName}.pdf`);
  const sha256 = fileSha256(pdf);

  const outDir = path.join(root, "public", "cv", "pages");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const tmp = mkdtempSync(path.join(tmpdir(), "cv-pages-"));

  try {
    const large = renderPng(pdf, CV_PAGE_WIDTHS.large, tmp);
    const medium = renderPng(pdf, CV_PAGE_WIDTHS.medium, tmp);
    const small = renderPng(pdf, CV_PAGE_WIDTHS.small, tmp);
    if (large.length === 0 || large.length !== small.length || large.length !== medium.length) throw new Error("pdftoppm produced no pages");
    const pages: CvPage[] = large.map((png, i) => {
      const n = i + 1;
      const name = `${fileName}-${n}.webp`;
      const nameMedium = `${fileName}-${n}-${CV_PAGE_WIDTHS.medium}.webp`;
      const nameSmall = `${fileName}-${n}-${CV_PAGE_WIDTHS.small}.webp`;
      toWebp(png, path.join(outDir, name), WEBP_NEAR_LOSSLESS);
      toWebp(medium[i], path.join(outDir, nameMedium), WEBP_NEAR_LOSSLESS);
      toWebp(small[i], path.join(outDir, nameSmall), WEBP_NEAR_LOSSLESS);
      const big = pngSize(png);
      const mid = pngSize(medium[i]);
      const little = pngSize(small[i]);
      return {
        n,
        src: `/cv/pages/${name}`,
        width: big.width,
        height: big.height,
        srcMedium: `/cv/pages/${nameMedium}`,
        widthMedium: mid.width,
        heightMedium: mid.height,
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
