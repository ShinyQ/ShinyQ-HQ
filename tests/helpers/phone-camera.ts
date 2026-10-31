import { PerspectiveCamera, Vector3 } from "three";
import type { FloorId } from "@/content/schema";
import { ARRIVAL_YAW } from "@/experience/camera/arrival";
import { followOffsetScale } from "@/experience/camera/offset";
import { zoneAt, zoneView } from "@/experience/camera/orbit";
import { FOLLOW_LOOK_AHEAD, followForward, followPose, railPose, type CameraPose, type Vec3 } from "@/experience/camera/rigs";
import { roadZAt } from "@/experience/floors/career/layout";
import type { Readable, ReadingPose } from "@/experience/readable";
import type { CameraClass, FloorLayout } from "@/experience/types";
import { cameraClass, phoneCamera } from "@/lib/viewport";

/**
 * Settled camera poses for pure tests, mirroring `CameraDirector`: the rover at a point with a heading, the zone
 * `zoneAt` finds there (an `arrivalOnly` zone only when primed, as an arrival or a deep link primes it) and the rig's
 * pose with the follow look-ahead and the screen's offset scale (L2: the rail). Without a zone the follow camera keeps
 * the arrival yaw every arrival leaves it on (a zone without a class `pitch` never turns it back) at zoom 1, and the
 * rail its side view. Camera collision is not modelled (it only ever pulls the camera in).
 */
export const rigOf = (floor: FloorId): "follow" | "rail" => (floor === "L2" ? "rail" : "follow");

export function readingPose(floor: FloorId, layout: FloorLayout, reading: ReadingPose, w: number, h: number): CameraPose {
  const cls = cameraClass(w, h);
  const { at, heading, primed = false } = reading;
  const found = zoneAt(floor, { ...at, heading }, layout.viewZones, cls);
  const zone = found && (!found.arrivalOnly || primed) ? found : null;
  const view = zone ? zoneView(zone, cls, primed) : null;
  const zoom = view?.zoom ?? 1;
  const look = view?.lookOffset;
  const pitch = view?.pitch ?? 0;
  if (rigOf(floor) === "rail") {
    const axis = layout.road?.roads[0]?.points ?? [];
    const railYaw = zone?.railYaw;
    return railPose(cls, at.x, 0, zoom, at.z, railYaw ?? 0, roadZAt(axis, at.x), pitch, railYaw !== undefined, look?.right ?? 0, look?.up ?? 0);
  }
  const yaw = view?.yaw ?? ARRIVAL_YAW;
  const forward = followForward(cls, yaw);
  const ahead = FOLLOW_LOOK_AHEAD[cls];
  const target: Vec3 = [at.x + forward.x * ahead, 1, at.z + forward.z * ahead];
  return followPose(cls, target, yaw, zoom * followOffsetScale(cls, w / h), pitch, look?.forward ?? 0, look?.up ?? 0, look?.right ?? 0);
}

export function cameraOf(pose: CameraPose, w: number, h: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(pose.fov, w / h, 0.1, 500);
  camera.position.set(...pose.position);
  camera.lookAt(new Vector3(...pose.target));
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

export function screen(camera: PerspectiveCamera, w: number, h: number, p: Vec3): { x: number; y: number; front: boolean } {
  const v = new Vector3(...p).project(camera);
  return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, front: v.z < 1 };
}

/** The label's font size on a camera class: its phone size on class `mobile` when it has one. */
export const fontOf = (l: Pick<Readable, "fontSize" | "phoneFontSize">, cls: CameraClass): number => (phoneCamera(cls) ? (l.phoneFontSize ?? l.fontSize) : l.fontSize);

/** The label's up direction: vertical, leaning back by its `tilt` away from the side it faces (`yaw`, 0 faces +z; else toward the camera). */
function upOf(l: Pick<Readable, "yaw" | "tilt" | "at" | "flips">, camera: Vector3): Vec3 {
  const t = l.tilt ?? 0;
  const toward = Math.atan2(camera.x - l.at[0], camera.z - l.at[2]);
  const behind = l.yaw !== undefined && l.flips && Math.cos(toward - l.yaw) < 0;
  const y = l.yaw === undefined ? toward : behind ? l.yaw + Math.PI : l.yaw;
  return [-Math.sin(t) * Math.sin(y), Math.cos(t), -Math.sin(t) * Math.cos(y)];
}

/** On-screen height (CSS px) of the label's em box: `at` plus and minus half its font size along its up direction. */
export function emPx(camera: PerspectiveCamera, w: number, h: number, l: Readable, cls: CameraClass): number {
  const half = fontOf(l, cls) / 2;
  const up: Vec3 = l.billboard ? (new Vector3(0, 1, 0).applyQuaternion(camera.quaternion).toArray() as Vec3) : upOf(l, camera.position);
  const top = screen(camera, w, h, [l.at[0] + up[0] * half, l.at[1] + up[1] * half, l.at[2] + up[2] * half]);
  const bottom = screen(camera, w, h, [l.at[0] - up[0] * half, l.at[1] - up[1] * half, l.at[2] - up[2] * half]);
  return Math.hypot(bottom.x - top.x, bottom.y - top.y);
}

/**
 * Horizontal angle (radians) between the side a fixed-yaw label faces and the direction to the camera; a label that
 * turns around when the camera is behind it (`flips`, the `Readable` wrapper) faces whichever side is nearer. 0 for
 * labels that turn to the camera (no `yaw`).
 */
export function facingAngle(l: Readable, camera: Vec3): number {
  if (l.yaw === undefined) return 0;
  const dx = camera[0] - l.at[0];
  const dz = camera[2] - l.at[2];
  const len = Math.hypot(dx, dz) || 1;
  const cos = (Math.sin(l.yaw) * dx + Math.cos(l.yaw) * dz) / len;
  const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
  return l.flips ? Math.min(angle, Math.PI - angle) : angle;
}

/**
 * Both ends of the label's title line on screen (CSS px), along its facing (or square to the camera when it turns to it),
 * scaled to the class's font size; null without a `width`.
 */
export function endsPx(camera: PerspectiveCamera, w: number, h: number, l: Readable, cls: CameraClass): { x: number; y: number; front: boolean }[] | null {
  if (l.width === undefined) return null;
  const half = (phoneCamera(cls) && l.phoneWidth !== undefined ? l.phoneWidth : (l.width * fontOf(l, cls)) / l.fontSize) / 2;
  const toward = Math.atan2(camera.position.x - l.at[0], camera.position.z - l.at[2]);
  const flipped = l.yaw !== undefined && l.flips && Math.cos(toward - l.yaw) < 0;
  const yaw = l.yaw === undefined ? toward : flipped ? l.yaw + Math.PI : l.yaw;
  // Text reads along +x at yaw 0, so its right is (cos yaw, -sin yaw).
  const r = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  return [-1, 1].map((k) => screen(camera, w, h, [l.at[0] + k * r.x * half, l.at[1], l.at[2] + k * r.z * half]));
}
