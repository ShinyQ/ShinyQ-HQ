import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { experienceDataFor } from "@/experience/gate-data";
import { RoofConceptsLoader } from "@/experience/prototype/roof/RoofConceptsLoader";
import { assertLocale } from "@/i18n/locale";

/**
 * Dev-only route (`.dev.tsx` pages build only under `next dev` or with HQ_DEV_PAGES=1, see
 * next.config.ts): the RF concepts for the owner's pick at /{locale}/dev/roof.
 * Query: ?concept=current|observatory|helipad|garden&at=spawn|availability|about|cv|contact&view=rover|top&tier=full|lite&active=contact|cv&rm=1&ui=0.
 */
export const metadata: Metadata = { title: "RF concepts", robots: { index: false, follow: false } };

export default async function RoofConceptsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  return <RoofConceptsLoader data={await experienceDataFor(locale)} />;
}
