"use client";

import { useMemo, useRef } from "react";
import type { Group } from "three";
import { phoneCamera } from "@/lib/viewport";
import { useHQStore } from "@/store/useHQStore";
import type { GpuTier } from "../../../types";
import { FloatingSigns } from "../../../fx/FloatingSign";
import type { LibraryLayout, LibrarySection } from "../model";
import { librarySigns } from "./signs";
import { useLibrarySignPlacement } from "./useLibrarySignPlacement";

/**
 * Every L4 timeline sign in one `FloatingSigns` group (two draw calls): one sign per section, each bay's track
 * name and lead title, and a title per spine, shown per frame by the screen placement rule (a spine title only
 * while its spine is pulled or its topic picked). Signs hidden for 30 frames leave the text batch (`dropHidden`),
 * so off-screen titles cost no triangles.
 */
export function LibrarySigns({
  layout,
  zones,
  titles,
  tracks,
  tier,
  reducedMotion,
}: {
  layout: LibraryLayout;
  zones: Record<LibrarySection, string>;
  /** Post titles by post slug. */
  titles: Map<string, string>;
  /** Track names by track slug. */
  tracks: Map<string, string>;
  tier: GpuTier;
  reducedMotion: boolean;
}) {
  const phone = useHQStore((s) => phoneCamera(s.device.camera));
  const { signs, meta } = useMemo(() => librarySigns({ layout, zones, titles, tracks, phone }), [layout, zones, titles, tracks, phone]);
  const group = useRef<Group>(null);
  const alpha = useLibrarySignPlacement({ signs, meta, group, reducedMotion });
  return (
    <group ref={group}>
      <FloatingSigns signs={signs} name="library-signs" tier={tier} visibility={alpha} dropHidden={30} />
    </group>
  );
}
