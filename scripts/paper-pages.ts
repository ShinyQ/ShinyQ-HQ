/**
 * Renders the self-hosted paper PDFs (`public/papers/{file}.pdf`, one per publication with a
 * `document` in `content/site-content.json`) into page images for the in-site paper reader, so the
 * site never ships a PDF renderer. Run it after adding or replacing a paper PDF:
 *
 *   bun run paper:pages
 *
 * Writes `public/papers/{file}/{file}-{n}.webp` (1400 px wide; per page the smaller of lossless and
 * lossy webp, so text pages stay crisp and scanned pages stay small) and the manifest
 * `content/generated/paper-pages.json` (page sizes plus each PDF's sha256, which
 * `tests/content/papers.test.ts` compares with the committed PDFs). The output is committed. Needs
 * poppler and webp (see `scripts/pdf-pages.ts`). Read the redaction and publisher rules in docs/content.md
 * ("Paper PDFs") before adding a PDF.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { findBlockedLabels, loadBlocklist } from "../src/content/safety";
import { WEBP_LOSSLESS, WEBP_LOSSY, pngSize, renderPng, run, sha256, toWebp } from "./pdf-pages";

export const PAPER_PAGE_WIDTH = 1400;

/**
 * Personal data that must never be extractable from a hosted paper PDF (redact it by rasterizing the
 * page, see docs/content.md "Paper PDFs"). Generic on purpose: the real values are never written down here.
 */
export const PERSONAL_DATA_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "student ID (NIM)", pattern: /\bNIM\s*[:.]?\s*\d{6,}/i },
  { name: "staff ID (NIP)", pattern: /\bNIP\s*[:.]?\s*\d{6,}/i },
  { name: "national ID or tax number", pattern: /\b(?:NIK|NPWP)\b/ },
  { name: "home address (RT/RW, Kel/Des)", pattern: /\b(?:RT\s*\/\s*RW|KEL\s*\/\s*DES)\b/i },
  { name: "phone number", pattern: /(?:\+62|\b0)8\d{2}[\s-]?\d{3,4}[\s-]?\d{3,5}\b/ },
];

/** Problems in the extractable text of a paper PDF: personal data patterns and blocklisted names. */
export function paperTextProblems(text: string, terms: readonly string[]): string[] {
  return [...PERSONAL_DATA_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name), ...findBlockedLabels(text, terms)];
}

/** Text layer of a PDF via poppler's `pdftotext`. */
export function pdfToText(pdf: string): string {
  return run("pdftotext", ["-q", pdf, "-"]);
}

export interface PaperPage {
  /** 1-based page number. */
  n: number;
  src: string;
  width: number;
  height: number;
}

export interface PaperPagesManifest {
  documents: Record<string, { sha256: string; bytes: number; pages: PaperPage[] }>;
}

function main() {
  const root = process.cwd();
  const content = JSON.parse(readFileSync(path.join(root, "content", "site-content.json"), "utf8"));
  const files: string[] = content.floors.library.publications.flatMap((p: { document?: { file: string } }) => (p.document ? [p.document.file] : []));
  const dir = path.join(root, "public", "papers");
  const manifest: PaperPagesManifest = { documents: {} };

  // Page folders of PDFs that are gone are removed.
  for (const entry of readdirSync(dir)) {
    if (statSync(path.join(dir, entry)).isDirectory() && !files.includes(entry)) rmSync(path.join(dir, entry), { recursive: true });
  }

  for (const file of files) {
    const pdf = path.join(dir, `${file}.pdf`);
    const problems = paperTextProblems(pdfToText(pdf), loadBlocklist());
    if (problems.length) throw new Error(`${file}.pdf: ${problems.join(", ")}. Redact these pages (docs/content.md "Paper PDFs") before hosting the PDF.`);
    const outDir = path.join(dir, file);
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    const tmp = mkdtempSync(path.join(tmpdir(), "paper-pages-"));
    try {
      const pngs = renderPng(pdf, PAPER_PAGE_WIDTH, tmp);
      if (pngs.length === 0) throw new Error(`pdftoppm produced no pages for ${file}.pdf`);
      const pages = pngs.map((png, i): PaperPage => {
        const n = i + 1;
        const name = `${file}-${n}.webp`;
        const lossless = path.join(tmp, `${n}-lossless.webp`);
        const lossy = path.join(tmp, `${n}-lossy.webp`);
        toWebp(png, lossless, WEBP_LOSSLESS);
        toWebp(png, lossy, WEBP_LOSSY);
        const best = statSync(lossless).size <= statSync(lossy).size ? lossless : lossy;
        writeFileSync(path.join(outDir, name), readFileSync(best));
        return { n, src: `/papers/${file}/${name}`, ...pngSize(png) };
      });
      const bytes = pages.reduce((sum, p) => sum + statSync(path.join(root, "public", p.src)).size, 0);
      manifest.documents[file] = { sha256: sha256(pdf), bytes, pages };
      console.log(`paper-pages: ${file}.pdf, ${pages.length} pages, ${Math.round(bytes / 1024)} KB of images`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  writeFileSync(path.join(root, "content", "generated", "paper-pages.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

if (import.meta.main) main();
