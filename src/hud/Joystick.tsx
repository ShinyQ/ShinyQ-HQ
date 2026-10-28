"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { floatingStick, releaseStick, STICK } from "@/experience/input/floatingStick";
import { applyDeadZone } from "@/experience/input/intents";
import { setJoystick } from "@/experience/input/joystick";
import { useBoostToggle } from "./boost";

const RADIUS = STICK.radius;
/** After a short tap's release, a pointer down on the joystick within this window toggles boost. */
export const DOUBLE_TAP_MS = STICK.doubleTapMs;
/** A touch counts as a tap only if it is released this quickly and moved less than `TAP_SLOP_PX`. */
export const TAP_MAX_MS = STICK.tapMs;
export const TAP_SLOP_PX = STICK.slop;

type Boost = ReturnType<typeof useBoostToggle>;

/** Boost on: the joystick and the Boost button glow the same. */
const GLOW = "border-cyan/60 shadow-[0_0_0_3px_var(--color-cyan),0_0_24px_-6px_var(--color-cyan)]";

/**
 * Visible touch boost toggle next to the joystick (owner decision 2026-10-24): one tap on, the next off, the
 * same state as the joystick's double tap.
 */
export function BoostButton({ boost }: { boost: Boost }) {
  const t = useTranslations("hud");
  return (
    <button
      type="button"
      data-testid="boost"
      aria-pressed={boost.on}
      aria-label={t("boost")}
      onClick={boost.toggle}
      className={`glass glass-solid grid size-12 place-items-center rounded-full text-ink-2 transition hover:text-ink focus-visible:text-ink pointer-events-auto ${boost.on ? GLOW : ""}`}
    >
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13 2 4 14h7l-1 8 10-12h-7z" />
      </svg>
    </button>
  );
}

/**
 * Virtual joystick for coarse pointers: left of the bottom band, 120 px, 12% dead zone (appendix 03 section 3).
 * With `boost` (the Corners HUD), a Boost button sits next to it (`BoostButton`, the same state) and a double
 * tap toggles boost too: a short, still first tap, then a pointer down within `DOUBLE_TAP_MS` of its
 * release; the first tap drives as usual. Keyboard users hold Shift instead. Without `boost` it never touches the boost state. The gesture is timed with the input events' own times, not the time a
 * handler runs, so a slow frame between the taps (a shader compile on a phone) never breaks it.
 */
export function Joystick({ boost = false, aside = false }: { boost?: boolean; aside?: boolean }) {
  return boost ? <BoostJoystick aside={aside} /> : <Stick aside={aside} />;
}

function BoostJoystick({ aside }: { aside: boolean }) {
  const boost = useBoostToggle();
  return (
    <>
      <Stick boost={boost} aside={aside} />
      <BoostButton boost={boost} />
    </>
  );
}

function Stick({ boost, aside }: { boost?: Boost; aside: boolean }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);
  /** The current press: when and where it started, and whether it left the tap slop. */
  const press = useRef({ at: 0, x: 0, y: 0, moved: false });
  /** Release time of the last short tap (0: none pending). */
  const lastTap = useRef(0);

  // Stepping aside for a docked Rover line (the band goes inert): let go of a held stick, so the rover stops.
  useEffect(() => {
    if (!aside || active.current === null) return;
    active.current = null;
    setJoystick(0, 0, false);
    setKnob({ x: 0, y: 0 });
  }, [aside]);

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
      const now = e.timeStamp;
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
          const now = e.timeStamp;
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
        boost?.on ? GLOW : ""
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

/**
 * Phone Boost (spec 2026-10-29): the Boost button in the bottom band's right column, above Reset view; its toggle is the
 * floating stick's double tap too (`floatingStick.toggleBoost`).
 */
export function PhoneBoost() {
  const boost = useBoostToggle();
  const { toggle } = boost;
  useEffect(() => {
    floatingStick.toggleBoost = toggle;
    return () => {
      if (floatingStick.toggleBoost === toggle) floatingStick.toggleBoost = null;
    };
  }, [toggle]);
  return <BoostButton boost={boost} />;
}

const stickView = () => floatingStick.view;

/**
 * The phone's floating stick (spec 2026-10-29): the world input owns the gesture (`input/floatingStick.ts`); this draws a
 * faint resting ring where the fixed stick sat and, while a thumb drives, the base and knob under it. Neither takes a
 * touch (the world under them does). `active` is the HUD's policy: it enables the drive zone, and turning it off (a docked
 * Rover line, unmount) lets go of a held stick, so the rover stops.
 */
export function FloatingStick({ active }: { active: boolean }) {
  const view = useSyncExternalStore(floatingStick.subscribe, stickView, stickView);
  useEffect(() => {
    floatingStick.enabled = active;
    if (!active) releaseStick();
    return () => {
      floatingStick.enabled = false;
      releaseStick();
    };
  }, [active]);
  const { origin, knob } = view;
  return (
    <>
      <div
        aria-hidden="true"
        data-testid="joystick"
        data-floating={origin ? "live" : "rest"}
        className="glass pointer-events-none relative size-[120px] shrink-0 rounded-full transition-opacity motion-reduce:transition-none"
        style={{ opacity: origin ? 0 : 0.45 }}
      />
      {origin && (
        <div
          aria-hidden="true"
          data-testid="joystick-live"
          className="glass glass-solid pointer-events-none fixed top-0 left-0 size-[120px] rounded-full"
          style={{ transform: `translate(${origin.x - RADIUS}px, ${origin.y - RADIUS}px)` }}
        >
          <span
            className="absolute top-1/2 left-1/2 size-12 rounded-full border border-cyan bg-cyan/25"
            style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
          />
        </div>
      )}
    </>
  );
}
