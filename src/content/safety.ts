import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { isPublicLiveUrl } from "./live-links";

export const EM_DASH = "\u2014";

export const ALLOWLIST_FILE = path.join(process.cwd(), "content", "safety-allowlist.txt");

/** Parses a term list: one term per line or comma separated, `#` starts a comment. */
export function parseTermList(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, ""))
    .flatMap((line) => line.split(","))
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

/** Product names the owner allowed (C3, revised 2026-10-10), from `content/safety-allowlist.txt`: the Ask entity allowlist. */
export function loadAllowlist(): string[] {
  return existsSync(ALLOWLIST_FILE) ? parseTermList(readFileSync(ALLOWLIST_FILE, "utf8")) : [];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The terms found in `text`: plain terms match case-insensitively on word boundaries; terms wrapped in
 * slashes (`/regex/`) are case-sensitive regular expressions.
 */
export function findTerms(text: string, terms: readonly string[]): string[] {
  return terms.filter((term) => {
    if (term.length > 2 && term.startsWith("/") && term.endsWith("/")) return new RegExp(term.slice(1, -1)).test(text);
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

/** Patterns that must never appear in public copy. */
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

/**
 * Machine-made tokens of a static export, which differ per build and carry no content: CSP and SRI hashes
 * (`sha256-<base64>`), base64 data URIs, the Next.js build id (the exact `_next/static/<id>/` directory name,
 * also in the RSC payload) and the base36 content hashes of chunk and media file names
 * (`chunks/3srfjz42u14tx.js`, `media/inter-s.p.2vgebnnw3bn23.woff2`). A random token can spell a short
 * term after a `+`, `/`, `-` or `.` (a CSP hash did once in CI, PR #228).
 */
const BUILD_TOKENS: RegExp[] = [
  /\bsha(?:256|384|512)-[A-Za-z0-9+/]{20,}={0,2}/g,
  /\bdata:[\w.+-]+\/[\w.+-]+(?:;[\w=.+-]+)*;base64,[A-Za-z0-9+/]+={0,2}/g,
  // Chunk names are a bare hash; media names keep their readable stem before the hash. A hash has a digit.
  /((?:^|\/)chunks\/)(?=[0-9a-z_-]*\d)[0-9a-z_-]{8,20}(?=\.(?:js|mjs|css|map)\b)/g,
  /((?:^|\/)media\/[^/"'\s\\()]+?\.)(?=[0-9a-z_-]*\d)[0-9a-z_-]{8,20}(?=\.[a-z0-9]{1,8}\b)/g,
];

/**
 * `text` with every machine-made build token (`BUILD_TOKENS`, plus each exact `buildIds` value) replaced by
 * `_`, so only readable text can match a term: page copy, payload strings and the readable part of an
 * asset name stay scanned; a term inside a hash is not a leak, it is chance.
 */
export function maskBuildTokens(text: string, buildIds: readonly string[] = []): string {
  let out = text;
  for (const id of buildIds) if (id.length >= 8) out = out.split(id).join("_");
  for (const re of BUILD_TOKENS) out = out.replace(re, (_m, keep?: unknown) => `${typeof keep === "string" ? keep : ""}_`);
  return out;
}

/** Next.js build ids of an export: the `_next/static/` directories other than `chunks`, `media` and `css`. */
export function exportBuildIds(dir: string): string[] {
  const statics = path.join(dir, "_next", "static");
  if (!existsSync(statics)) return [];
  return readdirSync(statics, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !["chunks", "media", "css"].includes(d.name))
    .map((d) => d.name);
}

export interface BuildHit {
  file: string;
  /** Matched terms, as `label` shows them. */
  terms: string[];
}

/**
 * Scans every text file of a static export (`out/`, `BUILD_TEXT_FILE`) for `terms` (`findTerms`), so a
 * string that must stay out of the site (the perspectives fingerprints, for example) cannot reach a page,
 * payload, script, sitemap or room data file. Skips binaries. Machine-made tokens (hashes, the build id,
 * data URIs) are masked first (`maskBuildTokens`). `label` turns the matched terms into their display form.
 */
export function scanBuildOutput(dir: string, terms: readonly string[], label: (found: string[]) => string[] = (found) => found): BuildHit[] {
  const walk = (at: string): string[] =>
    readdirSync(at, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? walk(path.join(at, d.name)) : [path.join(at, d.name)],
    );
  const buildIds = exportBuildIds(dir);
  return walk(dir)
    .filter((file) => BUILD_TEXT_FILE.test(file))
    .flatMap((file) => {
      const found = findTerms(maskBuildTokens(readFileSync(file, "utf8"), buildIds), terms);
      return found.length ? [{ file: path.relative(dir, file), terms: label(found) }] : [];
    });
}
