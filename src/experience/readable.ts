import type { Vec3 } from "./camera/rigs";
import type { Vec2 } from "./types";

/**
 * The phone reading rule (spec 2026-10-28, section 4.2): every title and name on L2, L3, L4 and RF reads at least
 * 10 CSS px tall on a 390 x 844 portrait phone (9 px at 375 x 667) from the pose a visitor reads it from. Types only:
 * each floor's `readable.ts` lists its labels from the same pure data its components draw, for
 * `tests/unit/phone-reading.test.ts`.
 */

/** Where a visitor reads a label from: the rover at `at` heading `heading` (forward `(sin h, cos h)`); `primed` for an arrival. */
export type ReadingPose = { at: Vec2; heading: number; primed?: boolean };

export type Readable = {
  id: string;
  text: string;
  /** Middle of the label's title line (floor-local). */
  at: Vec3;
  fontSize: number;
  /** Width of the title line or the sign plate (u, at `fontSize`), when known: both ends stay on screen. */
  width?: number;
  /** The width as drawn on camera class `mobile`, when the phone size or wrap changes it otherwise than in proportion. */
  phoneWidth?: number;
  /** The size used on camera class `mobile` (portrait screens), when it differs. */
  phoneFontSize?: number;
  /** The side a fixed label faces (0 faces +z); none for labels that turn to the camera. */
  yaw?: number;
  /** Turns half a turn when the camera is behind it (`Readable` in fx/Readable.tsx, double-faced boards). */
  flips?: boolean;
  /** Turns fully to the camera (drei `Billboard`), tilting with it too. */
  billboard?: boolean;
  /** Leans back by this angle (radians), away from the side it faces. */
  tilt?: number;
  reading: ReadingPose;
};

/** Heading (forward `(sin h, cos h)`) from `from` toward `to`. */
export const headingTo = (from: Vec2, to: Vec2): number => Math.atan2(to.x - from.x, to.z - from.z);
