import type { AskEntry } from "@/ask/protocol";
import type { AskTopic } from "@/ask/suggestions";
import type { PaperPreview } from "@/content/citation";
import type { PaletteFilter } from "@/experience/missions/host";

/**
 * Window events that open HUD overlays from anywhere (header buttons, the 3D scene, a mission kiosk)
 * without sharing React state.
 */
export const HUD_EVENT = "hq:hud";

export type HudCommand =
  | { type: "palette"; filter?: PaletteFilter }
  | { type: "terminal" }
  /**
   * Ask the HQ: opens the shared chat dock (every page and the 3D HQ). `q` is sent at once, `topic`
   * opens that topic's question pills, `source` names the entry point for analytics.
   */
  | { type: "ask"; q?: string; topic?: AskTopic; source?: AskEntry }
  /** The in-site CV viewer modal (page images of the owner's PDF), see `DialogHost`. */
  | { type: "cv" }
  /** Paper preview modal (abstract, citations, DOI and Scholar links), see `DialogHost`. */
  | { type: "paper"; paper: PaperPreview };

export function sendHudCommand(command: HudCommand) {
  window.dispatchEvent(new CustomEvent<HudCommand>(HUD_EVENT, { detail: command }));
}

export const openPalette = (filter?: PaletteFilter) => sendHudCommand({ type: "palette", filter });
export const openTerminal = () => sendHudCommand({ type: "terminal" });
export const openCv = () => sendHudCommand({ type: "cv" });
export const openPaper = (paper: PaperPreview) => sendHudCommand({ type: "paper", paper });
export const openAsk = (q?: string, options: { topic?: AskTopic; source?: AskEntry } = {}) => sendHudCommand({ type: "ask", q, ...options });

export function onHudCommand(listener: (command: HudCommand) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<HudCommand>).detail);
  window.addEventListener(HUD_EVENT, handler);
  return () => window.removeEventListener(HUD_EVENT, handler);
}
