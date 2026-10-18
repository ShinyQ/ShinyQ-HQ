import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Threat T13 (docs/superpowers/specs/2026-10-11-ask-hq-design.md): the only CSP change Ask the HQ
 * may make is adding Turnstile (https://challenges.cloudflare.com) to script-src and frame-src.
 * Any other edit to the site CSP must update this literal on purpose.
 */
const SITE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://challenges.cloudflare.com",
  "connect-src 'self' https://cloudflareinsights.com",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-src 'self' https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const headers = readFileSync(path.join(process.cwd(), "public", "_headers"), "utf8");

/** Header lines (trimmed) of one path block of a Cloudflare Pages `_headers` file. */
function block(pattern: string): string[] {
  const lines = headers.split(/\r?\n/);
  const start = lines.indexOf(pattern);
  expect(start, pattern).toBeGreaterThanOrEqual(0);
  const end = lines.findIndex((line, i) => i > start && !/^\s/.test(line));
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .map((line) => line.trim())
    .filter(Boolean);
}

const cspOf = (lines: string[]) => lines.filter((line) => line.startsWith("Content-Security-Policy:")).map((line) => line.slice("Content-Security-Policy:".length).trim());

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...values]) => [name, values]),
  );
}

describe("Content-Security-Policy (public/_headers)", () => {
  it("is exactly the reviewed site policy", () => {
    expect(cspOf(block("/*"))).toEqual([SITE_CSP]);
  });

  it("allows Turnstile only in script-src and frame-src", () => {
    const csp = directives(SITE_CSP);
    for (const [name, values] of csp) {
      const turnstile = values.includes("https://challenges.cloudflare.com");
      expect(turnstile, name).toBe(name === "script-src" || name === "frame-src");
    }
  });

  it("keeps connect-src same-origin plus analytics, with no challenges host", () => {
    const connect = directives(cspOf(block("/*"))[0]).get("connect-src");
    expect(connect).toEqual(["'self'", "https://cloudflareinsights.com"]);
    expect(connect?.some((value) => value.includes("challenges"))).toBe(false);
  });

  it("keeps the CV block on its own framing policy", () => {
    const cv = block("/cv/*");
    expect(cv).toContain("! Content-Security-Policy");
    expect(cspOf(cv)).toEqual(["frame-ancestors 'self'"]);
  });

  it("keeps paper PDFs out of frames, with the PDF viewer free of the site policy", () => {
    const papers = block("/papers/*");
    expect(papers).toContain("! Content-Security-Policy");
    expect(cspOf(papers)).toEqual(["frame-ancestors 'none'"]);
    expect(papers).not.toContain("! X-Frame-Options");
  });

  it("keeps study guide PDFs out of frames, with the PDF viewer free of the site policy", () => {
    const guides = block("/api/guides/*");
    expect(guides).toContain("! Content-Security-Policy");
    expect(cspOf(guides)).toEqual(["frame-ancestors 'none'"]);
    expect(guides).not.toContain("! X-Frame-Options");
  });
});
