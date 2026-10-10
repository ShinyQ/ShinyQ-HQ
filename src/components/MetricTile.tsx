import { getTranslations } from "next-intl/server";
import type { Confidence, Locale } from "@/content/schema";

export async function ConfidenceBadge({ confidence, locale }: { confidence: Confidence; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "common.confidence" });
  const tone = {
    verified: "text-green border-green/50",
    "strongly-inferred": "text-cyan border-cyan/50",
    "self-reported": "text-amber border-amber/50",
  }[confidence];
  return (
    <span className={`inline-flex rounded-[5px] border px-1.5 py-0.5 font-mono text-[10.5px] leading-[14px] tracking-[0.06em] uppercase ${tone}`}>{t(confidence)}</span>
  );
}
