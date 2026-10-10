import type { PaletteFilter } from "@/experience/missions/host";

/**
 * Window events that open HUD overlays from anywhere (header buttons, the 3D scene, a mission kiosk)
 * without sharing React state.
 */
export const HUD_EVENT = "hq:hud";

export type HudCommand =
  | { type: "palette"; filter?: PaletteFilter }
  | { type: "terminal" }
  /** Ask the HQ: opens the Page View ask panel (Home, About) or the Rover Terminal ask mode, `q` prefilled and submitted. */
  | { type: "ask"; q?: string };

export function sendHudCommand(command: HudCommand) {
  window.dispatchEvent(new CustomEvent<HudCommand>(HUD_EVENT, { detail: command }));
}

export const openPalette = (filter?: PaletteFilter) => sendHudCommand({ type: "palette", filter });
export const openTerminal = () => sendHudCommand({ type: "terminal" });
export const openAsk = (q?: string) => sendHudCommand({ type: "ask", q });

export function onHudCommand(listener: (command: HudCommand) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<HudCommand>).detail);
  window.addEventListener(HUD_EVENT, handler);
  return () => window.removeEventListener(HUD_EVENT, handler);
}

/** Returns false when the panel cannot take the question (feature off), so the caller falls back to the terminal. */
export type AskPanelHandler = (q?: string) => boolean;

let askPanel: AskPanelHandler | null = null;

/** The Page View ask panel registers itself while mounted; `openAsk` prefers it over the terminal on static pages. */
export function registerAskPanel(handler: AskPanelHandler): () => void {
  askPanel = handler;
  return () => {
    if (askPanel === handler) askPanel = null;
  };
}

export const askPanelHandler = (): AskPanelHandler | null => askPanel;
