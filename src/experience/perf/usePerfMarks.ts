import { useEffect } from "react";
import { markOnce, PERF_MARKS } from "@/lib/perf-marks";
import { getHQStore, type Phase } from "@/store/useHQStore";

const interactive = (phase: Phase) => phase !== "boot" && phase !== "intro" && phase !== "static";

/** Writes the timeline marks from store transitions (each once per page load). */
export function usePerfMarks(): void {
  useEffect(() => {
    const store = getHQStore();
    if (interactive(store.getState().phase)) markOnce(PERF_MARKS.explore);
    return store.subscribe((s, prev) => {
      if (prev.phase === "boot" && s.phase === "intro") markOnce(PERF_MARKS.introStart);
      if (prev.phase === "intro" && s.phase === "explore") markOnce(PERF_MARKS.introEnd);
      if (interactive(s.phase) && !interactive(prev.phase)) markOnce(PERF_MARKS.explore);
      if (s.activeRoom && !prev.activeRoom) markOnce(PERF_MARKS.firstDrawer);
    });
  }, []);
}
