import { describe, expect, it } from "vitest";
import {
  baseElevation,
  followForward,
  followPose,
  forwardOf,
  INTRO_DURATION,
  INTRO_FLY,
  INTRO_ORBIT,
  INTRO_REDUCED,
  introFlyProgress,
  INTRO_SWEEP,
  introAngle,
  introPose,
  orbitOffset,
  PITCH_LIMITS,
  pitchRange,
  RAIL,
  railForward,
  railPose,
  railShift,
  reducedIntroPose,
  scrubSign,
  selectRig,
  springFactor,
} from "@/experience/camera/rigs";
import { sceneSettings } from "@/experience/scene/settings";

describe("camera rigs", () => {
  it("selects intro, rail on L2 and follow elsewhere", () => {
    expect(selectRig("boot", "L1")).toBe("intro");
    expect(selectRig("intro", "L1")).toBe("intro");
    expect(selectRig("explore", "L2")).toBe("rail");
    expect(selectRig("elevator", "L3")).toBe("follow");
    expect(selectRig("explore", "RF")).toBe("follow");
  });

  it("holds one still exterior shot for the reduced-motion intro", () => {
    const end = followPose("desktop", [14, 1, 10]);
    const still = reducedIntroPose("desktop", end);
    expect(still).toEqual(introPose("desktop", INTRO_ORBIT, end));
    expect(still.position[1]).toBeGreaterThan(end.position[1]);
  });

  it("uses the follow offsets per camera class", () => {
    expect(followPose("desktop", [0, 0, 0])).toEqual({ position: [16, 18, 16], target: [0, 0, 0], fov: 40 });
    expect(followPose("tablet", [1, 14, 2]).position).toEqual([17, 32, 18]);
    expect(followPose("mobile", [0, 0, 0]).fov).toBe(50);
  });

  it("applies yaw and zoom to the follow offset", () => {
    const yawed = followPose("desktop", [0, 0, 0], Math.PI / 2);
    expect(yawed.position[0]).toBeCloseTo(16);
    expect(yawed.position[2]).toBeCloseTo(-16);
    expect(followPose("desktop", [0, 0, 0], 0, 1.25).position[1]).toBeCloseTo(22.5);
  });

  it("places the rail camera beside the corridor", () => {
    expect(railPose("desktop", 10, 14)).toEqual({ position: [10, 36, 30], target: [14, 14, 0], fov: 40 });
    expect(railPose("mobile", 0, 0).position).toEqual([0, 26, 38]);
  });

  it("keeps the rail fixed inside the corridor and slides it into side rooms", () => {
    expect(railShift(0)).toBe(0);
    expect(railShift(3.9)).toBe(0);
    expect(railShift(-4)).toBe(0);
    expect(railShift(10)).toBe(6);
    expect(railShift(-19)).toBe(-15);
    expect(railPose("desktop", 10, 14, 1, 2)).toEqual(railPose("desktop", 10, 14));
    const inRoom = railPose("desktop", 10, 14, 1, -14);
    expect(inRoom.position[2]).toBe(30 - 10);
    expect(inRoom.target[2]).toBe(-10);
  });

  it("follows the road's axis on the meandering Career Road", () => {
    // Rover on the road 7 u south of the slab axis: the rail sits on the road, not 3 u off it.
    expect(railPose("desktop", 10, 14, 1, 7, 0, 7).target[2]).toBe(7);
    expect(railPose("desktop", 10, 14, 1, 7, 0, 7).position[2]).toBe(37);
    // Deep in a north room of that plaza: slides past the deadband from the road axis.
    expect(railPose("desktop", 10, 14, 1, -8, 0, 7).target[2]).toBe(-4);
  });

  it("orbits 120 degrees during the intro and lands on the follow pose", () => {
    const end = followPose("desktop", [0, 0, 6]);
    expect(introAngle(end, 1) - introAngle(end, 0)).toBeCloseTo(INTRO_SWEEP);
    const first = introPose("desktop", 0, end);
    expect(Math.hypot(first.position[0], first.position[2])).toBeCloseTo(70);
    const last = introPose("desktop", INTRO_DURATION, end);
    expect(last.position[0]).toBeCloseTo(end.position[0]);
    expect(last.position[1]).toBeCloseTo(end.position[1]);
    expect(last.target[2]).toBeCloseTo(6);
    expect(INTRO_DURATION).toBeCloseTo(INTRO_ORBIT + INTRO_FLY);
    // Reduced motion keeps today's length: a still shot, then a cut.
    expect(INTRO_REDUCED).toBeCloseTo(2.5);
  });

  it("flies in for 1.5 to 2 s on the arrival glide's eased curve, at rest at both ends", () => {
    expect(INTRO_FLY).toBeGreaterThanOrEqual(1.5);
    expect(INTRO_FLY).toBeLessThanOrEqual(2);
    expect(introFlyProgress(0)).toBe(-1);
    expect(introFlyProgress(INTRO_ORBIT - 0.01)).toBe(-1);
    expect(introFlyProgress(INTRO_ORBIT)).toBe(0);
    expect(introFlyProgress(INTRO_DURATION)).toBe(1);
    expect(introFlyProgress(INTRO_DURATION + 1)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const p = introFlyProgress(INTRO_ORBIT + (INTRO_FLY * i) / 100);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    const h = 1e-3;
    expect(introFlyProgress(INTRO_ORBIT + h) / h).toBeLessThan(0.01);
    expect((1 - introFlyProgress(INTRO_DURATION - h)) / h).toBeLessThan(0.01);
  });

  it("flies in on one continuous curve that lands behind the rover along the follow line", () => {
    for (const cls of ["desktop", "tablet", "mobile"] as const) {
      for (const end of [followPose(cls, [-6, 1, 8], -0.6, 1.7), followPose(cls, [4, 1, -3], 0.4, 1)]) {
        // One sample per 60 fps frame.
        const samples = Math.round(INTRO_DURATION * 60);
        const at = (i: number) => introPose(cls, (INTRO_DURATION * i) / samples, end).position;
        const from = introPose(cls, INTRO_ORBIT, end).position;
        const flyLength = Math.hypot(from[0] - end.position[0], from[1] - end.position[1], from[2] - end.position[2]);
        const top = Math.max(from[1], end.position[1]);
        for (let i = 1; i <= samples; i++) {
          const a = at(i - 1);
          const b = at(i);
          if ((INTRO_DURATION * i) / samples <= INTRO_ORBIT) continue;
          // No jump: at 60 fps no frame covers 5 percent of the fly-in (the old 0.6 s line peaked at 8 percent a frame).
          expect(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])).toBeLessThan(flyLength * 0.05);
          // It never climbs above the orbit's last height or the follow pose.
          expect(b[1]).toBeLessThanOrEqual(top + 1e-6);
        }
        const last = introPose(cls, INTRO_DURATION, end);
        last.position.forEach((v, i) => expect(v).toBeCloseTo(end.position[i]));
        last.target.forEach((v, i) => expect(v).toBeCloseTo(end.target[i]));
        // The last moves come in from behind the rover along the follow line (in plan view), not sideways.
        const near = introPose(cls, INTRO_DURATION - 0.05, end).position;
        const off = [end.position[0] - end.target[0], end.position[2] - end.target[2]];
        const move = [near[0] - end.position[0], near[2] - end.position[2]];
        expect((move[0] * off[0] + move[1] * off[1]) / (Math.hypot(move[0], move[1]) * Math.hypot(off[0], off[1]))).toBeGreaterThan(0.99);
      }
    }
  });

  it("smooths with a 0.18 s half-life spring", () => {
    expect(springFactor(0.18)).toBeCloseTo(0.5);
    expect(springFactor(0)).toBe(0);
  });

  it("derives the horizontal forward", () => {
    const f = forwardOf(followPose("desktop", [0, 0, 0]));
    expect(f.x).toBeCloseTo(-Math.SQRT1_2);
    expect(f.z).toBeCloseTo(-Math.SQRT1_2);
  });

  it("orbits a full turn and keeps the distance", () => {
    const base = followPose("desktop", [0, 0, 0]).position;
    const half = followPose("desktop", [0, 0, 0], Math.PI).position;
    expect(half[0]).toBeCloseTo(-16);
    expect(half[2]).toBeCloseTo(-16);
    const full = followPose("desktop", [0, 0, 0], Math.PI * 2).position;
    full.forEach((v, i) => expect(v).toBeCloseTo(base[i]));
  });

  it("raises and lowers the camera within the pitch limits", () => {
    const radius = Math.hypot(16, 18, 16);
    const up = followPose("desktop", [0, 0, 0], 0, 1, 0.3).position;
    const down = followPose("desktop", [0, 0, 0], 0, 1, -0.3).position;
    expect(up[1]).toBeGreaterThan(18);
    expect(down[1]).toBeLessThan(18);
    expect(Math.hypot(...up)).toBeCloseTo(radius);
    const top = followPose("desktop", [0, 0, 0], 0, 1, 5).position;
    expect(Math.asin(top[1] / radius)).toBeCloseTo(PITCH_LIMITS[1]);
    const low = followPose("desktop", [0, 0, 0], 0, 1, -5).position;
    expect(Math.asin(low[1] / radius)).toBeCloseTo(PITCH_LIMITS[0]);
  });

  it("orbits the rail camera all the way around the rover, look-ahead included", () => {
    const pose = railPose("desktop", 10, 14, 1, 0, Math.PI / 6);
    expect(pose.position[0]).toBeCloseTo(10 + 15);
    expect(pose.position[2]).toBeCloseTo(30 * Math.cos(Math.PI / 6));
    expect(pose.target[0]).toBeCloseTo(10 + 4 * Math.cos(Math.PI / 6));
    expect(pose.target[2]).toBeCloseTo(-4 * Math.sin(Math.PI / 6));
    const behind = railPose("desktop", 10, 14, 1, 0, Math.PI);
    expect(behind.position[2]).toBeCloseTo(-30);
    expect(behind.target[0]).toBeCloseTo(6);
  });

  it("runs the rail look-ahead into the screen when asked, so a camera behind the rover centers it", () => {
    // Default: the look-ahead stays to the screen's right at any yaw.
    expect(railPose("desktop", 10, 14, 1, 0, Math.PI / 6, 0, 0, false)).toEqual(railPose("desktop", 10, 14, 1, 0, Math.PI / 6));
    // Side view (yaw 0): into the screen is north, so the target moves from east of the rover to north of it.
    const side = railPose("desktop", 10, 14, 1, 0, 0, 0, 0, true);
    expect(side.position).toEqual(railPose("desktop", 10, 14).position);
    expect(side.target[0]).toBeCloseTo(10);
    expect(side.target[2]).toBeCloseTo(-4);
    // Behind the rover (due west, looking east): the target sits on the line through the camera and the rover.
    const yaw = -Math.PI / 2;
    const behind = railPose("desktop", 10, 14, 1, 2, yaw, 2, 0, true);
    expect(behind.position).toEqual(railPose("desktop", 10, 14, 1, 2, yaw, 2, 0).position);
    expect(behind.target[0]).toBeCloseTo(10 + 4);
    expect(behind.target[2]).toBeCloseTo(2);
    expect(behind.position[2]).toBeCloseTo(2);
    const f = railForward(yaw);
    expect(behind.target[0] - 10).toBeCloseTo(4 * f.x);
    expect(behind.target[2] - 2).toBeCloseTo(4 * f.z);
  });

  it("tilts the rail camera within the pitch limits and keeps the side view at pitch 0", () => {
    const radius = Math.hypot(RAIL.desktop.y, RAIL.desktop.z);
    const low = railPose("desktop", 0, 0, 1, 0, 0, 0, -5);
    expect(Math.asin(low.position[1] / radius)).toBeCloseTo(PITCH_LIMITS[0]);
    const high = railPose("desktop", 0, 0, 1, 0, 0, 0, 5);
    expect(Math.asin(high.position[1] / radius)).toBeCloseTo(PITCH_LIMITS[1]);
    expect(railPose("desktop", 10, 14, 1, 0, 0, 0, 0)).toEqual(railPose("desktop", 10, 14));
  });
});

describe("round 5 orbit limits", () => {
  it("keeps the default offsets exactly", () => {
    expect(orbitOffset([16, 18, 16], 0, 0)).toEqual([16, 18, 16]);
    expect(orbitOffset([0, 22, 30], 0, 0)).toEqual([0, 22, 30]);
  });

  it("tilts from just above the floor to near top-down on every rig and class", () => {
    expect(PITCH_LIMITS[0]).toBeGreaterThan(0);
    expect(PITCH_LIMITS[0]).toBeLessThan(0.1);
    expect(PITCH_LIMITS[1]).toBeGreaterThan(1.4);
    expect(PITCH_LIMITS[1]).toBeLessThan(Math.PI / 2);
    for (const cls of ["desktop", "tablet", "mobile"] as const) {
      for (const rig of ["follow", "rail"] as const) {
        const [lo, hi] = pitchRange(cls, rig);
        expect(baseElevation(cls, rig) + lo).toBeCloseTo(PITCH_LIMITS[0]);
        expect(baseElevation(cls, rig) + hi).toBeCloseTo(PITCH_LIMITS[1]);
        expect(lo).toBeLessThan(0);
        expect(hi).toBeGreaterThan(0);
      }
    }
  });

  it("gives the follow forward of a yaw without building a pose", () => {
    for (const yaw of [0, 0.7, Math.PI / 4, Math.PI, -2]) {
      const f = followForward("desktop", yaw);
      const g = forwardOf(followPose("desktop", [0, 0, 0], yaw));
      expect(f.x).toBeCloseTo(g.x);
      expect(f.z).toBeCloseTo(g.z);
    }
    // A quarter-turn step to the right looks west (-x).
    expect(followForward("desktop", Math.PI / 4).x).toBeCloseTo(-1);
  });

  it("steers the rail along the view and flips scrubs when the view is turned around", () => {
    expect(railForward(0).x).toBeCloseTo(0);
    expect(railForward(0).z).toBeCloseTo(-1);
    expect(railForward(Math.PI).z).toBeCloseTo(1);
    expect(scrubSign(0)).toBe(1);
    expect(scrubSign(0.5)).toBe(1);
    expect(scrubSign(Math.PI)).toBe(-1);
    expect(scrubSign(2 * Math.PI + 0.2)).toBe(1);
  });

  it("adds a first-person fog without changing the third-person ranges", () => {
    expect(sceneSettings("lite", "follow").fog).toMatchObject({ near: 38, far: 80 });
    expect(sceneSettings("lite", "rail").fog).toMatchObject({ near: 40, far: 95 });
    expect(sceneSettings("lite", "first").fog).toMatchObject({ near: 14, far: 64 });
  });
});
