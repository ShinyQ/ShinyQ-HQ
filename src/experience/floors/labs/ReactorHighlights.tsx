"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { GlowStrips, HighlightBeacons, type BeaconTarget, type GlowStrip } from "../../fx/FilterHighlights";
import { sceneProbes } from "../../fx/probes";
import { goToRoom } from "../../missions/bridge";
import { roverRuntime } from "../../rover/runtime";
import type { LabsLayout, PlacedPod } from "./layout";
import { ACCENT_HEX } from "./Pods";
import { BEACON, litPods, podAt, roadGlow, surprisePod } from "./techReactor";

/** Glow strip widths: wing road runs and spurs. */
const STRIP = { road: 2.4, spur: 1.6 } as const;
const STRIP_COLOR = "#c4b5fd";

function useLit(placed: readonly PlacedPod[]): PlacedPod[] {
  const pods = useHQStore((s) => s.reactor.tech?.pods);
  return useMemo(() => (pods ? litPods(placed, pods) : []), [placed, pods]);
}

/**
 * Pod highlights for the picked tech (`HighlightBeacons`, holo `pillar`): a low glow curtain hugging each
 * lit pod's walls and a thin beacon rising from its middle, every pod in one instanced draw. Mounted from
 * the start with no visible instances, so it never compiles a new program.
 */
function PodBeacons({ placed }: { placed: readonly PlacedPod[] }) {
  const tier = useHQStore((s) => s.tier);
  const lit = useLit(placed);
  const targets = useMemo<BeaconTarget[]>(() => placed.map((p) => ({ x: p.center.x, z: p.center.z, w: p.width, d: p.depth, color: ACCENT_HEX[p.pod.accent] })), [placed]);
  const on = useMemo(() => {
    const rooms = new Set(lit.map((p) => p.room));
    return new Set(placed.flatMap((p, i) => (rooms.has(p.room) ? [i] : [])));
  }, [lit, placed]);
  return <HighlightBeacons name="labs-reactor-beacons" targets={targets} lit={on} size={BEACON} tier={tier} />;
}

/**
 * The road from the reactor to every lit pod glows (`GlowStrips`, holo `strip`, a pulse running out toward
 * the pods): one instanced draw, segments from `roadGlow`. Preallocated for every lit spur, plus two runs per hub wing and one on the data road.
 */
function RoadGlow({ layout }: { layout: LabsLayout }) {
  const tier = useHQStore((s) => s.tier);
  const lit = useLit(layout.placed);
  const strips = useMemo<GlowStrip[]>(() => {
    const spurs = new Set(lit.map((p) => `${p.door.x},${p.door.z}`));
    return roadGlow(layout, lit).map((s) => ({ a: s.a, b: s.b, width: spurs.has(`${s.b.x},${s.b.z}`) ? STRIP.spur : STRIP.road }));
  }, [layout, lit]);
  useEffect(() => {
    sceneProbes.reactor.roads = strips.length;
  }, [strips]);
  return <GlowStrips name="labs-reactor-roads" strips={strips} capacity={layout.placed.length + 5} color={STRIP_COLOR} tier={tier} />;
}

/**
 * Surprise me (drawer button, store `reactor.spin`): drives to a random pod through point-and-go's
 * room drive, preferring the picked tech's pods and never the pod the rover is at. Draws nothing.
 */
function ReactorSurprise({ placed }: { placed: readonly PlacedPod[] }) {
  useEffect(() => {
    const store = getHQStore();
    return store.subscribe((s, prev) => {
      if (s.reactor.spin === prev.reactor.spin) return;
      const lit = s.reactor.tech ? litPods(placed, s.reactor.tech.pods).map((p) => p.pod.slug) : [];
      const target = surprisePod(
        placed.map((p) => p.pod.slug),
        lit,
        podAt(placed, { x: roverRuntime.x, z: roverRuntime.z }),
        Math.random,
      );
      sceneProbes.reactor.surprise = target;
      if (target) goToRoom(`L3:${target}`);
    });
  }, [placed]);
  return null;
}

/** Probe: the picked tech and its lit pods (read by e2e through `__hq.probes.reactor`). */
function ReactorProbe({ placed }: { placed: readonly PlacedPod[] }) {
  const tech = useHQStore((s) => s.reactor.tech);
  const lit = useLit(placed);
  useFrame(() => {
    sceneProbes.reactor.tech = tech?.slug ?? null;
    sceneProbes.reactor.lit = lit.map((p) => p.pod.slug);
  });
  return null;
}

/** Tech Reactor highlights on L3: pod beacons and road glow (2 draw calls while a tech is picked, none otherwise), Surprise me. */
export function ReactorHighlights({ layout }: { layout: LabsLayout }) {
  return (
    <group name="labs-reactor-highlights">
      <RoadGlow layout={layout} />
      <PodBeacons placed={layout.placed} />
      <ReactorSurprise placed={layout.placed} />
      <ReactorProbe placed={layout.placed} />
    </group>
  );
}
