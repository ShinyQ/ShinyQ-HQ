import { MOTION_ATTR } from "@/lib/motion";
import { prefersReducedMotion } from "@/lib/reduced-motion";

/** Space kept above an answer's first line when it is pinned to the top of the thread. */
export const ANSWER_TOP_GAP = 12;
/** A scroll position this far from the last one the panel set is the visitor's own. */
export const USER_SCROLL_SLACK = 8;

/**
 * Where the Ask thread scrolls (owner request 2026-10-16): the newest content, but never past the
 * first line of the current answer (`answerTop`, its offset inside the scroll content), so a long
 * answer and the follow-up pills under it never push the answer's start out of view.
 */
export function anchoredScrollTop(box: { scrollHeight: number; clientHeight: number }, answerTop: number | null, gap = ANSWER_TOP_GAP): number {
  const bottom = Math.max(0, box.scrollHeight - box.clientHeight);
  if (answerTop === null) return bottom;
  return Math.max(0, Math.min(bottom, answerTop - gap));
}

/** True once the visitor moved the thread away from where the panel last put it. */
export function scrolledAway(current: number, lastSet: number | null, slack = USER_SCROLL_SLACK): boolean {
  return lastSet !== null && Math.abs(current - lastSet) > slack;
}

/** The effective reduced-motion flag outside the 3D store: the Motion setting (`html[data-motion]`), else the OS. */
export function askReducedMotion(
  root: HTMLElement | null = typeof document === "undefined" ? null : document.documentElement,
  systemReduced: () => boolean = prefersReducedMotion,
): boolean {
  const motion = root?.getAttribute(MOTION_ATTR);
  if (motion === "full") return false;
  if (motion === "reduced") return true;
  return systemReduced();
}
