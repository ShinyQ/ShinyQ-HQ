import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { listBlogFiles } from "@/content/blog";
import { DynamicFactsSchema } from "@/content/dynamic-facts";
import { loadAllowlist } from "@/content/safety";
import { getContent, getPerspectives, getSiteBuild } from "@/content/load";
import type { Locale, Perspective } from "@/content/schema";
import type { KnowledgePack } from "../../functions/_lib/types";
import { buildKnowledgePack, validatePack } from "./pack";

/** Node-only: reads the repo (content, blog, live facts, the product allowlist) and builds the pack. */

export const DYNAMIC_FACTS_FILE = path.join(process.cwd(), "content", "generated", "dynamic-facts.json");

/** Last commit date of content/ (YYYY-MM-DD), or today outside a git checkout. */
export function contentDate(cwd = process.cwd()): string {
  try {
    const date = execFileSync("git", ["log", "-1", "--format=%cs", "--", "content/"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  } catch {
    // Not a git checkout.
  }
  return new Date().toISOString().slice(0, 10);
}

export function loadDynamicFacts() {
  return DynamicFactsSchema.parse(JSON.parse(readFileSync(DYNAMIC_FACTS_FILE, "utf8")));
}

export function buildRepoPack(date = contentDate(), options: { perspectives?: readonly Perspective[] } = {}): { pack: KnowledgePack; errors: string[] } {
  const posts: Record<string, Partial<Record<Locale, string>>> = {};
  for (const { slug, locale, file } of listBlogFiles()) (posts[slug] ??= {})[locale] = readFileSync(file, "utf8");
  const pack = buildKnowledgePack({
    content: getContent(),
    facts: loadDynamicFacts(),
    posts,
    contentDate: date,
    products: loadAllowlist(),
    perspectives: options.perspectives ?? getPerspectives(),
    siteBuild: getSiteBuild(),
  });
  return { pack, errors: validatePack(pack) };
}
