#!/usr/bin/env bun
/**
 * Social-card preview check over the static export (run after `bun run build`; part of
 * `verify:quick`). Every page in both locales plus the root redirect page must have a title, a
 * 140 to 160 character description, a canonical, hreflang en/id/x-default, og:title, og:description,
 * og:url, og:image (declared 1200x630 image/jpeg) with alt, and twitter:card summary_large_image with
 * twitter:image. Every referenced image must exist in out/, be a 1200x630 JPEG and weigh at most
 * 300 KB. Writes 300 px previews and a contact sheet (screenshots/og-preview/index.html) for the
 * legibility review.
 *
 *   bun scripts/og-check.ts [--out out] [--previews screenshots/og-preview]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { LOCALES } from "@/content/schema";
import { allPagePaths } from "@/lib/routes";
import { OG_MAX_BYTES, exportHtmlPath, jpegSize, parseSocialMeta, validateSocialMeta } from "./og-meta";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const outDir = flag("--out", "out");
const previewDir = flag("--previews", path.join("screenshots", "og-preview"));

const problems: string[] = [];
const images = new Map<string, string[]>();
const pages = [
  { file: path.join(outDir, "index.html"), label: "/" },
  ...LOCALES.flatMap((locale) => allPagePaths().map((p) => ({ file: exportHtmlPath(outDir, locale, p), label: `/${locale}${p === "/" ? "" : p}` }))),
];

for (const page of pages) {
  if (!existsSync(page.file)) {
    problems.push(`${page.label}: missing ${page.file}`);
    continue;
  }
  const meta = parseSocialMeta(readFileSync(page.file, "utf8"));
  for (const problem of validateSocialMeta(meta)) problems.push(`${page.label}: ${problem}`);
  const url = meta.og["og:image"];
  if (url) {
    const rel = new URL(url, "https://placeholder.invalid").pathname;
    images.set(rel, [...(images.get(rel) ?? []), page.label]);
  }
}

mkdirSync(previewDir, { recursive: true });
const rows: string[] = [];
const sizes: number[] = [];
for (const [rel, usedBy] of images) {
  const file = path.join(outDir, rel);
  if (!existsSync(file)) {
    problems.push(`${rel}: image missing (used by ${usedBy[0]})`);
    continue;
  }
  const bytes = readFileSync(file);
  sizes.push(bytes.length);
  const size = jpegSize(bytes);
  if (!size || size.width !== 1200 || size.height !== 630) problems.push(`${rel}: not a 1200x630 JPEG`);
  if (bytes.length > OG_MAX_BYTES) problems.push(`${rel}: ${(bytes.length / 1024).toFixed(0)} KB, over ${OG_MAX_BYTES / 1024} KB`);
  const name = rel.replace(/^\/og\//, "").replace(/\//g, "_").replace(/\.jpg$/, "");
  await sharp(bytes).resize(300).png().toFile(path.join(previewDir, `${name}-300.png`));
  rows.push(
    `<figure><img src="${path.relative(previewDir, file)}" width="600"><img src="${name}-300.png" width="300"><figcaption>${rel}<br>${(bytes.length / 1024).toFixed(0)} KB, ${usedBy.length} page(s)</figcaption></figure>`,
  );
}

writeFileSync(
  path.join(previewDir, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>OG preview</title><style>body{background:#111;color:#ddd;font:14px system-ui}figure{display:flex;gap:16px;align-items:flex-start;margin:24px}</style>\n${rows.join("\n")}\n`,
);
console.log(
  `${pages.length} pages, ${images.size} share images, largest ${(Math.max(...sizes) / 1024).toFixed(0)} KB, total ${(sizes.reduce((a, b) => a + b, 0) / 1024 / 1024).toFixed(1)} MB. Previews: ${previewDir}/index.html`,
);
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
