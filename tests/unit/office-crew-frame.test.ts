import { describe, expect, it } from "vitest";
import { LOBBY } from "@/experience/config";
import { towerKey, towerLanes } from "@/experience/floors/lobby/office/crewFx";
import { crewOffset, officeCrew, restCrewKey, restCrewPose, stepOfficeCrew } from "@/experience/floors/lobby/office/crewFrame";
import { RoverWrites } from "@/experience/floors/lobby/office/officeFrame";
import { officeView, type OfficeView } from "@/experience/floors/lobby/office/officeModel";
import { slotPhase } from "@/experience/floors/lobby/office/officeVisual";
import { officeTowerColumn } from "@/experience/floors/lobby/officeLayout";
import { OFFICE_SLOTS } from "@/experience/floors/lobby/officeShell";
import { OFFICE_FIXTURES } from "@/lib/office/fixtures";
import type { OfficeSnapshotV1 } from "@/lib/office/protocol";

const DT = 1 / 60;
const CAM = { x: LOBBY.officeWing.stop.x + 3, z: LOBBY.officeWing.stop.z + 14 };

function setup() {
  const writes = new RoverWrites(OFFICE_SLOTS.length, restCrewPose(), restCrewKey(), LOBBY.officeWing.stop);
  const crew = officeCrew(OFFICE_SLOTS, LOBBY.officeWing.stop, officeTowerColumn(LOBBY.officeWing));
  return { writes, crew };
}

/** Runs `frames` frames like OfficeRovers: what each frame would write (any Rover marked, or the tower key changed). */
function run(view: OfficeView, reduced: boolean, frames: number, cam = CAM, start = 0) {
  const { writes, crew } = setup();
  const lanes = towerLanes(view);
  let lanesKey = "";
  const due: boolean[] = [];
  const bobs: number[] = [];
  for (let f = 0; f < frames; f++) {
    const now = start + f * DT;
    bobs.push(stepOfficeCrew(crew, writes, OFFICE_SLOTS, view.rovers, DT, now, reduced, cam));
    const tk = towerKey(lanes, now, reduced);
    due.push(writes.pending() || tk !== lanesKey);
    // The flush (whenDrawn on a drawn office) clears every mark and records the tower key.
    for (const s of OFFICE_SLOTS) writes.done(s.slot);
    lanesKey = tk;
  }
  return { due, bobs, crew };
}

const asleep = officeView({ status: "idle", snapshot: null });

describe("office crew frame (the keyed write decision)", () => {
  it("starts docked: the rest pose is the asleep crew pose, so a sleeping office never rewrites its Rovers' matrices", () => {
    const { writes, crew } = setup();
    stepOfficeCrew(crew, writes, OFFICE_SLOTS, asleep.rovers, DT, 0, true, LOBBY.officeWing.stop);
    expect(writes.posePending).toEqual([false, false, false, false, false]);
    expect(writes.glowPending).toEqual([false, false, false, false, false]);
    expect(restCrewPose().z).toBeLessThan(0);
  });

  it("writes nothing per frame for a fully asleep office under reduced motion with a still camera", () => {
    const { due, bobs } = run(asleep, true, 600);
    // The first frame turns the tips to the camera (and draws the tower's key once); after that nothing.
    expect(due[0]).toBe(true);
    expect(due.slice(1).some(Boolean)).toBe(false);
    expect(Math.max(...bobs)).toBe(0);
  });

  it("stays still under reduced motion with GitHub-only data (asleep desks) and a running run", () => {
    const busy = OFFICE_FIXTURES.busy as OfficeSnapshotV1;
    const semi = officeView({ status: "ready", snapshot: { ...busy, mode: "off" } });
    expect(semi.rovers.every((r) => r.state === "asleep")).toBe(true);
    expect(towerLanes(semi).running).toBe(true);
    const { due } = run(semi, true, 300);
    expect(due.slice(1).some(Boolean)).toBe(false);
  });

  it("rewrites every glow once when the camera moves, then rests again", () => {
    const { writes, crew } = setup();
    for (let f = 0; f < 3; f++) {
      stepOfficeCrew(crew, writes, OFFICE_SLOTS, asleep.rovers, DT, f * DT, true, CAM);
      for (const s of OFFICE_SLOTS) writes.done(s.slot);
    }
    stepOfficeCrew(crew, writes, OFFICE_SLOTS, asleep.rovers, DT, 0.1, true, { x: CAM.x + 1, z: CAM.z });
    expect(writes.glowPending.every(Boolean)).toBe(true);
    expect(writes.posePending.some(Boolean)).toBe(false);
  });

  it("animates a busy office in full motion (bob above 0) and holds it still under reduced motion (bob 0)", () => {
    const busy = officeView({ status: "ready", snapshot: OFFICE_FIXTURES.busy as OfficeSnapshotV1 });
    const full = run(busy, false, 120);
    expect(full.due.slice(1).every(Boolean)).toBe(true);
    expect(Math.max(...full.bobs)).toBeGreaterThan(0);
    const reduced = run(busy, true, 120);
    expect(Math.max(...reduced.bobs)).toBe(0);
  });

  it("measures the bob from the crew's held pose, so the dock slump and the working pitch are not motion", () => {
    const { writes, crew } = setup();
    const view = officeView({ status: "ready", snapshot: OFFICE_FIXTURES.busy as OfficeSnapshotV1 });
    for (let f = 0; f < 60; f++) stepOfficeCrew(crew, writes, OFFICE_SLOTS, view.rovers, DT, f * DT, true, CAM);
    for (const r of view.rovers) expect(crewOffset(r.state, crew.actors[r.slot].pose, slotPhase(r.slot))).toBe(0);
  });

  it("fills each slot's fx in place and keys the crew glow", () => {
    const { writes, crew } = setup();
    const fx = crew.fx.slice();
    const view = officeView({ status: "ready", snapshot: OFFICE_FIXTURES.busy as OfficeSnapshotV1 });
    stepOfficeCrew(crew, writes, OFFICE_SLOTS, view.rovers, DT, 0, false, CAM);
    crew.fx.forEach((f, i) => expect(f).toBe(fx[i]));
    expect(writes.glowKeys.every((k) => k.includes("|"))).toBe(true);
    const working = view.rovers.find((r) => r.state === "working")!;
    expect(crew.fx[working.slot].sparks).toBe(1);
  });
});
