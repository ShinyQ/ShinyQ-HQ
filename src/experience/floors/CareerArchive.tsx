"use client";

import { useMemo } from "react";
import { useHQStore } from "@/store/useHQStore";
import type { CareerData, Rect } from "../types";
import { CareerRooms } from "./career/CareerRooms";
import { buildCorridor, careerLayoutInput } from "./career/layout";
import { WorkshopAnnex, type WorkshopLabels } from "./career/WorkshopAnnex";
import { YearGates } from "./career/YearGates";

export interface CareerLabels extends WorkshopLabels {
  prologue: string;
}

/** L2 Career Archive (appendix 01 section 3), generated from the year groups in the content. */
export function CareerArchive({ career, labs, labels }: { career: CareerData; labs: Rect; labels: CareerLabels }) {
  // About 60 labels are typeset on the main thread, so build the corridor only once the rover is on L2 or
  // heading there (the drive to the elevator door covers the cost), not while the Lobby intro plays.
  const active = useHQStore((s) => s.floor === "L2" || s.ride?.to === "L2");
  const corridor = useMemo(() => buildCorridor(careerLayoutInput(career)), [career]);
  const entries = useMemo(() => new Map(career.years.flatMap((y) => y.entries.map((e) => [e.slug, e] as const))), [career]);
  const trophies = useMemo(
    () => new Map(career.years.flatMap((y) => y.entries.filter((e) => e.type === "award").map((e) => [e.slug, y.awards] as const))),
    [career],
  );
  const prologue = useMemo(() => {
    const first = career.years[0]?.entries.find((e) => e.prologue);
    return first ? `${labels.prologue.toUpperCase()} \u00B7 ${first.period}` : null;
  }, [career, labels.prologue]);

  if (!active) return null;
  return (
    <group name="career-archive">
      <YearGates corridor={corridor} prologue={prologue} />
      <CareerRooms rooms={corridor.rooms} entries={entries} trophies={trophies} />
      <WorkshopAnnex corridor={corridor} career={career} labs={labs} labels={labels} />
    </group>
  );
}
