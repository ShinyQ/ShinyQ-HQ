"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { CV_FILE_NAME, CV_PAGES, cvDownloadName, cvPdfPath } from "@/lib/cv";

export const CV_ZOOM_LEVELS = [1, 1.25, 1.5, 2, 2.5] as const;
/** Page width at 100% zoom (fit width, capped so lines stay readable on wide screens). */
const BASE_WIDTH = 860;

export interface CvViewerProps {
  /** `modal` adds the title row and close button; `page` is the /cv route body. */
  variant: "modal" | "page";
  titleId?: string;
  onClose?: () => void;
}

const ICON_BUTTON =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line-2 px-2 text-sm font-semibold text-ink transition hover:border-ink-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * The owner's CV as pre-rendered page images (`public/cv/pages`, from `bun run cv:pages`): zoom
 * (buttons or + / - / 0), scrolling, the current page, a PDF download and an open-in-new-tab link.
 * No PDF renderer ships to the browser. Alt text never repeats the CV's content (it names clients
 * the site text hides), only "CV page N of M".
 */
export function CvViewer({ variant, titleId, onClose }: CvViewerProps) {
  const t = useTranslations("cv");
  const [zoomIndex, setZoomIndex] = useState(0);
  const [page, setPage] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  const total = CV_PAGES.length;
  const zoom = CV_ZOOM_LEVELS[zoomIndex];
  const pdf = cvPdfPath(CV_FILE_NAME);

  useEffect(() => {
    const root = scroller.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const ratios = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) ratios.set(Number((entry.target as HTMLElement).dataset.page), entry.intersectionRatio);
        let best = 1;
        let bestRatio = -1;
        for (const [n, ratio] of ratios) {
          if (ratio > bestRatio) [best, bestRatio] = [n, ratio];
        }
        setPage(best);
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    root.querySelectorAll("[data-page]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const setZoom = (next: number) => setZoomIndex(Math.max(0, Math.min(CV_ZOOM_LEVELS.length - 1, next)));

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select")) return;
    if (event.key === "+" || event.key === "=") setZoom(zoomIndex + 1);
    else if (event.key === "-" || event.key === "_") setZoom(zoomIndex - 1);
    else if (event.key === "0") setZoom(0);
    else return;
    event.preventDefault();
  };

  const width = `calc(min(100%, ${BASE_WIDTH}px) * ${zoom})`;
  const sizes = `calc(min(100vw, ${BASE_WIDTH}px) * ${zoom})`;

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown} data-testid={`cv-viewer-${variant}`}>
      {variant === "modal" && (
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
      )}

      <div role="toolbar" aria-label={t("toolbar")} className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 sm:px-5">
        <button type="button" className={ICON_BUTTON} onClick={() => setZoom(zoomIndex - 1)} disabled={zoomIndex === 0} aria-label={t("zoomOut")}>
          <span aria-hidden="true">−</span>
        </button>
        <span className="pv-data min-w-[4ch] text-center" aria-live="polite" data-testid="cv-zoom">
          <span className="sr-only">{t("zoom")}: </span>
          {Math.round(zoom * 100)}%
        </span>
        <button type="button" className={ICON_BUTTON} onClick={() => setZoom(zoomIndex + 1)} disabled={zoomIndex === CV_ZOOM_LEVELS.length - 1} aria-label={t("zoomIn")}>
          <span aria-hidden="true">+</span>
        </button>
        <button type="button" className={`${ICON_BUTTON} px-3`} onClick={() => setZoom(0)} disabled={zoomIndex === 0}>
          {t("fit")}
        </button>
        <span className="pv-data ml-1 max-sm:hidden" data-testid="cv-page">
          {t("pageOf", { page, total })}
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          <a href={pdf} download={cvDownloadName(CV_FILE_NAME)} type="application/pdf" className={`${ICON_BUTTON} px-3`} data-testid="cv-download">
            {t("download")}
          </a>
          <a href={pdf} target="_blank" rel="noopener noreferrer" className={`${ICON_BUTTON} px-3`} data-testid="cv-open-tab">
            {t("openTab")}
            <span aria-hidden="true">&nbsp;&#8599;</span>
            <span className="sr-only"> ({t("external")})</span>
          </a>
        </span>
      </div>

      <div
        ref={scroller}
        role="region"
        aria-label={t("region")}
        tabIndex={0}
        className={`min-h-0 flex-1 overflow-auto overscroll-contain bg-[#14141c] px-2 py-4 outline-none focus-visible:ring-1 focus-visible:ring-cyan/60 sm:px-6 sm:py-6 ${variant === "page" ? "max-h-[85vh] rounded-b-xl" : ""}`}
        data-testid="cv-pages"
      >
        <ol className="mx-auto flex flex-col gap-4 sm:gap-6" style={{ width }}>
          {CV_PAGES.map((p) => (
            <li key={p.n} data-page={p.n}>
              {/* Static export: page images are pre-rendered webp files under public/cv/pages. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.src}
                srcSet={`${p.srcSmall} ${p.widthSmall}w, ${p.src} ${p.width}w`}
                sizes={sizes}
                width={p.width}
                height={p.height}
                alt={t("pageAlt", { page: p.n, total })}
                loading={p.n === 1 ? "eager" : "lazy"}
                fetchPriority={p.n === 1 && variant === "page" ? "high" : undefined}
                decoding="async"
                draggable={false}
                className="block h-auto w-full rounded-sm bg-[#fff] shadow-[0_8px_32px_-8px_rgb(0_0_0/0.8)]"
              />
            </li>
          ))}
        </ol>
      </div>

      <p className="pv-small border-t border-line px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-5">
        <a href={pdf} target="_blank" rel="noopener noreferrer" className="link">
          {t("fallback")}
        </a>
        <span className="ml-2 text-ink-3 max-sm:hidden">{t("hint")}</span>
      </p>
    </div>
  );
}
