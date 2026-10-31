import { describe, expect, it } from "vitest";
import { coverageOk, INFRA_FAILURES, MAX_NOT_RUN_SHARE, notRun, reportRow } from "../../scripts/ask-eval";
import type { PipelineResult } from "../../functions/_lib/pipeline";

/** Eval scoring (owner decision 2026-10-31): upstream failures are coverage, never answer quality. */

const failed = (...reasons: string[]) => ({ reason: "model_failed" as const, failures: reasons.map((reason, i) => ({ model: `m${i}`, reason })) as PipelineResult["failures"] });

describe("eval scoring", () => {
  it("treats an item whose every tier hit a quota, rate limit, HTTP error or timeout as not run", () => {
    expect(notRun(failed("quota", "breaker_open", "rate_limited"))).toBe(true);
    expect(notRun(failed("error"))).toBe(true);
    expect(notRun(failed("first_token_timeout", "total_timeout"))).toBe(true);
  });

  it("still scores an empty answer, a check that replaced an answer and a model answer", () => {
    expect(notRun(failed("rate_limited", "empty"))).toBe(false);
    expect(notRun({ reason: "unsourced", failures: [] })).toBe(false);
    expect(notRun({ reason: undefined, failures: [{ model: "m0", reason: "quota" }] })).toBe(false);
    expect(notRun({ reason: "model_failed", failures: [] })).toBe(false);
  });

  it("lists only upstream reasons as infrastructure", () => {
    expect([...INFRA_FAILURES].sort()).toEqual(["auth", "breaker_open", "deadline", "error", "first_token_timeout", "quota", "rate_limited", "total_timeout", "unavailable"]);
    expect(INFRA_FAILURES.has("empty")).toBe(false);
  });

  it("fails a run on coverage once more than a quarter of its items did not run", () => {
    expect(MAX_NOT_RUN_SHARE).toBe(0.25);
    expect(coverageOk(0, 31)).toBe(true);
    expect(coverageOk(7, 31)).toBe(true);
    expect(coverageOk(8, 31)).toBe(false);
    expect(coverageOk(10, 46)).toBe(true);
    expect(coverageOk(20, 20)).toBe(false);
  });

  it("marks a skipped item as not run in the report", () => {
    const result = { text: "x", outcome: "fallback", source: "none", reason: "model_failed", failures: [] } as unknown as PipelineResult;
    expect(reportRow({ item: { id: "q01" }, result, ms: 1, pass: false, notes: [], skipped: true })).toMatch(/^\| q01 \| not run \|/);
    expect(reportRow({ item: { id: "q01" }, result, ms: 1, pass: false, notes: [] })).toMatch(/^\| q01 \| \*\*fail\*\* \|/);
  });
});
