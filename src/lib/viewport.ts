import type { ViewportClass } from "@/experience/types";

const isLandscapePhone = (w: number, h: number) => w > h && h < 500;

/** HUD breakpoint (appendix 04 section 1). Landscape phones keep mobile HUD sizes. */
export function viewportClass(width: number, height: number): ViewportClass {
  if (width < 640 || isLandscapePhone(width, height)) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

/**
 * Camera value set (appendix 03 section 2). Landscape phones use the tablet values; portrait
 * screens of any width (tablets standing up) use the portrait values, whose wider FOV and higher
 * offset frame the Lobby plaza on a narrow, tall viewport.
 */
export function cameraClass(width: number, height: number): ViewportClass {
  if (isLandscapePhone(width, height)) return "tablet";
  if (height > width * 1.15) return "mobile";
  return viewportClass(width, height);
}
