"use client";

import { useTranslations } from "next-intl";
import { CV_FILE_NAME, CV_PAGES, cvDownloadName, cvPdfPath } from "@/lib/cv";
import { PageViewer, ZOOM_LEVELS } from "../docs/PageViewer";

export const CV_ZOOM_LEVELS = ZOOM_LEVELS;

export interface CvViewerProps {
  /** `modal` adds the title row and close button; `page` is the /cv route body. */
  variant: "modal" | "page";
  titleId?: string;
  onClose?: () => void;
}

const ICON_BUTTON =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line-2 px-2 text-sm font-semibold text-ink transition hover:border-ink-2 hover:bg-surface-2";

/**
 * The owner's CV as pre-rendered page images (`public/cv/pages`, from `bun run cv:pages`) in the
 * shared `PageViewer`. Alt text never repeats the CV's content (it names clients the site text
 * hides), only "CV page N of M".
 */
export function CvViewer({ variant, titleId, onClose }: CvViewerProps) {
  const t = useTranslations("cv");
  const total = CV_PAGES.length;
  return (
    <PageViewer
      variant={variant}
      testPrefix="cv"
      pages={CV_PAGES}
      pdf={cvPdfPath(CV_FILE_NAME)}
      downloadName={cvDownloadName(CV_FILE_NAME)}
      labels={{
        toolbar: t("toolbar"),
        zoom: t("zoom"),
        zoomIn: t("zoomIn"),
        zoomOut: t("zoomOut"),
        fit: t("fit"),
        pageOf: (page, count) => t("pageOf", { page, total: count }),
        pageAlt: (page, count) => t("pageAlt", { page, total: count }),
        region: t("region"),
        download: t("download"),
        openTab: t("openTab"),
        external: t("external"),
        fallback: t("fallback"),
        hint: t("hint"),
      }}
      header={
        variant === "modal" && (
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-5">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold text-ink">
                {t("title")}
              </h2>
              <p className="label mt-0.5 text-ink-3">{t("pages", { count: total })}</p>
            </div>
            <button type="button" onClick={onClose} className={ICON_BUTTON} aria-label={t("close")} data-autofocus data-testid="cv-close">
              <span aria-hidden="true" className="text-xl leading-none">
                ×
              </span>
            </button>
          </div>
        )
      }
    />
  );
}
