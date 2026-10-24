import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, staticClosure } from "../helpers/import-graph";

const READER = "src/components/pdf-reader/PdfReader.tsx";
const PDF = "src/components/pdf-reader/pdf.ts";
const SHELL = "src/components/pdf-reader/ReaderDialog.tsx";
/** The dialogs that read a PDF: each reaches the reader only through the shell's dynamic import. */
const DIALOGS = ["src/components/guides/GuideDialog.tsx", "src/components/cv/CvDialog.tsx", "src/components/paper/PaperDialog.tsx"];
// A static value import or re-export of pdf.js (type-only imports are erased).
const STATIC_PDFJS = /^\s*(?:import|export)\s+(?!type\b)[^"';]*?from\s+["']pdfjs-dist[^"']*["']|^\s*import\s+["']pdfjs-dist[^"']*["']/m;

const source = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const pullsPdfjs = (closure: Set<string>) => [...closure].filter((f) => STATIC_PDFJS.test(source(f)));

describe("PDF reader chunk boundaries", () => {
  for (const entry of ["src/experience/Experience.tsx", "src/app/[locale]/layout.tsx"]) {
    it(`keeps pdf.js and the reader out of ${entry}'s static imports`, () => {
      const closure = staticClosure(entry);
      expect(closure.size).toBeGreaterThan(5);
      expect([READER, PDF].filter((f) => closure.has(f))).toEqual([]);
      expect(pullsPdfjs(closure)).toEqual([]);
    });
  }

  for (const dialog of DIALOGS) {
    it(`keeps the reader and pdf.js out of ${dialog}'s static imports (it uses the shared shell)`, () => {
      const closure = staticClosure(dialog);
      expect(closure.has(SHELL)).toBe(true);
      expect(closure.has(READER)).toBe(false);
      expect(pullsPdfjs(closure)).toEqual([]);
    });
  }

  it("loads the reader and pdf.js only through dynamic imports", () => {
    expect(source(SHELL)).toContain('import("./PdfReader")');
    expect(source(PDF)).toContain('import("pdfjs-dist")');
    // Older browsers get the legacy build and worker, also only through a dynamic import and a worker URL.
    expect(source(PDF)).toContain('import("pdfjs-dist/legacy/build/pdf.mjs")');
    expect(source(PDF)).toContain('new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url)');
    expect(staticClosure(READER).has("src/components/pdf-reader/reader-model.ts")).toBe(true);
    expect(pullsPdfjs(staticClosure(READER))).toEqual([]);
  });
});
