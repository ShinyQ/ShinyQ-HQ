import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export const ROOT = join(__dirname, "../..");
const SRC = join(ROOT, "src");

function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile() && /\.tsx?$/.test(c)) return c;
  }
  return null;
}

// Value imports and re-exports only: `import type`, `export type` and dynamic `import()` are skipped.
const STATIC = /^\s*(?:import|export)\s+(type\s+)?[^"';]*?from\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm;

/** Repo-relative paths a module reaches through static value imports, transitively (the module itself included). */
export function staticClosure(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [join(ROOT, entry)];
  while (stack.length) {
    const file = stack.pop()!;
    const rel = relative(ROOT, file);
    if (seen.has(rel)) continue;
    seen.add(rel);
    for (const m of readFileSync(file, "utf8").matchAll(STATIC)) {
      if (m[1]) continue;
      const target = resolve(file, m[2] ?? m[3]);
      if (target) stack.push(target);
    }
  }
  return seen;
}
