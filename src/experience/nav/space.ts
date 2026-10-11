import type { DoorTrigger, Rect, Vec2 } from "../types";
import { distanceToRect } from "./collision";
import { buildNavGrid, isWalkable, type NavGrid } from "./navgrid";
import { inPlaza, projectOnSegment, ROAD, roadSegments, type RoadNetwork } from "./road";

/**
 * Space rules for walkable floors (owner decision: roomy roads, open plazas, no hidden rooms). Pure,
 * so every floor layout can assert them in a unit test (`expectSpaceRules` in tests/helpers/space.ts):
 *
 * - every road is at least 8 u wide and every plaza at least 16 u across;
 * - roads keep their whole width clear of obstacles, spurs keep the rover's radius clear;
 * - at least 6 u of clear floor around every obstacle: two obstacles (or an obstacle and the slab
 *   edge) either touch or leave 6 u between them, so no sliver of floor traps the rover;
 * - every door has a spur from the road (or a plaza) ending on its pad;
 * - no door is reachable only through a gap narrower than 6 u: floor that is 6 u wide (a rover
 *   circle of 3 u) connects the start to within 4 u of every pad.
 */

export interface SpaceInput {
  bounds: Rect;
  obstacles: readonly Rect[];
  doors: readonly DoorTrigger[];
  network: RoadNetwork;
  /** Where visitors arrive (the elevator approach). */
  start: Vec2;
}

export interface SpaceRules {
  roadWidth: number;
  plaza: number;
  clear: number;
  doorReach: number;
  /** Clearance a spur keeps from obstacles (the rover radius). */
  spurClear: number;
}

export const SPACE_RULES: SpaceRules = {
  roadWidth: ROAD.minWidth,
  plaza: ROAD.minPlaza,
  clear: ROAD.minClear,
  doorReach: ROAD.doorReach,
  spurClear: 1,
};

export type SpaceRule = "road-width" | "plaza-size" | "road-blocked" | "spur-blocked" | "obstacle-gap" | "bounds-gap" | "door-spur" | "spur-detached" | "door-gap";

export interface SpaceViolation {
  rule: SpaceRule;
  detail: string;
}

const EPS = 1e-6;
const fmt = (v: number) => v.toFixed(2);
const rectLabel = (r: Rect) => `[${fmt(r.minX)}..${fmt(r.maxX)} x ${fmt(r.minZ)}..${fmt(r.maxZ)}]`;

/** Shortest distance between two rectangles (0 when they touch or overlap). */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dz = Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ);
  return Math.hypot(dx, dz);
}

/** Samples along a segment every `step` u (both ends included). */
function samples(a: Vec2, b: Vec2, step = 0.5): Vec2[] {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n }));
}

/** Navgrid that only admits floor at least `clear` wide (a rover circle of clear / 2). */
export function wideGrid(input: Pick<SpaceInput, "bounds" | "obstacles">, clear = SPACE_RULES.clear): NavGrid {
  return buildNavGrid(input, clear / 2, 0.5);
}

function flood(g: NavGrid, start: Vec2): Uint8Array {
  const seen = new Uint8Array(g.walkable.length);
  const startIdx = (() => {
    let best = -1;
    let bestD = Infinity;
    for (let idx = 0; idx < g.walkable.length; idx++) {
      if (!g.walkable[idx]) continue;
      const x = g.minX + ((idx % g.cols) + 0.5) * g.cell;
      const z = g.minZ + (Math.floor(idx / g.cols) + 0.5) * g.cell;
      const d = Math.hypot(x - start.x, z - start.z);
      if (d < bestD) {
        bestD = d;
        best = idx;
      }
    }
    return bestD <= g.cell * 2 ? best : -1;
  })();
  if (startIdx < 0) return seen;
  const queue = [startIdx];
  seen[startIdx] = 1;
  for (let q = 0; q < queue.length; q++) {
    const idx = queue[q];
    const i = idx % g.cols;
    const j = Math.floor(idx / g.cols);
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= g.cols || nj >= g.rows) continue;
      const n = nj * g.cols + ni;
      if (g.walkable[n] && !seen[n]) {
        seen[n] = 1;
        queue.push(n);
      }
    }
  }
  return seen;
}

/** Every violated space rule (empty when the layout is roomy enough). */
export function spaceViolations(input: SpaceInput, rules: SpaceRules = SPACE_RULES): SpaceViolation[] {
  const out: SpaceViolation[] = [];
  const { bounds, obstacles, doors, network } = input;

  for (const road of network.roads) {
    if (road.width < rules.roadWidth - EPS) out.push({ rule: "road-width", detail: `road ${road.id} is ${fmt(road.width)} u wide (min ${rules.roadWidth})` });
    const half = road.width / 2;
    for (const [a, b] of roadSegments(road)) {
      for (const p of samples(a, b)) {
        const hit = obstacles.find((o) => distanceToRect(p, o) < half - EPS);
        if (hit) {
          out.push({ rule: "road-blocked", detail: `road ${road.id} at (${fmt(p.x)}, ${fmt(p.z)}) runs into obstacle ${rectLabel(hit)}` });
          break;
        }
      }
    }
  }

  for (const plaza of network.plazas) {
    if (Math.min(plaza.w, plaza.d) < rules.plaza - EPS) out.push({ rule: "plaza-size", detail: `plaza ${plaza.id} is ${fmt(plaza.w)} x ${fmt(plaza.d)} u (min ${rules.plaza})` });
  }

  for (const spur of network.spurs) {
    for (const p of samples(spur.from, spur.to)) {
      const hit = obstacles.find((o) => distanceToRect(p, o) < rules.spurClear - EPS);
      if (hit) {
        out.push({ rule: "spur-blocked", detail: `spur to ${spur.room} at (${fmt(p.x)}, ${fmt(p.z)}) runs into obstacle ${rectLabel(hit)}` });
        break;
      }
    }
    const onRoad = network.roads.some((r) => roadSegments(r).some(([a, b]) => projectOnSegment(spur.from, a, b).distance <= r.width / 2 + EPS));
    if (!onRoad && !network.plazas.some((pl) => inPlaza(pl, spur.from))) {
      out.push({ rule: "spur-detached", detail: `spur to ${spur.room} starts off the road at (${fmt(spur.from.x)}, ${fmt(spur.from.z)})` });
    }
  }

  for (let i = 0; i < obstacles.length; i++) {
    for (let j = i + 1; j < obstacles.length; j++) {
      const gap = rectGap(obstacles[i], obstacles[j]);
      if (gap > EPS && gap < rules.clear - EPS)
        out.push({ rule: "obstacle-gap", detail: `${fmt(gap)} u between ${rectLabel(obstacles[i])} and ${rectLabel(obstacles[j])}` });
    }
    const o = obstacles[i];
    const edges = [o.minX - bounds.minX, bounds.maxX - o.maxX, o.minZ - bounds.minZ, bounds.maxZ - o.maxZ];
    const tight = edges.find((d) => d > EPS && d < rules.clear - EPS);
    if (tight !== undefined) out.push({ rule: "bounds-gap", detail: `${fmt(tight)} u between ${rectLabel(o)} and the slab edge` });
  }

  for (const door of doors) {
    const spur = network.spurs.find((s) => s.room === door.room);
    if (!spur || Math.hypot(spur.to.x - door.at.x, spur.to.z - door.at.z) > 0.5) out.push({ rule: "door-spur", detail: `door ${door.room} has no spur ending on its pad` });
  }

  const grid = wideGrid(input, rules.clear);
  const reach = flood(grid, input.start);
  const reachable = (p: Vec2) => {
    const r = rules.doorReach;
    for (let x = p.x - r; x <= p.x + r + EPS; x += grid.cell) {
      for (let z = p.z - r; z <= p.z + r + EPS; z += grid.cell) {
        if (Math.hypot(x - p.x, z - p.z) > r) continue;
        const i = Math.floor((x - grid.minX) / grid.cell);
        const j = Math.floor((z - grid.minZ) / grid.cell);
        if (i < 0 || j < 0 || i >= grid.cols || j >= grid.rows) continue;
        if (reach[j * grid.cols + i]) return true;
      }
    }
    return false;
  };
  if (!isWalkable(grid, input.start) && !reach.some(Boolean)) out.push({ rule: "door-gap", detail: `start (${fmt(input.start.x)}, ${fmt(input.start.z)}) has no 6 u wide floor around it` });
  else
    for (const door of doors) {
      if (!reachable(door.at)) out.push({ rule: "door-gap", detail: `door ${door.room} is only reachable through a gap narrower than ${rules.clear} u` });
    }

  return out;
}

