"use client";

import { useMemo } from "react";
import { useHQStore } from "@/store/useHQStore";
import { useWarmingFloor } from "../scene/warmState";
import type { CareerData, Rect } from "../types";
import { CareerRooms } from "./career/CareerRooms";
import { buildCareerRoad, careerLayoutInput } from "./career/layout";
import { WorkshopAnnex, type WorkshopLabels } from "./career/WorkshopAnnex";
import { YearGates } from "./career/YearGates";

export interface CareerLabels extends WorkshopLabels {
  prologue: string;
  /** Signpost count ("8 rooms"). */
  rooms: (count: number) => string;
}

/** L2 Career Road (walkable floors plan, Part 2), generated from the year groups in the content. */
export function CareerArchive({ career, labs, labels }: { career: CareerData; labs: Rect; labels: CareerLabels }) {
  // About 60 labels are typeset on the main thread, so build the road only once the rover is on L2 or
  // heading there (the drive to the elevator door covers the cost), or while the boot warms its programs.
  const warming = useWarmingFloor() === "L2";
  const shown = useHQStore((s) => s.floor === "L2" || s.ride?.to === "L2");
  const active = shown || warming;
  const tier = useHQStore((s) => s.tier);
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  const layout = useMemo(() => buildCareerRoad(careerLayoutInput(career)), [career]);
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
    // Warmed during boot: mounted for the compile only, never drawn (L2's shell shows in the intro).
    <group name="career-archive" visible={shown}>
      <YearGates layout={layout} prologue={prologue} roomsLabel={labels.rooms} tier={tier} reducedMotion={reducedMotion} />
      <CareerRooms rooms={layout.rooms} entries={entries} trophies={trophies} tier={tier} reducedMotion={reducedMotion} />
      <WorkshopAnnex layout={layout} career={career} labs={labs} labels={labels} />
    </group>
  );
}
