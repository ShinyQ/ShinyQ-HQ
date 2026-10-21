import { describe, expect, it } from "vitest";
import { LOBBY } from "@/experience/config";
import { towerKey, towerLanes } from "@/experience/floors/lobby/office/crewFx";
import { crewOffset, lodStep, OFFICE_LOD, officeCrew, restCrewKey, restCrewPose, stepOfficeCrew } from "@/experience/floors/lobby/office/crewFrame";
import { RoverWrites } from "@/experience/floors/lobby/office/officeFrame";
import { officeView, type OfficeView } from "@/experience/floors/lobby/office/officeModel";
import { slotPhase } from "@/experience/floors/lobby/office/officeVisual";
import { officeTowerColumn } from "@/experience/floors/lobby/officeLayout";
import { OFFICE_SLOTS } from "@/experience/floors/lobby/officeShell";
import { OFFICE_FIXTURES, OFFICE_FIXTURES_V2, OFFICE_FIXTURES_V3 } from "@/lib/office/fixtures";
import type { OfficeFeedSnapshot } from "@/lib/office/poll";
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
    expect(writes.posePending).toEqual(OFFICE_SLOTS.map(() => false));
    expect(writes.glowPending).toEqual(OFFICE_SLOTS.map(() => false));
    expect(restCrewPose().z).toBeLessThan(0);
  });

  it("writes nothing per frame for a fully asleep office under reduced motion with a still camera", () => {
    const { due, bobs } = run(asleep, true, 600);
    // The first frame turns the tips to the camera (and draws the tower's key once); after that nothing.
    expect(due[0]).toBe(true);
    expect(due.slice(1).some(Boolean)).toBe(false);
    expect(Math.max(...bobs)).toBe(0);
  });

  it("a still office of ten (both rows awake, drones included) writes nothing per frame under reduced motion", () => {
    const ten = officeView({ status: "ready", snapshot: OFFICE_FIXTURES_V3.busy as OfficeFeedSnapshot });
    expect(ten.rovers).toHaveLength(OFFICE_SLOTS.length);
    expect(ten.rovers.filter((r) => r.slot >= 5 && r.state !== "asleep")).toHaveLength(4);
    const { due, bobs } = run(ten, true, 600);
    expect(due[0]).toBe(true);
    expect(due.slice(1).some(Boolean)).toBe(false);
    expect(Math.max(...bobs)).toBe(0);
    // Ten asleep: the same.
    const asleepTen = run(asleep, true, 600);
    expect(asleepTen.due.slice(1).some(Boolean)).toBe(false);
  });

  it("stays still under reduced motion with GitHub-only data (asleep desks) and a running run", () => {
    const busy = OFFICE_FIXTURES.busy as OfficeSnapshotV1;
    const semi = officeView({ status: "ready", snapshot: { ...busy, mode: "off" } });
    expect(semi.rovers.every((r) => r.state === "asleep")).toBe(true);
    expect(towerLanes(semi).chasing).toBe(true);
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

  it("parks helper drones under reduced motion (nothing written per frame) and ticks them at 30 Hz in full motion", () => {
    const drones = officeView({ status: "ready", snapshot: OFFICE_FIXTURES_V2.busy as OfficeFeedSnapshot });
    expect(drones.rovers.map((r) => r.helpers)).toEqual([3, 0, 6, 0, 0, 0, 0, 0, 0, 0]);
    const { due } = run(drones, true, 300);
    expect(due.slice(1).some(Boolean)).toBe(false);
    const { writes, crew } = setup();
    stepOfficeCrew(crew, writes, OFFICE_SLOTS, drones.rovers, DT, 0, false, CAM);
    const first = writes.glowKeys.slice();
    stepOfficeCrew(crew, writes, OFFICE_SLOTS, drones.rovers, DT, 1 / 30 + 1e-3, false, CAM);
    expect(writes.glowKeys[0]).not.toBe(first[0]);
    expect(writes.glowKeys[0]).toContain("|d3");
    expect(writes.glowKeys[2]).toContain("|d4");
    expect(writes.glowKeys[1]).not.toContain("|d");
  });

  it("rewrites a still Rover's glow when its drone count or the tier changes", () => {
    const { writes, crew } = setup();
    const view = officeView({ status: "ready", snapshot: OFFICE_FIXTURES_V2.busy as OfficeFeedSnapshot });
    const one = view.rovers.map((r) => ({ ...r, helpers: r.slot === 0 ? 1 : 0 }));
    stepOfficeCrew(crew, writes, OFFICE_SLOTS, one, DT, 0, true, CAM);
    for (const s of OFFICE_SLOTS) writes.done(s.slot);
    stepOfficeCrew(crew, writes, OFFICE_SLOTS, one.map((r) => ({ ...r, helpers: r.slot === 0 ? 2 : 0 })), DT, DT, true, CAM);
    expect(writes.glowPending).toEqual(OFFICE_SLOTS.map((s) => s.slot === 0));
    for (const s of OFFICE_SLOTS) writes.done(s.slot);
    stepOfficeCrew(crew, writes, OFFICE_SLOTS, one.map((r) => ({ ...r, helpers: r.slot === 0 ? 2 : 0 })), DT, 2 * DT, true, CAM, true);
    expect(writes.glowPending).toEqual(OFFICE_SLOTS.map((s) => s.slot === 0));
  });
});

/** Runs `frames` frames like OfficeRovers with the camera `distance` u from the office: the frames that wrote (a Rover marked or the tower key changed). */
function runLod(view: OfficeView, reduced: boolean, frames: number, distance: number) {
  const { writes, crew } = setup();
  const lanes = towerLanes(view);
  let lanesKey = "";
  const lod = { step: false, dt: 0, acc: 0 };
  const wrote: number[] = [];
  let steps = 0;
  for (let f = 0; f < frames; f++) {
    const now = f * DT;
    lodStep(distance, DT, lod.acc, lod);
    if (!lod.step) continue;
    steps += 1;
    stepOfficeCrew(crew, writes, OFFICE_SLOTS, view.rovers, lod.dt, now, reduced, CAM);
    const tk = towerKey(lanes, now, reduced);
    if (writes.pending() || tk !== lanesKey) wrote.push(f);
    for (const s of OFFICE_SLOTS) writes.done(s.slot);
    lanesKey = tk;
  }
  return { wrote, steps };
}

describe("office far level of detail (lodStep)", () => {
  it("steps every frame inside farDistance, carrying no time", () => {
    expect(OFFICE_LOD).toMatchObject({ farDistance: 40, farHz: 4 });
    const out = { step: false, dt: 0, acc: 0 };
    for (const d of [0, 20, OFFICE_LOD.farDistance]) {
      expect(lodStep(d, DT, 0, out)).toEqual({ step: true, dt: DT, acc: 0 });
    }
    // Coming near with time carried from the far rate: it steps by all of it at once.
    expect(lodStep(10, DT, 0.1)).toEqual({ step: true, dt: 0.1 + DT, acc: 0 });
  });

  it("accumulates the frame deltas past farDistance and steps by them at 4 Hz", () => {
    let acc = 0;
    let steps = 0;
    let time = 0;
    for (let f = 0; f < 600; f++) {
      const r = lodStep(OFFICE_LOD.farDistance + 0.01, DT, acc);
      acc = r.acc;
      if (r.step) {
        steps += 1;
        time += r.dt;
        expect(r.dt).toBeCloseTo(1 / OFFICE_LOD.farHz, 6);
      } else expect(r.dt).toBe(0);
    }
    // Ten seconds of frames: 40 steps, and the stepped time plus what is carried is the whole ten seconds.
    expect(steps).toBe(40);
    expect(time + acc).toBeCloseTo(600 * DT, 6);
    // A long frame steps at once.
    expect(lodStep(100, 0.3, 0)).toEqual({ step: true, dt: 0.3, acc: 0 });
  });

  it("writes a busy far office at most 4 times a second, every frame near, and a still far office not at all", () => {
    const busy = officeView({ status: "ready", snapshot: OFFICE_FIXTURES.busy as OfficeSnapshotV1 });
    const far = runLod(busy, false, 600, 60);
    expect(far.steps).toBe(40);
    expect(far.wrote.length).toBeGreaterThan(30);
    expect(far.wrote.length).toBeLessThanOrEqual(40);
    // Never two writes inside a quarter second.
    for (let i = 1; i < far.wrote.length; i++) expect((far.wrote[i] - far.wrote[i - 1]) * DT).toBeGreaterThanOrEqual(1 / OFFICE_LOD.farHz - 1e-6);
    const near = runLod(busy, false, 120, 20);
    expect(near.steps).toBe(120);
    expect(near.wrote.length).toBeGreaterThan(100);
    const still = runLod(asleep, true, 600, 60);
    expect(still.wrote.slice(1)).toEqual([]);
  });

  it("applies to all ten Rovers: a busy office of ten writes at most 4 times a second far, a still one not at all", () => {
    const ten = officeView({ status: "ready", snapshot: OFFICE_FIXTURES_V3.busy as OfficeFeedSnapshot });
    const far = runLod(ten, false, 600, 60);
    expect(far.steps).toBe(40);
    expect(far.wrote.length).toBeLessThanOrEqual(40);
    for (let i = 1; i < far.wrote.length; i++) expect((far.wrote[i] - far.wrote[i - 1]) * DT).toBeGreaterThanOrEqual(1 / OFFICE_LOD.farHz - 1e-6);
    expect(runLod(ten, true, 600, 60).wrote.slice(1)).toEqual([]);
  });
});

