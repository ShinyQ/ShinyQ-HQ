import { pickVolume } from "./pick";
import type { Interactable } from "./registry";

type Point3 = { x: number; y: number; z: number };
type ScreenPoint = { x: number; y: number };

/**
 * Point-and-go runtime, written by InteractLayer and never read during React render: the current
 * floor's targets (built-in plus extras), a world-to-screen projection and the highlight opacity drawn
 * this frame. Exposed to Playwright as `window.__hq.interact`; scene-side features may read `items`.
 */
export const interactRuntime = {
  items: [] as Interactable[],
  /** World y of the current floor (targets are floor-local). */
  floorY: 0,
  /** Highlight opacity drawn this frame (test probe: constant under reduced motion). */
  highlight: 0,
  /** World point to CSS px over the canvas; null behind the camera or off screen. Set while InteractLayer is mounted. */
  project: null as ((p: Point3) => ScreenPoint | null) | null,
  /** CSS px of a target's pick volume at `lift` of its height (0.85: near the top, so the rover in front never takes the click). */
  screenOf(id: string, lift = 0.85): ScreenPoint | null {
    const item = interactRuntime.items.find((i) => i.id === id);
    if (!item || !interactRuntime.project) return null;
    const { center, size } = pickVolume(item);
    return interactRuntime.project({ x: center[0], y: interactRuntime.floorY + size[1] * lift, z: center[2] });
  },
};
