"use client";

import { useTranslations } from "next-intl";
import type { FloorId } from "@/content/schema";
import { FLOOR_IDS } from "@/experience/config";
import { intents } from "@/experience/input/intents";
import type { ExperienceData } from "@/experience/types";
import { useHQStore } from "@/store/useHQStore";

const ACTIVE: Record<FloorId, string> = {
  L1: "border-green bg-green/15 text-green",
  L2: "border-amber bg-amber/15 text-amber",
  L3: "border-violet bg-violet/15 text-violet",
  L4: "border-white bg-white/15 text-white",
  RF: "border-blue bg-blue/15 text-blue",
};

const TOP_DOWN = [...FLOOR_IDS].reverse();

/**
 * Right-edge elevator panel (RF to L1); emits elevator intents like every other floor control.
 * Every button names its floor with the Page View nav label (L3 · Work), so first-time visitors
 * know where it goes: a pill with the name on desktop and tablets, the code over a short name on phones, in the same 52 px wide column as before so the swipe area keeps its width.
 * While a room is open the drawer covers the right edge, so the panel falls back to code-only circles
 * (the accessible names stay).
 */
export function ElevatorPanel({ data, compact }: { data: ExperienceData; compact: boolean }) {
  const t = useTranslations("hud");
  const floor = useHQStore((s) => s.floor);
  const target = useHQStore((s) => s.ride?.to ?? null);
  const codesOnly = useHQStore((s) => s.phase === "room") && !compact;
  return (
    <nav
      aria-label={t("elevator")}
      className={`glass glass-solid pointer-events-auto absolute top-1/2 right-2 flex -translate-y-1/2 flex-col md:right-4 ${
        compact ? "items-center gap-0 rounded-[22px] p-0.5" : codesOnly ? "items-center gap-0.5 rounded-full p-1" : "items-stretch gap-0.5 rounded-3xl p-1"
      }`}
      data-testid="elevator-panel"
    >
      {TOP_DOWN.map((id) => {
        const current = id === floor;
        const pending = id === target;
        const label = t(`floorLabel.${id}`);
        const tone = current
          ? `${ACTIVE[id]} shadow-[0_0_14px_currentColor]`
          : pending
            ? "animate-pulse border-cyan text-cyan motion-reduce:animate-none"
            : "border-glass-border text-ink-2 group-hover:border-ink-3 group-hover:text-ink";
        return (
          <button
            key={id}
            type="button"
            onClick={() => intents.emit({ type: "elevator", to: id })}
            aria-label={t("goToFloor", {
              floor: id,
              label,
              name: data.floors[id].name,
            })}
            aria-current={current ? "true" : undefined}
            data-floor={id}
            className={
              compact
                ? "group flex min-h-11 w-12 flex-col items-center justify-center gap-0.5 rounded-2xl py-0.5"
                : codesOnly
                  ? "group grid size-11 place-items-center rounded-full"
                  : `group flex min-h-11 items-center gap-2 rounded-full py-0.5 pr-3.5 pl-0.5 text-left transition ${current ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}`
            }
          >
            <span className={`label grid shrink-0 place-items-center rounded-full border transition ${compact ? "size-8" : "size-10"} ${tone}`}>{id}</span>
            {!codesOnly && (
              <span
                aria-hidden="true"
                data-testid="elevator-floor-label"
                className={
                  compact
                    ? `max-w-full truncate text-[9px] leading-3 font-semibold tracking-[-0.01em] ${current ? "text-ink" : "text-ink-3"}`
                    : `text-sm leading-5 font-semibold whitespace-nowrap ${current ? "text-ink" : "text-ink-2 group-hover:text-ink"}`
                }
              >
                {label}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
