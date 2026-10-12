"use client";

import { Suspense, useCallback, useMemo } from "react";
import { openPaperFor } from "@/hud/drawer/paper";
import { useHQStore } from "@/store/useHQStore";
import { FLOOR_COLOR } from "../config";
import { RoadMarkings } from "../fx/RoadMarkings";
import type { ExperienceData, GpuTier } from "../types";
import { NewsroomDecor as PickedDecor } from "./library/decor/NewsroomDecor";
import { buildLibraryLayout } from "./library/layout";
import { libraryLayoutInput, type LibraryZone } from "./library/model";

export interface LibraryLabels {
  /** Zone names from messages (`library.posts`, `library.research`, `library.publications`, `library.talks`). */
  zones: Record<LibraryZone, string>;
}

/**
 * L4 Writing (walkable floors plan, part 3), generated from content: the owner's pick of the three
 * concepts. Stations are point-and-go targets (interact/registry.ts: drive to the door, then open); paper
 * holograms open the paper preview modal.
 */
export function Library({ data, labels, tier }: { data: ExperienceData; labels: LibraryLabels; tier: GpuTier }) {
  const layout = useMemo(() => buildLibraryLayout(libraryLayoutInput(data.library)), [data.library]);
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  const onPaper = useCallback((id: string) => void openPaperFor(data.locale, id), [data.locale]);
  return (
    <group name="library">
      <RoadMarkings network={layout.network} color={FLOOR_COLOR.L4} tier={tier} reducedMotion={reducedMotion} chevronSpacing={5} />
      {/* Text loads fonts asynchronously; the decor waits for them as one piece. */}
      <Suspense fallback={null}>
        <PickedDecor layout={layout} library={data.library} tier={tier} reducedMotion={reducedMotion} zones={labels.zones} onPaper={onPaper} />
      </Suspense>
    </group>
  );
}
