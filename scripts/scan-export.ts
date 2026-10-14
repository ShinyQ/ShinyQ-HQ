/**
 * Public-safety scan of the static export that ships (security S1 and S9, tests P4), plus the
 * private blocklist gate. Run after every build that may deploy:
 *
 *   bun scripts/scan-export.ts [out]
 *
 * 1. Private blocklist gate. Checks that the merged list holds private terms (beyond the committed
 *    default list) without printing them or their number. In GitHub Actions on `push`, `workflow_dispatch` or `schedule` (main and the
 *    production deploy) a missing list fails, unless `SAFETY_BLOCKLIST_GRACE_UNTIL` (YYYY-MM-DD,
 *    repository variable) is today or later; on `pull_request` (forks and Dependabot get no
 *    secrets) it warns. Both write a job summary line, so a skip is never silent.
 * 2. Scans every text file of `out/` (HTML, RSC payloads, JSON, XML, webmanifest, JS, CSS, SVG, MD)
 *    for blocklisted terms with `scanBuildOutput`. Hits print private terms as `private term #n`.
 */
import { appendFileSync, existsSync } from "node:fs";
import path from "node:path";
import { loadBlocklist, loadDefaultBlocklist, scanBuildOutput } from "../src/content/safety";

export type GateState = "enabled" | "missing";
export type GateVerdict = "pass" | "warn" | "fail" | "grace";

/** Number of private terms in the merged list (local file plus the SAFETY_BLOCKLIST secret). */
export function privateTermCount(terms: readonly string[], publicTerms: readonly string[] = loadDefaultBlocklist()): number {
  const visible = new Set(publicTerms);
  return terms.filter((t) => !visible.has(t)).length;
}

/** What the gate does for a run: pull requests only warn, every other CI event fails without the list. */
export function gateVerdict(state: GateState, opts: { ci: boolean; event?: string; graceUntil?: string; today: string }): GateVerdict {
  if (state === "enabled") return "pass";
  if (!opts.ci || opts.event === "pull_request" || opts.event === "pull_request_target") return "warn";
  if (opts.graceUntil && /^\d{4}-\d{2}-\d{2}$/.test(opts.graceUntil) && opts.today <= opts.graceUntil) return "grace";
  return "fail";
}

function summary(line: string) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

function main() {
  const dir = path.resolve(process.argv[2] ?? "out");
  if (!existsSync(dir)) {
    console.error(`::error::${dir} does not exist; build the site first (bun run build).`);
    process.exit(1);
  }
  const terms = loadBlocklist();
  const count = privateTermCount(terms);
  const state: GateState = count > 0 ? "enabled" : "missing";
  const ci = process.env.GITHUB_ACTIONS === "true";
  const graceUntil = process.env.SAFETY_BLOCKLIST_GRACE_UNTIL?.trim() || undefined;
  const verdict = gateVerdict(state, { ci, event: process.env.GITHUB_EVENT_NAME, graceUntil, today: new Date().toISOString().slice(0, 10) });
  let failed = false;

  if (verdict === "pass") {
    console.log("Private blocklist: enabled.");
    summary("Private blocklist: enabled (the export was checked against the private terms).");
  } else if (verdict === "warn") {
    const why = ci ? "this pull request run has no SAFETY_BLOCKLIST secret (fork or Dependabot)" : "no local list or SAFETY_BLOCKLIST";
    console.log(`::warning title=Private blocklist not checked::Private blocklist: missing; ${why}. Only the committed default list was checked.`);
    summary(`> [!WARNING]\n> Private blocklist not checked: ${why}. Only the committed default list was checked; main and the production deploy check it.`);
  } else if (verdict === "grace") {
    console.log(`::warning title=Private blocklist missing::SAFETY_BLOCKLIST is not set. Allowed until ${graceUntil} (SAFETY_BLOCKLIST_GRACE_UNTIL); this run fails after that. docs/deploy.md section 3.`);
    summary(`> [!WARNING]\n> Private blocklist missing: the SAFETY_BLOCKLIST secret is not set. Allowed until ${graceUntil}; main and deploy runs fail after that (docs/deploy.md section 3).`);
  } else {
    console.log("::error title=Private blocklist missing::SAFETY_BLOCKLIST is not set (or holds no private term). main and the production deploy require it: docs/deploy.md section 3.");
    summary("> [!CAUTION]\n> Private blocklist missing: the SAFETY_BLOCKLIST secret is not set. main and the production deploy require it (docs/deploy.md section 3).");
    failed = true;
  }

  const started = performance.now();
  const hits = scanBuildOutput(dir, terms);
  const ms = Math.round(performance.now() - started);
  if (hits.length) {
    for (const hit of hits) console.log(`::error file=${path.join(path.relative(process.cwd(), dir), hit.file)}::blocklisted: ${hit.terms.join(", ")}`);
    summary(`Export scan: **${hits.length} file(s) with blocklisted terms** (${ms} ms).`);
    failed = true;
  } else {
    console.log(`Export scan: no blocklisted term in ${path.relative(process.cwd(), dir) || "."} (${ms} ms).`);
    summary(`Export scan: no blocklisted term in \`${path.relative(process.cwd(), dir) || "."}\` (${ms} ms).`);
  }
  if (failed) process.exit(1);
}

if (import.meta.main) main();
