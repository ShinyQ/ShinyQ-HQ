import { getTranslations } from "next-intl/server";
import { SectionSplit } from "@/components/page/Layout";
import type { Locale } from "@/content/locales";
import { visitsLabels } from "@/lib/visits/labels";
import { VisitsLazy, VisitsShell } from "./VisitsLazy";

/** "Visits" on the Classic Contact page (`#visits`, the static path of the L1:visits room). */
export async function VisitsSection({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "stats" });
  const { chipLabels, floorLabels } = visitsLabels(locale);
  return (
    <VisitsShell>
      <SectionSplit id="visits" title={t("title")} intro={t("intro")}>
        <VisitsLazy locale={locale} chipLabels={chipLabels} floorLabels={floorLabels} loading={t("loading")} />
      </SectionSplit>
    </VisitsShell>
  );
}
