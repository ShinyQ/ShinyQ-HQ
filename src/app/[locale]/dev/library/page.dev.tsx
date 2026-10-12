import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { experienceDataFor } from "@/experience/gate-data";
import { LibraryPrototypeLoader } from "@/experience/prototype/library/LibraryPrototypeLoader";
import { assertLocale } from "@/i18n/locale";

/**
 * Dev-only route (`.dev.tsx` pages build only under `next dev` or with HQ_DEV_PAGES=1, see
 * next.config.ts): the three L4 Writing concepts for the owner's pick at /{locale}/dev/library.
 * Query: ?concept=atrium|newsroom|constellation&view=rover|top&tier=full|lite&motion=reduce&posts=N&at=x,z.
 */
export const metadata: Metadata = { title: "Writing floor concepts", robots: { index: false, follow: false } };

export default async function LibraryConceptsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  return <LibraryPrototypeLoader data={await experienceDataFor(locale)} />;
}
