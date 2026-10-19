"use client";

import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { memo, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import styles from "./GuideReader.module.css";
import { releaseCanvas } from "./GuidePage";

const THUMB_SCALE = 0.18;

interface Thumb {
  task?: RenderTask;
  canvas?: HTMLCanvasElement;
  page?: PDFPageProxy;
  cancelled: boolean;
}

export interface GuideThumbsProps {
  doc: PDFDocumentProxy;
  count: number;
  /** Page 1 size in points. */
  base: { width: number; height: number };
  current: number;
  label: string;
  pageLabel: (page: number) => string;
  onGo: (page: number) => void;
}

/**
 * Desktop thumbnail rail (`lg:` and up; `display: none` below, so nothing draws on phones). Each thumbnail draws
 * at scale 0.18 when it scrolls near the rail's view and is released when it leaves; the current page carries
 * `aria-current="page"` and stays scrolled into view. One tab stop (roving tabindex): ArrowUp, ArrowDown, Home and
 * End move focus between thumbnails, Enter or Space goes to the focused one's page.
 */
export const GuideThumbs = memo(function GuideThumbs({ doc, count, base, current, label, pageLabel, onGo }: GuideThumbsProps) {
  const rail = useRef<HTMLElement>(null);
  const width = Math.round(base.width * THUMB_SCALE);
  const height = Math.round(base.height * THUMB_SCALE);
  // The tab stop: the current page, unless arrow keys moved focus away from it since it last changed.
  const [moved, setMoved] = useState<{ from: number; to: number } | null>(null);
  const roving = moved && moved.from === current ? moved.to : current;

  useEffect(() => {
    const root = rail.current;
    if (!root) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const tasks = new Map<number, Thumb>();
    const draw = async (entry: Thumb, n: number, host: HTMLElement) => {
      const page = await doc.getPage(n);
      if (entry.cancelled) return;
      entry.page = page;
      const viewport = page.getViewport({ scale: THUMB_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      entry.canvas = canvas;
      entry.task = page.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      await entry.task.promise;
      if (!entry.cancelled) host.append(canvas);
    };
    const drop = (n: number) => {
      const entry = tasks.get(n);
      if (!entry) return;
      entry.cancelled = true;
      entry.task?.cancel();
      if (entry.canvas) releaseCanvas(entry.canvas);
      entry.page?.cleanup();
      tasks.delete(n);
    };
    const start = (n: number, host: HTMLElement) => {
      const entry: Thumb = { cancelled: false };
      tasks.set(n, entry);
      // A late failure of a draw that was already dropped must not drop a newer draw of the same page.
      draw(entry, n, host).catch(() => {
        if (tasks.get(n) === entry) drop(n);
      });
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const { target, isIntersecting } of entries) {
          const n = Number((target as HTMLElement).dataset.thumb);
          if (isIntersecting && !tasks.has(n)) start(n, target as HTMLElement);
          else if (!isIntersecting) drop(n);
        }
      },
      { root, rootMargin: "50% 0px" },
    );
    for (const el of root.querySelectorAll<HTMLElement>("[data-thumb]")) observer.observe(el);
    return () => {
      observer.disconnect();
      for (const n of [...tasks.keys()]) drop(n);
    };
  }, [doc, count]);

  useEffect(() => {
    const root = rail.current;
    const button = root?.querySelector<HTMLElement>(`[data-thumb-button="${current}"]`);
    if (!root || !button) return;
    const top = button.offsetTop;
    if (top < root.scrollTop || top + button.offsetHeight > root.scrollTop + root.clientHeight) {
      root.scrollTop = top - (root.clientHeight - button.offsetHeight) / 2;
    }
  }, [current]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLOListElement>) => {
    const target =
      event.key === "ArrowDown" ? roving + 1 : event.key === "ArrowUp" ? roving - 1 : event.key === "Home" ? 1 : event.key === "End" ? count : null;
    if (target === null || event.altKey || event.ctrlKey || event.metaKey) return;
    // Handled here, so the reader's own Home and End (first and last page) stay out of it.
    event.preventDefault();
    const next = Math.min(Math.max(1, target), count);
    setMoved({ from: current, to: next });
    rail.current?.querySelector<HTMLElement>(`[data-thumb-button="${next}"]`)?.focus();
  };

  return (
    <nav ref={rail} aria-label={label} className={`${styles.rail} hidden overflow-y-auto overscroll-contain lg:block`} data-testid="guide-thumbs">
      <ol className={styles.railList} onKeyDown={onKeyDown}>
        {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
          <li key={n}>
            <button
              type="button"
              className={styles.thumbButton}
              onClick={() => onGo(n)}
              tabIndex={n === roving ? 0 : -1}
              aria-current={n === current ? "page" : undefined}
              aria-label={pageLabel(n)}
              data-thumb-button={n}
            >
              <span className={styles.thumb} style={{ width, height }} data-thumb={n} />
              <span aria-hidden="true" className="pv-data">
                {n}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
});
