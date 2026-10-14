import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  collectStrings,
  findBlockedLabels,
  formatBlockedTerms,
  loadBlocklist,
  loadDefaultBlocklist,
  redactBlockedText,
  scanBuildOutput,
} from "@/content/safety";
import type { PipelineResult } from "../../functions/_lib/pipeline";
import { checkSummary, reportRow } from "../../scripts/ask-eval";

// S2 canary: a private term (as if it came from the SAFETY_BLOCKLIST secret) must never be printed by a
// failing check, a scan hit, a script log or an eval report, while the check itself still fails.
const CANARY = "canary-term-q7x";
const env = { SAFETY_BLOCKLIST: `${CANARY}, second-private-term` };
const terms = loadBlocklist(env);
const leaked = (value: unknown) => JSON.stringify(value).toLowerCase().includes(CANARY);
mkdirSync(path.join(process.cwd(), "test-results"), { recursive: true });
const scratch = mkdtempSync(path.join(process.cwd(), "test-results", "safety-canary-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("private blocklist redaction (S2 canary)", () => {
  it("shows a private term as its position, never its text, and keeps committed terms readable", () => {
    const hidden = terms.filter((t) => !loadDefaultBlocklist().includes(t));
    expect(formatBlockedTerms([CANARY, "Sari Roti"], terms)).toEqual([`private term #${hidden.indexOf(CANARY) + 1}`, "Sari Roti"]);
    expect(formatBlockedTerms(["second-private-term"], terms)).toEqual([`private term #${hidden.indexOf("second-private-term") + 1}`]);
    expect(formatBlockedTerms(["not-in-the-list"], terms)).toEqual(["private term #?"]);
  });

  it("fails a content check on the canary without printing it", () => {
    const fixture = { floors: { labs: { pods: [{ summary: `Built for ${CANARY.toUpperCase()} last year` }] } } };
    const hits = collectStrings(fixture).flatMap((leaf) => {
      const found = findBlockedLabels(leaf.value, terms);
      return found.length ? [`${leaf.path}: ${found.join(", ")}`] : [];
    });
    expect(hits).toHaveLength(1);
    let message = "";
    try {
      expect(hits).toEqual([]);
    } catch (error) {
      // The reporter prints the message plus a diff of `actual` and `expected`.
      const e = error as { message: string; actual?: unknown; expected?: unknown };
      message = JSON.stringify({ message: e.message, actual: e.actual, expected: e.expected });
    }
    expect(message).toContain("private term #");
    expect(message.toLowerCase()).not.toContain(CANARY);
  });

  it("flags the canary in the export scan, scripts included, with redacted hits", () => {
    const out = path.join(scratch, "out");
    mkdirSync(path.join(out, "en"), { recursive: true });
    writeFileSync(path.join(out, "en", "labs.html"), `<p>${CANARY}</p>`);
    const hits = scanBuildOutput(out, terms);
    expect(hits.map((h) => h.file)).toEqual([path.join("en", "labs.html")]);
    expect(leaked(hits)).toBe(false);
  });

  it("redacts the canary from free text (logs, reports, public issues)", () => {
    const text = `Line one names ${CANARY}.\nLine two names Sari Roti.`;
    expect(redactBlockedText(text, terms)).toBe("Line one names [redacted].\nLine two names [redacted].");
  });

  it("reports an ask-eval blocklist replacement as a count, with the answer redacted", () => {
    const result = { text: `A reply naming ${CANARY}`, outcome: "answer", source: "primary", reason: "blocklist", detail: [CANARY] } as unknown as PipelineResult;
    expect(checkSummary(result)).toBe("blocklist: 1 term(s)");
    expect(checkSummary({ reason: "numeric", detail: ["42"] })).toBe("numeric: 42");
    const row = reportRow({ item: { id: "rt99" }, result, ms: 5, pass: false, notes: ["blocklisted: 1 term(s)"] }, terms);
    expect(row).toContain("blocklist: 1 term(s)");
    expect(row.toLowerCase()).not.toContain(CANARY);
  });

  it("fails validate-fragment on the canary without printing it", () => {
    const content = JSON.parse(readFileSync(path.join(process.cwd(), "content", "site-content.json"), "utf8"));
    const pod = content.floors.labs.pods[0];
    pod.tagline.en = `${pod.tagline.en} ${CANARY}`;
    const file = path.join(scratch, "pods.json");
    writeFileSync(file, JSON.stringify([pod]));
    const run = spawnSync("bun", ["scripts/validate-fragment.ts", "pods", file], { encoding: "utf8", env: { ...process.env, ...env } });
    expect(run.status).toBe(1);
    expect(`${run.stdout}${run.stderr}`).toContain("private term #");
    expect(`${run.stdout}${run.stderr}`.toLowerCase()).not.toContain(CANARY);
  });
});
