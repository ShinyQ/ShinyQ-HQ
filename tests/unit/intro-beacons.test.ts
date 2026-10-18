import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InstancedBufferAttribute, PerspectiveCamera, Vector3 } from "three";
import { INTRO } from "@/experience/camera/intro";
import { stepBeacons } from "@/experience/intro/beacons";
import { beaconAlpha, INTRO_LANDMARKS } from "@/experience/intro/landmarks";
import { introRuntime, resetIntroRuntime } from "@/experience/intro/runtime";

const STATS = INTRO_LANDMARKS.findIndex((l) => l.id === "stats");
const stats = INTRO_LANDMARKS[STATS];

/** Straight down onto the stats landmark through a narrow lens: only it projects inside the pass window. */
function overStats(): PerspectiveCamera {
  const c = new PerspectiveCamera(20, 16 / 9, 0.1, 500);
  c.up.set(0, 0, -1);
  c.position.set(stats.x, stats.y + 40, stats.z);
  c.lookAt(stats.x, stats.y, stats.z);
  c.updateMatrixWorld();
  return c;
}

/** Looking straight up from under the floor: every landmark is behind the camera. */
function awayCamera(): PerspectiveCamera {
  const c = new PerspectiveCamera(50, 16 / 9, 0.1, 500);
  c.up.set(0, 0, -1);
  c.position.set(0, -5, 0);
  c.lookAt(0, -100, 0);
  c.updateMatrixWorld();
  return c;
}

let alpha: InstancedBufferAttribute;
let hits: (number | null)[];
const ndc = new Vector3();
const alphas = () => Array.from(alpha.array as Float32Array);
const step = (camera: PerspectiveCamera, t: number, active = true) => {
  introRuntime.active = active;
  introRuntime.t = t;
  stepBeacons(alpha, hits, camera, ndc);
};

beforeEach(() => {
  resetIntroRuntime();
  alpha = new InstancedBufferAttribute(new Float32Array(INTRO_LANDMARKS.length), 1);
  hits = INTRO_LANDMARKS.map(() => null);
});
afterEach(() => resetIntroRuntime());

describe("stepBeacons", () => {
  it("never latches before the wake ends, even with a landmark centered", () => {
    step(overStats(), INTRO.wake);
    expect(hits.every((h) => h === null)).toBe(true);
    expect(introRuntime.lit).toEqual([]);
    expect(alphas().every((a) => a === 0)).toBe(true);
  });

  it("latches nothing while every landmark is out of view", () => {
    step(awayCamera(), INTRO.wake + 1);
    expect(hits.every((h) => h === null)).toBe(true);
    expect(introRuntime.lit).toEqual([]);
  });

  it("latches a centered landmark once and lists its id once", () => {
    const camera = overStats();
    const t0 = INTRO.wake + 0.5;
    step(camera, t0);
    expect(hits[STATS]).toBe(t0);
    expect(introRuntime.lit).toEqual(["stats"]);
    expect(hits.filter((h) => h !== null)).toHaveLength(1);
    for (const t of [t0 + 0.2, t0 + 0.6, t0 + 1.4]) {
      step(camera, t);
      expect(hits[STATS]).toBe(t0);
      expect(alphas()[STATS]).toBeCloseTo(beaconAlpha(t - t0), 6);
    }
    expect(introRuntime.lit).toEqual(["stats"]);
    step(camera, t0 + 2.5);
    expect(alphas()[STATS]).toBe(0);
  });

  it("an inactive runtime clears the hits and zeroes the alphas, and a re-latch never duplicates the id", () => {
    const camera = overStats();
    step(camera, INTRO.wake + 0.5);
    step(camera, INTRO.wake + 0.8);
    expect(alphas()[STATS]).toBeGreaterThan(0);
    step(camera, -1, false);
    expect(hits.every((h) => h === null)).toBe(true);
    expect(alphas().every((a) => a === 0)).toBe(true);
    step(camera, INTRO.wake + 3);
    expect(hits[STATS]).toBe(INTRO.wake + 3);
    expect(introRuntime.lit).toEqual(["stats"]);
  });
});
