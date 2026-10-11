import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CvViewer } from "@/components/cv/CvViewer";
import { getProfile } from "@/content/load";
import { assertLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/cv">): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "cv" });
  return pageMetadata({ locale, path: "/cv", title: t("title"), description: getProfile().headline[locale] });
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
    <div className="pv-wrap pt-8 pb-8 sm:pt-12">
      <h1 className="pv-h2">{t("title")}</h1>
      <p className="pv-lead mt-2">{t("intro")}</p>
      <div className="card mt-8 flex flex-col overflow-hidden">
        <CvViewer variant="page" />
      </div>
    </div>
  );
}
