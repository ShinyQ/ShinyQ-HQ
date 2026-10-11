"use client";

import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { ACESFilmicToneMapping } from "three";
import { getHQStore } from "@/store/useHQStore";
import "../../text-config";
import { LOBBY } from "../../config";
import { CertWall, type CertLabels } from "../../floors/lobby/CertWall";
import { Lanes } from "../../floors/lobby/Lanes";
import { SkillsWall } from "../../floors/lobby/SkillsWall";
import { GridFloor } from "../../fx/GridFloor";
import { Rover } from "../../rover/Rover";
import { roverRuntime } from "../../rover/runtime";
import { sceneSettings } from "../../scene/settings";
import type { ExperienceData, GpuTier } from "../../types";

/** Rover in front of the wall, camera behind it looking east (the L1:certifications view zone). */
const ROVER_AT = { x: 18, z: -4 };

function CameraRig({ mobile }: { mobile: boolean }) {
  const view = mobile ? { dx: -12, y: 10, fov: 60 } : { dx: -11, y: 8, fov: 45 };
  useFrame(({ camera }) => {
    camera.position.set(ROVER_AT.x + view.dx, view.y, ROVER_AT.z);
    camera.lookAt(ROVER_AT.x + 4, 3, ROVER_AT.z);
    if ("fov" in camera && camera.fov !== view.fov) {
      camera.fov = view.fov;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

function Ready({ onReady }: { onReady: () => void }) {
  const [frames, setFrames] = useState(0);
  useFrame(() => setFrames((f) => (f > 30 ? f : f + 1)));
  useEffect(() => {
    if (frames > 30) onReady();
  }, [frames, onReady]);
  return null;
}

/** Dev-only: the real L1 certification wall in a Lobby slice (no hologram or stats ring in front of it). */
export default function CertsWorld({ data, certs, labels, tier, mobile }: { data: ExperienceData; certs: ExperienceData["certifications"]; labels: CertLabels; tier: GpuTier; mobile: boolean }) {
  const [ready, setReady] = useState(false);
  const settings = sceneSettings(tier);
  useEffect(() => {
    roverRuntime.x = ROVER_AT.x;
    roverRuntime.z = ROVER_AT.z;
    roverRuntime.heading = Math.PI / 2;
    getHQStore().getState().setTier(tier);
  }, [tier]);
  const b = LOBBY.bounds;
  return (
    <div className="fixed inset-0 z-[60] bg-void" data-testid="certs-3d" data-ready={ready ? "1" : "0"}>
      <Canvas dpr={[1, 1.5]} gl={{ antialias: true }} camera={{ fov: 45, near: 0.5, far: 400, position: [0, 30, 30] }} onCreated={({ gl }) => (gl.toneMapping = ACESFilmicToneMapping)}>
        <Ready onReady={() => setReady(true)} />
        <color attach="background" args={[settings.fog.color]} />
        <fog attach="fog" args={[settings.fog.color, 30, 90]} />
        <hemisphereLight args={settings.hemisphere} />
        <directionalLight color={settings.directional.color} position={settings.directional.position} intensity={settings.directional.intensity} />
        <CameraRig mobile={mobile} />
        <GridFloor width={b.maxX - b.minX} depth={b.maxZ - b.minZ} center={[(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2]} />
        <Lanes packets={tier === "full" ? 28 : 12} />
        <SkillsWall skills={data.skills} title="Skills" />
        <CertWall certifications={certs} labels={labels} tier={tier} />
        <Rover tier={tier} />
        {tier === "full" && (
          <EffectComposer>
            <Bloom mipmapBlur luminanceThreshold={0.6} intensity={0.9} radius={0.45} />
            <ToneMapping />
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}
