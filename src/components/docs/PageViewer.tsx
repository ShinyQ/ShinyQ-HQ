"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

export const ZOOM_LEVELS = [1, 1.25, 1.5, 2, 2.5] as const;
/** Page width at 100% zoom (fit width, capped so lines stay readable on wide screens). */
const BASE_WIDTH = 860;

export interface PageImage {
  /** 1-based page number. */
  n: number;
  src: string;
  width: number;
  height: number;
  /** Optional smaller rendition for narrow screens. */
  srcSmall?: string;
  widthSmall?: number;
}

export interface PageViewerLabels {
  toolbar: string;
  zoom: string;
  zoomIn: string;
  zoomOut: string;
  fit: string;
  pageOf: (page: number, total: number) => string;
  pageAlt: (page: number, total: number) => string;
  region: string;
  download: string;
  openTab: string;
  external: string;
  fallback: string;
  hint: string;
}

export interface PageViewerProps {
  pages: readonly PageImage[];
  /** Self-hosted PDF for "Download PDF", "Open in new tab" and the fallback link. */
  pdf: string;
  downloadName: string;
  labels: PageViewerLabels;
  /** Prefix of every test id (`cv` keeps the CV viewer's ids: cv-zoom, cv-page, cv-download, ...). */
  testPrefix: string;
  /** Title row above the toolbar (modals). */
  header?: ReactNode;
  /** Extra block in the footer, e.g. a publisher notice. */
  note?: ReactNode;
  /** `page`: a bounded scroller inside a page; `modal`: fills the dialog. */
  variant: "modal" | "page";
}

const ICON_BUTTON =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line-2 px-2 text-sm font-semibold text-ink transition hover:border-ink-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * A PDF shown as pre-rendered page images (the CV and paper PDFs): zoom (buttons or + / - / 0),
 * scrolling, the current page, a PDF download and an open-in-new-tab link. No PDF renderer ships to
 * the browser; pages after the first load lazily.
 */
export function PageViewer({ pages, pdf, downloadName, labels, testPrefix, header, note, variant }: PageViewerProps) {
  const [zoomIndex, setZoomIndex] = useState(0);
  const [page, setPage] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  const total = pages.length;
  const zoom = ZOOM_LEVELS[zoomIndex];

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

  const setZoom = (next: number) => setZoomIndex(Math.max(0, Math.min(ZOOM_LEVELS.length - 1, next)));

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
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown} data-testid={`${testPrefix}-viewer-${variant}`}>
      {header}

      <div role="toolbar" aria-label={labels.toolbar} className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 sm:px-5">
        <button type="button" className={ICON_BUTTON} onClick={() => setZoom(zoomIndex - 1)} disabled={zoomIndex === 0} aria-label={labels.zoomOut}>
          <span aria-hidden="true">−</span>
        </button>
        <span className="pv-data min-w-[4ch] text-center" aria-live="polite" data-testid={`${testPrefix}-zoom`}>
          <span className="sr-only">{labels.zoom}: </span>
          {Math.round(zoom * 100)}%
        </span>
        <button type="button" className={ICON_BUTTON} onClick={() => setZoom(zoomIndex + 1)} disabled={zoomIndex === ZOOM_LEVELS.length - 1} aria-label={labels.zoomIn}>
          <span aria-hidden="true">+</span>
        </button>
        <button type="button" className={`${ICON_BUTTON} px-3`} onClick={() => setZoom(0)} disabled={zoomIndex === 0}>
          {labels.fit}
        </button>
        <span className="pv-data ml-1 max-sm:hidden" data-testid={`${testPrefix}-page`}>
          {labels.pageOf(page, total)}
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          <a href={pdf} download={downloadName} type="application/pdf" className={`${ICON_BUTTON} px-3`} data-testid={`${testPrefix}-download`}>
            {labels.download}
          </a>
          <a href={pdf} target="_blank" rel="noopener noreferrer" className={`${ICON_BUTTON} px-3`} data-testid={`${testPrefix}-open-tab`}>
            {labels.openTab}
            <span aria-hidden="true">&nbsp;&#8599;</span>
            <span className="sr-only"> ({labels.external})</span>
          </a>
        </span>
      </div>

      <div
        ref={scroller}
        role="region"
        aria-label={labels.region}
        tabIndex={0}
        className={`min-h-0 flex-1 overflow-auto overscroll-contain bg-[#14141c] px-2 py-4 outline-none focus-visible:ring-1 focus-visible:ring-cyan/60 sm:px-6 sm:py-6 ${variant === "page" ? "max-h-[85vh] rounded-b-xl" : ""}`}
        data-testid={`${testPrefix}-pages`}
      >
        <ol className="mx-auto flex flex-col gap-4 sm:gap-6" style={{ width }}>
          {pages.map((p) => (
            <li key={p.n} data-page={p.n}>
              {/* Static export: page images are pre-rendered webp files under public/. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.src}
                srcSet={p.srcSmall && p.widthSmall ? `${p.srcSmall} ${p.widthSmall}w, ${p.src} ${p.width}w` : undefined}
                sizes={p.srcSmall ? sizes : undefined}
                width={p.width}
                height={p.height}
                alt={labels.pageAlt(p.n, total)}
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

      <div className="pv-small space-y-1.5 border-t border-line px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-5">
        {note}
        <p>
          <a href={pdf} target="_blank" rel="noopener noreferrer" className="link">
            {labels.fallback}
          </a>
          <span className="ml-2 text-ink-3 max-sm:hidden">{labels.hint}</span>
        </p>
      </div>
    </div>
  );
}
