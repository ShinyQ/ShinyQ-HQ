"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { CV_FILE_NAME, CV_PAGES, cvDownloadName, cvPdfPath } from "@/lib/cv";
import { Modal } from "../Modal";
import { LazyPdfReader } from "../pdf-reader/ReaderDialog";
import { CV_PAGE_KEY } from "../pdf-reader/reader-model";

/**
 * CV modal (lazy chunk, opened by `DialogHost` on the `hq:hud` "cv" command or a click on a `[data-hq-cv]` link): the
 * owner's CV PDF in the shared PDF reader, the same reader as the study guides. Page 1's image is the loading cover;
 * pages are named "CV page N of M" (never the CV's text).
 */
export default function CvDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("cv");
  const titleId = useId();
  const pdf = cvPdfPath(CV_FILE_NAME);
  return (
    <Modal labelledBy={titleId} onClose={onClose} width="lg" testId="cv-dialog">
      <LazyPdfReader
        doc={{ url: pdf, downloadUrl: pdf, file: cvDownloadName(CV_FILE_NAME), title: t("title"), cover: CV_PAGES[0]?.srcSmall, pageKey: CV_PAGE_KEY }}
        titleId={titleId}
        closeLabel={t("close")}
        onClose={onClose}
        pageLabel={(page, total) => t("pageAlt", { page, total })}
        testPrefix="cv"
      />
    </Modal>
  );
}
