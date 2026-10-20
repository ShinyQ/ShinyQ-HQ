import { PerspectiveCamera, Vector3 } from "three";
import { expect } from "vitest";
import { cameraWorld, clampCamera } from "@/experience/camera/collision";
import { CAMERA_FAR, CAMERA_NEAR } from "@/experience/camera/firstPerson";
import { followOffsetScale } from "@/experience/camera/offset";
import { createOrbitState, primeZone, setPitchRange, stepOrbit, zoneAt, zoomBy, type OrbitState } from "@/experience/camera/orbit";
import { FOLLOW_LOOK_AHEAD, followForward, followPose, pitchRange } from "@/experience/camera/rigs";
import { buildFloorLayouts, floorY } from "@/experience/config";
import type { ScreenBox } from "@/experience/fx/labelPlacement";
import { cameraClass } from "@/lib/viewport";

/**
 * Settled L1 follow cameras as `CameraDirector` builds them, shared by the office projection tests
 * (tests/unit/office-chip-placement.test.ts, tests/unit/office-beacon-view.test.ts).
 */
export const floor = buildFloorLayouts(8).L1;
export const world = cameraWorld(floor, floorY("L1"));

/**
 * The sizes the office is tuned on, with the HUD's pointer (coarse: the Corners minimap and joystick). The camera class
 * comes from the size (`cameraClass`): 1440 x 900, 1280 x 720 (Playwright's desktop) and 1180 x 820 use the desktop
 * camera, 820 x 1180 and 390 x 844 the portrait one ("mobile"), 960 x 640 (a tablet's viewport: near and far chips) and
 * 844 x 390 the tablet one.
 */
export const SIZES = [
  { id: "desktop", width: 1440, height: 900, coarse: false },
  { id: "small desktop", width: 1280, height: 720, coarse: false },
  { id: "landscape tablet", width: 1180, height: 820, coarse: true },
  { id: "portrait tablet", width: 820, height: 1180, coarse: true },
  { id: "tablet", width: 960, height: 640, coarse: true },
  { id: "phone", width: 390, height: 844, coarse: true },
  { id: "landscape phone", width: 844, height: 390, coarse: true },
] as const;

/**
 * The settled follow camera with the rover at `at`, as `CameraDirector` builds it: primed in the view zone there (the
 * office stop, the spawn; with `prime` false the plain follow view, as the rover drives into a zone before it eases),
 * zoomed in by `steps` zoom key presses (0.8 each; a hand zoom hands the framing back, so the zone's look offset on
 * portrait screens has eased out at the near pose), or turned by hand to `yaw` (the approach).
 */
export function followCamera(width: number, height: number, at: { x: number; z: number; heading?: number }, steps = 0, yaw?: number, prime = true): PerspectiveCamera {
  const cls = cameraClass(width, height);
  const orbit = createOrbitState();
  setPitchRange(orbit, pitchRange(cls, "follow"));
  primeZone(orbit, prime ? zoneAt("L1", at, floor.viewZones) : null, cls);
  if (yaw !== undefined) orbit.yaw = orbit.yawTarget = yaw;
  for (let i = 0; i < steps; i++) zoomBy(orbit, 0.8, false);
  for (let i = 0; i < 300 && orbit.easing; i++) stepOrbit(orbit, 1 / 60, false);
  expect(orbit.easing).toBe(false);
  return orbitCamera(orbit, width, height, at);
}

export type Pose = { position: Vector3; target: Vector3; fov: number };

/** The clamped follow pose `CameraDirector` wants from an orbit state with the rover at `at`. */
export function orbitPose(orbit: OrbitState, width: number, height: number, at: { x: number; z: number }): Pose {
  const cls = cameraClass(width, height);
  const rover: [number, number, number] = [at.x, floorY("L1") + 1, at.z];
  const f = followForward(cls, orbit.yaw);
  const ahead = FOLLOW_LOOK_AHEAD[cls];
  const pose = followPose(cls, [rover[0] + f.x * ahead, rover[1], rover[2] + f.z * ahead], orbit.yaw, orbit.zoom * followOffsetScale(cls, width / height), orbit.pitch, orbit.lookForward, orbit.lookUp);
  return { position: new Vector3(...clampCamera(pose.target, pose.position, world, rover, pose.fov)), target: new Vector3(...pose.target), fov: pose.fov };
}

/** A camera drawn at `pose`. */
export function poseCamera(pose: Pose, width: number, height: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(pose.fov, width / height, CAMERA_NEAR, CAMERA_FAR);
  camera.position.copy(pose.position);
  camera.lookAt(pose.target);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

/** The follow camera `CameraDirector` builds from an orbit state with the rover at `at`. */
export function orbitCamera(orbit: OrbitState, width: number, height: number, at: { x: number; z: number }): PerspectiveCamera {
  return poseCamera(orbitPose(orbit, width, height, at), width, height);
}

/** Screen box (CSS px) of world points. */
export function boxOf(camera: PerspectiveCamera, size: { width: number; height: number }, points: readonly (readonly [number, number, number])[]): ScreenBox {
  const v = new Vector3();
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const [x, y, z] of points) {
    v.set(x, y, z).project(camera);
    const px = ((v.x + 1) / 2) * size.width;
    const py = ((1 - v.y) / 2) * size.height;
    box.x0 = Math.min(box.x0, px);
    box.x1 = Math.max(box.x1, px);
    box.y0 = Math.min(box.y0, py);
    box.y1 = Math.max(box.y1, py);
  }
  return box;
}
