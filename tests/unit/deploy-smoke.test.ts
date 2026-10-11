import { describe, expect, it } from "vitest";
import { smokeProblems, type Expected } from "../../scripts/deploy-smoke";

const expected: Expected = { asOf: "2026-10-18", contributions: "7,600", beacon: true };
const html = '<p>7,600</p><script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon="{}"></script>';

describe("post-deploy smoke check", () => {
  it("passes when production serves the new pack, facts and beacon", () => {
    expect(smokeProblems(expected, { status: { code: 200, enabled: true, asOf: "2026-10-18" }, page: { code: 200, html } })).toEqual([]);
  });

  it("reports a stale deployment, a disabled endpoint, a missing number or beacon", () => {
    expect(smokeProblems(expected, { status: { code: 200, enabled: true, asOf: "2026-10-11" }, page: { code: 200, html } })).toEqual([
      "GET /api/ask asOf is 2026-10-11, expected 2026-10-18",
    ]);
    expect(smokeProblems(expected, { status: { code: 503 }, page: { code: 200, html } })[0]).toMatch(/not enabled/);
    expect(smokeProblems(expected, { status: { code: 200, enabled: true, asOf: "2026-10-18" }, page: { code: 200, html: "<p>7,541</p>" } })).toEqual([
      "/en does not show 7,600 contributions",
      "/en has no Web Analytics beacon",
    ]);
    expect(smokeProblems(expected, {})).toHaveLength(2);
  });

  it("does not require the beacon when the build had no token", () => {
    expect(smokeProblems({ ...expected, beacon: false }, { status: { code: 200, enabled: true, asOf: "2026-10-18" }, page: { code: 200, html: "7,600" } })).toEqual([]);
  });
});
