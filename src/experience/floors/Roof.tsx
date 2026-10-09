"use client";

import type { GpuTier, RoofData } from "../types";
import { Beacon, CommsTerminals, CvKiosk, type RoofLabels } from "./roof/Comms";
import { Sky } from "./roof/Sky";

export type { RoofLabels };

/** RF Roof (appendix 01 section 6): open sky, beacon, comms terminals and the CV kiosk. */
export function Roof({ roof, labels, tier }: { roof: RoofData; labels: RoofLabels; tier: GpuTier }) {
  return (
    <group name="roof">
      <Sky tier={tier} />
      <Beacon availability={roof.availability} label={labels.beacon} tier={tier} />
      <CommsTerminals roof={roof} labels={labels} />
      <CvKiosk labels={labels} />
    </group>
  );
}
