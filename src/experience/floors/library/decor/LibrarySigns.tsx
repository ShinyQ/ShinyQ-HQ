"use client";

import { useMemo, useRef } from "react";
import type { Group } from "three";
import type { RoomId } from "@/content/schema";
import type { GpuTier } from "../../../types";
import { FloatingSigns } from "../../../fx/FloatingSign";
import type { LibraryLayout, LibraryStation, LibraryZone } from "../model";
import { librarySigns } from "./signs";
import { useLibrarySignPlacement } from "./useLibrarySignPlacement";

/**
 * Every L4 timeline sign in one `FloatingSigns` group (two draw calls): one sign per section, the year
 * plates on their low posts and the post titles, shown per frame by the screen placement rule.
 */
export function LibrarySigns({
  layout,
  zones,
  titles,
  titled,
  tier,
  reducedMotion,
}: {
  layout: LibraryLayout;
  zones: Record<LibraryZone, string>;
  titles: Map<RoomId, string>;
  titled: readonly LibraryStation[];
  tier: GpuTier;
  reducedMotion: boolean;
}) {
  const { signs, meta } = useMemo(() => librarySigns({ layout, zones, titles, titled }), [layout, zones, titles, titled]);
  const group = useRef<Group>(null);
  const alpha = useLibrarySignPlacement({ signs, meta, group, reducedMotion });
  return (
    <group ref={group}>
      <FloatingSigns signs={signs} name="library-signs" tier={tier} visibility={alpha} />
    </group>
  );
}
