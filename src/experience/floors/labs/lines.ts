import { BufferGeometry, Color, Float32BufferAttribute } from "three";

type Seg = [number, number, number, number, number, number];

/** Collects colored line segments so a whole floor's outlines render in one draw call. */
export class LineBatch {
  private positions: number[] = [];
  private colors: number[] = [];
  private color = new Color();

  segment(seg: Seg, color: string) {
    this.positions.push(...seg);
    this.color.set(color);
    const { r, g, b } = this.color;
    this.colors.push(r, g, b, r, g, b);
  }

  /** Box edges (12 segments) for a box centered at (cx, cy, cz). */
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: string) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const corners: [number, number, number][] = [
      [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
      [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
    ];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [a, b] of edges) this.segment([...corners[a], ...corners[b]], color);
  }

  /** Circle on the floor plane. */
  circle(cx: number, cz: number, r: number, y: number, color: string, steps = 48) {
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const b = ((i + 1) / steps) * Math.PI * 2;
      this.segment([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, cx + Math.cos(b) * r, y, cz + Math.sin(b) * r], color);
    }
  }

  /** Open polyline on the floor plane. */
  path(points: [number, number][], y: number, color: string) {
    for (let i = 0; i < points.length - 1; i++) this.segment([points[i][0], y, points[i][1], points[i + 1][0], y, points[i + 1][1]], color);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    g.setAttribute("color", new Float32BufferAttribute(this.colors, 3));
    return g;
  }
}
