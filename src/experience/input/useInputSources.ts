"use client";

import { useEffect, useRef, type RefObject } from "react";
import { classifySwipe, createWheelGate, intents, isMoveKey, keyToIntent } from "./intents";

const TEXT_INPUT = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';
const CONTROL = "button, a, [role='button'], summary";
const SCROLL_KEYS = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "pageup", "pagedown", " "]);

interface PointerTrack {
  x: number;
  y: number;
  startX: number;
  startY: number;
  start: number;
  type: string;
}

/**
 * Attaches keyboard (window), wheel and pointer listeners (world element) and
 * translates them into intents. Returns the set of held movement keys, which
 * the director polls every frame.
 */
export function useInputSources(world: RefObject<HTMLElement | null>) {
  const held = useRef(new Set<string>());

  useEffect(() => {
    const keys = held.current;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const inText = Boolean(target?.closest(TEXT_INPUT));
      const inControl = Boolean(target?.closest(CONTROL));
      const key = e.key.toLowerCase();
      if (!inText && !e.metaKey && !e.ctrlKey && !e.altKey && isMoveKey(key)) {
        keys.add(key);
        e.preventDefault();
        return;
      }
      const intent = keyToIntent(e.key, { ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, inText, inControl });
      if (intent) {
        if (intent.type !== "toggle" || !e.repeat) intents.emit(intent);
        if (intent.type !== "terminal") e.preventDefault();
      } else if (!inText && !inControl && SCROLL_KEYS.has(key)) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const clear = () => keys.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clear);
      keys.clear();
    };
  }, []);

  useEffect(() => {
    const el = world.current;
    if (!el) return;
    const gate = createWheelGate();
    const pointers = new Map<number, PointerTrack>();
    let pinch: { dist: number; cx: number } | null = null;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        intents.emit({ type: "zoom", factor: Math.exp(e.deltaY * 0.002) });
        return;
      }
      const dir = gate(e.deltaY, performance.now());
      if (dir) intents.emit({ type: "elevator", to: dir });
    };

    const twoFinger = () => {
      const [a, b] = [...pointers.values()];
      return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2 };
    };

    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, start: performance.now(), type: e.pointerType });
      if (pointers.size === 2) pinch = twoFinger();
    };

    const onMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pointers.size === 2 && pinch) {
        const now = twoFinger();
        if (pinch.dist > 0 && now.dist > 0) intents.emit({ type: "zoom", factor: pinch.dist / now.dist });
        intents.emit({ type: "orbit", dyaw: -(now.cx - pinch.cx) * 0.005 });
        pinch = now;
      } else if (p.type === "mouse" && e.buttons === 1 && Math.hypot(p.x - p.startX, p.y - p.startY) > 4) {
        intents.emit({ type: "orbit", dyaw: -dx * 0.005 });
      }
    };

    const onUp = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!p || p.type === "mouse" || pointers.size > 0) return;
      const swipe = classifySwipe({ dx: e.clientX - p.startX, dy: e.clientY - p.startY, ms: performance.now() - p.start });
      if (swipe?.kind === "elevator") intents.emit({ type: "elevator", to: swipe.dir });
      else if (swipe?.kind === "scrub") intents.emit({ type: "scrub", dx: swipe.dx });
    };

    const onCancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [world]);

  return held;
}
