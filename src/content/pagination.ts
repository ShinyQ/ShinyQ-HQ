/**
 * Page math for the Classic site's paginated lists (owner decision 2026-11-13): "More projects" on /labs (`?page=`, 10
 * a page) and the Blog on /library (`?posts=`, 6 a page). Pure, so the client wrapper (`Paginated`) and tests share it.
 */

/** Pages for `count` items, at least 1 (an empty list still has page 1). */
export function pageCount(count: number, size: number): number {
  return Math.max(1, Math.ceil(count / size));
}

/** The page in `search`'s `param`: a positive integer, else 1. Not clamped (see `clampPage`). */
export function parsePage(search: string, param: string): number {
  const raw = new URLSearchParams(search).get(param);
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const n = Number(raw);
  return n >= 1 ? n : 1;
}

/** `page` within 1 to the last page of `count` items. */
export function clampPage(page: number, count: number, size: number): number {
  return Math.min(Math.max(1, page), pageCount(count, size));
}

/** The 1-based items a page shows, `to` capped at `count` ("Showing 11 to 20 of 35"); `from` is 0 for an empty list. */
export function pageRange(page: number, count: number, size: number): { from: number; to: number } {
  if (count === 0) return { from: 0, to: 0 };
  const p = clampPage(page, count, size);
  return { from: (p - 1) * size + 1, to: Math.min(p * size, count) };
}

/** Page numbers to show: all up to 7 pages, else the first, the last and the current one plus or minus 1, with gaps (`null`). */
export function pageWindow(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}

/**
 * Server attributes of a paginated item: every item is `data-page-item`; the ones past the first page are also
 * `data-paged-out`, hidden before first paint when scripting is on (`pageview.css`), so the default page never shifts.
 */
export function pageItemAttrs(index: number, size: number): Record<string, string> {
  return index >= size ? { "data-page-item": "", "data-paged-out": "" } : { "data-page-item": "" };
}
