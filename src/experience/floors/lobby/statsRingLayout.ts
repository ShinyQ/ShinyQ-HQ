import { Matrix4, Quaternion, Sphere, Vector3 } from "three";
import { LOBBY } from "../../config";

export const { w: TILE_W, h: TILE_H, y: TILE_Y, stagger: TILE_STAGGER } = LOBBY.statsTile;

/** Offsets inside a tile (x right, y up, z toward the viewer), as the old per-tile meshes had them. */
export const VALUE_OFFSET = new Matrix4().makeTranslation(-TILE_W / 2 + 0.2, TILE_H / 2 - 0.45, 0.02);
export const LABEL_OFFSET = new Matrix4().makeTranslation(-TILE_W / 2 + 0.2, TILE_H / 2 - 0.9, 0.02);
/** The tile's accent marker: a glowing dot at the top right, level with the value (R5 P10, owner decision 2026-10-13). */
export const DOT_OFFSET = new Matrix4().makeTranslation(TILE_W / 2 - 0.3, TILE_H / 2 - 0.45, 0.012);
export const DOT_RADIUS = 0.08;

export function tileAngle(i: number, n: number): number {
  return (i / n) * Math.PI * 2 + Math.PI / 4;
}

/** Rest position of tile `i` in ring space (before the lift over the rover). */
export function tileBase(i: number, n: number): [number, number, number] {
  const a = tileAngle(i, n);
  return [Math.sin(a) * LOBBY.statsRadius, TILE_Y + (i % 2) * TILE_STAGGER, Math.cos(a) * LOBBY.statsRadius];
}

/** The 12 edges of a w x h x d box as 24 vertices (what `EdgesGeometry(BoxGeometry)` draws for `BoxEdges`). */
export function boxEdgeVertices(w: number, h: number, d: number): Float32Array {
  const [x, y, z] = [w / 2, h / 2, d / 2];
  const c = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
  const pairs = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const out = new Float32Array(72);
  pairs.forEach(([a, b], k) => {
    out.set(c[a], k * 6);
    out.set(c[b], k * 6 + 3);
  });
  return out;
}

export const TILE_EDGES = boxEdgeVertices(TILE_W, TILE_H, 0.01);

const v = new Vector3();
/** Writes tile `i`'s 24 edge vertices, transformed by `m`, into `out` (72 floats per tile). */
export function writeEdges(out: Float32Array, i: number, m: Matrix4): void {
  for (let k = 0; k < 72; k += 3) {
    v.set(TILE_EDGES[k], TILE_EDGES[k + 1], TILE_EDGES[k + 2]).applyMatrix4(m);
    out[i * 72 + k] = v.x;
    out[i * 72 + k + 1] = v.y;
    out[i * 72 + k + 2] = v.z;
  }
}

/** Tile indices far to near, so blended plates draw like separately sorted objects did. */
export function backToFront(distances: readonly number[]): number[] {
  return distances.map((_, i) => i).sort((a, b) => distances[b] - distances[a]);
}

const position = new Vector3();
const size = new Vector3();
/** Ring-space matrix of a tile facing `facing`; scales under 0.01 collapse to nothing (hidden). */
export function composeTile(out: Matrix4, x: number, y: number, z: number, facing: Quaternion, scale: number): Matrix4 {
  return out.compose(position.set(x, y, z), facing, size.setScalar(scale < 0.01 ? 0 : scale));
}

/**
 * Bounds of the whole ring in ring space (any turn, the bob and the lift over the rover), so the
 * instanced plates, glows and edges are culled when the ring is off-screen, like the old tiles were.
 */
export const RING_BOUNDS = new Sphere(new Vector3(0, TILE_Y + TILE_STAGGER / 2, 0), LOBBY.statsRadius + Math.hypot(TILE_W, TILE_H));
