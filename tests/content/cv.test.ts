import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getRoof } from "@/content/load";
import { CV_FILE_NAME, CV_PAGES, cvDownloadName, cvPdfPath } from "@/lib/cv";
import manifest from "../../content/generated/cv-pages.json";
import { parseRedirects } from "../../scripts/serve-static";
import { webpChunks, webpSize } from "../helpers/webp";

const root = process.cwd();
const { fileName } = getRoof().cv;
const pdf = cvPdfPath(fileName);
/**
 * sha256 of the owner's current CV (2026-10-23 refresh: the Forward Deployed AI Engineer title). When the owner sends a new CV:
 * replace the PDF under the same name, run `bun run cv:pages`, update this pin and the site facts
 * in `tests/content/cv-facts.test.ts` in the same PR.
 */
const CV_SHA256 = "ece8731a77681d75f665224efd7484705c35c69756a83bf7b78b59917e9ef662";
const pdfSha = () => createHash("sha256").update(readFileSync(path.join(root, "public", pdf))).digest("hex");

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

  it("is the owner's current CV (pinned sha256)", () => {
    expect(pdfSha(), "public/cv PDF is not the 2026-10-23 CV").toBe(CV_SHA256);
  });

  it("is the only PDF in public/cv (no per-locale copies); page images live in public/cv/pages", () => {
    const dir = path.join(root, "public", "cv");
    expect(readdirSync(dir).sort()).toEqual([`${fileName}.pdf`, "pages"]);
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

describe("CV page images (in-site viewer, rendered by `bun run cv:pages`)", () => {
  it("were rendered from the committed PDF (run `bun run cv:pages` after replacing it)", () => {
    const sha = createHash("sha256").update(readFileSync(path.join(root, "public", pdf))).digest("hex");
    expect(manifest.fileName).toBe(fileName);
    expect(CV_FILE_NAME).toBe(fileName);
    expect(manifest.sha256, "public/cv PDF changed: run `bun run cv:pages` and commit the output").toBe(sha);
  });

  it("are numbered pages with a large, a medium and a small webp each, and nothing else", () => {
    expect(CV_PAGES.length).toBeGreaterThan(0);
    const expected: string[] = [];
    CV_PAGES.forEach((page, i) => {
      expect(page.n).toBe(i + 1);
      expect(page.width).toBe(1600);
      expect(page.widthMedium).toBe(1200);
      expect(page.widthSmall).toBe(800);
      expect(page.height / page.width).toBeCloseTo(page.heightSmall / page.widthSmall, 2);
      expect(page.height / page.width).toBeCloseTo(page.heightMedium / page.widthMedium, 2);
      for (const src of [page.src, page.srcMedium, page.srcSmall]) {
        expect(src).toMatch(new RegExp(`^/cv/pages/${fileName}-${page.n}(-800|-1200)?\\.webp$`));
        const bytes = readFileSync(path.join(root, "public", src));
        expect(bytes.subarray(0, 4).toString("latin1")).toBe("RIFF");
        expect(bytes.subarray(8, 12).toString("latin1")).toBe("WEBP");
        expect(bytes.length).toBeLessThan(400_000);
        expected.push(path.basename(src));
      }
    });
    expect(readdirSync(path.join(root, "public", "cv", "pages")).sort()).toEqual(expected.sort());
  });

  it("are near-lossless webp (one VP8L frame, no metadata) within the per-width byte budget", () => {
    // Lossless at `-z 9` weighed 104 KB (page 1, 800 px); near-lossless 0 is visually identical (SSIM >= 0.998).
    const budget = { 800: 90_000, 1200: 150_000, 1600: 200_000 } as const;
    for (const page of CV_PAGES) {
      for (const [src, width] of [
        [page.srcSmall, page.widthSmall],
        [page.srcMedium, page.widthMedium],
        [page.src, page.width],
      ] as const) {
        const bytes = readFileSync(path.join(root, "public", src));
        expect(webpChunks(bytes), src).toEqual(["VP8L"]);
        expect(webpSize(bytes).width, src).toBe(width);
        expect(bytes.length, `${src}: run \`bun run cv:pages\` (near-lossless webp)`).toBeLessThan(budget[width as keyof typeof budget]);
      }
    }
  });
});
