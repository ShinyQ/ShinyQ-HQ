import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Pinned majors (docs/deploy.md section 17): every Dependabot ignore carries a dated reason and a doc row.
const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function ignores(yaml: string) {
  const lines = yaml.split("\n");
  const out: { name: string; comment: string }[] = [];
  lines.forEach((line, i) => {
    const m = line.match(/^\s*-\s*dependency-name:\s*"?([^"\s]+)"?\s*$/);
    if (m) out.push({ name: m[1], comment: (lines[i - 1] ?? "").trim() });
  });
  return out;
}

function pinnedRows(doc: string) {
  const start = doc.indexOf("## 17. Dependency upgrades and pinned majors");
  expect(start).toBeGreaterThan(-1);
  const section = doc.slice(start).split("\n## ")[0];
  return section
    .split("\n")
    .filter((l) => l.startsWith("| `"))
    .map((l) => l.split("|")[1].trim().replace(/`/g, ""));
}

describe("dependabot pins", () => {
  const yaml = read(".github/dependabot.yml");
  const entries = ignores(yaml);

  it("gives every ignored dependency a revisit date and a reason", () => {
    for (const { name, comment } of entries) {
      expect(comment, name).toMatch(/^# revisit \d{4}-\d{2}-\d{2}: \S.+$/);
    }
  });

  it("ignores only major updates", () => {
    const blocks = yaml.split(/\n\s*-\s*dependency-name:/).slice(1);
    for (const block of blocks) {
      expect(block.split("\n").slice(0, 3).join("\n")).toContain('update-types: ["version-update:semver-major"]');
    }
  });

  it("documents every pin in docs/deploy.md section 17 and nothing else", () => {
    const rows = pinnedRows(read("docs/deploy.md"));
    expect([...rows].sort()).toEqual(entries.map((e) => e.name).sort());
  });

  it("pins only packages the project depends on", () => {
    const pkg = JSON.parse(read("package.json"));
    const all = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
    for (const { name } of entries) expect(all[name], name).toBeDefined();
  });
});
