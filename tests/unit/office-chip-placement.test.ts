import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { cameraWorld, clampCamera } from "@/experience/camera/collision";
import { CAMERA_FAR, CAMERA_NEAR } from "@/experience/camera/firstPerson";
import { followOffsetScale } from "@/experience/camera/offset";
import { createOrbitState, primeZone, setPitchRange, stepOrbit, updateZone, yawLooking, zoneAt, zoomBy, type OrbitState } from "@/experience/camera/orbit";
import { FOLLOW_LOOK_AHEAD, followForward, followPose, pitchRange } from "@/experience/camera/rigs";
import { buildFloorLayouts, floorY, LOBBY, ROVER_HEIGHT } from "@/experience/config";
import { yawTowards } from "@/experience/fx/facing";
import { signPlate } from "@/experience/fx/signLayout";
import { roverScreenBox } from "@/experience/floors/library/decor/signFrame";
import { OFFICE, officeSlots } from "@/experience/floors/lobby/officeLayout";
import { writeDeskScreen } from "@/experience/floors/lobby/office/officeRig";
import { OFFICE_ROVER } from "@/experience/floors/lobby/office/officeVisual";
import {
  CHIP_ROW,
  nextChipFar,
  OFFICE_CHIP_ANCHORS,
  OFFICE_CHIP_FAR,
  OFFICE_CHIP_FAR_BAND,
  OFFICE_CHIP_TOP,
  officeChipsHere,
  officeSign,
  wingSignHidden,
} from "@/experience/floors/lobby/officeShell";
import { boxesOverlap, type ScreenBox } from "@/experience/fx/labelPlacement";
import type { ViewportClass } from "@/experience/types";
import { hudLayout } from "@/hud/layout";
import { cameraClass, viewportClass } from "@/lib/viewport";

/**
 * Office chips against the screen wall (owner review 2026-10-19): from the office stop, on every camera class, no
 * chip may cover the wall's screens (MISSION CONTROL and GITHUB), a desk screen or the visitor's rover. The follow
 * camera as `CameraDirector` settles it in the `L1:office` view zone (look-ahead, offset scale, camera collision),
 * the chips placed as `OfficeWatch` places them (the anchor projected, the chip hanging up from it, x clamped 8 px
 * inside the screen edges, y clamped under the HUD's top bar) with conservative CSS sizes. Zoomed in from the stop
 * until the middle three show their task lines, the near chips keep clear of the same and of the HUD (a phone keeps
 * its chips compact; a landscape screen's look offset holds through the zoom). The view itself frames the whole wall,
 * the five desks and the rover on every size, with the screen over the Rovers' heads. The chips show only once the
 * camera has settled (`chipsSettled`): arriving from the plain follow view, they would crowd the top bar.
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
 * The HUD chips must stay out of (px, measured in the browser at these sizes): the top row (`hudBar`; `OfficeWatch`
 * clamps under `OFFICE_CHIP_TOP`), the bottom band (the hint's top is 62 px
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

/**
 * The sizes the office is tuned on, with the HUD's pointer (coarse: the Corners minimap and joystick). The camera class
 * comes from the size (`cameraClass`): 1440 x 900, 1280 x 720 (Playwright's desktop) and 1180 x 820 use the desktop
 * camera, 820 x 1180 and 390 x 844 the portrait one ("mobile"), 844 x 390 the tablet one.
 */
const SIZES = [
  { id: "desktop", width: 1440, height: 900, coarse: false },
  { id: "small desktop", width: 1280, height: 720, coarse: false },
  { id: "landscape tablet", width: 1180, height: 820, coarse: true },
  { id: "portrait tablet", width: 820, height: 1180, coarse: true },
  { id: "phone", width: 390, height: 844, coarse: true },
  { id: "landscape phone", width: 844, height: 390, coarse: true },
] as const;

/**
 * Zoom key steps from the office stop to the near pose, per camera class: the first step that brings the middle three
 * chips under the near band (e2e/office.spec.ts `nearChips` and scripts/office-shots.ts zoom in to it). On a phone the
 * chips stay compact at any distance (`OfficeWatch`), so the near pose only checks they still clear everything.
 */
const NEAR_STEPS: Record<ViewportClass, number> = { desktop: 1, tablet: 1, mobile: 2 };

/**
 * The sky over the wall frame at the stop, as a share of the screen height, per camera class (measured 37.6% desktop,
 * 31.4% tablet, 21.5% portrait). A landscape screen raises the look target (`OFFICE.view.desktop.lookOffset`, held
 * through a hand zoom) so the wall's top sits under the middle of the screen: that band holds the two chip rows, also
 * at the near pose. A portrait screen (390 x 844, 820 x 1180) moves the look target toward the camera
 * (`OFFICE.view.mobile.lookOffset`, owner decision 2026-10-20: about 20%, at most about 22%, with the five desks and the
 * Rover in frame).
 */
const SKY: Record<ViewportClass, readonly [number, number]> = { desktop: [0, 0.4], tablet: [0, 0.4], mobile: [0.18, 0.22] };

/**
 * The settled follow camera with the rover at `at`, as `CameraDirector` builds it: primed in the view zone there (the
 * office stop, the spawn; with `prime` false the plain follow view, as the rover drives into a zone before it eases),
 * zoomed in by `steps` zoom key presses (0.8 each; a hand zoom hands the framing back, so the zone's look offset on
 * portrait screens has eased out at the near pose), or turned by hand to `yaw` (the approach).
 */
function followCamera(width: number, height: number, at: { x: number; z: number; heading?: number }, steps = 0, yaw?: number, prime = true): PerspectiveCamera {
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

/** The follow camera `CameraDirector` builds from an orbit state with the rover at `at`. */
function orbitCamera(orbit: OrbitState, width: number, height: number, at: { x: number; z: number }): PerspectiveCamera {
  const cls = cameraClass(width, height);
  const rover: [number, number, number] = [at.x, floorY("L1") + 1, at.z];
  const f = followForward(cls, orbit.yaw);
  const ahead = FOLLOW_LOOK_AHEAD[cls];
  const pose = followPose(cls, [rover[0] + f.x * ahead, rover[1], rover[2] + f.z * ahead], orbit.yaw, orbit.zoom * followOffsetScale(cls, width / height), orbit.pitch, orbit.lookForward, orbit.lookUp);
  const camera = new PerspectiveCamera(pose.fov, width / height, CAMERA_NEAR, CAMERA_FAR);
  camera.position.set(...clampCamera(pose.target, pose.position, world, rover, pose.fov));
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

/** The settled follow camera at the office stop (in the `L1:office` view zone), zoomed in by `steps` zoom key presses. */
function stopCamera(width: number, height: number, steps = 0): PerspectiveCamera {
  expect(zoneAt("L1", W.stop, floor.viewZones)?.id).toBe("L1:office");
  return followCamera(width, height, W.stop, steps);
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

/**
 * The wing sign's plate on screen (`FloatingSigns` turns it to the camera, yaw only): its `signPlate` size plus 0.1 u for
 * the rim; null when any corner is behind the camera.
 */
const SIGN = officeSign("Agent Office", "#fff");
function signBox(camera: PerspectiveCamera, size: { width: number; height: number }): ScreenBox | null {
  const plate = signPlate(SIGN);
  const yaw = yawTowards({ x: SIGN.x, z: SIGN.z }, { x: camera.position.x, z: camera.position.z });
  const [hw, hh] = [plate.w / 2 + 0.1, plate.h / 2 + 0.1];
  const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => [SIGN.x + sx * hw * Math.cos(yaw), SIGN.y + sy * hh, SIGN.z - sx * hw * Math.sin(yaw)] as const));
  if (corners.some(([x, y, z]) => new Vector3(x, y, z).project(camera).z >= 1)) return null;
  return boxOf(camera, size, corners);
}

/** Whole on screen at least `margin` px inside every edge, or wholly off it by as much: never a sliver at an edge. */
function signFraming(box: ScreenBox, size: { width: number; height: number }, margin = 8): "in" | "out" | "clipped" {
  if (box.x1 < -margin || box.x0 > size.width + margin || box.y1 < -margin || box.y0 > size.height + margin) return "out";
  if (box.x0 >= margin && box.x1 <= size.width - margin && box.y0 >= margin && box.y1 <= size.height - margin) return "in";
  return "clipped";
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

/**
 * The HUD's top row bottom edge (px, measured in the browser at the six sizes): 62 from 768 px wide (`md:top-4`: the
 * desktop top bar; on the Corners HUD the 60 px top bar beside the 62 px floor chip, a landscape phone included), 58 on a
 * narrower screen (`top-3`: a portrait phone's floor chip).
 */
const hudBar = ({ width }: { width: number }) => (width >= 768 ? 62 : 58);

/** The top bar clamp `OfficeWatch` uses (phones by the HUD's viewport class). */
const hudTop = (size: { width: number; height: number }) => OFFICE_CHIP_TOP[viewportClass(size.width, size.height) === "mobile" ? "mobile" : "desktop"];

/**
 * A chip's box as `OfficeWatch` places it: centered on the anchor's x (clamped 8 px inside the edges), hanging up
 * from it, its top never above the HUD's top bar.
 */
function chipBox(camera: PerspectiveCamera, size: { width: number; height: number }, slot: number, chip: { w: number; h: number }): ScreenBox | null {
  const a = OFFICE_CHIP_ANCHORS[slot];
  const v = new Vector3(a.x, a.y, a.z).project(camera);
  if (!(v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1)) return null;
  const edge = chip.w / 2 + 8;
  const x = Math.min(Math.max(((v.x + 1) / 2) * size.width, edge), size.width - edge);
  const y = Math.max(((1 - v.y) / 2) * size.height, hudTop(size) + chip.h);
  return { x0: x - chip.w / 2, y0: y - chip.h, x1: x + chip.w / 2, y1: y };
}

/** Distance from the camera to a chip's anchor. */
const anchorDistance = (camera: PerspectiveCamera, slot: number) => {
  const a = OFFICE_CHIP_ANCHORS[slot];
  return camera.position.distanceTo(new Vector3(a.x, a.y, a.z));
};

/** Near: the scene's far band flips a far chip to near under this distance. */
const NEAR = OFFICE_CHIP_FAR - OFFICE_CHIP_FAR_BAND;

/** Every chip's box at the pose, its size from the scene's far flag (a far chip starts far, as at the stop; a phone's stays far). */
function chipBoxes(camera: PerspectiveCamera, size: { width: number; height: number }) {
  const compact = viewportClass(size.width, size.height) === "mobile";
  return slots.map((s) => {
    const far = nextChipFar(true, anchorDistance(camera, s.slot), compact);
    return { slot: s.slot, far, box: chipBox(camera, size, s.slot, far ? (compact ? CHIP.compact : CHIP.far) : CHIP.near) };
  });
}

/** The five desks with their Rovers: each slot's footprint from the floor to a Rover's height. */
function deskBox(camera: PerspectiveCamera, size: { width: number; height: number }): ScreenBox {
  return boxOf(
    camera,
    size,
    slots.flatMap(({ rect }) => [rect.minX, rect.maxX].flatMap((x) => [rect.minZ, rect.maxZ].flatMap((z) => [0, ROVER_HEIGHT].map((y) => [x, y, z] as const)))),
  );
}

/** Every shown chip clears the wall, the desk screens, the visitor's rover, the HUD and every other chip. */
function expectClear(camera: PerspectiveCamera, size: { width: number; height: number }, coarse: boolean, chips: ReturnType<typeof chipBoxes>) {
  const wall = wallBox(camera, size);
  const desks = deskScreenBoxes(camera, size);
  const rover = roverScreenBox(camera, W.stop, floorY("L1"), size, new Vector3(), { x0: 0, y0: 0, x1: 0, y1: 0 });
  expect(rover).not.toBeNull();
  const shown = chips.filter((c) => c.box);
  for (const { slot, box } of shown) {
    expect(boxesOverlap(box!, wall), `slot ${slot} on the wall`).toBe(false);
    desks.forEach((d, i) => expect(boxesOverlap(box!, d), `slot ${slot} on desk screen ${i}`).toBe(false));
    expect(boxesOverlap(box!, rover!), `slot ${slot} on the rover`).toBe(false);
    expectClearOfHud(box!, size, coarse, `slot ${slot}`);
  }
  for (let i = 0; i < shown.length; i++)
    for (let j = i + 1; j < shown.length; j++) expect(boxesOverlap(shown[i].box!, shown[j].box!), `slots ${shown[i].slot} and ${shown[j].slot}`).toBe(false);
}

describe("Agent Office chips at the office stop", () => {
  it("anchor still on the wall's front face over its frame, at each Rover's x spread from the wall's centre, in two rows (no pose moves them)", () => {
    const { wall } = OFFICE;
    const top = wall.bottom + wall.h + wall.frame;
    expect(CHIP_ROW.spread).toBeGreaterThanOrEqual(1);
    OFFICE_CHIP_ANCHORS.forEach((a, i) => expect(a.x).toBeCloseTo(W.wall.x + (slots[i].rover.x - W.wall.x) * CHIP_ROW.spread, 12));
    for (const a of OFFICE_CHIP_ANCHORS) {
      // Over the wall: the outer chips stay inside its frame's width.
      expect(Math.abs(a.x - W.wall.x)).toBeLessThanOrEqual(wall.w / 2 + wall.frame);
      expect(a.z).toBeCloseTo(W.wall.z - wall.t / 2);
      expect(a.y).toBeGreaterThanOrEqual(top + CHIP_ROW.gap - 1e-9);
      expect(a.y).toBeLessThanOrEqual(top + CHIP_ROW.gap + CHIP_ROW.step + 1e-9);
    }
    // Neighbours never share a row.
    for (let i = 1; i < slots.length; i++) expect(Math.abs(OFFICE_CHIP_ANCHORS[i].y - OFFICE_CHIP_ANCHORS[i - 1].y)).toBeCloseTo(CHIP_ROW.step);
  });

  describe.each(SIZES)("$id ($width x $height)", ({ width, height, coarse }) => {
    const size = { width, height };
    const cls = cameraClass(width, height);
    const compact = viewportClass(width, height) === "mobile";

    it("frames the whole wall, the five desks and the visitor's rover, with little sky over the wall (about 20% on a portrait screen)", () => {
      const camera = stopCamera(width, height);
      const wall = wallBox(camera, size);
      expect(wall.x0, "wall left edge").toBeGreaterThanOrEqual(0);
      expect(wall.x1, "wall right edge").toBeLessThanOrEqual(width);
      expect(wall.y0, "wall top under the top bar").toBeGreaterThanOrEqual(hudTop(size));
      const desks = deskBox(camera, size);
      expect(desks.x0, "desks left edge").toBeGreaterThanOrEqual(0);
      expect(desks.x1, "desks right edge").toBeLessThanOrEqual(width);
      expect(desks.y1, "desks over the bottom band").toBeLessThanOrEqual(height - HUD.bottom);
      const rover = roverScreenBox(camera, W.stop, floorY("L1"), size, new Vector3(), { x0: 0, y0: 0, x1: 0, y1: 0 });
      expect(rover).not.toBeNull();
      expect(rover!.x0).toBeGreaterThanOrEqual(0);
      expect(rover!.x1).toBeLessThanOrEqual(width);
      expect(rover!.y1, "rover over the bottom band").toBeLessThanOrEqual(height - HUD.bottom);
      expect(wall.y0 / height, "sky over the wall").toBeLessThanOrEqual(SKY[cls][1]);
      expect(wall.y0 / height, "sky over the wall").toBeGreaterThanOrEqual(SKY[cls][0]);
      // The screen reads over the console: every Rover's head (and antenna tip) stays under the screen's bottom edge.
      const screenBottom = boxOf(camera, size, [[W.wall.x, OFFICE.wall.bottom, W.wall.z - OFFICE.wall.t / 2]]).y0;
      for (const s of slots) {
        const head = boxOf(camera, size, [[s.rover.x, OFFICE_ROVER.head[1] + OFFICE_ROVER.head[4] / 2, s.rover.z]]).y0;
        const tip = boxOf(camera, size, [[s.rover.x, OFFICE_ROVER.tip.y + OFFICE_ROVER.tip.size / 2, s.rover.z]]).y0;
        expect(head, `Rover ${s.slot + 1}'s head under the screen`).toBeGreaterThan(screenBottom);
        expect(tip, `Rover ${s.slot + 1}'s antenna under the screen`).toBeGreaterThan(screenBottom);
      }
      // The wing sign would stand whole in the foreground here (in front of the rover, under it): it fades out at the stop.
      expect(wingSignHidden("L1", W.stop), "wing sign at the stop").toBe(true);
    });

    it("show the wing sign whole or not at all from the primed spawn, and whole between the HUD bars on the lead road (the approach)", () => {
      const spawn = signBox(followCamera(width, height, { ...LOBBY.spawn, heading: LOBBY.spawnHeading }), size);
      if (spawn) expect(signFraming(spawn, size), "wing sign at the spawn").not.toBe("clipped");
      // On the lead road at the Lobby plaza's edge, heading into the wing, the view turned south (scripts/office-shots.ts `approach`).
      const approach = signBox(followCamera(width, height, { x: W.lead.x, z: W.rect.minZ - 6, heading: 0 }, 0, yawLooking({ x: 0, z: 1 })), size);
      expect(approach).not.toBeNull();
      expect(signFraming(approach!, size), "wing sign on the approach").toBe("in");
      expect(approach!.y1, "wing sign over the bottom band").toBeLessThanOrEqual(height - HUD.bottom);
      // A landscape phone (390 px tall) shows it at the top centre, 8 px above the top bar's bottom line (y 54 to 78).
      if (height > 390) expect(approach!.y0, "wing sign under the top bar").toBeGreaterThanOrEqual(hudBar(size));
    });

    it("never cover the screen wall, a desk screen or the visitor's rover, and stay on screen under the HUD's bars", () => {
      const camera = stopCamera(width, height);
      const chips = chipBoxes(camera, size);
      for (const c of chips) {
        // Far from the stop (one line), as the scene's far band decides it: a chip starts near (`officeRuntime.far`), so it
        // must pass the band's far edge.
        expect(nextChipFar(false, anchorDistance(camera, c.slot)), `slot ${c.slot} far`).toBe(true);
        expect(c.box, `slot ${c.slot} on screen`).not.toBeNull();
      }
      expectClear(camera, size, coarse, chips);
    });

    it(`the near pose (${NEAR_STEPS[cls]} zoom steps) shows the middle three's task lines (compact on a phone) clear of the wall, the desk screens, the rover, one another and the HUD`, () => {
      const steps = NEAR_STEPS[cls];
      const camera = stopCamera(width, height, steps);
      const chips = chipBoxes(camera, size);
      for (const slot of [1, 2, 3]) {
        expect(anchorDistance(camera, slot), `slot ${slot} near`).toBeLessThan(NEAR);
        expect(chips[slot].box, `slot ${slot} on screen`).not.toBeNull();
        expect(chips[slot].far, `slot ${slot} shows its task line`).toBe(compact);
      }
      // The first step that does: one less leaves them far.
      const before = stopCamera(width, height, steps - 1);
      expect([1, 2, 3].some((slot) => anchorDistance(before, slot) < NEAR)).toBe(false);
      expectClear(camera, size, coarse, chips);
    });
  });

  describe.each(SIZES)("off the stop, $id ($width x $height)", ({ width, height, coarse }) => {
    const size = { width, height };
    const south = yawLooking({ x: 0, z: 1 });
    /** Shown chips (those the gate lets through at `at`, from a settled camera) never overlap one another and stay clear of the HUD. */
    const expectUncrowded = (camera: PerspectiveCamera, at: { x: number; z: number }, what: string) => {
      const shown = officeChipsHere(null, at) ? chipBoxes(camera, size).filter((c) => c.box) : [];
      for (const { slot, box } of shown) expectClearOfHud(box!, size, coarse, `${what}: slot ${slot}`);
      for (let i = 0; i < shown.length; i++)
        for (let j = i + 1; j < shown.length; j++) expect(boxesOverlap(shown[i].box!, shown[j].box!), `${what}: slots ${shown[i].slot} and ${shown[j].slot}`).toBe(false);
      return shown.length;
    };

    it("hide the chips in the wing outside the stop zone (S + 2 to S + 14), where they would clamp into one row over each other or under the minimap", () => {
      let crowded = 0;
      for (const dz of [2, 4, 6, 8, 10, 12, 14])
        for (const dx of [-5, 0, 5]) {
          const at = { x: W.lead.x + dx, z: W.rect.minZ + dz, heading: 0 };
          expect(officeChipsHere(null, at), `chips at S + ${dz}, x ${at.x}`).toBe(false);
          const camera = followCamera(width, height, at, 0, south);
          expect(expectUncrowded(camera, at, `S + ${dz}, x ${at.x}`)).toBe(0);
          // Without the gate: shown chips that overlap one another or a HUD box (the final review's crowding).
          const all = chipBoxes(camera, size).filter((c) => c.box);
          const hud = hudBoxes(size, coarse).map((h) => h.box);
          if (all.some((c, i) => all.some((d, j) => j > i && boxesOverlap(c.box!, d.box!)) || hud.some((h) => boxesOverlap(c.box!, h)))) crowded += 1;
        }
      // The gate matters: somewhere in the wing the ungated chips crowd on this size.
      if (width !== 844) expect(crowded, "ungated chips crowd somewhere in the wing").toBeGreaterThan(0);
    });

    it("show them uncrowded once the camera settles in the office view; arriving from the plain follow view they wait (it would crowd them)", () => {
      const at = { ...W.stop, heading: 0 };
      expect(officeChipsHere(null, at)).toBe(true);
      expect(expectUncrowded(followCamera(width, height, at), at, "settled")).toBe(5);
      // Arriving: the rover enters the stop's zone with the camera still in the plain follow view, facing south. The zone
      // starts the ease on that frame, so the camera is never settled there: the chips wait (`chipsSettled`).
      const cls = cameraClass(width, height);
      const orbit = createOrbitState();
      setPitchRange(orbit, pitchRange(cls, "follow"));
      orbit.yaw = orbit.yawTarget = south;
      const plain = orbitCamera(orbit, width, height, at);
      updateZone(orbit, zoneAt("L1", at, floor.viewZones), false, cls);
      expect(orbit.easing, "the zone eases the camera in").toBe(true);
      // The gate matters: there the shown chips would crowd the top bar, the HUD or one another.
      const all = chipBoxes(plain, size).filter((c) => c.box);
      const hud = hudBoxes(size, coarse).map((h) => h.box);
      const crowded = all.some((c, i) => c.box!.y0 < hudTop(size) - 1e-9 || hud.some((h) => boxesOverlap(c.box!, h)) || all.some((d, j) => j > i && boxesOverlap(c.box!, d.box!)));
      if (cls === "desktop") expect(crowded, "ungated chips crowd the plain view").toBe(true);
      for (let frame = 0; frame < 300 && orbit.easing; frame++) stepOrbit(orbit, 1 / 60, false);
      expect(orbit.easing).toBe(false);
      expect(expectUncrowded(orbitCamera(orbit, width, height, at), at, "eased")).toBe(5);
    });
  });

  it("never go under the HUD's top bar: zoomed in past the near pose, a chip whose anchor rises that high stops right under it", () => {
    for (const { width, height } of SIZES) {
      const size = { width, height };
      const camera = stopCamera(width, height, 4);
      expect(hudTop(size), `the clamp at ${width} x ${height} sits under the real top row`).toBeGreaterThanOrEqual(hudBar(size));
      let clamped = 0;
      for (const { slot, box } of chipBoxes(camera, size)) {
        if (!box) continue;
        expect(box.y0, `slot ${slot} at ${width} x ${height} under the top row`).toBeGreaterThanOrEqual(hudBar(size));
        const a = OFFICE_CHIP_ANCHORS[slot];
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
