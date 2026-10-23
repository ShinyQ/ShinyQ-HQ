import type { FloorId } from "@/content/schema";
import { LOBBY } from "../config";
import type { Rect, Vec2, ViewportClass } from "../types";
import { FIRST_PERSON } from "./firstPerson";
export { yawLooking } from "./look";
import { DEPARTURE_RAIL_YAW, DEPARTURE_YAW } from "./look";
import { pitchRange, springFactor } from "./rigs";

/**
 * Orbit state for the cameras (appendix 03 section 2; owner request, round 5): unbounded yaw around the
 * rover on every floor (L2 keeps its own yaw, so it opens on its side view), pitch from just above the
 * floor to near top-down (the active rig's `pitchRange`), clamped zoom, eased steps and reset, a gentle
 * auto-face toward walls that user rotation cancels, and first person after zooming in past the closest
 * distance. Pure TypeScript so it can be unit tested.
 */
export interface OrbitState {
  /** Yaw offset from the default follow angle, radians, unbounded. */
  yaw: number;
  yawTarget: number;
  /** Pitch offset from the rig's default elevation, radians, within [pitchMin, pitchMax]. */
  pitch: number;
  pitchTarget: number;
  zoom: number;
  zoomTarget: number;
  /** L2 yaw offset from the side view, radians, unbounded. */
  railYaw: number;
  railYawTarget: number;
  /** Pitch offsets the active rig allows (`pitchRange`), set by CameraDirector every frame. */
  pitchMin: number;
  pitchMax: number;
  /** The view the visitor chose: true after zooming in past the closest third-person distance. */
  firstPerson: boolean;
  /** First-person look elevation, radians (0 level, negative looks down), within FIRST_PERSON.pitch. */
  look: number;
  /** 0 third person to 1 first person, as drawn; eases toward the chosen view unless it is held. */
  blend: number;
  /** Zoom pushed against a limit (product of factors); crossing enterPush or exitPush switches the view. */
  push: number;
  /** Seconds since the last zoom input; the push resets after FIRST_PERSON.pushIdle. */
  pushIdle: number;
  /** True while easing toward the targets (steps, reset, auto-face). */
  easing: boolean;
  /** View zone the rover is in, if any. */
  zone: string | null;
  /** The camera class the zone's view was applied for: a device rotation that changes it re-applies the zone's view (`updateZone`). */
  zoneCls: ViewportClass | undefined;
  /** Zone in which the visitor rotated by hand; no auto-face there until the rover leaves it. */
  suppressedZone: string | null;
  /** Zoom set by a view zone; restored to 1 on exit unless the visitor zoomed by hand meanwhile. */
  zoneZoom: number | null;
  /** Rail yaw set by a view zone on the L2 rail rig; eased back to the side view on exit unless the visitor turned the rail by hand. */
  zoneRailYaw: number | null;
  /**
   * The zone's own yaw when its camera-class view set a `pitch` (opt-in: the B1 phone arrival, the L1 office on tablets and phones): eased back to, with
   * the pitch leveled, on exit, unless the visitor turned or tilted by hand meanwhile.
   */
  zoneTurn: number | null;
  /**
   * The look offset a view zone set (`ViewZone.lookOffset`, u before the follow zoom; `followPose` moves only the look
   * target by it), eased like the zoom: in on entering the zone, back to 0 on leaving it, on a hand zoom or on a reset. 0 in
   * every other zone.
   */
  lookForward: number;
  lookForwardTarget: number;
  lookUp: number;
  lookUpTarget: number;
  /** The zone look offset's sideways part (`LookOffset.right`), eased like the others. */
  lookRight: number;
  lookRightTarget: number;
  /** The zone's look offset opted into `LookOffset.hold`: a hand zoom keeps it (scaled with the zoom) instead of easing it out. */
  lookHold: boolean;
  /** The look offset last aimed at (a held one re-aims on a hand zoom, `LookOffset.near`). */
  lookAim: LookOffset | undefined;
}

export const ZOOM_RANGE = [0.6, 1.5] as const;
/** Q/E rotation speed (Shift doubles it), radians per second. */
export const KEY_ROTATE_SPEED = 1.7;
/** R/F tilt speed (Shift doubles it), radians per second. */
export const KEY_PITCH_SPEED = 0.9;
/** One press of an on-screen rotate button. */
export const ROTATE_STEP = Math.PI / 4;
const EASE_HALF_LIFE = 0.14;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** The angle equivalent to `target` (mod 2 PI) that is closest to `current`. */
export const nearestAngle = (target: number, current: number) => current + wrapPi(target - current);

export function createOrbitState(): OrbitState {
  const [pitchMin, pitchMax] = pitchRange("desktop", "follow");
  return {
    yaw: 0,
    yawTarget: 0,
    pitch: 0,
    pitchTarget: 0,
    zoom: 1,
    zoomTarget: 1,
    railYaw: 0,
    railYawTarget: 0,
    pitchMin,
    pitchMax,
    firstPerson: false,
    look: FIRST_PERSON.look,
    blend: 0,
    push: 1,
    pushIdle: 0,
    easing: false,
    zone: null,
    zoneCls: undefined,
    suppressedZone: null,
    zoneZoom: null,
    zoneRailYaw: null,
    zoneTurn: null,
    lookForward: 0,
    lookForwardTarget: 0,
    lookUp: 0,
    lookUpTarget: 0,
    lookRight: 0,
    lookRightTarget: 0,
    lookHold: false,
    lookAim: undefined,
  };
}

/** Sets the active rig's pitch range (CameraDirector, every frame) and keeps the pitch inside it. */
export function setPitchRange(s: OrbitState, [lo, hi]: readonly [number, number]): void {
  if (s.pitchMin === lo && s.pitchMax === hi) return;
  s.pitchMin = lo;
  s.pitchMax = hi;
  s.pitch = clamp(s.pitch, lo, hi);
  s.pitchTarget = clamp(s.pitchTarget, lo, hi);
}

/**
 * Direct manipulation (drag, twist, trackpad, held keys): applies immediately and cancels easing. In
 * first person `dpitch` moves the look instead (a downward drag looks down, like it tilts the
 * third-person view down).
 */
export function rotate(s: OrbitState, dyaw: number, dpitch = 0, rail = false): void {
  if (rail) {
    s.railYaw += dyaw;
    s.railYawTarget = s.railYaw;
    s.zoneRailYaw = null;
  } else {
    s.yaw += dyaw;
    s.yawTarget = s.yaw;
    s.zoneTurn = null;
  }
  if (s.firstPerson) {
    s.look = clamp(s.look - dpitch, FIRST_PERSON.pitch[0], FIRST_PERSON.pitch[1]);
  } else {
    s.pitch = clamp(s.pitch + dpitch, s.pitchMin, s.pitchMax);
    s.pitchTarget = s.pitch;
    if (dpitch !== 0) s.zoneTurn = null;
  }
  s.zoomTarget = s.zoom;
  // Easing stops here, so every target freezes where its value is (a look offset easing in would otherwise finish later).
  s.lookForwardTarget = s.lookForward;
  s.lookUpTarget = s.lookUp;
  s.lookRightTarget = s.lookRight;
  s.lookHold = false;
  s.easing = false;
  if (s.zone) s.suppressedZone = s.zone;
}

/** Eased step (on-screen buttons). */
export function rotateStep(s: OrbitState, direction: number, rail = false): void {
  if (rail) {
    s.railYawTarget = (s.easing ? s.railYawTarget : s.railYaw) + direction * ROTATE_STEP;
    s.zoneRailYaw = null;
  } else {
    s.yawTarget = (s.easing ? s.yawTarget : s.yaw) + direction * ROTATE_STEP;
    s.zoneTurn = null;
  }
  s.easing = true;
  if (s.zone) s.suppressedZone = s.zone;
}

/** Eases back to the default angle, pitch and zoom (the nearest full turn, never a long spin) and leaves first person. */
export function resetView(s: OrbitState): void {
  s.yawTarget = s.yaw - wrapPi(s.yaw);
  s.pitchTarget = 0;
  s.zoomTarget = 1;
  s.railYawTarget = s.railYaw - wrapPi(s.railYaw);
  s.zoneZoom = null;
  s.zoneRailYaw = null;
  s.zoneTurn = null;
  s.lookForwardTarget = 0;
  s.lookUpTarget = 0;
  s.lookRightTarget = 0;
  s.lookHold = false;
  s.firstPerson = false;
  s.push = 1;
  s.easing = true;
  if (s.zone) s.suppressedZone = s.zone;
}

/**
 * Zoom input. In third person it scales the zoom within ZOOM_RANGE; zooming further in at the closest
 * distance pushes, and a push of FIRST_PERSON.enterPush enters first person (only when `allowFirst`).
 * In first person zooming in does nothing, and zooming out by FIRST_PERSON.exitPush returns to third
 * person at the closest distance.
 */
export function zoomBy(s: OrbitState, factor: number, allowFirst = true): void {
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
  // A hand zoom takes the framing over: the zone's look offset eases back to 0 with its zoom released, unless it holds
  // (then it re-aims for the new zoom, `LookOffset.near`).
  aimAt(s, s.lookHold ? s.lookAim : undefined, s.zoom);
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

/**
 * A view zone's look-target offset (u, scaled with the follow distance): `forward` along the camera's horizontal forward
 * (negative: toward the camera), `up` along y (negative: lower). Moving the look target but not the camera tilts the
 * view: a lower or nearer target puts less sky over a feature the rover faces.
 */
export interface LookOffset {
  forward?: number;
  up?: number;
  /**
   * Along the camera's horizontal right (negative: left). The diagonal arrival views on portrait screens aim between the
   * rover and the floor's main sight, which lies off to the right of the view (`ELEVATOR_DIAGONAL`).
   */
  right?: number;
  /** Kept through a hand zoom (it scales with the zoom, so the framing zooms in about the same aim); else eased out. */
  hold?: boolean;
  /** A held offset's `up` once a hand zoom brings the camera closer than `zoom` (the near pose aims elsewhere). */
  near?: { zoom: number; up: number };
}

/** A floor area where the camera turns to face something (a wall) when the rover walks in. */
export interface ViewZone {
  id: string;
  area: Rect;
  /** Follow yaw (offset from the default angle) that faces the feature head on. */
  yaw: number;
  /** Optional zoom so a wide feature fits the view. */
  zoom?: number;
  /** Rail yaw (offset from the side view) on the L2 rail rig, which ignores `yaw`; the follow rig ignores it. */
  railYaw?: number;
  /**
   * Another yaw, zoom or pitch for a camera class (a phone frames a tall view where a desktop frames a wide one).
   * `pitch` is an offset from the rig's default elevation (`OrbitState.pitch`); without it the zone levels the pitch to 0.
   * Defining `pitch` also opts into the turn-back on exit (`OrbitState.zoneTurn`); without it, exit leaves the yaw and the pitch
   * untouched (the zoom still eases back to 1 as on any zone exit).
   */
  classView?: Partial<Record<ViewportClass, { yaw?: number; zoom?: number; pitch?: number; lookOffset?: LookOffset }>>;
  /**
   * Opt-in: the follow rig's look target moves by this offset while the zone is applied (`OrbitState.lookForward`,
   * eased in and out like the zoom; a class view's own wins). Zones without it keep the plain follow pose, float for float.
   */
  lookOffset?: LookOffset;
  /** Floors above the rover drop their ghost outline while it is in this zone (tower/ghostOutline.ts; the L1 office stop). */
  hideGhostAbove?: true;
  /** Applied at once on the first frame and through the boot and the intro (`primeZone`): the L1 session spawn. */
  prime?: boolean;
  /**
   * An arrival view (Round 8 J): active only while `OrbitState.zone` already holds this id, set by an elevator
   * arrival or a deep-link spawn (`primeZone`). Driving into it does nothing (`activeZone`), so a rover passing
   * the arrival point later never swings the camera (or, on L2, the rail).
   */
  arrivalOnly?: true;
  /**
   * Applies only while the rover faces within about 104 degrees of this direction (forward `(sin h, cos h)`,
   * `TRAVEL_SLACK` past perpendicular), so a zone that looks along a road never turns the camera against a
   * rover driving the other way, and a rover arriving square to it keeps the zone. Callers
   * without a heading (pure tests, layout checks) always get the zone.
   */
  travel?: Vec2;
}

/**
 * The zone's own yaw when its class view opts into the turn-back by defining a `pitch` (`OrbitState.zoneTurn`), else null.
 * A class view that only turns or zooms (the L1 kiosk on tablets and phones) never turns back on exit.
 */
function turnOf(zone: ViewZone, view: ReturnType<typeof zoneView>): number | null {
  return view.pitch !== undefined ? zone.yaw : null;
}

/** The yaw, zoom, pitch and look offset a zone asks for on a camera class. */
export function zoneView(zone: ViewZone, cls?: ViewportClass): { yaw: number; zoom: number | undefined; pitch?: number; lookOffset?: LookOffset } {
  const own = cls ? zone.classView?.[cls] : undefined;
  return { yaw: own?.yaw ?? zone.yaw, zoom: own?.zoom ?? zone.zoom, pitch: own?.pitch, lookOffset: own?.lookOffset ?? zone.lookOffset };
}

/**
 * Sets the look offset targets a zone view asks for (0 without one), easing when they change; `zoom` (a hand zoom's)
 * picks the offset's `near` up under its zoom.
 */
function aimAt(s: OrbitState, look: LookOffset | undefined, zoom?: number): void {
  const forward = look?.forward ?? 0;
  const up = look?.near && zoom !== undefined && zoom < look.near.zoom ? look.near.up : (look?.up ?? 0);
  s.lookHold = look?.hold === true;
  s.lookAim = look;
  const right = look?.right ?? 0;
  if (forward === s.lookForwardTarget && up === s.lookUpTarget && right === s.lookRightTarget) return;
  s.lookForwardTarget = forward;
  s.lookUpTarget = up;
  s.lookRightTarget = right;
  s.easing = true;
}

/**
 * Lobby view zones. The default camera looks along (-1, -1); a yaw of -PI/4 looks north at the
 * skills wall, -PI/2 looks east at the louvered certification badges.
 */
export const VIEW_ZONES: Partial<Record<FloorId, ViewZone[]>> = {
  L1: [
    {
      id: "L1:certifications",
      area: { minX: LOBBY.certWall.x - 7, maxX: LOBBY.certWall.x, minZ: LOBBY.certWall.z - 10, maxZ: LOBBY.certWall.z + 10 },
      yaw: -Math.PI / 2,
    },
    {
      id: "L1:skills",
      area: {
        minX: LOBBY.skillsWall.x - LOBBY.skillsWall.w / 2,
        maxX: LOBBY.skillsWall.x + LOBBY.skillsWall.w / 2,
        minZ: LOBBY.skillsWall.z,
        maxZ: LOBBY.skillsWall.z + 6,
      },
      yaw: -Math.PI / 4,
      // The 40 u by 11.3 u wall (every group, 4 by 2) fits a desktop view from its stop (the old 40 u by 9.3 u wall used
      // 1.7); a portrait phone frames part of the wall closer so the text reads, and the visitor pans for the rest.
      zoom: 1.7,
      classView: { mobile: { zoom: 1.15 } },
    },
  ],
};

/**
 * Applies a zone at once (no easing), as an initial state: the session spawn starts in its zone's view,
 * so the intro ends on that view and a deep link opens on it. Also under reduced motion (nothing moves).
 */
export function primeZone(s: OrbitState, zone: ViewZone | null, cls?: ViewportClass, rail = false): void {
  const view = zone ? zoneView(zone, cls) : { yaw: 0, zoom: undefined, pitch: undefined, lookOffset: undefined };
  s.zone = zone?.id ?? null;
  s.zoneCls = cls;
  s.suppressedZone = null;
  s.yaw = s.yawTarget = view.yaw;
  s.zoom = s.zoomTarget = view.zoom ?? 1;
  s.zoneZoom = view.zoom ?? null;
  s.pitch = s.pitchTarget = clamp(view.pitch ?? 0, s.pitchMin, s.pitchMax);
  s.zoneTurn = zone ? turnOf(zone, view) : null;
  s.lookForward = s.lookForwardTarget = view.lookOffset?.forward ?? 0;
  s.lookUp = s.lookUpTarget = view.lookOffset?.up ?? 0;
  s.lookRight = s.lookRightTarget = view.lookOffset?.right ?? 0;
  s.lookHold = view.lookOffset?.hold === true;
  s.lookAim = view.lookOffset;
  if (rail && zone?.railYaw !== undefined) {
    s.railYaw = s.railYawTarget = zone.railYaw;
    s.zoneRailYaw = zone.railYaw;
  }
  s.easing = false;
}

/**
 * The way into the elevator (owner 2026-10-23, "serong kanan"): `CameraDirector` enters this zone (`updateZone`) when a ride
 * starts, so the camera eases to stand behind the rover and `ELEVATOR_DIAGONAL` to its right as it heads west into the shaft
 * (`DEPARTURE_YAW`; on the L2 rail `DEPARTURE_RAIL_YAW`, looking along the view), level, at zoom 1, with no look offset. Zones
 * do not update during a ride, so it holds through boarding and the dolly until the arrival primes the destination's view.
 * Like any zone it never applies under reduced motion (a ride is a cut there), in first person or after a hand turn, and a
 * cancelled ride leaves it for the zone the rover is in. Its area is empty: no rover position ever matches it.
 */
export const DEPARTURE_VIEW: ViewZone = { id: "elevator:departure", area: { minX: 0, maxX: -1, minZ: 0, maxZ: -1 }, yaw: DEPARTURE_YAW, zoom: 1, railYaw: DEPARTURE_RAIL_YAW };

/**
 * Cosine slack past perpendicular for `ViewZone.travel`: a rover arriving square to the travel direction
 * (a drive reaches the data board stop heading north) keeps the zone despite tiny heading errors.
 */
export const TRAVEL_SLACK = 0.25;

/** The zone the rover is in: static `VIEW_ZONES` first, then the floor layout's own (`FloorLayout.viewZones`). */
export function zoneAt(floor: FloorId, p: Vec2 & { heading?: number }, extra: readonly ViewZone[] = []): ViewZone | null {
  const heading = p.heading;
  const inside = (z: ViewZone) =>
    p.x >= z.area.minX &&
    p.x <= z.area.maxX &&
    p.z >= z.area.minZ &&
    p.z <= z.area.maxZ &&
    (!z.travel || heading === undefined || Math.sin(heading) * z.travel.x + Math.cos(heading) * z.travel.z >= -TRAVEL_SLACK);
  return VIEW_ZONES[floor]?.find(inside) ?? extra.find(inside) ?? null;
}

/** The zone `updateZone` should track: an `arrivalOnly` zone counts only while it is already the current zone. */
export function activeZone(zone: ViewZone | null, s: Pick<OrbitState, "zone">): ViewZone | null {
  return zone?.arrivalOnly && s.zone !== zone.id ? null : zone;
}

/** Eases a zone's rail yaw back to the nearest side view (leaving the zone, or moving to one without a rail yaw). */
function releaseRailZone(s: OrbitState): void {
  if (s.zoneRailYaw === null) return;
  s.railYawTarget = s.railYaw - wrapPi(s.railYaw);
  s.zoneRailYaw = null;
  s.easing = true;
}

/** Eases an opted-in class view's turn back to its zone's own yaw and a level pitch (leaving the zone). */
function releaseTurn(s: OrbitState): void {
  if (s.zoneTurn === null) return;
  s.yawTarget = nearestAngle(s.zoneTurn, s.yaw);
  s.pitchTarget = 0;
  s.zoneTurn = null;
  s.easing = true;
}

/**
 * A device rotation in a zone (the camera class changed, `from` to `to`): re-applies the parts of the zone's view that
 * differ between the two classes, as entering it would, so a portrait look offset, pitch or zoom does not stay on a
 * landscape screen. Nothing when the zone applied nothing on entry (reduced motion, first person) or the visitor turned
 * by hand in it; a hand zoom keeps its zoom and its released (or held, `LookOffset.hold`) look offset. Zones whose view is the same on both classes
 * are untouched.
 */
function reclassZone(s: OrbitState, zone: ViewZone, from: ViewportClass, to: ViewportClass, reduced: boolean): void {
  const was = zoneView(zone, from);
  const view = zoneView(zone, to);
  const offset = (v: typeof view) => [v.lookOffset?.forward ?? 0, v.lookOffset?.up ?? 0, v.lookOffset?.right ?? 0];
  const [f0, u0, r0] = offset(was);
  const [f1, u1, r1] = offset(view);
  if (reduced || s.firstPerson || s.suppressedZone === zone.id) return;
  if (was.yaw === view.yaw && was.zoom === view.zoom && was.pitch === view.pitch && f0 === f1 && u0 === u1 && r0 === r1) return;
  if (view.yaw !== was.yaw) s.yawTarget = nearestAngle(view.yaw, s.yaw);
  if (view.pitch !== was.pitch) s.pitchTarget = clamp(view.pitch ?? 0, s.pitchMin, s.pitchMax);
  s.zoneTurn = turnOf(zone, view);
  // A hand zoom set `zoneZoom` to null (and released the look offset): the visitor keeps that framing.
  if (was.zoom === undefined || s.zoneZoom !== null) {
    if (view.zoom !== was.zoom) {
      s.zoomTarget = view.zoom ?? 1;
      s.zoneZoom = view.zoom ?? null;
    }
    aimAt(s, view.lookOffset);
  } else {
    // After a hand zoom the new class's offset applies if it holds (as it would have survived that zoom), else it eases
    // out: a held offset dropped on a portrait screen comes back on a landscape one.
    aimAt(s, view.lookOffset?.hold ? view.lookOffset : undefined, s.zoom);
  }
  s.easing = true;
}

/**
 * What the camera shows of a view zone (`CameraDirector` writes it to `roverRuntime.cameraView` and `cameraHeld` every
 * frame): `zone`, the zone whose view is applied (entered with motion on, not turned by hand, in third person; else
 * null), and `held`, true from the frame the drawn camera first comes to rest in that view until the zone changes, its
 * camera class changes or its look offset is retargeted (unless it holds). A hand zoom (with a held look offset, re-aimed
 * for the near pose or not) or the rover moving inside the zone keeps it held while the camera follows.
 */
export interface ZoneHold {
  zone: string | null;
  held: boolean;
  cls: ViewportClass | undefined;
  forward: number;
  up: number;
  right: number;
}

export const createZoneHold = (): ZoneHold => ({ zone: null, held: false, cls: undefined, forward: 0, up: 0, right: 0 });

/** Updates `h` for this frame (no allocation): `still` is true when the drawn camera rests on its wanted pose. */
export function holdZone(h: ZoneHold, s: OrbitState, reduced: boolean, still: boolean): void {
  const zone = s.zone !== null && s.suppressedZone !== s.zone && !reduced && !s.firstPerson ? s.zone : null;
  // A held look offset's re-aim (`LookOffset.near`) is part of a hand zoom: it keeps the hold.
  if (h.zone !== zone || h.cls !== s.zoneCls || (!s.lookHold && (h.forward !== s.lookForwardTarget || h.up !== s.lookUpTarget || h.right !== s.lookRightTarget))) h.held = false;
  h.zone = zone;
  h.cls = s.zoneCls;
  h.forward = s.lookForwardTarget;
  h.up = s.lookUpTarget;
  h.right = s.lookRightTarget;
  if (still) h.held = true;
}

/**
 * Tracks the zone the rover is in. Entering a zone eases the camera to face its feature, unless
 * reduced motion is on, the visitor is in first person, or they already rotated by hand inside it.
 * Leaving clears the block. On the rail rig a zone's `railYaw` eases the rail in the same way and back to
 * the nearest side view on leaving, unless the visitor turned the rail by hand meanwhile. A camera class change inside
 * the same zone (a device rotation) re-applies its view for the new class (`reclassZone`).
 */
export function updateZone(s: OrbitState, zone: ViewZone | null, reduced: boolean, cls?: ViewportClass, rail = false): void {
  const id = zone?.id ?? null;
  if (id === s.zone) {
    if (zone && cls && s.zoneCls && cls !== s.zoneCls) reclassZone(s, zone, s.zoneCls, cls, reduced);
    if (cls) s.zoneCls = cls;
    return;
  }
  s.zone = id;
  s.zoneCls = cls;
  if (!zone) {
    s.suppressedZone = null;
    if (s.zoneZoom !== null) {
      s.zoomTarget = 1;
      s.zoneZoom = null;
      s.easing = true;
    }
    releaseRailZone(s);
    releaseTurn(s);
    aimAt(s, undefined);
    return;
  }
  if (zone.railYaw === undefined) releaseRailZone(s);
  if (reduced || s.firstPerson || s.suppressedZone === zone.id) {
    releaseTurn(s);
    aimAt(s, undefined);
    return;
  }
  const view = zoneView(zone, cls);
  aimAt(s, view.lookOffset);
  s.yawTarget = nearestAngle(view.yaw, s.yaw);
  s.pitchTarget = clamp(view.pitch ?? 0, s.pitchMin, s.pitchMax);
  s.zoneTurn = turnOf(zone, view);
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

/**
 * Advances the first-person blend (toward the chosen view, or toward third person while `hold`; a cut
 * under reduced motion), forgets an idle zoom push, and advances easing (reduced motion jumps). The push
 * idle runs on `inputDt` (real frame time when the test-only animation speed scales `dt`).
 */
export function stepOrbit(s: OrbitState, dt: number, reduced: boolean, hold = false, inputDt = dt): void {
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
  s.lookForward += (s.lookForwardTarget - s.lookForward) * k;
  s.lookUp += (s.lookUpTarget - s.lookUp) * k;
  s.lookRight += (s.lookRightTarget - s.lookRight) * k;
  const done =
    Math.abs(s.yawTarget - s.yaw) < 1e-3 &&
    Math.abs(s.pitchTarget - s.pitch) < 1e-3 &&
    Math.abs(s.zoomTarget - s.zoom) < 1e-3 &&
    Math.abs(s.railYawTarget - s.railYaw) < 1e-3 &&
    Math.abs(s.lookForwardTarget - s.lookForward) < 1e-3 &&
    Math.abs(s.lookUpTarget - s.lookUp) < 1e-3 &&
    Math.abs(s.lookRightTarget - s.lookRight) < 1e-3;
  if (done) {
    s.yaw = s.yawTarget;
    s.pitch = s.pitchTarget;
    s.zoom = s.zoomTarget;
    s.railYaw = s.railYawTarget;
    s.lookForward = s.lookForwardTarget;
    s.lookUp = s.lookUpTarget;
    s.lookRight = s.lookRightTarget;
    s.easing = false;
  }
}
