"use client";

import { Suspense, useCallback, useMemo } from "react";
import { openPaperFor } from "@/hud/drawer/paper";
import { useHQStore } from "@/store/useHQStore";
import { FLOOR_COLOR } from "../config";
import { RoadMarkings } from "../fx/RoadMarkings";
import type { ExperienceData, GpuTier } from "../types";
import { EndPlaza, type EndPlazaLabels } from "./library/decor/EndPlaza";
import { NewsroomDecor as PickedDecor } from "./library/decor/NewsroomDecor";
import { StudyVault } from "./library/decor/StudyVault";
import { TopicHighlights } from "./library/decor/TopicHighlights";
import { buildLibraryLayout } from "./library/layout";
import { libraryLayoutInput, type LibrarySection } from "./library/model";

export interface LibraryLabels {
  /** Zone names from messages (`library.posts`, `library.research`, `library.publications`, `library.talks`). */
  zones: Record<LibrarySection, string>;
  /** End plaza signs: the topic count, the research monument, the archive board (`library.topics`) and the Study Vault. */
  end: EndPlazaLabels;
}

/**
 * L4 Writing (walkable floors plan, part 3), generated from content: the owner's pick of the three
 * concepts. Stations are point-and-go targets (interact/registry.ts: drive to the door, then open); paper
 * holograms open the paper preview modal. The end plaza holds the Topic Constellation, the research
 * monument and the archive board (`EndPlaza`), and a picked topic lights its stations (`TopicHighlights`). With study
 * guides, the Study Vault's books stand off the end plaza (`StudyVault`; their spines are end plaza signs).
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
      {layout.end && (
        <>
          <TopicHighlights layout={layout} tier={tier} />
          {layout.end.vault && <StudyVault vault={layout.end.vault} tier={tier} reducedMotion={reducedMotion} />}
          <Suspense fallback={null}>
            <EndPlaza layout={layout} library={data.library} tier={tier} reducedMotion={reducedMotion} labels={labels.end} />
          </Suspense>
        </>
      )}
    </group>
  );
}
