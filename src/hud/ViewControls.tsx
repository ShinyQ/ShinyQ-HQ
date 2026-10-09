"use client";

import { useTranslations } from "next-intl";
import { intents } from "@/experience/input/intents";
import { ROTATE_STEP } from "@/experience/camera/orbit";

const button =
  "grid size-11 place-items-center rounded-full text-ink-2 transition hover:bg-white/5 hover:text-ink focus-visible:text-ink";

/** Rotate left, reset and rotate right: accessible alternatives to drag, twist and Q/E (appendix 03). */
export function ViewControls() {
  const t = useTranslations("hud.view");
  return (
    <div
      role="group"
      aria-label={t("label")}
      data-testid="view-controls"
      className="glass pointer-events-auto absolute right-2 bottom-[max(1.5rem,env(safe-area-inset-bottom))] flex items-center gap-0.5 rounded-full p-0.5 md:right-4"
    >
      <button type="button" className={button} aria-label={t("rotateLeft")} title={t("rotateLeft")} onClick={() => intents.emit({ type: "orbit", dyaw: -ROTATE_STEP, smooth: true, source: "button" })}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
        </svg>
      </button>
      <button type="button" className={`${button} label`} aria-label={t("reset")} title={t("reset")} onClick={() => intents.emit({ type: "view", action: "reset" })}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </svg>
      </button>
      <button type="button" className={button} aria-label={t("rotateRight")} title={t("rotateRight")} onClick={() => intents.emit({ type: "orbit", dyaw: ROTATE_STEP, smooth: true, source: "button" })}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 4v5h-5" />
        </svg>
      </button>
    </div>
  );
}
