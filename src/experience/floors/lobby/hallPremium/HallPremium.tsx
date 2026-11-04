"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { InstancedBufferAttribute, Object3D, PlaneGeometry, type InstancedMesh, type ShaderMaterial } from "three";
import { getHQStore } from "@/store/useHQStore";
import { sceneProbes } from "../../../fx/probes";
import { useDispose } from "../../../fx/useDispose";
import { onPad } from "../../../nav/doors";
import { roverRuntime } from "../../../rover/runtime";
import { sceneTarget } from "../../../scene/postHandle";
import { precompileObject } from "../../../scene/precompile";
import { renderProbe } from "../../../scene/renderProbe";
import { morphFrames, typeFrames } from "@/content/hallBars";
import { BLANK_MAP } from "../../../fx/holoFx";
import type { BatchedLabelsHandle } from "../../../fx/BatchedLabels";
import type { HallTexts } from "../hallContent";
import { HALL_LAYOUT } from "../hallLayout";
import type { HallPremiumProps } from "./chunk";
import { premiumInstances } from "./build";
import { createPremiumMaterial } from "./shader";
import { eased, wakeLevel } from "./wake";

/** Each station's wake level (station order), shared by every part's material (`uWake`). */
const WAKE = new Float32Array(HALL_LAYOUT.stations.length);
const NO_RAYCAST = () => null;

/** A stat value at `t` (0 to 1) of its count up: the leading number scaled, its prefix, suffix, decimals and separators kept. */
export function countValue(value: string, t: number): string {
  const m = value.match(/^(\D*)([\d,]*\d(?:\.\d+)?)(.*)$/);
  if (!m || t >= 1) return value;
  const decimals = m[2].split(".")[1]?.length ?? 0;
  const n = Number(m[2].replace(/,/g, "")) * t;
  const text = m[2].includes(",") ? n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : n.toFixed(decimals);
  return `${m[1]}${text}${m[3]}`;
}

/** Morph steps for a count-up (each step re-lays a part's text batch). */
const COUNT_STEPS = 8;

/** One text that changes on its station's wake: its member in the part's text batch and its frames (the last is its own text). */
interface Morph {
  member: number;
  station: number;
  frames: string[];
}

/**
 * The texts of one part that morph on wake (owner, 2026-11-04): About me's stat numbers count up, each project's headline
 * metric and each result morph from before to after, and the now terminals type their org and role. Matched in the part's
 * batch order (`HallTexts`), so the main path only hands the texts and the batch over.
 */
export function partMorphs(texts: HallTexts, data: HallPremiumProps["data"]): Morph[] {
  const out: Morph[] = [];
  const no = (name: string) => HALL_LAYOUT.stations.findIndex((s) => s.station === name);
  const stats = new Map(data.stats.slice(0, 4).map((st, k) => [k, st.value]));
  const metrics = new Set(data.highlights.results.map((r) => r.value));
  const now = new Set(data.highlights.now.flatMap((r) => [r.org, r.role]));
  texts.labels.forEach((label, i) => {
    const g = texts.group[i];
    const k = texts.tile[i];
    if (g === "about" && k >= 0 && stats.get(k) === label.text)
      out.push({ member: i, station: no("about"), frames: Array.from({ length: COUNT_STEPS + 1 }, (_, n) => countValue(label.text, n / COUNT_STEPS)) });
    else if ((g === "interiors" || g === "results") && metrics.has(label.text)) {
      const frames = morphFrames(label.text);
      if (frames.length > 1) out.push({ member: i, station: no(g === "results" ? "results" : "projects"), frames });
    } else if (g === "now" && now.has(label.text)) out.push({ member: i, station: no("now"), frames: typeFrames(label.text) });
  });
  return out;
}

/**
 * Wakes a station while the rover is docked on its door pad (the case brightens, the content assembles in about 0.8 s)
 * and lets it settle back after it leaves. Mounted once (with the north part). Probe: `__hq.probes.hallPremium.wake`.
 */
function WakeDriver({ reducedMotion }: { reducedMotion: boolean }) {
  // A new canvas (back from the Page View) compiles the interiors again: `mounted` reads false until it shows.
  useEffect(
    () => () => {
      sceneProbes.hallPremium.mounted = false;
    },
    [],
  );
  useFrame((_, dt) => {
    const onL1 = getHQStore().getState().floor === "L1";
    const at = { x: roverRuntime.x, z: roverRuntime.z };
    HALL_LAYOUT.stations.forEach((s, i) => {
      WAKE[i] = wakeLevel(WAKE[i], onL1 && onPad(HALL_LAYOUT.doors[i], at), Math.min(dt, 0.1), reducedMotion);
      sceneProbes.hallPremium.wake[s.station] = WAKE[i];
    });
  });
  return null;
}

/** Steps every station's morphs one frame; true when a member's text changed (the batch needs a sync). */
function stepMorphs(morphs: readonly Morph[], h: BatchedLabelsHandle, state: Map<number, { on: boolean; prev: number; step: number }>, enabled: boolean): boolean {
  let dirty = false;
  for (const st of new Set(morphs.map((m) => m.station))) {
    const w = WAKE[st];
    const c = state.get(st) ?? { on: false, prev: 0, step: -1 };
    state.set(st, c);
    if (!c.on && c.prev <= 0 && w > 0 && enabled) c.on = true;
    const finish = c.on && (w >= 1 || w < c.prev);
    c.prev = w;
    if (!c.on) continue;
    const t = finish ? 1 : eased(w);
    if (finish) c.on = false;
    const step = Math.round(t * 1000);
    if (step === c.step && !finish) continue;
    c.step = step;
    for (const m of morphs) {
      const member = m.station === st ? h.members[m.member] : undefined;
      const text = m.frames[Math.round(t * (m.frames.length - 1))];
      if (member && member.text !== text) {
        member.text = text;
        dirty = true;
      }
    }
  }
  return dirty;
}

/**
 * Plays one part's morphs: a fresh wake (from fully asleep) steps each text through its frames with the wake; reaching full
 * wake or leaving early shows its own text. Full tier only, never under reduced motion.
 */
function MorphDriver({ morphs, handle, enabled }: { morphs: readonly Morph[]; handle: HallPremiumProps["handle"]; enabled: boolean }) {
  const state = useRef(new Map<number, { on: boolean; prev: number; step: number }>());
  useFrame(() => {
    const h = handle?.current;
    if (h && morphs.length && stepMorphs(morphs, h, state.current, enabled)) h.batch.sync();
  });
  return null;
}

/**
 * The interiors of one hall part (owner decision 2026-11-04) in one instanced draw: each station's glass case, light cone
 * and halo, and what it shows inside (`build.ts`). Hidden until its program compiled (`precompileObject`, after the
 * full tier's composer exists), so nothing compiles on arrival; disposed with the part.
 */
export function HallPremium({ part, tier, reducedMotion, data, texts, handle, map }: HallPremiumProps) {
  const instances = useMemo(() => premiumInstances(data, tier)[part], [data, tier, part]);
  const morphs = useMemo(() => partMorphs(texts, data), [texts, data]);
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(1, 1);
    const attr = (pick: (i: (typeof instances)[number]) => number[]) => new InstancedBufferAttribute(new Float32Array(instances.flatMap(pick)), 4);
    g.setAttribute("aA", attr((i) => i.a));
    g.setAttribute("aB", attr((i) => i.b));
    g.setAttribute("aC", attr((i) => i.c));
    g.setAttribute("aD", attr((i) => i.d ?? [0, 0, 0, 0]));
    return g;
  }, [instances]);
  useDispose(geometry);
  const material = useMemo(() => createPremiumMaterial(WAKE, tier === "full"), [tier]);
  useDispose(material);
  const colors = useMemo(() => new Float32Array(instances.flatMap((i) => i.color)), [instances]);
  const mesh = useRef<InstancedMesh>(null);
  const compiled = useRef<"no" | "busy" | "yes">("no");
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new Object3D();
    instances.forEach((inst, i) => {
      o.position.set(...inst.at);
      o.rotation.set(0, inst.yaw, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [instances, geometry, material]);
  useFrame((state, dt) => {
    const m = mesh.current;
    if (!m) return;
    const u = (m.material as ShaderMaterial).uniforms;
    if (!reducedMotion) u.uT.value += Math.min(dt, 0.1);
    u.uMap.value = map ?? BLANK_MAP;
    u.uMapOn.value = map ? 1 : 0;
    if (compiled.current !== "no" || !renderProbe.rendered || (tier === "full" && sceneTarget() === null)) return;
    compiled.current = "busy";
    m.visible = true;
    void precompileObject(state.gl, m, state.camera, state.scene)
      .catch(() => null)
      .finally(() => {
        compiled.current = "yes";
        if (mesh.current) mesh.current.visible = true;
        sceneProbes.hallPremium.mounted = true;
      });
    m.visible = false;
  });
  return (
    <>
      {part === "north" && <WakeDriver reducedMotion={reducedMotion} />}
      <MorphDriver morphs={morphs} handle={handle} enabled={tier === "full" && !reducedMotion} />
      {instances.length > 0 && (
        <instancedMesh key={instances.length} ref={mesh} name={`hall-premium-${part}`} args={[geometry, material, instances.length]} visible={false} frustumCulled={false} raycast={NO_RAYCAST}>
          <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
        </instancedMesh>
      )}
    </>
  );
}
