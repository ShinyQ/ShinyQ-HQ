"use client";

import { useEffect, useMemo } from "react";
import { useHQStore } from "@/store/useHQStore";
import { GlowStrips, HighlightBeacons, type BeaconSize, type BeaconTarget, type GlowStrip } from "../../../fx/FilterHighlights";
import { sceneProbes } from "../../../fx/probes";
import type { GpuTier } from "../../../types";
import { ZONE_TONE, type LibraryLayout } from "../model";
import { litStations, topicRoadGlow } from "../topics";

/** Station and bay beacons: shorter than the L3 pod beacons (the stations are smaller and the roof slab is close). */
const BEACON: BeaconSize = { full: 9, lite: 6, radius: 0.45, glow: 2.4, inset: 0.5 };
/** Glow strip widths: the timeline run and the spurs. */
const STRIP = { road: 2.4, spur: 1.6 } as const;
const STRIP_COLOR = "#67e8f9";

/**
 * Topic Constellation highlights on L4 (owner request 2026-10-14): every station and desk of the picked topic and
 * every reader track bay holding one of its posts gets a beacon, and the timeline from the constellation back to
 * them glows (`HighlightBeacons` and `GlowStrips`, shared with the L3 Tech Reactor). Two draw calls while a topic is
 * picked, none otherwise.
 */
export function TopicHighlights({ layout, tier }: { layout: LibraryLayout; tier: GpuTier }) {
  const pick = useHQStore((s) => s.topics.topic);
  const all = useMemo(() => [...layout.stations, ...layout.bays], [layout.stations, layout.bays]);
  const targets = useMemo<BeaconTarget[]>(
    () => all.map((s) => ({ x: s.center.x, z: s.center.z, w: s.rect.maxX - s.rect.minX, d: s.rect.maxZ - s.rect.minZ, color: ZONE_TONE["zone" in s ? s.zone : "track"] })),
    [all],
  );
  const lit = useMemo(() => (pick ? litStations(layout, pick.rooms) : []), [layout, pick]);
  const on = useMemo(() => new Set(all.flatMap((s, i) => (lit.includes(s) ? [i] : []))), [all, lit]);
  const strips = useMemo<GlowStrip[]>(() => topicRoadGlow(layout, lit).map((s) => ({ a: s.a, b: s.b, width: s.spur ? STRIP.spur : STRIP.road })), [layout, lit]);

  useEffect(() => {
    sceneProbes.topics.topic = pick?.slug ?? null;
    sceneProbes.topics.lit = lit.map((s) => s.room);
    sceneProbes.topics.roads = strips.length;
  }, [pick, lit, strips]);

  return (
    <group name="library-topic-highlights">
      <GlowStrips name="library-topic-roads" strips={strips} capacity={all.length + 1} color={STRIP_COLOR} tier={tier} />
      <HighlightBeacons name="library-topic-beacons" targets={targets} lit={on} size={BEACON} tier={tier} />
    </group>
  );
}
