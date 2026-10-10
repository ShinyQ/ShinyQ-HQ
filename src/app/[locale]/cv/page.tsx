import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getProfile, getRoof } from "@/content/load";
import { assertLocale } from "@/i18n/locale";
import { cvDownloadName, cvPdfPath } from "@/lib/cv";
import { pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/cv">): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "cv" });
  return pageMetadata({ locale, path: "/cv", title: t("title"), description: getProfile().headline[locale] });
}

/** The owner's CV PDF as-is (one English file for every locale): download button and inline preview. */
export default async function CvPage({ params }: PageProps<"/[locale]/cv">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "cv" });
  const { fileName } = getRoof().cv;
  const pdf = cvPdfPath(fileName);

  return (
    <div className="pv-wrap pt-8 pb-8 sm:pt-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="pv-h2">{t("title")}</h1>
          <p className="pv-lead mt-2">{t("intro")}</p>
        </div>
        <a href={pdf} download={cvDownloadName(fileName)} type="application/pdf" className="pv-btn pv-btn-primary" data-testid="cv-download">
          {t("download")}
        </a>
      </div>
      <iframe
        src={pdf}
        title={t("preview")}
        loading="lazy"
        className="mt-8 block h-[80vh] min-h-[480px] w-full rounded-xl border border-line bg-[#fff]"
        data-testid="cv-preview"
      />
      <p className="pv-small mt-3">
        <a href={pdf} target="_blank" rel="noopener" className="link">
          {t("fallback")}
        </a>
      </p>
    </div>
  );
}
