import { getHQStore } from "@/store/useHQStore";

/** sessionStorage key: the one-time point-and-go hint was shown in this browser session. */
export const POINT_HINT_KEY = "hq:point-hint";

/**
 * Canvas `onPointerMissed`: a click or tap that hit no target. It never moves the rover (owner request):
 * it clears a tap selection, closes an open room, and shows the point-and-go hint once per session.
 */
export function onWorldMissed(event: MouseEvent) {
  if (event.type !== "click") return;
  const s = getHQStore().getState();
  if (s.hover?.via === "tap") s.setHover(null);
  if (s.phase === "room") {
    s.closeRoom();
    return;
  }
  if (s.phase !== "explore" || s.ride || s.beam || s.picker) return;
  try {
    if (window.sessionStorage.getItem(POINT_HINT_KEY)) return;
    window.sessionStorage.setItem(POINT_HINT_KEY, "1");
  } catch {
    return;
  }
  s.setPointHint(true);
}
