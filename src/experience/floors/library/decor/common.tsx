"use client";

import { Billboard, Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";
import type { RoomId } from "@/content/schema";
import { FloatingSigns } from "../../../fx/FloatingSign";
import { HoloIcon, type HoloIconInstance } from "../../../fx/HoloIcon";
import { LIBRARY_ICONS } from "../../../fx/holoIcons";
import { createInstancedGlassMaterial, neonColor } from "../../../fx/materials";
import type { SignSpec } from "../../../fx/signLayout";
import { zoneSignSpecs } from "./signs";
import { useUniformTime } from "../../../fx/useUniformTime";
import { FONTS, tierFill } from "../../../tower/primitives";
import type { GpuTier, LibraryData } from "../../../types";
import { LineBatch } from "../../labs/lines";
import { LIBRARY_ZONES, paperSlots, ZONE_TONE, type LibraryLayout, type LibraryStation, type LibraryZone } from "../model";

/** Everything a concept's decor needs; the same props in the dev prototype and on the real floor. */
export interface DecorProps {
  layout: LibraryLayout;
  library: LibraryData;
  tier: GpuTier;
  reducedMotion: boolean;
  /** Zone names from messages (`library.posts`, `library.research`, `library.publications`, `library.talks`). */
  zones: Record<LibraryZone, string>;
  /** Dev prototypes only: a click on a station. The tower clicks stations through point-and-go (interact/registry.ts). */
  onStation?: (room: RoomId) => void;
  /** In-world click on a paper: open its preview modal (`openPaperFor`). */
  onPaper: (id: string) => void;
}

export const STATION_HEIGHT: Record<LibraryZone, number> = { blog: 1.1, research: 3.2, models: 2.6, talks: 2.6 };

/** Yaw (HoloIcon `face`) that turns an icon from its station toward the road. */
export const faceRoad = (s: Pick<LibraryStation, "facing">) => Math.atan2(-s.facing.x, -s.facing.z);

/** Titles per room: posts from content (any casing the content uses), shelves from zone names. */
export function stationTitles(library: LibraryData, zones: Record<LibraryZone, string>): Map<RoomId, string> {
  const map = new Map<RoomId, string>(library.posts.map((p) => [`L4:${p.slug}` as RoomId, p.title]));
  map.set("L4:research", zones.research);
  map.set("L4:publications", zones.models);
  map.set("L4:talks", zones.talks);
  return map;
}

function setCursor(value: string) {
  document.body.style.cursor = value;
}

/** Station plinths and alcoves: glass boxes (one instanced mesh) and their edges and door markers (one line batch). */
export function StationShells({ stations, tier, onStation }: { stations: readonly LibraryStation[]; tier: GpuTier; onStation?: (room: RoomId) => void }) {
  const mesh = useRef<InstancedMesh>(null);
  const glass = useMemo(() => createInstancedGlassMaterial(tierFill(0.06, tier)), [tier]);
  const list = useMemo(() => [glass], [glass]);
  useUniformTime(list);
  useEffect(() => () => glass.dispose(), [glass]);
  const edgeColor = useMemo(() => neonColor("#ffffff", 1.5, tier), [tier]);
  const edges = useMemo(() => {
    const batch = new LineBatch();
    for (const s of stations) {
      const h = STATION_HEIGHT[s.zone];
      const w = s.rect.maxX - s.rect.minX;
      const d = s.rect.maxZ - s.rect.minZ;
      batch.box(s.center.x, h / 2, s.center.z, w, h, d, ZONE_TONE[s.zone]);
      // Door marker on the front edge, toward the pad.
      const fx = s.center.x - (s.facing.x * w) / 2;
      const fz = s.center.z - (s.facing.z * d) / 2;
      const ax = Math.abs(s.facing.z);
      const az = Math.abs(s.facing.x);
      batch.segment([fx - ax, 0.05, fz - az, fx + ax, 0.05, fz + az], "#f4f4f5");
    }
    return batch.build();
  }, [stations]);
  useEffect(() => () => edges.dispose(), [edges]);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const matrix = new Matrix4();
    const color = new Color();
    stations.forEach((s, i) => {
      const h = STATION_HEIGHT[s.zone];
      matrix.compose(new Vector3(s.center.x, h / 2, s.center.z), new Quaternion(), new Vector3(s.rect.maxX - s.rect.minX, h, s.rect.maxZ - s.rect.minZ));
      m.setMatrixAt(i, matrix);
      m.setColorAt(i, color.set(ZONE_TONE[s.zone]));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [stations]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!onStation || e.delta > 6 || e.instanceId === undefined) return;
    e.stopPropagation();
    const s = stations[e.instanceId];
    if (s) onStation(s.room);
  };
  const handlers = onStation ? { onClick, onPointerOver: () => setCursor("pointer"), onPointerOut: () => setCursor("") } : {};

  return (
    <group name="library-stations">
      <instancedMesh
        key={stations.length}
        ref={mesh}
        args={[undefined, undefined, Math.max(1, stations.length)]}
        material={glass}
        renderOrder={2}
        {...handlers}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <lineSegments geometry={edges} raycast={() => null}>
        <lineBasicMaterial color={edgeColor} vertexColors transparent opacity={0.95} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

/** One Neon line icon per station, grouped by zone (one draw call per zone, two on the full tier). */
export function ZoneIcons({ stations, tier, reducedMotion, lift = 2.2, size = 2.4 }: { stations: readonly LibraryStation[]; tier: GpuTier; reducedMotion: boolean; lift?: number; size?: number }) {
  const instances = useMemo(() => {
    const out = {} as Record<LibraryZone, HoloIconInstance[]>;
    for (const zone of LIBRARY_ZONES) {
      out[zone] = stations.filter((s) => s.zone === zone).map((s) => ({ x: s.center.x, y: STATION_HEIGHT[s.zone] + lift, z: s.center.z, face: faceRoad(s) }));
    }
    return out;
  }, [stations, lift]);
  return (
    <group name="library-icons">
      {LIBRARY_ZONES.map((zone) => (
        <HoloIcon key={zone} strokes={LIBRARY_ICONS[zone]} instances={instances[zone]} color={ZONE_TONE[zone]} size={size} tier={tier} reducedMotion={reducedMotion} />
      ))}
    </group>
  );
}

/** Station titles as billboards (troika text, one draw call each). */
export function StationLabels({ stations, titles, y = 5.2 }: { stations: readonly LibraryStation[]; titles: Map<RoomId, string>; y?: number }) {
  return (
    <group name="library-labels">
      {stations.map((s) => (
        <Billboard key={s.room} position={[s.center.x, STATION_HEIGHT[s.zone] + y - 1, s.center.z]}>
          <Text
            font={FONTS.sansBold}
            fontSize={s.zone === "blog" ? 0.42 : 0.55}
            maxWidth={s.zone === "blog" ? 5.2 : 7}
            textAlign="center"
            anchorX="center"
            anchorY="bottom"
            lineHeight={1.15}
            color={ZONE_TONE[s.zone]}
            outlineWidth={0.03}
            outlineColor="#05050c"
            material-toneMapped={false}
          >
            {titles.get(s.room) ?? s.room}
          </Text>
        </Billboard>
      ))}
    </group>
  );
}

/**
 * Zone names floating where each zone's road starts (spectacle round: no words on the floor), plus any
 * concept signs (`extra`, such as the newsroom's timeline years), all in one `FloatingSigns` group.
 */
export function ZoneSigns({ layout, zones, tier, extra }: { layout: LibraryLayout; zones: Record<LibraryZone, string>; tier: GpuTier; extra?: readonly SignSpec[] }) {
  const signs = useMemo(() => [...zoneSignSpecs(layout, zones), ...(extra ?? [])], [layout, zones, extra]);
  return <FloatingSigns signs={signs} name="library-signs" tier={tier} />;
}

/** Paper plates inside the Research station (one instanced mesh): a click opens that paper's preview. */
export function ResearchPapers({ layout, library, tier, onPaper }: Pick<DecorProps, "layout" | "library" | "tier" | "onPaper">) {
  const mesh = useRef<InstancedMesh>(null);
  const station = layout.stations.find((s) => s.zone === "research");
  const papers = library.research;
  const slots = useMemo(() => (station ? paperSlots(station, papers.length) : []), [station, papers.length]);
  const fill = useMemo(() => neonColor(ZONE_TONE.research, 1.2, tier), [tier]);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const matrix = new Matrix4();
    const q = new Quaternion();
    slots.forEach((p, i) => {
      q.setFromAxisAngle(new Vector3(0, 1, 0), p.yaw);
      matrix.compose(new Vector3(p.x, 1.7, p.z), q, new Vector3(1, 1, 1));
      m.setMatrixAt(i, matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [slots]);

  if (!station || !papers.length) return null;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6 || e.instanceId === undefined) return;
    e.stopPropagation();
    const paper = papers[e.instanceId];
    if (paper) onPaper(paper.id);
  };
  return (
    <group name="research-papers">
      <instancedMesh
        key={papers.length}
        ref={mesh}
        args={[undefined, undefined, papers.length]}
        onClick={onClick}
        onPointerOver={() => setCursor("pointer")}
        onPointerOut={() => setCursor("")}
      >
        <planeGeometry args={[slots[0]?.width ?? 1.6, 2]} />
        <meshBasicMaterial color={fill} transparent opacity={0.35} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
