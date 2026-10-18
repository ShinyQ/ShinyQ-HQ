/**
 * Blocklist matching without Node APIs, shared by the content checks (src/content/safety.ts) and the hq-office Worker
 * (workers/office/src/ingest.ts), which bundles it.
 */
export function escapeRegExp(value: string): string {
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
