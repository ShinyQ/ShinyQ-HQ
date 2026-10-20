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
      // The landing is the spawn view's follow distance (zoom 1.85 since more room), still well inside 42 u.
      expect(Math.hypot(p[0] - c[0], p[2] - c[2])).toBeLessThan(28);
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

  // Re-pinned for the more-room Lobby (owner 2026-10-19): the spawn moved with the kiosk and the spawn view zooms out to
  // 1.7; the orbit's shape around Rover (radius, rise, sweep, timing) is unchanged.
  it("leaves every desktop pose as it was (the narrow-frame orbit is phone and tablet only)", () => {
    const pinned: Record<string, [number, { position: number[]; target: number[]; fov: number }][]> = {
      primed: [
        [0, { position: [-11.358767733868723, 2.4, 11.332132899466862], target: [-8.392311221183787, 1.85, 12.041100993494465], fov: 38 }],
        [0.5, { position: [-11.270531445633154, 2.4, 11.35322092581309], target: [-8.392311221183787, 1.85, 12.041100993494465], fov: 38 }],
        [1.5, { position: [-13.187660362604358, 5.513638034904112, 11.31321252926357], target: [-7.486166938622606, 1.9074961568945363, 12.220228990604781], fov: 38.03260869565217 }],
        [2.5, { position: [-24.723827585919757, 34.22292614679932, 29.064461238173728], target: [-1.6208018389006238, 2.4376392612335103, 5.755374492919812], fov: 38.43478260869565 }],
        [3.3, { position: [-6.949752537318549, 37.55531279962111, 38.174474869033986], target: [-8.339267540216014, 2.488828199905279, 2.182916196178237], fov: 38.78260869565217 }],
        [4.4, { position: [18.694625258498817, 34.81737710522634, 23.580741127325826], target: [-15.439581380768614, 1.804344276306587, 8.9339583612092], fov: 39.26086956521739 }],
        [5.5, { position: [15.984879993646672, 32.138839401053886, -8.916298368668087], target: [-12.729066589950289, 1.1347098502634716, 16.34624849433959], fov: 39.73913043478261 }],
        [6.2, { position: [1.2194379954485832, 31.65853885207169, -18.932010944167622], target: [-9.664404720996865, 1.0146347130179232, 17.9376394138776], fov: 39.977739130434784 }],
      ],
      offAxis: [
        [0, { position: [-8.354866320007716, 2.4, 8.668661466180035], target: [-8.006095325115943, 1.85, 11.698654666357587], fov: 38 }],
        [0.5, { position: [-8.344492239719708, 2.4, 8.758787632607703], target: [-8.006095325115943, 1.85, 11.698654666357587], fov: 38 }],
        [1.5, { position: [-8.580616249967811, 5.1951977813343735, 8.915803407527727], target: [-7.8643819360009095, 1.9074961568945363, 12.611398669631564], fov: 38.03260869565217 }],
        [2.5, { position: [-23.441560973131992, 30.96830869996757, 5.010017855954146], target: [0.2170975554870722, 2.4376392612335103, 15.91087448526249], fov: 38.43478260869565 }],
        [3.3, { position: [-31.73404555952922, 33.95531279962112, 21.858797204901286], target: [1.2752768483096926, 2.488828199905279, 8.375591063522439], fov: 38.78260869565217 }],
        [4.4, { position: [-9.441029070699189, 31.217377105226348, 38.59586656835641], target: [-7.497647013558963, 1.804344276306587, 4.0136151509084845], fov: 39.26086956521739 }],
        [5.5, { position: [16.352784114428996, 28.538839401053885, 25.426725572527015], target: [-13.53520778345975, 1.1347098502634716, 9.096605943611337], fov: 39.73913043478261 }],
        [6.2, { position: [19.90727855478625, 28.058538852071692, 10.411826665676251], target: [-13.982003388963015, 1.0146347130179232, 12.520792141338923], fov: 39.977739130434784 }],
      ],
    };
    const views: Record<string, [number, number]> = {
      primed: [axisYaw + OBSERVATORY_VIEW.spawnTurn, OBSERVATORY_VIEW.spawnZoom],
      offAxis: [0.9, 1.5],
    };
    for (const [name, [yaw, zoom]] of Object.entries(views)) {
      const plan = introPlan("desktop", rover, LOBBY.spawnHeading, endFor("desktop", yaw, zoom));
      expect(plan.focus).toEqual(rover);
      // Within 1e-9 u: the last bit of a sample can change with the JIT tier (the same code, warm or cold).
      for (const [t, pose] of pinned[name]) {
        const got = introPose(plan, t);
        for (const k of ["position", "target"] as const) got[k].forEach((v, i) => expect(v).toBeCloseTo(pose[k][i], 9));
        expect(got.fov).toBeCloseTo(pose.fov, 9);
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
