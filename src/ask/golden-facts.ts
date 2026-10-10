import type { DynamicFacts } from "@/content/dynamic-facts";

/**
 * Golden and red-team sets must not hard-code values that the weekly live-facts refresh changes
 * (content/generated/dynamic-facts.json). Write them as `{{facts.<path>}}`, e.g.
 * `{{facts.github.contributionsLastYear}}`; tests and the nightly eval resolve them here.
 */

const PLACEHOLDER = /\{\{facts\.([A-Za-z0-9_.]+)\}\}/g;

function lookup(facts: DynamicFacts, path: string): string | number | boolean {
  let value: unknown = facts;
  for (const key of path.split(".")) {
    if (value === null || typeof value !== "object" || !(key in value)) throw new Error(`Unknown live fact "facts.${path}"`);
    value = (value as Record<string, unknown>)[key];
  }
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") throw new Error(`Live fact "facts.${path}" is not a scalar`);
  return value;
}

/**
 * Every spelling an answer may use for the string: numbers resolve to the site format ("7,542")
 * and the plain form ("7542"). Strings without placeholders resolve to themselves.
 */
export function resolveFactVariants(text: string, facts: DynamicFacts): string[] {
  const paths = [...text.matchAll(PLACEHOLDER)].map((m) => m[1]);
  if (paths.length === 0) return [text];
  let variants = [text];
  for (const path of new Set(paths)) {
    const value = lookup(facts, path);
    const spellings = typeof value === "number" ? [...new Set([value.toLocaleString("en-US"), String(value)])] : [String(value)];
    const token = `{{facts.${path}}}`;
    variants = variants.flatMap((v) => spellings.map((s) => v.split(token).join(s)));
  }
  return variants;
}

/** The site's spelling only (as it appears in the knowledge pack). */
export function resolveFacts(text: string, facts: DynamicFacts): string {
  return resolveFactVariants(text, facts)[0];
}

export interface GoldenLike {
  facts: string[];
  expect: { all?: string[]; any?: string[]; any2?: string[]; none?: string[] } & Record<string, unknown>;
}

/**
 * Resolves a golden item: `facts` use the site spelling (they are searched in the pack);
 * `any`, `any2` and `none` gain every spelling; `all` keeps the site spelling.
 */
export function resolveGoldenItem<T extends GoldenLike>(item: T, facts: DynamicFacts): T {
  const variants = (list?: string[]) => list?.flatMap((s) => resolveFactVariants(s, facts));
  const e = item.expect;
  return {
    ...item,
    facts: item.facts.map((s) => resolveFacts(s, facts)),
    expect: {
      ...e,
      ...(e.all && { all: e.all.map((s) => resolveFacts(s, facts)) }),
      ...(e.any && { any: variants(e.any) }),
      ...(e.any2 && { any2: variants(e.any2) }),
      ...(e.none && { none: variants(e.none) }),
    },
  };
}

/** Current live-fact values (100 or more) written as literals in `text`: they belong in a placeholder. */
export function hardCodedFacts(text: string, facts: DynamicFacts): string[] {
  const literals: string[] = [];
  const add = (n: number | undefined) => {
    if (n === undefined || n < 100) return;
    literals.push(n.toLocaleString("en-US"), String(n));
  };
  add(facts.github?.contributionsLastYear);
  add(facts.github?.publicRepos);
  add(facts.huggingface?.downloads);
  // Whole numbers only: "171" must not match inside "3171234567890123".
  return [...new Set(literals)].filter((l) => new RegExp(`(?<![\\d,.])${l.replace(/[.,]/g, "\\$&")}(?![\\d]|[.,]\\d)`).test(text));
}
