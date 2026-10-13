"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { MOTION_PREFS, type MotionPref } from "@/lib/motion";
import { getHQStore, useHQStore } from "@/store/useHQStore";

/** Speed lines and a dot: the motion glyph of the trigger, same stroke style as the HUD icons. */
function MotionIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M3 8h6M2 12h8M3 16h6" />
      <circle cx="16" cy="12" r="5" />
    </svg>
  );
}

/**
 * The Motion setting as a 3-way segmented control: a fieldset of native radios (arrow keys move and
 * select, Tab enters at the checked one), styled like the language toggle. System follows
 * `prefers-reduced-motion`; Full and Reduced override it (store `motion`, src/lib/motion.ts).
 */
export function MotionChoices({ autoFocus = false }: { autoFocus?: boolean }) {
  const t = useTranslations("hud.motion");
  const motion = useHQStore((s) => s.motion);
  const name = useId();
  return (
    <fieldset className="min-w-0" data-testid="motion-choices">
      <legend className="label mb-1.5 text-ink-3">{t("label")}</legend>
      <div className="grid grid-cols-3 gap-0.5 rounded-full border border-glass-border p-0.5">
        {MOTION_PREFS.map((pref: MotionPref) => (
          <label
            key={pref}
            className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-full px-1.5 text-[13px] text-ink-2 transition hover:text-ink has-[:checked]:bg-cyan/15 has-[:checked]:text-cyan has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan"
          >
            <input
              type="radio"
              name={name}
              value={pref}
              checked={motion === pref}
              autoFocus={autoFocus && motion === pref}
              onChange={() => getHQStore().getState().setMotion(pref)}
              className="sr-only"
            />
            {t(pref)}
          </label>
        ))}
      </div>
      <p className="mt-1.5 text-xs leading-4 text-ink-3">{t("note")}</p>
    </fieldset>
  );
}

/** Top bar: a round motion button beside Sound that opens the Motion setting in a small popover. */
export function MotionMenu() {
  const t = useTranslations("hud.motion");
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label={t("label")}
        title={t("label")}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        data-onboard="motion"
        data-testid="motion-menu"
        className="glass glass-solid inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 text-ink-2 transition hover:text-ink aria-expanded:text-cyan"
      >
        <MotionIcon />
      </button>
      {open && (
        <div id={id} className="glass glass-solid absolute top-full right-0 z-20 mt-2 w-64 p-3" data-testid="motion-popover">
          <MotionChoices autoFocus />
        </div>
      )}
    </div>
  );
}
