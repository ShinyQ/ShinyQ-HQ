import { describe, expect, it } from "vitest";
import { dirtyCells, FACE_FPS_MAX } from "@/experience/floors/lobby/office/officeAtlas";
import { AtlasClock, CAMERA_EPS, fadeLevel, fadeTag, RoverWrites, stepFade, WallGate } from "@/experience/floors/lobby/office/officeFrame";
import { glowKey } from "@/experience/floors/lobby/office/officeRig";
import { CROSSFADE_S, pose, slotPhase, stillPose } from "@/experience/floors/lobby/office/officeVisual";
import { wallSpin, type WallModel } from "@/experience/floors/lobby/office/officeWall";

const STOP = { x: 3.5, z: 14.2 };
const rest = () => new RoverWrites(5, stillPose("asleep"), glowKey("asleep", null, true, 0), STOP);

describe("Agent Office frame gate: Rover writes", () => {
  it("writes nothing while every Rover sleeps (asleep is a still pose) or holds a reduced-motion pose", () => {
    const g = rest();
    for (const t of [0, 0.4, 1.3, 7.9]) {
      for (let slot = 0; slot < 5; slot++) {
        expect(g.pose(slot, pose("asleep", t, slotPhase(slot), false))).toBe(false);
        g.glow(slot, glowKey("asleep", null, false, t));
      }
      expect(g.camera(STOP.x, STOP.z)).toBe(false);
      expect(g.pending()).toBe(false);
    }
    const r = rest();
    expect(r.pose(2, pose("working", 0, slotPhase(2), true))).toBe(true);
    r.done(2);
    for (const t of [0.1, 0.5, 3]) expect(r.pose(2, pose("working", t, slotPhase(2), true))).toBe(false);
    expect(r.pending()).toBe(false);
  });

  it("marks a moving Rover's pose and glow, and keeps them pending until its writes ran", () => {
    const g = rest();
    expect(g.pose(1, pose("working", 0.3, slotPhase(1), false))).toBe(true);
    expect(g.posePending[1]).toBe(true);
    expect(g.glowPending[1]).toBe(true);
    expect(g.posePending.filter(Boolean)).toHaveLength(1);
    // A later frame that moves another Rover keeps the first one's writes pending (whenDrawn keeps only the latest work).
    g.pose(3, pose("done", 0.2, slotPhase(3), false));
    expect(g.posePending[1] && g.posePending[3]).toBe(true);
    g.done(1);
    g.done(3);
    expect(g.pending()).toBe(false);
  });

  it("rewrites a Rover's glow alone when its glow key changes (state, progress or the moving dot run)", () => {
    const g = rest();
    g.glow(4, glowKey("asleep", null, false, 1));
    expect(g.pending()).toBe(false);
    g.glow(4, glowKey("ci", { done: 1, total: 4 }, false, 1));
    expect(g.glowPending[4]).toBe(true);
    expect(g.posePending[4]).toBe(false);
    g.done(4);
    g.glow(4, glowKey("ci", { done: 1, total: 4 }, false, 2));
    expect(g.pending()).toBe(false);
    g.glow(4, glowKey("ci", { done: 2, total: 4 }, false, 2));
    expect(g.glowPending[4]).toBe(true);
  });

  it("rewrites every glow (the tips face the camera) once the camera moved, ignoring jitter below CAMERA_EPS", () => {
    const g = rest();
    expect(g.camera(STOP.x + CAMERA_EPS / 2, STOP.z)).toBe(false);
    expect(g.pending()).toBe(false);
    expect(g.camera(STOP.x, STOP.z + 0.5)).toBe(true);
    expect(g.glowPending).toEqual([true, true, true, true, true]);
    expect(g.posePending).toEqual([false, false, false, false, false]);
    for (let slot = 0; slot < 5; slot++) g.done(slot);
    // Slow drift adds up against the last written camera, not the last frame.
    let moved = false;
    for (let k = 1; k <= 4; k++) moved = g.camera(STOP.x + k * CAMERA_EPS * 0.4, STOP.z + 0.5) || moved;
    expect(moved).toBe(true);
  });
});

describe("Agent Office frame gate: atlas", () => {
  it("redraws faces at most FACE_FPS_MAX times a second and screens at the tier rate", () => {
    for (const fps of [10, 5]) {
      const clock = new AtlasClock();
      let faces = 0;
      let screens = 0;
      for (let frame = 0; frame <= 120; frame++) {
        clock.tick(frame / 60, fps);
        if (clock.faceDue) faces += 1;
        if (clock.screenDue) screens += 1;
      }
      expect(faces).toBeLessThanOrEqual(FACE_FPS_MAX * 2 + 1);
      expect(screens).toBeLessThanOrEqual(fps * 2 + 1);
      expect(faces).toBeGreaterThan(0);
    }
  });

  it("starts a crossfade on a state change under reduced motion only, and ends it after CROSSFADE_S", () => {
    expect(stepFade("working", "done", null, false, 3)).toBeNull();
    const fade = stepFade("working", "done", null, true, 3);
    expect(fade).toEqual({ from: "working", at: 3 });
    expect(stepFade("done", "done", fade, true, 3 + CROSSFADE_S / 2)).toBe(fade);
    expect(stepFade("done", "done", fade, true, 3 + CROSSFADE_S)).toBeNull();
    expect(fadeLevel(null, 9)).toBe(1);
    expect(fadeLevel(fade, 3 + CROSSFADE_S / 2)).toBeCloseTo(0.5);
  });

  it("puts the quantized crossfade into the cell keys, so every fade step uploads its cell and the end draws in full", () => {
    const fade = { from: "working" as const, at: 0 };
    const keys = [0, 0.05, 0.1, 0.2, 0.3, CROSSFADE_S].map((t) => `happy${fadeTag(t >= CROSSFADE_S ? null : fade, fadeLevel(fade, t))}`);
    expect(new Set(keys).size).toBeGreaterThanOrEqual(4);
    expect(keys.at(-1)).toBe("happy");
    expect(fadeTag(null, 1)).toBe("");
    // Only the fading cell is dirty.
    const prev = ["happy~working:0", "sleep", "sleep"];
    expect(dirtyCells(prev, [`happy${fadeTag(fade, 0.5)}`, "sleep", "sleep"])).toEqual([0]);
  });
});

const model = (running: boolean): WallModel => ({
  control: "MISSION CONTROL",
  status: "LIVE",
  statusColor: "#0f0",
  extra: null,
  tiles: [],
  nowTitle: "Now",
  now: [],
  resting: null,
  today: null,
  github: "GITHUB",
  githubSub: "Public",
  rows: running ? [{ status: "running", title: "CI", meta: "m", progress: null }] : [],
  empty: "None",
});

describe("Agent Office frame gate: wall", () => {
  it("rebuilds the model only when its inputs change or a second passed", () => {
    const g = new WallGate();
    const view = {};
    expect(g.stale([view, "en"], 0)).toBe(true);
    expect(g.stale([view, "en"], 0.5)).toBe(false);
    expect(g.stale([{}, "en"], 0.6)).toBe(true);
    expect(g.stale([view, "en"], 0.7)).toBe(true);
    expect(g.stale([view, "en"], 1.2)).toBe(false);
    expect(g.stale([view, "en"], 1.7)).toBe(true);
  });

  it("redraws when the cached content or the spinner bucket changes, never for the same frame", () => {
    const g = new WallGate();
    g.built(model(false));
    expect(g.changed(model(false), 0)).toBe(true);
    expect(g.changed(model(false), 5)).toBe(false);
    g.built(model(true));
    expect(g.changed(model(true), 5)).toBe(true);
    expect(g.changed(model(true), 5.2)).toBe(false);
    expect(g.changed(model(true), 5.6)).toBe(true);
    // Reduced motion passes a fixed time: a running row never spins the redraws.
    expect(g.changed(model(true), 0)).toBe(true);
    expect(g.changed(model(true), 0)).toBe(false);
    expect(wallSpin(model(false), 9)).toBe(0);
    expect(wallSpin(model(true), 1.6)).toBe(3);
  });
});
