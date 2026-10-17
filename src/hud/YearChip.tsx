"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { buildCareerRoad, careerLayoutInput, placeAt } from "@/experience/floors/career/layout";
import type { CareerData } from "@/experience/types";
import { useHQStore } from "@/store/useHQStore";
import type { HudLayout } from "./layout";

/** Clear of the floor chip and the minimap: under the chip on phones, top center under the top row elsewhere. */
const PLACE: Record<HudLayout, string> = {
  phone: "top-[64px] left-3",
  tablet: "top-[76px] left-1/2 -translate-x-1/2",
  desktop: "top-[84px] left-1/2 -translate-x-1/2",
};

/**
 * "You are here: 2021" while the rover is on the L2 Career Road: the year whose arch it last passed,
 * or the Workshop annex at the road's end. Top center under the top row on tablets and desktops; on
 * phones under the floor chip (the minimap sits top right), hidden while a room is open.
 */
export function YearChip({ career, layout, hidden = false }: { career: CareerData; layout: HudLayout; hidden?: boolean }) {
  const t = useTranslations("hud.career");
  const road = useMemo(() => buildCareerRoad(careerLayoutInput(career)), [career]);
  const place = useHQStore((s) => (s.floor === "L2" && !s.ride ? placeAt(road, s.rover.x) : null));
  if (place === null || hidden) return null;
  return (
    <p
      className={`glass glass-solid pointer-events-none absolute inline-flex min-h-9 items-center gap-2 rounded-full px-4 text-[13px] leading-5 whitespace-nowrap ${PLACE[layout]}`}
      data-testid="year-chip"
      data-place={place}
    >
      <span className="text-ink-2">{t("here")}</span>
      <span className="font-mono font-bold text-amber">{place === "workshop" ? t("workshop") : place}</span>
    </p>
  );
}
