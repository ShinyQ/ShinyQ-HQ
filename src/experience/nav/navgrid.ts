import type { Rect, Vec2 } from "../types";
import { distanceToRect } from "./collision";

export interface NavGrid {
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
  cell: number;
  /** 1 when the cell center is reachable by a rover of the build radius. */
  walkable: Uint8Array;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/** Builds the per-floor grid from the slab bounds and obstacles inflated by the rover radius. */
export function buildNavGrid({ bounds, obstacles }: { bounds: Rect; obstacles: readonly Rect[] }, radius: number, cell = 1): NavGrid {
  const cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell));
  const rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cell));
  const walkable = new Uint8Array(cols * rows);
  const eps = 1e-6;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const p = { x: bounds.minX + (i + 0.5) * cell, z: bounds.minZ + (j + 0.5) * cell };
      const inside =
        p.x >= bounds.minX + radius - eps &&
        p.x <= bounds.maxX - radius + eps &&
        p.z >= bounds.minZ + radius - eps &&
        p.z <= bounds.maxZ - radius + eps;
      const clear = inside && obstacles.every((o) => distanceToRect(p, o) >= radius - eps);
      walkable[j * cols + i] = clear ? 1 : 0;
    }
  }
  return { minX: bounds.minX, minZ: bounds.minZ, cols, rows, cell, walkable };
}

const center = (g: NavGrid, idx: number): Vec2 => ({
  x: g.minX + ((idx % g.cols) + 0.5) * g.cell,
  z: g.minZ + (Math.floor(idx / g.cols) + 0.5) * g.cell,
});

function cellIndex(g: NavGrid, p: Vec2): number | null {
  const i = Math.floor((p.x - g.minX) / g.cell);
  const j = Math.floor((p.z - g.minZ) / g.cell);
  if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) return null;
  return j * g.cols + i;
}

export function isWalkable(g: NavGrid, p: Vec2): boolean {
  const idx = cellIndex(g, p);
  return idx !== null && g.walkable[idx] === 1;
}

function* neighbors(g: NavGrid, idx: number): Generator<[number, number]> {
  const i = idx % g.cols;
  const j = Math.floor(idx / g.cols);
  for (const [di, dj] of DIRS) {
    const ni = i + di;
    const nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= g.cols || nj >= g.rows) continue;
    const n = nj * g.cols + ni;
    if (!g.walkable[n]) continue;
    // No corner cutting: a diagonal needs both orthogonal neighbours open.
    if (di !== 0 && dj !== 0 && (!g.walkable[j * g.cols + ni] || !g.walkable[nj * g.cols + i])) continue;
    yield [n, di !== 0 && dj !== 0 ? Math.SQRT2 : 1];
  }
}

function nearestCell(g: NavGrid, p: Vec2, allowed: (idx: number) => boolean): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (let idx = 0; idx < g.walkable.length; idx++) {
    if (!allowed(idx)) continue;
    const c = center(g, idx);
    const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = idx;
    }
  }
  return best;
}

/** Nearest walkable point to `p` (the point itself when it is walkable). */
export function nearestWalkable(g: NavGrid, p: Vec2): Vec2 | null {
  if (isWalkable(g, p)) return p;
  const idx = nearestCell(g, p, (i) => g.walkable[i] === 1);
  return idx === null ? null : center(g, idx);
}

function flood(g: NavGrid, start: number): Uint8Array {
  const seen = new Uint8Array(g.walkable.length);
  const queue = [start];
  seen[start] = 1;
  for (let q = 0; q < queue.length; q++) {
    for (const [n] of neighbors(g, queue[q])) {
      if (!seen[n]) {
        seen[n] = 1;
        queue.push(n);
      }
    }
  }
  return seen;
}

class MinHeap {
  private items: [number, number][] = [];
  get size() {
    return this.items.length;
  }
  push(item: [number, number]) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number] | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

function aStar(g: NavGrid, start: number, goal: number): number[] | null {
  const gc = (idx: number) => [idx % g.cols, Math.floor(idx / g.cols)] as const;
  const [gx, gz] = gc(goal);
  const h = (idx: number) => {
    const [x, z] = gc(idx);
    const dx = Math.abs(x - gx);
    const dz = Math.abs(z - gz);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  const cost = new Float64Array(g.walkable.length).fill(Infinity);
  const from = new Int32Array(g.walkable.length).fill(-1);
  const open = new MinHeap();
  cost[start] = 0;
  open.push([h(start), start]);
  while (open.size) {
    const [f, cur] = open.pop()!;
    if (cur === goal) break;
    if (f - h(cur) > cost[cur] + 1e-9) continue;
    for (const [n, step] of neighbors(g, cur)) {
      const c = cost[cur] + step;
      if (c < cost[n]) {
        cost[n] = c;
        from[n] = cur;
        open.push([c + h(n), n]);
      }
    }
  }
  if (!Number.isFinite(cost[goal])) return null;
  const path = [goal];
  while (path[0] !== start) path.unshift(from[path[0]]);
  return path;
}

function lineClear(g: NavGrid, a: Vec2, b: Vec2): boolean {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(len / 0.25));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    if (!isWalkable(g, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
  }
  return true;
}

/**
 * A* on the navgrid with 8-way movement, then string-pulled. Unreachable or
 * blocked targets snap to the nearest reachable cell. Returns waypoints
 * excluding `from`, or null when the start has no walkable cell at all.
 */
export function findPath(g: NavGrid, from: Vec2, to: Vec2): Vec2[] | null {
  const rawStart = cellIndex(g, from);
  const start = rawStart !== null && g.walkable[rawStart] ? rawStart : nearestCell(g, from, (i) => g.walkable[i] === 1);
  if (start === null) return null;
  const reachable = flood(g, start);
  const targetCell = cellIndex(g, to);
  const exact = targetCell !== null && reachable[targetCell] === 1;
  const goal = exact ? targetCell : nearestCell(g, to, (i) => reachable[i] === 1);
  if (goal === null) return null;
  const cells = aStar(g, start, goal);
  if (!cells) return null;

  const final = exact ? to : center(g, goal);
  const points = [from, ...cells.slice(1, -1).map((c) => center(g, c)), final];
  if (rawStart !== start) points.splice(1, 0, center(g, start));

  const out: Vec2[] = [];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let next = anchor + 1;
    for (let k = points.length - 1; k > anchor + 1; k--) {
      if (lineClear(g, points[anchor], points[k])) {
        next = k;
        break;
      }
    }
    out.push(points[next]);
    anchor = next;
  }
  return out;
}
