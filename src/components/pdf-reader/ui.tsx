"use client";

import { useLayoutEffect, useRef, type Ref } from "react";

/** Shared bits of the PDF reader dialogs and the reader (no strings here). */

/** 44 px targets on touch screens, 36 px with a mouse or trackpad (`pointer-fine`), so the header stays one compact row. */
const TARGET =
  "inline-flex min-h-11 min-w-11 pointer-fine:min-h-9 pointer-fine:min-w-9 items-center justify-center text-sm font-semibold text-ink transition disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40";

/** Header buttons (Close, Chapters, Download). */
export const COMPACT_BUTTON = `${TARGET} rounded-lg border border-line-2 px-2 hover:border-ink-2 hover:bg-surface-2`;

/** Borderless round buttons inside the floating page and zoom pill. */
export const PILL_BUTTON = `${TARGET} rounded-full px-1 hover:bg-surface-2 aria-disabled:hover:bg-transparent`;

/** The dialog's single header row (loading, error and reader states share it, so the swap does not jump). */
export const HEADER_ROW = "flex items-center gap-2 border-b border-line px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1.5 sm:px-3";

/** Loading skeleton: the document's cover (a guide cover or a page-1 image) when known, else a blank sheet. */
export function ReaderSkeleton({ cover }: { cover?: string }) {
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

/** A Back control left of the title (the paper reader returns to the abstract and citation). */
export interface ReaderBack {
  label: string;
  onBack: () => void;
  /** A callback ref can refocus Back when the loading header swaps for the reader's (the paper dialog does). */
  node?: Ref<HTMLButtonElement>;
}

/** The Back control: an arrow on phones, the arrow and its label from `sm:` up. */
export function BackButton({ back: { label, onBack, node }, testPrefix }: { back: ReaderBack; testPrefix: string }) {
  return (
    <button ref={node} type="button" onClick={onBack} aria-label={label} className={`${COMPACT_BUTTON} gap-2`} data-testid={`${testPrefix}-back`}>
      <span aria-hidden="true">&#8592;</span>
      <span aria-hidden="true" className="max-sm:hidden">
        {label}
      </span>
    </button>
  );
}
