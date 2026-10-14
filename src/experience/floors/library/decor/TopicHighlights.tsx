"use client";

import { useEffect, useMemo } from "react";
import { useHQStore } from "@/store/useHQStore";
import { GlowStrips, HighlightBeacons, type BeaconSize, type BeaconTarget, type GlowStrip } from "../../../fx/FilterHighlights";
import { sceneProbes } from "../../../fx/probes";
import type { GpuTier } from "../../../types";
import { NEWSROOM } from "../concepts/newsroom";
import { ZONE_TONE, type LibraryLayout } from "../model";
import { litArchive, litStations, topicRoadGlow } from "../topics";

/** Station beacons: shorter than the L3 pod beacons (the stations are smaller and the roof slab is close). */
const BEACON: BeaconSize = { full: 9, lite: 6, radius: 0.45, glow: 2.4, inset: 0.5 };
/** Glow strip widths: the timeline run and the spurs. */
const STRIP = { road: 2.4, spur: 1.6 } as const;
const STRIP_COLOR = "#67e8f9";

/**
 * Topic Constellation highlights on L4 (owner request 2026-10-14): every station and desk of the picked
 * topic gets a beacon (and the archive board when an archived post is on the topic), and the timeline
 * from the constellation back to them glows (`HighlightBeacons` and `GlowStrips`, shared with the L3
 * Tech Reactor). Two draw calls while a topic is picked, none otherwise.
 */
export function TopicHighlights({ layout, tier }: { layout: LibraryLayout; tier: GpuTier }) {
  const pick = useHQStore((s) => s.topics.topic);
  const board = layout.board;
  const targets = useMemo<BeaconTarget[]>(
    () => [
      ...layout.stations.map((s) => ({ x: s.center.x, z: s.center.z, w: s.rect.maxX - s.rect.minX, d: s.rect.maxZ - s.rect.minZ, color: ZONE_TONE[s.zone] })),
      ...(board ? [{ x: board.center.x, z: board.center.z, w: board.rect.maxX - board.rect.minX, d: board.rect.maxZ - board.rect.minZ, color: ZONE_TONE.blog }] : []),
    ],
    [layout.stations, board],
  );
  const lit = useMemo(() => (pick ? litStations(layout.stations, pick.rooms) : []), [layout.stations, pick]);
  const archive = Boolean(pick && board && litArchive(layout, pick.rooms));
  const on = useMemo(() => {
    const rooms = new Set(lit.map((s) => s.room));
    const set = new Set(layout.stations.flatMap((s, i) => (rooms.has(s.room) ? [i] : [])));
    if (archive) set.add(layout.stations.length);
    return set;
  }, [lit, layout.stations, archive]);
  const strips = useMemo<GlowStrip[]>(() => {
    const out = topicRoadGlow(layout, lit).map((s) => ({ a: s.a, b: s.b, width: s.spur ? STRIP.spur : STRIP.road }));
    // The archive board: the plaza run from the ring's east point to the board stop.
    if (archive && board && layout.end) out.push({ a: { x: layout.end.center.x + NEWSROOM.end.ring, z: layout.end.center.z }, b: { ...board.stop }, width: STRIP.road });
    return out;
  }, [layout, lit, archive, board]);

  useEffect(() => {
    sceneProbes.topics.topic = pick?.slug ?? null;
    sceneProbes.topics.lit = [...lit.map((s) => s.room), ...(archive ? ["L4:board:archive"] : [])];
    sceneProbes.topics.roads = strips.length;
  }, [pick, lit, archive, strips]);

  return (
    <group name="library-topic-highlights">
      <GlowStrips name="library-topic-roads" strips={strips} capacity={layout.stations.length + 2} color={STRIP_COLOR} tier={tier} />
      <HighlightBeacons name="library-topic-beacons" targets={targets} lit={on} size={BEACON} tier={tier} />
    </group>
  );
}
