"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, CylinderGeometry, MeshBasicMaterial, type Mesh } from "three";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { floorY } from "../config";
import { PAD } from "../nav/pads";
import { isElevatorBeam } from "../nav/fastReturn";
import { beamGlow } from "../nav/teleport";
import { beamNow } from "../tower/rideClock";
import { PAD_TONE } from "./holoIcons";
import { neonColor } from "./materials";

const HEIGHT = 6;

/**
 * The beam: an open neon column over the origin while it rises, then over the target pad while it
 * fades. Pink for L2 year teleports, green for beams to an elevator call pad (fast return). One draw
 * call, only while a beam runs; nothing under reduced motion (the HUD fades instead, see BeamFade).
 */
export function TeleportBeam() {
  const ref = useRef<Mesh>(null);
  const tier = useHQStore((s) => s.tier);
  const geometry = useMemo(() => new CylinderGeometry(PAD.radius, PAD.radius, HEIGHT, 32, 1, true), []);
  const material = useMemo(
    () => new MeshBasicMaterial({ color: neonColor(PAD_TONE.teleport, 2, tier), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    [tier],
  );
  const tones = useMemo(() => ({ teleport: neonColor(PAD_TONE.teleport, 2, tier), elevator: neonColor(PAD_TONE.return, 2, tier) }), [tier]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const s = getHQStore().getState();
    const glow = beamGlow(s.beam ? beamNow(s.beam) : null, s.reducedMotion);
    m.visible = glow !== null && glow.level > 0.01;
    if (!glow || !s.beam) return;
    (m.material as MeshBasicMaterial).color.copy(isElevatorBeam(s.beam) ? tones.elevator : tones.teleport);
    const level = Math.max(0.01, glow.level);
    m.position.set(glow.at.x, floorY(s.floor) + (HEIGHT / 2) * level, glow.at.z);
    m.scale.set(1, level, 1);
    (m.material as MeshBasicMaterial).opacity = 0.65 * glow.level;
  });

  return <mesh ref={ref} geometry={geometry} material={material} visible={false} frustumCulled={false} raycast={() => null} />;
}
