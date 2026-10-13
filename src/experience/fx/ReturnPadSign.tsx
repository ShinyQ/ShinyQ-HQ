"use client";

import { useMemo } from "react";
import { returnSign } from "../nav/fastReturn";
import type { GpuTier, Vec2 } from "../types";
import { FloatingSigns } from "./FloatingSign";

/**
 * The floating "Back to elevator" sign over a floor's Express Return pad (fast return): one
 * `FloatingSigns` group (two draw calls while the rover is within the label fade range along x, none
 * beyond it). The pad disc and icon are part of `PadGlow`.
 */
export function ReturnPadSign({ at, label, tier }: { at: Vec2; label: string; tier: GpuTier }) {
  const signs = useMemo(() => [returnSign(at, label)], [at, label]);
  return <FloatingSigns signs={signs} name="return-pad-sign" tier={tier} />;
}
