import { describe, expect, it } from "vitest";
import {
  ARRIVAL_GLIDE,
  ARRIVAL_HEADING,
  cameraBehindHeading,
  glidePose,
  glideProgress,
  LOOK_EAST_YAW,
  type GlideInput,
  railYawBehind,
  shaftClearZoom,
  SHAFT_CLEAR_X,
  shoulderPose,
  stepGlide,
} from "@/experience/camera/arrival";
import { followOffsetScale } from "@/experience/camera/offset";
import {
  createOrbitState,
  nearestAngle,
  primeZone,
  resetView,
  rotate,
  rotateStep,
  stepOrbit,
  updateZone,
  wrapPi,
  type OrbitState,
  type ViewZone,
} from "@/experience/camera/orbit";
import { FOLLOW_LOOK_AHEAD, followForward, followPose, railPose, type CameraPose, type Vec3 } from "@/experience/camera/rigs";
import { SHAFT_EAST_FACE } from "@/experience/config";
import type { ViewportClass } from "@/experience/types";

const CLASSES: readonly ViewportClass[] = ["desktop", "tablet", "mobile"];
const ASPECTS = [16 / 9, 4 / 3, 1, 9 / 19.5];

describe("shoulderPose", () => {
  const rover: Vec3 = [-18, 3, 4];
  const pose = shoulderPose(rover, ARRIVAL_HEADING, 40);

  it("sits behind, above and a little to the right of an east-heading rover", () => {
    const { back, up, side } = ARRIVAL_GLIDE.start;
    expect(pose.position[0]).toBeCloseTo(rover[0] - back);
    expect(pose.position[1]).toBeCloseTo(rover[1] + up);
    expect(pose.position[2]).toBeCloseTo(rover[2] + side);
    expect(pose.fov).toBe(40);
  });

  it("looks along the heading, slightly above the floor", () => {
    const { look, lookUp } = ARRIVAL_GLIDE.start;
    expect(pose.target[0]).toBeCloseTo(rover[0] + look);
    expect(pose.target[1]).toBeCloseTo(rover[1] + lookUp);
    expect(pose.target[2]).toBeCloseTo(rover[2]);
  });

  it("follows any heading (north is +z)", () => {
    const north = shoulderPose([0, 0, 0], 0, 40);
    expect(north.position[2]).toBeCloseTo(-ARRIVAL_GLIDE.start.back);
    expect(north.position[0]).toBeCloseTo(-ARRIVAL_GLIDE.start.side);
    expect(north.target[2]).toBeCloseTo(ARRIVAL_GLIDE.start.look);
  });
});

describe("glideProgress", () => {
  it("runs 0 to 1 over the glide duration and stays there", () => {
    expect(glideProgress(0)).toBe(0);
    expect(glideProgress(-1)).toBe(0);
    expect(glideProgress(ARRIVAL_GLIDE.duration)).toBe(1);
    expect(glideProgress(ARRIVAL_GLIDE.duration + 5)).toBe(1);
    expect(glideProgress(ARRIVAL_GLIDE.duration / 2)).toBeCloseTo(0.5);
  });

  it("is monotonic", () => {
    let last = -1;
    for (let t = 0; t <= 2; t += 0.05) {
      const p = glideProgress(t);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
  });
});

describe("stepGlide", () => {
  const DT = 1 / 60;
  /** A plain frame after the ride ended: no ride, no input, the rover parked. */
  const frame = (over: Partial<GlideInput> = {}): GlideInput => ({
    dt: DT,
    stage: null,
    prevStage: null,
    to: null,
    reduced: false,
    hasZone: false,
    interrupted: false,
    rollingOn: false,
    ...over,
  });
  const opening = (over: Partial<GlideInput> = {}) => frame({ stage: "opening", prevStage: "moving", to: "L3", hasZone: true, ...over });

  it("starts at 0 toward the destination when the doors start to open", () => {
    expect(stepGlide(null, opening())).toEqual({ glide: { t: 0, to: "L3" }, started: true });
  });

  it("does not start under reduced motion, without an arrival zone or while the doors stay open", () => {
    expect(stepGlide(null, opening({ reduced: true }))).toEqual({ glide: null, started: false });
    expect(stepGlide(null, opening({ hasZone: false }))).toEqual({ glide: null, started: false });
    expect(stepGlide(null, opening({ prevStage: "opening" }))).toEqual({ glide: null, started: false });
    expect(stepGlide(null, frame()).glide).toBeNull();
  });

  it("advances by dt through the doors and past the ride's end", () => {
    let glide = stepGlide(null, opening()).glide;
    glide = stepGlide(glide, frame({ stage: "opening", prevStage: "opening", to: "L3" })).glide;
    expect(glide?.t).toBeCloseTo(DT);
    glide = stepGlide(glide, frame({ stage: "exiting", prevStage: "opening", to: "L3" })).glide;
    glide = stepGlide(glide, frame({ prevStage: "exiting", rollingOn: true })).glide;
    expect(glide).toEqual({ t: expect.closeTo(3 * DT, 9), to: "L3" });
    expect(glideProgress(glide!.t)).toBeGreaterThan(0);
    expect(glideProgress(glide!.t)).toBeLessThan(1);
  });

  it("draws one frame at full progress, then ends once the rover is parked", () => {
    const full = stepGlide({ t: ARRIVAL_GLIDE.duration - DT / 2, to: "L3" }, frame()).glide;
    expect(full).not.toBeNull();
    expect(glideProgress(full!.t)).toBe(1);
    expect(stepGlide(full, frame())).toEqual({ glide: null, started: false });
  });

  it("holds at full progress while the rover still rolls on, then ends when it stops", () => {
    let glide: ReturnType<typeof stepGlide>["glide"] = { t: ARRIVAL_GLIDE.duration, to: "L4" };
    for (let i = 0; i < 120; i++) {
      glide = stepGlide(glide, frame({ rollingOn: true })).glide;
      expect(glide).not.toBeNull();
      expect(glideProgress(glide!.t)).toBe(1);
    }
    expect(stepGlide(glide, frame()).glide).toBeNull();
  });

  it("ends at once on input, a beam, a room or the hologram (one interrupted flag), even while rolling on", () => {
    const mid = { t: 0.4, to: "L2" as const };
    expect(stepGlide(mid, frame({ interrupted: true })).glide).toBeNull();
    expect(stepGlide({ t: ARRIVAL_GLIDE.duration, to: "L2" }, frame({ interrupted: true, rollingOn: true })).glide).toBeNull();
    expect(stepGlide(null, opening({ interrupted: true }))).toEqual({ glide: null, started: true });
  });

  it("ends at once when a new ride starts (driving to the door or boarding)", () => {
    const mid = { t: 0.4, to: "RF" as const };
    expect(stepGlide(mid, frame({ stage: "toDoor", to: "L1", rollingOn: true })).glide).toBeNull();
    expect(stepGlide(mid, frame({ stage: "boarding", prevStage: "toDoor", to: "L1" })).glide).toBeNull();
  });

  it("does not change the state it is given", () => {
    const state = { t: 0.2, to: "L3" as const };
    stepGlide(state, frame());
    expect(state).toEqual({ t: 0.2, to: "L3" });
  });
});

describe("glidePose", () => {
  const a: CameraPose = { position: [0, 0, 0], target: [10, 0, 0], fov: 30 };
  const b: CameraPose = { position: [-10, 20, 4], target: [0, 2, 0], fov: 50 };

  it("is the start at 0 and the end at 1", () => {
    expect(glidePose(a, b, 0)).toEqual(a);
    expect(glidePose(a, b, 1)).toEqual(b);
  });

  it("mixes position, target and fov", () => {
    const m = glidePose(a, b, 0.5);
    expect(m.position).toEqual([-5, 10, 2]);
    expect(m.target).toEqual([5, 1, 0]);
    expect(m.fov).toBe(40);
  });
});

describe("cameraBehindHeading", () => {
  it("is east (PI / 2) for a camera due west of the rover", () => {
    expect(cameraBehindHeading([-30, 10, 2], [-20, 0, 2])).toBeCloseTo(Math.PI / 2);
  });

  it("matches the heading convention (forward is sin, cos)", () => {
    expect(cameraBehindHeading([0, 5, -3], [0, 0, 0])).toBeCloseTo(0);
    expect(cameraBehindHeading([3, 5, 0], [0, 0, 0])).toBeCloseTo(-Math.PI / 2);
  });

  it("round trips a shoulder pose to the heading, off only by the shoulder's side offset", () => {
    const { back, side } = ARRIVAL_GLIDE.start;
    for (const heading of [-2.5, 0, 1.1, ARRIVAL_HEADING, 3]) {
      const pose = shoulderPose([5, 0, 5], heading, 40);
      const deviation = wrapPi(cameraBehindHeading(pose.position, [5, 0, 5]) - heading);
      expect(Math.abs(deviation)).toBeLessThanOrEqual(Math.atan2(side, back) + 1e-9);
      expect(Math.abs(deviation)).toBeCloseTo(Math.atan2(side, back), 9);
    }
  });
});

describe("railYawBehind", () => {
  it("puts the rail camera due west of the rover", () => {
    expect(railYawBehind()).toBeCloseTo(-Math.PI / 2);
    const pose = railPose("desktop", -10, 0, 1, 0, railYawBehind(), 0);
    expect(pose.position[0]).toBeLessThan(-10);
    expect(pose.position[2]).toBeCloseTo(0, 6);
  });
});

describe("shaftClearZoom", () => {
  /** The settled arrival camera built the way CameraDirector does. */
  const cameraX = (cls: ViewportClass, aspect: number, rig: "follow" | "rail", x: number, zoom: number) => {
    if (rig === "rail") return railPose(cls, x, 0, zoom, 0, railYawBehind(), 0).position[0];
    const forward = followForward(cls, LOOK_EAST_YAW);
    const ahead = FOLLOW_LOOK_AHEAD[cls];
    return followPose(cls, [x + forward.x * ahead, 1, forward.z * ahead], LOOK_EAST_YAW, zoom * followOffsetScale(cls, aspect)).position[0];
  };

  it("keeps the limit 1.5 u east of the shaft", () => {
    expect(SHAFT_CLEAR_X).toBe(SHAFT_EAST_FACE + 1.5);
  });

  for (const rig of ["follow", "rail"] as const) {
    it(`puts the ${rig} camera exactly at the limit at the returned zoom`, () => {
      for (const cls of CLASSES)
        for (const aspect of ASPECTS)
          for (const x of [-22, -18, -12, 0]) {
            const zoom = shaftClearZoom(cls, aspect, rig, x);
            expect(zoom).toBeGreaterThan(0);
            expect(cameraX(cls, aspect, rig, x, zoom), `${rig} ${cls} ${aspect} ${x}`).toBeCloseTo(SHAFT_CLEAR_X, 6);
            expect(cameraX(cls, aspect, rig, x, zoom * 0.9)).toBeGreaterThan(SHAFT_CLEAR_X);
            expect(cameraX(cls, aspect, rig, x, zoom * 1.1)).toBeLessThan(SHAFT_CLEAR_X);
          }
    });
  }

  it("allows a larger zoom the further east the rover is", () => {
    expect(shaftClearZoom("desktop", 16 / 9, "follow", -10)).toBeGreaterThan(shaftClearZoom("desktop", 16 / 9, "follow", -18));
  });
});

describe("rail-aware view zones", () => {
  const zone: ViewZone = { id: "L2:plaza", area: { minX: 0, maxX: 10, minZ: -5, maxZ: 5 }, yaw: 0, railYaw: -Math.PI / 2 };
  const plain: ViewZone = { id: "L2:plain", area: { minX: 20, maxX: 30, minZ: -5, maxZ: 5 }, yaw: 0 };
  const settle = (s: OrbitState) => {
    for (let i = 0; i < 240; i++) stepOrbit(s, 1 / 60, false);
  };

  it("primes the rail yaw at once on the rail rig", () => {
    const s = createOrbitState();
    primeZone(s, zone, "desktop", true);
    expect(s.railYaw).toBe(zone.railYaw);
    expect(s.railYawTarget).toBe(zone.railYaw);
    expect(s.zoneRailYaw).toBe(zone.railYaw);
  });

  it("leaves the rail yaw alone when not on the rail or without a rail yaw", () => {
    const s = createOrbitState();
    s.railYaw = s.railYawTarget = 0.4;
    primeZone(s, zone, "desktop");
    expect(s.railYaw).toBe(0.4);
    expect(s.zoneRailYaw).toBeNull();
    primeZone(s, plain, "desktop", true);
    expect(s.railYaw).toBe(0.4);
    expect(s.zoneRailYaw).toBeNull();
  });

  it("eases the rail in on entering and back to the side view on leaving", () => {
    const s = createOrbitState();
    updateZone(s, zone, false, "desktop", true);
    expect(s.zoneRailYaw).toBe(zone.railYaw);
    expect(s.railYawTarget).toBeCloseTo(zone.railYaw!);
    expect(s.easing).toBe(true);
    settle(s);
    expect(s.railYaw).toBeCloseTo(zone.railYaw!);

    updateZone(s, null, false, "desktop", true);
    expect(s.zoneRailYaw).toBeNull();
    expect(s.railYawTarget).toBeCloseTo(0);
    settle(s);
    expect(s.railYaw).toBeCloseTo(0);
  });

  it("eases back to the side view when moving straight into a zone without a rail yaw", () => {
    const s = createOrbitState();
    updateZone(s, zone, false, "desktop", true);
    settle(s);
    updateZone(s, plain, false, "desktop", true);
    expect(s.zoneRailYaw).toBeNull();
    settle(s);
    expect(s.railYaw).toBeCloseTo(0);
  });

  it("takes the nearest way round when the visitor has turned the rail", () => {
    const s = createOrbitState();
    s.railYaw = s.railYawTarget = 2 * Math.PI - 0.3;
    updateZone(s, zone, false, "desktop", true);
    expect(s.railYawTarget).toBeCloseTo(nearestAngle(zone.railYaw!, 2 * Math.PI - 0.3));
    expect(Math.abs(s.railYawTarget - s.railYaw)).toBeLessThan(Math.PI);
    updateZone(s, null, false, "desktop", true);
    expect(s.railYawTarget).toBeCloseTo(2 * Math.PI);
  });

  it("does nothing to the rail on the follow rig", () => {
    const s = createOrbitState();
    updateZone(s, zone, false, "desktop");
    expect(s.railYawTarget).toBe(0);
    expect(s.zoneRailYaw).toBeNull();
  });

  it("skips the rail yaw under reduced motion, in first person and where the visitor rotated", () => {
    const reduced = createOrbitState();
    updateZone(reduced, zone, true, "desktop", true);
    expect(reduced.zoneRailYaw).toBeNull();
    expect(reduced.railYawTarget).toBe(0);

    const first = createOrbitState();
    first.firstPerson = true;
    updateZone(first, zone, false, "desktop", true);
    expect(first.zoneRailYaw).toBeNull();

    const hand = createOrbitState();
    hand.suppressedZone = zone.id;
    updateZone(hand, zone, false, "desktop", true);
    expect(hand.zoneRailYaw).toBeNull();
    expect(hand.railYawTarget).toBe(0);
  });

  it("keeps the angle the visitor chose by hand inside the zone", () => {
    const s = createOrbitState();
    updateZone(s, zone, false, "desktop", true);
    settle(s);
    rotate(s, 0.5, 0, true);
    expect(s.zoneRailYaw).toBeNull();
    const kept = s.railYaw;
    updateZone(s, null, false, "desktop", true);
    settle(s);
    expect(s.railYaw).toBeCloseTo(kept);
  });

  it("drops the zone rail yaw after an eased step or a reset", () => {
    const step = createOrbitState();
    updateZone(step, zone, false, "desktop", true);
    rotateStep(step, 1, true);
    expect(step.zoneRailYaw).toBeNull();

    const reset = createOrbitState();
    updateZone(reset, zone, false, "desktop", true);
    resetView(reset);
    expect(reset.zoneRailYaw).toBeNull();
  });

  it("a follow-rig rotation inside the zone does not clear the rail zone", () => {
    const s = createOrbitState();
    updateZone(s, zone, false, "desktop", true);
    rotate(s, 0.2, 0, false);
    expect(s.zoneRailYaw).toBe(zone.railYaw);
  });
});
