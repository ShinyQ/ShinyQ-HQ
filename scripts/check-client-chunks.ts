/**
 * Post-build gate (part of `bun run build`): build-time code must never reach the browser.
 * Scans out/_next/static/chunks for zod, the content loader, the dataset and the hologram shape converter (docs/agents/content.md, REPORT SP1),
 * and the chunks every exported page loads for the floor layouts, which belong to the 3D path only
 * (docs/agents/performance.md, floor order out of Classic).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const LEAK_PATTERNS: readonly { label: string; token: string; re: RegExp }[] = [
  { label: "zod", token: "_zod", re: /_zod\b/ },
  { label: "content loader", token: "readFileSync", re: /\breadFileSync\b/ },
  { label: "dataset", token: "site-content", re: /site-content/ },
  // The hologram shape converter and recipes run at build only; the 3D floors fetch public/shapes/*.json.
  { label: "shape converter", token: "Unsupported path command", re: /Unsupported path command/ },
];

export function chunkLeaks(files: readonly { name: string; text: string }[]): string[] {
  const leaks: string[] = [];
  for (const file of files) for (const p of LEAK_PATTERNS) if (p.re.test(file.text)) leaks.push(`${file.name}: ${p.label} (${p.token})`);
  return leaks;
}

/**
 * One view zone id per floor layout module: string literals survive minification, and only the layouts
 * (reached through `experience/config`) carry them. A Page View chunk that holds one pulled the layouts in.
 */
export const FLOOR_LAYOUT_MARKERS: readonly { label: string; token: string }[] = [
  // One view zone id per layout. Modules without their own marker (nav/road.ts, lobby/hallGallery.ts, labs/ops.ts) travel in the same chunk as a marked layout, so they are caught through it.
  { label: "experience/config", token: "L1:arrival" },
  { label: "L1 Highlights Hall", token: "L1:highlights-entry" },
  { label: "L2 Career Road", token: "L2:arrival" },
  { label: "L3 Project Roads", token: "L3:overview" },
  { label: "L4 Writing", token: "L4:arrival" },
  { label: "RF roof deck", token: "RF:arrival" },
  { label: "B1 Engine Room", token: "B1:arrival" },
];

/** The chunk files (relative to `_next/static/chunks/`) an exported page references, once each, in order. */
export function pageChunks(html: string): string[] {
  const names = [...html.matchAll(/\/_next\/static\/chunks\/([^"'\\\s?]+?\.js)/g)].map((m) => m[1]);
  return [...new Set(names)];
}

export function floorLayoutLeaks(files: readonly { name: string; text: string }[]): string[] {
  const leaks: string[] = [];
  for (const file of files)
    for (const m of FLOOR_LAYOUT_MARKERS) if (['"', "'", "`"].some((q) => file.text.includes(q + m.token + q))) leaks.push(`${file.name}: floor layout (${m.label}, "${m.token}")`);
  return leaks;
}

function walk(dir: string, ext = ".js", out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, ext, out);
    else if (name.endsWith(ext)) out.push(full);
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
  const outDir = path.join(process.cwd(), "out");
  const loaded = new Set(walk(outDir, ".html").flatMap((html) => pageChunks(readFileSync(html, "utf8"))));
  const layoutLeaks = floorLayoutLeaks(files.filter((f) => loaded.has(f.name.split(path.sep).join("/"))));
  if (layoutLeaks.length) {
    console.error(
      `Floor layouts in a Page View chunk:\n- ${layoutLeaks.join("\n- ")}\nClassic code reads the floor order from @/experience/floorOrder and the Lobby spawn from @/experience/floors/lobby/spawn, never @/experience/config.`,
    );
    process.exit(1);
  }
  console.log(`check-client-chunks: ${files.length} chunks clean, ${loaded.size} page chunks free of floor layouts`);
}
