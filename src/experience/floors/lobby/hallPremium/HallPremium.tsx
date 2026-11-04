"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { InstancedBufferAttribute, Object3D, PlaneGeometry, type InstancedMesh, type ShaderMaterial } from "three";
import { getHQStore } from "@/store/useHQStore";
import { sceneProbes } from "../../../fx/probes";
import { useDispose } from "../../../fx/useDispose";
import { onPad } from "../../../nav/doors";
import { roverRuntime } from "../../../rover/runtime";
import { sceneTarget } from "../../../scene/postHandle";
import { precompileObject } from "../../../scene/precompile";
import { renderProbe } from "../../../scene/renderProbe";
import { HALL_LAYOUT } from "../hallLayout";
import type { HallPremiumProps } from "./chunk";
import { premiumInstances } from "./build";
import { createPremiumMaterial } from "./shader";
import { eased, wakeLevel } from "./wake";

/** Each station's wake level (station order), shared by every part's material (`uWake`). */
const WAKE = new Float32Array(HALL_LAYOUT.stations.length);
const NO_RAYCAST = () => null;
/** Count-up steps over a wake (each one re-lays the hall's north text batch). */
const COUNT_STEPS = 8;

/** A stat value at `t` (0 to 1) of its count up: the leading number scaled, its prefix, suffix, decimals and separators kept. */
export function countValue(value: string, t: number): string {
  const m = value.match(/^(\D*)([\d,]*\d(?:\.\d+)?)(.*)$/);
  if (!m || t >= 1) return value;
  const decimals = m[2].split(".")[1]?.length ?? 0;
  const n = Number(m[2].replace(/,/g, "")) * t;
  const text = m[2].includes(",") ? n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : n.toFixed(decimals);
  return `${m[1]}${text}${m[3]}`;
}

/**
 * Wakes a station while the rover is docked on its door pad (the case brightens, the content assembles in about 0.8 s)
 * and lets it settle back after it leaves; counts the About me stat numbers up on its wake (full tier). Mounted once
 * (with the north part). Probe: `__hq.probes.hallPremium.wake`.
 */
function WakeDriver({ reducedMotion, countUp, full }: { reducedMotion: boolean; countUp: HallPremiumProps["countUp"]; full: boolean }) {
  const count = useRef({ on: false, prev: 0, step: COUNT_STEPS });
  useFrame((_, dt) => {
    const onL1 = getHQStore().getState().floor === "L1";
    const at = { x: roverRuntime.x, z: roverRuntime.z };
    HALL_LAYOUT.stations.forEach((s, i) => {
      const door = HALL_LAYOUT.doors[i];
      WAKE[i] = wakeLevel(WAKE[i], onL1 && onPad(door, at), Math.min(dt, 0.1), reducedMotion);
      sceneProbes.hallPremium.wake[s.station] = WAKE[i];
    });
    const handle = countUp?.handle.current;
    if (!handle || !countUp) return;
    const w = WAKE[HALL_LAYOUT.stations.findIndex((s) => s.station === "about")];
    const c = count.current;
    // A fresh wake (from fully asleep) counts up; reaching full wake or leaving early shows the final numbers.
    if (!c.on && c.prev <= 0 && w > 0 && full && !reducedMotion) c.on = true;
    const finish = c.on && (w >= 1 || w < c.prev);
    c.prev = w;
    if (!c.on) return;
    const next = finish ? COUNT_STEPS : Math.round(eased(w) * COUNT_STEPS);
    if (finish) c.on = false;
    if (next === c.step && !finish) return;
    c.step = next;
    countUp.members.forEach((k, i) => {
      const member = handle.members[k];
      if (member) member.text = countValue(countUp.values[i], next / COUNT_STEPS);
    });
    handle.batch.sync();
  });
  return null;
}

/**
 * The interiors of one hall part (owner decision 2026-11-04) in one instanced draw: each station's glass case, light cone
 * and halo, and what it shows inside (`build.ts`). Hidden until its program compiled (`precompileObject`, after the
 * full tier's composer exists), so nothing compiles on arrival; disposed with the part.
 */
export function HallPremium({ part, tier, reducedMotion, data, countUp }: HallPremiumProps) {
  const instances = useMemo(() => premiumInstances(data, tier)[part], [data, tier, part]);
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(1, 1);
    const attr = (pick: (i: (typeof instances)[number]) => number[]) => new InstancedBufferAttribute(new Float32Array(instances.flatMap(pick)), 4);
    g.setAttribute("aA", attr((i) => i.a));
    g.setAttribute("aB", attr((i) => i.b));
    g.setAttribute("aC", attr((i) => i.c));
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
    if (!reducedMotion) (m.material as ShaderMaterial).uniforms.uT.value += Math.min(dt, 0.1);
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
      {part === "north" && <WakeDriver reducedMotion={reducedMotion} countUp={countUp} full={tier === "full"} />}
      {instances.length > 0 && (
        <instancedMesh key={instances.length} ref={mesh} name={`hall-premium-${part}`} args={[geometry, material, instances.length]} visible={false} frustumCulled={false} raycast={NO_RAYCAST}>
          <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
        </instancedMesh>
      )}
    </>
  );
}
