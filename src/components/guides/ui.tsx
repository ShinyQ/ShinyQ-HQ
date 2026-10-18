"use client";

import { useLayoutEffect, useRef } from "react";

/** Shared bits of the study guide dialog and reader (no strings, so no `guides` reads here). */
export const BUTTON =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line-2 px-2 text-sm font-semibold text-ink transition hover:border-ink-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";

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
