"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import styles from "./GuideReader.module.css";
import { COMPACT_BUTTON, HEADER_ROW, useKeepFocus } from "./ui";

export interface Chapter {
  title: string;
  dest: string | unknown[] | null;
  depth: number;
}

export interface GuideToolbarProps {
  title: string;
  titleId: string;
  chapters: readonly Chapter[];
  downloadUrl: string;
  file: string;
  onClose: () => void;
  onChapter: (chapter: Chapter) => void;
}

/**
 * The reader's single compact header row: Close, title, Chapters (a popover list from the PDF outline) and
 * Download. Page and zoom controls float over the pages (`GuideControls`). Targets are 44 px on touch screens and
 * 36 px with a fine pointer.
 */
export function GuideToolbar({ title, titleId, chapters, downloadUrl, file, onClose, onChapter }: GuideToolbarProps) {
  const t = useTranslations("guides");
  const close = useKeepFocus();
  const listId = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <div className={HEADER_ROW}>
        <button ref={close} type="button" onClick={onClose} data-autofocus aria-label={t("close")} className={COMPACT_BUTTON} data-testid="guide-close">
          <span aria-hidden="true" className="text-xl leading-none">
            ×
          </span>
        </button>
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-base font-semibold text-ink">
          {title}
        </h2>
        {chapters.length > 0 && (
          <button
            type="button"
            className={`${COMPACT_BUTTON} gap-2`}
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((v) => !v)}
            data-testid="guide-chapters"
          >
            <span aria-hidden="true">&#9776;</span>
            <span className="sr-only sm:not-sr-only">{t("chapters")}</span>
          </button>
        )}
        <a href={downloadUrl} download={file} className={`${COMPACT_BUTTON} gap-2`} data-testid="guide-download">
          <span aria-hidden="true">&#8595;</span>
          <span className="sr-only sm:not-sr-only">{t("download")}</span>
        </a>
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
