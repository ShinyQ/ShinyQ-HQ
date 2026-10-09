import type { CameraPose } from "./rigs";

/**
 * Camera focus requested by a floor (the hologram fly-in). Written by the floor in useFrame, read by
 * CameraDirector while the phase is "hologram". Per-frame state: never read during React render.
 */
export const cameraFocus = {
  pose: null as CameraPose | null,
};
