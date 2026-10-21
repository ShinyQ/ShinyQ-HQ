import { Vector3, type PerspectiveCamera } from "three";
import { floorY, LOBBY } from "@/experience/config";
import { OFFICE, officeDock, officeSlots, officeTowerColumn } from "@/experience/floors/lobby/officeLayout";
import { OFFICE_ROVER } from "@/experience/floors/lobby/office/officeVisual";
import { roverScreenBox } from "@/experience/floors/library/decor/signFrame";
import { boxOf, followCamera } from "./office-cameras";

/**
 * How the office fills the frame from the office stop (Task 19, coordinator request 2026-10-20), as fractions of the
 * screen height from its top edge: the wall frame's top, and the band the console and the five Rovers project into
 * (every desk top's corners, every Rover from its treads to its head's top); whether the CI tower column (floor to top),
 * the ship dock pad and the visitor's Rover stand wholly inside the frame. Shared by tests/unit/office-view.test.ts and the
 * parameter search behind `OFFICE.view`.
 */
export interface OfficeFrame {
  /** The wall frame's top edge, from the top of the screen (0 top, 1 bottom). */
  wallTop: number;
  /** The console and the Rovers: the highest and the lowest projected point. */
  console: { top: number; bottom: number };
  tower: boolean;
  dock: boolean;
  rover: boolean;
}

const W = LOBBY.officeWing;
const SLOTS = officeSlots(W);
const Y = floorY("L1");
const HEAD_TOP = OFFICE_ROVER.head[1] + OFFICE_ROVER.head[4] / 2;

type Size = { width: number; height: number };
type Box = { x0: number; y0: number; x1: number; y1: number };

const inside = (b: Box, { width, height }: Size) => b.x0 >= 0 && b.x1 <= width && b.y0 >= 0 && b.y1 <= height;

/** Every point in front of the camera (a point behind it projects mirrored). */
const inFront = (camera: PerspectiveCamera, points: readonly (readonly [number, number, number])[]) =>
  points.every(([x, y, z]) => new Vector3(x, y, z).project(camera).z < 1);

/** The frame measured from `camera` (any pose). */
export function officeFrameOf(camera: PerspectiveCamera, size: Size): OfficeFrame {
  const { wall } = OFFICE;
  const top = boxOf(camera, size, [[W.wall.x, Y + wall.bottom + wall.h + wall.frame, W.wall.z - wall.t / 2]]).y0;
  const r = OFFICE.desk;
  const consolePoints = SLOTS.flatMap((s) => {
    const c = Math.cos(s.yaw);
    const sn = Math.sin(s.yaw);
    const desk = [-1, 1].flatMap((u) =>
      [-1, 1].map((v) => [s.desk.x + (u * r.w * c) / 2 + (v * r.d * sn) / 2, Y + r.top, s.desk.z - (u * r.w * sn) / 2 + (v * r.d * c) / 2] as const),
    );
    return [...desk, [s.rover.x, Y, s.rover.z] as const, [s.rover.x, Y + HEAD_TOP, s.rover.z] as const];
  });
  const band = boxOf(camera, size, consolePoints);
  const c = officeTowerColumn(W);
  const half = OFFICE.tower.column / 2;
  const towerPoints = [-1, 1].flatMap((u) => [-1, 1].flatMap((v) => [0, OFFICE.tower.plinth + OFFICE.tower.h].map((y) => [c.x + u * half, Y + y, c.z + v * half] as const)));
  const dock = officeDock(W);
  // The pad covers the whole south-west corner (`officeShell`), its top at `OFFICE.dock.pad`.
  const padPoints = [dock.minX, dock.maxX].flatMap((x) => [dock.minZ, dock.maxZ].map((z) => [x, Y + OFFICE.dock.pad, z] as const));
  const rover = roverScreenBox(camera, W.stop, Y, size, new Vector3(), { x0: 0, y0: 0, x1: 0, y1: 0 });
  return {
    wallTop: top / size.height,
    console: { top: band.y0 / size.height, bottom: band.y1 / size.height },
    tower: inFront(camera, towerPoints) && inside(boxOf(camera, size, towerPoints), size),
    dock: inFront(camera, padPoints) && inside(boxOf(camera, size, padPoints), size),
    rover: rover !== null && inside(rover, size),
  };
}

/** The frame from the settled follow camera at the office stop (`steps` zoom key presses in). */
export function officeFrame(width: number, height: number, steps = 0): OfficeFrame {
  return officeFrameOf(followCamera(width, height, W.stop, steps), { width, height });
}
