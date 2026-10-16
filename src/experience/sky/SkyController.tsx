"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { BloomEffect } from "postprocessing";
import { Color, DirectionalLight, HemisphereLight, Fog, InstancedBufferAttribute, Object3D, PlaneGeometry, SphereGeometry, type Group, type InstancedMesh } from "three";
import { readDayNight, subscribeDayNight } from "@/lib/day-night";
import { useHQStore } from "@/store/useHQStore";
import { createHoloMaterial, HOLO_MODE } from "../fx/holoFx";
import { neonColor } from "../fx/materials";
import { useDispose } from "../fx/useDispose";
import { useUniformTime } from "../fx/useUniformTime";
import { postHandle } from "../scene/postHandle";
import { sceneSettings } from "../scene/settings";
import type { GpuTier } from "../types";
import { clockPhase, createSkyState, parseSkyParam, resolveSkyMode, skyState, type SkyMode } from "./dayNight";
import { applyDome, applyOrbs } from "./applySky";
import { skyRuntime } from "./skyRuntime";

const NO_RAYCAST = () => null;
const DOME_RADIUS = 400;
const EPSILON = 1e-5;

/**
 * Day and night (Round 8 K): the two scene lights, a camera-centered sky dome and the sun and moon
 * quads (both on the shared instanced holo program), plus the scene background, fog color and the
 * full tier's bloom intensity, all driven by one phase (`sky/dayNight.ts`). Phase 0 is today's night.
 */
export function SkyController({ tier }: { tier: GpuTier }) {
  const settings = useMemo(() => sceneSettings(tier), [tier]);
  const reduced = useHQStore((s) => s.reducedMotion);
  const camera = useThree((s) => s.camera);
  const group = useRef<Group>(null);
  const orbMesh = useRef<InstancedMesh>(null);
  const hemi = useRef<HemisphereLight>(null);
  const dir = useRef<DirectionalLight>(null);

  // The sky color is computed per pixel from the view direction, so a coarse dome (48 triangles) looks the same; its nearest face plane stays about 340 u from the camera, beyond every opaque piece of the scene.
  const domeGeometry = useMemo(() => new SphereGeometry(DOME_RADIUS, 8, 4), []);
  useDispose(domeGeometry);
  const orbAlpha = useMemo(() => new InstancedBufferAttribute(new Float32Array(2), 1), []);
  const orbGeometry = useMemo(() => {
    const g = new PlaneGeometry(1, 1);
    g.setAttribute("aAlpha", orbAlpha);
    return g;
  }, [orbAlpha]);
  useDispose(orbGeometry);
  const domeMaterial = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.sky, additive: false }), []);
  const orbMaterial = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.orb, params: [0.32, 5, 0.22, 0] }), []);
  useDispose(domeMaterial);
  useDispose(orbMaterial);
  const domeColor = useMemo(() => new Float32Array([1, 1, 1]), []);
  const orbColor = useMemo(() => new Float32Array([...neonColor("#ffa860", 1.8, tier).toArray(), ...neonColor("#dfe6ff", 1.4, tier).toArray()]), [tier]);
  useUniformTime(useMemo(() => [domeMaterial, orbMaterial], [domeMaterial, orbMaterial]));

  const mode = useRef<SkyMode>({ source: "held", phase: 0 });
  const last = useRef<number | null>(null);
  const bloomWritten = useRef<BloomEffect | null>(null);
  useEffect(() => {
    const resolve = () => {
      mode.current = resolveSkyMode({
        param: parseSkyParam(window.location.search),
        pref: readDayNight(),
        reducedMotion: reduced,
        automated: navigator.webdriver === true,
      });
      last.current = null;
    };
    resolve();
    return subscribeDayNight(resolve);
  }, [reduced]);

  const state = useMemo(() => createSkyState(), []);
  const scratch = useMemo(() => new Object3D(), []);

  useFrame(({ scene }) => {
    const sky = group.current;
    if (sky) {
      sky.position.copy(camera.position);
      // Full tier: hold the dome and orbs back until the composer exists, or they compile a second holo program against the canvas (sRGB) instead of the composer's linear input.
      const show = tier !== "full" || postHandle.get()?.composer() != null;
      if (sky.visible !== show) sky.visible = show;
    }
    // The full tier's composer mounts lazily (and can remount): write the bloom into whichever instance is live.
    const live = postHandle.get()?.bloom() ?? null;
    if (live && live !== bloomWritten.current) {
      live.intensity = state.bloom;
      bloomWritten.current = live;
    }
    const m = mode.current;
    const phase = m.phase ?? clockPhase(Date.now());
    if (last.current !== null && Math.abs(phase - last.current) <= EPSILON) return;
    last.current = phase;
    skyState(phase, state);

    if (scene.background instanceof Color) scene.background.copy(state.fog);
    if (scene.fog instanceof Fog) scene.fog.color.copy(state.fog);
    if (hemi.current) {
      hemi.current.color.copy(state.hemisphere.sky);
      hemi.current.groundColor.copy(state.hemisphere.ground);
      hemi.current.intensity = state.hemisphere.intensity;
    }
    if (dir.current) {
      dir.current.color.copy(state.directional.color);
      dir.current.intensity = state.directional.intensity;
    }
    if (live) live.intensity = state.bloom;

    applyDome(domeMaterial, state);
    if (orbMesh.current) applyOrbs(orbMesh.current, orbAlpha, state, scratch);

    skyRuntime.phase = phase;
    skyRuntime.day = state.day;
    skyRuntime.stars = state.stars;
    skyRuntime.source = m.source;
    skyRuntime.fog = state.fog.getHex();
    skyRuntime.applied += 1;
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={settings.hemisphere} />
      <directionalLight ref={dir} color={settings.directional.color} position={settings.directional.position} intensity={settings.directional.intensity} />
      <group ref={group} name="sky-dome">
        <instancedMesh args={[domeGeometry, domeMaterial, 1]} renderOrder={-100} frustumCulled={false} raycast={NO_RAYCAST}>
          <instancedBufferAttribute attach="instanceColor" args={[domeColor, 3]} />
        </instancedMesh>
        <instancedMesh ref={orbMesh} args={[orbGeometry, orbMaterial, 2]} renderOrder={-99} frustumCulled={false} raycast={NO_RAYCAST}>
          <instancedBufferAttribute attach="instanceColor" args={[orbColor, 3]} />
        </instancedMesh>
      </group>
    </>
  );
}
