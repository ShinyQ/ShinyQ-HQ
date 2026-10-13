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

/** Neighbour offsets: 4 orthogonal, then 4 diagonal. A* visits them in this order, which fixes its tie-breaking. */
const DI = [1, -1, 0, 0, 1, 1, -1, -1];
const DJ = [0, 0, 1, -1, 1, -1, 1, -1];

/**
 * Builds the per-floor grid from the slab bounds and obstacles inflated by the rover radius. Each
 * obstacle only visits the cells its inflated rect can reach (cells x obstacles was about 84 ms for
 * all floors on a 4x throttled phone).
 */
export function buildNavGrid({ bounds, obstacles }: { bounds: Rect; obstacles: readonly Rect[] }, radius: number, cell = 1): NavGrid {
  const cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell));
  const rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cell));
  const walkable = new Uint8Array(cols * rows);
  const eps = 1e-6;
  const cx = (i: number) => bounds.minX + (i + 0.5) * cell;
  const cz = (j: number) => bounds.minZ + (j + 0.5) * cell;
  for (let j = 0; j < rows; j++) {
    const z = cz(j);
    if (z < bounds.minZ + radius - eps || z > bounds.maxZ - radius + eps) continue;
    for (let i = 0; i < cols; i++) {
      const x = cx(i);
      if (x >= bounds.minX + radius - eps && x <= bounds.maxX - radius + eps) walkable[j * cols + i] = 1;
    }
  }
  const p = { x: 0, z: 0 };
  for (const o of obstacles) {
    // Cells whose center can lie closer than the radius to the rect (one cell of slack each side).
    const i0 = Math.max(0, Math.floor((o.minX - radius - bounds.minX) / cell) - 1);
    const i1 = Math.min(cols - 1, Math.ceil((o.maxX + radius - bounds.minX) / cell) + 1);
    const j0 = Math.max(0, Math.floor((o.minZ - radius - bounds.minZ) / cell) - 1);
    const j1 = Math.min(rows - 1, Math.ceil((o.maxZ + radius - bounds.minZ) / cell) + 1);
    for (let j = j0; j <= j1; j++) {
      p.z = cz(j);
      for (let i = i0; i <= i1; i++) {
        const idx = j * cols + i;
        if (!walkable[idx]) continue;
        p.x = cx(i);
        if (distanceToRect(p, o) < radius - eps) walkable[idx] = 0;
      }
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

/** Neighbour `d` (0 to 7) of cell (i, j), or -1 when it is off the grid, blocked, or a diagonal that would cut a corner. */
function neighbor(g: NavGrid, i: number, j: number, d: number): number {
  const ni = i + DI[d];
  const nj = j + DJ[d];
  if (ni < 0 || nj < 0 || ni >= g.cols || nj >= g.rows) return -1;
  const n = nj * g.cols + ni;
  if (!g.walkable[n]) return -1;
  if (d >= 4 && (!g.walkable[j * g.cols + ni] || !g.walkable[nj * g.cols + i])) return -1;
  return n;
}

/** Work done by the last `findPath` call (unit tests and benches): A* pops and cells looked at while snapping. */
export const pathStats = { expanded: 0, scanned: 0 };

const components = new WeakMap<NavGrid, Int32Array>();

/**
 * Connected region of every cell (-1 when blocked), labelled once per grid: reachability becomes a
 * lookup instead of a whole-grid flood on every `findPath` (perf report D 6.3). Grids never change
 * after `buildNavGrid`.
 */
export function componentsOf(g: NavGrid): Int32Array {
  const cached = components.get(g);
  if (cached) return cached;
  const labels = new Int32Array(g.walkable.length).fill(-1);
  const queue = new Int32Array(g.walkable.length);
  let label = 0;
  for (let seed = 0; seed < labels.length; seed++) {
    if (!g.walkable[seed] || labels[seed] !== -1) continue;
    let head = 0;
    let tail = 0;
    labels[seed] = label;
    queue[tail++] = seed;
    while (head < tail) {
      const idx = queue[head++];
      const i = idx % g.cols;
      const j = (idx - i) / g.cols;
      for (let d = 0; d < 8; d++) {
        const n = neighbor(g, i, j, d);
        if (n >= 0 && labels[n] === -1) {
          labels[n] = label;
          queue[tail++] = n;
        }
      }
    }
    label += 1;
  }
  components.set(g, labels);
  return labels;
}

/**
 * Nearest allowed cell center to `p` (ties: the lowest index, as a full scan in index order would
 * pick). Searches square rings around `p`'s cell and stops once a ring cannot hold a closer cell.
 */
function nearestCell(g: NavGrid, p: Vec2, allowed: (idx: number) => boolean): number | null {
  const u = (p.x - g.minX) / g.cell - 0.5;
  const v = (p.z - g.minZ) / g.cell - 0.5;
  const bi = Math.min(g.cols - 1, Math.max(0, Math.round(u)));
  const bj = Math.min(g.rows - 1, Math.max(0, Math.round(v)));
  // Every cell on ring r is at least (r - off) cells from p (Chebyshev, so also Euclidean).
  const off = Math.max(Math.abs(bi - u), Math.abs(bj - v));
  const maxR = Math.max(bi, g.cols - 1 - bi, bj, g.rows - 1 - bj);
  let best = -1;
  let bestD = Infinity;
  const consider = (i: number, j: number) => {
    pathStats.scanned += 1;
    const idx = j * g.cols + i;
    if (!allowed(idx)) return;
    const c = center(g, idx);
    const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2;
    if (d < bestD || (d === bestD && idx < best)) {
      bestD = d;
      best = idx;
    }
  };
  for (let r = 0; r <= maxR; r++) {
    const reach = (r - off) * g.cell;
    if (best >= 0 && reach > 0 && reach * reach > bestD * (1 + 1e-12) + 1e-12) break;
    const i0 = bi - r;
    const i1 = bi + r;
    const j0 = bj - r;
    const j1 = bj + r;
    for (let i = Math.max(0, i0); i <= Math.min(g.cols - 1, i1); i++) {
      if (j0 >= 0) consider(i, j0);
      if (r > 0 && j1 < g.rows) consider(i, j1);
    }
    for (let j = Math.max(0, j0 + 1); j <= Math.min(g.rows - 1, j1 - 1); j++) {
      if (i0 >= 0) consider(i0, j);
      if (r > 0 && i1 < g.cols) consider(i1, j);
    }
  }
  return best < 0 ? null : best;
}

/** Nearest walkable point to `p` (the point itself when it is walkable). */
export function nearestWalkable(g: NavGrid, p: Vec2): Vec2 | null {
  if (isWalkable(g, p)) return p;
  const idx = nearestCell(g, p, (i) => g.walkable[i] === 1);
  return idx === null ? null : center(g, idx);
}

/** Binary min-heap of (f, cell) on typed arrays; the same sift order as the tuple heap it replaces, so A* breaks ties the same way. */
class MinHeap {
  private f = new Float64Array(256);
  private id = new Int32Array(256);
  size = 0;
  /** Priority of the item the last `pop` returned. */
  topF = 0;

  push(f: number, id: number) {
    if (this.size === this.f.length) {
      const nf = new Float64Array(this.size * 2);
      nf.set(this.f);
      this.f = nf;
      const ni = new Int32Array(this.size * 2);
      ni.set(this.id);
      this.id = ni;
    }
    const F = this.f;
    const I = this.id;
    let i = this.size++;
    F[i] = f;
    I[i] = id;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (F[p] <= F[i]) break;
      const tf = F[p];
      F[p] = F[i];
      F[i] = tf;
      const ti = I[p];
      I[p] = I[i];
      I[i] = ti;
      i = p;
    }
  }

  pop(): number {
    const F = this.f;
    const I = this.id;
    this.topF = F[0];
    const top = I[0];
    this.size -= 1;
    if (this.size > 0) {
      F[0] = F[this.size];
      I[0] = I[this.size];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.size && F[l] < F[m]) m = l;
        if (r < this.size && F[r] < F[m]) m = r;
        if (m === i) break;
        const tf = F[m];
        F[m] = F[i];
        F[i] = tf;
        const ti = I[m];
        I[m] = I[i];
        I[i] = ti;
        i = m;
      }
    }
    return top;
  }
}

function aStar(g: NavGrid, start: number, goal: number): number[] | null {
  const cols = g.cols;
  const gx = goal % cols;
  const gz = Math.floor(goal / cols);
  const h = (idx: number) => {
    const dx = Math.abs((idx % cols) - gx);
    const dz = Math.abs(Math.floor(idx / cols) - gz);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  const cost = new Float64Array(g.walkable.length).fill(Infinity);
  const from = new Int32Array(g.walkable.length).fill(-1);
  const open = new MinHeap();
  cost[start] = 0;
  open.push(h(start), start);
  while (open.size) {
    const cur = open.pop();
    const f = open.topF;
    pathStats.expanded += 1;
    if (cur === goal) break;
    if (f - h(cur) > cost[cur] + 1e-9) continue;
    const i = cur % cols;
    const j = (cur - i) / cols;
    for (let d = 0; d < 8; d++) {
      const n = neighbor(g, i, j, d);
      if (n < 0) continue;
      const c = cost[cur] + (d >= 4 ? Math.SQRT2 : 1);
      if (c < cost[n]) {
        cost[n] = c;
        from[n] = cur;
        open.push(c + h(n), n);
      }
    }
  }
  if (!Number.isFinite(cost[goal])) return null;
  const path: number[] = [];
  for (let c = goal; ; c = from[c]) {
    path.push(c);
    if (c === start) break;
  }
  return path.reverse();
}

/** Whether the straight segment from `a` to `b` stays on walkable cells (sampled every 0.25 u). */
export function segmentWalkable(g: NavGrid, a: Vec2, b: Vec2): boolean {
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
  pathStats.expanded = 0;
  pathStats.scanned = 0;
  const rawStart = cellIndex(g, from);
  const start = rawStart !== null && g.walkable[rawStart] ? rawStart : nearestCell(g, from, (i) => g.walkable[i] === 1);
  if (start === null) return null;
  const labels = componentsOf(g);
  const region = labels[start];
  const targetCell = cellIndex(g, to);
  const exact = targetCell !== null && labels[targetCell] === region;
  const goal = exact ? targetCell : nearestCell(g, to, (i) => labels[i] === region);
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
      if (segmentWalkable(g, points[anchor], points[k])) {
        next = k;
        break;
      }
    }
    out.push(points[next]);
    anchor = next;
  }
  return out;
}
