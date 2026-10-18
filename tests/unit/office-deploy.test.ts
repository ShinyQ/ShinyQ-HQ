import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const deploy = readFileSync(".github/workflows/deploy.yml", "utf8");
const check = readFileSync(".github/workflows/office-worker.yml", "utf8");

describe("hq-office deploy", () => {
  it("deploys the Worker before the Pages upload, and the upload does not depend on its result", () => {
    const office = deploy.indexOf("\n  office-worker:\n");
    const pages = deploy.indexOf("\n  deploy:\n");
    expect(office).toBeGreaterThan(0);
    expect(office).toBeLessThan(pages);
    expect(deploy).toMatch(/\n  deploy:\n[\s\S]*?needs: \[resolve, verify, site, e2e, office-worker\]/);
    expect(deploy).toMatch(/needs: \[resolve, verify, site, e2e, deploy, stats-worker, office-worker\]/);
  });

  it("builds the safety list first, deploys from workers/office and sets only the two secrets, in step env", () => {
    const section = deploy.slice(deploy.indexOf("\n  office-worker:\n"), deploy.indexOf("\n  deploy:\n"));
    expect(section).toContain("bun scripts/build-knowledge.ts");
    expect(section).toContain("working-directory: workers/office");
    expect(section).toContain("bunx wrangler deploy");
    expect(section).toContain("OFFICE_INGEST_KEY: ${{ secrets.OFFICE_INGEST_KEY }}");
    expect(section).toContain("GITHUB_WEBHOOK_SECRET: ${{ secrets.GITHUB_WEBHOOK_SECRET }}");
    expect(section).not.toMatch(/^\s{4}env:\n[\s\S]*?secrets\./m);
    expect(section).toContain("vars.OFFICE_WORKER_DEPLOY == 'false'");
  });

  it("checks the bundle on pull requests without any secret", () => {
    expect(check).toContain('"workers/office/**"');
    expect(check).toContain("bunx wrangler deploy --dry-run");
    expect(check).not.toContain("secrets.");
  });
});
