/**
 * Post-build gate (part of `bun run build`): build-time code must never reach the browser.
 * Scans out/_next/static/chunks for zod, the content loader and the dataset (AGENTS.md, REPORT SP1).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const LEAK_PATTERNS: readonly { label: string; token: string; re: RegExp }[] = [
  { label: "zod", token: "_zod", re: /_zod\b/ },
  { label: "content loader", token: "readFileSync", re: /\breadFileSync\b/ },
  { label: "dataset", token: "site-content", re: /site-content/ },
];

export function chunkLeaks(files: readonly { name: string; text: string }[]): string[] {
  const leaks: string[] = [];
  for (const file of files) for (const p of LEAK_PATTERNS) if (p.re.test(file.text)) leaks.push(`${file.name}: ${p.label} (${p.token})`);
  return leaks;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

if (import.meta.main) {
  const dir = path.join(process.cwd(), "out", "_next", "static", "chunks");
  const files = walk(dir).map((full) => ({ name: path.relative(dir, full), text: readFileSync(full, "utf8") }));
  const leaks = chunkLeaks(files);
  if (leaks.length) {
    console.error(
      `Build-time code in client chunks:\n- ${leaks.join("\n- ")}\nImport LOCALES from @/content/locales and keep @/content/load and zod out of client modules.`,
    );
    process.exit(1);
  }
  console.log(`check-client-chunks: ${files.length} chunks clean`);
}
