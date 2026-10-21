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

  describe("Ask knowledge pack in KV", () => {
    const stepsOf = (job: string) => job.split(/\n(?=      - )/);
    const deploySteps = stepsOf(deployJob("deploy"));
    const at = (needle: string) => deploySteps.findIndex((step) => step.includes(needle));

    it("publishes before the Pages deploy, flips after it and before the smoke check, and flips back on a failure", () => {
      const publish = at("bun scripts/ask-pack.ts publish --commit");
      const pages = at("bunx wrangler pages deploy");
      const flip = at('bun scripts/ask-pack.ts flip "$VERSION"');
      const smoke = at("bun scripts/deploy-smoke.ts");
      const back = at('bun scripts/ask-pack.ts flip "$PREVIOUS"');
      expect(at("bun scripts/build-knowledge.ts")).toBeLessThan(publish);
      expect([publish, pages, flip, smoke, back].every((i) => i >= 0)).toBe(true);
      expect(publish).toBeLessThan(pages);
      expect(pages).toBeLessThan(flip);
      expect(flip).toBeLessThan(smoke);
      expect(smoke).toBeLessThan(back);
      expect(deploySteps[back]).toMatch(/if: failure\(\) && steps\.flip\.outcome == 'success'/);
    });

    it("passes the Cloudflare secrets to the pack steps in step env only, and step outputs through env", () => {
      for (const needle of ["ask-pack.ts publish", 'ask-pack.ts flip "$VERSION"', 'ask-pack.ts flip "$PREVIOUS"']) {
        const step = deploySteps[at(needle)];
        expect(step, needle).toMatch(/\n        env:\n[\s\S]*CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
        expect(step.split("run:")[1], needle).not.toContain("${{");
      }
      expect(deployJob("deploy").split("    steps:")[0]).not.toContain("secrets.");
    });

    it("rolls the pack back after the Pages rollback and the Worker redeploys, for the production project only", () => {
      const steps = stepsOf(rollbackJob("rollback"));
      const find = (needle: string) => steps.findIndex((step) => step.includes(needle));
      const pack = find("bun scripts/ask-pack.ts rollback --commit");
      expect(pack).toBeGreaterThan(find("bun scripts/rollback.ts pages"));
      expect(pack).toBeGreaterThan(find("Redeploy hq-office"));
      expect(pack).toBeLessThan(find("bun scripts/rollback.ts report"));
      expect(steps[pack]).toContain("env.CF_PAGES_PROJECT == vars.CF_PAGES_PROJECT");
      expect(steps[pack]).toContain('--dry-run "$DRY_RUN"');
      expect(steps[pack]).toContain("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}");
      expect(steps[pack - 1]).toContain("bun install --frozen-lockfile");
    });

    it("fails red on a KV error: every piped pack command runs under pipefail", () => {
      const packSteps = [...deploySteps, ...stepsOf(rollbackJob("rollback"))].filter((step) => step.includes("scripts/ask-pack.ts"));
      expect(packSteps.length).toBeGreaterThanOrEqual(4);
      for (const step of packSteps) {
        expect(step).not.toContain("continue-on-error");
        expect(step).not.toMatch(/ask-pack\.ts[^\n]*\|\|/);
        if (/ask-pack\.ts[^\n]*\|/.test(step)) expect(step).toMatch(/set -[a-z]*o pipefail|shell: bash/);
      }
    });

    it("offers a dispatch-only check of the token's KV access in the production environment", () => {
      const check = read(path.join(dir, "ask-pack.yml"));
      expect(check).toMatch(/on:\n  workflow_dispatch:/);
      expect(check).not.toMatch(/pull_request|push:|schedule:/);
      expect(check).toContain("if: github.ref == 'refs/heads/main'");
      expect(check).toMatch(/environment:\n      name: production\n      deployment: false/);
      expect(check.split("    steps:")[0]).not.toContain("secrets.");
      expect(check).toContain("set -euo pipefail");
      for (const mode of ["verify", "dry-run", "status"]) expect(check).toContain(`${mode})`);
      expect(check).toContain('publish --commit "$GITHUB_SHA" --dry-run true');
    });
  });
});

describe("Ask samples (ask-samples.yml)", () => {
  const samples = read(path.join(dir, "ask-samples.yml"));
  const steps = samples.split("    steps:")[1].split(/\n(?=      - )/);

  it("is dispatch-only, read-only and runs in the production environment", () => {
    expect(samples).toMatch(/\non:\n  workflow_dispatch:\n/);
    expect(samples).not.toMatch(/^\s+(schedule|push|pull_request\w*|workflow_run):/m);
    expect(samples).toMatch(/\npermissions:\n  contents: read\n/);
    expect(samples).toMatch(/environment:\n      name: production\n      deployment: false/);
  });

  it("validates the ref as a branch head of this repository before checking it out", () => {
    const validate = steps.findIndex((step) => step.includes("git ls-remote --exit-code --heads"));
    const checkout = steps.findIndex((step) => /uses:\s*actions\/checkout@/.test(step));
    expect(validate).toBeGreaterThanOrEqual(0);
    expect(validate).toBeLessThan(checkout);
    expect(steps[checkout]).toContain("repository: ${{ github.repository }}");
    expect(steps[checkout]).toContain("ref: ${{ inputs.ref }}");
    expect(samples).not.toMatch(/run:[^\n]*\$\{\{\s*inputs\./);
  });

  it("passes GROQ_API_KEY only to the sample step and no other secret", () => {
    expect([...samples.matchAll(/secrets\.(\w+)/g)].map(([, name]) => name)).toEqual(["GROQ_API_KEY"]);
    const withKey = steps.filter((step) => step.includes("secrets.GROQ_API_KEY"));
    expect(withKey).toHaveLength(1);
    expect(withKey[0]).toContain("run: bun scripts/ask-samples.ts --groq");
  });
});

describe("pinned Node (security release 2026-10-21)", () => {
  const nvmrc = read(path.join(root, ".nvmrc")).trim();
  const jobsOf = (text: string) => (text.split(/\njobs:\n/)[1] ?? "").split(/\n  (?=[a-z][\w-]*:\n)/);
  // Steps that run a node-shebang bin (next, playwright, wrangler, lhci) or the repo's install and build.
  const usesNode = /wrangler|lhci|playwright|bun run |bun install|\.github\/actions\/setup\b/;
  const setupNode = /actions\/setup-node@[0-9a-f]{40} # v\d[^\n]*\n(\s+if:[^\n]*\n)?\s+with:\n\s+node-version-file: \.nvmrc/;

  it("pins one exact Node version in .nvmrc, .node-version and package.json engines", () => {
    expect(nvmrc).toMatch(/^\d+\.\d+\.\d+$/);
    expect(read(path.join(root, ".node-version")).trim()).toBe(nvmrc);
    expect(pkg.engines.node).toBe(`>=${nvmrc}`);
  });

  it("sets up that Node in the shared setup action and in every job that runs Node without it", () => {
    expect(read(path.join(root, ".github", "actions", "setup", "action.yml"))).toMatch(setupNode);
    const missing = files
      .filter((f) => f.includes(`${path.sep}workflows${path.sep}`))
      .flatMap((f) =>
        jobsOf(read(f))
          .filter((job) => usesNode.test(job.split("\n").filter((line) => !/^\s*#/.test(line)).join("\n")))
          .filter((job) => !job.includes("uses: ./.github/actions/setup") && !setupNode.test(job))
          .map((job) => `${path.basename(f)}: ${job.split(":")[0]}`),
      );
    expect(missing).toEqual([]);
  });
});
