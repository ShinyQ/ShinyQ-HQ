import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { isPublicLiveUrl, PUBLIC_LIVE_NAMES } from "./live-links";
import { escapeRegExp, findBlockedTerms } from "./safety-match";

export { findBlockedTerms };

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
 * published in the repo, minus the allowed product names and the public live
 * site names (`PUBLIC_LIVE_NAMES`, R4-J).
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
  return [...terms].filter((t) => !isAllowedTerm(t, allow) && !isAllowedTerm(t, PUBLIC_LIVE_NAMES));
}

/** The committed default list (client names, personal data, Azure resource names): public, so safe to print. */
export function loadDefaultBlocklist(): string[] {
  return existsSync(DEFAULT_BLOCKLIST_FILE) ? parseBlocklist(readFileSync(DEFAULT_BLOCKLIST_FILE, "utf8")) : [];
}

/**
 * Display form of matched blocklist terms for test output, logs, reports and artifacts (S2).
 * Terms from the committed default list stay readable; every other term (the local list or the
 * SAFETY_BLOCKLIST secret) becomes `private term #n`, its 1-based position among the private
 * terms of `terms` (default file order, then `.safety-blocklist.local.txt`, then the secret), so
 * a caught leak never publishes the term it caught. GitHub masks only whole secret values.
 */
export function formatBlockedTerms(found: readonly string[], terms: readonly string[], publicTerms: readonly string[] = loadDefaultBlocklist()): string[] {
  const visible = new Set(publicTerms);
  const hidden = terms.filter((t) => !visible.has(t));
  return found.map((t) => (visible.has(t) ? t : `private term #${hidden.indexOf(t) + 1 || "?"}`));
}

/** `findBlockedTerms` in display form (`formatBlockedTerms`): use it wherever matches can be printed. */
export function findBlockedLabels(text: string, terms: readonly string[]): string[] {
  return formatBlockedTerms(findBlockedTerms(text, terms), terms);
}

/** Replaces every blocklisted term in `text` with "[redacted]", keeping line breaks (logs, reports, public issues). */
export function redactBlockedText(text: string, terms: readonly string[]): string {
  let out = text;
  for (const term of findBlockedTerms(out, terms)) {
    const regex =
      term.length > 2 && term.startsWith("/") && term.endsWith("/")
        ? new RegExp(term.slice(1, -1), "g")
        : new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}(?=$|[^\\p{L}\\p{N}])`, "giu");
    out = out.replace(regex, (_match, lead) => `${typeof lead === "string" ? lead : ""}[redacted]`);
  }
  return out;
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

/**
 * Forbidden patterns for one dataset string. A pod's `liveUrl` on an allowlisted public host
 * (`PUBLIC_LIVE_HOSTS`, R4-J) is exempt from the Azure hostname rule; the same host in any other
 * field, or any other host in `liveUrl`, still fails.
 */
export function leafForbiddenPatterns(leaf: StringLeaf): string[] {
  if (/\[\d+\]\.liveUrl$/.test(leaf.path) && isPublicLiveUrl(leaf.value)) return [];
  return findForbiddenPatterns(leaf.value);
}

/**
 * Text files of the static export: pages, RSC payloads, data, feeds, and (S9) JavaScript chunks,
 * CSS, SVG and Markdown, because client chunks do carry content strings (TS constants, Ask pills).
 */
export const BUILD_TEXT_FILE = /\.(?:html|txt|json|xml|webmanifest|js|mjs|css|svg|md)$/;

export interface BuildHit {
  file: string;
  /** Matched terms in display form (`formatBlockedTerms` unless `label` says otherwise). */
  terms: string[];
}

/**
 * Scans every text file of a static export (`out/`, `BUILD_TEXT_FILE`) for blocklisted terms, so
 * a client company name cannot reach a page, payload, script, sitemap or room data file. Skips
 * binaries. Blocklist terms only: forbidden patterns would flag RSC references such as `"$1c"`.
 * Hits are redacted with `formatBlockedTerms`; pass `label` only for terms that are public.
 */
export function scanBuildOutput(
  dir: string,
  terms: readonly string[],
  label: (found: string[]) => string[] = (found) => formatBlockedTerms(found, terms),
): BuildHit[] {
  const walk = (at: string): string[] =>
    readdirSync(at, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? walk(path.join(at, d.name)) : [path.join(at, d.name)],
    );
  return walk(dir)
    .filter((file) => BUILD_TEXT_FILE.test(file))
    .flatMap((file) => {
      const found = findBlockedTerms(readFileSync(file, "utf8"), terms);
      return found.length ? [{ file: path.relative(dir, file), terms: label(found) }] : [];
    });
}
