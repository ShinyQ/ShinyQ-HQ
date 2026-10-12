"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { Fog, PerspectiveCamera, Vector3 } from "three";
import type { FloorId } from "@/content/schema";
import { cameraShift, drawerLayout } from "@/hud/drawer/layout";
import { getHQStore, type HQState } from "@/store/useHQStore";
import { floorY } from "../config";
import { roadZAt } from "../floors/career/layout";
import { intents, pitchAxisFromKeys, rotateAxisFromKeys } from "../input/intents";
import { MAX_FRAME_DT } from "../rover/controller";
import { RIDE_CAP } from "../tower/elevator";
import { roverRuntime } from "../rover/runtime";
import { sceneSettings } from "../scene/settings";
import type { FloorLayout, Vec2 } from "../types";
import { clampCamera, type CameraWorld } from "./collision";
import { blendPoses, CAMERA_FAR, CAMERA_NEAR, easeBlend, FIRST_PERSON, firstPersonPose, viewSuspended } from "./firstPerson";
import { cameraFocus } from "./focus";
import { followEase, followOffsetScale } from "./offset";
import { createOrbitState, KEY_PITCH_SPEED, KEY_ROTATE_SPEED, resetView, rotate, rotateStep, setPitchRange, stepOrbit, updateZone, zoneAt, zoomBy } from "./orbit";
import {
  FOLLOW_LOOK_AHEAD,
  followForward,
  followPose,
  forwardOf,
  hologramShift,
  INTRO_DURATION,
  introPose,
  pitchRange,
  railForward,
  railPose,
  reducedIntroPose,
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
    /** Reduced motion: cut (no glide) from the still intro shot to the follow camera on the next frame. */
    cut: false,
  });

  useEffect(
    () =>
      intents.on((intent) => {
        const { orbit } = local.current;
        const s = getHQStore().getState();
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
    if (exploring && !s.ride) updateZone(orbit, zoneAt(s.floor, roverRuntime, layouts?.[s.floor].viewZones), s.reducedMotion);
    stepOrbit(orbit, dt, s.reducedMotion, rig === "intro" || holdThirdPerson(s));
    roverRuntime.cameraYaw = orbit.yaw;
    roverRuntime.cameraRailYaw = orbit.railYaw;
    roverRuntime.cameraMode = orbit.firstPerson ? "first" : "third";
    roverRuntime.cameraBlend = orbit.blend;
    roverRuntime.cameraZoom = orbit.zoom;
    roverRuntime.cameraLook = orbit.look;

    // Camera collision works against the current floor; rides cross floors, so it rests during them.
    const layout = layouts && !s.ride ? layouts[s.floor] : undefined;
    const world: CameraWorld | null = layout ? { obstacles: layout.obstacles, bounds: layout.bounds, floorY: floorY(s.floor) } : null;

    let desired: CameraPose;
    let snap = false;
    const focus = s.phase === "hologram" ? cameraFocus.pose : null;
    if (focus) {
      desired = focus;
      snap = s.reducedMotion;
    } else if (rig === "intro") {
      const end = followPose(cls, roverTarget);
      snap = true;
      if (s.phase === "boot") {
        l.introStart = null;
        desired = introPose(cls, 0, end);
      } else {
        // The intro always runs its full length; reduced motion holds a still exterior shot instead of the orbit.
        l.introStart ??= l.now;
        const t = l.now - l.introStart;
        desired = s.reducedMotion ? reducedIntroPose(cls, end) : introPose(cls, t, end);
        if (t >= INTRO_DURATION) {
          s.finishIntro();
          l.cut = s.reducedMotion;
        }
      }
    } else if (rail) {
      desired = railPose(cls, roverRuntime.x, roverRuntime.y, orbit.zoom, roverRuntime.z, orbit.railYaw, roadZAt(railAxis, roverRuntime.x), orbit.pitch);
    } else {
      // Look slightly ahead of the rover so more of the floor in front is visible.
      const ahead = FOLLOW_LOOK_AHEAD[cls];
      const f = roverRuntime.cameraForward;
      const scale = followOffsetScale(cls, three.size.width / Math.max(1, three.size.height));
      desired = followPose(cls, [roverTarget[0] + f.x * ahead, roverTarget[1], roverTarget[2] + f.z * ahead], orbit.yaw, orbit.zoom * scale, orbit.pitch);
    }
    // A low third-person camera stays above the floor, on the slab and out of obstacles: pulled in along its view ray. High poses never move.
    if (world && !focus && rig !== "intro") desired = { ...desired, position: clampCamera(desired.target, desired.position, world, roverTarget) };

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

    // First person: mix the smoothed third-person camera toward the rover's eyes by the eased blend.
    const fp = orbit.blend > 0 && rig !== "intro";
    let fov = desired.fov;
    let forward: Vec2 = rail ? railForward(orbit.railYaw) : forwardOf(desired);
    l.outPos.copy(l.pos);
    l.outTarget.copy(l.target);
    if (fp) {
      const look = rail ? railForward(orbit.railYaw) : followForward(cls, orbit.yaw);
      const eye = firstPersonPose(cls, [roverRuntime.x, roverRuntime.y, roverRuntime.z], look, orbit.look);
      const mixed = blendPoses({ position: toVec3(l.pos), target: toVec3(l.target), fov: desired.fov }, eye, orbit.blend);
      const position = world ? clampCamera(eye.position, mixed.position, world) : mixed.position;
      l.outPos.set(...position);
      l.outTarget.set(...mixed.target);
      fov = mixed.fov;
      if (easeBlend(orbit.blend) >= 0.5) forward = look;
    }
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
    roverRuntime.cameraElevation = Math.atan2(l.outPos.y - l.outTarget.y, Math.hypot(l.outPos.x - l.outTarget.x, l.outPos.z - l.outTarget.z));
    if (scene.fog instanceof Fog) {
      // Ease the linear fog range between rigs so the intro fly-in and the first-person glide do not pop.
      const { near: fogNear, far: fogFar } = sceneSettings(s.tier, focus ? "focus" : fp && orbit.blend >= 0.5 ? "first" : rig).fog;
      const kf = snap ? 1 : springFactor(dt);
      scene.fog.near += (fogNear - scene.fog.near) * kf;
      scene.fog.far += (fogFar - scene.fog.far) * kf;
    }
  });

  return null;
}
