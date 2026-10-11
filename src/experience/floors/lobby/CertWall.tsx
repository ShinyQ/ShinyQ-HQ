"use client";

import { Text } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Object3D, type InstancedMesh } from "three";
import { issuerTabs } from "@/content/certs";
import { openCert } from "@/hud/events";
import { useHQStore } from "@/store/useHQStore";
import { COLORS } from "../../config";
import { roverRuntime } from "../../rover/runtime";
import type { ExperienceData, GpuTier } from "../../types";
import { BoxEdges, FONTS } from "../../tower/primitives";
import { arcPoint, CERT_PAGE_SIZE, CERT_WALL, certPage, certPanelHalf, certSlots, faceYaw, tabAngles, type CertSlot } from "./layout";
import { atlasLayout, orientedQuadBuffers } from "./logoAtlas";
import { useAtlasTexture } from "./LogoQuads";

type Cert = ExperienceData["certifications"][number];

export interface CertLabels {
  title: string;
  all: string;
  other: string;
  inProgress: string;
  expired: string;
}

const { radius: R, badge } = CERT_WALL;
const ACCENT: Record<Cert["status"], string> = { earned: COLORS.cyan, "in-progress": COLORS.amber, expired: "#71717a" };
const BODY = new Color("#0f0f19");
const BODY_HOVER = new Color("#132433");
const LOGO = { size: 0.34, inset: 0.32 };
const NEAR = 5;

/** Badge-local offset (x right, y up, z toward the plaza) to world space. */
function badgePoint(slot: CertSlot, x: number, y: number, z: number): [number, number, number] {
  const yaw = faceYaw(slot.a);
  const [cx, cy, cz] = arcPoint(R, slot.a, slot.y);
  return [cx + Math.cos(yaw) * x + Math.sin(yaw) * z, cy + y, cz - Math.sin(yaw) * x + Math.cos(yaw) * z];
}

/** Neon outlines of every badge in one line geometry (one draw call), colored by status. */
function badgeOutlines(slots: CertSlot[], certs: Cert[], boost: number): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const hw = badge.w / 2;
  const hh = badge.h / 2;
  const corners: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
  slots.forEach((slot, i) => {
    const color = new Color(ACCENT[certs[i].status]).multiplyScalar(boost);
    for (let k = 0; k < 4; k++) {
      const [ax, ay] = corners[k];
      const [bx, by] = corners[(k + 1) % 4];
      positions.push(...badgePoint(slot, ax, ay, 0.01), ...badgePoint(slot, bx, by, 0.01));
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return g;
}

/** Issuer logos of the visible badges as one mesh over a canvas atlas (one draw call). */
function BadgeLogos({ slots, certs }: { slots: CertSlot[]; certs: Cert[] }) {
  const layout = useMemo(() => atlasLayout(certs.map((c) => c.logo), 128), [certs]);
  const texture = useAtlasTexture(layout.srcs, layout.cols, layout.rows, layout.cell);
  const geometry = useMemo(() => {
    const quads = slots.flatMap((slot, i) => {
      const src = certs[i].logo;
      if (!src) return [];
      return [{ src, center: badgePoint(slot, -badge.w / 2 + LOGO.inset, badge.h / 2 - LOGO.inset, 0.02), yaw: faceYaw(slot.a), size: LOGO.size }];
    });
    const { positions, uvs, indices } = orientedQuadBuffers(layout, quads);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("uv", new BufferAttribute(uvs, 2));
    g.setIndex(new BufferAttribute(indices, 1));
    g.computeBoundingSphere();
    return g;
  }, [layout, slots, certs]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (!texture) return null;
  return (
    <mesh geometry={geometry} renderOrder={3} raycast={() => null}>
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function BadgeText({ slot, cert, labels }: { slot: CertSlot; cert: Cert; labels: CertLabels }) {
  const headline = cert.code ?? cert.issuer;
  const left = -badge.w / 2 + (cert.logo ? LOGO.inset * 2 + 0.06 : 0.15);
  const footer = cert.status === "earned" ? cert.issuedLabel : cert.status === "in-progress" ? labels.inProgress : labels.expired;
  return (
    <group position={arcPoint(R, slot.a, slot.y)} rotation={[0, faceYaw(slot.a), 0]}>
      <Text
        font={FONTS.monoBold}
        fontSize={cert.code ? 0.28 : 0.17}
        color={ACCENT[cert.status]}
        anchorX="left"
        anchorY="middle"
        position={[left, badge.h / 2 - LOGO.inset, 0.02]}
        maxWidth={badge.w / 2 - left - 0.1}
        whiteSpace="nowrap"
        material-toneMapped={false}
      >
        {headline}
      </Text>
      <Text
        font={FONTS.sans}
        fontSize={0.12}
        color={cert.status === "expired" ? "#8b8b94" : "#d4d4d8"}
        anchorX="left"
        anchorY="top"
        position={[-badge.w / 2 + 0.15, badge.h / 2 - 0.66, 0.02]}
        maxWidth={badge.w - 0.3}
        lineHeight={1.3}
      >
        {`${cert.short}\n${footer.toUpperCase()}`}
      </Text>
    </group>
  );
}

function Pill({ label, a, y, w, active, color, onClick }: { label: string; a: number; y: number; w: number; active: boolean; color: string; onClick: () => void }) {
  return (
    <group
      position={arcPoint(R, a, y)}
      rotation={[0, faceYaw(a), 0]}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <mesh>
        <planeGeometry args={[w, CERT_WALL.tab.h]} />
        <meshBasicMaterial color={active ? color : "#0f0f19"} transparent opacity={0.9} toneMapped={false} />
      </mesh>
      <BoxEdges size={[w, CERT_WALL.tab.h, 0.01]} color={color} opacity={active ? 1 : 0.55} />
      <Text font={FONTS.monoBold} fontSize={CERT_WALL.tab.font} letterSpacing={0.08} color={active ? "#05050c" : color} anchorX="center" anchorY="middle" position={[0, 0, 0.02]} material-toneMapped={false}>
        {label}
      </Text>
    </group>
  );
}

/** Curved glass band behind the badges (open cylinder segment) with neon rims at top and bottom. */
function Panel({ half }: { half: number }) {
  const r = R + CERT_WALL.inset;
  const { y0, y1 } = CERT_WALL.panel;
  // three's cylinder theta starts at +z and turns toward +x, the opposite way to our angles.
  const thetaStart = Math.PI / 2 - half;
  return (
    <group position={[arcPoint(0, 0, 0)[0], (y0 + y1) / 2, arcPoint(0, 0, 0)[2]]}>
      <mesh raycast={() => null}>
        <cylinderGeometry args={[r, r, y1 - y0, 32, 1, true, thetaStart, half * 2]} />
        <meshBasicMaterial color={COLORS.cyan} transparent opacity={0.05} side={DoubleSide} depthWrite={false} />
      </mesh>
      {[y0, y1].map((y) => (
        <mesh key={y} position={[0, y - (y0 + y1) / 2, 0]} raycast={() => null}>
          <cylinderGeometry args={[r, r, 0.05, 32, 1, true, thetaStart, half * 2]} />
          <meshBasicMaterial color={COLORS.cyan} transparent opacity={0.8} side={DoubleSide} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * L1 certification wall: a curved holo-wall facing the plaza with issuer tabs (All, the main issuers,
 * Other) and up to 12 badges per page, earned newest first. Clicking a badge opens the shared preview
 * card (`openCert`, shown by `DialogHost`), never a third-party page in a frame. Badges are instanced, their outlines
 * and logos are one mesh each, so the wall stays near 30 draw calls at any certification count.
 */
export function CertWall({ certifications, labels, tier }: { certifications: Cert[]; labels: CertLabels; tier: GpuTier }) {
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  const tabs = useMemo(() => issuerTabs(certifications), [certifications]);
  const [tabIndex, setTabIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const tab = tabs[Math.min(tabIndex, tabs.length - 1)];
  const list = useMemo(() => (tab.key === "all" ? certifications : certifications.filter((c) => tab.issuers.includes(c.issuer))), [certifications, tab]);
  const page = certPage(list.length, pageIndex);
  const shown = useMemo(() => list.slice(page.start, page.end), [list, page.start, page.end]);
  const slots = useMemo(() => certSlots(shown.length), [shown.length]);
  const tabLabels = tabs.length > 1 ? tabs.map((t) => `${t.key === "all" ? labels.all : t.key === "other" ? labels.other : t.key} ${t.count}`.toUpperCase()) : [];
  const tabSlots = tabAngles(tabLabels);
  // Sized to the All tab's first page, so switching tabs never resizes the wall.
  const half = certPanelHalf(Math.min(certifications.length, CERT_PAGE_SIZE), tabLabels);
  const boost = tier === "full" ? 1.4 : 1;

  const bodies = useRef<InstancedMesh>(null);
  const glows = useRef<InstancedMesh>(null);
  const hovered = useRef(-1);
  const glow = useRef<number[]>([]);
  const outlines = useMemo(() => badgeOutlines(slots, shown, boost), [slots, shown, boost]);
  useEffect(() => () => outlines.dispose(), [outlines]);

  useLayoutEffect(() => {
    const dummy = new Object3D();
    for (const mesh of [bodies.current, glows.current]) {
      if (!mesh) continue;
      slots.forEach((slot, i) => {
        dummy.position.set(...arcPoint(R, slot.a, slot.y));
        dummy.rotation.set(0, faceYaw(slot.a), 0);
        if (mesh === glows.current) dummy.translateZ(-0.03);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, mesh === bodies.current ? BODY : new Color(0, 0, 0));
      });
      mesh.count = slots.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    glow.current = slots.map(() => 0.06);
    hovered.current = -1;
  }, [slots]);

  const color = useMemo(() => new Color(), []);
  useFrame((_, dt) => {
    const g = glows.current;
    const b = bodies.current;
    if (!g || !b) return;
    const onFloor = Math.abs(roverRuntime.y) < 0.5;
    slots.forEach((slot, i) => {
      const [x, , z] = arcPoint(R, slot.a, slot.y);
      const near = onFloor && Math.hypot(roverRuntime.x - x, roverRuntime.z - z) < NEAR;
      const want = hovered.current === i ? 0.55 : near ? 0.3 : 0.06;
      const k = reducedMotion ? 1 : Math.min(1, dt * 6);
      glow.current[i] = (glow.current[i] ?? want) + (want - (glow.current[i] ?? want)) * k;
      g.setColorAt(i, color.set(ACCENT[shown[i].status]).multiplyScalar(glow.current[i]));
      b.setColorAt(i, hovered.current === i ? BODY_HOVER : BODY);
    });
    if (g.instanceColor) g.instanceColor.needsUpdate = true;
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
  });

  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId !== undefined && e.instanceId < shown.length ? e.instanceId : -1);

  return (
    <group name="cert-wall">
      <Panel half={half} />
      <Text
        font={FONTS.monoBold}
        fontSize={0.42}
        letterSpacing={0.12}
        color={COLORS.cyan}
        anchorX="center"
        anchorY="bottom"
        position={arcPoint(R + CERT_WALL.inset, 0, CERT_WALL.titleY)}
        rotation={[0, faceYaw(0), 0]}
        material-toneMapped={false}
      >
        {`${labels.title.toUpperCase()} · ${certifications.length}`}
      </Text>
      {tabSlots.map((t, i) => (
        <Pill
          key={tabs[i].key}
          label={tabLabels[i]}
          a={t.a}
          y={CERT_WALL.tabsY}
          w={t.w}
          active={tabs[i] === tab}
          color={COLORS.cyan}
          onClick={() => {
            setTabIndex(i);
            setPageIndex(0);
          }}
        />
      ))}
      <instancedMesh ref={glows} args={[undefined, undefined, CERT_PAGE_SIZE]} raycast={() => null}>
        <planeGeometry args={[badge.w + 0.3, badge.h + 0.3]} />
        <meshBasicMaterial transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={bodies}
        args={[undefined, undefined, CERT_PAGE_SIZE]}
        onPointerMove={(e) => {
          e.stopPropagation();
          hovered.current = pick(e);
          document.body.style.cursor = hovered.current >= 0 ? "pointer" : "";
        }}
        onPointerOut={() => {
          hovered.current = -1;
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          e.stopPropagation();
          const i = pick(e);
          if (i >= 0) openCert(shown[i]);
        }}
      >
        <planeGeometry args={[badge.w, badge.h]} />
        <meshBasicMaterial transparent opacity={0.92} />
      </instancedMesh>
      <lineSegments geometry={outlines} raycast={() => null}>
        <lineBasicMaterial vertexColors transparent opacity={0.85} toneMapped={false} />
      </lineSegments>
      <BadgeLogos slots={slots} certs={shown} />
      {slots.map((slot, i) => (
        <BadgeText key={shown[i].id} slot={slot} cert={shown[i]} labels={labels} />
      ))}
      {page.pages > 1 && (
        <>
          <Pill label="<" a={-0.08} y={CERT_WALL.pagerY} w={0.8} active={false} color={COLORS.cyan} onClick={() => setPageIndex(page.page - 1)} />
          <Text font={FONTS.mono} fontSize={0.22} color="#a1a1aa" anchorX="center" anchorY="middle" position={arcPoint(R, 0, CERT_WALL.pagerY)} rotation={[0, faceYaw(0), 0]}>
            {`${page.page + 1} / ${page.pages}`}
          </Text>
          <Pill label=">" a={0.08} y={CERT_WALL.pagerY} w={0.8} active={false} color={COLORS.cyan} onClick={() => setPageIndex(page.page + 1)} />
        </>
      )}
    </group>
  );
}
