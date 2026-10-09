"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { FogExp2, PerspectiveCamera, Vector3 } from "three";
import { cameraShift, drawerLayout } from "@/hud/drawer/layout";
import { getHQStore } from "@/store/useHQStore";
import { intents, rotateAxisFromKeys } from "../input/intents";
import { MAX_FRAME_DT } from "../rover/controller";
import { roverRuntime } from "../rover/runtime";
import { cameraFocus } from "./focus";
import { createOrbitState, KEY_ROTATE_SPEED, resetView, rotate, rotateStep, stepOrbit, updateZone, zoneAt, zoomBy } from "./orbit";
import {
  followPose,
  forwardOf,
  hologramShift,
  INTRO_DURATION,
  introPose,
  railPose,
  selectRig,
  springFactor,
  type CameraPose,
} from "./rigs";

const FOG_DENSITY = 0.012;
const RAIL_FORWARD = { x: 0, z: -1 };
const INTRO_FOG_DENSITY = 0.005;
const FOLLOW_LOOK_AHEAD = { desktop: 4, tablet: 4, mobile: 5 } as const;

/**
 * Applies the active camera rig every frame with critically damped smoothing. The follow rig
 * orbits freely (drag, twist, trackpad, Q/E, buttons); the view persists until reset.
 */
export function CameraDirector({ held }: { held: RefObject<Set<string>> }) {
  const local = useRef({
    orbit: createOrbitState(),
    now: 0,
    introStart: null as number | null,
    ready: false,
    pos: new Vector3(),
    target: new Vector3(),
    desiredPos: new Vector3(),
    desiredTarget: new Vector3(),
    shift: { x: 0, y: 0 },
  });

  useEffect(
    () =>
      intents.on((intent) => {
        const { orbit } = local.current;
        const s = getHQStore().getState();
        const rail = selectRig(s.phase, s.floor) === "rail";
        if (intent.type === "orbit") {
          // On the L2 rail a one-finger swipe scrubs through the years; it does not turn the view.
          if (rail && intent.source === "touch") return;
          if (intent.smooth) rotateStep(orbit, Math.sign(intent.dyaw), rail);
          else rotate(orbit, intent.dyaw, intent.dpitch ?? 0, rail);
        } else if (intent.type === "zoom") {
          zoomBy(orbit, intent.factor);
        } else if (intent.type === "view") {
          resetView(orbit);
        }
      }),
    [],
  );

  useFrame((three, rawDt) => {
    const camera = three.camera as PerspectiveCamera;
    const scene = three.scene;
    const dt = Math.min(rawDt, MAX_FRAME_DT);
    const l = local.current;
    l.now += dt;
    const s = getHQStore().getState();
    const cls = s.device.camera;
    const rig = selectRig(s.phase, s.floor);
    const roverTarget: [number, number, number] = [roverRuntime.x, roverRuntime.y + 1, roverRuntime.z];

    const { orbit } = l;
    const exploring = s.phase === "explore" || s.phase === "elevator";
    const axis = exploring ? rotateAxisFromKeys(held.current ?? []) : 0;
    if (axis) rotate(orbit, axis * KEY_ROTATE_SPEED * dt, 0, rig === "rail");
    if (exploring && !s.ride) updateZone(orbit, zoneAt(s.floor, roverRuntime), s.reducedMotion);
    stepOrbit(orbit, dt, s.reducedMotion);
    roverRuntime.cameraYaw = orbit.yaw;

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
      } else if (s.reducedMotion) {
        desired = end;
        s.finishIntro();
      } else {
        l.introStart ??= l.now;
        const t = l.now - l.introStart;
        desired = introPose(cls, t, end);
        if (t >= INTRO_DURATION) s.finishIntro();
      }
    } else if (rig === "rail") {
      desired = railPose(cls, roverRuntime.x, roverRuntime.y, orbit.zoom, roverRuntime.z, orbit.railYaw);
    } else {
      // Look slightly ahead of the rover so more of the floor in front is visible.
      const ahead = FOLLOW_LOOK_AHEAD[cls];
      const f = roverRuntime.cameraForward;
      desired = followPose(cls, [roverTarget[0] + f.x * ahead, roverTarget[1], roverTarget[2] + f.z * ahead], orbit.yaw, orbit.zoom, orbit.pitch);
    }

    l.desiredPos.set(...desired.position);
    l.desiredTarget.set(...desired.target);
    if (!l.ready || snap) {
      l.pos.copy(l.desiredPos);
      l.target.copy(l.desiredTarget);
      l.ready = true;
    } else {
      const k = springFactor(dt);
      l.pos.lerp(l.desiredPos, k);
      l.target.lerp(l.desiredTarget, k);
    }
    camera.position.copy(l.pos);
    camera.lookAt(l.target);
    if (Math.abs(camera.fov - desired.fov) > 0.01) {
      camera.fov = snap ? desired.fov : camera.fov + (desired.fov - camera.fov) * springFactor(dt);
      camera.updateProjectionMatrix();
    }
    // Keep the rover (or the hologram) clear of HUD panels by shifting the view window (appendix 04).
    const { width, height } = three.size;
    const want =
      s.phase === "hologram" && focus
        ? hologramShift(width / Math.max(1, height))
        : s.phase === "room" && s.activeRoom
          ? cameraShift(drawerLayout(width, height))
          : { x: 0, y: 0 };
    const ks = s.reducedMotion ? 1 : springFactor(dt);
    l.shift.x += (want.x - l.shift.x) * ks;
    l.shift.y += (want.y - l.shift.y) * ks;
    if (Math.abs(l.shift.x) > 1e-3 || Math.abs(l.shift.y) > 1e-3) camera.setViewOffset(width, height, l.shift.x * width, l.shift.y * height, width, height);
    else if (camera.view?.enabled) camera.clearViewOffset();

    // The rail looks slightly ahead in x; steer along the corridor axes so D drives straight down it.
    if (!focus) roverRuntime.cameraForward = rig === "rail" ? RAIL_FORWARD : forwardOf(desired);
    roverRuntime.cameraPosition = [l.pos.x, l.pos.y, l.pos.z];
    if (scene.fog instanceof FogExp2) scene.fog.density = rig === "intro" ? INTRO_FOG_DENSITY : FOG_DENSITY;
  });

  return null;
}
