import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";
import { DeltaValue, type DeltaLabels } from "@/components/DeltaValue";
import { ExternalLink } from "@/components/ExternalLink";
import { AwardList } from "@/components/ProfileBlocks";
import { SectionSplit } from "@/components/page/Layout";
import { getAwards, getPod } from "@/content/load";
import type { LocalizedText, Locale } from "@/content/schema";
import { type SecurityMetric, getSecurity, securityValue } from "@/content/security";
import { Link } from "@/i18n/navigation";
import { formatYearMonth } from "@/lib/format";
import { REPO_URL } from "@/lib/site";

/**
 * The security page sections (/[locale]/security; owner decision 2026-11-13), server markup only. Text comes from
 * `content/security.json` (`getSecurity()`); the rows reuse the Classic ledger classes (`pv-rows`, `pv-num`).
 */
type Props = { locale: Locale };
type MetricProps = Props & { deltaLabels: DeltaLabels };

/** Value beside label rows: a before and after drawn by `DeltaValue`, the plain value otherwise; `extra` adds lines under a label. */
function MetricRows({ items, locale, deltaLabels, extra = {} }: { items: readonly SecurityMetric[]; locale: Locale; deltaLabels: DeltaLabels; extra?: Record<string, ReactNode> }) {
  return (
    <ul className="pv-rows pv-rows-closed">
      {items.map((item) => (
        <li key={item.id} data-security-metric={item.id} className="grid gap-x-6 gap-y-1.5 py-4 sm:grid-cols-[minmax(140px,200px)_1fr] sm:items-baseline sm:py-5">
          <p className="pv-num text-[28px] leading-none sm:text-[34px]">
            <DeltaValue value={securityValue(item.value, locale)} delta={item.delta} labels={deltaLabels} />
          </p>
          <div className="min-w-0">
            <p className="text-ink-2">{item.label[locale]}</p>
            {extra[item.id]}
          </div>
        </li>
      ))}
    </ul>
  );
}

function NumberedRows({ items, locale }: { items: readonly { title: LocalizedText; text: LocalizedText }[]; locale: Locale }) {
  return (
    <ol className="pv-rows pv-rows-closed">
      {items.map((item, i) => (
        <li key={item.title.en} className="flex gap-3 py-4">
          <span className="pv-num min-w-[3ch] shrink-0 text-[22px]">{i + 1}</span>
          <div>
            <h3 className="font-semibold text-ink">{item.title[locale]}</h3>
            <p className="pv-body mt-1">{item.text[locale]}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The hero's three proof results, a list named "Key results". */
export async function SecurityProof({ locale, deltaLabels }: MetricProps) {
  const t = await getTranslations({ locale, namespace: "security" });
  const { proof } = getSecurity();
  return (
    <ul aria-label={t("keyResults")} data-testid="security-proof" className="mt-10 grid gap-6 md:grid-cols-3 md:gap-8">
      {proof.map((item) => (
        <li key={item.id} data-security-metric={item.id} className="border-t border-line pt-4">
          <p className="pv-num text-[34px] leading-none sm:text-[44px]">
            <DeltaValue value={securityValue(item.value, locale)} delta={item.delta} labels={deltaLabels} compact />
          </p>
          <p className="pv-small mt-3 text-ink-2">{item.label[locale]}</p>
        </li>
      ))}
    </ul>
  );
}

export function PrinciplesSection({ locale }: Props) {
  const { principles } = getSecurity();
  return (
    <SectionSplit id="principles" title={principles.title[locale]} intro={principles.intro[locale]}>
      <NumberedRows items={principles.items} locale={locale} />
    </SectionSplit>
  );
}

export function KeylessSection({ locale, deltaLabels }: MetricProps) {
  const { keyless } = getSecurity();
  return (
    <SectionSplit id="keyless" title={keyless.title[locale]} intro={keyless.intro[locale]}>
      <MetricRows items={keyless.facts} locale={locale} deltaLabels={deltaLabels} />
      <h3 className="pv-h3 mt-14 mb-4">{keyless.diagramTitle[locale]}</h3>
      <ArchitectureDiagram architecture={keyless.architecture} locale={locale} />
      <ul className="pv-rows pv-rows-closed mt-10">
        {keyless.points.map((point) => (
          <li key={point.en} className="pv-body py-4">
            {point[locale]}
          </li>
        ))}
      </ul>
    </SectionSplit>
  );
}

export function AiSection({ locale, deltaLabels }: MetricProps) {
  const { ai } = getSecurity();
  const extra: Record<string, ReactNode> = {};
  for (const result of ai.results) {
    const pod = getPod(result.pod);
    extra[result.id] = (
      <>
        {result.context && <p className="pv-small mt-2">{result.context[locale]}</p>}
        {pod && (
          <p className="mt-2">
            <Link href={`/labs/${pod.slug}`} className="pv-go">
              {pod.title[locale]}
            </Link>
          </p>
        )}
      </>
    );
  }
  return (
    <SectionSplit id="ai" title={ai.title[locale]} intro={ai.intro[locale]}>
      <MetricRows items={ai.results} locale={locale} deltaLabels={deltaLabels} extra={extra} />
    </SectionSplit>
  );
}

export async function ProductsSection({ locale }: Props) {
  const t = await getTranslations({ locale, namespace: "security" });
  const { products } = getSecurity();
  return (
    <SectionSplit id="products" title={products.title[locale]} intro={products.intro[locale]}>
      <ul className="pv-rows pv-rows-closed">
        {products.items.map((item) => {
          const pod = getPod(item.pod);
          if (!pod) return null;
          return (
            <li key={item.pod} className="py-5">
              <h3 className="pv-h3">{pod.title[locale]}</h3>
              <p className="pv-body mt-2">{item.text[locale]}</p>
              {item.note && <p className="pv-meta mt-2">{item.note[locale]}</p>}
              <p className="mt-2">
                <Link href={`/labs/${pod.slug}`} className="pv-go" aria-label={`${t("readCase")}: ${pod.title[locale]}`}>
                  {t("readCase")}
                </Link>
              </p>
            </li>
          );
        })}
      </ul>
    </SectionSplit>
  );
}

export function IncidentsSection({ locale, deltaLabels }: MetricProps) {
  const { incidents } = getSecurity();
  return (
    <SectionSplit id="incidents" title={incidents.title[locale]} intro={incidents.intro[locale]}>
      <ul className="pv-rows pv-rows-closed">
        {incidents.items.map((item) => (
          <li key={item.id} data-security-incident={item.id} className="grid gap-x-6 gap-y-1.5 py-5 sm:grid-cols-[minmax(140px,200px)_1fr] sm:items-baseline">
            <p className="pv-num text-[28px] leading-none sm:text-[34px]">
              <DeltaValue value={securityValue(item.value, locale)} delta={item.delta} labels={deltaLabels} />
            </p>
            <div className="min-w-0">
              <h3 className="font-semibold text-ink">{item.title[locale]}</h3>
              <p className="pv-body mt-1">{item.text[locale]}</p>
              <p className="pv-date mt-2 text-sm">{formatYearMonth(item.month, locale)}</p>
            </div>
          </li>
        ))}
      </ul>
    </SectionSplit>
  );
}

export function SupplyChainSection({ locale }: Props) {
  const { supplyChain } = getSecurity();
  return (
    <SectionSplit id="supply-chain" title={supplyChain.title[locale]} intro={supplyChain.intro[locale]}>
      <NumberedRows items={supplyChain.items} locale={locale} />
    </SectionSplit>
  );
}

export async function SiteSection({ locale }: Props) {
  const t = await getTranslations({ locale, namespace: "security" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const tn = await getTranslations({ locale, namespace: "nav" });
  const { site } = getSecurity();
  return (
    <SectionSplit id="site" title={site.title[locale]} intro={site.intro[locale]}>
      <NumberedRows items={site.items} locale={locale} />
      <p className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Link href="/build" className="pv-go">
          {tn("build")}
        </Link>
        <ExternalLink href={REPO_URL} className="pv-uline inline-flex min-h-11 items-center text-sm font-semibold text-ink hover:text-cyan" srHint={tc("external")}>
          {t("source")}
        </ExternalLink>
      </p>
    </SectionSplit>
  );
}

export function BackgroundSection({ locale }: Props) {
  const { background } = getSecurity();
  const awards = getAwards().filter((a) => background.awards.includes(a.id));
  return (
    <SectionSplit id="background" title={background.title[locale]} intro={background.intro[locale]}>
      <AwardList awards={awards} locale={locale} />
    </SectionSplit>
  );
}
