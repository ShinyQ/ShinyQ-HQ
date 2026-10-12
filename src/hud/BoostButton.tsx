"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { setBoost } from "@/experience/input/joystick";

/**
 * Hold-to-boost for coarse pointers, beside the joystick (keyboard users hold Shift). Pointer-only
 * like the joystick, so it is hidden from assistive tech; release, cancel or unmount ends the boost.
 */
export function BoostButton() {
  const t = useTranslations("hud");
  const pointer = useRef<number | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => () => setBoost(false), []);

  const press = (e: PointerEvent<HTMLDivElement>) => {
    pointer.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail for synthetic pointers; tracking the id is enough.
    }
    setBoost(true);
    setActive(true);
  };

  const release = (e: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== e.pointerId) return;
    pointer.current = null;
    setBoost(false);
    setActive(false);
  };

  return (
    <div
      aria-hidden="true"
      data-testid="boost"
      data-active={active ? "true" : undefined}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      className={`glass glass-solid pointer-events-auto grid size-14 shrink-0 touch-none place-items-center rounded-full transition select-none ${
        active ? "border-cyan text-cyan shadow-[0_0_24px_-4px_var(--color-cyan)]" : "text-ink-2"
      }`}
    >
      <span className="flex flex-col items-center leading-none">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l7-7 7 7" />
          <path d="M5 19l7-7 7 7" />
        </svg>
        <span className="label mt-0.5 text-[9px]">{t("boost")}</span>
      </span>
    </div>
  );
}
