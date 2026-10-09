import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { content } from "./routes";

const outDir = path.join(process.cwd(), "out");
const cvFile = content.floors.roof.cv.fileName;

test("old /cv.pdf path redirects to the English CV", async ({ page }) => {
  const response = await page.request.get("/cv.pdf", { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(response.headers()["location"]).toBe(`/cv/${cvFile}-en.pdf`);
});

test("Cloudflare Pages _headers and _redirects are exported", () => {
  const headersFile = path.join(outDir, "_headers");
  expect(existsSync(headersFile)).toBe(true);
  const headers = readFileSync(headersFile, "utf8");
  expect(headers).toContain("/_next/static/*");
  expect(headers).toContain("immutable");
  expect(headers).toContain("Content-Security-Policy:");
  expect(existsSync(path.join(outDir, "_redirects"))).toBe(true);
});
