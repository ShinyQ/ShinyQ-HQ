"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { buildCareerRoad, careerLayoutInput, placeAt } from "@/experience/floors/career/layout";
import type { CareerData } from "@/experience/types";
import { useHQStore } from "@/store/useHQStore";

/**
 * "You are here: 2021" while the rover is on the L2 Career Road: the year whose arch it last passed,
 * or the Workshop annex at the road's end. Top center under the controls row (the top bar reaches the
 * middle on tablets); on phones below the menu row and the Classic site row, hidden while a room is open.
 */
export function YearChip({ career, mobile, hidden = false }: { career: CareerData; mobile: boolean; hidden?: boolean }) {
  const t = useTranslations("hud.career");
  const layout = useMemo(() => buildCareerRoad(careerLayoutInput(career)), [career]);
  const place = useHQStore((s) => (s.floor === "L2" && !s.ride ? placeAt(layout, s.rover.x) : null));
  if (place === null || hidden) return null;
  return (
    <p
      className={`glass glass-solid pointer-events-none absolute left-1/2 inline-flex min-h-9 -translate-x-1/2 items-center gap-2 rounded-full px-4 text-[13px] leading-5 whitespace-nowrap ${
        mobile ? "top-[120px]" : "top-[84px]"
      }`}
      data-testid="year-chip"
      data-place={place}
    >
      <span className="text-ink-2">{t("here")}</span>
      <span className="font-mono font-bold text-amber">{place === "workshop" ? t("workshop") : place}</span>
    </p>
  );
}
