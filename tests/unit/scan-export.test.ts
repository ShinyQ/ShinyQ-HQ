import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { addScriptPolicy, sitePolicy } from "../../scripts/csp-hashes";

const HEADERS = readFileSync(path.join(process.cwd(), "public", "_headers"), "utf8");
const PAGE = '<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><script>a()</script></head><body><p>clean</p></body></html>';
mkdirSync(path.join(process.cwd(), "test-results"), { recursive: true });
const scratch = mkdtempSync(path.join(process.cwd(), "test-results", "scan-export-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("scan-export (tests P4)", () => {
  const run = (env: Record<string, string>) => {
    const summary = path.join(scratch, `summary-${Object.keys(env).join("-")}.md`);
    writeFileSync(summary, "");
    const result = spawnSync("bun", ["scripts/scan-export.ts", path.join(scratch, "out")], {
      encoding: "utf8",
      env: { ...process.env, GITHUB_STEP_SUMMARY: summary, ...env },
    });
    return { status: result.status, text: `${result.stdout}${result.stderr}${readFileSync(summary, "utf8")}` };
  };

  /** An empty out/ with the real _headers and one page that carries its script policy. */
  const freshOut = () => {
    rmSync(path.join(scratch, "out"), { recursive: true, force: true });
    mkdirSync(path.join(scratch, "out", "_next"), { recursive: true });
    writeFileSync(path.join(scratch, "out", "_headers"), HEADERS);
    writeFileSync(path.join(scratch, "out", "index.html"), addScriptPolicy(PAGE, sitePolicy(HEADERS)));
  };

  it("passes an export whose pages carry their script policy, and only checks the script policy", () => {
    freshOut();
    writeFileSync(path.join(scratch, "out", "_next", "chunk.js"), 'const pill = "Any Company Name";');
    const r = run({ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push" });
    expect(r.status).toBe(0);
    expect(r.text).toContain("Script policy: every page lists its inline script hashes.");
    expect(r.text).not.toMatch(/::(warning|error)|[Bb]locklist/);
  });

  it("fails on a page without its script policy or with an unhashed inline script", () => {
    freshOut();
    writeFileSync(path.join(scratch, "out", "plain.html"), PAGE);
    writeFileSync(path.join(scratch, "out", "added.html"), addScriptPolicy(PAGE, sitePolicy(HEADERS)).replace("</body>", "<script>b()</script></body>"));
    const r = run({ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request" });
    expect(r.status).toBe(1);
    expect(r.text).toContain("::error::csp: plain.html: no data-hq-csp script policy");
    expect(r.text).toMatch(/::error::csp: added\.html: missing hash for inline script #2/);
    expect(r.text).toContain("::error::csp: added.html: the script policy differs from the one derived from _headers");
    expect(r.text).not.toContain("::error::csp: index.html");
    expect(r.text).toContain("Script policy: **3 problem(s)**");
  });

  it("fails when the export has no _headers to derive the policy from", () => {
    freshOut();
    rmSync(path.join(scratch, "out", "_headers"));
    const r = run({ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request" });
    expect(r.status).toBe(1);
    expect(r.text).toContain("::error::csp: ");
  });
});
