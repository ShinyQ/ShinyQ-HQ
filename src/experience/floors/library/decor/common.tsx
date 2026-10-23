"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, Matrix4, Quaternion, Vector3, type Group, type InstancedMesh } from "three";
import type { RoomId } from "@/content/schema";
import { HoloIcon, type HoloIconInstance } from "../../../fx/HoloIcon";
import { LIBRARY_ICONS, type Stroke } from "../../../fx/holoIcons";
import { useShapes } from "../../../fx/shapes";
import { createInstancedGlassMaterial, neonColor } from "../../../fx/materials";
import { useUniformTime } from "../../../fx/useUniformTime";
import { tierFill } from "../../../tower/primitives";
import type { GpuTier, LibraryData } from "../../../types";
import { LineBatch } from "../../labs/lines";
import { paperSlots, ZONE_TONE, type LibraryLayout, type LibraryStation, type LibraryZone } from "../model";

/** Everything the L4 decor needs. Stations are clicked through point-and-go (interact/registry.ts). */
export interface DecorProps {
  layout: LibraryLayout;
  library: LibraryData;
  tier: GpuTier;
  reducedMotion: boolean;
  /** Zone names from messages (`library.posts`, `library.research`, `library.publications`, `library.talks`). */
  zones: Record<LibraryZone, string>;
  /** In-world click on a paper: open its preview modal (`openPaperFor`). */
  onPaper: (id: string) => void;
}

export const STATION_HEIGHT: Record<LibraryZone, number> = { blog: 1.1, research: 3.2, models: 2.6, talks: 2.6 };
/** Desk item icons (`deskSlots`): lift over the desk top and the largest size. */
const DESK_LIFT = 1.3;
const DESK_SIZE = 2;

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
export function StationShells({ stations, tier }: { stations: readonly LibraryStation[]; tier: GpuTier }) {
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

  return (
    <group name="library-stations">
      <instancedMesh
        key={stations.length}
        ref={mesh}
        args={[undefined, undefined, Math.max(1, stations.length)]}
        material={glass}
        renderOrder={2}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <lineSegments geometry={edges} raycast={() => null}>
        <lineBasicMaterial color={edgeColor} vertexColors transparent opacity={0.95} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

/**
 * Where a desk's item icons float, low over the desk so they stay clear of the zone sign above its back edge: one
 * row of at most 4 across the desk, left to right as seen from the road (5 or more items: two rows, the first
 * nearer the road), spaced along it, the size following the spacing (at most `size`).
 */
export function deskSlots(s: LibraryStation, n: number, lift: number, size: number): HoloIconInstance[] {
  const rows = n > 4 ? 2 : 1;
  const cols = Math.ceil(n / rows);
  const along = Math.abs(s.facing.x) > 0.5 ? s.rect.maxZ - s.rect.minZ : s.rect.maxX - s.rect.minX;
  const gap = Math.min(3, along / cols);
  const k = Math.min(size, gap * 0.85);
  return Array.from({ length: n }, (_, i) => {
    const o = ((i % cols) - (cols - 1) / 2) * gap;
    const d = rows > 1 ? (Math.floor(i / cols) ? 1.2 : -1.2) : 0;
    // Right as seen from the road, looking along `facing`, is (-facing.z, facing.x); `d` < 0 is toward the road.
    return { x: s.center.x - s.facing.z * o + s.facing.x * d, y: STATION_HEIGHT[s.zone] + lift, z: s.center.z + s.facing.x * o + s.facing.z * d, face: faceRoad(s), size: k };
  });
}

/**
 * One Neon line icon per station in its zone color, as one batch (one draw call, two on the full tier). Once the
 * floor's shapes load (`shapes`, after its first frame) they crossfade into the items' own icons: one per post
 * station, and one per item over the Research, Models and Talks desks (`deskSlots`).
 */
export function ZoneIcons({ stations, library, shapes, tier, reducedMotion, lift = 2.2, size = 2.4 }: { stations: readonly LibraryStation[]; library: LibraryData; shapes: string; tier: GpuTier; reducedMotion: boolean; lift?: number; size?: number }) {
  const group = useRef<Group>(null);
  const desks = useMemo(() => ({ research: library.research, models: library.models, talks: library.talks }), [library]);
  const own = useShapes<Stroke[]>("L4", shapes, group, (items) => stations.reduce((n, s) => n + (s.zone === "blog" ? (items[s.room.slice(3)] ? 1 : 0) : desks[s.zone].filter((d) => items[d.id]).length), 0));
  const icons = useMemo(
    () => stations.map((s) => ({ x: s.center.x, y: STATION_HEIGHT[s.zone] + lift, z: s.center.z, face: faceRoad(s), strokes: LIBRARY_ICONS[s.zone], color: ZONE_TONE[s.zone] })),
    [stations, lift],
  );
  const unique = useMemo(() => {
    const items = own.items;
    if (!items) return null;
    return stations.flatMap((s, i): HoloIconInstance[] => {
      if (s.zone === "blog") return [{ ...icons[i], strokes: items[s.room.slice(3)] ?? icons[i].strokes }];
      const list = desks[s.zone];
      return deskSlots(s, list.length, DESK_LIFT, DESK_SIZE).map((slot, j) => ({ ...slot, strokes: items[list[j].id] ?? icons[i].strokes, color: ZONE_TONE[s.zone] }));
    });
  }, [own.items, stations, icons, desks]);
  return (
    <group ref={group} name="library-icons">
      {!own.done && <HoloIcon instances={icons} size={size} tier={tier} reducedMotion={reducedMotion} fade={unique ? () => 1 - own.fade.current : undefined} />}
      {unique && <HoloIcon instances={unique} size={size} tier={tier} reducedMotion={reducedMotion} fade={() => own.fade.current} />}
    </group>
  );
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
