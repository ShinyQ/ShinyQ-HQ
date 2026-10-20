import { describe, expect, it } from "vitest";
import { OFFICE_STATES, type OfficeState } from "@/lib/office/protocol";
import { LOBBY } from "@/experience/config";
import { officeObstacles, officeSlots } from "@/experience/floors/lobby/officeLayout";
import { CREW, crewFx, crewTarget, lookYaw, newActor, stepCrew, sparkAt, type CrewLook } from "@/experience/floors/lobby/office/crew";
import { stillPose } from "@/experience/floors/lobby/office/officeVisual";

const LOOK: CrewLook = { camera: 0.4, tower: -0.7 };
const run = (from: OfficeState, to: OfficeState, seconds: number, reduced = false, dt = 1 / 60) => {
  const a = newActor(from);
  for (let t = 0; t < 2; t += dt) stepCrew(a, from, dt, 0.4, reduced, LOOK);
  const out = [] as number[];
  for (let t = 0; t < seconds; t += dt) out.push(stepCrew(a, to, dt, 0.4, reduced, LOOK).yaw);
  return { a, yaws: out };
};

describe("crew targets", () => {
  it("turns to the tower on ci, to the camera on input, rests otherwise", () => {
    expect(crewTarget("ci", 5, 0, true, LOOK, 0).yaw).toBe(LOOK.tower);
    expect(crewTarget("input", 5, 0, true, LOOK, 0)).toMatchObject({ yaw: LOOK.camera, flag: 1 });
    for (const s of ["working", "thinking", "reviewing", "testing", "asleep", "failed"] as const) expect(crewTarget(s, 5, 0, true, LOOK, 0).yaw).toBe(0);
  });
  it("docks back and down when asleep, paces only in full motion", () => {
    expect(crewTarget("asleep", 1, 0, false, LOOK, 0)).toMatchObject({ z: -CREW.dock.back });
    expect(crewTarget("ci", 1.3, 0, true, LOOK, 0).x).toBe(0);
    const xs = Array.from({ length: 50 }, (_, i) => crewTarget("ci", i * 0.1, 0, false, LOOK, 0).x);
    expect(Math.max(...xs)).toBeCloseTo(CREW.pace.amp, 1);
  });
  it("spins one full turn and ends facing the camera (owner)", () => {
    expect(crewTarget("done", 0, 0, false, LOOK, 0.5).yaw).toBeCloseTo(LOOK.camera + Math.PI, 5);
    expect(crewTarget("done", 0, 0, false, LOOK, 1).yaw).toBe(LOOK.camera);
    expect(crewTarget("done", 0, 0, true, LOOK, 0).yaw).toBe(LOOK.camera);
  });
});

describe("blending", () => {
  it("never turns faster than the turn rate and settles", () => {
    const { a, yaws } = run("ci", "input", 1.5);
    const steps = yaws.slice(1).map((y, i) => Math.abs(y - yaws[i]) * 60);
    expect(Math.max(...steps)).toBeLessThanOrEqual(CREW.turnRate * 1.6);
    expect(a.pose.yaw).toBeCloseTo(LOOK.camera, 5);
  });
  it("retargets mid-blend from the blended pose (no jump)", () => {
    const a = newActor("working");
    for (let i = 0; i < 10; i++) stepCrew(a, "ci", 1 / 60, 0, false, LOOK);
    const before = a.pose.yaw;
    const after = stepCrew(a, "input", 1 / 60, 0, false, LOOK).yaw;
    expect(Math.abs(after - before)).toBeLessThan(0.1);
  });
  it("cuts under reduced motion and holds still", () => {
    const a = newActor("working");
    const p1 = { ...stepCrew(a, "input", 1 / 60, 0, true, LOOK) };
    const p2 = { ...stepCrew(a, "input", 1, 0, true, LOOK) };
    expect(p1).toEqual(p2);
    expect(p1.yaw).toBe(LOOK.camera);
  });
  it("is deterministic", () => {
    expect(run("asleep", "done", 2).yaws).toEqual(run("asleep", "done", 2).yaws);
  });
});

describe("fx", () => {
  it("lights the right effects per state", () => {
    const fx = (s: OfficeState, reduced = false) => {
      const a = newActor(s);
      for (let i = 0; i < 120; i++) stepCrew(a, s, 1 / 60, 0, reduced, LOOK);
      return crewFx(a, reduced);
    };
    expect(fx("working").sparks).toBeGreaterThan(0);
    expect(fx("thinking").trail).toBe(1);
    expect(fx("working").trail).toBe(0);
    expect(fx("asleep").deskLight).toBeCloseTo(0.1);
    expect(fx("working").deskLight).toBe(1);
    expect(fx("failed", true).flicker).toBe(1);
  });
  it("sparks stay over the desk between the hands", () => {
    const o = { x: 0, y: 0, z: 0, a: 0 };
    for (let t = 0; t < 3; t += 0.05) for (let i = 0; i < 5; i++) {
      sparkAt(i, t, 0.4, false, o);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(0.45);
      expect(o.y).toBeGreaterThanOrEqual(1.1);
      expect(o.y).toBeLessThanOrEqual(1.6);
    }
  });
  it("never flashes more than 3 times a second when failed", () => {
    const a = newActor("failed");
    let flips = 0;
    let prev = crewFx(a, false).flicker;
    for (let i = 0; i < 600; i++) {
      stepCrew(a, "failed", 1 / 60, 0, false, LOOK);
      const f = crewFx(a, false).flicker;
      if (f !== prev && f > prev) flips++;
      prev = f;
    }
    expect(flips / 10).toBeLessThanOrEqual(3);
  });
});

describe("look and room", () => {
  const slots = officeSlots(LOBBY.officeWing);
  it("clamps the camera turn to 70 degrees", () => {
    const behind = { x: slots[0].rover.x - Math.sin(slots[0].yaw) * 10, z: slots[0].rover.z - Math.cos(slots[0].yaw) * 10 };
    expect(Math.abs(lookYaw(slots[0], behind, CREW.cameraClamp))).toBeCloseTo(CREW.cameraClamp, 5);
  });
  it("pace and dock keep every Rover inside its row box", () => {
    const boxes = officeObstacles(LOBBY.officeWing);
    for (const s of slots) {
      const across = { x: Math.cos(s.yaw), z: -Math.sin(s.yaw) };
      const fwd = { x: Math.sin(s.yaw), z: Math.cos(s.yaw) };
      for (const [dx, dz] of [[CREW.pace.amp, 0], [-CREW.pace.amp, 0], [0, -CREW.dock.back]]) {
        const p = { x: s.rover.x + across.x * dx + fwd.x * dz, z: s.rover.z + across.z * dx + fwd.z * dz };
        const inside = boxes.some((b) => p.x - 1 >= b.minX - 1e-6 && p.x + 1 <= b.maxX + 1e-6 && p.z - 1 >= b.minZ - 1e-6 && p.z + 1 <= b.maxZ + 1e-6);
        expect(inside, `slot ${s.slot} at ${dx},${dz}`).toBe(true);
      }
    }
  });
  it("every state has a still pose", () => {
    for (const s of OFFICE_STATES) expect(stillPose(s)).toBeDefined();
  });
});
