import type { Point, Stroke } from "@/experience/fx/holoIcons";

/**
 * Build-time SVG to stroke converter for the floating line icons (vendored Lucide, `assets/icons/lucide/`): turns an
 * icon's `<path>`, `<line>`, `<polyline>`, `<polygon>`, `<circle>`, `<ellipse>` and `<rect>` elements into the
 * 24 x 24 `Stroke` polylines that `HoloIcon` draws as neon ribbons. Curves are flattened coarsely (the ribbons are
 * 1.5 grid units wide, so a full 10 u circle needs 16 segments, a 2 u corner 2), polylines are simplified, and a
 * subpath shorter than `DOT` (Lucide's `h.01` dots) becomes a small closed diamond so it reads as a dot. Pure; never
 * bundled (the 3D client only fetches the JSON that `scripts/build-shapes.ts` writes).
 */

/** Simplification tolerance (grid units). */
export const SIMPLIFY = 0.12;
/** Subpaths shorter than this become a dot. */
export const DOT = 0.5;
const DOT_R = 0.45;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dist = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Segments for an arc of `sweep` radians and radius `r`: about 16 for a full 10 u circle, never under 2. */
export function arcSteps(sweep: number, r: number): number {
  return clamp(Math.ceil((Math.abs(sweep) * Math.sqrt(Math.max(r, 0.01))) / 1.2), 2, 16);
}

/** Segments for a Bezier with control polygon `points`. */
function curveSteps(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i]);
  return clamp(Math.ceil(len / 2.5), 2, 10);
}

/** Reads numbers, flags and commands from path data (`d`), with SVG's packed forms (`.5.5`, `a1 1 0 011 1`). */
class PathReader {
  i = 0;
  constructor(readonly s: string) {}
  private skip() {
    while (this.i < this.s.length && /[\s,]/.test(this.s[this.i])) this.i++;
  }
  command(): string | null {
    this.skip();
    const c = this.s[this.i];
    if (c && /[A-Za-z]/.test(c)) {
      this.i++;
      return c;
    }
    return null;
  }
  hasNumber(): boolean {
    this.skip();
    return this.i < this.s.length && /[-+.\d]/.test(this.s[this.i]);
  }
  number(): number {
    this.skip();
    const re = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
    re.lastIndex = this.i;
    const m = re.exec(this.s);
    if (!m) throw new Error(`Expected a number at ${this.i} in "${this.s}"`);
    this.i = re.lastIndex;
    return Number(m[0]);
  }
  flag(): number {
    this.skip();
    const c = this.s[this.i];
    if (c !== "0" && c !== "1") throw new Error(`Expected an arc flag at ${this.i} in "${this.s}"`);
    this.i++;
    return Number(c);
  }
}

/** Endpoint arc (SVG `A`) to points after `from` (SVG 1.1 appendix F.6.5). */
export function arcPoints(from: Point, rx: number, ry: number, rotation: number, large: number, sweep: number, to: Point): Point[] {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx < 1e-9 || ry < 1e-9 || dist(from, to) < 1e-9) return [to];
  const phi = (rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from[0] - to[0]) / 2;
  const dy = (from[1] - to[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (k * rx * y1) / ry;
  const cy1 = (-k * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (from[0] + to[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (from[1] + to[1]) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = arcSteps(dt, Math.max(rx, ry));
  const out: Point[] = [];
  for (let i = 1; i <= n; i++) {
    const t = t1 + (dt * i) / n;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push(i === n ? to : [cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
  return out;
}

function bezier(points: Point[]): Point[] {
  const n = curveSteps(points);
  const out: Point[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    if (points.length === 3) {
      const [a, b, c] = points;
      out.push([u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]);
    } else {
      const [a, b, c, d] = points;
      out.push([
        u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
        u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
      ]);
    }
  }
  return out;
}

/** Path data (`d`) to raw subpaths (curves flattened, not yet simplified). */
export function pathStrokes(d: string): Stroke[] {
  const r = new PathReader(d);
  const out: Stroke[] = [];
  let cur: Point = [0, 0];
  let start: Point = [0, 0];
  let stroke: Stroke | null = null;
  let ctrl: Point | null = null;
  let prev = "";
  const lineTo = (p: Point) => {
    if (!stroke) {
      stroke = { points: [cur] };
      out.push(stroke);
    }
    stroke.points.push(p);
    cur = p;
  };
  for (let cmd = r.command(); cmd; cmd = r.command()) {
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const at = (x: number, y: number): Point => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
    if (C === "Z") {
      if (stroke) (stroke as Stroke).closed = true;
      cur = start;
      stroke = null;
      ctrl = null;
      prev = C;
      continue;
    }
    let first = true;
    do {
      switch (C) {
        case "M": {
          const p = at(r.number(), r.number());
          if (first) {
            cur = p;
            start = p;
            stroke = null;
          } else lineTo(p);
          ctrl = null;
          break;
        }
        case "L":
          lineTo(at(r.number(), r.number()));
          ctrl = null;
          break;
        case "H": {
          const x = r.number();
          lineTo([rel ? cur[0] + x : x, cur[1]]);
          ctrl = null;
          break;
        }
        case "V": {
          const y = r.number();
          lineTo([cur[0], rel ? cur[1] + y : y]);
          ctrl = null;
          break;
        }
        case "C":
        case "S": {
          const reflect: Point = ctrl && (prev === "C" || prev === "S") ? [2 * cur[0] - ctrl[0], 2 * cur[1] - ctrl[1]] : cur;
          const c1 = C === "C" ? at(r.number(), r.number()) : reflect;
          const c2 = at(r.number(), r.number());
          const end = at(r.number(), r.number());
          for (const p of bezier([cur, c1, c2, end])) lineTo(p);
          ctrl = c2;
          break;
        }
        case "Q":
        case "T": {
          const c1: Point = C === "Q" ? at(r.number(), r.number()) : ctrl && (prev === "Q" || prev === "T") ? [2 * cur[0] - ctrl[0], 2 * cur[1] - ctrl[1]] : cur;
          const end = at(r.number(), r.number());
          for (const p of bezier([cur, c1, end])) lineTo(p);
          ctrl = c1;
          break;
        }
        case "A": {
          const rx = r.number();
          const ry = r.number();
          const rot = r.number();
          const large = r.flag();
          const sweep = r.flag();
          const from = cur;
          for (const p of arcPoints(from, rx, ry, rot, large, sweep, at(r.number(), r.number()))) lineTo(p);
          ctrl = null;
          break;
        }
        default:
          throw new Error(`Unsupported path command "${cmd}" in "${d}"`);
      }
      prev = C;
      first = false;
    } while (r.hasNumber());
  }
  return out;
}

function ellipse(cx: number, cy: number, rx: number, ry: number): Stroke {
  const n = Math.max(4, arcSteps(2 * Math.PI, Math.max(rx, ry)));
  return { points: Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * 2 * Math.PI) * rx, cy + Math.sin((i / n) * 2 * Math.PI) * ry] as Point), closed: true };
}

function rectPath(x: number, y: number, w: number, h: number, rx: number, ry: number): string {
  rx = Math.min(rx || ry, w / 2);
  ry = Math.min(ry || rx, h / 2);
  if (!rx || !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
}

const numbers = (s: string) => (s.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? []).map(Number);

/** Ramer-Douglas-Peucker on an open polyline (endpoints kept). */
function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;
  const [a, b] = [points[0], points[points.length - 1]];
  const len = dist(a, b);
  let worst = -1;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const d = len < 1e-9 ? dist(a, p) : Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len;
    if (d > worst) {
      worst = d;
      index = i;
    }
  }
  if (worst <= tolerance) return [a, b];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

const round = (v: number) => Math.round(v * 100) / 100 + 0;

/** Cleans one raw subpath: drops repeats, turns tiny ones into dots, simplifies and rounds. */
export function tidy(stroke: Stroke, tolerance = SIMPLIFY): Stroke {
  let points = stroke.points.filter((p, i, all) => i === 0 || dist(all[i - 1], p) > 1e-3);
  let closed = Boolean(stroke.closed);
  if (points.length > 2 && dist(points[0], points[points.length - 1]) < 1e-3) {
    points = points.slice(0, -1);
    closed = true;
  }
  let length = 0;
  for (let i = 1; i < points.length; i++) length += dist(points[i - 1], points[i]);
  if (closed && points.length > 1) length += dist(points[points.length - 1], points[0]);
  if (length < DOT) {
    const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
    const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
    points = [
      [cx, cy - DOT_R],
      [cx + DOT_R, cy],
      [cx, cy + DOT_R],
      [cx - DOT_R, cy],
    ];
    closed = true;
  } else if (closed) {
    points = simplify([...points, points[0]], tolerance).slice(0, -1);
    if (points.length < 3) closed = false;
  } else points = simplify(points, tolerance);
  return { points: points.map(([x, y]) => [round(x), round(y)] as Point), ...(closed ? { closed: true } : {}) };
}

/** An SVG icon (24 x 24 viewBox) to strokes on the 24 x 24 grid. Throws on transforms and unknown viewBoxes. */
export function svgToStrokes(svg: string, tolerance = SIMPLIFY): Stroke[] {
  const viewBox = svg.match(/viewBox="([^"]*)"/)?.[1];
  if (viewBox && numbers(viewBox).join(" ") !== "0 0 24 24") throw new Error(`Expected a 0 0 24 24 viewBox, got "${viewBox}"`);
  const raw: Stroke[] = [];
  for (const [, tag, body] of svg.matchAll(/<(path|line|polyline|polygon|circle|ellipse|rect)\b([^>]*?)\/?>/g)) {
    const attr: Record<string, string> = {};
    for (const [, k, v] of body.matchAll(/([\w:-]+)="([^"]*)"/g)) attr[k] = v;
    if (attr.transform) throw new Error(`Transforms are not supported (<${tag} transform="${attr.transform}">)`);
    const n = (k: string) => Number(attr[k] ?? 0);
    switch (tag) {
      case "path":
        raw.push(...pathStrokes(attr.d ?? ""));
        break;
      case "line":
        raw.push({ points: [[n("x1"), n("y1")], [n("x2"), n("y2")]] });
        break;
      case "polyline":
      case "polygon": {
        const v = numbers(attr.points ?? "");
        raw.push({ points: Array.from({ length: v.length >> 1 }, (_, i) => [v[2 * i], v[2 * i + 1]] as Point), ...(tag === "polygon" ? { closed: true } : {}) });
        break;
      }
      case "circle":
        raw.push(ellipse(n("cx"), n("cy"), n("r"), n("r")));
        break;
      case "ellipse":
        raw.push(ellipse(n("cx"), n("cy"), n("rx"), n("ry")));
        break;
      case "rect":
        raw.push(...pathStrokes(rectPath(n("x"), n("y"), n("width"), n("height"), n("rx"), n("ry"))));
        break;
    }
  }
  return raw.filter((s) => s.points.length > 0).map((s) => tidy(s, tolerance));
}

/** Ribbon segments of strokes (each costs 2 triangles per layer in `HoloIcon`). */
export function strokeSegments(strokes: readonly Stroke[]): number {
  return strokes.reduce((sum, s) => sum + s.points.length - 1 + (s.closed ? 1 : 0), 0);
}
