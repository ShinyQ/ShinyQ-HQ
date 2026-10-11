import { createTranslator } from "next-intl";
import { citationsFor, scholarSearchUrl, type PaperPreview } from "./citation";
import { getLibrary, getProfile } from "./load";
import type { Locale, Publication } from "./schema";
import { publicationDate } from "./selectors";
import { formatYearMonth } from "@/lib/format";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

/** Server-side: the serializable paper preview modal data for one paper or thesis. */
export function buildPaperPreview(pub: Publication, locale: Locale): PaperPreview {
  const messages = locale === "id" ? id : en;
  const t = createTranslator({ locale, messages, namespace: "library" });
  const self = getProfile().name;
  const metrics = getLibrary().researchMetrics;
  return {
    id: pub.id,
    title: pub.title,
    kind: messages.library.kind[pub.kind],
    authors: pub.authors ?? [self],
    self,
    venue: pub.venue,
    publisher: pub.publisher,
    year: pub.year,
    date: publicationDate(pub, locale),
    abstract: pub.abstract,
    summary: pub.summary?.[locale],
    doi: pub.doi,
    url: pub.url,
    pdf: pub.pdf,
    code: pub.code,
    scholar: scholarSearchUrl(pub.title),
    citationCount:
      pub.citations !== undefined && metrics
        ? t("citations", { count: pub.citations, source: metrics.source, date: formatYearMonth(metrics.asOf, locale) })
        : undefined,
    citations: citationsFor(pub, self),
  };
}
