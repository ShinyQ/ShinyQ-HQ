import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { addScriptPolicy, sitePolicy } from "../../scripts/csp-hashes";
import { smokeProblems, type Expected, type Observed } from "../../scripts/deploy-smoke";

const expected: Expected = { asOf: "2026-10-18", contributions: "7,600", beacon: true };
const SITE = sitePolicy(readFileSync(path.join(process.cwd(), "public", "_headers"), "utf8"));
/** A production /en page around `body`, with the script policy the build adds (scripts/csp-hashes.ts). */
const enPage = (body: string) => addScriptPolicy(`<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/></head><body>${body}</body></html>`, SITE);
const html = enPage('<p>7,600</p><script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon="{}"></script>');
const card = (path: string) =>
  `<html><head><link rel="canonical" href="https://kurniadi.pages.dev${path}"/><meta property="og:title" content="T"/><meta property="og:description" content="D"/><meta property="og:url" content="https://kurniadi.pages.dev${path}"/><meta property="og:image" content="https://kurniadi.pages.dev/og/en.jpg"/></head>`;
const jpeg = { code: 200, type: "image/jpeg" };
const unfurl: Observed["unfurl"] = { "/": { code: 200, html: card("/en"), image: jpeg }, "/en": { code: 200, html: card("/en"), image: jpeg }, "/id": { code: 200, html: card("/id"), image: jpeg } };
const healthy: Observed = { status: { code: 200, enabled: true, asOf: "2026-10-18" }, page: { code: 200, html }, rum: { code: 405 }, visit: { code: 405 }, stats: { code: 204 }, unfurl };

describe("post-deploy smoke check", () => {
  it("passes when production serves the new pack, facts, beacon and the RUM Function", () => {
    expect(smokeProblems(expected, healthy)).toEqual([]);
  });

  it("reports a stale deployment, a disabled endpoint, a missing number or beacon", () => {
    expect(smokeProblems(expected, { ...healthy, status: { code: 200, enabled: true, asOf: "2026-10-11" } })).toEqual(["GET /api/ask asOf is 2026-10-11, expected 2026-10-18"]);
    expect(smokeProblems(expected, { ...healthy, status: { code: 503 } })[0]).toMatch(/not enabled/);
    expect(smokeProblems(expected, { ...healthy, page: { code: 200, html: enPage("<p>7,541</p>") } })).toEqual(["/en does not show 7,600 contributions", "/en has no Web Analytics beacon"]);
    expect(smokeProblems(expected, {})).toHaveLength(8);
  });

  it("checks that LinkedInBot gets a 200 with early share tags and a JPEG card on every entry point", () => {
    expect(smokeProblems(expected, { ...healthy, unfurl: { ...unfurl, "/": { code: 403, html: "" } } })).toEqual(["LinkedInBot got HTTP 403 for /, expected 200"]);
    const late = `<head>${"<meta name=x>".repeat(1000)}${card("/en").slice(12)}`;
    expect(smokeProblems(expected, { ...healthy, unfurl: { ...unfurl, "/en": { code: 200, html: late, image: jpeg } } })[0]).toMatch(/LinkedInBot \/en: property="og:title" at byte \d+, after 8192/);
    expect(smokeProblems(expected, { ...healthy, unfurl: { ...unfurl, "/id": { code: 200, html: card("/id"), image: { code: 404, type: "text/html" } } } })).toEqual([
      "LinkedInBot /id: og:image returned HTTP 404 text/html",
    ]);
  });

  it("reports a missing RUM Function (the static 404 page)", () => {
    expect(smokeProblems(expected, { ...healthy, rum: { code: 404 } })).toEqual(["GET /api/rum returned HTTP 404, expected 405 (the performance beacon Function is missing)"]);
  });

  it("finds the inline opt-out guard that loads the beacon", () => {
    const guard = enPage('<script id="hq-cf-beacon">(function(){var s=document.createElement("script");s.src="https://static.cloudflareinsights.com/beacon.min.js"})()</script><p>7,600</p>');
    expect(smokeProblems(expected, { ...healthy, page: { code: 200, html: guard } })).toEqual([]);
  });

  it("checks the visit stats Functions: /api/visit 405, /api/stats 204 or a valid 200", () => {
    expect(smokeProblems(expected, { ...healthy, stats: { code: 200, valid: true } })).toEqual([]);
    expect(smokeProblems(expected, { ...healthy, stats: { code: 200, valid: false } })).toEqual(["GET /api/stats served a snapshot that fails the contract"]);
    expect(smokeProblems(expected, { ...healthy, stats: { code: 404 } })).toEqual(["GET /api/stats returned HTTP 404, expected 200 or 204 (the stats Function is missing)"]);
    expect(smokeProblems(expected, { ...healthy, visit: { code: 404 } })).toEqual(["GET /api/visit returned HTTP 404, expected 405 (the visit beacon Function is missing)"]);
  });

  it("reports an /en page without its script policy or with an inline script the policy does not list", () => {
    const bare = '<html><head><meta charSet="utf-8"/></head><body><p>7,600</p><script defer src="https://static.cloudflareinsights.com/beacon.min.js"></script></body></html>';
    expect(smokeProblems(expected, { ...healthy, page: { code: 200, html: bare } })).toEqual(["/en: no data-hq-csp script policy"]);
    const injected = html.replace("</body>", "<script>injected()</script></body>");
    expect(smokeProblems(expected, { ...healthy, page: { code: 200, html: injected } })).toEqual(['/en: missing hash for inline script #1 "injected()"']);
  });

  it("accepts external scripts Cloudflare injects into production HTML", () => {
    const injected = html.replace("</body>", '<script defer src="/cdn-cgi/scripts/email-decode.min.js"></script></body>');
    expect(smokeProblems(expected, { ...healthy, page: { code: 200, html: injected } })).toEqual([]);
  });

  it("does not require the beacon when the build had no token", () => {
    expect(smokeProblems({ ...expected, beacon: false }, { ...healthy, page: { code: 200, html: enPage("7,600") } })).toEqual([]);
  });
});
