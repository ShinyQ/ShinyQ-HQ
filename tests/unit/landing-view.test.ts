import { describe, expect, it } from "vitest";
import { getStats } from "@/content/load";
import { followOffsetScale } from "@/experience/camera/offset";
import { createOrbitState, nearestAngle, primeZone, rotateStep, setPitchRange, updateZone, yawLooking, zoneAt, zoneView, type ViewZone } from "@/experience/camera/orbit";
import { FOLLOW_LOOK_AHEAD, followForward, followPose, pitchRange, type CameraPose } from "@/experience/camera/rigs";
import { buildFloorLayouts, LOBBY } from "@/experience/config";
import { lobbyElements, TITLE_TOP } from "@/experience/floors/lobby/layout";
import { OBSERVATORY_VIEW } from "@/experience/floors/lobby/observatoryLayout";
import type { ViewportClass } from "@/experience/types";
import { cameraClass } from "@/lib/viewport";

type V3 = [number, number, number];

const l1 = buildFloorLayouts(8).L1;
const kiosk = zoneAt("L1", LOBBY.spawn, l1.viewZones) as ViewZone;
const axisYaw = yawLooking(LOBBY.kioskAxis);
const landing = OBSERVATORY_VIEW.landingPhone;

/** A fresh orbit on a class's follow rig (its pitch range), as CameraDirector sets it every frame. */
function orbitOn(cls: ViewportClass) {
  const s = createOrbitState();
  setPitchRange(s, pitchRange(cls, "follow"));
  return s;
}

describe("the L1 phone landing view (primed only)", () => {
  it("is a phone-only prime view on the kiosk zone, with a pitch", () => {
    expect(kiosk.id).toBe("L1:kiosk");
    expect(kiosk.prime).toBe(true);
    expect(kiosk.primeView?.mobile?.pitch).toBe(landing.pitch);
    expect(kiosk.primeView?.desktop).toBeUndefined();
    expect(kiosk.primeView?.tablet).toBeUndefined();
  });

  it("primes the phone landing pose at once and turns back to the axis view", () => {
    const s = orbitOn("mobile");
    primeZone(s, kiosk, "mobile");
    const [lo, hi] = pitchRange("mobile", "follow");
    expect(landing.pitch).toBeGreaterThanOrEqual(lo);
    expect(landing.pitch).toBeLessThanOrEqual(hi);
    expect(s.pitch).toBe(landing.pitch);
    expect(s.pitchTarget).toBe(landing.pitch);
    expect(s.zoom).toBe(landing.zoom);
    expect(s.yaw).toBe(axisYaw);
    expect(s.lookForward).toBe(landing.lookOffset.forward);
    expect(s.lookUp).toBe(landing.lookOffset.up);
    expect(s.zonePrime).toBe(true);
    expect(s.zoneTurn).toBe(axisYaw);
  });

  it("primes the desktop and tablet views exactly as before (no pitch, no look offset)", () => {
    for (const cls of ["desktop", "tablet"] as const) {
      const s = orbitOn(cls);
      primeZone(s, kiosk, cls);
      const view = zoneView(kiosk, cls);
      expect(view.pitch).toBeUndefined();
      expect(view.lookOffset).toBeUndefined();
      expect([s.yaw, s.zoom, s.pitch, s.lookForward, s.lookUp, s.lookRight, s.zoneTurn]).toEqual([view.yaw, view.zoom, 0, 0, 0, 0, null]);
      expect(s.zonePrime).toBe(true);
    }
  });

  it("eases back to the follow view on the first drive away", () => {
    const s = orbitOn("mobile");
    primeZone(s, kiosk, "mobile");
    updateZone(s, null, false, "mobile");
    expect(s.zonePrime).toBe(false);
    expect(s.pitchTarget).toBe(0);
    expect(s.yawTarget).toBe(nearestAngle(axisYaw, s.yaw));
    expect(s.lookForwardTarget).toBe(0);
    expect(s.lookUpTarget).toBe(0);
    expect(s.zoomTarget).toBe(1);
    expect(s.zoneTurn).toBeNull();
  });

  it("does not re-apply on a drive back to the kiosk: the class view applies", () => {
    const s = orbitOn("mobile");
    primeZone(s, kiosk, "mobile");
    updateZone(s, null, false, "mobile");
    updateZone(s, kiosk, false, "mobile");
    expect(s.zonePrime).toBe(false);
    expect(s.pitchTarget).toBe(0);
    expect(s.zoomTarget).toBe(OBSERVATORY_VIEW.spawnZoomNarrow.mobile);
    expect(s.lookForwardTarget).toBe(0);
    expect(s.lookUpTarget).toBe(0);
    expect(s.zoneTurn).toBeNull();
  });

  it("levels the pitch when a rotation changes the camera class inside the zone", () => {
    const s = orbitOn("mobile");
    primeZone(s, kiosk, "mobile");
    updateZone(s, kiosk, false, "tablet");
    expect(s.pitchTarget).toBe(0);
    expect(s.zoomTarget).toBe(OBSERVATORY_VIEW.spawnZoomNarrow.tablet);
    expect(s.lookForwardTarget).toBe(0);
    expect(s.zoneTurn).toBeNull();
  });

  it("re-primes the new class's view at once on a rotation under reduced motion", () => {
    const s = orbitOn("mobile");
    primeZone(s, kiosk, "mobile");
    updateZone(s, kiosk, true, "tablet");
    const fresh = orbitOn("mobile");
    primeZone(fresh, kiosk, "tablet");
    expect(s).toEqual(fresh);
    expect(s.zonePrime).toBe(true);
    expect(s.zoneCls).toBe("tablet");
    expect(s.easing).toBe(false);
    expect([s.pitch, s.pitchTarget]).toEqual([0, 0]);
    expect([s.zoom, s.zoomTarget]).toEqual([OBSERVATORY_VIEW.spawnZoomNarrow.tablet, OBSERVATORY_VIEW.spawnZoomNarrow.tablet]);
    expect([s.lookForward, s.lookUp, s.lookRight, s.lookForwardTarget, s.lookUpTarget, s.lookRightTarget]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(s.yaw).toBe(zoneView(kiosk, "tablet").yaw);
    expect(s.yawTarget).toBe(zoneView(kiosk, "tablet").yaw);
  });

  it("keeps a hand turn on a rotation under reduced motion", () => {
    const s = orbitOn("mobile");
    primeZone(s, kiosk, "mobile");
    rotateStep(s, 1);
    expect(s.suppressedZone).toBe(kiosk.id);
    const before = { ...s };
    updateZone(s, kiosk, true, "tablet");
    expect(s).toEqual({ ...before, zoneCls: "tablet" });
  });
});

// ---- Framing (pure, no renderer): the primed landing pose on portrait phones. ----

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v: V3): V3 => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Screen position (CSS px from the top left) of a world point seen through a pose (vertical FOV, as three.js). */
function screen(pose: CameraPose, p: V3, width: number, height: number): { x: number; y: number } {
  const f = norm(sub(pose.target, pose.position));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const d = sub(p, pose.position);
  const t = Math.tan(((pose.fov / 2) * Math.PI) / 180);
  const ndcX = dot(d, r) / dot(d, f) / (t * (width / height));
  const ndcY = dot(d, u) / dot(d, f) / t;
  return { x: ((1 + ndcX) / 2) * width, y: ((1 - ndcY) / 2) * height };
}

/** The primed landing pose at the spawn, built like CameraDirector (look-ahead along the orbit's forward, offset scale, look offset). */
function landingPose(width: number, height: number): CameraPose {
  const cls = cameraClass(width, height);
  const s = orbitOn(cls);
  primeZone(s, kiosk, cls);
  const f = followForward(cls, s.yaw);
  const ahead = FOLLOW_LOOK_AHEAD[cls];
  const target: V3 = [LOBBY.spawn.x + f.x * ahead, 1, LOBBY.spawn.z + f.z * ahead];
  return followPose(cls, target, s.yaw, s.zoom * followOffsetScale(cls, width / height), s.pitch, s.lookForward, s.lookUp, s.lookRight);
}

/** Half the name's width over the hologram (u): "Kurniadi Ahmad Wijaya" at `LOBBY.titleFont.name`; `lobbyElements` holds the 14 u text block. */
const NAME_HALF = 4;
/** Safe frame on a portrait phone: under the top bar and the minimap row, over the joystick, Boost and toast band. */
const SAFE = { side: 12, top: 76, bottom: 168 };

describe.each([
  [390, 844],
  [375, 667],
])("the phone landing view at %i x %i", (w, h) => {
  const pose = landingPose(w, h);
  const inside = (p: V3) => {
    const q = screen(pose, p, w, h);
    return q.x >= SAFE.side && q.x <= w - SAFE.side && q.y >= SAFE.top && q.y <= h - SAFE.bottom;
  };

  it("uses the phone camera class", () => {
    expect(cameraClass(w, h)).toBe("mobile");
  });

  it("keeps Rover and both ends of the name in the safe frame", () => {
    expect(inside([LOBBY.spawn.x, 1, LOBBY.spawn.z]), "rover").toBe(true);
    const f = followForward("mobile", axisYaw);
    // The name faces the camera: its ends lie along the camera's horizontal right of forward, (-f.z, f.x).
    for (const side of [-1, 1]) {
      const end: V3 = [LOBBY.hologram.x - f.z * NAME_HALF * side, TITLE_TOP, LOBBY.hologram.z + f.x * NAME_HALF * side];
      expect(inside(end), `name end ${side}`).toBe(true);
    }
  });

  // Three quarters of the ring's tile centres: today's stats (6 tiles, so 5) and an 8-tile ring (6 of 8), at rest and turned.
  it.each([getStats().length, 8])("keeps three quarters of a %i-tile stats ring in the safe frame", (n) => {
    for (const turn of [0, Math.PI / 8, Math.PI / 4]) {
      const tiles = lobbyElements(n, turn).filter((b) => b.name.startsWith("tile-"));
      expect(tiles).toHaveLength(n);
      const centres = tiles.map((b): V3 => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]);
      expect(centres.filter(inside).length, `turn ${turn}`).toBeGreaterThanOrEqual(Math.ceil(0.75 * n));
    }
  });

  it("puts the slab's far edge in the top 15% of the screen (little sky)", () => {
    const f = followForward("mobile", axisYaw);
    const { minX, maxX, minZ, maxZ } = LOBBY.bounds;
    const corners: V3[] = [
      [minX, 0, minZ],
      [minX, 0, maxZ],
      [maxX, 0, minZ],
      [maxX, 0, maxZ],
    ];
    const far = corners.reduce((a, b) => (b[0] * f.x + b[2] * f.z > a[0] * f.x + a[2] * f.z ? b : a));
    expect(screen(pose, far, w, h).y).toBeLessThanOrEqual(0.15 * h);
  });
});
