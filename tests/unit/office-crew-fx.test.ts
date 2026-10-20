import { Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { CREW_GLOW, crewGlowKey, TOWER, towerKey, towerLanes, writeCrewGlow, writeTower } from "@/experience/floors/lobby/office/crewFx";
import { crewFx, newActor, stepCrew } from "@/experience/floors/lobby/office/crew";
import { GLOW_PER_ROVER, roverFrame } from "@/experience/floors/lobby/office/officeRig";
import { stillPose } from "@/experience/floors/lobby/office/officeVisual";
import { OFFICE_SLOTS } from "@/experience/floors/lobby/officeShell";
import { OFFICE, officeTowerColumn } from "@/experience/floors/lobby/officeLayout";
import { LOBBY } from "@/experience/config";
import { officeView } from "@/experience/floors/lobby/office/officeModel";
import { OFFICE_FIXTURES } from "@/lib/office/fixtures";
import type { OfficeSnapshotV1 } from "@/lib/office/protocol";

const LOOK = { camera: 0, tower: 0 };
const scaleAt = (m: Float32Array, i: number) => new Matrix4().fromArray(m, i * 16).getMaxScaleOnAxis();
const posAt = (m: Float32Array, i: number) => new Vector3().setFromMatrixPosition(new Matrix4().fromArray(m, i * 16));

describe("crew glow", () => {
  it("shows sparks only while working and hides the rest", () => {
    const m = new Float32Array(5 * GLOW_PER_ROVER * 16);
    const c = new Float32Array(5 * GLOW_PER_ROVER * 3);
    const a = newActor("working");
    stepCrew(a, "working", 0.1, 0, false, LOOK);
    const f = roverFrame(OFFICE_SLOTS[1], stillPose("working"), new Matrix4());
    writeCrewGlow(OFFICE_SLOTS[1], f, "working", crewFx(a, false), 0.1, 0, false, m, c);
    const base = 1 * GLOW_PER_ROVER + 18;
    const sparks = Array.from({ length: 5 }, (_, i) => scaleAt(m, base + CREW_GLOW.sparks + i));
    expect(sparks.some((s) => s > 0)).toBe(true);
    for (let i = CREW_GLOW.trail; i < CREW_GLOW.charge; i++) expect(scaleAt(m, base + i)).toBe(0);
    expect(scaleAt(m, base + CREW_GLOW.desk)).toBeGreaterThan(0);
  });
  it("keys stay still under reduced motion and while asleep step only with the charge level", () => {
    const fx = crewFx(newActor("working"), true);
    expect(crewGlowKey("working", fx, 1, true)).toBe(crewGlowKey("working", fx, 9, true));
    const a = newActor("asleep");
    const keys = new Set<string>();
    for (let i = 0; i < 300; i++) keys.add(crewGlowKey("asleep", crewFx((stepCrew(a, "asleep", 1 / 60, 0, false, LOOK), a), false), i / 60, false));
    expect(keys.size).toBeLessThanOrEqual(12);
  });
});

describe("crew glow layout", () => {
  it("packs 34 glow instances per Rover and the tower after the five Rovers", () => {
    expect(GLOW_PER_ROVER).toBe(34);
    expect(TOWER.start).toBe(5 * GLOW_PER_ROVER);
  });
  it("writes crewFx into the given object", () => {
    const out = crewFx(newActor("thinking"), false);
    expect(crewFx(newActor("asleep"), false, out)).toBe(out);
    expect(out).toMatchObject({ trail: 0, deskLight: 0.1 });
  });
  it("keeps the desk light on the desk and the charge pad on the floor while the Rover slumps, docks or turns", () => {
    const m = new Float32Array(5 * GLOW_PER_ROVER * 16);
    const c = new Float32Array(5 * GLOW_PER_ROVER * 3);
    const slot = OFFICE_SLOTS[2];
    const base = 2 * GLOW_PER_ROVER + 18;
    const a = newActor("working");
    const still = roverFrame(slot, stillPose("working"), new Matrix4());
    writeCrewGlow(slot, still, "working", crewFx(a, false), 0, 0, false, m, c);
    const desk = posAt(m, base + CREW_GLOW.desk);
    expect(desk.y).toBeCloseTo(OFFICE.desk.top + 0.01);
    expect(Math.hypot(desk.x - slot.desk.x, desk.z - slot.desk.z)).toBeCloseTo(OFFICE.desk.d / 2 - 0.05);
    const asleep = newActor("asleep");
    const p = stepCrew(asleep, "asleep", 0.1, 0, false, { camera: 1, tower: 0 });
    writeCrewGlow(slot, roverFrame(slot, p, new Matrix4()), "asleep", crewFx(asleep, false), 0.1, 0, false, m, c);
    expect(posAt(m, base + CREW_GLOW.desk).distanceTo(desk)).toBeLessThan(1e-6);
    expect(posAt(m, base + CREW_GLOW.charge).y).toBeCloseTo(0.05);
    expect(scaleAt(m, base + CREW_GLOW.charge)).toBeGreaterThan(0);
  });
});

describe("tower lanes (v1: anonymous progress)", () => {
  it("puts the dots on the column's stop-facing side, inside its height", () => {
    const m = new Float32Array((TOWER.start + TOWER.lanes * TOWER.dots) * 16);
    const c = new Float32Array((TOWER.start + TOWER.lanes * TOWER.dots) * 3);
    writeTower({ total: 12, done: 7, running: true }, 0, false, m, c);
    const col = officeTowerColumn(LOBBY.officeWing);
    const stop = LOBBY.officeWing.stop;
    const toStop = new Vector3(stop.x - col.x, 0, stop.z - col.z).normalize();
    for (const i of [TOWER.start, TOWER.start + TOWER.lanes * TOWER.dots - 1]) {
      const p = posAt(m, i);
      expect(new Vector3(p.x - col.x, 0, p.z - col.z).dot(toStop)).toBeCloseTo(OFFICE.tower.column / 2 + 0.02);
      expect(p.y).toBeGreaterThan(OFFICE.tower.plinth);
      expect(p.y).toBeLessThan(OFFICE.tower.plinth + OFFICE.tower.h);
    }
    const green = (lane: number) => c[(TOWER.start + lane * TOWER.dots) * 3 + 1];
    expect(green(6)).toBeGreaterThan(green(8));
  });

  it("reads the newest running run's progress", () => {
    const view = officeView({ status: "ready", snapshot: OFFICE_FIXTURES.busy as OfficeSnapshotV1 });
    const lanes = towerLanes(view);
    expect(lanes.total).toBeLessThanOrEqual(TOWER.lanes);
    expect(lanes.done).toBeLessThanOrEqual(lanes.total);
    expect(lanes).toEqual({ total: 12, done: 7, running: true });
  });
  it("is dark and keyed still without a run", () => {
    const view = officeView({ status: "ready", snapshot: OFFICE_FIXTURES.quiet as OfficeSnapshotV1 });
    const lanes = towerLanes(view);
    expect(lanes).toEqual({ total: 0, done: 0, running: false });
    const m = new Float32Array((TOWER.start + TOWER.lanes * TOWER.dots) * 16);
    const c = new Float32Array((TOWER.start + TOWER.lanes * TOWER.dots) * 3);
    writeTower(lanes, 3, false, m, c);
    expect(towerKey(lanes, 3, true)).toBe(towerKey(lanes, 8, true));
  });
});
