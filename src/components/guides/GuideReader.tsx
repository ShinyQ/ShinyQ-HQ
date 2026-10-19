"use client";

import { useTranslations } from "next-intl";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { GuideView } from "@/content/guides";
import styles from "./GuideReader.module.css";
import { GuidePage } from "./GuidePage";
import { GuideThumbs } from "./GuideThumbs";
import { GuideToolbar, type Chapter } from "./GuideToolbar";
import { afterDestroy, destPage, destroyTask, loadPdfjs, raceLoad, workerFailure } from "./pdf";
import { canvasPixelCap, canvasScale, clampPage, nextZoom, readerKey, releasable, renderWindow, savedPage, savePage } from "./reader-model";
import { GuideSkeleton } from "./ui";

export interface GuideReaderProps {
  view: GuideView;
  titleId: string;
  onClose: () => void;
  /** The PDF could not be opened: the dialog swaps in its error state. */
  onError?: () => void;
}

type Pdfjs = typeof import("pdfjs-dist");
interface OutlineItem {
  title: string;
  dest: string | unknown[] | null;
  items?: OutlineItem[];
}
interface Loaded {
  lib: Pdfjs;
  doc: PDFDocumentProxy;
  count: number;
  /** Page 1 size in points: every slot takes its size at the current scale. */
  base: { width: number; height: number };
  chapters: Chapter[];
}

/** Must match `.stack` in the CSS module (padding and gap). */
const PAD_Y = 16;
const PAD_X = 12;
const GAP = 16;
/** Fit width stays readable on wide screens. */
const MAX_FIT = 1000;

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const flatten = (items: readonly OutlineItem[], depth = 0): Chapter[] =>
  items.flatMap((item) => [{ title: item.title, dest: item.dest, depth }, ...(depth < 1 ? flatten(item.items ?? [], depth + 1) : [])]);

/**
 * The study guide reader (lazy chunk): pdf.js over the guide's Range-enabled URL, so only the pages read are
 * fetched. Pages draw lazily in a window around the visible ones (canvas plus selectable text layer) and far
 * pages release their canvases; the last page read is remembered per guide. Fit width by default, zoom by
 * buttons and keys (`readerKey`), chapters from the PDF outline, a thumbnail rail on desktops.
 */
export default function GuideReader({ view, titleId, onClose, onError }: GuideReaderProps) {
  const t = useTranslations("guides");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [avail, setAvail] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(1);
  const [drawn, setDrawn] = useState<number[]>([]);
  const [dpr] = useState(() => window.devicePixelRatio || 1);
  // Touch screens get the phone canvas budget (the pdf.js viewer's iOS and Android limit).
  const [maxPixels] = useState(() => canvasPixelCap(window.matchMedia?.("(pointer: coarse)").matches ?? false));
  const scroller = useRef<HTMLDivElement>(null);
  const fail = useRef(onError);
  const currentRef = useRef(1);
  const visible = useRef(new Set<number>());
  /** Reading position in pages (float, at the top third), restored after a zoom or resize. */
  const anchor = useRef<number | null>(null);
  /** A programmatic jump: keeps its page even when the end of the document stops the scroll short. */
  const pinned = useRef<{ page: number; top: number } | null>(null);
  const restored = useRef(false);
  useEffect(() => {
    fail.current = onError;
  });

  useEffect(() => {
    let live = true;
    let task: PDFDocumentLoadingTask | undefined;
    const open = async () => {
      const lib = await loadPdfjs();
      // A document closed a moment ago (fast close and reopen, Retry) finishes its destroy on the worker first.
      await afterDestroy();
      if (!live) return;
      // Range requests only: no streaming of the whole file and no background prefetch. No wasm, no XFA.
      task = lib.getDocument({ url: view.url, rangeChunkSize: 65536, disableAutoFetch: true, disableStream: true, enableXfa: false, useWasm: false, isOffscreenCanvasSupported: false });
      // pdf.js waits forever on a worker that never loads: race the open against its failure and a timeout.
      const { doc, first, outline } = await raceLoad(
        task.promise.then(async (doc) => {
          const [first, outline] = await Promise.all([doc.getPage(1), doc.getOutline().catch(() => null)]);
          return { doc, first, outline };
        }),
        workerFailure(),
      );
      const { width, height } = first.getViewport({ scale: 1 });
      if (live) setLoaded({ lib, doc, count: doc.numPages, base: { width, height }, chapters: flatten((outline ?? []) as OutlineItem[]) });
    };
    open().catch(() => {
      if (live) fail.current?.();
    });
    return () => {
      live = false;
      if (task) destroyTask(task);
    };
  }, [view.url]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setAvail(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const count = loaded?.count ?? 0;
  const base = loaded?.base;
  const fitWidth = Math.min(MAX_FIT, Math.max(120, avail - 2 * PAD_X));
  const { scale, ratio } = base ? canvasScale(fitWidth * zoom, base.width, dpr, 4096, base.height, maxPixels) : { scale: 1, ratio: 1 };
  const slotW = base && avail > 0 ? base.width * scale : 0;
  const slotH = base ? base.height * scale : 0;
  const stride = slotH + GAP;
  const keep = zoom > 1.5 ? 2 : 4;
  const pages = useMemo(() => Array.from({ length: count }, (_, i) => i + 1), [count]);
  const drawnSet = useMemo(() => new Set(drawn), [drawn]);
  const slotsReady = Boolean(loaded) && slotW > 0;

  const refresh = useCallback(() => {
    const win = renderWindow([...visible.current], count);
    setDrawn((prev) => {
      const union = [...new Set([...prev, ...win])].sort((a, b) => a - b);
      const drop = new Set(releasable(union, currentRef.current, keep));
      const next = union.filter((p) => win.includes(p) || !drop.has(p));
      return next.length === prev.length && next.every((p, i) => p === prev[i]) ? prev : next;
    });
  }, [count, keep]);

  const show = useCallback((page: number) => {
    currentRef.current = page;
    setCurrent(page);
  }, []);

  const go = useCallback(
    (page: number) => {
      const el = scroller.current;
      if (!el || !count || slotW === 0) return;
      const target = clampPage(page, count);
      el.scrollTop = PAD_Y + (target - 1) * stride;
      pinned.current = { page: target, top: el.scrollTop };
      anchor.current = target - 1;
      show(target);
      refresh();
    },
    [count, slotW, stride, show, refresh],
  );

  // The first layout restores the saved page; later scale changes keep the reading position.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !loaded || slotW === 0) return;
    if (!restored.current) {
      restored.current = true;
      go(savedPage(storage(), view.slug, loaded.count));
      return;
    }
    if (anchor.current !== null) el.scrollTop = PAD_Y + anchor.current * stride - el.clientHeight / 3;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [loaded, slotW, stride, go, view.slug]);

  // Current page: the slot at the top third (the last one at the very end); saved once scrolling settles.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !loaded || slotW === 0) return;
    let frame = 0;
    let idle: number | undefined;
    const onScroll = () => {
      anchor.current = (el.scrollTop + el.clientHeight / 3 - PAD_Y) / stride;
      window.clearTimeout(idle);
      idle = window.setTimeout(() => savePage(storage(), view.slug, currentRef.current), 300);
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const pin = pinned.current;
        if (pin && Math.abs(el.scrollTop - pin.top) < 2) return;
        pinned.current = null;
        const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
        const page = atEnd ? loaded.count : clampPage(Math.floor(anchor.current ?? 0) + 1, loaded.count);
        if (page !== currentRef.current) {
          show(page);
          refresh();
        }
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      window.clearTimeout(idle);
      savePage(storage(), view.slug, currentRef.current);
    };
  }, [loaded, slotW, stride, view.slug, show, refresh]);

  // Pages near the view (one screen above and below) feed the render window.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !slotsReady) return;
    const seen = visible.current;
    seen.clear();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting) seen.add(page);
          else seen.delete(page);
        }
        refresh();
      },
      { root: el, rootMargin: "100% 0px" },
    );
    for (const slot of el.querySelectorAll<HTMLElement>("[data-page]")) observer.observe(slot);
    return () => observer.disconnect();
  }, [slotsReady, refresh]);

  const zoomBy = (dir: 1 | -1) => setZoom((z) => nextZoom(z, dir));
  const onChapter = (chapter: Chapter) => {
    if (!loaded) return;
    void destPage(loaded.doc, chapter.dest)
      .then((page) => {
        if (page) go(page);
      })
      .catch(() => {})
      .finally(() => scroller.current?.focus({ preventScroll: true }));
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (!loaded || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement) return;
    if (event.key === " " && target.closest("button, a")) return;
    const action = readerKey(event.key, event.shiftKey);
    if (!action) return;
    event.preventDefault();
    if (action === "next") go(currentRef.current + 1);
    else if (action === "prev") go(currentRef.current - 1);
    else if (action === "first") go(1);
    else if (action === "last") go(loaded.count);
    else if (action === "zoomIn") zoomBy(1);
    else if (action === "zoomOut") zoomBy(-1);
    else setZoom(1);
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={onKeyDown}
      data-testid="guide-reader"
      data-page-count={loaded ? loaded.count : undefined}
      data-current-page={loaded ? current : undefined}
    >
      <GuideToolbar
        title={view.title}
        titleId={titleId}
        count={loaded ? loaded.count : null}
        current={current}
        zoom={zoom}
        chapters={loaded?.chapters ?? []}
        downloadUrl={view.downloadUrl}
        file={view.file}
        onClose={onClose}
        onGo={go}
        onZoom={zoomBy}
        onFit={() => setZoom(1)}
        onChapter={onChapter}
      />
      <div className="flex min-h-0 flex-1">
        {loaded && base && (
          <GuideThumbs
            doc={loaded.doc}
            count={loaded.count}
            base={base}
            current={current}
            label={t("thumbnails")}
            pageLabel={(page) => t("pageOf", { page, count: loaded.count })}
            onGo={go}
          />
        )}
        <div
          ref={scroller}
          tabIndex={0}
          role="region"
          aria-labelledby={titleId}
          aria-busy={!loaded}
          className={`${styles.pages} min-h-0 flex-1 overflow-auto overscroll-contain outline-none focus-visible:ring-1 focus-visible:ring-cyan/60`}
          data-testid="guide-pages"
        >
          {loaded && slotW > 0 ? (
            <div className={styles.stack}>
              {pages.map((n) => (
                <GuidePage
                  key={n}
                  lib={loaded.lib}
                  doc={loaded.doc}
                  n={n}
                  width={slotW}
                  height={slotH}
                  scale={scale}
                  ratio={ratio}
                  active={drawnSet.has(n)}
                  label={t("pageOf", { page: n, count: loaded.count })}
                  failedLabel={t("pageFailed")}
                  retryLabel={t("retry")}
                />
              ))}
            </div>
          ) : (
            <>
              <p className="sr-only" role="status">
                {t("loading")}
              </p>
              <GuideSkeleton cover={view.cover} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
