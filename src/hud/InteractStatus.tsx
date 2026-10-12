"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { intents } from "@/experience/input/intents";
import { getHQStore, useHQStore } from "@/store/useHQStore";

/** How long the one-time "click a glowing object" hint stays on screen. */
export const POINT_HINT_MS = 4000;

/**
 * Point-and-go status in the bottom band: the hovered or tap-selected target for screen readers, the Go
 * chip after a first tap on touch screens, and the hint after a click on empty floor (once per session).
 */
export function InteractStatus({ coarse }: { coarse: boolean }) {
  const t = useTranslations("hud.interact");
  const hover = useHQStore((s) => s.hover);
  const hint = useHQStore((s) => s.pointHint);

  useEffect(() => {
    if (!hint) return;
    const id = window.setTimeout(() => getHQStore().getState().setPointHint(false), POINT_HINT_MS);
    return () => window.clearTimeout(id);
  }, [hint]);

  const go = () => {
    if (!hover) return;
    getHQStore().getState().setHover(null);
    intents.emit({ type: "interact", item: hover.item });
  };

  return (
    <>
      <p className="sr-only" aria-live="polite" data-testid="interact-live">
        {hover ? t(hover.via === "tap" ? "liveTap" : "live", { label: hover.item.label }) : ""}
      </p>
      {hover?.via === "tap" && (
        <button
          type="button"
          onClick={go}
          data-testid="interact-go"
          className="glass glass-solid pointer-events-auto line-clamp-2 min-h-11 max-w-full px-4 py-1.5 text-center text-sm leading-5 font-semibold text-cyan"
        >
          {t("go", { label: hover.item.label })}
        </button>
      )}
      {hint && !hover && (
        <p role="status" data-testid="point-hint" className="glass glass-solid pointer-events-none max-w-full px-4 py-2 text-center text-[13px] leading-5 text-ink">
          {t(coarse ? "hintCoarse" : "hintFine")}
        </p>
      )}
    </>
  );
}
