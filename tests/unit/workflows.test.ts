import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Supply-chain rules for CI (security S4, owner decision 5): every action pinned by commit SHA, and
// wrangler only from the lockfile, never a version range resolved at run time.
const root = process.cwd();
const dir = path.join(root, ".github", "workflows");
const files = [...readdirSync(dir).map((f) => path.join(dir, f)), path.join(root, ".github", "actions", "setup", "action.yml")];
const read = (f: string) => readFileSync(f, "utf8");
const pkg = JSON.parse(read(path.join(root, "package.json")));

describe("workflow pinning (S4)", () => {
  it("pins every third-party or GitHub action to a full commit SHA with a version comment", () => {
    const loose = files.flatMap((f) =>
      [...read(f).matchAll(/uses:\s*(\S+)(.*)$/gm)]
        .filter(([, ref]) => !ref.startsWith("./"))
        .filter(([, ref, rest]) => !/@[0-9a-f]{40}$/.test(ref) || !/#\s*v\d/.test(rest))
        .map(([, ref]) => `${path.basename(f)}: ${ref}`),
    );
    expect(loose).toEqual([]);
  });

  it("runs wrangler from the lockfile: an exact devDependency, no bunx wrangler@range", () => {
    expect(pkg.devDependencies.wrangler).toMatch(/^\d+\.\d+\.\d+$/);
    expect(files.filter((f) => /wrangler@/.test(read(f))).map((f) => path.basename(f))).toEqual([]);
  });

  it("deploys the hq-stats Worker with the same wrangler version", () => {
    expect(read(path.join(dir, "deploy.yml"))).toContain(`wranglerVersion: "${pkg.devDependencies.wrangler}"`);
  });
});
