"use client";

import { useEffect, useState } from "react";

const PAD = 6;

/** Pulse ring around a HUD control (`data-onboard` name) while Rover talks about it. Still under reduced motion. */
export function Spotlight({ target, still }: { target: string; still: boolean }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const measure = () => {
      const hud = document.querySelector("[data-testid='hud']");
      const el = [...(hud?.querySelectorAll<HTMLElement>(`[data-onboard="${target}"]`) ?? [])].find((node) => node.getClientRects().length > 0);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    const timer = window.setInterval(measure, 500);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [target]);

  if (!rect) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="onboard-spotlight"
      data-target={target}
      data-motion={still ? "still" : "live"}
      className="pointer-events-none fixed z-30"
      style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
    >
      <span className="absolute inset-0 rounded-[22px] shadow-[0_0_24px_rgb(251_191_36/0.6)] ring-2 ring-amber" />
      {!still && <span className="absolute inset-0 rounded-[22px] ring-2 ring-amber motion-safe:animate-ping" />}
    </div>
  );
}
