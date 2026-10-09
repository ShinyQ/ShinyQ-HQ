import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const EM_DASH = "\u2014";

const ROOT = process.cwd();
export const DEFAULT_BLOCKLIST_FILE = path.join(ROOT, "content", "safety-blocklist.default.txt");
export const LOCAL_BLOCKLIST_FILE = path.join(ROOT, "content", ".safety-blocklist.local.txt");

/** Parses a blocklist: one term per line or comma separated, `#` starts a comment. */
export function parseBlocklist(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, ""))
    .flatMap((line) => line.split(","))
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

/**
 * Merges the committed default list, the gitignored local list and the
 * SAFETY_BLOCKLIST env var (used as a CI secret) so private terms are never
 * published in the repo.
 */
export function loadBlocklist(env: Record<string, string | undefined> = process.env): string[] {
  const terms = new Set<string>();
  for (const file of [DEFAULT_BLOCKLIST_FILE, LOCAL_BLOCKLIST_FILE]) {
    if (existsSync(file)) parseBlocklist(readFileSync(file, "utf8")).forEach((t) => terms.add(t));
  }
  if (env.SAFETY_BLOCKLIST) parseBlocklist(env.SAFETY_BLOCKLIST).forEach((t) => terms.add(t));
  return [...terms];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Case-insensitive whole-word match. Terms wrapped in slashes (`/regex/`) are
 * treated as case-sensitive regular expressions.
 */
export function findBlockedTerms(text: string, terms: readonly string[]): string[] {
  return terms.filter((term) => {
    if (term.length > 2 && term.startsWith("/") && term.endsWith("/")) {
      return new RegExp(term.slice(1, -1)).test(text);
    }
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}($|[^\\p{L}\\p{N}])`, "iu").test(text);
  });
}

export interface StringLeaf {
  path: string;
  value: string;
}

/** Walks any JSON value and returns every string with its dotted path. */
export function collectStrings(value: unknown, at = "$"): StringLeaf[] {
  if (typeof value === "string") return [{ path: at, value }];
  if (Array.isArray(value)) return value.flatMap((item, i) => collectStrings(item, `${at}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => collectStrings(child, `${at}.${key}`));
  }
  return [];
}

/** Patterns that must never appear in public copy regardless of the blocklist. */
export const FORBIDDEN_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "em dash", pattern: /\u2014/ },
  { name: "money amount", pattern: /(?:\bRp\.?\s?\d|\bIDR\s?\d|\bUSD\s?\d|\$\s?\d|\d\s?(?:juta|miliar|million|billion)\s?(?:rupiah|IDR|USD))/i },
  { name: "phone number", pattern: /(?:\+62|\b08\d{2})[\s-]?\d{3,4}[\s-]?\d{3,5}/ },
  { name: "Azure resource hostname", pattern: /\.(?:azurewebsites\.net|azurecontainerapps\.io|cognitiveservices\.azure\.com|openai\.azure\.com|vault\.azure\.net|documents\.azure\.com|search\.windows\.net|blob\.core\.windows\.net|servicebus\.windows\.net)/i },
  { name: "Master's degree", pattern: /\b(?:master'?s|magister|MSc|M\.Sc|MMT)\b/i },
];

export function findForbiddenPatterns(text: string): string[] {
  return FORBIDDEN_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name);
}
