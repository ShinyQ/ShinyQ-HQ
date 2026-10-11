/** Glass Drawer placement (appendix 04 sections 1 and 2). Pure: unit-tested in node. */
export type DrawerLayout = "side" | "sheet";

/**
 * Side panel width per viewport width. Mirrors `--hq-drawer-w` in `src/app/globals.css` (the CSS
 * is the source for layout; this copy feeds the camera shift and the Walk HUD dock).
 */
export const SIDE_WIDTHS = [
  { min: 1400, width: 600 },
  { min: 1280, width: 560 },
  { min: 0, width: 480 },
] as const;
/** Gap between the side panel and the right edge of the viewport (`md:right-4`). */
export const SIDE_MARGIN = 16;
/** Bottom sheet snap points as fractions of the viewport height. */
export const SHEET_SNAPS = [0.55, 0.92] as const;
/** Dragging the sheet below this height closes the drawer. */
export const SHEET_CLOSE_BELOW = 0.28;

/** Side panel width in px for a viewport width (never wider than the viewport minus margins). */
export function sideWidth(viewportWidth: number): number {
  const width = SIDE_WIDTHS.find((s) => viewportWidth >= s.min)!.width;
  return Math.min(width, Math.max(0, viewportWidth - 24));
}

/** Side panel on desktop and on landscape tablets at least 900 px wide; bottom sheet otherwise. */
export function drawerLayout(width: number, height: number): DrawerLayout {
  if (width >= 1024) return "side";
  if (width >= 900 && width > height) return "side";
  return "sheet";
}

/** Nearest snap point for a released sheet, or "close" when dragged low (or flicked down fast). */
export function snapSheet(fraction: number, velocity = 0): number | "close" {
  if (fraction < SHEET_CLOSE_BELOW || velocity > 1.5) return "close";
  if (velocity < -1.5) return SHEET_SNAPS[SHEET_SNAPS.length - 1];
  return SHEET_SNAPS.reduce((best, snap) => (Math.abs(snap - fraction) < Math.abs(best - fraction) ? snap : best));
}

/**
 * Screen-space shift for the follow camera while a panel covers part of the canvas, as fractions of
 * the viewport, so the rover sits in the middle of the uncovered area: left of the side panel
 * (half its share of the width, at most 25%) or above the half-open bottom sheet.
 * Positive x moves the view window right (scene appears left); positive y moves it down (scene up).
 */
export function cameraShift(layout: DrawerLayout | null, viewportWidth = 1440): { x: number; y: number } {
  if (layout === "side") {
    const covered = (sideWidth(viewportWidth) + SIDE_MARGIN) / Math.max(1, viewportWidth);
    return { x: Math.min(0.25, Math.round((covered / 2) * 1000) / 1000), y: 0 };
  }
  if (layout === "sheet") return { x: 0, y: Math.round((SHEET_SNAPS[0] / 2) * 1000) / 1000 };
  return { x: 0, y: 0 };
}
