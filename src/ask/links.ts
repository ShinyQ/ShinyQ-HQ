import { isPublicLiveUrl } from "../content/live-links";
import { ASK_REPO_CITE, type AskLocale } from "./protocol";

/**
 * Where a link in an Ask answer may point (owner request 2026-10-16): this site's own pages, the
 * public repository and the public live sites. Shared by the server checks (functions/_lib/checks.ts)
 * and the dock's markdown renderer; anything else renders as its label text.
 */
export const ASK_SITE_ORIGINS: readonly string[] = ["https://kurniadi.pages.dev"];

/** Locale-less top pages an answer may always link to (the server also allows the retrieved chunks' paths). */
export const ASK_LINK_PAGES: readonly string[] = ["/", "/labs", "/journey", "/library", "/contact", "/quick", "/cv"];

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const SITE_PATH = new RegExp(`^/(?:(?:labs|journey|blog)/${SLUG}|labs|journey|library|contact|quick|cv|build)?(?:#${SLUG}(?:=${SLUG})?)?$`);
const UNSAFE = /[\s\\<>"'`\u0000-\u001F\u007F]/;

export type AskLinkTarget = { kind: "site"; path: string } | { kind: "external"; href: string };

function sitePath(path: string): AskLinkTarget | null {
  let bare = path.replace(/^\/(?:en|id)(?=\/|#|$)/, "");
  if (!bare.startsWith("/")) bare = `/${bare}`;
  // A trailing slash after a path segment ("/labs/", "/labs/#x"); the root's own slash stays ("/#x").
  bare = bare.replace(/(?<=[^/])\/(?=#|$)/, "");
  return SITE_PATH.test(bare) ? { kind: "site", path: bare } : null;
}

/** Classifies a link target: a site page (locale-less path), an allowlisted external URL, or null (render the label). */
export function askLinkTarget(raw: string, origins: readonly string[] = ASK_SITE_ORIGINS): AskLinkTarget | null {
  const url = raw.trim();
  if (!url || url.length > 200 || UNSAFE.test(url) || url.startsWith("//")) return null;
  if (url.startsWith("/")) return sitePath(url);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  if (origins.includes(parsed.origin)) return parsed.search ? null : sitePath(`${parsed.pathname}${parsed.hash}`);
  if (url === ASK_REPO_CITE || url === `${ASK_REPO_CITE}/`) return { kind: "external", href: ASK_REPO_CITE };
  if (isPublicLiveUrl(url)) return { kind: "external", href: parsed.href };
  return null;
}

/** The href of a site path in the visitor's language. */
export function siteHref(path: string, locale: AskLocale): string {
  if (path === "/") return `/${locale}`;
  if (path.startsWith("/#")) return `/${locale}${path.slice(1)}`;
  return `/${locale}${path}`;
}
