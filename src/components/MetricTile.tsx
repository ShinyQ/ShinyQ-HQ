import { getTranslations } from "next-intl/server";
import type { Confidence, Locale, LocalizedText } from "@/content/schema";

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

export async function MetricTile({
  value,
  label,
  context,
  confidence,
  locale,
}: {
  value: string;
  label: LocalizedText;
  context?: LocalizedText;
  confidence?: Confidence;
  locale: Locale;
}) {
  return (
    <div className="glass flex h-full flex-col gap-2 p-4">
      <p className="text-[28px] leading-8 font-extrabold tracking-tight text-ink">{value}</p>
      <p className="text-sm leading-5 text-ink">{label[locale]}</p>
      {context && <p className="text-[13px] leading-5 text-ink-2">{context[locale]}</p>}
      {confidence && (
        <div className="mt-auto pt-1">
          <ConfidenceBadge confidence={confidence} locale={locale} />
        </div>
      )}
    </div>
  );
}
