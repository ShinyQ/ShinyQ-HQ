/**
 * The command palette (with its search) and the Rover Terminal are separate chunks: MissionHud mounts them on
 * the first open, and the launchers warm them on hover or focus so that open stays instant.
 */
export const loadPalette = () => import("./PaletteHost").then((m) => m.PaletteHost);
export const loadTerminal = () => import("./RoverTerminal").then((m) => m.RoverTerminal);

/** Starts a chunk download early (launcher hover or focus); a failure is retried by the real open. */
export const preloadPalette = () => void loadPalette().catch(() => {});
export const preloadTerminal = () => void loadTerminal().catch(() => {});
