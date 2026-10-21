import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { followEase } from "@/experience/camera/offset";
import { createOrbitState, createZoneHold, holdZone, rotate, rotateStep, setPitchRange, stepOrbit, updateZone, yawLooking, zoneAt, zoomBy, type OrbitState } from "@/experience/camera/orbit";
import { pitchRange } from "@/experience/camera/rigs";
import { floorY, LOBBY, ROVER_HEIGHT } from "@/experience/config";
import { yawTowards } from "@/experience/fx/facing";
import { signPlate } from "@/experience/fx/signLayout";
import { roverScreenBox } from "@/experience/floors/library/decor/signFrame";
import { OFFICE, officeSlots } from "@/experience/floors/lobby/officeLayout";
import { leadEnd } from "@/experience/floors/lobby/office/officeFrame";
import { OFFICE_ROVER } from "@/experience/floors/lobby/office/officeVisual";
import {
  CHIP_ROW,
  chipMaxWidth,
  chipRowBounds,
  chipsOneLine,
  layoutChipRow,
  nextChipFar,
  OFFICE_CHIP_ANCHORS,
  OFFICE_CHIP_FAR,
  OFFICE_CHIP_FAR_BAND,
  OFFICE_CHIP_TOP,
  OFFICE_ROVER_HEAD_TOP,
  officeChipMode,
  officeChipsHere,
  officeHudBoxes,
  officeSign,
  segmentHitsBox,
  wingSignHidden,
} from "@/experience/floors/lobby/officeShell";
import { boxesOverlap, type ScreenBox } from "@/experience/fx/labelPlacement";
import type { ViewportClass } from "@/experience/types";
import { hudLayout } from "@/hud/layout";
import { cameraClass, viewportClass } from "@/lib/viewport";
import { boxOf, floor, followCamera, orbitCamera, orbitPose, poseCamera, SIZES, type Pose } from "../helpers/office-cameras";

/**
 * Office chips (owner decision 2026-10-20): one compact row pinned under the HUD's top bar, each chip over its Rover's
 * head (the projected head's x), nudged along x in desk order so the chips never overlap each other or the HUD (the
 * desktop profile card and floor menu panel, the Corners minimap and joystick), with a leader line down to its Rover.
 * The follow camera as `CameraDirector` settles it in the `L1:office` view zone (look-ahead, offset scale, camera
 * collision), the row laid out as `OfficeWatch` lays it out (`layoutChipRow` inside `chipRowBounds`) with conservative CSS
 * sizes. From the office stop every chip shows far (the agent's name; a dot on phones); one zoom step (two on a portrait
 * screen) brings them near (the activity added; one line on the tablet camera). The chips show in full only once the
 * camera holds the office view (`officeChipMode`); outside it (reduced motion, a hand turn) they show as compact dots.
 */

const W = LOBBY.officeWing;
const slots = officeSlots(W);
/**
 * Chip sizes (px): a far chip (one 32 px pill, `min-h-8`, as wide as the longest name: "Tidak bertugas" is 92 px of
 * 13 px Inter, plus the dot, the gap and the padding), a near one (the pill and the 4 px CI bar with the 4 px gap, as wide
 * as a chip may be), a phone's compact far dot (32 x 32).
 */
const CHIP = { far: { w: 128, h: 32 }, near: { w: 176, h: 40 }, compact: { w: 32, h: 32 } } as const;

/**
 * The HUD boxes the row and the leader lines must stay out of (px, measured in the browser at these sizes): the desktop
 * profile card and elevator panel, the Corners minimap (tablets 112 px at top 76, phones 72 px at top 64) and joystick,
 * and the bottom band (the hint's top is 62 px over the bottom edge, 82 px on a portrait tablet).
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

/**
 * The HUD's top row bottom edge (px, measured in the browser at the six sizes): 62 from 768 px wide (`md:top-4`: the
 * desktop top bar; on the Corners HUD the 60 px top bar beside the 62 px floor chip, a landscape phone included), 58 on a
 * narrower screen (`top-3`: a portrait phone's floor chip).
 */
const hudBar = ({ width }: { width: number }) => (width >= 768 ? 62 : 58);

/**
 * Zoom key steps from the office stop to the near pose, per camera class: the first step that brings the chips under the
 * near band (e2e/office.spec.ts `nearChips` and scripts/office-shots.ts zoom in to it). On a phone the chips stay compact
 * at any distance, and on the tablet camera one line, so there the near pose only checks the row.
 */
const NEAR_STEPS: Record<ViewportClass, number> = { desktop: 1, tablet: 1, mobile: 2 };

/** Near: the scene's far band flips a far chip to near under this distance. */
const NEAR = OFFICE_CHIP_FAR - OFFICE_CHIP_FAR_BAND;

type Size = { width: number; height: number; coarse?: boolean };

/** The settled follow camera at the office stop (in the `L1:office` view zone), zoomed in by `steps` zoom key presses. */
function stopCamera(width: number, height: number, steps = 0): PerspectiveCamera {
  expect(zoneAt("L1", W.stop, floor.viewZones)?.id).toBe("L1:office");
  return followCamera(width, height, W.stop, steps);
}

/** Distance from the camera to a chip's anchor (its Rover's head). */
const anchorDistance = (camera: PerspectiveCamera, slot: number) => {
  const a = OFFICE_CHIP_ANCHORS[slot];
  return camera.position.distanceTo(new Vector3(a.x, a.y, a.z));
};

interface RowChip {
  slot: number;
  far: boolean;
  /** Its Rover's head on screen (px). */
  head: { x: number; y: number };
  /** Where it shows (its centre x), its box, and its leader line's ends (`leadEnd`: a tick at the wall's top, or faded); null when hidden. */
  x: number;
  box: ScreenBox | null;
  lead: { x0: number; y0: number; x1: number; y1: number; tick: boolean; faded: boolean } | null;
}

/** The screen wall's top edge (the frame's top, its front face) on screen: its two ends (px), as `OfficeWatch` projects it. */
function wallTopLine(camera: PerspectiveCamera, { width, height }: { width: number; height: number }): [number, number, number, number] {
  const { w, h, bottom, frame, t } = OFFICE.wall;
  const ends = [-1, 1].map((k) => new Vector3(W.wall.x + k * (w / 2 + frame), bottom + h + frame, W.wall.z - t / 2).project(camera));
  return [((ends[0].x + 1) / 2) * width, ((1 - ends[0].y) / 2) * height, ((ends[1].x + 1) / 2) * width, ((1 - ends[1].y) / 2) * height];
}

/**
 * The row as `OfficeWatch` lays it out at this pose: a chip shows where its Rover's head is on screen, sized from the
 * scene's far flag (from `was`, by default far as a chip starts and as a hidden one turns again; always far on a phone, on
 * a row narrower than five full chips or outside the office view, `compact`); the row then nudges them
 * apart in desk order inside `chipRowBounds`. A leader line runs from a chip's bottom centre toward its Rover's head where
 * that head sits `CHIP_ROW.lead` px or more under the chip and the drawn line crosses no HUD box, ending at the screen
 * wall's top (`leadEnd`).
 */
function chipRow(camera: PerspectiveCamera, size: Size, { compact = false, was = [true, true, true, true, true] as readonly boolean[], still = true } = {}) {
  const { width, height } = size;
  const viewport = viewportClass(width, height);
  const hud = hudLayout(viewport, size.coarse ?? false);
  const top = OFFICE_CHIP_TOP[hud === "phone" ? "mobile" : "desktop"];
  const boxes = officeHudBoxes(width, height, hud);
  const bounds = chipRowBounds(width, top, boxes);
  const max = chipMaxWidth(bounds, slots.length);
  const small = compact || viewport === "mobile";
  const oneLine = chipsOneLine(viewport, compact, max);
  const chips: RowChip[] = [];
  const shown: { chip: RowChip; w: number; h: number }[] = [];
  for (const s of slots) {
    const a = OFFICE_CHIP_ANCHORS[s.slot];
    const v = new Vector3(a.x, a.y, a.z).project(camera);
    // A far chip turns near only once the camera holds still (`OfficeWatch`).
    const far = nextChipFar(was[s.slot], anchorDistance(camera, s.slot), oneLine) || (was[s.slot] && !still);
    const chip: RowChip = { slot: s.slot, far, head: { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height }, x: NaN, box: null, lead: null };
    chips.push(chip);
    if (!(v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1)) continue;
    const dims = far ? (small ? CHIP.compact : CHIP.far) : CHIP.near;
    shown.push({ chip, w: dims.w, h: dims.h });
  }
  const out: number[] = [];
  const fits = layoutChipRow(
    shown.map((c) => c.chip.head.x),
    shown.map((c) => c.w / 2),
    out,
    shown.length,
    bounds,
  );
  expect(fits, "the row fits").toBe(true);
  const wall = wallTopLine(camera, size);
  shown.forEach(({ chip, w, h }, k) => {
    chip.x = out[k];
    chip.box = { x0: out[k] - w / 2, y0: top, x1: out[k] + w / 2, y1: top + h };
    const { x, y } = chip.head;
    const end = leadEnd(out[k], chip.box.y1, x, y, ...wall, CHIP_ROW.lead, { x: 0, y: 0, tick: false, faded: false });
    const lead = { x0: out[k], y0: chip.box.y1, x1: end.x, y1: end.y, tick: end.tick, faded: end.faded };
    if (y - chip.box.y1 >= CHIP_ROW.lead && !boxes.some((b) => segmentHits(lead, b))) chip.lead = lead;
  });
  return { top, bounds, oneLine, chips };
}

/** Whether the leader line crosses the box (`segmentHitsBox`, the scene's test). */
const segmentHits = (l: { x0: number; y0: number; x1: number; y1: number }, b: ScreenBox): boolean => segmentHitsBox(l.x0, l.y0, l.x1, l.y1, b);

/**
 * The shown chips: one row under the HUD's top bar, on screen inside the row's bounds, clear of every HUD box and of each
 * other (`CHIP_ROW.gap` apart), in the order of their Rovers' heads (the desk order in the office view), with their leader
 * lines clear of the HUD boxes and of the other chips, each chip nudged off its Rover's x only to make room.
 */
function expectRow(row: ReturnType<typeof chipRow>, size: Size, what: string) {
  const shown = row.chips.filter((c) => c.box);
  const hud = hudBoxes(size, size.coarse ?? false);
  for (const { slot, box, lead } of shown) {
    const name = `${what}: slot ${slot}`;
    expect(box!.y0, `${name} under the top bar`).toBeGreaterThanOrEqual(hudBar(size));
    expect(box!.y1, `${name} over the bottom band`).toBeLessThanOrEqual(size.height - HUD.bottom);
    expect(box!.x0, `${name} inside the row`).toBeGreaterThanOrEqual(row.bounds.left - 1e-6);
    expect(box!.x1, `${name} inside the row`).toBeLessThanOrEqual(row.bounds.right + 1e-6);
    expect(box!.x0, `${name} on screen`).toBeGreaterThanOrEqual(0);
    expect(box!.x1, `${name} on screen`).toBeLessThanOrEqual(size.width);
    for (const { id, box: h } of hud) {
      expect(boxesOverlap(box!, h), `${name} on the ${id}`).toBe(false);
      if (lead) expect(segmentHits(lead, h), `${name}'s leader line over the ${id}`).toBe(false);
    }
    if (lead) for (const other of shown) if (other.slot !== slot) expect(segmentHits(lead, other.box!), `${name}'s leader line under chip ${other.slot}`).toBe(false);
  }
  // A chip leaves its Rover's x only to make room: it then touches a neighbour (`CHIP_ROW.gap` apart) or a bound of the row.
  for (const { slot, box, head } of shown) {
    if (Math.abs((box!.x0 + box!.x1) / 2 - head.x) < 1e-6) continue;
    const touches = shown.some((o) => o.slot !== slot && (Math.abs(o.box!.x0 - box!.x1 - CHIP_ROW.gap) < 1e-6 || Math.abs(box!.x0 - o.box!.x1 - CHIP_ROW.gap) < 1e-6));
    const bound = Math.abs(box!.x0 - row.bounds.left) < 1e-6 || Math.abs(box!.x1 - row.bounds.right) < 1e-6;
    expect(touches || bound, `${what}: slot ${slot} nudged only to make room`).toBe(true);
  }
  const byHead = [...shown].sort((a, b) => a.head.x - b.head.x || a.slot - b.slot);
  for (let k = 1; k < byHead.length; k++) {
    const [a, b] = [byHead[k - 1].box!, byHead[k].box!];
    expect(b.x0 - a.x1, `${what}: slots ${byHead[k - 1].slot} and ${byHead[k].slot} apart, in order`).toBeGreaterThanOrEqual(CHIP_ROW.gap - 1e-6);
  }
}

/** The five desks with their Rovers: each slot's footprint from the floor to a Rover's height. */
function deskBox(camera: PerspectiveCamera, size: { width: number; height: number }): ScreenBox {
  return boxOf(
    camera,
    size,
    slots.flatMap(({ rect }) => [rect.minX, rect.maxX].flatMap((x) => [rect.minZ, rect.maxZ].flatMap((z) => [0, ROVER_HEIGHT].map((y) => [x, y, z] as const)))),
  );
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

describe("the chip row layout (`layoutChipRow`, `chipRowBounds`)", () => {
  const gap = CHIP_ROW.gap;
  const run = (targets: number[], half: number[], bounds = { left: 0, right: 1000 }) => {
    const out: number[] = [];
    const fits = layoutChipRow(targets, half, out, targets.length, bounds);
    return { out, fits };
  };
  /** Order kept (by target, ties by index), no overlaps (`gap` apart), inside the bounds. */
  const expectValid = (targets: number[], half: number[], out: number[], bounds: { left: number; right: number }) => {
    const order = targets.map((_, i) => i).sort((a, b) => targets[a] - targets[b] || a - b);
    for (let k = 1; k < order.length; k++) expect(out[order[k]] - half[order[k]] - (out[order[k - 1]] + half[order[k - 1]])).toBeGreaterThanOrEqual(gap - 1e-9);
    for (let i = 0; i < out.length; i++) {
      expect(out[i] - half[i]).toBeGreaterThanOrEqual(bounds.left - 1e-9);
      expect(out[i] + half[i]).toBeLessThanOrEqual(bounds.right + 1e-9);
    }
  };

  it("leaves chips that fit where they want to be", () => {
    expect(run([100, 300, 500], [40, 40, 40]).out).toEqual([100, 300, 500]);
    expect(run([], []).fits).toBe(true);
  });

  it("nudges a crowded run apart about its targets' mean (the least squared displacement), in order", () => {
    // Two at one spot split evenly; three keep the middle one put.
    expect(run([500, 500], [40, 40]).out).toEqual([500 - 40 - gap / 2, 500 + 40 + gap / 2]);
    const three = run([500, 500, 500], [40, 40, 40]).out;
    expect(three[1]).toBeCloseTo(500, 9);
    expect(three[2] - three[1]).toBeCloseTo(80 + gap, 9);
    // A lone chip far off does not move; a crowded pair moves only as far as it must, each by the same amount.
    const { out } = run([100, 140, 800], [30, 30, 30]);
    expect(out[2]).toBe(800);
    expect(out[1] - out[0]).toBeCloseTo(60 + gap, 9);
    expect(out[0] + out[1]).toBeCloseTo(240, 9);
    // The order follows the targets, not the input order (ties by index).
    const swapped = run([600, 400], [80, 80]).out;
    expect(swapped[0]).toBeGreaterThan(swapped[1]);
    const tie = run([500, 500], [40, 40]).out;
    expect(tie[0]).toBeLessThan(tie[1]);
    // Pushing one neighbour into the next merges the runs.
    const chain = run([100, 110, 200], [40, 40, 40]).out;
    expect(chain[1] - chain[0]).toBeCloseTo(80 + gap, 9);
    expect(chain[2] - chain[1]).toBeCloseTo(80 + gap, 9);
    expect(chain[0] + chain[1] + chain[2]).toBeCloseTo(410, 9);
  });

  it("shifts the row inside its bounds as a whole, and packs it from the left when it cannot fit", () => {
    const bounds = { left: 304, right: 1272 };
    const left = run([250, 320, 900], [50, 50, 50], bounds).out;
    expect(left[0]).toBe(354);
    expect(left[1]).toBe(354 + 100 + gap);
    expect(left[2]).toBe(900);
    const right = run([1300, 1300], [50, 50], bounds).out;
    expect(right[1]).toBe(1222);
    expect(right[0]).toBe(1222 - 100 - gap);
    const tight = run([100, 100, 100], [60, 60, 60], { left: 0, right: 300 });
    expect(tight.fits).toBe(false);
    expect(tight.out).toEqual([60, 60 + 120 + gap, 60 + 2 * (120 + gap)]);
  });

  it("is optimal on random rows: valid, and no single chip or run could move toward its targets without overlapping", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let trial = 0; trial < 300; trial++) {
      const n = 1 + Math.floor(rand() * 6);
      const bounds = { left: 8 + rand() * 200, right: 900 + rand() * 500 };
      const targets = Array.from({ length: n }, () => bounds.left - 50 + rand() * (bounds.right - bounds.left + 100));
      const half = Array.from({ length: n }, () => 16 + rand() * 72);
      const { out, fits } = run(targets, half, bounds);
      expect(fits).toBe(true);
      expectValid(targets, half, out, bounds);
      // Optimality (KKT): split the row into touching runs; a run clear of both bounds sits on its targets' mean.
      const order = targets.map((_, i) => i).sort((a, b) => targets[a] - targets[b] || a - b);
      let start = 0;
      for (let k = 1; k <= n; k++) {
        const touching = k < n && Math.abs(out[order[k]] - half[order[k]] - (out[order[k - 1]] + half[order[k - 1]]) - gap) < 1e-6;
        if (touching) continue;
        const run = order.slice(start, k);
        const atLeft = Math.abs(out[run[0]] - half[run[0]] - bounds.left) < 1e-6;
        const atRight = Math.abs(out[run.at(-1)!] + half[run.at(-1)!] - bounds.right) < 1e-6;
        const shift = run.reduce((sum, i) => sum + out[i] - targets[i], 0);
        if (!atLeft && !atRight) expect(Math.abs(shift), `trial ${trial}: a free run centres on its targets`).toBeLessThan(1e-6);
        // Every prefix of a run is pushed left at least as much as the run on average (no split would do better).
        let prefix = 0;
        for (let j = 0; j < run.length - 1; j++) {
          prefix += out[run[j]] - targets[run[j]];
          if (!atLeft && !atRight) expect(prefix, `trial ${trial}: run prefix ${j}`).toBeLessThanOrEqual(1e-6);
        }
        start = k;
      }
    }
  });

  it("trims the row past the HUD boxes in its band: the desktop profile card, the Corners minimap", () => {
    const top = OFFICE_CHIP_TOP.desktop;
    expect(chipRowBounds(1440, top, officeHudBoxes(1440, 900, "desktop"))).toEqual({ left: 296 + CHIP_ROW.edge, right: 1440 - CHIP_ROW.edge });
    expect(chipRowBounds(960, top, officeHudBoxes(960, 640, "tablet"))).toEqual({ left: CHIP_ROW.edge, right: 960 - 128 - CHIP_ROW.edge });
    expect(chipRowBounds(390, OFFICE_CHIP_TOP.mobile, officeHudBoxes(390, 844, "phone"))).toEqual({ left: CHIP_ROW.edge, right: 390 - 84 - CHIP_ROW.edge });
    // A short desktop window: the floor menu panel reaches up into the row's band.
    expect(chipRowBounds(1100, top, officeHudBoxes(1100, 360, "desktop")).right).toBe(1100 - 235 - CHIP_ROW.edge);
    // The joystick and the panel of a tall window stay out of the band.
    expect(chipRowBounds(1440, top, officeHudBoxes(1440, 900, "desktop")).right).toBe(1440 - CHIP_ROW.edge);
    // Five chips always fit: the max width shrinks on a narrow row.
    expect(chipMaxWidth({ left: 304, right: 1432 }, 5)).toBe(CHIP_ROW.max);
    expect(chipMaxWidth({ left: 8, right: 684 }, 5)).toBe(Math.floor((676 - 4 * CHIP_ROW.gap) / 5));
  });

  it("uses the measured HUD boxes", () => {
    for (const { width, height, coarse } of SIZES) {
      const layout = hudLayout(viewportClass(width, height), coarse);
      expect(officeHudBoxes(width, height, layout)).toEqual(hudBoxes({ width, height }, coarse).map((h) => h.box));
    }
  });

  it("tests a leader line against a HUD box along its whole length (`segmentHitsBox`)", () => {
    const box = { x0: 100, y0: 100, x1: 200, y1: 200 };
    // Through the middle, with both ends outside: the head check alone missed this.
    expect(segmentHitsBox(50, 150, 250, 150, box)).toBe(true);
    expect(segmentHitsBox(150, 50, 150, 250, box)).toBe(true);
    expect(segmentHitsBox(80, 80, 220, 230, box)).toBe(true);
    // One end inside, or the whole line inside.
    expect(segmentHitsBox(150, 150, 300, 300, box)).toBe(true);
    expect(segmentHitsBox(120, 130, 180, 170, box)).toBe(true);
    // Past a corner, along an edge, ending on an edge, and short of the box: clear.
    expect(segmentHitsBox(40, 150, 150, 40, box)).toBe(false);
    expect(segmentHitsBox(100, 50, 100, 250, box)).toBe(false);
    expect(segmentHitsBox(150, 20, 150, 100, box)).toBe(false);
    expect(segmentHitsBox(150, 20, 150, 99, box)).toBe(false);
    expect(segmentHitsBox(250, 150, 250, 150, box)).toBe(false);
    // Every direction gives the same answer, and it agrees with dense sampling on random lines.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 300;
    for (let i = 0; i < 500; i++) {
      const [x0, y0, x1, y1] = [rand(), rand(), rand(), rand()];
      let sampled = false;
      for (let k = 0; k <= 2000 && !sampled; k++) {
        const t = k / 2000;
        const [x, y] = [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
        sampled = x > box.x0 + 1e-6 && x < box.x1 - 1e-6 && y > box.y0 + 1e-6 && y < box.y1 - 1e-6;
      }
      const hit = segmentHitsBox(x0, y0, x1, y1, box);
      expect(segmentHitsBox(x1, y1, x0, y0, box)).toBe(hit);
      if (sampled) expect(hit, `${x0},${y0} to ${x1},${y1}`).toBe(true);
    }
  });
});

describe("Agent Office chips at the office stop", () => {
  it("anchor at each Rover's head top (no pose moves them)", () => {
    expect(OFFICE_ROVER_HEAD_TOP).toBeCloseTo(OFFICE_ROVER.head[1] + OFFICE_ROVER.head[4] / 2, 12);
    OFFICE_CHIP_ANCHORS.forEach((a, i) => expect(a).toEqual({ x: slots[i].rover.x, y: OFFICE_ROVER_HEAD_TOP, z: slots[i].rover.z }));
  });

  it("pin the row right under the HUD's top bar on every size", () => {
    for (const size of SIZES) {
      const top = OFFICE_CHIP_TOP[viewportClass(size.width, size.height) === "mobile" ? "mobile" : "desktop"];
      expect(top, `${size.width} x ${size.height}`).toBeGreaterThanOrEqual(hudBar(size));
      expect(top - hudBar(size), `${size.width} x ${size.height}`).toBeLessThanOrEqual(6);
    }
  });

  describe.each(SIZES)("$id ($width x $height)", ({ id, width, height, coarse }) => {
    const size = { width, height, coarse };
    const cls = cameraClass(width, height);
    const compact = viewportClass(width, height) === "mobile";

    it("frames the whole wall, the five desks and the visitor's rover, every Rover's head under the screen", () => {
      const camera = stopCamera(width, height);
      const wall = wallBox(camera, size);
      expect(wall.x0, "wall left edge").toBeGreaterThanOrEqual(0);
      expect(wall.x1, "wall right edge").toBeLessThanOrEqual(width);
      expect(wall.y0, "wall top on screen").toBeGreaterThanOrEqual(0);
      const desks = deskBox(camera, size);
      expect(desks.x0, "desks left edge").toBeGreaterThanOrEqual(0);
      expect(desks.x1, "desks right edge").toBeLessThanOrEqual(width);
      expect(desks.y1, "desks over the bottom band").toBeLessThanOrEqual(height - HUD.bottom);
      const rover = roverScreenBox(camera, W.stop, floorY("L1"), size, new Vector3(), { x0: 0, y0: 0, x1: 0, y1: 0 });
      expect(rover).not.toBeNull();
      expect(rover!.x0).toBeGreaterThanOrEqual(0);
      expect(rover!.x1).toBeLessThanOrEqual(width);
      expect(rover!.y1, "rover over the bottom band").toBeLessThanOrEqual(height - HUD.bottom);
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

    it("end every leader line at the screen wall's top with a tick, off the screens' text (faded to the head where the chip row sits over the wall: a landscape phone), also at a desktop's near pose", () => {
      // The tablet camera's near pose raises the wall's top over the row (its leader lines fade); phones keep compact dots.
      for (const steps of cls === "desktop" ? [0, NEAR_STEPS[cls]] : [0]) {
        const camera = stopCamera(width, height, steps);
        const row = chipRow(camera, size);
        const [x0, y0, x1, y1] = wallTopLine(camera, size);
        for (const c of row.chips) {
          const lead = c.lead!;
          expect(lead, `slot ${c.slot}'s leader line (${steps} steps)`).not.toBeNull();
          if (id === "landscape phone") {
            expect([lead.tick, lead.faded], `slot ${c.slot} faded over the wall`).toEqual([false, true]);
            continue;
          }
          expect([lead.tick, lead.faded], `slot ${c.slot} ends at the wall's top (${steps} steps)`).toEqual([true, false]);
          expect(lead.y1, `slot ${c.slot} on the wall's top edge`).toBeCloseTo(y0 + ((y1 - y0) * (lead.x1 - x0)) / (x1 - x0), 6);
          expect(lead.y1 - lead.y0, `slot ${c.slot} at least ${CHIP_ROW.lead} px long`).toBeGreaterThanOrEqual(CHIP_ROW.lead);
          expect(lead.y1, `slot ${c.slot} above its Rover's head`).toBeLessThan(c.head.y);
        }
      }
    });

    it("show all five far (the name; a dot on a phone) in one row over their Rovers, with a leader line down to each", () => {
      const row = chipRow(stopCamera(width, height), size);
      for (const c of row.chips) {
        // A chip starts far (`officeRuntime.far`) and turns far again whenever it hides, so it stays far past the band's near edge.
        expect(c.far, `slot ${c.slot} far`).toBe(true);
        expect(c.box, `slot ${c.slot} on screen`).not.toBeNull();
        expect(c.lead, `slot ${c.slot}'s leader line`).not.toBeNull();
      }
      if (compact) for (const c of row.chips) expect(c.box!.x1 - c.box!.x0).toBe(CHIP.compact.w);
      expectRow(row, size, "stop");
    });

    it("stay far, shown and in order with the rover anywhere in the stop's zone (its corners, 2 u by 1.4 u off the stop)", () => {
      const { half } = OFFICE.view;
      let nearest = Infinity;
      for (const dx of [-half.x, 0, half.x])
        for (const dz of [-half.z, 0, half.z]) {
          const at = { x: W.stop.x + dx, z: W.stop.z + dz };
          expect(zoneAt("L1", at, floor.viewZones)?.id, `zone at ${dx}, ${dz}`).toBe("L1:office");
          const camera = followCamera(width, height, at);
          const row = chipRow(camera, size);
          for (const c of row.chips) {
            nearest = Math.min(nearest, anchorDistance(camera, c.slot));
            expect(c.far, `slot ${c.slot} far at ${dx}, ${dz}`).toBe(true);
            expect(c.box, `slot ${c.slot} on screen at ${dx}, ${dz}`).not.toBeNull();
          }
          expectRow(row, size, `at ${dx}, ${dz}`);
        }
      if (!chipRow(stopCamera(width, height), size).oneLine) expect(nearest).toBeGreaterThan(NEAR);
    });

    it(`the near pose (${NEAR_STEPS[cls]} zoom steps) adds the activity where five full chips fit the row (dots on a phone, one line on a narrow row), the row still clear and in order`, () => {
      const steps = NEAR_STEPS[cls];
      const camera = stopCamera(width, height, steps);
      const row = chipRow(camera, size);
      // One line on a phone and where the row is narrower than five chips at `CHIP_ROW.max` (960 x 640, a portrait tablet).
      expect(row.oneLine, "one line").toBe(compact || id === "tablet" || id === "portrait tablet");
      for (const slot of [1, 2, 3]) {
        expect(row.chips[slot].box, `slot ${slot} on screen`).not.toBeNull();
        expect(row.chips[slot].far, `slot ${slot} shows its activity`).toBe(row.oneLine);
      }
      if (!row.oneLine) {
        for (const slot of [0, 1, 2, 3, 4]) expect(anchorDistance(camera, slot), `slot ${slot} near`).toBeLessThan(NEAR);
        // The first step that does: one less leaves them far.
        const before = stopCamera(width, height, steps - 1);
        expect([0, 1, 2, 3, 4].some((slot) => anchorDistance(before, slot) < NEAR)).toBe(false);
      }
      expectRow(row, size, "near");
    });
  });

  describe.each(SIZES)("off the stop, $id ($width x $height)", ({ width, height, coarse }) => {
    const size = { width, height, coarse };

    it("hide the chips in the wing outside the stop zone (S + 2 to S + 14), where the office is still a backdrop", () => {
      for (const dz of [2, 4, 6, 8, 10, 12, 14])
        for (const dx of [-5, 0, 5]) {
          const at = { x: W.lead.x + dx, z: W.rect.minZ + dz, heading: 0 };
          expect(officeChipsHere(null, at), `chips at S + ${dz}, x ${at.x}`).toBe(false);
          expect(officeChipMode(null, at, "L1:office", true), `chips at S + ${dz}, x ${at.x}`).toBeNull();
        }
    });

    it("arriving from the plain follow view, the zone eases the camera in (the chips wait, `officeChipMode`), then the row settles clear", () => {
      const at = { ...W.stop, heading: 0 };
      expect(officeChipsHere(null, at)).toBe(true);
      const cls = cameraClass(width, height);
      const orbit = createOrbitState();
      setPitchRange(orbit, pitchRange(cls, "follow"));
      orbit.yaw = orbit.yawTarget = yawLooking({ x: 0, z: 1 });
      updateZone(orbit, zoneAt("L1", at, floor.viewZones), false, cls);
      expect(orbit.easing, "the zone eases the camera in").toBe(true);
      for (let frame = 0; frame < 300 && orbit.easing; frame++) stepOrbit(orbit, 1 / 60, false);
      expect(orbit.easing).toBe(false);
      const row = chipRow(orbitCamera(orbit, width, height, at), size);
      expect(row.chips.filter((c) => c.box)).toHaveLength(5);
      expectRow(row, size, "eased");
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
     * and the row as `OfficeWatch` would lay it out (their far flags carried from frame to frame, turned far while hidden).
     */
    function run(orbit: OrbitState, reduced: boolean, frames: number, drawn: Pose, frame: (camera: PerspectiveCamera, mode: ReturnType<typeof officeChipMode>, row: ReturnType<typeof chipRow>) => void, hold = createZoneHold()) {
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
        const row = chipRow(camera, size, { compact: mode === "compact", was, still });
        was = row.chips.map((c) => (mode && c.box ? c.far : true));
        frame(camera, mode, row);
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

    it("a hand zoom keeps them shown (a landscape screen's look offset holds, a desktop's re-aimed for the near pose), the row clear on every frame; a portrait screen's eases its offset out, so its chips wait", () => {
      const { orbit, drawn, hold } = settledAtStop();
      zoomBy(orbit, 0.8, false);
      const modes: ReturnType<typeof officeChipMode>[] = [];
      run(
        orbit,
        false,
        240,
        drawn,
        (_, mode, row) => {
          modes.push(mode);
          if (mode) expectRow(row, size, `frame ${modes.length}`);
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

    it("a hand turn or drag in the zone (the view no longer applies) turns them into compact dots at once, the row clear and in order", () => {
      for (const turn of [(o: OrbitState) => rotate(o, 0.35, 0), (o: OrbitState) => rotate(o, -0.35, -0.1), (o: OrbitState) => rotateStep(o, 1), (o: OrbitState) => rotateStep(o, -1)]) {
        const { orbit, drawn, hold } = settledAtStop();
        turn(orbit);
        const modes: ReturnType<typeof officeChipMode>[] = [];
        run(
          orbit,
          false,
          120,
          drawn,
          (_, mode, row) => {
            modes.push(mode);
            for (const c of row.chips) if (c.box) expect(c.box.x1 - c.box.x0, `slot ${c.slot} a dot`).toBeCloseTo(CHIP.compact.w, 6);
            expectRow(row, size, `turn frame ${modes.length}`);
          },
          hold,
        );
        expect(modes.every((m) => m === "compact")).toBe(true);
      }
    });

    it("under reduced motion (the zone's view never applies) the plain follow view shows compact dots, the row clear and in order", () => {
      for (const yaw of [south, south - 0.4, south + 0.4, 0]) {
        const orbit = createOrbitState();
        setPitchRange(orbit, pitchRange(cls, "follow"));
        orbit.yaw = orbit.yawTarget = yaw;
        const drawn = orbitPose(orbit, width, height, at);
        const modes: ReturnType<typeof officeChipMode>[] = [];
        run(orbit, true, 30, drawn, (_, mode, row) => {
          modes.push(mode);
          for (const c of row.chips) if (c.box) expect([c.far, Math.round(c.box.x1 - c.box.x0), mode], `slot ${c.slot} a dot`).toEqual([true, CHIP.compact.w, "compact"]);
          expectRow(row, size, `yaw ${yaw}`);
        });
        expect(orbit.zoom, "the zone's view never applied").toBe(1);
        expect(modes.every((m) => m === "compact")).toBe(true);
      }
    });
  });
});

