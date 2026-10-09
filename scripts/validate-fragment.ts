/**
 * Validates a content fragment while the dataset is being authored.
 * Usage:
 *   bun scripts/validate-fragment.ts pods <file.json>   (array of Pod)
 *   bun scripts/validate-fragment.ts rest <file.json>   (SiteContent without floors.labs)
 *   bun scripts/validate-fragment.ts full <file.json>   (complete SiteContent)
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { PodSchema, SiteContentSchema } from "../src/content/schema";
import { collectStrings, findBlockedTerms, findForbiddenPatterns, loadBlocklist } from "../src/content/safety";

const [kind, file] = process.argv.slice(2);
if (!kind || !file) {
  console.error("Usage: bun scripts/validate-fragment.ts <pods|rest|full> <file.json>");
  process.exit(2);
}

const RestSchema = SiteContentSchema.extend({
  floors: SiteContentSchema.shape.floors.extend({ labs: z.unknown().optional() }),
});

const schema = kind === "pods" ? z.array(PodSchema) : kind === "rest" ? RestSchema : SiteContentSchema;
const data: unknown = JSON.parse(readFileSync(file, "utf8"));
const parsed = schema.safeParse(data);
let failed = false;

if (!parsed.success) {
  failed = true;
  console.error(z.prettifyError(parsed.error));
}

const terms = loadBlocklist();
for (const leaf of collectStrings(data)) {
  const hits = [...findBlockedTerms(leaf.value, terms), ...findForbiddenPatterns(leaf.value)];
  if (hits.length > 0) {
    failed = true;
    console.error(`${leaf.path}: ${hits.join(", ")}\n  ${leaf.value}`);
  }
}

if (failed) process.exit(1);
console.log(`OK: ${file} is a valid ${kind} fragment (${terms.length} blocklist terms checked)`);
