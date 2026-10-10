import { towardPad } from "../../nav/doors";
import type { DoorTrigger, Rect, Vec2 } from "../../types";

/** RF Roof element positions (appendix 01 section 6). Floor-local, pure. */
export const ROOF = {
  beacon: { x: 0, z: -6, r: 1.2 },
  /** Comms terminals sit on an arc of this radius in front of (+z of) the beacon. */
  arc: 10,
  /** Angle between neighbouring terminals (radians). */
  arcStep: (24 * Math.PI) / 180,
  terminal: { w: 1.8, d: 0.8, h: 1.1 },
  kiosk: { x: 10, z: 6, w: 3, d: 2 },
} as const;

/** Email plus LinkedIn, GitHub, Hugging Face, Medium, Google Scholar and IEEE Xplore. */
export const TERMINAL_COUNT = 7;
const STOP_GAP = 2.4;

export interface TerminalSlot {
  index: number;
  x: number;
  z: number;
  /** Yaw so the screen faces away from the beacon (local +z points outward). */
  angle: number;
}

const rect = (cx: number, cz: number, w: number, d: number): Rect => ({
  minX: cx - w / 2,
  maxX: cx + w / 2,
  minZ: cz - d / 2,
  maxZ: cz + d / 2,
});

/** Terminals spread symmetrically on the arc, the middle one straight in front of the beacon. */
export function terminalSlots(count = TERMINAL_COUNT): TerminalSlot[] {
  const { beacon, arc, arcStep } = ROOF;
  return Array.from({ length: count }, (_, index) => {
    const angle = (index - (count - 1) / 2) * arcStep;
    return { index, angle, x: beacon.x + arc * Math.sin(angle), z: beacon.z + arc * Math.cos(angle) };
  });
}

const middle = terminalSlots()[Math.floor(TERMINAL_COUNT / 2)];
const { kiosk } = ROOF;

/** Mission stops on the Roof. */
export const ROOF_STOPS: Record<"contact" | "cv", Vec2> = {
  contact: { x: middle.x, z: middle.z + ROOF.terminal.d / 2 + STOP_GAP },
  cv: { x: kiosk.x, z: kiosk.z + kiosk.d / 2 + STOP_GAP },
};

/** Navgrid obstacles (before rover inflation). Terminals use a square that covers any yaw. */
export function roofObstacles(count = TERMINAL_COUNT): Rect[] {
  const { beacon, terminal } = ROOF;
  const side = Math.max(terminal.w, terminal.d);
  return [
    rect(beacon.x, beacon.z, beacon.r * 2, beacon.r * 2),
    ...terminalSlots(count).map((t) => rect(t.x, t.z, side, side)),
    rect(kiosk.x, kiosk.z, kiosk.w, kiosk.d),
  ];
}

/** Door triggers: in front of the middle comms terminal and the CV kiosk. */
export const ROOF_DOORS: DoorTrigger[] = [
  { room: "RF:contact", at: ROOF_STOPS.contact, facing: { x: 0, z: -1 } },
  { room: "RF:cv", at: ROOF_STOPS.cv, facing: { x: 0, z: -1 } },
];

const LANE_Z = ROOF_STOPS.cv.z;

/** Prototype data lanes on RF: from the elevator around the comms arc toward the CV kiosk, with a spur to the email terminal. Lanes stop before door pads. */
export const ROOF_LANES: [number, number][][] = [
  [[-17, 0], [-17, LANE_Z], towardPad([-17, LANE_Z], ROOF_STOPS.cv)],
  [[ROOF_STOPS.contact.x, LANE_Z], towardPad([ROOF_STOPS.contact.x, LANE_Z], ROOF_STOPS.contact)],
];
