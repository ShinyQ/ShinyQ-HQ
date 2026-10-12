import type { FloorId } from "@/content/schema";

/**
 * Scene facts for Playwright (`window.__hq.probes`), written by scene components in `useFrame`, never
 * read during render. `flippedSigns`: `Readable` groups turned around because the camera is behind
 * them. `ghosts`: floors above the rover whose ghost slab is drawn this frame (none in first person).
 */
export const sceneProbes = {
  flippedSigns: 0,
  ghosts: {} as Partial<Record<FloorId, boolean>>,
};
