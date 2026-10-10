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

/** Right-edge elevator panel (RF to L1); emits elevator intents like every other floor control. */
export function ElevatorPanel({ data, compact }: { data: ExperienceData; compact: boolean }) {
  const t = useTranslations("hud");
  const floor = useHQStore((s) => s.floor);
  const target = useHQStore((s) => s.ride?.to ?? null);
  return (
    <nav
      aria-label={t("elevator")}
      className="glass glass-solid pointer-events-auto absolute top-1/2 right-2 flex -translate-y-1/2 flex-col items-center gap-0.5 rounded-full p-1 md:right-4"
      data-testid="elevator-panel"
    >
      {TOP_DOWN.map((id) => {
        const current = id === floor;
        const pending = id === target;
        return (
          <button
            key={id}
            type="button"
            onClick={() => intents.emit({ type: "elevator", to: id })}
            aria-label={t("goToFloor", { floor: id, name: data.floors[id].name })}
            aria-current={current ? "true" : undefined}
            data-floor={id}
            className="group grid size-11 place-items-center rounded-full"
          >
            <span
              className={`label grid place-items-center rounded-full border transition ${compact ? "size-9" : "size-10"} ${
                current
                  ? `${ACTIVE[id]} shadow-[0_0_14px_currentColor]`
                  : pending
                    ? "animate-pulse border-cyan text-cyan motion-reduce:animate-none"
                    : "border-glass-border text-ink-2 group-hover:border-ink-3 group-hover:text-ink"
              }`}
            >
              {id}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
