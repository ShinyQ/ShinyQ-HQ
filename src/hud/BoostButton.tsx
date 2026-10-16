"use client";

import { useTranslations } from "next-intl";
import { useRef, type MouseEvent, type PointerEvent } from "react";
import { AccentDot } from "@/components/AccentDot";
import { useBoostToggle } from "./boost";

/**
 * Boost toggle for coarse pointers, beside the joystick (owner request: tap on, tap off; keyboard users
 * still hold Shift). It toggles on pointer down, so a second finger works while the first drives the
 * joystick, and ignores the click that follows. The state and its resets live in `useBoostToggle`.
 */
export function BoostButton() {
  const t = useTranslations("hud");
  const { on, toggle } = useBoostToggle();
  const pointerToggled = useRef(false);

  const press = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    pointerToggled.current = true;
    toggle();
  };

  const click = (e: MouseEvent<HTMLButtonElement>) => {
    // Keyboard activation (detail 0) always toggles; a pointer click already toggled on pointer down.
    if (e.detail !== 0 && pointerToggled.current) {
      pointerToggled.current = false;
      return;
    }
    toggle();
  };

  return (
    <button
      type="button"
      data-testid="boost"
      data-active={on ? "true" : undefined}
      aria-pressed={on}
      aria-label={t("boost")}
      onPointerDown={press}
      onClick={click}
      className={`glass glass-solid hq-glow pointer-events-auto grid size-14 shrink-0 touch-none place-items-center rounded-full select-none ${
        on ? "border-cyan/60 text-cyan shadow-[0_0_24px_-6px_var(--color-cyan)]" : "text-ink-2"
      }`}
    >
      <span className="flex flex-col items-center leading-none">
        <AccentDot tone={on ? "cyan" : "line"} glow={on} className="mb-0.5" />
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l7-7 7 7" />
          <path d="M5 19l7-7 7 7" />
        </svg>
        <span aria-hidden="true" className="label mt-0.5 text-[9px]">
          {t("boost")}
        </span>
      </span>
    </button>
  );
}
