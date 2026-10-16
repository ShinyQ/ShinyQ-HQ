import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { zoneAt } from "@/experience/camera/orbit";
import { FOLLOW_LOOK_AHEAD, followPose } from "@/experience/camera/rigs";
import { buildLabsLayout, LABS, SIDE_WINGS } from "@/experience/floors/labs/layout";
import { yawTowards } from "@/experience/fx/facing";
import type { Vec2 } from "@/experience/types";

/** World direction of a yawed text's front (its local +z). */
const front = (yaw: number): Vec2 => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
/** World direction the yawed text reads in (its local +x). */
const reading = (yaw: number): Vec2 => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });
/** Horizontal screen-right of a camera at `eye` looking at `at`: forward x up. */
function screenRight(eye: Vec2, at: Vec2): Vec2 {
  const fx = at.x - eye.x;
  const fz = at.z - eye.z;
  const len = Math.hypot(fx, fz);
  return { x: -fz / len, z: fx / len };
}
const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.z * b.z;
function toward(from: Vec2, to: Vec2): Vec2 {
  const len = Math.hypot(to.x - from.x, to.z - from.z);
  return { x: (to.x - from.x) / len, z: (to.z - from.z) / len };
}

describe("yawTowards", () => {
  it("turns a sign's front to a camera anywhere around it, reading left to right (never mirrored)", () => {
    const sign = { x: 6.6, z: -18.1 };
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const eye = { x: sign.x + Math.sin(a) * 30, z: sign.z + Math.cos(a) * 30 };
      const yaw = yawTowards(sign, eye);
      expect(dot(front(yaw), toward(sign, eye))).toBeCloseTo(1, 9);
      expect(dot(reading(yaw), screenRight(eye, sign))).toBeCloseTo(1, 9);
    }
  });

  it("keeps the default facing when the camera stands right above the sign", () => {
    expect(yawTowards({ x: 1, z: 2 }, { x: 1, z: 2 })).toBe(0);
  });
});

describe("L3 side boards face the arrival camera (plan 2026-10-16)", () => {
  const pods = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" }).labs.pods;
  const layout = buildLabsLayout(pods);
  const zone = zoneAt("L3", LABS.overview, layout.floor.viewZones)!;
  // The arrival camera as the Director settles it: FOLLOW_LOOK_AHEAD ahead of the rover along its forward (+x here).
  const [x, , z] = followPose("desktop", [LABS.overview.x + FOLLOW_LOOK_AHEAD.desktop, 0, LABS.overview.z], zone.yaw, zone.zoom).position;
  const eye = { x, z };

  it("turns each side board's front to the arrival camera, its text reading left to right", () => {
    for (const wing of SIDE_WINGS) {
      const b = layout.boards[wing];
      expect(dot(b.normal, toward(b.center, eye)), wing).toBeGreaterThan(0.9);
      expect(dot(b.along, screenRight(eye, b.center)), wing).toBeGreaterThan(0.9);
      // The front text yaw puts the text's front and reading direction on the board's normal and along.
      expect(dot(front(b.yaw), b.normal)).toBeCloseTo(1, 12);
      expect(dot(reading(b.yaw), b.along)).toBeCloseTo(1, 12);
    }
  });
});
