"use client";

import { useRef, useState, type PointerEvent } from "react";
import { applyDeadZone } from "@/experience/input/intents";
import { setJoystick } from "@/experience/input/joystick";
import { useBoostToggle } from "./boost";

const RADIUS = 60;
/** After a short tap's release, a pointer down on the joystick within this window toggles boost. */
export const DOUBLE_TAP_MS = 300;
/** A touch counts as a tap only if it is released this quickly and moved less than `TAP_SLOP_PX`. */
export const TAP_MAX_MS = 250;
export const TAP_SLOP_PX = 12;

type Boost = ReturnType<typeof useBoostToggle>;

/**
 * Virtual joystick for coarse pointers: left of the bottom band, 120 px, 12% dead zone (appendix 03 section 3).
 * With `boost` (the Corners HUD, which has no Boost button), a double tap toggles boost: a short, still
 * first tap, then a pointer down within `DOUBLE_TAP_MS` of its release; the first tap drives as usual.
 * Keyboard users hold Shift instead. Without `boost` it never touches the boost state, so a separate
 * Boost button keeps its own.
 */
export function Joystick({ boost = false }: { boost?: boolean }) {
  return boost ? <BoostJoystick /> : <Stick />;
}

function BoostJoystick() {
  return <Stick boost={useBoostToggle()} />;
}

function Stick({ boost }: { boost?: Boost }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);
  /** The current press: when and where it started, and whether it left the tap slop. */
  const press = useRef({ at: 0, x: 0, y: 0, moved: false });
  /** Release time of the last short tap (0: none pending). */
  const lastTap = useRef(0);

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

  const track = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) >= TAP_SLOP_PX) p.moved = true;
  };

  /** `up` is a real release; a cancelled pointer never counts as a tap. */
  const release = (e: PointerEvent<HTMLDivElement>, up: boolean) => {
    if (active.current !== e.pointerId) return;
    active.current = null;
    if (boost) {
      track(e);
      const now = Date.now();
      const p = press.current;
      lastTap.current = up && !p.moved && now - p.at <= TAP_MAX_MS ? now : 0;
    }
    setJoystick(0, 0, false);
    setKnob({ x: 0, y: 0 });
  };

  return (
    <div
      ref={base}
      // Pointer-only control; keyboard users drive with WASD or the arrow keys.
      aria-hidden="true"
      data-testid="joystick"
      data-boost={boost ? (boost.on ? "on" : "off") : undefined}
      onPointerDown={(e) => {
        if (boost) {
          const now = Date.now();
          const second = lastTap.current > 0 && now - lastTap.current <= DOUBLE_TAP_MS;
          lastTap.current = 0;
          if (second) boost.toggle();
          // The press that completes a pair never starts the next one, so a third tap starts a new pair.
          press.current = { at: now, x: e.clientX, y: e.clientY, moved: second };
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
        if (active.current !== e.pointerId) return;
        if (boost) track(e);
        update(e);
      }}
      onPointerUp={(e) => release(e, true)}
      onPointerCancel={(e) => release(e, false)}
      className={`glass glass-solid pointer-events-auto relative size-[120px] shrink-0 touch-none rounded-full transition-shadow motion-reduce:transition-none ${
        boost?.on ? "border-cyan/60 shadow-[0_0_0_3px_var(--color-cyan),0_0_24px_-6px_var(--color-cyan)]" : ""
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
