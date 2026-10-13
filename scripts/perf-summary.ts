/**
 * Perf summaries for CI job pages. Never fails on numbers: the Playwright gates do that.
 *
 *   bun scripts/perf-summary.ts lhci --head .lighthouseci [--base base-lhci]
 *   bun scripts/perf-summary.ts gates --head perf-report [--base base-perf]
 *   bun scripts/perf-summary.ts timeline --head perf-report [--base base-timeline]
 *   bun scripts/perf-summary.ts baseline --head perf-report --write e2e/perf/baseline.json
 *
 * Appends Markdown to $GITHUB_STEP_SUMMARY when it is set (else prints it) and prints one
 * `::warning::` line per budget at 90% or more. Imports only node: modules and relative files, so it
 * runs without `bun install` (the Lighthouse job has none).
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isLhr, isPerfEntry, programBaseline, renderGates, renderLhci, renderTimeline, type ProgramBaseline, type Summary } from "./perf-report";

/** Every parseable JSON file under `dir` (recursive); a missing dir is empty. */
function jsonFiles(dir: string | undefined): unknown[] {
  if (!dir || !existsSync(dir)) return [];
  const out: unknown[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const file = path.join(d, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (name.endsWith(".json")) {
        try {
          out.push(JSON.parse(readFileSync(file, "utf8")));
        } catch {
          // Not a report file (or truncated): skip it.
        }
      }
    }
  };
  walk(dir);
  return out;
}

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function emit(summary: Summary) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, `${summary.markdown}\n`);
  else console.log(summary.markdown);
  for (const warning of summary.warnings) console.log(`::warning::${warning}`);
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  const head = arg(args, "--head");
  const base = arg(args, "--base");
  const entries = (dir: string | undefined) => jsonFiles(dir).filter(isPerfEntry);
  switch (command) {
    case "lhci":
      emit(renderLhci(jsonFiles(head).filter(isLhr), jsonFiles(base).filter(isLhr)));
      return;
    case "gates":
      emit(renderGates(entries(head), entries(base)));
      return;
    case "timeline":
      emit(renderTimeline(entries(head), entries(base)));
      return;
    case "baseline": {
      const target = arg(args, "--write");
      if (!target) throw new Error("baseline needs --write <file>");
      const previous = existsSync(target) ? (JSON.parse(readFileSync(target, "utf8")) as ProgramBaseline) : undefined;
      writeFileSync(target, `${JSON.stringify(programBaseline(entries(head), previous), null, 2)}\n`);
      console.log(`Wrote ${target}`);
      return;
    }
    default:
      console.error("usage: bun scripts/perf-summary.ts lhci|gates|timeline|baseline --head <dir> [--base <dir>] [--write <file>]");
      process.exit(2);
  }
}

if (import.meta.main) main();
