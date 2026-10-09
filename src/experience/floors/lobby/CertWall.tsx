"use client";

import { Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useState } from "react";
import { COLORS, LOBBY } from "../../config";
import type { ExperienceData } from "../../types";
import { BoxEdges, FONTS, GlassBox } from "../../tower/primitives";

const BADGE_W = 1.75;
const BADGE_H = 2.3;

export interface CertLabels {
  title: string;
  verify: string;
  inProgress: string;
}

function Badge({ cert, labels, z }: { cert: ExperienceData["certifications"][number]; labels: CertLabels; z: number }) {
  const [hover, setHover] = useState(false);
  const accent = cert.status === "in-progress" ? COLORS.amber : COLORS.cyan;
  const headline = cert.code ?? cert.issuer;
  const footer = cert.url ? `${labels.verify.toUpperCase()} \u203A` : cert.status === "in-progress" ? labels.inProgress.toUpperCase() : "";
  const open = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (cert.url) window.open(cert.url, "_blank", "noopener,noreferrer");
  };
  return (
    <group
      position={[LOBBY.certWall.x - 1.05, 2.75, z]}
      // Louvered toward the default camera so badges read from the plaza (local +z faces -x, +z).
      rotation={[0, -Math.PI / 4, 0]}
      onClick={cert.url ? open : undefined}
      onPointerOver={(e) => {
        if (!cert.url) return;
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "";
      }}
    >
      <mesh>
        <planeGeometry args={[BADGE_W, BADGE_H]} />
        <meshBasicMaterial color={hover ? "#132433" : "#0f0f19"} transparent opacity={0.9} />
      </mesh>
      <BoxEdges size={[BADGE_W, BADGE_H, 0.01]} color={accent} opacity={hover ? 1 : 0.75} />
      <Text font={FONTS.monoBold} fontSize={headline.length > 7 ? 0.2 : 0.34} color={accent} anchorX="center" anchorY="top" position={[0, BADGE_H / 2 - 0.2, 0.02]} maxWidth={BADGE_W - 0.2} textAlign="center" material-toneMapped={false}>
        {headline}
      </Text>
      <Text
        font={FONTS.sans}
        fontSize={0.13}
        color="#d4d4d8"
        anchorX="center"
        anchorY="top"
        position={[0, BADGE_H / 2 - 0.75, 0.02]}
        maxWidth={BADGE_W - 0.25}
        textAlign="center"
        lineHeight={1.35}
      >
        {`${cert.name}${footer ? `\n\n${footer}` : ""}`}
      </Text>
    </group>
  );
}

/** Certification badges along the east wall, each opening its verification link (Microsoft Learn and others). */
export function CertWall({ certifications, labels }: { certifications: ExperienceData["certifications"]; labels: CertLabels }) {
  const { x, z, w, d, h } = LOBBY.certWall;
  const step = (d - 1) / Math.max(1, certifications.length);
  const first = z - d / 2 + 0.5 + step / 2;
  return (
    <group>
      <GlassBox size={[w, h, d]} position={[x, h / 2, z]} color={COLORS.cyan} fillOpacity={0.04} edgeOpacity={0.7} />
      <Text
        font={FONTS.monoBold}
        fontSize={0.42}
        letterSpacing={0.12}
        color={COLORS.cyan}
        anchorX="center"
        anchorY="bottom"
        position={[x - 0.6, h + 0.3, z]}
        rotation={[0, -Math.PI / 2, 0]}
        material-toneMapped={false}
      >
        {labels.title.toUpperCase()}
      </Text>
      {certifications.map((cert, i) => (
        <Badge key={cert.id} cert={cert} labels={labels} z={first + i * step} />
      ))}
    </group>
  );
}
