import { readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { getLibrary } from "@/content/load";
import { buildPaperPreview } from "@/content/papers";
import { PAPER_FILES, paperPages, paperPdfPath } from "@/lib/papers";
import manifest from "../../content/generated/paper-pages.json";
import { paperTextProblems, pdfToText } from "../../scripts/paper-pages";

const root = process.cwd();
const dir = path.join(root, "public", "papers");
const withDocs = getLibrary().publications.filter((p) => p.document);
const files = withDocs.map((p) => p.document!.file);

describe("paperTextProblems", () => {
  it("flags personal data labels and numbers, never the paper text", () => {
    expect(paperTextProblems("NIM : 1234567890")).toEqual(["student ID (NIM)"]);
    expect(paperTextProblems("NIP: 12345678")).toEqual(["staff ID (NIP)"]);
    expect(paperTextProblems("Jl. Contoh No. 1 RT/RW 001/002")).toEqual(["home address (RT/RW, Kel/Des)"]);
    expect(paperTextProblems("call 0812-3456-7890")).toEqual(["phone number"]);
    expect(paperTextProblems("Sentiment analysis with IndoBERT, 7500 tweets, doi 10.1109/x.2021.9689712")).toEqual([]);
  });
});

describe("paper PDFs (public/papers, read in the paper reader)", () => {
  it("exist for every publication with a document, and nothing else is in public/papers", () => {
    expect(files.length).toBeGreaterThan(0);
    const expected = files.flatMap((f) => [`${f}.pdf`, f]).sort();
    expect(readdirSync(dir).sort()).toEqual(expected);
    for (const file of files) {
      const pdf = path.join(root, "public", paperPdfPath(file));
      expect(readFileSync(pdf).subarray(0, 5).toString("latin1"), file).toBe("%PDF-");
      expect(statSync(pdf).size, file).toBeLessThan(5_000_000);
    }
  });

  it("have page images rendered from the committed PDF (run `bun run paper:pages` after a change)", () => {
    expect(Object.keys(manifest.documents).sort()).toEqual([...files].sort());
    expect([...PAPER_FILES].sort()).toEqual([...files].sort());
    for (const file of files) {
      const sha = createHash("sha256").update(readFileSync(path.join(dir, `${file}.pdf`))).digest("hex");
      expect(manifest.documents[file as keyof typeof manifest.documents].sha256, `${file}.pdf changed: run bun run paper:pages`).toBe(sha);
    }
  });

  it("are numbered 1400 px webp pages, each under 500 KB, and nothing else", () => {
    for (const file of files) {
      const pages = paperPages(file);
      expect(pages.length, file).toBeGreaterThan(0);
      pages.forEach((page, i) => {
        expect(page.n).toBe(i + 1);
        expect(page.width).toBe(1400);
        expect(page.src).toBe(`/papers/${file}/${file}-${page.n}.webp`);
        const bytes = readFileSync(path.join(root, "public", page.src));
        expect(bytes.subarray(0, 4).toString("latin1")).toBe("RIFF");
        expect(bytes.subarray(8, 12).toString("latin1")).toBe("WEBP");
        expect(bytes.length, page.src).toBeLessThan(500_000);
      });
      expect(readdirSync(path.join(dir, file)).sort()).toEqual(pages.map((p) => path.basename(p.src)).sort());
    }
  });

  it("keeps all paper files under the 10 MB budget", () => {
    const walk = (d: string): number =>
      readdirSync(d, { withFileTypes: true }).reduce((sum, e) => sum + (e.isDirectory() ? walk(path.join(d, e.name)) : statSync(path.join(d, e.name)).size), 0);
    expect(walk(dir) / 1024 / 1024).toBeLessThan(10);
  });

  // CI has no poppler; `bun run paper:pages` runs the same check locally before it renders a PDF.
  const hasPdftotext = !spawnSync("pdftotext", ["-v"]).error;
  it.skipIf(!hasPdftotext)("carry no extractable personal data (redacted pages are images)", () => {
    for (const file of files) expect(paperTextProblems(pdfToText(path.join(dir, `${file}.pdf`))), file).toEqual([]);
  });

  it("reach the paper preview with the page count, version and notice", () => {
    for (const pub of withDocs) {
      const preview = buildPaperPreview(pub, "en");
      expect(preview.document).toEqual({
        file: pub.document!.file,
        pdf: `/papers/${pub.document!.file}.pdf`,
        version: pub.document!.version,
        ...(pub.document!.notice ? { notice: pub.document!.notice } : {}),
        pageCount: paperPages(pub.document!.file).length,
      });
      if (pub.publisher === "IEEE") expect(pub.document).toMatchObject({ version: "manuscript", notice: "ieee" });
    }
  });
});
