import { Matrix4, Quaternion, Vector3, type PerspectiveCamera } from "three";
import { floorY, LOBBY } from "@/experience/config";
import { OFFICE, officeRiser, officeSlots, rowSlots, type OfficeSlot } from "@/experience/floors/lobby/officeLayout";
import { PARTS_PER_ROVER, roverFrame, TREADS_PER_ROVER, writeDeskScreen, writeFace, writeFlag, writeRover } from "@/experience/floors/lobby/office/officeRig";
import { OFFICE_ROVER, stillPose } from "@/experience/floors/lobby/office/officeVisual";
import { roverScreenBox } from "@/experience/floors/library/decor/signFrame";
import type { OfficeState } from "@/lib/office/protocol";

/**
 * How much of each back-row Rover's face and desk screen the office stop's camera sees past the front row (design 5.10, a
 * projection test): rays from the camera to a grid of points on each quad (the target Rover in a state's still pose),
 * tested against the front row's boxes (each Rover's chest, head, arms, stalk, antenna tip, treads and raised flag in the
 * same still pose, its desk top, legs and desk screen), the back row's riser blocks and the target's back-row neighbours
 * (their Rovers, desks and desk screens); a point off the screen counts as hidden. Pure geometry over the layout and the rig, so a
 * retuned `OFFICE.view` or `OFFICE.rows` reruns it unchanged (tests/unit/office-rows-visibility.test.ts).
 */

const W = LOBBY.officeWing;
const Y = floorY("L1");
const SLOTS = officeSlots(W);
type Tri = readonly [Vector3, Vector3, Vector3];
type Size = { width: number; height: number };

/** The unit cube's 12 triangles under `m`. */
function cubeTris(m: Matrix4, out: Tri[]): void {
  const c = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => new Vector3(k & 1 ? 0.5 : -0.5, k & 2 ? 0.5 : -0.5, k & 4 ? 0.5 : -0.5).applyMatrix4(m));
  // Each face as two triangles (corner indexes by bit: x 1, y 2, z 4).
  for (const [a, b, d, e] of [
    [0, 1, 3, 2],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 3, 7, 5],
  ])
    out.push([c[a], c[b], c[d]], [c[a], c[d], c[e]]);
}

/** A quad's two triangles from 4 corners (bottom left, bottom right, top right, top left) at `quad` in `positions`. */
function quadCorners(positions: Float32Array, quad = 0): Vector3[] {
  return [0, 1, 2, 3].map((k) => new Vector3().fromArray(positions, (quad * 4 + k) * 3).setY(positions[(quad * 4 + k) * 3 + 1] + Y));
}

const lift = (m: Matrix4) => new Matrix4().makeTranslation(0, Y, 0).multiply(m);

/** One slot's furniture and Rover in `state`'s still pose: the Rover's parts, treads, raised flag and antenna tip, its desk top, legs and desk screen. */
function slotTris(s: OfficeSlot, state: OfficeState, out: Tri[]): void {
  const pose = stillPose(state);
  const frame = new Matrix4();
  const parts = new Float32Array(PARTS_PER_ROVER * 16);
  const treads = new Float32Array(TREADS_PER_ROVER * 16);
  const quad = new Float32Array(12);
  const { desk } = OFFICE;
  roverFrame(s, pose, frame);
  writeRover(frame, pose, parts, 0, treads);
  for (let i = 0; i < PARTS_PER_ROVER + TREADS_PER_ROVER; i++) {
    const m = new Matrix4().fromArray(i < PARTS_PER_ROVER ? parts : treads, (i < PARTS_PER_ROVER ? i : i - PARTS_PER_ROVER) * 16);
    if (Math.abs(m.determinant()) < 1e-9) continue;
    cubeTris(lift(m), out);
  }
  writeFlag(frame, pose, quad, 0);
  const flag = quadCorners(quad);
  out.push([flag[0], flag[1], flag[2]], [flag[0], flag[2], flag[3]]);
  const tip = OFFICE_ROVER.tip;
  cubeTris(lift(new Matrix4().multiplyMatrices(frame, new Matrix4().compose(new Vector3(tip.x, tip.y, tip.z), new Quaternion(), new Vector3(tip.size, tip.size, tip.size)))), out);
  const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), s.yaw);
  const top = new Vector3(s.desk.x, Y + s.lift + desk.top - desk.slab / 2, s.desk.z);
  cubeTris(new Matrix4().compose(top, turn, new Vector3(s.deskW, desk.slab, desk.d)), out);
  for (const side of [-1, 1]) {
    const off = side * (s.deskW / 2 - 0.2);
    const leg = new Vector3(s.desk.x + off * Math.cos(s.yaw), Y + s.lift + (desk.top - desk.slab) / 2, s.desk.z - off * Math.sin(s.yaw));
    cubeTris(new Matrix4().compose(leg, turn, new Vector3(desk.leg, desk.top - desk.slab, desk.d * 0.8)), out);
  }
  writeDeskScreen(s, quad, 0);
  const [a, b, c, d] = quadCorners(quad);
  out.push([a, b, c], [a, c, d]);
}

/** The occluders shared by every back-row target: the front row in `state`'s still pose and the riser blocks. */
export function frontRowTris(state: OfficeState = "working", slots: readonly OfficeSlot[] = SLOTS): Tri[] {
  const out: Tri[] = [];
  for (const s of rowSlots(slots, 0)) slotTris(s, state, out);
  for (const s of rowSlots(slots, 1)) {
    const r = officeRiser(W, OFFICE.rows[s.row], s.theta)!;
    const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), r.yaw);
    cubeTris(new Matrix4().compose(new Vector3(r.center.x, Y + s.lift / 2, r.center.z), turn, new Vector3(r.w, s.lift, r.d)), out);
  }
  return out;
}

const E1 = new Vector3();
const E2 = new Vector3();
const P = new Vector3();
const T = new Vector3();
const Q = new Vector3();

/** Whether the segment from `o` along `dir` (length 1 in units of `dir`) crosses triangle `t` strictly between its ends (Moller and Trumbore). */
function hits(o: Vector3, dir: Vector3, [a, b, c]: Tri): boolean {
  E1.subVectors(b, a);
  E2.subVectors(c, a);
  P.crossVectors(dir, E2);
  const det = E1.dot(P);
  if (Math.abs(det) < 1e-12) return false;
  const inv = 1 / det;
  T.subVectors(o, a);
  const u = T.dot(P) * inv;
  if (u < 0 || u > 1) return false;
  Q.crossVectors(T, E1);
  const v = dir.dot(Q) * inv;
  if (v < 0 || u + v > 1) return false;
  const t = E2.dot(Q) * inv;
  return t > 1e-4 && t < 1 - 1e-4;
}

/** The fraction of quad `corners` (bottom left, bottom right, top right, top left) the camera sees: on the screen and past every triangle. */
export function unoccluded(camera: PerspectiveCamera, size: Size, corners: readonly Vector3[], occluders: readonly Tri[], n = 10): number {
  const [bl, br, , tl] = corners;
  const across = new Vector3().subVectors(br, bl);
  const up = new Vector3().subVectors(tl, bl);
  const point = new Vector3();
  const ndc = new Vector3();
  const dir = new Vector3();
  let seen = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      point.copy(bl).addScaledVector(across, (i + 0.5) / n).addScaledVector(up, (j + 0.5) / n);
      ndc.copy(point).project(camera);
      const x = ((ndc.x + 1) / 2) * size.width;
      const y = ((1 - ndc.y) / 2) * size.height;
      if (ndc.z > 1 || x < 0 || x > size.width || y < 0 || y > size.height) continue;
      dir.subVectors(point, camera.position);
      if (!occluders.some((t) => hits(camera.position, dir, t))) seen += 1;
    }
  return seen / (n * n);
}

export interface RowVisibility {
  slot: number;
  face: number;
  screen: number;
}

/**
 * Each back-row Rover's face and desk screen in `state`'s still pose: the fraction `camera` sees past the front row, the
 * riser blocks and its back-row neighbours (their Rovers, desks and desk screens), every Rover in the same still pose.
 */
export function backRowVisibility(camera: PerspectiveCamera, size: Size, state: OfficeState = "working", slots: readonly OfficeSlot[] = SLOTS): RowVisibility[] {
  const shared = frontRowTris(state, slots);
  const back = rowSlots(slots, 1);
  const own = back.map((s) => {
    const out: Tri[] = [];
    slotTris(s, state, out);
    return out;
  });
  const pose = stillPose(state);
  const frame = new Matrix4();
  const quad = new Float32Array(12);
  return back.map((s, i) => {
    const occluders = [...shared, ...own.filter((_, j) => j !== i).flat()];
    roverFrame(s, pose, frame);
    writeFace(frame, quad, 0);
    const face = unoccluded(camera, size, quadCorners(quad), occluders);
    writeDeskScreen(s, quad, 0);
    const screen = unoccluded(camera, size, quadCorners(quad), occluders);
    return { slot: s.slot, face, screen };
  });
}

/** Whether every Rover (both rows, the antenna included, on its row's floor) stands wholly inside the frame. */
export function everyRoverInFrame(camera: PerspectiveCamera, size: Size, slots: readonly OfficeSlot[] = SLOTS): boolean {
  const v = new Vector3();
  const box = { x0: 0, y0: 0, x1: 0, y1: 0 };
  return slots.every((s) => {
    const b = roverScreenBox(camera, s.rover, Y + s.lift, size, v, box);
    return b !== null && b.x0 >= 0 && b.y0 >= 0 && b.x1 <= size.width && b.y1 <= size.height;
  });
}
