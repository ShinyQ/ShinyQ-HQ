/**
 * Runs the e2e specs that cover your changes (scripts/e2e-plan.ts maps paths to specs).
 * Usage: bun scripts/e2e-changed.ts [--base origin/main] [--smoke | --all] [--dry] [extra playwright args]
 *
 * Changed paths = commits since the merge base with --base, plus staged, unstaged and untracked
 * files. Needs a current `out/` (`bun run build`, which `verify:quick` runs).
 */
import { existsSync } from "node:fs";
import { SMOKE_SPECS, specsForChanges } from "./e2e-plan";

function git(args: string[]): string[] {
  const result = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) return [];
  return result.stdout.toString().split("\n").map((l) => l.trim()).filter(Boolean);
}

function changedFiles(base: string): string[] {
  const mergeBase = git(["merge-base", "HEAD", base])[0];
  const files = new Set<string>([
    ...(mergeBase ? git(["diff", "--name-only", mergeBase, "HEAD"]) : []),
    ...git(["diff", "--name-only", "HEAD"]),
    ...git(["ls-files", "--others", "--exclude-standard"]),
  ]);
  return [...files].sort();
}

function main() {
  const args = process.argv.slice(2);
  const take = (flag: string) => {
    const i = args.indexOf(flag);
    if (i < 0) return false;
    args.splice(i, 1);
    return true;
  };
  const dry = take("--dry");
  const smoke = take("--smoke");
  const all = take("--all");
  let base = "origin/main";
  const b = args.indexOf("--base");
  if (b >= 0) {
    base = args[b + 1] ?? base;
    args.splice(b, 2);
  }

  let specs: readonly string[] | "all";
  if (all) {
    specs = "all";
    console.log("e2e: full suite");
  } else if (smoke) {
    specs = SMOKE_SPECS;
    console.log(`e2e smoke: ${specs.join(", ")}`);
  } else {
    const files = changedFiles(base);
    const plan = files.length ? specsForChanges(files) : { specs: [...SMOKE_SPECS], unmatched: [] };
    specs = plan.specs;
    console.log(`${files.length} changed file(s) since ${base}.`);
    if (plan.unmatched.length) console.log(`No e2e mapping for: ${plan.unmatched.join(", ")} (smoke specs added).`);
    if (specs === "all") console.log("Test infrastructure or dependencies changed: running the full suite.");
    else if (specs.length === 0) console.log("No e2e specs cover these changes.");
    else console.log(`e2e specs: ${specs.join(", ")}`);
  }
  if (dry || (specs !== "all" && specs.length === 0)) return;

  if (!existsSync("out/en.html") && !existsSync("out/en/index.html")) {
    console.error("out/ is missing or stale. Run `bun run build` (or `bun run verify:quick`) first.");
    process.exit(1);
  }
  const files = specs === "all" ? [] : specs.map((s) => `e2e/${s}.spec.ts`);
  const run = Bun.spawnSync(["bunx", "playwright", "test", ...files, ...args], { stdout: "inherit", stderr: "inherit" });
  process.exit(run.exitCode ?? 1);
}

main();
