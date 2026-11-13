import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { JsonLd } from "@/components/JsonLd";
import { PageIntro } from "@/components/page/Layout";
import {
  AiSection,
  BackgroundSection,
  IncidentsSection,
  KeylessSection,
  PrinciplesSection,
  ProductsSection,
  SecurityProof,
  SiteSection,
  SupplyChainSection,
} from "@/components/security/SecuritySections";
import { getSecurity, securityToc } from "@/content/security";
import { assertLocale } from "@/i18n/locale";
import { pageJsonLd } from "@/lib/jsonld";
import { seoMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/security">): Promise<Metadata> {
  return seoMetadata(assertLocale((await params).locale), "/security");
}

/** Security in practice (content/security.json): impact first, a Classic page with no 3D room (like /build and /quick). */
export default async function SecurityPage({ params }: PageProps<"/[locale]/security">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "security" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const page = getSecurity();
  const deltaLabels = { from: tc("delta.from"), to: tc("delta.to") };
  const toc = securityToc(page, locale);

  return (
    <>
      <JsonLd data={pageJsonLd(locale, "/security")} />
      <PageIntro title={page.title[locale]} lead={page.lead[locale]} />
      <div className="pv-wrap">
        <SecurityProof locale={locale} deltaLabels={deltaLabels} />
      </div>
      <nav aria-labelledby="toc-title" className="pv-wrap mt-12">
        <div className="pv-filters overflow-x-auto px-3 py-2">
          <h2 id="toc-title" className="sr-only">
            {t("toc")}
          </h2>
          <ul className="flex gap-1.5 whitespace-nowrap">
            {toc.map(({ id, label }) => (
              <li key={id}>
                <a href={`#${id}`} className="chip min-h-11">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      <PrinciplesSection locale={locale} />
      <KeylessSection locale={locale} deltaLabels={deltaLabels} />
      <AiSection locale={locale} deltaLabels={deltaLabels} />
      <ProductsSection locale={locale} />
      <IncidentsSection locale={locale} deltaLabels={deltaLabels} />
      <SupplyChainSection locale={locale} />
      <SiteSection locale={locale} />
      <BackgroundSection locale={locale} />
    </>
  );
}
