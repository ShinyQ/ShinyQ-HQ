"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";
import type { WalkPlacement } from "./WalkBar";

const PLACE: Record<WalkPlacement, string> = {
  // Phones: under the menu row. Tablets: under the Ask pill row, right of the profile card.
  top: "top-[68px] left-3 right-3 sm:top-[124px] sm:left-auto sm:right-4 sm:w-[min(480px,calc(100%-290px))]",
  bottom: "bottom-4 left-1/2 w-[min(440px,calc(100%-2rem))] -translate-x-1/2",
  "bottom-raised": "bottom-[156px] left-1/2 w-[min(440px,calc(100%-2rem))] -translate-x-1/2",
  dock: "bottom-4 left-4 w-[min(440px,calc(100%-460px))]",
};

/**
 * First-visit offer on a floor with a guided walk: start it, or explore freely. Shown once per
 * floor (`localStorage["hq:walk-prompt"]`). Not modal: the world stays drivable behind it, and
 * driving away counts as "Explore freely".
 */
export function WalkPrompt({
  walkId,
  placement,
  resumeAt,
  onStart,
  onResume,
  onExplore,
}: {
  walkId: string;
  placement: WalkPlacement;
  /** Saved stop number (1-based) when an earlier walk can be resumed. */
  resumeAt?: number | null;
  onStart: () => void;
  onResume?: () => void;
  onExplore: () => void;
}) {
  const t = useTranslations("walk");
  const titleId = useId();
  const start = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    start.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section role="dialog" aria-modal="false" aria-labelledby={titleId} className={`glass glass-solid pointer-events-auto absolute p-4 ${PLACE[placement]}`} data-testid="walk-prompt">
      <h2 id={titleId} className="text-base leading-6 font-semibold text-ink">
        {t(`${walkId}.title`)}
      </h2>
      <p className="mt-1 text-sm leading-5 text-ink-2">{t(`${walkId}.body`)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          ref={start}
          type="button"
          onClick={resumeAt && onResume ? onResume : onStart}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-amber px-4 text-sm font-semibold text-void"
        >
          <span aria-hidden="true">▶</span>
          {resumeAt && onResume ? t("resumeAt", { index: resumeAt }) : t(`${walkId}.start`)}
        </button>
        <button type="button" onClick={onExplore} className="inline-flex min-h-11 items-center rounded-full border border-glass-border px-4 text-sm font-semibold text-ink hover:border-ink-3">
          {t("explore")}
        </button>
      </div>
    </section>
  );
}
