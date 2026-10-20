import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { followEase } from "@/experience/camera/offset";
import { createOrbitState, createZoneHold, holdZone, rotate, rotateStep, setPitchRange, stepOrbit, updateZone, yawLooking, zoneAt, zoomBy, type OrbitState } from "@/experience/camera/orbit";
import { pitchRange } from "@/experience/camera/rigs";
import { floorY, LOBBY, ROVER_HEIGHT } from "@/experience/config";
import { yawTowards } from "@/experience/fx/facing";
import { signPlate } from "@/experience/fx/signLayout";
import { roverScreenBox } from "@/experience/floors/library/decor/signFrame";
import { OFFICE, officeSlots, officeTowerColumn } from "@/experience/floors/lobby/officeLayout";
import { writeDeskScreen } from "@/experience/floors/lobby/office/officeRig";
import { OFFICE_ROVER } from "@/experience/floors/lobby/office/officeVisual";
import {
  CHIP_ROW,
  chipSpots,
  chipsOneLine,
  nextChipFar,
  OFFICE_CHIP_ANCHORS,
  OFFICE_CHIP_FAR,
  OFFICE_CHIP_FAR_BAND,
  OFFICE_CHIP_TOP,
  officeChipMode,
  officeChipsHere,
  officeSign,
  placeChip,
  wingSignHidden,
} from "@/experience/floors/lobby/officeShell";
import { boxesOverlap, type ScreenBox } from "@/experience/fx/labelPlacement";
import type { ViewportClass } from "@/experience/types";
import { hudLayout } from "@/hud/layout";
import { cameraClass, viewportClass } from "@/lib/viewport";
import { boxOf, floor, followCamera, orbitCamera, orbitPose, poseCamera, SIZES, type Pose } from "../helpers/office-cameras";

/**
 * Office chips against the screen wall (owner review 2026-10-19): from the office stop, on every camera class, no
 * chip may cover the wall's screens (MISSION CONTROL and GITHUB), a desk screen or the visitor's rover. The follow
 * camera as `CameraDirector` settles it in the `L1:office` view zone (look-ahead, offset scale, camera collision),
 * the chips placed as `OfficeWatch` places them (the anchor projected, the chip hanging up from it, x clamped 8 px
 * inside the screen edges, y clamped under the HUD's top bar) with conservative CSS sizes. Zoomed in from the stop
 * until the middle three show their task lines, the near chips keep clear of the same and of the HUD (a phone keeps
 * its chips compact; a landscape screen's look offset holds through the zoom). The view itself frames the whole wall,
 * the five desks and the rover on every size, with the screen over the Rovers' heads. The chips show in full only once the
 * camera holds the office view (`officeChipMode`): arriving from the plain follow view, they would crowd the top bar; once
 * held, a hand zoom keeps them shown; outside the office view (reduced motion, a hand turn) they show as compact dots.
 */

const W = LOBBY.officeWing;
const slots = officeSlots(W);
/**
 * Chip sizes (px): a far chip (one 32 px pill, `min-h-8`, wider than any head line), a near one (conservative: the
 * 32 px pill, the 20 px task line and the 4 px CI bar with their 4 px gaps make 64, plus 4; the task line stops at
 * 200 px), a phone's compact far dot (32 x 32).
 */
const CHIP = { far: { w: 176, h: 32 }, near: { w: 204, h: 68 }, compact: { w: 32, h: 32 } } as const;

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
 * Zoom key steps from the office stop to the near pose, per camera class: the first step that brings the middle three
 * chips under the near band (e2e/office.spec.ts `nearChips` and scripts/office-shots.ts zoom in to it). On a phone the
 * chips stay compact at any distance (`OfficeWatch`), so the near pose only checks they still clear everything.
 */
const NEAR_STEPS: Record<ViewportClass, number> = { desktop: 1, tablet: 1, mobile: 2 };

/**
 * The sky over the wall frame at the stop, as a share of the screen height, per camera class (measured 36.3% desktop,
 * 30% tablet, 21.8% portrait; tests/unit/office-view.test.ts pins them). A landscape screen raises the look target
 * (`OFFICE.view.desktop.lookOffset`, held through a hand zoom) so the wall's top sits over the middle of the screen: that
 * band holds the two chip rows, also at the near pose. A portrait screen (390 x 844, 820 x 1180) moves the look target
 * toward the camera (`OFFICE.view.mobile.lookOffset`, owner decision 2026-10-20: about 20%, at most about 22%, with the
 * five desks and the Rover in frame).
 */
const SKY: Record<ViewportClass, readonly [number, number]> = { desktop: [0, 0.4], tablet: [0, 0.4], mobile: [0.18, 0.22] };

/** The settled follow camera at the office stop (in the `L1:office` view zone), zoomed in by `steps` zoom key presses. */
function stopCamera(width: number, height: number, steps = 0): PerspectiveCamera {
  expect(zoneAt("L1", W.stop, floor.viewZones)?.id).toBe("L1:office");
  return followCamera(width, height, W.stop, steps);
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

/** The CI tower's column (2 x 2 u turned toward the stop) from the floor to its top (plinth plus column). */
function towerBox(camera: PerspectiveCamera, size: { width: number; height: number }): ScreenBox {
  const c = officeTowerColumn(W);
  const half = OFFICE.tower.column / 2;
  const yaw = Math.atan2(W.stop.x - c.x, W.stop.z - c.z);
  const [cos, sin] = [Math.cos(yaw), Math.sin(yaw)];
  const corners = [-1, 1].flatMap((u) => [-1, 1].map((v) => [c.x + half * (u * cos + v * sin), c.z + half * (-u * sin + v * cos)] as const));
  return boxOf(camera, size, corners.flatMap(([x, z]) => [0, OFFICE.tower.plinth + OFFICE.tower.h].map((y) => [x, y, z] as const)));
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

type Size = { width: number; height: number; coarse?: boolean };

/**
 * A chip's box as `OfficeWatch` places it (`placeChip`, chips in slot order into `spots`): centered on the anchor's x
 * (clamped 8 px inside the edges), hanging up from it, its top never above the HUD's top bar nor under the HUD's top
 * corner box; null when it is off screen or hides (on the HUD; a dot outside the office view, `pinned`, off its anchor or
 * on a lower slot's dot).
 */
function chipBox(camera: PerspectiveCamera, size: Size, slot: number, chip: { w: number; h: number }, pinned = false, spots = chipSpots()): ScreenBox | null {
  const a = OFFICE_CHIP_ANCHORS[slot];
  const v = new Vector3(a.x, a.y, a.z).project(camera);
  spots.x[slot] = NaN;
  if (!(v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1)) return null;
  spots.half[slot] = chip.w / 2;
  spots.h[slot] = chip.h;
  if (!placeChip(spots, slot, ((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height, size.width, size.height, hudLayout(viewportClass(size.width, size.height), size.coarse ?? false), pinned)) return null;
  const [x, y] = [spots.x[slot], spots.y[slot]];
  return { x0: x - chip.w / 2, y0: y - chip.h, x1: x + chip.w / 2, y1: y };
}

/** Distance from the camera to a chip's anchor. */
const anchorDistance = (camera: PerspectiveCamera, slot: number) => {
  const a = OFFICE_CHIP_ANCHORS[slot];
  return camera.position.distanceTo(new Vector3(a.x, a.y, a.z));
};

/** Near: the scene's far band flips a far chip to near under this distance. */
const NEAR = OFFICE_CHIP_FAR - OFFICE_CHIP_FAR_BAND;

/**
 * Every chip's box at the pose, its size from the scene's far flag: from `was` (by default far, as a chip starts and as a
 * hidden one turns again), always far on a phone or outside the office view (`compact`, as `officeChipMode` says).
 */
function chipBoxes(camera: PerspectiveCamera, size: Size, { compact = false, was = [true, true, true, true, true] as readonly boolean[], still = true } = {}) {
  const small = compact || viewportClass(size.width, size.height) === "mobile";
  const spots = chipSpots();
  return slots.map((s) => {
    // A far chip turns near only once the camera holds still (`OfficeWatch`).
    const far = nextChipFar(was[s.slot], anchorDistance(camera, s.slot), chipsOneLine(viewportClass(size.width, size.height), size.width, size.height, compact)) || (was[s.slot] && !still);
    return { slot: s.slot, far, box: chipBox(camera, size, s.slot, far ? (small ? CHIP.compact : CHIP.far) : CHIP.near, compact, spots) };
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

/** Every shown chip clears the wall, the CI tower column, the desk screens, the visitor's rover (at `at`), the HUD and every other chip. */
function expectClear(camera: PerspectiveCamera, size: { width: number; height: number }, coarse: boolean, chips: ReturnType<typeof chipBoxes>, at: { x: number; z: number } = W.stop) {
  const wall = wallBox(camera, size);
  const tower = towerBox(camera, size);
  const desks = deskScreenBoxes(camera, size);
  const rover = roverScreenBox(camera, at, floorY("L1"), size, new Vector3(), { x0: 0, y0: 0, x1: 0, y1: 0 });
  expect(rover).not.toBeNull();
  const shown = chips.filter((c) => c.box);
  for (const { slot, box } of shown) {
    expect(boxesOverlap(box!, wall), `slot ${slot} on the wall`).toBe(false);
    expect(boxesOverlap(box!, tower), `slot ${slot} on the CI tower column`).toBe(false);
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

  describe.each(SIZES)("$id ($width x $height)", ({ id, width, height, coarse }) => {
    const size = { width, height, coarse };
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
      // Not on a small landscape tablet (960 x 640, added for the chips): from the spawn its plate runs about 8 px past the
      // left edge there, as before the higher wall (the sign did not move).
      if (spawn && id !== "tablet") expect(signFraming(spawn, size), "wing sign at the spawn").not.toBe("clipped");
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
        // Far from the stop (one line), as the scene's far band decides it: a chip starts far (`officeRuntime.far`) and
        // turns far again whenever it hides, so it stays far past the band's near edge.
        expect(c.far, `slot ${c.slot} far`).toBe(true);
        expect(c.box, `slot ${c.slot} on screen`).not.toBeNull();
      }
      expectClear(camera, size, coarse, chips);
    });

    it("stay far (one line), on screen and clear with the rover anywhere in the stop's zone (its corners, 2 u by 1.4 u off the stop)", () => {
      const { half } = OFFICE.view;
      let nearest = Infinity;
      for (const dx of [-half.x, 0, half.x])
        for (const dz of [-half.z, 0, half.z]) {
          const at = { x: W.stop.x + dx, z: W.stop.z + dz };
          expect(zoneAt("L1", at, floor.viewZones)?.id, `zone at ${dx}, ${dz}`).toBe("L1:office");
          const camera = followCamera(width, height, at);
          const chips = chipBoxes(camera, size);
          for (const c of chips) {
            nearest = Math.min(nearest, anchorDistance(camera, c.slot));
            expect(c.far, `slot ${c.slot} far at ${dx}, ${dz}`).toBe(true);
            expect(c.box, `slot ${c.slot} on screen at ${dx}, ${dz}`).not.toBeNull();
          }
          expectClear(camera, size, coarse, chips, at);
        }
      expect(nearest).toBeGreaterThan(NEAR);
    });

    it(`the near pose (${NEAR_STEPS[cls]} zoom steps) shows the middle three's task lines (compact on a phone) clear of the wall, the desk screens, the rover, one another and the HUD`, () => {
      const steps = NEAR_STEPS[cls];
      const camera = stopCamera(width, height, steps);
      const chips = chipBoxes(camera, size);
      for (const slot of [1, 2, 3]) {
        expect(anchorDistance(camera, slot), `slot ${slot} near`).toBeLessThan(NEAR);
        expect(chips[slot].box, `slot ${slot} on screen`).not.toBeNull();
        // One line on a phone (compact) and on the tablet camera (`OfficeWatch`: near chips would cover each other there).
        expect(chips[slot].far, `slot ${slot} shows its task line`).toBe(compact || cls === "tablet");
      }
      // The first step that does: one less leaves them far.
      const before = stopCamera(width, height, steps - 1);
      expect([1, 2, 3].some((slot) => anchorDistance(before, slot) < NEAR)).toBe(false);
      expectClear(camera, size, coarse, chips);
    });
  });

  describe.each(SIZES)("off the stop, $id ($width x $height)", ({ width, height, coarse }) => {
    const size = { width, height, coarse };
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
          // Without the gate: shown chips that overlap one another or a HUD box, or that the top bar pulls off their anchors
          // (the final review's crowding: one row under the top bar).
          const all = chipBoxes(camera, size).filter((c) => c.box);
          const hud = hudBoxes(size, coarse).map((h) => h.box);
          const pulled = all.some((c) => {
            const a = OFFICE_CHIP_ANCHORS[c.slot];
            return ((1 - new Vector3(a.x, a.y, a.z).project(camera).y) / 2) * height < c.box!.y1 - 1e-6;
          });
          if (pulled || all.some((c, i) => all.some((d, j) => j > i && boxesOverlap(c.box!, d.box!)) || hud.some((h) => boxesOverlap(c.box!, h)))) crowded += 1;
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

  describe.each(SIZES)("as the camera moves, $id ($width x $height)", ({ width, height, coarse }) => {
    const size = { width, height, coarse };
    const cls = cameraClass(width, height);
    const at = { ...W.stop, heading: 0 };
    const zone = zoneAt("L1", at, floor.viewZones);
    const south = yawLooking({ x: 0, z: 1 });

    /**
     * `CameraDirector` at the stop, frame by frame (1/60 s): the orbit steps, the drawn pose springs toward the wanted one
     * (`followEase`), `holdZone` reads it, and `officeChipMode` gates the chips; `frame` sees each drawn camera, the mode
     * and the chips as `OfficeWatch` would size them (their far flags carried from frame to frame, turned far while hidden).
     */
    function run(orbit: OrbitState, reduced: boolean, frames: number, drawn: Pose, frame: (camera: PerspectiveCamera, mode: ReturnType<typeof officeChipMode>, chips: ReturnType<typeof chipBoxes>) => void, hold = createZoneHold()) {
      let was: boolean[] = [true, true, true, true, true];
      for (let i = 0; i < frames; i++) {
        updateZone(orbit, zone, reduced, cls);
        stepOrbit(orbit, 1 / 60, reduced);
        const want = orbitPose(orbit, width, height, at);
        const k = followEase(1 / 60, reduced);
        drawn.position.lerp(want.position, k);
        drawn.target.lerp(want.target, k);
        drawn.fov = want.fov;
        const still = !orbit.easing && drawn.position.distanceToSquared(want.position) < 0.01 && drawn.target.distanceToSquared(want.target) < 0.01;
        holdZone(hold, orbit, reduced, still);
        const mode = officeChipMode(null, at, hold.zone, hold.held);
        const camera = poseCamera(drawn, width, height);
        const chips = chipBoxes(camera, size, { compact: mode === "compact", was, still });
        was = chips.map((c) => (mode ? c.far : true));
        frame(camera, mode, chips);
      }
      return hold;
    }
    /** A settled orbit in the office view at the stop, its drawn pose and its hold. */
    function settledAtStop() {
      const orbit = createOrbitState();
      setPitchRange(orbit, pitchRange(cls, "follow"));
      orbit.yaw = orbit.yawTarget = south;
      const drawn = orbitPose(orbit, width, height, at);
      const modes: ReturnType<typeof officeChipMode>[] = [];
      const hold = run(orbit, false, 600, drawn, (_, m) => modes.push(m));
      return { orbit, drawn, hold, mode: modes.at(-1), modes };
    }

    it("arriving, the chips wait while the camera swings into the office view, then show in full", () => {
      const { mode, modes } = settledAtStop();
      expect(modes[0], "the arrival frame").toBeNull();
      expect(modes.slice(0, 20).every((m) => m === null), "while the camera swings in").toBe(true);
      expect(mode).toBe("full");
    });

    it("a hand zoom keeps them shown (a landscape screen's look offset holds), clear on every frame; a portrait screen's eases its offset out, so its chips wait", () => {
      const { orbit, drawn, hold } = settledAtStop();
      zoomBy(orbit, 0.8, false);
      const modes: ReturnType<typeof officeChipMode>[] = [];
      run(
        orbit,
        false,
        240,
        drawn,
        (camera, mode, chips) => {
          modes.push(mode);
          if (!mode) return;
          // Clear of the wall, the desk screens, the rover and the HUD on every frame; of each other within 1 px (on the
          // frame the camera comes to rest within 0.1 u the near chips turn up a fraction of a pixel short of their final rows).
          const shrunk = chips.map((c) => ({ ...c, box: c.box && { x0: c.box.x0 + 0.5, y0: c.box.y0 + 0.5, x1: c.box.x1 - 0.5, y1: c.box.y1 - 0.5 } }));
          expectClear(camera, size, coarse, shrunk);
        },
        hold,
      );
      if (cls === "mobile") expect(modes.some((m) => m === null), "portrait: they wait for the look offset").toBe(true);
      else expect(modes.every((m) => m === "full"), "landscape: shown through the zoom").toBe(true);
      expect(modes.at(-1)).toBe("full");
    });

    it("the rover moving inside the zone keeps them shown in full", () => {
      const { orbit, drawn, hold } = settledAtStop();
      const modes: ReturnType<typeof officeChipMode>[] = [];
      const from = { ...at };
      for (const [dx, dz] of [[1, 0], [1, 1], [0, 1]] as const) {
        at.x = from.x + dx;
        at.z = from.z + dz;
        run(orbit, false, 30, drawn, (_, mode) => modes.push(mode), hold);
      }
      Object.assign(at, from);
      expect(modes.every((m) => m === "full")).toBe(true);
    });

    it("a hand turn or drag in the zone (the view no longer applies) turns them into compact dots at once, clear of each other and the HUD", () => {
      for (const turn of [(o: OrbitState) => rotate(o, 0.35, 0), (o: OrbitState) => rotate(o, -0.35, -0.1), (o: OrbitState) => rotateStep(o, 1), (o: OrbitState) => rotateStep(o, -1)]) {
        const { orbit, drawn, hold } = settledAtStop();
        turn(orbit);
        const modes: ReturnType<typeof officeChipMode>[] = [];
        run(
          orbit,
          false,
          120,
          drawn,
          (_, mode, chips) => {
            modes.push(mode);
            for (const c of chips) if (c.box) expect(c.box.x1 - c.box.x0, `slot ${c.slot} a dot`).toBeCloseTo(CHIP.compact.w, 6);
            const shown = chips.filter((c) => c.box);
            for (const { slot, box } of shown) expectClearOfHud(box!, size, coarse, `slot ${slot}`);
            for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) expect(boxesOverlap(shown[i].box!, shown[j].box!), `slots ${shown[i].slot} and ${shown[j].slot}`).toBe(false);
          },
          hold,
        );
        expect(modes.every((m) => m === "compact")).toBe(true);
      }
    });

    it("under reduced motion (the zone's view never applies) the plain follow view shows compact dots, clear of each other and the HUD", () => {
      for (const yaw of [south, south - 0.4, south + 0.4, 0]) {
        const orbit = createOrbitState();
        setPitchRange(orbit, pitchRange(cls, "follow"));
        orbit.yaw = orbit.yawTarget = yaw;
        const drawn = orbitPose(orbit, width, height, at);
        const modes: ReturnType<typeof officeChipMode>[] = [];
        run(orbit, true, 30, drawn, (camera, mode, chips) => {
          modes.push(mode);
          const shown = chips.filter((c) => c.box);
          for (const c of shown) expect(c.far && Math.abs(c.box!.x1 - c.box!.x0 - CHIP.compact.w) < 1e-6, `slot ${c.slot} a dot`).toBe(true);
          for (const { slot, box } of shown) expectClearOfHud(box!, size, coarse, `slot ${slot}`);
          for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) expect(boxesOverlap(shown[i].box!, shown[j].box!), `yaw ${yaw}: slots ${shown[i].slot} and ${shown[j].slot}`).toBe(false);
        });
        expect(orbit.zoom, "the zone's view never applied").toBe(1);
        expect(modes.every((m) => m === "compact")).toBe(true);
      }
    });
  });

  it("never go under the HUD's top bar: zoomed in past the near pose, a chip whose anchor rises that high stops right under it", () => {
    let under = 0;
    for (const { width, height, coarse } of SIZES) {
      const size = { width, height, coarse };
      const camera = stopCamera(width, height, 4);
      expect(hudTop(size), `the clamp at ${width} x ${height} sits under the real top row`).toBeGreaterThanOrEqual(hudBar(size));
      let clamped = 0;
      for (const { slot, box } of chipBoxes(camera, size)) {
        if (!box) continue;
        expect(box.y0, `slot ${slot} at ${width} x ${height} under the top row`).toBeGreaterThanOrEqual(hudBar(size));
        const a = OFFICE_CHIP_ANCHORS[slot];
        const raw = ((1 - new Vector3(a.x, a.y, a.z).project(camera).y) / 2) * height;
        // Under the HUD's top corner box (the desktop profile card, the Corners minimap) a chip drops below it instead.
        const corner = hudBoxes(size, coarse).find((h) => h.id === "minimap" || h.id === "profile card")?.box;
        if (corner && box.x1 > corner.x0 && box.x0 < corner.x1 && raw - (box.y1 - box.y0) < corner.y1) {
          under += 1;
          expect(box.y0).toBeCloseTo(corner.y1);
        } else if (raw - (box.y1 - box.y0) < hudTop(size)) {
          clamped += 1;
          expect(box.y0).toBeCloseTo(hudTop(size));
        }
      }
      if (width === 1440) expect(clamped, "the desktop pose exercises the clamp").toBeGreaterThan(0);
    }
    expect(under, "some size exercises the corner drop").toBeGreaterThan(0);
  });

  it("drop a chip that would reach under the HUD's top corner box below it, hide one that would land on the HUD, and keep dots on their anchors and apart", () => {
    const spots = chipSpots();
    /** Places slot 0 (or `slot`) sized `w` by `h` and returns where it shows, or null. */
    const place = (px: number, py: number, w: number, width: number, height: number, hud: "desktop" | "tablet" | "phone", pinned = false, slot = 0) => {
      spots.half[slot] = w / 2;
      spots.h[slot] = 32;
      return placeChip(spots, slot, px, py, width, height, hud, pinned) ? { x: spots.x[slot], y: spots.y[slot] } : null;
    };
    // Phone 390 x 844: the minimap spans x 306 to 378, y 64 to 136; a 32 px dot whose right edge passes 306 drops below 136.
    expect(place(310, 135, 32, 390, 844, "phone")).toEqual({ x: 310, y: 168 });
    expect(place(280, 135, 32, 390, 844, "phone")).toEqual({ x: 280, y: 135 });
    // Desktop: the top bar and the screen edges clamp; the profile card (x 16 to 296, down to 153) drops a chip below it.
    expect(place(1430, 20, 176, 1440, 900, "desktop")).toEqual({ x: 1440 - 96, y: OFFICE_CHIP_TOP.desktop + 32 });
    expect(place(300, 120, 32, 1440, 900, "desktop")).toEqual({ x: 300, y: 185 });
    // A tablet's minimap (112 px at top 76, 16 px in).
    expect(place(900, 150, 176, 960, 640, "tablet")).toEqual({ x: 960 - 96, y: 188 + 32 });
    // Hidden on the bottom band, the desktop elevator panel and the Corners joystick.
    expect(place(700, 840, 32, 1440, 900, "desktop")).toBeNull();
    expect(place(1300, 450, 32, 1440, 900, "desktop")).toBeNull();
    expect(place(1300, 300, 32, 1440, 900, "desktop")).not.toBeNull();
    expect(place(100, 720, 32, 390, 844, "phone")).toBeNull();
    expect(place(200, 720, 32, 390, 844, "phone")).not.toBeNull();
    // A dot outside the office view (pinned): hidden rather than pulled off its anchor under the top bar, or onto slot 0's dot.
    expect(place(700, 80, 32, 1440, 900, "desktop", true)).toBeNull();
    expect(place(700, 300, 32, 1440, 900, "desktop", true)).toEqual({ x: 700, y: 300 });
    expect(place(720, 310, 32, 1440, 900, "desktop", true, 1)).toBeNull();
    expect(place(740, 310, 32, 1440, 900, "desktop", true, 1)).toEqual({ x: 740, y: 310 });
    // A full chip may overlap (the office view keeps them apart; the tests above check it).
    expect(place(720, 310, 32, 1440, 900, "desktop", false, 1)).toEqual({ x: 720, y: 310 });
  });
});
