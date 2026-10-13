"use client";

import { Suspense, useMemo } from "react";
import { useHQStore } from "@/store/useHQStore";
import { RoadMarkings } from "../fx/RoadMarkings";
import type { ExperienceData, GpuTier } from "../types";
import type { RoofLabels } from "./roof/kit";
import { buildRoofLayout, ROOF_DECK, roofActive } from "./roof/layout";
import { SignalGarden as Scenery } from "./roof/SignalGarden";
import { Sky } from "./roof/Sky";
import { VisitsStation } from "./roof/VisitsStation";

export type { RoofLabels };

/** RF roof deck (RF revamp): road, plaza and stations from `buildRoofLayout`, dressed by the owner's picked scenery. */
export function Roof({ data, labels, tier }: { data: ExperienceData; labels: RoofLabels; tier: GpuTier }) {
  const layout = useMemo(() => buildRoofLayout({ channels: data.roof.channels.length }), [data.roof.channels.length]);
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  const active = useHQStore((s) => roofActive(s.phase, s.activeRoom));
  return (
    <group name="roof">
      <RoadMarkings network={layout.network} color={ROOF_DECK.accent} tier={tier} reducedMotion={reducedMotion} />
      <Sky tier={tier} />
      {/* Text loads fonts asynchronously; keep it from holding back the geometry. */}
      <Suspense fallback={null}>
        <Scenery layout={layout} roof={data.roof} profile={data.profile} labels={labels} tier={tier} reducedMotion={reducedMotion} active={active} />
        <VisitsStation layout={layout} labels={labels.observatory} locale={data.locale} tier={tier} reducedMotion={reducedMotion} active={active === "visits"} />
      </Suspense>
    </group>
  );
}
