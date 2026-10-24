"use client";

import { useTranslations } from "next-intl";
import type { useBoostToggle } from "./boost";

function BoltIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="currentColor">
      <path d="M13.5 2 4 13.5h6.5L9.5 22 20 9.5h-6.5L13.5 2Z" />
    </svg>
  );
}

/**
 * Visible touch boost toggle next to the joystick (owner decision 2026-10-24): one tap on, the next off,
 * the same state as the joystick's double tap. It glows while boost is on.
 */
export function BoostButton({ boost }: { boost: ReturnType<typeof useBoostToggle> }) {
  const t = useTranslations("hud");
  return (
    <button
      type="button"
      data-testid="boost"
      aria-pressed={boost.on}
      aria-label={t("boost")}
      title={t("boost")}
      onClick={boost.toggle}
      className={`glass glass-solid pointer-events-auto grid size-12 shrink-0 touch-manipulation place-items-center rounded-full transition motion-reduce:transition-none ${
        boost.on ? "border-cyan/60 text-cyan shadow-[0_0_0_2px_var(--color-cyan),0_0_20px_-4px_var(--color-cyan)]" : "text-ink-2 hover:text-ink focus-visible:text-ink"
      }`}
    >
      <BoltIcon />
    </button>
  );
}
