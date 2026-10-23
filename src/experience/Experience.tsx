"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { ACESFilmicToneMapping, type Material, type Scene as ThreeScene, type WebGLRenderer } from "three";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { FloorId, RoomId } from "@/content/schema";
import { useRoomUrlSync } from "@/hud/drawer/DrawerHost";
import { loadRoomView, setRoomDataVersions } from "@/hud/drawer/data";
import { createReactorHashSync } from "./floors/labs/reactorUrl";
import { OPS_ROOM } from "./floors/labs/opsHash";
import { formatYearMonth } from "@/lib/format";
import { b1UnlockFlag, canEnterFloor, startFloor as startFloorFor, watchFloorVisits } from "./b1";
import { REACTOR_ROOM } from "./floors/labs/techHash";
import { TOPICS_ROOM } from "./floors/library/topicHash";
import { createTopicHashSync } from "./floors/library/topicUrl";
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
import { ARRIVAL_HEADING } from "./camera/arrival";
import { CanvasBoundary } from "./CanvasBoundary";
import { canvasReplacedInCommit, isQualityRemount, markCanvasReplaced } from "./qualityRemount";
import { buildFloorLayouts, LOBBY, READY_FLOORS } from "./config";
import { careerLayoutInput } from "./floors/career/layout";
import { libraryLayoutInput } from "./floors/library/model";
import { continuationSteps, endContinuation, introTarget, isContinuing, setIntroTarget, takeIntroTarget } from "./introContinue";
import { onMissionState, register3DHost, runMissionSteps } from "./missions/bridge";
import { create3DHost } from "./missions/host3d";
import { useInputSources } from "./input/useInputSources";
import { introModule, loadIntro } from "./intro/chunk";
import { introRuntime } from "./intro/runtime";
import { roverRuntime } from "./rover/runtime";
import { interactRuntime } from "./interact/runtime";
import { ridePrep } from "./tower/ridePrep";
import { beamNow, rideNow } from "./tower/rideClock";
import { skyRuntime } from "./sky/skyRuntime";
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
import { framePacer, idleRuntime } from "./scene/framePacer";
import { memoryCounts, trackRenderer } from "./scene/memoryProbe";
import { releaseSharedResources } from "./scene/sharedResources";
import { parseGfxOverride, renderBudget, sceneSettings, withOverride } from "./scene/settings";
import { programPins } from "./scene/programPins";
import { qualityHandle, qualityStore } from "./scene/qualityStore";
import { renderProbe } from "./scene/renderProbe";
import { resetWarm } from "./scene/warmState";
import { isHighlightRoom } from "./floors/lobby/stations";
import { REACTOR_RINGS, type ReactorRingId } from "@/content/tech-rings";
import { floorOf } from "./missions/rooms";
import { floorChunks, floorChunksHandle } from "./floors/floorChunks";
import { officeHandle } from "./floors/lobby/office/chunk";
import { loadOfficeBeacon, loadOfficeWatch, officeWatchNow } from "./floors/lobby/office/watchLoader";
import { FloorChunkPrefetch } from "./floors/FloorChunkPrefetch";
import { markFirstFrame, resetFirstFrame } from "./boot-signals";
import type { ExperienceData, FloorLayout, GpuTier } from "./types";
import { sceneProbes } from "./fx/probes";
import { rideCullStats } from "./tower/rideCull";
import { useStatsAfterFirstFrame } from "./visits3d";
import { VISITS_ROOM } from "./floors/lobby/visitsRoom";
import { isOfficeRoom } from "./floors/lobby/officeLayout";

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
 * plays the boot and the intro in the Lobby on every route (input may skip the intro, never the boot); a deep link or a
 * language switch then continues to its floor or room (`introContinue.ts`). Later loads open straight in.
 */
function startSession(data: ExperienceData, tier: GpuTier, layouts: Record<FloorId, FloorLayout>, { startFloor: requested, startRoom }: ExperienceStart) {
  const store = getHQStore();
  const s = store.getState();
  const prevTier = s.tier;
  s.setTier(tier);
  s.setLocale(data.locale);
  s.setReducedMotion(prefersReducedMotion());
  s.setDevice(readDevice());
  // Dev and test unlock of B1 (session only): `?unlock=b1`, in production only with `debug`.
  if (b1UnlockFlag(window.location.search, process.env.NODE_ENV !== "production")) s.unlockB1();
  // `#B1` reaches the Engine Room only once unlocked; a locked visitor starts in the Lobby (EngineUnlockLayer says why).
  const unlocked = getHQStore().getState().b1Unlocked;
  const startFloor = startFloorFor(requested, unlocked);
  const ready = READY_FLOORS.filter((floor) => canEnterFloor(floor, unlocked));
  // A graphics quality change remounts the canvas: keep the rover, floor, phase and open room as they are.
  if (isQualityRemount(!started, prevTier, tier, canvasReplacedInCommit())) return;
  const place = (floor: FloorId, at: { x: number; z: number }) => {
    // The L1 spawn faces the Rover menu kiosk (owner 2026-10-14); a start on a floor's arrival point faces east like an
    // elevator arrival, under the arrival view (Round 8 J); every other start turns toward the default follow camera.
    const spawn = layouts.L1.spawn;
    const arrival = layouts[floor].arrival;
    const heading =
      floor === "L1" && at.x === spawn.x && at.z === spawn.z
        ? LOBBY.spawnHeading
        : arrival && at.x === arrival.x && at.z === arrival.z
          ? ARRIVAL_HEADING
          : Math.PI / 4;
    s.resume(floor, { ...at, heading });
    roverRuntime.x = at.x;
    roverRuntime.z = at.z;
    roverRuntime.heading = heading;
  };
  const doorOf = (floor: FloorId, room?: RoomId) => (room ? (layouts[floor].doors?.find((d) => d.room === room)?.at ?? layouts[floor].stops?.[room]) : undefined);
  const openStartRoom = () => {
    if (!startRoom || floorOf(startRoom) !== getHQStore().getState().floor) return;
    getHQStore().getState().openRoom(startRoom);
    if (parseHQUrl(window.location.pathname, window.location.search)?.view === "architecture") getHQStore().getState().openHologram();
  };
  const first = !started;
  started = true;
  const taken = first ? takeResume() : null;
  // A language switch on B1 resumes there only while B1 is unlocked (the PR 2 flag rides along in the query).
  const resume = taken && canEnterFloor(taken.floor, unlocked) ? taken : null;
  // Deep links (and a language switch that resumes a floor) need their floor's chunk at once (Round 7 B).
  for (const floor of [startFloor, startRoom ? floorOf(startRoom) : undefined, resume?.floor]) if (floor && canEnterFloor(floor, unlocked)) floorChunks.ensure(floor);
  const intro = !introSeen();
  if (intro) {
    const architecture = parseHQUrl(window.location.pathname, window.location.search)?.view === "architecture";
    setIntroTarget(introTarget({ resumeFloor: resume?.floor, startFloor, startRoom, ready, architecture }));
    if (getHQStore().getState().activeRoom) getHQStore().getState().closeRoom();
    place("L1", layouts.L1.spawn);
    s.setPhase(lobbyStartPhase(false));
  } else if (!first) {
    // Re-entering 3D on another route (page view, then "Explore in 3D"): start where that route is.
    const target = startFloor && ready.includes(startFloor) ? startFloor : "L1";
    const now = getHQStore().getState();
    if (!now.ride && (now.floor !== target || startRoom)) {
      place(target, doorOf(target, startRoom) ?? layouts[target].spawn);
      openStartRoom();
    }
    return;
  } else if (resume) {
    place(resume.floor, { x: resume.x, z: resume.z });
  } else if (startFloor && startFloor !== "L1" && ready.includes(startFloor)) {
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
    // The 3D intro (wake and reveal orbit): timeline, reveal ring, Rover heading and face, veil, lit landmarks, skip.
    intro: introRuntime,
    camera: () => [...roverRuntime.cameraPosition],
    layouts,
    interact: interactRuntime,
    memory: memoryCounts,
    // Floor chunk states and loads (Round 7 B).
    floorChunks: floorChunksHandle,
    // The lazy Agent Office chunk (L1): load, state and its test hooks (e2e/office.spec.ts, the bytes gate), plus
    // the office watch and beacon chunks: `watchNow` loads the watch chunk and runs one tick of its watch, `loadWatch` and
    // `loadBeacon` load a chunk and resolve with its module (the bytes gate).
    office: { ...officeHandle, watchNow: officeWatchNow, loadWatch: loadOfficeWatch, loadBeacon: loadOfficeBeacon },
    // B1's reactor test hook once its chunk loaded (the feed, a poll, a clock skew and `state()`).
    reactor: () => floorChunks.module("B1")?.reactorTest ?? null,
    ridePrep,
    probes: sceneProbes,
    // Meshes the ride cull hid in its last culling render (tower/rideCull.ts).
    rideCull: rideCullStats,
    render: renderProbe,
    sky: skyRuntime,
    quality: qualityHandle,
    frames: () => framePacer.frames,
    clock: () => framePacer.elapsed,
    // Idle frame cadence (scene/idle.ts): 60, 30 or 0; tests opt in with `idle.enabled = true`.
    cadence: () => framePacer.cadence,
    idle: idleRuntime,
    // Read-only audio engine state (the floor the ambience follows, its setting, the mute, one-shot request counts).
    audio: () => ({ floor: audio.ambienceFloor(), ambience: audio.getSettings().ambience, muted: audio.isMuted(), played: audio.playCounts() }),
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

type ExperienceProps = { data: ExperienceData; tier: GpuTier; onExit: () => void; onFirstFrame?: () => void; onCrash: () => void } & ExperienceStart;

/**
 * The intro chunk (intro/chunk.ts) gates a session that plays the boot and the intro: nothing mounts until it
 * settled, so the session start, the canvas and the CameraDirector always have it during the boot and the intro
 * (ExperienceGate starts the load alongside this chunk, so the wait is usually over before this renders). A failed
 * load skips the intro (marked seen, the session starts like a returning visitor's) instead of holding the tower
 * on a boot that cannot end. A returning session never loads it.
 */
function useIntroChunk(): boolean {
  const [ready, setReady] = useState(() => introSeen() || introModule() !== null);
  useEffect(() => {
    if (ready) return;
    let live = true;
    void loadIntro().then((mod) => {
      if (!mod) markIntroSeen();
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, [ready]);
  return ready;
}

/** The lazily loaded 3D chunk: canvas, scene and HUD, portalled over the HTML page (once the intro chunk is ready). */
export default function Experience(props: ExperienceProps) {
  return useIntroChunk() ? <ExperienceView {...props} /> : null;
}

function ExperienceView({
  data,
  tier,
  onExit,
  onFirstFrame,
  onCrash,
  startFloor,
  startRoom,
}: ExperienceProps) {
  const t = useTranslations("hud");
  const tEngine = useTranslations("engine");
  const tHome = useTranslations("home");
  const tCommon = useTranslations("common");
  const tCerts = useTranslations("certs");
  const tDrawer = useTranslations("drawer");
  const tLibrary = useTranslations("library");
  const tContact = useTranslations("contact");
  const tLabs = useTranslations("labs");
  const tHall = useTranslations("hall");
  const tReactor = useTranslations("labs.reactor");
  // The load hash, before any URL sync below can rewrite the URL (the Tech Reactor deep link reads it).
  const [startHash] = useState(() => window.location.hash);
  // The drawer files' `?v=`, set before any child effect (the drawer, holograms, deep links) can fetch one.
  setRoomDataVersions(data.locale, data.roomData);
  const tStats = useTranslations("stats");
  const tOffice = useTranslations("office");
  // Public visit stats (the L1 Visitor Observatory, its ring tile and drawer): one fetch after the first frame.
  useStatsAfterFirstFrame();
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
  // B1 Engine Room unlock: every public floor the rover explores counts toward 5/5 (src/experience/b1.ts).
  useEffect(() => watchFloorVisits(getHQStore()), []);
  const [perf] = useState(() => perfOverlayOn(window.location.search));
  const [rum] = useState(() => (decideRum() ? rumPath({ startFloor, startRoom, coverUsed: bootCoverUsed() }) : null));

  const layouts = useMemo(
    () => buildFloorLayouts(data.years.length, { labs: data.labs.pods, career: careerLayoutInput(data.career), library: libraryLayoutInput(data.library) }),
    [data.years.length, data.labs.pods, data.career, data.library],
  );
  // Declared before the session start so its cleanup is explicit; unmount cleanups run before the new tree's layout effects.
  useLayoutEffect(() => markCanvasReplaced, []);
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
  // it, and leaving for the Page View pauses it without changing the setting. It also reports the floor to the ambience.
  useEffect(() => {
    const mirror = () => getHQStore().setState({ sound: !audio.isMuted() });
    mirror();
    const off = audio.subscribe(mirror);
    audio.setPaused(false);
    // The floor ambience follows the floor the rover is on.
    const store = getHQStore();
    audio.setFloor(store.getState().floor);
    const offFloor = store.subscribe((s, prev) => {
      if (s.floor !== prev.floor) audio.setFloor(s.floor);
    });
    return () => {
      off();
      offFloor();
      audio.setRumble(0);
      // Pause first, so clearing the floor does not hand the soundtrack back to the music for one fade.
      audio.setPaused(true);
      audio.setFloor(null);
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
      // The Tech Reactor, the Ops Control Room and the Topic Constellation have no route of their own (they keep the floor URL).
      const room = s.activeRoom && floorOf(s.activeRoom) === s.floor && s.activeRoom !== REACTOR_ROOM && s.activeRoom !== OPS_ROOM && s.activeRoom !== TOPICS_ROOM ? s.activeRoom : null;
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
  // On L4 only hosted posts have their own route (/blog/{slug}); shelves, Medium posts, the Topic Constellation, the L1 Highlights Hall stations and the L3 Tech Reactor keep the floor URL.
  const hasPage = useMemo(() => {
    const hosted = new Set(data.library.posts.filter((p) => !p.url).map((p) => `L4:${p.slug}`));
    // On L2 only career entries have /journey/{slug}; the Workshop and its bench and repo rooms keep /journey.
    const career = new Set(data.career.years.flatMap((y) => y.entries.map((e) => `L2:${e.slug}`)));
    // Highlights Hall stations have no route of their own: they keep /{locale} and live in the history entry.
    // The Tech Reactor keeps /labs too (its pick lives in the hash, see createReactorHashSync), and so does the
    // Ops Control Room (the Classic site shows it on /contact#production) and the Visitor Observatory (/contact#visits).
    // B1 Engine Room stations keep the floor URL (/{locale}) and are remembered in the history entry.
    // The Agent Office rooms keep /{locale} too.
    return (room: RoomId) =>
      !isOfficeRoom(room) && !isHighlightRoom(room) && room !== REACTOR_ROOM && room !== OPS_ROOM && room !== VISITS_ROOM && !room.startsWith("B1:") && (!room.startsWith("L4:") || hosted.has(room)) && (!room.startsWith("L2:") || career.has(room));
  }, [data.library.posts, data.career.years]);
  useRoomUrlSync(data.locale, hasPage);
  // Topic Constellation pick in the hash (`#library-topic=<slug>`), like the Tech Reactor below.
  useEffect(
    () =>
      createTopicHashSync({
        store: getHQStore(),
        env: {
          history: window.history,
          location: window.location,
          initialHash: startHash,
          load: () => loadRoomView(data.locale, TOPICS_ROOM).then((view) => view?.topics),
          onPopState: (listener) => {
            window.addEventListener("popstate", listener);
            return () => window.removeEventListener("popstate", listener);
          },
        },
      }),
    [data.locale, startHash],
  );
  // Tech Reactor pick in the hash (`#labs-tech=<slug>`), after the floor and room URL writes above.
  useEffect(
    () =>
      createReactorHashSync({
        store: getHQStore(),
        env: {
          history: window.history,
          location: window.location,
          initialHash: startHash,
          load: () => loadRoomView(data.locale, REACTOR_ROOM).then((view) => view?.reactor),
          onPopState: (listener) => {
            window.addEventListener("popstate", listener);
            return () => window.removeEventListener("popstate", listener);
          },
        },
      }),
    [data.locale, startHash],
  );

  const metrics = data.library.researchMetrics;
  const labels: SceneLabels = useMemo(
    () => ({
      lobby: {
        skillsTitle: tHome("skillsTitle"),
        visitsTile: tStats("tile"),
        observatory: {
          title: tStats("observatory"),
          offline: tStats("offline"),
          approx: (n: string) => tStats("approx", { n }),
          visits30: tStats("panel.visits30"),
          visitsAll: tStats("panel.visitsAll"),
          countries: tStats("panel.countries"),
          questions: tStats("panel.questions"),
          topFloor: (floor: string) => tStats("panel.topFloor", { floor }),
          split: (threeD: number, classic: number) => tStats("panel.split", { threeD: String(threeD), classic: String(classic) }),
          source: tStats("panel.source"),
          updated: tStats("updated"),
          delayed: (date: string) => tStats("delayed", { date }),
          floors: { L1: t("floorLabel.L1"), L2: t("floorLabel.L2"), L3: t("floorLabel.L3"), L4: t("floorLabel.L4"), RF: t("floorLabel.RF") },
        },
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
        office: tOffice,
        officeSign: t("rooms.office"),
      },
      labs: {
        directory: tDrawer("directory"),
        open: tLabs("boardOpen"),
        count: (count: number) => tLabs("boardCount", { count }),
        more: (count: number) => tLabs("boardMore", { count }),
        rings: Object.fromEntries(REACTOR_RINGS.map((ring) => [ring, tReactor(`rings.${ring}`)])) as Record<ReactorRingId, string>,
        uses: (count: number, tech: string) => tReactor("uses", { count, tech }),
      },
      career: {
        prologue: t("career.prologue"),
        workshop: t("career.workshop"),
        repos: t("career.repos"),
        console: t("interact.console"),
        back: t("pads.back"),
        stars: (count: number) => t("career.stars", { count }),
        rooms: (count: number) => t("career.rooms", { count }),
      },
      library: {
        zones: { blog: tLibrary("posts"), research: tLibrary("research"), models: tLibrary("publications"), talks: tLibrary("talks") },
        end: {
          pieces: (count: number, topic: string) => tLibrary("topics.pieces", { count, topic }),
          monument: metrics
            ? {
                citations: String(metrics.citations),
                citationsLabel: tLibrary("topics.monument.citations"),
                hIndex: String(metrics.hIndex),
                hIndexLabel: tLibrary("topics.monument.hIndex"),
                source: tLibrary("topics.monument.asOf", { source: metrics.source, date: formatYearMonth(metrics.asOf, data.locale) }),
              }
            : null,
          archive: t("interact.archive"),
          vault: t("interact.studyVault"),
        },
      },
      roof: {
        comms: t("world.comms"),
        email: tCommon("email"),
        cvTitle: tContact("cvTitle"),
        cvHint: t("world.cvHint"),
        about: t("world.about"),
        availability: t("world.availability"),
      },
      engine: {
        title: tEngine("title"),
        subtitle: tEngine("subtitle"),
        reactor: { title: tEngine("reactor.title"), visits: (n: string) => tEngine("reactor.visits", { n }), asks: (n: string) => tEngine("reactor.asks", { n }) },
      },
      rover: { hello: t("statusHello") },
      returnPad: t("interact.returnPad"),
      interact: {
        elevator: t("pads.floorTitle"),
        returnPad: t("interact.returnPad"),
        // A string, so next-intl does not format the year as a number ("2,021").
        teleporter: (year: number) => t("interact.teleporter", { year: String(year) }),
        console: t("interact.console"),
        kiosk: t("launcher.roverMenu"),
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
          reactor: t("rooms.reactor"),
          topics: t("rooms.topics"),
          visits: t("rooms.visits"),
          ops: t("rooms.ops"),
          office: t("rooms.office"),
        },
        reactorRing: (ring: ReactorRingId) => tReactor("ringTarget", { ring: tReactor(`rings.${ring}`) }),
        metrics: tLibrary("topics.monument.target"),
        studyGuide: (code: string) => t("interact.studyGuide", { code }),
        studyVault: t("interact.studyVault"),
      },
    }),
    [t, tEngine, tHome, tCommon, tCerts, tDrawer, tLibrary, tContact, tLabs, tHall, tReactor, tStats, tOffice, metrics, data.locale],
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
      <FloorChunkPrefetch />
      <Hud data={data} layouts={layouts} onExit={onExit} onToggleLang={toggleLang} />
      {perf && <PerfOverlay />}
    </div>
  );
}
