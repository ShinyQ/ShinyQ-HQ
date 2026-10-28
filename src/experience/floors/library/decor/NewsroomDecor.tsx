"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, type Mesh } from "three";
import { neonColor } from "../../../fx/materials";
import { FONTS } from "../../../tower/primitives";
import { LineBatch } from "../../labs/lines";
import { ZONE_TONE } from "../model";
import { WALL_TEXT } from "../readable";
import { FlipBooks } from "./BookHolograms";
import { ResearchPapers, STATION_HEIGHT, StationShells, postTitles, ZoneIcons, type DecorProps } from "./common";
import { featuredStation } from "../icons";
import { stageBook } from "./flipBooks";
import { LibrarySigns } from "./LibrarySigns";
import { TrackShelves } from "./TrackShelves";

/** Ticker speed (u/s) and the gap between headlines. */
const TICKER = { speed: 2.4, separator: "   \u25c6   " } as const;

/**
 * Headline ticker: every post title in one troika text (written twice, so the loop has no seam),
 * scrolling left. The clip rect moves with the text, so only the part over the wall shows.
 */
function Ticker({ text, width, y, z, x, reducedMotion }: { text: string; width: number; y: number; z: number; x: number; reducedMotion: boolean }) {
  const ref = useRef<Mesh & { clipRect: [number, number, number, number] | null; textRenderInfo?: { blockBounds: number[] } | null }>(null);
  const offset = useRef(0);
  useFrame((_, dt) => {
    const t = ref.current;
    if (!t) return;
    const bounds = t.textRenderInfo?.blockBounds;
    const loop = bounds ? (bounds[2] - bounds[0]) / 2 : 0;
    if (!reducedMotion && loop > 0) offset.current = (offset.current + Math.min(dt, 0.1) * TICKER.speed) % loop;
    t.position.x = -offset.current;
    t.clipRect = [offset.current, -1, offset.current + width, 1];
  });
  return (
    <group position={[x - width / 2, y, z]}>
      <Text
        ref={ref}
        font={FONTS.monoBold}
        fontSize={WALL_TEXT.ticker.fontSize}
        anchorX="left"
        anchorY="middle"
        whiteSpace="nowrap"
        color={ZONE_TONE.blog}
        clipRect={[0, -1, width, 1]}
        material-toneMapped={false}
      >
        {`${text}${TICKER.separator}${text}${TICKER.separator}`}
      </Text>
    </group>
  );
}

/**
 * Concept B, "Newsroom": the headline wall (newest title in large type and the ticker of every title),
 * the featured post on a lit stage under a turning open-book hologram, the reader track bookshelves along the
 * timeline lane (`TrackShelves`), and the research, models and talks shelves as press desks.
 */
export function NewsroomDecor(props: DecorProps) {
  const { layout, library, tier, reducedMotion, zones } = props;
  const titles = useMemo(() => postTitles(library), [library]);
  const tracks = useMemo(() => new Map(library.tracks.map((t) => [t.slug, t.label])), [library.tracks]);
  const wall = layout.extras.wall;
  const featured = featuredStation(layout);
  const featuredPost = featured ? library.posts.find((p) => `L4:${p.slug}` === featured.room) : undefined;
  const ticker = library.posts.map((p) => p.title).join(TICKER.separator);
  const others = useMemo(() => layout.stations.filter((s) => s !== featured), [layout.stations, featured]);
  const books = useMemo(() => (featured ? [stageBook(featured, STATION_HEIGHT.blog)] : []), [featured]);
  const frame = useMemo(() => {
    if (!wall) return null;
    const batch = new LineBatch();
    const w = wall.maxX - wall.minX;
    batch.box((wall.minX + wall.maxX) / 2, 3.5, (wall.minZ + wall.maxZ) / 2, w, 7, wall.maxZ - wall.minZ, ZONE_TONE.blog);
    // Ticker rails above and below the scrolling line.
    for (const y of [1.15, 2.25]) batch.segment([wall.minX, y, wall.maxZ + 0.05, wall.maxX, y, wall.maxZ + 0.05], ZONE_TONE.talks);
    return batch.build();
  }, [wall]);
  useEffect(() => () => frame?.dispose(), [frame]);
  const neon = useMemo(() => neonColor("#ffffff", 1.5, tier), [tier]);

  return (
    <group name="library-newsroom">
      <StationShells stations={layout.stations} tier={tier} />
      <ZoneIcons stations={others} shapes={library.shapes} tier={tier} reducedMotion={reducedMotion} />
      {layout.bays.length > 0 && <TrackShelves bays={layout.bays} tier={tier} reducedMotion={reducedMotion} />}
      {books.length > 0 && <FlipBooks books={books} color={ZONE_TONE.blog} tier={tier} reducedMotion={reducedMotion} />}
      <LibrarySigns layout={layout} zones={zones} titles={titles} tracks={tracks} tier={tier} reducedMotion={reducedMotion} />
      <ResearchPapers layout={layout} library={library} tier={tier} onPaper={props.onPaper} />
      {wall && frame && (
        <group name="headline-wall">
          <mesh position={[(wall.minX + wall.maxX) / 2, 3.5, (wall.minZ + wall.maxZ) / 2]} raycast={() => null}>
            <boxGeometry args={[wall.maxX - wall.minX, 7, wall.maxZ - wall.minZ]} />
            <meshBasicMaterial color="#0b0b16" transparent opacity={0.9} />
          </mesh>
          <lineSegments geometry={frame} raycast={() => null}>
            <lineBasicMaterial color={neon} vertexColors transparent opacity={0.95} toneMapped={false} />
          </lineSegments>
          {featuredPost && (
            <Text
              font={FONTS.sansBold}
              fontSize={WALL_TEXT.title.fontSize}
              maxWidth={wall.maxX - wall.minX - 2 * WALL_TEXT.title.inset}
              lineHeight={WALL_TEXT.title.lineHeight}
              anchorX="left"
              anchorY="top"
              position={[wall.minX + WALL_TEXT.title.inset, WALL_TEXT.title.top, wall.maxZ + WALL_TEXT.title.out]}
              color="#f4f4f5"
              material-toneMapped={false}
            >
              {featuredPost.title}
            </Text>
          )}
          <Ticker text={ticker} width={wall.maxX - wall.minX - 0.4} x={(wall.minX + wall.maxX) / 2} y={WALL_TEXT.ticker.y} z={wall.maxZ + WALL_TEXT.ticker.out} reducedMotion={reducedMotion} />
        </group>
      )}
      {featured && (
        <mesh position={[featured.center.x, 3.2, featured.center.z]} raycast={() => null}>
          <coneGeometry args={[3, 6.4, 24, 1, true]} />
          <meshBasicMaterial color={ZONE_TONE.blog} transparent opacity={tier === "full" ? 0.07 : 0.05} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}
