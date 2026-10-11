import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { experienceDataFor } from "@/experience/gate-data";
import { PrototypeLoader } from "@/experience/prototype/PrototypeLoader";
import { assertLocale } from "@/i18n/locale";

/**
 * Dev-only route (`.dev.tsx` pages build only under `next dev` or with HQ_DEV_PAGES=1, see
 * next.config.ts): the playable walkable-floors prototype at /{locale}/dev/floors.
 * Query: ?floor=L2|L3&road=straight|meander&view=rover|top&sheet=1&at=x,z&tier=full|lite.
 */
export const metadata: Metadata = { title: "Walkable floors prototype", robots: { index: false, follow: false } };

export default async function FloorsPrototypePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  return <PrototypeLoader data={await experienceDataFor(locale)} />;
}
