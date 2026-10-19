import { formatYearMonth } from "@/lib/format";
import { guideDownloadUrl, guideUrl, sizeLabel, weightLabel, type GuideView } from "./guides";
import { getStudyGuides, tr } from "./load";
import type { Locale } from "./schema";

export type { GuideView } from "./guides";

/** Every study guide, locale-resolved, in file order. Server only (reads the zod-parsed file). */
export function guideViews(locale: Locale): GuideView[] {
  return getStudyGuides().guides.map((g) => ({
    slug: g.slug,
    certId: g.certId,
    code: g.code,
    spine: g.spine,
    issuer: g.issuer,
    title: tr(g.title, locale),
    summary: tr(g.summary, locale),
    edition: g.edition,
    editionLabel: formatYearMonth(g.edition, locale),
    file: g.file,
    pages: g.pages,
    bytes: g.bytes,
    sizeLabel: sizeLabel(g.bytes),
    version: g.version,
    cover: g.cover,
    url: guideUrl(g.slug, g.version),
    downloadUrl: guideDownloadUrl(g.slug, g.version),
    domains: g.domains.map((d) => ({ label: tr(d.label, locale), weight: d.weight, weightLabel: weightLabel(d.weight) })),
  }));
}

/** The study guide slug for a certification, or null when it has none. */
export function guideForCert(certId: string): string | null {
  return getStudyGuides().guides.find((g) => g.certId === certId)?.slug ?? null;
}
