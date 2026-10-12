import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CvViewer } from "@/components/cv/CvViewer";
import { assertLocale } from "@/i18n/locale";
import { seoMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { pageJsonLd } from "@/lib/jsonld";

export async function generateMetadata({ params }: PageProps<"/[locale]/cv">): Promise<Metadata> {
  return seoMetadata(assertLocale((await params).locale), "/cv");
}

/**
 * The owner's CV (one English PDF for every locale) in the same viewer as the CV modal: page
 * images with zoom, a PDF download and an open-in-new-tab link.
 */
export default async function CvPage({ params }: PageProps<"/[locale]/cv">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "cv" });

  return (
    <>
      <JsonLd data={pageJsonLd(locale, "/cv")} />
      <div className="pv-wrap pt-8 pb-8 sm:pt-12">
        <h1 className="pv-h2">{t("title")}</h1>
        <p className="pv-lead mt-2">{t("intro")}</p>
        <div className="card mt-8 flex flex-col overflow-hidden">
          <CvViewer variant="page" />
        </div>
      </div>
    </>
  );
}
