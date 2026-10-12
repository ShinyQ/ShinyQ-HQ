"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Vector3 } from "three";
import { getHQStore } from "@/store/useHQStore";
import { floorY } from "../config";
import { roverRuntime } from "../rover/runtime";
import { hintRuntime, setHintTarget } from "./runtime";
import { HINT, hintAnchor, nearestHint } from "./select";
import { hintItems } from "./source";

/**
 * Picks the one point-and-go target a "!" bubble floats over (10 times a second) and moves the HTML
 * bubble over its anchor every frame. No bubble while the rover is not free (ride, beam, any autopilot
 * drive: missions, walks, point-and-go) or while a target is hovered or tap-selected (point-and-go's
 * label and Go chip own that moment). Renders nothing: no draw calls.
 */
export function HintProbe() {
  const next = useRef(0);
  const point = useMemo(() => new Vector3(), []);

  useFrame(({ camera, clock, size }) => {
    const now = clock.elapsedTime;
    if (now >= next.current) {
      next.current = now + HINT.everyS;
      const s = getHQStore().getState();
      const pilot = roverRuntime.autopilot;
      const free = s.phase === "explore" && !s.ride && !s.beam && !s.hover && (!pilot || pilot.state === "done");
      const items = hintItems().filter((item) => item.floor === s.floor);
      const pick = free ? nearestHint(items, roverRuntime, hintRuntime.target?.item ?? null) : null;
      setHintTarget(pick ? { item: pick, anchor: hintAnchor(pick, floorY(s.floor)) } : null);
    }
    const element = hintRuntime.element;
    const target = hintRuntime.target;
    if (!element || !target) return;
    point.set(target.anchor.x, target.anchor.y, target.anchor.z).project(camera);
    const onScreen = point.z < 1 && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1;
    const x = ((point.x + 1) / 2) * size.width;
    const y = ((1 - point.y) / 2) * size.height;
    element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    element.style.visibility = onScreen ? "visible" : "hidden";
  });
  return null;
}
