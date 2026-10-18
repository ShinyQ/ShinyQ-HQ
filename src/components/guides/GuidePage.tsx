"use client";

import type { PDFDocumentProxy, PDFPageProxy, RenderTask, TextLayer } from "pdfjs-dist";
import { memo, useEffect, useRef } from "react";
import styles from "./GuideReader.module.css";

type Pdfjs = typeof import("pdfjs-dist");

export interface GuidePageProps {
  lib: Pdfjs;
  doc: PDFDocumentProxy;
  n: number;
  /** Slot size in CSS px (page 1 at the current scale). */
  width: number;
  height: number;
  /** pdf.js viewport scale (CSS px per point) and the canvas backing store ratio. */
  scale: number;
  ratio: number;
  /** Draw the page; false releases its canvas and text layer. */
  active: boolean;
  label: string;
  failedLabel: string;
}

/** Zeroes a canvas so iOS Safari frees its backing store at once, then removes it. */
export function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
  canvas.remove();
}

/**
 * One page slot: a white sheet with the page canvas and the pdf.js text layer (selectable, searchable text).
 * Draws while `active`, into a fresh canvas swapped in when done, so a zoom never flashes blank; cancels the
 * in-flight render on a new scale or unmount; releases the canvas when it leaves the render window.
 */
export const GuidePage = memo(function GuidePage({ lib, doc, n, width, height, scale, ratio, active, label, failedLabel }: GuidePageProps) {
  const slot = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const slotEl = slot.current;
    const hostEl = host.current;
    const textEl = text.current;
    if (!slotEl || !hostEl || !textEl) return;
    const release = () => {
      for (const canvas of hostEl.querySelectorAll("canvas")) releaseCanvas(canvas);
      textEl.replaceChildren();
      delete slotEl.dataset.rendered;
    };
    if (!active) {
      if (slotEl.dataset.rendered) void doc.getPage(n).then((page) => page.cleanup(), () => {});
      release();
      return;
    }
    let cancelled = false;
    let task: RenderTask | undefined;
    let layer: TextLayer | undefined;
    let page: PDFPageProxy | undefined;
    const draw = async () => {
      page = await doc.getPage(n);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
      canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", label);
      task = page.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      try {
        await task.promise;
      } catch (error) {
        releaseCanvas(canvas);
        throw error;
      }
      if (cancelled) return releaseCanvas(canvas);
      for (const old of hostEl.querySelectorAll("canvas")) releaseCanvas(old);
      hostEl.append(canvas);
      delete slotEl.dataset.failed;

      textEl.replaceChildren();
      textEl.style.setProperty("--scale-factor", String(scale));
      textEl.style.setProperty("--total-scale-factor", String(scale));
      layer = new lib.TextLayer({ textContentSource: page.streamTextContent(), container: textEl, viewport });
      await layer.render();
      if (!cancelled) slotEl.dataset.rendered = "true";
    };
    draw().catch(() => {
      if (!cancelled) slotEl.dataset.failed = "true";
    });
    return () => {
      cancelled = true;
      task?.cancel();
      layer?.cancel();
    };
  }, [lib, doc, n, scale, ratio, active, label]);

  useEffect(() => {
    const hostEl = host.current;
    return () => {
      if (!hostEl?.querySelector("canvas")) return;
      for (const canvas of hostEl.querySelectorAll("canvas")) releaseCanvas(canvas);
      void doc.getPage(n).then((page) => page.cleanup(), () => {});
    };
  }, [doc, n]);

  return (
    <div ref={slot} className={styles.slot} style={{ width, height }} data-page={n} data-testid="guide-page">
      <span aria-hidden="true" className={styles.slotNumber}>
        {n}
      </span>
      <p className={styles.failed}>{failedLabel}</p>
      <div ref={host} />
      <div ref={text} className={styles.textLayer} />
    </div>
  );
});
