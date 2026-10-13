"use client";

import { COVER_ATTR, isCovered } from "./cover";

/**
 * Watches the panels marked `data-hq-cover` and reports whether one hides more than COVER_PAUSE of
 * the canvas. Layout is read in one animation frame after a DOM change (a panel opens or closes),
 * a size change of a watched panel (the sheet snaps) or a window resize; it never polls per frame.
 */
export function watchCover(onChange: (covered: boolean) => void): () => void {
  let raf = 0;
  let last: boolean | null = null;
  const sized = new Set<Element>();
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(check);
  };
  const resize = new ResizeObserver(schedule);
  function check() {
    raf = 0;
    const panels = Array.from(document.querySelectorAll(`[${COVER_ATTR}]`));
    for (const el of panels) {
      if (sized.has(el)) continue;
      sized.add(el);
      resize.observe(el);
    }
    for (const el of sized) {
      if (el.isConnected) continue;
      sized.delete(el);
      resize.unobserve(el);
    }
    const covered = isCovered(window.innerWidth, window.innerHeight, panels.map((el) => el.getBoundingClientRect()));
    if (covered === last) return;
    last = covered;
    onChange(covered);
  }
  const mutations = new MutationObserver(schedule);
  mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: [COVER_ATTR, "class", "hidden"] });
  window.addEventListener("resize", schedule);
  schedule();
  return () => {
    mutations.disconnect();
    resize.disconnect();
    window.removeEventListener("resize", schedule);
    if (raf) cancelAnimationFrame(raf);
  };
}
