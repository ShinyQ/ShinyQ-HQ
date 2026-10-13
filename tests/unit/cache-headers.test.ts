import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CACHE_RULES, cacheProblems } from "../../scripts/deploy-smoke";

const headers = readFileSync(path.join(process.cwd(), "public", "_headers"), "utf8");

/** Header lines (trimmed) of one path block of a Cloudflare Pages `_headers` file. */
function block(pattern: string): string[] {
  const lines = headers.split(/\r?\n/);
  const start = lines.indexOf(pattern);
  expect(start, pattern).toBeGreaterThanOrEqual(0);
  const end = lines.findIndex((line, i) => i > start && !/^\s/.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).map((l) => l.trim()).filter(Boolean);
}

const cacheOf = (pattern: string) => block(pattern).filter((l) => l.startsWith("Cache-Control:"));

describe("cache rules for unhashed public assets", () => {
  it("cache each prefix as planned", () => {
    expect(cacheOf("/fonts/*")).toEqual(["Cache-Control: public, max-age=31536000, immutable"]);
    expect(cacheOf("/tech/*")).toEqual(["Cache-Control: public, max-age=604800, stale-while-revalidate=86400"]);
    for (const p of ["/media/*", "/floors/*", "/logos/*"]) expect(cacheOf(p), p).toEqual(["Cache-Control: public, max-age=86400, stale-while-revalidate=604800"]);
    expect(cacheOf("/cv/*")).toEqual(["Cache-Control: public, max-age=3600, must-revalidate"]);
    expect(cacheOf("/papers/*")).toEqual(["Cache-Control: public, max-age=86400, must-revalidate"]);
  });

  it("never sets Cache-Control from two nested rules (Cloudflare would join the values)", () => {
    const patterns = headers.split(/\r?\n/).filter((l) => /^\/\S*$/.test(l));
    const caching = patterns.filter((p) => cacheOf(p).length > 0).map((p) => p.replace(/\*$/, ""));
    for (const a of caching) for (const b of caching) if (a !== b) expect(b.startsWith(a), `${a} contains ${b}`).toBe(false);
  });

  it("smoke-checks production against the same values", () => {
    for (const rule of CACHE_RULES) {
      const pattern = rule.prefix.replace(/^(\/[^/]+\/).*$/, "$1*");
      expect(cacheOf(pattern), pattern).toEqual([`Cache-Control: ${rule.value}`]);
    }
    expect(cacheProblems({ "/tech/docker.svg": "public, max-age=604800, stale-while-revalidate=86400" })).toEqual([]);
    expect(cacheProblems({ "/tech/docker.svg": "max-age=0, must-revalidate" })).toEqual([
      "/tech/docker.svg Cache-Control is max-age=0, must-revalidate, expected public, max-age=604800, stale-while-revalidate=86400",
    ]);
  });
});
