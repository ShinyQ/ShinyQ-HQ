import type { GuideView } from "@/content/guides";

/** The study guides data file per locale: out/data/guides/{locale}.json (views plus the `guides` and `reader` strings). */
export const GUIDES_FILE = (locale: string) => `${locale}.json`;
export const guidesDataUrl = (locale: string) => `/data/guides/${GUIDES_FILE(locale)}`;

/**
 * `messages` is `{ guides, reader }`: the dialog's nested intl provider replaces the layout's messages (it does not
 * merge them), so it carries the shared `reader` strings too; the `guides` strings never ride in a page's HTML.
 */
export interface GuidesData {
  guides: GuideView[];
  messages: Record<string, unknown>;
}
