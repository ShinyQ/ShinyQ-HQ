import { describe, expect, it } from "vitest";
import { followPose, FOLLOW_LOOK_AHEAD, followForward } from "@/experience/camera/rigs";
import { cubicBezierEase, FACE_Y, INTRO, introFace, introFog, introHeading, introPlan, introPose, revealRadius } from "@/experience/camera/intro";
import { yawLooking } from "@/experience/camera/look";
import { LOBBY, SHAFT } from "@/experience/config";
import { OBSERVATORY_VIEW } from "@/experience/floors/lobby/observatoryLayout";
import type { ViewportClass } from "@/experience/types";

const rover: [number, number, number] = [LOBBY.spawn.x, 0, LOBBY.spawn.z];
const endFor = (cls: ViewportClass, yaw: number, zoom: number) => {
  const f = followForward(cls, yaw);
  const ahead = FOLLOW_LOOK_AHEAD[cls];
  return followPose(cls, [rover[0] + f.x * ahead, 1, rover[2] + f.z * ahead], yaw, zoom);
};
const axisYaw = yawLooking(LOBBY.kioskAxis);
// Two off-axis views, then the primed spawn views (L1:kiosk, observatoryLayout): desktop turned spawnTurn off the kiosk
// axis, tablet and phone straight down it.
const cases: [ViewportClass, number, number][] = [
  ["desktop", 0.9, 1.5],
  ["mobile", 0.3, 1.75],
  ["desktop", axisYaw + OBSERVATORY_VIEW.spawnTurn, OBSERVATORY_VIEW.spawnZoom],
  ["tablet", axisYaw, OBSERVATORY_VIEW.spawnZoomNarrow.tablet],
  ["mobile", axisYaw, OBSERVATORY_VIEW.spawnZoomNarrow.mobile],
];
const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));

describe("intro timeline", () => {
  it("lands exactly on the follow pose at rest", () => {
    for (const [cls, yaw, zoom] of cases) {
      const end = endFor(cls, yaw, zoom);
      const plan = introPlan(cls, rover, LOBBY.spawnHeading, end);
      const last = introPose(plan, INTRO.duration);
      expect(dist(last.position, end.position)).toBeLessThan(1e-9);
      expect(dist(last.target, end.target)).toBeLessThan(1e-9);
      expect(last.fov).toBeCloseTo(end.fov, 9);
      const near = introPose(plan, INTRO.duration - 1 / 60);
      expect(dist(near.position, end.position) * 60).toBeLessThan(0.5);
      expect(introPose(plan, INTRO.duration + 5)).toEqual(last);
    }
  });

  it("opens on a close-up of the face and sweeps 270 degrees around Rover", () => {
    for (const [cls, yaw, zoom] of cases) {
      const plan = introPlan(cls, rover, LOBBY.spawnHeading, endFor(cls, yaw, zoom));
      const first = introPose(plan, 0);
      const toFace = Math.hypot(first.position[0] - first.target[0], first.position[2] - first.target[2]);
      expect(toFace).toBeLessThan(3.5);
      expect(first.target[1]).toBeCloseTo(FACE_Y, 1);
      expect(plan.sweep).toBeCloseTo(1.5 * Math.PI);
      expect(plan.wakeHeading).toBeCloseTo(plan.start);
      // The camera's angle around Rover never goes back.
      let prev = -Infinity;
      for (let i = 0; i <= 400; i++) {
        const p = introPose(plan, (INTRO.duration * i) / 400).position;
        const a = Math.atan2(p[0] - rover[0], p[2] - rover[2]);
        const unwrapped = prev === -Infinity ? a : prev + Math.atan2(Math.sin(a - prev), Math.cos(a - prev));
        expect(unwrapped).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = unwrapped;
      }
    }
  });

  it("never moves faster than a cinematic pace and never jumps between frames", () => {
    for (const [cls, yaw, zoom] of cases) {
      const plan = introPlan(cls, rover, LOBBY.spawnHeading, endFor(cls, yaw, zoom));
      for (let i = 1; i <= INTRO.duration * 60; i++) {
        const a = introPose(plan, (i - 1) / 60).position;
        const b = introPose(plan, i / 60).position;
        expect(dist(a, b) * 60).toBeLessThan(60);
      }
    }
  });

  it("stays above the floor, out of the elevator shaft and above the skills wall", () => {
    const wall = LOBBY.skillsWall;
    for (const [cls, yaw, zoom] of cases) {
      const plan = introPlan(cls, rover, LOBBY.spawnHeading, endFor(cls, yaw, zoom));
      for (let i = 0; i <= 600; i++) {
        const [x, y, z] = introPose(plan, (INTRO.duration * i) / 600).position;
        expect(y).toBeGreaterThan(0.8);
        const inShaft = Math.abs(x - SHAFT.x) < SHAFT.size / 2 + 1 && Math.abs(z - SHAFT.z) < SHAFT.size / 2 + 1;
        expect(inShaft).toBe(false);
        const overWall = Math.abs(x - wall.x) < wall.w / 2 + 1 && Math.abs(z - wall.z) < wall.d / 2 + 1;
        if (overWall) expect(y).toBeGreaterThan(wall.h + 1);
      }
    }
  });

  it("turns Rover from the wake heading to the spawn heading during the pull-back", () => {
    const plan = introPlan("desktop", rover, LOBBY.spawnHeading, endFor("desktop", 0.9, 1.5));
    expect(introHeading(plan, 0)).toBeCloseTo(plan.wakeHeading);
    expect(introHeading(plan, INTRO.turn[0])).toBeCloseTo(plan.wakeHeading);
    const done = introHeading(plan, INTRO.turn[1]);
    expect(Math.cos(done - LOBBY.spawnHeading)).toBeCloseTo(1, 9);
  });

  it("boots the face, then hands back to the normal face", () => {
    expect(introFace(0)).toBe("off");
    expect(introFace(INTRO.faceBoot)).toBe("boot");
    expect(introFace(INTRO.faceOn)).toBeNull();
  });

  it("spreads the reveal ring from Rover and then turns it off", () => {
    expect(revealRadius(0)).toBe(0);
    expect(revealRadius(INTRO.revealStart)).toBe(0);
    expect(revealRadius((INTRO.revealStart + INTRO.revealEnd) / 2)).toBeGreaterThan(0);
    expect(revealRadius(INTRO.revealEnd - 1e-6)).toBeLessThanOrEqual(INTRO.revealReach);
    expect(revealRadius(INTRO.revealEnd)).toBe(Infinity);
    for (let i = 1; i < 100; i++) expect(revealRadius(i * 0.03)).toBeGreaterThanOrEqual(revealRadius((i - 1) * 0.03));
  });

  it("opens the fog with the ring and ends on the follow range", () => {
    const follow = { near: 38, far: 80 };
    const dark = introFog(2.3, 0, follow);
    expect(dark.far).toBeLessThan(20);
    expect(dark.near).toBeGreaterThan(2.3);
    expect(introFog(40, Infinity, follow)).toEqual(follow);
  });

  it("keeps the fog continuous while the ring spreads and when it turns off", () => {
    const follow = { near: 38, far: 80 };
    for (const camDistance of [2.3, 20, 44]) {
      let prev = introFog(camDistance, revealRadius(INTRO.revealStart), follow);
      for (let i = 1; INTRO.revealStart + i / 60 < INTRO.revealEnd; i++) {
        const fog = introFog(camDistance, revealRadius(INTRO.revealStart + i / 60), follow);
        expect(fog.near).toBeGreaterThanOrEqual(prev.near);
        expect(fog.far).toBeGreaterThanOrEqual(prev.far);
        prev = fog;
      }
      const end = introFog(camDistance, revealRadius(INTRO.revealEnd), follow);
      expect(end.near - prev.near).toBeLessThan(1);
      expect(end.far - prev.far).toBeLessThan(1);
    }
  });

  it("eases like a CSS cubic-bezier", () => {
    const ease = cubicBezierEase(0.42, 0, 0.58, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5, 3);
    expect(ease(0.01)).toBeLessThan(0.01);
  });
});
