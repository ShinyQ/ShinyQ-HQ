/**
 * Subsets the in-world (troika) fonts to the characters 3D text can render and writes them under
 * content-hashed names, so /fonts/* is cached for a year (round 5 P1, REPORT SP10). Troika 0.52 cannot
 * read WOFF2, so the cuts stay WOFF. Inputs: src/assets/fonts/troika/ (the @fontsource latin cuts and the
 * JetBrains Mono symbols cut). Needs fonttools 4.x (pyftsubset). Usage: bun scripts/troika-fonts.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { run } from "./pdf-pages";
import { LAYOUT_FEATURES, inWorldCodePoints, latinCodePoints, symbolCodePoints, toUnicodes } from "./troika-glyphs";

const root = process.cwd();
const SRC = path.join(root, "src", "assets", "fonts", "troika");
const OUT = path.join(root, "public", "fonts", "3d");
const MANIFEST = path.join(root, "src", "experience", "troika-fonts.json");
const FONTS = [
  { key: "sans", file: "inter-latin-400-normal.woff", set: "latin" },
  { key: "sansBold", file: "inter-latin-800-normal.woff", set: "latin" },
  { key: "mono", file: "jetbrains-mono-latin-400-normal.woff", set: "latin" },
  { key: "monoBold", file: "jetbrains-mono-latin-700-normal.woff", set: "latin" },
  { key: "symbols", file: "jetbrains-mono-symbols-700.woff", set: "symbols" },
] as const;

const unicodes = { latin: toUnicodes(latinCodePoints()), symbols: toUnicodes(symbolCodePoints(inWorldCodePoints(root).keys())) };
mkdirSync(OUT, { recursive: true });
const manifest: Record<string, string> = {};
const keep = new Set<string>();
let total = 0;
for (const font of FONTS) {
  const tmp = path.join(OUT, `.tmp-${font.file}`);
  run("pyftsubset", [
    path.join(SRC, font.file),
    `--unicodes=${unicodes[font.set]}`,
    `--layout-features=${LAYOUT_FEATURES.join(",")}`,
    "--no-hinting",
    "--name-IDs=*",
    "--notdef-outline",
    "--flavor=woff",
    `--output-file=${tmp}`,
  ]);
  const bytes = readFileSync(tmp);
  const name = font.file.replace(/\.woff$/, `.${createHash("sha256").update(bytes).digest("hex").slice(0, 8)}.woff`);
  renameSync(tmp, path.join(OUT, name));
  keep.add(name);
  manifest[font.key] = `/fonts/3d/${name}`;
  total += bytes.length;
  console.log(`${name.padEnd(52)} ${String(bytes.length).padStart(6)} bytes`);
}
for (const name of readdirSync(OUT)) if (!keep.has(name)) rmSync(path.join(OUT, name));
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`total ${total} bytes (was 139,216 for the five unsubset WOFFs)`);
