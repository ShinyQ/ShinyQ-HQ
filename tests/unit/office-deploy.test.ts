import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const deploy = readFileSync(".github/workflows/deploy.yml", "utf8");
const rollback = readFileSync(".github/workflows/rollback.yml", "utf8");
const check = readFileSync(".github/workflows/office-worker.yml", "utf8");

const job = (text: string, name: string) => {
  const start = text.indexOf(`\n  ${name}:\n`);
  const next = text.slice(start + 1).search(/\n  [a-z][a-z-]*:\n/);
  return next < 0 ? text.slice(start) : text.slice(start, start + 1 + next);
};

describe("hq-office deploy", () => {
  it("deploys the Worker only after a successful gated Pages upload, and a failed Worker deploy is reported", () => {
    const office = job(deploy, "office-worker");
    expect(deploy.indexOf("\n  office-worker:\n")).toBeGreaterThan(deploy.indexOf("\n  deploy:\n"));
    expect(office).toContain("needs: [resolve, deploy]");
    expect(office).toContain("if: ${{ !cancelled() && needs.deploy.result == 'success' }}");
    expect(job(deploy, "deploy")).toContain("needs: [resolve, verify, site, e2e]\n");
    expect(job(deploy, "deploy")).not.toContain("office-worker");
    expect(job(deploy, "report")).toContain("needs: [resolve, verify, site, e2e, deploy, stats-worker, office-worker]");
  });

  it("skips commits without workers/office, builds the safety list, deploys and puts exactly two secrets, in step env", () => {
    const section = job(deploy, "office-worker");
    expect(section).toMatch(/\[ ! -f workers\/office\/wrangler\.toml \]/);
    expect(section).toContain("::notice::");
    expect(section).toContain("bun scripts/build-knowledge.ts");
    expect(section).toContain("working-directory: workers/office");
    expect(section).toContain("bunx wrangler deploy");
    expect(section.match(/bunx wrangler secret put /g)).toHaveLength(2);
    expect(section).toContain("bunx wrangler secret put OFFICE_INGEST_KEY");
    expect(section).toContain("bunx wrangler secret put GITHUB_WEBHOOK_SECRET");
    expect(section).toContain("OFFICE_INGEST_KEY: ${{ secrets.OFFICE_INGEST_KEY }}");
    expect(section).toContain("GITHUB_WEBHOOK_SECRET: ${{ secrets.OFFICE_GITHUB_WEBHOOK_SECRET }}");
    expect(section).not.toMatch(/^\s{4}env:\n[\s\S]*?secrets\./m);
    expect(section).toContain("vars.OFFICE_WORKER_DEPLOY == 'false'");
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
