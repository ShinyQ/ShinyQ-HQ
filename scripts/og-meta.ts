/**
 * Pure helpers for the social-card check (scripts/og-check.ts and e2e/seo.spec.ts): read a page's
 * search and share tags from its HTML, validate them, and read a JPEG's dimensions. No `@/`
 * imports, so Playwright specs can import this file directly.
 */
export const DESCRIPTION_RANGE = [140, 160] as const;
export const OG_MAX_BYTES = 300 * 1024;

export interface SocialMeta {
  title?: string;
  description?: string;
  canonical?: string;
  hreflang: Record<string, string>;
  og: Record<string, string>;
  twitter: Record<string, string>;
}

const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)) out[m[1].toLowerCase()] = decode(m[2]);
  return out;
}

export function parseSocialMeta(html: string): SocialMeta {
  const end = html.indexOf("</head>");
  const head = end === -1 ? html : html.slice(0, end);
  const meta: SocialMeta = { hreflang: {}, og: {}, twitter: {} };
  const title = head.match(/<title>([^<]*)<\/title>/);
  if (title) meta.title = decode(title[1]);
  for (const m of head.matchAll(/<meta\s[^>]*>/g)) {
    const a = attributes(m[0]);
    const key = a.property ?? a.name;
    if (!key || a.content === undefined) continue;
    if (key === "description") meta.description = a.content;
    else if (key.startsWith("og:")) meta.og[key] ??= a.content;
    else if (key.startsWith("twitter:")) meta.twitter[key] ??= a.content;
  }
  for (const m of head.matchAll(/<link\s[^>]*>/g)) {
    const a = attributes(m[0]);
    if (a.rel === "canonical") meta.canonical = a.href;
    else if (a.rel === "alternate" && a.hreflang) meta.hreflang[a.hreflang] = a.href;
  }
  return meta;
}

export function validateSocialMeta(meta: SocialMeta): string[] {
  const problems: string[] = [];
  const need = (ok: unknown, problem: string) => {
    if (!ok) problems.push(problem);
  };
  need(meta.title, "missing <title>");
  const length = meta.description?.length ?? 0;
  need(length >= DESCRIPTION_RANGE[0] && length <= DESCRIPTION_RANGE[1], `description length ${length} outside ${DESCRIPTION_RANGE[0]} to ${DESCRIPTION_RANGE[1]}`);
  need(meta.canonical, "missing canonical");
  for (const lang of ["en", "id", "x-default"]) need(meta.hreflang[lang], `missing hreflang ${lang}`);
  for (const key of ["og:title", "og:description", "og:url", "og:image", "og:image:alt"]) need(meta.og[key], `missing ${key}`);
  need(meta.og["og:image:width"] === "1200" && meta.og["og:image:height"] === "630", "og:image is not declared 1200x630");
  need(meta.og["og:image:type"] === "image/jpeg", "og:image:type is not image/jpeg");
  need(meta.twitter["twitter:card"] === "summary_large_image", "twitter:card is not summary_large_image");
  need(meta.twitter["twitter:image"], "missing twitter:image");
  return problems;
}

/** Width and height from a JPEG's SOF marker (baseline or progressive), or null when the bytes are not a JPEG. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 8 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += marker === 0xff ? 1 : 2;
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  return null;
}

/** The exported HTML of a page: ("out", "en", "/") -> "out/en.html", "/labs/x" -> "out/en/labs/x.html". */
export function exportHtmlPath(outDir: string, locale: string, pagePath: string): string {
  return `${outDir}/${locale}${pagePath === "/" ? "" : pagePath}.html`;
}
