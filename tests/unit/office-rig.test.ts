import { describe, expect, it } from "vitest";
import { Color, Matrix4, Vector3 } from "three";
import { OFFICE, officeSlots } from "@/experience/floors/lobby/officeLayout";
import { CHIP_LIFT, chipAnchor, GLOW_PER_ROVER, glowKey, PARTS_PER_ROVER, roverFrame, TREADS_PER_ROVER, writeDeskScreen, writeFace, writeGlow, writeRover } from "@/experience/floors/lobby/office/officeRig";
import { DESK_SCREEN, OFFICE_ROVER, OFFICE_STATE_STYLE, stillPose } from "@/experience/floors/lobby/office/officeVisual";

const slots = officeSlots();
const corner = (a: Float32Array, quad: number, k: number) => new Vector3().fromArray(a, (quad * 4 + k) * 3);

describe("Agent Office Rover rig", () => {
  it("puts the middle Rover's face on its head, facing the plaza (north)", () => {
    const frame = roverFrame(slots[2], stillPose("working"), new Matrix4());
    const positions = new Float32Array(4 * 3);
    writeFace(frame, positions, 0);
    const [bl, br, , tl] = [0, 1, 2, 3].map((k) => corner(positions, 0, k));
    for (let k = 0; k < 4; k++) expect(corner(positions, 0, k).z).toBeCloseTo(slots[2].rover.z - OFFICE_ROVER.face.z, 5);
    expect(Math.abs(bl.x - br.x)).toBeCloseTo(OFFICE_ROVER.face.w, 5);
    expect(tl.y - bl.y).toBeCloseTo(OFFICE_ROVER.face.h, 5);
    const normal = new Vector3().subVectors(br, bl).cross(new Vector3().subVectors(tl, bl)).normalize();
    expect(normal.z).toBeCloseTo(-1, 5);
    expect(bl.y).toBeGreaterThan(OFFICE.desk.top);
  });

  it("writes five light parts and two treads per Rover, and raises the arm for input", () => {
    const parts = new Float32Array(slots.length * PARTS_PER_ROVER * 16);
    const treads = new Float32Array(slots.length * TREADS_PER_ROVER * 16);
    const p = stillPose("input");
    writeRover(roverFrame(slots[0], p, new Matrix4()), p, parts, 0, treads);
    const armL = new Matrix4().fromArray(parts, 2 * 16);
    const at = new Vector3().setFromMatrixPosition(armL);
    expect(at.y).toBeCloseTo(OFFICE_ROVER.shoulder.y + OFFICE_ROVER.arm.d / 2, 1);
    expect(new Vector3().setFromMatrixPosition(new Matrix4().fromArray(treads, 0)).y).toBeCloseTo(OFFICE_ROVER.treads[0][1], 5);
  });

  it("stands each desk screen on its desk, inside the desk's width, facing the plaza", () => {
    const positions = new Float32Array(slots.length * 4 * 3);
    for (const s of slots) writeDeskScreen(s, positions, s.slot);
    for (const s of slots) {
      for (let k = 0; k < 4; k++) {
        const c = corner(positions, s.slot, k);
        expect(c.y).toBeGreaterThanOrEqual(OFFICE.desk.top);
        expect(Math.hypot(c.x - s.desk.x, c.z - s.desk.z)).toBeLessThanOrEqual(OFFICE.desk.w / 2 + 0.05);
      }
      const bl = corner(positions, s.slot, 0);
      const br = corner(positions, s.slot, 1);
      const tl = corner(positions, s.slot, 3);
      const n = new Vector3().subVectors(br, bl).cross(new Vector3().subVectors(tl, bl)).normalize();
      const toCentre = new Vector3(OFFICE.center.x - s.desk.x, 0, OFFICE.center.z - s.desk.z).normalize();
      expect(n.dot(toCentre)).toBeGreaterThan(0.85);
    }
    expect(DESK_SCREEN.y - DESK_SCREEN.h / 2).toBeGreaterThanOrEqual(OFFICE.desk.top);
  });

  it("lights CI progress dots from done of total, hides them in other states and dims a sleeping tip", () => {
    const matrices = new Float32Array(GLOW_PER_ROVER * 16);
    const colors = new Float32Array(GLOW_PER_ROVER * 3);
    const frame = roverFrame(slots[0], stillPose("ci"), new Matrix4());
    writeGlow(slots[0], frame, "ci", { done: 6, total: 12 }, 1, 0, true, OFFICE.stop, matrices, colors);
    // Float32 colors: compare the red channel with a tolerance (unlit dots are the tone at 15%).
    const tone = new Color(OFFICE_STATE_STYLE.ci.color);
    const lit = Array.from({ length: OFFICE_ROVER.progress.count }, (_, i) => Math.abs(colors[(2 + i) * 3] - tone.r) < 1e-5).filter(Boolean).length;
    expect(lit).toBe(OFFICE_ROVER.progress.count / 2);
    writeGlow(slots[0], frame, "working", null, 1, 0, true, OFFICE.stop, matrices, colors);
    const scale = new Vector3().setFromMatrixScale(new Matrix4().fromArray(matrices, 2 * 16));
    expect(scale.x).toBe(0);
    writeGlow(slots[0], frame, "asleep", null, 1, 0, true, OFFICE.stop, matrices, colors);
    expect(Math.abs(colors[0] - new Color("#3b3f5c").r)).toBeLessThan(1e-5);
  });

  it("clamps the lit CI dots to the ring when progress is out of range", () => {
    const matrices = new Float32Array(GLOW_PER_ROVER * 16);
    const colors = new Float32Array(GLOW_PER_ROVER * 3);
    const frame = roverFrame(slots[0], stillPose("ci"), new Matrix4());
    const tone = new Color(OFFICE_STATE_STYLE.ci.color);
    const litCount = () => Array.from({ length: OFFICE_ROVER.progress.count }, (_, i) => Math.abs(colors[(2 + i) * 3] - tone.r) < 1e-5).filter(Boolean).length;
    writeGlow(slots[0], frame, "ci", { done: 30, total: 12 }, 1, 0, true, OFFICE.stop, matrices, colors);
    expect(litCount()).toBe(OFFICE_ROVER.progress.count);
    writeGlow(slots[0], frame, "ci", { done: -3, total: 12 }, 1, 0, true, OFFICE.stop, matrices, colors);
    expect(litCount()).toBe(0);
  });

  it("keys glow writes on state, progress and the moving dot run, so an unchanged pose never freezes them", () => {
    expect(glowKey("working", null, true, 1)).not.toBe(glowKey("ci", null, true, 1));
    expect(glowKey("testing", null, false, 0)).not.toBe(glowKey("testing", null, false, 0.2));
    expect(glowKey("testing", null, true, 0)).toBe(glowKey("testing", null, true, 5.3));
    expect(glowKey("ci", { done: 3, total: 12 }, true, 0)).not.toBe(glowKey("ci", { done: 6, total: 12 }, true, 0));
    expect(glowKey("ci", { done: 3, total: 12 }, false, 0)).toBe(glowKey("ci", { done: 3, total: 12 }, false, 4.4));
    expect(glowKey("asleep", null, true, 0.1)).toBe(glowKey("asleep", null, true, 9.7));
    expect(glowKey("asleep", null, false, 0.1)).toBe(glowKey("asleep", null, false, 9.7));
  });

  it("anchors the chip above the head", () => {
    const out = { x: 0, y: 0, z: 0 };
    chipAnchor(roverFrame(slots[3], stillPose("working"), new Matrix4()), out);
    expect(out).toEqual({ x: expect.closeTo(slots[3].rover.x, 5), y: expect.closeTo(CHIP_LIFT, 5), z: expect.closeTo(slots[3].rover.z, 5) });
  });
});
