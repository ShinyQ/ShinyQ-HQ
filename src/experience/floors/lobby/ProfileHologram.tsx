"use client";

import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BufferGeometry, Float32BufferAttribute, type Group } from "three";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { getGlassMaterial } from "../../fx/geometry";
import { neonColor } from "../../fx/materials";
import { COLORS, LOBBY } from "../../config";
import { FONTS, FloorLine } from "../../tower/primitives";
import { HOLOGRAM } from "./layout";

function hexGeometry(r: number) {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 2;
    pts.push(Math.cos(a) * r, Math.sin(a) * r, 0);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pts, 3));
  return g;
}

const circle = (r: number, n = 48): [number, number][] =>
  Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r]);

/** Rotating wireframe KAW monogram on a pedestal, with the name and headline floating above (C5: no photo). */
export function ProfileHologram({ name, monogram, headline }: { name: string; monogram: string; headline: string }) {
  const spin = useRef<Group>(null);
  const halos = useRef<(Group | null)[]>([]);
  const flicker = useRef({ until: 0, wasHere: false });
  const tier = useHQStore((st) => st.tier);
  const haloColors = useMemo(() => [neonColor(COLORS.green, 2, tier), neonColor(COLORS.cyan, 2, tier)], [tier]);
  const outer = useMemo(() => hexGeometry(HOLOGRAM.hexRadius), []);
  const inner = useMemo(() => hexGeometry(1.8), []);
  const ring = useMemo(() => circle(3.05), []);
  const { x, z, radius } = LOBBY.hologram;

  useFrame((state, dt) => {
    if (!spin.current) return;
    const reduced = getHQStore().getState().reducedMotion;
    spin.current.rotation.y += Math.min(dt, 0.1) * (reduced ? 0.15 : 0.4);
    spin.current.position.y = HOLOGRAM.y + (reduced ? 0 : Math.sin(state.clock.elapsedTime * 1.2) * 0.12);
    // Counter-rotating halo rings.
    const d = Math.min(dt, 0.1) * (reduced ? 0.25 : 1);
    if (halos.current[0]) halos.current[0].rotation.y += d * 0.4;
    if (halos.current[1]) halos.current[1].rotation.y -= d * 0.25;
    // Flicker in for 400 ms whenever the rover arrives on the Lobby.
    const t = state.clock.elapsedTime;
    const s = getHQStore().getState();
    const here = s.floor === "L1" && !s.ride && s.phase === "explore";
    const f = flicker.current;
    if (here && !f.wasHere && !reduced) f.until = t + 0.4;
    f.wasHere = here;
    spin.current.visible = t >= f.until || Math.sin(t * 97) + Math.sin(t * 61) > -0.3;
  });

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[radius, radius + 0.2, 0.6, 6]} />
        <meshStandardMaterial color="#0b0b18" roughness={0.8} metalness={0.2} />
      </mesh>
      <group position={[0, 0.62, 0]}>
        <FloorLine points={ring} color={COLORS.green} closed opacity={0.9} />
      </group>
      {/* Projection cone with the glass scanline shimmer. */}
      <mesh position={[0, 2.1, 0]} material={getGlassMaterial(COLORS.green, 0.02)}>
        <cylinderGeometry args={[1.2, 2.6, 3, 6, 1, true]} />
      </mesh>
      {[
        { r: 2.9, tilt: 0.28, y: HOLOGRAM.y - 0.2 },
        { r: 3.3, tilt: -0.2, y: HOLOGRAM.y + 0.3 },
      ].map((h, i) => (
        <group key={i} position={[0, h.y, 0]} rotation={[h.tilt, 0, 0]}>
          <group
            ref={(node) => {
              halos.current[i] = node;
            }}
          >
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[h.r, 0.018, 6, 96, Math.PI * 1.6]} />
              <meshBasicMaterial color={haloColors[i]} transparent opacity={0.85} toneMapped={false} />
            </mesh>
          </group>
        </group>
      ))}
      <group ref={spin} position={[0, HOLOGRAM.y, 0]}>
        <lineLoop geometry={outer}>
          <lineBasicMaterial color={COLORS.cyan} toneMapped={false} />
        </lineLoop>
        <lineLoop geometry={inner}>
          <lineBasicMaterial color={COLORS.violet} transparent opacity={0.6} toneMapped={false} />
        </lineLoop>
        <Text font={FONTS.monoBold} fontSize={0.95} letterSpacing={0.06} color="#f4f4f5" anchorX="center" anchorY="middle" position={[0, 0, 0.02]} material-toneMapped={false}>
          {monogram}
        </Text>
        <Text
          font={FONTS.monoBold}
          fontSize={0.95}
          letterSpacing={0.06}
          color="#f4f4f5"
          anchorX="center"
          anchorY="middle"
          position={[0, 0, -0.02]}
          rotation={[0, Math.PI, 0]}
          material-toneMapped={false}
        >
          {monogram}
        </Text>
      </group>
      <Billboard position={[0, LOBBY.titleY, 0]}>
        <Text font={FONTS.sansBold} fontSize={0.78} color="#f4f4f5" anchorX="center" anchorY="bottom" maxWidth={14} textAlign="center">
          {name}
        </Text>
        <Text font={FONTS.sans} fontSize={0.4} color={COLORS.cyan} anchorX="center" anchorY="top" position={[0, -0.12, 0]} maxWidth={14} textAlign="center" material-toneMapped={false}>
          {headline}
        </Text>
      </Billboard>
    </group>
  );
}
