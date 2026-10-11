import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { experienceDataFor } from "@/experience/gate-data";
import { CertsProto } from "@/experience/prototype/certs/CertsProto";
import { assertLocale } from "@/i18n/locale";

/**
 * Dev-only route (see next.config.ts): certification layout prototype at /{locale}/dev/certs.
 * Query: ?v=a|b|c&n=7|30&view=page|3d&tier=lite|full&clean=1.
 */
export const metadata: Metadata = { title: "Certifications prototype", robots: { index: false, follow: false } };

export default async function CertsPrototypePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  return <CertsProto data={await experienceDataFor(locale)} />;
}
