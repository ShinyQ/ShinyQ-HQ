/**
 * Shareable Classic and 3D links (Round 8 L). `?view=classic` opens the Classic site and stays in the URL
 * (`?view=page` is its old alias); `?view=3d` or no choice opens the 3D HQ. Precedence: an explicit `?view=`,
 * then this tab (sessionStorage `hq:view`), then the remembered preference (localStorage `hq:view`), then 3D.
 * `decideView` and `normalizeViewSearch` are self-contained (no imports, no closures) so the head script
 * inlines them via toString().
 */
export type ViewChoice = "page" | "3d";
export const VIEW_KEY = "hq:view";

export function decideView(search: string, session: string | null, local: string | null): { view: ViewChoice; explicit: ViewChoice | null } {
  const m = /[?&]view=([^&#]*)/.exec(search);
  const v = m ? m[1] : "";
  const explicit: ViewChoice | null = v === "classic" || v === "page" ? "page" : v === "3d" || v === "architecture" ? "3d" : null;
  const pick = (s: string | null): ViewChoice | null => (s === "page" || s === "3d" ? s : null);
  return { view: explicit || pick(session) || pick(local) || "3d", explicit };
}

export function normalizeViewSearch(search: string, view: string): string {
  const parts = search
    .replace(/^\?/, "")
    .split("&")
    .filter((p) => p !== "" && p !== "view=classic" && p !== "view=page" && p !== "view=3d" && !(view === "page" && p.indexOf("view=") === 0));
  if (view === "page") parts.push("view=classic");
  return parts.length ? "?" + parts.join("&") : "";
}

const PAGE_PATH = /^\/(en|id)(\/[^.]*)?$/;
const GATED = /^\/(en|id)(\/(journey|labs)(\/[^/]+)?|\/(library|contact))?\/?$/;

/** The root-relative href with the view applied, or null when the link is not an internal page or is already right. */
export function viewHref(href: string, view: ViewChoice, base: string): string | null {
  if (!href || href.startsWith("#")) return null;
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.origin !== new URL(base).origin || !PAGE_PATH.test(url.pathname)) return null;
  const search = normalizeViewSearch(url.search, view);
  return search === url.search ? null : url.pathname + search + url.hash;
}

/** Where a path opens in 3D: gated routes stay, posts open the Writing floor, everything else the Lobby. */
export function threeDPath(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  if (GATED.test(path)) return path;
  const m = /^\/(en|id)(\/blog\/)?/.exec(path);
  if (!m) return "/en";
  return m[2] ? `/${m[1]}/library` : `/${m[1]}`;
}

/** Canonical share URLs for the current location (spec section 6): other query parameters are dropped. */
export function shareUrls(origin: string, loc: { pathname: string; search: string; hash: string }): { classic: string; threeD: string } {
  const path = loc.pathname.length > 1 ? loc.pathname.replace(/\/$/, "") : loc.pathname;
  const td = threeDPath(path);
  const same = td === path;
  const arch = same && /[?&]view=architecture(&|$)/.test(loc.search) ? "?view=architecture" : "";
  return { classic: `${origin}${path}?view=classic${loc.hash}`, threeD: `${origin}${td}${arch}${same ? loc.hash : ""}` };
}
