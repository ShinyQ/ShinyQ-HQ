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
import { CHIP_ROW, nextChipFar, OFFICE_CHIP_FAR, OFFICE_CHIP_FAR_BAND, OFFICE_CHIP_TOP, officeRuntime } from "@/experience/floors/lobby/office/runtime";
import { boxesOverlap, type ScreenBox } from "@/experience/fx/labelPlacement";
import { hudLayout } from "@/hud/layout";
import { cameraClass, viewportClass } from "@/lib/viewport";

/**
 * Office chips against the screen wall (owner review 2026-10-19): from the office stop, on every camera class, no
 * chip may cover the wall's screens (MISSION CONTROL and GITHUB), a desk screen or the visitor's rover. The follow
 * camera as `CameraDirector` settles it in the `L1:office` view zone (look-ahead, offset scale, camera collision),
 * the chips placed as `OfficeWatch` places them (the anchor projected, the chip hanging up from it, x clamped 8 px
 * inside the screen edges, y clamped under the HUD's top bar) with conservative CSS sizes. Zoomed in from the stop
 * until the middle three show their task lines, the near chips keep clear of the same and of the HUD.
 */

const floor = buildFloorLayouts(8).L1;
const world = cameraWorld(floor, floorY("L1"));
const W = LOBBY.officeWing;
const slots = officeSlots(W);
/**
 * Chip sizes (px): a far chip (one 32 px pill, `min-h-8`, wider than any head line), a near one (conservative: the
 * 32 px pill, the 20 px task line and the 4 px CI bar with their 4 px gaps make 64, plus 4; the task line stops at
 * 200 px), a phone's compact far dot (32 x 32).
 */
const CHIP = { far: { w: 200, h: 32 }, near: { w: 220, h: 68 }, compact: { w: 32, h: 32 } } as const;

/**
 * The HUD chips must stay out of (px, measured in the browser at these sizes): the top bar (62 px desktop, 60 px
 * tablets, 58 px phones; `OfficeWatch` clamps under `OFFICE_CHIP_TOP`), the bottom band (the hint's top is 62 px
 * over the bottom edge, 82 px on a portrait tablet), the desktop profile card and elevator panel, and the Corners
 * minimap (tablets 112 px at top 76, phones 72 px at top 64) and joystick.
 */
const HUD = { bottom: 84 } as const;

function hudBoxes({ width: w, height: h }: { width: number; height: number }, coarse: boolean): { id: string; box: ScreenBox }[] {
  const layout = hudLayout(viewportClass(w, h), coarse);
  if (layout === "desktop")
    return [
      { id: "profile card", box: { x0: 16, y0: 16, x1: 296, y1: 153 } },
      { id: "elevator panel", box: { x0: w - 235, y0: (h - 284) / 2, x1: w - 16, y1: (h + 284) / 2 } },
    ];
  const minimap = layout === "phone" ? { x0: w - 84, y0: 64, x1: w - 12, y1: 136 } : { x0: w - 128, y0: 76, x1: w - 16, y1: 188 };
  return [
    { id: "minimap", box: minimap },
    { id: "joystick", box: { x0: 0, y0: h - 144, x1: 160, y1: h } },
  ];
}

/** A chip box clears every HUD box and stays between the top bar and the bottom band. */
function expectClearOfHud(box: ScreenBox, size: { width: number; height: number }, coarse: boolean, what: string) {
  expect(box.y0, `${what} under the top bar`).toBeGreaterThanOrEqual(hudTop(size) - 1e-9);
  expect(box.y1, `${what} over the bottom band`).toBeLessThanOrEqual(size.height - HUD.bottom);
  for (const { id, box: hud } of hudBoxes(size, coarse)) expect(boxesOverlap(box, hud), `${what} on the ${id}`).toBe(false);
}

const SIZES = [
  { id: "desktop", width: 1440, height: 900, coarse: false },
  { id: "landscape tablet", width: 1180, height: 820, coarse: true },
  { id: "portrait tablet", width: 820, height: 1180, coarse: true },
  { id: "phone", width: 390, height: 844, coarse: true },
  { id: "landscape phone", width: 844, height: 390, coarse: true },
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

/** The top bar clamp `OfficeWatch` uses (phones by the HUD's viewport class). */
const hudTop = (size: { width: number; height: number }) => OFFICE_CHIP_TOP[viewportClass(size.width, size.height) === "mobile" ? "mobile" : "desktop"];

/**
 * A chip's box as `OfficeWatch` places it: centered on the anchor's x (clamped 8 px inside the edges), hanging up
 * from it, its top never above the HUD's top bar.
 */
function chipBox(camera: PerspectiveCamera, size: { width: number; height: number }, slot: number, chip: { w: number; h: number }): ScreenBox | null {
  const a = officeRuntime.anchors[slot];
  const v = new Vector3(a.x, a.y, a.z).project(camera);
  if (!(v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1)) return null;
  const edge = chip.w / 2 + 8;
  const x = Math.min(Math.max(((v.x + 1) / 2) * size.width, edge), size.width - edge);
  const y = Math.max(((1 - v.y) / 2) * size.height, hudTop(size) + chip.h);
  return { x0: x - chip.w / 2, y0: y - chip.h, x1: x + chip.w / 2, y1: y };
}

/** Distance from the camera to a chip's anchor. */
const anchorDistance = (camera: PerspectiveCamera, slot: number) => {
  const a = officeRuntime.anchors[slot];
  return camera.position.distanceTo(new Vector3(a.x, a.y, a.z));
};

/**
 * Two zoom key presses from the office stop bring the middle three chips near, so they show their task lines
 * (e2e/office.spec.ts `nearChips` and scripts/office-shots.ts do the same). Phones are covered apart, below. Known
 * limit (Task W3 tunes the class views): at 1280 x 720 the two rows of near chips do not fit between the top bar
 * and the wall, so the upper row, held under the bar, touches the lower one.
 */
const NEAR_STEPS = [
  { id: "desktop", width: 1440, height: 900, coarse: false, steps: 2 },
  { id: "landscape tablet", width: 1180, height: 820, coarse: true, steps: 2 },
  { id: "portrait tablet", width: 820, height: 1180, coarse: true, steps: 2 },
] as const;

/** Near: the scene's far band flips a far chip to near under this distance. */
const NEAR = OFFICE_CHIP_FAR - OFFICE_CHIP_FAR_BAND;

/** Every chip's box at the pose, its size from the scene's far flag (a far chip starts far, as at the stop). */
function chipBoxes(camera: PerspectiveCamera, size: { width: number; height: number }) {
  const compact = viewportClass(size.width, size.height) === "mobile";
  return slots.map((s) => {
    const far = nextChipFar(true, anchorDistance(camera, s.slot));
    return { slot: s.slot, far, box: chipBox(camera, size, s.slot, far ? (compact ? CHIP.compact : CHIP.far) : CHIP.near) };
  });
}

describe("Agent Office chips at the office stop", () => {
  it("anchor still on the wall's front face over its frame, at each Rover's x, in two rows (no pose moves them)", () => {
    const { wall } = OFFICE;
    const top = wall.bottom + wall.h + wall.frame;
    expect(officeRuntime.anchors.map((a) => a.x)).toEqual(slots.map((s) => s.rover.x));
    for (const a of officeRuntime.anchors) {
      expect(a.z).toBeCloseTo(W.wall.z - wall.t / 2);
      expect(a.y).toBeGreaterThanOrEqual(top + CHIP_ROW.gap - 1e-9);
      expect(a.y).toBeLessThanOrEqual(top + CHIP_ROW.gap + CHIP_ROW.step + 1e-9);
    }
    // Neighbours never share a row.
    for (let i = 1; i < slots.length; i++) expect(Math.abs(officeRuntime.anchors[i].y - officeRuntime.anchors[i - 1].y)).toBeCloseTo(CHIP_ROW.step);
  });

  describe.each(SIZES)("$id ($width x $height)", ({ width, height, coarse }) => {
    const size = { width, height };
    const compact = viewportClass(width, height) === "mobile";

    it("never cover the screen wall, a desk screen or the visitor's rover, and stay on screen under the HUD's bars", () => {
      const camera = stopCamera(width, height);
      const wall = wallBox(camera, size);
      const desks = deskScreenBoxes(camera, size);
      const rover = roverScreenBox(camera, W.stop, floorY("L1"), size, new Vector3(), { x0: 0, y0: 0, x1: 0, y1: 0 });
      expect(rover).not.toBeNull();
      const boxes: ScreenBox[] = [];
      for (const s of slots) {
        // Far from the stop (one line), as the scene's far band decides it.
        expect(nextChipFar(true, anchorDistance(camera, s.slot)), `slot ${s.slot} far`).toBe(true);
        const box = chipBox(camera, size, s.slot, compact ? CHIP.compact : CHIP.far);
        if (!box) continue;
        boxes.push(box);
        expect(boxesOverlap(box, wall), `slot ${s.slot} on the wall`).toBe(false);
        desks.forEach((d, i) => expect(boxesOverlap(box, d), `slot ${s.slot} on desk screen ${i}`).toBe(false));
        expect(boxesOverlap(box, rover!), `slot ${s.slot} on the rover`).toBe(false);
        expectClearOfHud(box, size, coarse, `slot ${s.slot}`);
      }
      expect(boxes).toHaveLength(slots.length);
      // Nor one another (the rows put neighbours at different heights).
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(boxesOverlap(boxes[i], boxes[j]), `slots ${i} and ${j}`).toBe(false);
    });
  });

  describe.each(NEAR_STEPS)("zoomed in on a $id ($width x $height, $steps steps)", ({ width, height, coarse, steps }) => {
    const size = { width, height };

    it("the middle three show their task lines and clear the wall, the desk screens, the rover, one another and the HUD", () => {
      const camera = stopCamera(width, height, steps);
      const wall = wallBox(camera, size);
      const desks = deskScreenBoxes(camera, size);
      const rover = roverScreenBox(camera, W.stop, floorY("L1"), size, new Vector3(), { x0: 0, y0: 0, x1: 0, y1: 0 })!;
      const chips = chipBoxes(camera, size);
      for (const slot of [1, 2, 3]) {
        expect(anchorDistance(camera, slot), `slot ${slot} near`).toBeLessThan(NEAR);
        expect(chips[slot].box, `slot ${slot} on screen`).not.toBeNull();
      }
      const shown = chips.filter((c) => c.box);
      for (const { slot, box } of shown) {
        expect(boxesOverlap(box!, wall), `slot ${slot} on the wall`).toBe(false);
        desks.forEach((d, i) => expect(boxesOverlap(box!, d), `slot ${slot} on desk screen ${i}`).toBe(false));
        expect(boxesOverlap(box!, rover), `slot ${slot} on the rover`).toBe(false);
        expectClearOfHud(box!, size, coarse, `slot ${slot}`);
      }
      for (let i = 0; i < shown.length; i++)
        for (let j = i + 1; j < shown.length; j++) expect(boxesOverlap(shown[i].box!, shown[j].box!), `slots ${shown[i].slot} and ${shown[j].slot}`).toBe(false);
    });
  });

  /**
   * Phones (known limit, reported for Task W3): two zoom steps bring the middle three near, on screen, under the top
   * bar, over the bottom band and clear of the wall, the desk screens and the rover. But a portrait phone has no room
   * for three near chips (up to 220 px wide each) over the wall: desks 2 and 4 share a row and cannot sit side by
   * side in 390 px, desk 3's chip a row higher touches them, and desk 4's chip reaches under the minimap. A landscape
   * phone's 390 px of height has no room over the wall for a near chip (checked far at the stop above).
   */
  it("phone (390 x 844): two steps bring the middle three near, clear of the wall, the desk screens, the rover and the bars", () => {
    const size = { width: 390, height: 844 };
    const camera = stopCamera(size.width, size.height, 2);
    const wall = wallBox(camera, size);
    const desks = deskScreenBoxes(camera, size);
    const rover = roverScreenBox(camera, W.stop, floorY("L1"), size, new Vector3(), { x0: 0, y0: 0, x1: 0, y1: 0 })!;
    const chips = chipBoxes(camera, size);
    for (const slot of [1, 2, 3]) {
      expect(anchorDistance(camera, slot), `slot ${slot} near`).toBeLessThan(NEAR);
      const box = chips[slot].box!;
      expect(box, `slot ${slot} on screen`).not.toBeNull();
      expect(boxesOverlap(box, wall), `slot ${slot} on the wall`).toBe(false);
      desks.forEach((d, i) => expect(boxesOverlap(box, d), `slot ${slot} on desk screen ${i}`).toBe(false));
      expect(boxesOverlap(box, rover), `slot ${slot} on the rover`).toBe(false);
      expect(box.y0).toBeGreaterThanOrEqual(hudTop(size) - 1e-9);
      expect(box.y1).toBeLessThanOrEqual(size.height - HUD.bottom);
    }
  });

  it("never go under the HUD's top bar: zoomed in past the near pose, a chip whose anchor rises that high stops right under it", () => {
    for (const { width, height } of [...SIZES, { width: 1280, height: 720 }]) {
      const size = { width, height };
      const camera = stopCamera(width, height, 4);
      let clamped = 0;
      for (const { slot, box } of chipBoxes(camera, size)) {
        if (!box) continue;
        expect(box.y0, `slot ${slot} at ${width} x ${height}`).toBeGreaterThanOrEqual(hudTop(size) - 1e-9);
        const a = officeRuntime.anchors[slot];
        const raw = ((1 - new Vector3(a.x, a.y, a.z).project(camera).y) / 2) * height;
        if (raw - (box.y1 - box.y0) < hudTop(size)) {
          clamped += 1;
          expect(box.y0).toBeCloseTo(hudTop(size));
        }
      }
      if (width === 1440) expect(clamped, "the desktop pose exercises the clamp").toBeGreaterThan(0);
    }
  });
});
