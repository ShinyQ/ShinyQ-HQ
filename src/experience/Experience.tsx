"use client";

import { Canvas } from "@react-three/fiber";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { FloorId, RoomId } from "@/content/schema";
import { useRoomUrlSync } from "@/hud/drawer/DrawerHost";
import { withView } from "@/hud/drawer/urlSync";
import { Hud } from "@/hud/Hud";
import { switchLocale, takeResume } from "@/hud/switchLocale";
import { audio } from "@/lib/audio";
import { prefersReducedMotion, REDUCED_MOTION_QUERY } from "@/lib/reduced-motion";
import { parseHQUrl, serializeHQUrl } from "@/lib/url-sync";
import { cameraClass, viewportClass } from "@/lib/viewport";
import { getHQStore } from "@/store/useHQStore";
import { buildFloorLayouts, READY_FLOORS } from "./config";
import { onMissionState, register3DHost } from "./missions/bridge";
import { create3DHost } from "./missions/host3d";
import { useInputSources } from "./input/useInputSources";
import { roverRuntime } from "./rover/runtime";
import { Scene, type SceneLabels } from "./scene/Scene";
import { floorOf } from "./missions/rooms";
import type { ExperienceData, FloorLayout, GpuTier } from "./types";

const COARSE_QUERY = "(pointer: coarse)";

function readDevice() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return { viewport: viewportClass(w, h), camera: cameraClass(w, h), coarse: window.matchMedia(COARSE_QUERY).matches };
}

let started = false;

export interface ExperienceStart {
  /** Floor of the route the tower mounts on (`/labs` is L3); skips boot and intro. */
  startFloor?: FloorId;
  /** Room of the route (`/labs/[slug]`): opens its drawer, or its hologram with `?view=architecture`. */
  startRoom?: RoomId;
}

/** One-time session start: tier, locale, device, and the first phase (boot, intro or resume). */
function startSession(data: ExperienceData, tier: GpuTier, layouts: Record<FloorId, FloorLayout>, { startFloor, startRoom }: ExperienceStart) {
  const store = getHQStore();
  const s = store.getState();
  s.setTier(tier);
  s.setLocale(data.locale);
  s.setReducedMotion(prefersReducedMotion());
  s.setDevice(readDevice());
  if (started) return;
  started = true;
  const resume = takeResume();
  const place = (floor: FloorId, at: { x: number; z: number }) => {
    s.resume(floor, at);
    roverRuntime.x = at.x;
    roverRuntime.z = at.z;
  };
  if (resume) {
    place(resume.floor, { x: resume.x, z: resume.z });
  } else if (startFloor && startFloor !== "L1" && READY_FLOORS.includes(startFloor)) {
    const door = startRoom ? layouts[startFloor].doors?.find((d) => d.room === startRoom) : undefined;
    place(startFloor, door?.at ?? layouts[startFloor].spawn);
  } else {
    s.setPhase(s.firstVisit ? "boot" : "intro");
  }
  // Deep link (or a language switch on a room URL): open the room on the floor the rover is on.
  if (startRoom && floorOf(startRoom) === getHQStore().getState().floor) {
    getHQStore().getState().openRoom(startRoom);
    if (parseHQUrl(window.location.pathname, window.location.search)?.view === "architecture") getHQStore().getState().openHologram();
  }
  // Test and debugging handle (read-only use from Playwright).
  (window as unknown as { __hq?: unknown }).__hq = { store, rover: roverRuntime, camera: () => [...roverRuntime.cameraPosition] };
}

/** The lazily loaded 3D chunk: canvas, scene and HUD, portalled over the HTML page. */
export default function Experience({ data, tier, onExit, startFloor, startRoom }: { data: ExperienceData; tier: GpuTier; onExit: () => void } & ExperienceStart) {
  const t = useTranslations("hud");
  const tHome = useTranslations("home");
  const tCommon = useTranslations("common");
  const tDrawer = useTranslations("drawer");
  const world = useRef<HTMLDivElement>(null);
  const held = useInputSources(world);
  const toggleLang = useCallback(() => switchLocale(data.locale === "en" ? "id" : "en"), [data.locale]);

  const layouts = useMemo(() => buildFloorLayouts(data.years.length, { labs: data.labs.pods }), [data.years.length, data.labs.pods]);
  useLayoutEffect(() => startSession(data, tier, layouts, { startFloor, startRoom }), [data, tier, layouts, startFloor, startRoom]);

  // Cover the page: the HTML stays in the DOM for SEO but is inert while the tower is open.
  useEffect(() => {
    const shell = document.getElementById("site-shell");
    shell?.setAttribute("inert", "");
    shell?.setAttribute("aria-hidden", "true");
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = "hidden";
    html.dataset.hq = "3d";
    return () => {
      shell?.removeAttribute("inert");
      shell?.removeAttribute("aria-hidden");
      html.style.overflow = previous;
      delete html.dataset.hq;
    };
  }, []);

  useEffect(() => {
    const store = getHQStore();
    const coarse = window.matchMedia(COARSE_QUERY);
    const motion = window.matchMedia(REDUCED_MOTION_QUERY);
    const onDevice = () => store.getState().setDevice(readDevice());
    const onMotion = () => store.getState().setReducedMotion(motion.matches);
    window.addEventListener("resize", onDevice);
    coarse.addEventListener("change", onDevice);
    motion.addEventListener("change", onMotion);
    return () => {
      window.removeEventListener("resize", onDevice);
      coarse.removeEventListener("change", onDevice);
      motion.removeEventListener("change", onMotion);
    };
  }, []);

  // The audio engine owns the sound setting (localStorage "hq:sound"); the store mirrors it.
  useEffect(() => {
    const mirror = () => getHQStore().setState({ sound: !audio.isMuted() });
    mirror();
    const off = audio.subscribe(mirror);
    return () => {
      off();
      audio.setRumble(0);
    };
  }, []);

  // Missions run against the 3D world while the tower is open (MissionHud proxies to this host).
  useEffect(() => {
    const store = getHQStore();
    const offHost = register3DHost(
      (deps) => create3DHost(deps, { store, rover: roverRuntime, layouts, years: data.years }),
      () => store.getState().visited,
    );
    const offState = onMissionState((m) =>
      store.getState().setMission(m.missionId ? { id: m.missionId, step: m.step, status: m.status } : null),
    );
    return () => {
      offHost();
      offState();
    };
  }, [layouts, data.years]);

  // URL sync: floors with 3D content get their route; placeholders keep /{locale}. Rooms: see useRoomUrlSync.
  useEffect(() => {
    const store = getHQStore();
    const sync = () => {
      const s = store.getState();
      const floor = READY_FLOORS.includes(s.floor) ? s.floor : "L1";
      const room = s.activeRoom && floorOf(s.activeRoom) === s.floor ? s.activeRoom : null;
      const path = serializeHQUrl({ locale: data.locale, floor, activeRoom: room, view: null });
      const url = withView(path, window.location.search, room && s.phase === "hologram" ? "architecture" : null);
      if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(window.history.state, "", url);
    };
    sync();
    return store.subscribe((s, prev) => {
      if (s.floor !== prev.floor) sync();
    });
  }, [data.locale]);

  // Room URLs (drawer open, hologram view, back and forward).
  useRoomUrlSync(data.locale);

  const labels: SceneLabels = useMemo(
    () => ({
      placeholder: { construction: t("constructionLabel"), hint: t("constructionHint") },
      lobby: {
        skillsTitle: tHome("skillsTitle"),
        certs: { title: tHome("certsTitle"), verify: tCommon("verify"), inProgress: tCommon("inProgress") },
        kiosk: { title: t("kioskTitle"), hint: t("kioskHint") },
      },
      labs: { directory: tDrawer("directory") },
      rover: { hello: t("statusHello") },
    }),
    [t, tHome, tCommon, tDrawer],
  );

  return (
    <div className="fixed inset-0 z-[35] overflow-hidden bg-void text-ink" data-testid="hq" data-tier={tier}>
      <div ref={world} tabIndex={-1} className="absolute inset-0 touch-none outline-none select-none" data-testid="hq-world">
        <Canvas
          dpr={tier === "full" ? [1, 2] : [1, 1.5]}
          flat
          gl={{ antialias: tier === "full", powerPreference: "high-performance" }}
          camera={{ fov: 40, near: 0.5, far: 600, position: [60, 50, 60] }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener("webglcontextlost", (event) => {
              event.preventDefault();
              getHQStore().getState().setTier("static");
            });
          }}
          role="img"
          aria-label={t("canvasLabel")}
          aria-describedby="hq-desc"
        >
          <Scene data={data} tier={tier} labels={labels} held={held} onToggleLang={toggleLang} />
        </Canvas>
      </div>
      <p id="hq-desc" className="sr-only">
        {t("canvasDescription")}
      </p>
      <Hud data={data} onExit={onExit} onToggleLang={toggleLang} />
    </div>
  );
}
