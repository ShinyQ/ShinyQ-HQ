"use client";

import { useTranslations } from "next-intl";
import { useHQStore } from "@/store/useHQStore";
import { officeReplay } from "./replayLink";
import { officeRuntime } from "./runtime";

/** The pill's clock element, its width with the gap and the next clock and width check (scene seconds); its element is `officeRuntime.pill`. */
const pill = { time: null as HTMLElement | null, w: 0, next: 0 };

/** What the scene reaches while a replay plays (`officeReplay.ui`, set by the replay chunk): the pill component and its width. */
export interface ReplayUi {
  Pill: typeof Pill;
  /** The pill's width plus `gap` (px) while `show`, else 0; the clock text and the width refresh twice a second (`now`: scene seconds). The scene places it (`officeRuntime.pill`). */
  width(show: boolean, now: number, gap: number): number;
}

const mount = (el: HTMLElement | null) => {
  officeRuntime.pill = el;
  Object.assign(pill, { time: el && el.lastElementChild, next: 0 });
};

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
      style={{ visibility: "hidden", fontVariantNumeric: "tabular-nums" }}
    >
      {!phone && `${t("3d.replay.pill")} ·\u00a0`}
      <span>{officeReplay.state.clock}</span>
    </span>
  );
}

export const replayUi: ReplayUi = {
  Pill,
  width(show, now, gap) {
    const { pill: el } = officeRuntime;
    if (!el || !show) return 0;
    if (now >= pill.next) {
      pill.next = now + 0.5;
      pill.time!.textContent = officeReplay.state.clock;
      pill.w = el.offsetWidth + gap;
    }
    return pill.w;
  },
};
