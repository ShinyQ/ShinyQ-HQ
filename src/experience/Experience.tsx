"use client";

import { Canvas } from "@react-three/fiber";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { FloorId } from "@/content/schema";
import { Hud } from "@/hud/Hud";
import { switchLocale, takeResume } from "@/hud/switchLocale";
import { setSoundEnabled } from "@/lib/audio";
import { prefersReducedMotion, REDUCED_MOTION_QUERY } from "@/lib/reduced-motion";
import { serializeHQUrl } from "@/lib/url-sync";
import { cameraClass, viewportClass } from "@/lib/viewport";
import { getHQStore } from "@/store/useHQStore";
import { READY_FLOORS } from "./config";
import { useInputSources } from "./input/useInputSources";
import { roverRuntime } from "./rover/runtime";
import { Scene, type SceneLabels } from "./scene/Scene";
import type { ExperienceData, GpuTier } from "./types";

const COARSE_QUERY = "(pointer: coarse)";

function readDevice() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return { viewport: viewportClass(w, h), camera: cameraClass(w, h), coarse: window.matchMedia(COARSE_QUERY).matches };
}

let started = false;

/** One-time session start: tier, locale, device, and the first phase (boot, intro or resume). */
function startSession(data: ExperienceData, tier: GpuTier) {
  const store = getHQStore();
  const s = store.getState();
  s.setTier(tier);
  s.setLocale(data.locale);
  s.setReducedMotion(prefersReducedMotion());
  s.setDevice(readDevice());
  if (started) return;
  started = true;
  const resume = takeResume();
  if (resume) {
    s.resume(resume.floor, { x: resume.x, z: resume.z });
    roverRuntime.x = resume.x;
    roverRuntime.z = resume.z;
  } else {
    s.setPhase(s.firstVisit ? "boot" : "intro");
  }
  // Test and debugging handle (read-only use from Playwright).
  (window as unknown as { __hq?: unknown }).__hq = { store, rover: roverRuntime, camera: () => [...roverRuntime.cameraPosition] };
}

/** The lazily loaded 3D chunk: canvas, scene and HUD, portalled over the HTML page. */
export default function Experience({ data, tier, onExit }: { data: ExperienceData; tier: GpuTier; onExit: () => void }) {
  const t = useTranslations("hud");
  const tHome = useTranslations("home");
  const tCommon = useTranslations("common");
  const world = useRef<HTMLDivElement>(null);
  const held = useInputSources(world);
  const toggleLang = useCallback(() => switchLocale(data.locale === "en" ? "id" : "en"), [data.locale]);

  useLayoutEffect(() => startSession(data, tier), [data, tier]);

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

  // URL sync: floors with 3D content get their route; placeholders keep /{locale}.
  useEffect(() => {
    const store = getHQStore();
    const sync = (floor: FloorId) => {
      const url = serializeHQUrl({ locale: data.locale, floor: READY_FLOORS.includes(floor) ? floor : "L1", activeRoom: null, view: null });
      if (window.location.pathname !== url) window.history.replaceState(window.history.state, "", `${url}${window.location.search}`);
    };
    sync(store.getState().floor);
    return store.subscribe((s, prev) => {
      if (s.floor !== prev.floor) sync(s.floor);
      if (s.sound !== prev.sound) setSoundEnabled(s.sound);
    });
  }, [data.locale]);

  const labels: SceneLabels = useMemo(
    () => ({
      placeholder: { construction: t("constructionLabel"), hint: t("constructionHint") },
      lobby: {
        skillsTitle: tHome("skillsTitle"),
        certs: { title: tHome("certsTitle"), verify: tCommon("verify"), inProgress: tCommon("inProgress") },
        kiosk: { title: t("kioskTitle"), soon: t("kioskSoon") },
      },
      rover: { soon: t("statusSoon"), hello: t("statusHello") },
    }),
    [t, tHome, tCommon],
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-void text-ink" data-testid="hq" data-tier={tier}>
      <div ref={world} className="absolute inset-0 touch-none select-none" data-testid="hq-world">
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
