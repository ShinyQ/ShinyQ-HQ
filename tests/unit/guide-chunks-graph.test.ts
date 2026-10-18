import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, staticClosure } from "../helpers/import-graph";

const READER = "src/components/guides/GuideReader.tsx";
const PDF = "src/components/guides/pdf.ts";
// A static value import or re-export of pdf.js (type-only imports are erased).
const STATIC_PDFJS = /^\s*(?:import|export)\s+(?!type\b)[^"';]*?from\s+["']pdfjs-dist[^"']*["']|^\s*import\s+["']pdfjs-dist[^"']*["']/m;

const source = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const pullsPdfjs = (closure: Set<string>) => [...closure].filter((f) => STATIC_PDFJS.test(source(f)));

describe("study guide reader chunk boundaries", () => {
  for (const entry of ["src/experience/Experience.tsx", "src/app/[locale]/layout.tsx"]) {
    it(`keeps pdf.js and the reader out of ${entry}'s static imports`, () => {
      const closure = staticClosure(entry);
      expect(closure.size).toBeGreaterThan(5);
      expect([READER, PDF].filter((f) => closure.has(f))).toEqual([]);
      expect(pullsPdfjs(closure)).toEqual([]);
    });
  }

  it("loads the reader and pdf.js only through dynamic imports", () => {
    expect(source("src/components/guides/GuideDialog.tsx")).toContain('import("./GuideReader")');
    expect(source(PDF)).toContain('import("pdfjs-dist")');
    expect(staticClosure(READER).has("src/components/guides/reader-model.ts")).toBe(true);
    expect(pullsPdfjs(staticClosure(READER))).toEqual([]);
  });
});
