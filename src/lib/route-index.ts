import { getContent, getPod, getPost, getTimelineEntry } from "@/content/load";
import { LOCALES, type Locale } from "@/content/schema";
import type { RouteEntry } from "@/lib/did-you-mean";
import { allPagePaths } from "@/lib/routes";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

export const ROUTES_INDEX_FILE = "index.json";

const NAV = { en: en.nav, id: id.nav } as const;
const STATIC_TITLE: Record<string, (locale: Locale) => string> = {
  "/": () => getContent().profile.name,
  "/quick": (l) => NAV[l].quick,
  "/journey": (l) => NAV[l].journey,
  "/labs": (l) => NAV[l].work,
  "/library": (l) => NAV[l].writing,
  "/contact": (l) => NAV[l].contact,
  "/cv": (l) => NAV[l].cv,
  "/build": (l) => NAV[l].build,
};

function titleOf(path: string, locale: Locale): string {
  const fixed = STATIC_TITLE[path];
  if (fixed) return fixed(locale);
  const [, section, slug] = path.split("/");
  if (section === "labs") return getPod(slug)?.title[locale] ?? path;
  if (section === "blog") return getPost(slug)?.title[locale] ?? path;
  if (section === "journey") {
    const entry = getTimelineEntry(slug);
    return entry ? `${entry.role[locale]} · ${entry.org}` : path;
  }
  return path;
}

/** Every page of the export in both locales with its title: the 404's "Did you mean" data (`/data/routes/index.json`). */
export function buildRouteIndex(): RouteEntry[] {
  return LOCALES.flatMap((locale) => allPagePaths().map((path) => ({ p: `/${locale}${path === "/" ? "" : path}`, t: titleOf(path, locale) })));
}
