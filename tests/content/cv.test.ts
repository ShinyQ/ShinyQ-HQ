import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getRoof } from "@/content/load";
import { cvDownloadName, cvPdfPath } from "@/lib/cv";
import { parseRedirects } from "../../scripts/serve-static";

const root = process.cwd();
const { fileName } = getRoof().cv;
const pdf = cvPdfPath(fileName);

describe("CV PDF (owner's file, served as-is for every locale)", () => {
  it("is one language-neutral path with a matching download name", () => {
    expect(pdf).toBe(`/cv/${fileName}.pdf`);
    expect(cvDownloadName(fileName)).toBe(`${fileName}.pdf`);
  });

  it("is committed under public/cv as a real PDF", () => {
    const file = path.join(root, "public", pdf);
    expect(existsSync(file), file).toBe(true);
    expect(readFileSync(file).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(statSync(file).size).toBeGreaterThan(10_000);
  });

  it("is the only file in public/cv (no per-locale copies)", () => {
    const dir = path.join(root, "public", "cv");
    expect(readdirSync(dir)).toEqual([`${fileName}.pdf`]);
  });

  it("keeps every old CV URL working with a 301 to the file", () => {
    const rules = parseRedirects(readFileSync(path.join(root, "public", "_redirects"), "utf8"));
    const old = ["/cv.pdf", "/en/cv.pdf", "/id/cv.pdf", `/cv/${fileName}-en.pdf`, `/cv/${fileName}-id.pdf`];
    for (const from of old) expect(rules.find((r) => r.from === from), from).toEqual({ from, to: pdf, status: 301 });
  });

  it("lets /{locale}/cv frame the PDF from the same origin only", () => {
    const headers = readFileSync(path.join(root, "public", "_headers"), "utf8");
    const block = (pattern: string) => {
      const lines = headers.split(/\r?\n/);
      const start = lines.indexOf(pattern);
      expect(start, pattern).toBeGreaterThanOrEqual(0);
      const end = lines.findIndex((l, i) => i > start && !/^\s/.test(l));
      return lines.slice(start + 1, end < 0 ? undefined : end).map((l) => l.trim());
    };
    const site = block("/*");
    const siteCsp = site.find((l) => l.startsWith("Content-Security-Policy:"))!;
    expect(siteCsp).toContain("frame-src 'self'");
    expect(siteCsp).toContain("frame-ancestors 'none'");
    expect(siteCsp).toContain("object-src 'none'");
    expect(site).toContain("X-Frame-Options: DENY");

    const cv = block("/cv/*");
    expect(cv).toEqual(
      expect.arrayContaining([
        "! Content-Security-Policy",
        "! X-Frame-Options",
        "Content-Security-Policy: frame-ancestors 'self'",
        "X-Frame-Options: SAMEORIGIN",
      ]),
    );
  });
});
