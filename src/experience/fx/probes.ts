import type { FloorId } from "@/content/schema";

/**
 * Scene facts for Playwright (`window.__hq.probes`), written by scene components in `useFrame`, never
 * read during render. `flippedSigns`: `Readable` groups turned around because the camera is behind
 * them. `signs`: floating signs (`fx/FloatingSign.tsx`). `ghosts`: floors above the rover whose ghost slab is drawn this frame (none in first person).
 */
export const sceneProbes = {
  flippedSigns: 0,
  ghosts: {} as Partial<Record<FloorId, boolean>>,
  /** Floating signs drawn this frame per `FloatingSigns` group: text and how square it faces the camera (1 = square, below 0 = its back). */
  signs: {} as Record<string, { text: string; facing: number }[]>,
  /** Spectacle effects (L2 horizon, L3 reactor and waterfalls): their shader clock and the reactor ring angle; frozen under reduced motion. */
  spectacle: {} as Record<string, number>,
};
