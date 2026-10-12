import { useSyncExternalStore } from "react";
import { isBotLike, PROBE_KEY } from "@/lib/boot-first";
import { decideTier, readTierInputs } from "@/lib/gpu-tier";
import type { GpuTier } from "./types";

let detected: GpuTier | undefined;
let scheduled = false;
const tierListeners = new Set<() => void>();

/**
 * Probes WebGL once per page load, after the commit that mounts the first subscriber (ExperienceGate
 * or the landing's EnterHqButton). Creating a context is not free (seconds on software renderers such
 * as SwiftShader), so it must never run during render: a client navigation into a gated route would
 * block until the probe finishes.
 */
function subscribeTier(listener: () => void) {
  tierListeners.add(listener);
  if (detected === undefined && !scheduled) {
    scheduled = true;
    window.setTimeout(() => {
      // Crawlers and automation stay on the page: no WebGL probe, no 3D chunk.
      if (detected === undefined && isBotLike(navigator, window.location.search)) detected = "static";
      if (detected === undefined) {
        const inputs = readTierInputs(window.location.search);
        detected = decideTier(inputs);
        // Remember an auto-detected static device, so the next page skips the boot cover.
        if (detected === "static" && !inputs.override) {
          try {
            sessionStorage.setItem(PROBE_KEY, "static");
          } catch {
            // Storage can be unavailable; the cover then shows until the probe, as on this page.
          }
        }
      }
      tierListeners.forEach((l) => l());
    }, 0);
  }
  return () => {
    tierListeners.delete(listener);
  };
}
const readDetectedTier = () => detected ?? null;
const readServerTier = () => null;

/** The GPU tier of this page load: null on the server and until the probe has run after the first commit. */
export function useGateTier(): GpuTier | null {
  return useSyncExternalStore(subscribeTier, readDetectedTier, readServerTier);
}
