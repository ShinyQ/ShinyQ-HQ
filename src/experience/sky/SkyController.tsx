"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BloomEffect } from "postprocessing";
import { Color, DirectionalLight, HemisphereLight, Fog, InstancedBufferAttribute, Object3D, PlaneGeometry, SphereGeometry, type Group, type InstancedMesh } from "three";
import { readDayNight, subscribeDayNight } from "@/lib/day-night";
import { useHQStore } from "@/store/useHQStore";
import { roverRuntime } from "../rover/runtime";
import { createHoloMaterial, HOLO_MODE } from "../fx/holoFx";
import { neonColor } from "../fx/materials";
import { useDispose } from "../fx/useDispose";
import { useUniformTime } from "../fx/useUniformTime";
import { wakeFrameAt } from "../scene/framePacer";
import { postHandle } from "../scene/postHandle";
import { sceneSettings } from "../scene/settings";
import type { GpuTier } from "../types";
import { clockPhase, createSkyState, parseSkyParam, parseSkyValue, resolveSkyMode, skyAzimuth, skyState, underground, type SkyMode } from "./dayNight";
import { applyDome, applyOrbs } from "./applySky";
import { skyRuntime } from "./skyRuntime";

const NO_RAYCAST = () => null;
const DOME_RADIUS = 400;
const EPSILON = 1e-5;

/** Test-only opt-in: the perf lane sets sessionStorage["hq:sky"] so automation draws the sky like a visitor sees it. */
function readSkyOptIn(): string | null {
  try {
    return sessionStorage.getItem("hq:sky");
  } catch {
    return null;
  }
}

/**
 * Day and night (Round 8 K): the two scene lights, a camera-centered sky dome and the sun and moon
 * quads (both on the shared instanced holo program), plus the scene background, fog color and the
 * full tier's bloom intensity, all driven by one phase (`sky/dayNight.ts`). Phase 0 is today's night.
 */
export function SkyController({ tier }: { tier: GpuTier }) {
  const settings = useMemo(() => sceneSettings(tier), [tier]);
  const reduced = useHQStore((s) => s.reducedMotion);
  const cameraClass = useHQStore((s) => s.device.camera);
  const camera = useThree((s) => s.camera);
  const group = useRef<Group>(null);
  const orbMesh = useRef<InstancedMesh>(null);
  const hemi = useRef<HemisphereLight>(null);
  const dir = useRef<DirectionalLight>(null);
  // Full tier: the dome and orbs mount only once the composer exists. Precompile compiles every mounted object (hidden ones too) for the current target, so mounting them earlier pins a second holo program built for the canvas (sRGB) instead of the composer's linear input.
  const [meshesLive, setMeshesLive] = useState(tier !== "full");

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

  const mode = useRef<SkyMode>({ source: "held", phase: 0, still: false });
  const last = useRef<number | null>(null);
  const azimuth = useRef(skyAzimuth(cameraClass));
  // A camera class change (rotate a tablet, resize a window) moves the sun and moon arc: re-apply on the next frame.
  useEffect(() => {
    azimuth.current = skyAzimuth(cameraClass);
    last.current = null;
  }, [cameraClass]);
  const under = useRef(false);
  const bloomWritten = useRef<BloomEffect | null>(null);
  useEffect(() => {
    const resolve = () => {
      mode.current = resolveSkyMode({
        param: parseSkyParam(window.location.search) ?? parseSkyValue(readSkyOptIn()),
        pref: readDayNight(),
        reducedMotion: reduced,
        automated: navigator.webdriver === true,
      });
      // The automation hold's night equals today's background: skip drawing the sky (a costly full-screen pass on CPU renderers).
      // The sky shows only when the mode draws it and the rover is above ground.
      const visible = !mode.current.still && !under.current;
      if (group.current && group.current.visible !== visible) group.current.visible = visible;
      last.current = null;
    };
    resolve();
    return subscribeDayNight(resolve);
  }, [reduced]);
  // Freshly mounted meshes take the sky on the next frame even when the phase has not moved.
  useEffect(() => {
    if (meshesLive) last.current = null;
  }, [meshesLive]);

  const state = useMemo(() => createSkyState(), []);
  const scratch = useMemo(() => new Object3D(), []);

  useFrame(({ scene, clock }) => {
    // B1 is underground: hide the dome and the orbs and hold the night state (phase 0 is today's look) until the rover is back above the Lobby.
    const below = underground(roverRuntime.y);
    if (below !== under.current) {
      under.current = below;
      last.current = null;
      if (group.current) group.current.visible = !mode.current.still && !below;
      skyRuntime.underground = below;
    }
    const sky = group.current;
    if (sky) {
      sky.position.copy(camera.position);
      // First person has a 72 u far plane: shrink the sky uniformly about the camera so the dome stays inside it. Directions and the sun and moon angular sizes are unchanged; the shrunken dome sits around 60 to 70 u, where the fog (14 to 64 u) has already turned opaque geometry almost fully into the fog color, and holo effects draw after the dome (renderOrder -100).
      const fit = Math.min(1, (0.97 * camera.far) / DOME_RADIUS);
      if (sky.scale.x !== fit) sky.scale.setScalar(fit);
    }
    if (!meshesLive && postHandle.get()?.composer()) setMeshesLive(true);
    // The full tier's composer mounts lazily (and can remount): write the bloom into whichever instance is live.
    const bloom = postHandle.get()?.bloom() ?? null;
    if (bloom && bloom !== bloomWritten.current) {
      bloom.intensity = state.bloom;
      bloomWritten.current = bloom;
    }
    const m = mode.current;
    // On-demand frames (idle.ts): the running day and night clock still moves the sun and moon (about 5 CSS px a second), so 4 frames a second.
    if (m.phase === null && !under.current) wakeFrameAt(clock.elapsedTime + 0.25);
    const phase = under.current ? 0 : (m.phase ?? clockPhase(Date.now()));
    if (last.current !== null && Math.abs(phase - last.current) <= EPSILON) return;
    last.current = phase;
    skyState(phase, state, azimuth.current);

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
    if (bloom) bloom.intensity = state.bloom;

    applyDome(domeMaterial, state, m.still);
    if (orbMesh.current) applyOrbs(orbMesh.current, orbAlpha, state, scratch, m.still);

    skyRuntime.phase = phase;
    skyRuntime.day = state.day;
    skyRuntime.stars = state.stars;
    skyRuntime.source = m.source;
    skyRuntime.still = m.still;
    skyRuntime.fog = state.fog.getHex();
    skyRuntime.azimuth = azimuth.current;
    skyRuntime.applied += 1;
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={settings.hemisphere} />
      <directionalLight ref={dir} color={settings.directional.color} position={settings.directional.position} intensity={settings.directional.intensity} />
      <group ref={group} name="sky-dome">
        {meshesLive && (
          <>
            <instancedMesh args={[domeGeometry, domeMaterial, 1]} renderOrder={-100} frustumCulled={false} raycast={NO_RAYCAST}>
              <instancedBufferAttribute attach="instanceColor" args={[domeColor, 3]} />
            </instancedMesh>
            <instancedMesh ref={orbMesh} args={[orbGeometry, orbMaterial, 2]} renderOrder={-99} frustumCulled={false} raycast={NO_RAYCAST}>
              <instancedBufferAttribute attach="instanceColor" args={[orbColor, 3]} />
            </instancedMesh>
          </>
        )}
      </group>
    </>
  );
}
