"use client";

import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { PerspectiveCamera, Vector3, type Group } from "three";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { countUp } from "../../fx/countUp";
import { neonColor } from "../../fx/materials";
import { roverRuntime } from "../../rover/runtime";
import { COLORS, LOBBY } from "../../config";
import type { ExperienceData } from "../../types";
import { BoxEdges, FONTS } from "../../tower/primitives";

const ACCENTS = [COLORS.green, COLORS.cyan, COLORS.violet, COLORS.amber, COLORS.pink, "#60a5fa"];
const { w: TILE_W, h: TILE_H, y: TILE_Y, stagger: TILE_STAGGER } = LOBBY.statsTile;

const COUNT_SECONDS = 0.9;
const LIFT = 0.15;
const LIFT_RADIUS = 4;
/** Clock time when the count-up started (once per page load, on the first view of the Lobby). */
let countStart: number | null = null;

/** Stat value that counts up from zero the first time the Lobby is explored (instant under reduced motion). */
function StatValue({ value, color }: { value: string; color: string }) {
  const [shown, setShown] = useState(() => (countStart === null ? countUp(value, 0) : value));
  useFrame((state) => {
    const s = getHQStore().getState();
    if (countStart === null) {
      if (s.floor !== "L1" || s.phase !== "explore") return;
      countStart = state.clock.elapsedTime;
    }
    const p = s.reducedMotion ? 1 : (state.clock.elapsedTime - countStart) / COUNT_SECONDS;
    const next = countUp(value, 1 - Math.pow(1 - Math.min(1, p), 3));
    if (next !== shown) setShown(next);
  });
  return (
    <Text font={FONTS.sansBold} fontSize={0.62} color={color} anchorX="left" anchorY="middle" position={[-TILE_W / 2 + 0.2, TILE_H / 2 - 0.45, 0.02]} material-toneMapped={false}>
      {shown}
    </Text>
  );
}

/**
 * Headline stats as floating tiles on a ring around the hologram (appendix 01 section 2). Tiles
 * billboard toward the camera, so they read from any orbit angle, and float above the rover.
 */
export function StatsRing({ stats }: { stats: ExperienceData["stats"] }) {
  const ring = useRef<Group>(null);
  const tiles = useRef<(Group | null)[]>([]);
  const scratch = useRef({ tile: new Vector3(), rover: new Vector3() });
  const tier = useHQStore((st) => st.tier);
  const glow = useMemo(() => ACCENTS.map((c) => neonColor(c, 2, tier)), [tier]);

  useFrame((state, rawDt) => {
    if (!ring.current) return;
    const dt = Math.min(rawDt, 0.1);
    const reduced = getHQStore().getState().reducedMotion;
    if (!reduced) {
      ring.current.rotation.y += dt * 0.06;
      ring.current.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.15;
    }

    // A tile that sits between the camera and the rover on screen shrinks away, so the rover is
    // never hidden behind the ring (it returns once the view is clear).
    const camera = state.camera as PerspectiveCamera;
    const { tile: tp, rover: rp } = scratch.current;
    rp.set(roverRuntime.x, roverRuntime.y + 1.4, roverRuntime.z);
    const roverDistance = rp.distanceTo(camera.position);
    rp.project(camera);
    const tanHalf = Math.tan(((camera.fov / 2) * Math.PI) / 180);
    const k = reduced ? 1 : 1 - Math.exp(-dt * 12);
    tiles.current.forEach((tile, i) => {
      if (!tile) return;
      tile.getWorldPosition(tp);
      // Tiles lift a little when the rover drives under them.
      const near = Math.hypot(tp.x - roverRuntime.x, tp.z - roverRuntime.z) < LIFT_RADIUS && Math.abs(tp.y - TILE_Y - roverRuntime.y) < 3;
      const base = TILE_Y + (i % 2) * TILE_STAGGER;
      tile.position.y += (base + (near ? LIFT : 0) - tile.position.y) * k;
      const distance = tp.distanceTo(camera.position);
      tp.project(camera);
      // Tile half-size plus the rover's half-size (about 1 u wide, 1.6 u tall), in screen units.
      const halfY = (TILE_H / 2 + 1.6) / (distance * tanHalf);
      const halfX = (TILE_W / 2 + 1.0) / (distance * tanHalf * camera.aspect);
      const covers = distance < roverDistance && Math.abs(tp.x - rp.x) < halfX && Math.abs(tp.y - rp.y) < halfY;
      const scale = tile.scale.x + ((covers ? 0.001 : 1) - tile.scale.x) * k;
      tile.scale.setScalar(scale);
      tile.visible = scale > 0.01;
    });
  });

  return (
    <group position={[LOBBY.hologram.x, 0, LOBBY.hologram.z]}>
      <group ref={ring}>
        {stats.map((stat, i) => {
          const a = (i / stats.length) * Math.PI * 2 + Math.PI / 4;
          const accent = ACCENTS[i % ACCENTS.length];
          return (
            <Billboard
              key={stat.id}
              ref={(node) => {
                tiles.current[i] = node;
              }}
              position={[Math.sin(a) * LOBBY.statsRadius, TILE_Y + (i % 2) * TILE_STAGGER, Math.cos(a) * LOBBY.statsRadius]}>
              <mesh>
                <planeGeometry args={[TILE_W, TILE_H]} />
                <meshBasicMaterial color="#0f0f19" transparent opacity={0.86} />
              </mesh>
              <BoxEdges size={[TILE_W, TILE_H, 0.01]} color={accent} opacity={0.9} />
              {/* Accent glow line along the top edge. */}
              <mesh position={[0, TILE_H / 2 - 0.04, 0.012]}>
                <planeGeometry args={[TILE_W - 0.1, 0.06]} />
                <meshBasicMaterial color={glow[i % glow.length]} toneMapped={false} />
              </mesh>
              <StatValue value={stat.value} color={accent} />
              <Text
                font={FONTS.sans}
                fontSize={0.17}
                color="#d4d4d8"
                anchorX="left"
                anchorY="top"
                lineHeight={1.35}
                maxWidth={TILE_W - 0.4}
                position={[-TILE_W / 2 + 0.2, TILE_H / 2 - 0.9, 0.02]}
              >
                {stat.label}
              </Text>
            </Billboard>
          );
        })}
      </group>
    </group>
  );
}
