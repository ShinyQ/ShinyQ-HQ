import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { idleRuntime } from "@/experience/scene/framePacer";
import { IDLE_AFTER_MS, idleCadence, observeFrame, resetIdle, sceneBusy, type MotionState, type RoverMotion } from "@/experience/scene/idle";

const NOW = 10_000;
const quiet = { enabled: true, lastActivity: 0, stillSince: 0 };
const FLOORS = ["B1", "L1", "L2", "L3", "L4", "RF"] as const;

describe("idleCadence", () => {
  it("full motion: 30 fps on L2 and B1; 60 where parked views show motion that judders at 30 fps", () => {
    expect(FLOORS.map((f) => idleCadence(quiet, NOW, false, f))).toEqual([30, 60, 30, 60, 60, 60]);
  });

  it("reduced motion: on demand, 30 fps on L1 (the hologram's slow spin)", () => {
    expect(FLOORS.map((f) => idleCadence(quiet, NOW, true, f))).toEqual([0, 30, 0, 0, 0, 0]);
  });

  it("stays at 60 for IDLE_AFTER_MS after input or motion, and when disabled", () => {
    expect(idleCadence({ ...quiet, lastActivity: NOW - IDLE_AFTER_MS + 1 }, NOW, true, "L2")).toBe(60);
    expect(idleCadence({ ...quiet, stillSince: NOW - IDLE_AFTER_MS + 1 }, NOW, true, "L2")).toBe(60);
    expect(idleCadence({ ...quiet, lastActivity: NOW - IDLE_AFTER_MS }, NOW, true, "L2")).toBe(0);
    expect(idleCadence({ ...quiet, enabled: false }, NOW, true, "L2")).toBe(60);
  });
});

const state = (over: Partial<MotionState> = {}): MotionState => ({ phase: "explore", ride: null, beam: null, mission: null, reducedMotion: false, ...over });
const rover = (over: Partial<RoverMotion> = {}): RoverMotion => ({ face: "idle", status: undefined, idle: null, ...over });

describe("sceneBusy", () => {
  it("is false for a parked rover in explore, a room or the hologram", () => {
    for (const phase of ["explore", "room", "hologram"]) expect(sceneBusy(state({ phase }), rover())).toBe(false);
  });

  it.each([
    ["the boot", state({ phase: "boot" }), rover()],
    ["the intro", state({ phase: "intro" }), rover()],
    ["a ride", state({ ride: {} }), rover()],
    ["a beam", state({ beam: {} }), rover()],
    ["a running mission", state({ mission: { status: "running" } }), rover()],
    ["the arrived face (and its flag)", state(), rover({ face: "arrived" })],
    ["the thinking face", state(), rover({ face: "thinking" })],
    ["a driving face", state(), rover({ face: "driving" })],
    ["a status line", state(), rover({ status: "hello" })],
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
  it("restarts the still timer when the scene is busy or the camera moves (a moving rover moves the follow camera)", () => {
    const cam = camera();
    resetIdle(0);
    observeFrame(cam, false, 100);
    expect(idleRuntime.stillSince, "the first frame after a reset counts as motion").toBe(100);
    observeFrame(cam, false, 200);
    expect(idleRuntime.stillSince).toBe(100);
    observeFrame(cam, true, 300);
    expect(idleRuntime.stillSince).toBe(300);
    cam.position.x += 0.01;
    cam.updateMatrixWorld();
    observeFrame(cam, false, 400);
    expect(idleRuntime.stillSince).toBe(400);
    cam.rotation.y += 0.01;
    cam.updateMatrixWorld();
    observeFrame(cam, false, 500);
    expect(idleRuntime.stillSince, "an orbit step").toBe(500);
    observeFrame(cam, false, 600);
    expect(idleRuntime.stillSince).toBe(500);
  });
});
