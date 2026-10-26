import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CvCover } from "@/components/cv/CvCover";
import { assertLocale } from "@/i18n/locale";
import { seoMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { pageJsonLd } from "@/lib/jsonld";
import { CV_PAGES } from "@/lib/cv";

export async function generateMetadata({ params }: PageProps<"/[locale]/cv">): Promise<Metadata> {
  return seoMetadata(assertLocale((await params).locale), "/cv");
}

/**
 * The owner's CV (one English PDF for every locale): page 1 as an image, "View CV" (the shared PDF reader modal,
 * the same one as every other CV entry point and the study guides) and a PDF download. Server markup only.
 */
export default async function CvPage({ params }: PageProps<"/[locale]/cv">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "cv" });
  const tr = await getTranslations({ locale, namespace: "reader" });

  return (
    <>
      <JsonLd data={pageJsonLd(locale, "/cv")} />
      <div className="pv-wrap pt-8 pb-8 sm:pt-12">
        <h1 className="pv-d-l text-[length:var(--text-display-s)]">{t("title")}</h1>
        <p className="pv-lead mt-4">{t("intro")}</p>
        <CvCover
          labels={{
            view: t("view"),
            download: tr("download"),
            pages: t("pages", { count: CV_PAGES.length }),
            coverAlt: t("pageAlt", { page: 1, total: CV_PAGES.length }),
          }}
        />
      </div>
    </>
  );
}
