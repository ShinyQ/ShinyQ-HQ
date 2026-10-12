"use client";

import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useMemo, useRef, useState, type JSX, type RefObject } from "react";
import { ACESFilmicToneMapping, type PerspectiveCamera } from "three";
import { cameraClass } from "@/lib/viewport";
import { getHQStore } from "@/store/useHQStore";
import "../../text-config";
import { zoneAt, type ViewZone } from "../../camera/orbit";
import { followPose } from "../../camera/rigs";
import { SHAFT } from "../../config";
import { Roof as CurrentRoof } from "../../floors/Roof";
import { Helipad } from "../../floors/roof/concepts/Helipad";
import { Observatory } from "../../floors/roof/concepts/Observatory";
import { SignalGarden } from "../../floors/roof/concepts/SignalGarden";
import type { RoofLabels, RoofSceneryProps } from "../../floors/roof/kit";
import { buildRoofLayout, ROOF_DECK, type RoofActive, type RoofStop } from "../../floors/roof/layout";
import { Sky } from "../../floors/roof/Sky";
import { GridFloor } from "../../fx/GridFloor";
import { RoadMarkings } from "../../fx/RoadMarkings";
import { spaceViolations } from "../../nav/space";
import { Rover } from "../../rover/Rover";
import { roverRuntime } from "../../rover/runtime";
import { sceneSettings } from "../../scene/settings";
import { FloorLine } from "../../tower/primitives";
import type { ExperienceData, GpuTier, Rect, Vec2 } from "../../types";

type Concept = "current" | "observatory" | "helipad" | "garden";
type At = "spawn" | RoofStop;
type View = "rover" | "top";

interface Params {
  concept: Concept;
  at: At;
  view: View;
  tier: Exclude<GpuTier, "static">;
  active: RoofActive;
  reduced: boolean;
  ui: boolean;
}

const SCENERY: Record<Exclude<Concept, "current">, (props: RoofSceneryProps) => JSX.Element> = { observatory: Observatory, helipad: Helipad, garden: SignalGarden };
const CONCEPTS: readonly Concept[] = ["current", "observatory", "helipad", "garden"];
const STOPS: readonly At[] = ["spawn", "availability", "about", "cv", "contact"];
const NAMES: Record<Concept, string> = { current: "Today", observatory: "A. Rooftop Observatory", helipad: "B. Helipad Launch Deck", garden: "C. Signal Garden" };
const NOTES: Record<Concept, string> = {
  current: "Today's roof: beacon, seven comms terminals and the CV kiosk.",
  observatory: "Night deck: a telescope sweeps the sky from the central pier, the comms dish transmits under a constellation of the channels, a CV log lectern, a star chart with the about card, far skyline silhouettes.",
  helipad: "Launch deck: a drone hovers over the pad and lifts off with the email or the CV when you open them, a beacon tower per channel, runway lights round the pad, a departures board with the about card.",
  garden: "Comms tower: a lattice mast with signal rings and the availability neon sign, a garden of channel antennas ringing in their own hues, glowing floor lights, a story wall with a bench.",
};
/** Rover heading per stop (0 faces +z), toward the station it reads. */
const HEADING: Record<At, number> = { spawn: (-3 * Math.PI) / 4, availability: Math.PI, about: 0, cv: Math.PI / 2, contact: Math.PI };
/** Today's deep link spawn, for the baseline. */
const CURRENT_SPAWN: Vec2 = { x: 4, z: 12 };

function readParams(): Params {
  const q = new URLSearchParams(window.location.search);
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const v = q.get(key);
    return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  };
  const active = q.get("active");
  return {
    concept: pick("concept", CONCEPTS, "observatory"),
    at: pick("at", STOPS, "spawn"),
    view: pick("view", ["rover", "top"] as const, "rover"),
    tier: pick("tier", ["full", "lite"] as const, "full"),
    active: active === "contact" || active === "cv" ? active : null,
    reduced: q.get("rm") === "1",
    ui: q.get("ui") !== "0",
  };
}

function writeParams(p: Params) {
  const q = new URLSearchParams({ concept: p.concept, at: p.at, view: p.view, tier: p.tier });
  if (p.active) q.set("active", p.active);
  if (p.reduced) q.set("rm", "1");
  if (!p.ui) q.set("ui", "0");
  window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
}

/** Follow camera as in the tower (view zones included), or a top-down plan with north up. */
function CameraRig({ at, view, bounds, zones }: { at: Vec2; view: View; bounds: Rect; zones: readonly ViewZone[] }) {
  useFrame(({ camera, size }) => {
    const cam = camera as PerspectiveCamera;
    if (view === "top") {
      const w = bounds.maxX - bounds.minX + 8;
      const d = bounds.maxZ - bounds.minZ + 8;
      const aspect = size.width / Math.max(1, size.height);
      const h = Math.max(d, w / aspect) / 2 / Math.tan((cam.fov * Math.PI) / 360);
      cam.up.set(0, 0, -1);
      cam.position.set((bounds.minX + bounds.maxX) / 2, h, (bounds.minZ + bounds.maxZ) / 2 + 0.001);
      cam.lookAt((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
      return;
    }
    const zone = zoneAt("RF", at, zones);
    const pose = followPose(cameraClass(size.width, size.height), [at.x, 1, at.z], zone?.yaw ?? 0, zone?.zoom ?? 1);
    cam.up.set(0, 1, 0);
    cam.position.set(...pose.position);
    cam.lookAt(...pose.target);
    if (cam.fov !== pose.fov) {
      cam.fov = pose.fov;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

/** Writes probe values onto the harness root (outside React state, read by the panel and the capture script). */
function setData(el: HTMLElement | null, data: Record<string, string>) {
  if (el) Object.assign(el.dataset, data);
}

/** Counts every render pass of the previous frame (composer passes included) and marks the page ready after 60 frames. */
function Probe({ root }: { root: RefObject<HTMLDivElement | null> }) {
  const get = useThree((s) => s.get);
  const frames = useRef(0);
  useEffect(() => {
    const { info } = get().gl;
    info.autoReset = false;
    return () => {
      info.autoReset = true;
    };
  }, [get]);
  useFrame(({ gl }) => {
    frames.current += 1;
    if (frames.current % 30 === 0) setData(root.current, { drawCalls: String(gl.info.render.calls), triangles: String(gl.info.render.triangles) });
    if (frames.current === 60) setData(root.current, { ready: "1" });
    gl.info.reset();
  });
  return null;
}

const seg = (on: boolean) => `inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold transition ${on ? "bg-blue text-void" : "border border-glass-border text-ink-2 hover:text-ink"}`;

/** Dev-only: the three RF concepts (and today's roof) on the real deck layout, for the owner's pick. */
export default function RoofConcepts({ data }: { data: ExperienceData }) {
  const t = useTranslations("hud");
  const tContact = useTranslations("contact");
  const tCommon = useTranslations("common");
  const [params, setParams] = useState<Params>(readParams);
  const [stats, setStats] = useState({ calls: "", tris: "" });
  const root = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => buildRoofLayout({ channels: data.roof.channels.length }), [data.roof.channels.length]);
  const violations = useMemo(
    () => spaceViolations({ bounds: layout.floor.bounds, obstacles: layout.floor.obstacles, doors: layout.floor.doors ?? [], network: layout.network, start: layout.floor.approach }),
    [layout],
  );
  const labels: RoofLabels = useMemo(
    () => ({ comms: t("world.comms"), email: tCommon("email"), cvTitle: tContact("cvTitle"), cvHint: t("world.cvHint"), about: t("world.about"), availability: t("world.availability") }),
    [t, tContact, tCommon],
  );
  const at: Vec2 = params.at === "spawn" ? (params.concept === "current" ? CURRENT_SPAWN : layout.floor.spawn) : layout.stops[params.at];

  useEffect(() => {
    roverRuntime.x = at.x;
    roverRuntime.y = 0;
    roverRuntime.z = at.z;
    roverRuntime.heading = HEADING[params.at];
    const store = getHQStore().getState();
    store.setTier(params.tier);
    store.setReducedMotion(params.reduced);
  }, [at.x, at.z, params.at, params.tier, params.reduced]);
  useEffect(() => writeParams(params), [params]);
  useEffect(() => {
    const id = window.setInterval(() => {
      const el = root.current;
      if (el) setStats({ calls: el.dataset.drawCalls ?? "", tris: el.dataset.triangles ?? "" });
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  const set = (patch: Partial<Params>) => setParams((p) => ({ ...p, ...patch }));
  const settings = sceneSettings(params.tier);
  const b = layout.floor.bounds;
  const pad = layout.callPad;
  const Scenery = params.concept === "current" ? null : SCENERY[params.concept];

  return (
    <div ref={root} className="fixed inset-0 z-[60] overflow-hidden bg-void text-ink" data-testid="roof-concepts" data-concept={params.concept}>
      <Canvas
        key={params.tier}
        dpr={params.tier === "full" ? [1, 2] : [1, 1.5]}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        camera={{ fov: 40, near: 0.5, far: 600, position: [30, 30, 30] }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = settings.exposure;
        }}
      >
        <color attach="background" args={[settings.fog.color]} />
        <fog attach="fog" args={[settings.fog.color, settings.fog.near, settings.fog.far]} />
        <hemisphereLight args={settings.hemisphere} />
        <directionalLight color={settings.directional.color} position={settings.directional.position} intensity={settings.directional.intensity} />
        <mesh position={[(b.minX + b.maxX) / 2, -0.2, (b.minZ + b.maxZ) / 2]}>
          <boxGeometry args={[b.maxX - b.minX, 0.4, b.maxZ - b.minZ]} />
          <meshBasicMaterial color="#07070f" />
        </mesh>
        <GridFloor width={b.maxX - b.minX} depth={b.maxZ - b.minZ} center={[(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2]} />
        <mesh position={[SHAFT.x, 3, SHAFT.z]}>
          <boxGeometry args={[SHAFT.size, 6, SHAFT.size]} />
          <meshStandardMaterial color="#111827" emissive="#22d3ee" emissiveIntensity={0.15} transparent opacity={0.7} />
        </mesh>
        {/* Reserved for the elevator call pad (parallel work). */}
        <FloorLine points={[[pad.minX, pad.minZ], [pad.maxX, pad.minZ], [pad.maxX, pad.maxZ], [pad.minX, pad.maxZ]]} color="#fbbf24" closed opacity={0.6} />
        <Suspense fallback={null}>
          {Scenery ? (
            <>
              <RoadMarkings network={layout.network} color={ROOF_DECK.accent} tier={params.tier} reducedMotion={params.reduced} />
              <Sky tier={params.tier} />
              <Scenery layout={layout} roof={data.roof} profile={data.profile} labels={labels} tier={params.tier} reducedMotion={params.reduced} active={params.active} />
            </>
          ) : (
            <CurrentRoof roof={data.roof} labels={{ ...labels, beacon: tContact("beacon") }} tier={params.tier} />
          )}
        </Suspense>
        <Rover tier={params.tier} />
        <CameraRig at={at} view={params.view} bounds={b} zones={layout.floor.viewZones ?? []} />
        <Probe root={root} />
        {params.tier === "full" && (
          <EffectComposer multisampling={4}>
            <Bloom mipmapBlur luminanceThreshold={0.6} intensity={0.9} radius={0.45} />
            <ToneMapping />
          </EffectComposer>
        )}
      </Canvas>

      {params.ui && (
        <details open className="glass glass-solid pointer-events-auto absolute top-3 left-3 w-[min(360px,calc(100%-1.5rem))] p-3 text-sm" data-testid="roof-panel">
          <summary className="label min-h-11 cursor-pointer content-center text-blue">RF concepts (dev)</summary>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Concept">
            {CONCEPTS.map((c) => (
              <button key={c} type="button" className={seg(params.concept === c)} aria-pressed={params.concept === c} onClick={() => set({ concept: c })}>
                {NAMES[c]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-2">{NOTES[params.concept]}</p>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Rover at">
            {STOPS.map((s) => (
              <button key={s} type="button" className={seg(params.at === s)} aria-pressed={params.at === s} onClick={() => set({ at: s })}>
                {s}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="View and room">
            {(["rover", "top"] as const).map((v) => (
              <button key={v} type="button" className={seg(params.view === v)} aria-pressed={params.view === v} onClick={() => set({ view: v })}>
                {v}
              </button>
            ))}
            {([null, "contact", "cv"] as const).map((a) => (
              <button key={a ?? "none"} type="button" className={seg(params.active === a)} aria-pressed={params.active === a} onClick={() => set({ active: a })}>
                {a === null ? "no room" : a === "contact" ? "open contact" : "open CV"}
              </button>
            ))}
          </div>
          <p className="label mt-2 text-ink-3">
            <a className="link" href={`?concept=${params.concept}&at=${params.at}&tier=${params.tier === "full" ? "lite" : "full"}`}>
              tier: {params.tier}
            </a>{" "}
            ·{" "}
            <button type="button" className="link" onClick={() => set({ reduced: !params.reduced })}>
              reduced motion: {params.reduced ? "on" : "off"}
            </button>
          </p>
          <p className="label text-ink-3" data-testid="roof-stats">
            draw calls {stats.calls} · triangles {stats.tris} (all passes)
          </p>
          <p className="label text-ink-3">
            space rules: <span className={violations.length ? "text-pink" : "text-green"}>{violations.length ? `${violations.length} violations` : "pass"}</span>
          </p>
        </details>
      )}
    </div>
  );
}
