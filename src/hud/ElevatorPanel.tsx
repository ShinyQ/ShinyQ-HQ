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
 */
export function ElevatorPanel({ data, compact }: { data: ExperienceData; compact: boolean }) {
  const t = useTranslations("hud");
  const codesOnly = useHQStore((s) => s.phase === "room") && !compact;
  return (
    <nav
      aria-label={t("elevator")}
      className={`glass glass-solid pointer-events-auto absolute top-1/2 right-2 flex -translate-y-1/2 flex-col md:right-4 ${
        compact ? "items-center gap-0 rounded-[22px] py-0.5" : codesOnly ? "items-center gap-0.5 rounded-full p-1" : "items-stretch gap-0.5 rounded-3xl p-1"
      }`}
      data-testid="elevator-panel"
      data-onboard="elevator"
    >
      <FloorButtons data={data} variant={compact ? "rail-compact" : codesOnly ? "rail-codes" : "rail"} />
    </nav>
  );
}
