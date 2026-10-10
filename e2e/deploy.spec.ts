import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { loadBlocklist, scanBuildOutput } from "../src/content/safety";
import { content } from "./routes";

const outDir = path.join(process.cwd(), "out");
const cvFile = content.floors.roof.cv.fileName;
const cvPdf = `/cv/${cvFile}.pdf`;

test("the CV PDF is served as a PDF", async ({ page }) => {
  const response = await page.request.get(cvPdf);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("pdf");
});

for (const old of ["/cv.pdf", "/en/cv.pdf", "/id/cv.pdf", `/cv/${cvFile}-en.pdf`, `/cv/${cvFile}-id.pdf`]) {
  test(`old CV path ${old} redirects to the one CV PDF`, async ({ page }) => {
    const response = await page.request.get(old, { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(response.headers()["location"]).toBe(cvPdf);
  });
}

test("Cloudflare Pages _headers and _redirects are exported", () => {
  const headersFile = path.join(outDir, "_headers");
  expect(existsSync(headersFile)).toBe(true);
  const headers = readFileSync(headersFile, "utf8");
  expect(headers).toContain("/_next/static/*");
  expect(headers).toContain("immutable");
  expect(headers).toContain("Content-Security-Policy:");
  expect(existsSync(path.join(outDir, "_redirects"))).toBe(true);
});

test("the export names no client company or other blocklisted term (C3)", () => {
  // Every page, RSC payload, sitemap and room data file of out/, against the merged
  // blocklist (committed client names plus the private list in CI).
  expect(existsSync(outDir)).toBe(true);
  expect(scanBuildOutput(outDir, loadBlocklist())).toEqual([]);
});
