"use client";

import { useEffect } from "react";

/** `<html>` attribute set while the visitor reads down the page; CSS hides the phone header and compacts the Ask pill. */
export const SCROLL_ATTR = "data-scroll";
/** Near the top the header always shows (about its own height on phones). */
const SHOW_ABOVE = 120;
/** Scroll travel in one direction before the state flips, so small jitters do nothing. */
const TRAVEL = 24;

/**
 * Hide on scroll down, show on scroll up (owner decision 2026-11-02, every Classic page). One passive scroll listener
 * sets `html[data-scroll="down"]`; `pageview.css` applies it below 64rem only (the header is one row on desktop). The
 * header slides with `transform` (no layout shift); reduced motion collapses the slide to an instant show and hide, and
 * focus inside the header always shows it (`:focus-within`).
 */
export function HeaderAutoHide() {
  useEffect(() => {
    const root = document.documentElement;
    let last = window.scrollY;
    let travel = 0;
    let down = false;
    const set = (next: boolean) => {
      if (next === down) return;
      down = next;
      if (next) root.setAttribute(SCROLL_ATTR, "down");
      else root.removeAttribute(SCROLL_ATTR);
    };
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - last;
      last = y;
      if (y <= SHOW_ABOVE) {
        travel = 0;
        set(false);
        return;
      }
      travel = Math.sign(dy) === Math.sign(travel) ? travel + dy : dy;
      if (travel > TRAVEL) set(true);
      else if (travel < -TRAVEL) set(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      root.removeAttribute(SCROLL_ATTR);
    };
  }, []);
  return null;
}
