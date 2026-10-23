"use client";

import { useLayoutEffect, useRef } from "react";

/** Shared bits of the study guide dialog and reader (no strings, so no `guides` reads here). */

/** 44 px targets on touch screens, 36 px with a mouse or trackpad (`pointer-fine`), so the header stays one compact row. */
const TARGET =
  "inline-flex min-h-11 min-w-11 pointer-fine:min-h-9 pointer-fine:min-w-9 items-center justify-center text-sm font-semibold text-ink transition disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40";

/** Header buttons (Close, Chapters, Download). */
export const COMPACT_BUTTON = `${TARGET} rounded-lg border border-line-2 px-2 hover:border-ink-2 hover:bg-surface-2`;

/** Borderless round buttons inside the floating page and zoom pill. */
export const PILL_BUTTON = `${TARGET} rounded-full px-1 hover:bg-surface-2 aria-disabled:hover:bg-transparent`;

/** The dialog's single header row (loading, error and reader states share it, so the swap does not jump). */
export const HEADER_ROW = "flex items-center gap-2 border-b border-line px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1.5 sm:px-3";

/** Loading skeleton: the guide's cover when the view is known, else a blank sheet. */
export function GuideSkeleton({ cover }: { cover?: string }) {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-md px-4 py-6">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- static export, no image optimization
        <img src={cover} alt="" width={480} height={680} className="h-auto w-full rounded-sm opacity-60 motion-safe:animate-pulse" />
      ) : (
        <div className="rounded-sm bg-surface-2 motion-safe:animate-pulse" style={{ aspectRatio: "210 / 297" }} />
      )}
    </div>
  );
}

/**
 * For a Close button that replaces a focused one (loading state to reader): focus it on mount when focus fell to
 * the body, so Esc and Tab keep working inside the dialog.
 */
export function useKeepFocus() {
  const ref = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body) ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}
