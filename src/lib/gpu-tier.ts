import type { GpuTier } from "@/experience/types";

export interface TierInputs {
  /** Value of the `?tier=` query parameter, if any. */
  override?: string | null;
  webgl2: boolean;
  /** Unmasked renderer string, when the debug extension is available. */
  renderer?: string;
  saveData?: boolean;
  coarse: boolean;
  deviceMemory?: number;
  cores?: number;
}

const TIERS: readonly GpuTier[] = ["full", "lite", "static"];
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i;

export function isTier(value: unknown): value is GpuTier {
  return typeof value === "string" && (TIERS as readonly string[]).includes(value);
}

/**
 * Picks the experience tier (appendix 08 section 1). A local heuristic stands in
 * for detect-gpu, which would download benchmark tables at runtime.
 */
export function decideTier(i: TierInputs): GpuTier {
  if (isTier(i.override)) return i.override;
  if (!i.webgl2 || i.saveData) return "static";
  // Software rasterizers (no usable GPU) are detect-gpu tier 0, which appendix 08 maps to static.
  if (i.renderer && SOFTWARE_RENDERER.test(i.renderer)) return "static";
  if (i.coarse) return "lite";
  if (i.deviceMemory !== undefined && i.deviceMemory < 4) return "lite";
  if (i.cores !== undefined && i.cores <= 2) return "lite";
  return "full";
}

/** Probes the browser. Only call on the client. */
export function readTierInputs(search: string): TierInputs {
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean };
    deviceMemory?: number;
  };
  let webgl2 = false;
  let renderer: string | undefined;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (gl) {
      webgl2 = true;
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    webgl2 = false;
  }
  return {
    override: new URLSearchParams(search).get("tier"),
    webgl2,
    renderer,
    saveData: Boolean(nav.connection?.saveData),
    coarse: window.matchMedia("(pointer: coarse)").matches,
    deviceMemory: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
  };
}
