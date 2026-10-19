import type { Vec2 } from "../types";
import { findPath, segmentWalkable, type NavGrid } from "./navgrid";
import { buildRoadGraph, onNetwork, pathBetween, projectOnSegment, ROAD, type RoadGraph, type RoadNetwork } from "./road";

/*
 * Kept apart from the road kit: floor layouts (and through `experience/config` the store, on every
 * page) import `road.ts`, and only the 3D Director needs the navgrid that this module brings in.
 */

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

const partsCache = new WeakMap<RoadGraph, Int32Array>();

/** The connected part of every graph node, labelled by its first node (cached per graph). */
function partLabels(g: RoadGraph): Int32Array {
  let label = partsCache.get(g);
  if (label) return label;
  label = new Int32Array(g.nodes.length).fill(-1);
  for (let s = 0; s < label.length; s++) {
    if (label[s] >= 0) continue;
    label[s] = s;
    const stack = [s];
    while (stack.length)
      for (const { to } of g.adj[stack.pop()!])
        if (label[to] < 0) {
          label[to] = s;
          stack.push(to);
        }
  }
  partsCache.set(g, label);
  return label;
}

/** Nearest point to `p` on the graph's centerlines (on part `part` only, when given), and that edge's part. */
function nearestOn(g: RoadGraph, p: Vec2, part = -1): { point: Vec2; part: number } {
  const label = partLabels(g);
  let best = { point: p, part };
  let d = Infinity;
  for (const [a, b] of g.edges) {
    if (part >= 0 && label[a] !== part) continue;
    const pr = projectOnSegment(p, g.nodes[a], g.nodes[b]);
    if (pr.distance < d) {
      d = pr.distance;
      best = { point: pr.point, part: label[a] };
    }
  }
  return best;
}

/**
 * Road waypoints on a network in parts that do not touch (L1: the hall road and the office wing road), where
 * `pathBetween` finds no route. Each end on the network keeps to its own part; a drive between two parts leaves
 * the first where it comes nearest the target and joins the second at its nearest point (the navgrid crosses the
 * floor between them). An end off the network only joins the other end's part.
 */
function partsPath(net: RoadNetwork, g: RoadGraph, from: Vec2, to: Vec2): Vec2[] | null {
  if (!g.edges.length) return null;
  const a = nearestOn(g, from).part;
  const fromOn = onNetwork(net, from);
  const exit = fromOn ? nearestOn(g, to, a).point : from;
  if (fromOn && !onNetwork(net, to)) return [...(pathBetween(net, from, exit, g) ?? []), to];
  const join = nearestOn(g, exit, nearestOn(g, to).part).point;
  return [...(fromOn ? (pathBetween(net, from, exit, g) ?? []) : []), join, ...(pathBetween(net, join, to, g) ?? [])];
}

/**
 * Autopilot route on a floor with a road network: off the road (inside a room or a plaza corner)
 * the rover first reaches the road with the navgrid, then follows the road, then leaves it for
 * the target. Short hops go straight. Falls back to `findPath` when the network has no route.
 */
export function roadRoute(net: RoadNetwork, grid: NavGrid, from: Vec2, to: Vec2, graph: RoadGraph = buildRoadGraph(net)): Vec2[] | null {
  if (dist(from, to) < ROAD.shortcut && segmentWalkable(grid, from, to)) return [to];
  const road = pathBetween(net, from, to, graph) ?? partsPath(net, graph, from, to);
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
