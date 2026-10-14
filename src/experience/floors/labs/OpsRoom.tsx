"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useStats } from "@/lib/visits/store";
import { useHQStore } from "@/store/useHQStore";
import type { BatchedLabel } from "../../fx/labelProps";
import { BatchedLabels } from "../../fx/BatchedLabels";
import { FloatingSigns } from "../../fx/FloatingSign";
import { neonColor } from "../../fx/materials";
import { sceneProbes } from "../../fx/probes";
import { signPlate, type SignSpec } from "../../fx/signLayout";
import { FONTS } from "../../tower/primitives";
import { useStatsAfterFirstFrame } from "../../visits3d";
import { MergedBoxes } from "../roof/kit";
import { LABS } from "./layout";
import { LineBatch } from "./lines";
import { OPS, OPS_TONE, opsFrame, opsLabels, opsLines, opsLiveLabels, opsLiveLines, opsSolids, type OpsData, type OpsLabel, type OpsPlacement } from "./ops";
import { opsLiveRows } from "./opsLive";

const NO_RAYCAST = () => null;
const SIGN_FONT = 0.6;

const toBatched = (l: OpsLabel): BatchedLabel => ({
  text: l.text,
  position: l.position,
  yaw: l.yaw,
  font: l.bold ? FONTS.monoBold : FONTS.mono,
  fontSize: l.fontSize,
  color: l.color,
  anchorX: l.anchorX,
  anchorY: "middle",
  ...(l.maxWidth ? { maxWidth: l.maxWidth, lineHeight: 1.15 } : {}),
});

function useLines(segs: ReturnType<typeof opsLines>) {
  const geometry = useMemo(() => {
    const batch = new LineBatch();
    for (const s of segs) batch.segment(s.seg, s.color);
    return batch.build();
  }, [segs]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

/**
 * This site's own telemetry on the panel above the screens, only while the daily snapshot is ready
 * (hidden when missing, invalid or older than 7 days). Two draw calls: rim lines and one text batch.
 */
function LivePanel({ ops, live, locale }: { ops: OpsPlacement; live: OpsData["live"]; locale: "en" | "id" }) {
  useStatsAfterFirstFrame();
  const { status, snapshot } = useStats();
  const tier = useHQStore((s) => s.tier);
  const rows = useMemo(() => opsLiveRows(status, snapshot, live, locale), [status, snapshot, live, locale]);
  const labels = useMemo(() => (rows ? opsLiveLabels(ops, live.title, rows).map(toBatched) : []), [ops, live.title, rows]);
  const lines = useLines(useMemo(() => opsLiveLines(ops), [ops]));
  const tone = useMemo(() => neonColor("#ffffff", 1.4, tier), [tier]);
  useEffect(() => {
    sceneProbes.ops.live = Boolean(rows);
    sceneProbes.ops.rows = rows?.map((r) => (r.value ? `${r.label}: ${r.value}` : r.label)) ?? [];
  }, [rows]);
  if (!rows) return null;
  return (
    <group name="labs-ops-live">
      <lineSegments geometry={lines} raycast={NO_RAYCAST}>
        <lineBasicMaterial color={tone} vertexColors transparent opacity={0.95} toneMapped={false} />
      </lineSegments>
      <BatchedLabels labels={labels} name="labs-ops-live-labels" />
    </group>
  );
}

/**
 * L3 Ops Control Room (owner approved 2026-10-14): three screens styled like Grafana and Application
 * Insights panels (Metrics, Traces, Alerts) built from the proof tiles of "How I run AI in production",
 * plus a live panel of this site's own telemetry. Existing programs only: one merged solid mesh, one
 * line batch, one text batch and the floating sign (plus two calls for the live panel). Nothing moves,
 * so reduced motion needs nothing; lite drops the graph lines. Clicks go through point-and-go
 * (`L3:door:ops`); the drawer shows the section.
 */
export function OpsRoom({ ops, data, locale }: { ops: OpsPlacement; data: OpsData; locale: "en" | "id" }) {
  const tier = useHQStore((s) => s.tier);
  const detail = tier === "full" ? "full" : "lite";
  const solids = useMemo(() => opsSolids(ops), [ops]);
  const lines = useLines(useMemo(() => opsLines(ops, detail), [ops, detail]));
  const labels = useMemo(() => opsLabels(ops, data).map(toBatched), [ops, data]);
  const tone = useMemo(() => neonColor("#ffffff", 1.6, tier), [tier]);
  const signs = useMemo<SignSpec[]>(() => {
    const text = data.sign.toUpperCase();
    const { h } = signPlate({ text, fontSize: SIGN_FONT });
    // Over the back wall, clear of the screens as seen from the wing road.
    const f = opsFrame(ops);
    return [{ text, x: ops.center.x, y: OPS.h + 1 + h / 2, z: f.back - f.n * 0.6, color: OPS_TONE.live, fontSize: SIGN_FONT, font: FONTS.monoBold }];
  }, [data.sign, ops]);
  useEffect(() => {
    sceneProbes.ops.mounted = true;
    return () => {
      sceneProbes.ops.mounted = false;
    };
  }, []);
  return (
    <group name="labs-ops">
      <MergedBoxes boxes={solids} color="#0b1020" emissive={LABS.accent} emissiveIntensity={0.06} />
      <lineSegments geometry={lines} raycast={NO_RAYCAST}>
        <lineBasicMaterial color={tone} vertexColors transparent opacity={0.95} toneMapped={false} />
      </lineSegments>
      <Suspense fallback={null}>
        <BatchedLabels labels={labels} name="labs-ops-labels" />
        <FloatingSigns signs={signs} name="labs-ops-sign" tier={tier} />
        <LivePanel ops={ops} live={data.live} locale={locale} />
      </Suspense>
    </group>
  );
}
