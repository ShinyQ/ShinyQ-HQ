"use client";

import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdditiveBlending, CanvasTexture, DoubleSide, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { getHQStore } from "@/store/useHQStore";
import { COLORS, FLOOR_COLOR } from "../../config";
import { BoxEdges, FloorLine, FONTS, GlassBox } from "../../tower/primitives";
import type { GpuTier, RoofData } from "../../types";
import { roomHandlers } from "../interact";
import { ROOF, terminalSlots } from "./layout";

const BLUE = FLOOR_COLOR.RF;
const MAST_H = 5.5;

export interface RoofLabels {
  beacon: string;
  comms: string;
  email: string;
  cvTitle: string;
  cvHint: string;
}

const ring = (r: number, n = 40): [number, number][] =>
  Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r]);

/** Beacon antenna at (0, -6): a pulsing light with the availability message on a holographic ribbon. */
export function Beacon({ availability, label, tier }: { availability: string; label: string; tier: GpuTier }) {
  const halo = useRef<Mesh>(null);
  const ribbon = useRef<Group>(null);
  const pulses = useRef<(Mesh | null)[]>([]);
  const coneAlpha = useMemo(() => {
    // Vertical alpha ramp: bright at the lamp, fading toward the roof.
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 64;
    const g = c.getContext("2d");
    if (g) {
      const grad = g.createLinearGradient(0, 0, 0, 64);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(1, "#000000");
      g.fillStyle = grad;
      g.fillRect(0, 0, 1, 64);
    }
    return new CanvasTexture(c);
  }, []);
  useEffect(() => () => coneAlpha.dispose(), [coneAlpha]);
  const { x, z, r } = ROOF.beacon;

  useFrame((state) => {
    const reduced = getHQStore().getState().reducedMotion;
    const t = state.clock.elapsedTime;
    const pulse = reduced ? 0.5 : (Math.sin(t * 2.4) + 1) / 2;
    if (halo.current) {
      halo.current.scale.setScalar(1 + pulse * 0.6);
      (halo.current.material as MeshBasicMaterial).opacity = 0.12 + (1 - pulse) * 0.22;
    }
    if (ribbon.current) ribbon.current.position.y = MAST_H - 1.6 + (reduced ? 0 : Math.sin(t * 0.8) * 0.12);
    // Two rings expand from the base every 2 s, half a cycle apart.
    pulses.current.forEach((m, i) => {
      if (!m) return;
      const k = reduced ? 0.4 : ((t + i) % 2) / 2;
      m.scale.setScalar(1 + k * 4);
      (m.material as MeshBasicMaterial).opacity = 0.6 * (1 - k);
    });
  });

  return (
    <group position={[x, 0, z]} name="beacon">
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[r, r + 0.2, 0.5, 8]} />
        <meshStandardMaterial color="#0b0b18" roughness={0.8} metalness={0.2} />
      </mesh>
      <group position={[0, 0.52, 0]}>
        <FloorLine points={ring(r + 0.4)} color={BLUE} closed opacity={0.9} />
      </group>
      <mesh position={[0, MAST_H / 2, 0]}>
        <cylinderGeometry args={[0.08, 0.2, MAST_H, 6]} />
        <meshBasicMaterial color={BLUE} transparent opacity={0.7} toneMapped={false} />
      </mesh>
      <mesh position={[0, MAST_H + 0.3, 0]}>
        <sphereGeometry args={[0.38, 16, 12]} />
        <meshBasicMaterial color="#dbeafe" toneMapped={false} />
      </mesh>
      <mesh ref={halo} position={[0, MAST_H + 0.3, 0]}>
        <sphereGeometry args={[0.9, 16, 12]} />
        <meshBasicMaterial color={BLUE} transparent opacity={0.25} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* Light cone from the lamp down to the roof. */}
      <mesh position={[0, (MAST_H + 0.3) / 2, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.35, 2.6, MAST_H + 0.3, 24, 1, true]} />
        <meshBasicMaterial color={BLUE} alphaMap={coneAlpha} transparent opacity={0.35} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
      </mesh>
      {[0, 1].map((i) => (
        <mesh
          key={i}
          ref={(m) => {
            pulses.current[i] = m;
          }}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.04, 0]}
          raycast={() => null}
        >
          <ringGeometry args={[r + 0.3, r + 0.45, 48]} />
          <meshBasicMaterial color={BLUE} transparent opacity={0.5} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      {tier === "full" && <pointLight position={[0, MAST_H + 0.3, 0]} color={BLUE} intensity={6} distance={18} />}
      <group ref={ribbon} position={[0, MAST_H - 1.6, 0]}>
        <Billboard>
          <mesh position={[0, 0, -0.02]}>
            <planeGeometry args={[7.4, 1.5]} />
            <meshBasicMaterial color={BLUE} transparent opacity={0.1} depthWrite={false} toneMapped={false} />
          </mesh>
          <BoxEdges size={[7.4, 1.5, 0.01]} color={BLUE} opacity={0.8} />
          <Text font={FONTS.mono} fontSize={0.16} letterSpacing={0.14} color={BLUE} anchorX="center" anchorY="top" position={[0, 0.62, 0]} material-toneMapped={false}>
            {label.toUpperCase()}
          </Text>
          <Text font={FONTS.sansBold} fontSize={0.26} color="#eff6ff" anchorX="center" anchorY="middle" position={[0, -0.1, 0]} maxWidth={7} textAlign="center" lineHeight={1.25}>
            {availability}
          </Text>
        </Billboard>
      </group>
    </group>
  );
}

interface TerminalItem {
  key: string;
  label: string;
  value: string;
}

function Terminal({ item, slot, hover, handlers }: { item: TerminalItem; slot: ReturnType<typeof terminalSlots>[number]; hover: boolean; handlers: ReturnType<typeof roomHandlers> }) {
  const { w, d, h } = ROOF.terminal;
  const led = useRef<Mesh>(null);
  // Status LED: a short double blink every couple of seconds, out of phase per terminal.
  useFrame((state) => {
    if (!led.current) return;
    const reduced = getHQStore().getState().reducedMotion;
    const k = (state.clock.elapsedTime * 0.55 + slot.index * 0.31) % 1;
    led.current.visible = reduced || k < 0.06 || (k > 0.12 && k < 0.18) || k > 0.5;
  });
  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.angle, 0]} name={`terminal-${item.key}`}>
      <GlassBox size={[0.5, h, 0.5]} position={[0, h / 2, 0]} color={BLUE} fillOpacity={0.15} edgeOpacity={0.7} />
      <group position={[0, h + 0.55, d / 4]} rotation={[-0.35, 0, 0]}>
        <mesh {...handlers}>
          <planeGeometry args={[w, 1.1]} />
          <meshBasicMaterial color={hover ? "#0f1d33" : "#08101f"} transparent opacity={0.95} />
        </mesh>
        <BoxEdges size={[w, 1.1, 0.02]} color={BLUE} opacity={hover ? 1 : 0.8} />
        <mesh ref={led} position={[w / 2 - 0.14, 0.4, 0.015]}>
          <circleGeometry args={[0.045, 12]} />
          <meshBasicMaterial color={COLORS.green} toneMapped={false} />
        </mesh>
        <Text font={FONTS.monoBold} fontSize={0.17} color={BLUE} anchorX="left" anchorY="top" position={[-w / 2 + 0.12, 0.45, 0.01]} material-toneMapped={false}>
          {item.label.toUpperCase()}
        </Text>
        <Text font={FONTS.mono} fontSize={item.value.length > 22 ? 0.085 : 0.11} color="#dbeafe" anchorX="left" anchorY="top" position={[-w / 2 + 0.12, 0.12, 0.01]} maxWidth={w - 0.24}>
          {item.value}
        </Text>
      </group>
    </group>
  );
}

const shortHref = (href: string) => href.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "");

/** Comms terminals on the arc in front of the beacon: email in the middle, channels around it. */
export function CommsTerminals({ roof, labels }: { roof: RoofData; labels: RoofLabels }) {
  const [hover, setHover] = useState(false);
  const handlers = roomHandlers("RF:contact", setHover);
  const channels: TerminalItem[] = roof.channels.map((c) => ({ key: c.id, label: c.label, value: shortHref(c.href) }));
  const email: TerminalItem = { key: "email", label: labels.email, value: roof.email };
  const half = Math.ceil(channels.length / 2);
  const items = [...channels.slice(0, half), email, ...channels.slice(half)];
  const slots = terminalSlots(items.length);
  const middle = slots[Math.floor(items.length / 2)];
  return (
    <group name="comms">
      {items.map((item, i) => (
        <Terminal key={item.key} item={item} slot={slots[i]} hover={hover} handlers={handlers} />
      ))}
      <Text
        font={FONTS.monoBold}
        fontSize={0.45}
        letterSpacing={0.14}
        color={BLUE}
        anchorX="center"
        anchorY="bottom"
        position={[middle.x, 3, middle.z]}
        material-toneMapped={false}
      >
        {labels.comms.toUpperCase()}
      </Text>
    </group>
  );
}

/** CV kiosk at (10, 6): download the per-locale PDF or open /cv. */
export function CvKiosk({ labels }: { labels: RoofLabels }) {
  const [hover, setHover] = useState(false);
  const { x, z, w, d } = ROOF.kiosk;
  return (
    <group position={[x, 0, z]} name="cv-kiosk">
      <GlassBox size={[w, 1.2, d]} position={[0, 0.6, 0]} color={COLORS.cyan} fillOpacity={0.1} edgeOpacity={hover ? 1 : 0.8} />
      <group position={[0, 2.2, 0.3]} rotation={[-0.3, 0, 0]}>
        <mesh {...roomHandlers("RF:cv", setHover)}>
          <planeGeometry args={[2.8, 1.6]} />
          <meshBasicMaterial color={hover ? "#06222b" : COLORS.terminalBg} transparent opacity={0.95} />
        </mesh>
        <BoxEdges size={[2.8, 1.6, 0.02]} color={COLORS.cyan} opacity={hover ? 1 : 0.8} />
        <Text font={FONTS.monoBold} fontSize={0.22} color={COLORS.cyan} anchorX="left" anchorY="top" position={[-1.25, 0.66, 0.01]} material-toneMapped={false}>
          {labels.cvTitle.toUpperCase()}
        </Text>
        <Text font={FONTS.mono} fontSize={0.13} color="#cffafe" anchorX="left" anchorY="top" position={[-1.25, 0.26, 0.01]} maxWidth={2.5} lineHeight={1.5}>
          {`PDF \u00b7 EN / ID\n> /cv\n\n${labels.cvHint}`}
        </Text>
      </group>
    </group>
  );
}
