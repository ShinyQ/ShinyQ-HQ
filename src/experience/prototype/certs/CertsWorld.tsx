"use client";

import { Text } from "@react-three/drei";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import { ACESFilmicToneMapping, AdditiveBlending, DoubleSide, FrontSide, type Group } from "three";
import { getHQStore } from "@/store/useHQStore";
import "../../text-config";
import { COLORS, LOBBY } from "../../config";
import { Lanes } from "../../floors/lobby/Lanes";
import { SkillsWall } from "../../floors/lobby/SkillsWall";
import { GridFloor } from "../../fx/GridFloor";
import { Rover } from "../../rover/Rover";
import { roverRuntime } from "../../rover/runtime";
import { sceneSettings } from "../../scene/settings";
import { BoxEdges, FONTS, GlassBox } from "../../tower/primitives";
import type { ExperienceData, GpuTier } from "../../types";
import { CertPreview } from "./CertPreview";
import { FeaturedVariant, PreviewProvider } from "./PageVariants";
import { ISSUER_COLOR, featured, groupByIssuer, issuerGroup, shortName, type ProtoCert } from "./fixture";

export type Variant = "a" | "b" | "c";
type Open = (cert: ProtoCert) => void;

const C = LOBBY.hologram;
const statusColor = (cert: ProtoCert) => (cert.status === "in-progress" ? COLORS.amber : cert.status === "expired" ? "#71717a" : ISSUER_COLOR[issuerGroup(cert.issuer)]);

/** Yaw that turns a plane's +z toward the plaza center from a point on a circle at angle `a`. */
const faceCenter = (a: number) => Math.atan2(-Math.cos(a), -Math.sin(a));
const onArc = (r: number, a: number, y: number): [number, number, number] => [C.x + r * Math.cos(a), y, C.z + r * Math.sin(a)];

function Badge({ cert, w, h, position, rotation, open, compact = false }: { cert: ProtoCert; w: number; h: number; position: [number, number, number]; rotation: number; open: Open; compact?: boolean }) {
  const [hover, setHover] = useState(false);
  const color = statusColor(cert);
  const head = cert.code ?? cert.issuer;
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    open(cert);
  };
  return (
    <group
      position={position}
      rotation={[0, rotation, 0]}
      onClick={click}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "";
      }}
    >
      <mesh position={[0, 0, -0.03]}>
        <planeGeometry args={[w + 0.25, h + 0.25]} />
        <meshBasicMaterial color={color} transparent opacity={hover ? 0.45 : 0.12} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color={hover ? "#132433" : "#0f0f19"} transparent opacity={0.92} />
      </mesh>
      {/* Opaque back so the double-sided text never reads mirrored from behind. */}
      <mesh position={[0, 0, -0.06]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color="#0c0c16" />
      </mesh>
      <BoxEdges size={[w, h, 0.01]} color={color} opacity={hover ? 1 : 0.7} />
      <Text font={FONTS.monoBold} fontSize={compact ? (head.length > 7 ? 0.17 : 0.24) : head.length > 7 ? 0.22 : 0.32} color={color} anchorX="center" anchorY="top" position={[0, h / 2 - 0.15, 0.02]} maxWidth={w - 0.15} textAlign="center" material-toneMapped={false} material-side={FrontSide}>
        {head}
      </Text>
      <Text font={FONTS.sans} fontSize={compact ? 0.105 : 0.13} color="#d4d4d8" anchorX="center" anchorY="top" position={[0, h / 2 - (compact ? 0.5 : 0.62), 0.02]} maxWidth={w - 0.2} textAlign="center" lineHeight={1.3} material-side={FrontSide}>
        {shortName(cert.name)}
      </Text>
      {!compact && (
        <Text font={FONTS.mono} fontSize={0.11} color={cert.status === "earned" ? "#8b8b94" : color} anchorX="center" anchorY="bottom" position={[0, -h / 2 + 0.14, 0.02]} letterSpacing={0.08} material-toneMapped={false} material-side={FrontSide}>
          {cert.status === "earned" ? cert.issued.replace("-", " . ") : cert.status === "in-progress" ? "IN PROGRESS" : "EXPIRED"}
        </Text>
      )}
    </group>
  );
}

function Pill({ label, position, rotation, active, color, onClick, w = 2.4 }: { label: string; position: [number, number, number]; rotation: number; active: boolean; color: string; onClick: () => void; w?: number }) {
  return (
    <group
      position={position}
      rotation={[0, rotation, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <mesh>
        <planeGeometry args={[w, 0.55]} />
        <meshBasicMaterial color={active ? color : "#0f0f19"} transparent opacity={active ? 0.9 : 0.85} toneMapped={false} />
      </mesh>
      <BoxEdges size={[w, 0.55, 0.01]} color={color} opacity={active ? 1 : 0.5} />
      <Text font={FONTS.monoBold} fontSize={0.2} letterSpacing={0.08} color={active ? "#05050c" : color} anchorX="center" anchorY="middle" position={[0, 0, 0.02]} material-toneMapped={false}>
        {label}
      </Text>
    </group>
  );
}

/** Curved glass band behind an arc (cylinder segment, open ended). */
function ArcPanel({ r, a0, a1, y0, y1, color }: { r: number; a0: number; a1: number; y0: number; y1: number; color: string }) {
  // three's cylinder theta starts at +z and turns toward +x; convert from our x-based angle.
  const thetaStart = Math.PI / 2 - a1;
  return (
    <group position={[C.x, (y0 + y1) / 2, C.z]}>
      <mesh>
        <cylinderGeometry args={[r, r, y1 - y0, 48, 1, true, thetaStart, a1 - a0]} />
        <meshBasicMaterial color={color} transparent opacity={0.05} side={DoubleSide} depthWrite={false} />
      </mesh>
      {[y0, y1].map((y) => (
        <mesh key={y} position={[0, y - (y0 + y1) / 2, 0]}>
          <cylinderGeometry args={[r, r, 0.05, 48, 1, true, thetaStart, a1 - a0]} />
          <meshBasicMaterial color={color} transparent opacity={0.8} side={DoubleSide} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------------------------------------------- A: curved holo-wall per issuer */

function GalleryWall({ certs, open }: { certs: ProtoCert[]; open: Open }) {
  const groups = groupByIssuer(certs);
  const [tab, setTab] = useState(0);
  const [page, setPage] = useState(0);
  const group = groups[Math.min(tab, groups.length - 1)];
  const COLS = 6;
  const ROWS = 2;
  const per = COLS * ROWS;
  const pages = Math.max(1, Math.ceil(group.certs.length / per));
  const shown = group.certs.slice(page * per, page * per + per);
  const R = 19.5;
  const W = 2.05;
  const H = 1.6;
  const pitch = (W + 0.35) / R;
  const span = (COLS - 1) * pitch;
  const color = ISSUER_COLOR[group.issuer];
  const tabPitch = 2.7 / R;
  return (
    <group>
      <ArcPanel r={R + 0.4} a0={-span / 2 - 0.12} a1={span / 2 + 0.12} y0={0.6} y1={5.9} color={color} />
      <Text font={FONTS.monoBold} fontSize={0.42} letterSpacing={0.12} color={COLORS.cyan} anchorX="center" anchorY="bottom" position={onArc(R, 0, 6.4)} rotation={[0, faceCenter(0), 0]} material-toneMapped={false}>
        {`CERTIFICATIONS  ${certs.length}`}
      </Text>
      {groups.map((g, i) => {
        const a = (i - (groups.length - 1) / 2) * tabPitch;
        return <Pill key={g.issuer} label={`${g.issuer.toUpperCase()} ${g.certs.length}`} w={2.5} position={onArc(R, a, 5.35)} rotation={faceCenter(a)} active={i === tab} color={ISSUER_COLOR[g.issuer]} onClick={() => (setTab(i), setPage(0))} />;
      })}
      {shown.map((cert, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const a = -span / 2 + col * pitch;
        return <Badge key={cert.id} cert={cert} w={W} h={H} position={onArc(R, a, 4.05 - row * (H + 0.3))} rotation={faceCenter(a)} open={open} />;
      })}
      {pages > 1 && (
        <>
          <Pill label="<" w={0.8} position={onArc(R, -0.07, 0.95)} rotation={faceCenter(-0.07)} active={false} color={color} onClick={() => setPage((p) => (p + pages - 1) % pages)} />
          <Text font={FONTS.mono} fontSize={0.22} color="#a1a1aa" anchorX="center" anchorY="middle" position={onArc(R, 0, 0.95)} rotation={[0, faceCenter(0), 0]}>
            {`${page + 1} / ${pages}`}
          </Text>
          <Pill label=">" w={0.8} position={onArc(R, 0.07, 0.95)} rotation={faceCenter(0.07)} active={false} color={color} onClick={() => setPage((p) => (p + 1) % pages)} />
        </>
      )}
    </group>
  );
}

/* ------------------------------------------- B: walk-along strip on the ring */

function TimelineStrip({ certs, open }: { certs: ProtoCert[]; open: Open }) {
  const R = 17;
  const W = 1.3;
  const H = 1.05;
  const pitch = 1.55 / R;
  // Oldest first along the ring (north to south), two tiers per column, a gap and a gate per year.
  const layout = useMemo(() => {
    const sorted = [...certs].sort((a, b) => a.issued.localeCompare(b.issued));
    const years = [...new Set(sorted.map((x) => x.issued.slice(0, 4)))];
    const slots: { cert: ProtoCert; col: number; row: number }[] = [];
    const gates: { year: string; col: number }[] = [];
    let col = 0;
    for (const year of years) {
      gates.push({ year, col });
      col += 0.7;
      const list = sorted.filter((x) => x.issued.startsWith(year));
      list.forEach((cert, i) => slots.push({ cert, col: col + Math.floor(i / 2), row: i % 2 }));
      col += Math.ceil(list.length / 2) + 0.3;
    }
    return { slots, gates, cols: col };
  }, [certs]);
  const start = -((layout.cols - 1) * pitch) / 2;
  const angle = (col: number) => start + col * pitch;
  return (
    <group>
      <ArcPanel r={R + 0.5} a0={angle(-0.6)} a1={angle(layout.cols - 0.4)} y0={0.05} y1={0.35} color={COLORS.cyan} />
      {layout.gates.map(({ year, col }) => {
        const a = angle(col);
        return (
          <group key={year}>
            <mesh position={onArc(R + 0.2, a, 1.7)} rotation={[0, faceCenter(a), 0]}>
              <boxGeometry args={[0.08, 3.3, 0.08]} />
              <meshBasicMaterial color={COLORS.cyan} toneMapped={false} />
            </mesh>
            <Text font={FONTS.monoBold} fontSize={0.42} color={COLORS.cyan} anchorX="center" anchorY="bottom" position={onArc(R + 0.2, a, 3.45)} rotation={[0, faceCenter(a), 0]} material-toneMapped={false}>
              {year}
            </Text>
          </group>
        );
      })}
      {layout.slots.map(({ cert, col, row }) => {
        const a = angle(col);
        return <Badge key={cert.id} cert={cert} w={W} h={H} compact position={onArc(R, a, 2.6 - row * (H + 0.18))} rotation={faceCenter(a)} open={open} />;
      })}
    </group>
  );
}

/* --------------------------------------------- C: carousel kiosk + full list */

function CarouselKiosk({ certs, open, onAll, still }: { certs: ProtoCert[]; open: Open; onAll: () => void; still: boolean }) {
  const top = featured(certs);
  const spin = useRef<Group>(null);
  const pos = { x: 23, z: -4 };
  useFrame((_, dt) => {
    const s = getHQStore().getState();
    if (spin.current && !s.reducedMotion && !still) spin.current.rotation.y += dt * 0.18;
  });
  return (
    <group>
      <GlassBox size={[4.6, 0.5, 4.6]} position={[pos.x, 0.25, pos.z]} color={COLORS.cyan} fillOpacity={0.08} />
      <mesh position={[pos.x, 2.4, pos.z]}>
        <cylinderGeometry args={[0.35, 0.5, 4, 16]} />
        <meshBasicMaterial color="#14142a" />
      </mesh>
      <group ref={spin} position={[pos.x, 0, pos.z]}>
        {top.map((cert, i) => {
          const a = (i / top.length) * Math.PI * 2 - Math.PI / 2;
          return <Badge key={cert.id} cert={cert} w={2.8} h={2.3} position={[Math.sin(a) * 2.2, 3.0, Math.cos(a) * 2.2]} rotation={a} open={open} />;
        })}
      </group>
      <Text font={FONTS.monoBold} fontSize={0.42} letterSpacing={0.12} color={COLORS.cyan} anchorX="center" anchorY="bottom" position={[pos.x - 0.3, 5.5, pos.z]} rotation={[0, -Math.PI / 2, 0]} material-toneMapped={false}>
        {`CERTIFICATIONS  ${certs.length}`}
      </Text>
      <Pill label={`OPEN ALL ${certs.length}  >`} w={3.2} position={[pos.x - 3.4, 1.15, pos.z]} rotation={-Math.PI / 2} active color={COLORS.cyan} onClick={onAll} />
    </group>
  );
}

/* ------------------------------------------------------------------ scene */

function CameraRig({ rover, view }: { rover: { x: number; z: number }; view: { dx: number; y: number; dz: number; lookY: number; fov: number } }) {
  useFrame(({ camera }) => {
    camera.position.set(rover.x + view.dx, view.y, rover.z + view.dz);
    camera.lookAt(rover.x + 4, view.lookY, rover.z);
    if ("fov" in camera && camera.fov !== view.fov) {
      camera.fov = view.fov;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

export const ROVER_AT: Record<Variant, { x: number; z: number }> = { a: { x: 18, z: -4 }, b: { x: 18, z: -4 }, c: { x: 17, z: -4 } };

export default function CertsWorld({ data, certs, variant, tier, mobile, still = false }: { data: ExperienceData; certs: ProtoCert[]; variant: Variant; tier: GpuTier; mobile: boolean; still?: boolean }) {
  const [cert, setCert] = useState<ProtoCert | null>(null);
  const [all, setAll] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("all") === "1");
  const [frames, setFrames] = useState(0);
  const rover = ROVER_AT[variant];
  const settings = sceneSettings(tier);
  const view = mobile ? { dx: -12, y: 10, dz: 0, lookY: 3, fov: 60 } : { dx: -11, y: 8, dz: 0, lookY: 3, fov: 45 };
  useEffect(() => {
    roverRuntime.x = rover.x;
    roverRuntime.z = rover.z;
    roverRuntime.heading = Math.PI / 2;
    const s = getHQStore().getState();
    s.setTier(tier);
  }, [rover, tier]);
  return (
    <div className="fixed inset-0 z-[60] bg-void" data-testid="certs-3d" data-ready={frames > 30 ? "1" : "0"}>
      <Canvas dpr={[1, 1.5]} gl={{ antialias: true }} camera={{ fov: 40, near: 0.5, far: 400, position: [0, 30, 30] }} onCreated={({ gl }) => (gl.toneMapping = ACESFilmicToneMapping)}>
        <FrameCounter onFrame={() => setFrames((f) => (f > 30 ? f : f + 1))} />
        <color attach="background" args={[settings.fog.color]} />
        <fog attach="fog" args={[settings.fog.color, 30, 90]} />
        <hemisphereLight args={settings.hemisphere} />
        <directionalLight color={settings.directional.color} position={settings.directional.position} intensity={settings.directional.intensity} />
        <CameraRig rover={rover} view={view} />
        <GridFloor width={LOBBY.bounds.maxX - LOBBY.bounds.minX} depth={LOBBY.bounds.maxZ - LOBBY.bounds.minZ} center={[(LOBBY.bounds.minX + LOBBY.bounds.maxX) / 2, (LOBBY.bounds.minZ + LOBBY.bounds.maxZ) / 2]} />
        <Lanes packets={tier === "full" ? 28 : 12} />
        {/* The hologram title and stats ring sit between this camera and the east wall, so the prototype leaves them out. */}
        <SkillsWall skills={data.skills} title="Skills" />
        {variant === "a" && <GalleryWall certs={certs} open={setCert} />}
        {variant === "b" && <TimelineStrip certs={certs} open={setCert} />}
        {variant === "c" && <CarouselKiosk certs={certs} open={setCert} onAll={() => setAll(true)} still={still} />}
        <Rover tier={tier} />
        {tier === "full" && (
          <EffectComposer>
            <Bloom mipmapBlur luminanceThreshold={0.6} intensity={0.9} radius={0.45} />
            <ToneMapping />
          </EffectComposer>
        )}
      </Canvas>
      {all && (
        <aside className="glass glass-solid fixed top-[76px] right-3 bottom-3 w-[min(460px,calc(100%-1.5rem))] overflow-y-auto p-5" aria-label="All certifications" data-testid="certs-drawer">
          <div className="mb-4 flex items-center">
            <p className="eyebrow text-cyan">L1 · Certifications</p>
            <button type="button" className="ml-auto grid size-11 place-items-center text-ink-2" aria-label="Close" onClick={() => setAll(false)}>
              ✕
            </button>
          </div>
          <PreviewProvider>
            <FeaturedVariant certs={certs} compact />
          </PreviewProvider>
        </aside>
      )}
      <CertPreview cert={cert} onClose={() => setCert(null)} />
    </div>
  );
}

function FrameCounter({ onFrame }: { onFrame: () => void }) {
  useFrame(() => onFrame());
  return null;
}

