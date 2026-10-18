"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import styles from "./GuideReader.module.css";
import { clampPage, ZOOM_STEPS } from "./reader-model";
import { BUTTON, useKeepFocus } from "./ui";

export interface Chapter {
  title: string;
  dest: string | unknown[] | null;
  depth: number;
}

export interface GuideToolbarProps {
  title: string;
  titleId: string;
  /** Null until the PDF opens (navigation stays disabled). */
  count: number | null;
  current: number;
  zoom: number;
  chapters: readonly Chapter[];
  downloadUrl: string;
  file: string;
  onClose: () => void;
  onGo: (page: number) => void;
  onZoom: (dir: 1 | -1) => void;
  onFit: () => void;
  onChapter: (chapter: Chapter) => void;
}

/**
 * The reader toolbar above the pages: Close, title, Chapters and Download on the first row; the page input,
 * Prev and Next, and the zoom buttons on the second (so it fits a 360 px phone). Every target is at least 44 px.
 */
export function GuideToolbar({ title, titleId, count, current, zoom, chapters, downloadUrl, file, onClose, onGo, onZoom, onFit, onChapter }: GuideToolbarProps) {
  const t = useTranslations("guides");
  const close = useKeepFocus();
  const inputId = useId();
  const listId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ready = count !== null;
  const total = count ?? 1;

  const jump = () => {
    const page = clampPage(Number.parseInt(draft ?? "", 10), total);
    setDraft(String(page));
    onGo(page);
  };

  return (
    <div className="relative border-b border-line px-2 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 sm:px-4">
      <div className="flex items-center gap-2">
        <button ref={close} type="button" onClick={onClose} data-autofocus aria-label={t("close")} className={BUTTON} data-testid="guide-close">
          <span aria-hidden="true" className="text-xl leading-none">
            ×
          </span>
        </button>
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-base font-semibold text-ink sm:text-lg">
          {title}
        </h2>
        {chapters.length > 0 && (
          <button
            type="button"
            className={`${BUTTON} gap-2`}
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((v) => !v)}
            data-testid="guide-chapters"
          >
            <span aria-hidden="true">&#9776;</span>
            <span className="sr-only sm:not-sr-only">{t("chapters")}</span>
          </button>
        )}
        <a href={downloadUrl} download={file} className={`${BUTTON} gap-2`} data-testid="guide-download">
          <span aria-hidden="true">&#8595;</span>
          <span className="sr-only sm:not-sr-only">{t("download")}</span>
        </a>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <label htmlFor={inputId} className="sr-only">
          {t("pageInput")}
        </label>
        <input
          id={inputId}
          className={`${styles.pageInput} pv-data`}
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="go"
          autoComplete="off"
          disabled={!ready}
          value={draft ?? String(current)}
          onFocus={(e) => {
            setDraft(String(current));
            e.currentTarget.select();
          }}
          onChange={(e) => setDraft(e.currentTarget.value.replace(/\D/g, "").slice(0, 4))}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            jump();
          }}
          onBlur={() => setDraft(null)}
          data-testid="guide-page-input"
        />
        <span className="pv-data shrink-0 text-ink-2" data-testid="guide-page-count">
          / {count ?? "-"}
        </span>
        <button type="button" className={BUTTON} onClick={() => onGo(current - 1)} disabled={!ready || current <= 1} aria-label={t("prev")} data-testid="guide-prev">
          <span aria-hidden="true">&#8249;</span>
        </button>
        <button type="button" className={BUTTON} onClick={() => onGo(current + 1)} disabled={!ready || current >= total} aria-label={t("next")} data-testid="guide-next">
          <span aria-hidden="true">&#8250;</span>
        </button>
        <span className="ml-auto flex gap-1.5">
          <button type="button" className={BUTTON} onClick={() => onZoom(-1)} disabled={!ready || zoom <= ZOOM_STEPS[0]} aria-label={t("zoomOut")} data-testid="guide-zoom-out">
            <span aria-hidden="true">&#8722;</span>
          </button>
          <button
            type="button"
            className={BUTTON}
            onClick={() => onZoom(1)}
            disabled={!ready || zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
            aria-label={t("zoomIn")}
            data-testid="guide-zoom-in"
          >
            <span aria-hidden="true">+</span>
          </button>
          <button type="button" className={BUTTON} onClick={onFit} disabled={!ready} aria-pressed={zoom === 1} aria-label={t("fitWidth")} data-testid="guide-fit">
            <span aria-hidden="true">&#8596;</span>
          </button>
        </span>
      </div>

      {open && (
        <div id={listId} className={`${styles.chapters} glass glass-solid`} data-testid="guide-chapter-list">
          <p className="label px-3 pt-3 pb-1 text-ink-3">{t("chapters")}</p>
          <ul className="pb-2">
            {chapters.map((chapter, i) => (
              <li key={i}>
                <button
                  type="button"
                  className={styles.chapter}
                  data-depth={chapter.depth}
                  onClick={() => {
                    setOpen(false);
                    onChapter(chapter);
                  }}
                >
                  {chapter.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
