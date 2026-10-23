"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import styles from "./GuideReader.module.css";
import { clampPage, ZOOM_STEPS } from "./reader-model";
import { PILL_BUTTON } from "./ui";

export interface GuideControlsProps {
  /** Null until the PDF opens (navigation stays disabled). */
  count: number | null;
  current: number;
  zoom: number;
  onGo: (page: number) => void;
  onZoom: (dir: 1 | -1) => void;
  onFit: () => void;
}

/**
 * Props for a control that reaches a limit (first or last page, smallest or largest zoom). It stays focusable with
 * `aria-disabled` instead of `disabled`: a focused button that turns `disabled` drops focus to the body, out of the
 * dialog's Tab trap and away from the reader's shortcuts.
 */
function limit(off: boolean, run: () => void) {
  return {
    "aria-disabled": off,
    onClick: () => {
      if (!off) run();
    },
  };
}

/**
 * The floating pill at the bottom of the pages column: the page input with the page count, Prev and Next, then
 * Zoom out, Zoom in and Fit width. One row down to a 360 px phone; 44 px targets on touch screens, 36 px with a
 * fine pointer.
 */
export function GuideControls({ count, current, zoom, onGo, onZoom, onFit }: GuideControlsProps) {
  const t = useTranslations("guides");
  const inputId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const ready = count !== null;
  const total = count ?? 1;

  const jump = () => {
    const page = clampPage(Number.parseInt(draft ?? "", 10), total);
    setDraft(String(page));
    onGo(page);
  };

  return (
    <div className={`${styles.controls} glass glass-solid`} data-testid="guide-controls">
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
      <span className="pv-data shrink-0 pe-1 text-ink-2" data-testid="guide-page-count">
        / {count ?? "-"}
      </span>
      <button type="button" className={PILL_BUTTON} {...limit(!ready || current <= 1, () => onGo(current - 1))} aria-label={t("prev")} data-testid="guide-prev">
        <span aria-hidden="true">&#8249;</span>
      </button>
      <button type="button" className={PILL_BUTTON} {...limit(!ready || current >= total, () => onGo(current + 1))} aria-label={t("next")} data-testid="guide-next">
        <span aria-hidden="true">&#8250;</span>
      </button>
      <span aria-hidden="true" className={styles.controlsDivider} />
      <button type="button" className={PILL_BUTTON} {...limit(!ready || zoom <= ZOOM_STEPS[0], () => onZoom(-1))} aria-label={t("zoomOut")} data-testid="guide-zoom-out">
        <span aria-hidden="true">&#8722;</span>
      </button>
      <button
        type="button"
        className={PILL_BUTTON}
        {...limit(!ready || zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1], () => onZoom(1))}
        aria-label={t("zoomIn")}
        data-testid="guide-zoom-in"
      >
        <span aria-hidden="true">+</span>
      </button>
      <button type="button" className={PILL_BUTTON} onClick={onFit} disabled={!ready} aria-pressed={zoom === 1} aria-label={t("fitWidth")} data-testid="guide-fit">
        <span aria-hidden="true">&#8596;</span>
      </button>
    </div>
  );
}
