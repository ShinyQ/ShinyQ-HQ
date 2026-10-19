import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const deploy = readFileSync(".github/workflows/deploy.yml", "utf8");
const rollback = readFileSync(".github/workflows/rollback.yml", "utf8");
const check = readFileSync(".github/workflows/office-worker.yml", "utf8");
const wrangler = readFileSync("wrangler.toml", "utf8");

const job = (text: string, name: string) => {
  const start = text.indexOf(`\n  ${name}:\n`);
  const next = text.slice(start + 1).search(/\n  [a-z][a-z-]*:\n/);
  return next < 0 ? text.slice(start) : text.slice(start, start + 1 + next);
};

describe("hq-office deploy", () => {
  it("deploys the Worker inside the Pages job, after the gates and before the upload, and a failed Worker deploy turns the job red", () => {
    expect(deploy).not.toContain("\n  office-worker:\n");
    const section = job(deploy, "deploy");
    expect(section).toContain("needs: [resolve, verify, site, e2e]\n");
    const at = (needle: string) => {
      const i = section.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    const order = [
      at("- name: Build the Ask the HQ knowledge pack"),
      at("- name: Require a complete green main CI"),
      at("- name: hq-office Worker configured?"),
      at("- name: Deploy hq-office and set its secrets"),
      at("- name: Deploy to Cloudflare Pages"),
      at("- name: Smoke-check production"),
      at("- name: hq-office Worker deploy failed"),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const step = section.slice(at("- name: Deploy hq-office and set its secrets"), at("- name: Deploy to Cloudflare Pages"));
    expect(step).toContain("id: office_deploy");
    expect(step).toContain("continue-on-error: true");
    const failed = section.slice(at("- name: hq-office Worker deploy failed"));
    expect(failed).toContain("if: steps.office_deploy.outcome == 'failure'");
    expect(failed).toContain("::error::");
    expect(failed).toContain("exit 1");
    expect(job(deploy, "report")).toContain("needs: [resolve, verify, site, e2e, deploy, stats-worker]\n");
    expect(deploy).not.toContain("office-worker");
  });

  it("skips commits without workers/office, deploys and puts exactly two secrets, in step env", () => {
    const section = job(deploy, "deploy");
    const configured = section.slice(section.indexOf("- name: hq-office Worker configured?"), section.indexOf("- name: Deploy hq-office and set its secrets"));
    expect(configured).toContain("id: office");
    expect(configured).toContain("steps.gate.outputs.enabled == 'true'");
    expect(configured).toMatch(/\[ ! -f workers\/office\/wrangler\.toml \]/);
    expect(configured).toContain("::notice::");
    expect(configured).toContain("vars.OFFICE_WORKER_DEPLOY == 'false'");
    expect(section).toContain("working-directory: workers/office");
    expect(section).toContain("bunx wrangler deploy\n");
    expect(section.match(/wrangler secret put /g)).toHaveLength(2);
    expect(section).toContain("bunx wrangler secret put OFFICE_INGEST_KEY");
    expect(section).toContain("bunx wrangler secret put GITHUB_WEBHOOK_SECRET");
    expect(section).toContain("OFFICE_INGEST_KEY: ${{ secrets.OFFICE_INGEST_KEY }}");
    expect(section).toContain("GITHUB_WEBHOOK_SECRET: ${{ secrets.OFFICE_GITHUB_WEBHOOK_SECRET }}");
    expect(section).not.toMatch(/^\s{4}env:\n(?:\s{6}.*\n)*?\s{6}.*secrets\./m);
    expect(section).toContain("name: production");
  });

  it("restores the Pages service binding OFFICE to hq-office", () => {
    expect(wrangler).toMatch(/^\[\[services\]\]\nbinding = "OFFICE"\nservice = "hq-office"$/m);
    expect(wrangler).not.toMatch(/^#\s*\[\[services\]\]/m);
    expect(wrangler).not.toMatch(/^#\s*binding = "OFFICE"/m);
  });

  it("rolls the Worker back with Pages when it changed, from the target checkout, without re-putting secrets", () => {
    expect(rollback).toContain("Did the hq-office Worker change?");
    expect(rollback).toContain("workers/office src/lib/office src/content/safety-match.ts functions/_lib/security.ts");
    expect(rollback).toContain("vars.OFFICE_WORKER_DEPLOY == 'false'");
    const step = rollback.slice(rollback.indexOf("- name: Redeploy hq-office from the rollback target"));
    expect(step).toContain("working-directory: target/workers/office");
    expect(step).toContain("bunx wrangler deploy");
    expect(rollback).not.toContain("wrangler secret put");
    expect(rollback).toContain("SAFETY_BLOCKLIST: ${{ secrets.SAFETY_BLOCKLIST }}");
  });

  it("checks the bundle on pull requests without any secret, also when its bundled imports change", () => {
    expect(check).toContain('"workers/office/**"');
    expect(check).toContain('"functions/_lib/security.ts"');
    expect(check).toContain('"scripts/build-knowledge.ts"');
    expect(check).toContain("bunx wrangler deploy --dry-run");
    expect(check).not.toContain("secrets.");
  });
});
