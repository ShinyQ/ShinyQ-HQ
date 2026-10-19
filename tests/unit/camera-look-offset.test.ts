import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import type { FloorId } from "@/content/schema";
import { cameraWorld, clampCamera } from "@/experience/camera/collision";
import { ARRIVAL_HEADING } from "@/experience/camera/arrival";
import { introPlan, introPose, INTRO } from "@/experience/camera/intro";
import { followOffsetScale } from "@/experience/camera/offset";
import {
  createOrbitState,
  primeZone,
  resetView,
  rotate,
  setPitchRange,
  stepOrbit,
  updateZone,
  VIEW_ZONES,
  ZOOM_RANGE,
  zoneAt,
  zoneView,
  zoomBy,
  type OrbitState,
  type ViewZone,
} from "@/experience/camera/orbit";
import { FOLLOW, FOLLOW_LOOK_AHEAD, followForward, followPose, PITCH_LIMITS, pitchRange, springFactor, type CameraPose, type Vec3 } from "@/experience/camera/rigs";
import { FIRST_PERSON } from "@/experience/camera/firstPerson";
import { buildFloorLayouts, FLOOR_IDS, floorY, LOBBY } from "@/experience/config";
import { careerLayoutInput } from "@/experience/floors/career/layout";
import { libraryLayoutInput } from "@/experience/floors/library/model";
import { OFFICE } from "@/experience/floors/lobby/officeLayout";
import type { FloorLayout, ViewportClass } from "@/experience/types";

/**
 * The follow rig's per-zone look-target offset (owner decision 2026-10-20: opt-in data, the office zone only). Every
 * zone without one must produce exactly the poses the rig produced before the offset existed: identical floats, not
 * close ones. The frozen copies below are the rig and orbit code as of b8fd8a88 (before the offset); each zone is
 * primed, driven into and out of, reset and stepped under both motion settings on every camera class, through the new
 * code path and the frozen one, and every orbit field and pose compared with `toEqual` (which tells 0 from -0).
 */

// ---- Frozen copy (b8fd8a88): camera/rigs.ts orbitOffset and followPose. ----
function oldOrbitOffset(offset: Vec3, yaw: number, pitch: number): Vec3 {
  const [ox, oy, oz] = offset;
  const ground = Math.hypot(ox, oz);
  const base = Math.atan2(oy, ground);
  const elevation = Math.max(PITCH_LIMITS[0], Math.min(PITCH_LIMITS[1], base + pitch));
  const radius = Math.hypot(ground, oy);
  const horizontal = elevation === base ? 1 : (radius * Math.cos(elevation)) / ground;
  const vertical = elevation === base ? oy : radius * Math.sin(elevation);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [(ox * c + oz * s) * horizontal, vertical, (-ox * s + oz * c) * horizontal];
}

function oldFollowPose(cls: ViewportClass, target: Vec3, yaw = 0, zoom = 1, pitch = 0): CameraPose {
  const { fov, offset } = FOLLOW[cls];
  const [rx, ry, rz] = oldOrbitOffset(offset, yaw, pitch);
  return { position: [target[0] + rx * zoom, target[1] + ry * zoom, target[2] + rz * zoom], target, fov };
}

// ---- Frozen copy (b8fd8a88): camera/orbit.ts zone tracking and easing. ----
type OldState = Omit<OrbitState, "lookForward" | "lookForwardTarget" | "lookUp" | "lookUpTarget">;
const OLD_KEYS = [
  "yaw",
  "yawTarget",
  "pitch",
  "pitchTarget",
  "zoom",
  "zoomTarget",
  "railYaw",
  "railYawTarget",
  "pitchMin",
  "pitchMax",
  "firstPerson",
  "look",
  "blend",
  "push",
  "pushIdle",
  "easing",
  "zone",
  "suppressedZone",
  "zoneZoom",
  "zoneRailYaw",
  "zoneTurn",
] as const satisfies readonly (keyof OldState)[];
const pick = (s: OldState) => Object.fromEntries(OLD_KEYS.map((k) => [k, s[k]]));

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const nearestAngle = (target: number, current: number) => current + wrapPi(target - current);
const EASE_HALF_LIFE = 0.14;

function oldZoneView(zone: ViewZone, cls?: ViewportClass): { yaw: number; zoom: number | undefined; pitch?: number } {
  const own = cls ? zone.classView?.[cls] : undefined;
  return { yaw: own?.yaw ?? zone.yaw, zoom: own?.zoom ?? zone.zoom, pitch: own?.pitch };
}
const oldTurnOf = (zone: ViewZone, view: ReturnType<typeof oldZoneView>) => (view.pitch !== undefined ? zone.yaw : null);

function oldPrimeZone(s: OldState, zone: ViewZone | null, cls?: ViewportClass, rail = false): void {
  const view = zone ? oldZoneView(zone, cls) : { yaw: 0, zoom: undefined, pitch: undefined };
  s.zone = zone?.id ?? null;
  s.suppressedZone = null;
  s.yaw = s.yawTarget = view.yaw;
  s.zoom = s.zoomTarget = view.zoom ?? 1;
  s.zoneZoom = view.zoom ?? null;
  s.pitch = s.pitchTarget = clamp(view.pitch ?? 0, s.pitchMin, s.pitchMax);
  s.zoneTurn = zone ? oldTurnOf(zone, view) : null;
  if (rail && zone?.railYaw !== undefined) {
    s.railYaw = s.railYawTarget = zone.railYaw;
    s.zoneRailYaw = zone.railYaw;
  }
  s.easing = false;
}

function oldReleaseRailZone(s: OldState): void {
  if (s.zoneRailYaw === null) return;
  s.railYawTarget = s.railYaw - wrapPi(s.railYaw);
  s.zoneRailYaw = null;
  s.easing = true;
}

function oldReleaseTurn(s: OldState): void {
  if (s.zoneTurn === null) return;
  s.yawTarget = nearestAngle(s.zoneTurn, s.yaw);
  s.pitchTarget = 0;
  s.zoneTurn = null;
  s.easing = true;
}

function oldUpdateZone(s: OldState, zone: ViewZone | null, reduced: boolean, cls?: ViewportClass, rail = false): void {
  const id = zone?.id ?? null;
  if (id === s.zone) return;
  s.zone = id;
  if (!zone) {
    s.suppressedZone = null;
    if (s.zoneZoom !== null) {
      s.zoomTarget = 1;
      s.zoneZoom = null;
      s.easing = true;
    }
    oldReleaseRailZone(s);
    oldReleaseTurn(s);
    return;
  }
  if (zone.railYaw === undefined) oldReleaseRailZone(s);
  if (reduced || s.firstPerson || s.suppressedZone === zone.id) {
    oldReleaseTurn(s);
    return;
  }
  const view = oldZoneView(zone, cls);
  s.yawTarget = nearestAngle(view.yaw, s.yaw);
  s.pitchTarget = clamp(view.pitch ?? 0, s.pitchMin, s.pitchMax);
  s.zoneTurn = oldTurnOf(zone, view);
  if (view.zoom) {
    s.zoomTarget = view.zoom;
    s.zoneZoom = view.zoom;
  }
  if (rail && zone.railYaw !== undefined) {
    s.railYawTarget = nearestAngle(zone.railYaw, s.railYaw);
    s.zoneRailYaw = zone.railYaw;
  }
  s.easing = true;
}

function oldResetView(s: OldState): void {
  s.yawTarget = s.yaw - wrapPi(s.yaw);
  s.pitchTarget = 0;
  s.zoomTarget = 1;
  s.railYawTarget = s.railYaw - wrapPi(s.railYaw);
  s.zoneZoom = null;
  s.zoneRailYaw = null;
  s.zoneTurn = null;
  s.firstPerson = false;
  s.push = 1;
  s.easing = true;
  if (s.zone) s.suppressedZone = s.zone;
}

function oldZoomBy(s: OldState, factor: number, allowFirst = true): void {
  s.pushIdle = 0;
  if (s.firstPerson) {
    s.push = factor > 1 ? Math.max(1, s.push) * factor : 1;
    if (s.push >= FIRST_PERSON.exitPush) {
      s.firstPerson = false;
      s.push = 1;
    }
    return;
  }
  const want = s.zoom * factor;
  s.zoom = clamp(want, ZOOM_RANGE[0], ZOOM_RANGE[1]);
  s.zoomTarget = s.zoom;
  s.zoneZoom = null;
  if (allowFirst && want < ZOOM_RANGE[0]) {
    s.push = Math.min(1, s.push) * (want / ZOOM_RANGE[0]);
    if (s.push <= FIRST_PERSON.enterPush) {
      s.firstPerson = true;
      s.push = 1;
      s.look = FIRST_PERSON.look;
    }
  } else {
    s.push = 1;
  }
}

function oldStepOrbit(s: OldState, dt: number, reduced: boolean, hold = false, inputDt = dt): void {
  s.pushIdle += inputDt;
  if (s.pushIdle > FIRST_PERSON.pushIdle) s.push = 1;
  const goal = s.firstPerson && !hold ? 1 : 0;
  if (s.blend !== goal) {
    const step = reduced ? 1 : dt / FIRST_PERSON.glide;
    s.blend = goal > s.blend ? Math.min(goal, s.blend + step) : Math.max(goal, s.blend - step);
  }
  if (!s.easing) return;
  const k = reduced ? 1 : springFactor(dt, EASE_HALF_LIFE);
  s.yaw += (s.yawTarget - s.yaw) * k;
  s.pitch += (s.pitchTarget - s.pitch) * k;
  s.zoom += (s.zoomTarget - s.zoom) * k;
  s.railYaw += (s.railYawTarget - s.railYaw) * k;
  const done =
    Math.abs(s.yawTarget - s.yaw) < 1e-3 &&
    Math.abs(s.pitchTarget - s.pitch) < 1e-3 &&
    Math.abs(s.zoomTarget - s.zoom) < 1e-3 &&
    Math.abs(s.railYawTarget - s.railYaw) < 1e-3;
  if (done) {
    s.yaw = s.yawTarget;
    s.pitch = s.pitchTarget;
    s.zoom = s.zoomTarget;
    s.railYaw = s.railYawTarget;
    s.easing = false;
  }
}
// ---- End of the frozen copy. ----

const CLASSES: readonly ViewportClass[] = ["desktop", "tablet", "mobile"];
/** Screens per class (offset scale differs off the class's own aspect): the tuned sizes plus a square one. */
const ASPECTS: Record<ViewportClass, number[]> = { desktop: [1440 / 900, 1280 / 720, 1], tablet: [844 / 390, 1], mobile: [390 / 844, 820 / 1180] };

const data = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });
const layouts: Record<FloorId, FloorLayout> = buildFloorLayouts(data.years.length, {
  labs: data.labs.pods,
  career: careerLayoutInput(data.career),
  library: libraryLayoutInput(data.library),
});

/** Every zone the follow and rail rigs can be in: the static ones and every floor layout's own (spawn and arrival views included). */
const zones: { floor: FloorId; zone: ViewZone }[] = FLOOR_IDS.flatMap((floor) => [
  ...(VIEW_ZONES[floor] ?? []).map((zone) => ({ floor, zone })),
  ...(layouts[floor].viewZones ?? []).map((zone) => ({ floor, zone })),
]);
const hasOffset = (zone: ViewZone) => zone.lookOffset !== undefined || Object.values(zone.classView ?? {}).some((v) => v?.lookOffset !== undefined);
/** The (zone, class) pairs without a look offset: the office's desktop and tablet views are compared too. */
const plainOn = (cls: ViewportClass) => zones.filter(({ zone }) => zoneView(zone, cls).lookOffset === undefined);

/** The settled follow pose as CameraDirector builds it (look-ahead, offset scale, look offset, camera collision), new code path. */
function newPose(floor: FloorId, s: OrbitState, cls: ViewportClass, aspect: number, at: { x: number; z: number }): CameraPose {
  const f = followForward(cls, s.yaw);
  const ahead = FOLLOW_LOOK_AHEAD[cls];
  const rover: Vec3 = [at.x, floorY(floor) + 1, at.z];
  const pose = followPose(cls, [rover[0] + f.x * ahead, rover[1], rover[2] + f.z * ahead], s.yaw, s.zoom * followOffsetScale(cls, aspect), s.pitch, s.lookForward, s.lookUp);
  return { ...pose, position: clampCamera(pose.target, pose.position, cameraWorld(layouts[floor], floorY(floor)), rover, pose.fov) };
}

function oldPose(floor: FloorId, s: OldState, cls: ViewportClass, aspect: number, at: { x: number; z: number }): CameraPose {
  const f = followForward(cls, s.yaw);
  const ahead = FOLLOW_LOOK_AHEAD[cls];
  const rover: Vec3 = [at.x, floorY(floor) + 1, at.z];
  const pose = oldFollowPose(cls, [rover[0] + f.x * ahead, rover[1], rover[2] + f.z * ahead], s.yaw, s.zoom * followOffsetScale(cls, aspect), s.pitch);
  return { ...pose, position: clampCamera(pose.target, pose.position, cameraWorld(layouts[floor], floorY(floor)), rover, pose.fov) };
}

/** Zoom-in presses (x 0.5) that take any zone's zoom into first person (past ZOOM_RANGE[0], pushed to FIRST_PERSON.enterPush). */
const FIRST_STEPS = 4;

const centre = (zone: ViewZone) => ({ x: (zone.area.minX + zone.area.maxX) / 2, z: (zone.area.minZ + zone.area.maxZ) / 2 });

describe("the follow rig's look offset", () => {
  it("is opt-in data on the office zone only", () => {
    expect(zones.length).toBeGreaterThan(20);
    expect(zones.filter(({ zone }) => hasOffset(zone)).map(({ zone }) => zone.id)).toEqual(["L1:office"]);
  });

  it("followPose without an offset (or a zero one) returns the frozen pose, the target array itself included", () => {
    const target: Vec3 = [3.25, 1, -7.5];
    for (const cls of CLASSES)
      for (const yaw of [0, -0.7, 2.4])
        for (const pitch of [0, 0.1, -0.3])
          for (const zoom of [1, 1.3, 0.64]) {
            const old = oldFollowPose(cls, target, yaw, zoom, pitch);
            expect(followPose(cls, target, yaw, zoom, pitch)).toEqual(old);
            const zero = followPose(cls, target, yaw, zoom, pitch, 0, 0);
            expect(zero).toEqual(old);
            expect(zero.target).toBe(target);
          }
  });

  it("moves only the look target: forward along the camera's horizontal forward, up along y, both scaled with the camera distance", () => {
    const target: Vec3 = [3, 1, 37.5];
    for (const cls of CLASSES) {
      const yaw = 0.8;
      const zoom = 1.3;
      const base = followPose(cls, target, yaw, zoom, 0.1);
      const moved = followPose(cls, target, yaw, zoom, 0.1, -2, -1.5);
      expect(moved.position).toEqual(base.position);
      expect(moved.fov).toBe(base.fov);
      const f = followForward(cls, yaw);
      expect(moved.target[0]).toBeCloseTo(target[0] - 2 * zoom * f.x, 12);
      expect(moved.target[1]).toBeCloseTo(target[1] - 1.5 * zoom, 12);
      expect(moved.target[2]).toBeCloseTo(target[2] - 2 * zoom * f.z, 12);
      // The horizontal view direction (steering is camera-relative) does not change.
      const dir = (p: CameraPose) => Math.atan2(p.target[0] - p.position[0], p.target[2] - p.position[2]);
      expect(dir(moved)).toBeCloseTo(dir(base), 12);
    }
  });

  describe.each(CLASSES)("%s: every zone without an offset keeps its exact poses", (cls) => {
    const run = (reduced: boolean) => {
      const plain = plainOn(cls);
      expect(plain.some(({ zone }) => zone.id === "L1:office")).toBe(cls !== "mobile");
      for (const { floor, zone } of plain) {
        const rail = floor === "L2";
        const at = centre(zone);
        for (const aspect of ASPECTS[cls]) {
          // Primed (the spawn, an arrival, a deep link), then the pose every frame.
          const s = createOrbitState();
          const o: OldState = createOrbitState();
          setPitchRange(s, pitchRange(cls, rail ? "rail" : "follow"));
          setPitchRange(o as OrbitState, pitchRange(cls, rail ? "rail" : "follow"));
          primeZone(s, zone, cls, rail);
          oldPrimeZone(o, zone, cls, rail);
          expect(pick(s), `${zone.id} primed`).toEqual(pick(o));
          expect(newPose(floor, s, cls, aspect, at), `${zone.id} primed pose`).toEqual(oldPose(floor, o, cls, aspect, at));
          const got: unknown[] = [];
          const want: unknown[] = [];
          // Out of the zone, back in by driving, a hand reset, out, in, a hand zoom, out again, then zoomed into first person,
          // into the zone in first person, a held glide (the elevator ride and drawers hold it), a reset back to third
          // person and out: every frame on the way.
          const script: [ViewZone | null, "zone" | "reset" | "zoom" | "first" | "hold"][] = [
            [null, "zone"],
            [zone, "zone"],
            [zone, "reset"],
            [null, "zone"],
            [zone, "zone"],
            [zone, "zoom"],
            [null, "zone"],
            [null, "first"],
            [zone, "zone"],
            [zone, "hold"],
            [zone, "reset"],
            [null, "zone"],
          ];
          for (const [z, act] of script) {
            if (act === "zone") {
              updateZone(s, z, reduced, cls, rail);
              oldUpdateZone(o, z, reduced, cls, rail);
            } else if (act === "zoom") {
              zoomBy(s, 0.8);
              oldZoomBy(o, 0.8);
            } else if (act === "first") {
              for (let i = 0; i < FIRST_STEPS; i++) {
                zoomBy(s, 0.5);
                oldZoomBy(o, 0.5);
              }
              expect(s.firstPerson, `${zone.id} in first person`).toBe(true);
            } else if (act === "reset") {
              resetView(s);
              oldResetView(o);
            }
            const hold = act === "hold";
            for (let frame = 0; frame < 40; frame++) {
              const dt = frame % 3 === 0 ? 1 / 30 : 1 / 60;
              stepOrbit(s, dt, reduced, hold);
              oldStepOrbit(o, dt, reduced, hold);
              got.push(pick(s), [s.lookForward, s.lookUp]);
              want.push(pick(o), [0, 0]);
              if (!rail) {
                got.push(newPose(floor, s, cls, aspect, at));
                want.push(oldPose(floor, o, cls, aspect, at));
              }
            }
          }
          // One comparison per zone and screen (every frame's orbit fields and pose, in order).
          expect(got, `${zone.id} at aspect ${aspect.toFixed(2)}`).toEqual(want);
        }
      }
    };
    it("with motion", () => run(false), 30_000);
    it("under reduced motion", () => run(true), 30_000);
  });

  it("keeps the intro's end pose and timeline at the spawn on every class (the pinned intro poses use the same path)", () => {
    const L1 = layouts.L1;
    const zone = zoneAt("L1", LOBBY.spawn, L1.viewZones);
    expect(zone?.prime).toBe(true);
    for (const cls of CLASSES) {
      const s = createOrbitState();
      const o: OldState = createOrbitState();
      setPitchRange(s, pitchRange(cls, "follow"));
      setPitchRange(o as OrbitState, pitchRange(cls, "follow"));
      primeZone(s, zone, cls);
      oldPrimeZone(o, zone, cls);
      for (const aspect of ASPECTS[cls]) {
        const end = newPose("L1", s, cls, aspect, LOBBY.spawn);
        const old = oldPose("L1", o, cls, aspect, LOBBY.spawn);
        expect(end).toEqual(old);
        const rover: Vec3 = [LOBBY.spawn.x, 0, LOBBY.spawn.z];
        const a = introPlan(cls, rover, LOBBY.spawnHeading, end);
        const b = introPlan(cls, rover, LOBBY.spawnHeading, old);
        for (const t of [0, 0.5, INTRO.duration / 2, INTRO.duration]) expect(introPose(a, t)).toEqual(introPose(b, t));
      }
    }
  });

  it("keeps every floor's arrival view (heading east, primed at the doors) exact", () => {
    for (const floor of FLOOR_IDS) {
      const layout = layouts[floor];
      if (!layout.arrival || floor === "L2") continue;
      const zone = zoneAt(floor, { ...layout.arrival, heading: ARRIVAL_HEADING }, layout.viewZones);
      for (const cls of CLASSES) {
        const s = createOrbitState();
        const o: OldState = createOrbitState();
        primeZone(s, zone, cls);
        oldPrimeZone(o, zone, cls);
        for (const aspect of ASPECTS[cls]) expect(newPose(floor, s, cls, aspect, layout.arrival)).toEqual(oldPose(floor, o, cls, aspect, layout.arrival));
      }
    }
  });
});

describe("the office zone's look offset eases in and out with the zone", () => {
  const office = layouts.L1.viewZones!.find((z) => z.id === "L1:office")!;
  const stop = LOBBY.officeWing.stop;
  const { forward = 0, up = 0 } = OFFICE.view.mobile.lookOffset as { forward?: number; up?: number };

  it("is set on the portrait camera (mobile class) and nowhere else on the zone: toward the camera", () => {
    expect(office.lookOffset).toBeUndefined();
    expect(zoneView(office, "mobile").lookOffset).toEqual(OFFICE.view.mobile.lookOffset);
    expect(zoneView(office, "desktop").lookOffset).toBeUndefined();
    expect(zoneView(office, "tablet").lookOffset).toBeUndefined();
    expect(forward).toBeLessThan(0);
  });

  it("eases in on entry (no snap) and back to 0 on exit, in step with the zone's zoom", () => {
    const s = createOrbitState();
    setPitchRange(s, pitchRange("mobile", "follow"));
    updateZone(s, office, false, "mobile");
    expect([s.lookForwardTarget, s.lookUpTarget]).toEqual([forward, up]);
    stepOrbit(s, 1 / 60, false);
    const share = (s.zoom - 1) / (OFFICE.view.mobile.zoom - 1);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
    expect(s.lookForward / forward).toBeCloseTo(share, 12);
    for (let i = 0; i < 120; i++) stepOrbit(s, 1 / 60, false);
    expect([s.lookForward, s.lookUp]).toEqual([forward, up]);
    updateZone(s, null, false, "mobile");
    stepOrbit(s, 1 / 60, false);
    expect(s.lookForward / forward).toBeCloseTo((s.zoom - 1) / (OFFICE.view.mobile.zoom - 1), 12);
    expect(Math.abs(s.lookForward)).toBeGreaterThan(0);
    expect(Math.abs(s.lookForward)).toBeLessThan(Math.abs(forward));
    for (let i = 0; i < 120; i++) stepOrbit(s, 1 / 60, false);
    expect([s.lookForward, s.lookUp]).toEqual([0, 0]);
    expect(s.easing).toBe(false);
  });

  it("is applied at once when primed; a hand zoom or a reset eases it out (the zoom stays where the hand put it)", () => {
    const s = createOrbitState();
    primeZone(s, office, "mobile");
    expect([s.lookForward, s.lookUp]).toEqual([forward, up]);
    zoomBy(s, 0.8, false);
    expect([s.lookForwardTarget, s.lookUpTarget]).toEqual([0, 0]);
    expect(s.easing).toBe(true);
    stepOrbit(s, 1 / 60, false);
    expect(Math.abs(s.lookForward)).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) stepOrbit(s, 1 / 60, false);
    expect([s.lookForward, s.lookUp]).toEqual([0, 0]);
    expect(s.zoom).toBeCloseTo(OFFICE.view.mobile.zoom * 0.8, 12);
    primeZone(s, office, "mobile");
    resetView(s);
    expect([s.lookForwardTarget, s.lookUpTarget]).toEqual([0, 0]);
  });

  it("freezes where it is under a drag during the ease-in (like the zoom), and still eases out on leaving", () => {
    const s = createOrbitState();
    setPitchRange(s, pitchRange("mobile", "follow"));
    updateZone(s, office, false, "mobile");
    for (let i = 0; i < 5; i++) stepOrbit(s, 1 / 60, false);
    const mid = s.lookForward;
    expect(Math.abs(mid)).toBeGreaterThan(0);
    expect(Math.abs(mid)).toBeLessThan(Math.abs(forward));
    rotate(s, 0.05, 0.02);
    expect(s.easing).toBe(false);
    expect([s.lookForwardTarget, s.lookUpTarget]).toEqual([s.lookForward, s.lookUp]);
    expect(s.zoomTarget).toBe(s.zoom);
    for (let i = 0; i < 120; i++) stepOrbit(s, 1 / 60, false);
    expect(s.lookForward).toBe(mid);
    // Leaving the zone still eases it back to 0.
    updateZone(s, null, false, "mobile");
    for (let i = 0; i < 120; i++) stepOrbit(s, 1 / 60, false);
    expect([s.lookForward, s.lookUp]).toEqual([0, 0]);
  });

  it("never applies under reduced motion (the zone does not turn or zoom either), and cuts out on leaving", () => {
    const r = createOrbitState();
    updateZone(r, office, true, "mobile");
    stepOrbit(r, 1 / 60, true);
    expect([r.lookForward, r.lookUp]).toEqual([0, 0]);
    primeZone(r, office, "mobile");
    updateZone(r, null, true, "mobile");
    stepOrbit(r, 1 / 60, true);
    expect([r.lookForward, r.lookUp]).toEqual([0, 0]);
  });

  it("keeps the camera where the plain office view puts it and moves the look target toward it", () => {
    const s = createOrbitState();
    setPitchRange(s, pitchRange("mobile", "follow"));
    primeZone(s, office, "mobile");
    const pose = newPose("L1", s, "mobile", 390 / 844, stop);
    const plain = newPose("L1", { ...s, lookForward: 0, lookUp: 0 }, "mobile", 390 / 844, stop);
    expect(pose.position).toEqual(plain.position);
    const run = (p: CameraPose) => Math.hypot(p.target[0] - p.position[0], p.target[2] - p.position[2]);
    expect(run(pose)).toBeCloseTo(run(plain) + forward * s.zoom, 9);
    expect(pose.target[1]).toBe(plain.target[1]);
  });
});
