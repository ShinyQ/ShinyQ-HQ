import { createLocalPref } from "@/lib/local-pref";

/** Whether the corner minimap shows (Settings panel). On by default. */
export type MinimapPref = "on" | "off";
export const isMinimapPref = (v: unknown): v is MinimapPref => v === "on" || v === "off";
export const minimapPref = createLocalPref<MinimapPref>("hq:minimap", "on", isMinimapPref);
