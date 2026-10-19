import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { cameraWorld, clampCamera } from "@/experience/camera/collision";
import { CAMERA_FAR, CAMERA_NEAR } from "@/experience/camera/firstPerson";
import { followOffsetScale } from "@/experience/camera/offset";
import { createOrbitState, primeZone, setPitchRange, zoneAt, zoomBy } from "@/experience/camera/orbit";
import { FOLLOW_LOOK_AHEAD, followForward, followPose, pitchRange } from "@/experience/camera/rigs";
import { buildFloorLayouts, floorY, LOBBY } from "@/experience/config";
import { roverScreenBox } from "@/experience/floors/library/decor/signFrame";
import { OFFICE, officeSlots } from "@/experience/floors/lobby/officeLayout";
import { writeDeskScreen } from "@/experience/floors/lobby/office/officeRig";
import { CHIP_ROW, nextChipFar, officeRuntime } from "@/experience/floors/lobby/office/runtime";
import { boxesOverlap, type ScreenBox } from "@/experience/fx/labelPlacement";
import { cameraClass, viewportClass } from "@/lib/viewport";

/**
 * Office chips against the screen wall (owner review 2026-10-19): from the office stop, on every camera class, no
 * chip may cover the wall's screens (MISSION CONTROL and GITHUB), a desk screen or the visitor's rover. The follow
 * camera as `CameraDirector` settles it in the `L1:office` view zone (look-ahead, offset scale, camera collision),
 * the chips placed as `OfficeWatch` places them (the anchor projected, the chip hanging up from it, x clamped 8 px
 * inside the screen edges) with conservative CSS sizes.
 */

const floor = buildFloorLayouts(8).L1;
const world = cameraWorld(floor, floorY("L1"));
const W = LOBBY.officeWing;
const slots = officeSlots(W);
/**
 * Chip sizes (px): a far chip (one 32 px pill, `min-h-8`, wider than any head line), a near one (conservative: the
 * pill, the task line and the CI bar), a phone's compact far dot (32 x 32).
 */
const CHIP = { far: { w: 200, h: 32 }, near: { w: 220, h: 84 }, compact: { w: 32, h: 32 } } as const;

const SIZES = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "landscape tablet", width: 1180, height: 820 },
  { id: "portrait tablet", width: 820, height: 1180 },
  { id: "phone", width: 390, height: 844 },
  { id: "landscape phone", width: 844, height: 390 },
] as const;

/** The settled follow camera at the office stop, zoomed in by `steps` zoom key presses (0.8 each). */
function stopCamera(width: number, height: number, steps = 0): PerspectiveCamera {
  const cls = cameraClass(width, height);
  const orbit = createOrbitState();
  setPitchRange(orbit, pitchRange(cls, "follow"));
  const zone = zoneAt("L1", W.stop, floor.viewZones);
  expect(zone?.id).toBe("L1:office");
  primeZone(orbit, zone, cls);
  for (let i = 0; i < steps; i++) zoomBy(orbit, 0.8, false);
  const rover: [number, number, number] = [W.stop.x, floorY("L1") + 1, W.stop.z];
  const f = followForward(cls, orbit.yaw);
  const ahead = FOLLOW_LOOK_AHEAD[cls];
  const pose = followPose(cls, [rover[0] + f.x * ahead, rover[1], rover[2] + f.z * ahead], orbit.yaw, orbit.zoom * followOffsetScale(cls, width / height), orbit.pitch);
  const camera = new PerspectiveCamera(pose.fov, width / height, CAMERA_NEAR, CAMERA_FAR);
  camera.position.set(...clampCamera(pose.target, pose.position, world, rover, pose.fov));
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

/** Screen box (CSS px) of world points. */
function boxOf(camera: PerspectiveCamera, size: { width: number; height: number }, points: readonly (readonly [number, number, number])[]): ScreenBox {
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

/** The whole screen wall, frame included (both text panels fill it). */
function wallBox(camera: PerspectiveCamera, size: { width: number; height: number }): ScreenBox {
  const { x, z } = W.wall;
  const { w, h, bottom, frame } = OFFICE.wall;
  const xs = [x - w / 2 - frame, x + w / 2 + frame];
  const ys = [bottom - frame, bottom + h + frame];
  return boxOf(camera, size, xs.flatMap((px) => ys.map((py) => [px, py, z] as const)));
}

function deskScreenBoxes(camera: PerspectiveCamera, size: { width: number; height: number }): ScreenBox[] {
  const positions = new Float32Array(12);
  return slots.map((s) => {
    writeDeskScreen(s, positions, 0);
    return boxOf(camera, size, [0, 1, 2, 3].map((k) => [positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]] as const));
  });
}

/** A chip's box as `OfficeWatch` places it: centered on the anchor's x (clamped 8 px inside the edges), hanging up from it. */
function chipBox(camera: PerspectiveCamera, size: { width: number; height: number }, slot: number, chip: { w: number; h: number }): ScreenBox | null {
  const a = officeRuntime.anchors[slot];
  const v = new Vector3(a.x, a.y, a.z).project(camera);
  if (!(v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1)) return null;
  const edge = chip.w / 2 + 8;
  const x = Math.min(Math.max(((v.x + 1) / 2) * size.width, edge), size.width - edge);
  const y = ((1 - v.y) / 2) * size.height;
  return { x0: x - chip.w / 2, y0: y - chip.h, x1: x + chip.w / 2, y1: y };
}

describe("Agent Office chips at the office stop", () => {
  it("anchor still on the wall's front face over its frame, at each Rover's x, in an arc (no pose moves them)", () => {
    const { wall } = OFFICE;
    const top = wall.bottom + wall.h + wall.frame;
    expect(officeRuntime.anchors.map((a) => a.x)).toEqual(slots.map((s) => s.rover.x));
    for (const a of officeRuntime.anchors) {
      expect(a.z).toBeCloseTo(W.wall.z - wall.t / 2);
      expect(a.y).toBeGreaterThanOrEqual(top + CHIP_ROW.gap - 1e-9);
    }
    // Neighbours never share a row.
    for (let i = 1; i < slots.length; i++) expect(Math.abs(officeRuntime.anchors[i].y - officeRuntime.anchors[i - 1].y)).toBeCloseTo(CHIP_ROW.step);
  });

  describe.each(SIZES)("$id ($width x $height)", ({ width, height }) => {
    const size = { width, height };
    const compact = viewportClass(width, height) === "mobile";

    it("never cover the screen wall, a desk screen or the visitor's rover, and stay on screen", () => {
      const camera = stopCamera(width, height);
      const wall = wallBox(camera, size);
      const desks = deskScreenBoxes(camera, size);
      const rover = roverScreenBox(camera, W.stop, floorY("L1"), size, new Vector3(), { x0: 0, y0: 0, x1: 0, y1: 0 });
      expect(rover).not.toBeNull();
      const boxes: ScreenBox[] = [];
      for (const s of slots) {
        const a = officeRuntime.anchors[s.slot];
        // Far from the stop (one line), as the scene's far band decides it.
        expect(nextChipFar(true, camera.position.distanceTo(new Vector3(a.x, a.y, a.z))), `slot ${s.slot} far`).toBe(true);
        const box = chipBox(camera, size, s.slot, compact ? CHIP.compact : CHIP.far);
        if (!box) continue;
        boxes.push(box);
        expect(boxesOverlap(box, wall), `slot ${s.slot} on the wall`).toBe(false);
        desks.forEach((d, i) => expect(boxesOverlap(box, d), `slot ${s.slot} on desk screen ${i}`).toBe(false));
        expect(boxesOverlap(box, rover!), `slot ${s.slot} on the rover`).toBe(false);
        expect(box.y0, `slot ${s.slot} above the screen top`).toBeGreaterThanOrEqual(0);
      }
      expect(boxes).toHaveLength(slots.length);
      // Nor one another (the arc puts neighbours on different rows).
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(boxesOverlap(boxes[i], boxes[j]), `slots ${i} and ${j}`).toBe(false);
    });

    it("keep clear of the wall when zoomed in until they show their task lines", () => {
      const camera = stopCamera(width, height, 2);
      const wall = wallBox(camera, size);
      for (const s of slots) {
        const a = officeRuntime.anchors[s.slot];
        const far = nextChipFar(false, camera.position.distanceTo(new Vector3(a.x, a.y, a.z)));
        const box = chipBox(camera, size, s.slot, far ? (compact ? CHIP.compact : CHIP.far) : CHIP.near);
        if (box) expect(boxesOverlap(box, wall), `slot ${s.slot} on the wall`).toBe(false);
      }
    });
  });
});
