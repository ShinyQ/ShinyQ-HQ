"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { FogExp2, PerspectiveCamera, Vector3 } from "three";
import { getHQStore } from "@/store/useHQStore";
import { intents } from "../input/intents";
import { MAX_FRAME_DT } from "../rover/controller";
import { roverRuntime } from "../rover/runtime";
import {
  clampYaw,
  clampZoom,
  followPose,
  forwardOf,
  INTRO_DURATION,
  introPose,
  railPose,
  selectRig,
  springFactor,
  type CameraPose,
} from "./rigs";

const FOG_DENSITY = 0.012;
const INTRO_FOG_DENSITY = 0.005;
const YAW_RETURN_DELAY = 2;
const FOLLOW_LOOK_AHEAD = { desktop: 4, tablet: 4, mobile: 5 } as const;

/** Applies the active camera rig every frame with critically damped smoothing. */
export function CameraDirector() {
  const local = useRef({
    yaw: 0,
    zoom: 1,
    lastOrbit: -Infinity,
    now: 0,
    introStart: null as number | null,
    ready: false,
    pos: new Vector3(),
    target: new Vector3(),
    desiredPos: new Vector3(),
    desiredTarget: new Vector3(),
  });

  useEffect(
    () =>
      intents.on((intent) => {
        const l = local.current;
        if (intent.type === "orbit") {
          l.yaw = clampYaw(l.yaw + intent.dyaw);
          l.lastOrbit = l.now;
        } else if (intent.type === "zoom") {
          l.zoom = clampZoom(l.zoom * intent.factor);
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

    if (l.now - l.lastOrbit > YAW_RETURN_DELAY) l.yaw += (0 - l.yaw) * springFactor(dt, 0.35);

    let desired: CameraPose;
    let snap = false;
    if (rig === "intro") {
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
      desired = railPose(cls, roverRuntime.x, roverRuntime.y, l.zoom);
    } else {
      // Look slightly ahead of the rover so more of the floor in front is visible.
      const ahead = FOLLOW_LOOK_AHEAD[cls];
      const f = roverRuntime.cameraForward;
      desired = followPose(cls, [roverTarget[0] + f.x * ahead, roverTarget[1], roverTarget[2] + f.z * ahead], l.yaw, l.zoom);
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
    roverRuntime.cameraForward = forwardOf(desired);
    roverRuntime.cameraPosition = [l.pos.x, l.pos.y, l.pos.z];
    if (scene.fog instanceof FogExp2) scene.fog.density = rig === "intro" ? INTRO_FOG_DENSITY : FOG_DENSITY;
  });

  return null;
}
