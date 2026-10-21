import { Color, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { CHARGE_PAD, CHARGE_PAD_TRIM, CREW_GLOW, crewGlowKey, DARK_TOWER, PIPE_GLOW, TOWER, towerKey, towerLanes, writeCrewGlow, writeTower, type LaneStatus, type TowerLanes } from "@/experience/floors/lobby/office/crewFx";
import { CREW, crewFx, newActor, stepCrew } from "@/experience/floors/lobby/office/crew";
import { GLOW_PER_ROVER, officeInstances, PARTS_PER_ROVER, roverFrame, TREADS_PER_ROVER, writeGlow } from "@/experience/floors/lobby/office/officeRig";
import { STATUS_COLOR, stillPose } from "@/experience/floors/lobby/office/officeVisual";
import { OFFICE_SLOTS } from "@/experience/floors/lobby/officeShell";
import { OFFICE, OFFICE_SEAT_COUNT, officeRiser, officeTowerColumn } from "@/experience/floors/lobby/officeLayout";
import { LOBBY } from "@/experience/config";
import { officeView } from "@/experience/floors/lobby/office/officeModel";
import { OFFICE_FIXTURES, OFFICE_FIXTURES_V3, OFFICE_FIXTURES_V4 } from "@/lib/office/fixtures";
import type { OfficeSnapshotV1, OfficeSnapshotV3, OfficeSnapshotV4 } from "@/lib/office/protocol";
import { lanesOf } from "@/experience/floors/lobby/office/pipeline";

const LOOK = { camera: 0, tower: 0 };
const scaleAt = (m: Float32Array, i: number) => new Matrix4().fromArray(m, i * 16).getMaxScaleOnAxis();
const posAt = (m: Float32Array, i: number) => new Vector3().setFromMatrixPosition(new Matrix4().fromArray(m, i * 16));
/** Part A's anonymous lanes: `done` of `total` done, the next running, the rest queued. */
const anon = (total: number, done: number): TowerLanes => {
  const states = Array.from({ length: total }, (_, i): LaneStatus => (i < done ? "done" : i === done ? "running" : "queued"));
  return { states, chasing: states.includes("running"), sig: states.map((x) => x[0]).join("") };
};

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
  it("packs 38 glow instances per Rover (18 rig, 20 crew with 4 drone eyes) and the tower after the ten Rovers", () => {
    expect(GLOW_PER_ROVER).toBe(38);
    expect(TOWER.start).toBe(10 * GLOW_PER_ROVER);
  });

  it("derives every instance count from the one seat count (ten Rovers, the slots and `TOWER.start` alike), the tower's dots after every Rover's glow", () => {
    const n = officeInstances();
    expect(OFFICE_SLOTS).toHaveLength(OFFICE_SEAT_COUNT);
    expect(n).toEqual({ parts: 10 * PARTS_PER_ROVER + 13, treads: 10 * TREADS_PER_ROVER, glow: 643, quads: 30 });
    // 380 Rover glow, 192 tower dots, then the 71 pipeline effects right after the tower's last dot.
    expect(n.glow).toBe(10 * GLOW_PER_ROVER + TOWER.lanes * TOWER.dots + PIPE_GLOW.count);
    expect(PIPE_GLOW.start).toBe(TOWER.start + TOWER.lanes * TOWER.dots);
    expect(PIPE_GLOW.start).toBe(572);
    expect(TOWER.start).toBe(OFFICE_SEAT_COUNT * GLOW_PER_ROVER);
    // Each Rover's rig and crew glow lands in its own block: the last Rover's ends exactly where the tower starts.
    const m = new Float32Array(n.glow * 16);
    const c = new Float32Array(n.glow * 3);
    const fx = crewFx(newActor("working"), false);
    for (const s of OFFICE_SLOTS) {
      const f = roverFrame(s, stillPose("working"), new Matrix4());
      writeGlow(s, f, "ci", { done: 3, total: 8 }, 1, 0.5, false, LOBBY.officeWing.stop, m, c);
      writeCrewGlow(s, f, "working", fx, 0.5, 0, false, m, c, 4);
    }
    const last = OFFICE_SLOTS.length - 1;
    expect(scaleAt(m, last * GLOW_PER_ROVER)).toBeGreaterThan(0);
    expect(scaleAt(m, last * GLOW_PER_ROVER + 18 + CREW_GLOW.cores + 3)).toBeGreaterThan(0);
    for (let i = TOWER.start; i < n.glow; i++) expect(scaleAt(m, i), `tower dot ${i}`).toBe(0);
    // The back row's halos lie on the riser top.
    for (const s of OFFICE_SLOTS) expect(posAt(m, s.slot * GLOW_PER_ROVER + 1).y).toBeGreaterThan(s.lift);
    expect(OFFICE_SLOTS.filter((s) => s.lift > 0).map((s) => s.slot)).toEqual([5, 6, 7, 8, 9]);
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
    expect(posAt(m, base + CREW_GLOW.charge).y).toBeCloseTo(CHARGE_PAD.y);
    expect(scaleAt(m, base + CREW_GLOW.charge)).toBeGreaterThan(0);
  });
  it("lays the charge pad where the docked Rover stands, behind the desk and wider than the Rover, over the corner pads", () => {
    const m = new Float32Array(OFFICE_SLOTS.length * GLOW_PER_ROVER * 16);
    const c = new Float32Array(OFFICE_SLOTS.length * GLOW_PER_ROVER * 3);
    for (const slot of OFFICE_SLOTS) {
      const base = slot.slot * GLOW_PER_ROVER + 18;
      const asleep = newActor("asleep");
      const frame = roverFrame(slot, stepCrew(asleep, "asleep", 0.1, 0, true, LOOK), new Matrix4());
      writeCrewGlow(slot, frame, "asleep", crewFx(asleep, true), 0.1, 0, true, m, c);
      const at = posAt(m, base + CREW_GLOW.charge);
      const docked = new Vector3().setFromMatrixPosition(frame);
      const e = new Matrix4().fromArray(m, (base + CREW_GLOW.charge) * 16).elements;
      const depth = Math.hypot(e[4], e[5], e[6]);
      const arc = LOBBY.officeWing.arc;
      const r = Math.hypot(at.x - arc.x, at.z - arc.z);
      const row = OFFICE.rows[slot.row];
      if (slot.lift > 0) {
        // On the riser: trimmed at the back to end on the riser's back edge, never hanging past it in mid-air.
        expect(CHARGE_PAD_TRIM).toBeCloseTo(0.45);
        expect(depth).toBeCloseTo(CHARGE_PAD.d - CHARGE_PAD_TRIM);
        const riser = officeRiser(LOBBY.officeWing, row, slot.theta)!;
        const riserBack = Math.hypot(riser.center.x - arc.x, riser.center.z - arc.z) + riser.d / 2;
        expect(r + depth / 2).toBeLessThanOrEqual(riserBack + 1e-5);
        expect(r + depth / 2).toBeCloseTo(row.roverRadius + OFFICE.rover.radius);
        expect(CHARGE_PAD.w).toBeLessThan(riser.w);
        // Still under the docked Rover, on its radial line.
        expect(Math.abs(Math.hypot(docked.x - arc.x, docked.z - arc.z) - r)).toBeLessThan(depth / 2);
        expect(Math.abs((at.x - arc.x) * Math.cos(slot.theta) - (at.z - arc.z) * Math.sin(slot.theta))).toBeLessThan(1e-5);
      } else {
        expect(depth).toBeCloseTo(CHARGE_PAD.d);
        expect(Math.hypot(at.x - docked.x, at.z - docked.z)).toBeLessThan(1e-5);
      }
      // Its front edge (toward the arc centre) meets the desk's back edge: no part of it under the desk.
      expect(r - depth / 2).toBeGreaterThanOrEqual(row.deskRadius + OFFICE.desk.d / 2 - 1e-5);
      expect(r - depth / 2).toBeCloseTo(row.deskRadius + OFFICE.desk.d / 2);
      // Its width runs along the desk (the Rover's local x), 0.85 u past the Rover's 0.75 u half width on each side.
      expect(Math.hypot(e[0], e[1], e[2])).toBeCloseTo(CHARGE_PAD.w);
      expect(Math.abs(e[0] * Math.cos(slot.yaw) - e[2] * Math.sin(slot.yaw)) / CHARGE_PAD.w).toBeCloseTo(1);
      expect(CHARGE_PAD.w / 2).toBeGreaterThan(0.75 + 0.5);
      expect(at.y).toBeGreaterThan(Math.max(OFFICE.tower.plinth, OFFICE.dock.pad));
      // On its row's floor (the back row's riser top).
      expect(at.y - slot.lift).toBeCloseTo(CHARGE_PAD.y);
      // Reduced motion: a steady 0.6 of the pad's colour.
      expect(Math.max(c[(base + CREW_GLOW.charge) * 3], c[(base + CREW_GLOW.charge) * 3 + 1], c[(base + CREW_GLOW.charge) * 3 + 2])).toBeGreaterThan(0.4);
    }
  });
  it("breathes the charge pad 0.45 to 0.8 at 0.2 Hz, a steady 0.6 under reduced motion", () => {
    expect(CREW.charge).toEqual({ hz: 0.2, lo: 0.45, hi: 0.8, still: 0.6 });
    const a = newActor("asleep");
    const levels: number[] = [];
    for (let i = 0; i < 300; i++) levels.push(crewFx((stepCrew(a, "asleep", 1 / 60, 0, false, LOOK), a), false).charge);
    expect(Math.min(...levels)).toBeGreaterThanOrEqual(0.45 - 1e-9);
    expect(Math.max(...levels)).toBeLessThanOrEqual(0.8 + 1e-9);
    expect(Math.max(...levels) - Math.min(...levels)).toBeGreaterThan(0.3);
    expect(crewFx(newActor("asleep"), true).charge).toBe(0.6);
  });
});

describe("tower lanes", () => {
  it("puts the dots on the column's stop-facing side, inside its height", () => {
    const m = new Float32Array((TOWER.start + TOWER.lanes * TOWER.dots) * 16);
    const c = new Float32Array((TOWER.start + TOWER.lanes * TOWER.dots) * 3);
    writeTower(anon(12, 7), 0, false, m, c);
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
    // Lit lanes bright, the run's pending lanes and the idle ones a dim grid under them.
    expect(green(6)).toBeGreaterThan(0.5);
    expect(green(13)).toBeLessThan(green(9));
    expect(green(9)).toBeLessThan(green(6) / 3);
  });
  it("spans the lanes over most of the slim column's height, the dots across its face", () => {
    const m = new Float32Array((TOWER.start + TOWER.lanes * TOWER.dots) * 16);
    const c = new Float32Array((TOWER.start + TOWER.lanes * TOWER.dots) * 3);
    writeTower(DARK_TOWER, 0, true, m, c);
    const bottom = posAt(m, TOWER.start).y;
    const top = posAt(m, TOWER.start + (TOWER.lanes - 1) * TOWER.dots).y;
    expect(bottom - OFFICE.tower.plinth).toBeLessThan(0.6);
    expect((top - bottom) / OFFICE.tower.h).toBeGreaterThan(0.85);
    expect(top).toBeLessThan(OFFICE.tower.plinth + OFFICE.tower.h - 0.2);
    const first = posAt(m, TOWER.start);
    const last = posAt(m, TOWER.start + TOWER.dots - 1);
    const span = Math.hypot(last.x - first.x, last.z - first.z) + TOWER.size.lit;
    expect(span).toBeGreaterThan(OFFICE.tower.column * 0.7);
    expect(span).toBeLessThan(OFFICE.tower.column);
  });

  it("gives one lane per job from the v4 pipeline, the back-row run's 3 lanes first", () => {
    const snap = OFFICE_FIXTURES_V4.busy as OfficeSnapshotV4;
    const lanes = towerLanes(officeView({ status: "ready", snapshot: snap }));
    expect(lanes.states).toEqual(lanesOf(snap.pipeline).map((l) => l.status));
    expect(lanes.states).toHaveLength(TOWER.lanes);
    expect(lanes.states.slice(0, 3)).toEqual(["running", "queued", "queued"]);
    expect(lanes.chasing).toBe(true);
  });
  it("reads the newest running run's progress as anonymous lanes from a v3 feed (no pipeline), scaled past 24 jobs", () => {
    const lanes = towerLanes(officeView({ status: "ready", snapshot: OFFICE_FIXTURES_V3.busy as OfficeSnapshotV3 }));
    expect(lanes).toEqual(anon(12, 7));
    const busy = OFFICE_FIXTURES.busy as OfficeSnapshotV1;
    const runs = (done: number, total: number): OfficeSnapshotV1 => ({ ...busy, github: busy.github.map((g) => (g.kind === "run" && g.status === "running" ? { ...g, progress: { done, total } } : g)) });
    expect(towerLanes(officeView({ status: "ready", snapshot: runs(30, 48) }))).toEqual(anon(24, 15));
    expect(towerLanes(officeView({ status: "ready", snapshot: runs(47, 48) }))).toEqual(anon(24, 23));
    expect(towerLanes(officeView({ status: "ready", snapshot: runs(48, 48) }))).toEqual(anon(24, 24));
    expect(towerLanes(officeView({ status: "ready", snapshot: runs(5, 12) }))).toEqual(anon(12, 5));
  });
  it("paints a failed lane red and chases every running lane", () => {
    const m = new Float32Array((TOWER.start + TOWER.lanes * TOWER.dots) * 16);
    const c = new Float32Array((TOWER.start + TOWER.lanes * TOWER.dots) * 3);
    const states: LaneStatus[] = ["failed", "running", "done", "running", "queued"];
    writeTower({ states, chasing: true, sig: "frdrq" }, 0, false, m, c);
    const rgb = (lane: number, d = 0) => Array.from(c.slice((TOWER.start + lane * TOWER.dots + d) * 3, (TOWER.start + lane * TOWER.dots + d) * 3 + 3));
    const red = new Color(STATUS_COLOR.failure).multiplyScalar(TOWER.done);
    expect(rgb(0)[0]).toBeCloseTo(red.r);
    expect(rgb(0)[1]).toBeCloseTo(red.g);
    // Both running lanes chase: the head dot bright, the others dim.
    for (const lane of [1, 3]) expect(rgb(lane, 0)[0]).toBeGreaterThan(rgb(lane, 1)[0] * 2);
    expect(scaleAt(m, TOWER.start + 5 * TOWER.dots)).toBeCloseTo(TOWER.size.idle);
    expect(scaleAt(m, TOWER.start + 4 * TOWER.dots)).toBeCloseTo(TOWER.size.lit);
  });
  it("sizes the dots to read from the office stop (owner decision 2026-10-21: about 1.6 times part A's), never overlapping across a lane", () => {
    expect(TOWER.size.lit / 0.11).toBeGreaterThanOrEqual(1.5);
    expect(TOWER.size.lit / 0.11).toBeLessThanOrEqual(2);
    expect(TOWER.size.idle / 0.09).toBeGreaterThanOrEqual(1.5);
    // The dot's visible disc is about 0.75 of its quad: neighbours across a lane and lanes above each other stay apart.
    expect(TOWER.size.lit * 0.75).toBeLessThan(TOWER.across);
    expect(TOWER.size.lit).toBeLessThan(TOWER.gap / 1.5);
    // Done and failed lanes brighter than part A's (1.2).
    expect(TOWER.done).toBeGreaterThanOrEqual(1.5 * 1.2);
  });
  it("sets running lanes apart from queued ones: violet and chasing in full motion, queued dim slate and steady", () => {
    const m = new Float32Array((TOWER.start + TOWER.lanes * TOWER.dots) * 16);
    const c = new Float32Array((TOWER.start + TOWER.lanes * TOWER.dots) * 3);
    const lanes: TowerLanes = { states: ["running", "queued"], chasing: true, sig: "rq" };
    const at = (lane: number, d: number) => Array.from(c.slice((TOWER.start + lane * TOWER.dots + d) * 3, (TOWER.start + lane * TOWER.dots + d) * 3 + 3));
    const peak = (lane: number, d: number) => Math.max(...at(lane, d));
    const frames: number[][] = [];
    for (const t of [0, 0.125, 0.25, 0.375]) {
      writeTower(lanes, t, false, m, c);
      frames.push(Array.from({ length: TOWER.dots }, (_, d) => peak(0, d)));
      // The queued lane is the same at every step: dim and steady, every dot alike.
      for (let d = 0; d < TOWER.dots; d++) expect(peak(1, d)).toBeCloseTo(peak(1, 0));
      // Every running dot (even the dimmest) is brighter than any queued one, and in another tone (violet over slate).
      expect(Math.min(...frames.at(-1)!)).toBeGreaterThan(peak(1, 0) * 1.5);
      expect(at(0, 0)[0] / at(0, 0)[2]).not.toBeCloseTo(at(1, 0)[0] / at(1, 0)[2], 1);
    }
    // The chase moves: the brightest dot steps one along each eighth of a second, a dimmer tail behind it.
    const heads = frames.map((f) => f.indexOf(Math.max(...f)));
    expect(heads).toEqual([0, 1, 2, 3]);
    expect(frames[1][0]).toBeGreaterThan(frames[1][4]);
    expect(frames[1][0]).toBeLessThan(frames[1][1]);
    expect(towerKey(lanes, 0, false)).not.toBe(towerKey(lanes, 0.125, false));
  });
  it("keeps running lanes steady under reduced motion, still brighter than queued and in another tone", () => {
    const m = new Float32Array((TOWER.start + TOWER.lanes * TOWER.dots) * 16);
    const c = new Float32Array((TOWER.start + TOWER.lanes * TOWER.dots) * 3);
    const lanes: TowerLanes = { states: ["running", "queued"], chasing: true, sig: "rq" };
    const peak = (lane: number, d: number) => Math.max(c[(TOWER.start + lane * TOWER.dots + d) * 3], c[(TOWER.start + lane * TOWER.dots + d) * 3 + 1], c[(TOWER.start + lane * TOWER.dots + d) * 3 + 2]);
    writeTower(lanes, 0, true, m, c);
    const first = Array.from({ length: TOWER.dots }, (_, d) => peak(0, d));
    writeTower(lanes, 0.3, true, m, c);
    expect(Array.from({ length: TOWER.dots }, (_, d) => peak(0, d))).toEqual(first);
    for (const v of first) expect(v).toBeCloseTo(first[0]);
    expect(first[0]).toBeGreaterThan(peak(1, 0) * 2);
    const violet = new Color("#a78bfa").multiplyScalar(TOWER.run.still);
    expect(c[TOWER.start * 3 + 2]).toBeCloseTo(violet.b);
    expect(towerKey(lanes, 0, true)).toBe(towerKey(lanes, 0.3, true));
  });
  it("is dark and keyed still without a run", () => {
    const view = officeView({ status: "ready", snapshot: OFFICE_FIXTURES.quiet as OfficeSnapshotV1 });
    const lanes = towerLanes(view);
    expect(lanes).toEqual(DARK_TOWER);
    const m = new Float32Array((TOWER.start + TOWER.lanes * TOWER.dots) * 16);
    const c = new Float32Array((TOWER.start + TOWER.lanes * TOWER.dots) * 3);
    writeTower(lanes, 3, false, m, c);
    // Dark: every dot a dim idle dot, still visible as a grid (no lane lit).
    for (let i = TOWER.start; i < TOWER.start + TOWER.lanes * TOWER.dots; i++) {
      const rgb = [c[i * 3], c[i * 3 + 1], c[i * 3 + 2]];
      expect(Math.max(...rgb)).toBeGreaterThan(0.05);
      expect(Math.max(...rgb)).toBeLessThan(0.15);
      expect(scaleAt(m, i)).toBeCloseTo(TOWER.size.idle);
    }
    expect(towerKey(lanes, 3, true)).toBe(towerKey(lanes, 8, true));
    expect(towerKey(lanes, 3, false)).toBe(towerKey(lanes, 8.37, false));
  });
});
