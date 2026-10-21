"use client";

import { useTranslations } from "next-intl";
import type { ExperienceData } from "@/experience/types";
import { useHQStore } from "@/store/useHQStore";
import { FloorButtons } from "./FloorButtons";

/**
 * Right-edge elevator panel (RF to L1); emits elevator intents like every other floor control.
 * Every button names its floor with the Page View nav label (L3 · Work), so first-time visitors
 * know where it goes: a pill with the name on desktop and tablets, the code over a short name on phones, in the same 52 px wide column as before so the swipe area keeps its width.
 * While a room is open the drawer covers the right edge, so the panel falls back to code-only circles
 * (the accessible names stay).
 *
 * The panel sits between two equal spacers in a full-height column, so it stays centred on the screen
 * when there is room. The spacers' minimum heights (`--hq-rail-top`, `--hq-rail-bottom`, measured by
 * `useRailRoom` in `Hud`) keep it clear of the top bar and of the bottom-right corner stack (minimap,
 * settings gear, view controls): on a short screen it rises instead of covering the minimap.
 */
export function ElevatorPanel({ data, compact }: { data: ExperienceData; compact: boolean }) {
  const t = useTranslations("hud");
  const codesOnly = useHQStore((s) => s.phase === "room") && !compact;
  return (
    <div className="pointer-events-none absolute inset-y-0 right-2 flex flex-col items-end md:right-4" data-testid="elevator-column">
      <div aria-hidden="true" className="min-h-[var(--hq-rail-top,0px)] flex-1 basis-0" />
      <nav
        aria-label={t("elevator")}
        className={`glass glass-solid pointer-events-auto flex shrink-0 flex-col ${
          compact ? "items-center gap-0 rounded-[22px] py-0.5" : codesOnly ? "items-center gap-0.5 rounded-full p-1" : "items-stretch gap-0.5 rounded-3xl p-1"
        }`}
        data-testid="elevator-panel"
        data-onboard="elevator"
      >
        <FloorButtons data={data} variant={compact ? "rail-compact" : codesOnly ? "rail-codes" : "rail"} />
      </nav>
      <div aria-hidden="true" className="min-h-[var(--hq-rail-bottom,0px)] flex-1 basis-0" />
    </div>
  );
}
