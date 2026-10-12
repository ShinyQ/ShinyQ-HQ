"use client";

import { useTranslations } from "next-intl";
import type { RefObject } from "react";
import type { PaperDocumentRef, PaperPreview } from "@/content/citation";
import { paperPages } from "@/lib/papers";
import { PageViewer } from "../docs/PageViewer";

const BUTTON =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line-2 px-3 text-sm font-semibold text-ink transition hover:border-ink-2 hover:bg-surface-2";

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

/**
 * The paper reader: a self-hosted paper PDF as page images (`public/papers/{file}/`, from
 * `bun run paper:pages`) in the shared `PageViewer`, inside the paper modal. Alt text is
 * "<title>, page N of M".
 */
export function PaperReader({
  paper,
  document,
  titleId,
  backRef,
  onBack,
  onClose,
}: {
  paper: PaperPreview;
  document: PaperDocumentRef;
  titleId: string;
  backRef: RefObject<HTMLButtonElement | null>;
  onBack: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("paper");
  const tc = useTranslations("cv");
  const pages = paperPages(document.file);
  return (
    <PageViewer
      variant="modal"
      testPrefix="paper"
      pages={pages}
      pdf={document.pdf}
      downloadName={`${document.file}.pdf`}
      labels={{
        toolbar: t("reader"),
        zoom: tc("zoom"),
        zoomIn: tc("zoomIn"),
        zoomOut: tc("zoomOut"),
        fit: tc("fit"),
        pageOf: (page, total) => tc("pageOf", { page, total }),
        pageAlt: (page, total) => t("pageAlt", { title: paper.title, page, total }),
        region: t("pagesRegion"),
        download: tc("download"),
        openTab: tc("openTab"),
        external: tc("external"),
        fallback: tc("fallback"),
        hint: tc("hint"),
      }}
      header={
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-5">
          <div className="min-w-0">
            <button ref={backRef} type="button" onClick={onBack} className="link inline-flex min-h-11 items-center gap-1 text-sm" data-testid="paper-back">
              <span aria-hidden="true">&#8592;</span>
              {t("back")}
            </button>
            <h2 id={titleId} className="text-base leading-6 font-semibold text-ink sm:text-lg">
              {paper.title}
            </h2>
            <p className="label mt-0.5 text-ink-3" data-testid="paper-reader-meta">
              {tc("pages", { count: pages.length })} · {t(`version.${document.version}`)}
            </p>
          </div>
          <button type="button" onClick={onClose} className={BUTTON} aria-label={t("close")} data-autofocus data-testid="paper-close">
            <span aria-hidden="true" className="text-xl leading-none">
              ×
            </span>
          </button>
        </div>
      }
      note={<PaperNotice paper={paper} document={document} compact />}
    />
  );
}
