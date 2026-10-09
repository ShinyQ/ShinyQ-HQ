"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  classifySwipe,
  classifyWheel,
  createWheelGate,
  exceedsDragThreshold,
  intents,
  isMoveKey,
  isRotateKey,
  keyToIntent,
  pinchFactor,
  twistDelta,
} from "./intents";

/** Radians of yaw per pixel of drag or trackpad deltaX, and pitch per pixel of vertical drag. */
const MOUSE_YAW = 0.006;
const MOUSE_PITCH = 0.004;
const TOUCH_YAW = 0.008;
const TOUCH_PITCH = 0.004;
const WHEEL_YAW = 0.004;

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
  /** Crossed the drag threshold: this press rotates the view and is not a click or tap. */
  dragging: boolean;
}

/**
 * Attaches keyboard (window), wheel and pointer listeners (world element) and
 * translates them into intents. Returns the set of held movement and rotation
 * keys (WASD, arrows, Q/E, Shift), which the director and camera poll every frame.
 */
export function useInputSources(world: RefObject<HTMLElement | null>) {
  const held = useRef(new Set<string>());

  useEffect(() => {
    const keys = held.current;
    const onKeyDown = (e: KeyboardEvent) => {
      // Modal HUD overlays (boot, Rover Terminal, palette) own the keyboard while open.
      if (document.querySelector("[role='dialog'][aria-modal='true']")) {
        keys.clear();
        return;
      }
      const target = e.target instanceof Element ? e.target : null;
      const inText = Boolean(target?.closest(TEXT_INPUT));
      const inControl = Boolean(target?.closest(CONTROL));
      const key = e.key.toLowerCase();
      if (key === "shift") keys.add(key);
      if (!inText && !e.metaKey && !e.ctrlKey && !e.altKey && (isMoveKey(key) || isRotateKey(key))) {
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
    // Previous two-finger positions, for pinch (zoom), twist (yaw) and vertical pan (pitch).
    let pair: { a: { x: number; y: number }; b: { x: number; y: number } } | null = null;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const kind = classifyWheel({ dx: e.deltaX, dy: e.deltaY, ctrl: e.ctrlKey });
      if (kind === "zoom") {
        intents.emit({ type: "zoom", factor: Math.exp(e.deltaY * 0.002) });
      } else if (kind === "rotate") {
        intents.emit({ type: "orbit", dyaw: -e.deltaX * WHEEL_YAW, source: "wheel" });
      } else if (kind === "elevator") {
        const dir = gate(e.deltaY, e.timeStamp);
        if (dir) intents.emit({ type: "elevator", to: dir });
      }
    };

    const currentPair = () => {
      const [a, b] = [...pointers.values()];
      return { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
    };

    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        start: e.timeStamp,
        type: e.pointerType,
        dragging: false,
      });
      if (pointers.size === 2) pair = currentPair();
    };

    const onMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pointers.size === 2 && pair) {
        const next = currentPair();
        const before = Math.hypot(pair.a.x - pair.b.x, pair.a.y - pair.b.y);
        const after = Math.hypot(next.a.x - next.b.x, next.a.y - next.b.y);
        const factor = pinchFactor(before, after);
        if (factor !== 1) intents.emit({ type: "zoom", factor });
        const panY = (next.a.y + next.b.y - pair.a.y - pair.b.y) / 2;
        intents.emit({ type: "orbit", dyaw: twistDelta(pair.a, pair.b, next.a, next.b), dpitch: panY * TOUCH_PITCH, source: "twist" });
        pair = next;
        return;
      }
      if (pointers.size !== 1) return;
      const pressed = p.type !== "mouse" || (e.buttons & 3) !== 0;
      if (!pressed) return;
      if (!p.dragging) {
        if (!exceedsDragThreshold(p.x - p.startX, p.y - p.startY, p.type)) return;
        p.dragging = true;
      }
      if (p.type === "mouse" || p.type === "pen") {
        intents.emit({ type: "orbit", dyaw: -dx * MOUSE_YAW, dpitch: dy * MOUSE_PITCH, source: "mouse" });
      } else {
        // One finger: horizontal drag turns the view; fast vertical swipes stay the elevator.
        intents.emit({ type: "orbit", dyaw: -dx * TOUCH_YAW, source: "touch" });
      }
    };

    // Right-button drag rotates too, so keep the browser menu away from the world.
    const onContextMenu = (e: Event) => e.preventDefault();

    const onUp = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pair = null;
      if (!p || p.type === "mouse" || pointers.size > 0) return;
      // Event timestamps keep gesture timing correct even when frames are slow.
      const swipe = classifySwipe({ dx: e.clientX - p.startX, dy: e.clientY - p.startY, ms: e.timeStamp - p.start });
      if (swipe?.kind === "elevator") intents.emit({ type: "elevator", to: swipe.dir });
      else if (swipe?.kind === "scrub") intents.emit({ type: "scrub", dx: swipe.dx });
    };

    const onCancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pair = null;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [world]);

  return held;
}
