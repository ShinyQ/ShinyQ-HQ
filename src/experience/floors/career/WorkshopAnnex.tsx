"use client";

import { Text } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, type InstancedMesh, Object3D } from "three";
import { COLORS, FLOOR_GAP, FLOOR_COLOR } from "../../config";
import { monoWidth } from "../../fx/readableFlip";
import { Readable } from "../../fx/Readable";
import { useDispose } from "../../fx/useDispose";
import { FONTS, GlassBox } from "../../tower/primitives";
import type { CareerData, Rect } from "../../types";
import { BENCH, REPO_WALL, type CareerRoadLayout } from "./layout";

export interface WorkshopLabels {
  workshop: string;
  repos: string;
  models: string;
  window: string;
}

const dummy = new Object3D();
const BENCH_H = 0.85;
const WINDOW_H = 9;

function Benches({ spots }: { spots: CareerRoadLayout["workshop"]["benches"] }) {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new BoxGeometry(BENCH.w, BENCH_H, BENCH.d), []);
  useDispose(geometry);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    spots.forEach((b, i) => {
      dummy.position.set(b.x, BENCH_H / 2, b.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [spots]);
  if (spots.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, spots.length]} frustumCulled={false}>
      <meshStandardMaterial color="#141428" emissive={COLORS.amber} emissiveIntensity={0.35} roughness={0.7} />
    </instancedMesh>
  );
}

/** Columns of repo names for the wall (one Text draw call). */
function repoColumns(repos: readonly string[], columns: number): string {
  const rows = Math.ceil(repos.length / columns);
  const width = 30;
  const cut = (s: string) => (s.length > width - 2 ? `${s.slice(0, width - 3)}\u2026` : s);
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    const cells: string[] = [];
    for (let c = 0; c < columns; c++) {
      const repo = repos[c * rows + r];
      if (repo) cells.push(cut(repo).padEnd(width));
    }
    lines.push(cells.join("").trimEnd());
  }
  return lines.join("\n");
}

/**
 * Workshop annex at the end of the Career Road: side-project benches, the public repo wall with the
 * Hugging Face models, and the glass window that looks up at the Labs on L3. The annex floor is a
 * plaza of the road network (drawn by RoadMarkings).
 */
export function WorkshopAnnex({ layout, career, labs, labels }: { layout: CareerRoadLayout; career: CareerData; labs: Rect; labels: WorkshopLabels }) {
  const { workshop, windowX } = layout;
  const accent = FLOOR_COLOR.L2;
  const d = layout.annex.d;
  const cx = (workshop.wall.minX + workshop.wall.maxX) / 2;
  const wallW = workshop.wall.maxX - workshop.wall.minX;
  const wallZ = (workshop.wall.minZ + workshop.wall.maxZ) / 2;
  const repos = useMemo(() => repoColumns(career.repos, 2), [career.repos]);
  const models = useMemo(() => career.models.map((m) => `\u25B8 ${m}`).join("\n"), [career.models]);

  // Sight lines from the window frame up to the east edge of the Labs slab (L3, one floor up).
  const sight = useMemo(() => {
    const pts: number[] = [];
    for (const z of [-d / 2, 0, d / 2]) pts.push(windowX, WINDOW_H, z, labs.maxX, FLOOR_GAP, z * (labs.maxZ / (d / 2)));
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pts, 3));
    return g;
  }, [d, windowX, labs.maxX, labs.maxZ]);
  useDispose(sight);

  return (
    <group name="workshop-annex">
      <GlassBox size={[wallW, REPO_WALL.height, REPO_WALL.thickness]} position={[cx, REPO_WALL.height / 2, wallZ]} color={COLORS.cyan} fillOpacity={0.06} edgeOpacity={0.7} />
      {/* The title and both panels turn around the wall's center when the camera is behind the wall. */}
      <Readable position={[cx, 0, wallZ]}>
        <Text font={FONTS.monoBold} fontSize={0.8} letterSpacing={0.12} color={accent} anchorX="center" anchorY="bottom" position={[0, REPO_WALL.height + 0.9, 0]} material-toneMapped={false}>
          {labels.workshop.toUpperCase()}
        </Text>
        <group position={[workshop.wall.minX + 0.5 - cx, REPO_WALL.height - 0.4, workshop.wall.maxZ + 0.05 - wallZ]}>
          <Text font={FONTS.monoBold} fontSize={0.32} letterSpacing={0.1} color={COLORS.cyan} anchorX="left" anchorY="top" material-toneMapped={false}>
            {`${labels.repos.toUpperCase()} (${career.repos.length})`}
          </Text>
          <Text font={FONTS.mono} fontSize={0.2} lineHeight={1.45} color="#d4d4d8" anchorX="left" anchorY="top" position={[0, -0.55, 0]} whiteSpace="nowrap">
            {repos}
          </Text>
        </group>
        <group position={[workshop.wall.maxX - 4.6 - cx, REPO_WALL.height - 0.4, workshop.wall.maxZ + 0.05 - wallZ]}>
          <Text font={FONTS.monoBold} fontSize={0.32} letterSpacing={0.1} color={COLORS.violet} anchorX="left" anchorY="top" material-toneMapped={false}>
            {labels.models.toUpperCase()}
          </Text>
          <Text font={FONTS.sans} fontSize={0.22} lineHeight={1.5} maxWidth={4.3} color="#d4d4d8" anchorX="left" anchorY="top" position={[0, -0.55, 0]}>
            {models}
          </Text>
        </group>
      </Readable>

      <Benches spots={workshop.benches} />
      {workshop.benches.map((b, i) => {
        const project = career.sideProjects[i];
        if (!project) return null;
        return (
          <Readable key={project.id} position={[b.x, BENCH_H + 0.2, b.z]}>
            <Text font={FONTS.sansBold} fontSize={0.24} lineHeight={1.3} maxWidth={BENCH.w - 0.15} textAlign="center" color="#f4f4f5" anchorX="center" anchorY="bottom" rotation={[-0.4, 0, 0]}>
              {`${project.title}${project.year ? `\n${project.year}` : ""}`}
            </Text>
          </Readable>
        );
      })}

      <GlassBox size={[0.2, WINDOW_H, d]} position={[windowX - 0.1, WINDOW_H / 2, 0]} color={COLORS.violet} fillOpacity={0.1} edgeOpacity={0.9} />
      <lineSegments geometry={sight}>
        <lineBasicMaterial color={COLORS.violet} transparent opacity={0.45} toneMapped={false} />
      </lineSegments>
      {/* Right-aligned at the window: seen from behind it turns around its own middle, so it stays inside the annex. */}
      <Readable position={[windowX - 0.6, WINDOW_H - 1.2, d / 2 - 1]} pivot={[windowX - 0.6 - monoWidth(`\u25B2 ${labels.window}`, 0.5, 0.1) / 2, d / 2 - 1]}>
        <Text font={FONTS.monoBold} fontSize={0.5} letterSpacing={0.1} color={COLORS.violet} anchorX="right" anchorY="bottom" material-toneMapped={false}>
          {`\u25B2 ${labels.window}`}
        </Text>
      </Readable>
    </group>
  );
}
