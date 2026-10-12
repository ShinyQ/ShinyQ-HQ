import type { FloorId } from "@/content/schema";
import { buildExperienceData } from "@/content/experience";
import { buildFloorLayouts } from "@/experience/config";
import { careerLayoutInput } from "@/experience/floors/career/layout";
import { libraryLayoutInput } from "@/experience/floors/library/model";
import type { NavGrid } from "@/experience/nav/navgrid";
import type { FloorLayout, Vec2 } from "@/experience/types";

/** The floor layouts the 3D chunk builds from the real content (as in Experience.tsx). */
export function realLayouts(): Record<FloorId, FloorLayout> {
  const data = buildExperienceData("en", { L1: "", L2: "", L3: "", L4: "", RF: "" });
  return buildFloorLayouts(data.years.length, { labs: data.labs.pods, career: careerLayoutInput(data.career), library: libraryLayoutInput(data.library) });
}

/** The walkable cell center farthest (in a straight line) from `from`: the worst autopilot target on a floor. */
export function farthestWalkable(g: NavGrid, from: Vec2): Vec2 {
  let best: Vec2 = { x: from.x, z: from.z };
  let bestD = -1;
  for (let idx = 0; idx < g.walkable.length; idx++) {
    if (!g.walkable[idx]) continue;
    const x = g.minX + ((idx % g.cols) + 0.5) * g.cell;
    const z = g.minZ + (Math.floor(idx / g.cols) + 0.5) * g.cell;
    const d = (x - from.x) ** 2 + (z - from.z) ** 2;
    if (d > bestD) {
      bestD = d;
      best = { x, z };
    }
  }
  return best;
}
