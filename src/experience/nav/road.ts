import type { RoomId } from "@/content/schema";
import type { Rect, Vec2 } from "../types";

/**
 * Road kit for walkable floors (L2 Career Road, L3 Project Roads). Pure: no React or three, so
 * Vitest runs it in node. A floor's network is a set of polyline roads with a width, plazas (open
 * areas on a road) and spurs (short branches from a road to a door pad). The network is drawn by
 * `RoadMarkings.tsx`, checked by the space rules (`space.ts`) and followed by the autopilot
 * (`roadRoute`).
 */

/** Space rules and default sizes (owner decision: roomy roads with open plazas). */
export const ROAD = {
  /** Main road width (u). */
  minWidth: 8,
  /** Smallest plaza side or diameter (u). */
  minPlaza: 16,
  /** Clear floor kept around every obstacle and in every gap that leads to a door (u). */
  minClear: 6,
  /** Default spur width (u): wider than the rover, narrower than the road. */
  spurWidth: 3,
  /** A door counts as reachable when wide-open floor (minClear) comes within this distance of its pad. */
  doorReach: 4,
  /** Straight drives shorter than this skip the road (the rover is already next to its target). */
  shortcut: 3,
} as const;

/** A polyline road. Points run "forward" (forward in time on L2, away from the hub on L3); chevrons point that way. */
export interface Road {
  id: string;
  points: Vec2[];
  width: number;
  /** Closed loop: the last point joins the first. */
  closed?: boolean;
}

/** An open area on the network, centered on (or next to) a road. `round` plazas are ellipses w x d. */
export interface Plaza {
  id: string;
  center: Vec2;
  w: number;
  d: number;
  round?: boolean;
}

/** A short branch from a road (or plaza) to a door pad. `to` is the door trigger center (`DoorTrigger.at`). */
export interface Spur {
  room: RoomId;
  from: Vec2;
  to: Vec2;
  width?: number;
  /** Stub color (room type or wing tint). */
  color?: string;
}

export interface RoadNetwork {
  roads: Road[];
  plazas: Plaza[];
  spurs: Spur[];
  /** Forward chevrons on the roads (default true). L3 turns them off (owner request 2026-10-13). */
  chevrons?: boolean;
}

export interface Projection {
  point: Vec2;
  distance: number;
  /** Arc length along the road. */
  s: number;
  segment: number;
}

const EPS = 1e-6;
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/** Segments of a road, including the closing one for loops. */
export function roadSegments(road: Road): [Vec2, Vec2][] {
  const pts = road.points;
  const out: [Vec2, Vec2][] = [];
  for (let i = 0; i < pts.length - 1; i++) out.push([pts[i], pts[i + 1]]);
  if (road.closed && pts.length > 2) out.push([pts[pts.length - 1], pts[0]]);
  return out;
}

export function roadLength(road: Road): number {
  return roadSegments(road).reduce((sum, [a, b]) => sum + dist(a, b), 0);
}

export function projectOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number; distance: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 < EPS ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
  const point = { x: a.x + dx * t, z: a.z + dz * t };
  return { point, t, distance: dist(p, point) };
}

/** Nearest point on the road's centerline. */
export function projectOnRoad(road: Road, p: Vec2): Projection {
  let best: Projection = { point: road.points[0], distance: Infinity, s: 0, segment: 0 };
  let s = 0;
  roadSegments(road).forEach(([a, b], i) => {
    const pr = projectOnSegment(p, a, b);
    const len = dist(a, b);
    if (pr.distance < best.distance - EPS) best = { point: pr.point, distance: pr.distance, s: s + pr.t * len, segment: i };
    s += len;
  });
  return best;
}

/** Point and unit forward direction at arc length `s` (clamped; wraps on loops). */
export function sampleRoad(road: Road, s: number): { point: Vec2; dir: Vec2 } {
  const segs = roadSegments(road);
  const total = roadLength(road);
  let d = road.closed && total > 0 ? ((s % total) + total) % total : Math.max(0, Math.min(total, s));
  for (let i = 0; i < segs.length; i++) {
    const [a, b] = segs[i];
    const len = dist(a, b);
    if (d <= len || i === segs.length - 1) {
      const t = len > EPS ? Math.min(1, d / len) : 0;
      const dir = len > EPS ? { x: (b.x - a.x) / len, z: (b.z - a.z) / len } : { x: 1, z: 0 };
      return { point: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, dir };
    }
    d -= len;
  }
  const [a, b] = segs[segs.length - 1] ?? [road.points[0], road.points[0]];
  const len = dist(a, b) || 1;
  return { point: b, dir: { x: (b.x - a.x) / len, z: (b.z - a.z) / len } };
}

export function inPlaza(plaza: Plaza, p: Vec2, margin = 0): boolean {
  const hw = plaza.w / 2 + margin;
  const hd = plaza.d / 2 + margin;
  const dx = p.x - plaza.center.x;
  const dz = p.z - plaza.center.z;
  if (plaza.round) return (dx * dx) / (hw * hw) + (dz * dz) / (hd * hd) <= 1 + EPS;
  return Math.abs(dx) <= hw + EPS && Math.abs(dz) <= hd + EPS;
}

/** Whether `p` is on a road strip, a plaza or a spur strip. */
export function onNetwork(net: RoadNetwork, p: Vec2, margin = 0): boolean {
  if (net.roads.some((r) => projectOnRoad(r, p).distance <= r.width / 2 + margin + EPS)) return true;
  if (net.plazas.some((pl) => inPlaza(pl, p, margin))) return true;
  return net.spurs.some((sp) => projectOnSegment(p, sp.from, sp.to).distance <= (sp.width ?? ROAD.spurWidth) / 2 + margin + EPS);
}

/** Rectangle around everything on the network plus `margin`. */
export function networkBounds(net: RoadNetwork, margin = 0): Rect {
  const r: Rect = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const grow = (p: Vec2, pad: number) => {
    r.minX = Math.min(r.minX, p.x - pad);
    r.maxX = Math.max(r.maxX, p.x + pad);
    r.minZ = Math.min(r.minZ, p.z - pad);
    r.maxZ = Math.max(r.maxZ, p.z + pad);
  };
  for (const road of net.roads) for (const p of road.points) grow(p, road.width / 2);
  for (const pl of net.plazas) {
    grow({ x: pl.center.x - pl.w / 2, z: pl.center.z - pl.d / 2 }, 0);
    grow({ x: pl.center.x + pl.w / 2, z: pl.center.z + pl.d / 2 }, 0);
  }
  for (const sp of net.spurs) for (const p of [sp.from, sp.to]) grow(p, (sp.width ?? ROAD.spurWidth) / 2);
  return { minX: r.minX - margin, maxX: r.maxX + margin, minZ: r.minZ - margin, maxZ: r.maxZ + margin };
}

/** Graph over the network's centerlines (nodes are points, edges are straight drivable segments). */
export interface RoadGraph {
  nodes: Vec2[];
  edges: [number, number][];
  adj: { to: number; w: number }[][];
}

const MERGE = 0.05;

/**
 * Builds the routing graph. Roads join where a road's end point lies on another road (T junctions,
 * loops closing onto a hub road) or where two roads share a vertex. Spurs attach to the nearest road
 * (or the plaza that contains their start). Plaza centers attach to their road.
 */
export function buildRoadGraph(net: RoadNetwork): RoadGraph {
  const nodes: Vec2[] = [];
  const edges: [number, number][] = [];
  const keys = new Set<string>();
  const node = (p: Vec2): number => {
    const found = nodes.findIndex((n) => dist(n, p) < MERGE);
    if (found >= 0) return found;
    nodes.push({ x: p.x, z: p.z });
    return nodes.length - 1;
  };
  const link = (a: number, b: number) => {
    if (a === b) return;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (keys.has(key)) return;
    keys.add(key);
    edges.push([a, b]);
  };

  // Points attached along each road, by arc length.
  const attach: { s: number; p: Vec2 }[][] = net.roads.map((road) => {
    let s = 0;
    const list = road.points.map((p, i) => {
      if (i > 0) s += dist(road.points[i - 1], p);
      return { s, p };
    });
    return list;
  });
  const nearestRoad = (p: Vec2, slack = 0.5): { index: number; pr: Projection } | null => {
    let best: { index: number; pr: Projection } | null = null;
    net.roads.forEach((road, index) => {
      const pr = projectOnRoad(road, p);
      if (pr.distance <= road.width / 2 + slack && (!best || pr.distance < best.pr.distance)) best = { index, pr };
    });
    return best;
  };

  // Junctions: open road ends that lie on another road.
  const junctions: [Vec2, Vec2][] = [];
  net.roads.forEach((road, i) => {
    if (road.closed) return;
    for (const end of [road.points[0], road.points[road.points.length - 1]]) {
      net.roads.forEach((other, j) => {
        if (i === j) return;
        const pr = projectOnRoad(other, end);
        if (pr.distance <= other.width / 2 + EPS) {
          attach[j].push({ s: pr.s, p: pr.point });
          junctions.push([end, pr.point]);
        }
      });
    }
  });

  // Plazas: their center joins the road through its projection.
  const plazaLinks: [Vec2, Vec2][] = [];
  for (const pl of net.plazas) {
    const near = nearestRoad(pl.center, Math.max(pl.w, pl.d) / 2);
    if (!near) continue;
    attach[near.index].push({ s: near.pr.s, p: near.pr.point });
    plazaLinks.push([pl.center, near.pr.point]);
  }

  // Spurs: attach their start to the nearest road, else to a plaza containing it.
  const spurLinks: Vec2[][] = [];
  for (const sp of net.spurs) {
    const near = nearestRoad(sp.from);
    if (near) {
      attach[near.index].push({ s: near.pr.s, p: near.pr.point });
      spurLinks.push([near.pr.point, sp.from, sp.to]);
      continue;
    }
    const plaza = net.plazas.find((pl) => inPlaza(pl, sp.from));
    if (plaza) spurLinks.push([plaza.center, sp.from, sp.to]);
  }

  net.roads.forEach((road, i) => {
    const list = attach[i].sort((a, b) => a.s - b.s);
    const ids = list.map((a) => node(a.p));
    for (let k = 0; k < ids.length - 1; k++) link(ids[k], ids[k + 1]);
    if (road.closed && ids.length > 2) link(ids[ids.length - 1], ids[0]);
  });
  for (const [a, b] of [...junctions, ...plazaLinks]) link(node(a), node(b));
  for (const chain of spurLinks) for (let k = 0; k < chain.length - 1; k++) link(node(chain[k]), node(chain[k + 1]));

  const adj: { to: number; w: number }[][] = nodes.map(() => []);
  for (const [a, b] of edges) {
    const w = dist(nodes[a], nodes[b]);
    adj[a].push({ to: b, w });
    adj[b].push({ to: a, w });
  }
  return { nodes, edges, adj };
}

/** Nearest point on any graph edge. */
function entry(g: RoadGraph, p: Vec2): { point: Vec2; edge: number; distance: number } | null {
  let best: { point: Vec2; edge: number; distance: number } | null = null;
  g.edges.forEach(([a, b], edge) => {
    const pr = projectOnSegment(p, g.nodes[a], g.nodes[b]);
    if (!best || pr.distance < best.distance - EPS) best = { point: pr.point, edge, distance: pr.distance };
  });
  if (!best && g.nodes.length) {
    let i = 0;
    g.nodes.forEach((n, k) => {
      if (dist(n, p) < dist(g.nodes[i], p)) i = k;
    });
    return { point: g.nodes[i], edge: -1, distance: dist(g.nodes[i], p) };
  }
  return best;
}

/**
 * Waypoints along the road from `a` to `b` (excluding `a`): the nearest network point to `a`, the
 * graph nodes on the shortest route, the nearest network point to `b`, then `b`. Null when the
 * network is empty. Loops make the route take the shorter way round.
 */
export function pathBetween(net: RoadNetwork, a: Vec2, b: Vec2, graph: RoadGraph = buildRoadGraph(net)): Vec2[] | null {
  const g = graph;
  const ea = entry(g, a);
  const eb = entry(g, b);
  if (!ea || !eb) return null;

  const n = g.nodes.length;
  const A = n;
  const B = n + 1;
  const extra: { to: number; w: number }[][] = [[], []];
  const connect = (virtual: number, e: { point: Vec2; edge: number }) => {
    const list = extra[virtual - n];
    if (e.edge < 0) {
      const k = g.nodes.findIndex((p) => dist(p, e.point) < MERGE);
      list.push({ to: k, w: 0 });
      return;
    }
    const [i, j] = g.edges[e.edge];
    list.push({ to: i, w: dist(e.point, g.nodes[i]) }, { to: j, w: dist(e.point, g.nodes[j]) });
  };
  connect(A, ea);
  connect(B, eb);

  const cost = new Float64Array(n + 2).fill(Infinity);
  const prev = new Int32Array(n + 2).fill(-1);
  const done = new Uint8Array(n + 2);
  cost[A] = 0;
  const neighbors = (k: number): { to: number; w: number }[] => {
    if (k === A) return extra[0];
    if (k === B) return [];
    const out = [...g.adj[k]];
    for (const link of extra[1]) if (link.to === k) out.push({ to: B, w: link.w });
    return out;
  };
  // Same edge: drive straight along it.
  if (ea.edge >= 0 && ea.edge === eb.edge) {
    cost[B] = dist(ea.point, eb.point);
    prev[B] = A;
  }
  for (;;) {
    let k = -1;
    for (let i = 0; i < n + 2; i++) if (!done[i] && Number.isFinite(cost[i]) && (k < 0 || cost[i] < cost[k])) k = i;
    if (k < 0 || k === B) break;
    done[k] = 1;
    for (const { to, w } of neighbors(k)) {
      if (cost[k] + w < cost[to] - EPS) {
        cost[to] = cost[k] + w;
        prev[to] = k;
      }
    }
  }
  if (!Number.isFinite(cost[B])) return null;

  const chain: number[] = [];
  for (let k = B; k >= 0; k = prev[k]) chain.unshift(k);
  const pts: Vec2[] = chain.map((k) => (k === A ? ea.point : k === B ? eb.point : g.nodes[k]));
  pts.push(b);

  const out: Vec2[] = [];
  let last = a;
  for (const p of pts) {
    if (dist(p, last) < 0.3) continue;
    out.push(p);
    last = p;
  }
  return out;
}

/** Whether an autopilot drive follows the floor's road: always when it has one, unless `roadZone` limits it to drives into or out of that zone. */
export function routeUsesRoad(layout: { road?: RoadNetwork; roadZone?: Rect }, from: Vec2, to: Vec2): boolean {
  if (!layout.road) return false;
  const z = layout.roadZone;
  if (!z) return true;
  const inside = (p: Vec2) => p.x >= z.minX && p.x <= z.maxX && p.z >= z.minZ && p.z <= z.maxZ;
  return inside(from) || inside(to);
}
