import type { Interactable } from "../../../interact/registry";
import { OFFICE, OFFICE_GITHUB_ROOM, OFFICE_ROOM, officeDeskRoom, officeWallRect, turnedHalf, type OfficeSlot } from "../officeLayout";

export interface OfficeTargetLabels {
  office: string;
  github: string;
  desk: (slot: number) => string;
}

/** Pick volume top of a Rover (antenna tip plus a hop). */
const ROVER_TOP = 2.7;

/**
 * The office's point-and-go targets, registered by OfficeScene while it is mounted (`registerExtraInteractables`,
 * like the Highlights Hall): the summary and GitHub halves of the wall and one per Rover. Every drive stops at
 * the office stop; the drawer opens there.
 */
export function officeInteractables(slots: readonly OfficeSlot[], labels: OfficeTargetLabels): Interactable[] {
  const at = { x: OFFICE.stop.x, z: OFFICE.stop.z };
  const wall = officeWallRect();
  const face = { minZ: wall.minZ, maxZ: wall.minZ + OFFICE.wall.t };
  const base = OFFICE.wall.bottom;
  const height = OFFICE.wall.bottom + OFFICE.wall.h;
  const front = OFFICE.deskRadius - OFFICE.desk.d / 2;
  const back = OFFICE.roverRadius + OFFICE.rover.radius;
  const mid = (front + back) / 2;
  const d = back - front;
  return [
    // Seen from the stop (looking south) the canvas's left half, the summary, is the wall's east half.
    { id: "L1:station:office", floor: "L1", kind: "station", label: labels.office, at, bounds: { minX: OFFICE.wall.x, maxX: wall.maxX, ...face }, base, height, action: { type: "open-room", room: OFFICE_ROOM } },
    { id: "L1:station:office-github", floor: "L1", kind: "station", label: labels.github, at, bounds: { minX: wall.minX, maxX: OFFICE.wall.x, ...face }, base, height, action: { type: "open-room", room: OFFICE_GITHUB_ROOM } },
    ...slots.map((s): Interactable => {
      const center = { x: OFFICE.center.x + mid * Math.sin(s.theta), z: OFFICE.center.z + mid * Math.cos(s.theta) };
      const h = turnedHalf(OFFICE.desk.w, d, s.yaw);
      return {
        id: `L1:station:office-desk-${s.slot + 1}`,
        floor: "L1",
        kind: "station",
        label: labels.desk(s.slot),
        at,
        bounds: { minX: center.x - h.x, maxX: center.x + h.x, minZ: center.z - h.z, maxZ: center.z + h.z },
        box: { center, w: OFFICE.desk.w, d, yaw: s.yaw },
        height: ROVER_TOP,
        action: { type: "open-room", room: officeDeskRoom(s.slot) },
      };
    }),
  ];
}
