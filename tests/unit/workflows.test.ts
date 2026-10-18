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
    for (const file of ["deploy.yml", "rollback.yml"]) expect(read(path.join(dir, file))).toContain(`wranglerVersion: "${pkg.devDependencies.wrangler}"`);
  });
});

describe("smart CI (ci.yml)", () => {
  const ci = read(path.join(dir, "ci.yml"));
  const job = (id: string) => ci.split(/\n  (?=[a-z][\w-]*:\n)/).find((block) => block.startsWith(`${id}:`)) ?? "";

  it("keeps the required check names and never skips a heavy job at the job level", () => {
    for (const name of ["Typecheck, lint, unit tests", "Build, CV and e2e", "Lighthouse CI", "3D perf gates ${{ matrix.shard }}/${{ needs.changes.outputs.perf_total }}", "E2E shard ${{ matrix.shard }}/${{ needs.changes.outputs.e2e_total }}"]) expect(ci).toContain(`name: ${name}`);
    for (const id of ["e2e", "perf", "lighthouse"]) {
      expect(job(id)).toContain("needs: [site, changes]");
      expect(job(id)).not.toMatch(/^\s{4}if:/m);
    }
  });

  it("sizes the e2e and perf matrices from the plan and passes the affected tests", () => {
    expect(job("e2e")).toContain("shard: ${{ fromJSON(needs.changes.outputs.e2e_shards) }}");
    expect(job("perf")).toContain("shard: ${{ fromJSON(needs.changes.outputs.perf_shards) }}");
    expect(job("e2e")).toContain("E2E_FILES: ${{ needs.changes.outputs.e2e_files }}");
    expect(job("perf")).toContain("PERF_GREP: ${{ needs.changes.outputs.perf_grep }}");
    expect(job("lighthouse")).toContain("LHCI_URLS: ${{ needs.changes.outputs.lighthouse_urls }}");
    for (const out of ["e2e_shards", "e2e_total", "perf_grep", "perf_shards", "perf_total", "lighthouse_urls"]) {
      expect(job("changes")).toContain(`${out}: \${{ steps.plan.outputs.${out} }}`);
    }
    // The planner follows imports into content JSON and reads e2e/durations.json and the smoke test lines.
    expect(job("changes")).toMatch(/sparse-checkout: \|\n\s+src\n\s+content\n\s+scripts\n\s+e2e\n/);
  });

  it("always runs the build, the safety scan and og:check", () => {
    expect(job("site")).toContain("bun scripts/scan-export.ts out");
    expect(job("site")).toContain("bun run og:check");
    expect(job("site")).not.toMatch(/^\s{4}if:/m);
  });

  it("marks complete runs for the deploy gate", () => {
    expect(job("build")).toContain("name: ci-full");
    expect(job("build")).toContain("if: needs.changes.outputs.full == 'true'");
  });

  it("records every plan and merges the PR run's reports into a complement run", () => {
    expect(job("changes")).toContain("source_run: ${{ steps.plan.outputs.source_run }}");
    expect(job("changes")).toContain("actions: read");
    expect(job("changes")).toContain("SHA: ${{ github.sha }}");
    expect(job("changes")).toContain("COMPLEMENT_PR: ${{ inputs.complement_pr }}");
    expect(job("changes")).toMatch(/name: ci-plan\n\s+path: ci-plan\.json/);
    expect(job("lighthouse")).toContain("--name lighthouse-reports --dir source-lhci");
    expect(job("lighthouse")).toContain("if: ${{ always() && (needs.changes.outputs.lighthouse != 'false' || needs.changes.outputs.source_run != '') }}");
    expect(job("build")).toContain("--name perf-report --dir perf-report");
    expect(job("build")).toContain("complement of CI run $SOURCE_RUN");
  });

  it("passes skipped heavy jobs with a Not needed step and fails safe on a missing plan output", () => {
    for (const id of ["e2e", "perf", "lighthouse"]) expect(job(id)).toContain("name: Not needed");
    expect(job("perf")).not.toContain("outputs.perf == 'true'");
    expect(job("perf")).toContain("if: needs.changes.outputs.perf == 'false'");
    expect(job("lighthouse")).not.toContain("outputs.lighthouse == 'true'");
    expect(job("lighthouse")).toContain("if: needs.changes.outputs.lighthouse == 'false'");
    expect(job("build")).not.toContain("outputs.perf == 'true'");
  });

  it("runs the ci-nightly report only on the nightly schedule or the nightly input, with no visual gate in CI", () => {
    expect(ci).toContain('- cron: "15 20 * * *"');
    expect(job("visual")).toBe("");
    expect(ci).not.toContain("visual_base");
    expect(job("nightly")).toContain("needs: [changes, check, secrets, site, e2e, perf, lighthouse, build]");
    expect(job("nightly")).toContain("if: ${{ !cancelled() && (github.event_name == 'schedule' || inputs.nightly) }}");
    expect(job("nightly")).toContain("NEEDS: ${{ toJSON(needs) }}");
    expect(job("nightly")).toContain("APPLY: ${{ github.ref == 'refs/heads/main' }}");
    expect(job("nightly")).toContain("run: bun scripts/ci-nightly.ts");
  });

  it("skips the nightly-only e2e tests except on the nightly schedule or the nightly input", () => {
    expect(job("e2e")).toContain("NIGHTLY: ${{ github.event_name == 'schedule' || inputs.nightly == true }}");
    expect(job("e2e")).toContain("skip=(--grep-invert @nightly)");
    expect(job("e2e")).toContain('if [ "$NIGHTLY" = "true" ]; then skip=(); fi');
    expect(job("e2e")).toContain('bun run e2e:shard "$SHARD" $E2E_FILES "${skip[@]}"');
  });
});

describe("deploy on merge (deploy.yml, rollback.yml)", () => {
  const split = (text: string) => (id: string) => text.split(/\n  (?=[a-z][\w-]*:\n)/).find((block) => block.startsWith(`${id}:`)) ?? "";
  const deploy = read(path.join(dir, "deploy.yml"));
  const rollback = read(path.join(dir, "rollback.yml"));
  const deployJob = split(deploy);
  const rollbackJob = split(rollback);

  it("deploys a push to main through the fast-path gate and keeps the manual dispatch", () => {
    expect(deploy).toMatch(/on:\n  push:\n    branches: \[main\]\n  workflow_dispatch:/);
    expect(deployJob("verify")).toContain("bun scripts/merge-gate.ts");
    expect(deployJob("verify")).toContain("if: github.event_name == 'push'");
    expect(deployJob("verify")).toContain("if: steps.fast.outputs.fast != 'true'");
    expect(deployJob("deploy")).toContain("--check-block-only true");
  });

  it("shares one queue for every production deploy and never cancels a running one", () => {
    expect(deploy).toMatch(/concurrency:\n  group: deploy-production\n  cancel-in-progress: false/);
  });

  it("rolls back only after CI on a push to main fails, and clears only after it passes", () => {
    expect(rollback).toMatch(/workflow_run:\n    workflows: \[CI\]\n    types: \[completed\]\n    branches: \[main\]/);
    expect(rollbackJob("rollback")).toContain("github.event.workflow_run.event == 'push'");
    expect(rollbackJob("rollback")).toContain("github.event.workflow_run.conclusion == 'failure'");
    expect(rollbackJob("clear")).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(rollbackJob("clear")).not.toContain("secrets.");
  });

  it("keeps the Cloudflare secrets in the production environment, in step-level env only", () => {
    expect(rollbackJob("rollback")).toMatch(/environment:\n      name: production/);
    const jobEnv = rollbackJob("rollback").split("    steps:")[0];
    expect(jobEnv).not.toContain("secrets.");
  });

  it("defaults the drill to a dry run", () => {
    expect(rollback).toMatch(/dry_run:[\s\S]*?default: true/);
  });
});
