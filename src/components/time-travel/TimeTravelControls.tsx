"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MOTION_ATTR } from "@/lib/motion";
import { prefersReducedMotion } from "@/lib/reduced-motion";

export interface TimeTravelLabels {
  slider: string;
  play: string;
  pause: string;
  /** One label per stop, in order ("Before 2019", "2019", ...). */
  stops: readonly string[];
}

/** Time per stop while playing, the building rise and the panel fade (spec section 5). */
export const STEP_MS = 2500;
export const RISE_MS = 600;
export const FADE_MS = 400;
const GHOST = "0.15";
/** Same value as `STILL_ATTR` in @/lib/boot-first, inlined so the island does not pull that module into the client chunk. */
const STILL_ATTR = "data-hq-still";

/** True under the reduced Motion setting (or the OS setting when the site has none) and under automation. */
export function animationsOff(html: HTMLElement = document.documentElement): boolean {
  if (html.hasAttribute(STILL_ATTR)) return true;
  const motion = html.getAttribute(MOTION_ATTR);
  if (motion === "reduced") return true;
  if (motion === "full") return false;
  return prefersReducedMotion();
}

/** Shows one stop: its panel, lit buildings up to it, ghosts after it, its outline; the rise and fade when animated. */
export function showStop(root: HTMLElement, index: number, animate: boolean) {
  root.querySelectorAll<HTMLElement>("[data-tt-panel]").forEach((panel, i) => {
    panel.hidden = i !== index;
    if (i === index && animate) panel.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: "ease-out" });
  });
  root.querySelectorAll<SVGGElement>("[data-tt-stop]").forEach((g, i) => {
    g.setAttribute("opacity", i <= index ? "1" : GHOST);
    if (i === index && animate) g.animate?.([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: RISE_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
  });
  root.querySelectorAll<SVGRectElement>("[data-tt-outline]").forEach((r, i) => r.setAttribute("visibility", i === index ? "visible" : "hidden"));
}

/** Keys that move a range; each one stops Play even when the value cannot change (Home at the first stop). */
const SLIDER_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

const subscribeNever = () => () => {};

/**
 * The Time Travel controls: a range over the stops and Play. Renders nothing until mounted, so a visitor without JS
 * never sees dead controls (the server view stays on now, with building links to the year rows).
 */
export function TimeTravelControls({ rootId, labels }: { rootId: string; labels: TimeTravelLabels }) {
  const last = labels.stops.length - 1;
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [index, setIndex] = useState(last);
  const [playing, setPlaying] = useState(false);
  const [announce, setAnnounce] = useState("");
  const root = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const select = useCallback(
    (next: number, animate: boolean) => {
      const el = root.current;
      if (!el) return;
      setIndex(next);
      setAnnounce(labels.stops[next]);
      showStop(el, next, animate && !animationsOff());
    },
    [labels.stops],
  );

  const halt = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    setPlaying(false);
  }, []);

  useEffect(() => {
    root.current = document.getElementById(rootId);
    return () => window.clearTimeout(timer.current);
  }, [rootId]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("[data-tt-link]");
      if (!link || !el.contains(link)) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      halt();
      select(Number(link.getAttribute("data-tt-link")), true);
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [mounted, halt, select]);

  // Each tick schedules the next itself, so a long clock jump still advances one stop per step.
  const schedule = useCallback(
    (from: number) => {
      const tick = (at: number) => {
        timer.current = window.setTimeout(() => {
          select(at + 1, true);
          if (at + 1 >= last) setPlaying(false);
          else tick(at + 1);
        }, STEP_MS);
      };
      tick(from);
    },
    [last, select],
  );

  const togglePlay = () => {
    if (playing) return halt();
    let from = index;
    if (index >= last) {
      from = 0;
      select(0, true);
    }
    setPlaying(true);
    schedule(from);
  };

  if (!mounted) return null;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <button type="button" className="chip min-h-11" onClick={togglePlay}>
        {playing ? labels.pause : labels.play}
      </button>
      <input
        type="range"
        min={0}
        max={last}
        step={1}
        value={index}
        aria-label={labels.slider}
        aria-valuetext={labels.stops[index]}
        onPointerDown={halt}
        onKeyDown={(event) => {
          if (SLIDER_KEYS.has(event.key)) halt();
        }}
        onChange={(event) => {
          halt();
          select(Number(event.currentTarget.value), true);
        }}
        className="min-h-11 min-w-0 flex-1"
      />
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
    </div>
  );
}
