import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { faceWakeAt } from "@/experience/rover/faces";
import { createIdleState, IDLE_SEQUENCES, idleWakeAt, stepIdle } from "@/experience/rover/idle";
import { IDLE_AFTER_MS, IDLE_CADENCE, idleCadence, idleRuntime, idleState, observeFrame, resetIdle, sceneBusy, type MotionState, type RoverMotion } from "@/experience/scene/idle";

const NOW = 10_000;
const quiet = { enabled: true, lastActivity: 0, stillSince: 0 };

describe("idleCadence", () => {
  it("full motion: 30 fps on L2 and B1; 60 where parked views show motion that judders at 30 fps", () => {
    expect(idleCadence(quiet, NOW, false, "L2")).toBe(30);
    expect(idleCadence(quiet, NOW, false, "B1")).toBe(30);
    for (const floor of ["L1", "L3", "L4", "RF"] as const) expect(idleCadence(quiet, NOW, false, floor)).toBe(60);
  });

  it("reduced motion: on demand, 30 fps on L1 (the hologram's slow spin)", () => {
    for (const floor of ["B1", "L2", "L3", "L4", "RF"] as const) expect(idleCadence(quiet, NOW, true, floor)).toBe(0);
    expect(idleCadence(quiet, NOW, true, "L1")).toBe(30);
  });

  it("stays at 60 for IDLE_AFTER_MS after input or motion, and when disabled", () => {
    expect(idleCadence({ ...quiet, lastActivity: NOW - IDLE_AFTER_MS + 1 }, NOW, true, "L2")).toBe(60);
    expect(idleCadence({ ...quiet, stillSince: NOW - IDLE_AFTER_MS + 1 }, NOW, true, "L2")).toBe(60);
    expect(idleCadence({ ...quiet, lastActivity: NOW - IDLE_AFTER_MS }, NOW, true, "L2")).toBe(0);
    expect(idleCadence({ ...quiet, enabled: false }, NOW, true, "L2")).toBe(60);
    expect(idleState(quiet, NOW, false, "L2")).toBe(true);
    expect(idleState(quiet, NOW, false, "L1")).toBe(false);
  });

  it("covers every floor in both motion settings", () => {
    for (const motion of ["full", "reduced"] as const) expect(Object.keys(IDLE_CADENCE[motion]).sort()).toEqual(["B1", "L1", "L2", "L3", "L4", "RF"]);
  });
});

const state = (over: Partial<MotionState> = {}): MotionState => ({ phase: "explore", ride: null, beam: null, mission: null, reducedMotion: false, ...over });
const rover = (over: Partial<RoverMotion> = {}): RoverMotion => ({ speed: 0, driving: false, autopilot: null, boost: 0, idle: null, ...over });

describe("sceneBusy", () => {
  it("is false for a parked rover in explore, a room or the hologram", () => {
    for (const phase of ["explore", "room", "hologram"]) expect(sceneBusy(state({ phase }), rover())).toBe(false);
  });

  it.each([
    ["the boot", state({ phase: "boot" }), rover()],
    ["the intro", state({ phase: "intro" }), rover()],
    ["an elevator ride", state({ phase: "elevator" }), rover()],
    ["a ride record", state({ ride: {} }), rover()],
    ["a beam", state({ beam: {} }), rover()],
    ["autopilot", state({ phase: "autopilot" }), rover()],
    ["a running mission", state({ mission: { status: "running" } }), rover()],
    ["a drive", state(), rover({ speed: 2 })],
    ["a path drive", state(), rover({ driving: true })],
    ["an autopilot request", state(), rover({ autopilot: {} })],
    ["a boost", state(), rover({ boost: 0.4 })],
    ["an idle look", state(), rover({ idle: "look" })],
    ["an idle spin", state(), rover({ idle: "spin" })],
    ["an idle hop", state(), rover({ idle: "hop" })],
  ])("is true during %s", (_, s, r) => {
    expect(sceneBusy(s, r)).toBe(true);
  });

  it("an idle blink does not need 60 fps, nor a finished mission; reduced motion keeps only blinks", () => {
    expect(sceneBusy(state(), rover({ idle: "blink" }))).toBe(false);
    expect(sceneBusy(state({ mission: { status: "done" } }), rover())).toBe(false);
    expect(sceneBusy(state({ reducedMotion: true }), rover({ idle: "look" }))).toBe(false);
  });
});

function camera() {
  const c = new PerspectiveCamera(50, 16 / 9, 0.1, 200);
  c.position.set(0, 10, 10);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  return c;
}

describe("observeFrame", () => {
  it("restarts the still timer when the scene is busy or the camera or the rover moves", () => {
    const cam = camera();
    const pose = [0, 0, 0, 0];
    resetIdle(0);
    observeFrame(cam, pose, false, 100);
    expect(idleRuntime.stillSince, "the first frame after a reset counts as motion").toBe(100);
    observeFrame(cam, pose, false, 200);
    expect(idleRuntime.stillSince).toBe(100);
    observeFrame(cam, [0.5, 0, 0, 0], false, 300);
    expect(idleRuntime.stillSince).toBe(300);
    observeFrame(cam, [0.5, 0, 0, 0.2], false, 350);
    expect(idleRuntime.stillSince, "a turn on the spot").toBe(350);
    observeFrame(cam, [0.5, 0, 0, 0.2], true, 400);
    expect(idleRuntime.stillSince).toBe(400);
    cam.position.x += 0.01;
    cam.updateMatrixWorld();
    observeFrame(cam, [0.5, 0, 0, 0.2], false, 500);
    expect(idleRuntime.stillSince).toBe(500);
    cam.fov = 52;
    cam.updateProjectionMatrix();
    observeFrame(cam, [0.5, 0, 0, 0.2], false, 600);
    expect(idleRuntime.stillSince, "a zoom or field of view kick").toBe(600);
    observeFrame(cam, [0.5, 0, 0, 0.2], false, 700);
    expect(idleRuntime.stillSince).toBe(600);
  });
});

describe("on-demand wakes", () => {
  it("the rover idle machine asks for a frame at its start, its next step and its end", () => {
    const s = createIdleState();
    expect(idleWakeAt(s)).toBe(Number.POSITIVE_INFINITY);
    const input = { t: 0, seq: 0, eligible: true, reduced: true, delay: 15, random: () => 0 };
    stepIdle(s, input);
    expect(idleWakeAt(s)).toBe(15);
    stepIdle(s, { ...input, t: 15 });
    const steps = IDLE_SEQUENCES[s.active];
    expect(idleWakeAt(s)).toBe(15 + steps[s.next].at);
  });

  it("animated faces ask for their next frame; still faces never", () => {
    expect(faceWakeAt("thinking", 1.1)).toBeCloseTo(4 / 3, 9);
    expect(faceWakeAt("boot", 0.1)).toBeCloseTo(0.2, 9);
    expect(faceWakeAt("idle", 3)).toBe(Number.POSITIVE_INFINITY);
  });
});
