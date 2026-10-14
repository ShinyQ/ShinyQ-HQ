import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadBlocklist, loadDefaultBlocklist } from "@/content/safety";
import { gateVerdict, privateTermCount } from "../../scripts/scan-export";

const CANARY = "canary-term-q7x";
mkdirSync(path.join(process.cwd(), "test-results"), { recursive: true });
const scratch = mkdtempSync(path.join(process.cwd(), "test-results", "scan-export-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("private blocklist gate (S1)", () => {
  it("counts only terms beyond the committed default list", () => {
    expect(privateTermCount(loadDefaultBlocklist())).toBe(0);
    expect(privateTermCount(loadBlocklist({ SAFETY_BLOCKLIST: `${CANARY}, other` }), loadDefaultBlocklist())).toBe(2);
  });

  it("fails main and deploy runs without the list, warns on pull requests and locally, never passes silently", () => {
    const today = "2026-10-14";
    expect(gateVerdict("enabled", { ci: true, event: "push", today })).toBe("pass");
    for (const event of ["push", "workflow_dispatch", "schedule"]) expect(gateVerdict("missing", { ci: true, event, today }), event).toBe("fail");
    expect(gateVerdict("missing", { ci: true, event: "pull_request", today })).toBe("warn");
    expect(gateVerdict("missing", { ci: false, today })).toBe("warn");
  });

  it("honours a dated grace period only until its last day", () => {
    expect(gateVerdict("missing", { ci: true, event: "push", graceUntil: "2026-10-21", today: "2026-10-21" })).toBe("grace");
    expect(gateVerdict("missing", { ci: true, event: "push", graceUntil: "2026-10-21", today: "2026-10-22" })).toBe("fail");
    expect(gateVerdict("missing", { ci: true, event: "push", graceUntil: "soon", today: "2026-10-14" })).toBe("fail");
  });
});

describe("scan-export (S9, tests P4)", () => {
  const run = (env: Record<string, string>) => {
    const summary = path.join(scratch, `summary-${Object.keys(env).join("-")}.md`);
    writeFileSync(summary, "");
    const result = spawnSync("bun", ["scripts/scan-export.ts", path.join(scratch, "out")], {
      encoding: "utf8",
      env: { ...process.env, SAFETY_BLOCKLIST: "", SAFETY_BLOCKLIST_GRACE_UNTIL: "", GITHUB_STEP_SUMMARY: summary, ...env },
    });
    return { status: result.status, text: `${result.stdout}${result.stderr}${readFileSync(summary, "utf8")}` };
  };

  it("fails on a private term in a JS chunk without printing it", () => {
    mkdirSync(path.join(scratch, "out", "_next"), { recursive: true });
    writeFileSync(path.join(scratch, "out", "_next", "chunk.js"), `const pill = "${CANARY}";`);
    const r = run({ SAFETY_BLOCKLIST: CANARY, GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push" });
    expect(r.status).toBe(1);
    expect(r.text).toContain("Private blocklist: enabled");
    expect(r.text).toContain("private term #1");
    expect(r.text.toLowerCase()).not.toContain(CANARY);
  });

  it("fails a main run without the secret and only warns on a pull request, with a summary line", () => {
    rmSync(path.join(scratch, "out"), { recursive: true, force: true });
    mkdirSync(path.join(scratch, "out"), { recursive: true });
    writeFileSync(path.join(scratch, "out", "index.html"), "<p>clean</p>");
    const main = run({ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push" });
    expect(main.status).toBe(1);
    expect(main.text).toContain("Private blocklist missing");
    const pr = run({ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request" });
    expect(pr.status).toBe(0);
    expect(pr.text).toContain("Private blocklist not checked");
  });
});
