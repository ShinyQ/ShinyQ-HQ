"use client";

import { useRef, useState, type PointerEvent } from "react";
import { applyDeadZone } from "@/experience/input/intents";
import { setJoystick } from "@/experience/input/joystick";
import { useBoostToggle } from "./boost";

const RADIUS = 60;
/** Two pointer downs on the joystick within this window toggle boost. */
export const DOUBLE_TAP_MS = 300;

/**
 * Virtual joystick for coarse pointers: left of the bottom band, 120 px, 12% dead zone (appendix 03 section 3).
 * With `boost` (the Corners HUD, which has no Boost button), a double tap toggles boost; the first tap
 * drives as usual. Keyboard users hold Shift instead.
 */
export function Joystick({ boost: withBoost = false }: { boost?: boolean }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);
  const lastDown = useRef(0);
  const boost = useBoostToggle();

  const update = (e: PointerEvent<HTMLDivElement>) => {
    const rect = base.current?.getBoundingClientRect();
    if (!rect) return;
    let dx = (e.clientX - (rect.left + rect.width / 2)) / RADIUS;
    let dy = (e.clientY - (rect.top + rect.height / 2)) / RADIUS;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    const v = applyDeadZone(dx, dy);
    setJoystick(v.x, -v.y, true);
    setKnob({ x: dx * RADIUS, y: dy * RADIUS });
  };

  const release = (e: PointerEvent<HTMLDivElement>) => {
    if (active.current !== e.pointerId) return;
    active.current = null;
    setJoystick(0, 0, false);
    setKnob({ x: 0, y: 0 });
  };

  return (
    <div
      ref={base}
      // Pointer-only control; keyboard users drive with WASD or the arrow keys.
      aria-hidden="true"
      data-testid="joystick"
      data-boost={withBoost ? (boost.on ? "on" : "off") : undefined}
      onPointerDown={(e) => {
        if (withBoost) {
          const now = Date.now();
          if (now - lastDown.current <= DOUBLE_TAP_MS) {
            lastDown.current = 0;
            boost.toggle();
          } else {
            lastDown.current = now;
          }
        }
        active.current = e.pointerId;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Capture can fail for synthetic pointers; tracking the id is enough.
        }
        update(e);
      }}
      onPointerMove={(e) => {
        if (active.current === e.pointerId) update(e);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      className={`glass glass-solid pointer-events-auto relative size-[120px] shrink-0 touch-none rounded-full transition-shadow motion-reduce:transition-none ${
        withBoost && boost.on ? "border-cyan/60 shadow-[0_0_0_3px_var(--color-cyan),0_0_24px_-6px_var(--color-cyan)]" : ""
      }`}
    >
      <span
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 size-12 rounded-full border border-cyan bg-cyan/25"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}
