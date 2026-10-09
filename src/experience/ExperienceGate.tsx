"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { decideTier, readTierInputs } from "@/lib/gpu-tier";
import { claimAutoOpen } from "./missions/bridge";
import { useHQStore } from "@/store/useHQStore";
import type { ExperienceData, GpuTier } from "./types";

const Experience = dynamic(() => import("./Experience"), { ssr: false });

export const VIEW_KEY = "hq:view";

let detected: GpuTier | undefined;
/** Probes WebGL once per page load (creating contexts is not free). */
function detectTier(): GpuTier {
  detected ??= decideTier(readTierInputs(window.location.search));
  return detected;
}

const noopSubscribe = () => () => {};
const useMounted = () => useSyncExternalStore(noopSubscribe, () => true, () => false);

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
export function ExperienceGate({ data }: { data: ExperienceData }) {
  const t = useTranslations("hud");
  const mounted = useMounted();
  const [view, setView] = useState<"3d" | "page">(() => (typeof window === "undefined" ? "3d" : readView()));
  const lost = useHQStore((s) => s.phase === "static" && s.tier === "static");
  const tier = mounted ? (lost ? "static" : detectTier()) : null;
  const immersive = tier !== null && tier !== "static" && view === "3d";

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

  if (view === "page") {
    return (
      <button
        type="button"
        onClick={() => {
          try {
            sessionStorage.removeItem(VIEW_KEY);
          } catch {
            // Storage can be unavailable; the toggle still works for this render.
          }
          setView("3d");
        }}
        className="glass no-print fixed right-4 bottom-4 z-40 inline-flex min-h-11 items-center gap-2 px-4 font-semibold text-cyan transition hover:text-ink"
      >
        <span aria-hidden="true">&#9650;</span>
        {t("explore3d")}
      </button>
    );
  }

  return createPortal(
    <Experience
      data={data}
      tier={tier}
      onExit={() => {
        try {
          sessionStorage.setItem(VIEW_KEY, "page");
        } catch {
          // Ignore storage errors; the view still switches.
        }
        setView("page");
      }}
    />,
    document.body,
  );
}
