"use client";

import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import type { GalleryImage } from "@/content/media";

const SWIPE_PX = 50;
const FOCUSABLE = "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

export interface LightboxProps {
  images: readonly GalleryImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/**
 * Modal image viewer. Keyboard: Left/Right (wraps), Home/End, Esc. Swipe on touch.
 * Focus moves to the close button on open and is trapped until close; the caller
 * restores focus to the opener. Keys are captured so the 3D rover and HUD ignore them.
 * Mount it only in response to user input (it portals into document.body).
 */
export function Lightbox({ images, index, onIndexChange, onClose }: LightboxProps) {
  const t = useTranslations("gallery");
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const swipe = useRef<{ id: number; x: number } | null>(null);
  const titleId = useId();
  const total = images.length;
  const image = images[index];

  const go = (delta: number) => onIndexChange((index + delta + total) % total);

  useEffect(() => {
    closeButton.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  // Window capture so arrow keys never reach the rover input or other global handlers.
  const latest = useRef({ go, onClose, total, onIndexChange });
  useEffect(() => {
    latest.current = { go, onClose, total, onIndexChange };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { go: move, onClose: close, total: count, onIndexChange: set } = latest.current;
      const handled: Record<string, () => void> = {
        Escape: close,
        ArrowLeft: () => move(-1),
        ArrowRight: () => move(1),
        Home: () => set(0),
        End: () => set(count - 1),
      };
      const action = handled[e.key];
      if (!action) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      action();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    if (total < 2) return;
    for (const neighbour of [images[(index + 1) % total], images[(index - 1 + total) % total]]) {
      const img = new Image();
      img.src = neighbour.src;
    }
  }, [images, index, total]);

  const trapTab = (e: ReactKeyboardEvent) => {
    if (e.key !== "Tab" || !dialog.current) return;
    const items = Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType !== "mouse") swipe.current = { id: e.pointerId, x: e.clientX };
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.id !== e.pointerId || total < 2) return;
    const dx = e.clientX - start.x;
    if (Math.abs(dx) >= SWIPE_PX) go(dx < 0 ? 1 : -1);
  };

  if (!image) return null;

  const navButton = "glass inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-lg text-ink transition hover:border-cyan/60 hover:text-cyan focus-visible:outline-2 focus-visible:outline-cyan";

  return createPortal(
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="lightbox"
      className="fixed inset-0 z-[60] flex flex-col bg-void/95 text-ink backdrop-blur-sm"
      onKeyDown={trapTab}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <p id={titleId} className="label text-ink-2" aria-live="polite">
          {t("counter", { index: index + 1, total })}
        </p>
        <button ref={closeButton} type="button" onClick={onClose} className={navButton} aria-label={t("close")}>
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center px-2 py-4 sm:px-16"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        {/* Static export: images are pre-optimized webp files under public/media. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={image.src}
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          decoding="async"
          draggable={false}
          className="max-h-full max-w-full rounded-lg border border-glass-border object-contain select-none"
        />
        {total > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} className={`${navButton} absolute top-1/2 left-2 -translate-y-1/2 max-sm:hidden`} aria-label={t("previous")}>
              <span aria-hidden="true">←</span>
            </button>
            <button type="button" onClick={() => go(1)} className={`${navButton} absolute top-1/2 right-2 -translate-y-1/2 max-sm:hidden`} aria-label={t("next")}>
              <span aria-hidden="true">→</span>
            </button>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {total > 1 && (
          <button type="button" onClick={() => go(-1)} className={`${navButton} sm:hidden`} aria-label={t("previous")}>
            <span aria-hidden="true">←</span>
          </button>
        )}
        <p className="mx-auto max-w-3xl flex-1 text-center text-sm leading-6 text-ink-2">{image.alt}</p>
        {total > 1 && (
          <button type="button" onClick={() => go(1)} className={`${navButton} sm:hidden`} aria-label={t("next")}>
            <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
      <p className="sr-only">{t("hint")}</p>
    </div>,
    document.body,
  );
}
