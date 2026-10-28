import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { followEase } from "@/experience/camera/offset";
import { createOrbitState, createZoneHold, holdZone, rotate, rotateStep, setPitchRange, stepOrbit, updateZone, yawLooking, zoneAt, zoomBy, type OrbitState } from "@/experience/camera/orbit";
import { pitchRange } from "@/experience/camera/rigs";
import { floorY, LOBBY, ROVER_HEIGHT } from "@/experience/config";
import { yawTowards } from "@/experience/fx/facing";
import { signPlate } from "@/experience/fx/signLayout";
import { roverScreenBox } from "@/experience/floors/library/decor/signFrame";
import { OFFICE, officeSlots, rowSlots } from "@/experience/floors/lobby/officeLayout";
import { LEAD, leadEnd } from "@/experience/floors/lobby/office/officeFrame";
import { OFFICE_ROVER } from "@/experience/floors/lobby/office/officeVisual";
import {
  CHIP_ROW,
  chipMaxWidth,
  chipRowBounds,
  chipsOneLine,
  chipsDotsOnly,
  layoutChipRow,
  drawerEdge,
  layoutChipRows,
  nextChipFar,
  OFFICE_CHIP_ANCHORS,
  OFFICE_CHIP_FAR,
  OFFICE_CHIP_FAR_BAND,
  OFFICE_CHIP_TOP,
  OFFICE_ROVER_HEAD_TOP,
  officeHudBoxes,
  segmentHitsBox,
} from "@/experience/floors/lobby/office/chipRows";
import { officeChipMode, officeChipsHere, officeSign, wingSignHidden } from "@/experience/floors/lobby/officeShell";
import { boxesOverlap, type ScreenBox } from "@/experience/fx/labelPlacement";
import type { CameraClass } from "@/experience/types";
import { hudLayout } from "@/hud/layout";
import { cameraClass, viewportClass } from "@/lib/viewport";
import { boxOf, floor, followCamera, orbitCamera, orbitPose, poseCamera, SIZES, type Pose } from "../helpers/office-cameras";

/**
 * Office chips (owner decisions 2026-10-20 and 2026-10-21): one compact row of ten pinned under the HUD's top bar, each chip
 * over its Rover's head (the projected head's x, both console rows), nudged along x in the order of those heads so the
 * chips never overlap each other or the HUD (the desktop profile card and floor menu panel, the Corners minimap and
 * joystick), with a leader line down to its Rover; phones show dots, in two rows where one does not fit. The follow camera
 * as `CameraDirector` settles it in the `L1:office` view zone (look-ahead, offset scale, camera collision), the row laid
 * out as `OfficeWatch` lays it out (`layoutChipRows` inside `chipRowBounds`, each chip capped at the row's fit
 * `chipMaxWidth`) with conservative CSS sizes. From the office stop every chip shows far (the agent's name; a dot on
 * phones, for an off-duty desk and where the names do not fit); one zoom step (two on a portrait screen) brings them near
 * (the activity added where the row leaves a chip `CHIP_ROW.near` wide). The chips show in full only once the camera
 * holds the office view (`officeChipMode`); outside it (reduced motion, a hand turn) they show as compact dots.
 */

const W = LOBBY.officeWing;
/** The Rovers the live scene draws and labels: both rows (slots 0 to 9). */
const slots = officeSlots(W);
/** Ten sessions (every chip has a name, the widest row) and five (the front row; the back row's desks off duty). */
const ALL = slots.map((s) => s.slot);
const FRONT = rowSlots(slots, 0).map((s) => s.slot);
/**
 * Chip sizes (px): a far chip (one 32 px pill, `min-h-8`, as wide as a name with the helpers total: "Copilot" is 47 px of
 * 13 px Inter, plus the dot, the gaps, the drone ring, the total and the padding), a near one (the pill and the 4 px CI bar
 * with the 4 px gap, as wide as a chip may be), both capped at the row's fit (`chipMaxWidth`); a compact dot (32 x 32).
 */
const CHIP = { far: { w: 128, h: 32 }, near: { w: 176, h: 40 }, compact: { w: CHIP_ROW.dot, h: CHIP_ROW.dot } } as const;

/**
 * The HUD boxes the row and the leader lines must stay out of (px, measured in the browser at these sizes): the desktop
 * profile card and elevator panel, the Corners minimap (tablets 112 px at top 76, phones 72 px at top 64) and joystick,
 * and the bottom band (the hint's top is 62 px over the bottom edge, 82 px on a portrait tablet).
 */
const HUD = { bottom: 84 } as const;
/** A replay pill's widest widths (px): "Putar ulang · 14:05" and, on a phone (ten dots in two rows leave 80 px), the clock alone. */
const PILL = { wide: 130, phone: 70 } as const;

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
const NEAR_STEPS: Record<CameraClass, number> = { desktop: 1, tablet: 1, mobile: 2, landscape: 1 };

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
  /** Where it shows (its centre x, its row: 0 the top), its box, and its leader line's ends (`leadEnd`: a tick at the wall's top, or faded); null when hidden. */
  x: number;
  row: number;
  box: ScreenBox | null;
  lead: Lead | null;
  /** The leader line `OfficeWatch` hides because it would cross a HUD box or another chip (null when drawn or too short). */
  blocked: Lead | null;
}

interface Lead {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  tick: boolean;
  faded: boolean;
}

/** The screen wall's top edge (the frame's top, its front face) on screen: its two ends (px), as `OfficeWatch` projects it. */
function wallTopLine(camera: PerspectiveCamera, size: { width: number; height: number }): [number, number, number, number] {
  const { h, bottom, frame } = OFFICE.wall;
  return wallEdge(camera, size, bottom + h + frame);
}

function wallEdge(camera: PerspectiveCamera, { width, height }: { width: number; height: number }, y: number): [number, number, number, number] {
  const { w, frame, t } = OFFICE.wall;
  const ends = [-1, 1].map((k) => new Vector3(W.wall.x + k * (w / 2 + frame), y, W.wall.z - t / 2).project(camera));
  return [((ends[0].x + 1) / 2) * width, ((1 - ends[0].y) / 2) * height, ((ends[1].x + 1) / 2) * width, ((1 - ends[1].y) / 2) * height];
}

/**
 * The row as `OfficeWatch` lays it out at this pose: a chip shows where its Rover's head is on screen, sized from the
 * scene's far flag (from `was`, by default far as a chip starts and as a hidden one turns again; always far on a phone, on
 * a row whose fit is under `CHIP_ROW.near` or outside the office view, `compact`) and capped at the row's fit for the
 * `named` desks' chips (an off-duty desk's chip is a dot); every chip a dot on a phone, outside the office view or where
 * the names do not fit (`chipsDotsOnly`). The row then nudges them apart in the order of their heads inside
 * `chipRowBounds`, in two rows of dots where one does not fit (`layoutChipRows`). A leader line runs from a chip's bottom
 * centre toward its Rover's head where that head sits `CHIP_ROW.lead` px or more under the chip and the drawn line crosses
 * no HUD box and no other chip, stopping at the wall-top level with a tick (`leadEnd`: on the wall's top edge, or beside
 * the wall above an end Rover, the tick clear of the HUD boxes), faded to the head where the chip sits over the level;
 * hidden where the line would still cross the HUD or a chip.
 */
function chipRow(camera: PerspectiveCamera, size: Size, { compact = false, was = ALL.map(() => true) as readonly boolean[], still = true, named = ALL as readonly number[], pill = 0 } = {}) {
  const { width, height } = size;
  const viewport = viewportClass(width, height);
  const hud = hudLayout(viewport, size.coarse ?? false);
  const top = OFFICE_CHIP_TOP[hud === "phone" ? "mobile" : "desktop"];
  const boxes = officeHudBoxes(width, height, hud);
  const bounds = chipRowBounds(width, top, boxes);
  // A day replay's pill (`pill` px wide) sits at the row's left bound; the chips' bounds start after it and the gap (`OfficeWatch`).
  const pillBox: ScreenBox | null = pill ? { x0: bounds.left, y0: top, x1: bounds.left + pill, y1: top + CHIP_ROW.dot } : null;
  if (pill) bounds.left += pill + CHIP_ROW.gap;
  const max = chipMaxWidth(bounds, named.length, slots.length - named.length);
  const small = compact || viewport === "mobile" || chipsDotsOnly(max);
  const oneLine = chipsOneLine(viewport, compact, max);
  const chips: RowChip[] = [];
  const shown: { chip: RowChip; w: number; h: number }[] = [];
  for (const s of slots) {
    const a = OFFICE_CHIP_ANCHORS[s.slot];
    const v = new Vector3(a.x, a.y, a.z).project(camera);
    // A far chip turns near only once the camera holds still (`OfficeWatch`).
    const far = nextChipFar(was[s.slot], anchorDistance(camera, s.slot), oneLine) || (was[s.slot] && !still);
    const chip: RowChip = { slot: s.slot, far, head: { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height }, x: NaN, row: 0, box: null, lead: null, blocked: null };
    chips.push(chip);
    if (!(v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1)) continue;
    const dot = !named.includes(s.slot) || (far && small);
    const dims = dot ? CHIP.compact : far ? CHIP.far : CHIP.near;
    shown.push({ chip, w: dot ? dims.w : Math.min(dims.w, max), h: dims.h });
  }
  const out: number[] = [];
  const rows: number[] = [];
  const fits = layoutChipRows(
    shown.map((c) => c.chip.head.x),
    shown.map((c) => c.w / 2),
    out,
    rows,
    shown.length,
    bounds,
  );
  expect(fits, "the row fits").toBe(true);
  const wall = wallTopLine(camera, size);
  shown.forEach(({ chip, w, h }, k) => {
    chip.x = out[k];
    chip.row = rows[k];
    const y0 = top + rows[k] * (CHIP_ROW.dot + CHIP_ROW.gap);
    chip.box = { x0: out[k] - w / 2, y0, x1: out[k] + w / 2, y1: y0 + h };
  });
  shown.forEach(({ chip }) => {
    const box = chip.box!;
    const { x, y } = chip.head;
    const others = shown.filter((o) => o.chip !== chip).map((o) => o.chip.box!);
    if (y - box.y1 < CHIP_ROW.lead) return;
    const end = (above: boolean) => {
      const e = leadEnd(chip.x, box.y1, x, y, ...wall, CHIP_ROW.lead, { x: 0, y: 0, tick: false, faded: false }, boxes, width, above);
      return { x0: chip.x, y0: box.y1, x1: e.x, y1: e.y, tick: e.tick, faded: e.faded };
    };
    const blocked = (l: ReturnType<typeof end>) => [...boxes, ...others].some((b) => segmentHits(l, b));
    // A tick above the head whose line would cross another chip moves to where the line meets the level; one that would
    // still cross the HUD or another chip hides (the chip's colour maps it).
    let lead = end(true);
    if (blocked(lead) && lead.tick) lead = end(false);
    if (blocked(lead)) chip.blocked = lead;
    else chip.lead = lead;
  });
  return { top, bounds, max, oneLine, two: rows.slice(0, shown.length).some((r) => r === 1), chips, pill: pillBox };
}

/** Whether the leader line crosses the box (`segmentHitsBox`, the scene's test). */
const segmentHits = (l: { x0: number; y0: number; x1: number; y1: number }, b: ScreenBox): boolean => segmentHitsBox(l.x0, l.y0, l.x1, l.y1, b);

/**
 * The shown chips: one row under the HUD's top bar (two rows of dots where one does not fit, a dot and a gap apart), on
 * screen inside the row's bounds, clear of every HUD box and of each other (`CHIP_ROW.gap` apart in a row), in the order
 * of their Rovers' heads along x, with their leader lines clear of the HUD boxes and of the other chips, each chip nudged
 * off its Rover's x only to make room.
 */
function expectRow(row: ReturnType<typeof chipRow>, size: Size, what: string) {
  const shown = row.chips.filter((c) => c.box);
  const hud = hudBoxes(size, size.coarse ?? false);
  for (const { slot, box, lead } of shown) {
    const name = `${what}: slot ${slot}`;
    expect(box!.y0, `${name} under the top bar`).toBeGreaterThanOrEqual(hudBar(size));
    expect(box!.y1, `${name} in the row's band`).toBeLessThanOrEqual(row.top + CHIP_ROW.band);
    expect(box!.y1, `${name} over the bottom band`).toBeLessThanOrEqual(size.height - HUD.bottom);
    expect(box!.x0, `${name} inside the row`).toBeGreaterThanOrEqual(row.bounds.left - 1e-6);
    expect(box!.x1, `${name} inside the row`).toBeLessThanOrEqual(row.bounds.right + 1e-6);
    expect(box!.x0, `${name} on screen`).toBeGreaterThanOrEqual(0);
    expect(box!.x1, `${name} on screen`).toBeLessThanOrEqual(size.width);
    for (const { id, box: h } of hud) {
      expect(boxesOverlap(box!, h), `${name} on the ${id}`).toBe(false);
      if (lead) expect(segmentHits(lead, h), `${name}'s leader line over the ${id}`).toBe(false);
    }
    for (const other of shown) {
      if (other.slot === slot) continue;
      expect(boxesOverlap(box!, other.box!), `${name} on chip ${other.slot}`).toBe(false);
      if (lead) expect(segmentHits(lead, other.box!), `${name}'s leader line under chip ${other.slot}`).toBe(false);
    }
  }
  if (row.pill) {
    for (const { id, box: h } of hud) expect(boxesOverlap(row.pill, h), `${what}: the pill on the ${id}`).toBe(false);
    for (const c of shown) expect(boxesOverlap(row.pill, c.box!), `${what}: the pill on chip ${c.slot}`).toBe(false);
    expect(row.pill.x0, `${what}: the pill inside the screen`).toBeGreaterThanOrEqual(0);
  }
  const byHead = [...shown].sort((a, b) => a.head.x - b.head.x || a.slot - b.slot);
  // In two rows neighbours alternate rows, `pitch` apart (up to a dot's width, `layoutChipRows`).
  const pitch = Math.min(CHIP_ROW.dot, (row.bounds.right - row.bounds.left - CHIP_ROW.dot) / (shown.length - 1));
  for (let k = 1; k < byHead.length; k++) {
    const [a, b] = [byHead[k - 1], byHead[k]];
    const order = `${what}: slots ${a.slot} and ${b.slot} in order`;
    expect(b.x, order).toBeGreaterThan(a.x);
    if (row.two) expect(b.row, `${what}: slots ${a.slot} and ${b.slot} in alternate rows`).not.toBe(a.row);
    else expect(b.box!.x0 - a.box!.x1, `${order}, apart`).toBeGreaterThanOrEqual(CHIP_ROW.gap - 1e-6);
  }
  // A chip leaves its Rover's x only to make room: it then sits as close to a neighbour as the row allows, or at a bound.
  const closest = (a: RowChip, b: RowChip) => (row.two ? Math.abs(Math.abs(a.x - b.x) - pitch) < 1e-6 : Math.abs(a.box!.x0 - b.box!.x1 - CHIP_ROW.gap) < 1e-6 || Math.abs(b.box!.x0 - a.box!.x1 - CHIP_ROW.gap) < 1e-6);
  byHead.forEach((c, k) => {
    if (Math.abs(c.x - c.head.x) < 1e-6) return;
    const touches = [byHead[k - 1], byHead[k + 1]].some((o) => o && closest(c, o));
    const bound = Math.abs(c.box!.x0 - row.bounds.left) < 1e-6 || Math.abs(c.box!.x1 - row.bounds.right) < 1e-6;
    expect(touches || bound, `${what}: slot ${c.slot} nudged only to make room`).toBe(true);
  });
}

/** The ten desks with their Rovers: each slot's footprint from its row's floor to a Rover's height over it. */
function deskBox(camera: PerspectiveCamera, size: { width: number; height: number }): ScreenBox {
  return boxOf(
    camera,
    size,
    slots.flatMap(({ rect, lift }) => [rect.minX, rect.maxX].flatMap((x) => [rect.minZ, rect.maxZ].flatMap((z) => [lift, lift + ROVER_HEIGHT].map((y) => [x, y, z] as const)))),
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

// Heavy: random rows and 3D pose sweeps; a loaded CI runner can pass the 5 s default.
describe("the chip row layout (`layoutChipRow`, `chipRowBounds`)", { timeout: 30_000 }, () => {
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

  it("an open drawer: a bottom sheet (tablets, phones) hides the row, a side panel is a HUD box the row keeps off", () => {
    for (const [w, h] of [[820, 1180], [768, 1024], [390, 844], [844, 390], [899, 600]]) {
      expect(drawerEdge(true, w, h), `${w} x ${h} sheet`).toBe(0);
      expect(drawerEdge(false, w, h), `${w} x ${h} closed`).toBe(w);
    }
    // The side panel's left edge: its width and the 16 px margin (480, 560 from 1280, 600 from 1400).
    expect(drawerEdge(true, 1440, 900)).toBe(1440 - 16 - 600);
    expect(drawerEdge(true, 1280, 720)).toBe(1280 - 16 - 560);
    expect(drawerEdge(true, 1024, 768)).toBe(1024 - 16 - 480);
    // A landscape tablet from 900 px wide has the side panel too.
    expect(drawerEdge(true, 900 + 100, 800)).toBe(1000 - 16 - 480);
    const edge = drawerEdge(true, 1440, 900);
    const boxes = officeHudBoxes(1440, 900, "desktop", edge);
    expect(boxes).toHaveLength(3);
    expect(boxes[2]).toEqual({ x0: edge, y0: 0, x1: 1440, y1: 900 });
    expect(chipRowBounds(1440, OFFICE_CHIP_TOP.desktop, boxes).right).toBe(edge - CHIP_ROW.edge);
    // No drawer: the boxes are the HUD's own.
    expect(officeHudBoxes(1440, 900, "desktop", 1440)).toHaveLength(2);
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
    // Five named chips (no dots) always fit: the max width shrinks on a narrow row.
    expect(chipMaxWidth({ left: 304, right: 1432 }, 5)).toBe(CHIP_ROW.max);
    expect(chipMaxWidth({ left: 8, right: 684 }, 5)).toBe(Math.floor((676 - 4 * CHIP_ROW.gap) / 5));
  });

  it("fits ten chips in one row: the named ones share what the off-duty desks' dots leave, near only from `CHIP_ROW.near`, dots under `CHIP_ROW.name`", () => {
    const desk = chipRowBounds(1440, OFFICE_CHIP_TOP.desktop, officeHudBoxes(1440, 900, "desktop"));
    const small = chipRowBounds(1280, OFFICE_CHIP_TOP.desktop, officeHudBoxes(1280, 720, "desktop"));
    const tablet = chipRowBounds(960, OFFICE_CHIP_TOP.desktop, officeHudBoxes(960, 640, "tablet"));
    // Ten sessions on a desktop: the names, one line (1128 px and 968 px of row for ten chips and nine gaps).
    expect(chipMaxWidth(desk, 10)).toBe(Math.floor((1128 - 9 * CHIP_ROW.gap) / 10));
    expect(chipMaxWidth(small, 10)).toBe(Math.floor((968 - 9 * CHIP_ROW.gap) / 10));
    for (const b of [desk, small]) {
      expect(chipsDotsOnly(chipMaxWidth(b, 10)), "names").toBe(false);
      expect(chipsOneLine("desktop", false, chipMaxWidth(b, 10)), "one line").toBe(true);
    }
    // Five sessions: the back row's five dots leave room for the activity near.
    expect(chipMaxWidth(desk, 5, 5)).toBe(CHIP_ROW.max);
    expect(chipMaxWidth(small, 5, 5)).toBe(Math.floor((968 - 9 * CHIP_ROW.gap - 5 * CHIP_ROW.dot) / 5));
    expect(chipsOneLine("desktop", false, chipMaxWidth(small, 5, 5))).toBe(false);
    // Ten on a small landscape tablet: no room for the names, every chip a dot; no names at all: the cap is moot.
    expect(chipsDotsOnly(chipMaxWidth(tablet, 10))).toBe(true);
    expect(chipMaxWidth(tablet, 0, 10)).toBe(CHIP_ROW.max);
  });

  it("lays ten dots out in two rows where one does not fit (a phone beside the minimap): alternate rows in order, a row's dots apart, inside the bounds", () => {
    const bounds = chipRowBounds(390, OFFICE_CHIP_TOP.mobile, officeHudBoxes(390, 844, "phone"));
    const half = Array.from({ length: 10 }, () => CHIP_ROW.dot / 2);
    for (const targets of [
      [20, 60, 100, 140, 180, 220, 260, 300, 340, 380],
      [195, 195, 195, 195, 195, 195, 195, 195, 195, 195],
      [380, 10, 300, 40, 200, 200, 120, 90, 250, 160],
    ]) {
      const out: number[] = [];
      const rows: number[] = [];
      expect(layoutChipRow(targets, half, [], 10, bounds), "one row does not fit").toBe(false);
      expect(layoutChipRows(targets, half, out, rows, 10, bounds)).toBe(true);
      const order = targets.map((_, i) => i).sort((a, b) => targets[a] - targets[b] || a - b);
      const pitch = Math.min(CHIP_ROW.dot, (bounds.right - bounds.left - CHIP_ROW.dot) / 9);
      order.forEach((i, k) => {
        expect(rows[i]).toBe(k % 2);
        expect(out[i] - CHIP_ROW.dot / 2).toBeGreaterThanOrEqual(bounds.left - 1e-9);
        expect(out[i] + CHIP_ROW.dot / 2).toBeLessThanOrEqual(bounds.right + 1e-9);
        if (k === 0) return;
        expect(out[i] - out[order[k - 1]], "neighbours a pitch or more apart").toBeGreaterThanOrEqual(pitch - 1e-9);
        if (k > 1) expect(out[i] - out[order[k - 2]] - CHIP_ROW.dot, "a row's dots apart").toBeGreaterThanOrEqual(CHIP_ROW.gap - 1e-9);
      });
    }
    // One row where it fits; and where two rows cannot hold them either, packed from the left (the caller hides the rest).
    const rows: number[] = [];
    expect(layoutChipRows([100, 200], [16, 16], [], rows, 2, bounds)).toBe(true);
    expect(rows).toEqual([0, 0]);
    expect(layoutChipRows(Array.from({ length: 10 }, () => 50), half, [], rows, 10, { left: 0, right: 150 })).toBe(false);
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

describe("Agent Office chips at the office stop", { timeout: 30_000 }, () => {
  it("anchor at each Rover's head top (no pose moves them)", () => {
    expect(OFFICE_ROVER_HEAD_TOP).toBeCloseTo(OFFICE_ROVER.head[1] + OFFICE_ROVER.head[4] / 2, 12);
    const all = officeSlots(W);
    expect(OFFICE_CHIP_ANCHORS).toHaveLength(all.length);
    // On its row's floor: the back row's heads stand the riser's height higher.
    OFFICE_CHIP_ANCHORS.forEach((a, i) => expect(a).toEqual({ x: all[i].rover.x, y: all[i].lift + OFFICE_ROVER_HEAD_TOP, z: all[i].rover.z }));
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

    it("frames the whole wall, the ten desks and the visitor's rover, every front-row Rover's head under the screen, the back row's under the wall's top", () => {
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
      const wallTop = boxOf(camera, size, [[W.wall.x, OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame, W.wall.z - OFFICE.wall.t / 2]]).y0;
      for (const s of rowSlots(slots, 1)) {
        const tip = boxOf(camera, size, [[s.rover.x, s.lift + OFFICE_ROVER.tip.y + OFFICE_ROVER.tip.size / 2, s.rover.z]]).y0;
        expect(tip, `Rover ${s.slot + 1}'s antenna under the wall's top`).toBeGreaterThan(wallTop);
      }
      for (const s of rowSlots(slots, 0)) {
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

    /**
     * Every leader line stops at the wall-top level (the screen wall's top edge, extended past its ends) with a tick, so
     * none runs down past it: on the wall's top edge where it crosses it there, beside the wall above its end Rover's head
     * (ten chips span a row wider than the wall), the tick clear of the HUD boxes. Where the chips sit over the level (a
     * landscape phone's row, a phone's second row of dots) the lines run faded to the heads. A phone's top-row dots' lines
     * pass between the dots under them (`OfficeWatch` would hide one that crossed a chip).
     */
    it("stop every leader line at the wall-top level with a tick, on the wall or beside it, none below it (faded to the head where the chip sits over the wall), also at a desktop's near pose", () => {
      for (const named of [ALL, FRONT])
        for (const steps of cls === "desktop" ? [0, NEAR_STEPS[cls]] : [0]) {
          const camera = stopCamera(width, height, steps);
          const row = chipRow(camera, size, { named, was: ALL.map(() => steps === 0) });
          const [x0, y0, x1, y1] = wallTopLine(camera, size);
          const level = (x: number) => y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
          const hud = officeHudBoxes(width, height, hudLayout(viewportClass(width, height), size.coarse ?? false));
          const what = `${named.length} sessions, ${steps} steps`;
          const kinds = { tick: 0, beside: 0, faded: 0, hidden: 0 };
          expect(row.chips.every((c) => c.box), `${what}: every chip shown`).toBe(true);
          expect(row.two, `${what}: two rows of dots on a portrait phone only`).toBe(id === "phone");
          for (const c of row.chips) {
            if (!c.lead) {
              // Hidden only where the line would cross the HUD or another chip; even then it would stop at the level.
              expect(c.blocked, `${what}: slot ${c.slot}'s leader line`).not.toBeNull();
              expect(c.blocked!.tick || c.blocked!.faded, `${what}: slot ${c.slot}'s hidden line stops at the level`).toBe(true);
              kinds.hidden++;
              continue;
            }
            const lead = c.lead;
            if (lead.faded) {
              expect(lead.tick).toBe(false);
              expect([lead.x1, lead.y1], `${what}: slot ${c.slot} faded to its head`).toEqual([c.head.x, c.head.y]);
              kinds.faded++;
              expect(c.box!.y1 + CHIP_ROW.lead, `${what}: slot ${c.slot} faded: over the level`).toBeGreaterThan(level(c.x));
              expect(id === "landscape phone" || (compact && c.row === 1), `${what}: slot ${c.slot} over the wall`).toBe(true);
              continue;
            }
            // Never down past the wall-top level: a tick on it, above the Rover's head.
            expect(lead.tick, `${what}: slot ${c.slot} ends with a tick`).toBe(true);
            expect(lead.y1, `${what}: slot ${c.slot} on the wall-top level`).toBeCloseTo(level(lead.x1), 6);
            expect(lead.y1 - lead.y0, `${what}: slot ${c.slot} at least ${CHIP_ROW.lead} px long`).toBeGreaterThanOrEqual(CHIP_ROW.lead);
            expect(lead.y1, `${what}: slot ${c.slot} above its Rover's head`).toBeLessThan(c.head.y);
            const tick = { x0: lead.x1 - LEAD.tick / 2, y0: lead.y1 - 1, x1: lead.x1 + LEAD.tick / 2, y1: lead.y1 + 1 };
            for (const b of hud) expect(boxesOverlap(tick, b), `${what}: slot ${c.slot}'s tick clear of the HUD`).toBe(false);
            expect(tick.x0 >= 0 && tick.x1 <= width, `${what}: slot ${c.slot}'s tick on screen`).toBe(true);
            // Where: above its Rover's head, or where the line toward the head meets the level (crossing the wall's top on
            // the wall, or the fallback where the line above the head would cross another chip), or moved clear of the HUD.
            const t = (lead.y1 - lead.y0) / (c.head.y - lead.y0);
            const onLine = Math.abs(lead.x1 - (lead.x0 + t * (c.head.x - lead.x0))) < 1e-6;
            const aboveHead = Math.abs(lead.x1 - c.head.x) < 1e-6;
            const byHud = hud.some((b) => Math.abs(lead.x1 - b.x0) <= LEAD.tick || Math.abs(lead.x1 - b.x1) <= LEAD.tick);
            expect(onLine || aboveHead || byHud, `${what}: slot ${c.slot}'s tick above its Rover or on its line`).toBe(true);
            if (lead.x1 >= Math.min(x0, x1) - 1e-6 && lead.x1 <= Math.max(x0, x1) + 1e-6) kinds.tick++;
            else kinds.beside++;
          }
          // Every line at the stop ends with a tick (a phone's second row of dots fades); on a landscape phone the row sits
          // over the wall.
          if (id !== "landscape phone") expect(kinds.tick + kinds.beside, `${what}: ticks at the wall-top level`).toBeGreaterThanOrEqual(compact ? 4 : 10);
          // None hides, at the stop or the near pose (an off-duty dot nudged past a wide near chip takes the fallback).
          expect(kinds.hidden, `${what}: hidden leader lines`).toBe(0);
          expectRow(row, size, what);
        }
    });

    it("show all ten far (the name, or a dot on a phone, for an off-duty desk and where the names do not fit) in up to two rows over their Rovers", () => {
      for (const named of [ALL, FRONT]) {
        const row = chipRow(stopCamera(width, height), size, { named });
        for (const c of row.chips) {
          // A chip starts far (`officeRuntime.chipFar`) and turns far again whenever it hides, so it stays far past the band's near edge.
          expect(c.far, `slot ${c.slot} far`).toBe(true);
          expect(c.box, `slot ${c.slot} on screen`).not.toBeNull();
        }
        // Dots on a phone, and where ten names do not fit (960 x 640, a portrait tablet, a landscape phone).
        const dots = compact || (named === ALL && ["tablet", "portrait tablet", "landscape phone"].includes(id));
        for (const c of row.chips) if (dots || !named.includes(c.slot)) expect(c.box!.x1 - c.box!.x0, `slot ${c.slot} a dot`).toBeCloseTo(CHIP.compact.w, 6);
        if (!dots) expect(row.max, "a name fits").toBeGreaterThanOrEqual(CHIP_ROW.name);
        expectRow(row, size, `stop, ${named.length} sessions`);
      }
    });

    it("keep their places clear of the HUD and of each other with a day replay's pill leading the row (the chips' bounds start after it; on a phone the pill is the clock alone)", () => {
      const pill = compact ? PILL.phone : PILL.wide;
      for (const named of [ALL, FRONT]) {
        const row = chipRow(stopCamera(width, height), size, { named, pill });
        expect(row.pill, "the pill leads the row").not.toBeNull();
        for (const c of row.chips) expect(c.box, `slot ${c.slot} on screen`).not.toBeNull();
        expectRow(row, size, `stop with the pill, ${named.length} sessions`);
      }
    });

    it("stay far, shown and in order with the rover anywhere in the stop's zone (its corners, 2 u by 1.4 u off the stop)", () => {
      const { half } = OFFICE.view;
      let nearest = Infinity;
      for (const dx of [-half.x, 0, half.x])
        for (const dz of [-half.z, 0, half.z]) {
          const at = { x: W.stop.x + dx, z: W.stop.z + dz };
          expect(zoneAt("L1", at, floor.viewZones)?.id, `zone at ${dx}, ${dz}`).toBe("L1:office");
          const camera = followCamera(width, height, at);
          for (const named of [ALL, FRONT]) {
            const row = chipRow(camera, size, { named });
            for (const c of row.chips) {
              nearest = Math.min(nearest, anchorDistance(camera, c.slot));
              expect(c.far, `slot ${c.slot} far at ${dx}, ${dz}`).toBe(true);
              expect(c.box, `slot ${c.slot} on screen at ${dx}, ${dz}`).not.toBeNull();
            }
            expectRow(row, size, `at ${dx}, ${dz}, ${named.length} sessions`);
          }
        }
      if (!chipRow(stopCamera(width, height), size, { named: FRONT }).oneLine) expect(nearest).toBeGreaterThan(NEAR);
    });

    it(`the near pose (${NEAR_STEPS[cls]} zoom steps) adds the activity where the row leaves a chip \`CHIP_ROW.near\` wide (five sessions on a desktop camera), the row still clear and in order`, () => {
      const steps = NEAR_STEPS[cls];
      const camera = stopCamera(width, height, steps);
      for (const named of [ALL, FRONT]) {
        const row = chipRow(camera, size, { named, was: ALL.map(() => false) });
        // Ten sessions keep one line everywhere; five add the activity on the desktop camera's sizes.
        expect(row.oneLine, `${named.length} sessions: one line`).toBe(named === ALL || !["desktop", "small desktop", "landscape tablet"].includes(id));
        for (const slot of [1, 2, 3, 6, 7, 8]) expect(row.chips[slot].box, `slot ${slot} on screen`).not.toBeNull();
        for (const slot of [1, 2, 3]) expect(row.chips[slot].far, `slot ${slot} shows its activity`).toBe(row.oneLine);
        if (!row.oneLine) {
          for (const slot of ALL) expect(anchorDistance(camera, slot), `slot ${slot} near`).toBeLessThan(NEAR);
          // The first step that does: one less leaves them far.
          const before = stopCamera(width, height, steps - 1);
          expect(ALL.some((slot) => anchorDistance(before, slot) < NEAR)).toBe(false);
        }
        expectRow(row, size, `near, ${named.length} sessions`);
      }
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
      expect(row.chips.filter((c) => c.box)).toHaveLength(10);
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
      let was: boolean[] = ALL.map(() => true);
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

