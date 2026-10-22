import type { ScreenBox } from "../../../fx/labelPlacement";
import { OFFICE_SLOTS } from "../officeShell";

/**
 * The chip row's placement (`OfficeWatch` and `OfficeChips`, in the lazy office scene chunk only): the chips' anchors,
 * the row's pinned sizes, the HUD boxes it keeps off, its fit and layout (one row, or two rows of dots), the leader
 * lines' HUD test and the near/far switch. Kept off `officeShell.ts`, which the main 3D path carries, so the first frame
 * pays none of it (tests/unit/office-chunk-graph.test.ts).
 */

/** The top of an office Rover's head over the floor (u; `OFFICE_ROVER.head`, kept here off the scene chunk's module). */
export const OFFICE_ROVER_HEAD_TOP = 1.95;

/**
 * The chips' world anchors, one per slot (both rows): the top of each Rover's head, on its row's floor. Each chip in the
 * row under the top bar centres on its anchor's screen x (nudged by `layoutChipRow`), and its leader line ends there.
 */
export const OFFICE_CHIP_ANCHORS = OFFICE_SLOTS.map((s) => ({ x: s.rover.x, y: s.lift + OFFICE_ROVER_HEAD_TOP, z: s.rover.z }));

/** The chip row's top (px): right under the HUD's top bar (62 px from 768 px wide, 58 px on a narrower phone). */
export const OFFICE_CHIP_TOP = { desktop: 66, mobile: 64 } as const;

/**
 * The pinned chip row (px): `gap` between neighbours, `edge` from the screen edges and the HUD boxes, `max` the widest
 * chip, `dot` a compact dot chip (the state dot in a 32 px pill: phones, off-duty desks, outside the office view), `name`
 * the narrowest chip that keeps the agent's name (narrower, every chip is a dot) and `near` the narrowest that adds the
 * activity near (narrower, the chips keep one line, `chipsOneLine`), `band` the height the HUD boxes are tested against
 * (two rows of dots, `layoutChipRows`; a near chip with its CI bar is 40 px), `lead` the shortest leader line drawn.
 */
export const CHIP_ROW = { gap: 6, edge: 8, max: 176, dot: 32, name: 84, near: 128, band: 70, lead: 8 } as const;

/**
 * The HUD boxes the chip row and the leader lines keep off (px, measured in the browser): the desktop profile card (top
 * left) and floor menu panel (right, 219 by 284 px, centred), the Corners minimap (top right: phones 72 px at top 64,
 * 12 px in; tablets 112 px at top 76, 16 px in) and joystick (bottom left, 160 by 144 px). The top bar is above the row.
 */
export function officeHudBoxes(width: number, height: number, hud: "desktop" | "tablet" | "phone"): ScreenBox[] {
  if (hud === "desktop")
    return [
      { x0: 16, y0: 16, x1: 296, y1: 153 },
      { x0: width - 235, y0: (height - 284) / 2, x1: width - 16, y1: (height + 284) / 2 },
    ];
  const minimap = hud === "phone" ? { x0: width - 84, y0: 64, x1: width - 12, y1: 136 } : { x0: width - 128, y0: 76, x1: width - 16, y1: 188 };
  return [minimap, { x0: 0, y0: height - 144, x1: 160, y1: height }];
}

/**
 * Whether the segment from (x0, y0) to (x1, y1) runs through the inside of box `b` (its edges excluded, px): a leader line
 * is drawn only while it crosses no HUD box (`OfficeWatch`, tests/unit/office-chip-placement.test.ts). Clips the segment's
 * parameter to the box one axis at a time; allocates nothing.
 */
export function segmentHitsBox(x0: number, y0: number, x1: number, y1: number, b: ScreenBox): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (dx === 0) {
    if (x0 <= b.x0 || x0 >= b.x1) return false;
  } else {
    const a = (b.x0 - x0) / dx;
    const c = (b.x1 - x0) / dx;
    t0 = Math.max(t0, Math.min(a, c));
    t1 = Math.min(t1, Math.max(a, c));
  }
  if (dy === 0) {
    if (y0 <= b.y0 || y0 >= b.y1) return false;
  } else {
    const a = (b.y0 - y0) / dy;
    const c = (b.y1 - y0) / dy;
    t0 = Math.max(t0, Math.min(a, c));
    t1 = Math.min(t1, Math.max(a, c));
  }
  return t0 < t1;
}

/** The x span the chip row may use (px). */
export interface ChipRowBounds {
  left: number;
  right: number;
}

/**
 * The row's span on a `width` px screen with its top at `top`: `CHIP_ROW.edge` inside the screen edges, trimmed past every
 * HUD box in the row's band (`top` to `top + CHIP_ROW.band`): a box in the left half moves the left bound past its right
 * edge, one in the right half the right bound before its left edge (the profile card, the minimap). Writes `out`.
 */
export function chipRowBounds(width: number, top: number, boxes: readonly ScreenBox[], out: ChipRowBounds = { left: 0, right: 0 }): ChipRowBounds {
  out.left = CHIP_ROW.edge;
  out.right = width - CHIP_ROW.edge;
  for (const b of boxes) {
    if (b.y0 >= top + CHIP_ROW.band || b.y1 <= top) continue;
    if (b.x0 + b.x1 < width) out.left = Math.max(out.left, b.x1 + CHIP_ROW.edge);
    else out.right = Math.min(out.right, b.x0 - CHIP_ROW.edge);
  }
  return out;
}

/**
 * The widest a chip with a name may be (px, at most `CHIP_ROW.max`) so `named` such chips and `dots` dot chips (the off-duty
 * desks) fit the row side by side: ten desks share one row on a desktop (`OfficeWatch`, tests/unit/office-chip-placement.test.ts).
 */
export function chipMaxWidth(bounds: ChipRowBounds, named: number, dots = 0): number {
  if (named <= 0) return CHIP_ROW.max;
  const free = bounds.right - bounds.left - (named + dots - 1) * CHIP_ROW.gap - dots * CHIP_ROW.dot;
  return Math.max(CHIP_ROW.dot, Math.min(CHIP_ROW.max, Math.floor(free / named)));
}

/**
 * Whether the chips keep one line (the name, or a dot) at any distance (`OfficeWatch`): on a phone (`viewport` "mobile",
 * where they are dots), outside the office view (`compact`), and where the row's fit (`max`, `chipMaxWidth`) leaves a chip
 * narrower than `CHIP_ROW.near`, so the activity never ends in an ellipsis a few letters in (tests/unit/office-chip-placement.test.ts).
 */
export const chipsOneLine = (viewport: string, compact: boolean, max: number): boolean => viewport === "mobile" || compact || max < CHIP_ROW.near;

/** Whether every chip shows as a dot because the row's fit (`max`) leaves no room for the names (`CHIP_ROW.name`). */
export const chipsDotsOnly = (max: number): boolean => max < CHIP_ROW.name;

// Scratch for `layoutChipRow` (grown on demand): the order, the packed offsets and the pool-adjacent-violators blocks.
let order = new Int32Array(8);
let packed = new Float64Array(8);
let blockSum = new Float64Array(8);
let blockLen = new Int32Array(8);

/**
 * Lays out one row of `n` chips (`targets[i]` the screen x chip i wants, its Rover's head; `half[i]` its half width) inside
 * `bounds`, `CHIP_ROW.gap` apart: writes each centre to `out[i]` (allocates nothing past its scratch). The chips keep the
 * order of their targets (the desk order in the office view; ties by index), and where neighbours would overlap they are
 * nudged along x by the least total squared displacement (isotonic regression by pooling adjacent violators: a crowded
 * run centres on its targets' mean), then the row is shifted inside the bounds as a whole. Returns false when the chips
 * cannot fit side by side: then they are packed from the left bound (the caller hides those past the right one).
 */
export function layoutChipRow(targets: ArrayLike<number>, half: ArrayLike<number>, out: number[], n: number, bounds: ChipRowBounds): boolean {
  if (order.length < n) {
    order = new Int32Array(n);
    packed = new Float64Array(n);
    blockSum = new Float64Array(n);
    blockLen = new Int32Array(n);
  }
  for (let i = 0; i < n; i++) {
    let j = i;
    while (j > 0 && targets[order[j - 1]] > targets[i]) {
      order[j] = order[j - 1];
      j--;
    }
    order[j] = i;
  }
  // packed[k]: the centre of the k-th chip with the row packed from 0; u = x - packed must not decrease along the row.
  let blocks = 0;
  for (let k = 0; k < n; k++) {
    const i = order[k];
    packed[k] = k === 0 ? half[i] : packed[k - 1] + half[order[k - 1]] + CHIP_ROW.gap + half[i];
    blockSum[blocks] = targets[i] - packed[k];
    blockLen[blocks] = 1;
    blocks++;
    while (blocks > 1 && blockSum[blocks - 2] / blockLen[blocks - 2] > blockSum[blocks - 1] / blockLen[blocks - 1]) {
      blockSum[blocks - 2] += blockSum[blocks - 1];
      blockLen[blocks - 2] += blockLen[blocks - 1];
      blocks--;
    }
  }
  if (n === 0) return true;
  const lo = bounds.left;
  const hi = bounds.right - packed[n - 1] - half[order[n - 1]];
  const fits = lo <= hi;
  for (let b = 0, k = 0; b < blocks; b++) {
    const u = fits ? Math.min(Math.max(blockSum[b] / blockLen[b], lo), hi) : lo;
    for (let end = k + blockLen[b]; k < end; k++) out[order[k]] = u + packed[k];
  }
  return fits;
}

// Scratch for `layoutChipRows`: the chips' common half width in two rows and the inset bounds.
let zigHalf = new Float64Array(8);
const zigBounds: ChipRowBounds = { left: 0, right: 0 };

/**
 * Lays out up to two rows of chips (phones: ten dots on a 390 px screen, beside the minimap): one row by `layoutChipRow`
 * where it fits, else neighbours in the order of their targets alternate rows (`rows[i]`: 0 the top row, 1 the one under
 * it), `pitch` apart along x (up to a chip's width, so a top chip's leader line passes between the two chips under it),
 * and chips in one row stay at least `CHIP_ROW.gap` apart; the row nudges and shifts as one (`layoutChipRow` with every
 * chip `pitch` wide). Returns false when two rows cannot hold them either (then one row is packed from the left bound,
 * and the caller hides the chips past the right one). Allocates nothing past its scratch.
 */
export function layoutChipRows(targets: ArrayLike<number>, half: ArrayLike<number>, out: number[], rows: number[], n: number, bounds: ChipRowBounds): boolean {
  for (let i = 0; i < n; i++) rows[i] = 0;
  if (layoutChipRow(targets, half, out, n, bounds)) return true;
  if (n < 2) return false;
  let h = 0;
  for (let i = 0; i < n; i++) h = Math.max(h, half[i]);
  const pitch = Math.min(2 * h, (bounds.right - bounds.left - 2 * h) / (n - 1));
  if (2 * pitch < 2 * h + CHIP_ROW.gap) {
    layoutChipRow(targets, half, out, n, bounds);
    return false;
  }
  if (zigHalf.length < n) zigHalf = new Float64Array(n);
  const v = (pitch - CHIP_ROW.gap) / 2;
  for (let i = 0; i < n; i++) zigHalf[i] = v;
  zigBounds.left = bounds.left + h - v;
  zigBounds.right = bounds.right - h + v;
  layoutChipRow(targets, zigHalf, out, n, zigBounds);
  for (let i = 0; i < n; i++) {
    let rank = 0;
    for (let j = 0; j < n; j++) if (out[j] < out[i]) rank++;
    rows[i] = rank % 2;
  }
  return true;
}

/**
 * A chip whose anchor (its Rover's head) is farther than this from the camera shows the agent's name only (the mock's
 * `.tag.far`; near, the activity follows it): at the office stop, with the rover anywhere in the stop's zone, the heads
 * of both rows sit 34.8 u or more from a desktop camera, and one zoom step brings all ten within 30.7 u
 * (tests/unit/office-chip-placement.test.ts). The tablet and portrait cameras' chips keep one line (a row too narrow, dots).
 */
export const OFFICE_CHIP_FAR = 33;

/** Half-width of the near/far band, so a camera hovering at the threshold does not flip the chip every frame. */
export const OFFICE_CHIP_FAR_BAND = 1;

/**
 * The next far flag for a chip at `dist` from the camera: far above 34, near below 32, unchanged between. One line
 * (`phone`, `chipsOneLine`) always far: a phone's rows hold ten dots, and the desk's drawer shows the rest.
 */
export function nextChipFar(far: boolean, dist: number, phone = false): boolean {
  return phone || (far ? dist > OFFICE_CHIP_FAR - OFFICE_CHIP_FAR_BAND : dist > OFFICE_CHIP_FAR + OFFICE_CHIP_FAR_BAND);
}

/** Shows `el` at (x, y) (px), or hides it (NaN); `last` is what was written (the ticks and the replay pill). */
export function placeAt(el: HTMLElement | null, last: number[], x: number, y: number) {
  if (!el || (last[0] === x && last[1] === y) || (Number.isNaN(x) && Number.isNaN(last[0]))) return;
  last[0] = x;
  last[1] = y;
  if (Number.isNaN(x)) el.style.visibility = "hidden";
  else {
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    el.style.visibility = "visible";
  }
}
