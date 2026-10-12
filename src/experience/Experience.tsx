"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { ACESFilmicToneMapping } from "three";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { FloorId, RoomId } from "@/content/schema";
import { useRoomUrlSync } from "@/hud/drawer/DrawerHost";
import { withView } from "@/hud/drawer/urlSync";
import { Hud } from "@/hud/Hud";
import { switchLocale, takeResume } from "@/hud/switchLocale";
import { audio } from "@/lib/audio";
import { introSeen, lobbyStartPhase, markIntroSeen } from "@/lib/intro-session";
import { prefersReducedMotion, REDUCED_MOTION_QUERY } from "@/lib/reduced-motion";
import { parseHQUrl, serializeHQUrl } from "@/lib/url-sync";
import { cameraClass, viewportClass } from "@/lib/viewport";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { buildFloorLayouts, READY_FLOORS } from "./config";
import { careerLayoutInput } from "./floors/career/layout";
import { libraryLayoutInput } from "./floors/library/model";
import { continuationSteps, endContinuation, introTarget, isContinuing, setIntroTarget, takeIntroTarget } from "./introContinue";
import { onMissionState, register3DHost, runMissionSteps } from "./missions/bridge";
import { create3DHost } from "./missions/host3d";
import { useInputSources } from "./input/useInputSources";
import { roverRuntime } from "./rover/runtime";
import { interactRuntime } from "./interact/runtime";
import { onWorldMissed } from "./interact/missed";
import { Scene, type SceneLabels } from "./scene/Scene";
import { renderBudget, sceneSettings } from "./scene/settings";
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
  /** Floor of the route the tower mounts on (`/labs` is L3); after the session's first intro the rover rides there. */
  startFloor?: FloorId;
  /** Room of the route (`/labs/[slug]`): opens its drawer, or its hologram with `?view=architecture`. */
  startRoom?: RoomId;
}

/**
 * Session start: tier, locale, device, and the first phase. The first 3D load of a browser session
 * plays the boot and the intro in the Lobby on every route (nothing skips them); a deep link or a
 * language switch then continues to its floor or room (`introContinue.ts`). Later loads open straight in.
 */
function startSession(data: ExperienceData, tier: GpuTier, layouts: Record<FloorId, FloorLayout>, { startFloor, startRoom }: ExperienceStart) {
  const store = getHQStore();
  const s = store.getState();
  s.setTier(tier);
  s.setLocale(data.locale);
  s.setReducedMotion(prefersReducedMotion());
  s.setDevice(readDevice());
  const place = (floor: FloorId, at: { x: number; z: number }) => {
    s.resume(floor, at);
    roverRuntime.x = at.x;
    roverRuntime.z = at.z;
  };
  const doorOf = (floor: FloorId, room?: RoomId) => (room ? layouts[floor].doors?.find((d) => d.room === room)?.at : undefined);
  const openStartRoom = () => {
    if (!startRoom || floorOf(startRoom) !== getHQStore().getState().floor) return;
    getHQStore().getState().openRoom(startRoom);
    if (parseHQUrl(window.location.pathname, window.location.search)?.view === "architecture") getHQStore().getState().openHologram();
  };
  const first = !started;
  started = true;
  const resume = first ? takeResume() : null;
  const intro = !introSeen();
  if (intro) {
    const architecture = parseHQUrl(window.location.pathname, window.location.search)?.view === "architecture";
    setIntroTarget(introTarget({ resumeFloor: resume?.floor, startFloor, startRoom, ready: READY_FLOORS, architecture }));
    if (getHQStore().getState().activeRoom) getHQStore().getState().closeRoom();
    place("L1", layouts.L1.spawn);
    s.setPhase(lobbyStartPhase(false));
  } else if (!first) {
    // Re-entering 3D on another route (page view, then "Explore in 3D"): start where that route is.
    const target = startFloor && READY_FLOORS.includes(startFloor) ? startFloor : "L1";
    const now = getHQStore().getState();
    if (!now.ride && (now.floor !== target || startRoom)) {
      place(target, doorOf(target, startRoom) ?? layouts[target].spawn);
      openStartRoom();
    }
    return;
  } else if (resume) {
    place(resume.floor, { x: resume.x, z: resume.z });
  } else if (startFloor && startFloor !== "L1" && READY_FLOORS.includes(startFloor)) {
    place(startFloor, doorOf(startFloor, startRoom) ?? layouts[startFloor].spawn);
  } else {
    s.setPhase(lobbyStartPhase(true));
  }
  // Deep link (or a language switch on a room URL): open the room on the floor the rover is on.
  if (!intro) openStartRoom();
  if (!first) return;
  // Test and debugging handle (read-only use from Playwright).
  (window as unknown as { __hq?: unknown }).__hq = { store, rover: roverRuntime, camera: () => [...roverRuntime.cameraPosition], layouts, interact: interactRuntime };
}

/** Calls `onFrame` once the canvas has rendered a frame (the second loop tick, after the first draw). */
function FirstFrame({ onFrame }: { onFrame?: () => void }) {
  const ticks = useRef(0);
  useFrame(() => {
    if (!onFrame || ticks.current > 1) return;
    ticks.current += 1;
    if (ticks.current === 2) onFrame();
  });
  return null;
}

/** The lazily loaded 3D chunk: canvas, scene and HUD, portalled over the HTML page. */
export default function Experience({
  data,
  tier,
  onExit,
  onFirstFrame,
  startFloor,
  startRoom,
}: { data: ExperienceData; tier: GpuTier; onExit: () => void; onFirstFrame?: () => void } & ExperienceStart) {
  const t = useTranslations("hud");
  const tHome = useTranslations("home");
  const tCommon = useTranslations("common");
  const tCerts = useTranslations("certs");
  const tDrawer = useTranslations("drawer");
  const tLibrary = useTranslations("library");
  const tContact = useTranslations("contact");
  const tWalk = useTranslations("walk");
  const world = useRef<HTMLDivElement>(null);
  const held = useInputSources(world);
  const toggleLang = useCallback(() => switchLocale(data.locale === "en" ? "id" : "en"), [data.locale]);
  const coarse = useHQStore((s) => s.device.coarse);
  const budget = renderBudget(tier, coarse);

  const layouts = useMemo(
    () => buildFloorLayouts(data.years.length, { labs: data.labs.pods, career: careerLayoutInput(data.career), library: libraryLayoutInput(data.library) }),
    [data.years.length, data.labs.pods, data.career, data.library],
  );
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

  // The intro played to its end: later 3D loads in this session open straight in. A deep link then
  // continues to its floor or room as an ad hoc mission (manual input cancels it like any mission).
  useEffect(
    () =>
      getHQStore().subscribe((s, prev) => {
        if (prev.phase !== "intro" || s.phase !== "explore") return;
        markIntroSeen();
        const target = takeIntroTarget();
        if (!target) return;
        void runMissionSteps("intro:continue", continuationSteps(target))
          .then((status) => {
            if (status === "done" && target.architecture) getHQStore().getState().openHologram();
          })
          .finally(endContinuation);
      }),
    [],
  );

  // The audio engine owns the sound setting (localStorage "hq:sound", on unless the visitor muted);
  // the store mirrors it. Sound only plays while the 3D view is open: the first gesture in the HQ starts
  // it, and leaving for the Page View pauses it without changing the setting.
  useEffect(() => {
    const mirror = () => getHQStore().setState({ sound: !audio.isMuted() });
    mirror();
    const off = audio.subscribe(mirror);
    audio.setPaused(false);
    return () => {
      off();
      audio.setRumble(0);
      audio.setPaused(true);
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
      // A deep link keeps its URL through the boot and the intro; the continuation rewrites it on arrival.
      if ((s.phase === "boot" || s.phase === "intro") && isContinuing()) return;
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
  // On L4 only hosted posts have their own route (/blog/{slug}); shelves and Medium posts keep /library.
  const hasPage = useMemo(() => {
    const hosted = new Set(data.library.posts.filter((p) => !p.url).map((p) => `L4:${p.slug}`));
    return (room: RoomId) => !room.startsWith("L4:") || hosted.has(room);
  }, [data.library.posts]);
  useRoomUrlSync(data.locale, hasPage);

  const labels: SceneLabels = useMemo(
    () => ({
      placeholder: { construction: t("constructionLabel"), hint: t("constructionHint") },
      lobby: {
        skillsTitle: tHome("skillsTitle"),
        certs: { title: tHome("certsTitle"), all: tCerts("wall.all"), other: tCerts("wall.other"), inProgress: tCerts("status.in-progress"), expired: tCerts("status.expired") },
        kiosk: { title: t("kioskTitle"), hint: t("kioskHint") },
      },
      labs: { directory: tDrawer("directory"), open: tWalk("boardOpen"), count: (count: number) => tWalk("boardCount", { count }) },
      career: {
        prologue: t("career.prologue"),
        workshop: t("career.workshop"),
        repos: t("career.repos"),
        models: t("career.models"),
        window: t("career.window"),
        rooms: (count: number) => t("career.rooms", { count }),
      },
      library: {
        zones: { blog: tLibrary("posts"), research: tLibrary("research"), models: tLibrary("publications"), talks: tLibrary("talks") },
      },
      roof: {
        comms: t("world.comms"),
        email: tCommon("email"),
        cvTitle: tContact("cvTitle"),
        cvHint: t("world.cvHint"),
        about: t("world.about"),
        availability: t("world.availability"),
      },
      rover: { hello: t("statusHello") },
      interact: {
        elevator: t("pads.floorTitle"),
        // A string, so next-intl does not format the year as a number ("2,021").
        teleporter: (year: number) => t("interact.teleporter", { year: String(year) }),
        kiosk: t("launcher.askRover"),
        board: (wing: string) => t("interact.board", { wing }),
        archive: t("interact.archive"),
        rooms: {
          profile: t("rooms.profile"),
          stats: t("rooms.stats"),
          skills: t("rooms.skills"),
          certifications: t("rooms.certifications"),
          workshop: t("rooms.workshop"),
          publications: t("rooms.publications"),
          talks: t("rooms.talks"),
          contact: t("rooms.contact"),
          cv: t("rooms.cv"),
          research: t("rooms.research"),
        },
      },
    }),
    [t, tHome, tCommon, tCerts, tDrawer, tLibrary, tContact, tWalk],
  );

  return (
    <div className="fixed inset-0 z-[35] overflow-hidden bg-void text-ink" data-testid="hq" data-tier={tier}>
      <div ref={world} tabIndex={-1} className="absolute inset-0 touch-none outline-none select-none" data-testid="hq-world">
        <Canvas
          dpr={budget.dpr}
          gl={{ antialias: false, powerPreference: "high-performance" }}
          camera={{ fov: 40, near: 0.5, far: 600, position: [60, 50, 60] }}
          onCreated={({ gl }) => {
            gl.toneMapping = ACESFilmicToneMapping;
            gl.toneMappingExposure = sceneSettings(tier).exposure;
            const canvas = gl.domElement;
            canvas.addEventListener("webglcontextlost", (event) => {
              event.preventDefault();
              // Unmounting (Page view) also loses the context on purpose; only a canvas that is
              // still on the page has really crashed.
              window.setTimeout(() => {
                if (canvas.isConnected) getHQStore().getState().setTier("static");
              }, 0);
            });
          }}
          role="img"
          aria-label={t("canvasLabel")}
          aria-describedby="hq-desc"
          onPointerMissed={onWorldMissed}
        >
          <Scene data={data} tier={tier} labels={labels} held={held} onToggleLang={toggleLang} />
          <FirstFrame onFrame={onFirstFrame} />
        </Canvas>
      </div>
      <p id="hq-desc" className="sr-only">
        {t("canvasDescription")}
      </p>
      <Hud data={data} onExit={onExit} onToggleLang={toggleLang} />
    </div>
  );
}
