/**
 * Script policy check of the static export that ships (tests P4). Run after every build that may deploy:
 *
 *   bun scripts/scan-export.ts [out]
 *
 * Checks the script policy of every page (`exportPolicyProblems`, scripts/csp-hashes.ts): one data-hq-csp meta
 * tag derived from `_headers`, a sha256 for each inline script, no 'unsafe-inline'.
 */
import { appendFileSync, existsSync } from "node:fs";
import path from "node:path";
import { exportPolicyProblems } from "./csp-hashes";

function summary(line: string) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

function main() {
  const dir = path.resolve(process.argv[2] ?? "out");
  if (!existsSync(dir)) {
    console.error(`::error::${dir} does not exist; build the site first (bun run build).`);
    process.exit(1);
  }
  let policy: string[];
  try {
    policy = exportPolicyProblems(dir);
  } catch (error) {
    policy = [error instanceof Error ? error.message : String(error)];
  }
  if (policy.length) {
    for (const problem of policy) console.log(`::error::csp: ${problem}`);
    summary(`Script policy: **${policy.length} problem(s)**; every page needs its data-hq-csp meta with each inline script hash (scripts/csp-hashes.ts).`);
    process.exit(1);
  }
  console.log("Script policy: every page lists its inline script hashes.");
  summary("Script policy: every page lists its inline script hashes.");
}

if (import.meta.main) main();
