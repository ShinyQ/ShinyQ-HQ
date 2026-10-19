import { describe, expect, it } from "vitest";
import { STATE_TONE } from "@/lib/office/model";
import { OFFICE_STATES } from "@/lib/office/protocol";
import { FACE_H, FACE_W } from "@/experience/rover/faceTexture";
import { DESK_SCREEN, OFFICE_ROVER, OFFICE_STATE_STYLE, pose, poseChanged, poseOffset, slotPhase, stillPose } from "@/experience/floors/lobby/office/officeVisual";

const TIMES = Array.from({ length: 60 }, (_, i) => i * 0.137);

describe("Agent Office state looks (owner design D5)", () => {
  it("gives each of the nine states its own face, screen and tone", () => {
    expect(new Set(OFFICE_STATES.map((s) => OFFICE_STATE_STYLE[s].face)).size).toBe(9);
    expect(new Set(OFFICE_STATES.map((s) => OFFICE_STATE_STYLE[s].screen)).size).toBe(9);
    for (const s of OFFICE_STATES) expect(OFFICE_STATE_STYLE[s].color).toBe(STATE_TONE[s]);
  });

  it("holds the still pose under reduced motion at every time", () => {
    for (const s of OFFICE_STATES) for (const t of TIMES) {
      expect(pose(s, t, slotPhase(2), true)).toEqual(stillPose(s));
      expect(poseOffset(s, pose(s, t, slotPhase(2), true))).toBe(0);
    }
  });

  it("animates the moving states with full motion: typing bob, sway, hop, shake", () => {
    const moves = (s: (typeof OFFICE_STATES)[number]) => Math.max(...TIMES.map((t) => poseOffset(s, pose(s, t, slotPhase(1), false))));
    for (const s of ["working", "thinking", "reviewing", "ci", "input", "done", "asleep"] as const) expect(moves(s), s).toBeGreaterThan(0.005);
    expect(Math.max(...TIMES.map((t) => pose("done", t, 0, false).y))).toBeGreaterThan(0.3);
    expect(Math.max(...TIMES.map((t) => Math.abs(pose("working", t, 0, false).armL)))).toBeGreaterThan(0.2);
    expect(Math.max(...TIMES.map((t) => pose("thinking", t, 0, false).tipScale))).toBeGreaterThan(1.3);
  });

  it("raises an arm for input, both arms when done, leans in for tests and slumps when failed or asleep", () => {
    expect(stillPose("input").armL).toBeLessThan(-1.5);
    expect(stillPose("done").armL).toBeLessThan(-1.5);
    expect(stillPose("done").armR).toBeLessThan(-1.5);
    expect(stillPose("testing").rx).toBeGreaterThan(0);
    expect(stillPose("failed").rx).toBeGreaterThan(stillPose("asleep").rx);
    expect(stillPose("asleep").y).toBeLessThan(0);
  });

  it("keeps the face quad at the rover face's 4:3 and the desk screen at the 256 x 160 cell's ratio", () => {
    expect(OFFICE_ROVER.face.w / OFFICE_ROVER.face.h).toBeCloseTo(FACE_W / FACE_H, 3);
    expect(DESK_SCREEN.w / DESK_SCREEN.h).toBeCloseTo(256 / 160, 3);
    expect(OFFICE_ROVER.face.z).toBeGreaterThanOrEqual(OFFICE_ROVER.head[5] / 2);
  });

  it("reports an unchanged pose so the frame loop can skip instance writes (reduced motion, static states)", () => {
    for (const s of OFFICE_STATES) expect(poseChanged(pose(s, 0.1, slotPhase(0), true), pose(s, 7.3, slotPhase(0), true)), s).toBe(false);
    expect(poseChanged(pose("testing", 0.1, 0, false), pose("testing", 3.2, 0, false))).toBe(false);
    expect(poseChanged(pose("working", 0.1, 0, false), pose("working", 0.2, 0, false))).toBe(true);
    expect(poseChanged(stillPose("working"), { ...stillPose("working"), tipScale: 1.2 })).toBe(true);
    expect(poseChanged(stillPose("working"), { ...stillPose("working"), armR: -0.1 })).toBe(true);
  });
});
