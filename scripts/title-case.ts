/**
 * Title Case for content titles (src/content/title-case.ts).
 * Usage:
 *   bun scripts/title-case.ts           list titles that are not in Title Case (exit 1 if any)
 *   bun scripts/title-case.ts --write   rewrite them in content/site-content.json and the MDX frontmatter
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SiteContentSchema, type SiteContent } from "../src/content/schema";
import { titleCase } from "../src/content/title-case";
import { applyTitleCase, frontmatterTitle, titleCaseChanges, withFrontmatterTitle } from "../src/content/titles";

const write = process.argv.includes("--write");
const root = process.cwd();
const contentFile = path.join(root, "content", "site-content.json");
const blogDir = path.join(root, "content", "blog");

const raw = readFileSync(contentFile, "utf8");
const parsed = SiteContentSchema.safeParse(JSON.parse(raw));
if (!parsed.success) {
  console.error("content/site-content.json does not validate; run bun run validate:content first");
  process.exit(2);
}
// Edit the raw JSON (not the zod output) so nothing but the titles changes.
const content = JSON.parse(raw) as SiteContent;
const changes = write ? applyTitleCase(content) : titleCaseChanges(content);
const lines = changes.map((c) => `content/site-content.json ${c.path}: "${c.before}" -> "${c.after}"`);

for (const name of readdirSync(blogDir).filter((f) => f.endsWith(".mdx")).sort()) {
  const file = path.join(blogDir, name);
  const source = readFileSync(file, "utf8");
  const before = frontmatterTitle(source);
  if (before === undefined) {
    lines.push(`content/blog/${name}: no title in the frontmatter`);
    continue;
  }
  const after = titleCase(before);
  if (after === before) continue;
  lines.push(`content/blog/${name} title: "${before}" -> "${after}"`);
  if (write) writeFileSync(file, withFrontmatterTitle(source, after));
}

if (write && changes.length > 0) writeFileSync(contentFile, `${JSON.stringify(content, null, 2)}\n`);
for (const line of lines) console.log(line);
console.log(`${lines.length} title(s) ${write ? "rewritten" : "not in Title Case"}`);
if (!write && lines.length > 0) process.exit(1);
