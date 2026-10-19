import type { Camera, Vector3 } from "three";
import { ROVER_HEIGHT } from "../../../config";
import { placeLabels, type LabelCandidate, type ScreenBox } from "../../../fx/labelPlacement";
import { projectPlate } from "../../../fx/plateProjection";
import { orbitXZ, signPlate, type SignSpec } from "../../../fx/signLayout";
import type { Vec2 } from "../../../types";
import { placeLibraryLabels, type LibraryLabel } from "../signPlacement";
import type { EndSignMeta } from "./EndPlaza";
import type { LibrarySignMeta } from "./signs";

/**
 * One frame of the L4 sign placement, pure (three.js math only): the timeline signs (`libraryLabelFrame`) and the
 * end plaza signs (`endPlazaFrame`) are projected to the screen and placed so none covers another. The scene hooks
 * (`useLibrarySignPlacement`, `useEndSignPlacement`) call these every frame; `tests/unit/library-label-sweep.test.ts`
 * calls them for the poses of the rendered sweep, without a renderer.
 */

export type ScreenSize = { width: number; height: number };
export type ScreenQuad = [number, number][];
type Point3 = { x: number; y: number; z: number };

/** Timeline signs: hide under this horizontal camera distance (u, it would fill the screen), plate margin, the rover's half footprint (u). */
export const LIBRARY_SIGN = { near: 6, boxPad: 1.04, roverHalf: 0.9 } as const;

/** Half width and height of each timeline plate, with the margin. */
export function libraryPlateHalves(signs: readonly SignSpec[]): { w: number; h: number }[] {
  return signs.map((s) => {
    const p = signPlate(s);
    return { w: (p.w / 2) * LIBRARY_SIGN.boxPad, h: (p.h / 2) * LIBRARY_SIGN.boxPad };
  });
}

/**
 * Screen box of the rover's bounds (x/z within `LIBRARY_SIGN.roverHalf` of the rover, y from the floor to
 * `ROVER_HEIGHT`) in CSS pixels, written into `out`; null when a corner lies behind the camera.
 */
export function roverScreenBox(camera: Camera, rover: Vec2, floorY: number, size: ScreenSize, v: Vector3, out: ScreenBox): ScreenBox | null {
  const r = LIBRARY_SIGN.roverHalf;
  out.x0 = Infinity;
  out.y0 = Infinity;
  out.x1 = -Infinity;
  out.y1 = -Infinity;
  for (let c = 0; c < 8; c++) {
    v.set(rover.x + (c & 1 ? r : -r), floorY + (c & 2 ? ROVER_HEIGHT : 0), rover.z + (c & 4 ? r : -r)).project(camera);
    if (v.z < -1 || v.z > 1) return null;
    const x = ((v.x + 1) / 2) * size.width;
    const y = ((1 - v.y) / 2) * size.height;
    out.x0 = Math.min(out.x0, x);
    out.x1 = Math.max(out.x1, x);
    out.y0 = Math.min(out.y0, y);
    out.y1 = Math.max(out.y1, y);
  }
  return out;
}

/** Per-frame scratch of the timeline placement (candidates, quads, the plate center), rebuilt when the sign list changes. */
export interface LibraryFrame {
  meta: readonly LibrarySignMeta[] | null;
  labels: LibraryLabel[];
  quads: (ScreenQuad | null)[];
  at: Point3;
  rover: ScreenBox;
  fixed: ScreenBox[];
}

export function createLibraryFrame(): LibraryFrame {
  return { meta: null, labels: [], quads: [], at: { x: 0, y: 0, z: 0 }, rover: { x0: 0, y0: 0, x1: 0, y1: 0 }, fixed: [] };
}

/**
 * Places the timeline signs for one frame: projects each plate (`origin` is the signs' group in world space, the
 * floor's height included), adds the end plaza's shown boxes and the rover's screen box as occupied space and runs
 * `placeLibraryLabels`. Fills `work.labels` and `work.quads`; returns the shown flags and the rover box (null when
 * behind the camera).
 */
export function libraryLabelFrame(
  work: LibraryFrame,
  input: {
    camera: Camera;
    signs: readonly SignSpec[];
    meta: readonly LibrarySignMeta[];
    half: readonly { w: number; h: number }[];
    origin: Point3;
    rover: Vec2;
    /** Rooms of the picked topic: their titles place first. */
    rooms: readonly string[] | undefined;
    size: ScreenSize;
    /** The end plaza's shown boxes this frame. */
    endBoxes: readonly ScreenBox[];
    v: Vector3;
  },
): { shown: boolean[]; rover: ScreenBox | null } {
  const { camera, signs, meta, half, origin, rover: at0, rooms, size, endBoxes, v } = input;
  if (work.meta !== meta) {
    work.meta = meta;
    work.labels = meta.map((m) => ({ kind: m.kind, box: null, distance: 0, picked: false }));
    work.quads = meta.map(() => null);
  }
  const { labels, quads, at } = work;
  for (let i = 0; i < signs.length; i++) {
    const s = signs[i];
    const m = meta[i];
    const label = labels[i];
    at.x = origin.x + s.x;
    at.y = origin.y + s.y;
    at.z = origin.z + s.z;
    label.distance = Math.hypot(at0.x - at.x, at0.z - at.z);
    label.picked = m.kind === "title" && Boolean(m.room && rooms?.includes(m.room));
    label.box = null;
    quads[i] = null;
    if (Math.hypot(camera.position.x - at.x, camera.position.z - at.z) < LIBRARY_SIGN.near) continue;
    const projected = projectPlate(camera, at, half[i], size, v);
    if (!projected || !projected.onScreen) continue;
    label.box = projected.box;
    quads[i] = projected.quad;
  }
  const fixed = work.fixed;
  fixed.length = 0;
  for (const b of endBoxes) fixed.push(b);
  const rover = roverScreenBox(camera, at0, origin.y, size, v, work.rover);
  if (rover) fixed.push(rover);
  return { shown: placeLibraryLabels(labels, { narrow: size.width < 600, fixed }), rover };
}

/** Free topic labels shown at once: desktop, phone. */
export const END_LABEL_MAX = { wide: 8, narrow: 5 } as const;
/** Horizontal camera distance (u) under which an end plaza sign hides: it would fill the screen. */
export const END_SIGN_NEAR: Record<EndSignMeta["kind"], number> = { topic: 8, count: 11, monument: 0, archive: 0, guide: 0, vault: 0 };

/**
 * Priority of the Study Vault's signs (spines, then the "Study Vault" sign): above every topic label while the rover is
 * in the vault plaza, below them on the vault's road and the ring road near its entry. Farther away (the constellation's
 * view) they never show, so that view keeps exactly its labels. Topic priorities are between 0 and about 1000 (hovered).
 */
export const VAULT_PRIORITY = { inside: { guide: 20_000, vault: 10_000 }, near: { guide: -1_000, vault: -2_000 } } as const;

/** Where the Study Vault's signs may show this frame, by the rover's place (`vaultZone`). */
export type VaultZone = "inside" | "near" | "far";

/**
 * The rover's place relative to the Study Vault (floor-local): `inside` its plaza, `near` (on its road, or within 2 u
 * past the road's start on the ring) or `far`.
 */
export function vaultZone(rover: Vec2 | null | undefined, vault: { center: Vec2; radius: number; entry: Vec2 } | null | undefined): VaultZone {
  if (!rover || !vault) return "far";
  const d = Math.hypot(rover.x - vault.center.x, rover.z - vault.center.z);
  if (d <= vault.radius) return "inside";
  return d <= Math.hypot(vault.entry.x - vault.center.x, vault.entry.z - vault.center.z) + 2 ? "near" : "far";
}

/**
 * Places the end plaza signs for one frame: the count headline, the monument plates, the archive name and the
 * picked topic always show; the other topic labels and the Study Vault's signs show by priority (the vault's first
 * while the rover is in the vault plaza, after the topics near it, never far from it: `VAULT_PRIORITY`; topics by
 * hovered, then bigger topics, then nearer ones) up to `END_LABEL_MAX`, only where they cover nothing. `obstacles` (floor-local around `origin`) take their
 * screen box first, so no label covers them. Returns the candidates, the plate quads, the shown flags and the shown
 * sign boxes (for the timeline placement).
 */
export function endPlazaFrame(input: {
  camera: Camera;
  signs: readonly SignSpec[];
  /** `signPlate` of each sign. */
  sizes: readonly { w: number; h: number }[];
  meta: readonly EndSignMeta[];
  /** The plaza center in world space, the floor's height included. */
  origin: Point3;
  /** Orbit angle of the topic labels (rad). */
  angle: number;
  hovered: string | null;
  obstacles: readonly { x: number; z: number; r: number; h: number }[];
  size: ScreenSize;
  v: Vector3;
  /** The rover's place relative to the Study Vault (`vaultZone`; default far): its signs outrank the topic labels inside, follow them near, never show far. */
  vault?: VaultZone;
}): { candidates: LabelCandidate[]; quads: ScreenQuad[]; shown: boolean[]; boxes: ScreenBox[] } {
  const { camera, signs, sizes, meta, origin, angle, hovered, obstacles, size, v } = input;
  const zone = input.vault ?? "far";
  const { width, height } = size;
  const pad = LIBRARY_SIGN.boxPad;
  const quads: ScreenQuad[] = [];
  const candidates: LabelCandidate[] = signs.map((s, i) => {
    const m = meta[i];
    const local = s.orbit ? orbitXZ(s.x, s.z, angle) : { x: s.x, z: s.z };
    const wx = origin.x + local.x;
    const wz = origin.z + local.z;
    const d = Math.hypot(camera.position.x - wx, camera.position.z - wz);
    const vaultSign = m.kind === "guide" || m.kind === "vault";
    const fixed = !(vaultSign || m.kind === "topic") || Boolean(m.picked);
    if (d < END_SIGN_NEAR[m.kind] || (vaultSign && zone === "far")) return { box: null, priority: 0, fixed };
    const projected = projectPlate(camera, { x: wx, y: origin.y + s.y, z: wz }, { w: (sizes[i].w / 2) * pad, h: (sizes[i].h / 2) * pad }, size, v);
    if (!projected) return { box: null, priority: 0, fixed };
    quads[i] = projected.quad;
    if (!projected.onScreen) return { box: null, priority: 0, fixed };
    const box = projected.box;
    // A vault sign got here only inside or near the vault.
    const priority = vaultSign ? VAULT_PRIORITY[zone as "near"][m.kind as "vault"] + 50 / (1 + d) : m.kind !== "topic" ? 0 : (hovered === m.slug ? 1000 : 0) + (m.count ?? 0) * 10 + 50 / (1 + d);
    return { box, priority, fixed };
  });
  // Obstacles take their screen box first (fixed, never drawn), so no label sits over them.
  for (const o of obstacles) {
    const box: ScreenBox = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    let seen = true;
    for (const dx of [-o.r, o.r])
      for (const dz of [-o.r, o.r])
        for (const y of [0, o.h]) {
          v.set(origin.x + o.x + dx, origin.y + y, origin.z + o.z + dz).project(camera);
          if (v.z < -1 || v.z > 1) seen = false;
          const x = ((v.x + 1) / 2) * width;
          const sy = ((1 - v.y) / 2) * height;
          box.x0 = Math.min(box.x0, x);
          box.x1 = Math.max(box.x1, x);
          box.y0 = Math.min(box.y0, sy);
          box.y1 = Math.max(box.y1, sy);
        }
    candidates.push({ box: seen ? box : null, priority: 0, fixed: true });
  }
  const shown = placeLabels(candidates, width < 600 ? END_LABEL_MAX.narrow : END_LABEL_MAX.wide);
  const boxes: ScreenBox[] = [];
  for (let i = 0; i < signs.length; i++) {
    const box = candidates[i].box;
    if (shown[i] && box) boxes.push(box);
  }
  return { candidates, quads, shown, boxes };
}
