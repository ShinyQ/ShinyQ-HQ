import { describe, expect, it } from "vitest";
import { FIRST_PERSON_FOV } from "@/experience/camera/firstPerson";
import { followOffsetScale } from "@/experience/camera/offset";
import { FOLLOW, FOLLOW_LOOK_AHEAD, followPose, HOLOGRAM_RIG, RAIL, railPose } from "@/experience/camera/rigs";
import { skyAzimuth } from "@/experience/sky/dayNight";
import { cameraClass, phoneCamera } from "@/lib/viewport";

/**
 * The landscape phone camera class (spec 2026-10-29): landscape phones get their own rig, closer than the tablet one they
 * used before and aimed a little higher (`lift`), held to the same reading rule as portrait phones
 * (`tests/unit/phone-reading.test.ts`). Every other class keeps its values.
 */
describe("the landscape phone camera class", () => {
  it("is the class of phones held sideways only", () => {
    for (const [w, h] of [[844, 390], [667, 375], [932, 430], [740, 360]]) expect(cameraClass(w, h), `${w}x${h}`).toBe("landscape");
    expect(cameraClass(390, 844)).toBe("mobile");
    expect(cameraClass(1194, 834)).toBe("desktop");
    expect(cameraClass(960, 640)).toBe("tablet");
  });

  it("uses the phone type sizes on both phone classes", () => {
    expect(["mobile", "landscape", "tablet", "desktop"].map((c) => phoneCamera(c as never))).toEqual([true, true, false, false]);
  });

  it("stands closer than the tablet rig along the same direction, with the same FOV and look-ahead", () => {
    const t = FOLLOW.tablet;
    const l = FOLLOW.landscape;
    expect(l.fov).toBe(t.fov);
    const k = Math.hypot(...l.offset) / Math.hypot(...t.offset);
    expect(k).toBeCloseTo(0.7, 6);
    l.offset.forEach((v, i) => expect(v / t.offset[i]).toBeCloseTo(k, 9));
    expect(FOLLOW_LOOK_AHEAD.landscape).toBe(FOLLOW_LOOK_AHEAD.tablet);
    expect(RAIL.landscape.y / RAIL.tablet.y).toBeCloseTo(RAIL.landscape.z / RAIL.tablet.z, 2);
    expect(followOffsetScale("landscape", 844 / 390)).toBe(1);
    expect([HOLOGRAM_RIG.landscape, FIRST_PERSON_FOV.landscape, skyAzimuth("landscape")]).toEqual([HOLOGRAM_RIG.tablet, FIRST_PERSON_FOV.tablet, skyAzimuth("tablet")]);
  });

  it("lifts only the landscape look target, scaled by the zoom", () => {
    for (const cls of ["desktop", "tablet", "mobile"] as const) {
      expect(FOLLOW[cls].lift).toBeUndefined();
      expect(RAIL[cls].lift).toBeUndefined();
      const target: [number, number, number] = [1, 1, 2];
      expect(followPose(cls, target, 0.3, 1.2).target).toBe(target);
    }
    const lift = FOLLOW.landscape.lift!;
    expect(lift).toBeGreaterThan(0);
    const pose = followPose("landscape", [1, 1, 2], 0.3, 1.5);
    expect(pose.target[1]).toBeCloseTo(1 + lift * 1.5, 9);
    const rail = railPose("landscape", 0, 0, 1.2);
    expect(rail.target[1]).toBeCloseTo(RAIL.landscape.lift! * 1.2, 9);
    expect(railPose("landscape", 0, 0, 1.2, 0, 0, 0, 0, false, 0, 4).target[1]).toBeCloseTo((RAIL.landscape.lift! + 4) * 1.2, 9);
  });
});
