import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { followPose, FOLLOW_LOOK_AHEAD, followForward } from "@/experience/camera/rigs";
import {
  cubicBezierEase,
  decayVeil,
  FACE_Y,
  INTRO,
  introFace,
  introFog,
  introHeading,
  introPlan,
  introPose,
  orbitCenter,
  reducedVeil,
  revealRadius,
  skipsIntro,
} from "@/experience/camera/intro";
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
/** The camera's angle around the orbit's center (Rover, or the plaza on narrow frames) at `t`. */
const angleAt = (plan: ReturnType<typeof introPlan>, t: number) => {
  const p = introPose(plan, t).position;
  const c = orbitCenter(plan, t);
  return Math.atan2(p[0] - c[0], p[2] - c[2]);
};

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

  it("opens on a close-up of the face and sweeps 270 degrees around the orbit's center", () => {
    for (const [cls, yaw, zoom] of cases) {
      const plan = introPlan(cls, rover, LOBBY.spawnHeading, endFor(cls, yaw, zoom));
      const first = introPose(plan, 0);
      const toFace = Math.hypot(first.position[0] - first.target[0], first.position[2] - first.target[2]);
      expect(toFace).toBeLessThan(3.5);
      // The look point sits on the head, between the face screen's center and the head top, so the antenna stays in frame.
      expect(first.target[1]).toBeGreaterThanOrEqual(FACE_Y);
      expect(first.target[1]).toBeLessThan(FACE_Y + 0.5);
      expect(plan.sweep).toBeCloseTo(1.5 * Math.PI);
      expect(plan.wakeHeading).toBeCloseTo(plan.start);
      // The camera's angle around the orbit's center never goes back.
      let prev = -Infinity;
      for (let i = 0; i <= 400; i++) {
        const a = angleAt(plan, (INTRO.duration * i) / 400);
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

  // The primed spawn views (the real first frames after the boot): desktop, tablet and phone.
  const primed = cases.slice(2);
  const pitchAt = (p: { position: number[]; target: number[] }) =>
    (Math.atan2(p.position[1] - p.target[1], Math.hypot(p.position[0] - p.target[0], p.position[2] - p.target[2])) * 180) / Math.PI;
  const sweptAt = (plan: ReturnType<typeof introPlan>, t: number) => {
    let prev = plan.start;
    let swept = 0;
    for (let i = 1; i <= 400; i++) {
      const a = angleAt(plan, (t * i) / 400);
      swept += Math.atan2(Math.sin(a - prev), Math.cos(a - prev));
      prev = a;
    }
    return swept / plan.sweep;
  };

  it("frames the wake close-up slightly from above", () => {
    for (const [cls, yaw, zoom] of primed) {
      const first = introPose(introPlan(cls, rover, LOBBY.spawnHeading, endFor(cls, yaw, zoom)), 0);
      const pitch = pitchAt(first);
      expect(pitch).toBeGreaterThan(5);
      expect(pitch).toBeLessThan(20);
    }
  });

  it("looks at the landmarks from the side at mid-orbit on desktop (pitch 32 to 45 degrees), down on the plaza on narrow frames", () => {
    const mid = (INTRO.wake + INTRO.duration) / 2;
    for (const [cls, yaw, zoom] of primed) {
      const plan = introPlan(cls, rover, LOBBY.spawnHeading, endFor(cls, yaw, zoom));
      const [lo, hi] = cls === "desktop" ? [32, 45] : [50, 65];
      for (let t = mid - 0.5; t <= mid + 0.5 + 1e-9; t += 0.05) {
        const pitch = pitchAt(introPose(plan, t));
        expect(pitch).toBeGreaterThanOrEqual(lo);
        expect(pitch).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("rises at least 4 u above the follow height, then descends onto it", () => {
    for (const [cls, yaw, zoom] of primed) {
      const end = endFor(cls, yaw, zoom);
      const plan = introPlan(cls, rover, LOBBY.spawnHeading, end);
      let top = -Infinity;
      for (let i = 0; i <= 600; i++) top = Math.max(top, introPose(plan, (INTRO.duration * i) / 600).position[1]);
      expect(top).toBeGreaterThanOrEqual(end.position[1] + 4);
    }
  });

  it("spreads the sweep evenly and keeps only the last second for the landing", () => {
    for (const [cls, yaw, zoom] of primed) {
      const plan = introPlan(cls, rover, LOBBY.spawnHeading, endFor(cls, yaw, zoom));
      expect(sweptAt(plan, INTRO.duration - 1)).toBeGreaterThanOrEqual(0.85);
      // Not front-loaded: about half the sweep by the middle of the orbit.
      const half = sweptAt(plan, (INTRO.wake + INTRO.duration) / 2);
      expect(half).toBeGreaterThan(0.4);
      expect(half).toBeLessThan(0.6);
      expect(sweptAt(plan, INTRO.duration)).toBeCloseTo(1, 6);
    }
  });

  // The primed phone view (portrait screens, tablets standing up included), drawn as on a 390 x 844 phone.
  const phone = introPlan("mobile", rover, LOBBY.spawnHeading, endFor("mobile", axisYaw, OBSERVATORY_VIEW.spawnZoomNarrow.mobile));
  // The tablet camera class is a landscape frame (a phone on its side, a landscape tablet).
  const tablet = introPlan("tablet", rover, LOBBY.spawnHeading, endFor("tablet", axisYaw, OBSERVATORY_VIEW.spawnZoomNarrow.tablet));
  const cameraAt = (plan: ReturnType<typeof introPlan>, aspect: number, t: number) => {
    const p = introPose(plan, t);
    const camera = new PerspectiveCamera(p.fov, aspect, 0.1, 500);
    camera.position.set(...p.position);
    camera.lookAt(new Vector3(...p.target));
    camera.updateMatrixWorld();
    return camera;
  };
  const phoneCamera = (t: number) => cameraAt(phone, 390 / 844, t);
  const pullEnd = INTRO.wake + phone.hold + phone.pull;

  it("keeps the plaza in the middle of the phone frame from the end of the pull-back to the landing", () => {
    // The follow view itself frames the hologram low (NDC y -0.66), so the window holds until 0.8 s before the end.
    for (let t = pullEnd; t <= INTRO.duration - 0.8 + 1e-9; t += 1 / 60) {
      const h = new Vector3(LOBBY.hologram.x, 0, LOBBY.hologram.z).project(phoneCamera(t));
      expect(Math.abs(h.x)).toBeLessThan(0.5);
      expect(Math.abs(h.y)).toBeLessThan(0.6);
    }
  });

  it("orbits the phone closer and higher than Rover's 42 u circle at its end height + 6", () => {
    let top = -Infinity;
    for (let t = pullEnd; t <= INTRO.duration + 1e-9; t += 1 / 60) {
      const p = introPose(phone, t).position;
      const c = orbitCenter(phone, t);
      expect(Math.hypot(p[0] - c[0], p[2] - c[2])).toBeLessThan(26);
      top = Math.max(top, p[1]);
    }
    expect(phone.focus).toEqual([LOBBY.hologram.x, 0, LOBBY.hologram.z]);
    expect(top).toBeGreaterThanOrEqual(phone.end.position[1] + 9);
  });

  it("only shows the skills wall from the front on a phone and a tablet", () => {
    const wall = LOBBY.skillsWall;
    for (const [plan, aspect] of [
      [phone, 390 / 844],
      [tablet, 844 / 390],
      [tablet, 1000 / 800],
    ] as const) {
      let seen = 0;
      for (let i = 0; i <= INTRO.duration * 60; i++) {
        const camera = cameraAt(plan, aspect, i / 60);
        const w = new Vector3(wall.x, wall.h / 2, wall.z).project(camera);
        if (Math.abs(w.x) < 1 && Math.abs(w.y) < 1 && w.z < 1) {
          seen++;
          // The wall's skills face +z.
          expect(camera.position.z).toBeGreaterThan(wall.z + wall.d / 2);
        }
      }
      expect(seen).toBeGreaterThan(30);
    }
  });

  it("leaves every desktop pose as it was (the narrow-frame orbit is phone and tablet only)", () => {
    const pinned: Record<string, [number, { position: number[]; target: number[]; fov: number }][]> = {
      primed: [
        [0, { position: [-10.010973036682085, 2.4, 6.982899361999176], target: [-7.173734378075779, 1.85, 8.102085134831322], fov: 38 }],
        [0.5, { position: [-9.926580291666822, 2.4, 7.0161891803459095], target: [-7.173734378075779, 1.85, 8.102085134831322], fov: 38 }],
        [1.5, { position: [-11.819020965476223, 5.1951977813343735, 6.70691219737842], target: [-6.30179564505891, 1.9074961568945363, 8.406891870373713], fov: 38.03260869565217 }],
        [2.5, { position: [-25.737411069106052, 30.96830869996757, 22.65897795241655], target: [0.41461102745159906, 2.4376392612335103, 2.8313441090563964], fov: 38.43478260869565 }],
        [3.3, { position: [-9.41802920333116, 33.95531279962112, 34.14501855924917], target: [-5.734550335529234, 2.488828199905279, -1.6506257919729173], fov: 38.78260869565217 }],
        [4.4, { position: [16.227577403630516, 31.217377105226348, 22.246413564223996], target: [-13.713883170212913, 1.804344276306587, 4.034554456858929], fov: 39.26086956521739 }],
        [5.5, { position: [16.46448106590216, 28.538839401053885, -6.959247654575564], target: [-12.072941385568607, 1.1347098502634716, 11.754414915983523], fov: 39.73913043478261 }],
        [6.2, { position: [4.83848003034851, 28.058538852071692, -17.13430159987506], target: [-9.262596732829874, 1.0146347130179232, 13.761063954213167], fov: 39.977739130434784 }],
      ],
      offAxis: [
        [0, { position: [-7.155354406189995, 2.4, 4.790169527340513], target: [-6.806583411298225, 1.85, 7.820162727518066], fov: 38 }],
        [0.5, { position: [-7.1449803259019875, 2.4, 4.880295693768181], target: [-6.806583411298225, 1.85, 7.820162727518066], fov: 38 }],
        [1.5, { position: [-7.3811043361500905, 5.1951977813343735, 5.0373114686882055], target: [-6.66487002218319, 1.9074961568945363, 8.732906730792042], fov: 38.03260869565217 }],
        [2.5, { position: [-17.729298703084815, 30.96830869996757, 3.2108003855977194], target: [1.4166094693047917, 2.4376392612335103, 12.032382546422967], fov: 38.43478260869565 }],
        [3.3, { position: [-29.783189033344634, 33.95531279962112, 17.673406076596695], target: [2.474788762127412, 2.488828199905279, 4.497099124682917], fov: 38.78260869565217 }],
        [4.4, { position: [-8.231203089489192, 31.217377105226348, 34.533837033095345], target: [-6.298135099741243, 1.804344276306587, 0.13512321206896227], fov: 39.26086956521739 }],
        [5.5, { position: [17.513919916239388, 28.538839401053885, 21.527265798106125], target: [-12.33569586964203, 1.1347098502634716, 5.218114004771815], fov: 39.73913043478261 }],
        [6.2, { position: [21.10288214061398, 28.058538852071692, 6.533577946177055], target: [-12.782491475145296, 1.0146347130179232, 8.642300202499401], fov: 39.977739130434784 }],
      ],
    };
    const views: Record<string, [number, number]> = {
      primed: [axisYaw + OBSERVATORY_VIEW.spawnTurn, OBSERVATORY_VIEW.spawnZoom],
      offAxis: [0.9, 1.5],
    };
    for (const [name, [yaw, zoom]] of Object.entries(views)) {
      const plan = introPlan("desktop", rover, LOBBY.spawnHeading, endFor("desktop", yaw, zoom));
      expect(plan.focus).toEqual(rover);
      for (const [t, pose] of pinned[name]) expect(introPose(plan, t)).toEqual(pose);
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

describe("intro skip and veil", () => {
  it("drive, turn, zoom, reset view and Esc skip the intro, never the boot", () => {
    for (const intent of ["move", "orbit", "zoom", "view", "cancel"]) {
      expect(skipsIntro("intro", intent)).toBe(true);
      expect(skipsIntro("boot", intent)).toBe(false);
      expect(skipsIntro("explore", intent)).toBe(false);
    }
    for (const intent of ["interact", "elevator", "toggle", "palette", "scrub", "teleport", "open", "terminal"]) {
      expect(skipsIntro("intro", intent)).toBe(false);
    }
  });

  it("the reduced-motion veil clears linearly over INTRO.reduced", () => {
    expect(reducedVeil(0)).toBe(1);
    expect(reducedVeil(INTRO.reduced / 2)).toBeCloseTo(0.5, 6);
    expect(reducedVeil(INTRO.reduced)).toBe(0);
    expect(reducedVeil(INTRO.reduced + 1)).toBe(0);
  });

  it("the skip veil fades from full to 0 over INTRO.skipFade and stays at 0", () => {
    let veil = 1;
    const dt = 1 / 60;
    let frames = 0;
    while (veil > 0) {
      veil = decayVeil(veil, dt);
      frames++;
    }
    expect(frames).toBe(Math.ceil(INTRO.skipFade / dt - 1e-9));
    expect(decayVeil(0, dt)).toBe(0);
    expect(decayVeil(0.5, INTRO.skipFade / 2)).toBeCloseTo(0, 9);
  });
});
