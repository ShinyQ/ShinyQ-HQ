import { pickVolume, volumePoint } from "./pick";
import type { Interactable } from "./registry";

type Point3 = { x: number; y: number; z: number };
type ScreenPoint = { x: number; y: number };

/**
 * Point-and-go runtime, written by InteractLayer and never read during React render: the current
 * floor's targets (built-in plus extras), a world-to-screen projection and the highlight opacity drawn
 * this frame. Exposed to Playwright as `window.__hq.interact`; scene-side features may read `items`,
 * and the HUD minimap reads it through `useSyncExternalStore` (InteractLayer replaces the array).
 */
export const interactRuntime = {
  items: [] as Interactable[],
  /** World y of the current floor (targets are floor-local). */
  floorY: 0,
  /** Highlight opacity drawn this frame (test probe: constant under reduced motion). */
  highlight: 0,
  /** World point to CSS px over the canvas; null behind the camera or off screen. Set while InteractLayer is mounted. */
  project: null as ((p: Point3) => ScreenPoint | null) | null,
  /** Id of the target whose pick volume is under these CSS px (the same raycast a click makes). Set while InteractLayer is mounted. */
  hitAt: null as ((x: number, y: number) => string | null) | null,
  /** CSS px of a target's pick volume at `lift` of its height (0.85: near the top, so the rover in front never takes the click). */
  screenOf(id: string, lift = 0.85): ScreenPoint | null {
    return interactRuntime.screenAt(id, 0.5, 0.5, lift);
  },
  /** CSS px of a point inside a target's pick volume: `fx`, `fz` across its (turned) footprint, `lift` up its height (0 to 1 each). */
  screenAt(id: string, fx: number, fz: number, lift: number): ScreenPoint | null {
    const item = interactRuntime.items.find((i) => i.id === id);
    if (!item || !interactRuntime.project) return null;
    const [x, y, z] = volumePoint(pickVolume(item), fx, lift, fz);
    return interactRuntime.project({ x, y: interactRuntime.floorY + y, z });
  },
};
