"use client";

import { Text } from "@react-three/drei";
import { useMemo } from "react";
import { FONTS } from "../../../tower/primitives";
import { ZONE_TONE } from "../model";
import { faceRoad, ResearchPapers, STATION_HEIGHT, StationLabels, StationShells, stationTitles, ZoneIcons, ZoneSigns, type DecorProps } from "./common";
import { FlipBooks } from "./BookHolograms";
import type { BookInstance } from "./flipBooks";

/**
 * Concept A, "Reading Room": alcoves along the loop, a small open book turning its pages above every
 * post alcove, and a large book over the atrium with the newest post's title under it.
 */
export function AtriumDecor(props: DecorProps) {
  const { layout, library, tier, reducedMotion, zones, onStation } = props;
  const titles = useMemo(() => stationTitles(library, zones), [library, zones]);
  const books = useMemo<BookInstance[]>(() => {
    const posts = layout.stations.filter((s) => s.zone === "blog");
    return [
      ...posts.map((s, i) => ({ x: s.center.x, y: STATION_HEIGHT.blog + 1.6, z: s.center.z, face: faceRoad(s), size: 1.6, phase: i * 0.17 })),
      { x: layout.centerpiece.x, y: 4.2, z: layout.centerpiece.z, face: -Math.PI / 4, size: 5, phase: 0 },
    ];
  }, [layout]);
  const newest = library.posts.find((p) => !p.url);
  const shelves = useMemo(() => layout.stations.filter((s) => s.zone !== "blog"), [layout.stations]);
  return (
    <group name="library-atrium">
      <StationShells stations={layout.stations} tier={tier} onStation={onStation} />
      <FlipBooks books={books} color={ZONE_TONE.blog} tier={tier} reducedMotion={reducedMotion} />
      <ZoneIcons stations={shelves} tier={tier} reducedMotion={reducedMotion} />
      <StationLabels stations={layout.stations} titles={titles} />
      <ZoneSigns layout={layout} zones={zones} />
      <ResearchPapers layout={layout} library={library} tier={tier} onPaper={props.onPaper} />
      {newest && (
        <Text
          font={FONTS.sansBold}
          fontSize={0.7}
          maxWidth={12}
          textAlign="center"
          anchorX="center"
          anchorY="top"
          position={[layout.centerpiece.x, 1.2, layout.centerpiece.z + 3]}
          rotation={[-Math.PI / 2, 0, 0]}
          color={ZONE_TONE.blog}
          material-toneMapped={false}
        >
          {newest.title}
        </Text>
      )}
    </group>
  );
}
