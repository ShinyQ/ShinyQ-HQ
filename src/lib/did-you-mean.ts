/** One page of the static export for the 404 suggestion: locale-prefixed path and its title in that locale. */
export interface RouteEntry {
  p: string;
  t: string;
}

const LOCALE = /^\/(en|id)(?=\/|$)/;

/** Levenshtein distance (two rows). */
export function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Lowercase path without query, hash or trailing slash. */
function clean(path: string): string {
  const bare = path.split(/[?#]/)[0].toLowerCase().replace(/\/+$/, "");
  return bare === "" ? "/" : bare;
}

/**
 * The page a mistyped URL most likely meant (404 "Did you mean", owner decision 2026-10-25): the requested locale (English
 * when missing), the same section, and the closest last segment within a third of its length. Null for an existing page
 * or when nothing is close.
 */
export function suggestRoute(requested: string, routes: readonly RouteEntry[]): RouteEntry | null {
  const exact = requested.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (routes.some((r) => r.p === exact)) return null;
  const path = clean(requested);
  const locale = LOCALE.exec(path)?.[1] ?? "en";
  const rest = path.replace(LOCALE, "") || "/";
  const target = `/${locale}${rest === "/" ? "" : rest}`;
  const corrected = routes.find((r) => r.p === target);
  if (corrected) return corrected;
  const parts = rest.split("/").filter(Boolean);
  const section = parts.length > 1 ? `/${locale}/${parts.slice(0, -1).join("/")}/` : `/${locale}/`;
  const last = parts.at(-1) ?? "";
  let best: RouteEntry | null = null;
  let bestScore = Infinity;
  for (const route of routes) {
    if (!route.p.startsWith(section) || route.p.slice(section.length).includes("/")) continue;
    const score = editDistance(last, route.p.slice(section.length));
    if (score < bestScore) {
      best = route;
      bestScore = score;
    }
  }
  return best && bestScore <= Math.max(2, Math.floor(last.length / 3)) ? best : null;
}
