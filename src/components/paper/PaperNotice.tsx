"use client";

import { useTranslations } from "next-intl";
import type { PaperDocumentRef, PaperPreview } from "@/content/citation";

/** Publisher notice and the published version link for a self-hosted paper PDF (IEEE posting rule). */
export function PaperNotice({ paper, document, compact = false }: { paper: PaperPreview; document: PaperDocumentRef; compact?: boolean }) {
  const t = useTranslations("paper");
  if (document.notice !== "ieee") return null;
  // In the reader footer, phones get a short scrollable block so the pages keep the screen.
  return (
    <div
      className={`space-y-1 text-[12.5px] leading-5 text-ink-3 ${compact ? "max-sm:max-h-[3.75rem] max-sm:overflow-y-auto max-sm:text-[12px] max-sm:leading-[18px]" : ""}`}
      tabIndex={compact ? 0 : undefined}
      role={compact ? "note" : undefined}
      aria-label={compact ? t("noticeLabel") : undefined}
      data-testid="paper-notice"
    >
      <p lang="en">{t("ieeeNotice", { year: String(paper.year) })}</p>
      {paper.doi && (
        <p>
          {t("published")}:{" "}
          <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noopener noreferrer" className="link">
            doi.org/{paper.doi}
            <span className="sr-only"> ({t("external")})</span>
          </a>
        </p>
      )}
    </div>
  );
}
