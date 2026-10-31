import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DECISION_FILE,
  DECISIONS_DIR,
  listDecisions,
  listPlans,
  parseDecision,
  planCategory,
  renderDecisions,
  renderPlans,
  statusPrs,
  DECISION_AREAS,
  broadArea,
} from "../../scripts/docs-index";

// Conflict-free history docs: parallel PRs that each add a decision and a plan never edit the same lines
// (docs/superpowers/plans/2026-10-18-conflict-free-docs.md).
const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const entry = (meta: string, text = "The decision.") => `# CI\n\n${meta}\n\n${text}\n`;

describe("owner decisions, one file each", () => {
  it("every file in docs/decisions/ is a well-formed decision", () => {
    const files = readdirSync(path.join(root, DECISIONS_DIR));
    expect(files.filter((f) => !DECISION_FILE.test(f))).toEqual([]);
    const decisions = listDecisions(root);
    expect(decisions.length).toBe(files.length);
    expect(decisions.length).toBeGreaterThan(150);
  });

  it("names only the listed broad areas in decision headings, so one area never splits under two names", () => {
    const off = listDecisions(root).filter((d) => !(DECISION_AREAS as readonly string[]).includes(broadArea(d.area)));
    expect(off.map((d) => `${d.file}: ${d.area}`)).toEqual([]);
    expect(broadArea("Content: CV")).toBe("Content");
  });

  it("docs/decisions.md is a static page with no rows to append", () => {
    const page = read("docs/decisions.md");
    expect(page.split("\n").filter((l) => l.startsWith("|"))).toEqual([]);
    expect(page).toContain("docs/decisions/YYYY-MM-DD-slug.md");
  });

  it("parses the format and rejects broken entries", () => {
    const link = "[#7](https://github.com/ShinyQ/ShinyQ-HQ/pull/7)";
    expect(parseDecision("2026-10-18-ci-x.md", entry(`- Date: 2026-10-18\n- PR: ${link}, ${link.replace(/7/g, "8")}`, "One\nparagraph."))).toEqual({
      file: "2026-10-18-ci-x.md",
      date: "2026-10-18",
      area: "CI",
      pr: `${link}, ${link.replace(/7/g, "8")}`,
      text: "One paragraph.",
    });
    expect(parseDecision("2026-10-ci-x.md", entry("- Date: 2026-10")).date).toBe("2026-10");
    expect(() => parseDecision("2026-10-18_ci.md", entry("- Date: 2026-10-18"))).toThrow(/name/);
    expect(() => parseDecision("2026-10-17-ci-x.md", entry("- Date: 2026-10-18"))).toThrow(/does not match/);
    expect(() => parseDecision("2026-10-18-ci-x.md", entry("- Date: 2026-10-18\n- PR: #7"))).toThrow(/PR/);
    expect(() => parseDecision("2026-10-18-ci-x.md", entry("- Date: 2026-10-18\n- PR: [#7](https://github.com/ShinyQ/ShinyQ-HQ/pull/8)"))).toThrow(/PR/);
    expect(() => parseDecision("2026-10-18-ci-x.md", entry("- Date: 2026-10-18", ""))).toThrow(/text/);
    expect(() => parseDecision("2026-10-18-ci-x.md", entry("- Area: CI\n- Date: 2026-10-18"))).toThrow(/metadata/);
    expect(() => parseDecision("2026-10-18-ci-x.md", "CI\n\n- Date: 2026-10-18\n\nText\n")).toThrow(/heading/);
  });

  it("renders one table row per decision", () => {
    const decisions = listDecisions(root);
    const rows = renderDecisions(decisions).split("\n").filter((l) => /^\| \d{4}-/.test(l));
    expect(rows.length).toBe(decisions.length);
  });
});

describe("plans, status in each plan only", () => {
  it("docs/superpowers/README.md has no plans table or counts line to edit", () => {
    const readme = read("docs/superpowers/README.md");
    expect(readme.split("\n").filter((l) => l.startsWith("|") && l.includes("](plans/"))).toEqual([]);
    expect(readme).not.toMatch(/^\d+ plans:/m);
  });

  it("every plan has a Status: line near the top with a known state", () => {
    const plans = listPlans(root);
    expect(plans.length).toBeGreaterThan(80);
    expect(plans.filter((p) => !p.status).map((p) => p.file)).toEqual([]);
    expect(plans.filter((p) => !p.category).map((p) => `${p.file}: ${p.status}`)).toEqual([]);
  });

  it("derives the state and PRs from the status text", () => {
    expect(planCategory("in review.")).toBe("in progress");
    expect(planCategory("part 1 in progress (2026-10-18).")).toBe("in progress");
    expect(planCategory("shipped in #4 (3a1a2ed), 2026-10-09")).toBe("shipped");
    expect(planCategory("measurements for the plan shipped in #74")).toBe("shipped");
    expect(planCategory("shipped in #1. Later replaced: the CV in #24")).toBe("shipped, later changed");
    expect(planCategory("shipped in #201; its warm-up was reverted in a follow-up, #203")).toBe("shipped, later changed");
    expect(planCategory("dropped by owner 2026-10-23 (not implemented)")).toBe("dropped");
    expect(planCategory("draft")).toBeNull();
    expect(statusPrs("shipped in [#188](https://github.com/ShinyQ/ShinyQ-HQ/pull/188) and #185; later #188")).toEqual([188, 185]);
  });

  it("renders a counts line that adds up", () => {
    const plans = listPlans(root);
    const [summary] = renderPlans(plans).split("\n");
    const [total, ...parts] = [...summary.matchAll(/(\d+) /g)].map((m) => Number(m[1]));
    expect(total).toBe(plans.length);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(plans.length);
  });
});
