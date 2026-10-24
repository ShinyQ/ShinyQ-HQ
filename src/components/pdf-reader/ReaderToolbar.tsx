"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import styles from "./PdfReader.module.css";
import { BackButton, COMPACT_BUTTON, HEADER_ROW, useKeepFocus, type ReaderBack } from "./ui";

export type { ReaderBack } from "./ui";

export interface Chapter {
  title: string;
  dest: string | unknown[] | null;
  depth: number;
}

export interface ReaderToolbarProps {
  title: string;
  titleId: string;
  /** The surface's Close label ("Close CV", "Close paper preview", "Close the reader"). */
  closeLabel: string;
  chapters: readonly Chapter[];
  downloadUrl: string;
  file: string;
  onClose: () => void;
  onChapter: (chapter: Chapter) => void;
  back?: ReaderBack;
  /** Test id prefix of the surface (`guide`, `cv`, `paper`). */
  testPrefix?: string;
}

/**
 * The reader's single compact header row: Close, an optional Back, the title, Chapters (a popover list from the PDF
 * outline) and Download. Page and zoom controls float over the pages (`ReaderControls`). Targets are 44 px on touch screens and
 * 36 px with a fine pointer.
 */
export function ReaderToolbar({ title, titleId, closeLabel, chapters, downloadUrl, file, onClose, onChapter, back, testPrefix = "guide" }: ReaderToolbarProps) {
  const t = useTranslations("reader");
  const close = useKeepFocus();
  const listId = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <div className={HEADER_ROW}>
        <button ref={close} type="button" onClick={onClose} data-autofocus aria-label={closeLabel} className={COMPACT_BUTTON} data-testid={`${testPrefix}-close`}>
          <span aria-hidden="true" className="text-xl leading-none">
            ×
          </span>
        </button>
        {back && <BackButton back={back} testPrefix={testPrefix} />}
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
            data-testid={`${testPrefix}-chapters`}
          >
            <span aria-hidden="true">&#9776;</span>
            <span className="sr-only sm:not-sr-only">{t("chapters")}</span>
          </button>
        )}
        <a href={downloadUrl} download={file} className={`${COMPACT_BUTTON} gap-2`} data-testid={`${testPrefix}-download`}>
          <span aria-hidden="true">&#8595;</span>
          <span className="sr-only sm:not-sr-only">{t("download")}</span>
        </a>
      </div>

      {open && (
        <div id={listId} className={`${styles.chapters} glass glass-solid`} data-testid={`${testPrefix}-chapter-list`}>
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
