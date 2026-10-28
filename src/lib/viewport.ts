import type { CameraClass, ViewportClass } from "@/experience/types";

const isLandscapePhone = (w: number, h: number) => w > h && h < 500;

/** HUD breakpoint (appendix 04 section 1). Landscape phones keep mobile HUD sizes. */
export function viewportClass(width: number, height: number): ViewportClass {
  if (width < 640 || isLandscapePhone(width, height)) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

/**
 * Camera value set (appendix 03 section 2). Landscape phones have their own values (`landscape`, spec 2026-10-29: a
 * closer camera that keeps titles as readable as on a portrait phone); portrait screens of any width (tablets standing
 * up) use the portrait values, whose wider FOV and higher offset frame the Lobby plaza on a narrow, tall viewport.
 */
export function cameraClass(width: number, height: number): CameraClass {
  if (isLandscapePhone(width, height)) return "landscape";
  if (height > width * 1.15) return "mobile";
  return viewportClass(width, height);
}

/** Phone camera classes (portrait and landscape): the phone type sizes of the reading rule (spec 2026-10-28, 2026-10-29). */
export const phoneCamera = (cls: CameraClass): boolean => cls === "mobile" || cls === "landscape";
