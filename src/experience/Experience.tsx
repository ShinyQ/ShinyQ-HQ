"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { ACESFilmicToneMapping, type Material, type Scene as ThreeScene, type WebGLRenderer } from "three";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { FloorId, RoomId } from "@/content/schema";
import { useRoomUrlSync } from "@/hud/drawer/DrawerHost";
import { withView } from "@/hud/drawer/urlSync";
import { Hud } from "@/hud/Hud";
import { switchLocale, takeResume } from "@/hud/switchLocale";
import { audio } from "@/lib/audio";
import { markOnce, PERF_MARKS } from "@/lib/perf-marks";
import { bootCoverUsed } from "@/lib/boot-first";
import { introSeen, lobbyStartPhase, markIntroSeen } from "@/lib/intro-session";
import { prefersReducedMotion, REDUCED_MOTION_QUERY } from "@/lib/reduced-motion";
import { parseHQUrl, serializeHQUrl } from "@/lib/url-sync";
import { cameraClass, viewportClass } from "@/lib/viewport";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { CanvasBoundary } from "./CanvasBoundary";
import { buildFloorLayouts, READY_FLOORS } from "./config";
import { careerLayoutInput } from "./floors/career/layout";
import { libraryLayoutInput } from "./floors/library/model";
import { continuationSteps, endContinuation, introTarget, isContinuing, setIntroTarget, takeIntroTarget } from "./introContinue";
import { onMissionState, register3DHost, runMissionSteps } from "./missions/bridge";
import { create3DHost } from "./missions/host3d";
import { useInputSources } from "./input/useInputSources";
import { roverRuntime } from "./rover/runtime";
import { interactRuntime } from "./interact/runtime";
import { ridePrep } from "./tower/ridePrep";
import { beamNow, rideNow } from "./tower/rideClock";
import { renderStats, resetPeaks } from "./perf/renderStats";
import { perfOverlayOn } from "./perf/lines";
import { usePerfMarks } from "./perf/usePerfMarks";
import { decideRum, rumPath } from "./perf/rumDecision";
// Static on purpose: a dynamic import inside the 3D chunk makes Turbopack regroup shared modules into the
// Page View bundle (+7 KB on /en). They only mount with `?perf=1` or in a sampled RUM session.
import PerfOverlay, { PerfProbe } from "./perf/PerfOverlay";
import RumProbe from "./perf/RumProbe";
import { onWorldMissed } from "./interact/missed";
import { Scene, type SceneLabels } from "./scene/Scene";
import { FrameLoop } from "./scene/FrameLoop";
import { framePacer } from "./scene/framePacer";
import { memoryCounts, trackRenderer } from "./scene/memoryProbe";
import { releaseSharedResources } from "./scene/sharedResources";
import { parseGfxOverride, renderBudget, sceneSettings, withOverride } from "./scene/settings";
import { programPins } from "./scene/programPins";
import { qualityHandle, qualityStore } from "./scene/qualityStore";
import { renderProbe } from "./scene/renderProbe";
import { resetWarm } from "./scene/warmState";
import { isHighlightRoom } from "./floors/lobby/stations";
import { floorOf } from "./missions/rooms";
import { markFirstFrame, resetFirstFrame } from "./boot-signals";
import type { ExperienceData, FloorLayout, GpuTier } from "./types";
import { sceneProbes } from "./fx/probes";
import { rideCullStats } from "./tower/rideCull";

const COARSE_QUERY = "(pointer: coarse)";


function readDevice() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return { viewport: viewportClass(w, h), camera: cameraClass(w, h), coarse: window.matchMedia(COARSE_QUERY).matches };
}

function readScreen() {
  return { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 };
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
  } else if (startRoom && floorOf(startRoom) === "L1") {
    // `/{locale}#highlights-<station>`: start on the station's door pad, then open it below.
    place("L1", doorOf("L1", startRoom) ?? layouts.L1.spawn);
  } else {
    s.setPhase(lobbyStartPhase(true));
  }
  // Deep link (or a language switch on a room URL): open the room on the floor the rover is on.
  if (!intro) openStartRoom();
  if (!first) return;
  // Test and debugging handle (read-only use from Playwright).
  (window as unknown as { __hq?: unknown }).__hq = {
    store,
    rover: roverRuntime,
    camera: () => [...roverRuntime.cameraPosition],
    layouts,
    interact: interactRuntime,
    memory: memoryCounts,
    ridePrep,
    probes: sceneProbes,
    // Meshes the ride cull hid in its last culling render (tower/rideCull.ts).
    rideCull: rideCullStats,
    render: renderProbe,
    quality: qualityHandle,
    frames: () => framePacer.frames,
    motion: () => {
      const live = store.getState();
      return { ride: live.ride ? rideNow(live.ride) : null, beam: live.beam ? beamNow(live.beam) : null };
    },
    // Render counters split into scene calls and post passes, with peaks since resetPeaks() (e2e budgets, ?perf=1).
    perf: { stats: renderStats, resetPeaks },
  };
}

/** Marks the first frame (boot signals) and calls `onFrame` once the canvas has rendered a frame (the second loop tick, after the first draw). */
function FirstFrame({ onFrame }: { onFrame?: () => void }) {
  const ticks = useRef(0);
  useFrame(() => {
    if (ticks.current > 1) return;
    ticks.current += 1;
    if (ticks.current === 2) {
      markFirstFrame();
      markOnce(PERF_MARKS.firstFrame);
      onFrame?.();
    }
  });
  return null;
}

/** The lazily loaded 3D chunk: canvas, scene and HUD, portalled over the HTML page. */
export default function Experience({
  data,
  tier,
  onExit,
  onFirstFrame,
  onCrash,
  startFloor,
  startRoom,
}: { data: ExperienceData; tier: GpuTier; onExit: () => void; onFirstFrame?: () => void; onCrash: () => void } & ExperienceStart) {
  const t = useTranslations("hud");
  const tHome = useTranslations("home");
  const tCommon = useTranslations("common");
  const tCerts = useTranslations("certs");
  const tDrawer = useTranslations("drawer");
  const tLibrary = useTranslations("library");
  const tContact = useTranslations("contact");
  const tWalk = useTranslations("walk");
  const tHall = useTranslations("hall");
  const world = useRef<HTMLDivElement>(null);
  const held = useInputSources(world);
  const toggleLang = useCallback(() => switchLocale(data.locale === "en" ? "id" : "en"), [data.locale]);
  const coarse = useHQStore((s) => s.device.coarse);
  const gfx = useMemo(() => parseGfxOverride(window.location.search), []);
  const budget = useMemo(() => withOverride(renderBudget(tier, coarse, readScreen()), gfx), [tier, coarse, gfx]);
  // The safety net (QualityController) publishes the exact DPR; R3F resets the canvas to this prop on re-render, so it must follow.
  const appliedDpr = useSyncExternalStore(qualityStore.subscribe, () => qualityStore.applied()?.dpr ?? null, () => null);
  useEffect(
    () => () => {
      renderProbe.gl = null;
      renderProbe.scene = null;
      renderProbe.camera = null;
      renderProbe.rendered = false;
      // A new canvas is a new WebGL context: pins and warm floors belong to the old one.
      programPins.clear();
      resetWarm();
    },
    [],
  );
  usePerfMarks();
  const [perf] = useState(() => perfOverlayOn(window.location.search));
  const [rum] = useState(() => (decideRum() ? rumPath({ startFloor, startRoom, coverUsed: bootCoverUsed() }) : null));

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

  // The memory probe must not read a renderer that unmounted with this canvas, and shared materials
  // and textures must not keep it alive (React runs this cleanup before the canvas empties its scene).
  const created = useRef<{ gl: WebGLRenderer; scene: ThreeScene } | null>(null);
  useEffect(
    () => () => {
      const canvas = created.current;
      created.current = null;
      if (canvas) releaseSharedResources(canvas.scene, { uniformsOf: (m: Material) => (canvas.gl.properties.get(m) as { uniforms?: Record<string, { value?: unknown }> }).uniforms });
      trackRenderer(null);
    },
    [],
  );

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
      resetFirstFrame();
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
  // On L4 only hosted posts have their own route (/blog/{slug}); shelves, Medium posts and the L1 Highlights Hall stations keep the floor URL.
  const hasPage = useMemo(() => {
    const hosted = new Set(data.library.posts.filter((p) => !p.url).map((p) => `L4:${p.slug}`));
    // Highlights Hall stations have no route of their own: they keep /{locale} and live in the history entry.
    return (room: RoomId) => !isHighlightRoom(room) && (!room.startsWith("L4:") || hosted.has(room));
  }, [data.library.posts]);
  useRoomUrlSync(data.locale, hasPage);

  const labels: SceneLabels = useMemo(
    () => ({
      placeholder: { construction: t("constructionLabel"), hint: t("constructionHint") },
      lobby: {
        skillsTitle: tHome("skillsTitle"),
        certs: { title: tHome("certsTitle"), all: tCerts("wall.all"), other: tCerts("wall.other"), inProgress: tCerts("status.in-progress"), expired: tCerts("status.expired") },
        kiosk: { title: t("kioskTitle"), hint: t("kioskHint") },
        hall: {
          about: tHall("about"),
          projects: tHall("projects"),
          experience: tHall("experience"),
          contact: tHall("contact"),
          // The career type labels, like the L2 type icons and the /journey chips.
          employment: tCommon("type.job"),
          freelance: tCommon("type.freelance"),
          visitLive: tCommon("visitLive"),
          stations: {
            about: t("rooms.highlightsAbout"),
            projects: t("rooms.highlightsProjects"),
            experience: t("rooms.highlightsExperience"),
            contact: t("rooms.highlightsContact"),
          },
          more: (count: number) => tHall("more", { count }),
          cvHint: tHall("cvHint"),
          hall: tHall("hall"),
        },
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
      returnPad: t("interact.returnPad"),
      interact: {
        elevator: t("pads.floorTitle"),
        returnPad: t("interact.returnPad"),
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
          highlightsAbout: t("rooms.highlightsAbout"),
          highlightsProjects: t("rooms.highlightsProjects"),
          highlightsExperience: t("rooms.highlightsExperience"),
          highlightsContact: t("rooms.highlightsContact"),
        },
      },
    }),
    [t, tHome, tCommon, tCerts, tDrawer, tLibrary, tContact, tWalk, tHall],
  );

  return (
    <div className="fixed inset-0 z-[35] overflow-hidden bg-void text-ink" data-testid="hq" data-tier={tier}>
      <div ref={world} tabIndex={-1} className="absolute inset-0 touch-none outline-none select-none" data-testid="hq-world">
        <CanvasBoundary onError={onCrash}>
          <Canvas
            dpr={appliedDpr ?? budget.dpr}
            frameloop="never"
            gl={{ antialias: false, powerPreference: "high-performance" }}
            camera={{ fov: 40, near: 0.5, far: 600, position: [60, 50, 60] }}
            onCreated={({ gl, scene, camera }) => {
              renderProbe.gl = gl;
              renderProbe.scene = scene;
              renderProbe.camera = camera;
              gl.toneMapping = ACESFilmicToneMapping;
              gl.toneMappingExposure = sceneSettings(tier).exposure;
              trackRenderer(gl);
              created.current = { gl, scene };
              const canvas = gl.domElement;
              canvas.addEventListener("webglcontextlost", (event) => {
                event.preventDefault();
                // Unmounting (Classic site) also loses the context on purpose; only a canvas that is still on
                // the page has really crashed. The gate remounts once, then shows the static page.
                window.setTimeout(() => {
                  if (canvas.isConnected) onCrash();
                }, 0);
              });
            }}
            role="img"
            aria-label={t("canvasLabel")}
            aria-describedby="hq-desc"
            onPointerMissed={onWorldMissed}
          >
            <Scene data={data} tier={tier} labels={labels} held={held} onToggleLang={toggleLang} budget={budget} gfx={gfx} />
            <FirstFrame onFrame={onFirstFrame} />
            <FrameLoop />
            {perf && <PerfProbe />}
            {rum && <RumProbe tier={tier === "full" ? "full" : "lite"} path={rum} />}
          </Canvas>
        </CanvasBoundary>
      </div>
      <p id="hq-desc" className="sr-only">
        {t("canvasDescription")}
      </p>
      <Hud data={data} onExit={onExit} onToggleLang={toggleLang} />
      {perf && <PerfOverlay />}
    </div>
  );
}
