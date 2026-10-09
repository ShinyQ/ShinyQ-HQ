/** Glass Drawer placement (appendix 04 sections 1 and 2). Pure: unit-tested in node. */
export type DrawerLayout = "side" | "sheet";

export const SIDE_WIDTH = 420;
/** Bottom sheet snap points as fractions of the viewport height. */
export const SHEET_SNAPS = [0.45, 0.92] as const;
/** Dragging the sheet below this height closes the drawer. */
export const SHEET_CLOSE_BELOW = 0.28;

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
 * the viewport: the rover moves 15% left for the side panel and 20% up for a bottom sheet.
 * Positive x moves the view window right (scene appears left); positive y moves it down (scene up).
 */
export function cameraShift(layout: DrawerLayout | null): { x: number; y: number } {
  if (layout === "side") return { x: 0.15, y: 0 };
  if (layout === "sheet") return { x: 0, y: 0.2 };
  return { x: 0, y: 0 };
}
