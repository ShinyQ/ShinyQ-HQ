/**
 * Pure helpers for the study guide reader (zoom steps, page windows, canvas sizing, keys, the saved page).
 * No React or pdf.js imports, so Vitest covers them directly.
 */
import { GUIDE_PAGE_KEY } from "@/content/guides";

/** Zoom levels, as multiples of the fit-width scale (1 = fit width). */
export const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;
const EPSILON = 0.001;

/** The next zoom step above (`1`) or below (`-1`) `current`, stopping at the ends. */
export function nextZoom(current: number, dir: 1 | -1): number {
  if (dir === 1) return ZOOM_STEPS.find((step) => step > current + EPSILON) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find((step) => step < current - EPSILON) ?? ZOOM_STEPS[0];
}

/** A page number inside 1..count (NaN and an empty document give 1). */
export function clampPage(page: number, count: number): number {
  if (Number.isNaN(page)) return 1;
  return Math.min(Math.max(1, Math.round(page)), Math.max(1, count));
}

/** The pages to keep drawn: every visible page plus `margin` pages either side, sorted and unique. */
export function renderWindow(visible: readonly number[], count: number, margin = 1): number[] {
  const pages = new Set<number>();
  for (const page of visible) {
    if (page < 1 || page > count) continue;
    for (let p = Math.max(1, page - margin); p <= Math.min(count, page + margin); p++) pages.add(p);
  }
  return [...pages].sort((a, b) => a - b);
}

/** Drawn pages farther than `keep` from the current page: their canvases can be released. */
export function releasable(drawn: readonly number[], current: number, keep = 4): number[] {
  return drawn.filter((page) => Math.abs(page - current) > keep);
}

/**
 * The pdf.js viewport scale that fits `cssWidth`, and the backing store ratio: the device pixel ratio capped
 * at 2, lowered further so the canvas's long side stays within `maxSide` (iOS Safari drops larger canvases).
 */
export function canvasScale(cssWidth: number, pageWidthPt: number, dpr: number, maxSide = 4096, pageHeightPt = 842): { scale: number; ratio: number } {
  const scale = Math.max(0.1, cssWidth) / Math.max(1, pageWidthPt);
  const device = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, 2) : 1;
  const longSide = Math.max(pageWidthPt, pageHeightPt) * scale;
  return { scale, ratio: Math.min(device, maxSide / longSide) };
}

export type ReaderAction = "next" | "prev" | "first" | "last" | "zoomIn" | "zoomOut" | "fit";

const KEYS: Record<string, ReaderAction> = {
  PageDown: "next",
  ArrowRight: "next",
  PageUp: "prev",
  ArrowLeft: "prev",
  Home: "first",
  End: "last",
  "+": "zoomIn",
  "=": "zoomIn",
  "-": "zoomOut",
  _: "zoomOut",
  "0": "fit",
};

/** The reader action for a key on the reader panel (Space pages forward, Shift+Space back), else null. */
export function readerKey(key: string, shift: boolean): ReaderAction | null {
  if (key === " ") return shift ? "prev" : "next";
  return Object.hasOwn(KEYS, key) ? KEYS[key] : null;
}

/** The last page read in a guide (1 when missing, invalid or storage is blocked). */
export function savedPage(storage: Pick<Storage, "getItem"> | null, slug: string, count: number): number {
  try {
    const raw = storage?.getItem(GUIDE_PAGE_KEY(slug));
    return raw ? clampPage(Number.parseInt(raw, 10), count) : 1;
  } catch {
    return 1;
  }
}

/** Remembers the page; private mode or a full quota is ignored. */
export function savePage(storage: Pick<Storage, "setItem"> | null, slug: string, page: number): void {
  try {
    storage?.setItem(GUIDE_PAGE_KEY(slug), String(page));
  } catch {
    // Storage blocked: the reader still works, it just starts at page 1 next time.
  }
}
