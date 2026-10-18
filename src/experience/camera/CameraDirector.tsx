"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { Fog, PerspectiveCamera, Vector3 } from "three";
import type { FloorId } from "@/content/schema";
import { cameraShift, drawerLayout } from "@/hud/drawer/layout";
import { getHQStore, type HQState } from "@/store/useHQStore";
import { floorY, LOBBY } from "../config";
import { roadZAt } from "../floors/career/layout";
import { intents, pitchAxisFromKeys, rotateAxisFromKeys } from "../input/intents";
import { MAX_FRAME_DT } from "../rover/controller";
import { RIDE_CAP, type RideStage } from "../tower/elevator";
import { roverRuntime } from "../rover/runtime";
import { sceneSettings } from "../scene/settings";
import type { FloorLayout, Vec2 } from "../types";
import { ARRIVAL_HEADING, cameraBehindHeading, glidePose, glideProgress, shoulderPose, stepGlide } from "./arrival";
import { boostView } from "./boostView";
import { cameraWorld, clampCamera, type CameraWorld } from "./collision";
import { blendPoses, CAMERA_FAR, CAMERA_NEAR, easeBlend, FIRST_PERSON, firstPersonPose, viewSuspended } from "./firstPerson";
import { cameraFocus } from "./focus";
import { followEase, followOffsetScale } from "./offset";
import { activeZone, createOrbitState, KEY_PITCH_SPEED, KEY_ROTATE_SPEED, primeZone, resetView, rotate, rotateStep, setPitchRange, stepOrbit, updateZone, wrapPi, zoneAt, zoomBy, type OrbitState, type ViewZone } from "./orbit";
import { introRuntime, resetIntroRuntime, setReveal } from "../intro/runtime";
import { INTRO, introFace, introFog, introHeading, introPlan, introPose, reducedVeil, revealRadius, skipsIntro, type IntroPlan } from "./intro";
import {
  FOLLOW_LOOK_AHEAD,
  followForward,
  followPose,
  forwardOf,
  hologramShift,
  pitchRange,
  railForward,
  railPose,
  selectRig,
  springFactor,
  type CameraPose,
  type Vec3,
} from "./rigs";

/** First person waits while the rover drives itself, rides, beams, or a room, the hologram or the intro holds the view. */
function holdThirdPerson(s: HQState): boolean {
  return viewSuspended({ phase: s.phase, ride: s.ride !== null, beam: s.beam !== null, mission: s.mission?.status === "running", driving: roverRuntime.driving });
}

const toVec3 = (v: Vector3): Vec3 => [v.x, v.y, v.z];

/** The floor's arrival view zone: the zone at its arrival point for a rover heading east (null without one). */
function arrivalZone(layout: FloorLayout | undefined): ViewZone | null {
  return layout?.arrival ? zoneAt(layout.id, { ...layout.arrival, heading: ARRIVAL_HEADING }, layout.viewZones) : null;
}

/** Applies a floor's arrival view at once (rail-aware on L2; elsewhere a stale L2 zone rail yaw goes back to the nearest side view). */
function primeArrival(orbit: OrbitState, zone: ViewZone, floor: FloorId, cls: HQState["device"]["camera"]): void {
  primeZone(orbit, zone, cls, floor === "L2");
  if (floor !== "L2" && orbit.zoneRailYaw !== null) {
    orbit.railYaw = orbit.railYawTarget = orbit.railYaw - wrapPi(orbit.railYaw);
    orbit.zoneRailYaw = null;
  }
}

/**
 * Applies the active camera rig every frame with critically damped smoothing. The camera turns all the
 * way around the rover on every floor (drag, twist, trackpad, Q/E, buttons) and tilts from just above
 * the floor to near top-down (drag, R/F, two-finger drag); low cameras are pulled in out of walls.
 * Zooming in past the closest distance glides into first person: the smoothed third-person pose is
 * mixed toward the rover's eyes by the orbit blend, so `blend = 0` is exactly the third-person camera.
 */
export function CameraDirector({
  held,
  railAxis = [],
  layouts,
}: {
  held: RefObject<Set<string>>;
  railAxis?: readonly Vec2[];
  layouts?: Record<FloorId, FloorLayout>;
}) {
  const local = useRef({
    orbit: createOrbitState(),
    now: 0,
    introStart: null as number | null,
    ready: false,
    pos: new Vector3(),
    target: new Vector3(),
    desiredPos: new Vector3(),
    desiredTarget: new Vector3(),
    /** Drawn camera after the first-person mix (equal to pos and target while the blend is 0). */
    outPos: new Vector3(),
    outTarget: new Vector3(),
    shift: { x: 0, y: 0 },
    /** Rover position scratch for the intro fog distance. */
    introAt: new Vector3(),
    /** A skipped intro: cut (no glide) to the follow camera on the next frame. */
    cut: false,
    /** Drive, turn, zoom, reset or Esc input during the intro: the intro is skipped on the next frame. */
    skip: false,
    /** The intro timeline: rebuilt every boot frame (the end pose follows a resize), frozen from the first intro frame. */
    plan: null as IntroPlan | null,
    /** Boost response this frame: FOV kick (degrees) and follow distance factor. */
    boost: { fovKick: 0, pull: 1 },
    /** Arrival glide out of the elevator car (Round 8 J): seconds since it started and the destination; null when none runs. */
    glide: null as { t: number; to: FloorId } | null,
    /** Stage of the stored ride on the previous frame (null without a ride). */
    prevStage: null as RideStage | null,
  });

  useEffect(
    () =>
      intents.on((intent) => {
        const { orbit } = local.current;
        const s = getHQStore().getState();
        // Drive, turn, zoom, reset or Esc during the intro skips it (the boot ignores input).
        if (skipsIntro(s.phase, intent.type)) local.current.skip = true;
        // Any turn, zoom or reset hands the arrival glide over to the normal camera, which eases on from the drawn pose.
        if (intent.type === "orbit" || intent.type === "zoom" || intent.type === "view") local.current.glide = null;
        const rail = selectRig(s.phase, s.floor) === "rail";
        if (intent.type === "orbit") {
          // On L2 a one-finger swipe scrubs through the years; it does not turn the view.
          if (rail && intent.source === "touch") return;
          if (intent.smooth) rotateStep(orbit, Math.sign(intent.dyaw), rail);
          else rotate(orbit, intent.dyaw, intent.dpitch ?? 0, rail);
        } else if (intent.type === "zoom") {
          // Past the closest distance this enters first person, but not while the view is held in third person.
          zoomBy(orbit, intent.factor, !holdThirdPerson(s));
        } else if (intent.type === "view") {
          resetView(orbit);
        }
      }),
    [],
  );

  useFrame((three, rawDt) => {
    const camera = three.camera as PerspectiveCamera;
    const scene = three.scene;
    const s = getHQStore().getState();
    // During a ride the camera eases with the car's per-frame cap, so a long frame pauses both instead
    // of the camera catching up in one jump (R5 P6).
    const dt = Math.min(rawDt, s.ride && s.ride.stage !== "toDoor" ? RIDE_CAP.max : MAX_FRAME_DT);
    const l = local.current;
    l.now += dt;
    const cls = s.device.camera;
    const rig = selectRig(s.phase, s.floor);
    const rail = rig === "rail";
    const roverTarget: Vec3 = [roverRuntime.x, roverRuntime.y + 1, roverRuntime.z];

    const { orbit } = l;
    setPitchRange(orbit, pitchRange(cls, rail ? "rail" : "follow"));
    const exploring = s.phase === "explore" || s.phase === "elevator";
    const keys = held.current ?? [];
    const axis = exploring ? rotateAxisFromKeys(keys) : 0;
    const tilt = exploring ? pitchAxisFromKeys(keys) : 0;
    if (axis || tilt) rotate(orbit, axis * KEY_ROTATE_SPEED * dt, tilt * KEY_PITCH_SPEED * dt, rail);
    // The session spawn (the L1 kiosk stop, a `prime` zone) starts in its zone's view at once: the intro flies into
    // that view and the first frame shows it, with no turn afterwards. Other zones keep easing in (never under reduced motion).
    // A deep link that spawns on an arrival point (L4, RF) opens on the arrival view too (rail-aware).
    if (!l.ready || s.phase === "boot" || s.phase === "intro") {
      const zone = zoneAt(s.floor, roverRuntime, layouts?.[s.floor].viewZones);
      if (zone?.prime || zone?.arrivalOnly) primeZone(orbit, zone, cls, s.floor === "L2");
    }

    // The arrival roll-on (the Director drives the rover from the car to the arrival point). A roll-on still pending
    // while the visitor steers does not start (the Director waits for the keys or the stick to let go), so it does not count.
    const arrival = roverRuntime.autopilot?.arrival ? roverRuntime.autopilot.state : null;
    const rollingOn = arrival === "driving" || (arrival === "pending" && !roverRuntime.steering);
    // Arrival glide (Round 8 J): when the car doors start to open, the camera starts over the rover's shoulder
    // in the car and glides to the destination's arrival view, then holds it (snapped to the rover) until the
    // roll-on ends. It ends at once on manual steering or a key turn, a new ride, a beam, or a room or the hologram
    // (turn and zoom intents end it in the intents handler). Reduced motion has no doors stage: it cuts to the
    // arrival view on the frame the ride ends, with the rover already on the arrival point.
    const stage = s.ride?.stage ?? null;
    // The destination's arrival zone, looked up only on the frame the doors start to open (the glide may start then).
    const destZone = s.ride && stage === "opening" && l.prevStage !== "opening" && !s.reducedMotion ? arrivalZone(layouts?.[s.ride.to]) : null;
    const step = stepGlide(l.glide, {
      dt,
      stage,
      prevStage: l.prevStage,
      to: s.ride?.to ?? null,
      reduced: s.reducedMotion,
      hasZone: destZone !== null,
      interrupted: roverRuntime.steering || axis !== 0 || tilt !== 0 || s.beam !== null || !exploring,
      rollingOn,
    });
    if (step.started && destZone && s.ride) primeArrival(orbit, destZone, s.ride.to, cls);
    // This sees the ride end on the frame the Director ends it (rover on the arrival point, `cameraSnap` set): both
    // `useFrame`s use the default priority 0 and R3F runs equal priorities in subscription order, which is mount
    // order here (Scene.tsx mounts the Director just before the CameraDirector).
    if (!s.ride && l.prevStage !== null && l.prevStage !== "toDoor" && s.reducedMotion) {
      const zone = arrivalZone(layouts?.[s.floor]);
      if (zone && zoneAt(s.floor, roverRuntime, layouts?.[s.floor].viewZones)?.id === zone.id) {
        primeArrival(orbit, zone, s.floor, cls);
        // The follow look-ahead reads the last drawn forward (still the origin's view): cut straight to the settled one.
        if (s.floor !== "L2") roverRuntime.cameraForward = followForward(cls, orbit.yaw);
      }
    }
    l.prevStage = stage;
    l.glide = step.glide;
    const glide = l.glide;

    // The arrival view holds while the camera glides and the rover rolls on to the arrival point, so it parks in the primed zone.
    // A pending roll-on while the visitor steers releases the hold: the zones follow the steered rover.
    if (exploring && !s.ride && !glide && !rollingOn) {
      updateZone(orbit, activeZone(zoneAt(s.floor, roverRuntime, layouts?.[s.floor].viewZones), orbit), s.reducedMotion, cls, rail);
    }
    stepOrbit(orbit, dt, s.reducedMotion, rig === "intro" || holdThirdPerson(s) || glide !== null);
    roverRuntime.cameraYaw = orbit.yaw;
    roverRuntime.cameraRailYaw = orbit.railYaw;
    roverRuntime.cameraMode = orbit.firstPerson ? "first" : "third";
    roverRuntime.cameraBlend = orbit.blend;
    roverRuntime.cameraZoom = orbit.zoom;
    roverRuntime.cameraLook = orbit.look;

    // Camera collision works against the current floor; rides cross floors, so it rests during them.
    const layout = layouts && !s.ride ? layouts[s.floor] : undefined;
    const world: CameraWorld | null = layout ? cameraWorld(layout, floorY(s.floor)) : null;

    let desired: CameraPose;
    let snap = false;
    /** Fog range the intro sets this frame (applied with no smoothing), null outside it. "ring" follows the reveal from the drawn camera. */
    let introFogMode: "ring" | "follow" | null = null;
    /** The rig the drawn pose belongs to: during a glide the destination's (the store still holds the origin floor until the ride ends). */
    const drawRail = glide ? glide.to === "L2" : rail;
    const focus = s.phase === "hologram" ? cameraFocus.pose : null;
    // The settled rail or follow pose: one helper for the glide's end and the normal branches, so the handover never pops.
    const rigPose = (onRail: boolean, forward: Vec2): CameraPose => {
      // In an arrival zone the rail looks down the road behind the rover: the look-ahead runs into the screen, so the rover sits centered.
      if (onRail) {
        const axisZ = roadZAt(railAxis, roverRuntime.x);
        return railPose(cls, roverRuntime.x, roverRuntime.y, orbit.zoom * l.boost.pull, roverRuntime.z, orbit.railYaw, axisZ, orbit.pitch, orbit.zoneRailYaw !== null);
      }
      // Look slightly ahead of the rover so more of the floor in front is visible.
      const ahead = FOLLOW_LOOK_AHEAD[cls];
      const scale = followOffsetScale(cls, three.size.width / Math.max(1, three.size.height));
      return followPose(cls, [roverTarget[0] + forward.x * ahead, roverTarget[1], roverTarget[2] + forward.z * ahead], orbit.yaw, orbit.zoom * scale * l.boost.pull, orbit.pitch);
    };
    // Boost: widen and pull back a little (third person), a smaller FOV kick in first person; never under reduced motion.
    boostView(roverRuntime.boost, orbit.blend, !s.reducedMotion && !focus && rig !== "intro", l.boost);
    roverRuntime.boostFov = l.boost.fovKick;
    roverRuntime.boostPull = l.boost.pull;
    if (focus) {
      desired = focus;
      snap = s.reducedMotion;
    } else if (rig === "intro") {
      // The follow pose the intro hands over to: the primed spawn view, its look-ahead and the screen's offset scale.
      const ahead = FOLLOW_LOOK_AHEAD[cls];
      const f = followForward(cls, orbit.yaw);
      const scale = followOffsetScale(cls, three.size.width / Math.max(1, three.size.height));
      const end = followPose(cls, [roverTarget[0] + f.x * ahead, roverTarget[1], roverTarget[2] + f.z * ahead], orbit.yaw, orbit.zoom * scale, orbit.pitch);
      const rover: Vec3 = [roverRuntime.x, roverRuntime.y, roverRuntime.z];
      snap = true;
      if (s.phase === "boot") {
        // The dark wake close-up, under any motion setting: Rover's face off, turned to the orbit's start, nothing revealed.
        l.introStart = null;
        l.skip = false;
        l.plan = introPlan(cls, rover, LOBBY.spawnHeading, end);
        desired = introPose(l.plan, 0);
        introRuntime.active = true;
        introRuntime.t = 0;
        introRuntime.face = "off";
        introRuntime.heading = l.plan.wakeHeading;
        introRuntime.veil = 0;
        setReveal(0, roverRuntime);
        introFogMode = "ring";
      } else if (l.skip) {
        // Input skipped the intro: cut to the follow pose under a veil that fades out (IntroVeil).
        const veil = s.reducedMotion && l.introStart !== null ? introRuntime.veil : 1;
        s.finishIntro();
        l.cut = true;
        l.skip = false;
        l.introStart = null;
        l.plan = null;
        resetIntroRuntime();
        introRuntime.skipped = true;
        introRuntime.veil = veil;
        desired = end;
        introFogMode = "follow";
      } else if (s.reducedMotion) {
        // Reduced motion: cut to the follow pose with everything revealed under a veil that clears over INTRO.reduced.
        desired = end;
        if (l.introStart === null) {
          l.introStart = l.now;
          resetIntroRuntime();
        }
        const t = l.now - l.introStart;
        introRuntime.veil = reducedVeil(t);
        if (t >= INTRO.reduced) {
          s.finishIntro();
          introRuntime.veil = 0;
          l.introStart = null;
          l.plan = null;
        }
        introFogMode = "follow";
      } else {
        // The wake close-up, then the reveal orbit lands on the follow pose. The plan stays frozen from the first intro frame.
        l.introStart ??= l.now;
        l.plan ??= introPlan(cls, rover, LOBBY.spawnHeading, end);
        const t = l.now - l.introStart;
        desired = introPose(l.plan, t);
        introRuntime.active = true;
        introRuntime.t = t;
        introRuntime.face = introFace(t);
        introRuntime.heading = introHeading(l.plan, t);
        setReveal(revealRadius(t), roverRuntime);
        introFogMode = "ring";
        if (t >= INTRO.duration) {
          s.finishIntro();
          resetIntroRuntime();
          l.introStart = null;
          l.plan = null;
        }
      }
    } else if (glide) {
      // The settled arrival view of the destination's rig (with its settled look-ahead), then over the shoulder toward it.
      const end = rigPose(drawRail, followForward(cls, orbit.yaw));
      // In the car the rover leaves east (on the frame the doors start to open it still faces the ride's back wall).
      const heading = s.ride ? ARRIVAL_HEADING : roverRuntime.heading;
      const start = shoulderPose([roverRuntime.x, roverRuntime.y, roverRuntime.z], heading, end.fov);
      desired = glidePose(start, end, glideProgress(glide.t));
      snap = true;
    } else {
      desired = rigPose(rail, roverRuntime.cameraForward);
    }
    // A low third-person camera stays above the floor and out of obstacles, and a follow camera never looks past the slab
    // edge into the void under it (the bottom of the view stays on the slab): pulled in along its view ray. Default high
    // poses never move. The L2 rail view stands beside the narrow road by design, so it skips the view rule.
    const clamped = world !== null && !focus && rig !== "intro" && !glide;
    const viewFov = rail ? undefined : desired.fov;
    if (clamped) desired = { ...desired, position: clampCamera(desired.target, desired.position, world, roverTarget, viewFov) };

    // A teleport moved the rover far along the road: cut to it instead of gliding across the floor.
    if (roverRuntime.cameraSnap) {
      roverRuntime.cameraSnap = false;
      if (!focus) snap = true;
    }
    if (l.cut && rig !== "intro") {
      snap = true;
      l.cut = false;
    }

    l.desiredPos.set(...desired.position);
    l.desiredTarget.set(...desired.target);
    if (!l.ready || snap) {
      l.pos.copy(l.desiredPos);
      l.target.copy(l.desiredTarget);
      l.ready = true;
    } else {
      const k = followEase(dt, s.reducedMotion);
      l.pos.lerp(l.desiredPos, k);
      l.target.lerp(l.desiredTarget, k);
    }
    // The spring runs straight between two clamped poses and may cut through blocked space (around a wall, off the slab
    // edge while turning): the drawn pose is clamped too, so it never shows the void or the inside of a wall for a frame.
    if (clamped) {
      const drawn = clampCamera(toVec3(l.target), toVec3(l.pos), world, roverTarget, viewFov);
      l.pos.set(drawn[0], drawn[1], drawn[2]);
    }

    // First person: mix the smoothed third-person camera toward the rover's eyes by the eased blend.
    const fp = orbit.blend > 0 && rig !== "intro";
    let fov = desired.fov;
    let forward: Vec2 = drawRail ? railForward(orbit.railYaw) : forwardOf(desired);
    l.outPos.copy(l.pos);
    l.outTarget.copy(l.target);
    if (fp) {
      const look = drawRail ? railForward(orbit.railYaw) : followForward(cls, orbit.yaw);
      const eye = firstPersonPose(cls, [roverRuntime.x, roverRuntime.y, roverRuntime.z], look, orbit.look);
      const mixed = blendPoses({ position: toVec3(l.pos), target: toVec3(l.target), fov: desired.fov }, eye, orbit.blend);
      const position = world ? clampCamera(eye.position, mixed.position, world) : mixed.position;
      l.outPos.set(...position);
      l.outTarget.set(...mixed.target);
      fov = mixed.fov;
      if (easeBlend(orbit.blend) >= 0.5) forward = look;
    }
    fov += l.boost.fovKick;
    camera.position.copy(l.outPos);
    camera.lookAt(l.outTarget);
    const near = fp ? FIRST_PERSON.near : CAMERA_NEAR;
    const far = fp && orbit.blend >= 1 ? FIRST_PERSON.far : CAMERA_FAR;
    let projection = false;
    if (camera.near !== near || camera.far !== far) {
      camera.near = near;
      camera.far = far;
      projection = true;
    }
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = snap || fp ? fov : camera.fov + (fov - camera.fov) * springFactor(dt);
      projection = true;
    }
    if (projection) camera.updateProjectionMatrix();
    // Keep the rover (or the hologram) clear of HUD panels by shifting the view window (appendix 04).
    const { width, height } = three.size;
    const want =
      s.phase === "hologram" && focus
        ? hologramShift(width / Math.max(1, height))
        : s.phase === "room" && s.activeRoom
          ? cameraShift(drawerLayout(width, height), width)
          : { x: 0, y: 0 };
    const ks = s.reducedMotion ? 1 : springFactor(dt);
    l.shift.x += (want.x - l.shift.x) * ks;
    l.shift.y += (want.y - l.shift.y) * ks;
    if (Math.abs(l.shift.x) > 1e-3 || Math.abs(l.shift.y) > 1e-3) camera.setViewOffset(width, height, l.shift.x * width, l.shift.y * height, width, height);
    else if (camera.view?.enabled) camera.clearViewOffset();

    // Steering is camera-relative: on L2 straight away from the camera, in first person where the eyes look.
    if (!focus) roverRuntime.cameraForward = forward;
    roverRuntime.cameraPosition = toVec3(l.outPos);
    roverRuntime.cameraBehind = cameraBehindHeading(roverRuntime.cameraPosition, [roverRuntime.x, roverRuntime.y, roverRuntime.z]);
    roverRuntime.arrivalGlide = glide ? glideProgress(glide.t) : -1;
    roverRuntime.cameraElevation = Math.atan2(l.outPos.y - l.outTarget.y, Math.hypot(l.outPos.x - l.outTarget.x, l.outPos.z - l.outTarget.z));
    if (scene.fog instanceof Fog) {
      // Ease the linear fog range between rigs so the first-person glide does not pop.
      // A glide uses the destination's range from its first frame (a cut into the car), so the fog does not pop when the ride ends.
      const fogRig = glide ? (drawRail ? "rail" : "follow") : rig;
      let { near: fogNear, far: fogFar } = sceneSettings(s.tier, focus ? "focus" : fp && orbit.blend >= 0.5 ? "first" : fogRig).fog;
      // The boot and the intro: everything past the reveal ring (as seen from the drawn camera) fades into the night,
      // then the follow range, so explore starts on it.
      if (introFogMode) {
        const follow = sceneSettings(s.tier, "follow").fog;
        const range = introFogMode === "ring" ? introFog(l.outPos.distanceTo(l.introAt.set(roverRuntime.x, roverRuntime.y, roverRuntime.z)), introRuntime.reveal, follow) : follow;
        fogNear = range.near;
        fogFar = range.far;
      }
      const kf = snap || introFogMode ? 1 : springFactor(dt);
      scene.fog.near += (fogNear - scene.fog.near) * kf;
      scene.fog.far += (fogFar - scene.fog.far) * kf;
    }
  });

  return null;
}
