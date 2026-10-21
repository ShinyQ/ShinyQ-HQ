import { describe, expect, it } from "vitest";
import { dirtyCells, FACE_FPS_MAX } from "@/experience/floors/lobby/office/officeAtlas";
import { AtlasClock, CAMERA_EPS, fadeLevel, fadeTag, LEAD, leadEnd, RoverWrites, stepFade, WallGate } from "@/experience/floors/lobby/office/officeFrame";
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

  it("marks a pose write when only an offset, the turn or the flag changed", () => {
    const w = new RoverWrites(1, stillPose("asleep"), "asleep", { x: 0, z: 0 });
    for (const k of ["x", "z", "yaw", "flag", "wave"] as const) {
      w.done(0);
      expect(w.pose(0, { ...w.poses[0], [k]: w.poses[0][k] + 0.1 })).toBe(true);
    }
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

  it("slows faces and desk screens to 2 fps in the far level of detail", () => {
    const clock = new AtlasClock();
    let faces = 0;
    let screens = 0;
    for (let frame = 0; frame <= 120; frame++) {
      clock.tick(frame / 60, 2, 2);
      if (clock.faceDue) faces += 1;
      if (clock.screenDue) screens += 1;
    }
    expect(faces).toBeLessThanOrEqual(2 * 2 + 1);
    expect(screens).toBeLessThanOrEqual(2 * 2 + 1);
    expect(faces).toBeGreaterThan(2);
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

describe("Agent Office leader line ends (`leadEnd`)", () => {
  const out = () => ({ x: 0, y: 0, tick: false, faded: false });

  it("ends at the wall's top edge with a tick where the line crosses it far enough under the chip", () => {
    // A level edge at y 140: the line from (300, 106) to (340, 306) meets it a fifth of the way down.
    expect(leadEnd(300, 106, 340, 276, 0, 140, 1000, 140, 8, out())).toEqual({ x: 308, y: 140, tick: true, faded: false });
    // A tilted edge (from y 120 at x 0 to 160 at x 400): straight down at x 200 it meets it at 140.
    const e = leadEnd(200, 100, 200, 300, 0, 120, 400, 160, 8, out());
    expect([e.x, e.y, e.tick]).toEqual([200, 140, true]);
  });

  it("fades the whole line to the head where the chip sits over the screens (the edge above it, or under it by less than the minimum)", () => {
    expect(leadEnd(300, 106, 340, 306, 0, 90, 1000, 90, 8, out())).toEqual({ x: 340, y: 306, tick: false, faded: true });
    expect(leadEnd(300, 106, 340, 306, 0, 110, 1000, 110, 8, out())).toEqual({ x: 340, y: 306, tick: false, faded: true });
    expect(LEAD.faded).toBeCloseTo(0.15, 6);
    expect(LEAD.opacity).toBeGreaterThan(LEAD.faded);
  });

  it("draws the whole line, unfaded, when the head stands above the edge or the wall is off the camera", () => {
    expect(leadEnd(300, 106, 340, 130, 0, 140, 1000, 140, 8, out())).toEqual({ x: 340, y: 130, tick: false, faded: false });
    expect(leadEnd(300, 106, 340, 306, NaN, NaN, NaN, NaN, 8, out())).toEqual({ x: 340, y: 306, tick: false, faded: false });
  });

  it("stops a line beside the wall at the wall-top level with a tick above the end Rover's head, like the others", () => {
    // The wall from x 400 to 1000, its top at y 140.
    const wall = [400, 140, 1000, 140] as const;
    // Straight down past its west end: a tick at the level, above the head.
    expect(leadEnd(300, 106, 320, 506, ...wall, 8, out())).toEqual({ x: 320, y: 140, tick: true, faded: false });
    // From past the west end toward a head under the wall's span (it used to run into the wall's side): the tick on the
    // wall's top above the head.
    expect(leadEnd(300, 106, 600, 406, ...wall, 8, out())).toEqual({ x: 600, y: 140, tick: true, faded: false });
    // A tilted level (from y 120 at x 400 to 160 at x 1000) extends past the wall's end: at x 1300 it is at 180.
    const e = leadEnd(1250, 100, 1300, 500, 400, 120, 1000, 160, 8, out());
    expect([e.x, e.tick, e.faded]).toEqual([1300, true, false]);
    expect(e.y).toBeCloseTo(180, 9);
    // A chip under the level beside the wall (a landscape phone's row past the wall's end): faded to the head.
    expect(leadEnd(300, 160, 330, 360, ...wall, 8, out())).toEqual({ x: 330, y: 360, tick: false, faded: true });
  });

  it("moves a tick beside the wall clear of the HUD boxes and inside the screen", () => {
    const wall = [400, 140, 1000, 140] as const;
    const hud = [
      { x0: 16, y0: 16, x1: 296, y1: 153 },
      { x0: 1205, y0: 100, x1: 1424, y1: 400 },
    ];
    const clear = LEAD.tick / 2 + LEAD.clear;
    // Under the profile card (left of centre): just right of it.
    expect(leadEnd(310, 106, 250, 406, ...wall, 8, out(), hud, 1440)).toEqual({ x: 296 + clear, y: 140, tick: true, faded: false });
    // Under the floor menu (right of centre): just left of it.
    expect(leadEnd(1190, 66, 1300, 406, ...wall, 8, out(), hud, 1440)).toEqual({ x: 1205 - clear, y: 140, tick: true, faded: false });
    // Past the screen's edge: inside it.
    expect(leadEnd(1400, 66, 1500, 406, ...wall, 8, out(), [], 1440).x).toBe(1440 - clear);
  });

  it("puts the tick where the line itself meets the level when asked (`above` false: the fallback past another chip)", () => {
    const wall = [400, 140, 1000, 140] as const;
    // From (300, 100) toward (340, 300): it meets y 140 a fifth of the way, at x 308.
    expect(leadEnd(300, 100, 340, 300, ...wall, 8, out(), [], 1440, false)).toEqual({ x: 308, y: 140, tick: true, faded: false });
    // On the wall it is the same crossing either way.
    expect(leadEnd(500, 100, 540, 300, ...wall, 8, out(), [], 1440, false)).toEqual(leadEnd(500, 100, 540, 300, ...wall, 8, out(), [], 1440));
  });

  it("never ends a line below the wall-top level: a tick at the level or faded where the chip sits over it", () => {
    const wall = [400, 120, 1000, 160] as const;
    const level = (x: number) => 120 + ((x - 400) * 40) / 600;
    for (const x of [100, 300, 380, 500, 700, 990, 1100, 1300])
      for (const hx of [80, 150, 380, 420, 700, 980, 1020, 1250, 1400])
        for (const hy of [200, 300, 500]) {
          const e = leadEnd(x, 66, hx, hy, ...wall, 8, out(), [], 1440);
          expect(e.faded, `${x} to ${hx}`).toBe(false);
          expect(e.tick, `${x} to ${hx}`).toBe(true);
          expect(e.y, `${x} to ${hx}`).toBeCloseTo(level(e.x), 6);
          expect(e.y, `${x} to ${hx}`).toBeLessThan(hy);
        }
  });
});
