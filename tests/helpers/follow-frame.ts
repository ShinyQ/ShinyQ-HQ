import { PerspectiveCamera, Vector3 } from "three";
import { expect } from "vitest";
import { cameraWorld, clampCamera } from "@/experience/camera/collision";
import { followOffsetScale } from "@/experience/camera/offset";
import { zoneView, type ViewZone } from "@/experience/camera/orbit";
import { FOLLOW_LOOK_AHEAD, followForward, followPose, type Vec3 } from "@/experience/camera/rigs";
import type { FloorLayout, Vec2, ViewportClass } from "@/experience/types";
import { cameraClass } from "@/lib/viewport";

/** HUD-free boxes (`DESKTOP_SAFE`, `PHONE_SAFE` in e2e/hq.ts), as in arrivals.test.ts; camera class "mobile" uses the phone box. */
export const DESKTOP_SAFE = { top: 90, bottom: 90, side: 40 };
export const PHONE_SAFE = { top: 120, bottom: 140, side: 24 };
/** Laptop, landscape tablet (camera class desktop), portrait tablet and phone (camera class mobile). */
export const FRAME_SIZES = [
  [1440, 900],
  [1194, 834],
  [834, 1194],
  [390, 844],
] as const;

export interface SettledFollow {
  camera: PerspectiveCamera;
  cls: ViewportClass;
  rover: Vec3;
  target: Vec3;
  position: Vec3;
}

/**
 * The follow camera as `CameraDirector` settles it with the rover standing at `at` in `zone` on a `w` x `h` screen:
 * the zone's class view, the look-ahead, the offset scale and camera collision (`clampCamera`) on a floor at y 0.
 */
export function settleFollow(layout: FloorLayout, zone: ViewZone, at: Vec2, w: number, h: number): SettledFollow {
  const cls = cameraClass(w, h);
  const view = zoneView(zone, cls);
  const forward = followForward(cls, view.yaw);
  const ahead = FOLLOW_LOOK_AHEAD[cls];
  const rover: Vec3 = [at.x, 1, at.z];
  const target: Vec3 = [at.x + forward.x * ahead, 1, at.z + forward.z * ahead];
  const look = view.lookOffset;
  const pose = followPose(cls, target, view.yaw, (view.zoom ?? 1) * followOffsetScale(cls, w / h), view.pitch ?? 0, look?.forward ?? 0, look?.up ?? 0, look?.right ?? 0);
  const position = clampCamera(pose.target, pose.position, cameraWorld(layout, 0), rover, pose.fov);
  const camera = new PerspectiveCamera(pose.fov, w / h, 0.1, 500);
  camera.position.set(...position);
  camera.lookAt(new Vector3(...pose.target));
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return { camera, cls, rover, target: pose.target, position };
}

/** Screen pixels of a world point (`z` under 1: in front of the camera). */
export function toScreen(camera: PerspectiveCamera, at: Vec3, w: number, h: number): { x: number; y: number; z: number } {
  const v = new Vector3(...at).project(camera);
  return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, z: v.z };
}

/** Every point projects in front of the camera and inside `safe` (by default the class's HUD-safe box). */
export function expectFramed(settled: Pick<SettledFollow, "camera" | "cls">, points: readonly { label: string; at: Vec3 }[], w: number, h: number, safe = settled.cls === "mobile" ? PHONE_SAFE : DESKTOP_SAFE): void {
  for (const { label, at } of points) {
    const p = toScreen(settled.camera, at, w, h);
    expect(p.z, label).toBeLessThan(1);
    expect(p.x, label).toBeGreaterThanOrEqual(safe.side);
    expect(p.x, label).toBeLessThanOrEqual(w - safe.side);
    expect(p.y, label).toBeGreaterThanOrEqual(safe.top);
    expect(p.y, label).toBeLessThanOrEqual(h - safe.bottom);
  }
}
