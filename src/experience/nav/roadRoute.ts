import type { Vec2 } from "../types";
import { findPath, segmentWalkable, type NavGrid } from "./navgrid";
import { pathBetween, ROAD, type RoadGraph, type RoadNetwork } from "./road";

/*
 * Kept apart from the road kit: floor layouts (and through `experience/config` the store, on every
 * page) import `road.ts`, and only the 3D Director needs the navgrid that this module brings in.
 */

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Autopilot route on a floor with a road network: off the road (inside a room or a plaza corner)
 * the rover first reaches the road with the navgrid, then follows the road, then leaves it for
 * the target. Short hops go straight. Falls back to `findPath` when the network has no route.
 */
export function roadRoute(net: RoadNetwork, grid: NavGrid, from: Vec2, to: Vec2, graph?: RoadGraph): Vec2[] | null {
  if (dist(from, to) < ROAD.shortcut && segmentWalkable(grid, from, to)) return [to];
  const road = pathBetween(net, from, to, graph);
  if (!road?.length) return findPath(grid, from, to);
  const out: Vec2[] = [];
  let cursor = from;
  for (const p of road) {
    if (segmentWalkable(grid, cursor, p)) out.push(p);
    else {
      const leg = findPath(grid, cursor, p);
      if (!leg?.length) return findPath(grid, from, to);
      out.push(...leg);
    }
    cursor = out[out.length - 1];
  }
  return out;
}
