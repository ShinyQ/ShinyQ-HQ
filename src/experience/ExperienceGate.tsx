"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { BOOT_ATTR, releaseBootCover } from "@/lib/boot-first";
import { decideTier, readTierInputs } from "@/lib/gpu-tier";
import { claimAutoOpen } from "./missions/bridge";
import { useHQStore } from "@/store/useHQStore";
import type { FloorId, RoomId } from "@/content/schema";
import type { ExperienceData, GpuTier } from "./types";

const loadExperience = () => import("./Experience");
const Experience = dynamic(loadExperience, { ssr: false });

// Boot-first visits (html[data-hq-boot], set by the inline head script) start the 3D chunk download
// during hydration instead of after the tier probe.
if (typeof document !== "undefined" && document.documentElement.hasAttribute(BOOT_ATTR)) void loadExperience();

export const VIEW_KEY = "hq:view";

const onFirstFrame = () => releaseBootCover("ready");

let detected: GpuTier | undefined;
let scheduled = false;
const tierListeners = new Set<() => void>();

/**
 * Probes WebGL once per page load, after the commit that mounts the gate. Creating a context is not
 * free (seconds on software renderers such as SwiftShader), so it must never run during render:
 * a client navigation into a gated route would block until the probe finishes.
 */
function subscribeTier(listener: () => void) {
  tierListeners.add(listener);
  if (detected === undefined && !scheduled) {
    scheduled = true;
    window.setTimeout(() => {
      detected ??= decideTier(readTierInputs(window.location.search));
      tierListeners.forEach((l) => l());
    }, 0);
  }
  return () => {
    tierListeners.delete(listener);
  };
}
const readDetectedTier = () => detected ?? null;
const readServerTier = () => null;

function readView(): "3d" | "page" {
  try {
    return sessionStorage.getItem(VIEW_KEY) === "page" ? "page" : "3d";
  } catch {
    return "3d";
  }
}

/**
 * Decides the GPU tier on the client and lazy-loads the 3D experience on top
 * of the server-rendered page. Static tier, page view and server render all
 * leave the HTML page untouched.
 */
export function ExperienceGate({ data, startFloor, startRoom }: { data: ExperienceData; startFloor?: FloorId; startRoom?: RoomId }) {
  const t = useTranslations("hud");
  const detectedTier = useSyncExternalStore(subscribeTier, readDetectedTier, readServerTier);
  const [view, setView] = useState<"3d" | "page">(() => (typeof window === "undefined" ? "3d" : readView()));
  const lost = useHQStore((s) => s.phase === "static" && s.tier === "static");
  const tier = detectedTier === null ? null : lost ? "static" : detectedTier;
  const back3D = () => {
    try {
      sessionStorage.removeItem(VIEW_KEY);
    } catch {
      // Storage can be unavailable; the toggle still works for this render.
    }
    setView("3d");
  };
  const immersive = tier !== null && tier !== "static" && view === "3d";

  // The boot cover hides the page until 3D draws its first frame; reveal the page when 3D is off.
  useEffect(() => {
    if (tier === "static") releaseBootCover("static");
    else if (tier && view === "page") releaseBootCover("page");
  }, [tier, view]);

  // Claimed synchronously after hydration, before MissionHud's first-visit timer fires.
  useEffect(() => {
    claimAutoOpen(immersive);
    return () => claimAutoOpen(false);
  }, [immersive]);

  if (!tier) return null;

  if (lost) {
    return (
      <p role="status" className="glass no-print fixed right-4 bottom-4 z-40 px-4 py-3 text-sm text-ink">
        {t("staticNotice")}
      </p>
    );
  }
  if (tier === "static") return null;

  if (view === "page") return <BackTo3D onBack={back3D} label={t("back3d")} hint={t("back3dHint")} />;

  return createPortal(
    <Experience
      data={data}
      tier={tier}
      startFloor={startFloor}
      startRoom={startRoom}
      onFirstFrame={onFirstFrame}
      onExit={() => {
        try {
          sessionStorage.setItem(VIEW_KEY, "page");
        } catch {
          // Ignore storage errors; the view still switches.
        }
        setView("page");
        // Hand focus to the page content; the Back to 3D button is the first stop on Tab.
        window.requestAnimationFrame(() => document.getElementById("main")?.focus({ preventScroll: true }));
      }}
    />,
    document.body,
  );
}

/**
 * Page view's way back: a fixed, solid cyan button in the bottom-right corner, visible without
 * scrolling on every viewport. It is the first focusable element in <main>, and the `3` key
 * triggers it too.
 */
function BackTo3D({ onBack, label, hint }: { onBack: () => void; label: string; hint: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "3" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      if (document.querySelector("[role='dialog'][aria-modal='true']")) return;
      e.preventDefault();
      onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  return (
    <button
      type="button"
      onClick={onBack}
      title={hint}
      aria-keyshortcuts="3"
      data-testid="back-to-3d"
      className="no-print fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex min-h-12 items-center gap-2.5 rounded-full bg-cyan px-5 font-semibold text-void shadow-[0_0_32px_-4px_var(--color-cyan)] transition hover:bg-cyan/85 focus-visible:outline-offset-4 sm:right-6 sm:bottom-6 sm:min-h-14 sm:px-6 sm:text-[17px]"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 2 3 7v10l9 5 9-5V7l-9-5z" />
        <path d="M3 7l9 5 9-5M12 12v10" />
      </svg>
      {label}
      <kbd aria-hidden="true" className="label hidden rounded border border-void/30 px-1.5 py-0.5 text-void/80 sm:inline">
        3
      </kbd>
    </button>
  );
}
