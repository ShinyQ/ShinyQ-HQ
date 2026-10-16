import type { ViewportClass } from "@/experience/types";
import { useHQStore } from "@/store/useHQStore";

/** HUD composition: "Corners" on phones and tablets (any coarse pointer counts as a tablet), today's layout on desktops. */
export type HudLayout = "phone" | "tablet" | "desktop";

export function hudLayout(viewport: ViewportClass, coarse: boolean): HudLayout {
  if (viewport === "mobile") return "phone";
  if (viewport === "tablet" || coarse) return "tablet";
  return "desktop";
}

export function useHudLayout(): HudLayout {
  return useHQStore((s) => hudLayout(s.device.viewport, s.device.coarse));
}
