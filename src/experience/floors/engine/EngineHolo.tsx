"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, type InstancedMesh, type Mesh, type MeshBasicMaterial, Object3D, PlaneGeometry, RingGeometry, Vector3 } from "three";
import { useHQStore } from "@/store/useHQStore";
import { createHoloMaterial, HOLO_MODE } from "../../fx/holoFx";
import { neonColor } from "../../fx/materials";
import { useDispose } from "../../fx/useDispose";
import { useUniformTime } from "../../fx/useUniformTime";
import { roverRuntime } from "../../rover/runtime";
import type { GpuTier } from "../../types";
import { cellUv, type AtlasLayout } from "../lobby/logoAtlas";
import { useLogoAtlas, useWarmLogos } from "../lobby/LogoQuads";
import { ENGINE_ATLAS } from "./engine-atlas";
import { bayHolo, type Emit, type EmitLogo, HOLO, HOLO_TONES, type HoloData, haloSpeed, stackHalo, stepWake, wakeGain, wakeTarget } from "./holo";
import type { EngineLayout } from "./layout";
import { reactorProbe } from "./ReactorCore";

const NO_RAYCAST = () => null;

/** `__hq.reactor().holo()` (Playwright): whether the bay data is in, the awake bay, the halo's turn and the logos drawn. */
export const holoProbe = { loaded: false, awake: -1, spin: 0, logos: 0 };


/** Runs every bay and the halo through `emit` and `logo` at the given times. */
function drawAll(layout: EngineLayout, data: (HoloData | null)[], times: readonly number[], spin: number, t: number, emit: Emit, logo: EmitLogo, wake?: (bay: number) => void) {
  layout.bays.forEach((bay, i) => {
    const d = data[i];
    if (!d) return;
    wake?.(i);
    bayHolo(bay, d, times[i], emit, logo, ENGINE_ATLAS.agents);
  });
  wake?.(-1);
  stackHalo(ENGINE_ATLAS.cells, spin, t, emit, logo);
}

/**
 * B1's WOW layer (spec 2026-10-23): the station holograms (`holo.ts`) and the reactor's Stack Halo. Four instanced
 * draws on the holo program B1 already compiles (boxes on `strip`, dots on `dot`, rings on `ring`, cones on `core`) and
 * one logo mesh over the B1 atlas with the L1 walls' material (their program). Instances are rewritten at most
 * `HOLO.writeHz` times a second, only while the rover is on B1 or riding to it: the bay nearest the rover wakes (it
 * brightens and plays its motion), the others idle; the halo turns with the reactor's pulse and flares white with its
 * deploy flash. Reduced motion: every bay awake and still, the halo still (logos still face the camera). The bay
 * holograms appear once the B1 drawer data (`views`) is in; the halo needs only the atlas.
 */
export function EngineHolo({ layout, tier, views }: { layout: EngineLayout; tier: GpuTier; views: Record<string, { engine?: { holo?: HoloData } }> | null }) {
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  const active = useHQStore((s) => s.floor === "B1" || s.ride?.to === "B1");
  const data = useMemo(() => layout.bays.map((b) => views?.[b.room]?.engine?.holo ?? null), [layout, views]);
  const texture = useLogoAtlas(ENGINE_ATLAS.file);

  // One geometry per kind (box, dot, ring, cone), disposed together.
  const geo = useMemo(() => {
    const list = [new BoxGeometry(1, 1, 1), new PlaneGeometry(1, 1), new RingGeometry(0.93, 1, 48), new CylinderGeometry(1, 0.15, 1, 16, 1, true)];
    return Object.assign(list, { dispose: () => list.forEach((g) => g.dispose()) });
  }, []);
  useDispose(geo);
  const mats = useMemo(
    () => [
      createHoloMaterial({ mode: HOLO_MODE.strip, fade: [40, 110] }),
      // Back alpha 1 (`uParams.y`): dots never dim with the view.
      createHoloMaterial({ mode: HOLO_MODE.dot, params: [0, 1, 0, 0], fade: [40, 110] }),
      createHoloMaterial({ mode: HOLO_MODE.ring, params: [24, 0, 0, 0], fade: [40, 110] }),
      createHoloMaterial({ mode: HOLO_MODE.core, opacity: 0.7, fade: [40, 110] }),
    ],
    [],
  );
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  useUniformTime(mats);
  const palette = useMemo(() => HOLO_TONES.map((hex) => neonColor(hex, 1.3, tier)), [tier]);

  // Capacity: the pieces of today's data (their count and the logo order never depend on time).
  const counts = useMemo(() => {
    const c = [0, 0, 0, 0];
    const cells: number[] = [];
    drawAll(layout, data, [0, 0, 0, 0, 0, 0, 0], 0, 0, (k) => c[k]++, (cell) => cells.push(cell));
    return { c, cells };
  }, [layout, data]);
  const arrays = useMemo(() => counts.c.map((n) => ({ m: new Float32Array(n * 16), c: new Float32Array(n * 3) })), [counts]);

  const logoGeo = useMemo(() => {
    const { cells } = counts;
    const g = new BufferGeometry();
    const uv = new Float32Array(cells.length * 8);
    const idx = new Uint16Array(cells.length * 6);
    const grid: AtlasLayout = { srcs: [], cols: ENGINE_ATLAS.cols, rows: ENGINE_ATLAS.rows, cell: 128 };
    cells.forEach((cell, i) => {
      const [u0, v0, u1, v1] = cellUv(grid, cell);
      uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
      idx.set([0, 1, 2, 0, 2, 3].map((v) => v + i * 4), i * 6);
    });
    g.setAttribute("position", new BufferAttribute(new Float32Array(cells.length * 12), 3));
    g.setAttribute("uv", new BufferAttribute(uv, 2));
    g.setIndex(new BufferAttribute(idx, 1));
    return g;
  }, [counts]);
  useDispose(logoGeo);

  const meshes = useRef<(InstancedMesh | null)[]>([]);
  const logoMesh = useRef<Mesh>(null);
  useWarmLogos(logoMesh);
  const o = useMemo(() => new Object3D(), []);
  const run = useRef({ acc: 1, times: [0, 0, 0, 0, 0, 0, 0], wake: [0, 0, 0, 0, 0, 0, 0], spin: 0, t: 0, dirty: true });
  useEffect(() => {
    run.current.dirty = true;
    holoProbe.loaded = data.some(Boolean);
  }, [data, counts]);

  const right = useMemo(() => new Vector3(), []);
  useFrame((state, delta) => {
    const r = run.current;
    r.acc += Math.min(delta, 0.1);
    if ((!active && !r.dirty) || r.acc < 1 / HOLO.writeHz) return;
    const dt = Math.min(r.acc, 0.2);
    r.acc = 0;
    r.dirty = false;
    const target = active ? wakeTarget(layout.bays, roverRuntime.x, roverRuntime.z) : -1;
    const pulse = reactorProbe.state?.pulseHz ?? 0.25;
    const flash = reactorProbe.flash;
    if (reducedMotion) {
      r.times.fill(HOLO.still);
      r.wake.fill(1);
      r.t = HOLO.still;
    } else {
      r.wake.forEach((w, i) => {
        r.wake[i] = stepWake(w, i === target, dt);
        r.times[i] += dt * r.wake[i];
      });
      r.t += dt;
      r.spin += dt * haloSpeed(pulse);
    }
    // Tone 0, the halo's: cyan (tone 1) toward white (tone 7) in a deploy flash.
    palette[0].copy(palette[1]).lerp(palette[7], flash * 0.8);
    holoProbe.awake = target;
    holoProbe.spin = r.spin;

    const n = [0, 0, 0, 0];
    let gain = 1;
    const cam = state.camera;
    const emit: Emit = (k, tone, g, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
      const a = arrays[k];
      const i = n[k]++;
      o.position.set(x, y, z);
      o.rotation.set(rx, ry, rz, "YXZ");
      // A dot not tipped flat faces the camera.
      if (k === 1 && !rx) o.quaternion.copy(cam.quaternion);
      o.scale.set(sx, sy, sz);
      o.updateMatrix();
      o.matrix.toArray(a.m, i * 16);
      const c = palette[tone];
      const v = g * gain * (tone === 0 ? 1 + flash : 1);
      a.c[i * 3] = c.r * v;
      a.c[i * 3 + 1] = c.g * v;
      a.c[i * 3 + 2] = c.b * v;
    };
    // Upright logo quads facing the camera: the camera's right, flattened.
    right.setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
    const pos = logoGeo.getAttribute("position") as BufferAttribute;
    let li = 0;
    const logo: EmitLogo = (_, x, y, z, size) => {
      const h = size / 2;
      const rx = right.x * h;
      const rz = right.z * h;
      (pos.array as Float32Array).set([x - rx, y - h, z - rz, x + rx, y - h, z + rz, x + rx, y + h, z + rz, x - rx, y + h, z - rz], li++ * 12);
    };
    drawAll(layout, data, r.times, r.spin, r.t, emit, logo, (bay) => (gain = bay < 0 ? 1 : wakeGain(r.wake[bay])));
    meshes.current.forEach((m, k) => {
      if (!m) return;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.count = n[k];
    });
    pos.needsUpdate = true;
    const lm = logoMesh.current;
    if (lm) (lm.material as MeshBasicMaterial).color.setScalar(1 + flash * 0.8);
    holoProbe.logos = li;
  });

  return (
    <group name="engine-holo">
      {arrays.map((a, k) =>
        a.c.length === 0 ? null : (
          <instancedMesh
            key={`${k}-${a.c.length}`}
            ref={(m) => {
              meshes.current[k] = m;
            }}
            args={[geo[k], mats[k], a.c.length / 3]}
            frustumCulled={false}
            raycast={NO_RAYCAST}
          >
            <instancedBufferAttribute attach="instanceMatrix" args={[a.m, 16]} />
            <instancedBufferAttribute attach="instanceColor" args={[a.c, 3]} />
          </instancedMesh>
        ),
      )}
      {texture && (
        <mesh ref={logoMesh} geometry={logoGeo} renderOrder={2} frustumCulled={false} raycast={NO_RAYCAST}>
          <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}
