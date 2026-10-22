"use client";

import { useTranslations } from "next-intl";
import { useHQStore } from "@/store/useHQStore";
import { officeReplay } from "./replayLink";

/** The pill's element, its clock element, its width with the gap, the next clock and width check (scene seconds), its last x (px) and whether it shows. */
const pill = { el: null as HTMLElement | null, time: null as HTMLElement | null, w: 0, next: 0, x: NaN, on: false };

/** What the scene reaches while a replay plays (`officeReplay.ui`, set by the replay chunk): the pill component and its placement. */
export interface ReplayUi {
  Pill: typeof Pill;
  /** The pill's width plus `gap` (px) while `show`, else 0 (and hidden); the clock text and the width refresh twice a second (`now`: scene seconds). */
  width(show: boolean, now: number, gap: number): number;
  /** Places the pill at `x`, `y` (px; NaN hides it), writing a style only when it changes. */
  at(x: number, y: number): void;
}

const mount = (el: HTMLElement | null) => void Object.assign(pill, { el, time: el && el.lastElementChild, next: 0, x: NaN, on: false });

/** The replay pill leading the chip row: "Replay · 14:05" (a phone's row has room for the clock alone). `OfficeWatch` places it and writes the clock, no React render per tick. */
function Pill() {
  const t = useTranslations("office");
  const phone = useHQStore((s) => s.device.viewport === "mobile");
  return (
    <span
      ref={mount}
      aria-hidden="true"
      data-testid="office-replay-pill"
      className="glass glass-solid pointer-events-none absolute top-0 left-0 inline-flex min-h-8 items-center rounded-full px-2.5 text-[13px] text-ink will-change-transform"
      style={{ opacity: 0, visibility: "hidden", fontVariantNumeric: "tabular-nums" }}
    >
      {!phone && `${t("3d.replay.pill")} · `}
      <span>{officeReplay.state.clock}</span>
    </span>
  );
}

export const replayUi: ReplayUi = {
  Pill,
  width(show, now, gap) {
    if (!show) replayUi.at(NaN, 0);
    if (!pill.el || !show) return 0;
    if (now >= pill.next) {
      pill.next = now + 0.5;
      pill.time!.textContent = officeReplay.state.clock;
      pill.w = pill.el.offsetWidth + gap;
    }
    return pill.w;
  },
  at(x, y) {
    const { el } = pill;
    const on = x === x;
    if (!el) return;
    if (on && pill.x !== x) {
      pill.x = x;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
    if (on !== pill.on) {
      pill.on = on;
      el.style.visibility = on ? "visible" : "hidden";
      el.style.opacity = on ? "1" : "0";
    }
  },
};
