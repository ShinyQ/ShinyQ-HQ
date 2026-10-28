import type { CameraClass, Vec2 } from "../types";
import type { CameraPose, Vec3 } from "./rigs";

/**
 * First person (owner request, round 5): zooming in past the closest third-person distance glides the
 * camera into the rover's eyes. Pure values and math; CameraDirector applies them.
 */
export const FIRST_PERSON = {
  /** Eye height above the floor (u); the rover's face screen is centered at 1.52. */
  eyeHeight: 1.55,
  /** Zooming in past the closest third-person distance by this factor enters first person. */
  enterPush: 0.85,
  /** Zooming out by this factor in first person returns to third person. */
  exitPush: 1 / 0.85,
  /** A pause (s) between zoom inputs forgets the push, so a stopped zoom never flips the view later. */
  pushIdle: 0.6,
  /** Glide length (s) between third and first person; reduced motion cuts. */
  glide: 0.45,
  /** Look elevation limits (radians): about 60 degrees down to 31 degrees up. */
  pitch: [-1.05, 0.55] as const,
  /** Look elevation on entering: slightly down, so the floor ahead reads. */
  look: -0.12,
  /** Near and far planes in first person (third person keeps CAMERA_NEAR and CAMERA_FAR). Far is past the fog's end, so nothing visible is cut. */
  near: 0.1,
  far: 72,
  /** Distance (u) of the look target in front of the eye. */
  lookDistance: 10,
  /** The body is solid until this blend and gone at `fadeTo`, before the camera is near its surface. */
  fadeFrom: 0.5,
  fadeTo: 0.9,
} as const;

/** Vertical FOV in first person, per camera class (wider than the follow rig, like a driver's view). */
export const FIRST_PERSON_FOV: Record<CameraClass, number> = { desktop: 65, tablet: 70, mobile: 80, landscape: 70 };

/** The Canvas camera's planes (`Experience.tsx`), restored whenever first person is off. Keep in sync. */
export const CAMERA_NEAR = 0.5;
export const CAMERA_FAR = 600;

/** Eye pose at the rover (`rover` is x, floor y, z) looking along `forward` (horizontal) tilted by `look`. */
export function firstPersonPose(cls: CameraClass, rover: Vec3, forward: Vec2, look: number): CameraPose {
  const eye: Vec3 = [rover[0], rover[1] + FIRST_PERSON.eyeHeight, rover[2]];
  const len = Math.hypot(forward.x, forward.z) || 1;
  const across = (Math.cos(look) * FIRST_PERSON.lookDistance) / len;
  return {
    position: eye,
    target: [eye[0] + forward.x * across, eye[1] + Math.sin(look) * FIRST_PERSON.lookDistance, eye[2] + forward.z * across],
    fov: FIRST_PERSON_FOV[cls],
  };
}

/** Smoothstep of the 0 to 1 blend, clamped, so the glide starts and lands softly. */
export function easeBlend(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Pose between `from` (third person) and `to` (the eye) at the eased `blend`. */
export function blendPoses(from: CameraPose, to: CameraPose, blend: number): CameraPose {
  const e = easeBlend(blend);
  return {
    position: [lerp(from.position[0], to.position[0], e), lerp(from.position[1], to.position[1], e), lerp(from.position[2], to.position[2], e)],
    target: [lerp(from.target[0], to.target[0], e), lerp(from.target[1], to.target[1], e), lerp(from.target[2], to.target[2], e)],
    fov: lerp(from.fov, to.fov, e),
  };
}

/** Rover body opacity for a blend: solid until `fadeFrom`, gone at `fadeTo`. */
export function roverOpacity(blend: number): number {
  return 1 - easeBlend((blend - FIRST_PERSON.fadeFrom) / (FIRST_PERSON.fadeTo - FIRST_PERSON.fadeFrom));
}

/** Opacity factor for the ghost floors above the rover: they fade out with the glide, so first person has no ceiling. */
export function ceilingOpacity(blend: number): number {
  return 1 - easeBlend(blend);
}

export interface ViewHold {
  phase: string;
  ride: boolean;
  beam: boolean;
  mission: boolean;
  /** The rover follows a path (autopilot, scrub, mission leg, elevator approach, arrival roll-on). */
  driving: boolean;
}

/** Phases in which a chosen first-person view stays on. */
const FIRST_PERSON_PHASES = new Set(["explore", "terminal", "palette"]);

/**
 * True while the view must stay in third person: autopilot drives, rides, beams, missions, rooms (the
 * drawer frames the rover), the hologram, the boot and the intro. First person comes back afterwards.
 */
export function viewSuspended(i: ViewHold): boolean {
  return !FIRST_PERSON_PHASES.has(i.phase) || i.ride || i.beam || i.mission || i.driving;
}
