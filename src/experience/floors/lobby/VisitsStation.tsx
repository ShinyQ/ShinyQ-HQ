"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { InstancedBufferAttribute, Matrix4, PlaneGeometry, Quaternion, SphereGeometry, Vector3, type Group } from "three";
import type { Locale } from "@/content/locales";
import { formatDate } from "@/lib/format";
import { lastUpdatedDay, visitsView } from "@/lib/visits/model";
import { useStats } from "@/lib/visits/store";
import { BatchedLabels } from "../../fx/BatchedLabels";
import { createHoloMaterial, HOLO_MODE } from "../../fx/holoFx";
import { HoloMesh } from "../../fx/HoloMesh";
import { neonColor } from "../../fx/materials";
import { sceneProbes } from "../../fx/probes";
import { useDispose } from "../../fx/useDispose";
import { useUniformTime } from "../../fx/useUniformTime";
import type { GpuTier } from "../../types";
import { MergedBoxes, MergedEdges } from "../roof/kit";
import { globeInstances, OBSERVATORY, observatoryParts, observatoryPlates, observatoryText, type DotInstances, type ObservatoryLabels } from "./observatory";

const NO_RAYCAST = () => null;
const NONE: readonly string[] = [];
const Y = new Vector3(0, 1, 0);

/** One instanced holo dot layer (land or countries): matrices and colors attached at creation, so precompile and culling see them. */
function Dots({ data, geometry, material, name }: { data: DotInstances; geometry: PlaneGeometry; material: ReturnType<typeof createHoloMaterial>; name: string }) {
  if (!data.count) return null;
  return (
    <instancedMesh key={`${name}-${data.count}`} name={name} args={[geometry, material, data.count]} raycast={NO_RAYCAST}>
      <instancedBufferAttribute attach="instanceMatrix" args={[data.matrices, 16]} />
      <instancedBufferAttribute attach="instanceColor" args={[data.colors, 3]} />
    </instancedMesh>
  );
}

/**
 * L1 Visitor Observatory (public visit stats; owner decision 2026-10-14: the Lobby's south-west corner,
 * between the elevator and the Ask Rover kiosk): a hologram globe whose land is one instanced dot layer
 * and whose visited countries glow as a second (dots only, never numbers), plus a floating panel with the
 * last 30 days, the since-launch total, countries, questions, the most explored floor and the 3D vs
 * Classic split, the source and the cadence. Seven draw calls: the plinth and its outline, then five on
 * the one holo-fx program plus the label batch. The globe turns slowly (faster while L1:visits is open),
 * and holds Indonesia toward the viewer under reduced motion. Without data it shows the land and "Stats
 * offline".
 */
export function VisitsStation({ labels, locale, tier, reducedMotion, active }: { labels: ObservatoryLabels; locale: Locale; tier: GpuTier; reducedMotion: boolean; active: boolean }) {
  const stats = useStats();
  const parts = useMemo(() => observatoryParts(), []);
  const snapshot = stats.status === "ready" ? stats.snapshot : null;
  const view = useMemo(() => (snapshot ? visitsView(snapshot, "d30", "all") : null), [snapshot]);
  const state = useMemo(
    () => (snapshot && view ? { view, allVisits: snapshot.visits.all, freshness: stats.freshness, lastDay: formatDate(lastUpdatedDay(snapshot), locale) } : null),
    [snapshot, view, stats.freshness, locale],
  );
  const countries = view?.countries ?? NONE;
  const { globe } = parts;
  const instances = useMemo(() => globeInstances(globe.r, tier, countries), [globe.r, tier, countries]);
  const text = useMemo(() => observatoryText(parts, state, labels, locale), [parts, state, labels, locale]);

  const sphere = useMemo(() => (tier === "full" ? new SphereGeometry(globe.r, 48, 32) : new SphereGeometry(globe.r, 32, 20)), [globe.r, tier]);
  useDispose(sphere);
  const dot = useMemo(() => new PlaneGeometry(1, 1), []);
  useDispose(dot);
  const body = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.globe, color: neonColor(OBSERVATORY.colors.rim, tier === "full" ? 1.3 : 1, tier), opacity: tier === "full" ? 0.9 : 0.75 }), [tier]);
  useDispose(body);
  const land = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.dot, color: neonColor("#ffffff", 1.1, tier), params: [0, 0.12, 0, 0] }), [tier]);
  useDispose(land);
  const lit = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.dot, color: neonColor("#ffffff", 1.8, tier), params: [reducedMotion ? 0 : 1, 0.3, 0, 0] }), [tier, reducedMotion]);
  useDispose(lit);
  const timed = useMemo(() => [lit], [lit]);
  useUniformTime(timed);

  // Panel backing and the 3D vs Classic bar: one instanced holo plate mesh (aAlpha 1, colors per plate).
  const plates = useMemo(() => observatoryPlates(parts, view ? { threeD: view.mode.threeDShare, classic: view.mode.classicShare } : null), [parts, view]);
  const plateGeometry = useMemo(() => {
    const g = new PlaneGeometry(1, 1);
    g.setAttribute("aAlpha", new InstancedBufferAttribute(new Float32Array(3).fill(1), 1));
    return g;
  }, []);
  useDispose(plateGeometry);
  const plateMaterial = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.plate, color: neonColor("#ffffff", 1.5, tier) }), [tier]);
  useDispose(plateMaterial);
  const plateData = useMemo(() => {
    const m = new Matrix4();
    const q = new Quaternion().setFromAxisAngle(Y, parts.panel.yaw);
    const s = new Vector3();
    const p = new Vector3();
    const matrices = new Float32Array(plates.length * 16);
    const colors = new Float32Array(plates.length * 3);
    plates.forEach((plate, i) => {
      m.compose(p.set(...plate.at), q, s.set(plate.w, plate.h, 1)).toArray(matrices, i * 16);
      neonColor(plate.color, 1.5, tier).toArray(colors, i * 3);
    });
    return { matrices, colors };
  }, [plates, parts.panel.yaw, tier]);

  const spin = useRef<Group>(null);
  const angle = useRef(0);
  useFrame((_, dt) => {
    const g = spin.current;
    if (!g) return;
    if (!reducedMotion) angle.current += Math.min(dt, 0.1) * (active ? OBSERVATORY.spinActive : OBSERVATORY.spin);
    else angle.current = 0;
    g.rotation.y = (-OBSERVATORY.restLon * Math.PI) / 180 + angle.current;
    sceneProbes.spectacle.observatory = angle.current;
    sceneProbes.spectacle.observatoryCountries = instances.countries.count;
  });

  return (
    <group name="visits-observatory">
      <MergedBoxes boxes={parts.solids} color="#0b1020" emissive={OBSERVATORY.colors.rim} emissiveIntensity={0.05} />
      <MergedEdges boxes={parts.solids} color={OBSERVATORY.colors.rim} tier={tier} opacity={0.7} />
      <group position={[globe.x, globe.y, globe.z]} rotation={[OBSERVATORY.tilt, 0, 0]}>
        <HoloMesh geometry={sphere} material={body} name="observatory-globe" />
        <group ref={spin} rotation={[0, (-OBSERVATORY.restLon * Math.PI) / 180, 0]}>
          <Dots data={instances.land} geometry={dot} material={land} name="observatory-land" />
          <Dots data={instances.countries} geometry={dot} material={lit} name="observatory-countries" />
        </group>
      </group>
      <instancedMesh key={plates.length} name="observatory-panel" args={[plateGeometry, plateMaterial, plates.length]} raycast={NO_RAYCAST} renderOrder={1}>
        <instancedBufferAttribute attach="instanceMatrix" args={[plateData.matrices, 16]} />
        <instancedBufferAttribute attach="instanceColor" args={[plateData.colors, 3]} />
      </instancedMesh>
      <BatchedLabels labels={text} name="observatory-labels" renderOrder={2} />
    </group>
  );
}
