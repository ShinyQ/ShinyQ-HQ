import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export const EM_DASH = "\u2014";

const ROOT = process.cwd();
export const DEFAULT_BLOCKLIST_FILE = path.join(ROOT, "content", "safety-blocklist.default.txt");
export const LOCAL_BLOCKLIST_FILE = path.join(ROOT, "content", ".safety-blocklist.local.txt");
export const ALLOWLIST_FILE = path.join(ROOT, "content", "safety-allowlist.txt");

/** Parses a blocklist: one term per line or comma separated, `#` starts a comment. */
export function parseBlocklist(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, ""))
    .flatMap((line) => line.split(","))
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

/** Product names the owner allowed (C3, revised 2026-10-10), from `content/safety-allowlist.txt`. */
export function loadAllowlist(): string[] {
  return existsSync(ALLOWLIST_FILE) ? parseBlocklist(readFileSync(ALLOWLIST_FILE, "utf8")) : [];
}

/**
 * True when `term` targets an allowed name: a plain term equal to it
 * (case-insensitive), or a /regex/ term whose source names it and matches it.
 * Broad regexes (personal data, Azure resource names) are never dropped.
 */
export function isAllowedTerm(term: string, allow: readonly string[]): boolean {
  const isRegex = term.length > 2 && term.startsWith("/") && term.endsWith("/");
  return allow.some((name) => {
    if (!isRegex) return term.toLowerCase() === name.toLowerCase();
    const source = term.slice(1, -1);
    return source.toLowerCase().includes(name.toLowerCase()) && new RegExp(source).test(name);
  });
}

/**
 * Merges the committed default list, the gitignored local list and the
 * SAFETY_BLOCKLIST env var (used as a CI secret) so private terms are never
 * published in the repo, minus the allowed product names.
 */
export function loadBlocklist(
  env: Record<string, string | undefined> = process.env,
  allow: readonly string[] = loadAllowlist(),
): string[] {
  const terms = new Set<string>();
  for (const file of [DEFAULT_BLOCKLIST_FILE, LOCAL_BLOCKLIST_FILE]) {
    if (existsSync(file)) parseBlocklist(readFileSync(file, "utf8")).forEach((t) => terms.add(t));
  }
  if (env.SAFETY_BLOCKLIST) parseBlocklist(env.SAFETY_BLOCKLIST).forEach((t) => terms.add(t));
  return [...terms].filter((t) => !isAllowedTerm(t, allow));
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

/** Text files of the static export that carry site copy (pages, RSC payloads, data, feeds). */
const BUILD_TEXT_FILE = /\.(?:html|txt|json|xml|webmanifest)$/;

export interface BuildHit {
  file: string;
  terms: string[];
}

/**
 * Scans every text file of a static export (`out/`) for blocklisted terms, so a
 * client company name cannot reach a page, payload, sitemap or room data file.
 * Skips JavaScript chunks (no content is bundled there) and binaries.
 */
export function scanBuildOutput(dir: string, terms: readonly string[]): BuildHit[] {
  const walk = (at: string): string[] =>
    readdirSync(at, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? walk(path.join(at, d.name)) : [path.join(at, d.name)],
    );
  return walk(dir)
    .filter((file) => BUILD_TEXT_FILE.test(file))
    .flatMap((file) => {
      const found = findBlockedTerms(readFileSync(file, "utf8"), terms);
      return found.length ? [{ file: path.relative(dir, file), terms: found }] : [];
    });
}
