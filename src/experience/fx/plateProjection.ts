import type { Camera, Vector3 } from "three";
import type { ScreenBox } from "./labelPlacement";

/** Plate corners in order around the plate (left bottom, right bottom, right top, left top). */
const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;

export interface PlateProjection {
  /** Screen box in CSS pixels. */
  box: ScreenBox;
  /** The four corners in CSS pixels, in `CORNERS` order. */
  quad: [number, number][];
  /** False when the box lies fully outside the viewport. */
  onScreen: boolean;
}

/**
 * Screen box of an upright floating plate that turns to the camera about y only (`signFacing`): its
 * corners lie along the horizontal axis square to the camera direction and the world vertical.
 * `at` is the plate center (world), `half` its half width and height (callers add their own margin),
 * `size` the canvas in CSS pixels, `v` a scratch vector (no allocation for it per frame). Null when a
 * corner falls outside the clip depth (behind the camera) or the camera stands right above the center.
 */
export function projectPlate(
  camera: Camera,
  at: { x: number; y: number; z: number },
  half: { w: number; h: number },
  size: { width: number; height: number },
  v: Vector3,
): PlateProjection | null {
  const cx = camera.position.x;
  const cz = camera.position.z;
  const d = Math.hypot(cx - at.x, cz - at.z);
  if (d === 0) return null;
  const rx = (cz - at.z) / d;
  const rz = (at.x - cx) / d;
  const { width, height } = size;
  const box: ScreenBox = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const quad: [number, number][] = [];
  for (const [sx, sy] of CORNERS) {
    v.set(at.x + rx * half.w * sx, at.y + half.h * sy, at.z + rz * half.w * sx).project(camera);
    if (v.z < -1 || v.z > 1) return null;
    const x = ((v.x + 1) / 2) * width;
    const y = ((1 - v.y) / 2) * height;
    box.x0 = Math.min(box.x0, x);
    box.x1 = Math.max(box.x1, x);
    box.y0 = Math.min(box.y0, y);
    box.y1 = Math.max(box.y1, y);
    quad.push([x, y]);
  }
  const onScreen = !(box.x1 < 0 || box.x0 > width || box.y1 < 0 || box.y0 > height);
  return { box, quad, onScreen };
}
