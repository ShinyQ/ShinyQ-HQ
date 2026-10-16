"use client";

import { useTranslations } from "next-intl";

/** Title row of a HUD side sheet (the Corners menu, the desktop settings): the dialog's name and a 44 px close button. */
export function SheetHeader({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  const t = useTranslations("hud");
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 pt-4 pb-3">
      <h2 id={id} className="text-base font-semibold text-ink">
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("pads.close")}
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-line-2 text-ink transition hover:border-ink-2 hover:bg-surface-2"
      >
        <span aria-hidden="true" className="text-xl leading-none">
          ×
        </span>
      </button>
    </header>
  );
}
