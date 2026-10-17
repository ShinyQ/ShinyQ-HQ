"use client";

import { useTranslations } from "next-intl";

/**
 * Stands in for a lazy HUD panel whose chunk failed to load (offline, a deploy replaced the file): a short
 * note and a Retry button. Retry hands focus to the enclosing dialog first, so it never drops to the body
 * while the next attempt loads.
 */
export function ChunkFailed({ onRetry, testId }: { onRetry: () => void; testId?: string }) {
  const t = useTranslations("hud");
  return (
    <div role="alert" data-testid={testId} className="flex flex-col items-start gap-2 px-3 text-sm text-ink-2">
      <p>{t("loadFailed")}</p>
      <button
        type="button"
        onClick={(event) => {
          event.currentTarget.closest<HTMLElement>("[role='dialog']")?.focus({ preventScroll: true });
          onRetry();
        }}
        className="hq-glow inline-flex min-h-11 items-center rounded-xl border border-line-2 px-4 text-ink hover:bg-surface-2"
      >
        {t("retry")}
      </button>
    </div>
  );
}
