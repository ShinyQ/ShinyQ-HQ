import { loadHudIndex } from "./index-client";

/**
 * The command palette (with its search) and the Rover Terminal are separate chunks: MissionHud mounts them on
 * the first open, and the launchers warm them, and the HUD index both list from, on hover or focus so that
 * open stays instant.
 */
export const loadPalette = () => import("./PaletteHost").then((m) => m.PaletteHost);
export const loadTerminal = () => import("./RoverTerminal").then((m) => m.RoverTerminal);

/** Starts the chunk and the index downloads early (launcher hover or focus); a failure is retried by the real open. */
export const preloadPalette = () => {
  void loadHudIndex();
  void loadPalette().catch(() => {});
};
export const preloadTerminal = () => {
  void loadHudIndex();
  void loadTerminal().catch(() => {});
};
