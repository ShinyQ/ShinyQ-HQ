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

  it("never leaves the job token in .git/config, except in the job that pushes the facts branch (S5)", () => {
    const keep = files.flatMap((f) => {
      const steps = read(f).split(/\n(?=\s*- )/).filter((step) => /uses:\s*actions\/checkout@/.test(step));
      return steps.filter((step) => !/persist-credentials:\s*false/.test(step)).map(() => path.basename(f));
    });
    expect(keep).toEqual(["refresh-facts.yml"]);
  });

  it("deploys the hq-stats Worker with the same wrangler version", () => {
    expect(read(path.join(dir, "deploy.yml"))).toContain(`wranglerVersion: "${pkg.devDependencies.wrangler}"`);
  });
});

describe("smart CI (ci.yml)", () => {
  const ci = read(path.join(dir, "ci.yml"));
  const job = (id: string) => ci.split(/\n  (?=[a-z][\w-]*:\n)/).find((block) => block.startsWith(`${id}:`)) ?? "";

  it("keeps the required check names and never skips a heavy job at the job level", () => {
    for (const name of ["Typecheck, lint, unit tests", "Build, CV and e2e", "Lighthouse CI", "3D perf gates ${{ matrix.shard }}/2", "E2E shard ${{ matrix.shard }}/4"]) expect(ci).toContain(`name: ${name}`);
    for (const id of ["e2e", "perf", "lighthouse"]) {
      expect(job(id)).toContain("needs: [site, changes]");
      expect(job(id)).not.toMatch(/^\s{4}if:/m);
    }
  });

  it("always runs the build, the safety scan and og:check", () => {
    expect(job("site")).toContain("bun scripts/scan-export.ts out");
    expect(job("site")).toContain("bun run og:check");
    expect(job("site")).not.toMatch(/^\s{4}if:/m);
  });

  it("marks complete runs for the deploy gate", () => {
    expect(job("build")).toContain("name: ci-full");
  });
});
