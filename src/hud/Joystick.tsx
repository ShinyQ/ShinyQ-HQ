"use client";

import { useRef, useState, type PointerEvent } from "react";
import { applyDeadZone } from "@/experience/input/intents";
import { setJoystick } from "@/experience/input/joystick";

const RADIUS = 60;

/** Virtual joystick for coarse pointers: bottom-left, 120 px, 12% dead zone (appendix 03 section 3). */
export function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

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

  const release = () => {
    setJoystick(0, 0, false);
    setKnob({ x: 0, y: 0 });
  };

  return (
    <div
      ref={base}
      // Pointer-only control; keyboard users drive with WASD or the arrow keys.
      aria-hidden="true"
      data-testid="joystick"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) update(e);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      className="glass pointer-events-auto absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-5 size-[120px] touch-none rounded-full"
    >
      <span
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 size-12 rounded-full border border-cyan bg-cyan/25"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}
